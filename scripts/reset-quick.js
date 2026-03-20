const admin = require('firebase-admin');
const sa = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

// Direct update by known UID (dverdugo85@gmail.com)
const uid = 'tvmkXqXGSzfriAkQUI4KrQF6sZm2';
db.collection('users').doc(uid).update({
  coachMessagesRemaining: 5,
  lastCoachResetDate: admin.firestore.FieldValue.serverTimestamp()
}).then(() => {
  console.log('OK: coachMessagesRemaining reset to 5 for ' + uid);
  process.exit(0);
}).catch(e => {
  console.error('FAIL:', e.message);
  process.exit(1);
});

setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 10000);
