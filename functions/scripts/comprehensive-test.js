'use strict';

/**
 * Comprehensive Internal Test Suite for BlackSugar21
 * Tests: Conflict Regex, Clarification Filter, URL Sanitization,
 *        DateScore Guards, Score Clamping, Base64 Validation,
 *        AI Config Helpers, Cultural De-escalation, Appearance Safety,
 *        Skill Builder
 */

const fs = require('fs');
const path = require('path');

// ─── Load source files ───
const coachPath = path.join(__dirname, '..', 'lib', 'coach.js');
const aiServicesPath = path.join(__dirname, '..', 'lib', 'ai-services.js');
const placesHelpersPath = path.join(__dirname, '..', 'lib', 'places-helpers.js');
const coachSrc = fs.readFileSync(coachPath, 'utf8');
const aiServicesSrc = fs.readFileSync(aiServicesPath, 'utf8');
const placesHelpersSrc = fs.readFileSync(placesHelpersPath, 'utf8');

// ─── Test infrastructure ───
const results = {};
let currentCategory = '';

function startCategory(name) {
  currentCategory = name;
  results[name] = { tests: 0, pass: 0, fail: 0, failures: [] };
}

function assert(label, condition) {
  results[currentCategory].tests++;
  if (condition) {
    results[currentCategory].pass++;
  } else {
    results[currentCategory].fail++;
    results[currentCategory].failures.push(label);
  }
}

// ═══════════════════════════════════════════════════════════════
// 1. MODE 7 CONFLICT REGEX
// ═══════════════════════════════════════════════════════════════
startCategory('MODE 7 Conflict Regex');

// Extract the conflict_resolution regex from coach.js
const conflictRegexMatch = coachSrc.match(/conflict_resolution:\s*(\/(?:[^/\\]|\\.)+\/[gimsuy]*)/);
if (!conflictRegexMatch) {
  assert('Regex extraction', false);
} else {
  const conflictRegex = eval(conflictRegexMatch[1]);

  // True positives — MUST match (20+ across 10 languages)
  const truePositives = [
    // ES
    'tuve una pelea con mi novia', 'peleamos anoche', 'discutimos por dinero',
    'estoy enojada con él', 'molesto con ella por llegar tarde',
    // EN
    'we had a fight yesterday', 'argument with my girlfriend', 'angry at her',
    "she's mad at me", "he's upset about the dinner", 'tired of fighting',
    // JA
    'けんかしてしまった',
    // ZH
    '我们争吵了',
    // RU
    'у нас была ссора',
    // AR
    'حصل شجار بيننا',
    // ID
    'pertengkaran dengan pacar',
    // PT
    'tive uma briga com ela',
    // DE/FR/misc
    'we had a dispute with her', 'cold shoulder from my date',
    'me ignora desde ayer', 'ignoring me for days',
    'rencor hacia mi por lo que dije', 'resentment after the trip',
    'bad vibes between us', 'mal ambiente entre nosotros',
    'silent treatment desde el lunes', 'no nos hablamos hace días',
    'frustrada con mi pareja', 'tensión entre nosotros',
  ];

  for (const msg of truePositives) {
    assert(`TP: "${msg.substring(0, 50)}"`, conflictRegex.test(msg.toLowerCase()));
  }

  // False negatives — MUST NOT match (15+)
  const falseNegatives = [
    // Gaming
    'I won the fight in Mortal Kombat', 'final boss fight was epic',
    // Sports
    'the boxing fight was amazing', 'UFC fight night',
    // Food
    'I want to order pizza', 'best restaurant in town',
    // Movies
    'fight club is my favorite movie', 'the argument scene was great acting',
    // General
    'hello how are you', 'tell me about first dates',
    'what should I wear', 'recommend a bar in Madrid',
    'I love chocolate', 'how do I improve my profile',
    'give me icebreakers for a cafe', 'she looks beautiful',
    'plan a romantic evening', 'I need date ideas for Saturday',
    'what flowers should I buy',
  ];

  for (const msg of falseNegatives) {
    assert(`FN: "${msg.substring(0, 50)}"`, !conflictRegex.test(msg.toLowerCase()));
  }

  // Edge cases
  assert('Edge: empty string', !conflictRegex.test(''));
  assert('Edge: only emojis', !conflictRegex.test('😀🎉💕'));
  assert('Edge: very long string', !conflictRegex.test('a'.repeat(10000)));
  assert('Edge: mixed lang conflict', conflictRegex.test('we had a fight y peleamos mucho'));
  assert('Edge: unicode spaces', !conflictRegex.test('\u200B\u200B\u200B'));
}

// ═══════════════════════════════════════════════════════════════
// 2. ICEBREAKER CLARIFICATION FILTER (11 patterns)
// ═══════════════════════════════════════════════════════════════
startCategory('Clarification Filter');

const clarificationPatterns = [
  // ES
  /^¿(qué tipo|cuál prefieres|con quién (irías|vas|quieres)|dónde (prefieres|quieres|te gustaría)|cómo (prefieres|te gustaría)|prefieres|te gustaría)/i,
  // EN
  /^(what (type|kind) of|which (type|kind)|who (are you|would you|will you)|where (do you prefer|would you)|how (do you prefer|would you)|do you prefer|would you (like|prefer|rather))/i,
  // PT
  /^(que tipo|qual (prefere|tipo)|com quem (iria|vai)|onde (prefere|gostaria)|prefere|gostaria de)/i,
  // FR
  /^(quel (type|genre)|avec qui (irais|veux)|où (préfères|aimerais)|préfères|aimerais)/i,
  // DE
  /^(was für (ein|eine)|welch(e|er|es) (Art|Typ)|mit wem (möchtest|willst)|wo (möchtest|bevorzugst)|möchtest du|bevorzugst)/i,
  // JA
  /^(どんな(タイプ|種類|雰囲気)|誰と|どこが(いい|好き))/,
  // ZH
  /^(什么(类型|样的|风格)|跟谁|你(喜欢|想要|偏好))/,
  // RU
  /^(какой (тип|вид)|с кем (хотите|пойдёте)|где (предпочитаете|хотите)|предпочитаете|хотите)/i,
  // AR
  /^(ما (نوع|نمط)|مع من|أين (تفضل|تريد)|هل تفضل)/,
  // ID
  /^(tipe (apa|seperti)|jenis apa|dengan siapa|dimana (kamu prefer|kamu mau)|mau yang|preferensi)/i,
  // Universal
  /tipo de (ambiente|lugar|sitio)|kind of (place|vibe|atmosphere|venue)|type of (place|venue|vibe)|qué ambiente|what vibe|preferencia de lugar/i,
];

function isClarification(text) {
  return clarificationPatterns.some(p => p.test(text.trim()));
}

// Valid icebreakers that should NOT be filtered (12+ across 10 langs)
const validIcebreakers = [
  '¿Qué estás tomando?',          // ES - valid icebreaker
  '¿Vienes seguido por aquí?',     // ES
  'What are you drinking?',         // EN
  'Come here often?',               // EN
  'O que você está bebendo?',       // PT
  'Tu viens souvent ici?',         // FR
  'Was trinkst du gerade?',        // DE
  'ここによく来るの？',              // JA
  '你经常来这里吗？',               // ZH
  'Что пьёшь?',                    // RU
  'ماذا تشرب؟',                    // AR
  'Sering ke sini?',               // ID
];

for (const ic of validIcebreakers) {
  assert(`Valid icebreaker NOT filtered: "${ic.substring(0, 40)}"`, !isClarification(ic));
}

// Clarification questions that SHOULD be filtered (15+ across 10 langs)
const clarifications = [
  '¿Qué tipo de lugar prefieres?',       // ES
  '¿Cuál prefieres, bar o café?',        // ES
  '¿Con quién irías?',                   // ES
  'What type of place do you like?',     // EN
  'Which type of venue?',                // EN
  'Would you prefer a bar or cafe?',     // EN
  'Do you prefer indoor or outdoor?',    // EN
  'Que tipo de lugar?',                  // PT
  'Qual prefere?',                       // PT
  'Quel type de lieu?',                  // FR
  'Préfères un bar ou café?',           // FR
  'Was für ein Lokal?',                  // DE
  'Möchtest du drinnen oder draußen?',  // DE
  'どんなタイプのお店？',                 // JA
  '什么类型的地方？',                    // ZH
  'Какой тип заведения?',              // RU
  'ما نوع المكان؟',                     // AR
  'Tipe apa yang kamu suka?',           // ID
  'What kind of atmosphere?',           // EN - universal pattern
  'Tipo de ambiente que buscas?',       // ES - universal pattern
];

for (const cl of clarifications) {
  assert(`Clarification filtered: "${cl.substring(0, 40)}"`, isClarification(cl));
}

// ═══════════════════════════════════════════════════════════════
// 3. URL SANITIZATION
// ═══════════════════════════════════════════════════════════════
startCategory('URL Sanitization');

// Replicate sanitizeWebsiteUrl from places-helpers.js
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

// Valid URLs
assert('https valid', sanitizeWebsiteUrl('https://google.com') === 'https://google.com');
assert('http valid', sanitizeWebsiteUrl('http://restaurant.cl') === 'http://restaurant.cl');
assert('https with path', sanitizeWebsiteUrl('https://foo.com/bar/baz') !== null);
assert('https with query', sanitizeWebsiteUrl('https://foo.com?q=hello&lang=es') !== null);
assert('https with fragment', sanitizeWebsiteUrl('https://foo.com#section1') !== null);
assert('https unicode domain', sanitizeWebsiteUrl('https://xn--n3h.com') !== null);
assert('https with port', sanitizeWebsiteUrl('https://foo.com:8080/path') !== null);
assert('long valid URL truncated', sanitizeWebsiteUrl('https://foo.com/' + 'a'.repeat(300)).length <= 200);

// Invalid URLs
assert('javascript: rejected', sanitizeWebsiteUrl('javascript:alert(1)') === null);
assert('data: rejected', sanitizeWebsiteUrl('data:text/html,<h1>hi</h1>') === null);
assert('ftp: rejected', sanitizeWebsiteUrl('ftp://files.com/secret') === null);
assert('file: rejected', sanitizeWebsiteUrl('file:///etc/passwd') === null);
assert('mailto: rejected', sanitizeWebsiteUrl('mailto:test@test.com') === null);
assert('empty string', sanitizeWebsiteUrl('') === null);
assert('null', sanitizeWebsiteUrl(null) === null);
assert('undefined', sanitizeWebsiteUrl(undefined) === null);
assert('number', sanitizeWebsiteUrl(123) === null);
assert('object', sanitizeWebsiteUrl({}) === null);
assert('example.com rejected', sanitizeWebsiteUrl('https://example.com') === null);
assert('placeholder rejected', sanitizeWebsiteUrl('https://placeholder.com/img') === null);
assert('bare domain rejected', sanitizeWebsiteUrl('google.com') === null);
assert('just text', sanitizeWebsiteUrl('not a url at all') === null);

// ═══════════════════════════════════════════════════════════════
// 4. DATESCORE GUARDS
// ═══════════════════════════════════════════════════════════════
startCategory('DateScore Guards');

// Replicate the guard logic from coach.js lines 3180-3188
function dateScoreGuard(needsContext, dateScore, matchId) {
  let result = dateScore;
  if (needsContext && result) {
    result = undefined; // needsContext takes priority
  }
  if (result && !matchId) {
    result = undefined; // requires matchId
  }
  return result;
}

const sampleScore = { overall: 8, conversation: { score: 7 } };

// All combos
assert('needsContext=T, score=obj, matchId=Y -> cleared (needsContext priority)',
  dateScoreGuard(true, sampleScore, 'match123') === undefined);
assert('needsContext=T, score=obj, matchId=N -> cleared (both)',
  dateScoreGuard(true, sampleScore, null) === undefined);
assert('needsContext=F, score=obj, matchId=Y -> preserved',
  dateScoreGuard(false, sampleScore, 'match123') !== undefined);
assert('needsContext=F, score=obj, matchId=N -> cleared (no matchId)',
  dateScoreGuard(false, sampleScore, null) === undefined);
assert('needsContext=F, score=null, matchId=Y -> stays falsy',
  !dateScoreGuard(false, null, 'match123'));
assert('needsContext=F, score=null, matchId=N -> stays falsy',
  !dateScoreGuard(false, null, null));
assert('needsContext=T, score=null, matchId=Y -> stays falsy',
  !dateScoreGuard(true, null, 'match123'));
assert('needsContext=T, score=null, matchId=N -> stays falsy',
  !dateScoreGuard(true, null, null));

// Edge: NaN/undefined/negative
assert('score=undefined, matchId=Y', dateScoreGuard(false, undefined, 'x') === undefined);
assert('needsContext=undefined treated as falsy', dateScoreGuard(undefined, sampleScore, 'x') !== undefined);
assert('matchId="" treated as falsy', dateScoreGuard(false, sampleScore, '') === undefined);

// ═══════════════════════════════════════════════════════════════
// 5. SCORE CLAMPING
// ═══════════════════════════════════════════════════════════════
startCategory('Score Clamping');

// Replicate the clamping logic from coach.js line 2804-2808
function clampScore(val) {
  return Math.min(10, Math.max(1, val || 5));
}

function clampOverall(val) {
  return Math.min(10, Math.max(1, isNaN(Number(val)) ? 5 : Number(val)));
}

// Valid 1-10
assert('clamp(1) = 1', clampScore(1) === 1);
assert('clamp(5) = 5', clampScore(5) === 5);
assert('clamp(10) = 10', clampScore(10) === 10);
assert('clamp(7) = 7', clampScore(7) === 7);

// Edge cases
assert('clamp(0) = 5 (falsy -> default 5)', clampScore(0) === 5);
assert('clamp(-1) = 1 (min)', clampScore(-1) === 1);
assert('clamp(11) = 10 (max)', clampScore(11) === 10);
assert('clamp(100) = 10 (max)', clampScore(100) === 10);
assert('clamp(NaN) = 5 (falsy)', clampScore(NaN) === 5);
assert('clamp(undefined) = 5 (falsy)', clampScore(undefined) === 5);
assert('clamp(null) = 5 (falsy)', clampScore(null) === 5);

// Overall clamping (different path with isNaN check)
assert('overall("abc") = 5', clampOverall('abc') === 5);
assert('overall(Infinity) = 10', clampOverall(Infinity) === 10);
assert('overall(-Infinity) = 1', clampOverall(-Infinity) === 1);
assert('overall("7") = 7', clampOverall('7') === 7);
assert('overall(0) = 1', clampOverall(0) === 1);
assert('overall(10.5) = 10', clampOverall(10.5) === 10);

// ═══════════════════════════════════════════════════════════════
// 6. BASE64 VALIDATION
// ═══════════════════════════════════════════════════════════════
startCategory('Base64 Validation');

// Replicate the base64 validation from ai-services.js line 2347
function isValidBase64(input) {
  if (!input || typeof input !== 'string') return false;
  return /^[A-Za-z0-9+/=]+$/.test(input.substring(0, 100));
}

// Valid base64
assert('JPEG header (valid)', isValidBase64('/9j/4AAQSkZJRgABAQAAAQABAAD'));
assert('PNG header (valid)', isValidBase64('iVBORw0KGgoAAAANSUhEUgAA'));
assert('Generic base64 (valid)', isValidBase64('SGVsbG8gV29ybGQ='));
assert('Pure A-Z (valid)', isValidBase64('ABCDEFGHIJKLMNOPQRSTUVWXYZ'));
assert('With padding (valid)', isValidBase64('dGVzdA=='));
assert('Long valid base64', isValidBase64('A'.repeat(200)));

// Invalid
assert('HTML rejected', isValidBase64('<html><body>hello</body></html>') === false);
assert('JavaScript rejected', isValidBase64('javascript:alert(1)') === false);
assert('URL rejected', isValidBase64('https://example.com/image.jpg') === false);
assert('Empty string', isValidBase64('') === false);
assert('Null', isValidBase64(null) === false);
assert('Undefined', isValidBase64(undefined) === false);
assert('Spaces rejected', isValidBase64('SGVs bG8=') === false);
assert('Unicode rejected', isValidBase64('こんにちは世界') === false);
assert('Curly braces rejected', isValidBase64('{json: true}') === false);
assert('Angle brackets rejected', isValidBase64('<script>') === false);
assert('Number input', isValidBase64(123) === false);
assert('Object input', isValidBase64({}) === false);
assert('Newlines rejected', isValidBase64('SGVs\nbG8=') === false);

// ═══════════════════════════════════════════════════════════════
// 7. AI CONFIG HELPERS
// ═══════════════════════════════════════════════════════════════
startCategory('AI Config Helpers');

// Test config.temperature and config.maxTokens usage patterns from coach.js
function getTemp(config, isPlaces, isSafety) {
  return isSafety ? 0.3 : isPlaces ? 0.7 : (config?.temperature || 0.85);
}

function getTokens(config, isPlaceSearch, placeTokenBudget) {
  return (isPlaceSearch) ? Math.max(config?.maxTokens || 2048, placeTokenBudget || 0) : (config?.maxTokens || 2048);
}

// getTemp tests
assert('getTemp: valid config', getTemp({ temperature: 0.9 }, false, false) === 0.9);
assert('getTemp: safety override', getTemp({ temperature: 0.9 }, false, true) === 0.3);
assert('getTemp: places override', getTemp({ temperature: 0.9 }, true, false) === 0.7);
assert('getTemp: safety takes priority over places', getTemp({ temperature: 0.9 }, true, true) === 0.3);
assert('getTemp: missing config falls to default', getTemp(null, false, false) === 0.85);
assert('getTemp: config without temp', getTemp({}, false, false) === 0.85);
assert('getTemp: config temp=0 (falsy) -> default', getTemp({ temperature: 0 }, false, false) === 0.85);

// getTokens tests
assert('getTokens: valid config no places', getTokens({ maxTokens: 4096 }, false, 0) === 4096);
assert('getTokens: valid config with places (bigger budget)', getTokens({ maxTokens: 2048 }, true, 8192) === 8192);
assert('getTokens: valid config with places (smaller budget)', getTokens({ maxTokens: 4096 }, true, 2048) === 4096);
assert('getTokens: null config', getTokens(null, false, 0) === 2048);
assert('getTokens: undefined maxTokens', getTokens({}, false, 0) === 2048);
assert('getTokens: null config with places', getTokens(null, true, 8192) === 8192);

// ═══════════════════════════════════════════════════════════════
// 8. CULTURAL DE-ESCALATION PRESENCE
// ═══════════════════════════════════════════════════════════════
startCategory('Cultural De-escalation');

// Verify MODE 7 prompt contains cultural adaptations for all 10 languages
const mode7Section = coachSrc.substring(
  coachSrc.indexOf('MODE 7 — CONFLICT RESOLUTION'),
  coachSrc.indexOf('MODE DETECTION PRIORITY')
);

const culturalLangs = [
  { code: 'ES', pattern: /ES\s*\(Latam\)/i },
  { code: 'EN', pattern: /EN:/i },
  { code: 'JA', pattern: /JA:/i },
  { code: 'ZH', pattern: /ZH:/i },
  { code: 'AR', pattern: /AR:/i },
  { code: 'DE', pattern: /DE:/i },
  { code: 'PT', pattern: /PT\s*\(BR\)/i },
  { code: 'FR', pattern: /FR:/i },
  { code: 'RU', pattern: /RU:/i },
  { code: 'ID', pattern: /ID:/i },
];

for (const lang of culturalLangs) {
  assert(`Cultural adaptation: ${lang.code}`, lang.pattern.test(mode7Section));
}

// Verify key de-escalation concepts
assert('De-escalation: "I feel" statements', mode7Section.includes('I feel'));
assert('De-escalation: Active listening', mode7Section.includes('Active listening') || mode7Section.includes('active listening'));
assert('De-escalation: Repair bids', mode7Section.includes('Repair bid') || mode7Section.includes('repair bid'));
assert('De-escalation: Accountability', mode7Section.includes('Accountability') || mode7Section.includes('accountability'));
assert('De-escalation: Cooling down', mode7Section.includes('Cooling down') || mode7Section.includes('cooling down'));

// ═══════════════════════════════════════════════════════════════
// 9. APPEARANCE SAFETY
// ═══════════════════════════════════════════════════════════════
startCategory('Appearance Safety');

// Verify APPEARANCE SAFETY RULES exists
assert('APPEARANCE SAFETY RULES text exists', aiServicesSrc.includes('APPEARANCE SAFETY RULES'));

// Extract the safety section
const safetyStart = aiServicesSrc.indexOf('APPEARANCE SAFETY RULES');
const safetySection = aiServicesSrc.substring(safetyStart, safetyStart + 600);

// Count NEVER rules
const neverMatches = safetySection.match(/- (Comment on|Suggest|Make|Reference|Compare)/g);
assert('NEVER rules count >= 5', neverMatches && neverMatches.length >= 5);

// Verify specific rules
assert('Rule: body shape/weight', safetySection.includes('body shape') || safetySection.includes('weight'));
assert('Rule: skin color', safetySection.includes('skin color'));
assert('Rule: gendered assumptions', safetySection.includes('gendered'));
assert('Rule: attractiveness', safetySection.includes('attractiveness'));
assert('Rule: beauty standards', safetySection.includes('beauty standards'));
assert('Rule: ONLY comment on clothing', safetySection.includes('clothing fit'));

// ═══════════════════════════════════════════════════════════════
// 10. SKILL BUILDER
// ═══════════════════════════════════════════════════════════════
startCategory('Skill Builder');

// Verify exempt clarifications rule
assert('Exempt clarifications rule exists',
  coachSrc.includes('needsContext is true') && coachSrc.includes('clarification messages'));

// Verify anti-manipulation rule
assert('Anti-manipulation rule exists',
  coachSrc.includes('NEVER use skill names that imply manipulation'));
assert('Anti-manipulation examples present',
  coachSrc.includes('Playing Hard to Get') || coachSrc.includes('Making Them Jealous') || coachSrc.includes('Power Play'));

// Verify skill builder structure
assert('SKILL BUILDER section exists', coachSrc.includes('SKILL BUILDER'));
assert('Skill format: "Skill:" prefix', coachSrc.includes('💡 Skill:'));
assert('Skill localization: ES "Habilidad:"', coachSrc.includes('Habilidad:'));
assert('Skill localization: JA "スキル:"', coachSrc.includes('スキル:'));
assert('Skill localization: ZH "技能:"', coachSrc.includes('技能:'));
assert('Skill localization: RU "Навык:"', coachSrc.includes('Навык:'));
assert('Skill localization: AR "مهارة:"', coachSrc.includes('مهارة:'));

// Verify error/greeting exception
assert('Error/fallback exception', coachSrc.includes('error/fallback message'));
assert('Greeting exception', coachSrc.includes('greeting or small talk'));

// ═══════════════════════════════════════════════════════════════
// REPORT
// ═══════════════════════════════════════════════════════════════

console.log('');
console.log('══════════════════════════════════════════════════════════');
console.log('       COMPREHENSIVE INTERNAL TEST REPORT');
console.log('══════════════════════════════════════════════════════════');
console.log('Category                   | Tests | Pass | Fail');
console.log('───────────────────────────────────────────────────────');

let totalTests = 0, totalPass = 0, totalFail = 0;
for (const [cat, r] of Object.entries(results)) {
  const padCat = cat.padEnd(27);
  const padTests = String(r.tests).padStart(5);
  const padPass = String(r.pass).padStart(5);
  const padFail = String(r.fail).padStart(5);
  console.log(`${padCat}|${padTests} |${padPass} |${padFail}`);
  totalTests += r.tests;
  totalPass += r.pass;
  totalFail += r.fail;
}

console.log('───────────────────────────────────────────────────────');
console.log(`${'TOTAL'.padEnd(27)}|${String(totalTests).padStart(5)} |${String(totalPass).padStart(5)} |${String(totalFail).padStart(5)}`);
console.log('══════════════════════════════════════════════════════════');

if (totalFail > 0) {
  console.log('');
  console.log('FAILURES:');
  for (const [cat, r] of Object.entries(results)) {
    for (const f of r.failures) {
      console.log(`  [${cat}] ${f}`);
    }
  }
}

console.log('');
console.log(totalFail === 0 ? 'ALL TESTS PASSED' : `${totalFail} TEST(S) FAILED`);
process.exit(totalFail > 0 ? 1 : 0);
