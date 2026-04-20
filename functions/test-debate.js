'use strict';

/**
 * Test suite for the Multi-Agent Debate System
 *
 * Validates:
 * 1. debate-psychology.js — data tables, agent configs, principles
 * 2. debate-agents.js — prompt construction, model selection
 * 3. debate-synthesizer.js — synthesis prompt, criteria
 * 4. debate-orchestrator.js — pipeline logic, fallback, scoring
 * 5. Integration with multi-universe-simulation.js
 *
 * All tests are STATIC (source-code analysis, no Gemini calls).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const failures = [];

function ok(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(msg);
    console.error(`  ✗ ${msg}`);
  }
}

// ─── Load modules ──────────────────────────────────────────────────
const {
  PERSPECTIVE_AGENTS,
  STAGE_PERSPECTIVE_PRINCIPLES,
  DEBATE_CONFIG_DEFAULTS,
  STAGE_IDS,
} = require('./lib/debate-psychology');

const { scoreApproachWithDebate, selectBestPerspective } = require('./lib/debate-orchestrator');

// ─── Load source files for static analysis ─────────────────────────
const debatePsychSrc = fs.readFileSync(path.join(__dirname, 'lib/debate-psychology.js'), 'utf-8');
const debateAgentsSrc = fs.readFileSync(path.join(__dirname, 'lib/debate-agents.js'), 'utf-8');
const debateSynthSrc = fs.readFileSync(path.join(__dirname, 'lib/debate-synthesizer.js'), 'utf-8');
const debateOrchSrc = fs.readFileSync(path.join(__dirname, 'lib/debate-orchestrator.js'), 'utf-8');
const multiUniverseSrc = fs.readFileSync(path.join(__dirname, 'lib/multi-universe-simulation.js'), 'utf-8');

console.log('══════════════════════════════════════════════════════════');
console.log('  TEST SUITE: Multi-Agent Debate System');
console.log('══════════════════════════════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════════════
// Section 1: debate-psychology.js — Data Tables & Agent Configs
// ═══════════════════════════════════════════════════════════════════
console.log('── Section 1: debate-psychology.js ──');

ok(PERSPECTIVE_AGENTS != null, 'PERSPECTIVE_AGENTS is defined');
ok(Object.keys(PERSPECTIVE_AGENTS).length === 3, 'PERSPECTIVE_AGENTS has exactly 3 agents');

const agentIds = Object.keys(PERSPECTIVE_AGENTS);
ok(agentIds.includes('attachment_safety'), 'attachment_safety agent exists');
ok(agentIds.includes('social_dynamics'), 'social_dynamics agent exists');
ok(agentIds.includes('communication_repair'), 'communication_repair agent exists');

for (const key of agentIds) {
  const agent = PERSPECTIVE_AGENTS[key];
  ok(typeof agent.id === 'string' && agent.id.length === 1, `${key}: has single-char id`);
  ok(typeof agent.name === 'string' && agent.name.length > 5, `${key}: has descriptive name`);
  ok(typeof agent.framework === 'string' && agent.framework.length > 10, `${key}: has framework`);
  ok(typeof agent.lens === 'string' && agent.lens.length > 10, `${key}: has lens question`);
  ok(Array.isArray(agent.researchers) && agent.researchers.length >= 3, `${key}: has ≥3 researchers`);
  ok(agent.stageStrength != null, `${key}: has stageStrength`);
  for (const stageId of STAGE_IDS) {
    ok(typeof agent.stageStrength[stageId] === 'number', `${key}: stageStrength[${stageId}] is number`);
    ok(agent.stageStrength[stageId] >= 0 && agent.stageStrength[stageId] <= 1, `${key}: stageStrength[${stageId}] in [0,1]`);
  }
}

// Unique IDs
const ids = agentIds.map(k => PERSPECTIVE_AGENTS[k].id);
ok(new Set(ids).size === 3, 'Agent IDs are unique (A, B, C)');

// STAGE_PERSPECTIVE_PRINCIPLES
ok(STAGE_PERSPECTIVE_PRINCIPLES != null, 'STAGE_PERSPECTIVE_PRINCIPLES is defined');
for (const stageId of STAGE_IDS) {
  ok(STAGE_PERSPECTIVE_PRINCIPLES[stageId] != null, `Principles exist for stage: ${stageId}`);
  for (const agentKey of agentIds) {
    const principles = STAGE_PERSPECTIVE_PRINCIPLES[stageId][agentKey];
    ok(Array.isArray(principles) && principles.length > 0, `${stageId}/${agentKey}: has ≥1 principle`);
    for (const p of principles) {
      ok(typeof p.principle === 'string' && p.principle.length > 20, `${stageId}/${agentKey}: principle is descriptive`);
      ok(typeof p.researcher === 'string' && p.researcher.length > 5, `${stageId}/${agentKey}: has researcher citation`);
    }
  }
}

// DEBATE_CONFIG_DEFAULTS
ok(DEBATE_CONFIG_DEFAULTS != null, 'DEBATE_CONFIG_DEFAULTS is defined');
ok(DEBATE_CONFIG_DEFAULTS.enabled === false, 'debate disabled by default');
ok(DEBATE_CONFIG_DEFAULTS.minPerspectives === 2, 'minPerspectives = 2');
ok(typeof DEBATE_CONFIG_DEFAULTS.perspectiveModel === 'string', 'perspectiveModel is string');
ok(DEBATE_CONFIG_DEFAULTS.perspectiveMaxTokens > 0, 'perspectiveMaxTokens > 0');
ok(DEBATE_CONFIG_DEFAULTS.perspectiveTemperature > 0, 'perspectiveTemperature > 0');
ok(DEBATE_CONFIG_DEFAULTS.perspectiveTimeoutMs > 0, 'perspectiveTimeoutMs > 0');
ok(typeof DEBATE_CONFIG_DEFAULTS.synthesisModel === 'string', 'synthesisModel is string');
ok(DEBATE_CONFIG_DEFAULTS.synthesisMaxTokens > 0, 'synthesisMaxTokens > 0');
ok(DEBATE_CONFIG_DEFAULTS.synthesisTemperature > 0, 'synthesisTemperature > 0');
ok(DEBATE_CONFIG_DEFAULTS.synthesisTimeoutMs > 0, 'synthesisTimeoutMs > 0');
ok(DEBATE_CONFIG_DEFAULTS.parallelStages === true, 'parallelStages enabled by default');

// STAGE_IDS
ok(Array.isArray(STAGE_IDS), 'STAGE_IDS is array');
ok(STAGE_IDS.length === 5, 'STAGE_IDS has 5 stages');

// ═══════════════════════════════════════════════════════════════════
// Section 2: debate-agents.js — Prompt Construction
// ═══════════════════════════════════════════════════════════════════
console.log('── Section 2: debate-agents.js ──');

ok(debateAgentsSrc.includes("require('./debate-psychology')"), 'imports from debate-psychology');
ok(debateAgentsSrc.includes("require('./shared')"), 'imports from shared');
ok(debateAgentsSrc.includes('getLanguageInstruction'), 'uses getLanguageInstruction');
ok(debateAgentsSrc.includes('AI_MODEL_LITE'), 'imports AI_MODEL_LITE');
ok(debateAgentsSrc.includes('checkGeminiSafety'), 'uses checkGeminiSafety');
ok(debateAgentsSrc.includes('parseGeminiJsonResponse'), 'uses parseGeminiJsonResponse');
ok(debateAgentsSrc.includes('trackAICall'), 'uses trackAICall');

// Prompt construction
ok(debateAgentsSrc.includes('agent.framework'), 'prompt includes agent framework');
ok(debateAgentsSrc.includes('agent.lens'), 'prompt includes agent lens');
ok(debateAgentsSrc.includes('agent.researchers'), 'prompt includes agent researchers');
ok(debateAgentsSrc.includes('citedResearch'), 'prompt requires citedResearch field');
ok(debateAgentsSrc.includes('perspectiveId'), 'prompt includes perspectiveId');
ok(debateAgentsSrc.includes('SITUATION'), 'prompt includes SITUATION section');

// Model config
ok(debateAgentsSrc.includes('perspectiveModel'), 'uses perspectiveModel from config');
ok(debateAgentsSrc.includes('perspectiveMaxTokens'), 'uses perspectiveMaxTokens');
ok(debateAgentsSrc.includes('perspectiveTemperature'), 'uses perspectiveTemperature');

// Retry logic
ok(debateAgentsSrc.includes('attempt <= 2'), 'retries up to 2 attempts');

// Tones
ok(debateAgentsSrc.includes('TONES_DATING'), 'exports TONES_DATING');
ok(debateAgentsSrc.includes('TONES_NEUTRAL'), 'exports TONES_NEUTRAL');
ok(debateAgentsSrc.includes('romantic_vulnerable'), 'dating tones include romantic_vulnerable');
ok(debateAgentsSrc.includes("'vulnerable'"), 'neutral tones include vulnerable (non-romantic)');

// Neutral frame handling
ok(debateAgentsSrc.includes('neutralFrame'), 'handles neutralFrame parameter');
ok(debateAgentsSrc.includes('communication coach'), 'neutral prompt uses communication coach role');
ok(debateAgentsSrc.includes('dating coach'), 'dating prompt uses dating coach role');

// Exports
ok(debateAgentsSrc.includes('generatePerspectiveApproaches'), 'exports generatePerspectiveApproaches');
ok(debateAgentsSrc.includes('buildPerspectivePrompt'), 'exports buildPerspectivePrompt');

// ═══════════════════════════════════════════════════════════════════
// Section 3: debate-synthesizer.js — Synthesis Prompt & Criteria
// ═══════════════════════════════════════════════════════════════════
console.log('── Section 3: debate-synthesizer.js ──');

ok(debateSynthSrc.includes("require('./shared')"), 'imports from shared');
ok(debateSynthSrc.includes('AI_MODEL_NAME'), 'imports AI_MODEL_NAME (full flash model)');
ok(debateSynthSrc.includes('checkGeminiSafety'), 'uses checkGeminiSafety');
ok(debateSynthSrc.includes('parseGeminiJsonResponse'), 'uses parseGeminiJsonResponse');
ok(debateSynthSrc.includes('trackAICall'), 'uses trackAICall');

// Synthesis prompt
ok(debateSynthSrc.includes('Debate Synthesizer'), 'prompt identifies as Debate Synthesizer');
ok(debateSynthSrc.includes('COMPARE'), 'prompt includes COMPARE step');
ok(debateSynthSrc.includes('SELECT OR MERGE'), 'prompt includes SELECT OR MERGE step');
ok(debateSynthSrc.includes('JUSTIFY'), 'prompt includes JUSTIFY step');
ok(debateSynthSrc.includes('SCORE'), 'prompt includes SCORE step');

// Selection criteria
ok(debateSynthSrc.includes('SPECIFICITY'), 'criteria includes specificity');
ok(debateSynthSrc.includes('PSYCHOLOGICAL GROUNDING'), 'criteria includes grounding');
ok(debateSynthSrc.includes('NATURAL LANGUAGE'), 'criteria includes natural language');
ok(debateSynthSrc.includes('DISTINCTIVENESS'), 'criteria includes distinctiveness');
ok(debateSynthSrc.includes('CULTURAL SENSITIVITY'), 'criteria includes cultural sensitivity');

// Output format
ok(debateSynthSrc.includes('sourceAgents'), 'output requires sourceAgents');
ok(debateSynthSrc.includes('confidence'), 'output requires confidence');
ok(debateSynthSrc.includes('citedResearch'), 'output requires citedResearch');

// Model config
ok(debateSynthSrc.includes('synthesisModel'), 'uses synthesisModel from config');
ok(debateSynthSrc.includes('synthesisMaxTokens'), 'uses synthesisMaxTokens');
ok(debateSynthSrc.includes('synthesisTemperature'), 'uses synthesisTemperature');

// Retry
ok(debateSynthSrc.includes('attempt <= 2'), 'retries up to 2 attempts');

// Validation
ok(debateSynthSrc.includes('Math.max(1, Math.min(10, a.confidence))'), 'clamps confidence to [1,10]');

// Exports
ok(debateSynthSrc.includes('synthesizeDebateApproaches'), 'exports synthesizeDebateApproaches');
ok(debateSynthSrc.includes('buildSynthesisPrompt'), 'exports buildSynthesisPrompt');

// ═══════════════════════════════════════════════════════════════════
// Section 4: debate-orchestrator.js — Pipeline & Fallback Logic
// ═══════════════════════════════════════════════════════════════════
console.log('── Section 4: debate-orchestrator.js ──');

ok(debateOrchSrc.includes("require('./debate-agents')"), 'imports from debate-agents');
ok(debateOrchSrc.includes("require('./debate-synthesizer')"), 'imports from debate-synthesizer');
ok(debateOrchSrc.includes("require('./debate-psychology')"), 'imports from debate-psychology');
ok(debateOrchSrc.includes('generatePerspectiveApproaches'), 'calls generatePerspectiveApproaches');
ok(debateOrchSrc.includes('synthesizeDebateApproaches'), 'calls synthesizeDebateApproaches');

// Parallel execution
ok(debateOrchSrc.includes('Promise.all'), 'uses Promise.all for parallel perspectives');
ok(debateOrchSrc.includes('Promise.race'), 'uses Promise.race for timeout');
ok(debateOrchSrc.includes('perspectiveTimeoutMs'), 'respects perspectiveTimeoutMs');
ok(debateOrchSrc.includes('synthesisTimeoutMs'), 'respects synthesisTimeoutMs');

// Fallback logic
ok(debateOrchSrc.includes('minPerspectives'), 'checks minPerspectives');
ok(debateOrchSrc.includes('return null'), 'returns null for tier-2 fallback (not enough perspectives)');
ok(debateOrchSrc.includes('selectBestPerspective'), 'tier-3 fallback uses selectBestPerspective');
ok(debateOrchSrc.includes('fallback: true'), 'marks fallback results');

// debateMetadata
ok(debateOrchSrc.includes('perspectivesUsed'), 'metadata includes perspectivesUsed');
ok(debateOrchSrc.includes('perspectiveIds'), 'metadata includes perspectiveIds');
ok(debateOrchSrc.includes('synthesisConfidence'), 'metadata includes synthesisConfidence');

// Score blending
ok(typeof scoreApproachWithDebate === 'function', 'scoreApproachWithDebate is a function');

// Test score blending behavior
const scoreHigh = scoreApproachWithDebate(7, 10);
const scoreLow = scoreApproachWithDebate(7, 1);
ok(scoreHigh > scoreLow, `score with confidence=10 (${scoreHigh}) > confidence=1 (${scoreLow})`);

const scoreMax = scoreApproachWithDebate(10, 10);
ok(scoreMax <= 10, `max score (${scoreMax}) <= 10`);

const scoreMin = scoreApproachWithDebate(4, 1);
ok(scoreMin >= 4, `min score (${scoreMin}) >= 4`);

const scoreMid = scoreApproachWithDebate(6, 6);
ok(scoreMid === 6.0, `balanced score (${scoreMid}) === 6.0`);

// Without confidence (default 5)
const scoreDefault = scoreApproachWithDebate(6, undefined);
ok(scoreDefault >= 4 && scoreDefault <= 10, `default confidence score (${scoreDefault}) in range`);

// selectBestPerspective
ok(typeof selectBestPerspective === 'function', 'selectBestPerspective is a function');

const mockPerspectives = [
  { perspectiveId: 'A', approaches: [{ tone: 'direct', phrase: 'test A' }] },
  { perspectiveId: 'C', approaches: [{ tone: 'direct', phrase: 'test C' }] },
];
const bestForConflict = selectBestPerspective(mockPerspectives, 'conflict_challenge');
ok(bestForConflict.perspectiveId === 'C', 'selectBestPerspective picks C for conflict_challenge (stageStrength=1.0)');

const bestForInitial = selectBestPerspective(mockPerspectives, 'initial_contact');
ok(bestForInitial.perspectiveId === 'A', 'selectBestPerspective picks A for initial_contact (A=0.7 > C=0.6)');

// Exports
ok(debateOrchSrc.includes('generateApproachesWithDebate'), 'exports generateApproachesWithDebate');
ok(debateOrchSrc.includes('scoreApproachWithDebate'), 'exports scoreApproachWithDebate');

// ═══════════════════════════════════════════════════════════════════
// Section 5: Integration with multi-universe-simulation.js
// ═══════════════════════════════════════════════════════════════════
console.log('── Section 5: Integration ──');

ok(multiUniverseSrc.includes("require('./debate-orchestrator')"), 'multi-universe imports from debate-orchestrator');
ok(multiUniverseSrc.includes("require('./debate-psychology')"), 'multi-universe imports from debate-psychology');
ok(multiUniverseSrc.includes('generateApproachesWithDebate'), 'multi-universe calls generateApproachesWithDebate');
ok(multiUniverseSrc.includes('scoreApproachWithDebate'), 'multi-universe calls scoreApproachWithDebate');

// Debate branch
ok(multiUniverseSrc.includes('cfg.debate?.enabled'), 'debate branch gated by cfg.debate?.enabled');
ok(multiUniverseSrc.includes('DEBATE_CONFIG_DEFAULTS'), 'debate config defaults referenced');
ok(multiUniverseSrc.includes('debate: { ...DEBATE_CONFIG_DEFAULTS }'), 'debate config merged into MULTIVERSE_CONFIG_DEFAULTS');

// RC deep-merge
ok(multiUniverseSrc.includes('MULTIVERSE_CONFIG_DEFAULTS.debate') && multiUniverseSrc.includes('rcConfig.debate'),
  'debate config deep-merged from Remote Config');

// Cache schema
ok(/CACHE_SCHEMA_VERSION\s*=\s*12/.test(multiUniverseSrc), 'CACHE_SCHEMA_VERSION = 12');

// Parallel stages
ok(multiUniverseSrc.includes('Promise.allSettled'), 'uses Promise.allSettled for parallel stages');
ok(multiUniverseSrc.includes('cfg.debate?.parallelStages'), 'parallel stages gated by debate config');

// debateMetadata flows through
ok(multiUniverseSrc.includes('debateMetadata'), 'debateMetadata referenced in multi-universe');

// Fallback to single-agent
ok(multiUniverseSrc.includes('generateApproachesForMultiverse'), 'single-agent path preserved as fallback');

// processStage function
ok(multiUniverseSrc.includes('async function processStage'), 'processStage helper extracted');

// Score blending in scoring section
ok(multiUniverseSrc.includes('synthesisConfidence'), 'scoring checks synthesisConfidence');

// stageId parameter passed directly (no regex extraction)
ok(multiUniverseSrc.includes('userContext, isSoloMode && !!userContext, stage.id'),
  'callSituationSimulationInternal receives stage.id directly');
ok(/async function callSituationSimulationInternal\(.*stageId/.test(multiUniverseSrc),
  'callSituationSimulationInternal signature includes stageId parameter');

// ═══════════════════════════════════════════════════════════════════
// Section 6: 4 Simulation Scenarios Coverage
// ═══════════════════════════════════════════════════════════════════
console.log('── Section 6: 4 Simulation Scenarios ──');

// Scenario 1: match+text (neutralFrame=false, userContext present, matchId present)
ok(multiUniverseSrc.includes('isSoloMode && !!userContext'), 'neutralFrame derived from isSoloMode && !!userContext');
ok(debateAgentsSrc.includes("neutralFrame ? TONES_NEUTRAL : TONES_DATING"), 'agents switch tones based on neutralFrame');
ok(debateAgentsSrc.includes('communication coach'), 'agents switch role based on neutralFrame');

// Scenario 2: match-alone (neutralFrame=false, no userContext, matchId present)
// → buildStageContext produces dating stage context, debate uses TONES_DATING
ok(multiUniverseSrc.includes("buildStageContext(stage, userContext, matchChatSummary, isSoloMode, matchProfileSummary"),
  'buildStageContext receives match profile + chat for match mode');

// Scenario 3: solo+text (neutralFrame=true, userContext present, no matchId)
// → buildStageContext produces neutral stage guidance, debate uses TONES_NEUTRAL
ok(multiUniverseSrc.includes("NEUTRAL_STAGE_GUIDANCE"), 'neutral stage guidance exists for solo+text');
ok(debateAgentsSrc.includes("vulnerable"), 'neutral tones include vulnerable (not romantic_vulnerable)');

// Scenario 4: solo-nothing (neutralFrame=false, no userContext, no matchId)
// → buildStageContext uses neutralSituation, debate uses TONES_DATING as fallback
ok(multiUniverseSrc.includes("stage.neutralSituation || stage.situation"), 'solo-nothing uses neutralSituation fallback');

// Debate handles all stages correctly
for (const stageId of STAGE_IDS) {
  ok(STAGE_PERSPECTIVE_PRINCIPLES[stageId] != null, `debate covers stage: ${stageId}`);
  const agentCount = Object.keys(STAGE_PERSPECTIVE_PRINCIPLES[stageId]).length;
  ok(agentCount === 3, `${stageId}: all 3 agents have principles`);
}

// Orchestrator passes neutralFrame through the entire chain
ok(debateOrchSrc.includes('neutralFrame'), 'orchestrator passes neutralFrame');
ok(debateOrchSrc.includes('generatePerspectiveApproaches(genAI, pId, situation, userLang, stageId, neutralFrame'),
  'orchestrator forwards neutralFrame to perspective agents');

// ═══════════════════════════════════════════════════════════════════
// Section 7: Cross-cutting concerns
// ═══════════════════════════════════════════════════════════════════
console.log('── Section 7: Cross-cutting ──');

// All researchers from STAGE_PSYCHOLOGY should appear in at least 1 perspective
const allPrinciples = JSON.stringify(STAGE_PERSPECTIVE_PRINCIPLES);
const knownResearchers = [
  'Bowlby', 'Gottman', 'Yang', 'Brown', 'Perel', 'Knapp',
  'Sternberg', 'Rosenberg', 'Aron', 'Chapman', 'Ambady',
  'Johnson', 'Deci', 'Cialdini', 'Zak', 'Derlega',
  'Ainsworth', 'Mikulincer', 'Reis',
];
for (const r of knownResearchers) {
  ok(allPrinciples.includes(r), `Researcher ${r} appears in STAGE_PERSPECTIVE_PRINCIPLES`);
}

// Each stage has principles from all 3 agents
for (const stageId of STAGE_IDS) {
  const stagePrinciples = STAGE_PERSPECTIVE_PRINCIPLES[stageId];
  ok(Object.keys(stagePrinciples).length === 3, `${stageId}: principles from all 3 agents`);
}

// No agent has stageStrength > 1 or < 0
for (const key of agentIds) {
  const agent = PERSPECTIVE_AGENTS[key];
  const strengths = Object.values(agent.stageStrength);
  ok(Math.max(...strengths) <= 1.0, `${key}: max stageStrength ≤ 1.0`);
  ok(Math.min(...strengths) >= 0, `${key}: min stageStrength ≥ 0`);
  ok(strengths.some(s => s === 1.0), `${key}: has at least one stage with strength 1.0`);
}

// Dependency chain is correct (no circular)
ok(!debatePsychSrc.includes("require('./debate-"), 'debate-psychology has no debate-* imports (leaf node)');
ok(!debateAgentsSrc.includes("require('./debate-orchestrator')"), 'debate-agents does not import orchestrator');
ok(!debateAgentsSrc.includes("require('./debate-synthesizer')"), 'debate-agents does not import synthesizer');
ok(!debateSynthSrc.includes("require('./debate-agents')"), 'debate-synthesizer does not import agents');
ok(!debateSynthSrc.includes("require('./debate-orchestrator')"), 'debate-synthesizer does not import orchestrator');

// ═══════════════════════════════════════════════════════════════════
console.log('── Section 8: salvageTruncatedJson + placeholder filter ──');
// ═══════════════════════════════════════════════════════════════════

const { salvageTruncatedJson } = require('./lib/debate-synthesizer');

// Complete JSON — should pass through
ok(salvageTruncatedJson('{"approaches":[{"tone":"direct","phrase":"Hello"}]}')?.approaches?.length === 1,
  'salvage: complete JSON passes through');

// Truncated mid-object — last complete approach recovered
const truncMid = '{"approaches":[{"id":"1","tone":"direct","phrase":"First phrase here","citedResearch":"Bowlby"},{"id":"2","tone":"playful","phrase":"Second phr';
const salvMid = salvageTruncatedJson(truncMid);
ok(salvMid && salvMid.approaches && salvMid.approaches.length >= 1, 'salvage: mid-string truncation recovers ≥1 approach');

// Truncated after 3 complete approaches
const trunc3 = '{"approaches":[{"id":"1","tone":"direct","phrase":"One one one","citedResearch":"A"},{"id":"2","tone":"playful","phrase":"Two two two","citedResearch":"B"},{"id":"3","tone":"vulnerable","phrase":"Three three three","citedResearch":"C"},{"id":"4","tone":"grounded","phrase":"Four fo';
const salv3 = salvageTruncatedJson(trunc3);
ok(salv3 && salv3.approaches && salv3.approaches.length >= 3, 'salvage: 3 complete + 1 truncated recovers ≥3');

// Completely broken — returns null
ok(salvageTruncatedJson('not json at all') === null, 'salvage: garbage returns null');
ok(salvageTruncatedJson('') === null, 'salvage: empty string returns null');
ok(salvageTruncatedJson(null) === null, 'salvage: null returns null');

// Placeholder filter in source
ok(debateAgentsSrc.includes('specific|mention|insert|add'), 'debate-agents has placeholder filter regex');
ok(debateSynthSrc.includes('specific|mention|insert|add'), 'debate-synthesizer has placeholder filter regex');

// Double language enforcement — langInstr at start AND end
ok(debateAgentsSrc.match(/\$\{langInstr\}/g)?.length >= 2, 'debate-agents has double language enforcement (start + end)');
ok(debateSynthSrc.match(/\$\{langInstr\}/g)?.length >= 2, 'debate-synthesizer has double language enforcement (start + end)');

// citedResearch flows to final response
ok(multiUniverseSrc.includes('app.citedResearch'), 'citedResearch included in final approach mapping');
ok(multiUniverseSrc.includes('app.sourceAgents'), 'sourceAgents included in final approach mapping');

// Situation validation in debate-agents
ok(debateAgentsSrc.includes('situation.trim().length < 10'), 'debate-agents validates minimum situation length');
ok(debateAgentsSrc.includes('substring(0, 1500)'), 'debate-agents truncates long situations');

// perspectiveTimeoutMs increased
ok(debatePsychSrc.includes('perspectiveTimeoutMs: 12000'), 'perspective timeout increased to 12s');

// ═══════════════════════════════════════════════════════════════════
// Section 9: Audit fixes — ko/it lang enforcement, zh langName, throw isolation
// ═══════════════════════════════════════════════════════════════════
console.log('── Section 9: Audit fixes (ko/it/zh/throw-isolation) ──');

const sharedSrc = fs.readFileSync(path.join(__dirname, 'lib/shared.js'), 'utf-8');

// Korean instruction exists and contains Korean characters
ok(sharedSrc.includes("startsWith('ko')"), 'shared.js has Korean (ko) language instruction');
ok(sharedSrc.includes('한국어'), 'Korean instruction contains Korean characters');
ok(sharedSrc.includes('해요체'), 'Korean instruction specifies 해요체 (polite-casual) formality level');
ok(sharedSrc.includes('영어 사용 절대 금지'), 'Korean instruction bans English');

// Italian instruction exists
ok(sharedSrc.includes("startsWith('it')"), 'shared.js has Italian (it) language instruction');
ok(sharedSrc.includes('italiano'), 'Italian instruction references italiano');

// Arabic instruction has cultural framing
ok(sharedSrc.includes('محترماً'), 'Arabic instruction includes respectful (محترماً) cultural note');

// Japanese instruction has cultural framing
ok(sharedSrc.includes('日本文化の文脈'), 'Japanese instruction includes cultural context note');

// zh langName is unambiguous in both debate files
ok(debateAgentsSrc.includes('Simplified Chinese (简体中文)'), 'debate-agents: zh maps to Simplified Chinese (unambiguous)');
ok(debateSynthSrc.includes('Simplified Chinese (简体中文)'), 'debate-synthesizer: zh maps to Simplified Chinese (unambiguous)');

// Korean has langName entry
ok(debateAgentsSrc.includes('Korean (한국어)'), 'debate-agents: ko maps to Korean (한국어)');
ok(debateSynthSrc.includes('Korean (한국어)'), 'debate-synthesizer: ko maps to Korean (한국어)');

// Throw isolation in multi-universe
ok(multiUniverseSrc.includes('Debate threw unexpectedly'), 'multi-universe: debate throw isolated — falls through to single-agent');
ok(/try\s*\{\s*const debateResult/.test(multiUniverseSrc), 'multi-universe: debate call wrapped in try/catch');

// ═══════════════════════════════════════════════════════════════════
// Section 10: Cultural adaptation — localized tones, roleContext, cultural notes
// ═══════════════════════════════════════════════════════════════════
console.log('── Section 10: Cultural adaptation (AR/JA/KO tones + roleContext) ──');

// getLocalizedToneDescriptions function exists
ok(debateAgentsSrc.includes('getLocalizedToneDescriptions'), 'debate-agents has getLocalizedToneDescriptions function');

// Japanese tone overrides
ok(debateAgentsSrc.includes('間接的'), 'JA tone: direct overridden to reference 間接的 (indirect)');
ok(debateAgentsSrc.includes('奥ゆかしさ'), 'JA tone: romantic_vulnerable overridden with 奥ゆかしさ (grace)');

// Korean tone overrides
ok(debateAgentsSrc.includes('존댓말'), 'KO tone: direct overridden with 존댓말 register note');

// Arabic tone overrides
ok(debateAgentsSrc.includes('محترم'), 'AR tone: direct overridden with محترم (dignified) cultural note');
ok(debateAgentsSrc.includes('modesty norms'), 'AR tone: romantic_vulnerable references modesty norms');

// Arabic roleContext override
ok(debateAgentsSrc.includes('relationship guide'), 'AR roleContext: "relationship guide" for Arabic (not "dating coach")');
ok(debateAgentsSrc.includes('cultural and social values'), 'AR roleContext: references cultural and social values');

// neutralFrame removes "romance" from roleContext
ok(debateAgentsSrc.includes('meaningful connection'), 'neutral roleContext: uses "meaningful connection" (not romance)');

// Cultural notes per language
ok(debateAgentsSrc.includes('CULTURAL NOTE'), 'debate-agents injects cultural notes for high-context markets');
ok(debateAgentsSrc.includes('KakaoTalk'), 'KO cultural note: references KakaoTalk commitment signal');
ok(debateAgentsSrc.includes('Tatemae'), 'JA cultural note: references Tatemae/honne');

// Citation fixes
ok(debatePsychSrc.includes('PNAS 2013'), 'Cacioppo citation corrected to PNAS 2013 (not 2016)');
ok(!debatePsychSrc.includes('Cacioppo.*2016'), 'No Cacioppo 2016 citation remaining');
ok(!debatePsychSrc.includes('40% faster'), 'Coyne 40% false precision claim removed');
ok(debatePsychSrc.includes('significantly accelerates'), 'Coyne claim replaced with qualitative language');

// ═══════════════════════════════════════════════════════════════════
// Results
// ═══════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log(`  RESULTS: ${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failures.length > 0) {
  console.log('\n  FAILURES:');
  failures.forEach(f => console.log(`    ✗ ${f}`));
}
console.log('══════════════════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
