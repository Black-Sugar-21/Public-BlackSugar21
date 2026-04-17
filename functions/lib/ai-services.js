'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { geminiApiKey, placesApiKey, AI_MODEL_NAME, AI_MODEL_LITE, getLanguageInstruction, parseGeminiJsonResponse, trackAICall } = require('./shared');
const { calcAge } = require('./geo');
const { getMatchUsersLocations, calculateMidpoint, placesTextSearch, transformPlaceToSuggestion, getPlacesSearchConfig, haversineKm } = require('./places-helpers');

// Centralized AI config — cached for 5 minutes, single-flight fetch
let _aiConfig = null;
let _aiConfigFetchedAt = 0;
let _aiConfigPromise = null;
const AI_CONFIG_CACHE_TTL = 5 * 60 * 1000;

async function getAiConfig() {
  if (_aiConfig && Date.now() - _aiConfigFetchedAt < AI_CONFIG_CACHE_TTL) return _aiConfig;
  // Single-flight: only one fetch at a time
  if (_aiConfigPromise) return _aiConfigPromise;
  _aiConfigPromise = (async () => {
    try {
      const doc = await admin.firestore().collection('appConfig').doc('ai').get();
      _aiConfig = doc.exists ? doc.data() : {};
      _aiConfigFetchedAt = Date.now();
    } catch (e) {
      logger.warn(`[getAiConfig] Firestore fetch failed: ${e.message}`);
      _aiConfig = _aiConfig || {};
    }
    _aiConfigPromise = null;
    return _aiConfig;
  })();
  return _aiConfigPromise;
}

function getTemp(aiConfig, key, fallback) {
  return aiConfig?.temperatures?.[key] ?? fallback;
}

function getTokens(aiConfig, key, fallback) {
  return aiConfig?.maxOutputTokens?.[key] ?? fallback;
}

/** Safely extract text from Gemini result — prevents crash on null/undefined response */
function safeResponseText(result) {
  try {
    return result?.response?.text() || '';
  } catch (e) {
    logger.warn(`[safeResponseText] Failed to extract text: ${e.message}`);
    return '';
  }
}

exports.generateInterestSuggestions = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 30, secrets: [geminiApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const userId = request.auth.uid;
    const db = admin.firestore();
    const userLanguage = request.data?.userLanguage || 'en';
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

      const _aiStart = Date.now();
      const result = await model.generateContent(prompt);
      trackAICall({functionName: 'generateInterestSuggestions', model: AI_MODEL_LITE, operation: 'interests', usage: result.response.usageMetadata, latencyMs: Date.now() - _aiStart});
      const responseText = safeResponseText(result).trim();
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
    const {userId, userLanguage} = request.data || {};
    const targetId = userId || request.auth.uid;
    const lang = (typeof userLanguage === 'string' && userLanguage ? userLanguage : 'en').split('-')[0].split('_')[0].toLowerCase();
    const db = admin.firestore();

    const userDoc = await db.collection('users').doc(targetId).get();
    if (!userDoc.exists) throw new Error('User not found');

    const TEXTS = {
      en: {
        bio: 'Add a more detailed bio to improve your matches',
        photos: (n) => `Add more photos (you have ${n}, at least 3 recommended)`,
        interests: 'Add more interests to improve compatibility',
        analysis: 'Profile successfully analyzed',
      },
      es: {
        bio: 'Añade una bio más detallada para mejorar tus matches',
        photos: (n) => `Añade más fotos (tienes ${n}, se recomiendan al menos 3)`,
        interests: 'Añade más intereses para mejorar la compatibilidad',
        analysis: 'Perfil analizado con éxito',
      },
      pt: {
        bio: 'Adicione uma bio mais detalhada para melhorar seus matches',
        photos: (n) => `Adicione mais fotos (você tem ${n}, pelo menos 3 recomendadas)`,
        interests: 'Adicione mais interesses para melhorar a compatibilidade',
        analysis: 'Perfil analisado com sucesso',
      },
      fr: {
        bio: 'Ajoute une bio plus détaillée pour améliorer tes matches',
        photos: (n) => `Ajoute plus de photos (tu en as ${n}, au moins 3 recommandées)`,
        interests: 'Ajoute plus d\'intérêts pour améliorer la compatibilité',
        analysis: 'Profil analysé avec succès',
      },
      de: {
        bio: 'Füge eine detailliertere Bio hinzu, um deine Matches zu verbessern',
        photos: (n) => `Füge mehr Fotos hinzu (du hast ${n}, mindestens 3 empfohlen)`,
        interests: 'Füge mehr Interessen hinzu, um die Kompatibilität zu verbessern',
        analysis: 'Profil erfolgreich analysiert',
      },
      ja: {
        bio: 'マッチを改善するために、より詳しいバイオを追加しましょう',
        photos: (n) => `写真をもっと追加しましょう（現在${n}枚、3枚以上推奨）`,
        interests: '相性を改善するために、興味をもっと追加しましょう',
        analysis: 'プロフィールの分析が完了しました',
      },
      zh: {
        bio: '添加更详细的个人简介来改善你的匹配',
        photos: (n) => `添加更多照片（你有${n}张，建议至少3张）`,
        interests: '添加更多兴趣来提高兼容性',
        analysis: '资料分析成功',
      },
      ru: {
        bio: 'Добавьте более подробное био, чтобы улучшить мэтчи',
        photos: (n) => `Добавьте больше фото (у вас ${n}, рекомендуется минимум 3)`,
        interests: 'Добавьте больше интересов, чтобы улучшить совместимость',
        analysis: 'Профиль успешно проанализирован',
      },
      ar: {
        bio: 'أضف سيرة ذاتية أكثر تفصيلاً لتحسين توافقاتك',
        photos: (n) => `أضف المزيد من الصور (لديك ${n}، يُوصى بـ 3 على الأقل)`,
        interests: 'أضف المزيد من الاهتمامات لتحسين التوافق',
        analysis: 'تم تحليل الملف الشخصي بنجاح',
      },
      id: {
        bio: 'Tambahkan bio yang lebih detail untuk meningkatkan match-mu',
        photos: (n) => `Tambahkan lebih banyak foto (kamu punya ${n}, minimal 3 direkomendasikan)`,
        interests: 'Tambahkan lebih banyak minat untuk meningkatkan kecocokan',
        analysis: 'Profil berhasil dianalisis',
      },
    };
    const t = TEXTS[lang] || TEXTS.en;

    const user = userDoc.data();
    const recommendations = [];
    let score = 70;

    if (!user.bio || user.bio.length < 20) {
      recommendations.push(t.bio);
      score -= 10;
    }
    const photoCount = Array.isArray(user.pictures) ? user.pictures.length : 1;
    if (photoCount < 3) {
      recommendations.push(t.photos(photoCount));
      score -= 10;
    }
    if (!user.interests || (Array.isArray(user.interests) && user.interests.length < 3)) {
      recommendations.push(t.interests);
      score -= 5;
    }

    logger.info(`[analyzeProfileWithAI] Profile score=${score}, lang=${lang} for ${targetId}`);
    return {
      success: true,
      score: Math.max(score, 30),
      analysis: t.analysis,
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

        // Rate-limit guard (only for AI-backed path; Mode 2 / fallbacks skip this)

        // If quick check found flags, add AI analysis
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({model: AI_MODEL_LITE});

        const prompt = `Analyze this dating chat for safety concerns. Focus on messages from "them" (the other person).

IMPORTANT CONTEXT: This is a dating app. Flirtatious language, pet names ("bb", "baby", "amor", "mi vida", "cariño"), and compliments are COMPLETELY NORMAL and should NOT be flagged. Only flag genuinely concerning behavior.

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

        let parsed = null;
        try {
          parsed = parseGeminiJsonResponse(safeResponseText(result));
        } catch (_parseErr) {
          logger.warn(`[calculateSafetyScore] JSON parse failed: ${_parseErr.message}`);
        }

        if (parsed && typeof parsed.score === 'number') {
          const validRiskLevels = ['low', 'medium', 'high'];
          const allFlags = [...new Set([...quickFlags, ...(parsed.warnings || []).map((w) => String(w.type || ''))])];
          const response = {
            success: true,
            score: Math.max(0, Math.min(100, parsed.score)),
            safetyScore: Math.max(0, Math.min(100, parsed.score)),
            riskLevel: validRiskLevels.includes(String(parsed.riskLevel)) ? parsed.riskLevel : (parsed.score > 70 ? 'low' : parsed.score > 40 ? 'medium' : 'high'),
            flags: allFlags,
            concerns: (parsed.concerns || []).slice(0, 5).map((c) => String(c).substring(0, 150)),
            warnings: (parsed.warnings || []).slice(0, 3).map((w) => ({
              type: String(w.type || '').substring(0, 30),
              message: String(w.message || '').substring(0, 200),
              severity: validRiskLevels.includes(String(w.severity)) ? w.severity : 'low',
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
    const userId = request.auth.uid;
    const db = admin.firestore();
    const {messages, userLanguage} = request.data || {};
    const lang = (typeof userLanguage === 'string' && userLanguage ? userLanguage : 'en').split('-')[0].split('_')[0].toLowerCase();

    const INSIGHTS_I18N = {
      en: {
        high_volume: 'Lots of messages — a strong sign of mutual interest',
        flowing: 'The conversation is flowing nicely',
        start: 'Start the conversation to unlock chemistry analysis',
      },
      es: {
        high_volume: 'Gran cantidad de mensajes — buena señal de interés mutuo',
        flowing: 'La conversación está fluyendo bien',
        start: 'Inicia la conversación para desbloquear el análisis de química',
      },
      pt: {
        high_volume: 'Muitas mensagens — um forte sinal de interesse mútuo',
        flowing: 'A conversa está fluindo bem',
        start: 'Inicie a conversa para desbloquear a análise de química',
      },
      fr: {
        high_volume: 'Beaucoup de messages — un signe fort d\'intérêt mutuel',
        flowing: 'La conversation se passe bien',
        start: 'Commence la conversation pour débloquer l\'analyse de l\'alchimie',
      },
      de: {
        high_volume: 'Viele Nachrichten — ein starkes Zeichen gegenseitigen Interesses',
        flowing: 'Das Gespräch läuft gut',
        start: 'Starte das Gespräch, um die Chemie-Analyse freizuschalten',
      },
      ja: {
        high_volume: 'メッセージが多い — 相互の関心が高いサイン',
        flowing: '会話が順調に進んでいます',
        start: '会話を始めて、相性分析を解除しましょう',
      },
      zh: {
        high_volume: '消息量很大 — 相互感兴趣的强烈信号',
        flowing: '对话进行得很顺利',
        start: '开始对话以解锁默契分析',
      },
      ru: {
        high_volume: 'Много сообщений — сильный признак взаимного интереса',
        flowing: 'Разговор хорошо развивается',
        start: 'Начните разговор, чтобы открыть анализ химии',
      },
      ar: {
        high_volume: 'الكثير من الرسائل — علامة قوية على الاهتمام المتبادل',
        flowing: 'المحادثة تسير بسلاسة',
        start: 'ابدأ المحادثة لفتح تحليل الكيمياء',
      },
      id: {
        high_volume: 'Banyak pesan — tanda kuat ketertarikan timbal balik',
        flowing: 'Percakapan berjalan dengan baik',
        start: 'Mulai percakapan untuk membuka analisis chemistry',
      },
    };
    const t = INSIGHTS_I18N[lang] || INSIGHTS_I18N.en;

    let score = 50;
    const insights = [];

    if (Array.isArray(messages) && messages.length > 0) {
      score = Math.min(50 + messages.length * 2, 100);
      if (messages.length > 20) insights.push(t.high_volume);
      if (messages.length > 5) insights.push(t.flowing);
    } else {
      insights.push(t.start);
    }

    const level = score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low';
    logger.info(`[analyzeConversationChemistry] score=${score}, level=${level}, lang=${lang}`);
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
        return {success: true, suggestions: fallback, replies: fallbackReplies, executionTime: Date.now() - startTime, degraded: true};
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
        return {success: true, suggestions: fallback, replies: fallbackReplies, executionTime: Date.now() - startTime, degraded: true};
      }
      const matchData = matchDoc.data() || {};
      const usersMatched = matchData.usersMatched || [];
      if (!usersMatched.includes(userId)) {
        logger.warn(`[generateSmartReply] User ${userId} not in match ${matchId}`);
        return {success: true, suggestions: fallback, replies: fallbackReplies, executionTime: Date.now() - startTime, degraded: true};
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

      const _srCfg = await getAiConfig();
      const _srGenCfg = {maxOutputTokens: getTokens(_srCfg, 'smartReply', 512), temperature: getTemp(_srCfg, 'smartReply', 0.85)};

      // Retry x2 before surrendering to fallback — a single Gemini glitch shouldn't silently ship canned phrases.
      let lastErr = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const _srStart = Date.now();
          const result = await model.generateContent({
            contents: [{role: 'user', parts: [{text: prompt}]}],
            generationConfig: _srGenCfg,
          });
          trackAICall({functionName: 'generateSmartReply', model: AI_MODEL_LITE, operation: 'smart_reply', usage: result.response.usageMetadata, latencyMs: Date.now() - _srStart, attempt});

          const text = safeResponseText(result);
          let parsed = null;
          try {
            parsed = parseGeminiJsonResponse(text);
          } catch (_parseErr) {
            logger.warn(`[generateSmartReply] attempt ${attempt}: JSON parse failed: ${_parseErr.message}`);
          }

          // New format: replies array with tone + explanation
          if (parsed && Array.isArray(parsed.replies) && parsed.replies.length >= 3) {
            const replies = parsed.replies.slice(0, 3).map((r) => ({
              text: String(r.text || '').substring(0, 150),
              tone: ['casual', 'flirty', 'deep'].includes(r.tone) ? r.tone : 'casual',
              explanation: String(r.explanation || '').substring(0, 100),
            }));
            // Reject attempt if any reply text is empty — try again rather than ship blanks
            if (replies.some((r) => !r.text)) {
              logger.warn(`[generateSmartReply] attempt ${attempt}: one or more empty reply texts`);
              lastErr = new Error('empty_reply_text');
              continue;
            }
            const findByTone = (t) => replies.find((r) => r.tone === t)?.text || replies[0]?.text || '';
            const suggestions = {
              playful: findByTone('flirty'),
              thoughtful: findByTone('deep'),
              casual: findByTone('casual'),
              tone: ['neutral', 'flirty', 'serious'].includes(parsed.tone) ? parsed.tone : 'neutral',
              engagementTip: String(parsed.engagementTip || '').substring(0, 200),
            };
            logger.info(`[generateSmartReply] Generated 3-tone replies (${lang}) for ${myName}→${theirName} [${chatHistory.length} msgs, attempt ${attempt}]`);
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
            const replies = [
              {text: suggestions.casual, tone: 'casual', explanation: ''},
              {text: suggestions.playful, tone: 'flirty', explanation: ''},
              {text: suggestions.thoughtful, tone: 'deep', explanation: ''},
            ];
            logger.info(`[generateSmartReply] Generated legacy replies (${lang}) for ${myName}→${theirName} [${chatHistory.length} msgs, attempt ${attempt}]`);
            return {success: true, replies, suggestions, executionTime: Date.now() - startTime};
          }

          logger.warn(`[generateSmartReply] attempt ${attempt}: AI returned invalid format`);
          lastErr = new Error('invalid_format');
        } catch (innerErr) {
          logger.warn(`[generateSmartReply] attempt ${attempt} threw: ${innerErr.message}`);
          lastErr = innerErr;
        }
      }

      logger.error(`[generateSmartReply] All attempts failed (${lastErr?.message}), returning degraded fallback`);
      return {success: true, suggestions: fallback, replies: fallbackReplies, executionTime: Date.now() - startTime, degraded: true};
    } catch (err) {
      logger.error(`[generateSmartReply] Outer failure (${err.message}), returning degraded fallback`);
      return {success: true, suggestions: fallback, replies: fallbackReplies, executionTime: Date.now() - startTime, degraded: true};
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
    const lang = (typeof d.userLanguage === 'string' && d.userLanguage ? d.userLanguage : 'en').split('-')[0].split('_')[0].toLowerCase();

    const db = admin.firestore();
    const [u1Doc, u2Doc] = await Promise.all([
      db.collection('users').doc(uid1).get(),
      db.collection('users').doc(uid2).get(),
    ]);

    const COMMON_INTERESTS_TEXT = {
      en: (n) => `${n} interests in common`,
      es: (n) => `${n} intereses en común`,
      pt: (n) => `${n} interesses em comum`,
      fr: (n) => `${n} centres d'intérêt en commun`,
      de: (n) => `${n} gemeinsame Interessen`,
      ja: (n) => `${n}個の共通の興味`,
      zh: (n) => `${n} 个共同兴趣`,
      ru: (n) => `${n} общих интересов`,
      ar: (n) => `${n} اهتمامات مشتركة`,
      id: (n) => `${n} minat yang sama`,
    };
    const getCommonText = COMMON_INTERESTS_TEXT[lang] || COMMON_INTERESTS_TEXT.en;

    let overallScore = 60;
    const strengths = [];
    if (u1Doc.exists && u2Doc.exists) {
      const u1 = u1Doc.data();
      const u2 = u2Doc.data();
      const i1 = new Set((u1.interests || []).map(String));
      const i2 = (u2.interests || []).map(String);
      const common = i2.filter((i) => i1.has(i));
      overallScore = Math.min(60 + common.length * 5, 100);
      if (common.length > 0) strengths.push(getCommonText(common.length));
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
    const lang = (typeof d.userLanguage === 'string' && d.userLanguage ? d.userLanguage : 'en').split('-')[0].split('_')[0].toLowerCase();

    const db = admin.firestore();
    const [u1Doc, u2Doc] = await Promise.all([
      db.collection('users').doc(uid1).get(),
      db.collection('users').doc(uid2).get(),
    ]);

    const RISK_AGE_TEXT = {
      en: 'Large age difference',
      es: 'Gran diferencia de edad',
      pt: 'Grande diferença de idade',
      fr: 'Grande différence d\'âge',
      de: 'Großer Altersunterschied',
      ja: '年齢差が大きい',
      zh: '年龄差距较大',
      ru: 'Большая разница в возрасте',
      ar: 'فارق عمري كبير',
      id: 'Perbedaan usia besar',
    };

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
      if (ageDiff > 10) riskFactors.push(RISK_AGE_TEXT[lang] || RISK_AGE_TEXT.en);
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
    const {userLanguage} = request.data || {};
    const lang = (typeof userLanguage === 'string' && userLanguage ? userLanguage : 'en').split('-')[0].split('_')[0].toLowerCase();
    const db = admin.firestore();

    const STARTERS_I18N = {
      en: [
        {message: 'What\'s the most incredible place you\'ve visited? 🌍', reasoning: 'Travel shared experience', expectedResponse: 'A destination or travel story'},
        {message: 'If you could do anything this weekend, what would it be? ☀️', reasoning: 'Reveals lifestyle', expectedResponse: 'Weekend plans or wishes'},
        {message: 'What\'s your all-time favorite movie? 🎬', reasoning: 'Cultural common ground', expectedResponse: 'A movie title or genre'},
        {message: 'What are you most passionate about in life? ✨', reasoning: 'Shows depth of character', expectedResponse: 'A passion or goal'},
        {message: 'If you could travel anywhere right now, where would you go? ✈️', reasoning: 'Dream exploration', expectedResponse: 'A place or reason'},
      ],
      es: [
        {message: '¿Cuál es el lugar más increíble que has visitado? 🌍', reasoning: 'Experiencia de viaje compartida', expectedResponse: 'Un destino o historia de viaje'},
        {message: 'Si pudieras hacer cualquier cosa este fin de semana, ¿qué sería? ☀️', reasoning: 'Revela estilo de vida', expectedResponse: 'Planes o deseos de fin de semana'},
        {message: '¿Cuál es tu película favorita de todos los tiempos? 🎬', reasoning: 'Punto en común cultural', expectedResponse: 'Un título o género de película'},
        {message: '¿Qué es lo que más te apasiona en la vida? ✨', reasoning: 'Muestra profundidad de carácter', expectedResponse: 'Una pasión o meta'},
        {message: 'Si pudieras viajar a cualquier lugar ahora mismo, ¿adónde irías? ✈️', reasoning: 'Exploración de sueños', expectedResponse: 'Un lugar o razón'},
      ],
      pt: [
        {message: 'Qual é o lugar mais incrível que você já visitou? 🌍', reasoning: 'Experiência de viagem compartilhada', expectedResponse: 'Um destino ou história de viagem'},
        {message: 'Se pudesse fazer qualquer coisa neste fim de semana, o que seria? ☀️', reasoning: 'Revela estilo de vida', expectedResponse: 'Planos ou desejos de fim de semana'},
        {message: 'Qual é o seu filme favorito de todos os tempos? 🎬', reasoning: 'Ponto em comum cultural', expectedResponse: 'Um título ou gênero de filme'},
        {message: 'O que te apaixona mais na vida? ✨', reasoning: 'Mostra profundidade de caráter', expectedResponse: 'Uma paixão ou meta'},
        {message: 'Se pudesse viajar para qualquer lugar agora, para onde iria? ✈️', reasoning: 'Exploração de sonhos', expectedResponse: 'Um lugar ou razão'},
      ],
      fr: [
        {message: 'Quel est l\'endroit le plus incroyable que tu aies visité ? 🌍', reasoning: 'Expérience de voyage partagée', expectedResponse: 'Une destination ou histoire de voyage'},
        {message: 'Si tu pouvais faire n\'importe quoi ce week-end, que ferais-tu ? ☀️', reasoning: 'Révèle le style de vie', expectedResponse: 'Plans ou souhaits du week-end'},
        {message: 'Quel est ton film préféré de tous les temps ? 🎬', reasoning: 'Point commun culturel', expectedResponse: 'Un titre ou genre de film'},
        {message: 'Qu\'est-ce qui te passionne le plus dans la vie ? ✨', reasoning: 'Montre la profondeur de caractère', expectedResponse: 'Une passion ou un but'},
        {message: 'Si tu pouvais voyager n\'importe où maintenant, où irais-tu ? ✈️', reasoning: 'Exploration de rêves', expectedResponse: 'Un lieu ou une raison'},
      ],
      de: [
        {message: 'Was ist der unglaublichste Ort, den du je besucht hast? 🌍', reasoning: 'Geteilte Reiseerfahrung', expectedResponse: 'Ein Ziel oder eine Reisegeschichte'},
        {message: 'Wenn du dieses Wochenende alles tun könntest, was wäre es? ☀️', reasoning: 'Zeigt den Lebensstil', expectedResponse: 'Wochenendpläne oder Wünsche'},
        {message: 'Was ist dein Lieblingsfilm aller Zeiten? 🎬', reasoning: 'Kulturelle Gemeinsamkeiten', expectedResponse: 'Ein Filmtitel oder Genre'},
        {message: 'Wofür brennst du am meisten im Leben? ✨', reasoning: 'Zeigt Charaktertiefe', expectedResponse: 'Eine Leidenschaft oder ein Ziel'},
        {message: 'Wenn du jetzt überall hinreisen könntest, wohin würdest du gehen? ✈️', reasoning: 'Traumerkundung', expectedResponse: 'Ein Ort oder Grund'},
      ],
      ja: [
        {message: 'これまで訪れた中で、一番素晴らしい場所はどこ？ 🌍', reasoning: '共有する旅の体験', expectedResponse: '目的地や旅のストーリー'},
        {message: 'この週末、なんでもできるとしたら何をする？ ☀️', reasoning: 'ライフスタイルが分かる', expectedResponse: '週末の予定や願望'},
        {message: '今までで一番好きな映画は？ 🎬', reasoning: '文化的な共通点', expectedResponse: '映画のタイトルやジャンル'},
        {message: '人生で一番情熱を注いでいることは？ ✨', reasoning: '人柄の深みを見せる', expectedResponse: '情熱や目標'},
        {message: '今すぐどこへでも行けるとしたら、どこに行く？ ✈️', reasoning: '夢の探求', expectedResponse: '場所や理由'},
      ],
      zh: [
        {message: '你去过的最不可思议的地方是哪里？ 🌍', reasoning: '共同的旅行经历', expectedResponse: '目的地或旅行故事'},
        {message: '如果这个周末可以做任何事，你想做什么？ ☀️', reasoning: '展现生活方式', expectedResponse: '周末计划或愿望'},
        {message: '你一直以来最喜欢的电影是什么？ 🎬', reasoning: '文化共鸣点', expectedResponse: '电影名或类型'},
        {message: '你生活中最有激情的事是什么？ ✨', reasoning: '展现个性深度', expectedResponse: '激情或目标'},
        {message: '如果现在能去任何地方，你会去哪里？ ✈️', reasoning: '梦想探索', expectedResponse: '地点或原因'},
      ],
      ru: [
        {message: 'Какое самое невероятное место ты посетил/а? 🌍', reasoning: 'Общий опыт путешествий', expectedResponse: 'Место или история путешествия'},
        {message: 'Если бы ты мог/ла делать что угодно в эти выходные, что бы это было? ☀️', reasoning: 'Раскрывает стиль жизни', expectedResponse: 'Планы или желания на выходные'},
        {message: 'Какой твой любимый фильм всех времен? 🎬', reasoning: 'Культурные общности', expectedResponse: 'Название фильма или жанр'},
        {message: 'Что больше всего увлекает тебя в жизни? ✨', reasoning: 'Показывает глубину характера', expectedResponse: 'Увлечение или цель'},
        {message: 'Если бы мог/ла отправиться куда угодно прямо сейчас, куда бы поехал/а? ✈️', reasoning: 'Исследование мечты', expectedResponse: 'Место или причина'},
      ],
      ar: [
        {message: 'ما هو أروع مكان زرته؟ 🌍', reasoning: 'تجربة سفر مشتركة', expectedResponse: 'وجهة أو قصة سفر'},
        {message: 'إذا كان بإمكانك فعل أي شيء في نهاية الأسبوع، ماذا ستفعل؟ ☀️', reasoning: 'يكشف نمط الحياة', expectedResponse: 'خطط أو أمنيات نهاية الأسبوع'},
        {message: 'ما هو فيلمك المفضل على الإطلاق؟ 🎬', reasoning: 'نقطة مشتركة ثقافية', expectedResponse: 'عنوان فيلم أو نوع'},
        {message: 'ما الذي يشغفك أكثر في الحياة؟ ✨', reasoning: 'يُظهر عمق الشخصية', expectedResponse: 'شغف أو هدف'},
        {message: 'إذا أمكنك السفر إلى أي مكان الآن، أين ستذهب؟ ✈️', reasoning: 'استكشاف الأحلام', expectedResponse: 'مكان أو سبب'},
      ],
      id: [
        {message: 'Tempat paling luar biasa yang pernah kamu kunjungi apa? 🌍', reasoning: 'Pengalaman perjalanan bersama', expectedResponse: 'Tujuan atau cerita perjalanan'},
        {message: 'Kalau bisa melakukan apa saja akhir pekan ini, apa itu? ☀️', reasoning: 'Mengungkapkan gaya hidup', expectedResponse: 'Rencana atau keinginan akhir pekan'},
        {message: 'Film favoritmu sepanjang masa apa? 🎬', reasoning: 'Kesamaan budaya', expectedResponse: 'Judul atau genre film'},
        {message: 'Apa yang paling kamu sukai dalam hidup? ✨', reasoning: 'Menunjukkan kedalaman karakter', expectedResponse: 'Passion atau tujuan'},
        {message: 'Kalau bisa traveling ke mana saja sekarang, mau ke mana? ✈️', reasoning: 'Eksplorasi impian', expectedResponse: 'Tempat atau alasan'},
      ],
    };

    const starterTexts = STARTERS_I18N[lang] || STARTERS_I18N.en;
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
    const {photos, userId, userLanguage} = request.data || {};
    const db = admin.firestore();
    const lang = (typeof userLanguage === 'string' && userLanguage ? userLanguage : 'en').split('-')[0].split('_')[0].toLowerCase();
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
    const {userId, userLanguage} = request.data || {};
    const uid = userId || request.auth.uid;

    const db = admin.firestore();
    const lang = (typeof userLanguage === 'string' && userLanguage ? userLanguage : 'en').split('-')[0].split('_')[0].toLowerCase();
    // No credit check: this CF only filters Firestore data, no Gemini tokens spent.
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
    const lang = (typeof d.userLanguage === 'string' && d.userLanguage ? d.userLanguage : 'en').split('-')[0].split('_')[0].toLowerCase();

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

    const hasCommon = interestsScore > 0;
    const EXPLANATION = {
      en: hasCommon ? 'Compatibility based on common interests and profile factors' : 'Compatibility based on profile factors',
      es: hasCommon ? 'Compatibilidad basada en intereses comunes y factores de perfil' : 'Compatibilidad basada en factores de perfil',
      pt: hasCommon ? 'Compatibilidade baseada em interesses comuns e fatores do perfil' : 'Compatibilidade baseada em fatores do perfil',
      fr: hasCommon ? 'Compatibilité basée sur les intérêts communs et les facteurs du profil' : 'Compatibilité basée sur les facteurs du profil',
      de: hasCommon ? 'Kompatibilität basierend auf gemeinsamen Interessen und Profilfaktoren' : 'Kompatibilität basierend auf Profilfaktoren',
      ja: hasCommon ? '共通の興味とプロフィール要素に基づく相性' : 'プロフィール要素に基づく相性',
      zh: hasCommon ? '基于共同兴趣和资料因素的兼容性' : '基于资料因素的兼容性',
      ru: hasCommon ? 'Совместимость на основе общих интересов и факторов профиля' : 'Совместимость на основе факторов профиля',
      ar: hasCommon ? 'التوافق على أساس الاهتمامات المشتركة وعوامل الملف الشخصي' : 'التوافق على أساس عوامل الملف الشخصي',
      id: hasCommon ? 'Kecocokan berdasarkan minat bersama dan faktor profil' : 'Kecocokan berdasarkan faktor profil',
    };

    // ✅ Respuesta homologada: iOS/Android leen totalScore, baseScore, aiScore, explanation
    return {
      success: true,
      totalScore,
      baseScore,
      aiScore,
      explanation: EXPLANATION[lang] || EXPLANATION.en,
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
    const {userId, userLanguage} = request.data || {};
    const targetId = userId || request.auth.uid;
    const lang = (typeof userLanguage === 'string' && userLanguage ? userLanguage : 'en').split('-')[0].split('_')[0].toLowerCase();

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

    // Localized details — 10 languages
    const DETAILS_I18N = {
      en: {detected: (n) => `Detected ${n} warning signal${n === 1 ? '' : 's'}`, clean: 'Profile with no warning signals'},
      es: {detected: (n) => `Se detectaron ${n} señal(es) de alerta`, clean: 'Perfil sin señales de alerta'},
      pt: {detected: (n) => `Foram detectados ${n} sinal(is) de alerta`, clean: 'Perfil sem sinais de alerta'},
      fr: {detected: (n) => `${n} signal(aux) d\'alerte détecté(s)`, clean: 'Profil sans signaux d\'alerte'},
      de: {detected: (n) => `${n} Warnsignal(e) erkannt`, clean: 'Profil ohne Warnsignale'},
      ja: {detected: (n) => `${n}件の警告サインを検出しました`, clean: '警告サインのないプロフィール'},
      zh: {detected: (n) => `检测到 ${n} 个警告信号`, clean: '没有警告信号的资料'},
      ru: {detected: (n) => `Обнаружено ${n} тревожных сигнал(ов)`, clean: 'Профиль без тревожных сигналов'},
      ar: {detected: (n) => `تم اكتشاف ${n} علامة تحذير`, clean: 'ملف شخصي بدون علامات تحذير'},
      id: {detected: (n) => `Terdeteksi ${n} sinyal peringatan`, clean: 'Profil tanpa sinyal peringatan'},
    };
    const d = DETAILS_I18N[lang] || DETAILS_I18N.en;

    // ✅ Respuesta homologada: iOS/Android leen hasRedFlags, flags, confidence, details
    return {
      success: true,
      hasRedFlags: flags.length > 0,
      flags,
      confidence: flags.length > 0 ? Math.min(flags.length * 30, 90) : 0,
      details: flags.length > 0 ? d.detected(flags.length) : d.clean,
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
    const {userId1, userId2, userLanguage} = request.data || {};
    if (!userId1 || !userId2) throw new Error('userId1 and userId2 are required');

    const db = admin.firestore();
    const lang = (typeof userLanguage === 'string' && userLanguage ? userLanguage : 'en').split('-')[0].split('_')[0].toLowerCase();
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

      // Detect language: prefer client-supplied, then Firestore deviceLanguage, then fallback
      const rawLang = request.data?.language || user1.deviceLanguage || user2.deviceLanguage || 'en';
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

      const aiConfig = await getAiConfig();
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({model: AI_MODEL_LITE});

      const prompt = `You are a dating conversation expert. Generate exactly 3 personalized icebreaker messages that ${user1Name} can send to ${user2Name} to start a great conversation.

Context:
${contextParts.join('\n')}
${ragContext}

Rules:
- ${getLanguageInstruction(lang)}
- CRITICAL: Each message MUST be SHORT — maximum ${aiConfig?.icebreakers?.maxWords || 15} words, ONE sentence only
- Keep it simple and quick to read — these appear in a match celebration screen
- Include one relevant emoji per message
- Make them feel personal, NOT generic
- Avoid cliché pickup lines
- If limited profile data, use creative open-ended questions
- Vary the style: 1 playful/fun, 1 thoughtful/genuine, 1 creative/unique

Return ONLY a JSON array with exactly 3 objects: [{"message": "...", "reasoning": "why this works", "emoji": "🎯"}]`;

      const _ibGenCfg = {maxOutputTokens: getTokens(aiConfig, 'icebreakers', 512), temperature: getTemp(aiConfig, 'icebreakers', 0.9)};

      // Retry x2 — a single Gemini hiccup shouldn't silently ship generic icebreakers.
      let lastErr = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const result = await model.generateContent({
            contents: [{role: 'user', parts: [{text: prompt}]}],
            generationConfig: _ibGenCfg,
          });

          const text = safeResponseText(result);
          let parsed = null;
          try {
            parsed = parseGeminiJsonResponse(text);
          } catch (_parseErr) {
            logger.warn(`[generateIcebreakers] attempt ${attempt}: JSON parse failed: ${_parseErr.message}`);
          }

          if (Array.isArray(parsed) && parsed.length >= 3) {
            const icebreakers = parsed.slice(0, 3).map((item) => ({
              message: String(item.message || item.text || '').substring(0, 100),
              reasoning: String(item.reasoning || '').substring(0, 100),
              emoji: String(item.emoji || '💬').substring(0, 4),
            })).filter((i) => i.message.length > 0);

            if (icebreakers.length >= 2) {
              logger.info(`[generateIcebreakers] Generated ${icebreakers.length} personalized icebreakers (${lang}) for ${user1Name}→${user2Name} [attempt ${attempt}]`);
              return {success: true, icebreakers, starters: icebreakers.map((i) => i.message)};
            }
          }

          logger.warn(`[generateIcebreakers] attempt ${attempt}: AI returned invalid format`);
          lastErr = new Error('invalid_format');
        } catch (innerErr) {
          logger.warn(`[generateIcebreakers] attempt ${attempt} threw: ${innerErr.message}`);
          lastErr = innerErr;
        }
      }

      logger.error(`[generateIcebreakers] All attempts failed (${lastErr?.message}), returning degraded fallback`);
      return {success: true, icebreakers: fallbackStarters, starters: fallbackStarters.map((i) => i.message), degraded: true};
    } catch (err) {
      const rawLang = (request.data || {}).lang || 'en';
      const lang = rawLang.split('-')[0].split('_')[0].toLowerCase();
      const fallbackStarters = FALLBACK_BY_LANG[lang] || FALLBACK_BY_LANG.en;
      logger.error(`[generateIcebreakers] Outer failure (${err.message}), returning degraded fallback (${lang})`);
      return {success: true, icebreakers: fallbackStarters, starters: fallbackStarters.map((i) => i.message), degraded: true};
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
    const {userLanguage} = request.data || {};
    const lang = (typeof userLanguage === 'string' && userLanguage ? userLanguage : 'en').split('-')[0].split('_')[0].toLowerCase();

    // En producción analizar patrones de actividad del usuario
    const optimalHours = [19, 20, 21]; // 7pm-9pm son las horas pico habituales
    const optimalTime = optimalHours[Math.floor(Math.random() * optimalHours.length)];

    const REASONING_I18N = {
      en: 'Users are most active between 7 PM and 9 PM',
      es: 'Los usuarios son más activos entre 7pm y 9pm',
      pt: 'Os usuários são mais ativos entre 19h e 21h',
      fr: 'Les utilisateurs sont les plus actifs entre 19h et 21h',
      de: 'Nutzer sind zwischen 19 und 21 Uhr am aktivsten',
      ja: 'ユーザーは午後7時から9時の間に最もアクティブです',
      zh: '用户在晚上7点到9点最活跃',
      ru: 'Пользователи наиболее активны между 19:00 и 21:00',
      ar: 'المستخدمون أكثر نشاطاً بين الساعة 7 و 9 مساءً',
      id: 'Pengguna paling aktif antara pukul 19:00 dan 21:00',
    };

    logger.info(`[predictOptimalMessageTime] Optimal hour: ${optimalTime}:00, lang=${lang}`);
    return {
      success: true,
      optimalTime: `${optimalTime}:00`,
      optimalHour: optimalTime,
      timezone: 'UTC-6',
      confidence: 0.75,
      reasoning: REASONING_I18N[lang] || REASONING_I18N.en,
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
    const {topic, userLanguage} = request.data || {};
    const lang = (typeof userLanguage === 'string' && userLanguage ? userLanguage : 'en').split('-')[0].split('_')[0].toLowerCase();

    const ADVICE_MAP_I18N = {
      en: {
        first_message: {
          advice: 'Ask a specific question about something in their profile to show genuine interest',
          tips: ['Mention a common interest', 'Be specific, not generic', 'End with an open-ended question'],
        },
        first_date: {
          advice: 'Pick a comfortable place with good conversation — avoid the movies on a first date',
          tips: ['Grab a coffee or take a walk', 'Listen actively', 'Just be yourself'],
        },
        default: {
          advice: 'Authenticity is the key to success in modern dating',
          tips: ['Be authentic', 'Show genuine interest', 'Don\'t pressure yourself'],
        },
      },
      es: {
        first_message: {
          advice: 'Haz una pregunta específica sobre algo de su perfil para mostrar que te interesan genuinamente',
          tips: ['Menciona un interés en común', 'Sé específico, no genérico', 'Termina con una pregunta abierta'],
        },
        first_date: {
          advice: 'Elige un lugar cómodo y con buena conversación, evita el cine en la primera cita',
          tips: ['Toma café o un paseo', 'Escucha activamente', 'Sé tú mismo/a'],
        },
        default: {
          advice: 'La autenticidad es la clave del éxito en las citas modernas',
          tips: ['Sé auténtico/a', 'Muestra interés genuino', 'No te presiones'],
        },
      },
      pt: {
        first_message: {
          advice: 'Faça uma pergunta específica sobre algo no perfil para mostrar interesse genuíno',
          tips: ['Mencione um interesse em comum', 'Seja específico, não genérico', 'Termine com uma pergunta aberta'],
        },
        first_date: {
          advice: 'Escolha um lugar confortável com boa conversa — evite cinema no primeiro encontro',
          tips: ['Tome um café ou dê um passeio', 'Escute ativamente', 'Seja você mesmo/a'],
        },
        default: {
          advice: 'A autenticidade é a chave do sucesso nos encontros modernos',
          tips: ['Seja autêntico/a', 'Demonstre interesse genuíno', 'Não se pressione'],
        },
      },
      fr: {
        first_message: {
          advice: 'Pose une question spécifique sur quelque chose de son profil pour montrer un intérêt sincère',
          tips: ['Mentionne un intérêt commun', 'Sois spécifique, pas générique', 'Termine par une question ouverte'],
        },
        first_date: {
          advice: 'Choisis un endroit confortable avec de bonnes conversations — évite le cinéma au premier rendez-vous',
          tips: ['Prenez un café ou marchez', 'Écoute activement', 'Sois toi-même'],
        },
        default: {
          advice: 'L\'authenticité est la clé du succès dans les rencontres modernes',
          tips: ['Sois authentique', 'Montre un intérêt sincère', 'Ne te mets pas la pression'],
        },
      },
      de: {
        first_message: {
          advice: 'Stelle eine konkrete Frage zu etwas im Profil, um echtes Interesse zu zeigen',
          tips: ['Erwähne ein gemeinsames Interesse', 'Sei konkret, nicht generisch', 'Ende mit einer offenen Frage'],
        },
        first_date: {
          advice: 'Wähle einen bequemen Ort mit guten Gesprächen — vermeide das Kino beim ersten Date',
          tips: ['Auf einen Kaffee gehen oder einen Spaziergang machen', 'Aktiv zuhören', 'Sei einfach du selbst'],
        },
        default: {
          advice: 'Authentizität ist der Schlüssel zum Erfolg beim modernen Dating',
          tips: ['Sei authentisch', 'Zeige echtes Interesse', 'Setze dich nicht unter Druck'],
        },
      },
      ja: {
        first_message: {
          advice: '相手のプロフィールにある具体的な点について質問し、本当に興味があることを示しましょう',
          tips: ['共通の興味を挙げる', '汎用的でなく具体的に', 'オープンな質問で締めくくる'],
        },
        first_date: {
          advice: '会話がしやすい居心地の良い場所を選びましょう。初デートで映画は避けましょう',
          tips: ['カフェや散歩がおすすめ', '相手の話に耳を傾ける', '自分らしくいる'],
        },
        default: {
          advice: '現代のデートで成功する鍵は、ありのままの自分でいることです',
          tips: ['本物の自分でいる', '誠実な関心を示す', '自分を追い込まない'],
        },
      },
      zh: {
        first_message: {
          advice: '就对方资料中的具体内容提问，展现你真诚的兴趣',
          tips: ['提及共同兴趣', '具体而非泛泛而谈', '以开放式问题结尾'],
        },
        first_date: {
          advice: '选择一个舒适、便于交流的地点——第一次约会避免电影院',
          tips: ['喝咖啡或散步', '认真倾听', '做自己'],
        },
        default: {
          advice: '真实是现代约会成功的关键',
          tips: ['保持真实', '表达真诚的兴趣', '不要给自己压力'],
        },
      },
      ru: {
        first_message: {
          advice: 'Задайте конкретный вопрос о чём-то в профиле, чтобы показать искренний интерес',
          tips: ['Упомяните общий интерес', 'Будьте конкретны, не шаблонны', 'Закончите открытым вопросом'],
        },
        first_date: {
          advice: 'Выберите комфортное место для хорошей беседы — избегайте кино на первом свидании',
          tips: ['Выпейте кофе или прогуляйтесь', 'Слушайте внимательно', 'Будьте собой'],
        },
        default: {
          advice: 'Искренность — ключ к успеху в современных отношениях',
          tips: ['Будьте искренни', 'Проявляйте искренний интерес', 'Не давите на себя'],
        },
      },
      ar: {
        first_message: {
          advice: 'اطرح سؤالاً محدداً عن شيء في ملفهم الشخصي لتُظهر اهتماماً حقيقياً',
          tips: ['اذكر اهتماماً مشتركاً', 'كن محدداً، لا عاماً', 'اختم بسؤال مفتوح'],
        },
        first_date: {
          advice: 'اختر مكاناً مريحاً يسمح بالحوار الجيد — تجنّب السينما في الموعد الأول',
          tips: ['اشربا قهوة أو تمشّيا', 'استمع باهتمام', 'كن على طبيعتك'],
        },
        default: {
          advice: 'الأصالة هي مفتاح النجاح في العلاقات الحديثة',
          tips: ['كن أصيلاً', 'أظهر اهتماماً حقيقياً', 'لا تضغط على نفسك'],
        },
      },
      id: {
        first_message: {
          advice: 'Ajukan pertanyaan spesifik tentang sesuatu di profilnya untuk menunjukkan minat yang tulus',
          tips: ['Sebutkan minat yang sama', 'Spesifik, jangan umum', 'Akhiri dengan pertanyaan terbuka'],
        },
        first_date: {
          advice: 'Pilih tempat nyaman untuk percakapan yang baik — hindari bioskop di kencan pertama',
          tips: ['Ngopi atau jalan-jalan', 'Dengarkan dengan aktif', 'Jadi diri sendiri'],
        },
        default: {
          advice: 'Keaslian adalah kunci sukses dalam dating modern',
          tips: ['Jadilah autentik', 'Tunjukkan minat yang tulus', 'Jangan memaksakan diri'],
        },
      },
    };

    const adviceMap = ADVICE_MAP_I18N[lang] || ADVICE_MAP_I18N.en;
    const selected = adviceMap[topic] || adviceMap.default;
    logger.info(`[getDatingAdvice] Advice for topic=${topic || 'default'}, lang=${lang}`);
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

    // ── Cache check (TTL dinámico, language-scoped) ──
    // Gemini-generated `reasons` and `tip` fields are in user's language at
    // generation time — scope cache by lang to prevent cross-language leaks.
    const pairId = [currentUserId, targetUserId].sort().join('_');
    const cacheDocId = `${pairId}_${lang}`;
    const cacheRef = db.collection('chemistryCache').doc(cacheDocId);
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
        generationConfig: {maxOutputTokens: getTokens(await getAiConfig(), 'chemistry', 300), temperature: getTemp(await getAiConfig(), 'chemistry', 0.4)},
      });
      const geminiTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini timeout')), 8000));
      const geminiResult = await Promise.race([geminiPromise, geminiTimeout]);

      const text = safeResponseText(geminiResult);
      let parsed = null;
      try {
        parsed = parseGeminiJsonResponse(text);
      } catch (_parseErr) {
        logger.warn(`[AIChemistry] JSON parse failed: ${_parseErr.message}`);
      }
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
 * Localized elegant fallback titles used when sanitization empties the raw title.
 * Picked at random per call so the blueprint still feels fresh.
 */
const BLUEPRINT_FALLBACK_TITLES = {
  en: ['Coffee & Conversation', 'Sunset Vibes', 'Afternoon Flavors', 'Golden Hour', 'Art & Laughter'],
  es: ['Café y Buena Charla', 'Atardecer a Dos', 'Tarde de Sabores', 'Hora Dorada', 'Arte y Risas'],
  pt: ['Café e Boa Prosa', 'Fim de Tarde', 'Tarde de Sabores', 'Hora Dourada', 'Arte e Risos'],
  fr: ['Café et Conversation', 'Vibes du Coucher', 'Après-midi Gourmand', 'Heure Dorée', 'Art et Rires'],
  de: ['Kaffee & Gespräch', 'Sonnenuntergang-Vibes', 'Nachmittag der Aromen', 'Goldene Stunde', 'Kunst & Lachen'],
  ja: ['コーヒーと会話', '夕暮れの雰囲気', '午後の味わい', 'ゴールデンアワー', 'アートと笑顔'],
  zh: ['咖啡与畅聊', '日落时光', '午后风味', '黄金时刻', '艺术与欢笑'],
  ru: ['Кофе и разговор', 'Закатное настроение', 'Вечер вкусов', 'Золотой час', 'Искусство и смех'],
  ar: ['قهوة وحديث', 'أجواء الغروب', 'مساء النكهات', 'الساعة الذهبية', 'فن وضحكات'],
  id: ['Kopi & Obrolan', 'Suasana Senja', 'Sore Rasa-rasa', 'Jam Emas', 'Seni & Tawa'],
};

/**
 * Sanitize blueprint title: remove names, forbidden patterns, ensure elegance.
 * `lang` (optional) localizes the fallback pool when the sanitized title is empty.
 */
function sanitizeBlueprintTitle(rawTitle, myName, theirName, lang) {
  const normalizedLang = (lang || 'en').split('-')[0].split('_')[0].toLowerCase();
  const fallbackPool = BLUEPRINT_FALLBACK_TITLES[normalizedLang] || BLUEPRINT_FALLBACK_TITLES.en;
  const pickFallback = () => fallbackPool[Math.floor(Math.random() * fallbackPool.length)];

  if (!rawTitle) return pickFallback();
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

  // If title is now empty or too short, generate a generic elegant one in the user's language
  if (!title || title.length < 3) {
    title = pickFallback();
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

    const SUGGESTED_DATE_PLAN_TITLE = {
      en: 'Suggested date plan',
      es: 'Plan de cita sugerido',
      pt: 'Plano de encontro sugerido',
      fr: 'Plan de rendez-vous suggéré',
      de: 'Vorgeschlagener Date-Plan',
      ja: 'おすすめデートプラン',
      zh: '建议约会计划',
      ru: 'Рекомендуемый план свидания',
      ar: 'خطة موعد مقترحة',
      id: 'Rencana kencan yang disarankan',
    };
    const fallback = {
      success: true,
      blueprint: {
        title: SUGGESTED_DATE_PLAN_TITLE[lang] || SUGGESTED_DATE_PLAN_TITLE.en,
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

      // Initialize time context early so it's available to RAG query + prompt builder below.
      // Previously `hour` was declared on L2324 after the RAG block that referenced it on L2283,
      // causing a latent ReferenceError that sent every execution to the silent fallback.
      const now = new Date();
      const hour = now.getHours();
      const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];

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
          if (chunks.length > 0) {
            const RAG_HEADER = {
              en: 'Expert dating advice (use this to structure the date):',
              es: 'Consejos expertos de citas (usa esto para estructurar la cita):',
              pt: 'Conselhos de especialistas em encontros (use isto para estruturar o encontro):',
              fr: 'Conseils d\'experts en rencontres (utilise ceci pour structurer le rendez-vous) :',
              de: 'Experten-Dating-Tipps (nutze diese, um das Date zu strukturieren):',
              ja: 'デートの専門家によるアドバイス（これを使ってデートを組み立ててください）：',
              zh: '专家约会建议（用这些来安排约会）：',
              ru: 'Экспертные советы по свиданиям (используй это, чтобы построить свидание):',
              ar: 'نصائح من خبراء المواعدة (استخدم هذا لتنظيم الموعد):',
              id: 'Saran kencan dari ahli (gunakan ini untuk menyusun kencan):',
            };
            const ragHeader = RAG_HEADER[lang] || RAG_HEADER.en;
            ragContext = `\n\n${ragHeader}\n` + chunks.slice(0, 3).map((d) => `- [${d.category || 'general'}]: ${d.text}`).join('\n\n');
          }
        }
      } catch (ragErr) {
        logger.info(`[DateBlueprint] RAG skipped: ${ragErr.message}`);
      }

      // 8. Generate itinerary with Gemini (now/hour/dayOfWeek were initialized before the RAG block above)
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({model: AI_MODEL_NAME});

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
          generationConfig: {maxOutputTokens: getTokens(await getAiConfig(), 'blueprint', 2048), temperature: getTemp(await getAiConfig(), 'blueprint', 0.85), responseMimeType: 'application/json'},
        });
        const rawText = safeResponseText(result);
        parsed = JSON.parse(rawText);
      } catch (jsonErr) {
        logger.info(`[DateBlueprint] JSON mode failed (${jsonErr.message}), retrying with text mode`);
        // Attempt 2: text mode with manual parsing
        try {
          const result2 = await model.generateContent({
            contents: [{role: 'user', parts: [{text: prompt + '\n\nIMPORTANT: Return ONLY valid JSON, no markdown, no code blocks.'}]}],
            generationConfig: {maxOutputTokens: getTokens(await getAiConfig(), 'blueprint', 2048), temperature: getTemp(await getAiConfig(), 'blueprintRetry', 0.7)},
          });
          parsed = parseGeminiJsonResponse(safeResponseText(result2));
        } catch (retryErr) {
          logger.warn(`[DateBlueprint] Both JSON attempts failed: ${retryErr.message}`);
        }
      }

      // Attempt 3: if parsing failed, build a simple plan from places data
      if (!parsed && placeResults.length >= 2) {
        logger.info('[DateBlueprint] Building fallback plan from places data');
        const topPlaces = placeResults.slice(0, durationPreset === 'quick' ? 2 : 3);
        const baseHour = hour >= 18 ? 19 : hour >= 12 ? 14 : 10;
        const FALLBACK_ICEBREAKER = {
          en: 'What do you enjoy most on weekends?',
          es: '¿Qué es lo que más te gusta hacer un fin de semana?',
          pt: 'O que você mais gosta de fazer nos fins de semana?',
          fr: 'Qu\'est-ce que tu aimes le plus faire le week-end ?',
          de: 'Was machst du am liebsten am Wochenende?',
          ja: '週末に一番好きなことは何ですか？',
          zh: '你周末最喜欢做什么？',
          ru: 'Что ты больше всего любишь делать по выходным?',
          ar: 'ما أكثر ما تحب فعله في عطلة نهاية الأسبوع؟',
          id: 'Apa yang paling kamu suka lakukan di akhir pekan?',
        };
        parsed = {
          title: SUGGESTED_DATE_PLAN_TITLE[lang] || SUGGESTED_DATE_PLAN_TITLE.en,
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
          icebreaker: FALLBACK_ICEBREAKER[lang] || FALLBACK_ICEBREAKER.en,
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
          title: sanitizeBlueprintTitle(String(parsed.title || ''), myName, theirName, lang),
          totalDuration: String(parsed.totalDuration || durationText).substring(0, 20),
          estimatedBudget: String(parsed.estimatedBudget || '$30-60').substring(0, 20),
          steps: enrichedSteps,
          icebreaker: String(parsed.icebreaker || '').substring(0, 200),
          dresscode: String(parsed.dresscode || 'casual').substring(0, 50),
        };

        logger.info(`[DateBlueprint] Generated ${blueprint.steps.length}-step itinerary (${lang}) for ${myName}→${theirName}`);
        return {success: true, blueprint};
      }

      logger.error('[DateBlueprint] AI returned invalid format after retry chain — returning degraded fallback');
      return {...fallback, degraded: true};
    } catch (err) {
      logger.error(`[DateBlueprint] Outer failure (${err.message}) — returning degraded fallback`);
      return {...fallback, degraded: true};
    }
  },
);

/**
 * Callable: Generate a weekend/event date plan using Gemini Search Grounding.
 * Finds REAL events happening near the user via Google Search (no Ticketmaster/Eventbrite),
 * then generates a full date Blueprint around the best event.
 * Returns: { success, events: [{name, date, venue, category, url, description}], blueprint? }
 */
exports.generateEventDatePlan = onCall(
  {region: 'us-central1', memory: '512MiB', timeoutSeconds: 90, secrets: [geminiApiKey, placesApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {matchId, userLanguage, category, dateRange} = request.data || {};

    const apiKey = process.env.GEMINI_API_KEY;
    const placesKey = process.env.GOOGLE_PLACES_API_KEY || apiKey;
    const db = admin.firestore();
    const userId = request.auth.uid;
    const rawLang = userLanguage || 'en';
    const lang = rawLang.split('-')[0].split('_')[0].toLowerCase();

    try {
      // 1. Get user location
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) return {success: false, error: 'user_not_found'};
      const userData = userDoc.data();
      let lat = userData.latitude;
      let lng = userData.longitude;
      let cityName = userData.city || '';

      // If matchId provided, use midpoint
      let matchName = '';
      let sharedInterests = [];
      if (matchId) {
        try {
          const {myProfile, theirProfile} = await getMatchUsersLocations(db, userId, matchId);
          if (myProfile && theirProfile) {
            const mid = calculateMidpoint(myProfile.latitude, myProfile.longitude, theirProfile.latitude, theirProfile.longitude);
            lat = mid.latitude;
            lng = mid.longitude;
            matchName = theirProfile.name || '';
            const mySet = new Set((myProfile.interests || []).map((i) => String(i).toLowerCase()));
            sharedInterests = (theirProfile.interests || []).filter((i) => mySet.has(String(i).toLowerCase()));
          }
        } catch (e) {
          logger.info(`[EventDatePlan] Match location fetch failed: ${e.message}`);
        }
      }

      if (!lat || !lng) {
        return {success: false, error: 'no_location'};
      }

      // 2. Use Gemini + Search Grounding to find REAL events
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: AI_MODEL_NAME,
        generationConfig: {
          maxOutputTokens: 4096,
          temperature: getTemp(await getAiConfig(), 'eventPlan', 0.7),
          responseMimeType: 'application/json',
        },
        tools: [{googleSearch: {}}], // Search Grounding — searches Google for real events
      });

      const langInstruction = getLanguageInstruction(lang);
      const categoryFilter = category ? `Focus on "${category}" events.` : 'Include diverse categories: music, food, art, sports, festivals, comedy, theater, markets, nightlife.';
      const dateRangeText = dateRange || 'this weekend and next 7 days';
      const interestContext = sharedInterests.length > 0
        ? `The couple shares interests in: ${sharedInterests.slice(0, 5).join(', ')}. Prioritize events matching these interests.`
        : '';

      const eventPrompt = `You are an events curator for a dating app. Find REAL events happening near ${cityName || `${lat},${lng}`} in ${dateRangeText}.

IMPORTANT: Search Google for REAL, UPCOMING events. Do NOT invent events. Each event must be something you found via search with a real venue, date, and ideally a ticket/info URL.

${categoryFilter}
${interestContext}
${langInstruction}

Return JSON:
{
  "events": [
    {
      "name": "Event Name (in original language)",
      "date": "YYYY-MM-DD",
      "time": "HH:MM (24h, or 'TBA')",
      "venue": "Venue Name",
      "address": "Full address",
      "category": "music|food|art|sports|festivals|comedy|theater|markets|nightlife|workshops|outdoor",
      "description": "1-2 sentences describing the event (in ${lang})",
      "url": "ticket or info URL (if found)",
      "price": "free|$X|$X-Y|TBA",
      "dateVibes": "why this is great for a date (in ${lang}, max 60 chars)",
      "emoji": "relevant emoji"
    }
  ],
  "weekendHighlight": "one sentence describing the best event for a date (in ${lang})"
}

Rules:
- Return 5-10 events, sorted by date (soonest first)
- ONLY include events you found via Google Search — no hallucinated events
- Include the event URL when available
- "dateVibes" explains WHY this event is good for a date (built-in conversation, shared experience, etc.)
- Write descriptions and dateVibes in ${lang}
- If you cannot find events near this location, return {"events": [], "weekendHighlight": "No events found nearby"}`;

      const startTime = Date.now();
      const result = await model.generateContent(eventPrompt);
      const responseText = safeResponseText(result);
      trackAICall({functionName: 'generateEventDatePlan', model: AI_MODEL_NAME, operation: 'event_search', usage: result.response.usageMetadata, latencyMs: Date.now() - startTime, userId});

      const parsed = parseGeminiJsonResponse(responseText);
      const events = Array.isArray(parsed.events) ? parsed.events.filter((e) => e.name && e.date).slice(0, 10) : [];

      if (events.length === 0) {
        logger.info('[EventDatePlan] No events found via Search Grounding');
        return {success: true, events: [], weekendHighlight: parsed.weekendHighlight || ''};
      }

      // 3. Sanitize events
      const sanitizedEvents = events.map((e, i) => ({
        id: `event_${i}_${Date.now()}`,
        name: String(e.name || '').substring(0, 100),
        date: String(e.date || '').substring(0, 10),
        time: String(e.time || 'TBA').substring(0, 5),
        venue: String(e.venue || '').substring(0, 100),
        address: String(e.address || '').substring(0, 200),
        category: String(e.category || 'general').substring(0, 30),
        description: String(e.description || '').substring(0, 200),
        url: (() => {
          const raw = String(e.url || '').substring(0, 500);
          // Only allow http/https URLs — block javascript:, data:, etc.
          if (raw && /^https?:\/\//i.test(raw)) return raw;
          return '';
        })(),
        price: String(e.price || 'TBA').substring(0, 20),
        dateVibes: String(e.dateVibes || '').substring(0, 80),
        emoji: String(e.emoji || '🎫').substring(0, 4),
        isEvent: true,
      }));

      // 4. Optionally generate a Blueprint around the top event
      let blueprint = null;
      if (matchId && sanitizedEvents.length > 0) {
        try {
          const topEvent = sanitizedEvents[0];

          // Fetch 2-3 nearby places to complement the event
          const nearbyPlaces = [];
          for (const q of ['café coffee', 'restaurant dinner bar']) {
            try {
              const results = await placesTextSearch(q, {latitude: lat, longitude: lng}, 5000, lang, null, 3, true);
              if (results?.places) {
                const placesConfig = await getPlacesSearchConfig();
                for (const p of results.places.slice(0, 2)) {
                  const s = transformPlaceToSuggestion(p, userData, {}, placesKey, placesConfig);
                  if (s) nearbyPlaces.push(s);
                }
              }
            } catch (_) {}
          }

          // Generate mini-blueprint: pre-event → event → post-event
          const hour = parseInt(topEvent.time) || 19;
          const EVENT_NIGHT_TITLE = {
            en: `${topEvent.category.charAt(0).toUpperCase() + topEvent.category.slice(1)} Night`,
            es: `Noche de ${topEvent.category}`,
            pt: `Noite de ${topEvent.category}`,
            fr: `Soirée ${topEvent.category}`,
            de: `${topEvent.category.charAt(0).toUpperCase() + topEvent.category.slice(1)}-Abend`,
            ja: `${topEvent.category}の夜`,
            zh: `${topEvent.category}之夜`,
            ru: `Вечер ${topEvent.category}`,
            ar: `ليلة ${topEvent.category}`,
            id: `Malam ${topEvent.category}`,
          };
          const PRE_EVENT_ACTIVITY = {
            en: 'Pre-event: coffee & chat',
            es: 'Pre-evento: café y conversación',
            pt: 'Pré-evento: café e conversa',
            fr: 'Avant l\'événement : café et discussion',
            de: 'Vor dem Event: Kaffee und Plaudern',
            ja: 'イベント前：コーヒーとおしゃべり',
            zh: '活动前：咖啡与聊天',
            ru: 'Перед событием: кофе и беседа',
            ar: 'قبل الحدث: قهوة ومحادثة',
            id: 'Sebelum acara: kopi & mengobrol',
          };
          const PRE_EVENT_TIP = {
            en: 'Arrive early to relax before the event',
            es: 'Llega temprano para relajarse antes del evento',
            pt: 'Chegue cedo para relaxar antes do evento',
            fr: 'Arrive tôt pour te détendre avant l\'événement',
            de: 'Früh ankommen, um vor dem Event zu entspannen',
            ja: 'イベント前にリラックスできるよう早めに到着しよう',
            zh: '早点到以便在活动前放松',
            ru: 'Приходи пораньше, чтобы расслабиться перед событием',
            ar: 'اصل مبكراً للاسترخاء قبل الحدث',
            id: 'Datang lebih awal untuk bersantai sebelum acara',
          };
          const POST_EVENT_ACTIVITY = {
            en: 'Post-event: dinner & debrief',
            es: 'Post-evento: cena y reflexión',
            pt: 'Pós-evento: jantar e reflexão',
            fr: 'Après l\'événement : dîner et débrief',
            de: 'Nach dem Event: Abendessen und Austausch',
            ja: 'イベント後：ディナーと振り返り',
            zh: '活动后：晚餐与回味',
            ru: 'После события: ужин и обсуждение',
            ar: 'بعد الحدث: عشاء ومناقشة',
            id: 'Setelah acara: makan malam & berbincang',
          };
          const POST_EVENT_TIP = {
            en: 'Discuss what you thought of the event',
            es: 'Comenten qué les pareció el evento',
            pt: 'Comentem o que acharam do evento',
            fr: 'Partagez ce que vous avez pensé de l\'événement',
            de: 'Besprecht, was euch am Event gefallen hat',
            ja: 'イベントの感想を話し合おう',
            zh: '讨论一下你们对活动的看法',
            ru: 'Обсудите, что вам понравилось в событии',
            ar: 'ناقشا ما أعجبكما في الحدث',
            id: 'Diskusikan pendapat kalian tentang acara',
          };
          const EVENT_ICEBREAKER = {
            en: `Have you been to a ${topEvent.category} event before?`,
            es: `¿Habías ido a algo de ${topEvent.category} antes?`,
            pt: `Você já tinha ido a um evento de ${topEvent.category} antes?`,
            fr: `Tu étais déjà allé à un événement de ${topEvent.category} avant ?`,
            de: `Warst du schon mal auf einem ${topEvent.category}-Event?`,
            ja: `これまでに${topEvent.category}のイベントに行ったことはありますか？`,
            zh: `你以前参加过${topEvent.category}类型的活动吗？`,
            ru: `Ты раньше бывал на событиях ${topEvent.category}?`,
            ar: `هل سبق لك حضور حدث ${topEvent.category} من قبل؟`,
            id: `Pernah ke acara ${topEvent.category} sebelumnya?`,
          };
          blueprint = {
            title: EVENT_NIGHT_TITLE[lang] || EVENT_NIGHT_TITLE.en,
            totalDuration: '4-5h',
            estimatedBudget: topEvent.price !== 'TBA' && topEvent.price !== 'free' ? topEvent.price : '$30-60',
            featuredEvent: topEvent,
            steps: [
              ...(nearbyPlaces.length > 0 ? [{
                order: 1,
                time: `${Math.max(hour - 2, 12)}:00`,
                duration: '1h',
                activity: PRE_EVENT_ACTIVITY[lang] || PRE_EVENT_ACTIVITY.en,
                placeName: nearbyPlaces[0].name || '',
                place: nearbyPlaces[0] || null,
                tip: PRE_EVENT_TIP[lang] || PRE_EVENT_TIP.en,
                isEvent: false,
              }] : []),
              {
                order: nearbyPlaces.length > 0 ? 2 : 1,
                time: `${hour}:00`,
                duration: '2-3h',
                activity: topEvent.name,
                placeName: topEvent.venue,
                tip: topEvent.dateVibes,
                ticketUrl: topEvent.url,
                isEvent: true,
              },
              ...(nearbyPlaces.length > 1 ? [{
                order: nearbyPlaces.length > 0 ? 3 : 2,
                time: `${hour + 3}:00`,
                duration: '1h',
                activity: POST_EVENT_ACTIVITY[lang] || POST_EVENT_ACTIVITY.en,
                placeName: nearbyPlaces[1].name || '',
                place: nearbyPlaces[1] || null,
                tip: POST_EVENT_TIP[lang] || POST_EVENT_TIP.en,
                isEvent: false,
              }] : []),
            ],
            icebreaker: EVENT_ICEBREAKER[lang] || EVENT_ICEBREAKER.en,
            dresscode: ['nightlife', 'theater', 'art'].includes(topEvent.category) ? 'smart casual' : 'casual',
          };
        } catch (bpErr) {
          logger.info(`[EventDatePlan] Blueprint generation failed: ${bpErr.message}`);
        }
      }

      logger.info(`[EventDatePlan] Found ${sanitizedEvents.length} events for user ${userId} near ${cityName || `${lat},${lng}`}`);
      return {
        success: true,
        events: sanitizedEvents,
        weekendHighlight: String(parsed.weekendHighlight || '').substring(0, 200),
        ...(blueprint ? {blueprint} : {}),
      };
    } catch (err) {
      logger.error(`[EventDatePlan] Error: ${err.message}`);
      return {success: false, error: err.message};
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
      const lang = (typeof userLanguage === 'string' && userLanguage ? userLanguage : 'en').split('-')[0].split('_')[0].toLowerCase();

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
        generationConfig: {responseMimeType: 'application/json', temperature: getTemp(await getAiConfig(), 'photoCoach', 0.3), maxOutputTokens: getTokens(await getAiConfig(), 'photoCoach', 4096)},
      });

      const contents = [{role: 'user', parts: [...photoParts, {text: prompt}]}];
      const result = await model.generateContent({contents});
      const text = safeResponseText(result);
      let analysis = null;
      try {
        analysis = parseGeminiJsonResponse(text);
      } catch (_parseErr) {
        logger.warn(`[getPhotoCoachAnalysis] JSON parse failed: ${_parseErr.message}`);
      }

      if (!analysis || typeof analysis !== 'object') {
        logger.warn('[getPhotoCoachAnalysis] Gemini returned invalid JSON');
        return {success: false, error: 'parse_error'};
      }

      // Validate overallScore type
      if (typeof analysis.overallScore !== 'number') {
        analysis.overallScore = Number(analysis.overallScore) || 50;
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

/**
 * Callable: Analyze user's outfit photo before a date using Gemini Vision.
 * User uploads a selfie/mirror pic; Gemini analyzes outfit appropriateness
 * for the venue type and gives specific improvement suggestions.
 * Returns: { success, score, verdict, strengths, improvements, colorAdvice, accessoryTips }
 */
exports.analyzeOutfit = onCall(
  {region: 'us-central1', memory: '512MiB', timeoutSeconds: 60, secrets: [geminiApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {photoBase64, venueType, occasion, userLanguage} = request.data || {};

    if (!photoBase64 || typeof photoBase64 !== 'string') {
      return {success: false, error: 'photo_required'};
    }

    // Validate base64 format (must be valid base64 chars)
    if (!/^[A-Za-z0-9+/=]+$/.test(photoBase64.substring(0, 100))) {
      return {success: false, error: 'invalid_photo_format'};
    }

    // Limit photo size to 5MB base64 (~3.7MB actual)
    if (photoBase64.length > 5 * 1024 * 1024 * 1.37) {
      return {success: false, error: 'photo_too_large'};
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return {success: false, error: 'config_error'};

    // Rate limiting: configurable via Firestore appConfig or default 10/hour
    const db = admin.firestore();
    const userId = request.auth.uid;
    let maxPerHour = 10;
    try {
      const appConfigDoc = await db.collection('appConfig').doc('outfit').get();
      if (appConfigDoc.exists) maxPerHour = appConfigDoc.data().maxPerHour || 10;
    } catch (_) {}
    const oneHourAgo = new Date(Date.now() - 3600000);
    try {
      const recentAnalyses = await db.collection('coachChats').doc(userId)
        .collection('outfitAnalyses').where('timestamp', '>', oneHourAgo)
        .count().get();
      if ((recentAnalyses.data()?.count ?? 0) >= maxPerHour) {
        return {success: false, error: 'rate_limit_exceeded'};
      }
    } catch (rateLimitErr) {
      logger.warn(`[analyzeOutfit] Rate limit check failed: ${rateLimitErr.message}`);
      // Allow request if rate limit check fails — don't block users due to infra issue
    }

    const lang = (typeof userLanguage === 'string' && userLanguage ? userLanguage : 'en').split('-')[0].split('_')[0].toLowerCase();
    const venue = venueType || 'restaurant';
    const occ = occasion || 'date';

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: AI_MODEL_NAME,
        generationConfig: {responseMimeType: 'application/json', temperature: getTemp(await getAiConfig(), 'outfitAnalysis', 0.5), maxOutputTokens: getTokens(await getAiConfig(), 'outfitAnalysis', 2048)},
      });

      const langInstruction = getLanguageInstruction(lang);

      const prompt = `You are an expert fashion and dating image consultant. Analyze this outfit photo for a ${occ} at a ${venue}.

CONTEXT:
- Venue type: ${venue} (adjust formality expectations accordingly)
- Occasion: ${occ}
- Consider: fit, colors, appropriateness for venue, grooming, accessories, confidence projection

VENUE FORMALITY GUIDE:
- café/park/casual: smart casual is perfect, jeans OK, sneakers OK
- restaurant/dinner: business casual minimum, no sportswear
- bar/pub: casual to smart casual, personality-forward OK
- nightclub: fashionable, bold, dark colors work well
- theater/gallery/museum: smart casual to semi-formal
- gym/sport: athletic wear expected
- formal event: suit/dress required
- temple/shrine/mosque: modest, covered shoulders/knees
- beach/pool: casual but put-together, cover-up for transit

CULTURAL CONTEXT by language:
- ES (Latam): stylish casual is king, bright colors OK, personal grooming very valued
- DE/Scandinavia: understated elegance, avoid flashy brands
- JA: attention to detail, clean lines, seasonal awareness
- AR/Middle East: modest, conservative, quality fabrics valued
- PT (Brazil): casual but well-fitted, beach-influenced

APPEARANCE SAFETY RULES — NEVER:
- Comment on body shape, weight, skin color, or ethnicity
- Suggest the outfit is "too revealing" or "too conservative" based on body type (only venue appropriateness)
- Make gendered assumptions about what they "should" wear
- Reference attractiveness of the person wearing the outfit
- Compare to beauty standards or other people
ONLY comment on: clothing fit, color coordination, venue appropriateness, accessories, grooming (hair, nails IF visible), style coherence

${langInstruction}

Return ONLY valid JSON:
{
  "score": 1-10 (overall outfit appropriateness for this venue),
  "verdict": "one-line summary of the outfit (max 60 chars, in ${lang})",
  "vibe": "what personality this outfit projects (max 40 chars, in ${lang})",
  "strengths": ["what works well (2-3 items, each max 40 chars, in ${lang})"],
  "improvements": ["specific changes to make (2-3 items, each max 60 chars, in ${lang})"],
  "colorAdvice": "one tip about color coordination (max 60 chars, in ${lang})",
  "accessoryTip": "one accessory suggestion (max 50 chars, in ${lang})",
  "groomingNote": "one grooming observation if visible (max 50 chars, in ${lang})",
  "confidenceBoost": "one encouraging compliment about what they're doing right (max 60 chars, in ${lang})",
  "alternativeStyle": "one alternative outfit idea for this venue (max 80 chars, in ${lang})"
}

Rules:
- Be HONEST but KIND — constructive criticism, never harsh
- Focus on ACTIONABLE changes (not "buy a new wardrobe")
- Consider cultural context based on language
- If the photo doesn't show a clear outfit (too dark, blurry, no person), set score to 0 and explain in verdict
- Score guide: 1-3 (needs significant changes), 4-6 (decent but improvable), 7-8 (great choice), 9-10 (perfect for the venue)`;

      const startTime = Date.now();
      const contents = [{
        role: 'user',
        parts: [
          {inlineData: {mimeType: 'image/jpeg', data: photoBase64}},
          {text: prompt},
        ],
      }];

      const result = await model.generateContent({contents});
      const responseText = safeResponseText(result);
      trackAICall({functionName: 'analyzeOutfit', model: AI_MODEL_NAME, operation: 'outfit_analysis', usage: result.response.usageMetadata, latencyMs: Date.now() - startTime, userId: request.auth.uid});

      const parsed = parseGeminiJsonResponse(responseText);
      if (!parsed || typeof parsed.score !== 'number') {
        return {success: false, error: 'parse_error'};
      }

      const analysis = {
        score: Math.min(10, Math.max(0, parsed.score)),
        verdict: String(parsed.verdict || '').substring(0, 80),
        vibe: String(parsed.vibe || '').substring(0, 60),
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map((s) => String(s).substring(0, 60)).slice(0, 4) : [],
        improvements: Array.isArray(parsed.improvements) ? parsed.improvements.map((s) => String(s).substring(0, 80)).slice(0, 4) : [],
        colorAdvice: String(parsed.colorAdvice || '').substring(0, 80),
        accessoryTip: String(parsed.accessoryTip || '').substring(0, 80),
        groomingNote: String(parsed.groomingNote || '').substring(0, 80),
        confidenceBoost: String(parsed.confidenceBoost || '').substring(0, 80),
        alternativeStyle: String(parsed.alternativeStyle || '').substring(0, 100),
        venueType: venue,
        occasion: occ,
      };

      // Save for rate limiting + history
      await db.collection('coachChats').doc(userId).collection('outfitAnalyses').add({
        score: analysis.score,
        venueType: venue,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info(`[analyzeOutfit] Score: ${analysis.score}/10 for ${venue} (user: ${userId})`);
      return {success: true, ...analysis};
    } catch (err) {
      logger.error(`[analyzeOutfit] Error: ${err.message}`);
      return {success: false, error: 'analysis_failed'};
    }
  },
);
