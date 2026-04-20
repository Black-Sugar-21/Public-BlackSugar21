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
  if (!validPerspectives || validPerspectives.length === 0) return null;
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

  const perspectivePromises = perspectiveIds.map(pId => {
    let timer;
    return Promise.race([
      generatePerspectiveApproaches(genAI, pId, situation, userLang, stageId, neutralFrame, debateCfg, userContextSnippet),
      new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error('perspective timeout')), debateCfg.perspectiveTimeoutMs);
      }),
    ]).then(r => { clearTimeout(timer); return r; })
      .catch(e => {
        clearTimeout(timer);
        logger.warn(`[Debate] Perspective ${pId} failed: ${e.message}`);
        return null;
      });
  });

  const results = await Promise.all(perspectivePromises);
  const validPerspectives = results.filter(Boolean);

  logger.info(`[Debate] Stage ${stageId}: ${validPerspectives.length}/${perspectiveIds.length} perspectives succeeded`);

  if (validPerspectives.length < debateCfg.minPerspectives) {
    logger.warn(`[Debate] Stage ${stageId}: only ${validPerspectives.length} perspectives — falling back to single-agent`);
    return null;
  }

  let synthTimer;
  try {
    const synthesis = await Promise.race([
      synthesizeDebateApproaches(genAI, validPerspectives, situation, userLang, stageId, stagePsychology, debateCfg),
      new Promise((_, rej) => {
        synthTimer = setTimeout(() => rej(new Error('synthesis timeout')), debateCfg.synthesisTimeoutMs);
      }),
    ]);
    clearTimeout(synthTimer);

    let finalApproaches = synthesis.approaches;
    const tones = ['direct', 'playful', 'romantic_vulnerable', 'grounded_honest'];

    // Supplement partial synthesis from best perspective
    if (finalApproaches.length < 4) {
      logger.info(`[Debate] Stage ${stageId}: synthesis partial (${finalApproaches.length}/4) — supplementing from perspectives`);
      const best = selectBestPerspective(validPerspectives, stageId);
      if (best) {
        const usedTones = new Set(finalApproaches.map(a => a.tone));
        for (const ba of best.approaches) {
          if (finalApproaches.length >= 4) break;
          const tone = ba.tone || tones[finalApproaches.length];
          if (!usedTones.has(tone)) {
            finalApproaches.push({ ...ba, sourceAgents: [best.perspectiveId], confidence: 5 });
            usedTones.add(tone);
          }
        }
      }
    }

    return {
      approaches: finalApproaches.slice(0, 4),
      debateMetadata: {
        perspectivesUsed: validPerspectives.length,
        perspectiveIds: validPerspectives.map(p => p.perspectiveId),
        synthesisConfidence: finalApproaches.slice(0, 4).map(a => a.confidence || 5),
        partial: finalApproaches.length < synthesis.approaches.length ? undefined : (synthesis.approaches.length < 4),
      },
    };
  } catch (e) {
    clearTimeout(synthTimer);
    logger.warn(`[Debate] Stage ${stageId}: synthesis failed (${e.message}) — using best perspective`);
    const best = selectBestPerspective(validPerspectives, stageId);
    if (!best) {
      logger.error(`[Debate] Stage ${stageId}: no best perspective available`);
      return null;
    }
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
 * Blend a heuristic approach score with the synthesizer's confidence rating,
 * adding bonuses for evidence-grounded and multi-source approaches.
 *
 * Bonuses (applied after blend, before clamp):
 *   +0.5 — citedResearch names a specific researcher or year (evidence-grounded)
 *   +0.3 — approach synthesized from multiple agent perspectives
 *
 * Weight: 60% heuristic, 40% LLM confidence. Result clamped to [4, 10].
 * @param {number} heuristicScore - rule-based score from scoreApproach (4-10)
 * @param {number} synthesisConfidence - LLM confidence from synthesizer (1-10)
 * @param {object} [approach] - approach object with optional citedResearch and sourceAgents
 * @returns {number} blended score in [4, 10], one decimal place
 */
function scoreApproachWithDebate(heuristicScore, synthesisConfidence, approach = {}) {
  const h = typeof heuristicScore === 'number' && !isNaN(heuristicScore) ? heuristicScore : 5;
  const llmScore = typeof synthesisConfidence === 'number' && !isNaN(synthesisConfidence) ? synthesisConfidence : 5;
  const blended = 0.6 * h + 0.4 * llmScore;

  // +0.5 if citedResearch references a specific researcher (capital name) or year
  const cited = typeof approach.citedResearch === 'string' ? approach.citedResearch : '';
  const citedBonus = /[A-Z][a-z]+.*\d{4}|\d{4}.*[A-Z][a-z]+/.test(cited) ? 0.5 : 0;

  // +0.3 if synthesized from multiple agent perspectives
  const sources = Array.isArray(approach.sourceAgents) ? approach.sourceAgents : [];
  const multiSourceBonus = sources.length > 1 ? 0.3 : 0;

  return parseFloat(Math.min(10, Math.max(4, blended + citedBonus + multiSourceBonus)).toFixed(1));
}

module.exports = {
  generateApproachesWithDebate,
  scoreApproachWithDebate,
  selectBestPerspective,
};
