const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkMessage() {
  try {
    const messageDoc = await db.collection('messages').doc('aC1DxGOOYUBoXXZLyMOu').get();
    
    if (!messageDoc.exists) {
      console.log('❌ Mensaje no encontrado');
      process.exit(1);
    }
    
    const data = messageDoc.data();
    console.log('\n📨 Mensaje aC1DxGOOYUBoXXZLyMOu:');
    console.log('  - text:', data.text);
    console.log('  - chatId:', data.chatId || '❌ NO TIENE chatId');
    console.log('  - matchId:', data.matchId || 'N/A');
    console.log('  - senderId:', data.senderId);
    console.log('  - timestamp:', data.timestamp || 'N/A');
    console.log('  - notificationSent:', data.notificationSent || false);
    console.log('  - notificationAttemptedAt:', data.notificationAttemptedAt ? 'Sí' : 'No');
    console.log('  - notificationSkipReason:', data.notificationSkipReason || 'N/A');
    console.log('  - notificationSentAt:', data.notificationSentAt ? 'Sí' : 'No');
    
    // Verificar match
    console.log('\n🔍 Verificando match...');
    const matchId = data.chatId || data.matchId;
    if (matchId) {
      const matchDoc = await db.collection('matches').doc(matchId).get();
      if (matchDoc.exists) {
        const matchData = matchDoc.data();
        console.log('  ✅ Match encontrado:', matchId.substring(0, 16) + '...');
        console.log('  - usersMatched:', matchData.usersMatched);
      } else {
        console.log('  ❌ Match NO encontrado:', matchId);
      }
    } else {
      console.log('  ❌ Mensaje no tiene chatId ni matchId');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkMessage();
