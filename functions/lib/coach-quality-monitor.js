/**
 * Coach AI Quality Monitor
 *
 * Monitors and evaluates Coach responses for:
 * - Psychology knowledge base relevance (RAG integration)
 * - Cross-language consistency and appropriateness
 * - User satisfaction tracking
 * - Insight quality and actionability
 *
 * Runs daily auto-evaluation and logs metrics to Firestore
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

const db = admin.firestore();

/**
 * Daily Coach Quality Monitor
 * Evaluates recent Coach interactions and measures:
 * - RAG knowledge integration (how often psychology chunks are used)
 * - User satisfaction (ratings on Coach responses)
 * - Language quality across 10 supported languages
 * - Response relevance and helpfulness
 */
exports.monitorCoachQuality = onSchedule(
  { schedule: '0 3 * * *', timeZone: 'UTC' }, // 3 AM UTC daily
  async (context) => {
    logger.info('[CoachQualityMonitor] Starting daily evaluation');

    try {
      const today = new Date().toISOString().substring(0, 10);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Collect all Coach interactions from past 24 hours
      const snapshot = await db.collectionGroup('messages')
        .where('sender', '==', 'coach')
        .where('timestamp', '>', oneDayAgo.getTime())
        .limit(500)
        .get();

      logger.info(`[CoachQualityMonitor] Analyzing ${snapshot.size} Coach responses`);

      const metrics = {
        date: today,
        totalResponses: snapshot.size,
        languageBreakdown: {},
        psychologyKnowledgeIntegration: 0,
        averageUserSatisfaction: 0,
        topicBreakdown: {},
        ragHitRate: 0, // % of responses using RAG knowledge
        errors: [],
      };

      let ragHitCount = 0;
      let satisfactionCount = 0;
      let satisfactionSum = 0;

      // Analyze each response
      snapshot.docs.forEach(doc => {
        const message = doc.data();
        const userLanguage = message.userLanguage || 'en';

        // Track language breakdown
        if (!metrics.languageBreakdown[userLanguage]) {
          metrics.languageBreakdown[userLanguage] = 0;
        }
        metrics.languageBreakdown[userLanguage] += 1;

        // Check if response includes psychology knowledge
        const hasRAGContent = hasPsychologyKnowledge(message.message);
        if (hasRAGContent) ragHitCount += 1;

        // Track user satisfaction ratings
        if (message.satisfactionRating && message.satisfactionRating > 0) {
          satisfactionCount += 1;
          satisfactionSum += message.satisfactionRating;
        }

        // Track response topics
        const topic = classifyTopic(message.message);
        if (!metrics.topicBreakdown[topic]) {
          metrics.topicBreakdown[topic] = 0;
        }
        metrics.topicBreakdown[topic] += 1;
      });

      // Calculate final metrics
      metrics.ragHitRate = snapshot.size > 0 ? Math.round((ragHitCount / snapshot.size) * 100) : 0;
      metrics.averageUserSatisfaction = satisfactionCount > 0 ? Math.round((satisfactionSum / satisfactionCount) * 10) / 10 : 0;
      metrics.psychologyKnowledgeIntegration = ragHitCount;

      // Store metrics in Firestore
      await db.collection('coachQualityMetrics').doc(today).set(metrics, { merge: true });

      logger.info('[CoachQualityMonitor] Metrics saved:', {
        date: today,
        responses: metrics.totalResponses,
        ragHitRate: `${metrics.ragHitRate}%`,
        satisfaction: metrics.averageUserSatisfaction,
      });

      // Alert if satisfaction drops below threshold
      if (metrics.averageUserSatisfaction > 0 && metrics.averageUserSatisfaction < 3) {
        logger.warn(`[CoachQualityMonitor] LOW SATISFACTION ALERT: ${metrics.averageUserSatisfaction}/5`);
        await alertLowSatisfaction(today, metrics);
      }

      return { success: true, metrics };
    } catch (e) {
      logger.error('[CoachQualityMonitor] Error:', e);
      throw e;
    }
  }
);

/**
 * Analyze Coach responses for psychology knowledge integration
 * Checks for patterns that indicate RAG knowledge usage:
 * - Reference to specific psychology theories (Bowlby, Gottman, etc.)
 * - Mention of attachment styles
 * - Personality type analysis (Explorer, Builder, etc.)
 * - Actionable psychology-based advice
 */
function hasPsychologyKnowledge(message) {
  if (!message) return false;

  const psychologyPatterns = [
    // Theory references
    /attachment|bowlby|ainsworth/i,
    /gottman|four horsemen|repair attempt/i,
    /helen fisher|explorer|builder|director|negotiator/i,
    /esther perel|desire|novelty|mystery/i,
    /brené brown|vulnerability|courage/i,
    /chapman|love language/i,
    /self-efficacy|bandura|cognitive rehearsal/i,

    // Specific advice patterns
    /secure attachment|anxious|avoidant/i,
    /emotional attunement|mirror|reciprocal/i,
    /oxytocin|dopamine|neurochemistry/i,
    /validation|repair|conflict resolution/i,
    /boundary|healthy independence/i,
    /trust building|consistency/i,

    // Quality markers
    /research shows|studies indicate|science|evidence/i,
    /timeline:|stage:|phase:/i,
    /authenticity|vulnerability|genuinely/i,
  ];

  return psychologyPatterns.some(pattern => pattern.test(message));
}

/**
 * Classify Coach response by topic
 */
function classifyTopic(message) {
  if (!message) return 'other';

  const topicMap = [
    { pattern: /icebreaker|approach|opening|first message/i, topic: 'icebreaker' },
    { pattern: /compliment|flirt|attraction/i, topic: 'compliments' },
    { pattern: /conflict|argument|disagree|repair/i, topic: 'conflict_resolution' },
    { pattern: /confidence|nervous|anxious|self-esteem/i, topic: 'confidence' },
    { pattern: /red flag|concern|warning|safety/i, topic: 'red_flags' },
    { pattern: /date|venue|location|activity/i, topic: 'date_planning' },
    { pattern: /breakup|ghosting|rejection|moving on/i, topic: 'breakup' },
    { pattern: /attachment|relationship stage|getting serious/i, topic: 'relationship_progression' },
    { pattern: /communication|how to say|phrasing/i, topic: 'communication' },
    { pattern: /culture|different|adapt|cultural/i, topic: 'cultural' },
  ];

  for (const { pattern, topic } of topicMap) {
    if (pattern.test(message)) {
      return topic;
    }
  }

  return 'other';
}

/**
 * Alert on low satisfaction
 */
async function alertLowSatisfaction(date, metrics) {
  try {
    await db.collection('alerts').doc(`low-satisfaction-${date}`).set({
      type: 'low_coach_satisfaction',
      date,
      satisfaction: metrics.averageUserSatisfaction,
      responses: metrics.totalResponses,
      ragHitRate: metrics.ragHitRate,
      timestamp: new Date().toISOString(),
      status: 'pending_review',
    });
    logger.warn(`[Alert] Low satisfaction alert created for ${date}`);
  } catch (e) {
    logger.error('Failed to create alert:', e);
  }
}

/**
 * Evaluate Coach Response Relevance
 * Scores how well Coach response matches user intent (0-100)
 */
exports.evaluateResponseRelevance = async (userId, messageId, userMessage, coachResponse, userLanguage = 'en') => {
  try {
    const relevanceScore = calculateRelevance(userMessage, coachResponse, userLanguage);

    // Store evaluation in Firestore for audit trail
    await db.collection('users').doc(userId)
      .collection('coachEvaluations').doc(messageId).set({
        userMessage,
        coachResponse: coachResponse.substring(0, 500), // Store first 500 chars
        relevanceScore,
        language: userLanguage,
        evaluatedAt: new Date().toISOString(),
        hasRAG: hasPsychologyKnowledge(coachResponse),
        topic: classifyTopic(coachResponse),
      });

    return { relevanceScore, quality: getQualityLabel(relevanceScore) };
  } catch (e) {
    logger.error('[evaluateResponseRelevance] Error:', e);
    return { relevanceScore: 0, quality: 'error' };
  }
};

/**
 * Calculate response relevance score (0-100)
 * Checks:
 * - Topic alignment (user asked about X, coach answered about X)
 * - Actionability (is advice concrete or vague?)
 * - Psychology grounding (uses research vs. generic advice)
 * - Language appropriateness (for given language)
 */
function calculateRelevance(userMessage, coachResponse, language) {
  let score = 50; // baseline

  // Check for directly relevant content
  const userTopic = classifyTopic(userMessage);
  const coachTopic = classifyTopic(coachResponse);
  if (userTopic === coachTopic) score += 20;

  // Check for psychology grounding
  if (hasPsychologyKnowledge(coachResponse)) score += 15;

  // Check for actionable language (specific phrases, examples)
  const actionablePatterns = [
    /try:|say:|ask:|do this:/i,
    /example:|like:|here's what:/i,
    /specific|concrete|instead of|rather than/i,
    /step 1:|step 2:|first,|then,|finally,/i,
  ];
  if (actionablePatterns.some(p => p.test(coachResponse))) score += 10;

  // Check language appropriateness (very basic)
  const minResponseLength = language === 'en' ? 80 : 100;
  if (coachResponse.length >= minResponseLength) score += 5;

  // Check for empathy markers
  if (/understand|feel|sense|hear you|sounds like/i.test(coachResponse)) score += 5;

  return Math.min(100, Math.round(score));
}

function getQualityLabel(score) {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'needs_improvement';
}

/**
 * Track Coach RAG Integration
 * Records when psychology knowledge base is successfully retrieved and used
 */
exports.trackRAGIntegration = async (userId, messageId, query, ragChunksUsed, language) => {
  try {
    await db.collection('coachRAGTracking').doc(messageId).set({
      userId,
      query: query.substring(0, 200),
      chunksRetrieved: ragChunksUsed.length,
      chunkIds: ragChunksUsed.map(c => c.id),
      language,
      timestamp: new Date().toISOString(),
      success: ragChunksUsed.length > 0,
    });
  } catch (e) {
    logger.warn('[trackRAGIntegration] Failed:', e.message);
  }
};

/**
 * Cross-language Coach Consistency Check
 * Ensures Coach gives similar quality advice across all 10 languages
 */
exports.checkCrossLanguageConsistency = async () => {
  try {
    const languages = ['en', 'es', 'pt', 'fr', 'de', 'ja', 'zh', 'ru', 'ar', 'id'];
    const consistencyReport = {
      date: new Date().toISOString().substring(0, 10),
      languages: {},
    };

    for (const lang of languages) {
      const langSnapshot = await db.collectionGroup('messages')
        .where('sender', '==', 'coach')
        .where('userLanguage', '==', lang)
        .orderByChild('timestamp')
        .limitToLast(100)
        .get();

      const responses = langSnapshot.docs.map(d => d.data());
      const avgLength = responses.reduce((sum, r) => sum + (r.message || '').length, 0) / responses.length;
      const ragIntegration = responses.filter(r => hasPsychologyKnowledge(r.message)).length;

      consistencyReport.languages[lang] = {
        responseCount: responses.length,
        averageLength: Math.round(avgLength),
        ragIntegrationRate: Math.round((ragIntegration / responses.length) * 100),
        quality: classifyLanguageQuality(responses),
      };
    }

    await db.collection('crossLanguageReports').doc(consistencyReport.date).set(consistencyReport);
    logger.info('[CrossLanguageCheck] Report generated:', consistencyReport);

    return consistencyReport;
  } catch (e) {
    logger.error('[checkCrossLanguageConsistency] Error:', e);
    throw e;
  }
};

function classifyLanguageQuality(responses) {
  if (responses.length < 10) return 'insufficient_data';
  const avgLength = responses.reduce((sum, r) => sum + (r.message || '').length, 0) / responses.length;
  const ragCount = responses.filter(r => hasPsychologyKnowledge(r.message)).length;
  const avgRating = responses.filter(r => r.satisfactionRating).reduce((sum, r) => sum + r.satisfactionRating, 0) / responses.length;

  if (avgRating < 3) return 'low_satisfaction';
  if (ragCount < responses.length * 0.3) return 'low_rag_integration';
  if (avgLength < 100) return 'too_brief';
  return 'healthy';
}
