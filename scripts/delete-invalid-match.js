#!/usr/bin/env node

/**
 * 🗑️ Eliminar match inválido con Rosita
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

(async () => {
  try {
    const matchId = 'sU8xLiwQWNXmbYdR63p1uO6TSm72DsDSK5xqEZZXAIKxtIKyBGntw8f2';
    
    console.log('\n🗑️ Eliminando match inválido...\n');
    console.log(`Match ID: ${matchId}`);
    
    // Verificar si existe
    const matchDoc = await db.collection('matches').doc(matchId).get();
    
    if (!matchDoc.exists) {
      console.log('✅ El match ya no existe');
      process.exit(0);
    }
    
    // Eliminar mensajes asociados
    const messagesSnapshot = await db.collection('messages')
      .where('matchId', '==', matchId)
      .get();
    
    for (const msgDoc of messagesSnapshot.docs) {
      await msgDoc.ref.delete();
    }
    
    console.log(`✅ Eliminados ${messagesSnapshot.size} mensajes`);
    
    // Eliminar match
    await db.collection('matches').doc(matchId).delete();
    
    console.log('✅ Match eliminado');
    console.log('\n💡 Ahora no hay matches para Daniel');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    process.exit(1);
  }
})();
