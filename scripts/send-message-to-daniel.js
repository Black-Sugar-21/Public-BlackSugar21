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

async function sendMessageToDaniel() {
  console.log('📤 Enviando mensaje A Daniel (para que reciba notificación)...\n');
  
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
  
  // Obtener el OTRO usuario (quien enviará el mensaje)
  const senderUserId = matchData.usersMatched.find(id => id !== DANIEL.uid);
  const senderUserDoc = await db.collection('users').doc(senderUserId).get();
  const senderName = senderUserDoc.data()?.name || 'Usuario';
  
  console.log(`💬 De: ${senderName} (usuario de prueba)`);
  console.log(`📥 Para: ${DANIEL.name}`);
  console.log(`📍 Match ID: ${matchId}\n`);
  
  // Crear mensaje DEL OTRO USUARIO hacia Daniel
  const messageText = `¡Hola Daniel! Este es un mensaje de prueba ${Date.now()} 📱`;
  
  const newSeq = (matchData.lastMessageSeq || 0) + 1;
  const now = admin.firestore.Timestamp.now();
  
  const messageRef = await db.collection('messages').add({
    chatId: matchId,
    senderId: senderUserId,  // 🔥 IMPORTANTE: El otro usuario es el remitente
    text: messageText,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
    type: 'text'
  });
  
  // Actualizar match
  await db.collection('matches').doc(matchId).update({
    lastMessage: messageText,
    lastMessageSeq: newSeq,
    lastMessageTimestamp: now,
    timestamp: now
  });
  
  console.log(`✅ Mensaje creado: ${messageRef.id}`);
  console.log(`⏳ Esperando 5 segundos a que onMessageCreated lo procese...\n`);
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Verificar si se envió la notificación
  const messageDoc = await messageRef.get();
  const message = messageDoc.data();
  
  console.log('📊 RESULTADO:');
  console.log(`   chatId: ${message.chatId}`);
  console.log(`   Remitente: ${senderName}`);
  console.log(`   Receptor: ${DANIEL.name} ✅ (TÚ)`);
  console.log(`   Notificación enviada: ${message.notificationSent ? '✅ SÍ' : '❌ NO'}`);
  
  if (message.notificationSkipReason) {
    console.log(`   Skip Reason: ⚠️  ${message.notificationSkipReason}`);
  }
  
  if (message.notificationError) {
    console.log(`   Error: ❌ ${message.notificationError}`);
  }
  
  if (message.notificationSent) {
    console.log('\n🎉 ¡ÉXITO! La notificación debería haber llegado a tu dispositivo!');
    console.log(`💡 Revisa tu dispositivo para confirmar la notificación de "${senderName}"`);
  } else {
    console.log('\n⚠️  La notificación NO fue enviada');
    console.log('💡 Revisa los logs con: firebase functions:log');
  }
  
  process.exit(0);
}

sendMessageToDaniel();
