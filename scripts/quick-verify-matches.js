#!/usr/bin/env node

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const danielUid = 'sU8xLiwQWNXmbYdR63p1uO6TSm72';

(async () => {
  try {
    console.log('\n🔍 Verificando matches de Daniel en Firestore...\n');
    
    const snapshot = await db.collection('matches')
      .where('usersMatched', 'array-contains', danielUid)
      .get();
    
    console.log('✅ Matches encontrados:', snapshot.size);
    
    if (snapshot.size > 0) {
      console.log('\n📋 Detalles de todos los matches:\n');
      
      for (const doc of snapshot.docs) {
        const data = doc.data();
        const otherUserId = data.usersMatched?.find(uid => uid !== danielUid);
        
        // Obtener nombre del otro usuario
        let otherUserName = 'Unknown';
        if (otherUserId) {
          try {
            const userDoc = await db.collection('users').doc(otherUserId).get();
            if (userDoc.exists) {
              otherUserName = userDoc.data().name || otherUserName;
            }
          } catch (e) {}
        }
        
        console.log('• Match:', otherUserName);
        console.log('  ID:', doc.id.substring(0, 20) + '...');
        console.log('  usersMatched:', data.usersMatched);
        console.log('  lastMessage:', data.lastMessage || '(sin mensajes)');
        console.log('  isTest:', data.isTest || false);
        console.log('  notificationSent:', data.notificationSent || false);
        console.log('');
      }
      
      console.log('\n✅ Todos estos matches deberían aparecer en las apps iOS/Android');
      console.log('💡 Si no aparecen, el problema es de caché en las apps\n');
    } else {
      console.log('\n⚠️  No hay matches para Daniel');
      console.log('💡 Crea algunos con: node test-master.js → opción 1\n');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
})();
