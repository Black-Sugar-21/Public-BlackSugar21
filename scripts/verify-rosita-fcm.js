const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

try { 
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  }); 
} catch(e) {}

const rositaId = 'DsDSK5xqEZZXAIKxtIKyBGntw8f2';
const expectedToken = 'eaFY5zM_TH-lSwxbGFWnXV:APA91bG1OzqxYZMtg2n6yn1T7DaW0XGIq9anewJOu5HnH2xQGZgcbYeIgQAhrCJyPhpBasIPW0_JdUgquXc9RbVQxKzoujLq53rx-BiXxvsZvH4M5Hr_Zbs';

(async () => {
  console.log('🔍 Verificando FCM token de Rosita...');
  console.log('ID:', rositaId);
  console.log('');
  
  const doc = await admin.firestore().collection('users').doc(rositaId).get();
  
  if (!doc.exists) {
    console.log('❌ Usuario no encontrado');
    process.exit(1);
  }
  
  const data = doc.data();
  const actualToken = data.fcmToken;
  
  console.log('📱 FCM Token en base de datos:');
  console.log('   Primeros 50 chars:', actualToken?.substring(0, 50) + '...');
  console.log('');
  console.log('📱 FCM Token esperado:');
  console.log('   Primeros 50 chars:', expectedToken.substring(0, 50) + '...');
  console.log('');
  
  if (actualToken === expectedToken) {
    console.log('✅ ¡Los tokens coinciden perfectamente!');
  } else if (actualToken && actualToken.includes(expectedToken.substring(0, 30))) {
    console.log('⚠️  Los tokens son similares pero no idénticos');
    console.log('   Longitud actual:', actualToken.length);
    console.log('   Longitud esperada:', expectedToken.length);
  } else if (actualToken) {
    console.log('❌ Los tokens son diferentes');
    console.log('   Token actual completo:', actualToken);
    console.log('');
    console.log('   Token esperado completo:', expectedToken);
  } else {
    console.log('❌ No hay FCM token en la base de datos');
  }
  
  console.log('');
  console.log('📊 Otros datos:');
  console.log('   Email:', data.email);
  console.log('   Nombre:', data.name);
  
  process.exit(0);
})();
