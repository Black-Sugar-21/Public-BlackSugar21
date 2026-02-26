const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

(async () => {
  console.log('🔧 AGREGANDO FCM TOKEN A TODOS LOS USUARIOS DE PRUEBA\n');
  
  // Obtener token de Daniel
  const danielDoc = await db.collection('users').doc('sU8xLiwQWNXmbYdR63p1uO6TSm72').get();
  const danielToken = danielDoc.data().fcmToken;
  
  if (!danielToken) {
    console.log('❌ Daniel no tiene FCM token');
    process.exit(1);
  }
  
  console.log(`✅ Token de Daniel encontrado: ${danielToken.substring(0, 30)}...\n`);
  
  // Obtener todos los usuarios sin FCM token
  const usersSnapshot = await db.collection('users').get();
  let count = 0;
  
  for (const userDoc of usersSnapshot.docs) {
    const userData = userDoc.data();
    
    // Si el usuario no tiene FCM token, agregarlo
    if (!userData.fcmToken && userDoc.id !== 'sU8xLiwQWNXmbYdR63p1uO6TSm72') {
      await db.collection('users').doc(userDoc.id).update({
        fcmToken: danielToken
      });
      
      console.log(`✅ Token agregado a: ${userData.firstName || userData.name || 'Usuario'} (${userDoc.id.substring(0, 20)}...)`);
      count++;
    }
  }
  
  console.log(`\n🎉 ${count} usuarios actualizados con FCM token`);
  console.log('💡 Ahora todas las notificaciones llegarán al dispositivo de Daniel\n');
  
  process.exit(0);
})();
