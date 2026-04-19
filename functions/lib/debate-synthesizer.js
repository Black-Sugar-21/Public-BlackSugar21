'use strict';

/**
 * Multi-Agent Debate System — Synthesizer
 *
 * Receives 2-3 perspective outputs and produces the final 4 approaches
 * by comparing, selecting, and optionally merging the best elements.
 * Uses gemini-2.5-flash (full model) for highest quality output.
 */

const { logger } = require('firebase-functions');
const {
  AI_MODEL_NAME,
  getLanguageInstruction,
  parseGeminiJsonResponse,
  checkGeminiSafety,
  trackAICall,
} = require('./shared');

function buildSynthesisPrompt(perspectives, situation, userLang, stageId, stagePsychology) {
  const langInstr = getLanguageInstruction(userLang);

  const perspectiveBlocks = perspectives.map(p => {
    const approaches = p.approaches.map(a =>
      `    {"tone":"${a.tone}","phrase":"${a.phrase.replace(/"/g, '\\"')}","citedResearch":"${(a.citedResearch || '').replace(/"/g, '\\"')}"}`
    ).join(',\n');
    return `  AGENT ${p.perspectiveId} (${p.agentName}):\n  [\n${approaches}\n  ]`;
  }).join('\n\n');

  const psychBlock = stagePsychology
    ? `\nSTAGE PSYCHOLOGY (${stagePsychology.framework}):\n${stagePsychology.principles.map(p => `  - ${p}`).join('\n')}\n${stagePsychology.guidance}`
    : '';

  return `${langInstr}

You are the Debate Synthesizer for a relationship coaching app. ${perspectives.length} specialist agents — each grounded in different psychology research — have generated communication approaches for the same situation. Your job is to produce the BEST possible set of 4 approaches by leveraging all perspectives.

PROCESS:
1. COMPARE: For each tone (direct, playful, romantic_vulnerable/vulnerable, grounded_honest), examine the candidates from each agent.
2. SELECT OR MERGE: For each tone, either:
   - Select one agent's phrase as-is (if clearly strongest)
   - Merge the best elements from 2+ agents into a stronger phrase
   - Refine a phrase while preserving its core psychological insight
3. JUSTIFY: Note which agent(s) influenced each final phrase via "sourceAgents".
4. SCORE: Rate your confidence in each approach (1-10) based on the selection criteria below.

SELECTION CRITERIA (ordered by importance):
1. SPECIFICITY — Does it reference the user's actual situation? Generic phrases score 1-3.
2. PSYCHOLOGICAL GROUNDING — Is the underlying research principle sound and well-applied?
3. NATURAL LANGUAGE — Would a real person say this? Not therapist-speak or textbook language.
4. DISTINCTIVENESS — Does each tone feel genuinely different from the others?
5. CULTURAL SENSITIVITY — Appropriate for speakers of this language?

SITUATION:
"""
${situation}
"""
${psychBlock}

AGENT PERSPECTIVES:
${perspectiveBlocks}

IMPORTANT:
- Final phrases must be 2-3 sentences in the user's language.
- Each phrase MUST reference concrete details from the situation.
- "citedResearch" should name the specific researcher and principle that grounds this phrase.
- Confidence scores: 1-4 = weak/generic, 5-7 = solid, 8-10 = exceptional and situation-specific.

Respond ONLY with valid JSON:
{"approaches":[
  {"id":"1","tone":"direct","phrase":"...","sourceAgents":["A"],"confidence":8,"citedResearch":"..."},
  {"id":"2","tone":"playful","phrase":"...","sourceAgents":["B","C"],"confidence":7,"citedResearch":"..."},
  {"id":"3","tone":"romantic_vulnerable","phrase":"...","sourceAgents":["A","B"],"confidence":9,"citedResearch":"..."},
  {"id":"4","tone":"grounded_honest","phrase":"...","sourceAgents":["C"],"confidence":8,"citedResearch":"..."}
]}`;
}

/**
 * Synthesize debate approaches from multiple perspectives.
 * @param {object} genAI - GoogleGenerativeAI instance
 * @param {Array} perspectives - array of perspective results
 * @param {string} situation - enriched stage context
 * @param {string} userLang - 2-letter language code
 * @param {string} stageId - stage identifier
 * @param {object} [stagePsychology] - STAGE_PSYCHOLOGY[stageId] from multi-universe
 * @param {object} [debateCfg] - override config
 * @returns {{ approaches: Array<{id,tone,phrase,sourceAgents,confidence,citedResearch}> }}
 */
async function synthesizeDebateApproaches(genAI, perspectives, situation, userLang, stageId, stagePsychology, debateCfg = {}) {
  if (!perspectives || perspectives.length < 2) {
    throw new Error(`Need at least 2 perspectives, got ${perspectives?.length || 0}`);
  }

  const prompt = buildSynthesisPrompt(perspectives, situation, userLang, stageId, stagePsychology);

  const modelName = debateCfg.synthesisModel || AI_MODEL_NAME;
  const maxTokens = debateCfg.synthesisMaxTokens || 1200;
  const temperature = debateCfg.synthesisTemperature || 0.7;

  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
      responseMimeType: 'application/json',
    },
  });

  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await model.generateContent(prompt);

    const safety = checkGeminiSafety(result, 'debate-synthesizer');
    if (!safety.ok) {
      logger.warn(`[Debate-Synth] attempt ${attempt}: ${safety.reason}`);
      continue;
    }

    const text = result?.response?.text();
    if (!text) {
      logger.warn(`[Debate-Synth] attempt ${attempt}: empty response`);
      continue;
    }

    const parsed = parseGeminiJsonResponse(text);
    if (!parsed || !Array.isArray(parsed.approaches) || parsed.approaches.length < 4) {
      logger.warn(`[Debate-Synth] attempt ${attempt}: invalid JSON structure`);
      continue;
    }

    const validApproaches = parsed.approaches.filter(a => a.phrase && a.phrase.length > 10);
    if (validApproaches.length < 4) {
      logger.warn(`[Debate-Synth] attempt ${attempt}: ${validApproaches.length}/4 valid phrases`);
      continue;
    }

    await trackAICall(modelName, prompt.length, text.length, 'debate-synthesis');

    return {
      approaches: validApproaches.slice(0, 4).map((a, i) => ({
        id: String(i + 1),
        tone: a.tone || ['direct', 'playful', 'romantic_vulnerable', 'grounded_honest'][i],
        phrase: a.phrase,
        sourceAgents: Array.isArray(a.sourceAgents) ? a.sourceAgents : ['?'],
        confidence: typeof a.confidence === 'number' ? Math.max(1, Math.min(10, a.confidence)) : 5,
        citedResearch: a.citedResearch || '',
      })),
    };
  }

  throw new Error('Synthesizer failed after 2 attempts');
}

module.exports = {
  synthesizeDebateApproaches,
  buildSynthesisPrompt,
};
