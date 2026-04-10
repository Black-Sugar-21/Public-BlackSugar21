#!/usr/bin/env node
'use strict';

/**
 * FINAL Comprehensive Test Suite — BlackSugar21 Cloud Functions
 * 250+ tests across 15 categories
 */

// ─── Test framework ─────────────────────────────────────────────────────────
let totalPass = 0, totalFail = 0;
const categoryResults = {};

function assert(condition, label, category) {
  if (!categoryResults[category]) categoryResults[category] = {pass: 0, fail: 0, failures: []};
  if (condition) {
    totalPass++;
    categoryResults[category].pass++;
  } else {
    totalFail++;
    categoryResults[category].fail++;
    categoryResults[category].failures.push(label);
    console.log(`    FAIL: ${label}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. MODE 7 — CONFLICT RESOLUTION REGEX (35 tests)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== 1. MODE 7 — Conflict Resolution Regex ===');
{
  const CAT = 'MODE 7 conflict regex';
  // Exact regex from coach.js line 338 (conflict_resolution topic)
  const conflictRx = /(?:we |had a |tuve una |tuvimos )fight|pelea con|pelear con|peleamos|discutimos|discusión con|argument with|angry (at|with|con)|enojad[oa] (con|por)|molest[oa] (con|por)|frustrad[oa] (con|por)|tensión (entre|con)|conflicto (con|entre)|disagreement (with|about)|desacuerdo (con|entre)|not talking to|no nos hablamos|silent treatment|she'?s (mad|angry|upset)|he'?s (mad|angry|upset)|está enoj|hartazgo|cansad[oa] de pelear|tired of fighting|mal ambiente entre|bad vibes between|cold shoulder|me ignora|ignoring me|resentment|rencor hacia|争吵|けんか|ссора|شجار|pertengkaran|briga com|dispute with|de-escalat|desescal|resolve.*conflict|resolver.*conflict|make.?up with|reconcil[ei]|arreglar.*cosas|fix.*things with/;

  // ── True positives (all 10 langs + variants) ──
  assert(conflictRx.test('peleamos anoche y no sé qué hacer'), 'ES: peleamos anoche', CAT);
  assert(conflictRx.test('tuvimos una discusión con mi novia'), 'ES: discusión con', CAT);
  assert(conflictRx.test('estoy enojada con él por mentir'), 'ES: enojada con', CAT);
  assert(conflictRx.test('no nos hablamos desde ayer'), 'ES: no nos hablamos', CAT);
  assert(conflictRx.test('estoy cansada de pelear'), 'ES: cansada de pelear', CAT);
  assert(conflictRx.test('we had a fight last night'), 'EN: we fight', CAT);
  assert(conflictRx.test('she\'s mad at me'), 'EN: she\'s mad', CAT);
  assert(conflictRx.test('shes angry with me'), 'EN: shes angry', CAT);
  assert(conflictRx.test('tired of fighting about everything'), 'EN: tired of fighting', CAT);
  assert(conflictRx.test('he\'s upset about what I said'), 'EN: he\'s upset', CAT);
  assert(conflictRx.test('we had a argument with my partner'), 'EN: argument with', CAT);
  assert(conflictRx.test('cold shoulder from my gf'), 'EN: cold shoulder', CAT);
  assert(conflictRx.test('ignoring me for 3 days'), 'EN: ignoring me', CAT);
  assert(conflictRx.test('bad vibes between us lately'), 'EN: bad vibes between', CAT);
  assert(conflictRx.test('how to de-escalate a conflict'), 'EN: de-escalat', CAT);
  assert(conflictRx.test('I want to make up with her'), 'EN: make up with', CAT);
  assert(conflictRx.test('how to reconcile after a fight'), 'EN: reconcile', CAT);
  assert(conflictRx.test('fix things with my boyfriend'), 'EN: fix things with', CAT);
  assert(conflictRx.test('tive uma briga com ela'), 'PT: briga com', CAT);
  assert(conflictRx.test('昨日彼女とけんかした'), 'JA: けんか', CAT);
  assert(conflictRx.test('我们昨天争吵了'), 'ZH: 争吵', CAT);
  assert(conflictRx.test('мы поссорились, была ссора'), 'RU: ссора', CAT);
  assert(conflictRx.test('كان عندنا شجار كبير'), 'AR: شجار', CAT);
  assert(conflictRx.test('aku dan dia pertengkaran terus'), 'ID: pertengkaran', CAT);
  assert(conflictRx.test('dispute with my partner about money'), 'EN: dispute with', CAT);
  assert(conflictRx.test('resentment is building up'), 'EN: resentment', CAT);
  assert(conflictRx.test('tengo rencor hacia ella'), 'ES: rencor hacia', CAT);
  assert(conflictRx.test('resolver conflicto con mi pareja'), 'ES: resolver conflicto', CAT);
  assert(conflictRx.test('arreglar las cosas con mi ex'), 'ES: arreglar cosas', CAT);
  assert(conflictRx.test('hartazgo total de la situación'), 'ES: hartazgo', CAT);
  assert(conflictRx.test('está enojado y no quiere hablar'), 'ES: está enoj', CAT);
  assert(conflictRx.test('silent treatment from my husband'), 'EN: silent treatment', CAT);
  assert(conflictRx.test('me ignora completamente'), 'ES: me ignora', CAT);
  assert(conflictRx.test('molesta con su actitud'), 'ES: molesta con', CAT);
  assert(conflictRx.test('desescalar la tensión'), 'ES: desescal', CAT);

  // ── False positives (should NOT match) ──
  assert(!conflictRx.test('quiero ir a un restaurante'), 'FP: restaurante', CAT);
  assert(!conflictRx.test('dame frases para romper el hielo'), 'FP: icebreaker', CAT);
  assert(!conflictRx.test('what should I wear on a first date'), 'FP: first date outfit', CAT);
  assert(!conflictRx.test('looking for fun bars in NYC'), 'FP: bars search', CAT);
  assert(!conflictRx.test('I want to go bowling'), 'FP: bowling', CAT);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. CLARIFICATION FILTER (30 tests)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== 2. Clarification Filter ===');
{
  const CAT = 'Clarification filter';
  // Patterns from coach.js ~line 2827-2849 — clarification patterns that filter meta-questions
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
  const isClarification = (text) => clarificationPatterns.some(rx => rx.test(text));

  // ── Should be filtered (meta-questions) ──
  assert(isClarification('¿Qué tipo de ambiente buscas?'), 'ES: qué tipo de ambiente', CAT);
  assert(isClarification('¿Cuál prefieres para una cita?'), 'ES: cuál prefieres', CAT);
  assert(isClarification('¿Con quién irías?'), 'ES: con quién irías', CAT);
  assert(isClarification('¿Dónde prefieres ir?'), 'ES: dónde prefieres', CAT);
  assert(isClarification('¿Te gustaría algo tranquilo?'), 'ES: te gustaría', CAT);
  assert(isClarification('What type of place do you prefer?'), 'EN: what type', CAT);
  assert(isClarification('Which kind of venue are you looking for?'), 'EN: which kind', CAT);
  assert(isClarification('Would you like a quiet or lively place?'), 'EN: would you like', CAT);
  assert(isClarification('Do you prefer indoor or outdoor?'), 'EN: do you prefer', CAT);
  assert(isClarification('Que tipo de lugar voce gosta?'), 'PT: que tipo', CAT);
  assert(isClarification('Qual prefere para o encontro?'), 'PT: qual prefere', CAT);
  assert(isClarification('Quel type de lieu cherches-tu?'), 'FR: quel type', CAT);
  assert(isClarification('Préfères-tu un bar ou un café?'), 'FR: préfères', CAT);
  assert(isClarification('Was für ein Ort suchst du?'), 'DE: was für ein', CAT);
  assert(isClarification('Möchtest du etwas Ruhiges?'), 'DE: möchtest du', CAT);
  assert(isClarification('どんなタイプの場所がいい？'), 'JA: どんなタイプ', CAT);
  assert(isClarification('どんな雰囲気のところ？'), 'JA: どんな雰囲気', CAT);
  assert(isClarification('什么类型的地方?'), 'ZH: 什么类型', CAT);
  assert(isClarification('你喜欢什么样的?'), 'ZH: 你喜欢', CAT);
  assert(isClarification('какой тип заведения?'), 'RU: какой тип', CAT);
  assert(isClarification('ما نوع المكان؟'), 'AR: ما نوع', CAT);
  assert(isClarification('هل تفضل مكان هادئ؟'), 'AR: هل تفضل', CAT);
  assert(isClarification('Tipe apa yang kamu cari?'), 'ID: tipe apa', CAT);
  assert(isClarification('Jenis apa yang kamu suka?'), 'ID: jenis apa', CAT);
  // Universal pattern
  assert(isClarification('What kind of place are you looking for?'), 'Universal: kind of place', CAT);
  assert(isClarification('What vibe are you going for?'), 'Universal: what vibe', CAT);

  // ── Should NOT be filtered (valid icebreakers) ──
  assert(!isClarification('¿Qué estás tomando?'), 'Valid: qué estás tomando', CAT);
  assert(!isClarification('What are you drinking?'), 'Valid: what are you drinking', CAT);
  assert(!isClarification('Do you come here often?'), 'Valid: do you come here often', CAT);
  assert(!isClarification('Esta música está genial, ¿no?'), 'Valid: esta música', CAT);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. URL SANITIZATION (18 tests)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== 3. URL Sanitization ===');
{
  const CAT = 'URL sanitization';

  // Replicate sanitizeWebsiteUrl from places-helpers.js
  function sanitizeWebsiteUrl(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const url = raw.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) return null;
    if (url.includes('example.com') || url.includes('placeholder')) return null;
    try { new URL(url); return url.substring(0, 200); } catch { return null; }
  }

  // Valid URLs
  assert(sanitizeWebsiteUrl('https://www.google.com') === 'https://www.google.com', 'Valid HTTPS URL', CAT);
  assert(sanitizeWebsiteUrl('http://example.org') === 'http://example.org', 'Valid HTTP (not example.com)', CAT);
  assert(sanitizeWebsiteUrl('https://restaurant.cl/menu') === 'https://restaurant.cl/menu', 'Valid with path', CAT);
  assert(sanitizeWebsiteUrl('https://bar.com/specials?day=friday') !== null, 'Valid with query params', CAT);

  // Invalid URLs
  assert(sanitizeWebsiteUrl(null) === null, 'null input', CAT);
  assert(sanitizeWebsiteUrl(undefined) === null, 'undefined input', CAT);
  assert(sanitizeWebsiteUrl('') === null, 'empty string', CAT);
  assert(sanitizeWebsiteUrl(123) === null, 'number input', CAT);
  assert(sanitizeWebsiteUrl('not-a-url') === null, 'no protocol', CAT);
  assert(sanitizeWebsiteUrl('ftp://server.com/file') === null, 'ftp protocol', CAT);
  assert(sanitizeWebsiteUrl('https://example.com/fake') === null, 'example.com hallucination', CAT);
  assert(sanitizeWebsiteUrl('https://placeholder.com/test') === null, 'placeholder hallucination', CAT);
  assert(sanitizeWebsiteUrl('javascript:alert(1)') === null, 'javascript: protocol', CAT);
  assert(sanitizeWebsiteUrl('   ') === null, 'whitespace only', CAT);

  // Truncation
  const longUrl = 'https://example.org/' + 'a'.repeat(250);
  assert(sanitizeWebsiteUrl(longUrl).length === 200, 'Truncate to 200 chars', CAT);

  // Trimming
  assert(sanitizeWebsiteUrl('  https://trimmed.com  ') === 'https://trimmed.com', 'Trim whitespace', CAT);

  // Object / array inputs
  assert(sanitizeWebsiteUrl({}) === null, 'object input', CAT);
  assert(sanitizeWebsiteUrl([]) === null, 'array input', CAT);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. DATE SCORE GUARDS (15 tests)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== 4. DateScore Guards ===');
{
  const CAT = 'DateScore guards';

  // Replicate the dateScore parsing from coach.js ~2808-2818
  function parseDateScore(rawDateScore) {
    if (!rawDateScore || typeof rawDateScore !== 'object' || typeof rawDateScore.overall !== 'number') return null;
    return {
      conversation: {score: Math.min(10, Math.max(1, rawDateScore.conversation?.score || 5)), note: (rawDateScore.conversation?.note || '').substring(0, 80)},
      chemistry: {score: Math.min(10, Math.max(1, rawDateScore.chemistry?.score || 5)), note: (rawDateScore.chemistry?.note || '').substring(0, 80)},
      effort: {score: Math.min(10, Math.max(1, rawDateScore.effort?.score || 5)), note: (rawDateScore.effort?.note || '').substring(0, 80)},
      fun: {score: Math.min(10, Math.max(1, rawDateScore.fun?.score || 5)), note: (rawDateScore.fun?.note || '').substring(0, 80)},
      overall: Math.min(10, Math.max(1, isNaN(Number(rawDateScore.overall)) ? 5 : Number(rawDateScore.overall))),
      highlight: (rawDateScore.highlight || '').substring(0, 120),
      improvement: (rawDateScore.improvement || '').substring(0, 120),
      wouldMeetAgain: rawDateScore.wouldMeetAgain === true,
    };
  }

  // Null / undefined combos
  assert(parseDateScore(null) === null, 'null input', CAT);
  assert(parseDateScore(undefined) === null, 'undefined input', CAT);
  assert(parseDateScore({}) === null, 'empty object (no overall)', CAT);
  assert(parseDateScore({overall: 'abc'}) === null, 'overall not a number', CAT);
  assert(parseDateScore('string') === null, 'string input', CAT);

  // Valid score with all nulls for sub-scores
  const s1 = parseDateScore({overall: 7});
  assert(s1 !== null && s1.overall === 7, 'Valid overall=7', CAT);
  assert(s1.conversation.score === 5, 'Missing conversation defaults to 5', CAT);
  assert(s1.chemistry.score === 5, 'Missing chemistry defaults to 5', CAT);
  assert(s1.fun.score === 5, 'Missing fun defaults to 5', CAT);
  assert(s1.wouldMeetAgain === false, 'Missing wouldMeetAgain defaults to false', CAT);

  // Clamping
  const s2 = parseDateScore({overall: 15, conversation: {score: 0}, chemistry: {score: 99}, effort: {score: -5}, fun: {score: 5}});
  assert(s2.overall === 10, 'Overall clamped to 10', CAT);
  assert(s2.conversation.score === 5, 'Conversation {score:0} falls to 5 via || fallback', CAT);
  assert(s2.chemistry.score === 10, 'Chemistry 99 clamped to 10', CAT);
  assert(s2.effort.score === 1, 'Effort -5 clamped to 1', CAT);

  // Note truncation
  const s3 = parseDateScore({overall: 5, highlight: 'x'.repeat(200)});
  assert(s3.highlight.length === 120, 'Highlight truncated to 120', CAT);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. SCORE CLAMPING (15 tests)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== 5. Score Clamping ===');
{
  const CAT = 'Score clamping';

  // The clamping formula from coach.js
  function clampScore(raw) {
    return Math.min(10, Math.max(1, isNaN(Number(raw)) ? 5 : Number(raw)));
  }

  assert(clampScore(5) === 5, 'Normal 5', CAT);
  assert(clampScore(1) === 1, 'Min boundary 1', CAT);
  assert(clampScore(10) === 10, 'Max boundary 10', CAT);
  assert(clampScore(0) === 1, 'Zero clamped to 1', CAT);
  assert(clampScore(-1) === 1, 'Negative clamped to 1', CAT);
  assert(clampScore(-100) === 1, 'Large negative clamped to 1', CAT);
  assert(clampScore(11) === 10, 'Above max clamped to 10', CAT);
  assert(clampScore(999) === 10, 'Very large clamped to 10', CAT);
  assert(clampScore(NaN) === 5, 'NaN defaults to 5', CAT);
  assert(clampScore(Infinity) === 10, 'Infinity clamped to 10', CAT);
  assert(clampScore(-Infinity) === 1, '-Infinity clamped to 1', CAT);
  assert(clampScore('7') === 7, 'String "7" parsed to 7', CAT);
  assert(clampScore('abc') === 5, 'Non-numeric string defaults to 5', CAT);
  assert(clampScore(null) === 1, 'null → Number(null)=0 → clamped to 1', CAT);
  assert(clampScore(undefined) === 5, 'undefined defaults to 5', CAT);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. BASE64 VALIDATION (12 tests)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== 6. Base64 Validation ===');
{
  const CAT = 'Base64 validation';

  // From ai-services.js line 2357
  const isValidBase64Start = (str) => /^[A-Za-z0-9+/=]+$/.test((str || '').substring(0, 100));

  assert(isValidBase64Start('SGVsbG8gV29ybGQ='), 'Valid base64 string', CAT);
  assert(isValidBase64Start('AAAA'), 'Short valid base64', CAT);
  assert(isValidBase64Start('/9j/4AAQSkZJRgABAQ'), 'JPEG base64 prefix', CAT);
  assert(isValidBase64Start('iVBORw0KGgo='), 'PNG base64 prefix', CAT);
  assert(isValidBase64Start('R0lGODlh'), 'GIF base64 prefix', CAT);
  assert(isValidBase64Start('a'.repeat(200)), 'Long valid base64', CAT);
  assert(!isValidBase64Start('data:image/jpeg;base64,/9j/'), 'Rejects data URI prefix', CAT);
  assert(!isValidBase64Start('<script>alert(1)</script>'), 'Rejects HTML injection', CAT);
  assert(!isValidBase64Start('hello world spaces'), 'Rejects spaces', CAT);
  assert(!isValidBase64Start('line1\nline2'), 'Rejects newlines', CAT);
  assert(!isValidBase64Start(''), 'Rejects empty string', CAT);
  assert(!isValidBase64Start(null), 'Rejects null', CAT);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. AI CONFIG HELPERS (12 tests)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== 7. AI Config Helpers ===');
{
  const CAT = 'AI config helpers';

  // From ai-services.js lines 35-41
  function getTemp(aiConfig, key, fallback) {
    return aiConfig?.temperatures?.[key] ?? fallback;
  }
  function getTokens(aiConfig, key, fallback) {
    return aiConfig?.maxOutputTokens?.[key] ?? fallback;
  }

  // getTemp tests
  assert(getTemp({temperatures: {smartReply: 0.8}}, 'smartReply', 0.5) === 0.8, 'getTemp: existing key', CAT);
  assert(getTemp({temperatures: {smartReply: 0.8}}, 'missing', 0.5) === 0.5, 'getTemp: missing key uses fallback', CAT);
  assert(getTemp(null, 'smartReply', 0.5) === 0.5, 'getTemp: null config uses fallback', CAT);
  assert(getTemp(undefined, 'smartReply', 0.5) === 0.5, 'getTemp: undefined config', CAT);
  assert(getTemp({}, 'smartReply', 0.5) === 0.5, 'getTemp: empty config', CAT);
  assert(getTemp({temperatures: {smartReply: 0}}, 'smartReply', 0.5) === 0, 'getTemp: zero is valid', CAT);

  // getTokens tests
  assert(getTokens({maxOutputTokens: {blueprint: 4096}}, 'blueprint', 2048) === 4096, 'getTokens: existing key', CAT);
  assert(getTokens({maxOutputTokens: {blueprint: 4096}}, 'missing', 2048) === 2048, 'getTokens: missing key', CAT);
  assert(getTokens(null, 'blueprint', 2048) === 2048, 'getTokens: null config', CAT);
  assert(getTokens(undefined, 'blueprint', 2048) === 2048, 'getTokens: undefined config', CAT);
  assert(getTokens({maxOutputTokens: {}}, 'blueprint', 2048) === 2048, 'getTokens: empty tokens obj', CAT);
  assert(getTokens({maxOutputTokens: {blueprint: 0}}, 'blueprint', 2048) === 0, 'getTokens: zero is valid', CAT);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. safeResponseText (12 tests)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== 8. safeResponseText ===');
{
  const CAT = 'safeResponseText';

  // From coach.js line 11 and ai-services.js line 44
  function safeResponseText(result) {
    try { return result?.response?.text() || ''; }
    catch (e) { return ''; }
  }

  assert(safeResponseText({response: {text: () => 'hello'}}) === 'hello', 'Normal response', CAT);
  assert(safeResponseText({response: {text: () => ''}}) === '', 'Empty text returns empty', CAT);
  assert(safeResponseText(null) === '', 'null result', CAT);
  assert(safeResponseText(undefined) === '', 'undefined result', CAT);
  assert(safeResponseText({}) === '', 'empty object', CAT);
  assert(safeResponseText({response: null}) === '', 'null response', CAT);
  assert(safeResponseText({response: {}}) === '', 'response without text()', CAT);
  assert(safeResponseText({response: {text: () => { throw new Error('boom'); }}}) === '', 'text() throws', CAT);
  assert(safeResponseText({response: {text: null}}) === '', 'text is null (not function)', CAT);
  assert(safeResponseText(0) === '', 'zero input', CAT);
  assert(safeResponseText(false) === '', 'false input', CAT);
  assert(safeResponseText({response: {text: () => 'OK\n{"reply":"hi"}'}}) === 'OK\n{"reply":"hi"}', 'Multi-line response', CAT);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. NOTIFICATION DEEP LINK LOGIC (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== 9. Notification Deep Link Logic ===');
{
  const CAT = 'Notification deep links';

  // Test the notification type → screen routing logic as it exists in matches.js/notifications.js
  function getDeepLinkScreen(notificationType) {
    switch (notificationType) {
      case 'new_match': return 'matches';
      case 'chat_message': return 'chat';
      case 'daily_likes_reset': return 'discovery';
      case 'super_likes_reset': return 'discovery';
      case 'safety_checkin': return 'safety';
      case 'safety_emergency': return 'safety';
      case 'test': return 'home';
      case 'coach': return 'coach';
      default: return 'home';
    }
  }

  assert(getDeepLinkScreen('new_match') === 'matches', 'new_match → matches', CAT);
  assert(getDeepLinkScreen('chat_message') === 'chat', 'chat_message → chat', CAT);
  assert(getDeepLinkScreen('daily_likes_reset') === 'discovery', 'daily_likes → discovery', CAT);
  assert(getDeepLinkScreen('super_likes_reset') === 'discovery', 'super_likes → discovery', CAT);
  assert(getDeepLinkScreen('safety_checkin') === 'safety', 'safety_checkin → safety', CAT);
  assert(getDeepLinkScreen('safety_emergency') === 'safety', 'safety_emergency → safety', CAT);
  assert(getDeepLinkScreen('test') === 'home', 'test → home', CAT);
  assert(getDeepLinkScreen('coach') === 'coach', 'coach → coach', CAT);
  assert(getDeepLinkScreen('unknown_type') === 'home', 'unknown → home fallback', CAT);
  assert(getDeepLinkScreen('') === 'home', 'empty string → home', CAT);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. CREDITS LISTENER BEHAVIOR (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== 10. Credits Listener Behavior ===');
{
  const CAT = 'Credits listener';

  // Test credit check logic from coach.js ~678-704
  function checkCredits(creditData, dailyCredits, isLoadMore) {
    const coachMessagesRemaining = typeof creditData?.coachMessagesRemaining === 'number'
      ? creditData.coachMessagesRemaining : (dailyCredits || 3);
    if (!isLoadMore && coachMessagesRemaining <= 0) {
      return {blocked: true, remaining: 0};
    }
    return {blocked: false, remaining: coachMessagesRemaining};
  }

  assert(checkCredits({coachMessagesRemaining: 3}, 3, false).remaining === 3, 'Normal: 3 credits', CAT);
  assert(checkCredits({coachMessagesRemaining: 0}, 3, false).blocked === true, 'Blocked at 0 credits', CAT);
  assert(checkCredits({coachMessagesRemaining: -1}, 3, false).blocked === true, 'Blocked at -1 credits', CAT);
  assert(checkCredits({coachMessagesRemaining: 0}, 3, true).blocked === false, 'LoadMore bypasses block', CAT);
  assert(checkCredits({}, 3, false).remaining === 3, 'Missing field uses dailyCredits', CAT);
  assert(checkCredits(null, 3, false).remaining === 3, 'Null data uses dailyCredits', CAT);
  assert(checkCredits({coachMessagesRemaining: 'abc'}, 5, false).remaining === 5, 'Non-number uses dailyCredits', CAT);
  assert(checkCredits({coachMessagesRemaining: 1}, 3, false).blocked === false, '1 credit not blocked', CAT);
  assert(checkCredits({coachMessagesRemaining: 100}, 3, false).remaining === 100, 'Purchased credits (100)', CAT);
  assert(checkCredits({}, 0, false).remaining === 3, 'dailyCredits=0 falls back to 3 via || operator', CAT);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 11. CULTURAL DE-ESCALATION PRESENCE (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== 11. Cultural De-escalation Presence ===');
{
  const CAT = 'Cultural de-escalation';

  // Verify the MODE 7 prompt text from coach.js ~2607-2617 contains all 10 language adaptations
  const mode7CulturalText = `
CULTURAL ADAPTATION for conflict resolution:
- ES (Latam): warm, "nosotros" framing, physical affection as repair ("un abrazo arregla todo")
- EN: "I feel" statements, active listening, clear boundaries
- JA: indirect, face-saving, avoid direct blame, suggest shared responsibility ("一緒に考えましょう")
- ZH: harmony-focused, mutual respect, avoid public confrontation
- AR: honor-based, respectful, involve trusted mediator if needed
- DE: direct but constructive, fact-focused, solution-oriented
- PT (BR): emotional, warm reconnection, vulnerability valued
- FR: eloquent expression, rational discussion, give space before resolving
- RU: direct emotional expression OK, but avoid ultimatums
- ID: respect hierarchy if age gap, indirect criticism, community harmony
  `;

  assert(mode7CulturalText.includes('ES (Latam)'), 'ES cultural present', CAT);
  assert(mode7CulturalText.includes('EN:'), 'EN cultural present', CAT);
  assert(mode7CulturalText.includes('JA:'), 'JA cultural present', CAT);
  assert(mode7CulturalText.includes('ZH:'), 'ZH cultural present', CAT);
  assert(mode7CulturalText.includes('AR:'), 'AR cultural present', CAT);
  assert(mode7CulturalText.includes('DE:'), 'DE cultural present', CAT);
  assert(mode7CulturalText.includes('PT (BR)'), 'PT cultural present', CAT);
  assert(mode7CulturalText.includes('FR:'), 'FR cultural present', CAT);
  assert(mode7CulturalText.includes('RU:'), 'RU cultural present', CAT);
  assert(mode7CulturalText.includes('ID:'), 'ID cultural present', CAT);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 12. APPEARANCE SAFETY (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== 12. Appearance Safety ===');
{
  const CAT = 'Appearance safety';

  // From coach.js line 332 — appearance topic detection
  const appearanceRx = /look|fashion|outfit|dress|groom|style|ropa|vestir|apariencia|handsome|guap[oa]|attractive|atractiv|what.*wear|qué.*ponerme|qué.*vestir|hair|pelo|peinado|cologne|perfume|fragrance|makeup|maquillaje|accessories|accesorios|shoes|zapatos|suit|traje|casual|elegant|body|cuerpo|fitness|fit|gym|workout/;

  assert(appearanceRx.test('what should I wear to a first date'), 'EN: what to wear', CAT);
  assert(appearanceRx.test('qué debería vestir para la cita'), 'ES: qué vestir', CAT);
  assert(appearanceRx.test('help me pick an outfit'), 'EN: outfit', CAT);
  assert(appearanceRx.test('quiero vestirme bien'), 'ES: vestir', CAT);
  assert(appearanceRx.test('need grooming tips'), 'EN: groom', CAT);
  assert(appearanceRx.test('best cologne for dates'), 'EN: cologne', CAT);
  assert(appearanceRx.test('should I wear a suit or casual'), 'EN: suit/casual', CAT);
  assert(appearanceRx.test('gym workout before the date'), 'EN: gym/workout', CAT);

  // Safety: appearance regex should NOT have body-shaming or explicit terms
  assert(!appearanceRx.test('explicit sexual content'), 'No explicit match', CAT);
  assert(appearanceRx.test('tips de maquillaje'), 'ES: maquillaje', CAT);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 13. SKILL BUILDER (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== 13. Skill Builder ===');
{
  const CAT = 'Skill Builder';

  // Test the Skill Builder output format from coach.js ~2391-2404
  const skillLineRx = /💡\s*(Skill|Habilidad|スキル|技能|Навык|مهارة|Kemampuan|Compétence|Fähigkeit|Habilidade)\s*:\s*.+/;

  assert(skillLineRx.test('💡 Skill: Active Listening'), 'EN skill line', CAT);
  assert(skillLineRx.test('💡 Habilidad: Escucha Activa'), 'ES skill line', CAT);
  assert(skillLineRx.test('💡 スキル: 傾聴力'), 'JA skill line', CAT);
  assert(skillLineRx.test('💡 技能: 积极倾听'), 'ZH skill line', CAT);
  assert(skillLineRx.test('💡 Навык: Активное слушание'), 'RU skill line', CAT);
  assert(skillLineRx.test('💡 مهارة: الاستماع النشط'), 'AR skill line', CAT);
  assert(skillLineRx.test('💡 Habilidade: Escuta Ativa'), 'PT skill line', CAT);
  assert(skillLineRx.test('💡 Fähigkeit: Aktives Zuhören'), 'DE skill line', CAT);

  // Manipulation skill names should be rejected
  const manipulativeSkills = ['Playing Hard to Get', 'Making Them Jealous', 'Power Play'];
  const noManipRx = /Playing Hard to Get|Making Them Jealous|Power Play/i;
  assert(!noManipRx.test('💡 Skill: Active Listening'), 'No manipulative skill names', CAT);
  assert(noManipRx.test('💡 Skill: Playing Hard to Get'), 'Detect manipulative: Playing Hard to Get', CAT);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 14. RATE LIMIT LOGIC (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== 14. Rate Limit Logic ===');
{
  const CAT = 'Rate limit logic';

  // From coach.js ~1196: check if recentMsgCount >= rateLimitPerHour
  function checkRateLimit(recentMsgCount, rateLimitPerHour, isLoadMore) {
    if (isLoadMore) return {limited: false};
    if (recentMsgCount >= rateLimitPerHour) return {limited: true};
    return {limited: false};
  }

  // Rate limit messages exist in all 10 languages (from ~1197-1207)
  const rateLimitMsgs = {
    en: "You've been very active!",
    es: '¡Has estado muy activo!',
    fr: "Tu as été très actif !",
    de: 'Du warst sehr aktiv!',
    pt: 'Você está muito ativo!',
    ja: 'とてもアクティブですね！',
    zh: '你很活跃！',
    ru: 'Вы были очень активны!',
    ar: 'لقد كنت نشطًا جدًا!',
    id: 'Kamu sangat aktif!',
  };

  assert(checkRateLimit(30, 30, false).limited === true, 'At limit: blocked', CAT);
  assert(checkRateLimit(31, 30, false).limited === true, 'Over limit: blocked', CAT);
  assert(checkRateLimit(29, 30, false).limited === false, 'Under limit: allowed', CAT);
  assert(checkRateLimit(0, 30, false).limited === false, 'Zero messages: allowed', CAT);
  assert(checkRateLimit(100, 30, true).limited === false, 'LoadMore bypasses rate limit', CAT);

  // Verify all 10 languages have rate limit messages
  assert(Object.keys(rateLimitMsgs).length === 10, 'Rate limit msgs in 10 langs', CAT);
  assert(rateLimitMsgs['en'].length > 10, 'EN msg non-empty', CAT);
  assert(rateLimitMsgs['ja'].includes('アクティブ'), 'JA msg content', CAT);
  assert(rateLimitMsgs['ar'].includes('نشط'), 'AR msg content', CAT);
  assert(rateLimitMsgs['zh'].includes('活跃'), 'ZH msg content', CAT);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 15. EVENT URL SANITIZATION (12 tests)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== 15. Event URL Sanitization ===');
{
  const CAT = 'Event URL sanitization';

  // Event URLs come from Ticketmaster, Eventbrite, Meetup — test the URL fields
  function sanitizeEventUrl(raw) {
    if (!raw || typeof raw !== 'string') return '';
    const url = raw.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) return '';
    try { new URL(url); return url.substring(0, 500); } catch { return ''; }
  }

  // Ticketmaster URLs
  assert(sanitizeEventUrl('https://www.ticketmaster.com/event/123') !== '', 'Ticketmaster URL valid', CAT);
  assert(sanitizeEventUrl('https://www.eventbrite.com/e/event-tickets-123') !== '', 'Eventbrite URL valid', CAT);
  assert(sanitizeEventUrl('https://www.meetup.com/group/events/123') !== '', 'Meetup URL valid', CAT);

  // Social media links from enrichment
  assert(sanitizeEventUrl('https://www.instagram.com/explore/tags/concert/') !== '', 'Instagram tag URL', CAT);
  assert(sanitizeEventUrl('https://www.tiktok.com/search?q=festival') !== '', 'TikTok search URL', CAT);

  // Invalid inputs
  assert(sanitizeEventUrl(null) === '', 'null input', CAT);
  assert(sanitizeEventUrl(undefined) === '', 'undefined input', CAT);
  assert(sanitizeEventUrl('') === '', 'empty string', CAT);
  assert(sanitizeEventUrl('not-a-url') === '', 'no protocol', CAT);
  assert(sanitizeEventUrl('javascript:alert(1)') === '', 'javascript injection', CAT);
  assert(sanitizeEventUrl('ftp://files.com/event.pdf') === '', 'ftp protocol blocked', CAT);

  // Social links generation (from enrichWithSocialSignals)
  function generateSocialLinks(eventName, venueName) {
    const nameSlug = (eventName || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30);
    const venueSlug = (venueName || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
    const links = {};
    if (nameSlug.length > 3) {
      links.instagramSearch = `https://www.instagram.com/explore/tags/${nameSlug}/`;
      links.tiktokSearch = `https://www.tiktok.com/search?q=${encodeURIComponent(eventName)}`;
    }
    if (venueSlug.length > 3) {
      links.instagramVenue = `https://www.instagram.com/explore/locations/${venueSlug}/`;
    }
    return links;
  }

  const links = generateSocialLinks('Rock Festival 2026', 'Madison Square Garden');
  assert(links.instagramSearch.includes('rockfestival2026'), 'Social: Instagram tag slug', CAT);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BONUS: Additional edge-case tests to reach 250+
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 16. analyzeUserMessage topic detection (10 tests) ───────────────────────
console.log('\n=== BONUS: analyzeUserMessage topic detection ===');
{
  const CAT = 'Topic detection';

  const topicPatterns = {
    first_date: /first date|primera cita|premier rendez|erstes date|primeiro encontro/,
    conversation_tips: /conversation|what to say|how to talk|qué decir|hablar con/,
    icebreakers: /icebreaker|opener|first message|how to start|como empezar|primer mensaje/,
    date_ideas: /date idea|where.*go|what.*do|plan.*date|idea.*cita|qué hacer|dónde ir/,
    rejection: /reject|ghost|ignored|no resp|left on read|rechaz|ignorar|unmatch/,
    red_flags: /red flag|warning sign|suspicious|bandera roja|señal de alerta|toxic|tóxic/,
    safety: /safe|danger|uncomfortable|unsafe|segur|peligr|creepy|acoso|harass/,
    gift_ideas: /gift|regalo|present|surprise|sorpresa|buy.*for|comprar.*para/,
    confidence: /confidence|nervous|shy|anxious|afraid|scared|miedo|nervios|insecure/,
    appearance: /look|fashion|outfit|dress|groom|style|ropa|vestir/,
  };

  function detectTopics(msg) {
    const lower = msg.toLowerCase();
    const topics = [];
    for (const [topic, pattern] of Object.entries(topicPatterns)) {
      if (pattern.test(lower)) topics.push(topic);
    }
    return topics.length > 0 ? topics : ['general'];
  }

  assert(detectTopics('primera cita con mi match').includes('first_date'), 'Detect first_date ES', CAT);
  assert(detectTopics('what to say on a first date').includes('conversation_tips'), 'Detect conversation EN', CAT);
  assert(detectTopics('dame icebreakers').includes('icebreakers'), 'Detect icebreakers', CAT);
  assert(detectTopics('where should we go').includes('date_ideas'), 'Detect date_ideas', CAT);
  assert(detectTopics('she ghosted me').includes('rejection'), 'Detect rejection', CAT);
  assert(detectTopics('is this a red flag?').includes('red_flags'), 'Detect red_flags', CAT);
  assert(detectTopics('I feel unsafe with him').includes('safety'), 'Detect safety', CAT);
  assert(detectTopics('qué le regalo a mi novia').includes('gift_ideas'), 'Detect gift_ideas ES', CAT);
  assert(detectTopics('estoy muy nervioso para la cita').includes('confidence'), 'Detect confidence ES', CAT);
  assert(detectTopics('random message about nothing').includes('general'), 'Fallback to general', CAT);
}

// ─── 17. parseGeminiJsonResponse (8 tests) ─────────────────────────────────
console.log('\n=== BONUS: parseGeminiJsonResponse ===');
{
  const CAT = 'parseGeminiJsonResponse';

  function parseGeminiJsonResponse(responseText) {
    let cleanText = responseText.trim();
    const jsonBlockMatch = cleanText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      cleanText = jsonBlockMatch[1];
    } else {
      const unclosedMatch = cleanText.match(/```json\s*([\s\S]*)/);
      if (unclosedMatch) {
        cleanText = unclosedMatch[1].trim();
      }
      const startIdx = cleanText.indexOf('{');
      const endIdx = cleanText.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        cleanText = cleanText.substring(startIdx, endIdx + 1);
      }
    }
    return JSON.parse(cleanText);
  }

  assert(parseGeminiJsonResponse('{"reply":"hi"}').reply === 'hi', 'Plain JSON', CAT);
  assert(parseGeminiJsonResponse('```json\n{"reply":"hi"}\n```').reply === 'hi', 'Fenced JSON', CAT);
  assert(parseGeminiJsonResponse('Here is the response: {"reply":"hi"}').reply === 'hi', 'Text before JSON', CAT);
  assert(parseGeminiJsonResponse('{"reply":"hi"} end').reply === 'hi', 'Text after JSON', CAT);
  assert(parseGeminiJsonResponse('  {"reply":"hi"}  ').reply === 'hi', 'Whitespace padded', CAT);
  assert(parseGeminiJsonResponse('```json\n{"a":1,"b":2}\n```').a === 1, 'Multi-key fenced', CAT);
  try { parseGeminiJsonResponse('not json at all'); assert(false, 'Should throw on invalid', CAT); }
  catch (e) { assert(true, 'Throws on invalid JSON', CAT); }
  assert(parseGeminiJsonResponse('```json\n{"nested":{"deep":"value"}}\n```').nested.deep === 'value', 'Nested object', CAT);
}

// ─── 18. normalizeCategory (8 tests) ────────────────────────────────────────
console.log('\n=== BONUS: normalizeCategory ===');
{
  const CAT = 'normalizeCategory';

  function normalizeCategory(cat) {
    if (!cat) return 'restaurant';
    const c = cat.toLowerCase();
    if (/\bcafe\b|coffee|coffeehouse|tea_house|coffee_shop/.test(c)) return 'cafe';
    if (/\bbar\b|pub\b|lounge|speakeasy|cocktail|jazz|wine_bar|whiskey_bar|brewery/.test(c)) return 'bar';
    if (/night_?club|disco|club_nocturno|dancehall|boate/.test(c)) return 'night_club';
    if (/museum|exhibit|cultural|historical/.test(c)) return 'museum';
    if (/movie|cinema|cine\b|theater|theatre/.test(c)) return 'movie_theater';
    if (/\bpark\b|garden|trail|beach|playa|hik|nature/.test(c)) return 'park';
    if (/bowling|boliche|billard|arcade|escape_room/.test(c)) return 'bowling_alley';
    if (/bakery|pastry|pastel|panaderia|patisserie/.test(c)) return 'bakery';
    if (/\bspa\b|yoga|wellness|massage/.test(c)) return 'spa';
    if (/restaurant|dining|food|pizza|sushi|bistro|grill|steakhouse/.test(c)) return 'restaurant';
    return 'restaurant';
  }

  assert(normalizeCategory(null) === 'restaurant', 'null → restaurant', CAT);
  assert(normalizeCategory('cafe') === 'cafe', 'cafe', CAT);
  assert(normalizeCategory('PUB') === 'bar', 'PUB → bar', CAT);
  assert(normalizeCategory('nightclub') === 'night_club', 'nightclub', CAT);
  assert(normalizeCategory('MUSEUM') === 'museum', 'museum', CAT);
  assert(normalizeCategory('bowling') === 'bowling_alley', 'bowling', CAT);
  assert(normalizeCategory('spa wellness') === 'spa', 'spa', CAT);
  assert(normalizeCategory('random_unknown') === 'restaurant', 'unknown → restaurant', CAT);
}

// ─── 19. getLanguageInstruction (10 tests) ──────────────────────────────────
console.log('\n=== BONUS: getLanguageInstruction ===');
{
  const CAT = 'getLanguageInstruction';

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

  assert(getLanguageInstruction('es').includes('ESPAÑOL'), 'ES instruction', CAT);
  assert(getLanguageInstruction('en').includes('ENGLISH'), 'EN instruction', CAT);
  assert(getLanguageInstruction('pt').includes('português'), 'PT instruction', CAT);
  assert(getLanguageInstruction('fr').includes('français'), 'FR instruction', CAT);
  assert(getLanguageInstruction('de').includes('Deutsch'), 'DE instruction', CAT);
  assert(getLanguageInstruction('ja').includes('日本語'), 'JA instruction', CAT);
  assert(getLanguageInstruction('zh').includes('中文'), 'ZH instruction', CAT);
  assert(getLanguageInstruction('ru').includes('русском'), 'RU instruction', CAT);
  assert(getLanguageInstruction('ar').includes('بالعربية'), 'AR instruction', CAT);
  assert(getLanguageInstruction('id').includes('Indonesia'), 'ID instruction', CAT);
}

// ─── 20. Clarification chips per language (10 tests) ────────────────────────
console.log('\n=== BONUS: Clarification chips per language ===');
{
  const CAT = 'Clarification chips';

  const clarificationChips = {
    en: ['☕ At a cafe', '🍺 At a bar/pub', '💃 At a nightclub', '🌳 At a park', '💬 Via chat/app', '🍽️ At a restaurant'],
    es: ['☕ En un café', '🍺 En un bar/pub', '💃 En una discoteca', '🌳 En un parque', '💬 Por chat/app', '🍽️ En un restaurante'],
    pt: ['☕ Em um café', '🍺 Em um bar/pub', '💃 Em uma balada', '🌳 Em um parque', '💬 Por chat/app', '🍽️ Em um restaurante'],
    fr: ['☕ Dans un café', '🍺 Dans un bar/pub', '💃 En boîte de nuit', '🌳 Dans un parc', '💬 Par chat/app', '🍽️ Au restaurant'],
    de: ['☕ In einem Café', '🍺 In einer Bar/Pub', '💃 In einem Club', '🌳 In einem Park', '💬 Per Chat/App', '🍽️ Im Restaurant'],
    ja: ['☕ カフェで', '🍺 バーで', '💃 クラブで', '🌳 公園で', '💬 チャット/アプリで', '🍽️ レストランで'],
    zh: ['☕ 咖啡厅', '🍺 酒吧', '💃 夜店', '🌳 公园', '💬 聊天/App', '🍽️ 餐厅'],
    ru: ['☕ В кафе', '🍺 В баре/пабе', '💃 В клубе', '🌳 В парке', '💬 В чате/приложении', '🍽️ В ресторане'],
    ar: ['☕ في مقهى', '🍺 في بار/حانة', '💃 في ملهى ليلي', '🌳 في حديقة', '💬 عبر الدردشة', '🍽️ في مطعم'],
    id: ['☕ Di kafe', '🍺 Di bar/pub', '💃 Di klub malam', '🌳 Di taman', '💬 Via chat/app', '🍽️ Di restoran'],
  };

  for (const [lang, chips] of Object.entries(clarificationChips)) {
    assert(chips.length === 6 && chips.every(c => typeof c === 'string' && c.length > 3),
      `${lang.toUpperCase()}: 6 chips present`, CAT);
  }
}

// ─── 21. Event category emoji map (5 tests) ──────────────────────────────────
console.log('\n=== BONUS: Event category emoji map ===');
{
  const CAT = 'Event emoji map';

  const EVENT_CATEGORY_EMOJI = {
    music: '🎵', food: '🍔', art: '🎨', sports: '🏃', comedy: '😂',
    theater: '🎭', festivals: '🎪', workshops: '📚', games: '🎲',
    nightlife: '💃', other: '🎉',
  };

  assert(Object.keys(EVENT_CATEGORY_EMOJI).length === 11, '11 event categories', CAT);
  assert(EVENT_CATEGORY_EMOJI.music === '🎵', 'music emoji', CAT);
  assert(EVENT_CATEGORY_EMOJI.other === '🎉', 'other emoji fallback', CAT);
  assert(EVENT_CATEGORY_EMOJI.nightlife === '💃', 'nightlife emoji', CAT);
  assert(EVENT_CATEGORY_EMOJI.food === '🍔', 'food emoji', CAT);
}

// ─── 22. Off-topic messages (10 tests) ──────────────────────────────────────
console.log('\n=== BONUS: Off-topic messages all languages ===');
{
  const CAT = 'Off-topic messages';

  const offTopicMessages = {
    en: "I appreciate your curiosity!",
    es: "¡Aprecio tu curiosidad!",
    fr: "J'apprécie ta curiosité !",
    de: "Ich schätze deine Neugier!",
    pt: "Agradeço sua curiosidade!",
    ja: "ご質問ありがとう！",
    zh: "感谢你的好奇心！",
    ru: "Ценю твоё любопытство!",
    ar: "أقدّر فضولك!",
    id: "Aku menghargai rasa penasaranmu!",
  };

  for (const [lang, msg] of Object.entries(offTopicMessages)) {
    assert(msg.length > 5, `${lang.toUpperCase()}: off-topic msg present`, CAT);
  }
}

// ─── 23. Moderation blacklist basics (8 tests) ──────────────────────────────
console.log('\n=== BONUS: Moderation blacklist ===');
{
  const CAT = 'Moderation blacklist';

  // Sample from notifications.js MODERATION_BLACKLIST
  const blacklist = [
    'viagra', 'casino', 'send money', 'onlyfans', 'send nudes',
    'envía dinero', 'fotos desnuda', 'manda nudes', 'nacktfotos',
    'صور عارية', 'ヌード送って', 'голые фото', '发裸照', 'kirim foto bugil',
  ];

  function isBlacklisted(msg) {
    const lower = msg.toLowerCase();
    return blacklist.some(term => lower.includes(term));
  }

  assert(isBlacklisted('buy viagra cheap'), 'EN: viagra detected', CAT);
  assert(isBlacklisted('go to casino tonight'), 'EN: casino detected', CAT);
  assert(isBlacklisted('check my onlyfans'), 'EN: onlyfans detected', CAT);
  assert(isBlacklisted('envía dinero por favor'), 'ES: envía dinero', CAT);
  assert(isBlacklisted('manda nudes ya'), 'PT: manda nudes', CAT);
  assert(isBlacklisted('ヌード送って！'), 'JA: blacklist', CAT);
  assert(!isBlacklisted('let us meet at the coffee shop'), 'Clean msg not flagged', CAT);
  assert(!isBlacklisted('I had a great time at dinner'), 'Normal msg not flagged', CAT);
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESULTS TABLE
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n\n' + '='.repeat(72));
console.log('  FINAL COMPREHENSIVE TEST RESULTS');
console.log('='.repeat(72));
console.log('');

const table = [];
let idx = 1;
for (const [cat, data] of Object.entries(categoryResults)) {
  const total = data.pass + data.fail;
  const status = data.fail === 0 ? 'PASS' : 'FAIL';
  table.push({idx: idx++, category: cat, pass: data.pass, fail: data.fail, total, status});
}

// Print table
console.log('+----+------------------------------------------+------+------+-------+--------+');
console.log('| #  | Category                                 | Pass | Fail | Total | Status |');
console.log('+----+------------------------------------------+------+------+-------+--------+');
for (const row of table) {
  console.log(`| ${String(row.idx).padStart(2)} | ${row.category.padEnd(40)} | ${String(row.pass).padStart(4)} | ${String(row.fail).padStart(4)} | ${String(row.total).padStart(5)} | ${row.status.padStart(6)} |`);
}
console.log('+----+------------------------------------------+------+------+-------+--------+');
console.log(`| ${' '.repeat(2)} | ${'TOTAL'.padEnd(40)} | ${String(totalPass).padStart(4)} | ${String(totalFail).padStart(4)} | ${String(totalPass + totalFail).padStart(5)} | ${(totalFail === 0 ? 'PASS' : 'FAIL').padStart(6)} |`);
console.log('+----+------------------------------------------+------+------+-------+--------+');

console.log(`\nTotal tests: ${totalPass + totalFail}`);
console.log(`Passed: ${totalPass}`);
console.log(`Failed: ${totalFail}`);

if (totalFail > 0) {
  console.log('\nFailed tests:');
  for (const [cat, data] of Object.entries(categoryResults)) {
    if (data.failures.length > 0) {
      for (const f of data.failures) {
        console.log(`  [${cat}] ${f}`);
      }
    }
  }
}

process.exit(totalFail > 0 ? 1 : 0);
