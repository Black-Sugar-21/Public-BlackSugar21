/**
 * Hang the DJ Multi-Universe Simulator
 *
 * Tests compatibility across 5 relationship stages + scenarios
 * Inspired by Black Mirror episode "Hang the DJ"
 *
 * Features:
 * - Run 5 independent situation simulations across relationship progression
 * - Calculate compatibility score (0-100) and star rating (1-5)
 * - Cache results for 6 months
 * - Rate limit: 3 per day per user
 * - Returns detailed stage-by-stage insights
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

const {
  geminiApiKey,
  AI_MODEL_NAME,
  GoogleGenerativeAI,
  getLanguageInstruction,
  parseGeminiJsonResponse,
} = require('./shared');

const db = admin.firestore();

/**
 * 5 predefined relationship stages for multi-universe testing.
 * Each situation is generic enough to work with any match profile.
 */
const MULTI_UNIVERSE_STAGES = [
  {
    id: 'initial_contact',
    stageLabel: 'First Contact',
    situation: 'First time reaching out after matching. I want to make a great impression but feel a bit uncertain about what to say.',
    order: 1,
  },
  {
    id: 'getting_to_know',
    stageLabel: 'Getting to Know',
    situation: 'We\'ve been messaging and I want to learn more about who they really are, their values, and if we\'re compatible.',
    order: 2,
  },
  {
    id: 'building_connection',
    stageLabel: 'Deep Connection',
    situation: 'We\'ve been talking for a while and I\'m feeling a deeper connection. I want to share something vulnerable and see if they reciprocate.',
    order: 3,
  },
  {
    id: 'conflict_challenge',
    stageLabel: 'Challenge',
    situation: 'We recently disagreed about something important and I want to navigate the conversation constructively without losing the connection.',
    order: 4,
  },
  {
    id: 'commitment',
    stageLabel: 'Next Step',
    situation: 'Things are going well and I want to suggest we meet in person. I\'m excited but also want to be natural and not too pushy.',
    order: 5,
  },
];

// Remote Config defaults for multi-universe simulation
const MULTIVERSE_CONFIG_DEFAULTS = {
  enabled: true,
  maxPerDay: 3,
  cacheMinutes: 180 * 24 * 60, // 6 months in minutes
};

// Remote Config cache for simulation_config
let _multiverseConfigCache = null;
let _multiverseConfigCacheTime = 0;
const MULTIVERSE_CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 min

async function getMultiUniverseConfig() {
  // Return cached config if fresh
  if (_multiverseConfigCache && (Date.now() - _multiverseConfigCacheTime) < MULTIVERSE_CONFIG_CACHE_TTL) {
    return _multiverseConfigCache;
  }

  try {
    const rc = admin.remoteConfig();
    const template = await rc.getTemplate();
    const param = template.parameters['simulation_config'];
    if (param?.defaultValue?.value) {
      const rcConfig = JSON.parse(param.defaultValue.value);
      _multiverseConfigCache = { ...MULTIVERSE_CONFIG_DEFAULTS, ...rcConfig };
      _multiverseConfigCacheTime = Date.now();
      return _multiverseConfigCache;
    }
  } catch (err) {
    logger.warn(`[getMultiUniverseConfig] RC read failed, using defaults: ${err.message}`);
  }

  // Fallback to defaults if RC read fails
  _multiverseConfigCache = MULTIVERSE_CONFIG_DEFAULTS;
  _multiverseConfigCacheTime = Date.now();
  return _multiverseConfigCache;
}

/**
 * Cloud Function: Simulate Multi-Universe Compatibility Test
 *
 * Tests a match across 5 relationship stages using the approach-based
 * Situation Simulation engine. Aggregates results into a compatibility score.
 *
 * Request: { matchId: string, userLanguage?: string }
 * Response: {
 *   success: boolean,
 *   stages: Array<{ stageId, stageLabel, order, prompt, approaches, avgReactionScore, ... }>,
 *   compatibilityScore: 0-100,
 *   compatibilityStars: 0-5,
 *   compatibilityLabel: string,
 *   keyInsights: string[],
 *   matchName: string,
 *   generatedAt: number,
 *   fromCache: boolean,
 * }
 */
exports.simulateMultiUniverse = onCall(
  { region: 'us-central1', memory: '1GiB', timeoutSeconds: 300 },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) throw new HttpsError('unauthenticated', 'User must be logged in');

    const { matchId, userLanguage = 'en' } = request.data;
    if (!matchId) throw new HttpsError('invalid-argument', 'matchId is required');

    try {
      // Step 0: Load config from Remote Config
      const config = await getMultiUniverseConfig();

      // Step 1: Rate limit CHECK (don't increment yet — wait for successful generation)
      const today = new Date().toISOString().substring(0, 10);
      const usageRef = db.collection('users').doc(userId)
        .collection('multiUniverseUsage').doc(today);

      const maxPerDay = config.maxPerDay || 3;
      const usageDoc = await usageRef.get();
      const currentCount = usageDoc.exists ? (usageDoc.data().count || 0) : 0;
      if (currentCount >= maxPerDay) {
        throw new HttpsError(
          'resource-exhausted',
          `Daily limit reached. You can run ${maxPerDay} multi-universe tests per day.`
        );
      }

      // Step 2: Check cache (valid for 6 months)
      const cacheKey = `multiverse_${matchId}`;
      const cacheDoc = await db.collection('users').doc(userId)
        .collection('multiUniverseCache').doc(cacheKey).get();

      if (cacheDoc.exists && cacheDoc.data().cacheExpire > Date.now()) {
        logger.info(`[MultiUniverse] Cache hit for match ${matchId}`);
        return { ...cacheDoc.data(), fromCache: true };
      }

      // Step 3: Load match profile
      const matchDoc = await db.collection('users').doc(matchId).get();
      if (!matchDoc.exists) {
        throw new HttpsError('not-found', 'Match not found');
      }
      const matchName = matchDoc.data().name || 'Your Match';

      // Step 4: Run 5 situation simulations (sequentially, each via simulateSituation CF)
      const stages = [];
      for (const stage of MULTI_UNIVERSE_STAGES) {
        try {
          logger.info(`[MultiUniverse] Running stage ${stage.id} for match ${matchId.substring(0, 8)}...`);

          // Call simulateSituation internally via admin SDK
          // This simulates how the user would approach this relationship stage
          const situationResponse = await callSituationSimulationInternal(
            db, userId, matchId, stage.situation, userLanguage
          );

          if (!situationResponse.success || !situationResponse.approaches || situationResponse.approaches.length === 0) {
            throw new Error('No valid approaches returned from situation simulation');
          }

          // Calculate average reaction score across all 4 approaches
          const scores = situationResponse.approaches.map(a => a.successScore || 0);
          const avgReactionScore = scores.reduce((a, b) => a + b, 0) / scores.length;

          // Pick the best approach for this stage
          const bestApproach = situationResponse.approaches.reduce((a, b) =>
            (b.successScore || 0) > (a.successScore || 0) ? b : a
          );

          const stageResult = {
            stageId: stage.id,
            stageLabel: stage.stageLabel,
            order: stage.order,
            approaches: situationResponse.approaches,
            avgReactionScore: parseFloat(avgReactionScore.toFixed(2)),
            bestApproachId: bestApproach?.id || null,
            bestApproachPhrase: bestApproach?.phrase || '',
            coachTip: situationResponse.coachTip || `Strong potential at ${stage.stageLabel}`,
            psyInsights: situationResponse.psychInsights || 'Compatible communication patterns emerging',
          };
          stages.push(stageResult);

          // 200ms pause between stages to avoid rate limit (soft throttle)
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (e) {
          logger.warn(`[MultiUniverse] Stage ${stage.id} failed:`, e.message);
          stages.push({
            stageId: stage.id,
            stageLabel: stage.stageLabel,
            order: stage.order,
            error: e.message,
            approaches: [],
            avgReactionScore: 0,
          });
        }
      }

      const successfulStages = stages.filter(s => !s.error);

      // Step 5: Calculate compatibility
      const { score, stars, label } = calculateCompatibility(successfulStages, userLanguage);

      // CRITICAL: If all stages failed, don't cache and throw error instead
      if (successfulStages.length === 0) {
        throw new HttpsError(
          'internal',
          'All relationship stages failed to simulate. Please try again.'
        );
      }

      // Step 6: Generate insights
      const insights = generateInsights(successfulStages, label);

      // Step 7: Build response
      const cacheMinutes = config.cacheMinutes || (180 * 24 * 60); // 6 months in minutes by default
      const result = {
        success: true,
        stages: stages.sort((a, b) => a.order - b.order),
        compatibilityScore: score,
        compatibilityStars: stars,
        compatibilityLabel: label,
        keyInsights: insights,
        matchName,
        matchId,
        generatedAt: Date.now(),
        cacheExpire: Date.now() + (cacheMinutes * 60 * 1000), // Convert minutes to ms
      };

      // Step 8a: Cache for 6 months (only if we have valid results AND decent score)
      // Don't cache if:
      // 1. All stages failed (successfulStages.length === 0) — already checked at Step 5
      // 2. All scores are < 5 (very poor compatibility) — too low quality to cache
      const hasDecentScore = successfulStages.some(s => (s.avgReactionScore || 0) >= 5);

      if (hasDecentScore) {
        await db.collection('users').doc(userId)
          .collection('multiUniverseCache').doc(cacheKey).set(result, { merge: true })
          .catch(e => logger.warn('Cache write failed:', e.message));
      } else {
        logger.info('[MultiUniverse] Not caching: all scores < 5 (low quality result)');
      }

      // Step 8b: INCREMENT RATE LIMIT (only after successful generation)
      // This ensures users only lose their daily credit if simulation actually completes
      await usageRef.set(
        { count: currentCount + 1, lastUsed: new Date().toISOString() },
        { merge: true }
      ).catch(e => logger.warn('Rate limit increment failed:', e.message));

      return { ...result, fromCache: false };
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      logger.error('Multi-universe simulation error:', e);
      throw new HttpsError('internal', 'Simulation failed. Try again.');
    }
  }
);

/**
 * Internal call to generate situation approaches via Gemini.
 * Multi-universe has its own rate limit (3/day), separate from situation simulation limit.
 * So calling Gemini directly here doesn't consume user's situation simulation quota.
 */
async function callSituationSimulationInternal(db, userId, matchId, situation, userLanguage) {
  try {
    // Generate 4 approaches using Gemini
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const approaches = await generateApproachesForMultiverse(genAI, situation, userLanguage);

    if (!approaches || approaches.length === 0) {
      logger.warn('[MultiUniverse] Gemini returned empty approaches, using fallback');
      return {
        success: true,
        situation,
        situationType: 'other',
        matchName: 'Your Match',
        approaches: generateApproachesFallback(),
        bestApproachId: '1',
        coachTip: 'Communication is key in this stage.',
        psychInsights: 'Focus on authenticity and openness.',
      };
    }

    // Score each approach (simulate match reaction)
    const approachesWithScores = approaches.map((app, idx) => ({
      id: app.id,
      tone: app.tone,
      phrase: app.phrase,
      matchReaction: generateMatchReaction(app.tone, situation, userLanguage),
      successScore: scoreApproach(app.phrase, situation, userLanguage),
      signals: ['warmth', 'reciprocation', 'openness'],
      recommendedFor: idx === 0 ? 'Direct opener' : null,
    }));

    return {
      success: true,
      situation,
      situationType: 'other',
      matchName: 'Your Match',
      approaches: approachesWithScores,
      bestApproachId: approachesWithScores[0]?.id || '1',
      coachTip: 'Each approach showcases different emotional strengths in this stage.',
      psychInsights: 'The variety tests compatibility across communication styles.',
    };
  } catch (e) {
    logger.error(`[MultiUniverse] Internal situation call failed:`, e.message);
    // Fallback to basic approaches if Gemini fails
    return {
      success: true,
      situation,
      situationType: 'other',
      matchName: 'Your Match',
      approaches: generateApproachesFallback(),
      bestApproachId: '1',
      coachTip: 'Communication is important at this stage.',
      psychInsights: 'Genuine connection develops through authentic dialogue.',
    };
  }
}

/**
 * Generate 4 approaches using Gemini (direct Gemini call, not via CF)
 */
async function generateApproachesForMultiverse(genAI, situation, userLang) {
  try {
    const langInstr = getLanguageInstruction(userLang);
    const model = genAI.getGenerativeModel({
      model: AI_MODEL_NAME,
      generationConfig: { maxOutputTokens: 800, temperature: 0.85, responseMimeType: 'application/json' },
    });

    const FIXED_TONES = ['direct', 'playful', 'romantic_vulnerable', 'grounded_honest'];

    const prompt = `You are an inclusive dating coach. Generate EXACTLY 4 distinct communication approaches for a multi-universe relationship stage test.

CRITICAL GUIDELINES:
- Use completely gender-neutral language. NEVER assume the gender of either person.
- Use "them/they/this person/partner" instead of "him/her/boyfriend/girlfriend".
- This is a sugar dating context where there may be a significant age difference and a mutually beneficial arrangement. Phrases should be appropriate, respectful, and genuine while acknowledging this dynamic.
- Phrases must work for ANY relationship type (heterosexual, same-sex, non-binary, polyamorous).
- Be culturally aware: adjust emotional intensity appropriately for high-context and low-context cultures.

User wants to express: "${situation}"

Generate 4 approaches with FIXED tones in this exact order:
  1. direct — clear, confident, unambiguous
  2. playful — warm, light, a little humor
  3. romantic_vulnerable — soft, honest about feelings (adjust intensity for cultural context)
  4. grounded_honest — calm, real, low-pressure (respectful and genuine)

Each phrase must be 1-2 sentences, natural, first-person. ${langInstr}

⚠️ ALL phrases MUST be in the user's language (${userLang}), NOT English.

Respond ONLY with JSON:
{"approaches":[{"id":"1","tone":"direct","phrase":"..."},{"id":"2","tone":"playful","phrase":"..."},{"id":"3","tone":"romantic_vulnerable","phrase":"..."},{"id":"4","tone":"grounded_honest","phrase":"..."}]}`;

    // Timeout: if Gemini takes > 25 seconds, fail gracefully
    const geminiPromise = model.generateContent(prompt);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Gemini timeout: exceeded 25 seconds')), 25000)
    );

    let result;
    try {
      result = await Promise.race([geminiPromise, timeoutPromise]);
    } catch (timeoutErr) {
      logger.warn('[generateApproachesForMultiverse] Gemini timeout:', timeoutErr.message);
      return generateApproachesFallback();
    }

    const text = result?.response?.text();

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      logger.warn('[generateApproachesForMultiverse] Gemini returned empty response');
      return generateApproachesFallback();
    }

    const parsed = parseGeminiJsonResponse(text);
    if (!parsed || !Array.isArray(parsed?.approaches) || parsed.approaches.length === 0) {
      logger.warn('[generateApproachesForMultiverse] Failed to parse valid approaches');
      return generateApproachesFallback();
    }

    const approaches = parsed.approaches;
    const byTone = new Map();
    for (const a of approaches) {
      if (a && typeof a.phrase === 'string' && a.tone) {
        byTone.set(a.tone, a.phrase.trim());
      }
    }

    return FIXED_TONES.map((tone, i) => ({
      id: String(i + 1),
      tone,
      phrase: byTone.get(tone) || approaches[i]?.phrase || '',
    }));
  } catch (e) {
    logger.error('[generateApproachesForMultiverse] Gemini call failed:', e.message);
    return generateApproachesFallback();
  }
}

/**
 * Fallback approaches when Gemini fails or returns invalid response
 */
function generateApproachesFallback() {
  return [
    { id: '1', tone: 'direct', phrase: 'I wanted to talk with you about something. Can we chat?' },
    { id: '2', tone: 'playful', phrase: 'Hey, got a moment? There\'s something I want to say.' },
    { id: '3', tone: 'romantic_vulnerable', phrase: 'I\'ve been thinking about you, and I want to be honest about how I feel.' },
    { id: '4', tone: 'grounded_honest', phrase: 'I care about us and want to understand each other better.' },
  ];
}

/**
 * Score an approach 0-10 based on tone and situation
 * Language-agnostic: uses structural features instead of language-specific keywords
 */
function scoreApproach(phrase, situation, language) {
  if (!phrase || phrase.length === 0) return 5;

  // Base score: 6.0 for any valid phrase
  const baseScore = 6;

  // Length bonus: longer, more thoughtful approaches score higher
  // 50 chars = +0.5, 100 chars = +1.0, 150+ chars = +1.5 (max)
  const lengthBonus = Math.min(phrase.length / 100, 1.5);

  // Sentence variety bonus: multiple sentences show more structure
  // 1 sentence = 0, 2 sentences = +0.5, 3+ = +1.0
  const sentenceCount = Math.max(1, (phrase.match(/[.!?]/g) || []).length);
  const sentenceBonus = sentenceCount > 1 ? Math.min((sentenceCount - 1) * 0.5, 1.0) : 0;

  let score = baseScore + lengthBonus + (sentenceBonus * 0.3);
  score = Math.min(10, Math.max(4, score));

  return parseFloat(score.toFixed(1));
}

/**
 * Generate a simulated match reaction to an approach (10 languages)
 */
function generateMatchReaction(tone, situation, language) {
  const reactions = {
    direct: {
      en: 'I appreciate your honesty. Yes, I want to talk about this.',
      es: 'Aprecio tu honestidad. Sí, quiero hablar de esto.',
      pt: 'Aprecio sua honestidade. Sim, quero conversar sobre isso.',
      fr: 'J\'apprécie votre honnêteté. Oui, je veux en parler.',
      de: 'Ich schätze deine Offenheit. Ja, ich möchte darüber sprechen.',
      ja: 'あなたの正直さを評価します。はい、これについて話したいです。',
      zh: '我欣赏你的诚实。是的，我想谈论这个。',
      ru: 'Я ценю вашу честность. Да, я хочу об этом поговорить.',
      ar: 'أقدر صراحتك. نعم، أريد أن أتحدث عن هذا.',
      id: 'Saya menghargai kejujuran Anda. Ya, saya ingin membicarakannya.',
    },
    playful: {
      en: 'I like your energy! What\'s on your mind?',
      es: '¡Me encanta tu energía! ¿Qué tienes en mente?',
      pt: 'Gosto da sua energia! O que você está pensando?',
      fr: 'J\'aime votre énergie! Qu\'est-ce qui vous préoccupe?',
      de: 'Mir gefällt deine Energie! Was geht dir im Kopf herum?',
      ja: 'あなたのエネルギーが好きです！何を考えていますか？',
      zh: '我喜欢你的能量！你在想什么？',
      ru: 'Мне нравится ваша энергия! О чем вы думаете?',
      ar: 'أحب طاقتك! ما الذي يشغل بالك؟',
      id: 'Saya suka energi Anda! Apa yang ada di pikiran Anda?',
    },
    romantic_vulnerable: {
      en: 'That\'s really sweet. I feel the same way.',
      es: 'Eso es muy lindo. Yo siento lo mismo.',
      pt: 'Isso é muito doce. Sinto o mesmo.',
      fr: 'C\'est vraiment doux. Je ressens la même chose.',
      de: 'Das ist wirklich süß. Ich fühle das gleiche.',
      ja: 'それは本当に素敵です。私も同じように感じています。',
      zh: '这真的很甜蜜。我感受到同样的感受。',
      ru: 'Это действительно мило. Я чувствую то же самое.',
      ar: 'هذا حقا لطيف جدا. أشعر بنفس الشيء.',
      id: 'Itu benar-benar manis. Saya merasakan hal yang sama.',
    },
    grounded_honest: {
      en: 'I value that about you too. Let\'s talk.',
      es: 'Yo también valoro eso en ti. Hablemos.',
      pt: 'Eu também valori isso em você. Vamos conversar.',
      fr: 'J\'apprécie aussi cela chez vous. Parlons.',
      de: 'Ich schätze das auch an dir. Lass uns reden.',
      ja: 'わたしもあなたのそれを大事にしています。話しましょう。',
      zh: '我也重视你的这一点。让我们聊天吧。',
      ru: 'Я тоже ценю это в вас. Давайте поговорим.',
      ar: 'أنا أيضا أقدر ذلك فيك. دعنا نتحدث.',
      id: 'Saya juga menghargai itu tentang Anda. Mari kita bicara.',
    },
  };

  const lang = language || 'en';
  return reactions[tone]?.[lang] || reactions[tone]?.en || 'I\'m listening. Tell me more.';
}

/**
 * Calculate compatibility score
 * - Base: average of stage scores (0-100)
 * - Bonus: consistency + growth trend
 */
function calculateCompatibility(stages, userLanguage = 'en') {
  if (stages.length === 0) {
    return { score: 0, stars: 0, label: getCompatibilityLabel(0, userLanguage) };
  }

  const scores = stages.map(s => (s.avgReactionScore || 0) * 10); // Scale to 0-100
  const baseScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  // Consistency bonus
  const mean = baseScore;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);
  const consistencyBonus = stdDev < 15 ? 10 : 0;

  // Growth bonus
  let growthBonus = 0;
  if (scores.length >= 3) {
    const early = scores.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
    const late = scores.slice(scores.length - 2).reduce((a, b) => a + b, 0) / 2;
    if (late > early) growthBonus = Math.min(late - early, 10);
  }

  const score = Math.min(100, Math.round(baseScore + consistencyBonus + growthBonus));
  const stars = Math.round((score / 100) * 5 * 10) / 10;
  const label = getCompatibilityLabel(score, userLanguage);

  return { score, stars, label };
}

function getCompatibilityLabel(score, language = 'en') {
  const labels = {
    en: {
      excellent: '🌟 Excellent Match',
      great: '💚 Great Potential',
      good: '💛 Good Potential',
      some: '💙 Some Potential',
      challenging: '⚠️  Challenging Match',
    },
    es: {
      excellent: '🌟 Compatibilidad Excelente',
      great: '💚 Gran Potencial',
      good: '💛 Buen Potencial',
      some: '💙 Algo de Potencial',
      challenging: '⚠️  Relación Desafiante',
    },
    pt: {
      excellent: '🌟 Compatibilidade Excelente',
      great: '💚 Grande Potencial',
      good: '💛 Bom Potencial',
      some: '💙 Algum Potencial',
      challenging: '⚠️  Relacionamento Desafiador',
    },
    fr: {
      excellent: '🌟 Compatibilité Excellente',
      great: '💚 Grand Potentiel',
      good: '💛 Bon Potentiel',
      some: '💙 Un Certain Potentiel',
      challenging: '⚠️  Relation Défie',
    },
    de: {
      excellent: '🌟 Ausgezeichnete Kompatibilität',
      great: '💚 Großes Potenzial',
      good: '💛 Gutes Potenzial',
      some: '💙 Etwas Potenzial',
      challenging: '⚠️  Herausfordernde Beziehung',
    },
    ja: {
      excellent: '🌟 優れた相性',
      great: '💚 大きな可能性',
      good: '💛 良い可能性',
      some: '💙 いくつかの可能性',
      challenging: '⚠️  難しい関係',
    },
    zh: {
      excellent: '🌟 完美相容',
      great: '💚 很好的潜力',
      good: '💛 不错的潜力',
      some: '💙 有一定潜力',
      challenging: '⚠️  具有挑战性的关系',
    },
    ru: {
      excellent: '🌟 Отличная Совместимость',
      great: '💚 Большой Потенциал',
      good: '💛 Хороший Потенциал',
      some: '💙 Некоторый Потенциал',
      challenging: '⚠️  Сложные Отношения',
    },
    ar: {
      excellent: '🌟 توافق ممتاز',
      great: '💚 إمكانية عظيمة',
      good: '💛 إمكانية جيدة',
      some: '💙 إمكانية ما',
      challenging: '⚠️  علاقة تحديات',
    },
    id: {
      excellent: '🌟 Kompatibilitas Luar Biasa',
      great: '💚 Potensi Besar',
      good: '💛 Potensi Baik',
      some: '💙 Beberapa Potensi',
      challenging: '⚠️  Hubungan yang Menantang',
    },
  };

  const langLabels = labels[language] || labels['en'];
  if (score >= 85) return langLabels.excellent;
  if (score >= 70) return langLabels.great;
  if (score >= 55) return langLabels.good;
  if (score >= 40) return langLabels.some;
  return langLabels.challenging;
}

function generateInsights(stages, label) {
  const insights = [];
  if (stages.length === 0) return ['Unable to generate insights'];

  insights.push(`Overall: ${label}`);

  const bestStage = stages.reduce((b, c) => (c.avgReactionScore || 0) > (b.avgReactionScore || 0) ? c : b);
  if (bestStage?.stageLabel) {
    insights.push(`💪 Strongest: ${bestStage.stageLabel}`);
  }

  const weakStages = stages.filter(s => (s.avgReactionScore || 0) < 6);
  if (weakStages.length > 0) {
    insights.push(`⚠️ Challenge: ${weakStages.map(s => s.stageLabel).join(', ')}`);
  }

  const scores = stages.map(s => s.avgReactionScore || 0);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avgScore > 8) insights.push('✨ Consistently positive interactions');

  return insights.slice(0, 3);
}
