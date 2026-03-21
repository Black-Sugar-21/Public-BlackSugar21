const admin = require('firebase-admin');
const sa = require('./serviceAccountKey.json');
if (admin.apps.length === 0) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const uid = 'g4Zbr8tEguMcpZonw72xM5MGse32';

Promise.all([
  db.collection('users').doc(uid).collection('swipes').get(),
  db.collection('users').doc(uid).collection('liked').get(),
  db.collection('users').doc(uid).collection('passed').get(),
  db.collection('users').doc(uid).collection('superLiked').get(),
  db.collection('users').doc(uid).get()
]).then(([sw, li, pa, sl, ud]) => {
  console.log('Remaining swipes:', sw.size);
  console.log('Remaining liked subcol:', li.size);
  console.log('Remaining passed subcol:', pa.size);
  console.log('Remaining superLiked subcol:', sl.size);
  const d = ud.data();
  console.log('liked array:', (d.liked || []).length);
  console.log('passed array:', (d.passed || []).length);
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
