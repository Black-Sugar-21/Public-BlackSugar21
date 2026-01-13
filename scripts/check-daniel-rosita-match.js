const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

try { 
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  }); 
} catch(e) {}

const matchId = 'sU8xLiwQWNXmbYdR63p1uO6TSm72_DsDSK5xqEZZXAIKxtIKyBGntw8f2';

(async () => {
  console.log('🔍 Verificando match Daniel-Rosita...');
  console.log('Match ID:', matchId);
  console.log('');
  
  const match = await admin.firestore().collection('matches').doc(matchId).get();
  
  if (!match.exists) {
    console.log('❌ Match no encontrado');
    process.exit(1);
  }
  
  const data = match.data();
  console.log('📄 Datos del match:');
  console.log('   notificationSent:', data.notificationSent);
  console.log('   notificationSentAt:', data.notificationSentAt?.toDate());
  console.log('   notificationAttemptedAt:', data.notificationAttemptedAt?.toDate());
  console.log('   notificationSkipReason:', data.notificationSkipReason);
  console.log('');
  
  if (data.notificationSent) {
    console.log('✅ Notificaciones enviadas exitosamente!');
  } else if (data.notificationAttemptedAt) {
    console.log('⚠️  Se intentó enviar pero falló. Razón:', data.notificationSkipReason);
  } else {
    console.log('⏳ La Cloud Function aún no se ha ejecutado');
  }
  
  process.exit(0);
})();
