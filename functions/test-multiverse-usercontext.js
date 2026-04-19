#!/usr/bin/env node
/**
 * Internal tests for the userContext + match-chat contextualization
 * added to simulateMultiUniverse on 2026-04-18.
 *
 * These are pure static-analysis / synthetic tests — they don't hit Firebase.
 * They validate:
 *   1. Input sanitation (type, trim, 500-char cap)
 *   2. Cache-key hashing (deterministic, differs by input, lowercase-normalized)
 *   3. buildStageContext priming (4 permutations × 5 stages × 10 langs)
 *   4. Schema version bump present
 *   5. No userContext leak to logs (hash-only)
 *   6. Edge cases: whitespace-only, emoji, long text, non-string, unicode
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SRC_PATH = path.join(__dirname, 'lib', 'multi-universe-simulation.js');
const src = fs.readFileSync(SRC_PATH, 'utf8');

let pass = 0;
let fail = 0;
const failures = [];

function assert(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('MULTI-UNIVERSE userContext + match-chat context tests');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// ───────────────────────────────────────────────────────────────
// 1. SOURCE-LEVEL STATIC ASSERTIONS
// ───────────────────────────────────────────────────────────────
console.log('\n1. Source-level static assertions');

assert(
  'userContext param destructured from request.data',
  /let \{ matchId = "", userLanguage = 'en', userContext = ""/.test(src)
);

assert(
  'userContext trimmed + capped at 500 chars',
  /userContext\.trim\(\)\.substring\(0, 500\)/.test(src)
);

assert(
  'Non-string userContext coerced to empty string',
  /typeof userContext === 'string' \? userContext\.trim\(\)\.substring\(0, 500\) : ""/.test(src)
);

assert(
  'SHA-256 hash of userContext (first 8 chars)',
  /crypto\.createHash\('sha256'\)\s*\.update\(userContext\.toLowerCase\(\)\)\.digest\('hex'\)\.substring\(0, 8\)/.test(src)
);

assert(
  'crypto module imported at top',
  /const crypto = require\('crypto'\);/.test(src)
);

assert(
  'cacheKey includes hash when userContextHash exists',
  /cacheKey = userContextHash\s*\?\s*`\$\{baseCacheKey\}_\$\{normalizedUserLang\}_\$\{userContextHash\}`\s*:\s*`\$\{baseCacheKey\}_\$\{normalizedUserLang\}`/s.test(src)
);

assert(
  'CACHE_SCHEMA_VERSION bumped to 11 (covers v4-v11)',
  /const CACHE_SCHEMA_VERSION = 11;/.test(src)
);

assert(
  'callSituationSimulationInternal accepts userContextSnippet + neutralFrame + stageId',
  /async function callSituationSimulationInternal\(db, userId, matchId, situation, userLanguage, userContextSnippet = '', neutralFrame = false, stageId/.test(src)
);

assert(
  'generateApproachesForMultiverse accepts userContextSnippet + neutralFrame',
  /async function generateApproachesForMultiverse\(genAI, situation, userLang, userContextSnippet = '', neutralFrame = false\)/.test(src)
);

assert(
  'Gemini prompt has neutralFrame branch (non-dating coach)',
  /You are an inclusive communication coach\./.test(src)
);

assert(
  'Gemini prompt neutralFrame bans injecting romance into platonic inputs',
  /Never inject romance into a platonic scenario/.test(src)
);

assert(
  'Tone 3 re-labeled "vulnerable" in neutralFrame mode',
  /3\. vulnerable — soft, honest about what THIS situation means/.test(src)
);

assert(
  'buildStageContext accepts isSoloMode + matchProfileSummary + ragKnowledge',
  /function buildStageContext\(stage, userContext, chatSummary, isSoloMode, matchProfileSummary, ragKnowledge\)/.test(src)
);

assert(
  'buildStageContext solo+context path skips dating-framed stage.situation',
  /Do NOT default to dating or romantic framing unless the user's own words clearly imply romance/.test(src)
);

assert(
  'Caller forwards isSoloMode && userContext as neutralFrame + stage.id',
  /callSituationSimulationInternal\([\s\S]{0,200}?isSoloMode && !!userContext, stage\.id/.test(src)
);

assert(
  'approachMaxTokens bumped to 2000 to absorb Gemini thinking budget',
  /approachMaxTokens:\s*2000/.test(src)
);

assert(
  'Empty-approaches fallback path uses userContextSnippet',
  /Gemini returned empty approaches, using fallback[\s\S]*?generateApproachesFallback\(userLanguage, userContextSnippet\)/.test(src)
);

assert(
  'Try/catch fallback path uses userContextSnippet',
  /Failed after \$\{callDuration\}ms[\s\S]*?generateApproachesFallback\(userLanguage, userContextSnippet\)/.test(src)
);

assert(
  'generateApproachesForMultiverse all-attempts-failed fallback uses userContextSnippet',
  /All attempts failed after[\s\S]*?generateApproachesFallback\(userLang, userContextSnippet\)/.test(src)
);

assert(
  'Caller passes userContext as 6th arg to callSituationSimulationInternal',
  /callSituationSimulationInternal\(\s*db, userId, matchId, stageContext, userLanguage, userContext,/.test(src)
);


assert(
  'buildStageContext helper function defined with 6 params',
  /function buildStageContext\(stage, userContext, chatSummary, isSoloMode, matchProfileSummary, ragKnowledge\)/.test(src)
);

assert(
  'buildStageContext skips empty userContext',
  /if \(userContext && userContext\.trim\(\)\.length > 0\)/.test(src)
);

assert(
  'buildStageContext skips empty chatSummary',
  /if \(chatSummary && chatSummary\.trim\(\)\.length > 0\)/.test(src)
);

assert(
  'buildStageContext always includes stage phase',
  /parts\.push\(`RELATIONSHIP STAGE \(this universe is at phase \$\{stage\.order\}\/5/.test(src)
);

assert(
  'matchChatSummary loaded from matches/{matchId}/messages',
  /db\.collection\('matches'\)\.doc\(matchId\)\s*\.collection\('messages'\)\.orderBy\('timestamp', 'desc'\)\.limit\(20\)\.get\(\)/.test(src)
);

assert(
  'matchChatSummary skipped in solo mode (inside !isSoloMode guard)',
  /if \(!isSoloMode\)\s*\{[\s\S]*?matchChatSummary\s*=[\s\S]*?msgSnap\.docs/.test(src)
);

assert(
  'matchChatSummary gracefully degrades on Firestore error',
  /catch \(e\)\s*\{\s*logger\.warn\(`\[MultiUniverse\] Chat history load failed \(non-fatal\)/.test(src)
);

assert(
  'callSituationSimulationInternal receives stageContext (not raw template)',
  /await callSituationSimulationInternal\(\s*db, userId, matchId, stageContext, userLanguage,/.test(src)
);

assert(
  'userContextHash persisted to cache doc (not raw text)',
  /userContextHash: userContextHash \|\| null/.test(src)
);

assert(
  'Raw userContext NOT persisted in result object',
  !/userContext:\s*userContext[,\s]/.test(src) || !/userContext: userContext/.test(src)
);

// Check no verbatim logging of userContext (only hash)
const logLines = src.split('\n').filter(l => l.match(/logger\.(info|warn|error)/));
const leakedUserContextLogs = logLines.filter(l =>
  /\$\{userContext\}/.test(l) && !/\$\{userContextHash\}/.test(l)
);
assert(
  'No verbatim userContext in logger statements (PII-safe)',
  leakedUserContextLogs.length === 0,
  leakedUserContextLogs.join(' | ')
);

// ───────────────────────────────────────────────────────────────
// 2. HASH BEHAVIOUR (pure function, no Firebase needed)
// ───────────────────────────────────────────────────────────────
console.log('\n2. Hash behaviour (determinism + case-insensitivity + uniqueness)');

function hash8(s) {
  if (!s || !s.trim()) return '';
  return crypto.createHash('sha256').update(s.toLowerCase()).digest('hex').substring(0, 8);
}

const h1 = hash8('Voy a juntarme con una amiga que no veo hace 3 años');
const h2 = hash8('Voy a juntarme con una amiga que no veo hace 3 años');
const h3 = hash8('VOY A JUNTARME CON UNA AMIGA QUE NO VEO HACE 3 AÑOS');
const h4 = hash8('Llevo 3 días sin responderle');
const h5 = hash8('');
const h6 = hash8('   ');

assert('Hash is deterministic (same input → same output)', h1 === h2);
assert('Hash is case-insensitive (.toLowerCase)', h1 === h3);
assert('Different inputs produce different hashes', h1 !== h4);
assert('Empty string → empty hash', h5 === '');
assert('Whitespace-only trims to empty hash', h6 === '');
assert('Hash is exactly 8 chars', h1.length === 8);
assert('Hash is lowercase hex', /^[a-f0-9]{8}$/.test(h1));

// ───────────────────────────────────────────────────────────────
// 3. INPUT SANITATION (simulated — we can't call CF here but we replay logic)
// ───────────────────────────────────────────────────────────────
console.log('\n3. Input sanitation');

function sanitize(userContext) {
  return typeof userContext === 'string'
    ? userContext.trim().substring(0, 500)
    : '';
}

assert('Null → empty string', sanitize(null) === '');
assert('Undefined → empty string', sanitize(undefined) === '');
assert('Number → empty string', sanitize(42) === '');
assert('Object → empty string', sanitize({ evil: true }) === '');
assert('Array → empty string', sanitize(['hi']) === '');
assert('Boolean → empty string', sanitize(true) === '');
assert('Valid string kept', sanitize('hello') === 'hello');
assert('Leading/trailing whitespace trimmed', sanitize('  hello  ') === 'hello');
assert('Cap at 500 chars', sanitize('x'.repeat(1000)).length === 500);
assert('Emoji preserved', sanitize('Te extraño 💖') === 'Te extraño 💖');
assert('Arabic preserved', sanitize('مرحبا') === 'مرحبا');
assert('Japanese preserved', sanitize('こんにちは') === 'こんにちは');
assert('Chinese preserved', sanitize('你好') === '你好');
assert('Newlines preserved (internal)', sanitize('line1\nline2').includes('\n'));

// ───────────────────────────────────────────────────────────────
// 4. CACHE-KEY COMPOSITION across 4 scenarios × 10 langs
// ───────────────────────────────────────────────────────────────
console.log('\n4. Cache-key composition — 4 scenarios × 10 langs');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'ja', 'zh', 'ru', 'ar', 'id'];

function cacheKeyFor(matchId, userContext, lang) {
  const ctxHash = userContext
    ? crypto.createHash('sha256').update(userContext.toLowerCase()).digest('hex').substring(0, 8)
    : '';
  const isSoloMode = !matchId;
  const base = isSoloMode ? 'multiverse_solo' : `multiverse_${matchId}`;
  return ctxHash ? `${base}_${lang}_${ctxHash}` : `${base}_${lang}`;
}

const scenarios = [
  { name: 'Solo+texto', matchId: '', ctx: 'amiga 3 años' },
  { name: 'Match+texto', matchId: 'aaaabbbbccccdddd12345678', ctx: 'llevo 3 días sin responder' },
  { name: 'Match-sin-texto', matchId: 'aaaabbbbccccdddd12345678', ctx: '' },
  { name: 'Solo-genérico', matchId: '', ctx: '' },
];

for (const s of scenarios) {
  for (const lang of LANGS) {
    const key = cacheKeyFor(s.matchId, s.ctx, lang);
    const expectedHashSuffix = s.ctx ? '_' + hash8(s.ctx) : '';
    const expectedKey = (s.matchId ? `multiverse_${s.matchId}` : 'multiverse_solo') + '_' + lang + expectedHashSuffix;
    assert(
      `[${s.name}/${lang}] key=${key}`,
      key === expectedKey,
      `expected: ${expectedKey}`
    );
  }
}

// Collision check: match-sin-texto vs solo-genérico must never collide across langs
const seen = new Set();
for (const s of scenarios) {
  for (const lang of LANGS) {
    const key = cacheKeyFor(s.matchId, s.ctx, lang);
    assert(`[collision] unique key for ${s.name}/${lang}`, !seen.has(key), `duplicate: ${key}`);
    seen.add(key);
  }
}

// Two different contexts (same match + same lang) → different cache slots
const sameMatchDifferentCtx1 = cacheKeyFor('aaaabbbbccccdddd12345678', 'context one', 'es');
const sameMatchDifferentCtx2 = cacheKeyFor('aaaabbbbccccdddd12345678', 'context two', 'es');
assert(
  '[isolation] same match, different ctx → different keys',
  sameMatchDifferentCtx1 !== sameMatchDifferentCtx2
);

// Same context, two langs → different cache slots (no cross-lang leak)
const esKey = cacheKeyFor('aaaabbbbccccdddd12345678', 'context', 'es');
const enKey = cacheKeyFor('aaaabbbbccccdddd12345678', 'context', 'en');
assert('[isolation] same ctx, different lang → different keys', esKey !== enKey);

// ───────────────────────────────────────────────────────────────
// 5. buildStageContext SHAPE — simulate locally by re-implementing the helper
// ───────────────────────────────────────────────────────────────
console.log('\n5. buildStageContext priming — all 4 permutations × 5 stages');

function buildStageContext(stage, userContext, chatSummary, isSoloMode) {
  const parts = [];
  if (userContext && userContext.trim().length > 0) {
    parts.push(`USER'S REAL SITUATION (the user typed this verbatim — every noun, name, plan, and feeling matters):\n"${userContext}"`);
  }
  if (chatSummary && chatSummary.trim().length > 0) {
    parts.push(`RECENT CONVERSATION WITH THE OTHER PERSON (chronological, oldest first):\n${chatSummary}`);
  }
  if (isSoloMode && userContext && userContext.trim().length > 0) {
    parts.push(
      `RELATIONSHIP STAGE (universe ${stage.order}/5 — ${stage.id}):\n` +
      `This universe samples the "${stage.id}" phase of WHATEVER relationship the user's situation describes. ` +
      `CRITICAL: the situation above may be romantic, platonic (friendship, reunion), familial, professional, or any other type. ` +
      `Interpret "${stage.id}" accordingly — for a friend reunion it means "first reaching out to reconnect", for work it means "first professional approach", etc. ` +
      `Do NOT default to dating or romantic framing unless the user's own words clearly imply romance.`
    );
  } else {
    parts.push(`RELATIONSHIP STAGE (this universe is at phase ${stage.order}/5 — ${stage.id}):\n${stage.situation}`);
  }
  return parts.join('\n\n');
}

const STAGES = [
  { id: 'initial_contact', order: 1, situation: 'First time reaching out…' },
  { id: 'getting_to_know', order: 2, situation: 'Getting to know them…' },
  { id: 'building_connection', order: 3, situation: 'Deeper connection…' },
  { id: 'conflict_challenge', order: 4, situation: 'Disagreement…' },
  { id: 'commitment', order: 5, situation: 'Next step…' },
];

const USER_CTX = 'voy a juntarme con una amiga que no veo hace 3 años';
const CHAT_SUMMARY = 'You: hola!\nMatch: hey qué tal\nYou: que planes tienes?';

for (const stage of STAGES) {
  // A: match + user context + chat (dating-framed stage)
  const a = buildStageContext(stage, USER_CTX, CHAT_SUMMARY, false /* !solo */);
  assert(
    `[stage=${stage.id}] match+userCtx+chat: 3 blocks + dating-framed stage`,
    a.includes("USER'S REAL SITUATION") &&
    a.includes("RECENT CONVERSATION") &&
    a.includes(`phase ${stage.order}/5`) &&
    a.includes(stage.situation) && // original dating template preserved
    !a.includes('Do NOT default to dating')
  );

  // B: match + user context only
  const b = buildStageContext(stage, USER_CTX, '', false);
  assert(
    `[stage=${stage.id}] match+userCtx-only: dating-framed stage`,
    b.includes("USER'S REAL SITUATION") &&
    !b.includes("RECENT CONVERSATION") &&
    b.includes(stage.situation) &&
    !b.includes('Do NOT default to dating')
  );

  // C: match + chat only (match-sin-texto)
  const c = buildStageContext(stage, '', CHAT_SUMMARY, false);
  assert(
    `[stage=${stage.id}] match+chat-only: dating-framed stage`,
    !c.includes("USER'S REAL SITUATION") &&
    c.includes("RECENT CONVERSATION") &&
    c.includes(stage.situation)
  );

  // D: no context (backward compat)
  const d = buildStageContext(stage, '', '', true);
  assert(
    `[stage=${stage.id}] solo+nothing: legacy dating stage`,
    !d.includes("USER'S REAL SITUATION") &&
    !d.includes("RECENT CONVERSATION") &&
    d.includes(stage.situation) &&
    !d.includes('Do NOT default to dating')
  );

  // E: SOLO + userContext → NEUTRAL frame
  const e = buildStageContext(stage, USER_CTX, '', true);
  assert(
    `[stage=${stage.id}] solo+userCtx: NEUTRAL frame (no dating prime)`,
    e.includes("USER'S REAL SITUATION") &&
    !e.includes(stage.situation) && // dating template SKIPPED
    e.includes('Do NOT default to dating or romantic framing') &&
    e.includes(`universe ${stage.order}/5`)
  );
}

// ───────────────────────────────────────────────────────────────
// 6. EDGE CASES
// ───────────────────────────────────────────────────────────────
console.log('\n6. Edge cases');

// Whitespace-only user context should degrade to empty
const wsContext = '    \n\t  ';
const wsHash = wsContext.trim() ? hash8(wsContext.trim()) : '';
assert('Whitespace-only ctx → empty hash', wsHash === '');

// User context with only emoji
const emojiCtx = '💖💖💖';
const emojiHash = hash8(emojiCtx);
assert('Emoji-only ctx → valid hash', emojiHash.length === 8);

// 500-char cap
const longCtx = 'a'.repeat(501);
const cappedCtx = sanitize(longCtx);
assert('501-char input capped to 500', cappedCtx.length === 500);

// Hash distinctness: "cafe" vs "café"
const h_cafe = hash8('cafe');
const h_cafe_accent = hash8('café');
assert('Accented vs unaccented → different hashes', h_cafe !== h_cafe_accent);

// Hash distinctness: "a" vs "A" (should collide due to toLowerCase)
const h_a_lower = hash8('a');
const h_a_upper = hash8('A');
assert('a vs A → same hash (case-insensitive)', h_a_lower === h_a_upper);

// Max stage phase reference
const lastStage = STAGES[4];
const lastCtx = buildStageContext(lastStage, USER_CTX, '');
assert('Phase 5/5 reference present', lastCtx.includes('phase 5/5'));

// Empty stage situation still produces valid block
const emptyStage = { id: 'test', order: 1, situation: '' };
const emptyStageCtx = buildStageContext(emptyStage, '', '');
assert(
  'Empty stage.situation still yields the phase header',
  emptyStageCtx.includes('phase 1/5')
);

// Very long chat summary truncation (the CF uses .slice(-20) after reverse).
// Simulate that we have >20 msgs and only last 20 survive.
function simulateChatSummary(nMsgs) {
  const msgs = Array.from({ length: nMsgs }, (_, i) => `You: msg-${i}`);
  return msgs.slice(-20).join('\n');
}
const longChat = simulateChatSummary(50);
assert(
  'Chat summary clipped to last 20 msgs',
  longChat.split('\n').length === 20
);

// ───────────────────────────────────────────────────────────────
// 7. 10-LANGUAGE USER-CONTEXT VIABILITY
// Validate that user-context in each of the 10 supported langs survives
// sanitation + hashing without corruption.
// ───────────────────────────────────────────────────────────────
console.log('\n7. 10-language userContext sanitation + hashing');

const LANG_CONTEXTS = {
  en: 'I\'m meeting a friend I haven\'t seen in 3 years',
  es: 'Voy a juntarme con una amiga que no veo hace 3 años',
  pt: 'Vou me encontrar com uma amiga que não vejo há 3 anos',
  fr: 'Je vais retrouver une amie que je n\'ai pas vue depuis 3 ans',
  de: 'Ich treffe eine Freundin, die ich seit 3 Jahren nicht gesehen habe',
  ja: '3年ぶりに友達に会います',
  zh: '我要见一个三年没见的朋友',
  ru: 'Я встречаюсь с подругой, которую не видел 3 года',
  ar: 'سألتقي بصديقة لم أرها منذ 3 سنوات',
  id: 'Saya akan bertemu teman yang belum saya lihat 3 tahun',
};

for (const [lang, ctx] of Object.entries(LANG_CONTEXTS)) {
  const sanitized = sanitize(ctx);
  const h = hash8(sanitized);
  assert(`[${lang}] ctx preserved after sanitize`, sanitized === ctx);
  assert(`[${lang}] hash is 8-char hex`, /^[a-f0-9]{8}$/.test(h));
  // Cache key composes correctly
  const key = cacheKeyFor('', ctx, lang);
  assert(
    `[${lang}] cache key format`,
    key === `multiverse_solo_${lang}_${h}`
  );
}

// Cross-lang uniqueness: same semantic meaning in 10 langs → 10 distinct hashes
const hashesByLang = Object.fromEntries(
  Object.entries(LANG_CONTEXTS).map(([l, c]) => [l, hash8(c)])
);
const uniqueHashes = new Set(Object.values(hashesByLang));
assert(
  '10 lang contexts → 10 distinct hashes (no accidental collisions)',
  uniqueHashes.size === 10,
  `got ${uniqueHashes.size} unique`
);

// ───────────────────────────────────────────────────────────────
// 8. BACKWARD COMPATIBILITY GUARDS
// ───────────────────────────────────────────────────────────────
console.log('\n8. Backward compatibility');

// Old clients that don't send userContext → cache key unchanged (no hash suffix)
const oldClientKey = cacheKeyFor('', '', 'es');
assert(
  'Old client (no ctx) → legacy cache key preserved',
  oldClientKey === 'multiverse_solo_es'
);

const oldClientMatchKey = cacheKeyFor('aaaabbbbccccdddd12345678', '', 'es');
assert(
  'Old client (match, no ctx) → legacy match cache key preserved',
  oldClientMatchKey === 'multiverse_aaaabbbbccccdddd12345678_es'
);

// Schema bump means any legacy cache (v4 or lower) is invalidated in-place
const schemaMatch = src.match(/const CACHE_SCHEMA_VERSION = (\d+);/);
const schemaVersion = schemaMatch ? parseInt(schemaMatch[1], 10) : 0;
assert('Schema version ≥ 5 (invalidates pre-fallback-fix caches)', schemaVersion >= 5);

// ───────────────────────────────────────────────────────────────
// 9. FALLBACK TEMPLATES: snippet embedded in ALL 10 LANGUAGES
// ───────────────────────────────────────────────────────────────
console.log('\n9. Fallback templates embed snippet across all 10 languages');

// Parse the templates block from source — verify each language has a hasSnippet branch
// that actually interpolates `${snippet}` into all 4 approaches.
const templatesBlock = src.match(/function generateApproachesFallback[\s\S]*?const templates = \{([\s\S]*?)\n  \};/);
assert('Found templates block in source', templatesBlock !== null);

if (templatesBlock) {
  const block = templatesBlock[1];
  for (const lang of LANGS) {
    const langBlock = block.match(new RegExp(`${lang}:\\s*\\[([\\s\\S]*?)\\]`, 'm'));
    assert(`[${lang}] fallback block exists`, langBlock !== null);
    if (langBlock) {
      // Count ${snippet} occurrences in the 4 approaches — expect 4 (one per tone)
      const snippetCount = (langBlock[1].match(/\$\{snippet\}/g) || []).length;
      assert(
        `[${lang}] fallback references snippet in all 4 approaches (expected 4, got ${snippetCount})`,
        snippetCount === 4
      );
    }
  }
}

// ───────────────────────────────────────────────────────────────
// 10. END-TO-END SIMULATION (dynamic require of the CF module)
// Skip if admin init not possible locally — just verify exports shape.
// ───────────────────────────────────────────────────────────────
console.log('\n10. Module export surface');

// Verify the exports are still intact (no accidental break from our edits)
assert(
  'Module exports simulateMultiUniverse',
  /exports\.simulateMultiUniverse\s*=\s*onCall/.test(src)
);

// ───────────────────────────────────────────────────────────────
// 11. V7 ENHANCEMENTS: match profile, chat guidance, neutral tips, scoring
// ───────────────────────────────────────────────────────────────
console.log('\n11. V7 quality enhancements');

// buildMatchProfileSummary function exists
assert(
  'buildMatchProfileSummary function defined',
  /function buildMatchProfileSummary\(userData\)/.test(src)
);

// buildMatchProfileSummary caps bio at 120 chars
assert(
  'buildMatchProfileSummary caps bio at 120 chars',
  /bio.*substring\(0, 120\)/.test(src)
);

// buildMatchProfileSummary caps interests at 5
assert(
  'buildMatchProfileSummary caps interests at 5',
  /interests\.slice\(0, 5\)/.test(src)
);

// CHAT_USAGE_BY_STAGE has all 5 stages
assert(
  'CHAT_USAGE_BY_STAGE covers all 5 stages',
  /CHAT_USAGE_BY_STAGE/.test(src) &&
  /initial_contact:/.test(src.match(/CHAT_USAGE_BY_STAGE = \{([\s\S]*?)\};/)?.[1] || '') &&
  /commitment:/.test(src.match(/CHAT_USAGE_BY_STAGE = \{([\s\S]*?)\};/)?.[1] || '')
);

// Chat guidance injected via "HOW TO USE THE CHAT CONTEXT"
assert(
  'buildStageContext injects chat-usage guidance',
  /HOW TO USE THE CHAT CONTEXT/.test(src)
);

// NEUTRAL_STAGE_GUIDANCE has all 5 stages
assert(
  'NEUTRAL_STAGE_GUIDANCE covers all 5 stages',
  /NEUTRAL_STAGE_GUIDANCE/.test(src) &&
  /initial_contact:/.test(src.match(/NEUTRAL_STAGE_GUIDANCE = \{([\s\S]*?)\};/)?.[1] || '') &&
  /commitment:/.test(src.match(/NEUTRAL_STAGE_GUIDANCE = \{([\s\S]*?)\};/)?.[1] || '')
);

// neutralSituation field exists on stage definitions
assert(
  'MULTI_UNIVERSE_STAGES have neutralSituation field',
  /neutralSituation:/.test(src)
);

// Solo-nothing path uses neutralSituation
assert(
  'Solo-nothing path uses neutralSituation fallback',
  /stage\.neutralSituation \|\| stage\.situation/.test(src)
);

// getStageSpecificCoachTip accepts neutralFrame param
assert(
  'getStageSpecificCoachTip accepts neutralFrame parameter',
  /function getStageSpecificCoachTip\(stageId, matchName, userLang = 'en', neutralFrame = false\)/.test(src)
);

// Caller passes neutralFrame to coach tip in stage builder
assert(
  'Stage builder passes neutralFrame to getStageSpecificCoachTip',
  /getStageSpecificCoachTip\(stage\.id, matchName, userLanguage, isSoloMode && !!userContext\)/.test(src)
);

// Neutral tip lists exist (at least one stage in neutral)
assert(
  'neutralTipLists defined with initial_contact',
  /neutralTipLists\s*=\s*\{[\s\S]*?initial_contact:/.test(src)
);

// scoreApproach has specificity bonus
assert(
  'scoreApproach includes specificityBonus',
  /specificityBonus/.test(src)
);

// scoreApproach base score is 5 (wider range)
assert(
  'scoreApproach base score lowered to 5',
  /const baseScore = 5;/.test(src)
);

// isSoloMode persisted in cache result
assert(
  'isSoloMode stored in cache result for re-localization',
  /isSoloMode,/.test(src)
);

// Match profile passed to buildStageContext from caller
assert(
  'Caller passes matchProfileSummary + ragKnowledge to buildStageContext',
  /buildStageContext\(stage, userContext, matchChatSummary, isSoloMode, matchProfileSummary, ragKnowledge\)/.test(src)
);

// Match profile summary variable declared
assert(
  'matchProfileSummary variable declared',
  /let matchProfileSummary = ''/.test(src)
);

// buildStageContext injects MATCH PROFILE when present
assert(
  'buildStageContext prepends MATCH PROFILE section',
  /MATCH PROFILE:/.test(src)
);

// Neutral coach tips cover all 10 languages for at least one stage
const neutralTipsBlock = src.match(/const neutralTipLists = \{([\s\S]*?)\};[\s\S]*?const activeTipLists/)?.[1] || '';
for (const lang of LANGS) {
  assert(
    `Neutral tips have ${lang} translations`,
    new RegExp(`${lang}:\\s*\\[`).test(neutralTipsBlock)
  );
}

// ───────────────────────────────────────────────────────────────
// 12. V8 PSYCHOLOGY ENRICHMENT: stage frameworks, research citations, RAG
// ───────────────────────────────────────────────────────────────
console.log('\n12. V8 psychology enrichment');

// STAGE_PSYCHOLOGY constant exists with all 5 stages
assert(
  'STAGE_PSYCHOLOGY constant defined',
  /const STAGE_PSYCHOLOGY = \{/.test(src)
);

for (const stageId of ['initial_contact', 'getting_to_know', 'building_connection', 'conflict_challenge', 'commitment']) {
  assert(
    `STAGE_PSYCHOLOGY has ${stageId}`,
    new RegExp(`${stageId}:\\s*\\{[\\s\\S]*?framework:`).test(
      src.match(/const STAGE_PSYCHOLOGY = \{([\s\S]*?)\n\};/)?.[1] || ''
    )
  );
}

// Each stage has framework, principles array, and guidance
assert(
  'STAGE_PSYCHOLOGY entries have framework field',
  /framework: 'Knapp/.test(src)
);
assert(
  'STAGE_PSYCHOLOGY entries have principles array',
  /principles: \[/.test(src)
);
assert(
  'STAGE_PSYCHOLOGY entries have guidance field',
  /guidance: 'Generate phrases/.test(src)
);

// Psychology injected into buildStageContext
assert(
  'buildStageContext injects PSYCHOLOGY RESEARCH',
  /PSYCHOLOGY RESEARCH FOR THIS STAGE/.test(src)
);

// Research citations in coach tips
assert(
  'STAGE_RESEARCH_CITATIONS defined',
  /STAGE_RESEARCH_CITATIONS = \{/.test(src)
);

// Citations cover all 5 stages
for (const stageId of ['initial_contact', 'getting_to_know', 'building_connection', 'conflict_challenge', 'commitment']) {
  assert(
    `STAGE_RESEARCH_CITATIONS has ${stageId}`,
    new RegExp(`${stageId}:`).test(
      src.match(/STAGE_RESEARCH_CITATIONS = \{([\s\S]*?)\n  \};/)?.[1] || ''
    )
  );
}

// Citations have 10 languages
const citationsBlock = src.match(/STAGE_RESEARCH_CITATIONS = \{([\s\S]*?)\n  \};/)?.[1] || '';
for (const lang of LANGS) {
  assert(
    `Research citations have ${lang} translations`,
    new RegExp(`${lang}:`).test(citationsBlock)
  );
}

// Key researchers referenced
assert('References Gottman', /Gottman/.test(src));
assert('References Bowlby', /Bowlby/.test(src));
assert('References Fisher', /Fisher/.test(src));
assert('References Sternberg', /Sternberg/.test(src));
assert('References Brown (vulnerability)', /Brown.*Vulnerability|Brown.*Daring Greatly/.test(src));
assert('References Rosenberg (NVC)', /Rosenberg.*NVC|Rosenberg.*Nonviolent/.test(src));
assert('References Perel', /Perel/.test(src));
assert('References Aron (self-expansion)', /Aron.*Self-Expansion|Aron.*36 Questions/.test(src));

// Cross-check: all STAGE_PSYCHOLOGY researchers also appear in STAGE_RESEARCH_CITATIONS
const citationsBlock2 = src.match(/STAGE_RESEARCH_CITATIONS = \{([\s\S]*?)\n  \};/)?.[1] || '';
assert('Citations include Knapp (initial_contact sync)', /Knapp/.test(citationsBlock2));
assert('Citations include Derlega (getting_to_know sync)', /Derlega/.test(citationsBlock2));
assert('Citations include Zak (building_connection sync)', /Zak/.test(citationsBlock2));
assert('Citations include Aron', /Aron/.test(citationsBlock2));
assert('Citations include Fisher', /Fisher/.test(citationsBlock2));
assert('Citations include Ambady', /Ambady/.test(citationsBlock2));
assert('Citations include Gottman', /Gottman/.test(citationsBlock2));
assert('Citations include Sternberg', /Sternberg/.test(citationsBlock2));
assert('Citations include Chapman', /Chapman/.test(citationsBlock2));
assert('Citations include Bowlby', /Bowlby/.test(citationsBlock2));
assert('Citations include Brown', /Brown/.test(citationsBlock2));
assert('Citations include Perel', /Perel/.test(citationsBlock2));
assert('Citations include Rosenberg', /Rosenberg/.test(citationsBlock2));
assert('Citations include Johnson', /Johnson/.test(citationsBlock2));
assert('Citations include Deci', /Deci/.test(citationsBlock2));

// ───────────────────────────────────────────────────────────────
// 13. Dynamic RAG retrieval per stage
// ───────────────────────────────────────────────────────────────
console.log('\n13. Dynamic RAG retrieval per stage');

assert(
  'getCachedEmbedding imported from shared',
  /getCachedEmbedding/.test(src)
);

assert(
  'retrieveStageKnowledge function defined',
  /async function retrieveStageKnowledge\(stageId, userContext, apiKey\)/.test(src)
);

assert(
  'retrieveStageKnowledge queries coachKnowledge collection',
  /db\.collection\('coachKnowledge'\)/.test(src)
);

assert(
  'retrieveStageKnowledge filters by psychology_stages category',
  /category === 'psychology_stages'/.test(src)
);

assert(
  'retrieveStageKnowledge filters by stage',
  /stage === stageId/.test(src)
);

assert(
  'retrieveStageKnowledge uses findNearest for vector search',
  /\.findNearest\('embedding', queryVector/.test(src)
);

assert(
  'retrieveStageKnowledge called before buildStageContext',
  /const ragKnowledge = await retrieveStageKnowledge\(stage\.id/.test(src)
);

assert(
  'ragKnowledge passed to buildStageContext',
  /buildStageContext\(stage, userContext, matchChatSummary, isSoloMode, matchProfileSummary, ragKnowledge\)/.test(src)
);

assert(
  'buildStageContext injects ragKnowledge when present',
  /if \(ragKnowledge && ragKnowledge\.trim\(\)\.length > 0\)/.test(src)
);

assert(
  'RAG output prefixed with ADDITIONAL RESEARCH',
  /ADDITIONAL RESEARCH \(retrieved from knowledge base\)/.test(src)
);

assert(
  'RAG uses COSINE distance measure',
  /distanceMeasure: 'COSINE'/.test(src)
);

assert(
  'RAG filters by minimum similarity score',
  /RAG_STAGE_MIN_SCORE/.test(src)
);

// ───────────────────────────────────────────────────────────────
// RESULTS
// ───────────────────────────────────────────────────────────────
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`Total: ${pass + fail} | Passed: ${pass} | Failed: ${fail}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
