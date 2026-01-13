const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const USER_ID = 'DsDSK5xqEZZXAIKxtIKyBGntw8f2';

async function getUserEmail() {
  try {
    const userRecord = await admin.auth().getUser(USER_ID);
    console.log('✅ Usuario encontrado:');
    console.log(`   Email: ${userRecord.email}`);
    console.log(`   UID: ${userRecord.uid}`);
    console.log(`   Creado: ${userRecord.metadata.creationTime}`);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  process.exit(0);
}

getUserEmail();
