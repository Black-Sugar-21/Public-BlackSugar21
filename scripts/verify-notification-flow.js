const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function verifyNotificationFlow() {
  try {
    const danielId = 'sU8xLiwQWNXmbYdR63p1uO6TSm72';
    const martinaId = 'xcnPSJTwQTO3sqI6UVnvug0ToXg2';
    
    console.log('\n🔍 VERIFICACIÓN DE FLUJO DE NOTIFICACIONES\n');
    console.log('═'.repeat(70));
    
    // Verificar FCM token de Daniel
    const danielDoc = await db.collection('users').doc(danielId).get();
    const danielData = danielDoc.data();
    const danielFCMToken = danielData?.fcmToken;
    
    console.log('\n👨 DANIEL (Usuario real - quien prueba):');
    console.log('  - ID:', danielId);
    console.log('  - Email:', danielData?.email);
    console.log('  - FCM Token:', danielFCMToken ? '✅ ' + danielFCMToken.substring(0, 40) + '...' : '❌ NO TIENE');
    
    // Verificar FCM token de Martina
    const martinaDoc = await db.collection('users').doc(martinaId).get();
    const martinaData = martinaDoc.data();
    const martinaFCMToken = martinaData?.fcmToken;
    
    console.log('\n👩 MARTINA (Usuario de prueba):');
    console.log('  - ID:', martinaId);
    console.log('  - Email:', martinaData?.email);
    console.log('  - FCM Token:', martinaFCMToken ? '✅ ' + martinaFCMToken.substring(0, 40) + '...' : '❌ NO TIENE');
    
    console.log('\n📨 FLUJO DE NOTIFICACIONES:');
    console.log('═'.repeat(70));
    console.log('\n📤 ESCENARIO 1: Daniel envía mensaje a Martina');
    console.log('  1. Daniel (remitente) escribe mensaje');
    console.log('  2. Mensaje se guarda con senderId = Daniel');
    console.log('  3. Cloud Function detecta: receptor = Martina');
    console.log('  4. Notificación se envía a FCM token de MARTINA');
    console.log('  5. Resultado:', martinaFCMToken ? '✅ Martina recibirá notificación' : '❌ Martina NO recibirá (sin token)');
    
    console.log('\n📥 ESCENARIO 2: Martina envía mensaje a Daniel');
    console.log('  1. Martina (remitente) escribe mensaje');
    console.log('  2. Mensaje se guarda con senderId = Martina');
    console.log('  3. Cloud Function detecta: receptor = Daniel');
    console.log('  4. Notificación se envía a FCM token de DANIEL');
    console.log('  5. Resultado:', danielFCMToken ? '✅ Daniel recibirá notificación' : '❌ Daniel NO recibirá (sin token)');
    
    console.log('\n💡 PARA PROBAR NOTIFICACIONES:');
    console.log('═'.repeat(70));
    
    if (!danielFCMToken) {
      console.log('\n❌ PROBLEMA: Daniel no tiene FCM token registrado');
      console.log('\n🔧 SOLUCIÓN:');
      console.log('  1. Abre la app en el dispositivo/simulador');
      console.log('  2. Acepta permisos de notificaciones');
      console.log('  3. El token se registrará automáticamente');
    } else {
      console.log('\n✅ Daniel tiene FCM token registrado');
      
      if (martinaFCMToken === danielFCMToken) {
        console.log('\n✅ CONFIGURACIÓN CORRECTA PARA TESTING:');
        console.log('  - Martina usa el mismo token de Daniel');
        console.log('  - Cuando Daniel envíe mensaje a Martina → Llegará a dispositivo de Daniel');
        console.log('  - Esto es CORRECTO para testing (simula recibir notificaciones)');
      } else {
        console.log('\n⚠️  CONFIGURACIÓN ACTUAL:');
        console.log('  - Martina tiene token diferente al de Daniel');
        console.log('  - Cuando Daniel envíe a Martina → NO llegará a Daniel');
        console.log('\n💡 PARA PROBAR (recibir notificaciones en tu dispositivo):');
        console.log('  - Ejecuta: node add-fcm-token.js');
        console.log('  - Esto asigna el token de Daniel a Martina');
        console.log('  - Así recibirás las notificaciones en tu dispositivo');
      }
    }
    
    console.log('\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

verifyNotificationFlow();
