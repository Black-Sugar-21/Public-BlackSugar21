'use strict';

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { geminiApiKey, AI_MODEL_LITE, GoogleGenerativeAI, getLanguageInstruction } = require('./shared');

// ─── Constants ──────────────────────────────────────────────────────────────
const BATCH_LIMIT = 200;
const MAX_NOTIFS_PER_DAY = 2;
const QUIET_HOUR_START = 22; // 10pm
const QUIET_HOUR_END = 9;    // 9am
const MS_PER_HOUR = 3600000;

// Signal thresholds (defaults, overridden by Remote Config)
const DEFAULT_CONFIG = {
  enabled: true,
  maxNotificationsPerDay: 2,
  quietHoursStart: 22,
  quietHoursEnd: 9,
  signals: {
    newMatchNoMessage:    { enabled: true, minHours: 2, maxHours: 48 },
    conversationCooling:  { enabled: true, minHours: 12, maxHours: 72, minMessages: 3 },
    storyViewed:          { enabled: true, windowHours: 12 },
    highInterest:         { enabled: true, unansweredThreshold: 3 },
    inactivity:           { enabled: true, minHours: 24, maxHours: 72 },
  },
  batchLimit: 200,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Get wing person config from Remote Config (with defaults) */
async function getWingPersonConfig() {
  try {
    const rc = admin.remoteConfig();
    const template = await rc.getServerTemplate();
    template.evaluate();
    const raw = template.getString('wing_person_config');
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch (e) {
    logger.info(`[WingPerson] RC fallback: ${e.message}`);
  }
  return DEFAULT_CONFIG;
}

/** Check if it's quiet hours for the user */
function isQuietHours(timezoneOffset, config) {
  const nowUTC = new Date();
  const localHour = (nowUTC.getUTCHours() + (timezoneOffset || 0) + 24) % 24;
  const start = config.quietHoursStart || QUIET_HOUR_START;
  const end = config.quietHoursEnd || QUIET_HOUR_END;
  // Quiet hours wrap around midnight: 22:00 - 09:00
  if (start > end) {
    return localHour >= start || localHour < end;
  }
  return localHour >= start && localHour < end;
}

/** Check rate limit — returns true if user can receive notification */
function checkRateLimit(userData, config) {
  const maxPerDay = config.maxNotificationsPerDay || MAX_NOTIFS_PER_DAY;
  const countToday = userData.wingPersonNotifCountToday || 0;
  const lastReset = userData.wingPersonLastResetDate?.toDate?.() || new Date(0);

  // Check if counter needs reset (new local calendar day)
  const tz = userData.timezoneOffset || 0;
  const nowUTC = new Date();
  const localNow = new Date(nowUTC.getTime() + tz * MS_PER_HOUR);
  const localLast = new Date(lastReset.getTime() + tz * MS_PER_HOUR);

  if (localNow.toDateString() !== localLast.toDateString()) {
    // New day — counter effectively 0
    return { allowed: true, needsReset: true };
  }

  return { allowed: countToday < maxPerDay, needsReset: false };
}

/** Analyze a single match for actionable signals */
async function analyzeMatch(db, userId, matchDoc, config, now) {
  const matchData = matchDoc.data();
  const matchId = matchDoc.id;
  const usersMatched = matchData.usersMatched || [];
  const otherUserId = usersMatched.find(u => u !== userId);
  if (!otherUserId) return null;

  const msgCount = matchData.messageCount || 0;
  const lastMsgTs = matchData.lastMessageTimestamp?.toDate?.() || matchData.timestamp?.toDate?.();
  const matchCreatedTs = matchData.createdAt?.toDate?.() || matchData.timestamp?.toDate?.();
  const lastSenderId = matchData.lastMessageSenderId || '';
  const hoursSinceLastMsg = lastMsgTs ? (now - lastMsgTs) / MS_PER_HOUR : 999;
  const hoursSinceMatch = matchCreatedTs ? (now - matchCreatedTs) / MS_PER_HOUR : 999;

  const signals = config.signals || DEFAULT_CONFIG.signals;

  // Signal 1: New match, no messages
  if (signals.newMatchNoMessage?.enabled && msgCount === 0) {
    if (hoursSinceMatch >= (signals.newMatchNoMessage.minHours || 2) &&
        hoursSinceMatch <= (signals.newMatchNoMessage.maxHours || 48)) {
      return {
        type: 'new_match_no_message',
        priority: 90,
        matchId,
        otherUserId,
        metadata: { hoursSinceMatch: Math.round(hoursSinceMatch) },
      };
    }
  }

  // Signal 2: Conversation cooling — they messaged last, user hasn't replied
  if (signals.conversationCooling?.enabled && msgCount >= (signals.conversationCooling.minMessages || 3)) {
    if (lastSenderId === otherUserId &&
        hoursSinceLastMsg >= (signals.conversationCooling.minHours || 12) &&
        hoursSinceLastMsg <= (signals.conversationCooling.maxHours || 72)) {
      return {
        type: 'conversation_cooling',
        priority: 85,
        matchId,
        otherUserId,
        metadata: { hoursSinceLastMsg: Math.round(hoursSinceLastMsg), messageCount: msgCount },
      };
    }
  }

  // Signal 3: High interest — other user sent 3+ unanswered messages
  if (signals.highInterest?.enabled && msgCount >= 2) {
    const threshold = signals.highInterest.unansweredThreshold || 3;
    // Quick check: query last N messages to see if they're all from the other user
    try {
      const recentMsgs = await db.collection('matches').doc(matchId)
        .collection('messages').orderBy('timestamp', 'desc').limit(threshold + 1).get();
      const msgs = recentMsgs.docs.map(d => d.data());
      const consecutiveFromOther = msgs.filter((m, i) => {
        if (i >= threshold) return false;
        return m.senderId === otherUserId;
      }).length;

      if (consecutiveFromOther >= threshold && hoursSinceLastMsg >= 6) {
        // Calculate average response time for interest level
        const responseTimes = [];
        for (let i = 0; i < msgs.length - 1; i++) {
          if (msgs[i].senderId === otherUserId && msgs[i + 1].senderId !== otherUserId) {
            const t1 = msgs[i].timestamp?.toDate?.() || new Date();
            const t2 = msgs[i + 1].timestamp?.toDate?.() || new Date();
            responseTimes.push((t1 - t2) / 60000); // minutes
          }
        }
        const avgResponseMin = responseTimes.length > 0
          ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : null;

        return {
          type: 'high_interest',
          priority: 80,
          matchId,
          otherUserId,
          metadata: { unansweredCount: consecutiveFromOther, avgResponseMin, hoursSinceLastMsg: Math.round(hoursSinceLastMsg) },
        };
      }
    } catch (e) {
      logger.info(`[WingPerson] Message query error for match ${matchId}: ${e.message}`);
    }
  }

  // Signal 4: Story viewed but no message (only check if no other signal found)
  if (signals.storyViewed?.enabled) {
    const windowHours = signals.storyViewed.windowHours || 12;
    const windowDate = new Date(now - windowHours * MS_PER_HOUR);
    try {
      const stories = await db.collection('stories')
        .where('senderId', '==', otherUserId)
        .where('isPersonal', '==', true)
        .where('expiresAt', '>', admin.firestore.Timestamp.now())
        .limit(3).get();

      for (const storyDoc of stories.docs) {
        const storyData = storyDoc.data();
        const viewedBy = storyData.viewedBy || [];
        if (viewedBy.includes(userId)) {
          // User viewed their story — check if they messaged recently
          if (hoursSinceLastMsg > windowHours || lastSenderId !== userId) {
            return {
              type: 'story_viewed',
              priority: 70,
              matchId,
              otherUserId,
              metadata: { storyId: storyDoc.id },
            };
          }
        }
      }
    } catch (e) {
      // Stories query failed — skip this signal
    }
  }

  return null;
}

/** Generate notification text with Gemini */
async function generateNotificationText(signal, userName, matchName, lang, apiKey) {
  const signalDescriptions = {
    new_match_no_message: `${userName} matched with ${matchName} ${signal.metadata.hoursSinceMatch} hours ago but hasn't sent a message yet.`,
    conversation_cooling: `${userName}'s conversation with ${matchName} has gone quiet for ${signal.metadata.hoursSinceLastMsg} hours. ${matchName} sent the last message. They had ${signal.metadata.messageCount} messages total.`,
    high_interest: `${matchName} has sent ${signal.metadata.unansweredCount} unanswered messages to ${userName}${signal.metadata.avgResponseMin ? ` and responds in ~${signal.metadata.avgResponseMin} min on average` : ''}. Very interested!`,
    story_viewed: `${userName} viewed ${matchName}'s story recently but hasn't sent a message.`,
    inactivity: `${userName} hasn't opened the app in a while and has unread messages from matches.`,
  };

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: AI_MODEL_LITE });

    const prompt = `You are a friendly, playful wing-person for a dating app. Generate ONE short push notification (max 100 chars) to encourage the user to take action.

Context:
- User: ${userName}
- Match: ${matchName}
- Situation: ${signalDescriptions[signal.type] || 'General nudge'}

${getLanguageInstruction(lang)}

Rules:
- Be warm and playful, NEVER pushy or guilt-tripping
- Use ${matchName}'s name naturally
- Don't mention AI, algorithms, or that you're analyzing anything
- Vary tone: curious, teasing, or supportive
- Max 100 characters
- Return ONLY the notification text, nothing else`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 48, temperature: 0.95 },
    });
    const text = result.response.text().trim().replace(/^["']|["']$/g, '');
    if (text.length > 0 && text.length <= 150) return text;
  } catch (e) {
    logger.info(`[WingPerson] Gemini fallback: ${e.message}`);
  }

  // Fallback messages (no Gemini) — all 10 supported languages
  const m = matchName;
  const fb = {
    new_match_no_message: {
      en: `You matched with ${m}! Break the ice 💬`, es: `¡Hiciste match con ${m}! Rompe el hielo 💬`,
      fr: `Vous avez matché avec ${m} ! Brisez la glace 💬`, de: `Du hast ein Match mit ${m}! Brich das Eis 💬`,
      pt: `Você deu match com ${m}! Quebre o gelo 💬`, ja: `${m}とマッチしました！挨拶しましょう 💬`,
      zh: `你和${m}配对了！打个招呼吧 💬`, ru: `У вас мэтч с ${m}! Начните разговор 💬`,
      ar: `لديك تطابق مع ${m}! ابدأ المحادثة 💬`, id: `Kamu cocok dengan ${m}! Mulai obrolan 💬`,
    },
    conversation_cooling: {
      en: `${m} is waiting for your reply 👀`, es: `${m} está esperando tu respuesta 👀`,
      fr: `${m} attend ta réponse 👀`, de: `${m} wartet auf deine Antwort 👀`,
      pt: `${m} está esperando sua resposta 👀`, ja: `${m}が返事を待っています 👀`,
      zh: `${m}在等你的回复 👀`, ru: `${m} ждёт твоего ответа 👀`,
      ar: `${m} ينتظر ردك 👀`, id: `${m} menunggu balasanmu 👀`,
    },
    high_interest: {
      en: `${m} messaged you — seems very interested 🔥`, es: `${m} te ha escrito — parece muy interesad@ 🔥`,
      fr: `${m} t'a écrit — semble très intéressé(e) 🔥`, de: `${m} hat dir geschrieben — scheint sehr interessiert 🔥`,
      pt: `${m} te mandou mensagem — parece muito interessad@ 🔥`, ja: `${m}からメッセージ — とても興味がありそう 🔥`,
      zh: `${m}给你发了消息 — 看起来很感兴趣 🔥`, ru: `${m} написал(а) — похоже, очень заинтересован(а) 🔥`,
      ar: `${m} أرسل لك رسالة — يبدو مهتمًا جدًا 🔥`, id: `${m} mengirim pesan — sepertinya sangat tertarik 🔥`,
    },
    story_viewed: {
      en: `You saw ${m}'s story — say something 😊`, es: `Viste la story de ${m} — dile algo 😊`,
      fr: `Tu as vu la story de ${m} — dis quelque chose 😊`, de: `Du hast ${m}s Story gesehen — sag was 😊`,
      pt: `Você viu o story de ${m} — diga algo 😊`, ja: `${m}のストーリーを見ました — 何か言いましょう 😊`,
      zh: `你看了${m}的动态 — 说点什么吧 😊`, ru: `Ты видел(а) сторис ${m} — напиши что-нибудь 😊`,
      ar: `شاهدت قصة ${m} — قل شيئًا 😊`, id: `Kamu lihat story ${m} — kirim sesuatu 😊`,
    },
    inactivity: {
      en: `You have matches waiting. Don't leave them on read! 💕`, es: `Tienes matches esperando. ¡No los dejes en visto! 💕`,
      fr: `Tu as des matchs en attente. Ne les laisse pas en vu ! 💕`, de: `Du hast wartende Matches. Lass sie nicht hängen! 💕`,
      pt: `Você tem matches esperando. Não deixe no vácuo! 💕`, ja: `マッチが待っています。既読スルーしないで！💕`,
      zh: `你有配对在等你。别已读不回！💕`, ru: `У тебя есть мэтчи. Не оставляй их без ответа! 💕`,
      ar: `لديك تطابقات بانتظارك. لا تتركهم بلا رد! 💕`, id: `Kamu punya match yang menunggu. Jangan dicuekin! 💕`,
    },
  };
  const langKey = ['es', 'fr', 'de', 'pt', 'ja', 'zh', 'ru', 'ar', 'id'].find(l => lang.startsWith(l)) || 'en';
  return fb[signal.type]?.[langKey] || fb.inactivity[langKey];
}

// ─── Main Scheduled Function ────────────────────────────────────────────────

/**
 * AI Wing-Person — Proactive dating coach notifications.
 * Runs every 4 hours. Analyzes matches, detects patterns, sends personalized push via Gemini.
 * Rate limited: max 2 per user per day. Respects quiet hours (22:00-09:00 local).
 */
exports.wingPersonAnalysis = onSchedule(
  {
    schedule: 'every 4 hours',
    region: 'us-central1',
    memory: '1GiB',
    timeoutSeconds: 540,
    secrets: [geminiApiKey],
  },
  async () => {
    const db = admin.firestore();
    const now = Date.now();
    const config = await getWingPersonConfig();

    if (!config.enabled) {
      logger.info('[WingPerson] Disabled via Remote Config');
      return;
    }

    const batchLimit = config.batchLimit || BATCH_LIMIT;
    let processedUsers = 0;
    let notificationsSent = 0;
    let skippedQuiet = 0;
    let skippedRateLimit = 0;
    let skippedOptOut = 0;
    let noSignal = 0;

    // Query active users with FCM token, not paused
    let lastDoc = null;
    while (processedUsers < batchLimit) {
      let query = db.collection('users')
        .where('accountStatus', '==', 'active')
        .where('paused', '==', false)
        .limit(100);

      if (lastDoc) query = query.startAfter(lastDoc);
      const usersSnap = await query.get();
      if (usersSnap.empty) break;

      for (const userDoc of usersSnap.docs) {
        if (processedUsers >= batchLimit) break;
        lastDoc = userDoc;
        processedUsers++;

        const userData = userDoc.data();
        const userId = userDoc.id;

        // Skip: no FCM token
        if (!userData.fcmToken) continue;

        // Skip: opted out
        if (userData.wingPersonOptOut === true) { skippedOptOut++; continue; }

        // Skip: quiet hours
        if (isQuietHours(userData.timezoneOffset, config)) { skippedQuiet++; continue; }

        // Skip: rate limit
        const rateCheck = checkRateLimit(userData, config);
        if (!rateCheck.allowed) { skippedRateLimit++; continue; }

        // Get user's matches
        const [m1, m2] = await Promise.all([
          db.collection('matches').where('userId1', '==', userId).get(),
          db.collection('matches').where('userId2', '==', userId).get(),
        ]);
        const allMatches = [...m1.docs, ...m2.docs];
        if (allMatches.length === 0) continue;

        // Check dedup: don't send for same match within configurable window
        const dedupWindowMs = (config.dedupWindowHours || 12) * MS_PER_HOUR;
        let recentNotifs = new Set();
        try {
          const recentSnap = await db.collection('wingPersonNotifications')
            .where('userId', '==', userId)
            .where('sentAt', '>', admin.firestore.Timestamp.fromMillis(now - dedupWindowMs))
            .get();
          recentSnap.docs.forEach(d => recentNotifs.add(d.data().matchId));
        } catch (e) { /* collection may not exist yet */ }

        // Analyze matches — find best signal
        let bestSignal = null;
        for (const matchDoc of allMatches) {
          if (recentNotifs.has(matchDoc.id)) continue;
          const signal = await analyzeMatch(db, userId, matchDoc, config, now);
          if (signal && (!bestSignal || signal.priority > bestSignal.priority)) {
            bestSignal = signal;
          }
        }

        if (!bestSignal) { noSignal++; continue; }

        // Get other user's name
        let matchName = 'tu match';
        try {
          const otherDoc = await db.collection('users').doc(bestSignal.otherUserId).get();
          if (otherDoc.exists) matchName = otherDoc.data().name || matchName;
        } catch (e) { /* use default */ }

        const userName = userData.name || 'User';
        const lang = (userData.deviceLanguage || 'en').split('-')[0].split('_')[0].toLowerCase();

        // Generate notification text
        const apiKey = process.env.GEMINI_API_KEY;
        const notifBody = await generateNotificationText(bestSignal, userName, matchName, lang, apiKey);
        const titleMap = {
          es: config.notificationTitles?.es || 'Tu Wing-Person 💫',
          pt: config.notificationTitles?.pt || 'Seu Wing-Person 💫',
          fr: config.notificationTitles?.fr || 'Votre Wing-Person 💫',
          de: config.notificationTitles?.de || 'Dein Wing-Person 💫',
          ja: config.notificationTitles?.ja || 'あなたのWing-Person 💫',
          zh: config.notificationTitles?.zh || '你的Wing-Person 💫',
          ru: config.notificationTitles?.ru || 'Ваш Wing-Person 💫',
          ar: config.notificationTitles?.ar || 'مساعدك Wing-Person 💫',
          id: config.notificationTitles?.id || 'Wing-Person Anda 💫',
          en: config.notificationTitles?.en || 'Your Wing-Person 💫',
        };
        const notifTitle = titleMap[lang] || titleMap.en;

        // Send push notification
        try {
          await admin.messaging().send({
            token: userData.fcmToken,
            data: {
              type: 'wing_person',
              matchId: bestSignal.matchId,
              signalType: bestSignal.type,
              timestamp: Date.now().toString(),
            },
            notification: { title: notifTitle, body: notifBody },
            apns: { payload: { aps: { sound: 'default', badge: 1, alert: { title: notifTitle, body: notifBody } } } },
            android: { priority: 'high', notification: {
              title: notifTitle, body: notifBody,
              sound: 'default', channelId: 'wingperson_channel', priority: 'high',
            } },
          });

          notificationsSent++;

          // Track: write notification record
          await db.collection('wingPersonNotifications').add({
            userId,
            matchId: bestSignal.matchId,
            signalType: bestSignal.type,
            notificationBody: notifBody,
            sentAt: admin.firestore.Timestamp.now(),
            language: lang,
            metadata: bestSignal.metadata,
          });

          // Update rate limit counters
          const updateData = {
            wingPersonLastNotifiedAt: admin.firestore.Timestamp.now(),
          };
          if (rateCheck.needsReset) {
            updateData.wingPersonNotifCountToday = 1;
            updateData.wingPersonLastResetDate = admin.firestore.Timestamp.now();
          } else {
            updateData.wingPersonNotifCountToday = admin.firestore.FieldValue.increment(1);
          }
          await db.collection('users').doc(userId).update(updateData);

        } catch (sendErr) {
          // Token probably invalid — clean up
          if (sendErr.code === 'messaging/registration-token-not-registered' ||
              sendErr.code === 'messaging/invalid-registration-token') {
            try { await db.collection('users').doc(userId).update({ fcmToken: admin.firestore.FieldValue.delete() }); } catch (e) { logger.warn(`[cleanup] batch op failed: ${e.message}`); }
          }
          logger.info(`[WingPerson] Send failed for ${userId}: ${sendErr.code || sendErr.message}`);
        }
      }

      if (usersSnap.docs.length < 100) break;
    }

    logger.info(`[WingPerson] Processed=${processedUsers}, sent=${notificationsSent}, quiet=${skippedQuiet}, rateLimit=${skippedRateLimit}, optOut=${skippedOptOut}, noSignal=${noSignal}`);
  },
);
