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
  trackAICall,
} = require('./shared');

const db = admin.firestore();

/**
 * Analytics tracking for multi-universe simulations
 * Stores: error counts, total cost, duration by stage, success rate
 */
async function trackMultiUniverseAnalytics(userId, matchId, result) {
  try {
    const today = new Date().toISOString().substring(0, 10);
    const analyticsRef = db.collection('aiAnalytics').doc('multiverse').collection('daily').doc(today);

    const update = {
      date: today,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      successCount: admin.firestore.FieldValue.increment(result.success ? 1 : 0),
      errorCount: admin.firestore.FieldValue.increment(result.success ? 0 : 1),
      totalCost: admin.firestore.FieldValue.increment(result.estimatedCost || 0),
      totalDuration: admin.firestore.FieldValue.increment(result.duration || 0),
      successfulStages: admin.firestore.FieldValue.increment(result.successfulStages || 0),
      failedStages: admin.firestore.FieldValue.increment(result.failedStages || 0),
    };

    // Add error detail if failed
    if (!result.success && result.errorReason) {
      update.lastError = {
        reason: result.errorReason,
        failedStage: result.failedStage || 'unknown',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      };
    }

    await analyticsRef.set(update, { merge: true }).catch(e =>
      logger.warn('[Analytics] Failed to write daily stats:', e.message)
    );

    // Also track per-user metrics
    const userAnalyticsRef = db.collection('users').doc(userId).collection('multiverseAnalytics').doc(today);
    await userAnalyticsRef.set({
      matchId,
      success: result.success,
      cost: result.estimatedCost || 0,
      duration: result.duration || 0,
      score: result.compatibilityScore || null,
      errorReason: result.errorReason || null,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true }).catch(e =>
      logger.warn('[Analytics] Failed to write user stats:', e.message)
    );
  } catch (e) {
    logger.warn('[Analytics] Tracking failed:', e.message);
  }
}

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

/**
 * Stage labels in 10 languages
 * Indexed by stageId, then language code
 */
const STAGE_LABELS_BY_LANGUAGE = {
  initial_contact: {
    en: 'First Contact',
    es: 'Primer contacto',
    pt: 'Primeiro contato',
    fr: 'Premier contact',
    de: 'Erstkontakt',
    ja: '最初の接触',
    zh: '初次接触',
    ru: 'Первый контакт',
    ar: 'التواصل الأول',
    id: 'Kontak pertama',
  },
  getting_to_know: {
    en: 'Getting to Know',
    es: 'Conociéndose',
    pt: 'Conhecendo-se',
    fr: 'Apprendre à se connaître',
    de: 'Kennenlernen',
    ja: 'お互いを知る',
    zh: '互相了解',
    ru: 'Знакомство',
    ar: 'التعارف',
    id: 'Saling mengenal',
  },
  building_connection: {
    en: 'Deep Connection',
    es: 'Conexión profunda',
    pt: 'Conexão profunda',
    fr: 'Connexion profonde',
    de: 'Tiefe Verbindung',
    ja: '深い絆',
    zh: '深度连接',
    ru: 'Глубокая связь',
    ar: 'الاتصال العميق',
    id: 'Koneksi mendalam',
  },
  conflict_challenge: {
    en: 'Challenge',
    es: 'Desafío',
    pt: 'Desafio',
    fr: 'Défi',
    de: 'Herausforderung',
    ja: '試練',
    zh: '挑战',
    ru: 'Испытание',
    ar: 'التحدي',
    id: 'Tantangan',
  },
  commitment: {
    en: 'Next Step',
    es: 'Siguiente paso',
    pt: 'Próximo passo',
    fr: 'Prochaine étape',
    de: 'Nächster Schritt',
    ja: '次のステップ',
    zh: '下一步',
    ru: 'Следующий шаг',
    ar: 'الخطوة التالية',
    id: 'Langkah berikutnya',
  },
};

/**
 * Normalize language code to 2-letter ISO 639-1 format
 * Handles cases like "es-MX" → "es", "en-US" → "en", etc.
 */
function normalizeLanguageCode(lang) {
  if (!lang) return 'en';
  const normalized = lang.toLowerCase().substring(0, 2);
  const validLanguages = ['en', 'es', 'pt', 'fr', 'de', 'ja', 'zh', 'ru', 'ar', 'id'];
  return validLanguages.includes(normalized) ? normalized : 'en';
}

/**
 * Get localized stage label based on stageId and language
 */
function getLocalizedStageLabel(stageId, language = 'en') {
  const normalizedLang = normalizeLanguageCode(language);
  const labels = STAGE_LABELS_BY_LANGUAGE[stageId];
  if (!labels) return stageId; // Fallback to stageId if not found
  return labels[normalizedLang] || labels['en']; // Fallback to English
}

/**
 * Solo mode partner names (Ideal Partner / Pareja ideal / etc.)
 */
const SOLO_MODE_NAMES = {
  en: 'Ideal Partner',
  es: 'Pareja ideal',
  pt: 'Parceiro ideal',
  fr: 'Partenaire idéal',
  de: 'Idealer Partner',
  ja: '理想のパートナー',
  zh: '理想伴侣',
  ru: 'Идеальный партнер',
  ar: 'الشريك المثالي',
  id: 'Pasangan ideal',
};

/**
 * Get localized solo mode partner name based on language
 */
function getLocalizedSoloName(language = 'en') {
  const normalizedLang = normalizeLanguageCode(language);
  return SOLO_MODE_NAMES[normalizedLang] || SOLO_MODE_NAMES['en'];
}

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
    const startTime = Date.now();
    const userId = request.auth?.uid;
    if (!userId) throw new HttpsError('unauthenticated', 'User must be logged in');

    let { matchId = "", userLanguage = 'en' } = request.data;
    // Normalize language code to 2-letter ISO 639-1 format (handles "es-MX" → "es")
    userLanguage = normalizeLanguageCode(userLanguage);
    const isSoloMode = !matchId;  // Empty matchId = solo practice mode

    let analyticsData = {
      userId: userId.substring(0, 4), // anonymize
      matchId: isSoloMode ? "solo" : matchId.substring(0, 4),
      success: false,
      duration: 0,
      estimatedCost: 0,
      successfulStages: 0,
      failedStages: 0,
      errorReason: null,
      failedStage: null,
    };

    try {
      logger.info(`[MultiUniverse] START: userId=${userId.substring(0, 4)}, mode=${isSoloMode ? 'SOLO' : `match=${matchId.substring(0, 4)}`}, lang=${userLanguage}`);

      // Step 0: Load config from Remote Config
      const configStart = Date.now();
      const config = await getMultiUniverseConfig();
      logger.info(`[MultiUniverse] Config loaded in ${Date.now() - configStart}ms`);

      // Step 1: UNIFIED rate limit CHECK using coachMessagesRemaining
      // Simulations use the same Coach IA credit pool (not a separate counter)
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        logger.error(`[MultiUniverse] User document not found: ${userId}`);
        analyticsData.errorReason = 'user_not_found';
        await trackMultiUniverseAnalytics(userId, matchId || "solo", analyticsData);
        throw new HttpsError('not-found', 'User profile not found');
      }

      const userData = userDoc.data();
      const remainingCredits = userData?.coachMessagesRemaining ?? 3;
      logger.info(`[MultiUniverse] Unified rate limit check: ${remainingCredits} credits remaining`);

      if (remainingCredits <= 0) {
        logger.warn(`[MultiUniverse] Rate limit exceeded for user (no credits left)`);
        analyticsData.errorReason = 'rate_limit_exceeded';
        await trackMultiUniverseAnalytics(userId, matchId || "solo", analyticsData);
        throw new HttpsError(
          'resource-exhausted',
          `Daily limit reached. You have used all your Coach IA credits for today. Come back tomorrow for 3 fresh credits.`
        );
      }

      // Step 2: Check cache (valid for 6 months)
      const cacheKey = isSoloMode ? 'multiverse_solo' : `multiverse_${matchId}`;
      const cacheDoc = await db.collection('users').doc(userId)
        .collection('multiUniverseCache').doc(cacheKey).get();

      if (cacheDoc.exists) {
        const cachedResult = cacheDoc.data();
        // Handle both old (JS timestamp) and new (Firestore Timestamp) formats for backward compatibility
        let cacheExpireTime;
        if (cachedResult.cacheExpire instanceof admin.firestore.Timestamp) {
          cacheExpireTime = cachedResult.cacheExpire.toDate().getTime();
        } else {
          // Old format: JavaScript timestamp (number)
          cacheExpireTime = cachedResult.cacheExpire;
        }

        if (cacheExpireTime > Date.now()) {
          logger.info(`[MultiUniverse] ✓ CACHE HIT (valid until ${new Date(cacheExpireTime).toISOString()})`);
          logger.info(`[MultiUniverse] Mode: ${cachedResult.isSoloMode ? 'SOLO' : `match=${matchId.substring(0, 8)}`}`);

          // Re-localize stage labels for current user language (cache might have different language)
          const localizedStages = cachedResult.stages.map(stage => ({
            ...stage,
            stageLabel: getLocalizedStageLabel(stage.stageId, userLanguage)
          }));

          analyticsData.success = true;
          analyticsData.duration = Date.now() - startTime;
          await trackMultiUniverseAnalytics(userId, matchId || "solo", analyticsData);
          return { ...cachedResult, stages: localizedStages, fromCache: true };
        } else {
          logger.info(`[MultiUniverse] Cache expired at ${new Date(cacheExpireTime).toISOString()}`);
        }
      }
      logger.info(`[MultiUniverse] No valid cache found`);

      // Step 3: Load match document (or use default name for solo mode)
      let matchName = 'Your Match';

      if (isSoloMode) {
        // Solo mode: use localized default name
        const soloNameKey = 'coach-multiverse-solo-name';  // Localize if needed
        matchName = getLocalizedSoloName(userLanguage);
        logger.info(`[MultiUniverse] ✓ Solo mode: using "${matchName}"`);
      } else {
        // Real match mode: load from Firestore
        logger.info(`[MultiUniverse] Loading match document: ${matchId.substring(0, 8)}... (${matchId.length} chars)`);
        const matchDoc = await db.collection('matches').doc(matchId).get();
        if (!matchDoc.exists) {
          logger.error(`[MultiUniverse] Match NOT FOUND in /matches collection: ${matchId}`);
          logger.error(`[MultiUniverse] Match lookup details:`);
          logger.error(`  - Collection: matches`);
          logger.error(`  - DocId: ${matchId}`);
          logger.error(`  - DocId length: ${matchId.length}`);
          logger.error(`  - First 4 chars: ${matchId.substring(0, 4)}`);

          // Try to find what matches DO exist for debugging
          const allMatchesSnap = await db.collection('matches').limit(3).get();
          logger.error(`[MultiUniverse] Sample existing matches: ${allMatchesSnap.docs.map(d => d.id.substring(0, 8) + '...').join(', ')}`);

          analyticsData.errorReason = 'match_not_found';
          analyticsData.failedStage = 'load_match';
          await trackMultiUniverseAnalytics(userId, matchId || "solo", analyticsData);
          throw new HttpsError('not-found', `Match not found (ID: ${matchId.substring(0, 8)}...)`);
        }
        const matchData = matchDoc.data();
        const otherUserId = matchData?.usersMatched?.find((uid) => uid !== userId);

        // Step 3b: Load other user's profile (from /users/{otherUserId}) for their name
        if (otherUserId) {
          try {
            const otherUserDoc = await db.collection('users').doc(otherUserId).get();
            if (otherUserDoc.exists) {
              matchName = otherUserDoc.data()?.name || 'Your Match';
            }
          } catch (e) {
            logger.warn(`[MultiUniverse] Could not load other user profile for name, using default`);
          }
        }
        logger.info(`[MultiUniverse] ✓ Match loaded: ${matchName} (${matchId.substring(0, 8)}...)`);
        logger.info(`[MultiUniverse] Match data keys: ${Object.keys(matchData || {}).join(', ').substring(0, 100)}`);
      }

      // Step 4: Run 5 situation simulations (sequentially, each via simulateSituation CF)
      const stages = [];
      let totalTokens = 0;
      const stageDurations = {};

      for (const stage of MULTI_UNIVERSE_STAGES) {
        const stageStart = Date.now();
        try {
          logger.info(`[MultiUniverse] ▶️ Stage ${stage.id} (${stage.order}/5)...`);

          // Call simulateSituation internally via admin SDK
          // This simulates how the user would approach this relationship stage
          const situationResponse = await callSituationSimulationInternal(
            db, userId, matchId, stage.situation, userLanguage
          );

          const stageDuration = Date.now() - stageStart;
          stageDurations[stage.id] = stageDuration;

          if (!situationResponse.success || !situationResponse.approaches || situationResponse.approaches.length === 0) {
            logger.error(`[MultiUniverse] Stage ${stage.id} returned no approaches`);
            throw new Error('No valid approaches returned from situation simulation');
          }

          // Calculate average reaction score across all 4 approaches
          const scores = situationResponse.approaches.map(a => a.successScore || 0);
          const avgReactionScore = scores.reduce((a, b) => a + b, 0) / scores.length;

          // Pick the best approach for this stage
          const bestApproach = situationResponse.approaches.reduce((a, b) =>
            (b.successScore || 0) > (a.successScore || 0) ? b : a
          );

          const localizedStageLabel = getLocalizedStageLabel(stage.id, userLanguage);
          const stageResult = {
            stageId: stage.id,
            stageLabel: localizedStageLabel,
            order: stage.order,
            approaches: situationResponse.approaches,
            avgReactionScore: parseFloat(avgReactionScore.toFixed(2)),
            bestApproachId: bestApproach?.id || null,
            bestApproachPhrase: bestApproach?.phrase || '',
            coachTip: situationResponse.coachTip || `Strong potential at ${localizedStageLabel}`,
            psyInsights: situationResponse.psychInsights || 'Compatible communication patterns emerging',
          };
          stages.push(stageResult);
          analyticsData.successfulStages++;

          logger.info(`[MultiUniverse] ✅ Stage ${stage.id}: score=${avgReactionScore.toFixed(1)}, duration=${stageDuration}ms`);

          // Track tokens if available
          if (situationResponse.tokens) {
            totalTokens += situationResponse.tokens;
          }

          // 200ms pause between stages to avoid rate limit (soft throttle)
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (e) {
          const stageDuration = Date.now() - stageStart;
          stageDurations[stage.id] = stageDuration;
          logger.error(`[MultiUniverse] ❌ Stage ${stage.id} failed after ${stageDuration}ms:`, e.message, e.stack);

          analyticsData.failedStages++;
          if (!analyticsData.failedStage) {
            analyticsData.failedStage = stage.id;
          }

          const errorStageLabelLocalized = getLocalizedStageLabel(stage.id, userLanguage);
          stages.push({
            stageId: stage.id,
            stageLabel: errorStageLabelLocalized,
            order: stage.order,
            error: e.message,
            approaches: [],
            avgReactionScore: 0,
          });
        }
      }

      const successfulStages = stages.filter(s => !s.error);
      logger.info(`[MultiUniverse] Completed: ${successfulStages.length}/5 stages successful`);

      // Step 5: Calculate compatibility
      const { score, stars, label } = calculateCompatibility(successfulStages, userLanguage);

      // CRITICAL: If all stages failed, don't cache and throw error instead
      if (successfulStages.length === 0) {
        logger.error(`[MultiUniverse] ALL STAGES FAILED`);
        analyticsData.errorReason = 'all_stages_failed';
        await trackMultiUniverseAnalytics(userId, matchId || "solo", analyticsData);
        throw new HttpsError(
          'internal',
          'Unable to test all relationship stages. Please try again in a moment.'
        );
      }

      // Step 6: Generate insights
      const insights = generateInsights(successfulStages, label, userLanguage);
      logger.info(`[MultiUniverse] Generated ${insights.length} insights, score=${score}`);

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
        userLanguage, // Store language used for this generation
        generatedAt: admin.firestore.FieldValue.serverTimestamp(), // Server timestamp
        // Note: cacheExpire is added during cache write step with Firestore Timestamp
      };

      // VALIDATION: Ensure result is complete before caching
      if (!result.stages || result.stages.length === 0) {
        logger.error(`[MultiUniverse] Validation failed: no stages in result`);
        analyticsData.errorReason = 'invalid_result';
        await trackMultiUniverseAnalytics(userId, matchId || "solo", analyticsData);
        throw new HttpsError('internal', 'Generated result is incomplete. Please try again.');
      }
      logger.info(`[MultiUniverse] Result validated: ${result.stages.length} stages, score=${score}`);

      // Step 8a: Cache ALWAYS for 6 months (robust persistence to Firebase)
      // We cache ALL successful simulations, regardless of score, because:
      // 1. The simulation is expensive (Gemini calls, 5 stages)
      // 2. Users should see consistent results when they revisit
      // 3. Low scores are still valid feedback
      // CRITICAL: Use Firestore Timestamps for cross-platform consistency
      const cacheData = {
        ...result,
        cacheExpire: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + (cacheMinutes * 60 * 1000))
        ), // Firestore native timestamp
        cachedAt: admin.firestore.FieldValue.serverTimestamp(),
        isSoloMode,
      };

      // ROBUST PERSISTENCE with retry logic (up to 3 attempts)
      let cacheWriteSuccess = false;
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await db.collection('users').doc(userId)
            .collection('multiUniverseCache').doc(cacheKey).set(cacheData, { merge: true });
          cacheWriteSuccess = true;
          logger.info(`[MultiUniverse] ✓ Cached result on attempt ${attempt} (score=${score})`);
          break;
        } catch (e) {
          lastError = e;
          logger.warn(`[MultiUniverse] Cache write attempt ${attempt}/3 failed: ${e.message}`);
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 100 * attempt)); // Backoff: 100ms, 200ms
          }
        }
      }

      if (!cacheWriteSuccess) {
        logger.error(`[MultiUniverse] FAILED to cache result after 3 attempts: ${lastError?.message}`);
        // Still return result to user, but they won't benefit from cache next time
      }

      // Step 8: DECREMENT UNIFIED coachMessagesRemaining (only after successful generation)
      // This ensures users only lose their daily credit if simulation actually completes
      // Simulations and regular Coach IA messages share the same credit pool
      await db.collection('users').doc(userId).update({
        coachMessagesRemaining: db.FieldValue.increment(-1)
      }).catch(e => logger.warn('[MultiUniverse] Failed to decrement coach credits:', e.message));
      logger.info(`[MultiUniverse] Coach credits decremented (unified counter)`);

      // Estimate cost: ~0.000075 per input token, ~0.0003 per output token (Gemini 2.5 Flash pricing)
      const estimatedCost = (totalTokens * 0.000075) + (successfulStages.length * 100 * 0.0003);
      analyticsData.success = true;
      analyticsData.duration = Date.now() - startTime;
      analyticsData.estimatedCost = estimatedCost;
      analyticsData.compatibilityScore = score;

      logger.info(`[MultiUniverse] ✨ SUCCESS: score=${score}, cost≈$${estimatedCost.toFixed(4)}, duration=${analyticsData.duration}ms`);
      await trackMultiUniverseAnalytics(userId, matchId || "solo", analyticsData);

      return { ...result, fromCache: false };
    } catch (e) {
      analyticsData.duration = Date.now() - startTime;

      if (e instanceof HttpsError) {
        logger.error(`[MultiUniverse] HttpsError (${e.code}): ${e.message}`);
        await trackMultiUniverseAnalytics(userId, matchId || "solo", analyticsData);
        throw e;
      }

      logger.error('[MultiUniverse] Unexpected error:', e.message, e.stack);
      analyticsData.errorReason = 'unexpected_error';
      analyticsData.errorMessage = e.message;
      await trackMultiUniverseAnalytics(userId, matchId || "solo", analyticsData);

      throw new HttpsError('internal', 'Simulation failed. Please try again.');
    }
  }
);

/**
 * Internal call to generate situation approaches via Gemini.
 * Multi-universe has its own rate limit (3/day), separate from situation simulation limit.
 * So calling Gemini directly here doesn't consume user's situation simulation quota.
 */
async function callSituationSimulationInternal(db, userId, matchId, situation, userLanguage) {
  const callStart = Date.now();
  try {
    logger.info(`[SituationInternal] Starting Gemini call for: ${situation.substring(0, 50)}...`);

    // Generate 4 approaches using Gemini
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const approaches = await generateApproachesForMultiverse(genAI, situation, userLanguage);

    const callDuration = Date.now() - callStart;
    logger.info(`[SituationInternal] Gemini call completed in ${callDuration}ms`);

    if (!approaches || approaches.length === 0) {
      logger.warn(`[SituationInternal] Gemini returned empty approaches, using fallback`);
      return {
        success: true,
        situation,
        situationType: 'other',
        matchName: 'Your Match',
        approaches: generateApproachesFallback(userLanguage),
        bestApproachId: '1',
        coachTip: getLocalizedCoachTip('communication_foundation', userLanguage),
        psychInsights: 'Focus on authenticity and openness.',
        tokens: 0,
      };
    }

    logger.info(`[SituationInternal] Generated ${approaches.length} approaches`);

    // Score each approach (simulate match reaction)
    const approachesWithScores = approaches.map((app, idx) => {
      const score = scoreApproach(app.phrase, situation, userLanguage);
      logger.info(`[SituationInternal] Approach ${app.id} (${app.tone}): score=${score}`);
      return {
        id: app.id,
        tone: app.tone,
        phrase: app.phrase,
        matchReaction: generateMatchReaction(app.tone, situation, userLanguage),
        successScore: score,
        signals: ['warmth', 'reciprocation', 'openness'],
        recommendedFor: idx === 0 ? 'Direct opener' : null,
      };
    });

    return {
      success: true,
      situation,
      situationType: 'other',
      matchName: 'Your Match',
      approaches: approachesWithScores,
      bestApproachId: approachesWithScores[0]?.id || '1',
      coachTip: getLocalizedCoachTip('approach_variety', userLanguage),
      psychInsights: 'The variety tests compatibility across communication styles.',
      tokens: approaches.length * 150, // rough estimate
    };
  } catch (e) {
    const callDuration = Date.now() - callStart;
    logger.error(`[SituationInternal] Failed after ${callDuration}ms: ${e.message}`, e.stack);

    // Fallback to basic approaches if Gemini fails
    return {
      success: true,
      situation,
      situationType: 'other',
      matchName: 'Your Match',
      approaches: generateApproachesFallback(userLanguage),
      bestApproachId: '1',
      coachTip: getLocalizedCoachTip('communication_importance', userLanguage),
      psychInsights: 'Genuine connection develops through authentic dialogue.',
      tokens: 0,
    };
  }
}

/**
 * Generate 4 approaches using Gemini (direct Gemini call, not via CF)
 */
async function generateApproachesForMultiverse(genAI, situation, userLang) {
  const callStart = Date.now();
  try {
    logger.info(`[Gemini] Initializing model: ${AI_MODEL_NAME}`);
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

    logger.info(`[Gemini] Prompt size: ${prompt.length} chars, language: ${userLang}`);

    // Timeout: if Gemini takes > 25 seconds, fail gracefully
    const geminiPromise = model.generateContent(prompt);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Gemini timeout: exceeded 25 seconds')), 25000)
    );

    let result;
    try {
      result = await Promise.race([geminiPromise, timeoutPromise]);
      logger.info(`[Gemini] Content generation succeeded`);
    } catch (timeoutErr) {
      logger.error('[Gemini] TIMEOUT after 25s:', timeoutErr.message);
      return generateApproachesFallback(userLang);
    }

    const text = result?.response?.text();
    logger.info(`[Gemini] Response size: ${(text || '').length} chars`);

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      logger.error(`[Gemini] Empty response body`);
      return generateApproachesFallback(userLang);
    }

    // Log response preview (first 200 chars)
    logger.info(`[Gemini] Response preview: ${text.substring(0, 200)}`);

    const parsed = parseGeminiJsonResponse(text);
    if (!parsed) {
      logger.error(`[Gemini] Failed to parse JSON from response`);
      logger.debug(`[Gemini] Raw response was: ${text}`);
      return generateApproachesFallback();
    }

    if (!Array.isArray(parsed?.approaches) || parsed.approaches.length === 0) {
      logger.error(`[Gemini] Parsed JSON but no approaches array found`);
      logger.debug(`[Gemini] Parsed object: ${JSON.stringify(parsed)}`);
      return generateApproachesFallback();
    }

    logger.info(`[Gemini] Parsed ${parsed.approaches.length} approaches`);

    const approaches = parsed.approaches;
    const byTone = new Map();
    for (const a of approaches) {
      if (a && typeof a.phrase === 'string' && a.tone) {
        byTone.set(a.tone, a.phrase.trim());
        logger.info(`[Gemini] ✓ Tone "${a.tone}": "${a.phrase.substring(0, 40)}..."`);
      } else {
        logger.warn(`[Gemini] Invalid approach object:`, JSON.stringify(a));
      }
    }

    const result_approaches = FIXED_TONES.map((tone, i) => ({
      id: String(i + 1),
      tone,
      phrase: byTone.get(tone) || approaches[i]?.phrase || '',
    }));

    logger.info(`[Gemini] Finalized ${result_approaches.length} approaches in ${Date.now() - callStart}ms`);
    return result_approaches;
  } catch (e) {
    logger.error(`[Gemini] Error after ${Date.now() - callStart}ms:`, e.message);
    if (e.stack) logger.error(`[Gemini] Stack:`, e.stack);
    return generateApproachesFallback();
  }
}

/**
 * Fallback approaches when Gemini fails or returns invalid response
 */
function generateApproachesFallback(userLang = 'en') {
  const fallbackPhrases = {
    en: [
      { id: '1', tone: 'direct', phrase: 'I wanted to talk with you about something. Can we chat?' },
      { id: '2', tone: 'playful', phrase: 'Hey, got a moment? There\'s something I want to say.' },
      { id: '3', tone: 'romantic_vulnerable', phrase: 'I\'ve been thinking about you, and I want to be honest about how I feel.' },
      { id: '4', tone: 'grounded_honest', phrase: 'I care about us and want to understand each other better.' },
    ],
    es: [
      { id: '1', tone: 'direct', phrase: 'Quería hablar contigo sobre algo. ¿Podemos conversar?' },
      { id: '2', tone: 'playful', phrase: 'Oye, ¿tienes un momento? Hay algo que quiero decir.' },
      { id: '3', tone: 'romantic_vulnerable', phrase: 'He estado pensando en ti, y quiero ser honesto sobre cómo me siento.' },
      { id: '4', tone: 'grounded_honest', phrase: 'Me importas y quiero que nos entendamos mejor.' },
    ],
    pt: [
      { id: '1', tone: 'direct', phrase: 'Queria falar com você sobre algo. Podemos conversar?' },
      { id: '2', tone: 'playful', phrase: 'Oie, tem um momento? Tem algo que quero dizer.' },
      { id: '3', tone: 'romantic_vulnerable', phrase: 'Estive pensando em você, e quero ser honesto sobre como me sinto.' },
      { id: '4', tone: 'grounded_honest', phrase: 'Você me importa e quero que nos entendamos melhor.' },
    ],
    fr: [
      { id: '1', tone: 'direct', phrase: 'Je voulais te parler de quelque chose. On peut discuter?' },
      { id: '2', tone: 'playful', phrase: 'Hé, tu as une minute? Il y a quelque chose que je veux dire.' },
      { id: '3', tone: 'romantic_vulnerable', phrase: 'Je pense à toi, et je veux être honnête sur mes sentiments.' },
      { id: '4', tone: 'grounded_honest', phrase: 'Tu m\'importes et je veux qu\'on se comprenne mieux.' },
    ],
    de: [
      { id: '1', tone: 'direct', phrase: 'Ich wollte mit dir über etwas sprechen. Können wir reden?' },
      { id: '2', tone: 'playful', phrase: 'Hey, hast du einen Moment? Es gibt etwas, das ich dir sagen möchte.' },
      { id: '3', tone: 'romantic_vulnerable', phrase: 'Ich habe viel an dir gedacht und möchte dir ehrlich sagen, wie ich mich fühle.' },
      { id: '4', tone: 'grounded_honest', phrase: 'Mir liegt an uns und ich möchte, dass wir uns besser verstehen.' },
    ],
    ja: [
      { id: '1', tone: 'direct', phrase: 'あなたと何かについて話したいのです。話してもいいですか？' },
      { id: '2', tone: 'playful', phrase: 'ねえ、ちょっと時間ある？言いたいことがあるんだ。' },
      { id: '3', tone: 'romantic_vulnerable', phrase: 'ずっとあなたのことを考えていて、本当の気持ちを伝えたいんです。' },
      { id: '4', tone: 'grounded_honest', phrase: 'あなたのことが大事で、もっと理解し合いたいんです。' },
    ],
    zh: [
      { id: '1', tone: 'direct', phrase: '我想和你谈论一些事情。我们可以聊天吗？' },
      { id: '2', tone: 'playful', phrase: '嘿，你有时间吗？我想说点东西。' },
      { id: '3', tone: 'romantic_vulnerable', phrase: '我一直在想你，我想坦诚地告诉你我的感受。' },
      { id: '4', tone: 'grounded_honest', phrase: '你对我很重要，我想让我们更相互了解。' },
    ],
    ru: [
      { id: '1', tone: 'direct', phrase: 'Я хотел бы с вами поговорить. Можем ли мы поговорить?' },
      { id: '2', tone: 'playful', phrase: 'Эй, у тебя есть минутка? Я хочу что-то сказать.' },
      { id: '3', tone: 'romantic_vulnerable', phrase: 'Я много думал о тебе и хочу честно рассказать о своих чувствах.' },
      { id: '4', tone: 'grounded_honest', phrase: 'Ты мне важен и я хочу, чтобы мы лучше друг друга поняли.' },
    ],
    ar: [
      { id: '1', tone: 'direct', phrase: 'أريد أن أتحدث معك عن شيء. هل يمكننا التحدث؟' },
      { id: '2', tone: 'playful', phrase: 'هيه، هل لديك لحظة؟ هناك شيء أريد أن أقوله.' },
      { id: '3', tone: 'romantic_vulnerable', phrase: 'كنت أفكر فيك، وأريد أن أكون صادقاً بشأن شعوري.' },
      { id: '4', tone: 'grounded_honest', phrase: 'أنت مهم بالنسبة لي وأريد أن نتفاهم أكثر.' },
    ],
    id: [
      { id: '1', tone: 'direct', phrase: 'Saya ingin berbicara dengan Anda tentang sesuatu. Bisakah kita berbincang?' },
      { id: '2', tone: 'playful', phrase: 'Hei, punya sebentar? Ada sesuatu yang ingin saya katakan.' },
      { id: '3', tone: 'romantic_vulnerable', phrase: 'Saya selalu memikirkan Anda, dan saya ingin jujur tentang perasaan saya.' },
      { id: '4', tone: 'grounded_honest', phrase: 'Anda penting bagi saya dan saya ingin kita saling memahami lebih baik.' },
    ],
  };

  const lang = fallbackPhrases[userLang] ? userLang : 'en';
  return fallbackPhrases[lang];
}

/**
 * Get localized coach tip for fallback scenarios (10 languages)
 */
function getLocalizedCoachTip(tipKey, userLang = 'en') {
  const tips = {
    communication_foundation: {
      en: 'Communication is key in this stage.',
      es: 'La comunicación es clave en esta etapa.',
      pt: 'A comunicação é fundamental nesta fase.',
      fr: 'La communication est essentielle à ce stade.',
      de: 'Kommunikation ist in dieser Phase entscheidend.',
      ja: 'この段階では、コミュニケーションが重要です。',
      zh: '在这个阶段，沟通是关键。',
      ru: 'На этом этапе общение — это ключ.',
      ar: 'التواصل مفتاح النجاح في هذه المرحلة.',
      id: 'Komunikasi adalah kunci di tahap ini.',
    },
    approach_variety: {
      en: 'Each approach showcases different emotional strengths in this stage.',
      es: 'Cada enfoque muestra diferentes fortalezas emocionales en esta etapa.',
      pt: 'Cada abordagem mostra diferentes forças emocionais nesta fase.',
      fr: 'Chaque approche met en avant différentes forces émotionnelles à ce stade.',
      de: 'Jeder Ansatz zeigt unterschiedliche emotionale Stärken in dieser Phase.',
      ja: '各アプローチは、この段階でさまざまな感情的な強さを示しています。',
      zh: '每种方法在这个阶段都展示了不同的情感优势。',
      ru: 'Каждый подход демонстрирует различные эмоциональные сильные стороны на этом этапе.',
      ar: 'كل نهج يعرض نقاط قوة عاطفية مختلفة في هذه المرحلة.',
      id: 'Setiap pendekatan menunjukkan kekuatan emosional yang berbeda di tahap ini.',
    },
    communication_importance: {
      en: 'Communication is important at this stage.',
      es: 'La comunicación es importante en esta etapa.',
      pt: 'A comunicação é importante nesta fase.',
      fr: 'La communication est importante à ce stade.',
      de: 'Kommunikation ist in dieser Phase wichtig.',
      ja: 'この段階では、コミュニケーションが大切です。',
      zh: '在这个阶段，沟通很重要。',
      ru: 'На этом этапе общение важно.',
      ar: 'التواصل مهم في هذه المرحلة.',
      id: 'Komunikasi penting di tahap ini.',
    },
  };

  const tipTexts = tips[tipKey] || tips.communication_foundation;
  return tipTexts[userLang] || tipTexts.en;
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

function generateInsights(stages, label, language = 'en') {
  const normalizedLang = normalizeLanguageCode(language);
  const insightLabels = {
    en: {
      overall: 'Overall:',
      strongest: '💪 Strongest:',
      challenge: '⚠️ Challenge:',
      positive: '✨ Consistently positive interactions',
      noInsights: 'Unable to generate insights',
    },
    es: {
      overall: 'General:',
      strongest: '💪 Más fuerte:',
      challenge: '⚠️ Desafío:',
      positive: '✨ Interacciones consistentemente positivas',
      noInsights: 'No se pueden generar insights',
    },
    pt: {
      overall: 'Geral:',
      strongest: '💪 Mais forte:',
      challenge: '⚠️ Desafio:',
      positive: '✨ Interações consistentemente positivas',
      noInsights: 'Não é possível gerar insights',
    },
    fr: {
      overall: 'Global:',
      strongest: '💪 Le plus fort:',
      challenge: '⚠️ Défi:',
      positive: '✨ Interactions constamment positives',
      noInsights: 'Impossible de générer des insights',
    },
    de: {
      overall: 'Insgesamt:',
      strongest: '💪 Am stärksten:',
      challenge: '⚠️ Herausforderung:',
      positive: '✨ Durchweg positive Interaktionen',
      noInsights: 'Keine Insights zu generieren',
    },
    ja: {
      overall: '全体的に:',
      strongest: '💪 最も強い:',
      challenge: '⚠️ チャレンジ:',
      positive: '✨ 一貫して肯定的なやり取り',
      noInsights: 'インサイトを生成できません',
    },
    zh: {
      overall: '总体:',
      strongest: '💪 最强:',
      challenge: '⚠️ 挑战:',
      positive: '✨ 持续积极的互动',
      noInsights: '无法生成洞察',
    },
    ru: {
      overall: 'В целом:',
      strongest: '💪 Самое сильное:',
      challenge: '⚠️ Вызов:',
      positive: '✨ Постоянно позитивные взаимодействия',
      noInsights: 'Невозможно создать инсайты',
    },
    ar: {
      overall: 'بشكل عام:',
      strongest: '💪 الأقوى:',
      challenge: '⚠️ التحدي:',
      positive: '✨ تفاعلات إيجابية باستمرار',
      noInsights: 'لا يمكن توليد رؤى',
    },
    id: {
      overall: 'Keseluruhan:',
      strongest: '💪 Terkuat:',
      challenge: '⚠️ Tantangan:',
      positive: '✨ Interaksi konsisten positif',
      noInsights: 'Tidak dapat menghasilkan wawasan',
    },
  };

  const labels = insightLabels[normalizedLang] || insightLabels['en'];
  const insights = [];
  if (stages.length === 0) return [labels.noInsights];

  insights.push(`${labels.overall} ${label}`);

  const bestStage = stages.reduce((b, c) => (c.avgReactionScore || 0) > (b.avgReactionScore || 0) ? c : b);
  if (bestStage?.stageLabel) {
    insights.push(`${labels.strongest} ${bestStage.stageLabel}`);
  }

  const weakStages = stages.filter(s => (s.avgReactionScore || 0) < 6);
  if (weakStages.length > 0) {
    insights.push(`${labels.challenge} ${weakStages.map(s => s.stageLabel).join(', ')}`);
  }

  const scores = stages.map(s => s.avgReactionScore || 0);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avgScore > 8) insights.push(labels.positive);

  return insights.slice(0, 3);
}
