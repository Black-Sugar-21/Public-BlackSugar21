/**
 * Test Real: Crear match entre Daniel y Rosita con FCM tokens reales
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function createRealMatchTest() {
  const danielId = 'sU8xLiwQWNXmbYdR63p1uO6TSm72';
  const rositaId = 'DsDSK5xqEZZXAIKxtIKyBGntw8f2'; // ro.es4075@gmail.com
  const matchId = danielId + '_' + rositaId;
  
  console.log('🎯 Creando match REAL entre Daniel y Rosita...');
  console.log('   Daniel ID:', danielId);
  console.log('   Rosita ID:', rositaId);
  console.log('   Match ID:', matchId);
  console.log('');
  
  try {
    // Verificar que ambos tienen fcmToken
    const [danielDoc, rositaDoc] = await Promise.all([
      admin.firestore().collection('users').doc(danielId).get(),
      admin.firestore().collection('users').doc(rositaId).get()
    ]);
    
    const danielData = danielDoc.data();
    const rositaData = rositaDoc.data();
    
    console.log('📱 FCM Tokens:');
    console.log('   Daniel:', danielData?.fcmToken ? 'SÍ TIENE ✅' : 'NO TIENE ❌');
    console.log('   Rosita:', rositaData?.fcmToken ? 'SÍ TIENE ✅' : 'NO TIENE ❌');
    console.log('');
    
    if (!danielData?.fcmToken || !rositaData?.fcmToken) {
      console.log('⚠️  Advertencia: Uno o ambos usuarios no tienen FCM token');
      console.log('   Las notificaciones no llegarán a los dispositivos sin token');
      console.log('');
    }
    
    // Crear el match
    await admin.firestore().collection('matches').doc(matchId).set({
      userId1: danielId,
      userId2: rositaId,
      matchedAt: admin.firestore.FieldValue.serverTimestamp(),
      testRealNotification: true,
      createdAt: new Date().toISOString()
    });
    
    console.log('✅ Match creado!');
    console.log('⏳ Esperando 10 segundos para que se ejecute la Cloud Function...');
    console.log('');
    
    await new Promise(r => setTimeout(r, 10000));
    
    const matchDoc = await admin.firestore().collection('matches').doc(matchId).get();
    const data = matchDoc.data();
    
    console.log('📊 Resultado:');
    console.log('   notificationSent:', data.notificationSent);
    console.log('   notificationSentAt:', data.notificationSentAt?.toDate());
    console.log('   notificationAttemptedAt:', data.notificationAttemptedAt?.toDate());
    console.log('   notificationSkipReason:', data.notificationSkipReason || 'N/A');
    console.log('');
    
    if (data.notificationSent) {
      console.log('🎉 ¡ÉXITO! Notificaciones ENVIADAS a ambos dispositivos');
      console.log('📱 Revisa los dispositivos de Daniel y Rosita');
      console.log('   Deberían haber recibido notificación: "💘 ¡Nuevo Match!"');
    } else if (data.notificationAttemptedAt) {
      console.log('⚠️  Se intentó pero no se envió:', data.notificationSkipReason);
    } else {
      console.log('❌ La Cloud Function no se ejecutó');
      console.log('   Revisa los logs: https://console.firebase.google.com/project/black-sugar21/functions/logs');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createRealMatchTest();
