'use strict';

/**
 * Situation Simulation — "Rehearse the moment before you live it"
 *
 * Given a user-described situation (e.g. "cómo le digo que la amo"),
 * generate 4 distinct approaches (different tones), simulate how the
 * specific match would react to each (using their persona profile),
 * score the reactions, and return a ranked report with coach tip and
 * psychology insights.
 *
 * Reuses from ./simulation:
 *   - buildPersonaProfile
 *   - buildAgentSystemPrompt
 *   - generateAgentTurn
 *   - queryPsychologyRAG
 *   - BEHAVIOR_ARCHETYPES
 *   - getSimulationConfig / isSimulationAllowed (RC gate)
 */

const crypto = require('crypto');
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {logger} = require('firebase-functions/v2');
const admin = require('firebase-admin');

const {
  geminiApiKey,
  AI_MODEL_NAME,
  AI_MODEL_LITE,
  GoogleGenerativeAI,
  getLanguageInstruction,
  parseGeminiJsonResponse,
  trackAICall,
} = require('./shared');

const {
  buildPersonaProfile,
  buildAgentSystemPrompt,
  generateAgentTurn,
  queryPsychologyRAG,
  getSimulationConfig,
  isSimulationAllowed,
} = require('./simulation');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SITUATION_TYPES = [
  'confession', 'conflict_repair', 'escalation', 'boundary',
  'planning', 'apology', 'checkin', 'other',
];

const FIXED_TONES = ['direct', 'playful', 'romantic_vulnerable', 'grounded_honest'];

// Safety guardrail patterns — when any of these match the user's situation,
// we return an ethical block WITHOUT consuming rate limit or calling Gemini.
const COERCIVE_PATTERNS = [
  /manipul/i,
  /force|forz/i,
  /trick|engañ/i,
  /mentir|lie to/i,
  /make (her|him|them) say yes/i,
  /convencerl/i,
  /sin consentim/i,
  /seducir sin/i,
];

// Localized ethical block message (10 languages)
const ETHICAL_BLOCK_MSG = {
  en: "Real connection can't be built on manipulation. Want me to help you reframe this from a more genuine place?",
  es: 'Las relaciones auténticas no se construyen con manipulación. ¿Quieres que reformulemos tu intención desde un lugar más genuino?',
  pt: 'Conexões reais não se constroem com manipulação. Quer que eu te ajude a reformular isso de um lugar mais genuíno?',
  fr: "Une vraie connexion ne se construit pas sur la manipulation. Veux-tu qu'on reformule ton intention de manière plus authentique ?",
  de: 'Echte Verbindung entsteht nicht durch Manipulation. Sollen wir deine Absicht aus einer authentischeren Haltung neu formulieren?',
  ja: '本当のつながりは操作では築けません。もっと誠実な視点から言い直すお手伝いをしましょうか？',
  zh: '真正的连结无法靠操控建立。要不要一起从更真诚的角度重新表达？',
  ru: 'Настоящая связь не строится на манипуляции. Хочешь, переформулируем твоё намерение более искренне?',
  ar: 'العلاقات الحقيقية لا تُبنى على التلاعب. هل تريد أن نعيد صياغة نيتك من مكان أكثر صدقاً؟',
  id: 'Koneksi sejati tidak bisa dibangun dengan manipulasi. Mau aku bantu merumuskan ulang dari niat yang lebih tulus?',
};

// Rate limit default for situation simulation (more generous than relationship sim)
const SITUATION_MAX_PER_DAY = 10;

// Cache TTL for situation simulations (6 hours)
const SITUATION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Reaction scoring — multilingual positive/negative signals
// Adapted from detectRebellion() signals but focused on 1-on-1 reactions.
// ---------------------------------------------------------------------------
const POSITIVE_SIGNALS = [
  // EN
  'yes', 'love', 'want', 'me too', 'same', 'agree', 'amazing', 'beautiful',
  'thank you', 'happy', 'excited', 'of course', 'always', 'forever',
  "i'd love", 'perfect', 'wonderful', 'i like', 'i feel', "i'm in",
  // ES
  'sí', 'también', 'claro', 'amo', 'quiero', 'gracias', 'me encanta',
  'perfecto', 'feliz', 'por supuesto', 'yo también', 'siempre',
  // PT
  'sim', 'também', 'adoro', 'quero', 'obrigad', 'claro', 'perfeito',
  'amo', 'feliz', 'eu também', 'sempre',
  // FR
  'oui', 'moi aussi', "j'aime", 'bien sûr', 'merci', 'parfait', 'toujours',
  // DE
  'ja', 'ich auch', 'liebe', 'natürlich', 'danke', 'perfekt', 'immer',
  // JA
  'はい', '私も', '好き', 'ありがとう', 'うれしい', 'もちろん', '素敵',
  // ZH
  '是', '我也', '喜欢', '爱', '谢谢', '当然', '好的', '开心',
  // RU
  'да', 'я тоже', 'люблю', 'конечно', 'спасибо', 'всегда',
  // AR
  'نعم', 'أنا أيضاً', 'أحبك', 'شكراً', 'بالطبع', 'دائماً',
  // ID
  'iya', 'aku juga', 'cinta', 'suka', 'terima kasih', 'tentu', 'selalu',
  // Emoji
  '❤️', '😍', '🥰', '😊', '💕', '💖',
];

const NEGATIVE_SIGNALS = [
  // EN
  'no', 'not ready', "i don't", 'sorry', 'maybe later', 'bye', 'leave',
  "can't", 'too much', 'slow down', 'awkward', 'uncomfortable', 'weird',
  // ES
  'no ', 'no estoy', 'lo siento', 'despacio', 'raro', 'incómod',
  'tal vez después', 'adiós', 'me voy',
  // PT
  'não', 'desculpa', 'devagar', 'estranho', 'mais tarde', 'tchau',
  // FR
  'non', 'désolé', "je ne", 'pas prêt', 'bizarre', 'au revoir',
  // DE
  'nein', 'tut mir leid', 'nicht bereit', 'komisch', 'auf wiedersehen',
  // JA
  'いいえ', 'ごめん', 'まだ', '無理', 'さようなら',
  // ZH
  '不', '对不起', '不行', '再见', '还没',
  // RU
  'нет', 'прости', 'не готов', 'до свидания',
  // AR
  'لا', 'آسف', 'لست مستعد', 'مع السلامة',
  // ID
  'tidak', 'maaf', 'belum siap', 'sampai jumpa',
];

/**
 * Score a match reaction 0-10 based on positive/negative signals.
 * Returns both the score and the detected signal list.
 */
function scoreReaction(text) {
  const t = (text || '').toLowerCase();
  if (!t) return {score: 3, signals: []};

  const posHits = POSITIVE_SIGNALS.filter(s => t.includes(s));
  const negHits = NEGATIVE_SIGNALS.filter(s => t.includes(s));

  // Base 5, +1 per positive (max +5), -1 per negative (max -5)
  let score = 5 + Math.min(posHits.length, 5) - Math.min(negHits.length, 5);
  score = Math.max(0, Math.min(10, score));

  const signals = [];
  if (posHits.length >= 2) signals.push('reciprocation');
  if (posHits.some(s => /love|amor|ama|aime|liebe|好き|爱|люблю|أحب|cinta|❤️|🥰/.test(s))) signals.push('warmth');
  if (posHits.some(s => /yes|sí|sim|oui|ja|はい|是|да|نعم|iya/.test(s))) signals.push('agreement');
  if (negHits.length >= 2) signals.push('deflection');
  if (negHits.some(s => /not ready|no estoy|pas prêt|nicht bereit|まだ|还没|не готов|لست مستعد|belum siap/.test(s))) signals.push('coldness');
  if (!posHits.length && !negHits.length) signals.push('neutral');

  return {score, signals};
}

// ---------------------------------------------------------------------------
// Classification + approach generation
// ---------------------------------------------------------------------------
async function classifySituation(genAI, situation, lang) {
  try {
    const model = genAI.getGenerativeModel({
      model: AI_MODEL_LITE,
      generationConfig: {maxOutputTokens: 60, temperature: 0.2, responseMimeType: 'application/json'},
    });
    const prompt = `Classify this dating situation into exactly ONE of these categories:
${SITUATION_TYPES.join(', ')}

Situation: "${situation}"

Respond with JSON: {"type": "<category>"}`;
    const result = await model.generateContent(prompt);
    const text = result?.response?.text() || '';
    const parsed = parseGeminiJsonResponse(text);
    const type = parsed?.type;
    if (type && SITUATION_TYPES.includes(type)) return type;
    return 'other';
  } catch (e) {
    logger.warn('[situationSim] classify failed:', e.message);
    return 'other';
  }
}

async function generateApproaches(genAI, situation, matchPersona, userLang) {
  try {
    const langInstr = getLanguageInstruction(userLang);
    const model = genAI.getGenerativeModel({
      model: AI_MODEL_NAME,
      generationConfig: {maxOutputTokens: 500, temperature: 0.85, responseMimeType: 'application/json'},
    });

    const prompt = `You are a dating coach helping a user rehearse how to say something to their match.

User wants to express: "${situation}"

Match profile (so you tailor tone hints):
- Name: ${matchPersona.name}
- Bio: ${matchPersona.bio || 'n/a'}
- Interests: ${(matchPersona.interests || []).slice(0, 6).join(', ')}
- Attachment style: ${matchPersona.attachmentStyle}
- Communication style: ${matchPersona.commStyle}

Generate EXACTLY 4 distinct approaches — each a short phrase the user could actually send.
Each approach uses one of these FIXED tones, in this exact order:
  1. direct — clear, confident, unambiguous
  2. playful — warm, light, a little humor
  3. romantic_vulnerable — soft, honest about feelings
  4. grounded_honest — calm, real, low-pressure

Each phrase must be 1-2 sentences, natural, first-person, as if the user typed it themselves.
${langInstr}

Respond ONLY with JSON in this shape:
{"approaches":[{"id":"1","tone":"direct","phrase":"..."},{"id":"2","tone":"playful","phrase":"..."},{"id":"3","tone":"romantic_vulnerable","phrase":"..."},{"id":"4","tone":"grounded_honest","phrase":"..."}]}`;

    const result = await model.generateContent(prompt);
    const text = result?.response?.text();

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      logger.warn('[generateApproaches] Gemini returned empty response');
      throw new Error('Gemini API returned empty response');
    }

    const parsed = parseGeminiJsonResponse(text);
    if (!parsed) {
      logger.warn('[generateApproaches] Failed to parse Gemini response as JSON');
      throw new Error('Failed to parse Gemini response as valid JSON');
    }

    const approaches = Array.isArray(parsed?.approaches) ? parsed.approaches : [];
    if (approaches.length === 0) {
      logger.warn('[generateApproaches] No approaches returned from Gemini');
      throw new Error('No approaches returned from Gemini');
    }

    // Normalize — guarantee 4 approaches in fixed order
    const byTone = new Map();
    for (const a of approaches) {
      if (a && typeof a.phrase === 'string' && a.tone) byTone.set(a.tone, a.phrase.trim());
    }
    return FIXED_TONES.map((tone, i) => ({
      id: String(i + 1),
      tone,
      phrase: byTone.get(tone) || approaches[i]?.phrase || '',
    }));
  } catch (e) {
    logger.error('[situationSim] generateApproaches failed:', e.message);
    throw e; // Re-throw so parent catches and returns proper error message
  }
}

async function buildFinalCoachTip(genAI, situation, winningApproach, matchPersona, ragChunks, userLang) {
  try {
    const langInstr = getLanguageInstruction(userLang);
    const model = genAI.getGenerativeModel({
      model: AI_MODEL_LITE,
      generationConfig: {maxOutputTokens: 220, temperature: 0.6, responseMimeType: 'application/json'},
    });
    const rag = (ragChunks || []).slice(0, 3).map((c, i) => `[${i + 1}] ${c}`).join('\n');
    const prompt = `You are an empathetic dating coach. Given:

SITUATION: "${situation}"
MATCH: ${matchPersona.name} (${matchPersona.attachmentStyle}, ${matchPersona.commStyle})
WINNING APPROACH (${winningApproach.tone}): "${winningApproach.phrase}"
MATCH REACTION: "${winningApproach.matchReaction || ''}"

PSYCHOLOGY CHUNKS:
${rag || '(none)'}

Write:
1. "coachTip": 1-2 sentences explaining why this approach works with this match
2. "psychInsights": 1 sentence grounding the advice in a psychology reference (author optional, brief)

${langInstr}

Respond ONLY with JSON: {"coachTip":"...","psychInsights":"..."}`;

    const result = await model.generateContent(prompt);
    const text = result?.response?.text() || '';
    const parsed = parseGeminiJsonResponse(text) || {};
    return {
      coachTip: typeof parsed.coachTip === 'string' ? parsed.coachTip : '',
      psychInsights: typeof parsed.psychInsights === 'string' ? parsed.psychInsights : '',
    };
  } catch (e) {
    logger.warn('[situationSim] coachTip failed:', e.message);
    return {coachTip: '', psychInsights: ''};
  }
}

// ---------------------------------------------------------------------------
// Cloud Function
// ---------------------------------------------------------------------------
exports.simulateSituation = onCall(
  {
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 60,
    secrets: [geminiApiKey],
  },
  async (request) => {
    let userId = null;
    let matchId = null;
    try {
      if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');

    userId = request.auth.uid;
    const {situation, userLanguage} = request.data || {};
    matchId = (request.data?.matchId) || null;

    // ── Language validation ──────────────────────────────────────────────
    const SUPPORTED_LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it', 'ja', 'zh', 'ru', 'ar', 'id'];
    const requestedLang = (userLanguage || 'en').toLowerCase();
    const lang = SUPPORTED_LANGS.includes(requestedLang) ? requestedLang : 'en';
    if (requestedLang !== 'en' && !SUPPORTED_LANGS.includes(requestedLang)) {
      logger.warn(`[simulateSituation] Unsupported language "${requestedLang}" for user ${userId.substring(0, 8)}, defaulting to English`);
    }

    // ── Input validation ────────────────────────────────────────────────
    if (!situation || typeof situation !== 'string') {
      throw new HttpsError('invalid-argument', 'situation is required');
    }
    const trimmed = situation.trim();
    if (trimmed.length < 5 || trimmed.length > 500) {
      throw new HttpsError('invalid-argument', 'situation must be 5-500 characters');
    }
    // matchId is optional — allows simulation without a specific match (generic persona)
    const hasMatch = !!(matchId && typeof matchId === 'string' && matchId.trim().length > 0);
    if (hasMatch && (matchId.includes('/') || matchId.length > 200)) {
      throw new HttpsError('invalid-argument', 'matchId is invalid');
    }

    const db = admin.firestore();
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new HttpsError('internal', 'AI service unavailable');

    // ── Safety guardrail FIRST (before rate limit, before cache) ───────
    if (COERCIVE_PATTERNS.some(p => p.test(trimmed))) {
      logger.info(`[simulateSituation] Ethical block for user ${userId.substring(0, 8)}`);
      return {
        success: true,
        situation: trimmed,
        situationType: 'other',
        matchName: '',
        approaches: [],
        bestApproachId: null,
        coachTip: ETHICAL_BLOCK_MSG[lang] || ETHICAL_BLOCK_MSG.en,
        psychInsights: '',
        ethicalBlock: true,
        fromCache: false,
      };
    }

    // ── Feature is available to all users (no Remote Config gate) ────────
    // Situation Simulation is a public feature, unlike Relationship Simulation
    // which uses Remote Config for beta testing

    // ── Cache check BEFORE rate limit ───────────────────────────────────
    const situationHash = crypto.createHash('sha256')
      .update(`${lang}:${trimmed.toLowerCase()}`)
      .digest('hex')
      .substring(0, 32);
    const cacheRef = hasMatch
      ? db.collection('matches').doc(matchId).collection('situationSimulations').doc(situationHash)
      : db.collection('users').doc(userId).collection('situationSimulations').doc(situationHash);
    try {
      const cacheDoc = await cacheRef.get();
      if (cacheDoc.exists) {
        const cached = cacheDoc.data();
        const ageMs = Date.now() - (cached.generatedAt?.toMillis?.() || 0);
        if (ageMs < SITUATION_CACHE_TTL_MS) {
          const cacheSource = hasMatch ? `match ${matchId.substring(0, 8)}` : 'user';
          logger.info(`[simulateSituation] Cache hit for ${cacheSource} hash ${situationHash.substring(0, 8)}`);
          return {...cached, success: true, fromCache: true};
        }
      }
    } catch (e) {
      logger.warn('[simulateSituation] cache read failed (non-fatal):', e.message);
    }

    // ── Atomic rate limit (10/day/user) ─────────────────────────────────
    const today = new Date().toISOString().substring(0, 10);
    const usageRef = db.collection('users').doc(userId)
      .collection('situationSimulationUsage').doc(today);
    const maxPerDay = SITUATION_MAX_PER_DAY;

    let rateLimitPassed = false;
    try {
      await db.runTransaction(async (tx) => {
        const usageDoc = await tx.get(usageRef);
        const todayCount = usageDoc.exists ? (usageDoc.data().count || 0) : 0;
        if (todayCount >= maxPerDay) {
          const limitMsg = {
            en: `Maximum ${maxPerDay} situation rehearsals per day. Try again tomorrow!`,
            es: `Máximo ${maxPerDay} ensayos de situación por día. ¡Vuelve mañana!`,
            pt: `Máximo ${maxPerDay} ensaios por dia. Tente amanhã!`,
            fr: `Maximum ${maxPerDay} répétitions par jour. Réessayez demain!`,
            de: `Maximal ${maxPerDay} Proben pro Tag. Versuche es morgen!`,
            ja: `1日最大${maxPerDay}回です。明日またお試しください！`,
            zh: `每天最多${maxPerDay}次。明天再试！`,
            ru: `Максимум ${maxPerDay} репетиций в день. Попробуйте завтра!`,
            ar: `الحد الأقصى ${maxPerDay} تدريبات في اليوم.`,
            id: `Maksimal ${maxPerDay} latihan per hari. Coba lagi besok!`,
          };
          throw new HttpsError('resource-exhausted', limitMsg[lang] || limitMsg.en);
        }
        tx.set(usageRef, {count: todayCount + 1, lastUsed: new Date().toISOString()}, {merge: true});
        rateLimitPassed = true;
      });
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      logger.error('[simulateSituation] Rate limit tx error:', e.message);
      rateLimitPassed = true;
    }
    if (!rateLimitPassed) throw new HttpsError('resource-exhausted', 'Daily limit reached');

    // ── Match permission + data fetch ───────────────────────────────────
    let userPersona, matchPersona;

    if (hasMatch) {
      // Flujo con match específico (existente)
      const matchDoc = await db.collection('matches').doc(matchId).get();
      if (!matchDoc.exists) throw new HttpsError('not-found', 'Match not found');

      const matchData = matchDoc.data();
      const usersMatched = matchData.usersMatched || [];
      if (!usersMatched.includes(userId)) {
        throw new HttpsError('permission-denied', 'Not a participant of this match');
      }
      const otherUserId = usersMatched.find(id => id !== userId);
      if (!otherUserId) throw new HttpsError('not-found', 'Could not identify other user');

      const [userDoc, otherDoc, messagesSnap] = await Promise.all([
        db.collection('users').doc(userId).get(),
        db.collection('users').doc(otherUserId).get(),
        db.collection('matches').doc(matchId).collection('messages')
          .orderBy('timestamp', 'desc').limit(30).get(),
      ]);

      if (!userDoc.exists || !otherDoc.exists) {
        throw new HttpsError('not-found', 'User profile not found');
      }

      [userPersona, matchPersona] = await Promise.all([
        buildPersonaProfile(db, userDoc.data(), 'A', messagesSnap, userId),
        buildPersonaProfile(db, otherDoc.data(), 'B', messagesSnap, otherUserId),
      ]);
    } else {
      // Sin match: usar personas genéricos sin llamar a buildPersonaProfile
      // (que intenta buscar en coachChats y puede fallar)
      logger.info(`[simulateSituation] Using generic personas for user ${userId.substring(0, 8)} (no match)`);
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) throw new HttpsError('not-found', 'User profile not found');
      const userData = userDoc.data();
      if (!userData) throw new HttpsError('not-found', 'User data is empty');

      // Build user persona manually without async calls
      const interests = (userData.interests || []).map(i =>
        i.replace(/^interest_/, '').replace(/_/g, ' ')
      );
      userPersona = {
        role: 'A',
        name: userData.name || 'You',
        age: userData.birthDate
          ? Math.floor((Date.now() - userData.birthDate.toDate().getTime()) / (1000 * 60 * 60 * 24 * 365))
          : null,
        userType: userData.userType || 'PRIME',
        bio: (userData.bio || '').substring(0, 400),
        interests,
        attachmentStyle: 'secure',  // Safe default
        commStyle: 'direct',         // Safe default
        archetype: {},               // Will be resolved in buildAgentSystemPrompt
        realMessages: [],
        similarMessages: [],
        avgMessageLength: 60,
      };
      logger.info(`[simulateSituation] User persona built manually: ${userPersona.name}`);

      // Generic persona for the other party in unmatched simulation
      matchPersona = {
        name: 'them',
        bio: '',
        interests: [],
        attachmentStyle: 'secure',
        commStyle: 'direct',
        realMessages: [],
        similarMessages: [],
        avgMessageLength: 60,
      };
    }

    logger.info(`[simulateSituation] Personas built: user=${userPersona.name} match=${matchPersona.name}(${matchPersona.attachmentStyle}/${matchPersona.commStyle})`);

    const genAI = new GoogleGenerativeAI(apiKey);

    // ── Step 1: Classify situation (LITE) ───────────────────────────────
    const situationType = await classifySituation(genAI, trimmed, lang);

    // ── Step 2: Generate 4 approaches (NAME, one call) ──────────────────
    logger.info(`[simulateSituation] Generating approaches for ${matchPersona.name}...`);
    const approaches = await generateApproaches(genAI, trimmed, matchPersona, lang);
    logger.info(`[simulateSituation] Generated ${approaches.length} approaches`);
    const validApproaches = approaches.filter(a => a.phrase && a.phrase.length > 0);
    logger.info(`[simulateSituation] Valid approaches: ${validApproaches.length}`);
    if (validApproaches.length === 0) {
      throw new HttpsError('internal', 'Failed to generate approaches');
    }

    // ── Step 3: Simulate match reaction for each approach in PARALLEL ──
    const reactionModel = genAI.getGenerativeModel({
      model: AI_MODEL_LITE,
      generationConfig: {maxOutputTokens: 120, temperature: 0.85},
    });

    const situationContext =
      `The user just told you: "${trimmed}" (situation type: ${situationType}). ` +
      `They are going to send you one specific phrase below. React authentically, in 1-2 sentences, ` +
      `as ${matchPersona.name} would — based on your attachment style, communication style, and personality.`;

    const reactionResults = await Promise.all(validApproaches.map(async (approach) => {
      try {
        const systemPrompt = buildAgentSystemPrompt(matchPersona, userPersona, situationContext, lang);
        const fullPrompt = `${systemPrompt}\n\n${userPersona.name} just said: "${approach.phrase}"\n\nRespond as ${matchPersona.name}, in 1-2 sentences, first person only:`;
        const reactionText = await generateAgentTurn(reactionModel, fullPrompt, 10000);
        return {approach, reactionText: (reactionText || '').trim()};
      } catch (e) {
        logger.warn(`[simulateSituation] reaction failed for ${approach.tone}:`, e.message);
        return {approach, reactionText: ''};
      }
    }));

    // ── Validate reaction quality ────────────────────────────────────────
    const failedReactions = reactionResults.filter(
      r => !r.reactionText || r.reactionText.trim().length === 0
    ).length;
    if (failedReactions > 2) {
      const failureMsg = {
        en: '🔮 Unable to generate realistic reactions right now. Try again in a moment.',
        es: '🔮 No puedo generar reacciones realistas en este momento. Intenta de nuevo.',
        pt: '🔮 Não consigo gerar reações realistas agora. Tente novamente.',
        fr: '🔮 Impossible de générer des réactions réalistes maintenant. Réessayez.',
        de: '🔮 Kann im Moment keine realistischen Reaktionen generieren. Bitte versuchen Sie es erneut.',
        ja: '🔮 現在、現実的な反応を生成できません。もう一度お試しください。',
        zh: '🔮 现在无法生成真实的反应。请重试。',
        ru: '🔮 Не могу сгенерировать реалистичные реакции. Повторите попытку.',
        ar: '🔮 لا يمكنني إنشاء ردود حقيقية الآن. حاول مرة أخرى.',
        id: '🔮 Tidak dapat menghasilkan reaksi realistis sekarang. Coba lagi.',
      };
      throw new HttpsError('internal', failureMsg[lang] || failureMsg.en);
    }

    // ── Step 4: Score each reaction ─────────────────────────────────────
    const scored = reactionResults.map(({approach, reactionText}) => {
      const {score, signals} = scoreReaction(reactionText);
      return {
        id: String(approach.id || ''),
        tone: String(approach.tone || ''),
        phrase: String(approach.phrase || ''),
        matchReaction: reactionText || '',
        successScore: Number.isFinite(score) ? score : 5,
        signals: Array.isArray(signals) ? signals.filter(s => typeof s === 'string') : [],
        recommendedFor: null,
      };
    });

    // Pick winner
    scored.sort((a, b) => b.successScore - a.successScore);
    const bestApproachId = scored[0]?.id || null;
    // Restore original id-order for response
    const approachesOrdered = [...scored].sort((a, b) =>
      (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0)
    );

    // ── Step 5: Psychology RAG ──────────────────────────────────────────
    const ragChunks = await queryPsychologyRAG(
      db, genAI, apiKey,
      matchPersona.attachmentStyle || 'secure',
      userPersona.attachmentStyle || 'secure',
      situationType,
    );

    // ── Step 6: Final coach tip + psych insights ────────────────────────
    const winner = scored[0] || {tone: 'direct', phrase: '', matchReaction: ''};
    const {coachTip, psychInsights} = await buildFinalCoachTip(
      genAI, trimmed, winner, matchPersona, ragChunks, lang
    );

    // ── Assemble final report with defensive defaults ───────────────────
    const safeApproaches = approachesOrdered.map(a => ({
      id: a.id || '',
      tone: a.tone || '',
      phrase: a.phrase || '',
      matchReaction: a.matchReaction || '',
      successScore: Number.isFinite(a.successScore) ? a.successScore : 5,
      signals: Array.isArray(a.signals)
        ? a.signals.filter(s => typeof s === 'string' && s.length > 0)
        : [],
      recommendedFor: typeof a.recommendedFor === 'string' ? a.recommendedFor : null,
    }));

    const finalReport = {
      success: true,
      situation: trimmed,
      situationType: situationType || 'other',
      matchName: matchPersona.name || '',
      approaches: safeApproaches,
      bestApproachId: bestApproachId || (safeApproaches[0]?.id || null),
      coachTip: coachTip || '',
      psychInsights: psychInsights || '',
      ethicalBlock: false,
      fromCache: false,
      matchId,
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Defensive scalar defaults (Firestore rejects undefined)
    const scalarDefaults = {
      situation: '',
      situationType: 'other',
      matchName: '',
      coachTip: '',
      psychInsights: '',
      bestApproachId: null,
    };
    for (const [key, def] of Object.entries(scalarDefaults)) {
      if (finalReport[key] === undefined) finalReport[key] = def;
    }

    // Defensive array scrub
    if (!Array.isArray(finalReport.approaches)) finalReport.approaches = [];

    // ── Save to cache ───────────────────────────────────────────────────
    try {
      await cacheRef.set(finalReport);
    } catch (e) {
      logger.warn('[simulateSituation] cache write failed (non-fatal):', e.message);
    }

    trackAICall({
      functionName: 'simulateSituation',
      model: AI_MODEL_LITE,
      operation: 'situation_rehearsal',
      usage: {totalTokenCount: 400 + (safeApproaches.length * 120) + 220},
      userId,
    });

    const matchIdDebug = (matchId && typeof matchId === 'string' ? matchId.substring(0, 8) : 'generic');
    logger.info(`[simulateSituation] Complete for user ${userId.substring(0, 8)} match=${matchIdDebug} type=${situationType} best=${bestApproachId}`);

    // Return without the server timestamp sentinel (Firestore-internal),
    // and include fromCache=false so clients can distinguish.
    return {
      ...finalReport,
      generatedAt: Date.now(),
    };
    } catch (error) {
      const userIdDebug = (userId && typeof userId === 'string' ? userId.substring(0, 8) : 'unknown');
      const matchIdDebug = (matchId && typeof matchId === 'string' ? matchId.substring(0, 8) : 'none');

      logger.error(`[simulateSituation] Error for user=${userIdDebug} match=${matchIdDebug}: ${error.message}`, {
        code: error.code,
        message: error.message,
        stack: error.stack
      });

      // If it's already an HttpsError, re-throw it
      if (error.code && error.code.startsWith('functions/')) {
        throw error;
      }

      // Otherwise, wrap in internal error with the actual message for debugging
      throw new HttpsError('internal', `Error: ${error.message}`);
    }
  },
);
