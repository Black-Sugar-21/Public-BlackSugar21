#!/usr/bin/env node

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://black-sugar21-default-rtdb.firebaseio.com'
});

const db = admin.firestore();

async function checkLastMessage() {
  console.log('🔍 VERIFICANDO ÚLTIMO MENSAJE ENVIADO\n');
  
  // Buscar el último mensaje creado
  const messagesSnapshot = await db.collection('messages')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  
  if (messagesSnapshot.empty) {
    console.log('❌ No se encontraron mensajes');
    return;
  }
  
  const messageDoc = messagesSnapshot.docs[0];
  const messageId = messageDoc.id;
  const message = messageDoc.data();
  
  console.log(`📨 Mensaje ID: ${messageId}`);
  console.log(`📝 Texto: "${message.text}"`);
  console.log(`👤 Remitente: ${message.senderId}`);
  console.log(`🔗 chatId: ${message.chatId || '❌ NO EXISTE'}`);
  console.log(`🔗 matchId: ${message.matchId || '(no tiene)'}`);
  console.log(`📅 Timestamp: ${message.timestamp?.toDate()?.toISOString() || 'pending'}`);
  console.log(`📅 CreatedAt: ${message.createdAt?.toDate()?.toISOString() || 'pending'}`);
  
  console.log('\n🔔 ESTADO DE NOTIFICACIÓN:');
  console.log(`   notificationSent: ${message.notificationSent || false}`);
  console.log(`   notificationAttemptedAt: ${message.notificationAttemptedAt?.toDate()?.toISOString() || '(no intentado)'}`);
  console.log(`   notificationSkipReason: ${message.notificationSkipReason || '(ninguno)'}`);
  console.log(`   notificationError: ${message.notificationError || '(ninguno)'}`);
  
  // Verificar si existe el match
  if (message.chatId) {
    console.log('\n🔍 VERIFICANDO MATCH...');
    const matchDoc = await db.collection('matches').doc(message.chatId).get();
    
    if (matchDoc.exists) {
      const matchData = matchDoc.data();
      console.log(`✅ Match encontrado: ${message.chatId}`);
      console.log(`   Usuarios: ${matchData.usersMatched?.join(', ')}`);
      console.log(`   Último mensaje: "${matchData.lastMessage}"`);
      console.log(`   Último seq: ${matchData.lastMessageSeq}`);
      
      // Verificar FCM tokens de ambos usuarios
      console.log('\n🔔 VERIFICANDO FCM TOKENS...');
      for (const userId of matchData.usersMatched || []) {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          const hasToken = !!userData.fcmToken;
          console.log(`   👤 ${userData.firstName || 'Usuario'} (${userId}): ${hasToken ? '✅ Tiene token' : '❌ NO tiene token'}`);
        }
      }
    } else {
      console.log(`❌ Match NO encontrado: ${message.chatId}`);
    }
  }
  
  // Esperar 3 segundos y verificar de nuevo si se procesó
  console.log('\n⏳ Esperando 3 segundos para ver si el trigger procesa...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const updatedDoc = await db.collection('messages').doc(messageId).get();
  const updatedMessage = updatedDoc.data();
  
  console.log('\n📊 ESTADO ACTUALIZADO:');
  console.log(`   notificationSent: ${updatedMessage.notificationSent || false}`);
  console.log(`   notificationAttemptedAt: ${updatedMessage.notificationAttemptedAt?.toDate()?.toISOString() || '(no intentado)'}`);
  console.log(`   notificationSkipReason: ${updatedMessage.notificationSkipReason || '(ninguno)'}`);
  
  if (updatedMessage.notificationSent) {
    console.log('\n✅ ¡ÉXITO! La notificación fue enviada');
  } else if (updatedMessage.notificationAttemptedAt) {
    console.log('\n⚠️ El trigger intentó enviar pero falló');
    console.log(`   Razón: ${updatedMessage.notificationSkipReason || updatedMessage.notificationError}`);
  } else {
    console.log('\n❌ El trigger NO ha procesado este mensaje todavía');
    console.log('💡 Verifica que la Cloud Function esté desplegada correctamente');
  }
  
  process.exit(0);
}

checkLastMessage().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
