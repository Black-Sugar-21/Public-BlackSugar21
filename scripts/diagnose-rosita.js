#!/usr/bin/env node
const admin = require('firebase-admin');
const sa = require('./serviceAccountKey.json');
if (admin.apps.length === 0) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

(async () => {
  const doc = await db.collection('users').doc('C3QgIAGvMvRLPrnBtfHqYRsrV7p2').get();
  const d = doc.data();
  console.log('=== ROSITA STATUS ===');
  console.log('activeChat:', d.activeChat || 'NONE');
  console.log('paused:', d.paused);
  console.log('accountStatus:', d.accountStatus);

  const matches = await db.collection('matches')
    .where('usersMatched', 'array-contains', 'C3QgIAGvMvRLPrnBtfHqYRsrV7p2')
    .limit(5).get();
  console.log('\n=== MATCHES (' + matches.size + ') ===');

  for (const m of matches.docs) {
    const msgs = await db.collection('matches').doc(m.id).collection('messages')
      .orderBy('timestamp', 'desc').limit(3).get();
    console.log('\nMatch:', m.id);
    msgs.forEach(msg => {
      const md = msg.data();
      console.log('  sender:', md.senderId,
        '| notifSent:', md.notificationSent,
        '| skip:', md.notificationSkipReason || '-',
        '| attempted:', md.notificationAttemptedAt ? 'YES' : 'NO');
    });
  }
  process.exit(0);
})();
