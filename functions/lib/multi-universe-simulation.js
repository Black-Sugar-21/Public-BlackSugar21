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

const RATE_LIMIT_CONFIG = { maxPerDay: 3 };

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
      // Step 1: Rate limit check
      const today = new Date().toISOString().substring(0, 10);
      const usageRef = db.collection('users').doc(userId)
        .collection('multiUniverseUsage').doc(today);

      await db.runTransaction(async (tx) => {
        const usageDoc = await tx.get(usageRef);
        const count = usageDoc.exists ? (usageDoc.data().count || 0) : 0;
        if (count >= RATE_LIMIT_CONFIG.maxPerDay) {
          throw new HttpsError(
            'resource-exhausted',
            `Daily limit reached. You can run ${RATE_LIMIT_CONFIG.maxPerDay} multi-universe tests per day.`
          );
        }
        tx.set(usageRef, { count: count + 1, lastUsed: new Date().toISOString() }, { merge: true });
      });

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
      const { score, stars, label } = calculateCompatibility(successfulStages);

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
        cacheExpire: Date.now() + (180 * 24 * 60 * 60 * 1000), // 6 months
      };

      // Step 8: Cache for 6 months (only if we have valid results)
      await db.collection('users').doc(userId)
        .collection('multiUniverseCache').doc(cacheKey).set(result, { merge: true })
        .catch(e => logger.warn('Cache write failed:', e.message));

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
 */
function scoreApproach(phrase, situation, language) {
  if (!phrase || phrase.length === 0) return 5;

  const baseScore = 6;
  const sentenceCount = (phrase.match(/[.!?]/g) || []).length || 1;
  const lengthBonus = Math.min(phrase.length / 50, 2);
  const emotionalWords = (phrase.match(/feel|want|love|care|honest|authentic|genuine|real|true/gi) || []).length;

  let score = baseScore + (emotionalWords * 0.5) + (lengthBonus / 2);
  score = Math.min(10, Math.max(4, score));

  return parseFloat(score.toFixed(1));
}

/**
 * Generate a simulated match reaction to an approach
 */
function generateMatchReaction(tone, situation, language) {
  const reactions = {
    direct: { en: 'I appreciate your honesty. Yes, I want to talk about this.', es: 'Aprecio tu honestidad. Sí, quiero hablar de esto.' },
    playful: { en: 'I like your energy! What\'s on your mind?', es: '¡Me encanta tu energía! ¿Qué tienes en mente?' },
    romantic_vulnerable: { en: 'That\'s really sweet. I feel the same way.', es: 'Eso es muy lindo. Yo siento lo mismo.' },
    grounded_honest: { en: 'I value that about you too. Let\'s talk.', es: 'Yo también valoro eso en ti. Hablemos.' },
  };

  const lang = language || 'en';
  return reactions[tone]?.[lang] || reactions[tone]?.en || 'I\'m listening. Tell me more.';
}

/**
 * Calculate compatibility score
 * - Base: average of stage scores (0-100)
 * - Bonus: consistency + growth trend
 */
function calculateCompatibility(stages) {
  if (stages.length === 0) {
    return { score: 0, stars: 0, label: 'Unable to calculate' };
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
  const label = getCompatibilityLabel(score);

  return { score, stars, label };
}

function getCompatibilityLabel(score) {
  if (score >= 85) return '🌟 Excellent Match';
  if (score >= 70) return '💚 Great Potential';
  if (score >= 55) return '💛 Good Potential';
  if (score >= 40) return '💙 Some Potential';
  return '⚠️  Challenging Match';
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
