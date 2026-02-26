/**
 * fix-missing-fields.js — Inicializar campos faltantes en usuarios existentes.
 *
 * Campos que deben existir en cada documento users/{userId}:
 *   - superLikesUsedToday: 0
 *   - visibilityReduced: false
 *   - superLikesRemaining: 5
 *   - dailyLikesRemaining: random(50..100)
 *   - dailyLikesLimit: = dailyLikesRemaining
 *   - lastLikeResetDate: now
 *   - lastSuperLikeResetDate: now
 *   - accountStatus: "active"
 *   - paused: false
 *   - blocked: []
 *
 * Uso:
 *   cd /Users/daniel/IdeaProjects/Public-BlackSugar21
 *   node scripts/fix-missing-fields.js
 */
const admin = require('firebase-admin');

const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'black-sugar21.firebasestorage.app',
});

async function fixMissingUserFields() {
  const db = admin.firestore();
  const usersSnap = await db.collection('users').get();

  console.log(`📋 Revisando ${usersSnap.docs.length} usuarios...`);

  let fixedCount = 0;
  const batchSize = 450;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    const updates = {};

    // Campos que deben existir según el modelo FirestoreUser (iOS/Android)
    if (data.superLikesUsedToday === undefined) {
      updates.superLikesUsedToday = 0;
    }
    if (data.visibilityReduced === undefined) {
      updates.visibilityReduced = false;
    }
    if (data.superLikesRemaining === undefined) {
      updates.superLikesRemaining = 5;
    }
    if (data.dailyLikesRemaining === undefined) {
      const limit = Math.floor(Math.random() * 51) + 50; // 50..100
      updates.dailyLikesRemaining = limit;
      updates.dailyLikesLimit = limit;
    }
    if (data.dailyLikesLimit === undefined && data.dailyLikesRemaining !== undefined) {
      updates.dailyLikesLimit = data.dailyLikesRemaining;
    }
    if (data.lastLikeResetDate === undefined) {
      updates.lastLikeResetDate = admin.firestore.Timestamp.now();
    }
    if (data.lastSuperLikeResetDate === undefined) {
      updates.lastSuperLikeResetDate = admin.firestore.Timestamp.now();
    }
    if (data.accountStatus === undefined) {
      updates.accountStatus = 'active';
    }
    if (data.paused === undefined) {
      updates.paused = false;
    }
    if (data.blocked === undefined) {
      updates.blocked = [];
    }

    if (Object.keys(updates).length > 0) {
      batch.update(doc.ref, updates);
      batchCount++;
      fixedCount++;
      console.log(`  🔧 ${doc.id}: ${Object.keys(updates).join(', ')}`);

      if (batchCount >= batchSize) {
        await batch.commit();
        console.log(`  ✅ Batch committed (${batchCount} docs)`);
        batch = db.batch();
        batchCount = 0;
      }
    }
  }

  if (batchCount > 0) {
    await batch.commit();
    console.log(`  ✅ Final batch committed (${batchCount} docs)`);
  }

  if (fixedCount > 0) {
    console.log(`\n✅ Fixed ${fixedCount} users out of ${usersSnap.docs.length}`);
  } else {
    console.log('\n✅ All users already have required fields');
  }
}

fixMissingUserFields()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
