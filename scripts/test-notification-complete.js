const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const danielId = 'sU8xLiwQWNXmbYdR63p1uO6TSm72';
const rositaId = 'DsDSK5xqEZZXAIKxtIKyBGntw8f2';

(async () => {
  console.log('🎯 Test de notificación Daniel-Rosita');
  console.log('=====================================\n');
  
  // Verificar FCM tokens
  console.log('1️⃣ Verificando FCM tokens...');
  const danielDoc = await admin.firestore().collection('users').doc(danielId).get();
  const rositaDoc = await admin.firestore().collection('users').doc(rositaId).get();
  
  const danielToken = danielDoc.data()?.fcmToken;
  const rositaToken = rositaDoc.data()?.fcmToken;
  
  console.log('   Daniel:', danielToken ? '✅ SÍ' : '❌ NO');
  if (danielToken) console.log('      Token:', danielToken.substring(0, 40) + '...');
  
  console.log('   Rosita:', rositaToken ? '✅ SÍ' : '❌ NO');
  if (rositaToken) console.log('      Token:', rositaToken.substring(0, 40) + '...');
  
  if (!danielToken || !rositaToken) {
    console.log('\n❌ No se puede continuar sin ambos tokens FCM');
    process.exit(1);
  }
  
  // Crear match
  const matchId = `${danielId}_${rositaId}_${Date.now()}`;
  console.log('\n2️⃣ Creando match...');
  console.log('   Match ID:', matchId);
  
  await admin.firestore().collection('matches').doc(matchId).set({
    userId1: danielId,
    userId2: rositaId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    status: 'active',
    compatibility: 95,
    createdBy: 'test-script'
  });
  
  console.log('   ✅ Match creado exitosamente');
  
  // Esperar 15 segundos
  console.log('\n3️⃣ Esperando 15 segundos para que se ejecute la Cloud Function...');
  await new Promise(resolve => setTimeout(resolve, 15000));
  
  // Verificar resultado
  console.log('\n4️⃣ Verificando resultado...');
  const matchDoc = await admin.firestore().collection('matches').doc(matchId).get();
  const matchData = matchDoc.data();
  
  console.log('   notificationSent:', matchData.notificationSent || 'undefined');
  console.log('   notificationSentAt:', matchData.notificationSentAt || 'undefined');
  console.log('   notificationAttemptedAt:', matchData.notificationAttemptedAt || 'undefined');
  console.log('   notificationSkipReason:', matchData.notificationSkipReason || 'undefined');
  
  console.log('\n📊 Resultado final:');
  if (matchData.notificationSent) {
    console.log('   ✅ ¡FUNCIONA! Las notificaciones se enviaron correctamente');
  } else if (matchData.notificationAttemptedAt) {
    console.log('   ⚠️  Se intentó enviar pero falló');
    console.log('   Razón:', matchData.notificationSkipReason);
  } else {
    console.log('   ❌ La Cloud Function no se ejecutó');
    console.log('   Posibles causas:');
    console.log('      - El trigger EventArc no está funcionando');
    console.log('      - Hay un delay en la propagación');
    console.log('      - Problema con los permisos IAM');
  }
  
  process.exit(0);
})();
