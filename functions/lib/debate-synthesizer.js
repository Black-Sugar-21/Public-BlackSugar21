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

function salvageTruncatedJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) { /* try salvage */ }

  let fixed = text.trim();

  // Strategy 1: find the last complete object in the approaches array
  const lastCompleteObj = fixed.lastIndexOf('}');
  if (lastCompleteObj > 0) {
    const candidate = fixed.substring(0, lastCompleteObj + 1);
    // Try closing the array + outer object
    const attempts = [
      candidate + ']}',
      candidate + ',]}',  // trailing comma tolerance
    ];
    for (const a of attempts) {
      try {
        const parsed = JSON.parse(a);
        if (parsed?.approaches?.length >= 1) return parsed;
      } catch (_) { /* try next */ }
    }
  }

  // Strategy 2: brute-force brace/bracket balancing
  fixed = fixed.replace(/,\s*$/, '');
  const openBrackets = (fixed.match(/\[/g) || []).length;
  const closeBrackets = (fixed.match(/]/g) || []).length;
  const openBraces = (fixed.match(/{/g) || []).length;
  const closeBraces = (fixed.match(/}/g) || []).length;
  for (let i = 0; i < openBrackets - closeBrackets; i++) fixed += ']';
  for (let i = 0; i < openBraces - closeBraces; i++) fixed += '}';
  try {
    const parsed = JSON.parse(fixed);
    if (parsed?.approaches?.length >= 1) return parsed;
  } catch (_) { /* fall through */ }

  // Strategy 3: extract complete approach objects via regex
  const approachRegex = /\{[^{}]*"tone"\s*:\s*"[^"]+"\s*,[^{}]*"phrase"\s*:\s*"[^"]*"[^{}]*\}/g;
  const matches = fixed.match(approachRegex);
  if (matches && matches.length >= 1) {
    const approaches = [];
    for (const m of matches) {
      try { approaches.push(JSON.parse(m)); } catch (_) { /* skip broken */ }
    }
    if (approaches.length >= 1) return { approaches };
  }

  return null;
}

function buildSynthesisPrompt(perspectives, situation, userLang, stageId, stagePsychology) {
  const langInstr = getLanguageInstruction(userLang);
  const langName = { en:'English', es:'Spanish', ja:'Japanese (日本語)', zh:'Simplified Chinese (简体中文)', pt:'Portuguese', ar:'Arabic', de:'German', fr:'French', it:'Italian', ko:'Korean (한국어)' }[userLang] || userLang;
  const isEnglish = userLang === 'en';
  const translateNote = isEnglish ? '' : `\n⚠️ FINAL OUTPUT LANGUAGE = ${langName}. Agent perspectives below may be in English — translate every "phrase" value to ${langName}. Native ${langName} speaker quality required.`;

  const perspectiveBlocks = perspectives.map(p => {
    const approaches = p.approaches.map(a =>
      `    {"tone":${JSON.stringify(a.tone)},"phrase":${JSON.stringify(a.phrase || '')},"citedResearch":${JSON.stringify(a.citedResearch || '')}}`
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

AGENT PERSPECTIVES (may be in English — translate to ${langName} in your output):
${perspectiveBlocks}
${translateNote}

IMPORTANT:
- CRITICAL: Every "phrase" value MUST be written entirely in the user's language (see language instruction above). Even if the SITUATION or agent outputs are in a different language, your final phrases MUST be translated to the user's language. Never output English phrases unless the user's language is English.
- Each phrase MUST reference concrete details from the situation.
- "citedResearch" should name the specific researcher and principle that grounds this phrase.
- Confidence scores: 1-4 = weak/generic, 5-7 = solid, 8-10 = exceptional and situation-specific.

Respond ONLY with valid JSON:
{"approaches":[
  {"id":"1","tone":"direct","phrase":"...","sourceAgents":["A"],"confidence":8,"citedResearch":"..."},
  {"id":"2","tone":"playful","phrase":"...","sourceAgents":["B","C"],"confidence":7,"citedResearch":"..."},
  {"id":"3","tone":"romantic_vulnerable","phrase":"...","sourceAgents":["A","B"],"confidence":9,"citedResearch":"..."},
  {"id":"4","tone":"grounded_honest","phrase":"...","sourceAgents":["C"],"confidence":8,"citedResearch":"..."}
]}

${langInstr}`;
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
  const maxTokens = debateCfg.synthesisMaxTokens || 6000;
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
    if (!safety.ok && safety.reason !== 'truncated') {
      logger.warn(`[Debate-Synth] attempt ${attempt}: ${safety.reason}`);
      continue;
    }

    const text = result?.response?.text();
    if (!text) {
      logger.warn(`[Debate-Synth] attempt ${attempt}: empty response`);
      continue;
    }

    if (safety.reason === 'truncated') {
      logger.warn(`[Debate-Synth] attempt ${attempt}: truncated — attempting partial JSON salvage`);
    }

    let parsed = parseGeminiJsonResponse(text);
    const isTruncated = safety.reason === 'truncated';
    if (!parsed && isTruncated) {
      parsed = salvageTruncatedJson(text);
      if (parsed) logger.info(`[Debate-Synth] salvaged ${parsed.approaches?.length || 0} approaches from truncated output`);
    }
    const minRequired = isTruncated ? 1 : 4;
    if (!parsed || !Array.isArray(parsed.approaches) || parsed.approaches.length < minRequired) {
      logger.warn(`[Debate-Synth] attempt ${attempt}: invalid JSON structure (got ${parsed?.approaches?.length || 0}, need ${minRequired})`);
      continue;
    }

    const validApproaches = parsed.approaches.filter(a =>
      a.phrase && a.phrase.length > 10 && !/\[(?:specific|mention|insert|add)\b/i.test(a.phrase)
    );
    if (validApproaches.length < minRequired) {
      logger.warn(`[Debate-Synth] attempt ${attempt}: ${validApproaches.length}/${minRequired} valid phrases`);
      continue;
    }

    const usage = result?.response?.usageMetadata;
    await trackAICall({ functionName: 'simulateMultiUniverse', model: modelName, operation: 'debate-synthesis', usage });

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
  salvageTruncatedJson,
};
