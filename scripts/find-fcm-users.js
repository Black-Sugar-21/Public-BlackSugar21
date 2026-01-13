const admin = require('firebase-admin');
const s = require('./serviceAccountKey.json');
if (!admin.apps.length) admin.initializeApp({credential: admin.credential.cert(s)});

admin.firestore().collection('users').where('fcmToken', '!=', null).limit(5).get()
  .then(snapshot => {
    console.log(`Encontrados ${snapshot.size} usuarios con FCM token:\n`);
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(`• ${data.name} (${doc.id})`);
      console.log(`  Token: ${data.fcmToken.substring(0, 40)}...\n`);
    });
    process.exit(0);
  });
