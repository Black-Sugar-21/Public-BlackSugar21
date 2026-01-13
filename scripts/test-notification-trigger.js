/**
 * Test Script: Crear match y verificar que Cloud Function onMatchCreated se ejecute
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function createTestMatch() {
  console.log('🔄 Creando match de prueba para testing de notificaciones...\n');
  
  const danielId = 'sU8xLiwQWNXmbYdR63p1uO6TSm72';
  const testUserId = 'TEST_USER_' + Date.now();
  const matchId = danielId + '_' + testUserId;
  
  try {
    // Crear match
    await db.collection('matches').doc(matchId).set({
      userId1: danielId,
      userId2: testUserId,
      matchedAt: admin.firestore.FieldValue.serverTimestamp(),
      testMatch: true,
      createdForNotificationTest: true
    });
    
    console.log('✅ Match creado exitosamente');
    console.log(`   Match ID: ${matchId}`);
    console.log(`   Usuario 1: ${danielId}`);
    console.log(`   Usuario 2: ${testUserId}`);
    console.log('');
    console.log('🔍 Ahora revisa Firebase Console Functions Logs:');
    console.log('   https://console.firebase.google.com/project/black-sugar21/functions/logs');
    console.log('');
    console.log('📝 Busca en los logs:');
    console.log('   - "New match created"');
    console.log('   - "No FCM tokens found" (esperado - usuarios no tienen tokens)');
    console.log('');
    console.log('⏱️  Espera ~10 segundos y verifica que el match tenga:');
    console.log('   - notificationSent: true');
    console.log('   - notificationSentAt: [timestamp]');
    
    // Esperar 5 segundos y verificar
    console.log('\n⏳ Esperando 10 segundos para verificar...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    const matchDoc = await db.collection('matches').doc(matchId).get();
    const matchData = matchDoc.data();
    
    console.log('\n📊 Estado del match después de 10 segundos:');
    if (matchData.notificationSent) {
      console.log('   ✅ notificationSent:', matchData.notificationSent);
      console.log('   ✅ notificationSentAt:', matchData.notificationSentAt?.toDate());
      console.log('\n🎉 ¡Cloud Function onMatchCreated se ejecutó correctamente!');
    } else {
      console.log('   ⚠️  notificationSent: false o undefined');
      console.log('   ⚠️  Cloud Function puede no haberse ejecutado');
      console.log('\n   Revisa los logs para ver si hubo errores:');
      console.log('   https://console.firebase.google.com/project/black-sugar21/functions/logs');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createTestMatch();
