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

const STOPWORDS = new Set([
  // English
  'a','an','the','is','are','was','were','i','you','he','she','it','we','they',
  'to','of','in','and','or','but','for','on','at','with','as','my','his','her',
  'our','your','their','this','that','these','those','been','have','has','had',
  'will','would','could','should','do','did','not','no','be','by','from','up',
  'out','if','about','so','me','him','us','them','very','just','what','how',
  'when','also','been','more','than','then','some',
  // Spanish
  'que','se','de','en','la','el','los','las','una','un','por','con',
  'para','pero','como','más','esta','esto','estos','estas','tiene','tienen',
  'están','está','son','fue','era','hay','ser','muy','todo','todos',
]);

/**
 * Reorder principles by relevance to userContext keywords.
 * Principles matching more context words float to the top, ensuring Gemini
 * reads the most situationally relevant research first. No truncation —
 * all principles are kept, just reordered.
 * @param {Array<{principle:string, researcher:string}>} principles
 * @param {string} userContext - raw user context snippet (may be empty)
 * @returns {Array} same array reordered, or original if no signal
 */
function rankPrinciplesByContext(principles, userContext) {
  if (!userContext || typeof userContext !== 'string' || !userContext.trim() || principles.length <= 1) return principles;

  const words = userContext.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPWORDS.has(w))
    .slice(0, 50);

  if (words.length === 0) return principles;

  const scored = principles.map(p => {
    const haystack = (p.principle + ' ' + p.researcher).toLowerCase();
    const score = words.reduce((acc, w) => {
      // Stem long words (strip -ed/-ing/-s variants) so "ghosted" matches "ghosting"
      const stem = w.length > 6 ? w.slice(0, -2) : w;
      return acc + (haystack.includes(stem) ? 1 : 0);
    }, 0);
    return { p, score };
  });

  if (scored.every(s => s.score === 0)) return principles;

  return scored.sort((a, b) => b.score - a.score).map(s => s.p);
}

function getLocalizedToneDescriptions(userLang) {
  const base = {
    direct: 'clear, confident, unambiguous',
    playful: 'warm, light, with humor',
    romantic_vulnerable: 'soft, honest about feelings tied to THIS situation',
    vulnerable: 'soft, honest about what THIS situation means emotionally',
    grounded_honest: 'calm, real, low-pressure',
  };
  if (userLang === 'ja' || userLang.startsWith('ja')) {
    return {
      ...base,
      direct: 'thoughtful and clear in intent — respectful of indirect expression norms (間接的), avoiding bluntness',
      romantic_vulnerable: 'sincere, warm, emotionally present — expressed with restraint and cultural grace (奥ゆかしさ)',
      playful: 'warm, light-hearted — using gentle self-deprecation or understatement rather than bold humor',
    };
  }
  if (userLang === 'ko' || userLang.startsWith('ko')) {
    return {
      ...base,
      direct: 'clear and confident, always in a polite register (존댓말) — assertive without being blunt',
      romantic_vulnerable: 'sincere and emotionally honest — expressed with appropriate warmth for the stage of the relationship',
    };
  }
  if (userLang === 'ar' || userLang.startsWith('ar')) {
    return {
      ...base,
      direct: 'clear and respectful — confident but never forward; culturally dignified tone (محترم)',
      romantic_vulnerable: 'sincere and respectful about genuine interest — never explicit emotional declaration; warm appreciation without crossing modesty norms',
      playful: 'warm and light, with wit and charm — never flirtatious in an inappropriate way',
    };
  }
  return base;
}

/**
 * Build the Gemini prompt for a single perspective agent.
 * @param {object} agent - entry from PERSPECTIVE_AGENTS (id, name, framework, researchers, lens)
 * @param {Array<{principle: string, researcher: string}>} principles - stage-specific principles for this agent
 * @param {string} situation - enriched stage context from buildStageContext (max 1500 chars)
 * @param {string} userLang - 2-letter language code for output language directive
 * @param {string} stageId - one of 5 stage IDs
 * @param {boolean} neutralFrame - true for non-dating/communication-coach mode
 * @returns {string} full prompt string ready for model.generateContent()
 */
function buildPerspectivePrompt(agent, principles, situation, userLang, stageId, neutralFrame) {
  const langInstr = getLanguageInstruction(userLang);
  const tones = neutralFrame ? TONES_NEUTRAL : TONES_DATING;

  const isArabic = userLang === 'ar' || userLang.startsWith('ar');
  const isKorean = userLang === 'ko' || userLang.startsWith('ko');
  let roleContext;
  if (neutralFrame) {
    roleContext = 'communication coach helping someone navigate a personal situation (friendship, family, work, reunion, or meaningful connection)';
  } else if (isArabic) {
    roleContext = 'relationship guide helping someone build a sincere, respectful connection in accordance with cultural and social values';
  } else {
    roleContext = 'dating coach helping someone navigate a romantic connection';
  }

  const principleList = principles.map(p =>
    `  - ${p.principle} (${p.researcher})`
  ).join('\n');

  const toneDescriptions = getLocalizedToneDescriptions(userLang);

  const toneSpec = tones.map(t => `"${t}" — ${toneDescriptions[t]}`).join('\n  ');

  const langName = { en:'English', es:'Spanish', ja:'Japanese (日本語)', zh:'Simplified Chinese (简体中文)', pt:'Portuguese', ar:'Arabic', de:'German', fr:'French', it:'Italian', ko:'Korean (한국어)' }[userLang] || userLang;
  const isEnglish = userLang === 'en';
  const translateNote = isEnglish ? '' : `\n⚠️ OUTPUT LANGUAGE = ${langName}. The situation above may contain English text — that is context only. Your "phrase" values MUST be fully translated to ${langName}. Write as if you are a native ${langName} speaker. Do NOT output English phrases.`;

  // Cultural adaptation note for high-context / conservative markets
  let culturalNote = '';
  if (isArabic) {
    culturalNote = '\n⚠️ CULTURAL NOTE: Adapt all research principles to Arabic cultural norms — indirect communication, modesty, family-aware framing. Principles referencing "ghosting" or cold audio/video calls may not apply; substitute with culturally appropriate communication norms.';
  } else if (userLang === 'ja' || userLang.startsWith('ja')) {
    culturalNote = '\n⚠️ CULTURAL NOTE: Japanese communication is high-context. Principles suggesting direct rejection requests or voice/audio calls as early-stage contact are not culturally appropriate — adapt to indirect but sincere expression. Tatemae/honne balance matters.';
  } else if (isKorean) {
    culturalNote = '\n⚠️ CULTURAL NOTE: Korean communication uses formal speech levels. For commitment signals, KakaoTalk deactivation / exchanging personal contact info are the culturally meaningful acts. Adapt digital commitment principles accordingly.';
  }

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
${translateNote}${culturalNote}

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
 * @param {string} [userContext] - raw user context for principle relevance ranking
 * @returns {{ perspectiveId: string, approaches: Array<{id,tone,phrase,citedResearch}> }}
 */
async function generatePerspectiveApproaches(genAI, perspectiveId, situation, userLang, stageId, neutralFrame, debateCfg = {}, userContext = '') {
  const agent = PERSPECTIVE_AGENTS[perspectiveId];
  if (!agent) throw new Error(`Unknown perspective: ${perspectiveId}`);

  if (!situation || typeof situation !== 'string' || situation.trim().length < 10) {
    throw new Error(`Situation too short for perspective generation (${situation?.length || 0} chars)`);
  }
  const safeSituation = situation.substring(0, 1500);

  const rawPrinciples = (STAGE_PERSPECTIVE_PRINCIPLES[stageId] || {})[perspectiveId] || [];
  if (rawPrinciples.length === 0) {
    logger.warn(`[Debate-Agent-${agent.id}] No principles for stage ${stageId}`);
  }
  const principles = rankPrinciplesByContext(rawPrinciples, userContext);

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
  rankPrinciplesByContext,
  TONES_DATING,
  TONES_NEUTRAL,
};
