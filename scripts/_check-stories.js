#!/usr/bin/env node
'use strict';
const admin = require('firebase-admin');
const sa = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

(async () => {
  const snap = await db.collection('stories').where('isReviewer', '==', true).get();
  const bySender = {};
  snap.docs.forEach(doc => {
    const d = doc.data();
    if (!bySender[d.senderId]) bySender[d.senderId] = 0;
    bySender[d.senderId]++;
  });
  console.log('Total reviewer stories:', snap.size);
  console.log('Profiles with stories:', Object.keys(bySender).length);

  // Show per-profile breakdown
  for (const [uid, count] of Object.entries(bySender)) {
    console.log('  ' + uid.substring(0, 20) + '... -> ' + count + ' stories');
  }

  // Show a sample story structure
  if (snap.docs.length > 0) {
    const d = snap.docs[0].data();
    console.log('\nSample story fields:', Object.keys(d).join(', '));
    console.log('  isPersonal:', d.isPersonal);
    console.log('  neverExpires:', d.neverExpires);
    console.log('  isReviewer:', d.isReviewer);
    console.log('  expiresAt:', d.expiresAt ? d.expiresAt.toDate().toISOString() : 'null');
  }

  process.exit(0);
})();
