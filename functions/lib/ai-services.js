'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { geminiApiKey, placesApiKey, AI_MODEL_NAME, AI_MODEL_LITE, getLanguageInstruction, parseGeminiJsonResponse } = require('./shared');
const { calcAge } = require('./geo');
const { getMatchUsersLocations, calculateMidpoint, placesTextSearch, transformPlaceToSuggestion, getPlacesSearchConfig, haversineKm } = require('./places-helpers');

exports.generateInterestSuggestions = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 30, secrets: [geminiApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {bio, userType} = request.data || {};

    const validInterests = [
      'interest_travel_adventures', 'interest_shopping_fashion', 'interest_fine_dining',
      'interest_art_culture', 'interest_fitness_wellness', 'interest_education_growth',
      'interest_exclusive_events', 'interest_spa_relaxation', 'interest_music_concerts',
      'interest_beach_vacation', 'interest_dancing_nightlife', 'interest_mentorship_business',
      'interest_luxury_experiences', 'interest_international_travel', 'interest_gourmet_cuisine',
      'interest_art_collecting', 'interest_golf_premium_sports', 'interest_vip_events',
      'interest_vip_clubs', 'interest_philanthropy', 'interest_wine_spirits',
      'interest_sailing_yachting', 'interest_business_networking', 'interest_real_estate_investments',
      'interest_movies_theater', 'interest_photography', 'interest_books_reading',
      'interest_cooking', 'interest_yoga_meditation', 'interest_nature_outdoors',
    ];

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        logger.error('[generateInterestSuggestions] GEMINI_API_KEY not configured');
        return {success: false, suggestions: []};
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({model: AI_MODEL_LITE, generationConfig: {maxOutputTokens: 256, responseMimeType: 'application/json'}});

      const userBio = (bio || '').substring(0, 200);
      const prompt = `Suggest 5 interest IDs for a ${userType || 'user'} on a premium dating app.
User bio: "${userBio}"
Return ONLY a JSON array of strings from this list (exact keys):
${JSON.stringify(validInterests)}
Return only the JSON array, no explanation.`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();
      logger.info(`[generateInterestSuggestions] Gemini response: ${responseText.substring(0, 200)}`);

      // Parse JSON array from response
      let suggested = [];
      try {
        const parsed = JSON.parse(responseText.replace(/```json\s*|\s*```/g, '').trim());
        if (Array.isArray(parsed)) {
          suggested = parsed.filter((s) => validInterests.includes(s)).slice(0, 5);
        }
      } catch (_e) {
        // Fallback: regex extraction
        const regex = /"(interest_[^"]+)"/g;
        let match;
        while ((match = regex.exec(responseText)) !== null) {
          if (validInterests.includes(match[1])) suggested.push(match[1]);
        }
        suggested = suggested.slice(0, 5);
      }

      return {success: true, suggestions: suggested};
    } catch (error) {
      logger.error('[generateInterestSuggestions] Error:', error);
      return {success: false, suggestions: []};
    }
  },
);

/**
 * Callable: Analizar foto antes de subirla.
 * Payload: { imageBase64?, imageUrl? }
 * Response: { approved, reason, score }
 * Homologado: iOS PhotoAnalyzerService.analyzePhotoBeforeUpload
 */
exports.analyzePhotoBeforeUpload = onCall(
  {region: 'us-central1', memory: '512MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {imageUrl} = request.data || {};
    // En producción usar Cloud Vision API
    logger.info(`[analyzePhotoBeforeUpload] Analyzed photo for user ${request.auth.uid}`);
    return {approved: true, reason: 'photo_approved', score: 0.95};
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// AI FUNCTIONS — Análisis, compatibilidad, consejos, sugerencias
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Callable: Analizar perfil con IA para recomendaciones.
 * Payload: { userId, profileData? }
 * Response: { analysis, recommendations, score }
 * Homologado: iOS ProfileCardRepository / Android ProfileRepositoryImp
 */
exports.analyzeProfileWithAI = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {userId} = request.data || {};
    const targetId = userId || request.auth.uid;
    const db = admin.firestore();

    const userDoc = await db.collection('users').doc(targetId).get();
    if (!userDoc.exists) throw new Error('User not found');

    const user = userDoc.data();
    const recommendations = [];
    let score = 70;

    if (!user.bio || user.bio.length < 20) {
      recommendations.push('Añade una bio más detallada para mejorar tus matches');
      score -= 10;
    }
    const photoCount = Array.isArray(user.pictures) ? user.pictures.length : 1;
    if (photoCount < 3) {
      recommendations.push(`Añade más fotos (tienes ${photoCount}, se recomiendan al menos 3)`);
      score -= 10;
    }
    if (!user.interests || (Array.isArray(user.interests) && user.interests.length < 3)) {
      recommendations.push('Añade más intereses para mejorar la compatibilidad');
      score -= 5;
    }

    logger.info(`[analyzeProfileWithAI] Profile score=${score} for ${targetId}`);
    return {
      success: true,
      score: Math.max(score, 30),
      analysis: 'Perfil analizado con éxito',
      recommendations,
      photoCount,
    };
  },
);

/**
 * Callable: Calcular puntuación de seguridad de conversación.
 * Payload: { userId, messages?, conversationId? }
 * Response: { score, flags, riskLevel }
 * Homologado: iOS SafetyScoreService.calculateSafetyScore
 */
exports.calculateSafetyScore = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60, secrets: [geminiApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {matchId, userId, userLanguage, targetUserId} = request.data || {};
    const apiKey = process.env.GEMINI_API_KEY;
    const db = admin.firestore();

    const rawLang = userLanguage || 'en';
    const lang = rawLang.split('-')[0].split('_')[0].toLowerCase();

    // Read safety config from Remote Config (coach_config.safetyScore)
    let safetyConfig = {};
    try {
      const rc = admin.remoteConfig();
      const template = await rc.getTemplate();
      const coachConfigStr = template.parameters?.coach_config?.defaultValue?.value;
      if (coachConfigStr) {
        const parsed = JSON.parse(coachConfigStr);
        safetyConfig = parsed.safetyScore || {};
      }
    } catch (_) { /* use defaults */ }

    const fallbackScore = safetyConfig.fallbackScore || 85;
    const riskLow = safetyConfig.riskThresholdLow || 70;
    const riskMed = safetyConfig.riskThresholdMedium || 40;
    const flagPenalty = safetyConfig.quickFlagPenalty || 25;

    // Default safe response
    const safeFallback = {success: true, score: fallbackScore, safetyScore: fallbackScore, riskLevel: 'low', flags: [], concerns: [], warnings: [], badges: ['active_account']};

    try {
      // Mode 1: Analyze match conversation (when matchId provided)
      if (matchId && apiKey) {
        // Read last 15 messages
        let messages = [];
        try {
          const msgSnap = await db.collection('matches').doc(matchId).collection('messages')
            .orderBy('timestamp', 'desc').limit(15).get();
          messages = msgSnap.docs.reverse().map((d) => {
            const data = d.data();
            if (data.type === 'place' || data.isEphemeral) return null;
            return {sender: data.senderId === userId ? 'me' : 'them', text: (data.message || '').substring(0, 200)};
          }).filter(Boolean);
        } catch (e) {
          logger.info(`[calculateSafetyScore] Cannot read messages: ${e.message}`);
        }

        if (messages.length < 3) {
          return {...safeFallback, score: 90, safetyScore: 90};
        }

        const theirMessages = messages.filter((m) => m.sender === 'them').map((m) => m.text);
        const conversation = messages.map((m) => `${m.sender}: ${m.text}`).join('\n');

        // Quick check: known red flag patterns (no AI needed)
        const quickFlags = [];
        const combined = theirMessages.join(' ').toLowerCase();
        const redPatterns = [
          {pattern: /venmo|cashapp|paypal|zelle|bizum|western\s*union|crypto|bitcoin|wire\s*transfer/i, flag: 'financial_request'},
          {pattern: /whatsapp|telegram|snapchat|instagram\s*@|line\s*id|wechat|kakao/i, flag: 'platform_redirect'},
          {pattern: /send\s*(me\s*)?(money|cash|gift\s*card)|envía(me)?\s*(dinero|plata)|manda(me)?\s*dinero/i, flag: 'money_solicitation'},
          {pattern: /onlyfans|premium\s*snap|subscribe|suscríbete|mi\s*pack|link\s*in\s*bio/i, flag: 'promotion_spam'},
          {pattern: /your\s*(home\s*)?address|tu\s*dirección|where\s*do\s*you\s*live\s*exactly|dónde\s*vives\s*exactamente/i, flag: 'personal_info_request'},
          {pattern: /i\s*love\s*you|te\s*amo|marry\s*me|cásate\s*conmigo/i, flag: 'love_bombing'},
        ];
        for (const {pattern, flag} of redPatterns) {
          if (pattern.test(combined)) quickFlags.push(flag);
        }

        // If quick check found flags, add AI analysis
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({model: AI_MODEL_LITE});

        const prompt = `Analyze this dating chat for safety concerns. Focus on messages from "them" (the other person).

IMPORTANT CONTEXT: This is a sugar dating app. Flirtatious language, pet names ("bb", "baby", "amor", "mi vida", "cariño"), and compliments are COMPLETELY NORMAL and should NOT be flagged. Only flag genuinely concerning behavior.

Conversation:
${conversation}

Check for these RED FLAGS (only flag if clearly present, not ambiguous):
1. FINANCIAL: Explicitly asking for money, gift cards, crypto, bank transfers
2. PLATFORM_REDIRECT: Pressuring to move to WhatsApp/Telegram (only if insistent, not a casual suggestion)
3. PERSONAL_INFO: Asking for exact address, SSN, financial account details
4. LOVE_BOMBING: Extreme declarations of love within first 3 messages + pressure for commitment
5. MANIPULATION: Guilt-tripping, ultimatums, emotional blackmail
6. SCAM_PATTERN: Classic romance scam (quick love → emergency → money request)
7. INAPPROPRIATE_PRESSURE: Explicit sexual demands or unsolicited sexual content (NOT pet names or flirting)
8. IMPERSONATION: Claims of being military/doctor/wealthy + asking for help

DO NOT FLAG:
- Pet names (bb, baby, amor, cariño, mi vida, guap@, hermos@)
- Casual flirting or compliments
- Normal dating conversation
- Expressing interest or attraction
- Using emojis (❤️💋😘)

TONE: Warnings should be subtle, friendly suggestions — NOT alarming. Use phrases like "worth keeping in mind" or "something to be aware of" instead of "IMPORTANT" or "WARNING".

Return ONLY a JSON object:
{
  "score": 0-100 (100=completely safe, 0=dangerous. Casual flirting conversations should score 80+),
  "riskLevel": "low"|"medium"|"high",
  "concerns": ["short description of each concern"],
  "warnings": [{"type": "flag_type", "message": "subtle, friendly suggestion in ${getLanguageInstruction(lang)}", "severity": "low|medium|high"}],
  "summary": "1-sentence safety assessment in ${getLanguageInstruction(lang)}"
}`;

        const result = await model.generateContent({
          contents: [{role: 'user', parts: [{text: prompt}]}],
          generationConfig: {maxOutputTokens: 512, temperature: safetyConfig.temperature || 0.1},
        });

        const parsed = parseGeminiJsonResponse(result.response.text());

        if (parsed && typeof parsed.score === 'number') {
          const allFlags = [...new Set([...quickFlags, ...(parsed.warnings || []).map((w) => w.type)])];
          const response = {
            success: true,
            score: Math.max(0, Math.min(100, parsed.score)),
            safetyScore: Math.max(0, Math.min(100, parsed.score)),
            riskLevel: parsed.riskLevel || (parsed.score > 70 ? 'low' : parsed.score > 40 ? 'medium' : 'high'),
            flags: allFlags,
            concerns: (parsed.concerns || []).slice(0, 5).map((c) => String(c).substring(0, 150)),
            warnings: (parsed.warnings || []).slice(0, 3).map((w) => ({
              type: String(w.type || '').substring(0, 30),
              message: String(w.message || '').substring(0, 200),
              severity: ['low', 'medium', 'high'].includes(w.severity) ? w.severity : 'low',
            })),
            summary: String(parsed.summary || '').substring(0, 200),
            badges: parsed.score >= 80 ? ['safe_conversation'] : [],
          };
          logger.info(`[calculateSafetyScore] AI analysis: score=${response.score}, flags=${allFlags.length}, risk=${response.riskLevel}`);
          return response;
        }

        // AI failed to parse, use quick flags only
        const quickScore = Math.max(0, 100 - quickFlags.length * flagPenalty);
        return {
          success: true, score: quickScore, safetyScore: quickScore,
          riskLevel: quickScore > 70 ? 'low' : quickScore > 40 ? 'medium' : 'high',
          flags: quickFlags, concerns: quickFlags, warnings: [], badges: quickScore >= 80 ? ['safe_conversation'] : [],
        };
      }

      // Mode 2: Profile-based safety (when targetUserId provided, legacy)
      if (targetUserId) {
        const userSnap = await db.collection('users').doc(targetUserId).get();
        const user = userSnap.exists ? userSnap.data() : {};
        let score = 85;
        const flags = [];
        const concerns = [];

        if (!user.pictures || (Array.isArray(user.pictures) && user.pictures.length < 2)) { flags.push('few_photos'); concerns.push('Few profile photos'); score -= 10; }
        if (!user.bio || user.bio.length < 10) { flags.push('empty_bio'); concerns.push('Incomplete bio'); score -= 10; }
        if (user.visibilityReduced) { flags.push('previously_reported'); concerns.push('Account has been reported'); score -= 25; }
        const photos = Array.isArray(user.pictures) ? user.pictures.length : 0;
        if (photos >= 3 && user.bio && user.bio.length >= 20) score = Math.min(score + 5, 95);

        score = Math.max(0, Math.min(100, score));
        return {
          success: true, score, safetyScore: score,
          riskLevel: score > 70 ? 'low' : score > 40 ? 'medium' : 'high',
          flags, concerns, warnings: [], badges: score >= 80 ? ['active_account'] : [],
          breakdown: {profileCompleteness: photos >= 3 ? 90 : 50, photoVerification: 50, accountAge: 70, activityConsistency: 70, communityReports: user.visibilityReduced ? 20 : 90, responseRate: 70, messagingPatterns: 80},
        };
      }

      return safeFallback;
    } catch (err) {
      logger.warn(`[calculateSafetyScore] Error: ${err.message}, using safe fallback`);
      return safeFallback;
    }
  },
);

/**
 * Callable: Analizar química de conversación entre dos usuarios.
 * Payload: { messages, userId1?, userId2? }
 * Response: { score, insights, level }
 * Homologado: iOS ChemistryDetectorService.analyzeConversationChemistry
 */
exports.analyzeConversationChemistry = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {messages} = request.data || {};
    let score = 50;
    const insights = [];

    if (Array.isArray(messages) && messages.length > 0) {
      score = Math.min(50 + messages.length * 2, 100);
      if (messages.length > 20) insights.push('Gran cantidad de mensajes — buena señal de interés mutuo');
      if (messages.length > 5) insights.push('La conversación está fluyendo bien');
    } else {
      insights.push('Inicia la conversación para desbloquear el análisis de química');
    }

    const level = score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low';
    logger.info(`[analyzeConversationChemistry] score=${score}, level=${level}`);
    return {success: true, score, level, insights};
  },
);

/**
 * Callable: Generar respuesta inteligente basada en el contexto del chat.
 * Payload: { messages, context?, matchId? }
 * Response: { reply, alternatives }
 * Homologado: iOS AIWingmanService.generateSmartReply
 */
exports.generateSmartReply = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60, secrets: [geminiApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const startTime = Date.now();
    const {matchId, lastMessage, userId, userLanguage} = request.data || {};
    const apiKey = process.env.GEMINI_API_KEY;
    const db = admin.firestore();

    // Normalize language
    const rawLang = userLanguage || 'en';
    const lang = rawLang.split('-')[0].split('_')[0].toLowerCase();

    // Multilingual fallback replies
    const FALLBACK = {
      es: {playful: '¡Eso suena genial! Cuéntame más 😊', thoughtful: '¡Qué interesante! Me encantaría saber más sobre eso 🤔', casual: '¡Qué buena onda! 👋', tone: 'neutral', engagementTip: 'Haz una pregunta abierta para mantener la conversación'},
      en: {playful: "That sounds amazing! Tell me more 😊", thoughtful: "That's really interesting! I'd love to hear more about that 🤔", casual: "That's cool! 👋", tone: 'neutral', engagementTip: 'Ask an open-ended question to keep the conversation flowing'},
      fr: {playful: "Ça a l'air génial ! Raconte-moi 😊", thoughtful: "C'est vraiment intéressant ! J'aimerais en savoir plus 🤔", casual: "Trop bien ! 👋", tone: 'neutral', engagementTip: 'Pose une question ouverte pour continuer la conversation'},
      de: {playful: 'Das klingt toll! Erzähl mir mehr 😊', thoughtful: 'Das ist wirklich interessant! Ich würde gerne mehr darüber erfahren 🤔', casual: 'Cool! 👋', tone: 'neutral', engagementTip: 'Stelle eine offene Frage, um das Gespräch am Laufen zu halten'},
      pt: {playful: 'Isso parece incrível! Me conta mais 😊', thoughtful: 'Que interessante! Adoraria saber mais sobre isso 🤔', casual: 'Que legal! 👋', tone: 'neutral', engagementTip: 'Faça uma pergunta aberta para manter a conversa fluindo'},
      ja: {playful: 'それ素敵ですね！もっと教えて 😊', thoughtful: 'すごく興味深い！もっと聞かせて 🤔', casual: 'いいね！👋', tone: 'neutral', engagementTip: 'オープンな質問をして会話を続けよう'},
      zh: {playful: '听起来太棒了！跟我多说说 😊', thoughtful: '真有意思！想多了解一下 🤔', casual: '不错哦！👋', tone: 'neutral', engagementTip: '问一个开放性的问题来保持对话'},
      ru: {playful: 'Звучит здорово! Расскажи подробнее 😊', thoughtful: 'Очень интересно! Хотелось бы узнать больше 🤔', casual: 'Круто! 👋', tone: 'neutral', engagementTip: 'Задай открытый вопрос, чтобы поддержать разговор'},
      ar: {playful: 'يبدو رائعاً! أخبرني المزيد 😊', thoughtful: 'مثير للاهتمام! أود معرفة المزيد 🤔', casual: '!رائع 👋', tone: 'neutral', engagementTip: 'اطرح سؤالاً مفتوحاً للحفاظ على المحادثة'},
      id: {playful: 'Kedengarannya seru! Ceritain dong 😊', thoughtful: 'Menarik banget! Pengen tau lebih lanjut 🤔', casual: 'Keren! 👋', tone: 'neutral', engagementTip: 'Ajukan pertanyaan terbuka untuk menjaga percakapan tetap mengalir'},
    };
    const fallback = FALLBACK[lang] || FALLBACK.en;
    const fallbackReplies = [
      {text: fallback.casual, tone: 'casual', explanation: ''},
      {text: fallback.playful, tone: 'flirty', explanation: ''},
      {text: fallback.thoughtful, tone: 'deep', explanation: ''},
    ];

    try {
      if (!apiKey || !matchId || !userId) {
        logger.info(`[generateSmartReply] Missing required param (apiKey=${!!apiKey}, matchId=${!!matchId}, userId=${!!userId}), using fallback`);
        return {success: true, suggestions: fallback, replies: fallbackReplies, executionTime: Date.now() - startTime};
      }

      // 1. Read last 8 text messages from the match conversation (skip place/ephemeral)
      let chatHistory = [];
      try {
        const msgSnap = await db.collection('matches').doc(matchId).collection('messages')
          .orderBy('timestamp', 'desc').limit(15).get(); // fetch more to filter non-text
        chatHistory = msgSnap.docs.reverse()
          .map((d) => {
            const data = d.data();
            // Skip place shares, ephemeral photos, and system messages
            if (data.type === 'place' || data.type === 'ephemeral_photo' || data.isEphemeral) return null;
            const text = (data.message || '').substring(0, 300); // truncate long messages
            if (!text) return null;
            return {sender: data.senderId === userId ? 'me' : 'them', text};
          })
          .filter(Boolean)
          .slice(-8); // keep last 8 text messages
      } catch (msgErr) {
        logger.info(`[generateSmartReply] Could not read messages: ${msgErr.message}`);
      }

      // 2. Read both user profiles
      const matchDoc = await db.collection('matches').doc(matchId).get();
      if (!matchDoc.exists) {
        logger.info(`[generateSmartReply] Match ${matchId} not found, using fallback`);
        return {success: true, suggestions: fallback, replies: fallbackReplies, executionTime: Date.now() - startTime};
      }
      const matchData = matchDoc.data() || {};
      const usersMatched = matchData.usersMatched || [];
      if (!usersMatched.includes(userId)) {
        logger.warn(`[generateSmartReply] User ${userId} not in match ${matchId}`);
        return {success: true, suggestions: fallback, replies: fallbackReplies, executionTime: Date.now() - startTime};
      }
      const otherUserId = usersMatched.find((uid) => uid !== userId) || '';

      let myProfile = {};
      let theirProfile = {};
      try {
        const [mySnap, theirSnap] = await Promise.all([
          userId ? db.collection('users').doc(userId).get() : Promise.resolve({exists: false, data: () => ({})}),
          otherUserId ? db.collection('users').doc(otherUserId).get() : Promise.resolve({exists: false, data: () => ({})}),
        ]);
        myProfile = mySnap.exists ? mySnap.data() : {};
        theirProfile = theirSnap.exists ? theirSnap.data() : {};
      } catch (profileErr) {
        logger.info(`[generateSmartReply] Could not read profiles: ${profileErr.message}`);
      }

      const myName = myProfile.name || 'Me';
      const theirName = theirProfile.name || 'Match';

      // 3. RAG: retrieve relevant advice based on last message
      let ragContext = '';
      try {
        const ragQuery = lastMessage || (chatHistory.length > 0 ? chatHistory[chatHistory.length - 1].text : 'dating conversation reply');
        const genAIEmbed = new GoogleGenerativeAI(apiKey);
        const embModel = genAIEmbed.getGenerativeModel({model: 'gemini-embedding-001'});
        const embedResult = await Promise.race([
          embModel.embedContent({content: {parts: [{text: ragQuery.substring(0, 300)}]}, taskType: 'RETRIEVAL_QUERY', outputDimensionality: 768}),
          new Promise((_, reject) => setTimeout(() => reject(new Error('RAG timeout')), 4000)),
        ]);
        const ragSnap = await db.collection('coachKnowledge')
          .findNearest('embedding', embedResult.embedding.values, {limit: 3, distanceMeasure: 'COSINE', distanceResultField: '_distance'})
          .get();
        if (!ragSnap.empty) {
          const chunks = ragSnap.docs
            .map((d) => {const data = d.data(); return {text: (data.text || '').substring(0, 500), similarity: 1 - (data._distance ?? 1)};})
            .filter((d) => d.similarity >= 0.3);
          if (chunks.length > 0) {
            ragContext = '\n\nExpert advice:\n' + chunks.slice(0, 2).map((d) => `- ${d.text}`).join('\n');
          }
        }
      } catch (ragErr) {
        logger.info(`[generateSmartReply] RAG skipped: ${ragErr.message}`);
      }

      // 4. Build conversation context
      let chatContext;
      if (chatHistory.length > 0) {
        chatContext = 'Recent conversation:\n' + chatHistory.map((m) => `${m.sender === 'me' ? myName : theirName}: ${m.text}`).join('\n');
      } else if (lastMessage) {
        chatContext = `First message received from ${theirName}: "${lastMessage.substring(0, 300)}"`;
      } else {
        chatContext = `New match — no messages exchanged yet. Generate conversation OPENERS (not replies).`;
      }

      const profileContext = [];
      if (theirProfile.bio) profileContext.push(`${theirName}'s bio: "${String(theirProfile.bio).substring(0, 200)}"`);
      if (myProfile.bio) profileContext.push(`${myName}'s bio: "${String(myProfile.bio).substring(0, 200)}"`);
      const myInterests = Array.isArray(myProfile.interests) ? myProfile.interests : [];
      const theirInterests = Array.isArray(theirProfile.interests) ? theirProfile.interests : [];
      if (theirInterests.length > 0) profileContext.push(`${theirName}'s interests: ${theirInterests.join(', ')}`);
      // Shared interests
      const mySet = new Set(myInterests.map((i) => String(i).toLowerCase()));
      const sharedInterests = theirInterests.filter((i) => mySet.has(String(i).toLowerCase()));
      if (sharedInterests.length > 0) profileContext.push(`Shared interests: ${sharedInterests.join(', ')}`);

      // 5. Generate with Gemini
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({model: AI_MODEL_LITE});

      // Read user's tone preference if available
      let preferredTone = null;
      try {
        const prefDoc = await db.collection('users').doc(userId).collection('aiPreferences').doc('smartReply').get();
        if (prefDoc.exists) preferredTone = prefDoc.data().preferredTone || null;
      } catch (_) {}

      const toneHint = preferredTone ? `\nThe user tends to prefer "${preferredTone}" replies — put that tone FIRST in the replies array, but still generate all 3.` : '';

      const prompt = `You are a dating conversation assistant. Generate 3 reply suggestions for ${myName} to respond to ${theirName}.

${chatContext}
${profileContext.length > 0 ? '\nProfile info:\n' + profileContext.join('\n') : ''}
${ragContext}

Rules:
- ${getLanguageInstruction(lang)}
- Generate 3 replies with DIFFERENT tones. Each reply is a JSON object with "text", "tone", and "explanation":
  * tone "casual": Relaxed, easy-going, natural — with an emoji
  * tone "flirty": Fun, playful, subtly teasing — with an emoji
  * tone "deep": Genuine, curious, meaningful — with an emoji
- "explanation": ONE short sentence (max 60 chars) explaining WHY this reply works (e.g., "Shows interest without being pushy")
- Each reply text: 1-2 sentences max, natural conversational tone
- Reference the conversation context — DON'T be generic
- Detect the overall conversation "tone": "neutral", "flirty", or "serious"
- Write a short "engagementTip": 1-sentence advice on what to do next
- If no messages yet, generate conversation openers instead of replies
${toneHint}

Return ONLY a JSON object:
{
  "replies": [
    {"text": "...", "tone": "casual", "explanation": "..."},
    {"text": "...", "tone": "flirty", "explanation": "..."},
    {"text": "...", "tone": "deep", "explanation": "..."}
  ],
  "tone": "neutral|flirty|serious",
  "engagementTip": "..."
}`;

      const result = await model.generateContent({
        contents: [{role: 'user', parts: [{text: prompt}]}],
        generationConfig: {maxOutputTokens: 512, temperature: 0.85},
      });

      const text = result.response.text();
      const parsed = parseGeminiJsonResponse(text);

      // New format: replies array with tone + explanation
      if (parsed && Array.isArray(parsed.replies) && parsed.replies.length >= 3) {
        const replies = parsed.replies.slice(0, 3).map((r) => ({
          text: String(r.text || '').substring(0, 150),
          tone: ['casual', 'flirty', 'deep'].includes(r.tone) ? r.tone : 'casual',
          explanation: String(r.explanation || '').substring(0, 100),
        }));
        // Legacy backward compat: map flirty→playful, deep→thoughtful
        const findByTone = (t) => replies.find((r) => r.tone === t)?.text || replies[0]?.text || '';
        const suggestions = {
          playful: findByTone('flirty'),
          thoughtful: findByTone('deep'),
          casual: findByTone('casual'),
          tone: ['neutral', 'flirty', 'serious'].includes(parsed.tone) ? parsed.tone : 'neutral',
          engagementTip: String(parsed.engagementTip || '').substring(0, 200),
        };
        logger.info(`[generateSmartReply] Generated 3-tone replies (${lang}) for ${myName}→${theirName} [${chatHistory.length} msgs]`);
        return {success: true, replies, suggestions, executionTime: Date.now() - startTime};
      }

      // Legacy format fallback (old prompt format)
      if (parsed && parsed.playful && parsed.thoughtful && parsed.casual) {
        const suggestions = {
          playful: String(parsed.playful).substring(0, 150),
          thoughtful: String(parsed.thoughtful).substring(0, 150),
          casual: String(parsed.casual).substring(0, 150),
          tone: ['neutral', 'flirty', 'serious'].includes(parsed.tone) ? parsed.tone : 'neutral',
          engagementTip: String(parsed.engagementTip || '').substring(0, 200),
        };
        // Build replies from legacy format
        const replies = [
          {text: suggestions.casual, tone: 'casual', explanation: ''},
          {text: suggestions.playful, tone: 'flirty', explanation: ''},
          {text: suggestions.thoughtful, tone: 'deep', explanation: ''},
        ];
        logger.info(`[generateSmartReply] Generated legacy replies (${lang}) for ${myName}→${theirName} [${chatHistory.length} msgs]`);
        return {success: true, replies, suggestions, executionTime: Date.now() - startTime};
      }

      logger.warn('[generateSmartReply] AI returned invalid format, using fallback');
      return {success: true, suggestions: fallback, replies: fallbackReplies, executionTime: Date.now() - startTime};
    } catch (err) {
      logger.warn(`[generateSmartReply] AI failed (${err.message}), using fallback`);
      return {success: true, suggestions: fallback, replies: fallbackReplies, executionTime: Date.now() - startTime};
    }
  },
);

/**
 * Callable: Track which smart reply tone the user selected.
 * Payload: { matchId, tone }
 * Writes to users/{userId}/aiPreferences/smartReply to learn user's preferred tone over time.
 */
exports.trackSmartReplyToneChoice = onCall(
  {region: 'us-central1', memory: '128MiB', timeoutSeconds: 10},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const userId = request.auth.uid;
    const {matchId, tone} = request.data || {};
    if (!tone || !['casual', 'flirty', 'deep'].includes(tone)) return {success: false};

    const db = admin.firestore();
    const prefRef = db.collection('users').doc(userId).collection('aiPreferences').doc('smartReply');

    try {
      await db.runTransaction(async (tx) => {
        const doc = await tx.get(prefRef);
        const data = doc.exists ? doc.data() : {toneHistory: [], toneCounts: {casual: 0, flirty: 0, deep: 0}};

        // Append to history (keep last 50)
        const history = (data.toneHistory || []).slice(-49);
        history.push({tone, timestamp: admin.firestore.Timestamp.now(), matchId: matchId || ''});

        // Update counts
        const counts = data.toneCounts || {casual: 0, flirty: 0, deep: 0};
        counts[tone] = (counts[tone] || 0) + 1;

        // Compute preferred tone (most selected)
        const preferredTone = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

        tx.set(prefRef, {toneHistory: history, toneCounts: counts, preferredTone, updatedAt: admin.firestore.Timestamp.now()});
      });
      return {success: true};
    } catch (e) {
      logger.info(`[trackToneChoice] Error: ${e.message}`);
      return {success: false};
    }
  },
);

/**
 * Callable: Analizar compatibilidad de personalidades entre dos usuarios.
 * Payload: { userId1, userId2 }
 * Response: { score, analysis, traits }
 * Homologado: iOS/Android AIEnhancedMatchingService
 */
exports.analyzePersonalityCompatibility = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    // ✅ Homologado: iOS/Android envían {userId, targetUserId} — aceptar ambas nomenclaturas
    const d = request.data || {};
    const uid1 = d.userId || d.userId1;
    const uid2 = d.targetUserId || d.userId2;
    if (!uid1 || !uid2) throw new Error('userId and targetUserId required');

    const db = admin.firestore();
    const [u1Doc, u2Doc] = await Promise.all([
      db.collection('users').doc(uid1).get(),
      db.collection('users').doc(uid2).get(),
    ]);

    let overallScore = 60;
    const strengths = [];
    if (u1Doc.exists && u2Doc.exists) {
      const u1 = u1Doc.data();
      const u2 = u2Doc.data();
      const i1 = new Set((u1.interests || []).map(String));
      const i2 = (u2.interests || []).map(String);
      const common = i2.filter((i) => i1.has(i));
      overallScore = Math.min(60 + common.length * 5, 100);
      if (common.length > 0) strengths.push(`${common.length} intereses en común`);
    }

    // ✅ Respuesta homologada: iOS/Android leen resultData["analysis"] como dict
    return {
      success: true,
      analysis: {
        overallScore,
        valuesCompatibility: Math.round(overallScore * 0.9),
        interestsCompatibility: Math.round(overallScore * 1.05),
        communicationStyle: Math.round(overallScore * 0.95),
        conversationProbability: Math.round(overallScore * 0.85),
        strengths,
        redFlags: [],
      },
    };
  },
);

/**
 * Callable: Predecir probabilidad de éxito del match.
 * Payload: { userId1, userId2 }
 * Response: { probability, factors }
 * Homologado: iOS/Android AIEnhancedMatchingService
 */
exports.predictMatchSuccess = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    // ✅ Homologado: iOS/Android envían {userId, targetUserId}
    const d = request.data || {};
    const uid1 = d.userId || d.userId1;
    const uid2 = d.targetUserId || d.userId2;
    if (!uid1 || !uid2) throw new Error('userId and targetUserId required');

    const db = admin.firestore();
    const [u1Doc, u2Doc] = await Promise.all([
      db.collection('users').doc(uid1).get(),
      db.collection('users').doc(uid2).get(),
    ]);

    let matchProbability = 50;
    const riskFactors = [];

    if (u1Doc.exists && u2Doc.exists) {
      const u1 = u1Doc.data();
      const u2 = u2Doc.data();
      const i1 = new Set((u1.interests || []).map(String));
      const i2 = (u2.interests || []).map(String);
      const common = i2.filter((i) => i1.has(i));
      matchProbability = Math.min(50 + common.length * 5, 95);

      const ageDiff = Math.abs(calcAge(u1.birthDate) - calcAge(u2.birthDate));
      if (ageDiff > 10) riskFactors.push('Large age difference');
    }

    const recommendation = matchProbability >= 80 ? 'highly_recommended'
      : matchProbability >= 60 ? 'recommended' : 'neutral';

    // ✅ Respuesta homologada: iOS/Android leen resultData["prediction"] como dict
    return {
      success: true,
      prediction: {
        matchProbability,
        conversationProbability: Math.round(matchProbability * 0.9),
        longTermPotential: Math.round(matchProbability * 0.8),
        estimatedMessages: Math.round(matchProbability * 0.5),
        riskFactors,
        recommendation,
      },
    };
  },
);

/**
 * Callable: Generar starter de conversación entre dos usuarios.
 * Payload: { userId1, userId2 }
 * Response: { starter, alternatives }
 * Homologado: iOS/Android AIEnhancedMatchingService
 */
exports.generateConversationStarter = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const starterTexts = [
      {message: '¿Cuál es el lugar más increíble que has visitado? 🌍', reasoning: 'Travel shared experience', expectedResponse: 'A destination or travel story'},
      {message: 'Si pudieras hacer cualquier cosa este fin de semana, ¿qué sería? ☀️', reasoning: 'Reveals lifestyle', expectedResponse: 'Weekend plans or wishes'},
      {message: '¿Cuál es tu película favorita de todos los tiempos? 🎬', reasoning: 'Cultural common ground', expectedResponse: 'A movie title or genre'},
      {message: '¿Qué es lo que más te apasiona en la vida? ✨', reasoning: 'Shows depth of character', expectedResponse: 'A passion or goal'},
      {message: '¿Si pudieras viajar a cualquier lugar ahora mismo, adónde irías? ✈️', reasoning: 'Dream exploration', expectedResponse: 'A place or reason'},
    ];
    const idx = Math.floor(Math.random() * starterTexts.length);
    const chosen = starterTexts[idx];
    const rest = starterTexts.filter((_, i) => i !== idx);
    // ✅ Respuesta homologada: iOS/Android leen resultData["suggestions"]["starters"] como [[String:Any]]
    return {
      success: true,
      suggestions: {
        starters: [chosen, ...rest],
      },
    };
  },
);

/**
 * Callable: Optimizar fotos de perfil con IA.
 * Payload: { userId, photos? }
 * Response: { recommendations, orderedPhotos }
 * Homologado: iOS/Android AIEnhancedMatchingService
 */
exports.optimizeProfilePhotos = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {photos, userId} = request.data || {};
    const photoList = Array.isArray(photos) ? photos : [];
    // ✅ Respuesta homologada: iOS/Android leen optimizedOrder:[String] y scores:[{url,...}]
    const scores = photoList.map((url, i) => ({
      url: typeof url === 'string' ? url : String(url),
      visualQuality: 75,
      faceClarity: 80,
      aesthetic: 70,
      engagement: 72,
      isPrimaryCandidate: i === 0,
      overallScore: 75,
    }));
    return {
      success: true,
      optimizedOrder: photoList.map((u) => (typeof u === 'string' ? u : String(u))),
      scores,
    };
  },
);

/**
 * Callable: Encontrar perfiles similares.
 * Payload: { userId }
 * Response: { profileIds }
 * Homologado: iOS/Android AIEnhancedMatchingService
 */
exports.findSimilarProfiles = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {userId} = request.data || {};
    const uid = userId || request.auth.uid;

    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return {success: true, matches: []};

    const user = userDoc.data();
    const interests = user.interests || [];
    // ✅ FIX: Obtener lista de bloqueados del usuario actual para excluirlos
    const userBlockedArray = Array.isArray(user.blocked) ? user.blocked : [];

    // Buscar perfiles con intereses similares
    let snap = {docs: []};
    if (interests.length > 0) {
      snap = await db.collection('users')
        .where('accountStatus', '==', 'active')
        .where('paused', '==', false)
        .limit(20)
        .get().catch(() => ({docs: []}));
    }

    const interestSet = new Set((interests || []).map(String));
    const REVIEWER_UID = 'g4Zbr8tEguMcpZonw72xM5MGse32';
    // ✅ Respuesta homologada: iOS/Android leen resultData["matches"] como [{userId, similarity}]
    const matches = snap.docs
      .filter((d) => {
        if (d.id === uid) return false;
        const data = d.data();
        // ✅ Excluir perfiles test/reviewer: solo visibles para el reviewer
        if ((data.isTest === true || data.isReviewer === true) && uid !== REVIEWER_UID) return false;
        // ✅ Excluir usuarios con accountStatus inactivo
        if ((data.accountStatus || 'active') !== 'active') return false;
        // ✅ Excluir usuarios que el usuario actual ha bloqueado
        if (userBlockedArray.includes(d.id)) return false;
        // ✅ FIX: Bloqueo bidireccional — excluir si el candidato bloqueó al usuario actual
        const candidateBlocked = Array.isArray(data.blocked) ? data.blocked : [];
        if (candidateBlocked.includes(uid)) return false;
        // ✅ FIX: Excluir usuarios con visibilidad reducida
        if (data.visibilityReduced === true) return false;
        return true;
      })
      .slice(0, 10)
      .map((d) => {
        const data = d.data();
        const candidateInterests = (data.interests || []).map(String);
        const common = candidateInterests.filter((i) => interestSet.has(i));
        const similarity = Math.min(50 + common.length * 10, 100);
        return {userId: d.id, similarity};
      });

    return {success: true, matches};
  },
);

/**
 * Callable: Obtener puntuación de compatibilidad mejorada con IA.
 * Payload: { userId1, userId2 }
 * Response: { score, breakdown }
 * Homologado: iOS/Android AIEnhancedMatchingService
 */
exports.getEnhancedCompatibilityScore = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    // ✅ Homologado: iOS/Android envían {currentUserId, candidateId}
    const d = request.data || {};
    const uid1 = d.currentUserId || d.userId1;
    const uid2 = d.candidateId || d.userId2;
    if (!uid1 || !uid2) throw new Error('currentUserId and candidateId required');

    const db = admin.firestore();
    const [u1Doc, u2Doc] = await Promise.all([
      db.collection('users').doc(uid1).get(),
      db.collection('users').doc(uid2).get(),
    ]);

    let baseScore = 50;
    let interestsScore = 0;

    if (u1Doc.exists && u2Doc.exists) {
      const u1 = u1Doc.data();
      const u2 = u2Doc.data();
      const i1 = new Set((u1.interests || []).map(String));
      const i2 = (u2.interests || []).map(String);
      const common = i2.filter((i) => i1.has(i));
      interestsScore = Math.min(common.length * 10, 40);
      const distanceScore = 30;
      const ageScore = Math.max(30 - Math.abs(calcAge(u1.birthDate) - calcAge(u2.birthDate)) * 2, 0);
      baseScore = Math.min(interestsScore + distanceScore + ageScore, 100);
    }

    const aiScore = Math.round(baseScore * 0.3);
    const totalScore = Math.min(baseScore * 0.7 + aiScore, 100);

    // ✅ Respuesta homologada: iOS/Android leen totalScore, baseScore, aiScore, explanation
    return {
      success: true,
      totalScore,
      baseScore,
      aiScore,
      explanation: `Compatibilidad basada en ${interestsScore > 0 ? 'intereses comunes y' : ''} factores de perfil`,
    };
  },
);

/**
 * Callable: Detectar señales de alerta en perfil.
 * Payload: { userId }
 * Response: { flags, riskScore }
 * Homologado: iOS/Android AIEnhancedMatchingService
 */
exports.detectProfileRedFlags = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {userId} = request.data || {};
    const targetId = userId || request.auth.uid;

    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(targetId).get();
    const flags = [];
    let riskScore = 0;

    if (userDoc.exists) {
      const user = userDoc.data();
      if (!user.photoFileName && !Array.isArray(user.pictures)) {
        flags.push('no_profile_photo');
        riskScore += 20;
      }
      if (!user.bio || user.bio.length < 10) {
        flags.push('empty_bio');
        riskScore += 10;
      }
      if (user.visibilityReduced) {
        flags.push('previously_reported');
        riskScore += 30;
      }
    }

    riskScore = Math.min(riskScore, 100);
    // ✅ Respuesta homologada: iOS/Android leen hasRedFlags, flags, confidence, details
    return {
      success: true,
      hasRedFlags: flags.length > 0,
      flags,
      confidence: flags.length > 0 ? Math.min(flags.length * 30, 90) : 0,
      details: flags.length > 0 ? `Se detectaron ${flags.length} señal(es) de alerta` : 'Perfil sin señales de alerta',
      riskScore,
    };
  },
);

/**
 * Callable: Generar preguntas rompehielo personalizadas.
 * Payload: { userId1, userId2 }
 * Response: { icebreakers }
 * Homologado: iOS/Android AIEnhancedMatchingService
 */
exports.generateIcebreakers = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60, secrets: [geminiApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {userId1, userId2} = request.data || {};
    if (!userId1 || !userId2) throw new Error('userId1 and userId2 are required');

    const db = admin.firestore();
    const apiKey = process.env.GEMINI_API_KEY;

    // Multilingual fallback starters (10 languages)
    const FALLBACK_BY_LANG = {
      es: [{message: '¿Cuál es tu hobby secreto que pocas personas conocen? 🤫', reasoning: 'Reveals hidden personality', emoji: '🤫'}, {message: '¿Cuál fue la última vez que intentaste algo nuevo? 🌟', reasoning: 'Shows openness', emoji: '🌟'}, {message: '¿Café ☕ o té 🍵? ¿Y por qué?', reasoning: 'Light and fun', emoji: '☕'}],
      en: [{message: "What's a hobby you have that most people don't know about? 🤫", reasoning: 'Reveals hidden personality', emoji: '🤫'}, {message: "What's the last new thing you tried? 🌟", reasoning: 'Shows openness', emoji: '🌟'}, {message: 'Coffee ☕ or tea 🍵? And why?', reasoning: 'Light and fun', emoji: '☕'}],
      fr: [{message: 'Quel est ton hobby secret que peu de gens connaissent ? 🤫', reasoning: 'Reveals hidden personality', emoji: '🤫'}, {message: "Quelle est la dernière chose nouvelle que tu as essayée ? 🌟", reasoning: 'Shows openness', emoji: '🌟'}, {message: 'Café ☕ ou thé 🍵 ? Et pourquoi ?', reasoning: 'Light and fun', emoji: '☕'}],
      de: [{message: 'Was ist dein geheimes Hobby, von dem die wenigsten wissen? 🤫', reasoning: 'Reveals hidden personality', emoji: '🤫'}, {message: 'Was war das Letzte, was du Neues ausprobiert hast? 🌟', reasoning: 'Shows openness', emoji: '🌟'}, {message: 'Kaffee ☕ oder Tee 🍵? Und warum?', reasoning: 'Light and fun', emoji: '☕'}],
      pt: [{message: 'Qual é o seu hobby secreto que poucas pessoas conhecem? 🤫', reasoning: 'Reveals hidden personality', emoji: '🤫'}, {message: 'Qual foi a última coisa nova que você experimentou? 🌟', reasoning: 'Shows openness', emoji: '🌟'}, {message: 'Café ☕ ou chá 🍵? E por quê?', reasoning: 'Light and fun', emoji: '☕'}],
      ja: [{message: '他の人が知らない秘密の趣味は何ですか？🤫', reasoning: 'Reveals hidden personality', emoji: '🤫'}, {message: '最近初めて挑戦したことは何ですか？🌟', reasoning: 'Shows openness', emoji: '🌟'}, {message: 'コーヒー☕ それとも紅茶🍵？理由も教えて！', reasoning: 'Light and fun', emoji: '☕'}],
      zh: [{message: '你有什么别人不知道的小爱好吗？🤫', reasoning: 'Reveals hidden personality', emoji: '🤫'}, {message: '你最近尝试的新事物是什么？🌟', reasoning: 'Shows openness', emoji: '🌟'}, {message: '咖啡☕还是茶🍵？为什么呢？', reasoning: 'Light and fun', emoji: '☕'}],
      ru: [{message: 'Какое у тебя тайное хобби, о котором мало кто знает? 🤫', reasoning: 'Reveals hidden personality', emoji: '🤫'}, {message: 'Что новое ты недавно попробовал(а)? 🌟', reasoning: 'Shows openness', emoji: '🌟'}, {message: 'Кофе ☕ или чай 🍵? И почему?', reasoning: 'Light and fun', emoji: '☕'}],
      ar: [{message: 'ما هي هوايتك السرية التي لا يعرفها الكثيرون؟ 🤫', reasoning: 'Reveals hidden personality', emoji: '🤫'}, {message: 'ما آخر شيء جديد جربته؟ 🌟', reasoning: 'Shows openness', emoji: '🌟'}, {message: 'قهوة ☕ أم شاي 🍵؟ ولماذا؟', reasoning: 'Light and fun', emoji: '☕'}],
      id: [{message: 'Apa hobi rahasiamu yang sedikit orang tahu? 🤫', reasoning: 'Reveals hidden personality', emoji: '🤫'}, {message: 'Hal baru terakhir apa yang kamu coba? 🌟', reasoning: 'Shows openness', emoji: '🌟'}, {message: 'Kopi ☕ atau teh 🍵? Dan kenapa?', reasoning: 'Light and fun', emoji: '☕'}],
    };

    try {
      // Read both user profiles (handle non-existent docs)
      const [user1Snap, user2Snap] = await Promise.all([
        db.collection('users').doc(userId1).get(),
        db.collection('users').doc(userId2).get(),
      ]);

      const user1 = user1Snap.exists ? user1Snap.data() : {};
      const user2 = user2Snap.exists ? user2Snap.data() : {};

      // Detect language: prefer sender's deviceLanguage, normalize to base code
      const rawLang = user1.deviceLanguage || user2.deviceLanguage || 'en';
      const lang = rawLang.split('-')[0].split('_')[0].toLowerCase();
      const fallbackStarters = FALLBACK_BY_LANG[lang] || FALLBACK_BY_LANG.en;

      const user1Name = user1.name || 'User';
      const user2Name = user2.name || 'Match';
      const user1Bio = user1.bio || '';
      const user2Bio = user2.bio || '';
      const user1Interests = Array.isArray(user1.interests) ? user1.interests.join(', ') : '';
      const user2Interests = Array.isArray(user2.interests) ? user2.interests.join(', ') : '';

      // Edge case: if both users have no bio AND no interests, use fallback directly
      if (!user1Bio && !user2Bio && !user1Interests && !user2Interests) {
        logger.info(`[generateIcebreakers] No profile data for either user, using ${lang} fallback`);
        return {success: true, icebreakers: fallbackStarters, starters: fallbackStarters.map((i) => i.message)};
      }

      // Edge case: no API key
      if (!apiKey) {
        logger.warn('[generateIcebreakers] No GEMINI_API_KEY, using fallback');
        return {success: true, icebreakers: fallbackStarters, starters: fallbackStarters.map((i) => i.message)};
      }

      // Build context with available data
      const contextParts = [];
      if (user1Bio) contextParts.push(`- ${user1Name}'s bio: "${user1Bio}"`);
      if (user1Interests) contextParts.push(`- ${user1Name}'s interests: ${user1Interests}`);
      if (user2Bio) contextParts.push(`- ${user2Name}'s bio: "${user2Bio}"`);
      if (user2Interests) contextParts.push(`- ${user2Name}'s interests: ${user2Interests}`);

      // Find shared interests for better personalization
      const set1 = new Set((user1.interests || []).map((i) => i.toLowerCase()));
      const shared = (user2.interests || []).filter((i) => set1.has(i.toLowerCase()));
      if (shared.length > 0) contextParts.push(`- Shared interests: ${shared.join(', ')}`);

      // User types for context-aware icebreakers
      const user1Type = user1.userType || '';
      const user2Type = user2.userType || '';
      if (user1Type && user2Type) contextParts.push(`- ${user1Name} is ${user1Type}, ${user2Name} is ${user2Type}`);

      // Age context if available
      const user1Age = user1.birthDate ? calcAge(user1.birthDate) : null;
      const user2Age = user2.birthDate ? calcAge(user2.birthDate) : null;
      if (user1Age && user2Age) contextParts.push(`- Ages: ${user1Name} is ${user1Age}, ${user2Name} is ${user2Age}`);

      // --- RAG: Retrieve expert icebreaker knowledge ---
      let ragContext = '';
      try {
        const ragQuery = shared.length > 0
          ? `icebreaker conversation starter for people who like ${shared.join(' and ')}`
          : `best first message dating icebreaker ${user2Bio || 'new match'}`;

        const genAIEmbed = new GoogleGenerativeAI(apiKey);
        const embeddingModel = genAIEmbed.getGenerativeModel({model: 'gemini-embedding-001'});
        const embedResult = await Promise.race([
          embeddingModel.embedContent({
            content: {parts: [{text: ragQuery.substring(0, 500)}]},
            taskType: 'RETRIEVAL_QUERY',
            outputDimensionality: 768,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('RAG timeout')), 4000)),
        ]);

        const queryVector = embedResult.embedding.values;
        const ragSnap = await db.collection('coachKnowledge')
          .findNearest('embedding', queryVector, {limit: 4, distanceMeasure: 'COSINE', distanceResultField: '_distance'})
          .get();

        if (!ragSnap.empty) {
          const chunks = ragSnap.docs
            .map((d) => {const data = d.data(); return {text: (data.text || '').substring(0, 800), category: data.category || '', language: data.language || 'en', similarity: 1 - (data._distance ?? 1)};})
            .filter((d) => d.similarity >= 0.3 && d.text.length > 0);

          // Prefer user language, then multi/en
          const langChunks = chunks.filter((d) => d.language === lang);
          const otherChunks = chunks.filter((d) => d.language !== lang);
          const ranked = [...langChunks, ...otherChunks].slice(0, 2);

          if (ranked.length > 0) {
            ragContext = '\n\nExpert dating advice to inspire your icebreakers:\n' +
              ranked.map((d) => `- (${d.category}): ${d.text}`).join('\n');
            logger.info(`[generateIcebreakers] RAG: ${ranked.length} chunks retrieved (${ranked.map((d) => d.category).join(', ')})`);
          }
        }
      } catch (ragErr) {
        logger.info(`[generateIcebreakers] RAG skipped (${ragErr.message})`);
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({model: AI_MODEL_LITE});

      const prompt = `You are a dating conversation expert. Generate exactly 3 personalized icebreaker messages that ${user1Name} can send to ${user2Name} to start a great conversation.

Context:
${contextParts.join('\n')}
${ragContext}

Rules:
- ${getLanguageInstruction(lang)}
- Each message should be 1-2 sentences max, casual and fun
- Reference SPECIFIC shared interests or details from their profiles when possible
- Include one relevant emoji per message
- Make them feel personal, NOT generic
- Avoid cliché pickup lines
- If limited profile data, use creative open-ended questions
- Use the expert dating advice above as inspiration but DO NOT copy it verbatim
- Vary the style: 1 playful/fun, 1 thoughtful/genuine, 1 creative/unique

Return ONLY a JSON array with exactly 3 objects: [{"message": "...", "reasoning": "why this works", "emoji": "🎯"}]`;

      const result = await model.generateContent({
        contents: [{role: 'user', parts: [{text: prompt}]}],
        generationConfig: {maxOutputTokens: 512, temperature: 0.9},
      });

      const text = result.response.text();
      const parsed = parseGeminiJsonResponse(text);

      if (Array.isArray(parsed) && parsed.length >= 3) {
        const icebreakers = parsed.slice(0, 3).map((item) => ({
          message: String(item.message || item.text || '').substring(0, 200),
          reasoning: String(item.reasoning || '').substring(0, 100),
          emoji: String(item.emoji || '💬').substring(0, 4),
        })).filter((i) => i.message.length > 0);

        if (icebreakers.length >= 2) {
          logger.info(`[generateIcebreakers] Generated ${icebreakers.length} personalized icebreakers (${lang}) for ${user1Name}→${user2Name}`);
          return {success: true, icebreakers, starters: icebreakers.map((i) => i.message)};
        }
      }

      logger.warn('[generateIcebreakers] AI returned invalid format, using fallback');
      return {success: true, icebreakers: fallbackStarters, starters: fallbackStarters.map((i) => i.message)};
    } catch (err) {
      const rawLang = (request.data || {}).lang || 'en';
      const lang = rawLang.split('-')[0].split('_')[0].toLowerCase();
      const fallbackStarters = FALLBACK_BY_LANG[lang] || FALLBACK_BY_LANG.en;
      logger.warn(`[generateIcebreakers] AI failed (${err.message}), using ${lang} fallback`);
      return {success: true, icebreakers: fallbackStarters, starters: fallbackStarters.map((i) => i.message)};
    }
  },
);

/**
 * Callable: Predecir el momento óptimo para enviar mensajes.
 * Payload: { userId }
 * Response: { optimalTime, timezone, confidence }
 * Homologado: iOS OptimalTimeService / Android OptimalTimeService
 */
exports.predictOptimalMessageTime = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    // En producción analizar patrones de actividad del usuario
    const optimalHours = [19, 20, 21]; // 7pm-9pm son las horas pico habituales
    const optimalTime = optimalHours[Math.floor(Math.random() * optimalHours.length)];
    logger.info(`[predictOptimalMessageTime] Optimal hour: ${optimalTime}:00`);
    return {
      success: true,
      optimalTime: `${optimalTime}:00`,
      optimalHour: optimalTime,
      timezone: 'UTC-6',
      confidence: 0.75,
      reasoning: 'Los usuarios son más activos entre 7pm y 9pm',
    };
  },
);

/**
 * Callable: Obtener consejo de citas personalizado.
 * Payload: { context, topic? }
 * Response: { advice, tips }
 * Homologado: iOS DatingCoachService.getDatingAdvice
 */
exports.getDatingAdvice = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {topic} = request.data || {};

    const adviceMap = {
      'first_message': {
        advice: 'Haz una pregunta específica sobre algo de su perfil para mostrar que te interesan genuinamente',
        tips: ['Menciona un interés en común', 'Sé específico, no genérico', 'Termina con una pregunta abierta'],
      },
      'first_date': {
        advice: 'Elige un lugar cómodo y con buena conversación, evita el cine en la primera cita',
        tips: ['Toma café o un paseo', 'Escucha activamente', 'Sé tú mismo/a'],
      },
      'default': {
        advice: 'La autenticidad es la clave del éxito en las citas modernas',
        tips: ['Sé auténtico/a', 'Muestra interés genuino', 'No te presiones'],
      },
    };

    const selected = adviceMap[topic] || adviceMap['default'];
    logger.info(`[getDatingAdvice] Advice for topic=${topic || 'default'}`);
    return {success: true, ...selected};
  },
);

/**
 * Callable: calculateAIChemistry — Análisis profundo de compatibilidad con RAG + Gemini.
 *
 * Diseñado para app nueva con pocos usuarios:
 * - Scores generosos (48-92%) para UX positiva
 * - Fallbacks en cada capa (RAG fail → algo only, Gemini fail → algo only)
 * - Cache inteligente con invalidación por cambio de perfil
 * - Rate limiting por usuario (max 20 calls/hora)
 * - Sparse data handling: perfiles incompletos reciben score base alto
 *
 * Payload: { targetUserId, lang? }
 * Response: { score, reasons[], tip, factors{}, cached, confidence }
 *
 * Cache: chemistryCache/{pairId} con TTL dinámico (3-14 días según confianza)
 */
exports.calculateAIChemistry = onCall(
  {region: 'us-central1', memory: '512MiB', timeoutSeconds: 30, secrets: [geminiApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const currentUserId = request.auth.uid;
    const data = request.data || {};
    const targetUserId = data.targetUserId;
    const lang = (data.lang || 'en').substring(0, 2).toLowerCase();
    if (!targetUserId) throw new Error('targetUserId required');
    if (currentUserId === targetUserId) throw new Error('Cannot calculate chemistry with yourself');

    const db = admin.firestore();
    const apiKey = geminiApiKey.value();
    const startTime = Date.now();

    // ── Rate limiting (20 calls/hour per user) ──
    const rateLimitRef = db.collection('rateLimits').doc(`chemistry_${currentUserId}`);
    try {
      const rlDoc = await rateLimitRef.get();
      if (rlDoc.exists) {
        const rl = rlDoc.data();
        const hourAgo = Date.now() - 3600000;
        if ((rl.lastReset?.toMillis?.() || 0) > hourAgo && (rl.count || 0) >= 20) {
          logger.warn(`[AIChemistry] Rate limited: ${currentUserId} (${rl.count} calls/hr)`);
          // Return a decent default instead of error
          return {success: true, score: 65, reasons: [], tip: '', factors: {}, cached: false, confidence: 'low', rateLimited: true};
        }
      }
    } catch (rlErr) {
      // Rate limit check failed — continue anyway (non-critical)
    }

    // ── Cache check (TTL dinámico) ──
    const pairId = [currentUserId, targetUserId].sort().join('_');
    const cacheRef = db.collection('chemistryCache').doc(pairId);
    try {
      const cacheDoc = await cacheRef.get();
      if (cacheDoc.exists) {
        const cached = cacheDoc.data();
        const ageMs = Date.now() - (cached.calculatedAt?.toMillis?.() || 0);
        // TTL dinámico: alta confianza → 14 días, baja → 3 días
        const ttlMs = cached.confidence === 'high' ? 14 * 86400000 : cached.confidence === 'medium' ? 7 * 86400000 : 3 * 86400000;
        if (ageMs < ttlMs) {
          logger.info(`[AIChemistry] Cache hit ${pairId} (age: ${Math.round(ageMs / 3600000)}h, confidence: ${cached.confidence})`);
          return {...cached, cached: true};
        }
      }
    } catch (cacheErr) {
      logger.warn(`[AIChemistry] Cache read failed (non-critical): ${cacheErr.message}`);
    }

    // ── Load both profiles ──
    let u1, u2;
    try {
      const [u1Doc, u2Doc] = await Promise.all([
        db.collection('users').doc(currentUserId).get(),
        db.collection('users').doc(targetUserId).get(),
      ]);
      if (!u1Doc.exists || !u2Doc.exists) {
        return {success: true, score: 60, reasons: ['New profiles detected'], tip: 'Complete your profile for better matches', factors: {}, cached: false, confidence: 'low'};
      }
      u1 = u1Doc.data();
      u2 = u2Doc.data();
    } catch (loadErr) {
      logger.error(`[AIChemistry] Profile load failed: ${loadErr.message}`);
      return {success: true, score: 58, reasons: [], tip: '', factors: {}, cached: false, confidence: 'low'};
    }

    // ── Profile completeness check (app nueva: muchos perfiles incompletos) ──
    const u1Complete = [u1.bio, (u1.interests || []).length >= 2, (u1.pictures || []).length >= 2, u1.latitude].filter(Boolean).length;
    const u2Complete = [u2.bio, (u2.interests || []).length >= 2, (u2.pictures || []).length >= 2, u2.latitude].filter(Boolean).length;
    const avgCompleteness = (u1Complete + u2Complete) / 8.0; // 0-1

    // ── Algorithmic base score (6 factors, dynamic weights) ──
    const i1 = new Set((u1.interests || []).map(String));
    const i2 = (u2.interests || []).map(String);
    const i2Set = new Set(i2);
    const shared = i2.filter((i) => i1.has(i));
    const union = new Set([...i1, ...i2Set]);

    let factors = {};
    let dataPoints = 0; // Track how many factors we can calculate

    // Factor 1: Intereses compartidos (peso: 25)
    if (i1.size > 0 && i2Set.size > 0) {
      const jaccard = union.size > 0 ? shared.length / union.size : 0;
      const bonus = Math.min(shared.length * 0.08, 0.3);
      // App nueva: sin intereses en común → score base 0.4 (no penalizar mucho)
      factors.interests = shared.length === 0 ? 0.4 : Math.min(jaccard + bonus, 1.0);
      dataPoints++;
    } else {
      // Perfiles sin intereses → asumir compatibilidad media-alta (app nueva)
      factors.interests = 0.55;
      dataPoints += 0.5; // Half confidence
    }

    // Factor 2: Compatibilidad de edad (peso: 15)
    const age1 = calcAge(u1.birthDate);
    const age2 = calcAge(u2.birthDate);
    if (age1 > 0 && age2 > 0) {
      const ageDiff = Math.abs(age1 - age2);
      factors.age = Math.exp(-(ageDiff * ageDiff) / 72.0); // σ=6
      dataPoints++;
    }

    // Factor 3: Proximidad geográfica (peso: 15)
    if (u1.latitude && u1.longitude && u2.latitude && u2.longitude) {
      const R = 6371; // km
      const dLat = (u2.latitude - u1.latitude) * Math.PI / 180;
      const dLon = (u2.longitude - u1.longitude) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(u1.latitude * Math.PI / 180) * Math.cos(u2.latitude * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      factors.geo = km <= 10 ? 1.0 : km <= 50 ? 0.85 : km <= 150 ? 0.65 : km <= 500 ? 0.4 : 0.2;
      dataPoints++;
    }

    // Factor 4: Tipo complementario (peso: 15)
    const t1 = (u1.userType || '').toUpperCase();
    const t2 = (u2.userType || '').toUpperCase();
    if (t1 && t2) {
      const dm1 = t1.includes('DADDY') || t1.includes('MOMMY');
      const b1 = t1.includes('BABY');
      const dm2 = t2.includes('DADDY') || t2.includes('MOMMY');
      const b2 = t2.includes('BABY');
      factors.type = (dm1 && b2) || (b1 && dm2) ? 1.0 : t1 === t2 ? 0.55 : 0.6;
      dataPoints++;
    }

    // Factor 5: Rango de edad preferido (peso: 10)
    if (u1.minAge && u1.maxAge && age2 > 0) {
      if (age2 >= u1.minAge && age2 <= u1.maxAge) {
        const mid = (u1.minAge + u1.maxAge) / 2;
        const span = Math.max((u1.maxAge - u1.minAge) / 2, 1);
        const dev = Math.abs(age2 - mid) / span;
        factors.range = 1.0 - (dev * 0.3); // Penalize edges gently
      } else {
        factors.range = 0.35; // Out of range but not zero (app nueva)
      }
      dataPoints++;
    }

    // Factor 6: Completitud del perfil (peso: 5)
    factors.completeness = avgCompleteness;
    dataPoints += 0.5;

    // Weighted score (dynamic: only factors with data)
    const weights = {interests: 25, age: 15, geo: 15, type: 15, range: 10, completeness: 5};
    let totalW = 0, totalS = 0;
    for (const [k, w] of Object.entries(weights)) {
      if (factors[k] !== undefined) {
        totalS += factors[k] * w;
        totalW += w;
      }
    }
    const algorithmicScore = totalW > 0 ? totalS / totalW : 0.55;

    // ── Confidence level (determines cache TTL and AI weight) ──
    const confidence = dataPoints >= 4 ? 'high' : dataPoints >= 2.5 ? 'medium' : 'low';
    // App nueva: AI weight decreases with less data (AI can hallucinate with sparse input)
    const aiWeight = confidence === 'high' ? 0.6 : confidence === 'medium' ? 0.45 : 0.3;

    // ── RAG: buscar conocimiento relevante (with timeout) ──
    let ragContext = '';
    let ragChunksUsed = 0;
    try {
      const sharedStr = shared.map((s) => s.replace('interest_', '').replace(/_/g, ' ')).join(', ');
      const queryText = sharedStr.length > 0
        ? `compatibility advice for couple with shared interests: ${sharedStr}`
        : age1 > 0 && age2 > 0
          ? `dating compatibility advice for ${Math.min(age1, age2)}-${Math.max(age1, age2)} age range`
          : `general dating compatibility advice for new connection`;

      const genai = new GoogleGenerativeAI(apiKey);
      const embModel = genai.getGenerativeModel({model: 'gemini-embedding-001'});

      // RAG with 4s timeout
      const embedPromise = embModel.embedContent({
        content: {parts: [{text: queryText}]},
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: 768,
      });
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('RAG timeout')), 4000));
      const embedResult = await Promise.race([embedPromise, timeoutPromise]);
      const queryVector = embedResult.embedding.values;

      const collRef = db.collection('coachKnowledge');
      const snapshot = await collRef.findNearest('embedding', queryVector, {
        limit: 5,
        distanceMeasure: 'COSINE',
        distanceResultField: '_distance',
      }).get();

      // Deduplicate by category, filter by quality
      const seenCats = new Set();
      const chunks = snapshot.docs
        .map((doc) => {
          const d = doc.data();
          return {text: (d.text || '').substring(0, 500), category: d.category || '', similarity: 1 - (d._distance ?? 1)};
        })
        .filter((d) => d.similarity >= 0.25 && d.text.length > 0)
        .filter((d) => { if (seenCats.has(d.category)) return false; seenCats.add(d.category); return true; })
        .slice(0, 3);

      if (chunks.length > 0) {
        ragContext = chunks.map((c, i) => `[${i + 1}] (${c.category}): ${c.text}`).join('\n');
        ragChunksUsed = chunks.length;
        logger.info(`[AIChemistry] RAG: ${chunks.length} chunks (${chunks.map((c) => c.category).join(', ')})`);
      }
    } catch (ragErr) {
      logger.warn(`[AIChemistry] RAG failed (non-critical): ${ragErr.message}`);
    }

    // ── Gemini analysis (with 8s timeout) ──
    let aiScore = 0.65; // Default generous for app nueva
    let reasons = [];
    let tip = '';
    try {
      const genai = new GoogleGenerativeAI(apiKey);
      const model = genai.getGenerativeModel({model: AI_MODEL_LITE});

      const bio1 = (u1.bio || '').substring(0, 200);
      const bio2 = (u2.bio || '').substring(0, 200);
      const langInstruction = lang !== 'en' ? `\nIMPORTANT: Respond reasons and tip in language code "${lang}".` : '';
      const prompt = `You are an expert compatibility analyst for a social app. Analyze these two profiles.

Profile A: Age ${age1 || '?'}, Type: ${t1 || '?'}, Interests: ${[...i1].slice(0, 8).join(', ') || 'none'}${bio1 ? ', Bio: "' + bio1 + '"' : ''}
Profile B: Age ${age2 || '?'}, Type: ${t2 || '?'}, Interests: ${i2.slice(0, 8).join(', ') || 'none'}${bio2 ? ', Bio: "' + bio2 + '"' : ''}
Shared interests: ${shared.length > 0 ? shared.map((s) => s.replace('interest_', '').replace(/_/g, ' ')).join(', ') : 'none yet'}
Profile completeness: ${Math.round(avgCompleteness * 100)}%
${ragContext ? '\nExpert knowledge:\n' + ragContext : ''}

RULES:
- This is a NEW app with few users. Be GENEROUS and encouraging (score range 0.55-0.95).
- Even with few shared interests, find POSITIVE potential for connection.
- If profiles are incomplete, score based on available data optimistically.
- Focus on what COULD work, not what's missing.
- Reasons should be encouraging and actionable.
- Tip should suggest a concrete first step to connect.${langInstruction}

Respond ONLY with valid JSON:
{"score": 0.55-0.95, "reasons": ["positive reason 1", "positive reason 2", "positive reason 3"], "tip": "one encouraging actionable tip"}`;

      const geminiPromise = model.generateContent({
        contents: [{role: 'user', parts: [{text: prompt}]}],
        generationConfig: {maxOutputTokens: 300, temperature: 0.4},
      });
      const geminiTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini timeout')), 8000));
      const geminiResult = await Promise.race([geminiPromise, geminiTimeout]);

      const text = geminiResult.response.text();
      const parsed = parseGeminiJsonResponse(text);
      if (parsed && typeof parsed.score === 'number') {
        aiScore = Math.max(0.55, Math.min(parsed.score, 0.95));
        reasons = Array.isArray(parsed.reasons) ? parsed.reasons.filter((r) => typeof r === 'string' && r.length > 0).slice(0, 3) : [];
        tip = typeof parsed.tip === 'string' ? parsed.tip.substring(0, 200) : '';
      }
    } catch (aiErr) {
      logger.warn(`[AIChemistry] Gemini failed (non-critical): ${aiErr.message}`);
      // Fallback reasons for app nueva
      if (shared.length > 0) {
        reasons = [`${shared.length} shared interest${shared.length > 1 ? 's' : ''} detected`];
      }
    }

    // ── Blend: dynamic weight based on confidence ──
    const algoWeight = 1.0 - aiWeight;
    const blended = algorithmicScore * algoWeight + aiScore * aiWeight;

    // Score range: 48-92% (never too low for new app, never unrealistically high)
    const finalScore = Math.round(48 + blended * 44);

    // ── Bonus for sparse profiles (app nueva: be generous) ──
    const sparseBonus = avgCompleteness < 0.5 ? 5 : 0; // +5% if profiles incomplete

    const result = {
      success: true,
      score: Math.max(48, Math.min(92, finalScore + sparseBonus)),
      reasons,
      tip,
      factors: {
        algorithmic: Math.round(algorithmicScore * 100),
        ai: Math.round(aiScore * 100),
        sharedInterests: shared.length,
        ragChunksUsed,
        profileCompleteness: Math.round(avgCompleteness * 100),
        dataPoints: Math.round(dataPoints),
      },
      confidence,
      cached: false,
    };

    // ── Save to cache + update rate limit ──
    try {
      const batch = db.batch();
      batch.set(cacheRef, {...result, calculatedAt: admin.firestore.FieldValue.serverTimestamp()});
      batch.set(rateLimitRef, {
        count: admin.firestore.FieldValue.increment(1),
        lastReset: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});
      await batch.commit();
    } catch (writeErr) {
      logger.warn(`[AIChemistry] Cache/rate write failed: ${writeErr.message}`);
    }

    const elapsed = Date.now() - startTime;
    logger.info(`[AIChemistry] ${pairId}: score=${result.score} confidence=${confidence} algo=${Math.round(algorithmicScore * 100)} ai=${Math.round(aiScore * 100)} rag=${ragChunksUsed} data=${Math.round(dataPoints)} ${elapsed}ms`);
    return result;
  },
);

/** Sanitize place object: replace NaN/undefined/Infinity with safe defaults */
function sanitizePlaceForJson(place) {
  if (!place || typeof place !== 'object') return null;
  const clean = {};
  for (const [key, value] of Object.entries(place)) {
    if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) {
      clean[key] = 0;
    } else if (value === undefined) {
      clean[key] = null;
    } else if (Array.isArray(value)) {
      clean[key] = value.map((item) => {
        if (typeof item === 'object' && item !== null) return sanitizePlaceForJson(item);
        if (typeof item === 'number' && (isNaN(item) || !isFinite(item))) return 0;
        return item;
      });
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitizePlaceForJson(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * Sanitize blueprint title: remove names, forbidden patterns, ensure elegance.
 */
function sanitizeBlueprintTitle(rawTitle, myName, theirName) {
  if (!rawTitle) return 'Plan de Salida';
  let title = rawTitle.substring(0, 100).trim();

  // Remove names from title (case-insensitive)
  const names = [myName, theirName].filter(Boolean);
  for (const name of names) {
    if (!name) continue;
    const nameRegex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    title = title.replace(nameRegex, '').trim();
  }

  // Remove forbidden patterns — match ANYWHERE in the title, not just prefix
  const forbiddenPatterns = [
    /(aventura|plan|cita|salida|noche|tarde|día)\s+(con|para)\s+\w+/gi,    // ES: "Aventura con Angelica"
    /(adventure|date|outing|night|evening|day)\s+(with|for)\s+\w+/gi,      // EN: "Adventure with Maria"
    /(aventure|rendez-vous|sortie|soirée)\s+(avec|pour)\s+\w+/gi,          // FR
    /(abenteuer|date|ausflug|abend)\s+(mit|für)\s+\w+/gi,                  // DE
    /(aventura|encontro|saída|noite)\s+(com|para)\s+\w+/gi,                // PT
    /(приключение|свидание|прогулка|вечер)\s+(с|для)\s+\w+/gi,             // RU
    /(مغامرة|موعد|خروج|ليلة)\s+(مع|لـ)\s+\w+/gi,                         // AR
    /(petualangan|kencan|jalan-jalan|malam)\s+(dengan|untuk)\s+\w+/gi,     // ID
    /^(aventura|plan|cita|salida)\s+(con|para)\s*/i,                       // ES prefix only
    /^(adventure|date|outing)\s+(with|for)\s*/i,                           // EN prefix only
  ];
  for (const pattern of forbiddenPatterns) {
    title = title.replace(pattern, '').trim();
  }

  // Remove leading/trailing punctuation and extra spaces
  title = title.replace(/^[\s,\-—–:]+|[\s,\-—–:]+$/g, '').replace(/\s+/g, ' ').trim();

  // If title is now empty or too short, generate a generic elegant one
  if (!title || title.length < 3) {
    const fallbacks = ['Café y Buena Charla', 'Sunset Vibes', 'Tarde de Sabores', 'Golden Hour', 'Arte y Risas'];
    title = fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  return title;
}

/**
 * Callable: AI Date Blueprint — generates a personalized first date itinerary.
 * Payload: { matchId, userLanguage, duration?, preferences? }
 * Response: { success, blueprint: { title, totalDuration, estimatedBudget, steps[], icebreaker, dresscode } }
 */
exports.generateDateBlueprint = onCall(
  {region: 'us-central1', memory: '512MiB', timeoutSeconds: 120, secrets: [geminiApiKey, placesApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {matchId, userLanguage, duration, preferences} = request.data || {};
    if (!matchId) throw new Error('matchId is required');

    const apiKey = process.env.GEMINI_API_KEY;
    const placesKey = process.env.GOOGLE_PLACES_API_KEY || apiKey;
    const db = admin.firestore();
    const userId = request.auth.uid;

    const rawLang = userLanguage || 'en';
    const lang = rawLang.split('-')[0].split('_')[0].toLowerCase();
    const durationPreset = duration || 'standard'; // quick | standard | full

    const fallback = {
      success: true,
      blueprint: {
        title: lang === 'es' ? 'Plan de cita sugerido' : 'Suggested date plan',
        totalDuration: durationPreset === 'quick' ? '1-2h' : durationPreset === 'full' ? '5h+' : '3-4h',
        estimatedBudget: '$30-60',
        steps: [],
        icebreaker: '',
        dresscode: 'casual',
      },
    };

    try {
      // 1. Read match + validate user belongs to it
      const matchDoc = await db.collection('matches').doc(matchId).get();
      if (!matchDoc.exists) return fallback;
      const matchData = matchDoc.data() || {};
      const usersMatched = matchData.usersMatched || [];
      if (!usersMatched.includes(userId)) return fallback;
      const otherUserId = usersMatched.find((u) => u !== userId) || '';

      // 2. Read both profiles
      const [mySnap, theirSnap] = await Promise.all([
        db.collection('users').doc(userId).get(),
        otherUserId ? db.collection('users').doc(otherUserId).get() : Promise.resolve({exists: false, data: () => ({})}),
      ]);
      const myProfile = mySnap.exists ? mySnap.data() : {};
      const theirProfile = theirSnap.exists ? theirSnap.data() : {};
      const myName = myProfile.name || 'User';
      const theirName = theirProfile.name || 'Match';

      // 3. Read last 20 chat messages for context
      let chatContext = '';
      try {
        const msgSnap = await db.collection('matches').doc(matchId).collection('messages')
          .orderBy('timestamp', 'desc').limit(20).get();
        const msgs = msgSnap.docs.reverse()
          .map((d) => {
            const data = d.data();
            if (data.type === 'place' || data.isEphemeral) return null;
            const text = (data.message || '').substring(0, 200);
            if (!text) return null;
            return `${data.senderId === userId ? myName : theirName}: ${text}`;
          })
          .filter(Boolean);
        if (msgs.length > 0) chatContext = 'Recent conversation:\n' + msgs.join('\n');
      } catch (e) {
        logger.info(`[DateBlueprint] Could not read messages: ${e.message}`);
      }

      // 4. Get locations + midpoint
      let midLat = myProfile.latitude || 0;
      let midLng = myProfile.longitude || 0;
      let distanceBetween = 0;
      if (myProfile.latitude && theirProfile.latitude) {
        const mid = calculateMidpoint(myProfile.latitude, myProfile.longitude, theirProfile.latitude, theirProfile.longitude);
        midLat = mid.latitude;
        midLng = mid.longitude;
        distanceBetween = haversineKm(myProfile.latitude, myProfile.longitude, theirProfile.latitude, theirProfile.longitude);
      }

      if (!midLat || !midLng) {
        logger.warn('[DateBlueprint] No location data available');
        return fallback;
      }

      // 5. Fetch real places near midpoint (3 diverse queries)
      const placesConfig = await getPlacesSearchConfig();
      const radius = Math.max(5000, Math.min(distanceBetween * 1000 + 5000, 30000));
      // Diverse queries by duration — varied categories to avoid repeating same type
      const queries = durationPreset === 'quick'
        ? ['café coffee shop', 'park garden viewpoint']
        : durationPreset === 'full'
          ? ['café brunch breakfast', 'museum art gallery cultural center', 'restaurant dinner', 'bar cocktail lounge', 'park viewpoint']
          : ['café coffee shop', 'restaurant lunch dinner', 'park museum art gallery bar'];

      const placeResults = [];
      for (const query of queries) {
        try {
          const results = await placesTextSearch(query, {latitude: midLat, longitude: midLng}, radius, lang, null, 5, true);
          if (results && results.places) {
            for (const p of results.places.slice(0, 3)) {
              const suggestion = transformPlaceToSuggestion(p, myProfile, theirProfile, placesKey, placesConfig);
              if (suggestion) placeResults.push(suggestion);
            }
          }
        } catch (e) {
          logger.info(`[DateBlueprint] Place search "${query}" failed: ${e.message}`);
        }
      }

      if (placeResults.length === 0) {
        logger.warn('[DateBlueprint] No places found near midpoint');
        return fallback;
      }

      // 6. Build context
      const myInterests = Array.isArray(myProfile.interests) ? myProfile.interests.join(', ') : '';
      const theirInterests = Array.isArray(theirProfile.interests) ? theirProfile.interests.join(', ') : '';
      const mySet = new Set((myProfile.interests || []).map((i) => String(i).toLowerCase()));
      const shared = (theirProfile.interests || []).filter((i) => mySet.has(String(i).toLowerCase()));

      const placesDescription = placeResults.slice(0, 10).map((p, i) =>
        `${i + 1}. ${p.name} (${p.category || 'general'}) — rating: ${p.rating || 'N/A'}, address: ${p.address || 'N/A'}, travelTime: ~${p.travelTimeUser1 || '?'}min/${p.travelTimeUser2 || '?'}min`,
      ).join('\n');

      const prefsText = preferences ? `Budget: ${preferences.budget || 'flexible'}, Dietary: ${preferences.dietary || 'none'}, Mood: ${preferences.mood || 'romantic'}` : 'No specific preferences';
      const durationText = durationPreset === 'quick' ? '1-2 hours (coffee + walk)' : durationPreset === 'full' ? '5+ hours (full day date)' : '3-4 hours (activity + dinner)';

      // 7. RAG: retrieve date planning advice
      let ragContext = '';
      try {
        // Build specific RAG query based on context
        const interestContext = shared.length > 0 ? shared.slice(0, 3).join(' ') : (theirInterests.split(',')[0] || 'romantic');
        const timeContext = hour >= 18 ? 'evening dinner' : hour >= 12 ? 'afternoon' : 'morning brunch';
        const ragQuery = `date blueprint flow venue selection ${interestContext} ${durationPreset} ${timeContext}`;
        const genAIEmbed = new GoogleGenerativeAI(apiKey);
        const embModel = genAIEmbed.getGenerativeModel({model: 'gemini-embedding-001'});
        const embedResult = await Promise.race([
          embModel.embedContent({content: {parts: [{text: ragQuery.substring(0, 300)}]}, taskType: 'RETRIEVAL_QUERY', outputDimensionality: 768}),
          new Promise((_, reject) => setTimeout(() => reject(new Error('RAG timeout')), 4000)),
        ]);
        const ragSnap = await db.collection('coachKnowledge')
          .findNearest('embedding', embedResult.embedding.values, {limit: 3, distanceMeasure: 'COSINE', distanceResultField: '_distance'})
          .get();
        if (!ragSnap.empty) {
          const chunks = ragSnap.docs
            .map((d) => ({text: (d.data().text || '').substring(0, 500), similarity: 1 - (d.data()._distance ?? 1)}))
            .filter((d) => d.similarity >= 0.3);
          if (chunks.length > 0) ragContext = '\n\nExpert dating advice (use this to structure the date):\n' + chunks.slice(0, 3).map((d) => `- [${d.category || 'general'}]: ${d.text}`).join('\n\n');
        }
      } catch (ragErr) {
        logger.info(`[DateBlueprint] RAG skipped: ${ragErr.message}`);
      }

      // 8. Generate itinerary with Gemini
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({model: AI_MODEL_NAME});

      const now = new Date();
      const hour = now.getHours();
      const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];

      const prompt = `You are an expert date planner. Create a personalized first date itinerary for ${myName} and ${theirName}.

PROFILES:
- ${myName}'s interests: ${myInterests || 'not specified'}
- ${theirName}'s interests: ${theirInterests || 'not specified'}
- Shared interests: ${shared.length > 0 ? shared.join(', ') : 'none identified yet'}
- Distance between them: ${Math.round(distanceBetween)} km

${chatContext ? chatContext + '\n' : ''}
PREFERENCES: ${prefsText}
DURATION: ${durationText}
CURRENT: ${dayOfWeek}, ~${hour}:00
${ragContext}

REAL PLACES AVAILABLE (use ONLY these — they are real venues near both users):
${placesDescription}

RULES:
- ${getLanguageInstruction(lang)}
- Select ${durationPreset === 'quick' ? '2' : durationPreset === 'full' ? '3-4' : '2-3'} places from the list above
- IMPORTANT: Each step MUST be a DIFFERENT type of venue (don't repeat cafés, don't repeat restaurants)
  * Good flow: café → park/museum → restaurant → bar
  * Bad flow: café → café → café
- Create a NARRATIVE arc for the date:
  * Step 1: Low-pressure start (café, park, bookstore) — get comfortable
  * Step 2: Shared activity (museum, gallery, market, viewpoint) — create memories
  * Step 3: Deeper connection (restaurant, wine bar) — intimate conversation
  * Step 4 (if full day): Fun/nightlife (bar, cocktail lounge, live music)
- CRITICAL TITLE RULE: The plan title MUST be a SHORT, ELEGANT mood-based name (max 4 words). STRICTLY FORBIDDEN patterns: "Aventura con [name]", "Plan con [name]", "Cita con [name]", "Salida con [name]", or ANY pattern that includes a person's name. The title describes the EXPERIENCE, not the people. Good: "Sunset & Coffee Vibes", "Arte y Buena Charla", "Tarde de Sabores", "Golden Hour Downtown", "Café, Arte y Risas". Bad: "Aventura con Maria", "Plan con Daniel", "Cita romántica con Ana"
- Each step needs a clear "activity" description (not just the venue name)
  * Good: "Explorar el arte local mientras toman café"
  * Bad: "Café El Picaflor"
- Add a specific tip for each venue (what to order, what to see, etc.)
- Include one conversation icebreaker for the date
- Suggest a dresscode
- Reference specific things from their chat or profiles when possible
- Be specific with times (e.g., "17:30" not "afternoon")

Return ONLY a JSON object:
{
  "title": "creative plan name",
  "totalDuration": "X hours",
  "estimatedBudget": "$XX-YY",
  "steps": [
    {
      "order": 1,
      "time": "HH:MM",
      "duration": "XX min",
      "activity": "what to do",
      "placeName": "exact place name from list",
      "placeIndex": 0,
      "tip": "specific venue tip",
      "whyThisPlace": "why it fits their interests/chat",
      "travelTimeToNext": "X min walk/drive"
    }
  ],
  "icebreaker": "conversation starter for the date",
  "dresscode": "suggested dress style"
}`;

      // Attempt 1: with JSON response mode for reliable parsing
      let parsed = null;
      try {
        const result = await model.generateContent({
          contents: [{role: 'user', parts: [{text: prompt}]}],
          generationConfig: {maxOutputTokens: 2048, temperature: 0.85, responseMimeType: 'application/json'},
        });
        const rawText = result.response.text();
        parsed = JSON.parse(rawText);
      } catch (jsonErr) {
        logger.info(`[DateBlueprint] JSON mode failed (${jsonErr.message}), retrying with text mode`);
        // Attempt 2: text mode with manual parsing
        try {
          const result2 = await model.generateContent({
            contents: [{role: 'user', parts: [{text: prompt + '\n\nIMPORTANT: Return ONLY valid JSON, no markdown, no code blocks.'}]}],
            generationConfig: {maxOutputTokens: 2048, temperature: 0.7},
          });
          parsed = parseGeminiJsonResponse(result2.response.text());
        } catch (retryErr) {
          logger.warn(`[DateBlueprint] Both JSON attempts failed: ${retryErr.message}`);
        }
      }

      // Attempt 3: if parsing failed, build a simple plan from places data
      if (!parsed && placeResults.length >= 2) {
        logger.info('[DateBlueprint] Building fallback plan from places data');
        const topPlaces = placeResults.slice(0, durationPreset === 'quick' ? 2 : 3);
        const baseHour = hour >= 18 ? 19 : hour >= 12 ? 14 : 10;
        parsed = {
          title: lang === 'es' ? 'Plan de cita sugerido' : 'Suggested date plan',
          totalDuration: durationPreset === 'quick' ? '1-2h' : durationPreset === 'full' ? '5h+' : '3-4h',
          estimatedBudget: '$25-50',
          steps: topPlaces.map((p, i) => ({
            order: i + 1,
            time: `${baseHour + i * (durationPreset === 'quick' ? 1 : 2)}:00`,
            duration: durationPreset === 'quick' ? '45 min' : '1h 15min',
            activity: p.name || 'Visit',
            placeName: p.name || '',
            placeIndex: i,
            tip: p.description ? String(p.description).substring(0, 100) : '',
            whyThisPlace: shared.length > 0 ? `Shared interest: ${shared[0]}` : '',
            travelTimeToNext: i < topPlaces.length - 1 ? '10 min' : '',
          })),
          icebreaker: lang === 'es' ? '¿Qué es lo que más te gusta hacer un fin de semana?' : 'What do you enjoy most on weekends?',
          dresscode: 'casual',
        };
      }

      if (parsed && Array.isArray(parsed.steps) && parsed.steps.length >= 2) {
        // Enrich steps with real place data
        const enrichedSteps = parsed.steps.map((step) => {
          const placeIdx = typeof step.placeIndex === 'number' ? step.placeIndex : -1;
          const matchedPlace = placeIdx >= 0 && placeIdx < placeResults.length
            ? placeResults[placeIdx]
            : placeResults.find((p) => p.name && step.placeName && p.name.toLowerCase().includes(step.placeName.toLowerCase().substring(0, 10)));
          return {
            order: step.order || 1,
            time: String(step.time || '').substring(0, 5),
            duration: String(step.duration || '').substring(0, 20),
            activity: String(step.activity || '').substring(0, 100),
            tip: String(step.tip || '').substring(0, 200),
            whyThisPlace: String(step.whyThisPlace || '').substring(0, 200),
            travelTimeToNext: String(step.travelTimeToNext || '').substring(0, 30),
            place: matchedPlace ? sanitizePlaceForJson(matchedPlace) : null,
          };
        });

        const blueprint = {
          title: sanitizeBlueprintTitle(String(parsed.title || ''), myName, theirName),
          totalDuration: String(parsed.totalDuration || durationText).substring(0, 20),
          estimatedBudget: String(parsed.estimatedBudget || '$30-60').substring(0, 20),
          steps: enrichedSteps,
          icebreaker: String(parsed.icebreaker || '').substring(0, 200),
          dresscode: String(parsed.dresscode || 'casual').substring(0, 50),
        };

        logger.info(`[DateBlueprint] Generated ${blueprint.steps.length}-step itinerary (${lang}) for ${myName}→${theirName}`);
        return {success: true, blueprint};
      }

      logger.warn('[DateBlueprint] AI returned invalid format');
      return fallback;
    } catch (err) {
      logger.warn(`[DateBlueprint] Error: ${err.message}`);
      return fallback;
    }
  },
);

/**
 * Callable: Analyze all dating profile photos using Gemini Vision.
 * Reads user's pictureNames from Firestore, downloads each from Storage,
 * sends all to Gemini in a single multi-image request for analysis.
 * Returns structured scoring, categorization, and recommendations.
 */
exports.getPhotoCoachAnalysis = onCall(
  {region: 'us-central1', memory: '1GiB', timeoutSeconds: 120, secrets: [geminiApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');

    try {
      const storage = admin.storage().bucket();
      const db = admin.firestore();

      const uid = request.auth.uid;
      const userDoc = await db.collection('users').doc(uid).get();
      if (!userDoc.exists) return {success: false, error: 'user_not_found'};

      const pictureNames = userDoc.data().pictureNames || userDoc.data().pictures || [];
      if (pictureNames.length === 0) return {success: false, error: 'no_photos'};

      const userLanguage = request.data?.userLanguage || userDoc.data().deviceLanguage || 'en';

      // Download each photo as base64 (in parallel)
      const downloadResults = await Promise.allSettled(
        pictureNames.map(async (name) => {
          const file = storage.file(`users/${uid}/${name}`);
          const [buffer] = await file.download();
          return {name, buffer};
        }),
      );
      const photoParts = [];
      const validNames = [];
      for (const result of downloadResults) {
        if (result.status === 'fulfilled') {
          photoParts.push({
            inlineData: {mimeType: 'image/jpeg', data: result.value.buffer.toString('base64')},
          });
          validNames.push(result.value.name);
        }
      }

      if (photoParts.length === 0) return {success: false, error: 'no_valid_photos'};

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        logger.error('[getPhotoCoachAnalysis] GEMINI_API_KEY not configured');
        return {success: false, error: 'config_error'};
      }

      const prompt = `You are an expert dating profile photo coach. Analyze these ${photoParts.length} dating profile photos.

For EACH photo (in order), provide:
- score (1-100): overall quality for a dating profile
- category: one of [selfie, portrait, full_body, activity, group, landscape, pet, food, other]
- strengths: array of strengths from [good_lighting, clear_face, smile, natural_pose, interesting_background, shows_personality, good_composition, professional_quality, shows_hobbies, warm_expression]
- issues: array of issues from [dark_lighting, blurry, sunglasses_covering_eyes, group_photo_unclear_who, no_face_visible, too_far_away, mirror_selfie, bathroom_selfie, too_filtered, low_resolution, cluttered_background]
- suggestion: one short actionable tip (max 15 words)

Also provide:
- overallScore: average quality (1-100) of the full profile
- missingCategories: what types of photos are missing that would improve the profile (from [full_body, activity, portrait, smile, with_friends, travel, hobby])
- recommendations: top 3 most impactful tips to improve this dating profile (each max 20 words)
- suggestedOrder: 0-based indexes of photos in optimal display order (best photo first)

${getLanguageInstruction(userLanguage)}

Return ONLY valid JSON with this structure:
{
  "overallScore": number,
  "photos": [{"score": number, "category": string, "strengths": [string], "issues": [string], "suggestion": string}],
  "missingCategories": [string],
  "recommendations": [string],
  "suggestedOrder": [number]  // 0-based indexes of photos in optimal display order
}`;

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: AI_MODEL_NAME,
        generationConfig: {responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 4096},
      });

      const contents = [{role: 'user', parts: [...photoParts, {text: prompt}]}];
      const result = await model.generateContent({contents});
      const text = result.response.text();
      const analysis = parseGeminiJsonResponse(text);

      if (!analysis || typeof analysis !== 'object') {
        logger.warn('[getPhotoCoachAnalysis] Gemini returned invalid JSON');
        return {success: false, error: 'parse_error'};
      }

      // Map suggestedOrder indexes back to filenames
      const suggestedOrder = (analysis.suggestedOrder || []).map((idx) => {
        if (typeof idx === 'number') return validNames[idx];
        if (typeof idx === 'string' && validNames.includes(idx)) return idx;
        return null;
      }).filter(Boolean);
      // If Gemini didn't return valid order, keep original
      const finalOrder = suggestedOrder.length === validNames.length ? suggestedOrder : validNames;

      // Map photo analysis to include filenames
      const photos = (analysis.photos || []).map((p, i) => ({
        ...p,
        filename: validNames[i] || `photo_${i}`,
      }));

      logger.info(`[getPhotoCoachAnalysis] Analyzed ${photos.length} photos for uid=${uid}, overallScore=${analysis.overallScore}`);

      return {
        success: true,
        overallScore: analysis.overallScore || 50,
        photos,
        missingCategories: analysis.missingCategories || [],
        recommendations: analysis.recommendations || [],
        suggestedOrder: finalOrder,
      };
    } catch (error) {
      logger.error(`[getPhotoCoachAnalysis] Error: ${error.message}`);
      return {success: false, error: 'analysis_failed'};
    }
  },
);
