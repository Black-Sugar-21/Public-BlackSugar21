const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

(async () => {
  const messagesSnapshot = await db.collection('messages')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  
  const messageDoc = messagesSnapshot.docs[0];
  const message = messageDoc.data();
  
  console.log('📨 Mensaje ID:', messageDoc.id);
  console.log('📝 Texto:', message.text);
  console.log('🔗 chatId:', message.chatId || 'NO EXISTE');
  console.log('🔔 notificationSent:', message.notificationSent || false);
  console.log('❌ notificationSkipReason:', message.notificationSkipReason || 'ninguno');
  
  console.log('\n⏳ Esperando 3 segundos...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const updated = (await db.collection('messages').doc(messageDoc.id).get()).data();
  console.log('\n📊 Después de 3s:');
  console.log('🔔 notificationSent:', updated.notificationSent || false);
  console.log('❌ Razón:', updated.notificationSkipReason || updated.notificationError || 'ninguno');
  
  process.exit(0);
})();
