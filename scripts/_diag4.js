#!/usr/bin/env node
'use strict';
const admin = require('firebase-admin');
const sa = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const REVIEWER_UID = 'g4Zbr8tEguMcpZonw72xM5MGse32';

async function main() {
  const revSnap = await db.collection('users').doc(REVIEWER_UID).get();
  const revData = revSnap.data();
  
  // Build excludedIds (same logic as discovery.js)
  const excludedIds = new Set();
  excludedIds.add(REVIEWER_UID);
  
  // Add liked/passed
  (revData.liked || []).forEach(uid => excludedIds.add(uid));
  (revData.passed || []).forEach(uid => excludedIds.add(uid));
  
  // Add matches
  const matchSnap = await db.collection('matches')
    .where('usersMatched', 'array-contains', REVIEWER_UID).get();
  matchSnap.docs.forEach(d => {
    const users = d.data().usersMatched || [];
    users.forEach(uid => { if (uid !== REVIEWER_UID) excludedIds.add(uid); });
  });
  
  // Add swipes
  const swipesSnap = await db.collection('swipes').doc(REVIEWER_UID)
    .collection('swipes').get();
  swipesSnap.docs.forEach(d => excludedIds.add(d.id));
  
  // Add blocked
  (revData.blocked || []).forEach(uid => excludedIds.add(uid));
  
  console.log(`excludedIds total: ${excludedIds.size}`);
  
  // Get all isReviewer profiles
  const allSnap = await db.collection('users').where('isReviewer', '==', true).get();
  
  let wouldShow = 0;
  let wouldFilter = 0;
  
  for (const doc of allSnap.docs) {
    if (doc.id === REVIEWER_UID) continue;
    const d = doc.data();
    const excluded = excludedIds.has(doc.id);
    const status = excluded ? '❌ EXCLUDED' : '✅ SHOWS';
    console.log(`${status}  ${d.name.padEnd(22)} stories:${(d.stories||[]).length || '?'}`);
    if (excluded) wouldFilter++; else wouldShow++;
  }
  
  console.log(`\n=== RESULT ===`);
  console.log(`Would show in swipe: ${wouldShow}`);
  console.log(`Would filter out:    ${wouldFilter}`);
  console.log(`(of ${allSnap.size - 1} total reviewer profiles)`);
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
