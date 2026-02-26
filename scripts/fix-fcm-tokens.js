const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

(async () => {
  console.log('🔍 VERIFICANDO USUARIOS DEL ÚLTIMO MENSAJE\n');
  
  // Obtener último mensaje
  const messagesSnapshot = await db.collection('messages')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  
  const message = messagesSnapshot.docs[0].data();
  const chatId = message.chatId;
  
  console.log(`📨 Mensaje: "${message.text}"`);
  console.log(`🔗 chatId: ${chatId}\n`);
  
  // Obtener match
  const matchDoc = await db.collection('matches').doc(chatId).get();
  const matchData = matchDoc.data();
  
  console.log(`👥 Usuarios en el match:`);
  for (const userId of matchData.usersMatched) {
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    const hasToken = !!userData.fcmToken;
    const tokenPreview = userData.fcmToken ? userData.fcmToken.substring(0, 30) + '...' : 'NO TIENE';
    
    console.log(`\n   ${userData.firstName || 'Usuario'} (${userId})`);
    console.log(`   FCM Token: ${hasToken ? '✅' : '❌'} ${tokenPreview}`);
  }
  
  // Obtener token de Daniel para copiar
  console.log('\n\n📋 TOKEN DE DANIEL (para copiar a otros usuarios):');
  const danielDoc = await db.collection('users').doc('sU8xLiwQWNXmbYdR63p1uO6TSm72').get();
  const danielToken = danielDoc.data().fcmToken;
  
  if (danielToken) {
    console.log(`✅ ${danielToken}\n`);
    
    // Preguntar si copiar el token a usuarios sin token
    console.log('💡 Para que funcionen las notificaciones, todos los usuarios de prueba');
    console.log('   deben tener el token de Daniel (para que lleguen a su dispositivo)');
  } else {
    console.log('❌ Daniel no tiene FCM token registrado');
  }
  
  process.exit(0);
})();
