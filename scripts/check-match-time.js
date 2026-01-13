const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

try { 
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  }); 
} catch(e) {}

const matchId = 'sU8xLiwQWNXmbYdR63p1uO6TSm72_DsDSK5xqEZZXAIKxtIKyBGntw8f2';

(async () => {
  const match = await admin.firestore().collection('matches').doc(matchId).get();
  
  if (!match.exists) {
    console.log('❌ Match no encontrado');
    process.exit(1);
  }
  
  const data = match.data();
  console.log('Creado:', data.createdAt);
  if (data.createdAt) {
    const createdTime = data.createdAt._seconds ? data.createdAt._seconds * 1000 : data.createdAt;
    console.log('Tiempo transcurrido:', Math.floor((Date.now() - createdTime) / 1000), 'segundos');
  }
  console.log('');
  console.log('userId1:', data.userId1);
  console.log('userId2:', data.userId2);
  
  process.exit(0);
})();
