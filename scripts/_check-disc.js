const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

(async () => {
  const snap = await db.collection('users').where('isReviewer', '==', true).get();
  console.log('Total isReviewer profiles:', snap.size);

  const discProfiles = [];
  const otherProfiles = [];

  for (const doc of snap.docs) {
    const d = doc.data();
    const info = { id: doc.id, name: d.name, hasStories: false };
    if (doc.id.startsWith('reviewer_disc_')) {
      discProfiles.push(info);
    } else {
      otherProfiles.push(info);
    }
  }

  for (const p of discProfiles) {
    const stories = await db.collection('stories')
      .where('senderId', '==', p.id)
      .where('isPersonal', '==', true)
      .limit(1).get();
    p.hasStories = (stories.size > 0);
  }

  console.log('\n=== reviewer_disc_* profiles (' + discProfiles.length + ') ===');
  discProfiles.forEach(p => console.log(p.id, '|', p.name, '| stories:', p.hasStories));

  console.log('\n=== Other isReviewer profiles (' + otherProfiles.length + ') ===');
  otherProfiles.slice(0, 5).forEach(p => console.log(p.id, '|', p.name));
  if (otherProfiles.length > 5) console.log('... and', otherProfiles.length - 5, 'more');

  process.exit(0);
})();
