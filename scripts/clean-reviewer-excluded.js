#!/usr/bin/env node
/**
 * Limpia swipes/passed/liked subcollections y arrays del reviewer
 * para perfiles de test (isReviewer/isTest).
 */
'use strict';
const admin = require('firebase-admin');
const sa = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const REVIEWER_UID = 'g4Zbr8tEguMcpZonw72xM5MGse32';
const TEST_IDS = [
  'QcJQnvStaVUfSLNUj7gclSbfNb23',
  'dJmbm2hyEvaoUJjzZpbxpvKLSir2',
  'koM4RY8OqxSslmuMRPlVnDKSzg22',
];

async function main() {
  console.log('Cleaning reviewer excluded collections...\n');

  // 1. Delete from swipes subcollection
  for (const id of TEST_IDS) {
    try {
      await db.collection('users').doc(REVIEWER_UID).collection('swipes').doc(id).delete();
      console.log(`  ✅ Deleted swipes/${id}`);
    } catch (e) {
      console.log(`  ⚠️ swipes/${id}: ${e.message}`);
    }
  }

  // 2. Remove from passed array
  await db.collection('users').doc(REVIEWER_UID).update({
    passed: FieldValue.arrayRemove(...TEST_IDS),
  });
  console.log('  ✅ Removed from passed array');

  // 3. Also remove from liked array (just in case)
  await db.collection('users').doc(REVIEWER_UID).update({
    liked: FieldValue.arrayRemove(...TEST_IDS),
  });
  console.log('  ✅ Removed from liked array');

  // 4. Delete from liked subcollection (just in case)
  for (const id of TEST_IDS) {
    try {
      await db.collection('users').doc(REVIEWER_UID).collection('liked').doc(id).delete();
    } catch (_) {}
  }
  console.log('  ✅ Cleaned liked subcollection');

  // 5. Verify
  const swipes = await db.collection('users').doc(REVIEWER_UID).collection('swipes').get();
  const userDoc = await db.collection('users').doc(REVIEWER_UID).get();
  const data = userDoc.data();
  console.log(`\n=== VERIFICATION ===`);
  console.log(`  swipes subcol: ${swipes.size}`);
  console.log(`  liked array: ${(data.liked || []).length}`);
  console.log(`  passed array: ${(data.passed || []).length}`);
  console.log('\nDone!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
