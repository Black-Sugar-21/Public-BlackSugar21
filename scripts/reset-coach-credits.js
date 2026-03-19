const admin = require('firebase-admin');
const sa = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });

(async () => {
  try {
    const db = admin.firestore();
    const auth = admin.auth();
    const user = await auth.getUserByEmail('dverdugo85@gmail.com');
    console.log('UID:', user.uid);
    const doc = await db.collection('users').doc(user.uid).get();
    console.log('Current coachMessagesRemaining:', doc.data().coachMessagesRemaining);
    await db.collection('users').doc(user.uid).update({
      coachMessagesRemaining: 5,
      lastCoachResetDate: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('Reset to 5 credits OK');
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
})();
