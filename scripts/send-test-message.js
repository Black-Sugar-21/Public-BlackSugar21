const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function sendTestMessage() {
  try {
    const danielId = 'sU8xLiwQWNXmbYdR63p1uO6TSm72';
    const martinaId = 'xcnPSJTwQTO3sqI6UVnvug0ToXg2';
    const matchId = `${danielId}_${martinaId}`;
    
    console.log('\n💬 ENVIANDO MENSAJE DE PRUEBA');
    console.log('═'.repeat(70));
    console.log('\n📤 Remitente: Daniel');
    console.log('📥 Destinatario: Martina Fernández');
    
    // Obtener match actual
    const matchDoc = await db.collection('matches').doc(matchId).get();
    if (!matchDoc.exists) {
      console.log('\n❌ Match no encontrado');
      process.exit(1);
    }
    
    const matchData = matchDoc.data();
    const currentSeq = matchData.lastMessageSeq || 0;
    const newSeq = currentSeq + 1;
    
    const messageText = `Hola! Este es un mensaje de prueba ${Date.now()} 📱`;
    
    console.log('\n⏳ Creando mensaje...');
    
    // Crear mensaje con chatId correcto
    const messageRef = await db.collection('messages').add({
      chatId: matchId,  // 🔥 USAR chatId
      senderId: danielId,
      text: messageText,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
      type: 'text'
    });
    
    console.log(`✅ Mensaje creado: ${messageRef.id}`);
    
    // Actualizar match
    await db.collection('matches').doc(matchId).update({
      lastMessage: messageText,
      lastMessageSeq: newSeq,
      lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(),
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Match actualizado (Seq: ${newSeq})`);
    
    // Esperar un momento para que se ejecute el trigger
    console.log('\n⏳ Esperando que Cloud Function onMessageCreated procese el mensaje...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Verificar si se envió la notificación
    const messageDoc = await db.collection('messages').doc(messageRef.id).get();
    const messageData = messageDoc.data();
    
    console.log('\n📊 RESULTADO:');
    console.log('═'.repeat(70));
    console.log(`  - Mensaje ID: ${messageRef.id}`);
    console.log(`  - Texto: "${messageText}"`);
    console.log(`  - chatId: ${messageData.chatId}`);
    console.log(`  - Notificación enviada: ${messageData.notificationSent ? '✅ SÍ' : '❌ NO'}`);
    
    if (messageData.notificationSent) {
      console.log(`  - Enviada a: Martina Fernández`);
      console.log(`  - Token FCM: (mismo de Daniel para testing)`);
      console.log('\n🎉 ÉXITO: La notificación debería haber llegado a tu dispositivo!');
      console.log('📱 Revisa tu iPhone/Android para verificar');
    } else {
      console.log(`  - Razón: ${messageData.notificationSkipReason || 'Desconocida'}`);
      console.log('\n⚠️  La notificación NO se envió');
      
      if (messageData.notificationSkipReason === 'no_fcm_token') {
        console.log('\n🔧 SOLUCIÓN:');
        console.log('  - Verifica que Martina tenga FCM token');
        console.log('  - Ejecuta: node add-fcm-token.js');
      }
    }
    
    console.log('\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

sendTestMessage();
