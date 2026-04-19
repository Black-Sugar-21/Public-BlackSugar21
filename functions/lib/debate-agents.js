'use strict';

/**
 * Multi-Agent Debate System — Perspective Agent
 *
 * Generates 4 approaches from a single psychological perspective.
 * Uses gemini-2.5-flash-lite (drafts, not final output).
 */

const { logger } = require('firebase-functions');
const {
  PERSPECTIVE_AGENTS,
  STAGE_PERSPECTIVE_PRINCIPLES,
} = require('./debate-psychology');
const {
  AI_MODEL_LITE,
  getLanguageInstruction,
  parseGeminiJsonResponse,
  checkGeminiSafety,
  trackAICall,
} = require('./shared');

const TONES_DATING = ['direct', 'playful', 'romantic_vulnerable', 'grounded_honest'];
const TONES_NEUTRAL = ['direct', 'playful', 'vulnerable', 'grounded_honest'];

function buildPerspectivePrompt(agent, principles, situation, userLang, stageId, neutralFrame) {
  const langInstr = getLanguageInstruction(userLang);
  const tones = neutralFrame ? TONES_NEUTRAL : TONES_DATING;
  const roleContext = neutralFrame
    ? 'communication coach helping someone navigate a personal situation (friendship, family, work, reunion, or romance)'
    : 'dating coach helping someone navigate a romantic connection';

  const principleList = principles.map(p =>
    `  - ${p.principle} (${p.researcher})`
  ).join('\n');

  const toneDescriptions = {
    direct: 'clear, confident, unambiguous',
    playful: 'warm, light, with humor',
    romantic_vulnerable: 'soft, honest about feelings tied to THIS situation',
    vulnerable: 'soft, honest about what THIS situation means emotionally',
    grounded_honest: 'calm, real, low-pressure',
  };

  const toneSpec = tones.map(t => `"${t}" — ${toneDescriptions[t]}`).join('\n  ');

  const langName = { en:'English', es:'Spanish', ja:'Japanese (日本語)', zh:'Chinese (中文)', pt:'Portuguese', ar:'Arabic', de:'German', fr:'French', it:'Italian', ko:'Korean' }[userLang] || userLang;
  const isEnglish = userLang === 'en';
  const translateNote = isEnglish ? '' : `\n⚠️ OUTPUT LANGUAGE = ${langName}. The situation above may contain English text — that is context only. Your "phrase" values MUST be fully translated to ${langName}. Write as if you are a native ${langName} speaker. Do NOT output English phrases.`;

  return `${langInstr}

You are Agent ${agent.id}: the ${agent.name} perspective.

YOUR PSYCHOLOGICAL FRAMEWORK: ${agent.framework}
Key researchers: ${agent.researchers.join(', ')}

YOUR LENS: ${agent.lens}

RESEARCH PRINCIPLES FOR THIS STAGE (${stageId}):
${principleList}

You are a ${roleContext}.

SITUATION (for context only — do not mirror its language):
"""
${situation}
"""
${translateNote}

Generate EXACTLY 4 communication approaches, one per tone:
  ${toneSpec}

RULES:
- CRITICAL: Each "phrase" value MUST be written entirely in ${langName}. Never write phrases in English unless the user's language IS English.
- Each phrase MUST be 2-3 sentences.
- Each phrase MUST reference specific details from the SITUATION above — never generic.
- Each phrase MUST reflect YOUR framework's perspective distinctly.
- Add "citedResearch": a 1-sentence note on which specific principle from YOUR framework informed this phrase.
- Your approaches will be compared against 2 other specialist agents. A synthesizer will pick the best. Make yours distinctly reflect YOUR perspective.

Respond ONLY with valid JSON:
{"perspectiveId":"${agent.id}","approaches":[{"id":"1","tone":"${tones[0]}","phrase":"...","citedResearch":"..."},{"id":"2","tone":"${tones[1]}","phrase":"...","citedResearch":"..."},{"id":"3","tone":"${tones[2]}","phrase":"...","citedResearch":"..."},{"id":"4","tone":"${tones[3]}","phrase":"...","citedResearch":"..."}]}

${langInstr}`;
}

/**
 * Generate 4 approaches from a single perspective agent.
 * @param {object} genAI - GoogleGenerativeAI instance
 * @param {string} perspectiveId - key in PERSPECTIVE_AGENTS
 * @param {string} situation - the enriched stage context
 * @param {string} userLang - 2-letter language code
 * @param {string} stageId - one of 5 stage IDs
 * @param {boolean} neutralFrame - non-dating context
 * @param {object} [debateCfg] - override config
 * @returns {{ perspectiveId: string, approaches: Array<{id,tone,phrase,citedResearch}> }}
 */
async function generatePerspectiveApproaches(genAI, perspectiveId, situation, userLang, stageId, neutralFrame, debateCfg = {}) {
  const agent = PERSPECTIVE_AGENTS[perspectiveId];
  if (!agent) throw new Error(`Unknown perspective: ${perspectiveId}`);

  if (!situation || typeof situation !== 'string' || situation.trim().length < 10) {
    throw new Error(`Situation too short for perspective generation (${situation?.length || 0} chars)`);
  }
  const safeSituation = situation.substring(0, 1500);

  const principles = (STAGE_PERSPECTIVE_PRINCIPLES[stageId] || {})[perspectiveId] || [];
  if (principles.length === 0) {
    logger.warn(`[Debate-Agent-${agent.id}] No principles for stage ${stageId}`);
  }

  const prompt = buildPerspectivePrompt(agent, principles, safeSituation, userLang, stageId, neutralFrame);

  const modelName = debateCfg.perspectiveModel || AI_MODEL_LITE;
  const maxTokens = debateCfg.perspectiveMaxTokens || 800;
  const temperature = debateCfg.perspectiveTemperature || 0.9;

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

    const safety = checkGeminiSafety(result, `debate-agent-${agent.id}`);
    if (!safety.ok) {
      logger.warn(`[Debate-Agent-${agent.id}] attempt ${attempt}: ${safety.reason}`);
      continue;
    }

    const text = result?.response?.text();
    if (!text) {
      logger.warn(`[Debate-Agent-${agent.id}] attempt ${attempt}: empty response`);
      continue;
    }

    const parsed = parseGeminiJsonResponse(text);
    if (!parsed || !Array.isArray(parsed.approaches) || parsed.approaches.length < 4) {
      logger.warn(`[Debate-Agent-${agent.id}] attempt ${attempt}: invalid JSON structure`);
      continue;
    }

    const validApproaches = parsed.approaches.filter(a =>
      a.phrase && a.phrase.length > 10 && !/\[(?:specific|mention|insert|add)\b/i.test(a.phrase)
    );
    if (validApproaches.length < 4) {
      logger.warn(`[Debate-Agent-${agent.id}] attempt ${attempt}: ${validApproaches.length}/4 valid phrases`);
      continue;
    }

    const usage = result?.response?.usageMetadata;
    await trackAICall({ functionName: 'simulateMultiUniverse', model: modelName, operation: 'debate-perspective', usage });

    return {
      perspectiveId: agent.id,
      agentName: agent.name,
      approaches: validApproaches.slice(0, 4).map((a, i) => ({
        id: String(i + 1),
        tone: a.tone,
        phrase: a.phrase,
        citedResearch: a.citedResearch || '',
      })),
    };
  }

  throw new Error(`Agent ${agent.id} failed after 2 attempts`);
}

module.exports = {
  generatePerspectiveApproaches,
  buildPerspectivePrompt,
  TONES_DATING,
  TONES_NEUTRAL,
};
