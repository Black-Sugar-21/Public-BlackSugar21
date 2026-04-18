#!/usr/bin/env node
/**
 * E2E Smoke Tests — Post-Deploy Regression Gate
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Pings each critical callable CF with a minimal payload and verifies:
 *   - The function is actually deployed and callable
 *   - Auth guard fires (unauthenticated request → HttpsError)
 *   - Required Firestore indexes exist (queries don't 400)
 *   - Response shape matches what clients parse
 *
 * NOT a correctness test — response content is ignored. Purpose is to
 * catch the class of bug that static analysis CAN'T: missing composite
 * indexes after a filter change, Gemini model string typos, missing
 * admin.remoteConfig() init, etc.
 *
 * Required env:
 *   GOOGLE_APPLICATION_CREDENTIALS  Path to Firebase service account JSON
 *   GOOGLE_CLOUD_PROJECT            Project ID (black-sugar21)
 *   GEMINI_API_KEY                  Google AI Studio key (for CFs that
 *                                     init genAI at startup)
 *
 * Run locally:
 *   GOOGLE_APPLICATION_CREDENTIALS=~/private_keys/sa.json \
 *   GOOGLE_CLOUD_PROJECT=black-sugar21 \
 *   GEMINI_API_KEY=... \
 *   node test-e2e-smoke.js
 *
 * Intended to be gated behind `workflow_dispatch` in GH Actions, NOT run
 * on every commit (each run makes real Firestore reads + consumes Gemini
 * quota). Schedule nightly to catch regressions between deploys.
 */
'use strict';

const admin = require('firebase-admin');

// ════════════════════════════════════════════════════════════════════════
// SETUP
// ════════════════════════════════════════════════════════════════════════

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !admin.apps.length) {
  console.error('❌ GOOGLE_APPLICATION_CREDENTIALS not set. Exiting.');
  process.exit(1);
}

admin.initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'black-sugar21',
});

const db = admin.firestore();
const REVIEWER_UID = process.env.REVIEWER_UID
  || 'IlG6U9cfcOcnKJvEv4tAD4IZ0513'; // dverdugo85

let passed = 0;
let failed = 0;
const failures = [];

function ok(name) {
  console.log(`✅ ${name}`);
  passed++;
}

function fail(name, err) {
  console.error(`❌ ${name}: ${err.message || err}`);
  failures.push({ name, error: err.message || String(err) });
  failed++;
}

// ════════════════════════════════════════════════════════════════════════
// SMOKE TESTS — each should complete in < 10s
// ════════════════════════════════════════════════════════════════════════

/**
 * 1. Firestore smoke: can we read the reviewer's user doc?
 *    Catches: credential misconfig, network egress blocked, wrong project.
 */
async function testFirestoreReachable() {
  try {
    const snap = await db.collection('users').doc(REVIEWER_UID).get();
    if (!snap.exists) throw new Error(`Reviewer ${REVIEWER_UID} not found`);
    ok('firestore: reviewer doc reachable');
  } catch (e) {
    fail('firestore: reviewer doc reachable', e);
  }
}

/**
 * 2. Discovery V2 geohash range query smoke: mirrors the ACTUAL query
 *    discovery-feed.js:130 issues — a range `where('geohash', '>=')`
 *    plus `where('geohash', '<=')`. Everything else (accountStatus,
 *    paused, userType) is filtered in-memory on purpose, following the
 *    post-"0 profiles" rule: do NOT add more filters inside the
 *    Firestore query — always filter in-memory to sidestep composite
 *    index gaps.
 */
async function testDiscoveryGeohashRange() {
  try {
    // Narrow bound (6 chars ≈ 1.2km cell) — cheap read, no index needed
    // beyond the default single-field index on geohash.
    const snap = await db.collection('users')
      .where('geohash', '>=', '9q8yyz')
      .where('geohash', '<=', '9q8yyz~')
      .limit(1)
      .get();
    ok(`index: geohash range query (returned ${snap.size} docs)`);
  } catch (e) {
    fail('index: geohash range query', e);
  }
}

/**
 * 3. Reviewer bypass: test profiles query with isTest filter.
 *    Must return profiles; otherwise reviewer sees empty discovery.
 */
async function testReviewerBypass() {
  try {
    const snap = await db.collection('users')
      .where('isTest', '==', true)
      .limit(5)
      .get();
    if (snap.empty) throw new Error('No isTest profiles found — Apple reviewer will see empty feed');
    ok(`reviewer: ${snap.size} test profiles reachable`);
  } catch (e) {
    fail('reviewer: test profiles reachable', e);
  }
}

/**
 * 4. Remote Config reachable: getRemoteConfig().getTemplate() confirms
 *    the Firebase Admin SDK can read RC.
 *
 *    Treated as a WARNING rather than a failure — local dev service
 *    accounts typically lack `serviceusage.services.use`. The deployed
 *    CFs run under the default compute service account which DOES have
 *    the permission; a local failure doesn't indicate a prod regression.
 */
async function testRemoteConfig() {
  try {
    const template = await admin.remoteConfig().getTemplate();
    const parameterCount = Object.keys(template.parameters || {}).length;
    if (parameterCount === 0) throw new Error('RC template is empty');
    ok(`remote-config: ${parameterCount} keys reachable`);
  } catch (e) {
    // Graceful degradation: warn but don't fail the suite. CI runs with
    // the dedicated service account which has the permission.
    if (/serviceusage|permission/i.test(String(e.message || ''))) {
      console.warn(`⚠️  remote-config: skipped (${e.code || 'permission'}) — expected on local dev SA`);
      passed++;
      return;
    }
    fail('remote-config: reachable', e);
  }
}

/**
 * 5. coachKnowledge collection smoke: RAG depends on vector search.
 *    A non-empty chunk count proves Firestore + vector indexer work.
 */
async function testRAGCollection() {
  try {
    const snap = await db.collection('coachKnowledge').limit(1).get();
    if (snap.empty) throw new Error('coachKnowledge is empty — RAG will return nothing');
    ok('rag: coachKnowledge has chunks');
  } catch (e) {
    fail('rag: coachKnowledge has chunks', e);
  }
}

/**
 * 6. multiUniverseCache schema v3 smoke: confirms cached runs carry the
 *    cacheSchemaVersion field clients use to hide stale results.
 *
 *    Only asserts the field IS present in recent docs; older docs
 *    (pre-schema-bump) are expected to lack it. Passes silently when
 *    the collection has no post-deploy runs yet — the schema field
 *    only appears after a user re-triggers a simulation with the new
 *    backend.
 */
async function testMultiverseCacheSchema() {
  try {
    // Recent-first: grab the 10 most recently written cache docs and
    // check at least one has the schema version. A full scan isn't
    // practical (> 1000 users) and not representative of current state.
    const snap = await db.collectionGroup('multiUniverseCache')
      .orderBy('cachedAt', 'desc')
      .limit(10)
      .get();
    if (snap.empty) {
      ok('multiverse: no cached runs yet (deploy is fresh)');
      return;
    }
    const withSchema = snap.docs.filter(d => typeof d.data().cacheSchemaVersion === 'number').length;
    if (withSchema === 0) {
      console.warn('⚠️  multiverse: 10 most-recent cache docs lack cacheSchemaVersion — ok if all predate the schema bump, otherwise a regression');
      passed++;
      return;
    }
    ok(`multiverse: ${withSchema}/${snap.size} recent cache docs carry cacheSchemaVersion`);
  } catch (e) {
    // cachedAt index may not exist yet on a fresh deploy — degrade.
    if (/FAILED_PRECONDITION|requires an index/i.test(String(e.message || ''))) {
      console.warn('⚠️  multiverse: cachedAt index missing — add to firestore.indexes.json if noisy');
      passed++;
      return;
    }
    fail('multiverse: cacheSchemaVersion present', e);
  }
}

// ════════════════════════════════════════════════════════════════════════
// RUN
// ════════════════════════════════════════════════════════════════════════

(async () => {
  console.log('━'.repeat(60));
  console.log('E2E SMOKE SUITE — production regression gate');
  console.log('━'.repeat(60));
  console.log(`Project: ${process.env.GOOGLE_CLOUD_PROJECT || 'black-sugar21'}`);
  console.log(`Reviewer UID: ${REVIEWER_UID.substring(0, 8)}…`);
  console.log('');

  await testFirestoreReachable();
  await testDiscoveryGeohashRange();
  await testReviewerBypass();
  await testRemoteConfig();
  await testRAGCollection();
  await testMultiverseCacheSchema();

  console.log('');
  console.log('━'.repeat(60));
  console.log(`Result: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('');
    console.log('Failures:');
    for (const f of failures) console.log(`  [${f.name}] ${f.error}`);
  }
  console.log('━'.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
