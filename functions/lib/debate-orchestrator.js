'use strict';

/**
 * Multi-Agent Debate System — Orchestrator
 *
 * Runs 3 perspective agents in parallel, then feeds their outputs
 * to the synthesizer. Implements 3-tier fallback when things fail.
 */

const { logger } = require('firebase-functions');
const { generatePerspectiveApproaches } = require('./debate-agents');
const { synthesizeDebateApproaches } = require('./debate-synthesizer');
const {
  PERSPECTIVE_AGENTS,
  DEBATE_CONFIG_DEFAULTS,
} = require('./debate-psychology');

/**
 * Select the best perspective based on stageStrength when synthesis fails.
 */
function selectBestPerspective(validPerspectives, stageId) {
  let best = validPerspectives[0];
  let bestScore = 0;
  for (const p of validPerspectives) {
    const agentKey = Object.keys(PERSPECTIVE_AGENTS).find(
      k => PERSPECTIVE_AGENTS[k].id === p.perspectiveId
    );
    const strength = agentKey
      ? (PERSPECTIVE_AGENTS[agentKey].stageStrength[stageId] || 0.5)
      : 0.5;
    if (strength > bestScore) {
      bestScore = strength;
      best = p;
    }
  }
  return best;
}

/**
 * Orchestrate the full debate pipeline:
 *   Phase 1: 3 perspectives in parallel (flash-lite)
 *   Phase 2: 1 synthesizer merges best (flash)
 *
 * Fallback tiers:
 *   1. If 1 perspective fails → synthesize with 2 (minimum required)
 *   2. If 2+ fail → return null (caller falls back to single-agent)
 *   3. If synthesizer fails → use the best perspective directly
 *
 * @param {object} genAI - GoogleGenerativeAI instance
 * @param {string} situation - enriched stage context from buildStageContext
 * @param {string} userLang - 2-letter language code
 * @param {string} userContextSnippet - user's raw context input
 * @param {boolean} neutralFrame - non-dating mode
 * @param {string} stageId - one of 5 stage IDs
 * @param {object} [stagePsychology] - STAGE_PSYCHOLOGY[stageId]
 * @param {object} [cfg] - full multiverse config with debate sub-object
 * @returns {{ approaches, debateMetadata } | null} - null signals fallback to single-agent
 */
async function generateApproachesWithDebate(genAI, situation, userLang, userContextSnippet, neutralFrame, stageId, stagePsychology, cfg) {
  const debateCfg = { ...DEBATE_CONFIG_DEFAULTS, ...(cfg?.debate || {}) };
  const perspectiveIds = Object.keys(PERSPECTIVE_AGENTS);

  const perspectivePromises = perspectiveIds.map(pId =>
    Promise.race([
      generatePerspectiveApproaches(genAI, pId, situation, userLang, stageId, neutralFrame, debateCfg),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('perspective timeout')), debateCfg.perspectiveTimeoutMs)
      ),
    ]).catch(e => {
      logger.warn(`[Debate] Perspective ${pId} failed: ${e.message}`);
      return null;
    })
  );

  const results = await Promise.all(perspectivePromises);
  const validPerspectives = results.filter(Boolean);

  logger.info(`[Debate] Stage ${stageId}: ${validPerspectives.length}/${perspectiveIds.length} perspectives succeeded`);

  if (validPerspectives.length < debateCfg.minPerspectives) {
    logger.warn(`[Debate] Stage ${stageId}: only ${validPerspectives.length} perspectives — falling back to single-agent`);
    return null;
  }

  try {
    const synthesis = await Promise.race([
      synthesizeDebateApproaches(genAI, validPerspectives, situation, userLang, stageId, stagePsychology, debateCfg),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('synthesis timeout')), debateCfg.synthesisTimeoutMs)
      ),
    ]);

    return {
      approaches: synthesis.approaches,
      debateMetadata: {
        perspectivesUsed: validPerspectives.length,
        perspectiveIds: validPerspectives.map(p => p.perspectiveId),
        synthesisConfidence: synthesis.approaches.map(a => a.confidence || 5),
      },
    };
  } catch (e) {
    logger.warn(`[Debate] Stage ${stageId}: synthesis failed (${e.message}) — using best perspective`);
    const best = selectBestPerspective(validPerspectives, stageId);
    return {
      approaches: best.approaches.map(a => ({
        ...a,
        sourceAgents: [best.perspectiveId],
        confidence: 5,
      })),
      debateMetadata: {
        perspectivesUsed: 1,
        perspectiveIds: [best.perspectiveId],
        synthesisConfidence: [5, 5, 5, 5],
        fallback: true,
      },
    };
  }
}

/**
 * Blend heuristic score with LLM synthesis confidence.
 * @param {number} heuristicScore - result from scoreApproach (4-10)
 * @param {number} synthesisConfidence - from synthesizer (1-10)
 * @returns {number} blended score in [4, 10]
 */
function scoreApproachWithDebate(heuristicScore, synthesisConfidence) {
  const llmScore = typeof synthesisConfidence === 'number' ? synthesisConfidence : 5;
  const blended = 0.6 * heuristicScore + 0.4 * llmScore;
  return parseFloat(Math.min(10, Math.max(4, blended)).toFixed(1));
}

module.exports = {
  generateApproachesWithDebate,
  scoreApproachWithDebate,
  selectBestPerspective,
};
