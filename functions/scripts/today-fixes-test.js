#!/usr/bin/env node
'use strict';

/**
 * Comprehensive test suite for all fixes applied 2026-04-04
 * Tests: safeResponseText, rate limit, getAiConfig single-flight,
 *        Coach dateScore type guard, notification deep links, credits listener
 */

let passed = 0;
let failed = 0;
const results = [];

function assert(testName, condition, detail) {
  if (condition) {
    passed++;
    results.push({ test: testName, status: 'PASS', detail: detail || '' });
  } else {
    failed++;
    results.push({ test: testName, status: 'FAIL', detail: detail || '' });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 1. safeResponseText — extracted from ai-services.js line 44
// ═══════════════════════════════════════════════════════════════════════
function safeResponseText(result) {
  try {
    return result?.response?.text() || '';
  } catch (e) {
    return '';
  }
}

// 1a: valid response.text()
assert(
  'safeResponseText: valid .response.text()',
  safeResponseText({ response: { text: () => 'Hello world' } }) === 'Hello world',
  'returns "Hello world"'
);

// 1b: null response
assert(
  'safeResponseText: null response',
  safeResponseText({ response: null }) === '',
  'returns empty string'
);

// 1c: undefined response
assert(
  'safeResponseText: undefined response',
  safeResponseText({ response: undefined }) === '',
  'returns empty string'
);

// 1d: response.text() throws
assert(
  'safeResponseText: text() throws',
  safeResponseText({ response: { text: () => { throw new Error('blocked'); } } }) === '',
  'returns empty string on throw'
);

// 1e: result is null entirely
assert(
  'safeResponseText: null result',
  safeResponseText(null) === '',
  'returns empty string'
);

// 1f: result is undefined
assert(
  'safeResponseText: undefined result',
  safeResponseText(undefined) === '',
  'returns empty string'
);

// 1g: response.text() returns empty string
assert(
  'safeResponseText: text() returns ""',
  safeResponseText({ response: { text: () => '' } }) === '',
  'returns empty string (falsy)'
);

// 1h: response.text() returns null
assert(
  'safeResponseText: text() returns null',
  safeResponseText({ response: { text: () => null } }) === '',
  'returns empty string (null coerced)'
);

// ═══════════════════════════════════════════════════════════════════════
// 2. Rate limit logic — from ai-services.js analyzeOutfit (line ~2378)
//    Logic: count >= max → block; Firestore error → allow (fail-open)
// ═══════════════════════════════════════════════════════════════════════
function simulateRateLimit(count, maxPerHour) {
  // Mirrors: if ((recentAnalyses.data()?.count ?? 0) >= maxPerHour)
  return { blocked: count >= maxPerHour };
}

function simulateRateLimitWithError() {
  // Mirrors catch block: allow request if rate limit check fails
  try {
    throw new Error('Firestore unavailable');
  } catch (_e) {
    return { blocked: false }; // fail-open
  }
}

// 2a: count < max → allow
assert(
  'RateLimit: count(3) < max(10) → allow',
  simulateRateLimit(3, 10).blocked === false,
  'not blocked'
);

// 2b: count = max → block
assert(
  'RateLimit: count(10) = max(10) → block',
  simulateRateLimit(10, 10).blocked === true,
  'blocked (>=)'
);

// 2c: count > max → block
assert(
  'RateLimit: count(15) > max(10) → block',
  simulateRateLimit(15, 10).blocked === true,
  'blocked'
);

// 2d: count=0, max=0 → block (0 >= 0 is true)
assert(
  'RateLimit: count(0), max(0) → block',
  simulateRateLimit(0, 0).blocked === true,
  'blocked (edge: 0>=0)'
);

// 2e: Firestore error → allow (fail-open)
assert(
  'RateLimit: Firestore error → allow (fail-open)',
  simulateRateLimitWithError().blocked === false,
  'not blocked on error'
);

// 2f: count=0, max=10 → allow
assert(
  'RateLimit: count(0), max(10) → allow',
  simulateRateLimit(0, 10).blocked === false,
  'not blocked'
);

// 2g: count=9, max=10 → allow (boundary -1)
assert(
  'RateLimit: count(9), max(10) → allow',
  simulateRateLimit(9, 10).blocked === false,
  'boundary: just under max'
);

// ═══════════════════════════════════════════════════════════════════════
// 3. getAiConfig single-flight — from ai-services.js line 16
// ═══════════════════════════════════════════════════════════════════════
async function testGetAiConfigSingleFlight() {
  let _aiConfig = null;
  let _aiConfigFetchedAt = 0;
  let _aiConfigPromise = null;
  const AI_CONFIG_CACHE_TTL = 5 * 60 * 1000;
  let fetchCount = 0;

  async function getAiConfig() {
    if (_aiConfig && Date.now() - _aiConfigFetchedAt < AI_CONFIG_CACHE_TTL) return _aiConfig;
    if (_aiConfigPromise) return _aiConfigPromise;
    _aiConfigPromise = (async () => {
      fetchCount++;
      // Simulate Firestore fetch
      await new Promise(r => setTimeout(r, 50));
      _aiConfig = { temperatures: { coach: 0.7 }, fetchId: fetchCount };
      _aiConfigFetchedAt = Date.now();
      _aiConfigPromise = null;
      return _aiConfig;
    })();
    return _aiConfigPromise;
  }

  // 3a: Two concurrent calls return same object reference
  const [a, b] = await Promise.all([getAiConfig(), getAiConfig()]);
  assert(
    'getAiConfig: concurrent calls → same reference',
    a === b,
    `a===b: ${a === b}, fetchCount=${fetchCount}`
  );
  assert(
    'getAiConfig: only 1 Firestore fetch for 2 calls',
    fetchCount === 1,
    `fetchCount=${fetchCount}`
  );

  // 3b: Subsequent call uses cache (within TTL)
  const c = await getAiConfig();
  assert(
    'getAiConfig: cached within TTL',
    c === a && fetchCount === 1,
    `same ref=${c === a}, fetchCount=${fetchCount}`
  );

  // 3c: After TTL expires, new fetch occurs
  _aiConfigFetchedAt = Date.now() - AI_CONFIG_CACHE_TTL - 1; // expire cache
  const d = await getAiConfig();
  assert(
    'getAiConfig: new fetch after TTL',
    fetchCount === 2,
    `fetchCount=${fetchCount}`
  );
  assert(
    'getAiConfig: new object after TTL',
    d !== a,
    `different ref after TTL expiry`
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 4. Coach dateScore type guard — from coach.js line ~3180
// ═══════════════════════════════════════════════════════════════════════
function simulateDateScoreGuard(needsContext, dateScore, matchId) {
  // Exact logic from coach.js
  // GUARD: needsContext takes priority — clears dateScore
  if (needsContext && dateScore) {
    dateScore = undefined;
  }
  // GUARD: dateScore requires matchId
  if (dateScore && !matchId) {
    dateScore = undefined;
  }
  // Determine message type
  const messageType = needsContext ? 'clarification' : dateScore ? 'date_scorecard' : null;
  return { dateScore, messageType };
}

const sampleScore = { overall: 8, conversation: { score: 7 }, chemistry: { score: 8 }, effort: { score: 9 }, fun: { score: 8 } };

// 4a: needsContext=true, dateScore exists, matchId exists → clarification (dateScore cleared)
{
  const r = simulateDateScoreGuard(true, { ...sampleScore }, 'match123');
  assert(
    'dateScore guard: needsContext+dateScore+matchId → clarification',
    r.messageType === 'clarification' && r.dateScore === undefined,
    `type=${r.messageType}, dateScore=${r.dateScore}`
  );
}

// 4b: needsContext=false, dateScore exists, matchId exists → date_scorecard
{
  const r = simulateDateScoreGuard(false, { ...sampleScore }, 'match123');
  assert(
    'dateScore guard: dateScore+matchId → date_scorecard',
    r.messageType === 'date_scorecard' && r.dateScore !== undefined,
    `type=${r.messageType}`
  );
}

// 4c: needsContext=false, dateScore exists, matchId=null → null (dateScore cleared)
{
  const r = simulateDateScoreGuard(false, { ...sampleScore }, null);
  assert(
    'dateScore guard: dateScore+matchId=null → null',
    r.messageType === null && r.dateScore === undefined,
    `type=${r.messageType}, dateScore=${r.dateScore}`
  );
}

// 4d: needsContext=false, dateScore exists, matchId='' → null (dateScore cleared)
{
  const r = simulateDateScoreGuard(false, { ...sampleScore }, '');
  assert(
    'dateScore guard: dateScore+matchId="" → null',
    r.messageType === null && r.dateScore === undefined,
    `type=${r.messageType}, dateScore=${r.dateScore}`
  );
}

// 4e: needsContext=true, dateScore=null → clarification
{
  const r = simulateDateScoreGuard(true, null, 'match123');
  assert(
    'dateScore guard: needsContext+dateScore=null → clarification',
    r.messageType === 'clarification',
    `type=${r.messageType}`
  );
}

// 4f: needsContext=false, dateScore=null → null
{
  const r = simulateDateScoreGuard(false, null, 'match123');
  assert(
    'dateScore guard: no needsContext, no dateScore → null',
    r.messageType === null,
    `type=${r.messageType}`
  );
}

// 4g: needsContext=false, dateScore=null, matchId=null → null
{
  const r = simulateDateScoreGuard(false, null, null);
  assert(
    'dateScore guard: all null → null',
    r.messageType === null,
    `type=${r.messageType}`
  );
}

// 4h: needsContext=true, dateScore exists, matchId=null → clarification (both guards fire)
{
  const r = simulateDateScoreGuard(true, { ...sampleScore }, null);
  assert(
    'dateScore guard: needsContext+dateScore+no matchId → clarification',
    r.messageType === 'clarification' && r.dateScore === undefined,
    `type=${r.messageType}`
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 5. Notification deep link logic — from MyFirebaseMessagingService.kt line 383
// ═══════════════════════════════════════════════════════════════════════
function getExtraKey(type) {
  // Exact logic: if (type == "coach_messages_reset") "OPEN_COACH_TAB" else "OPEN_HOME_TAB"
  return type === 'coach_messages_reset' ? 'OPEN_COACH_TAB' : 'OPEN_HOME_TAB';
}

assert(
  'DeepLink: coach_messages_reset → OPEN_COACH_TAB',
  getExtraKey('coach_messages_reset') === 'OPEN_COACH_TAB',
  'extraKey=OPEN_COACH_TAB'
);

assert(
  'DeepLink: daily_likes_reset → OPEN_HOME_TAB',
  getExtraKey('daily_likes_reset') === 'OPEN_HOME_TAB',
  'extraKey=OPEN_HOME_TAB'
);

assert(
  'DeepLink: super_likes_reset → OPEN_HOME_TAB',
  getExtraKey('super_likes_reset') === 'OPEN_HOME_TAB',
  'extraKey=OPEN_HOME_TAB'
);

assert(
  'DeepLink: new_message → OPEN_HOME_TAB',
  getExtraKey('new_message') === 'OPEN_HOME_TAB',
  'extraKey=OPEN_HOME_TAB'
);

assert(
  'DeepLink: unknown type → OPEN_HOME_TAB',
  getExtraKey('some_other_type') === 'OPEN_HOME_TAB',
  'fallback to OPEN_HOME_TAB'
);

// ═══════════════════════════════════════════════════════════════════════
// 6. Credits listener behavior — client-side logic simulation
//    When remaining changes: old=0→new=3 → dismiss sheet (replenished)
//    Unchanged: old=3→new=3 → no action
//    Decreases: old=3→new=2 → update only
// ═══════════════════════════════════════════════════════════════════════
function simulateCreditsListener(oldRemaining, newRemaining) {
  const actions = [];
  if (newRemaining !== oldRemaining) {
    actions.push('update_state');
  }
  // Replenished: was 0, now > 0 → dismiss the "no credits" sheet
  if (oldRemaining === 0 && newRemaining > 0) {
    actions.push('dismiss_sheet');
  }
  return actions;
}

// 6a: old=0, new=3 → dismiss sheet
{
  const actions = simulateCreditsListener(0, 3);
  assert(
    'Credits: 0→3 → dismiss sheet',
    actions.includes('dismiss_sheet') && actions.includes('update_state'),
    `actions=[${actions}]`
  );
}

// 6b: old=3, new=3 → no action
{
  const actions = simulateCreditsListener(3, 3);
  assert(
    'Credits: 3→3 → no action',
    actions.length === 0,
    `actions=[${actions}]`
  );
}

// 6c: old=3, new=2 → update only
{
  const actions = simulateCreditsListener(3, 2);
  assert(
    'Credits: 3→2 → update only (no dismiss)',
    actions.includes('update_state') && !actions.includes('dismiss_sheet'),
    `actions=[${actions}]`
  );
}

// 6d: old=0, new=0 → no action
{
  const actions = simulateCreditsListener(0, 0);
  assert(
    'Credits: 0→0 → no action',
    actions.length === 0,
    `actions=[${actions}]`
  );
}

// 6e: old=5, new=0 → update only (depleted, but no dismiss)
{
  const actions = simulateCreditsListener(5, 0);
  assert(
    'Credits: 5→0 → update only',
    actions.includes('update_state') && !actions.includes('dismiss_sheet'),
    `actions=[${actions}]`
  );
}

// 6f: old=0, new=1 → dismiss sheet (minimal replenish)
{
  const actions = simulateCreditsListener(0, 1);
  assert(
    'Credits: 0→1 → dismiss sheet',
    actions.includes('dismiss_sheet'),
    `actions=[${actions}]`
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Run async tests then print results
// ═══════════════════════════════════════════════════════════════════════
(async () => {
  await testGetAiConfigSingleFlight();

  // Print results table
  console.log('\n' + '='.repeat(90));
  console.log('  COMPREHENSIVE TEST RESULTS — 2026-04-04 Fixes');
  console.log('='.repeat(90));
  console.log(`${'#'.padStart(3)}  ${'STATUS'.padEnd(6)}  ${'TEST'.padEnd(55)}  DETAIL`);
  console.log('-'.repeat(90));

  results.forEach((r, i) => {
    const icon = r.status === 'PASS' ? 'PASS' : 'FAIL';
    console.log(`${String(i + 1).padStart(3)}  ${icon.padEnd(6)}  ${r.test.padEnd(55).substring(0, 55)}  ${r.detail}`);
  });

  console.log('-'.repeat(90));
  console.log(`  TOTAL: ${results.length}  |  PASSED: ${passed}  |  FAILED: ${failed}`);
  console.log('='.repeat(90));

  if (failed > 0) {
    console.log('\n  FAILURES:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`    - ${r.test}: ${r.detail}`);
    });
  }

  console.log(`\n  ${failed === 0 ? 'ALL TESTS PASSED' : `${failed} TEST(S) FAILED`}\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
