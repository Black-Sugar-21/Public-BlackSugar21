const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function addFCMTokenToMartina() {
  try {
    // ID de Martina Fernández
    const martinaId = 'xcnPSJTwQTO3sqI6UVnvug0ToXg2';
    
    // Token FCM de prueba (usa el token de Daniel para testing)
    const danielDoc = await db.collection('users').doc('sU8xLiwQWNXmbYdR63p1uO6TSm72').get();
    const danielFCMToken = danielDoc.data()?.fcmToken;
    
    if (!danielFCMToken) {
      console.log('❌ Daniel no tiene FCM token registrado');
      console.log('💡 Abre la app iOS/Android y acepta permisos de notificaciones');
      process.exit(1);
    }
    
    console.log('✅ Token FCM de Daniel encontrado:', danielFCMToken.substring(0, 40) + '...');
    
    // Agregar token a Martina
    await db.collection('users').doc(martinaId).update({
      fcmToken: danielFCMToken,
      fcmTokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('✅ Token FCM agregado a Martina Fernández');
    console.log('💡 Ahora envía otro mensaje y la notificación debería llegar');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addFCMTokenToMartina();
