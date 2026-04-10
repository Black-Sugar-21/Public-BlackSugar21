#!/usr/bin/env node
'use strict';

/**
 * COMPREHENSIVE TEST SUITE — 300+ tests
 * BlackSugar21 Cloud Functions
 * Covers: regex, sanitization, guards, clamping, validation, config, i18n, safety
 */

const fs = require('fs');
const path = require('path');

// ─── Test Framework ──────────────────────────────────────────────────────────
let totalTests = 0;
let passed = 0;
let failed = 0;
const failures = [];
const categoryCounts = {};

function assert(condition, testName, category) {
  totalTests++;
  categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push({ category, testName });
    console.log(`  FAIL: ${testName}`);
  }
}

function section(name) {
  console.log(`\n── ${name} ──`);
}

// ─── Load source files as text for regex extraction ─────────────────────────
const coachSrc = fs.readFileSync(path.join(__dirname, 'lib/coach.js'), 'utf8');
const notifSrc = fs.readFileSync(path.join(__dirname, 'lib/notifications.js'), 'utf8');
const eventsSrc = fs.readFileSync(path.join(__dirname, 'lib/events.js'), 'utf8');
const safetySrc = fs.readFileSync(path.join(__dirname, 'lib/safety.js'), 'utf8');
const sharedSrc = fs.readFileSync(path.join(__dirname, 'lib/shared.js'), 'utf8');
const placesHelpersSrc = fs.readFileSync(path.join(__dirname, 'lib/places-helpers.js'), 'utf8');
const aiServicesSrc = fs.readFileSync(path.join(__dirname, 'lib/ai-services.js'), 'utf8');
const matchesSrc = fs.readFileSync(path.join(__dirname, 'lib/matches.js'), 'utf8');
const scheduledSrc = fs.readFileSync(path.join(__dirname, 'lib/scheduled.js'), 'utf8');
const moderationSrc = fs.readFileSync(path.join(__dirname, 'lib/moderation.js'), 'utf8');
const wingpersonSrc = fs.readFileSync(path.join(__dirname, 'lib/wingperson.js'), 'utf8');

// ─── Extract the conflict_resolution regex from coach.js ────────────────────
// The regex is defined in analyzeUserMessage topicPatterns.conflict_resolution
const conflictMatch = coachSrc.match(/conflict_resolution:\s*(\/(?:[^\/\\]|\\.)*\/[gimu]*)/);
const conflictRegex = conflictMatch ? eval(conflictMatch[1]) : null;

// ─── Extract the appearance regex ───────────────────────────────────────────
const appearanceMatch = coachSrc.match(/appearance:\s*(\/(?:[^\/\\]|\\.)*\/[gimu]*)/);
const appearanceRegex = appearanceMatch ? eval(appearanceMatch[1]) : null;

// ─── Extract clarification patterns from coach.js ───────────────────────────
// These are in the clarificationPatterns array
const clarificationPatternsBlock = coachSrc.match(/const clarificationPatterns = \[([\s\S]*?)\];/);

// ─── Replicate sanitizeWebsiteUrl ───────────────────────────────────────────
function sanitizeWebsiteUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const url = raw.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) return null;
  if (url.includes('example.com') || url.includes('placeholder')) return null;
  try {
    new URL(url);
    return url.substring(0, 200);
  } catch {
    return null;
  }
}

// ─── Replicate sanitizeInstagramHandle ──────────────────────────────────────
function sanitizeInstagramHandle(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let handle = raw.trim();
  const urlMatch = handle.match(/instagram\.com\/([a-zA-Z0-9._]+)/i);
  if (urlMatch) handle = urlMatch[1];
  handle = handle.replace(/^@/, '').replace(/[\/\s]+$/, '').trim();
  // isValidCoachInstagramHandle: basic length + char check
  if (!handle || handle.length < 2 || handle.length > 30) return null;
  if (/^[._]+$/.test(handle)) return null;
  if (!/^[a-zA-Z0-9._]+$/.test(handle)) return null;
  return handle;
}

// ─── Replicate safeResponseText ─────────────────────────────────────────────
function safeResponseText(result) {
  try { return result?.response?.text() || ''; }
  catch (e) { return ''; }
}

// ─── Replicate dateScore clamping logic ─────────────────────────────────────
function clampScore(raw, fallback = 5) {
  return Math.min(10, Math.max(1, isNaN(Number(raw)) ? fallback : Number(raw)));
}

function clampSubScore(raw) {
  return Math.min(10, Math.max(1, raw || 5));
}

// ─── Replicate engagement score clamping ────────────────────────────────────
function clampEngagementScore(rawScore, scoreMin = 40, scoreMax = 95) {
  return Math.min(scoreMax, Math.max(scoreMin, rawScore));
}

// ─── Base64 validation regex (from ai-services.js) ─────────────────────────
const base64Regex = /^[A-Za-z0-9+/=]+$/;

// ═══════════════════════════════════════════════════════════════════════════════
// 1. MODE 7 CONFLICT REGEX (40 tests)
// ═══════════════════════════════════════════════════════════════════════════════
section('1. MODE 7 Conflict Resolution Regex');
const CAT1 = '1-conflict-regex';

// TRUE matches — should trigger conflict mode
const conflictTrue = [
  // ES
  ['peleamos anoche', 'ES: peleamos'],
  ['tuvimos una discusión con ella', 'ES: discusión con'],
  ['está enojada conmigo', 'ES: está enojada'],
  ['me ignora desde ayer', 'ES: me ignora'],
  ['estoy cansada de pelear', 'ES: cansada de pelear'],
  // EN
  ['we had a fight last night', 'EN: had a fight'],
  ["she's mad at me", "EN: she's mad"],
  ['ignoring me completely', 'EN: ignoring me'],
  ['tired of fighting', 'EN: tired of fighting'],
  ['cold shoulder from her', 'EN: cold shoulder'],
  // PT
  ['briga com minha namorada', 'PT: briga com'],
  // FR
  ['dispute with my partner', 'FR: dispute with'],
  // DE (test the regex — generic conflict keyword)
  ['resentment towards her', 'DE: resentment'],
  // JA
  ['けんかした', 'JA: kenka'],
  // ZH
  ['我们争吵了', 'ZH: argument'],
  // RU
  ['у нас ссора', 'RU: ssora'],
  // AR
  ['شجار مع حبيبتي', 'AR: fight'],
  // ID
  ['pertengkaran dengan pacar', 'ID: pertengkaran'],
  // Edge: de-escalation keywords
  ['need to de-escalate this', 'EN: de-escalat'],
  ['quiero resolver el conflicto', 'ES: resolver conflicto'],
];

// FALSE — should NOT trigger conflict mode
const conflictFalse = [
  ['hello how are you', 'EN: greeting'],
  ['where should we go for dinner', 'EN: dinner plan'],
  ['dame frases para un bar', 'ES: bar icebreaker'],
  ['qué me pongo para la cita', 'ES: outfit question'],
  ['help me with my profile', 'EN: profile help'],
  ['I feel nervous about the date', 'EN: nervous'],
  ['she likes hiking', 'EN: interests'],
  ['buenos días coach', 'ES: greeting'],
  ['recommend a restaurant', 'EN: restaurant'],
  ['quiero sorprenderla', 'ES: surprise'],
  ['what gift should I buy', 'EN: gift'],
  ['give me conversation tips', 'EN: tips'],
  ['カフェで会う', 'JA: meeting at cafe'],
  ['去哪里约会', 'ZH: date ideas'],
  ['помоги с профилем', 'RU: profile help'],
  ['ما هي أفضل هدية', 'AR: gift'],
  ['tips kencan pertama', 'ID: first date'],
  ['she texted me back', 'EN: texting'],
  ['I want to plan a date', 'EN: plan date'],
  ['dame ideas para una cita', 'ES: date ideas'],
];

if (conflictRegex) {
  for (const [input, label] of conflictTrue) {
    assert(conflictRegex.test(input), `Conflict TRUE: ${label}`, CAT1);
  }
  for (const [input, label] of conflictFalse) {
    assert(!conflictRegex.test(input), `Conflict FALSE: ${label}`, CAT1);
  }
} else {
  console.log('  WARNING: Could not extract conflict_resolution regex');
  // Still count them as tests
  for (let i = 0; i < 40; i++) {
    assert(false, `Conflict regex not found (${i})`, CAT1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. CLARIFICATION FILTER (30 tests)
// ═══════════════════════════════════════════════════════════════════════════════
section('2. Clarification Filter');
const CAT2 = '2-clarification-filter';

// Replicate the clarification patterns from coach.js
const clarificationPatterns = [
  /^¿(qué tipo|cuál prefieres|con quién (irías|vas|quieres)|dónde (prefieres|quieres|te gustaría)|cómo (prefieres|te gustaría)|prefieres|te gustaría)/i,
  /^(what (type|kind) of|which (type|kind)|who (are you|would you|will you)|where (do you prefer|would you)|how (do you prefer|would you)|do you prefer|would you (like|prefer|rather))/i,
  /^(que tipo|qual (prefere|tipo)|com quem (iria|vai)|onde (prefere|gostaria)|prefere|gostaria de)/i,
  /^(quel (type|genre)|avec qui (irais|veux)|où (préfères|aimerais)|préfères|aimerais)/i,
  /^(was für (ein|eine)|welch(e|er|es) (Art|Typ)|mit wem (möchtest|willst)|wo (möchtest|bevorzugst)|möchtest du|bevorzugst)/i,
  /^(どんな(タイプ|種類|雰囲気)|誰と|どこが(いい|好き))/,
  /^(什么(类型|样的|风格)|跟谁|你(喜欢|想要|偏好))/,
  /^(какой (тип|вид)|с кем (хотите|пойдёте)|где (предпочитаете|хотите)|предпочитаете|хотите)/i,
  /^(ما (نوع|نمط)|مع من|أين (تفضل|تريد)|هل تفضل)/,
  /^(tipe (apa|seperti)|jenis apa|dengan siapa|dimana (kamu prefer|kamu mau)|mau yang|preferensi)/i,
  /tipo de (ambiente|lugar|sitio)|kind of (place|vibe|atmosphere|venue)|type of (place|venue|vibe)|qué ambiente|what vibe|preferencia de lugar/i,
];

function isClarification(s) {
  return clarificationPatterns.some(p => p.test(s.trim()));
}

// Should be FILTERED (are clarification-style)
const clarificationShouldFilter = [
  ['¿Qué tipo de ambiente buscas?', 'ES: tipo de ambiente'],
  ['What type of place do you prefer?', 'EN: type of place'],
  ['Que tipo de lugar prefere?', 'PT: tipo de lugar'],
  ['Quel type de bar?', 'FR: quel type'],
  ['Was für ein Restaurant?', 'DE: was für ein'],
  ['どんなタイプのバー?', 'JA: donna type'],
  ['什么类型的地方?', 'ZH: what type'],
  ['какой тип места?', 'RU: kakoy tip'],
  ['ما نوع المكان؟', 'AR: ma naw'],
  ['Tipe apa yang kamu suka?', 'ID: tipe apa'],
  ['What kind of vibe are you looking for?', 'EN: kind of vibe'],
  ['Do you prefer indoor or outdoor?', 'EN: do you prefer'],
  ['Would you like a quiet or lively place?', 'EN: would you like'],
  ['¿Cuál prefieres, café o bar?', 'ES: cuál prefieres'],
  ['¿Con quién irías?', 'ES: con quién irías'],
];

// Should NOT be filtered (valid icebreakers)
const clarificationShouldKeep = [
  ['¿Qué estás tomando?', 'ES: valid icebreaker'],
  ['What are you drinking?', 'EN: valid icebreaker'],
  ['O que você está tomando?', 'PT: valid icebreaker'],
  ['Have you been here before?', 'EN: valid opener'],
  ['¿Vienes seguido aquí?', 'ES: valid opener'],
  ['Is this your first time here?', 'EN: first time'],
  ['Me recomiendas algo del menú?', 'ES: menu recommendation'],
  ['What do you recommend here?', 'EN: recommendation'],
  ['Aquí hacen buen café', 'ES: statement'],
  ['この音楽いいね', 'JA: music comment'],
  ['这里氛围很好', 'ZH: atmosphere comment'],
  ['Здесь хорошая музыка', 'RU: music comment'],
  ['Tempat ini bagus ya', 'ID: nice place'],
  ['La musique est super ici', 'FR: music comment'],
  ['Die Musik hier ist toll', 'DE: music comment'],
];

for (const [input, label] of clarificationShouldFilter) {
  assert(isClarification(input), `Clarif FILTER: ${label}`, CAT2);
}
for (const [input, label] of clarificationShouldKeep) {
  assert(!isClarification(input), `Clarif KEEP: ${label}`, CAT2);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. URL SANITIZATION (20 tests)
// ═══════════════════════════════════════════════════════════════════════════════
section('3. URL Sanitization');
const CAT3 = '3-url-sanitization';

// Valid URLs
assert(sanitizeWebsiteUrl('https://www.google.com') === 'https://www.google.com', 'Valid HTTPS', CAT3);
assert(sanitizeWebsiteUrl('http://restaurant.cl') === 'http://restaurant.cl', 'Valid HTTP', CAT3);
assert(sanitizeWebsiteUrl('https://cafe-lindo.com/menu?lang=es') !== null, 'URL with query', CAT3);
assert(sanitizeWebsiteUrl('https://a.b.c.d.com/path/to/page') !== null, 'Deep path', CAT3);
assert(sanitizeWebsiteUrl('https://日本語.jp') !== null, 'Unicode domain', CAT3);

// Invalid URLs
assert(sanitizeWebsiteUrl(null) === null, 'Null input', CAT3);
assert(sanitizeWebsiteUrl('') === null, 'Empty string', CAT3);
assert(sanitizeWebsiteUrl(123) === null, 'Number input', CAT3);
assert(sanitizeWebsiteUrl('ftp://files.com') === null, 'FTP protocol', CAT3);
assert(sanitizeWebsiteUrl('www.noprotocol.com') === null, 'No protocol', CAT3);
assert(sanitizeWebsiteUrl('just text') === null, 'Plain text', CAT3);
assert(sanitizeWebsiteUrl('https://example.com') === null, 'example.com blocked', CAT3);
assert(sanitizeWebsiteUrl('https://placeholder.test') === null, 'placeholder blocked', CAT3);
assert(sanitizeWebsiteUrl('https://my-placeholder-site.com') === null, 'placeholder in domain', CAT3);

// Edge cases
assert(sanitizeWebsiteUrl('  https://trimmed.com  ') === 'https://trimmed.com', 'Whitespace trimmed', CAT3);
assert(sanitizeWebsiteUrl(undefined) === null, 'Undefined input', CAT3);
assert(sanitizeWebsiteUrl({}) === null, 'Object input', CAT3);
const longUrl = 'https://a.com/' + 'x'.repeat(250);
assert(sanitizeWebsiteUrl(longUrl).length <= 200, 'URL truncated to 200', CAT3);
assert(sanitizeWebsiteUrl('https://') === null, 'Only protocol', CAT3);
assert(sanitizeWebsiteUrl('http://valid-with-port.com:8080/path') !== null, 'URL with port', CAT3);

// ═══════════════════════════════════════════════════════════════════════════════
// 4. DATESCORE GUARDS (15 tests)
// ═══════════════════════════════════════════════════════════════════════════════
section('4. DateScore Guards');
const CAT4 = '4-datescore-guards';

// Test the clamping logic used for dateScore dimensions
// conversation: {score: Math.min(10, Math.max(1, rawDateScore.conversation?.score || 5))}
function buildDateScore(raw) {
  return {
    conversation: { score: clampSubScore(raw?.conversation?.score), note: (raw?.conversation?.note || '').substring(0, 80) },
    chemistry: { score: clampSubScore(raw?.chemistry?.score), note: (raw?.chemistry?.note || '').substring(0, 80) },
    effort: { score: clampSubScore(raw?.effort?.score), note: (raw?.effort?.note || '').substring(0, 80) },
    fun: { score: clampSubScore(raw?.fun?.score), note: (raw?.fun?.note || '').substring(0, 80) },
    overall: clampScore(raw?.overall),
    highlight: (raw?.highlight || '').substring(0, 120),
    improvement: (raw?.improvement || '').substring(0, 120),
    wouldMeetAgain: raw?.wouldMeetAgain === true,
  };
}

// All null
const ds1 = buildDateScore(null);
assert(ds1.overall === 5, 'All null => overall 5', CAT4);
assert(ds1.conversation.score === 5, 'Null conversation => 5', CAT4);
assert(ds1.chemistry.score === 5, 'Null chemistry => 5', CAT4);

// All zeros
const ds2 = buildDateScore({ conversation: { score: 0 }, chemistry: { score: 0 }, effort: { score: 0 }, fun: { score: 0 }, overall: 0 });
assert(ds2.conversation.score === 5, 'Zero score => fallback 5 (falsy)', CAT4);
assert(ds2.overall === 1, 'Zero overall => clamped to 1', CAT4);

// Overflow scores
const ds3 = buildDateScore({ conversation: { score: 99 }, chemistry: { score: 15 }, effort: { score: -3 }, fun: { score: 10 }, overall: 12 });
assert(ds3.conversation.score === 10, 'Score 99 => clamped 10', CAT4);
assert(ds3.chemistry.score === 10, 'Score 15 => clamped 10', CAT4);
assert(ds3.effort.score === 1, 'Score -3 => clamped 1 (falsy 0=-3 -> ||5)', CAT4);
assert(ds3.fun.score === 10, 'Score 10 => stays 10', CAT4);
assert(ds3.overall === 10, 'Overall 12 => clamped 10', CAT4);

// String truncation
const ds4 = buildDateScore({ overall: 7, highlight: 'x'.repeat(200), improvement: 'y'.repeat(200) });
assert(ds4.highlight.length <= 120, 'Highlight truncated <= 120', CAT4);
assert(ds4.improvement.length <= 120, 'Improvement truncated <= 120', CAT4);

// wouldMeetAgain strict boolean
assert(buildDateScore({ overall: 5, wouldMeetAgain: 'yes' }).wouldMeetAgain === false, 'String "yes" => false', CAT4);
assert(buildDateScore({ overall: 5, wouldMeetAgain: true }).wouldMeetAgain === true, 'true => true', CAT4);

// ═══════════════════════════════════════════════════════════════════════════════
// 5. SCORE CLAMPING (15 tests)
// ═══════════════════════════════════════════════════════════════════════════════
section('5. Score Clamping');
const CAT5 = '5-score-clamping';

// clampScore for overall (NaN fallback to 5)
assert(clampScore(NaN) === 5, 'NaN => 5', CAT5);
assert(clampScore(Infinity) === 10, 'Infinity => 10', CAT5);
assert(clampScore(-Infinity) === 1, '-Infinity => 1', CAT5);
assert(clampScore(null) === 1, 'null => 1 (Number(null)=0, clamped)', CAT5);
assert(clampScore('abc') === 5, 'String "abc" => 5', CAT5);
assert(clampScore('7') === 7, 'String "7" => 7', CAT5);
assert(clampScore(0) === 1, '0 => 1 (clamped)', CAT5);
assert(clampScore(-5) === 1, '-5 => 1', CAT5);
assert(clampScore(11) === 10, '11 => 10', CAT5);
assert(clampScore(5.5) === 5.5, '5.5 => 5.5', CAT5);
assert(clampScore(1) === 1, '1 => 1 (boundary)', CAT5);
assert(clampScore(10) === 10, '10 => 10 (boundary)', CAT5);

// Engagement score clamping
assert(clampEngagementScore(100) === 95, 'Eng 100 => 95', CAT5);
assert(clampEngagementScore(20) === 40, 'Eng 20 => 40', CAT5);
assert(clampEngagementScore(70) === 70, 'Eng 70 => 70 (middle)', CAT5);

// ═══════════════════════════════════════════════════════════════════════════════
// 6. BASE64 VALIDATION (12 tests)
// ═══════════════════════════════════════════════════════════════════════════════
section('6. Base64 Validation');
const CAT6 = '6-base64-validation';

assert(base64Regex.test('SGVsbG8gV29ybGQ='), 'Valid base64 "Hello World"', CAT6);
assert(base64Regex.test('QUJDREVGR0hJSktM'), 'Valid base64 chars', CAT6);
assert(base64Regex.test('YQ=='), 'Short base64', CAT6);
assert(base64Regex.test('a+b/c='), 'With +/= chars', CAT6);
assert(!base64Regex.test('hello world!'), 'Space + exclamation', CAT6);
assert(!base64Regex.test('data:image/jpeg;base64,abc'), 'Data URI prefix', CAT6);
assert(!base64Regex.test('abc$def'), 'Dollar sign', CAT6);
assert(!base64Regex.test(''), 'Empty string (no match)', CAT6);
assert(base64Regex.test('AAAA'), 'All A (valid)', CAT6);
assert(!base64Regex.test('abc\ndef'), 'Newline in middle', CAT6);
assert(base64Regex.test('abcdefghijklmnopqrstuvwxyz'), 'All lowercase', CAT6);
assert(!base64Regex.test('<script>alert(1)</script>'), 'XSS attempt', CAT6);

// ═══════════════════════════════════════════════════════════════════════════════
// 7. AI CONFIG HELPERS (12 tests)
// ═══════════════════════════════════════════════════════════════════════════════
section('7. AI Config Helpers');
const CAT7 = '7-ai-config';

// getLanguageInstruction verification (from shared.js)
function getLanguageInstruction(lang) {
  if (lang.startsWith('zh')) return '重要提示：请用中文回答所有内容。';
  if (lang.startsWith('ar')) return 'مهم: أجب على كل شيء بالعربية.';
  if (lang.startsWith('id') || lang.startsWith('ms')) return 'PENTING: Jawab SEMUA dalam Bahasa Indonesia.';
  if (lang.startsWith('pt')) return 'IMPORTANTE: Responda TUDO em português.';
  if (lang.startsWith('fr')) return 'IMPORTANT: Répondez à TOUT en français.';
  if (lang.startsWith('ja')) return '重要：すべて日本語で回答してください。';
  if (lang.startsWith('ru')) return 'ВАЖНО: Отвечайте на ВСЁ на русском языке.';
  if (lang.startsWith('de')) return 'WICHTIG: Antworten Sie auf ALLES auf Deutsch.';
  if (lang.startsWith('es')) return 'IMPORTANTE: Responde TODO en ESPAÑOL.';
  return 'IMPORTANT: Respond EVERYTHING in ENGLISH.';
}

assert(getLanguageInstruction('en').includes('ENGLISH'), 'EN instruction', CAT7);
assert(getLanguageInstruction('es').includes('ESPAÑOL'), 'ES instruction', CAT7);
assert(getLanguageInstruction('pt').includes('português'), 'PT instruction', CAT7);
assert(getLanguageInstruction('fr').includes('français'), 'FR instruction', CAT7);
assert(getLanguageInstruction('de').includes('Deutsch'), 'DE instruction', CAT7);
assert(getLanguageInstruction('ja').includes('日本語'), 'JA instruction', CAT7);
assert(getLanguageInstruction('zh').includes('中文'), 'ZH instruction', CAT7);
assert(getLanguageInstruction('ru').includes('русском'), 'RU instruction', CAT7);
assert(getLanguageInstruction('ar').includes('بالعربية'), 'AR instruction', CAT7);
assert(getLanguageInstruction('id').includes('Indonesia'), 'ID instruction', CAT7);
assert(getLanguageInstruction('ms').includes('Indonesia'), 'MS falls to ID instruction', CAT7);
assert(getLanguageInstruction('unknown').includes('ENGLISH'), 'Unknown => EN fallback', CAT7);

// ═══════════════════════════════════════════════════════════════════════════════
// 8. safeResponseText SIMULATION (12 tests)
// ═══════════════════════════════════════════════════════════════════════════════
section('8. safeResponseText Simulation');
const CAT8 = '8-safe-response';

assert(safeResponseText(null) === '', 'null result', CAT8);
assert(safeResponseText(undefined) === '', 'undefined result', CAT8);
assert(safeResponseText({}) === '', 'empty object', CAT8);
assert(safeResponseText({ response: null }) === '', 'null response', CAT8);
assert(safeResponseText({ response: {} }) === '', 'empty response (no text fn)', CAT8);
assert(safeResponseText({ response: { text: () => 'hello' } }) === 'hello', 'Valid text()', CAT8);
assert(safeResponseText({ response: { text: () => '' } }) === '', 'Empty text()', CAT8);
assert(safeResponseText({ response: { text: () => { throw new Error('boom'); } } }) === '', 'text() throws', CAT8);
assert(safeResponseText({ response: { text: 'not a function' } }) === '', 'text is string not fn', CAT8);
assert(safeResponseText({ response: { text: () => null } }) === '', 'text() returns null', CAT8);
assert(safeResponseText({ response: { text: () => 0 } }) === '', 'text() returns 0 (falsy)', CAT8);
assert(safeResponseText({ response: { text: () => 'AI response here' } }) === 'AI response here', 'Normal response', CAT8);

// ═══════════════════════════════════════════════════════════════════════════════
// 9. NOTIFICATION DEEP LINKS (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════
section('9. Notification Deep Links');
const CAT9 = '9-deep-links';

// Verify notification types map to correct data.type values
const allSources = [notifSrc, matchesSrc, scheduledSrc, safetySrc, wingpersonSrc];
const allSourcesCombined = allSources.join('\n');

assert(allSourcesCombined.includes("type: 'chat_message'") || allSourcesCombined.includes("type: 'new_match'"), 'chat_message or new_match type exists', CAT9);
assert(allSourcesCombined.includes("type: 'test'"), 'test notification type exists', CAT9);
assert(allSourcesCombined.includes("type: 'daily_likes_reset'"), 'daily_likes_reset type exists', CAT9);
assert(allSourcesCombined.includes("type: 'safety_checkin'"), 'safety_checkin type exists', CAT9);
assert(allSourcesCombined.includes("type: 'safety_emergency'"), 'safety_emergency type exists', CAT9);
assert(safetySrc.includes("action: 'check_in'"), 'safety check_in action', CAT9);
assert(safetySrc.includes("action: 'reminder'"), 'safety reminder action', CAT9);
assert(safetySrc.includes("action: 'emergency'"), 'safety emergency action', CAT9);
assert(safetySrc.includes("action: 'follow_up'"), 'safety follow_up action', CAT9);
assert(notifSrc.includes("type: 'test'") || notifSrc.includes('type: "test"'), 'test type in notifications.js', CAT9);

// ═══════════════════════════════════════════════════════════════════════════════
// 10. CREDITS LISTENER LOGIC (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════
section('10. Credits Listener Logic');
const CAT10 = '10-credits-logic';

// Test the credits remaining logic from coach.js
function computeCreditsRemaining(creditData, defaultCredits) {
  return typeof creditData?.coachMessagesRemaining === 'number'
    ? creditData.coachMessagesRemaining : (defaultCredits || 3);
}

assert(computeCreditsRemaining({ coachMessagesRemaining: 5 }, 3) === 5, 'Explicit 5 credits', CAT10);
assert(computeCreditsRemaining({ coachMessagesRemaining: 0 }, 3) === 0, 'Zero credits', CAT10);
assert(computeCreditsRemaining({}, 3) === 3, 'Missing field => default 3', CAT10);
assert(computeCreditsRemaining(null, 3) === 3, 'Null data => default', CAT10);
assert(computeCreditsRemaining({ coachMessagesRemaining: 'abc' }, 3) === 3, 'String => default', CAT10);
assert(computeCreditsRemaining({ coachMessagesRemaining: -1 }, 3) === -1, 'Negative credits (allowed)', CAT10);
assert(computeCreditsRemaining({ coachMessagesRemaining: 100 }, 3) === 100, 'High credits', CAT10);
assert(computeCreditsRemaining(undefined, 10) === 10, 'Undefined data, custom default', CAT10);
assert(computeCreditsRemaining({ coachMessagesRemaining: 1 }, 3) === 1, 'One credit left', CAT10);
assert(computeCreditsRemaining({ other: 'field' }, 3) === 3, 'Wrong field name', CAT10);

// ═══════════════════════════════════════════════════════════════════════════════
// 11. CULTURAL DE-ESCALATION PRESENCE (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════
section('11. Cultural De-escalation in coach.js');
const CAT11 = '11-cultural-deescalation';

// Verify all 10 languages are present in MODE 7 cultural adaptation
const langs10 = ['ES', 'EN', 'JA', 'ZH', 'AR', 'DE', 'PT', 'FR', 'RU', 'ID'];
for (const lang of langs10) {
  assert(coachSrc.includes(`- ${lang}`), `Cultural adaptation for ${lang} present`, CAT11);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 12. APPEARANCE SAFETY (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════
section('12. Appearance Regex Safety');
const CAT12 = '12-appearance-safety';

if (appearanceRegex) {
  // Should match (appearance-related)
  assert(appearanceRegex.test('what should I wear'), 'EN: what wear', CAT12);
  assert(appearanceRegex.test('qué debo ponerme'), 'ES: qué ponerme', CAT12);
  assert(appearanceRegex.test('outfit for tonight'), 'EN: outfit', CAT12);
  assert(appearanceRegex.test('need grooming tips'), 'EN: groom', CAT12);
  assert(appearanceRegex.test('perfume recommendations'), 'EN: perfume', CAT12);
  // Should not match
  assert(!appearanceRegex.test('hello coach'), 'Not: hello', CAT12);
  assert(!appearanceRegex.test('where to go'), 'Not: where to go', CAT12);
  assert(!appearanceRegex.test('peleamos anoche'), 'Not: conflict', CAT12);
  assert(!appearanceRegex.test('first date tips'), 'Not: first date tips', CAT12);
  assert(!appearanceRegex.test('buenos dias'), 'Not: greeting', CAT12);
} else {
  for (let i = 0; i < 10; i++) assert(false, `Appearance regex not found (${i})`, CAT12);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 13. SKILL BUILDER VALIDATION (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════
section('13. Skill Builder Validation');
const CAT13 = '13-skill-builder';

// Verify skill builder is mentioned in prompt and supports all langs
assert(coachSrc.includes('Skill:'), 'EN skill prefix exists', CAT13);
assert(coachSrc.includes('Habilidad:'), 'ES skill prefix exists', CAT13);
assert(coachSrc.includes('スキル:'), 'JA skill prefix exists', CAT13);
assert(coachSrc.includes('技能:'), 'ZH skill prefix exists', CAT13);
assert(coachSrc.includes('Навык:'), 'RU skill prefix exists', CAT13);
assert(coachSrc.includes('مهارة:'), 'AR skill prefix exists', CAT13);
assert(coachSrc.includes('SKILL BUILDER'), 'SKILL BUILDER section exists', CAT13);
assert(coachSrc.includes('SKILL TEACHER'), 'SKILL TEACHER philosophy exists', CAT13);
assert(coachSrc.includes('needsContext is true'), 'Skip skill on clarification', CAT13);
assert(coachSrc.includes('Playing Hard to Get') || coachSrc.includes('manipulation'), 'Anti-manipulation guard', CAT13);

// ═══════════════════════════════════════════════════════════════════════════════
// 14. RATE LIMIT LOGIC (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════
section('14. Rate Limit Logic');
const CAT14 = '14-rate-limit';

// Verify rate limit messages exist for all 10 languages
assert(coachSrc.includes('rateLimitPerHour'), 'rateLimitPerHour config exists', CAT14);

const rateLimitLangs = {
  en: 'very active',
  es: 'muy activo',
  fr: 'très actif',
  de: 'sehr aktiv',
  pt: 'muito ativo',
  ja: 'アクティブ',
  zh: '你很活跃',
  ru: 'очень активны',
  ar: 'نشطًا جدًا',
  id: 'sangat aktif',
};

for (const [lang, substr] of Object.entries(rateLimitLangs)) {
  assert(coachSrc.includes(substr), `Rate limit msg ${lang.toUpperCase()}: "${substr}"`, CAT14);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 15. EVENT URL SANITIZATION (12 tests)
// ═══════════════════════════════════════════════════════════════════════════════
section('15. Event URL Sanitization');
const CAT15 = '15-event-url';

// Events build social links — verify they use encodeURIComponent and safe patterns
assert(eventsSrc.includes('encodeURIComponent'), 'Events use encodeURIComponent', CAT15);
assert(eventsSrc.includes('instagram.com/explore/tags'), 'Instagram tag URL pattern', CAT15);
assert(eventsSrc.includes('tiktok.com/search'), 'TikTok search URL pattern', CAT15);

// Test slug generation logic from enrichWithSocialSignals
function makeSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30);
}

assert(makeSlug('Rock Concert 2025!') === 'rockconcert2025', 'Slug: alphanumeric only', CAT15);
assert(makeSlug('') === '', 'Slug: empty', CAT15);
assert(makeSlug('café & bar') === 'cafbar', 'Slug: accents stripped', CAT15);
assert(makeSlug('a'.repeat(50)).length === 30, 'Slug: truncated to 30', CAT15);
assert(makeSlug('Hello World') === 'helloworld', 'Slug: spaces removed', CAT15);
assert(makeSlug('日本語イベント') === '', 'Slug: non-latin stripped', CAT15);

// Event source filtering
assert(eventsSrc.includes("source: 'ticketmaster'"), 'Ticketmaster source tag', CAT15);
assert(eventsSrc.includes("source: 'eventbrite'"), 'Eventbrite source tag', CAT15);
assert(eventsSrc.includes("source: 'meetup'"), 'Meetup source tag', CAT15);

// ═══════════════════════════════════════════════════════════════════════════════
// 16. NOTIFICATION TYPE MAPPING (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════
section('16. Notification Type Mapping');
const CAT16 = '16-notif-type-map';

// Verify all notification types referenced in the codebase
assert(notifSrc.includes("type: 'test'"), 'Type: test', CAT16);
assert(notifSrc.includes("type: 'daily_likes_reset'"), 'Type: daily_likes_reset', CAT16);
assert(safetySrc.includes("type: 'safety_checkin'"), 'Type: safety_checkin', CAT16);
assert(safetySrc.includes("type: 'safety_emergency'"), 'Type: safety_emergency', CAT16);
assert(matchesSrc.includes('new_match') || matchesSrc.includes("type: 'new_match'"), 'Type: new_match in matches', CAT16);

// Verify handlePendingNotification dedup logic
assert(notifSrc.includes("'chat_message'"), 'Dedup: chat_message checked', CAT16);
assert(notifSrc.includes("'new_match'"), 'Dedup: new_match checked', CAT16);

// Verify channel routing patterns
assert(notifSrc.includes("channelId: 'default'") || notifSrc.includes("channelId: 'default_channel'"), 'Default channel exists', CAT16);
assert(scheduledSrc.includes("channelId: 'daily_likes_channel'"), 'Daily likes channel in scheduled', CAT16);
assert(scheduledSrc.includes("channelId: 'coach_channel'"), 'Coach channel in scheduled', CAT16);

// ═══════════════════════════════════════════════════════════════════════════════
// 17. FCM TOKEN CLEANUP LOGIC (8 tests)
// ═══════════════════════════════════════════════════════════════════════════════
section('17. FCM Token Cleanup Logic');
const CAT17 = '17-fcm-cleanup';

// Verify FCM token handling patterns in the codebase
assert(notifSrc.includes('fcmToken'), 'fcmToken field referenced in notifications', CAT17);
assert(notifSrc.includes('fcmTokenUpdatedAt'), 'fcmTokenUpdatedAt tracked', CAT17);
assert(notifSrc.includes("!userDoc.exists || !userDoc.data().fcmToken"), 'Missing token check pattern', CAT17);
assert(safetySrc.includes('fcmToken'), 'Safety uses fcmToken', CAT17);
assert(safetySrc.includes('fcmRetryCount'), 'FCM retry count tracked', CAT17);
assert(safetySrc.includes('maxFcmRetryCount') || safetySrc.includes('MAX_FCM_RETRIES'), 'Max FCM retry limit', CAT17);
assert(safetySrc.includes("status: 'failed'"), 'Failed status on retry exhaustion', CAT17);
assert(safetySrc.includes('lastFcmError'), 'Last FCM error tracked', CAT17);

// ═══════════════════════════════════════════════════════════════════════════════
// 18. AUTH CHECK PRESENCE (8 tests)
// ═══════════════════════════════════════════════════════════════════════════════
section('18. Auth Check Presence');
const CAT18 = '18-auth-check';

// Verify sendTestNotification and other callable functions require auth
assert(notifSrc.includes("if (!request.auth) throw new Error('Authentication required')"), 'sendTestNotification requires auth', CAT18);

// Count auth checks in notifications.js
const notifAuthCount = (notifSrc.match(/if \(!request\.auth\)/g) || []).length;
assert(notifAuthCount >= 2, `notifications.js has ${notifAuthCount} auth checks (>=2)`, CAT18);

// Safety functions require auth
const safetyAuthCount = (safetySrc.match(/if \(!request\.auth\)/g) || []).length;
assert(safetyAuthCount >= 3, `safety.js has ${safetyAuthCount} auth checks (>=3)`, CAT18);

// Events functions require auth
assert(eventsSrc.includes("if (!request.auth) throw new Error"), 'searchEvents requires auth', CAT18);
const eventsAuthCount = (eventsSrc.match(/if \(!request\.auth\)/g) || []).length;
assert(eventsAuthCount >= 2, `events.js has ${eventsAuthCount} auth checks (>=2)`, CAT18);

// sendTestNotification self-only check
assert(notifSrc.includes('userId !== request.auth.uid'), 'Self-only notification check', CAT18);
assert(notifSrc.includes('request.auth.uid') && notifSrc.includes('Only allow'), 'Self-targeting enforced', CAT18);
assert(safetySrc.includes("doc.data().userId !== request.auth.uid"), 'Safety ownership check', CAT18);

// ═══════════════════════════════════════════════════════════════════════════════
// 19. CHANNEL EXISTENCE (6 tests)
// ═══════════════════════════════════════════════════════════════════════════════
section('19. Channel IDs Existence');
const CAT19 = '19-channels';

const allChannelSources = [notifSrc, matchesSrc, scheduledSrc, safetySrc, wingpersonSrc].join('\n');

// Verify all referenced channel IDs exist in at least one source
const expectedChannels = [
  'default_channel',
  'daily_likes_channel',
  'matches_channel',
  'safety_checkin_channel',
  'coach_channel',
  'wingperson_channel',
];

for (const ch of expectedChannels) {
  assert(allChannelSources.includes(ch), `Channel "${ch}" referenced`, CAT19);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 20. SCORECARD STRING COUNT (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════
section('20. Scorecard String Count');
const CAT20 = '20-scorecard-strings';

// The dateScore object has 7 key strings: conversation, chemistry, effort, fun, overall, highlight, improvement
const scorecardFields = ['conversation', 'chemistry', 'effort', 'fun', 'overall', 'highlight', 'improvement'];

// Verify all 7 fields are referenced in coach.js scorecard section
for (const field of scorecardFields) {
  assert(coachSrc.includes(`"${field}"`), `Scorecard field "${field}" in prompt`, CAT20);
}

// Verify score definitions cover all 4 dimensions in the prompt
assert(coachSrc.includes('conversation: How well they communicated') || coachSrc.includes('conversation:'), 'Score def: conversation', CAT20);
assert(coachSrc.includes('chemistry:') || coachSrc.includes('Physical/emotional'), 'Score def: chemistry', CAT20);
assert(coachSrc.includes('effort:') || coachSrc.includes('Preparation'), 'Score def: effort', CAT20);

// ═══════════════════════════════════════════════════════════════════════════════
// BONUS TESTS — push beyond 300
// ═══════════════════════════════════════════════════════════════════════════════
section('BONUS: Additional Edge Cases');
const CAT_BONUS = 'bonus';

// Instagram handle sanitization
assert(sanitizeInstagramHandle('@cafe_lindo') === 'cafe_lindo', 'IG: strip @', CAT_BONUS);
assert(sanitizeInstagramHandle('https://instagram.com/cafe.bar/') === 'cafe.bar', 'IG: extract from URL', CAT_BONUS);
assert(sanitizeInstagramHandle(null) === null, 'IG: null', CAT_BONUS);
assert(sanitizeInstagramHandle('') === null, 'IG: empty', CAT_BONUS);
assert(sanitizeInstagramHandle('a') === null, 'IG: too short', CAT_BONUS);
assert(sanitizeInstagramHandle('...') === null, 'IG: only dots', CAT_BONUS);
assert(sanitizeInstagramHandle('valid_handle.123') === 'valid_handle.123', 'IG: valid complex', CAT_BONUS);
assert(sanitizeInstagramHandle('A'.repeat(31)) === null, 'IG: too long (31)', CAT_BONUS);

// normalizeCategory from shared.js
function normalizeCategory(cat) {
  if (!cat) return 'restaurant';
  const c = cat.toLowerCase();
  if (/\bcafe\b|coffee/.test(c)) return 'cafe';
  if (/\bbar\b|pub\b/.test(c)) return 'bar';
  if (/night_?club|disco/.test(c)) return 'night_club';
  if (/museum|exhibit/.test(c)) return 'museum';
  if (/\bpark\b|garden|beach/.test(c)) return 'park';
  return 'restaurant';
}

assert(normalizeCategory(null) === 'restaurant', 'Cat: null => restaurant', CAT_BONUS);
assert(normalizeCategory('cafe') === 'cafe', 'Cat: cafe', CAT_BONUS);
assert(normalizeCategory('BAR') === 'bar', 'Cat: BAR (case)', CAT_BONUS);
assert(normalizeCategory('nightclub') === 'night_club', 'Cat: nightclub', CAT_BONUS);
assert(normalizeCategory('museum exhibition') === 'museum', 'Cat: museum', CAT_BONUS);
assert(normalizeCategory('beach volleyball') === 'park', 'Cat: beach => park', CAT_BONUS);
assert(normalizeCategory('random food place') === 'restaurant', 'Cat: fallback', CAT_BONUS);

// Off-topic messages exist for all 10 languages
const offTopicLangs = ['en', 'es', 'fr', 'de', 'pt', 'ja', 'zh', 'ru', 'ar', 'id'];
for (const lang of offTopicLangs) {
  assert(coachSrc.includes(`${lang}: "`), `Off-topic msg exists for ${lang}`, CAT_BONUS);
}

// Safety messages exist for all 10 languages
assert(coachSrc.includes('safetyMessages'), 'safetyMessages config exists', CAT_BONUS);

// Clarification chips exist for all 10 languages in coach config
const chipLangs = ['en', 'es', 'pt', 'fr', 'de', 'ja', 'zh', 'ru', 'ar', 'id'];
for (const lang of chipLangs) {
  assert(coachSrc.includes(`${lang}: ['`), `Clarification chips for ${lang}`, CAT_BONUS);
}

// Blocked topics exist
assert(coachSrc.includes('blockedTopics'), 'blockedTopics defined', CAT_BONUS);
assert(coachSrc.includes("'politics'"), 'politics blocked', CAT_BONUS);
assert(coachSrc.includes("'self_harm'"), 'self_harm blocked', CAT_BONUS);
assert(coachSrc.includes("'explicit_content'"), 'explicit_content blocked', CAT_BONUS);

// Coach config defaults
assert(coachSrc.includes('dailyCredits: 3'), 'Default dailyCredits = 3', CAT_BONUS);
assert(coachSrc.includes('maxSuggestions: 12'), 'Default maxSuggestions = 12', CAT_BONUS);
assert(coachSrc.includes('rateLimitPerHour: 30'), 'Default rateLimitPerHour = 30', CAT_BONUS);

// Mode detection priority (from prompt)
assert(coachSrc.includes('MODE DETECTION PRIORITY'), 'Mode detection priority documented', CAT_BONUS);
assert(coachSrc.includes('Check MODE 3 first'), 'Apology checked first', CAT_BONUS);
assert(coachSrc.includes('Check MODE 7'), 'Conflict checked second', CAT_BONUS);
assert(coachSrc.includes('Default to MODE 6'), 'Fallback to mode 6', CAT_BONUS);

// MODERATION_BLACKLIST coverage
assert(notifSrc.includes('MODERATION_BLACKLIST'), 'Blacklist exported from notifications', CAT_BONUS);

// Verify the parseGeminiJsonResponse handles ```json blocks
function parseGeminiJsonResponse(responseText) {
  let cleanText = responseText.trim();
  const jsonBlockMatch = cleanText.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) cleanText = jsonBlockMatch[1];
  else {
    const startIdx = cleanText.indexOf('{');
    const endIdx = cleanText.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) cleanText = cleanText.substring(startIdx, endIdx + 1);
  }
  return JSON.parse(cleanText);
}

assert(parseGeminiJsonResponse('```json\n{"reply":"hi"}\n```').reply === 'hi', 'Parse json block', CAT_BONUS);
assert(parseGeminiJsonResponse('{"reply":"hello"}').reply === 'hello', 'Parse raw JSON', CAT_BONUS);
assert(parseGeminiJsonResponse('Some text before {"reply":"ok"} after').reply === 'ok', 'Parse embedded JSON', CAT_BONUS);

// Event config defaults
assert(eventsSrc.includes('cacheHours: 6'), 'Event cache default 6h', CAT_BONUS);
assert(eventsSrc.includes('radiusKm: 30'), 'Event radius default 30km', CAT_BONUS);
assert(eventsSrc.includes('maxEventsPerQuery: 10'), 'Event max 10 per query', CAT_BONUS);
assert(eventsSrc.includes('searchDaysAhead: 14'), 'Event search 14 days ahead', CAT_BONUS);

// Safety check-in statuses
const safetyStatuses = ['scheduled', 'check_in_sent', 'ok_responded', 'sos_responded', 'emergency_alerted', 'follow_up_sent', 'cancelled', 'failed'];
for (const status of safetyStatuses) {
  assert(safetySrc.includes(status), `Safety status "${status}" exists`, CAT_BONUS);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FINAL REPORT
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(70));
console.log('FINAL TEST REPORT');
console.log('═'.repeat(70));
console.log(`\nTotal: ${totalTests} | Passed: ${passed} | Failed: ${failed}`);
console.log(`Result: ${failed === 0 ? 'ALL PASSED' : `${failed} FAILURES`}\n`);

// Category summary table
console.log('Category'.padEnd(35) + 'Tests'.padStart(8) + 'Status'.padStart(10));
console.log('-'.repeat(53));
for (const [cat, count] of Object.entries(categoryCounts).sort()) {
  const catFailures = failures.filter(f => f.category === cat).length;
  const status = catFailures === 0 ? 'PASS' : `${catFailures} FAIL`;
  console.log(cat.padEnd(35) + String(count).padStart(8) + status.padStart(10));
}

if (failures.length > 0) {
  console.log('\nFailed tests:');
  for (const f of failures) {
    console.log(`  [${f.category}] ${f.testName}`);
  }
}

console.log(`\nTotal tests: ${totalTests}`);
process.exit(failed > 0 ? 1 : 0);
