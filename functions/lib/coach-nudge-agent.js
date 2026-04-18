'use strict';

/**
 * Proactive Coach Nudge Agent — BlackSugar21
 *
 * Scheduled agent that runs every 6 hours and detects matches with
 * conversations that have gone silent (24h–72h since last message).
 * Sends an FCM push notification inviting the user to rehearse their
 * next move with the AI Coach / Situation Simulation feature.
 *
 * Business rule:
 *   - Nudge ONLY the user who sent the last message (they are waiting
 *     for a reply and likely anxious). Never nudge the silent party.
 *   - Conversations with < 3 messages are skipped (no real bond yet).
 *   - Per-match cooldown of 48h to prevent repeat spam.
 *   - Per-user daily cap (default 2 nudges/day, reused from wingperson pattern).
 *   - Respects quiet hours 22:00–09:00 local using users/{uid}.timezoneOffset.
 *   - Respects users/{uid}.coachNudgeOptOut opt-out flag.
 *
 * Zero Gemini calls — all copy is localized static strings.
 * Cost: ~$0.16/day FS reads + FCM free = <$6/month even at 10K DAU.
 *
 * Deep link: the FCM payload carries {type:'coach_nudge', matchId, action:'open_coach'}.
 * Client handlers already route this to CoachChatActivity/CoachChatView with the
 * match preselected, which auto-injects the "🔮 Ensayar conexión con X" chip
 * — zero new client code required.
 */

const {onSchedule} = require('firebase-functions/v2/scheduler');
const {logger} = require('firebase-functions/v2');
const admin = require('firebase-admin');

// ---------------------------------------------------------------------------
// Remote Config — all tunables live inside coach_config JSON
// ---------------------------------------------------------------------------
const COACH_NUDGE_DEFAULTS = {
  coachNudgeEnabled: true,
  coachNudgeMaxPerDay: 2,
  coachNudgeCooldownHoursPerMatch: 48,
  coachNudgeSilenceMinHours: 24,
  coachNudgeSilenceMaxHours: 72,
  coachNudgeQuietHourStart: 22,   // 22:00 local — stop nudging after this
  coachNudgeQuietHourEnd: 9,      // 09:00 local — resume nudging after this
  coachNudgeMinMessageCount: 3,
  coachNudgeMaxMatchesPerRun: 450, // safety cap — same pattern as other scheduled tasks
};

let _coachNudgeConfigCache = null;
let _coachNudgeConfigCacheTime = 0;
const COACH_NUDGE_CONFIG_TTL = 5 * 60 * 1000; // 5 min

async function getCoachNudgeConfig() {
  if (_coachNudgeConfigCache && (Date.now() - _coachNudgeConfigCacheTime) < COACH_NUDGE_CONFIG_TTL) {
    return _coachNudgeConfigCache;
  }
  try {
    const rc = admin.remoteConfig();
    const template = await rc.getServerTemplate();
    const serverConfig = template.evaluate();
    const rawValue = serverConfig.getString('coach_config');
    const parsed = rawValue ? JSON.parse(rawValue) : {};
    _coachNudgeConfigCache = {...COACH_NUDGE_DEFAULTS, ...parsed};
  } catch (e) {
    logger.warn(`[getCoachNudgeConfig] RC read failed, using defaults: ${e.message}`);
    _coachNudgeConfigCache = {...COACH_NUDGE_DEFAULTS};
  }
  _coachNudgeConfigCacheTime = Date.now();
  return _coachNudgeConfigCache;
}

// ---------------------------------------------------------------------------
// Localized notification strings — 12 languages
// ---------------------------------------------------------------------------
const NUDGE_TITLE = {
  en: '✨ Rehearse your next move',
  es: '✨ Ensaya tu próximo mensaje',
  pt: '✨ Ensaie sua próxima mensagem',
  'pt-PT': '✨ Ensaia a tua próxima mensagem',
  fr: '✨ Répétez votre prochain message',
  de: '✨ Übe deine nächste Nachricht',
  ja: '✨ 次のメッセージを練習',
  zh: '✨ 演练你的下一条消息',
   'zh-TW': '✨ 演練你的下一則訊息',
  'zh-HK': '✨ 練習下一條訊息',
  ru: '✨ Отрепетируй следующее сообщение',
  ar: '✨ تدرب على رسالتك التالية',
  id: '✨ Latih pesan berikutnya',
};

// Body uses {name} placeholder — target user sent last and is waiting for reply
const NUDGE_BODY = {
  en: '{name} hasn\'t replied yet. Want to rehearse a follow-up with the AI Coach?',
  es: '{name} no ha respondido aún. ¿Ensayamos qué decirle con el Coach IA?',
  pt: '{name} ainda não respondeu. Quer ensaiar uma mensagem com o Coach IA?',
  'pt-PT': '{name} ainda não respondeu. Queres ensaiar uma mensagem com o Coach IA?',
  fr: '{name} n\'a pas encore répondu. On répète un message avec le Coach IA ?',
  de: '{name} hat noch nicht geantwortet. Lust, eine Nachricht mit dem KI-Coach zu proben?',
  ja: '{name}さんからまだ返信がありません。AIコーチで次のメッセージを練習しませんか？',
  zh: '{name}还没回复。要和AI Coach演练下一条消息吗？',
  'zh-TW': '{name}還沒回覆。要和 AI Coach 演練下一則訊息嗎？',
  'zh-HK': '{name}仲未回覆。想同 AI Coach 練習下一條訊息嗎？',
  ru: '{name} ещё не ответил(а). Отрепетировать сообщение с AI-коучем?',
  ar: 'لم يرد {name} بعد. هل تريد التدرب على رسالة متابعة مع مدرب الذكاء الاصطناعي؟',
  id: '{name} belum membalas. Mau latihan pesan dengan AI Coach?',
};

function pickLang(lang) {
  if (!lang) return 'en';
  const normalized = String(lang).split('-')[0].toLowerCase();
  return NUDGE_TITLE[normalized] ? normalized : 'en';
}

// ---------------------------------------------------------------------------
// Clean up stale FCM tokens after send (mirror of scheduled.js:10)
// ---------------------------------------------------------------------------
async function cleanupStaleTokens(response, tokens, db) {
  const staleTokens = [];
  response.responses.forEach((resp, i) => {
    if (!resp.success && resp.error) {
      const code = resp.error.code;
      if (code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/invalid-argument') {
        staleTokens.push(tokens[i]);
      }
    }
  });
  if (staleTokens.length === 0) return;
  const batch = db.batch();
  for (const token of staleTokens) {
    try {
      const snap = await db.collection('users').where('fcmToken', '==', token).limit(1).get();
      if (!snap.empty) {
        batch.update(snap.docs[0].ref, {fcmToken: admin.firestore.FieldValue.delete()});
      }
    } catch (e) { logger.warn(`[cleanup] batch op failed: ${e.message}`); }
  }
  try { await batch.commit(); } catch (e) { logger.warn(`[cleanup] batch op failed: ${e.message}`); }
  logger.info(`[coachNudgeAgent] Removed ${staleTokens.length} invalid FCM tokens`);
}

// ---------------------------------------------------------------------------
// Main scheduled function
// ---------------------------------------------------------------------------
exports.coachNudgeAgent = onSchedule(
  {
    schedule: 'every 6 hours',
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 300,
    timeZone: 'UTC',
  },
  async () => {
    const startedAt = Date.now();
    const db = admin.firestore();

    // ── 1. Read config ───────────────────────────────────────────────────
    const config = await getCoachNudgeConfig();
    if (!config.coachNudgeEnabled) {
      logger.info('[coachNudgeAgent] Disabled via Remote Config, exiting');
      return;
    }

    // ── 2. Compute silence window ────────────────────────────────────────
    const now = Date.now();
    const minSilenceMs = config.coachNudgeSilenceMinHours * 3600_000;
    const maxSilenceMs = config.coachNudgeSilenceMaxHours * 3600_000;
    const windowStart = admin.firestore.Timestamp.fromMillis(now - maxSilenceMs);
    const windowEnd   = admin.firestore.Timestamp.fromMillis(now - minSilenceMs);

    // ── 3. Query candidate matches ───────────────────────────────────────
    // Firestore composite: lastMessageTimestamp range + messageCount >=
    // We filter messageCount client-side to avoid requiring a composite index.
    let matchesSnap;
    try {
      matchesSnap = await db.collection('matches')
        .where('lastMessageTimestamp', '>=', windowStart)
        .where('lastMessageTimestamp', '<', windowEnd)
        .orderBy('lastMessageTimestamp', 'desc')
        .limit(config.coachNudgeMaxMatchesPerRun)
        .get();
    } catch (e) {
      logger.error(`[coachNudgeAgent] Matches query failed: ${e.message}`);
      return;
    }

    if (matchesSnap.empty) {
      logger.info('[coachNudgeAgent] No candidate matches in silence window');
      return;
    }

    // ── 4. Build nudge decisions ─────────────────────────────────────────
    const metrics = {
      scanned: matchesSnap.size,
      skippedShortHistory: 0,
      skippedCooldown: 0,
      skippedNoSender: 0,
      skippedInactiveUser: 0,
      skippedOptOut: 0,
      skippedRateLimit: 0,
      skippedQuietHours: 0,
      skippedNoToken: 0,
      skippedNoMatchName: 0,
      nudgesQueued: 0,
      nudgesSent: 0,
    };

    // token → { matchId, targetUserId, matchName, lang }
    const nudgesByToken = new Map();
    // userId cache to avoid duplicate reads
    const userCache = new Map();

    for (const matchDoc of matchesSnap.docs) {
      const match = matchDoc.data();
      const matchId = matchDoc.id;

      // Skip low-history conversations
      if ((match.messageCount || 0) < config.coachNudgeMinMessageCount) {
        metrics.skippedShortHistory++;
        continue;
      }

      // Per-match cooldown
      const lastNudgeAt = match.lastCoachNudgeAt?.toMillis?.() || 0;
      if (now - lastNudgeAt < config.coachNudgeCooldownHoursPerMatch * 3600_000) {
        metrics.skippedCooldown++;
        continue;
      }

      const users = match.usersMatched || match.users || [];
      if (users.length !== 2) continue;

      const lastSender = match.lastMessageSenderId;
      if (!lastSender || !users.includes(lastSender)) {
        metrics.skippedNoSender++;
        continue;
      }

      // Business rule: nudge the user who sent last (they're waiting for a reply)
      const targetUserId = lastSender;
      const otherUserId = users.find(u => u !== targetUserId);
      if (!otherUserId) continue;

      // Fetch target user (with cache)
      let target = userCache.get(targetUserId);
      if (!target) {
        try {
          const doc = await db.collection('users').doc(targetUserId).get();
          target = doc.exists ? doc.data() : null;
          userCache.set(targetUserId, target);
        } catch (_) {
          target = null;
        }
      }
      if (!target) { metrics.skippedInactiveUser++; continue; }

      if (target.accountStatus !== 'active' || target.paused === true) {
        metrics.skippedInactiveUser++;
        continue;
      }
      if (target.coachNudgeOptOut === true) { metrics.skippedOptOut++; continue; }
      if ((target.coachNudgeCountToday || 0) >= config.coachNudgeMaxPerDay) {
        metrics.skippedRateLimit++;
        continue;
      }
      if (!target.fcmToken) { metrics.skippedNoToken++; continue; }

      // Quiet hours check (local time)
      const tzOffset = typeof target.timezoneOffset === 'number' ? target.timezoneOffset : -3;
      const nowUtcHour = new Date(now).getUTCHours();
      const localHour = ((nowUtcHour + tzOffset) % 24 + 24) % 24;
      const qStart = config.coachNudgeQuietHourStart;
      const qEnd = config.coachNudgeQuietHourEnd;
      // Quiet if within the night window (handles wraparound)
      const inQuietHours = qStart > qEnd
        ? (localHour >= qStart || localHour < qEnd)
        : (localHour >= qStart && localHour < qEnd);
      if (inQuietHours) {
        metrics.skippedQuietHours++;
        continue;
      }

      // Fetch other user's name for the notification body
      let other = userCache.get(otherUserId);
      if (!other) {
        try {
          const doc = await db.collection('users').doc(otherUserId).get();
          other = doc.exists ? doc.data() : null;
          userCache.set(otherUserId, other);
        } catch (_) {
          other = null;
        }
      }
      if (!other) continue;
      const fullName = other.name || other.firstName || '';
      const matchName = (fullName.split(' ')[0] || '').trim();
      if (!matchName) { metrics.skippedNoMatchName++; continue; }

      // Do not queue the same token twice (user has multiple candidate matches)
      if (nudgesByToken.has(target.fcmToken)) continue;

      nudgesByToken.set(target.fcmToken, {
        matchId,
        targetUserId,
        matchName,
        lang: pickLang(target.language || target.locale),
      });
      metrics.nudgesQueued++;
    }

    if (nudgesByToken.size === 0) {
      logger.info(`[coachNudgeAgent] No nudges to send. Metrics: ${JSON.stringify(metrics)}`);
      return;
    }

    // ── 5. Build and send FCM messages ───────────────────────────────────
    const entries = Array.from(nudgesByToken.entries());
    const messages = entries.map(([token, info]) => ({
      token,
      data: {
        type: 'coach_nudge',
        matchId: info.matchId,
        action: 'open_coach',
        screen: 'Coach',
        navigationPath: 'home/coach/chat',
        timestamp: String(now),
      },
      notification: {
        title: NUDGE_TITLE[info.lang],
        body: NUDGE_BODY[info.lang].replace('{name}', info.matchName),
      },
      android: {
        priority: 'high',
        collapseKey: `coach_nudge_${info.matchId}`,
        notification: {
          tag: `coach_nudge_${info.matchId}`,
          channelId: 'coach_channel',
          priority: 'high',
          sound: 'default',
        },
      },
      apns: {
        headers: {'apns-collapse-id': `coach_nudge_${info.matchId}`},
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            'thread-id': info.matchId,
          },
        },
      },
    }));

    // sendEach supports heterogeneous per-token messages; FCM limit is 500 per call
    for (let i = 0; i < messages.length; i += 500) {
      const slice = messages.slice(i, i + 500);
      try {
        const response = await admin.messaging().sendEach(slice);
        metrics.nudgesSent += response.successCount;
        cleanupStaleTokens(response, slice.map(m => m.token), db).catch(e => {
          logger.warn(`[coachNudgeAgent] cleanupStaleTokens failed silently: ${e.message}`);
        });
        if (response.failureCount > 0) {
          logger.warn(`[coachNudgeAgent] FCM batch failures: ${response.failureCount}/${slice.length}`);
        }
      } catch (e) {
        logger.error(`[coachNudgeAgent] FCM sendEach error: ${e.message}`);
      }
    }

    // ── 6. Persist counters (batched) ────────────────────────────────────
    try {
      const batch = db.batch();
      const usersIncremented = new Set();
      for (const info of nudgesByToken.values()) {
        // Per-match last nudge timestamp (cooldown)
        batch.update(
          db.collection('matches').doc(info.matchId),
          {lastCoachNudgeAt: admin.firestore.FieldValue.serverTimestamp()}
        );
        // Per-user daily counter (only once per user even if multiple matches)
        if (!usersIncremented.has(info.targetUserId)) {
          usersIncremented.add(info.targetUserId);
          batch.update(
            db.collection('users').doc(info.targetUserId),
            {
              coachNudgeCountToday: admin.firestore.FieldValue.increment(1),
              coachNudgeLastSentAt: admin.firestore.FieldValue.serverTimestamp(),
            }
          );
        }
      }
      await batch.commit();
    } catch (e) {
      logger.error(`[coachNudgeAgent] Counter update batch failed: ${e.message}`);
    }

    // ── 7. Final metrics ─────────────────────────────────────────────────
    const elapsedMs = Date.now() - startedAt;
    logger.info(
      `[coachNudgeAgent] Run complete in ${elapsedMs}ms. Metrics: ${JSON.stringify(metrics)}`
    );
  }
);
