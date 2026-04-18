/**
 * Multi-Universe Simulator
 *
 * Tests compatibility across 5 relationship stages + scenarios
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
  getLocalizedError: getLocalizedErrorShared,
  checkGeminiSafety,
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
  if (typeof lang !== 'string' || !lang) return 'en';
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

/**
 * Fast translation helper for cached phrases to a different language
 * Uses Gemini's translation capability to convert phrases when cache language differs
 */
async function translatePhraseToLanguage(phrase, fromLang, toLang) {
  try {
    if (!phrase || phrase.length === 0) return phrase;
    if (fromLang === toLang) return phrase;

    const cfg = (await getMultiUniverseConfig()).gemini;
    const genAI = new GoogleGenerativeAI(geminiApiKey.value());
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite', // Use lite for fast translation
      generationConfig: {
        maxOutputTokens: cfg.translateMaxTokens,
        temperature: cfg.translateTemperature,
      },
    });

    const langNames = { en: 'English', es: 'Spanish', pt: 'Portuguese', fr: 'French',
                        de: 'German', ja: 'Japanese', zh: 'Chinese', ru: 'Russian',
                        ar: 'Arabic', id: 'Indonesian' };

    const prompt = `Translate this dating coaching phrase from ${langNames[fromLang] || 'English'} to ${langNames[toLang] || 'English'}. Keep tone and meaning identical. Return ONLY the translated phrase, nothing else:\n\n"${phrase}"`;

    const result = await model.generateContent(prompt);
    const translation = result?.response?.text()?.trim();

    if (translation && translation.length > 0) {
      logger.info(`[Translate] Converted phrase from ${fromLang} to ${toLang}`);
      return translation;
    }

    return phrase; // Fallback to original if translation fails
  } catch (e) {
    logger.warn(`[Translate] Failed to translate from ${fromLang} to ${toLang}:`, e.message);
    return phrase; // Fallback to original on any error
  }
}

// Remote Config defaults for multi-universe simulation
// Structured so ops can override any value via `simulation_config` in Firebase RC
// without redeploying the Cloud Function.
const MULTIVERSE_CONFIG_DEFAULTS = {
  enabled: true,
  // NOTE: maxPerDay is deprecated — unified rate limit uses `coachMessagesRemaining`.
  // Kept for backward compatibility with older RC templates.
  maxPerDay: 3,
  cacheMinutes: 180 * 24 * 60, // 6 months in minutes
  gemini: {
    approachTemperature: 0.85,
    approachMaxTokens: 800,
    translateTemperature: 0.3,
    translateMaxTokens: 150,
    timeoutMs: 25000,
  },
};

// Remote Config cache for simulation_config
let _multiverseConfigCache = null;
let _multiverseConfigCacheTime = 0;
const MULTIVERSE_CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 min

// Bump this whenever the cached output shape changes or a user-visible
// correctness bug is fixed in the generation pipeline. Any cache entry
// whose `cacheSchemaVersion` is below this value is treated as stale.
// v1 = pre-alternativePhrases
// v2 = alternativePhrases added
// v3 = fixed language-mixed fallback (Gemini failure path no longer embeds
//      the English STAGE_TEMPLATES priming text into localized fallbacks)
const CACHE_SCHEMA_VERSION = 3;

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
      // Deep-merge the nested `gemini` block so ops can override one key without
      // wiping the rest of the defaults.
      _multiverseConfigCache = {
        ...MULTIVERSE_CONFIG_DEFAULTS,
        ...rcConfig,
        gemini: { ...MULTIVERSE_CONFIG_DEFAULTS.gemini, ...(rcConfig.gemini || {}) },
      };
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
  {
    region: 'us-central1',
    memory: '1GiB',
    timeoutSeconds: 300,
    // geminiApiKey.value() is used inside translatePhraseToLanguage and
    // generateApproachesForMultiverse; v2 requires declaring the secret here
    // so Firebase binds it at runtime.
    secrets: [geminiApiKey],
  },
  async (request) => {
    const startTime = Date.now();
    let { matchId = "", userLanguage = 'en' } = request.data || {};
    // Normalize language code to 2-letter ISO 639-1 format (handles "es-MX" → "es")
    userLanguage = normalizeLanguageCode(userLanguage);
    const userId = request.auth?.uid;
    if (!userId) throw new HttpsError('unauthenticated', getLocalizedError('auth_required', userLanguage));
    // Validate matchId: must be a short alphanumeric Firestore doc id.
    // Protects against path-injection and oversized payloads.
    if (typeof matchId !== 'string' || matchId.length > 200 || matchId.includes('/')) {
      throw new HttpsError('invalid-argument', getLocalizedError('match_not_found', userLanguage));
    }
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
        throw new HttpsError('not-found', getLocalizedError('profile_not_found', userLanguage));
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
          getLocalizedError('rate_limit', userLanguage)
        );
      }

      // Step 2: Check cache (valid for 6 months)
      // Language-scoped cache key — prevents cross-language leaks where a user who
      // generated a simulation in English later sees English strings despite device lang change.
      const normalizedUserLang = normalizeLanguageCode(userLanguage || 'en');
      const baseCacheKey = isSoloMode ? 'multiverse_solo' : `multiverse_${matchId}`;
      const cacheKey = `${baseCacheKey}_${normalizedUserLang}`;
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
          // Backward-compat: invalidate caches whose schema is older than
          // the current pipeline. Bumping CACHE_SCHEMA_VERSION on correctness
          // fixes (e.g. language-mixed fallbacks) guarantees every user sees
          // clean output on the next call, without needing manual cleanup.
          const stagesArr = Array.isArray(cachedResult.stages) ? cachedResult.stages : [];
          const hasAnyAlternatives = stagesArr.some(s =>
            Array.isArray(s.alternativePhrases) && s.alternativePhrases.length > 0
          );
          const cachedSchemaVersion = typeof cachedResult.cacheSchemaVersion === 'number'
            ? cachedResult.cacheSchemaVersion
            : 1;
          const isStaleSchema = cachedSchemaVersion < CACHE_SCHEMA_VERSION;
          if (stagesArr.length === 0 || !hasAnyAlternatives || isStaleSchema) {
            logger.info(`[MultiUniverse] Cache stale (schemaV=${cachedSchemaVersion}, current=${CACHE_SCHEMA_VERSION}, hasAlts=${hasAnyAlternatives}) — forcing regeneration`);
          } else {
          logger.info(`[MultiUniverse] ✓ CACHE HIT (valid until ${new Date(cacheExpireTime).toISOString()})`);
          logger.info(`[MultiUniverse] Mode: ${cachedResult.isSoloMode ? 'SOLO' : `match=${matchId.substring(0, 8)}`}`);
          logger.info(`[MultiUniverse] Cached language: ${cachedResult.userLanguage}, Current user language: ${userLanguage}`);

          // Re-localize stage labels + re-generate approaches if language differs
          // (cache might have different language than current user)
          // coachTip: ALWAYS regenerate from current stage-specific function
          // (old caches may have generic pre-stage-specific tips that we want to overwrite)
          const cachedMatchName = cachedResult.matchName || 'Your Match';
          const localizedStages = await Promise.all(
            cachedResult.stages.map(async stage => {
              const shouldTranslate = cachedResult.userLanguage !== userLanguage;
              // Translate alternativePhrases if cache was in a different language
              const translatedAlternatives = (shouldTranslate && Array.isArray(stage.alternativePhrases) && stage.alternativePhrases.length > 0)
                ? await Promise.all(
                    stage.alternativePhrases.map(p =>
                      p ? translatePhraseToLanguage(p, cachedResult.userLanguage || 'en', userLanguage) : ''
                    )
                  )
                : (stage.alternativePhrases || []);
              return {
                ...stage,
                stageLabel: getLocalizedStageLabel(stage.stageId, userLanguage),
                // If cached content is in different language, translate phrase in new language
                // This handles the case where cache was generated in English but user is Spanish
                bestApproachPhrase: (shouldTranslate && stage.bestApproachPhrase)
                  ? await translatePhraseToLanguage(stage.bestApproachPhrase, cachedResult.userLanguage || 'en', userLanguage)
                  : stage.bestApproachPhrase,
                alternativePhrases: translatedAlternatives.filter(p => p && p.length > 0),
                // Always regenerate coachTip with current stage-specific bullet format
                coachTip: getStageSpecificCoachTip(stage.stageId || stage.id, cachedMatchName, userLanguage),
              };
            })
          );

          // Regenerate keyInsights using re-localized stages + current language.
          // Cache stored insights in whatever lang it was created in — stale on lang change.
          const freshLabel = getCompatibilityLabel(cachedResult.compatibilityScore || 0, userLanguage);
          const freshInsights = generateInsights(localizedStages, freshLabel, userLanguage);

          analyticsData.success = true;
          analyticsData.duration = Date.now() - startTime;
          await trackMultiUniverseAnalytics(userId, matchId || "solo", analyticsData);
          return {
            ...cachedResult,
            stages: localizedStages,
            compatibilityLabel: freshLabel,
            keyInsights: freshInsights,
            cacheSchemaVersion: cachedSchemaVersion,
            fromCache: true,
          };
          } // end else branch — fresh cache path
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
          throw new HttpsError('not-found', getLocalizedError('match_not_found', userLanguage));
        }
        const matchData = matchDoc.data();

        // ── SECURITY: validate caller is a member of the match ──────────────
        // Without this, any authenticated user could pass someone else's matchId
        // and simulate with the other user's profile. The `find((uid) => uid !== userId)`
        // below would still return the "other" userId even when the caller is not in
        // usersMatched, leaking the match's content and wasting Gemini tokens.
        if (!Array.isArray(matchData?.usersMatched) || !matchData.usersMatched.includes(userId)) {
          logger.warn(`[MultiUniverse] Permission denied: ${userId.substring(0, 8)} not in match ${matchId.substring(0, 8)}`);
          analyticsData.errorReason = 'permission_denied';
          analyticsData.failedStage = 'load_match';
          await trackMultiUniverseAnalytics(userId, matchId || "solo", analyticsData);
          throw new HttpsError('permission-denied', getLocalizedError('match_not_found', userLanguage));
        }

        const otherUserId = matchData.usersMatched.find((uid) => uid !== userId);

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

          // Extract the other 3 approach phrases as alternatives for the
          // "Más frases" section of the stage detail sheet. Ordered by
          // successScore desc so the user sees stronger options first.
          const alternativePhrases = situationResponse.approaches
            .filter(a => a.id !== bestApproach?.id)
            .sort((a, b) => (b.successScore || 0) - (a.successScore || 0))
            .map(a => String(a.phrase || '').trim())
            .filter(p => p.length > 0)
            .slice(0, 3);

          const localizedStageLabel = getLocalizedStageLabel(stage.id, userLanguage);
          const stageResult = {
            stageId: stage.id,
            stageLabel: localizedStageLabel,
            order: stage.order,
            approaches: situationResponse.approaches,
            avgReactionScore: parseFloat(avgReactionScore.toFixed(2)),
            bestApproachId: bestApproach?.id || null,
            bestApproachPhrase: bestApproach?.phrase || '',
            alternativePhrases, // up to 3 same-context variations users can copy-paste
            // OVERRIDE internal situation sim's generic tip with stage-specific
            // actionable advice. Users complained tips were too vague — each
            // stage now gets concrete guidance for its emotional dynamics.
            coachTip: getStageSpecificCoachTip(stage.id, matchName, userLanguage),
            psyInsights: situationResponse.psychInsights || getLocalizedPsychInsight('compatible_patterns', userLanguage),
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
          getLocalizedError('all_stages_failed', userLanguage)
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
        // Schema version exposed to clients so they can invalidate persisted
        // coachChat messages produced by older (buggy) pipeline runs.
        cacheSchemaVersion: CACHE_SCHEMA_VERSION,
        generatedAt: admin.firestore.FieldValue.serverTimestamp(), // Server timestamp
        // Note: cacheExpire is added during cache write step with Firestore Timestamp
      };

      // VALIDATION: Ensure result is complete before caching
      if (!result.stages || result.stages.length === 0) {
        logger.error(`[MultiUniverse] Validation failed: no stages in result`);
        analyticsData.errorReason = 'invalid_result';
        await trackMultiUniverseAnalytics(userId, matchId || "solo", analyticsData);
        throw new HttpsError('internal', getLocalizedError('invalid_result', userLanguage));
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
        // Bump CACHE_SCHEMA_VERSION whenever the output shape changes or a
        // corrupting bug (e.g. language-mixed fallback) is fixed. The cache
        // read path treats older entries as stale and regenerates cleanly.
        cacheSchemaVersion: CACHE_SCHEMA_VERSION,
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
      // Fail-open: log ERROR with context (we don't throw — tokens already spent)
      try {
        await db.collection('users').doc(userId).update({
          coachMessagesRemaining: admin.firestore.FieldValue.increment(-1)
        });
        logger.info(`[MultiUniverse] Coach credits decremented (unified counter)`);
      } catch (e) {
        logger.error('[MultiUniverse] CRITICAL: credit decrement failed — user may bypass limit', {
          userId: userId.substring(0, 8),
          matchId: matchId ? matchId.substring(0, 8) : 'solo',
          error: e.message,
          errorCode: e.code || 'unknown',
        });
      }

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

      throw new HttpsError('internal', getLocalizedError('simulation_failed', userLanguage));
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
    const genAI = new GoogleGenerativeAI(geminiApiKey.value());
    const approaches = await generateApproachesForMultiverse(genAI, situation, userLanguage);

    const callDuration = Date.now() - callStart;
    logger.info(`[SituationInternal] Gemini call completed in ${callDuration}ms`);

    if (!approaches || approaches.length === 0) {
      logger.warn(`[SituationInternal] Gemini returned empty approaches, using fallback`);
      // Intentionally pass '' — the multi-universe stage `situation` is a
      // hardcoded English priming template, NOT real user input, so embedding
      // it as a parenthetical snippet inside the localized Spanish/PT/FR/... template
      // produces mixed-language text like "Oye, sobre lo que te comentaba (We've been...)".
      return {
        success: true,
        situation,
        situationType: 'other',
        matchName: 'Your Match',
        approaches: generateApproachesFallback(userLanguage, ''),
        bestApproachId: '1',
        coachTip: getLocalizedCoachTip('communication_foundation', userLanguage),
        psychInsights: getLocalizedPsychInsight('authenticity', userLanguage),
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
        recommendedFor: idx === 0 ? getLocalizedRecommendedFor(userLanguage) : null,
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
      psychInsights: getLocalizedPsychInsight('variety_communication', userLanguage),
      tokens: approaches.length * 150, // rough estimate
    };
  } catch (e) {
    const callDuration = Date.now() - callStart;
    logger.error(`[SituationInternal] Failed after ${callDuration}ms: ${e.message}`, e.stack);

    // Fallback to basic approaches if Gemini fails.
    // See note above: never embed the English stage priming template as a
    // snippet inside a localized fallback — pass '' to use the non-snippet variant.
    return {
      success: true,
      situation,
      situationType: 'other',
      matchName: 'Your Match',
      approaches: generateApproachesFallback(userLanguage, ''),
      bestApproachId: '1',
      coachTip: getLocalizedCoachTip('communication_importance', userLanguage),
      psychInsights: getLocalizedPsychInsight('authentic_dialogue', userLanguage),
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
    const cfg = (await getMultiUniverseConfig()).gemini;
    const model = genAI.getGenerativeModel({
      model: AI_MODEL_NAME,
      generationConfig: {
        maxOutputTokens: cfg.approachMaxTokens,
        temperature: cfg.approachTemperature,
        responseMimeType: 'application/json',
      },
    });

    const FIXED_TONES = ['direct', 'playful', 'romantic_vulnerable', 'grounded_honest'];
    const languageName = {
      'es': 'Spanish (español)',
      'pt': 'Brazilian Portuguese (português do Brasil)',
      'pt-PT': 'European Portuguese (português de Portugal)',
      'fr': 'French (français)',
      'de': 'German (Deutsch)',
      'ja': 'Japanese (日本語)',
      'zh': 'Simplified Chinese (简体中文)',
      'zh-TW': 'Traditional Chinese — Taiwan (繁體中文台灣)',
      'zh-HK': 'Traditional Chinese — Hong Kong (繁體中文香港)',
      'ru': 'Russian (Русский)',
      'ar': 'Arabic (العربية)',
      'id': 'Indonesian (Bahasa Indonesia)',
      'en': 'English',
    }[userLang] || 'English';

    const prompt = `${langInstr}

🌍 OUTPUT LANGUAGE: ${languageName} — code "${userLang}".
EVERY "phrase" value in the JSON MUST be written in ${languageName}. Do NOT output English phrases when the user's language is not English.

You are an inclusive dating coach. Generate EXACTLY 4 distinct communication approaches for a multi-universe relationship stage test.

CRITICAL GUIDELINES:
- Use completely gender-neutral language. NEVER assume the gender of either person.
- Use "them/they/this person/partner" instead of "him/her/boyfriend/girlfriend".
- This is a sugar dating context where there may be a significant age difference and a mutually beneficial arrangement. Phrases should be appropriate, respectful, and genuine while acknowledging this dynamic.
- Phrases must work for ANY relationship type (heterosexual, same-sex, non-binary, polyamorous).
- Be culturally aware: adjust emotional intensity appropriately for high-context and low-context cultures.

The user's situation (verbatim — every noun, verb and detail matters):
"""
${situation}
"""

🎯 CORE RULE — each approach MUST directly address the concrete content of the situation above.
If the user talks about going out with a friend, mention the friend and the plan.
If the user wants to confess feelings, state the feeling.
If the user wants to apologize, name what they're apologizing for.
Generic openers like "quería hablar contigo", "tenemos que hablar", "hay algo que quiero decirte", "we need to talk",
"I've been thinking", "hay algo que me ronda la cabeza" — on their own — are FORBIDDEN. A message that could be
sent for literally any situation has failed. Each phrase MUST reference at least one concrete detail from the user's
situation (a name, place, plan, feeling, or event they mentioned).

Generate 4 approaches with FIXED tones in this exact order:
  1. direct — clear, confident, unambiguous; names the situation in the first sentence
  2. playful — warm, light, a little humor; still references the specific topic
  3. romantic_vulnerable — soft, honest about feelings tied to THIS situation (adjust intensity for cultural context)
  4. grounded_honest — calm, real, low-pressure (respectful and genuine); states what's happening

Each phrase must be 2-3 sentences, natural, first-person IN ${languageName}.

Self-check before returning each phrase: "Could this message have been written by someone with a totally
different problem?" If yes, rewrite until the answer is no.

${langInstr}

⚠️ FINAL CHECKS:
1. Every "phrase" is in ${languageName}, not English (unless target is English).
2. Every "phrase" references specific content from the user's situation.
3. No two phrases sound interchangeable.

Respond ONLY with JSON (phrases in ${languageName}):
{"approaches":[{"id":"1","tone":"direct","phrase":"..."},{"id":"2","tone":"playful","phrase":"..."},{"id":"3","tone":"romantic_vulnerable","phrase":"..."},{"id":"4","tone":"grounded_honest","phrase":"..."}]}`;

    logger.info(`[Gemini] Prompt size: ${prompt.length} chars, language: ${userLang}`);

    // Retry up to 2 times before falling back — a single Gemini hiccup shouldn't collapse to generic fallbacks
    const timeoutMs = cfg.timeoutMs;
    for (let attempt = 1; attempt <= 2; attempt++) {
      let result;
      try {
        const geminiPromise = model.generateContent(prompt);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Gemini timeout: exceeded ${timeoutMs}ms`)), timeoutMs)
        );
        result = await Promise.race([geminiPromise, timeoutPromise]);
        logger.info(`[Gemini] attempt ${attempt}: content generation succeeded`);
      } catch (attemptErr) {
        logger.warn(`[Gemini] attempt ${attempt} failed: ${attemptErr.message}`);
        continue;
      }

      // Guard: safety block or MAX_TOKENS truncation — don't parse partial output
      const safety = checkGeminiSafety(result, 'generateApproachesForMultiverse');
      if (!safety.ok) {
        logger.warn(`[Gemini] attempt ${attempt}: safety/finish check failed — ${safety.reason}: ${safety.detail}`);
        continue;
      }

      const text = result?.response?.text();
      logger.info(`[Gemini] attempt ${attempt}: response size ${(text || '').length} chars`);

      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        logger.warn(`[Gemini] attempt ${attempt}: empty response body`);
        continue;
      }

      logger.info(`[Gemini] attempt ${attempt}: response preview ${text.substring(0, 200)}`);

      const parsed = parseGeminiJsonResponse(text);
      if (!parsed) {
        logger.warn(`[Gemini] attempt ${attempt}: failed to parse JSON`);
        continue;
      }

      if (!Array.isArray(parsed?.approaches) || parsed.approaches.length === 0) {
        logger.warn(`[Gemini] attempt ${attempt}: no approaches array`);
        continue;
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

      // Reject this attempt if any phrase is empty — try again rather than ship blanks
      if (result_approaches.some(a => !a.phrase)) {
        logger.warn(`[Gemini] attempt ${attempt}: one or more phrases empty after normalize`);
        continue;
      }

      logger.info(`[Gemini] Finalized ${result_approaches.length} approaches in ${Date.now() - callStart}ms`);
      return result_approaches;
    }

    logger.error(`[Gemini] All attempts failed after ${Date.now() - callStart}ms — using non-snippet fallback`);
    // Multi-universe only: `situation` here is a hardcoded English STAGE_TEMPLATES
    // priming sentence, NOT real user input. Passing it into the localized
    // fallback produces language-mixed text like:
    //   "Oye, sobre lo que te comentaba (First time reaching out...), ..."
    // Always pass '' so the non-snippet variant of the localized fallback wins.
    return generateApproachesFallback(userLang, '');
  } catch (e) {
    logger.error(`[Gemini] Error after ${Date.now() - callStart}ms:`, e.message);
    if (e.stack) logger.error(`[Gemini] Stack:`, e.stack);
    return generateApproachesFallback(userLang, '');
  }
}

/**
 * Extracts a short, clean snippet of the user's situation to echo back in fallbacks.
 * Keeps the first ~90 chars of meaningful content — enough to anchor each phrase to the user's topic.
 */
function extractSituationSnippet(situation) {
  if (!situation || typeof situation !== 'string') return '';
  const cleaned = situation
    .replace(/\s+/g, ' ')
    .replace(/[.!?;]+$/g, '')
    .trim();
  if (cleaned.length <= 90) return cleaned;
  const cut = cleaned.slice(0, 90);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 60 ? cut.slice(0, lastSpace) : cut) + '…';
}

/**
 * Fallback approaches when Gemini fails or returns invalid response.
 * When `situation` is provided, the templates embed a snippet so they never feel fully generic.
 */
function generateApproachesFallback(userLang = 'en', situation = '') {
  const snippet = extractSituationSnippet(situation);
  const hasSnippet = snippet.length > 0;
  const templates = {
    en: [
      { id: '1', tone: 'direct', phrase: hasSnippet ? `Hey — about what I mentioned (${snippet}), I'd love to talk it through with you. What do you think?` : 'I wanted to talk with you about something. Can we chat?' },
      { id: '2', tone: 'playful', phrase: hasSnippet ? `So… ${snippet} 😅 Didn't want to leave you in the dark. Got a sec?` : 'Hey, got a moment? There\'s something I want to say.' },
      { id: '3', tone: 'romantic_vulnerable', phrase: hasSnippet ? `I've been thinking about you, and I want to be open about this: ${snippet}. I hope that's okay to share.` : 'I\'ve been thinking about you, and I want to be honest about how I feel.' },
      { id: '4', tone: 'grounded_honest', phrase: hasSnippet ? `Just being real with you: ${snippet}. No pressure — I just wanted you to know where I'm at.` : 'I care about us and want to understand each other better.' },
    ],
    es: [
      { id: '1', tone: 'direct', phrase: hasSnippet ? `Oye, sobre lo que te comentaba (${snippet}), me gustaría conversarlo contigo. ¿Qué opinas?` : 'Quería hablar contigo sobre algo. ¿Podemos conversar?' },
      { id: '2', tone: 'playful', phrase: hasSnippet ? `Te cuento: ${snippet} 😅 No quería dejarte sin saber. ¿Un momento?` : 'Oye, ¿tienes un momento? Hay algo que quiero decir.' },
      { id: '3', tone: 'romantic_vulnerable', phrase: hasSnippet ? `He estado pensando en ti y quiero ser sincero/a contigo sobre esto: ${snippet}. Espero esté bien compartirlo.` : 'He estado pensando en ti, y quiero ser honesto sobre cómo me siento.' },
      { id: '4', tone: 'grounded_honest', phrase: hasSnippet ? `Siendo honesto/a contigo: ${snippet}. Sin presión — solo quería que lo supieras.` : 'Me importas y quiero que nos entendamos mejor.' },
    ],
    pt: [
      { id: '1', tone: 'direct', phrase: hasSnippet ? `Oi, sobre o que te contei (${snippet}), queria conversar contigo. O que achas?` : 'Queria falar com você sobre algo. Podemos conversar?' },
      { id: '2', tone: 'playful', phrase: hasSnippet ? `Te conto: ${snippet} 😅 Não queria te deixar sem saber. Tens um minuto?` : 'Oie, tem um momento? Tem algo que quero dizer.' },
      { id: '3', tone: 'romantic_vulnerable', phrase: hasSnippet ? `Tenho pensado em ti e quero ser sincero/a sobre isto: ${snippet}. Espero que esteja tudo bem partilhar.` : 'Estive pensando em você, e quero ser honesto sobre como me sinto.' },
      { id: '4', tone: 'grounded_honest', phrase: hasSnippet ? `Sendo honesto/a contigo: ${snippet}. Sem pressão — só queria que soubesses.` : 'Você me importa e quero que nos entendamos melhor.' },
    ],
    fr: [
      { id: '1', tone: 'direct', phrase: hasSnippet ? `Salut, à propos de ce que je te disais (${snippet}), j'aimerais qu'on en parle. Qu'en penses-tu ?` : 'Je voulais te parler de quelque chose. On peut discuter?' },
      { id: '2', tone: 'playful', phrase: hasSnippet ? `Je t'explique : ${snippet} 😅 Je ne voulais pas te laisser dans le flou. Tu as un moment ?` : 'Hé, tu as une minute? Il y a quelque chose que je veux dire.' },
      { id: '3', tone: 'romantic_vulnerable', phrase: hasSnippet ? `Je pense à toi et je veux être sincère avec toi sur ceci : ${snippet}. J'espère que ça va de partager.` : 'Je pense à toi, et je veux être honnête sur mes sentiments.' },
      { id: '4', tone: 'grounded_honest', phrase: hasSnippet ? `Pour être honnête avec toi : ${snippet}. Pas de pression — je voulais juste que tu saches.` : 'Tu m\'importes et je veux qu\'on se comprenne mieux.' },
    ],
    de: [
      { id: '1', tone: 'direct', phrase: hasSnippet ? `Hey, wegen dem, was ich erwähnt habe (${snippet}) — ich würde gern mit dir darüber reden. Was meinst du?` : 'Ich wollte mit dir über etwas sprechen. Können wir reden?' },
      { id: '2', tone: 'playful', phrase: hasSnippet ? `Also… ${snippet} 😅 Wollte dich nicht im Dunkeln lassen. Hast du kurz Zeit?` : 'Hey, hast du einen Moment? Es gibt etwas, das ich dir sagen möchte.' },
      { id: '3', tone: 'romantic_vulnerable', phrase: hasSnippet ? `Ich habe an dich gedacht und möchte dir gegenüber ehrlich sein: ${snippet}. Ich hoffe, das ist okay.` : 'Ich habe viel an dir gedacht und möchte dir ehrlich sagen, wie ich mich fühle.' },
      { id: '4', tone: 'grounded_honest', phrase: hasSnippet ? `Ganz ehrlich: ${snippet}. Kein Druck — ich wollte nur, dass du Bescheid weißt.` : 'Mir liegt an uns und ich möchte, dass wir uns besser verstehen.' },
    ],
    ja: [
      { id: '1', tone: 'direct', phrase: hasSnippet ? `ねえ、さっき話したこと（${snippet}）について、君と話したいな。どう思う？` : 'あなたと何かについて話したいのです。話してもいいですか？' },
      { id: '2', tone: 'playful', phrase: hasSnippet ? `実はね… ${snippet} 😅 伝えておきたくて。少しいい？` : 'ねえ、ちょっと時間ある？言いたいことがあるんだ。' },
      { id: '3', tone: 'romantic_vulnerable', phrase: hasSnippet ? `君のことを考えていて、正直に伝えたいんだ：${snippet}。話してもいいかな？` : 'ずっとあなたのことを考えていて、本当の気持ちを伝えたいんです。' },
      { id: '4', tone: 'grounded_honest', phrase: hasSnippet ? `正直に言うと：${snippet}。プレッシャーはかけたくないけど、知っておいてほしくて。` : 'あなたのことが大事で、もっと理解し合いたいんです。' },
    ],
    zh: [
      { id: '1', tone: 'direct', phrase: hasSnippet ? `嘿，关于我之前说的（${snippet}），想跟你好好聊聊，你觉得呢？` : '我想和你谈论一些事情。我们可以聊天吗？' },
      { id: '2', tone: 'playful', phrase: hasSnippet ? `跟你说：${snippet} 😅 不想让你不知道。有空吗？` : '嘿，你有时间吗？我想说点东西。' },
      { id: '3', tone: 'romantic_vulnerable', phrase: hasSnippet ? `我一直在想你，想坦诚地告诉你：${snippet}。希望我可以跟你分享。` : '我一直在想你，我想坦诚地告诉你我的感受。' },
      { id: '4', tone: 'grounded_honest', phrase: hasSnippet ? `跟你说实话：${snippet}。没有压力——只是想让你知道。` : '你对我很重要，我想让我们更相互了解。' },
    ],
    ru: [
      { id: '1', tone: 'direct', phrase: hasSnippet ? `Привет, по поводу того, что я говорил/а (${snippet}), хотел/а бы обсудить с тобой. Что думаешь?` : 'Я хотел бы с вами поговорить. Можем ли мы поговорить?' },
      { id: '2', tone: 'playful', phrase: hasSnippet ? `Расскажу: ${snippet} 😅 Не хотел/а оставлять тебя в неведении. Есть минутка?` : 'Эй, у тебя есть минутка? Я хочу что-то сказать.' },
      { id: '3', tone: 'romantic_vulnerable', phrase: hasSnippet ? `Я думал/а о тебе и хочу быть откровенным/ой: ${snippet}. Надеюсь, это нормально поделиться.` : 'Я много думал о тебе и хочу честно рассказать о своих чувствах.' },
      { id: '4', tone: 'grounded_honest', phrase: hasSnippet ? `Если честно: ${snippet}. Без давления — просто хотел/а, чтобы ты знал/а.` : 'Ты мне важен и я хочу, чтобы мы лучше друг друга поняли.' },
    ],
    ar: [
      { id: '1', tone: 'direct', phrase: hasSnippet ? `مرحباً، بخصوص ما ذكرته (${snippet})، أود أن نتحدث عن ذلك. ما رأيك؟` : 'أريد أن أتحدث معك عن شيء. هل يمكننا التحدث؟' },
      { id: '2', tone: 'playful', phrase: hasSnippet ? `لأقول لك: ${snippet} 😅 لم أرد أن أتركك دون علم. هل لديك لحظة؟` : 'هيه، هل لديك لحظة؟ هناك شيء أريد أن أقوله.' },
      { id: '3', tone: 'romantic_vulnerable', phrase: hasSnippet ? `كنت أفكر فيك وأريد أن أكون صريحاً/صريحة معك بشأن هذا: ${snippet}. آمل أن يكون من المقبول مشاركته.` : 'كنت أفكر فيك، وأريد أن أكون صادقاً بشأن شعوري.' },
      { id: '4', tone: 'grounded_honest', phrase: hasSnippet ? `بصراحة معك: ${snippet}. بدون ضغط — فقط أردتك أن تعرف.` : 'أنت مهم بالنسبة لي وأريد أن نتفاهم أكثر.' },
    ],
    id: [
      { id: '1', tone: 'direct', phrase: hasSnippet ? `Hei, soal yang tadi kubilang (${snippet}), aku ingin mengobrolkannya denganmu. Bagaimana menurutmu?` : 'Saya ingin berbicara dengan Anda tentang sesuatu. Bisakah kita berbincang?' },
      { id: '2', tone: 'playful', phrase: hasSnippet ? `Aku cerita ya: ${snippet} 😅 Tidak mau meninggalkanmu tanpa tahu. Ada waktu sebentar?` : 'Hei, punya sebentar? Ada sesuatu yang ingin saya katakan.' },
      { id: '3', tone: 'romantic_vulnerable', phrase: hasSnippet ? `Aku memikirkanmu dan ingin jujur padamu soal ini: ${snippet}. Semoga tidak masalah membaginya.` : 'Saya selalu memikirkan Anda, dan saya ingin jujur tentang perasaan saya.' },
      { id: '4', tone: 'grounded_honest', phrase: hasSnippet ? `Jujur denganmu: ${snippet}. Tanpa tekanan — hanya ingin kamu tahu.` : 'Anda penting bagi saya dan saya ingin kita saling memahami lebih baik.' },
    ],
  };

  const lang = templates[userLang] ? userLang : 'en';
  return templates[lang];
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
 * Stage-specific actionable coach tips for multi-universe simulation.
 * Returns a formatted bullet list (3 concrete tips per stage) — more practical
 * than a single paragraph. Client renders newlines naturally. Backward compatible:
 * still a `string`, clients don't need schema changes.
 */
function getStageSpecificCoachTip(stageId, matchName, userLang = 'en') {
  const normalizedLang = normalizeLanguageCode(userLang);
  // Solo mode: matchName is a localized placeholder (e.g. "Pareja ideal") — should not be
  // substituted as if it were a real name. Treat all known solo names + 'Your Match' as null.
  const soloNamesSet = new Set(Object.values(SOLO_MODE_NAMES));
  const isSoloPlaceholder = matchName && (matchName === 'Your Match' || soloNamesSet.has(matchName));
  const name = (matchName && !isSoloPlaceholder) ? matchName : null;
  const who = (withName, fallback) => name ? withName.replace('{name}', name) : fallback;

  const tipLists = {
    initial_contact: {
      en: [
        who(`Reference something specific from ${name}'s profile — a hobby, a photo, a phrase`, 'Reference something specific from their profile — a hobby, a photo, a phrase'),
        'Avoid generic openers like "hey" or "how are you?" — they kill curiosity',
        'End with an open-ended question to make replying easy and natural',
      ],
      es: [
        who('Menciona algo específico del perfil de {name} — un hobby, una foto, una frase', 'Menciona algo específico de su perfil — un hobby, una foto, una frase'),
        'Evita aperturas genéricas como "hola" o "¿qué tal?" — matan la curiosidad',
        'Termina con una pregunta abierta para que responder sea fácil y natural',
      ],
      pt: [
        who('Mencione algo específico do perfil de {name} — um hobby, uma foto, uma frase', 'Mencione algo específico do perfil — um hobby, uma foto, uma frase'),
        'Evite aberturas genéricas como "oi" ou "tudo bem?" — matam a curiosidade',
        'Termine com uma pergunta aberta para facilitar a resposta natural',
      ],
      fr: [
        who('Mentionne quelque chose de précis du profil de {name} — un hobby, une photo, une phrase', 'Mentionne quelque chose de précis de son profil — un hobby, une photo, une phrase'),
        `Évite les ouvertures génériques comme "salut" ou "ça va ?" — elles tuent la curiosité`,
        'Termine par une question ouverte pour faciliter une réponse naturelle',
      ],
      de: [
        who('Beziehe dich auf etwas Konkretes aus {name}s Profil — ein Hobby, ein Foto, einen Satz', 'Beziehe dich auf etwas Konkretes aus dem Profil — ein Hobby, ein Foto, einen Satz'),
        'Vermeide generische Einstiege wie "hey" oder "wie gehts?" — sie töten Neugier',
        'Schließe mit einer offenen Frage ab, damit die Antwort leicht fällt',
      ],
      ja: [
        who('{name}さんのプロフィールの具体的な部分に触れる — 趣味、写真、一言', 'プロフィールの具体的な部分に触れる — 趣味、写真、一言'),
        '「こんにちは」「元気？」など一般的な書き出しは避ける — 好奇心を殺します',
        '返事しやすいように、オープンな質問で締めくくる',
      ],
      zh: [
        who('提到{name}资料里具体的东西——一个爱好、一张照片、一句话', '提到对方资料里具体的东西——一个爱好、一张照片、一句话'),
        '避免"嗨"或"你好吗？"这类通用开场——它们扼杀好奇心',
        '用一个开放式问题结尾，让对方容易自然回复',
      ],
      ru: [
        who('Упомяни что-то конкретное из профиля {name} — хобби, фото, фразу', 'Упомяни что-то конкретное из профиля — хобби, фото, фразу'),
        'Избегай общих вступлений как "привет" или "как дела?" — они убивают любопытство',
        'Закончи открытым вопросом — так легко и естественно ответить',
      ],
      ar: [
        who('اذكر شيئاً محدداً من ملف {name} — هواية، صورة، عبارة', 'اذكر شيئاً محدداً من الملف الشخصي — هواية، صورة، عبارة'),
        'تجنّب البدايات العامة مثل "مرحباً" أو "كيف حالك؟" — تقتل الفضول',
        'اختم بسؤال مفتوح ليسهل الرد بشكل طبيعي',
      ],
      id: [
        who('Sebut sesuatu spesifik dari profil {name} — hobi, foto, kutipan', 'Sebut sesuatu spesifik dari profil — hobi, foto, kutipan'),
        'Hindari pembuka generik seperti "hai" atau "apa kabar?" — membunuh rasa ingin tahu',
        'Akhiri dengan pertanyaan terbuka agar balas mudah dan alami',
      ],
    },
    getting_to_know: {
      en: [
        who(`Ask ${name} open questions about values and dreams, not just facts ("what excites you about your work?" > "what do you do?")`, 'Ask open questions about values and dreams, not just facts ("what excites you about your work?" > "what do you do?")'),
        'Share something about yourself in return — reciprocity builds trust',
        'Look for common ground beyond surface level (not just favorite foods)',
      ],
      es: [
        who('Hazle a {name} preguntas abiertas sobre valores y sueños, no solo datos ("¿qué te emociona de tu trabajo?" > "¿en qué trabajas?")', 'Haz preguntas abiertas sobre valores y sueños, no solo datos ("¿qué te emociona de tu trabajo?" > "¿en qué trabajas?")'),
        'Comparte algo tuyo a cambio — la reciprocidad construye confianza',
        'Busca puntos en común más profundos (no solo comida favorita)',
      ],
      pt: [
        who('Faça perguntas abertas a {name} sobre valores e sonhos, não só fatos ("o que te empolga no seu trabalho?" > "no que trabalha?")', 'Faça perguntas abertas sobre valores e sonhos, não só fatos ("o que te empolga no seu trabalho?" > "no que trabalha?")'),
        'Compartilhe algo seu em troca — reciprocidade constrói confiança',
        'Busque pontos em comum mais profundos (não só comida favorita)',
      ],
      fr: [
        who(`Pose à {name} des questions ouvertes sur les valeurs et les rêves, pas juste des faits ("qu'est-ce qui t'anime dans ton travail ?" > "tu fais quoi ?")`, `Pose des questions ouvertes sur les valeurs et les rêves, pas juste des faits ("qu'est-ce qui t'anime dans ton travail ?" > "tu fais quoi ?")`),
        'Partage quelque chose de toi en retour — la réciprocité crée la confiance',
        'Cherche des points communs profonds, pas juste la nourriture préférée',
      ],
      de: [
        who('Stelle {name} offene Fragen zu Werten und Träumen, nicht nur Fakten ("was begeistert dich an deinem Job?" > "was machst du?")', 'Stelle offene Fragen zu Werten und Träumen, nicht nur Fakten ("was begeistert dich an deinem Job?" > "was machst du?")'),
        'Teile im Gegenzug etwas von dir — Gegenseitigkeit schafft Vertrauen',
        'Suche nach tieferen Gemeinsamkeiten, nicht nur Lieblingsessen',
      ],
      ja: [
        who('{name}さんに価値観や夢について開かれた質問を。事実だけでなく（「仕事の何にワクワクする？」>「何の仕事？」）', '価値観や夢について開かれた質問を。事実だけでなく（「仕事の何にワクワクする？」>「何の仕事？」）'),
        '自分のことも返しで共有する — 相互性が信頼を築きます',
        '好きな食べ物より深い共通点を探す',
      ],
      zh: [
        who('问{name}关于价值观和梦想的开放式问题，而不只是事实（"你工作里什么让你兴奋？" > "你做什么工作？"）', '问关于价值观和梦想的开放式问题，而不只是事实（"你工作里什么让你兴奋？" > "你做什么工作？"）'),
        '也分享一些你自己的事——互惠建立信任',
        '寻找更深层的共同点，不只是最爱吃什么',
      ],
      ru: [
        who('Задавай {name} открытые вопросы о ценностях и мечтах, не только факты ("что тебя вдохновляет в работе?" > "кем работаешь?")', 'Задавай открытые вопросы о ценностях и мечтах, не только факты ("что тебя вдохновляет в работе?" > "кем работаешь?")'),
        'Поделись чем-то о себе в ответ — взаимность строит доверие',
        'Ищи глубокие точки пересечения, не только любимую еду',
      ],
      ar: [
        who('اطرح على {name} أسئلة مفتوحة عن القيم والأحلام، لا مجرد حقائق ("ما الذي يحمّسك في عملك؟" > "ماذا تعملين؟")', 'اطرح أسئلة مفتوحة عن القيم والأحلام، لا مجرد حقائق ("ما الذي يحمّسك في عملك؟" > "ماذا تعملين؟")'),
        'شارك شيئاً عن نفسك بالمقابل — التبادل يبني الثقة',
        'ابحث عن قواسم مشتركة أعمق، ليس فقط الطعام المفضل',
      ],
      id: [
        who('Tanya {name} pertanyaan terbuka tentang nilai dan mimpi, bukan cuma fakta ("apa yang bikin kamu excited soal kerjamu?" > "kerja apa?")', 'Tanya pertanyaan terbuka tentang nilai dan mimpi, bukan cuma fakta ("apa yang bikin kamu excited soal kerjamu?" > "kerja apa?")'),
        'Bagikan sesuatu tentang dirimu sebagai balasan — timbal balik membangun kepercayaan',
        'Cari kesamaan yang lebih dalam, bukan cuma makanan favorit',
      ],
    },
    building_connection: {
      en: [
        who(`Share something slightly vulnerable with ${name} — a fear, a hope, a past struggle. Vulnerability invites vulnerability`, 'Share something slightly vulnerable — a fear, a hope, a past struggle. Vulnerability invites vulnerability'),
        who(`Use ${name}'s name naturally in conversation — it creates intimacy and signals attention`, 'Use their name naturally in conversation — it creates intimacy and signals attention'),
        'Suggest meeting in person soon — texting forever kills momentum',
      ],
      es: [
        who('Comparte algo ligeramente vulnerable con {name} — un miedo, una esperanza, un desafío pasado. La vulnerabilidad invita a la vulnerabilidad', 'Comparte algo ligeramente vulnerable — un miedo, una esperanza, un desafío pasado. La vulnerabilidad invita a la vulnerabilidad'),
        who('Usa el nombre de {name} naturalmente en la conversación — crea intimidad y señala atención', 'Usa su nombre naturalmente en la conversación — crea intimidad y señala atención'),
        'Propón verse en persona pronto — chatear eternamente mata el momentum',
      ],
      pt: [
        who('Compartilhe algo levemente vulnerável com {name} — um medo, uma esperança, uma luta passada. Vulnerabilidade convida vulnerabilidade', 'Compartilhe algo levemente vulnerável — um medo, uma esperança, uma luta passada. Vulnerabilidade convida vulnerabilidade'),
        who('Use o nome de {name} naturalmente na conversa — cria intimidade e sinaliza atenção', 'Use o nome dela naturalmente na conversa — cria intimidade e sinaliza atenção'),
        'Sugira se encontrar pessoalmente logo — conversar por texto eternamente mata o momento',
      ],
      fr: [
        who(`Partage quelque chose de légèrement vulnérable avec {name} — une peur, un espoir, un combat passé. La vulnérabilité invite la vulnérabilité`, 'Partage quelque chose de légèrement vulnérable — une peur, un espoir, un combat passé. La vulnérabilité invite la vulnérabilité'),
        who(`Utilise le prénom de {name} naturellement dans la conversation — ça crée de l'intimité et montre ton attention`, `Utilise son prénom naturellement dans la conversation — ça crée de l'intimité et montre ton attention`),
        'Propose de vous voir en personne rapidement — rester sur le chat tue la dynamique',
      ],
      de: [
        who('Teile etwas leicht Verletzliches mit {name} — eine Angst, Hoffnung, vergangene Herausforderung. Verletzlichkeit lädt zu Verletzlichkeit ein', 'Teile etwas leicht Verletzliches — eine Angst, Hoffnung, vergangene Herausforderung. Verletzlichkeit lädt zu Verletzlichkeit ein'),
        who('Verwende {name}s Vornamen natürlich im Gespräch — schafft Nähe und zeigt Aufmerksamkeit', 'Verwende ihren Vornamen natürlich im Gespräch — schafft Nähe und zeigt Aufmerksamkeit'),
        'Schlage bald ein persönliches Treffen vor — ewiges Chatten tötet die Dynamik',
      ],
      ja: [
        who('{name}さんに少し弱い部分を共有する — 恐れ、希望、過去の苦労。弱さは弱さを引き出します', '少し弱い部分を共有する — 恐れ、希望、過去の苦労。弱さは弱さを引き出します'),
        who('会話の中で自然に{name}さんの名前を使う — 親密さを生み、注意を示します', '会話の中で自然に相手の名前を使う — 親密さを生み、注意を示します'),
        '早めに対面で会うことを提案する — ずっとチャットのままだと勢いが失われます',
      ],
      zh: [
        who('与{name}分享一点脆弱——一个恐惧、希望或过往挣扎。脆弱邀请脆弱', '分享一点脆弱——一个恐惧、希望或过往挣扎。脆弱邀请脆弱'),
        who('在对话中自然地叫{name}的名字——能创造亲密感，表明你在关注', '在对话中自然地叫对方的名字——能创造亲密感，表明你在关注'),
        '尽快提出见面——一直聊天会扼杀势头',
      ],
      ru: [
        who('Поделись с {name} чем-то слегка уязвимым — страхом, надеждой, прошлой трудностью. Уязвимость приглашает уязвимость', 'Поделись чем-то слегка уязвимым — страхом, надеждой, прошлой трудностью. Уязвимость приглашает уязвимость'),
        who('Естественно используй имя {name} в разговоре — создаёт близость и показывает внимание', 'Естественно используй её имя в разговоре — создаёт близость и показывает внимание'),
        'Предложи встретиться лично скоро — вечная переписка убивает импульс',
      ],
      ar: [
        who('شارك مع {name} شيئاً حساساً قليلاً — خوف، أمل، أو صراع ماضٍ. الانكشاف يدعو إلى الانكشاف', 'شارك شيئاً حساساً قليلاً — خوف، أمل، أو صراع ماضٍ. الانكشاف يدعو إلى الانكشاف'),
        who('استخدم اسم {name} بشكل طبيعي في المحادثة — يخلق ألفة ويُظهر الانتباه', 'استخدم اسمها بشكل طبيعي في المحادثة — يخلق ألفة ويُظهر الانتباه'),
        'اقترح اللقاء شخصياً قريباً — المحادثة إلى ما لا نهاية تقتل الزخم',
      ],
      id: [
        who('Bagikan sesuatu yang sedikit rentan ke {name} — ketakutan, harapan, perjuangan masa lalu. Kerentanan mengundang kerentanan', 'Bagikan sesuatu yang sedikit rentan — ketakutan, harapan, perjuangan masa lalu. Kerentanan mengundang kerentanan'),
        who('Gunakan nama {name} secara natural dalam percakapan — menciptakan keintiman dan menunjukkan perhatian', 'Gunakan namanya secara natural dalam percakapan — menciptakan keintiman dan menunjukkan perhatian'),
        'Ajak bertemu langsung segera — chat terus-menerus membunuh momentum',
      ],
    },
    conflict_challenge: {
      en: [
        who(`Acknowledge ${name}'s perspective FIRST ("I see why you feel that way") before sharing yours — validation ≠ agreement but defuses tension`, 'Acknowledge their perspective FIRST ("I see why you feel that way") before sharing yours — validation ≠ agreement but defuses tension'),
        'Use "I feel" statements, not "you always" — blame escalates, vulnerability de-escalates',
        'If emotions run too high, pause and return in 24 hours — texting while hot destroys relationships',
      ],
      es: [
        who('Reconoce la perspectiva de {name} PRIMERO ("entiendo por qué lo sientes así") antes de dar la tuya — validar ≠ estar de acuerdo, pero baja la tensión', 'Reconoce su perspectiva PRIMERO ("entiendo por qué lo sientes así") antes de dar la tuya — validar ≠ estar de acuerdo, pero baja la tensión'),
        'Usa frases con "yo siento", no "tú siempre" — culpar escala, la vulnerabilidad desescala',
        'Si las emociones están muy altas, pausa y vuelve en 24 horas — chatear en caliente destruye relaciones',
      ],
      pt: [
        who('Reconheça a perspectiva de {name} PRIMEIRO ("entendo por que você se sente assim") antes de dar a sua — validar ≠ concordar, mas alivia a tensão', 'Reconheça a perspectiva dela PRIMEIRO ("entendo por que você se sente assim") antes de dar a sua — validar ≠ concordar, mas alivia a tensão'),
        'Use frases com "eu sinto", não "você sempre" — culpar escala, vulnerabilidade desescala',
        'Se as emoções estão muito altas, faça uma pausa e volte em 24h — conversar quente destrói relações',
      ],
      fr: [
        who(`Reconnais la perspective de {name} D'ABORD ("je comprends pourquoi tu le ressens ainsi") avant de donner la tienne — valider ≠ être d'accord, mais désamorce`, `Reconnais sa perspective D'ABORD ("je comprends pourquoi tu le ressens ainsi") avant de donner la tienne — valider ≠ être d'accord, mais désamorce`),
        `Utilise "je ressens", pas "tu fais toujours" — le blâme escalade, la vulnérabilité désescalade`,
        'Si les émotions sont trop hautes, fais une pause et reviens dans 24h — écrire à chaud détruit les relations',
      ],
      de: [
        who('Erkenne {name}s Perspektive ZUERST an ("ich verstehe, warum du das so fühlst"), bevor du deine teilst — validieren ≠ zustimmen, aber baut Spannung ab', 'Erkenne ihre Perspektive ZUERST an ("ich verstehe, warum du das so fühlst"), bevor du deine teilst — validieren ≠ zustimmen, aber baut Spannung ab'),
        'Verwende "ich fühle", nicht "du immer" — Vorwürfe eskalieren, Verletzlichkeit deeskaliert',
        'Bei hohen Emotionen: Pause machen, in 24h zurückkommen — Streiten im Affekt zerstört Beziehungen',
      ],
      ja: [
        who('自分の意見を言う前に、まず{name}さんの視点を認める（「そう感じるのは分かる」）— 認める≠賛成だが、緊張を和らげます', '自分の意見を言う前に、まず相手の視点を認める（「そう感じるのは分かる」）— 認める≠賛成だが、緊張を和らげます'),
        '「私は〜と感じる」と言い、「あなたはいつも」と言わない — 責めは悪化させ、弱さは和らげます',
        '感情が高ぶりすぎたら、一時停止して24時間後に戻る — 熱いままのチャットは関係を壊します',
      ],
      zh: [
        who('先认可{name}的视角（"我明白你为什么那样感觉"）再表达你的——认可≠同意，但能化解紧张', '先认可对方的视角（"我明白你为什么那样感觉"）再表达你的——认可≠同意，但能化解紧张'),
        '用"我感觉"，不用"你总是"——指责升级，脆弱缓解',
        '如果情绪太激烈，暂停24小时再回来——热头上聊天会毁掉关系',
      ],
      ru: [
        who('Признай точку зрения {name} ПЕРВЫМ ("понимаю, почему ты так чувствуешь"), прежде чем выразить свою — признание ≠ согласие, но снимает напряжение', 'Признай её точку зрения ПЕРВЫМ ("понимаю, почему ты так чувствуешь"), прежде чем выразить свою — признание ≠ согласие, но снимает напряжение'),
        'Говори "я чувствую", а не "ты всегда" — обвинения усиливают, уязвимость успокаивает',
        'Если эмоции слишком сильные, сделай паузу и вернись через 24 часа — писать на горячую голову разрушает отношения',
      ],
      ar: [
        who('اعترف بوجهة نظر {name} أولاً ("أفهم لماذا تشعرين هكذا") قبل مشاركة وجهة نظرك — الاعتراف ≠ الموافقة، لكنه يُهدّئ التوتر', 'اعترف بوجهة نظرها أولاً ("أفهم لماذا تشعرين هكذا") قبل مشاركة وجهة نظرك — الاعتراف ≠ الموافقة، لكنه يُهدّئ التوتر'),
        'استخدم "أنا أشعر" لا "أنتِ دائماً" — اللوم يُصعّد، الانكشاف يُهدّئ',
        'إذا ارتفعت المشاعر، توقف وعُد بعد 24 ساعة — الرد في لحظة الغضب يُدمّر العلاقات',
      ],
      id: [
        who('Akui perspektif {name} DULU ("aku paham kenapa kamu merasa begitu") sebelum membagikan punyamu — validasi ≠ setuju, tapi meredakan tegang', 'Akui perspektifnya DULU ("aku paham kenapa kamu merasa begitu") sebelum membagikan punyamu — validasi ≠ setuju, tapi meredakan tegang'),
        'Gunakan "aku merasa", bukan "kamu selalu" — menyalahkan menaikkan, kerentanan meredakan',
        'Jika emosi terlalu tinggi, jeda dan kembali dalam 24 jam — chat saat panas menghancurkan hubungan',
      ],
    },
    commitment: {
      en: [
        who(`Propose to ${name} something specific — place + day + short duration ("coffee Saturday at 4?" converts 3x better than "want to meet sometime?")`, 'Propose something specific — place + day + short duration ("coffee Saturday at 4?" converts 3x better than "want to meet sometime?")'),
        who(`Express what you appreciate about ${name} specifically — not generic compliments`, 'Express what you appreciate about them specifically — not generic compliments'),
        'Discuss expectations openly — casual vs serious, exclusive vs open. Ambiguity kills momentum',
      ],
      es: [
        who('Propón a {name} algo específico — lugar + día + poco tiempo ("¿un café el sábado a las 4?" convierte 3x mejor que "¿vernos algún día?")', 'Propón algo específico — lugar + día + poco tiempo ("¿un café el sábado a las 4?" convierte 3x mejor que "¿vernos algún día?")'),
        who('Expresa qué valoras específicamente de {name} — no cumplidos genéricos', 'Expresa qué valoras específicamente de la otra persona — no cumplidos genéricos'),
        'Habla expectativas abiertamente — casual vs serio, exclusivo vs abierto. La ambigüedad mata el momentum',
      ],
      pt: [
        who('Proponha a {name} algo específico — lugar + dia + pouco tempo ("um café sábado às 16h?" converte 3x mais que "quer se encontrar?")', 'Proponha algo específico — lugar + dia + pouco tempo ("um café sábado às 16h?" converte 3x mais que "quer se encontrar?")'),
        who('Expresse o que você aprecia especificamente em {name} — não elogios genéricos', 'Expresse o que você aprecia especificamente — não elogios genéricos'),
        'Converse expectativas abertamente — casual vs sério, exclusivo vs aberto. Ambiguidade mata o momento',
      ],
      fr: [
        who(`Propose à {name} quelque chose de précis — lieu + jour + courte durée ("un café samedi à 16h ?" convertit 3x mieux que "on se voit quand ?")`, `Propose quelque chose de précis — lieu + jour + courte durée ("un café samedi à 16h ?" convertit 3x mieux que "on se voit quand ?")`),
        who(`Exprime ce que tu apprécies spécifiquement chez {name} — pas des compliments génériques`, 'Exprime ce que tu apprécies spécifiquement chez la personne — pas des compliments génériques'),
        'Discute ouvertement des attentes — casual vs sérieux, exclusif vs ouvert. L\'ambiguïté tue la dynamique',
      ],
      de: [
        who('Schlage {name} etwas Konkretes vor — Ort + Tag + kurze Dauer ("Kaffee Samstag um 16?" konvertiert 3x besser als "mal treffen?")', 'Schlage etwas Konkretes vor — Ort + Tag + kurze Dauer ("Kaffee Samstag um 16?" konvertiert 3x besser als "mal treffen?")'),
        who('Drücke aus, was du konkret an {name} schätzt — keine generischen Komplimente', 'Drücke aus, was du konkret schätzt — keine generischen Komplimente'),
        'Besprecht Erwartungen offen — locker vs ernst, exklusiv vs offen. Mehrdeutigkeit tötet die Dynamik',
      ],
      ja: [
        who('{name}さんに具体的な提案を — 場所＋曜日＋短時間（「土曜4時にカフェ？」は「いつか会いたい」より3倍成功）', '具体的な提案を — 場所＋曜日＋短時間（「土曜4時にカフェ？」は「いつか会いたい」より3倍成功）'),
        who('{name}さんの具体的にどこが好きかを伝える — ありがちな褒め言葉ではなく', '相手の具体的にどこが好きかを伝える — ありがちな褒め言葉ではなく'),
        '期待をオープンに話し合う — カジュアルか本気か、排他的かオープンか。曖昧さは勢いを殺します',
      ],
      zh: [
        who('向{name}提具体建议——地点+时间+短时长（"周六4点喝咖啡？"比"什么时候见？"成功率高3倍）', '提具体建议——地点+时间+短时长（"周六4点喝咖啡？"比"什么时候见？"成功率高3倍）'),
        who('具体表达你欣赏{name}的哪里——不要笼统的赞美', '具体表达你欣赏对方的哪里——不要笼统的赞美'),
        '坦率地讨论期望——休闲还是认真，专一还是开放。模糊会扼杀势头',
      ],
      ru: [
        who('Предложи {name} что-то конкретное — место + день + короткое время ("кофе в субботу в 16?" работает в 3x лучше, чем "встретимся как-нибудь?")', 'Предложи что-то конкретное — место + день + короткое время ("кофе в субботу в 16?" работает в 3x лучше, чем "встретимся как-нибудь?")'),
        who('Выражай, что ты конкретно ценишь в {name} — не общие комплименты', 'Выражай, что ты конкретно ценишь в человеке — не общие комплименты'),
        'Обсуждайте ожидания открыто — лёгкое vs серьёзное, эксклюзивное vs открытое. Неопределённость убивает импульс',
      ],
      ar: [
        who('اقترح على {name} شيئاً محدداً — مكان + يوم + وقت قصير ("قهوة السبت 4؟" ينجح 3× أكثر من "نلتقي يوماً ما؟")', 'اقترح شيئاً محدداً — مكان + يوم + وقت قصير ("قهوة السبت 4؟" ينجح 3× أكثر من "نلتقي يوماً ما؟")'),
        who('عبّر عمّا تقدّره تحديداً في {name} — ليس إطراءات عامة', 'عبّر عمّا تقدّره تحديداً في الشخص — ليس إطراءات عامة'),
        'ناقشا التوقعات بصراحة — عابر أم جدّي، حصري أم مفتوح. الغموض يقتل الزخم',
      ],
      id: [
        who('Ajukan ke {name} sesuatu yang spesifik — tempat + hari + durasi singkat ("ngopi Sabtu jam 4?" 3x lebih sukses dari "mau ketemu kapan?")', 'Ajukan sesuatu yang spesifik — tempat + hari + durasi singkat ("ngopi Sabtu jam 4?" 3x lebih sukses dari "mau ketemu kapan?")'),
        who('Ungkapkan apa yang kamu hargai secara spesifik dari {name} — bukan pujian generik', 'Ungkapkan apa yang kamu hargai secara spesifik — bukan pujian generik'),
        'Bahas ekspektasi secara terbuka — santai vs serius, eksklusif vs terbuka. Ambiguitas membunuh momentum',
      ],
    },
  };

  const stageLangTips = tipLists[stageId];
  if (!stageLangTips) return getLocalizedCoachTip('communication_foundation', normalizedLang);
  const tips = stageLangTips[normalizedLang] || stageLangTips.en;
  return tips.map(t => `• ${t}`).join('\n');
}

/**
 * Localized HttpsError user-facing messages (10 languages).
 * Auth errors are kept in English (occur before lang is parsed).
 */
// Delegates to the shared helper. All 6 keys previously defined locally
// (rate_limit, match_not_found, profile_not_found, all_stages_failed,
// invalid_result, simulation_failed) are now in shared.js ERROR_MESSAGES.
function getLocalizedError(key, userLang = 'en') {
  return getLocalizedErrorShared(key, normalizeLanguageCode(userLang));
}

/**
 * Localized "Direct opener" label shown on the recommended approach card (10 languages)
 */
function getLocalizedRecommendedFor(userLang = 'en') {
  const normalizedLang = normalizeLanguageCode(userLang);
  const labels = {
    en: 'Direct opener',
    es: 'Apertura directa',
    pt: 'Abertura direta',
    fr: 'Ouverture directe',
    de: 'Direkter Einstieg',
    ja: '直接的な書き出し',
    zh: '直接开场',
    ru: 'Прямое начало',
    ar: 'بداية مباشرة',
    id: 'Pembuka langsung',
  };
  return labels[normalizedLang] || labels.en;
}

/**
 * Get localized psychology insights for fallback scenarios (10 languages)
 */
function getLocalizedPsychInsight(insightKey, userLang = 'en') {
  const insights = {
    authenticity: {
      en: 'Focus on authenticity and openness.',
      es: 'Concéntrate en la autenticidad y la apertura.',
      pt: 'Concentre-se na autenticidade e abertura.',
      fr: 'Misez sur l\'authenticité et l\'ouverture.',
      de: 'Konzentriere dich auf Authentizität und Offenheit.',
      ja: '誠実さとオープンさに焦点を当てましょう。',
      zh: '专注于真实和开放。',
      ru: 'Сосредоточьтесь на искренности и открытости.',
      ar: 'ركّز على الصدق والانفتاح.',
      id: 'Fokus pada keaslian dan keterbukaan.',
    },
    variety_communication: {
      en: 'The variety tests compatibility across communication styles.',
      es: 'La variedad pone a prueba la compatibilidad entre estilos de comunicación.',
      pt: 'A variedade testa a compatibilidade entre estilos de comunicação.',
      fr: 'La variété teste la compatibilité des styles de communication.',
      de: 'Die Vielfalt prüft die Kompatibilität verschiedener Kommunikationsstile.',
      ja: 'バリエーションはコミュニケーションスタイルの相性を試します。',
      zh: '多样性测试不同沟通方式之间的兼容性。',
      ru: 'Разнообразие проверяет совместимость стилей общения.',
      ar: 'التنوع يختبر التوافق بين أساليب التواصل.',
      id: 'Ragam ini menguji kecocokan di berbagai gaya komunikasi.',
    },
    authentic_dialogue: {
      en: 'Genuine connection develops through authentic dialogue.',
      es: 'La conexión genuina se desarrolla a través del diálogo auténtico.',
      pt: 'A conexão genuína se desenvolve através do diálogo autêntico.',
      fr: 'Un lien véritable se développe grâce à un dialogue authentique.',
      de: 'Echte Verbindung entsteht durch authentischen Dialog.',
      ja: '本物のつながりは、誠実な対話から生まれます。',
      zh: '真正的连接通过真诚的对话形成。',
      ru: 'Настоящая связь развивается через искренний диалог.',
      ar: 'يتطور الاتصال الحقيقي من خلال الحوار الصادق.',
      id: 'Koneksi sejati tumbuh melalui dialog yang autentik.',
    },
    compatible_patterns: {
      en: 'Compatible communication patterns emerging.',
      es: 'Surgen patrones de comunicación compatibles.',
      pt: 'Padrões de comunicação compatíveis estão surgindo.',
      fr: 'Des schémas de communication compatibles émergent.',
      de: 'Kompatible Kommunikationsmuster zeichnen sich ab.',
      ja: '相性の良いコミュニケーションパターンが見えてきています。',
      zh: '兼容的沟通模式正在形成。',
      ru: 'Проявляются совместимые модели общения.',
      ar: 'تظهر أنماط تواصل متوافقة.',
      id: 'Muncul pola komunikasi yang cocok.',
    },
  };
  const texts = insights[insightKey] || insights.authenticity;
  return texts[userLang] || texts.en;
}

/**
 * Get localized strong potential coach tip with stage name (10 languages)
 */
function getLocalizedStrongPotential(stageLabel, userLang = 'en') {
  const templates = {
    en: `Strong potential at ${stageLabel}`,
    es: `Gran potencial en ${stageLabel}`,
    pt: `Grande potencial em ${stageLabel}`,
    fr: `Fort potentiel à ${stageLabel}`,
    de: `Starkes Potenzial bei ${stageLabel}`,
    ja: `${stageLabel}で大きな可能性があります`,
    zh: `${stageLabel}潜力巨大`,
    ru: `Большой потенциал на этапе ${stageLabel}`,
    ar: `إمكانات قوية في ${stageLabel}`,
    id: `Potensi besar di ${stageLabel}`,
  };
  return templates[userLang] || templates.en;
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
