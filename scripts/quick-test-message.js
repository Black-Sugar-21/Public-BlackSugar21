#!/usr/bin/env node

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const DANIEL = {
  uid: 'sU8xLiwQWNXmbYdR63p1uO6TSm72',
  name: 'Daniel'
};

async function sendQuickTestMessage() {
  console.log('📤 Enviando mensaje de prueba rápido...\n');
  
  // Buscar un match de Daniel
  const matchesSnapshot = await db.collection('matches')
    .where('usersMatched', 'array-contains', DANIEL.uid)
    .limit(1)
    .get();
  
  if (matchesSnapshot.empty) {
    console.log('❌ No hay matches para Daniel');
    return;
  }
  
  const matchDoc = matchesSnapshot.docs[0];
  const matchId = matchDoc.id;
  const matchData = matchDoc.data();
  
  // Obtener el otro usuario
  const otherUserId = matchData.usersMatched.find(id => id !== DANIEL.uid);
  const otherUserDoc = await db.collection('users').doc(otherUserId).get();
  const otherUserName = otherUserDoc.data()?.name || 'Usuario';
  
  console.log(`💬 Enviando mensaje de Daniel a: ${otherUserName}`);
  console.log(`📍 Match ID: ${matchId}\n`);
  
  // Crear mensaje
  const messageText = `Test ${Date.now()} - ¿Funcionará la notificación?`;
  
  const messageRef = await db.collection('messages').add({
    chatId: matchId,
    senderId: DANIEL.uid,
    text: messageText,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
    type: 'text'
  });
  
  console.log(`✅ Mensaje creado: ${messageRef.id}`);
  console.log(`⏳ Esperando 5 segundos a que onMessageCreated lo procese...\n`);
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Verificar si se envió la notificación
  const messageDoc = await messageRef.get();
  const message = messageDoc.data();
  
  console.log('📊 RESULTADO:');
  console.log(`   Notificación enviada: ${message.notificationSent ? '✅ SÍ' : '❌ NO'}`);
  
  if (message.notificationSkipReason) {
    console.log(`   Skip Reason: ⚠️  ${message.notificationSkipReason}`);
  }
  
  if (message.notificationError) {
    console.log(`   Error: ❌ ${message.notificationError}`);
  }
  
  if (message.notificationSent) {
    console.log('\n🎉 ¡ÉXITO! La notificación fue enviada');
    console.log(`💡 Verifica tu dispositivo para confirmar la recepción`);
  } else {
    console.log('\n⚠️  La notificación NO fue enviada');
    console.log('💡 Revisa los logs con: firebase functions:log');
  }
  
  process.exit(0);
}

sendQuickTestMessage();
