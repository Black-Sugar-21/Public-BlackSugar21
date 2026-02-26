#!/usr/bin/env node

/**
 * Test rápido de listMatches
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const DANIEL_UID = 'sU8xLiwQWNXmbYdR63p1uO6TSm72';

(async () => {
  try {
    console.log('\n📋 Listando matches de Daniel...\n');
    
    const matchesSnapshot = await db.collection('matches')
      .where('usersMatched', 'array-contains', DANIEL_UID)
      .get();
    
    if (matchesSnapshot.empty) {
      console.log('⚠️  No hay matches disponibles');
      process.exit(0);
    }
    
    console.log(`✅ ${matchesSnapshot.size} matches encontrados:\n`);
    
    for (let i = 0; i < matchesSnapshot.size; i++) {
      const doc = matchesSnapshot.docs[i];
      const data = doc.data();
      const otherUserId = data.userId1 === DANIEL_UID ? data.userId2 : data.userId1;
      
      let otherUserName = 'Usuario';
      try {
        const userDoc = await db.collection('users').doc(otherUserId).get();
        if (userDoc.exists) {
          otherUserName = userDoc.data().name || otherUserName;
        }
      } catch (e) {}
      
      console.log(`${i + 1}. ${otherUserName}`);
      console.log(`   "${data.lastMessage || '(sin mensajes)'}"`);
      console.log(`   Seq: ${data.lastMessageSeq || 0}`);
      console.log('');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error);
    process.exit(1);
  }
})();
