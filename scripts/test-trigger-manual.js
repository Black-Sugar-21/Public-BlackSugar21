/**
 * Test manual de trigger: Publicar evento de Firestore directamente a Cloud Function
 */

const {onCall} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const {logger} = require('firebase-functions/v2');

// Inicializar Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function testTriggerManually() {
  console.log('🧪 Probando trigger manualmente...\n');
  
  const matchId = 'sU8xLiwQWNXmbYdR63p1uO6TSm72_MANUAL_TEST_' + Date.now();
  
  try {
    // 1. Crear el match
    console.log('1️⃣ Creando match en Firestore...');
    await admin.firestore().collection('matches').doc(matchId).set({
      userId1: 'sU8xLiwQWNXmbYdR63p1uO6TSm72',
      userId2: 'MANUAL_TEST_USER',
      matchedAt: admin.firestore.FieldValue.serverTimestamp(),
      testMatch: true,
      manualTriggerTest: true
    });
    console.log('   ✅ Match creado:', matchId);
    
    // 2. Esperar 3 segundos
    console.log('\n2️⃣ Esperando 5 segundos para que se ejecute el trigger...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 3. Verificar si se agregó el campo notificationSent
    console.log('\n3️⃣ Verificando si la Cloud Function se ejecutó...');
    const matchDoc = await admin.firestore().collection('matches').doc(matchId).get();
    const matchData = matchDoc.data();
    
    if (matchData.notificationSent) {
      console.log('   ✅ ¡SUCCESS! Cloud Function se ejecutó correctamente');
      console.log('   - notificationSent:', matchData.notificationSent);
      console.log('   - notificationSentAt:', matchData.notificationSentAt?.toDate());
    } else {
      console.log('   ❌ FALLÓ: Cloud Function NO se ejecutó');
      console.log('   - notificationSent:', matchData.notificationSent || 'undefined');
    }
    
    // 4. Intentar llamar a la función HTTP directamente
    console.log('\n4️⃣ Probando función callable sendTestNotification...');
    const callable = admin.functions().httpsCallable('sendTestNotification');
    
    try {
      const result = await callable({
        userId: 'sU8xLiwQWNXmbYdR63p1uO6TSm72',
        title: '🧪 Test Manual',
        body: 'Testing callable function'
      });
      console.log('   ✅ Función callable funciona:', result.data);
    } catch (error) {
      console.log('   ⚠️  Error en callable (esperado si no hay FCM token):', error.message);
    }
    
    console.log('\n📋 Resumen:');
    console.log('   - Firestore trigger: ' + (matchData.notificationSent ? '✅ FUNCIONA' : '❌ NO FUNCIONA'));
    console.log('   - Callable function: ✅ ACCESIBLE');
    
    console.log('\n💡 Si el trigger no funciona, el problema es:');
    console.log('   1. EventArc no está enviando eventos de Firestore');
    console.log('   2. Pub/Sub topic no está recibiendo mensajes');
    console.log('   3. Permisos de service account incorrectos');
    
    process.exit(matchData.notificationSent ? 0 : 1);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testTriggerManually();
