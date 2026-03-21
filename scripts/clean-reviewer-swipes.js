const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function cleanReviewerSwipes() {
  const reviewerUid = 'g4Zbr8tEguMcpZonw72xM5MGse32';

  // Get all swipes for the reviewer
  const swipesSnap = await db.collection('users').doc(reviewerUid).collection('swipes').get();
  console.log('Total swipes:', swipesSnap.size);

  // Get all test profile user docs with isReviewer=true
  const reviewerProfilesSnap = await db.collection('users').where('isReviewer', '==', true).get();
  const testProfileIds = new Set();
  for (const doc of reviewerProfilesSnap.docs) {
    if (doc.id !== reviewerUid) testProfileIds.add(doc.id);
  }
  console.log('Test profile IDs to clear swipes for:', testProfileIds.size);

  // Delete swipes that target test profiles
  const batch = db.batch();
  let count = 0;
  for (const doc of swipesSnap.docs) {
    if (testProfileIds.has(doc.id)) {
      batch.delete(doc.ref);
      count++;
      console.log('  Deleting swipe:', doc.id);
    }
  }

  if (count > 0) {
    await batch.commit();
    console.log('Deleted', count, 'swipes on test profiles');
  } else {
    console.log('No swipes on test profiles found');
  }

  // Clean liked/passed/superLiked arrays
  const reviewerDoc = await db.collection('users').doc(reviewerUid).get();
  const data = reviewerDoc.data();
  const liked = data.liked || [];
  const passed = data.passed || [];
  const superLiked = data.superLiked || [];

  const likedTest = liked.filter(id => testProfileIds.has(id));
  const passedTest = passed.filter(id => testProfileIds.has(id));
  const superLikedTest = superLiked.filter(id => testProfileIds.has(id));

  console.log('Test IDs in liked:', likedTest.length, 'passed:', passedTest.length, 'superLiked:', superLikedTest.length);

  const updates = {};
  if (likedTest.length > 0) updates.liked = admin.firestore.FieldValue.arrayRemove(...likedTest);
  if (passedTest.length > 0) updates.passed = admin.firestore.FieldValue.arrayRemove(...passedTest);
  if (superLikedTest.length > 0) updates.superLiked = admin.firestore.FieldValue.arrayRemove(...superLikedTest);

  if (Object.keys(updates).length > 0) {
    await db.collection('users').doc(reviewerUid).update(updates);
    console.log('Cleaned arrays:', Object.keys(updates).join(', '));
  } else {
    console.log('No test IDs in liked/passed/superLiked arrays');
  }

  // Clean liked subcollection
  const likedSubSnap = await db.collection('users').doc(reviewerUid).collection('liked').get();
  const likedBatch = db.batch();
  let likedSubCount = 0;
  for (const doc of likedSubSnap.docs) {
    if (testProfileIds.has(doc.id)) {
      likedBatch.delete(doc.ref);
      likedSubCount++;
    }
  }
  if (likedSubCount > 0) {
    await likedBatch.commit();
    console.log('Deleted', likedSubCount, 'liked subcollection docs');
  }

  // Clean passed subcollection
  const passedSubSnap = await db.collection('users').doc(reviewerUid).collection('passed').get();
  const passedBatch = db.batch();
  let passedSubCount = 0;
  for (const doc of passedSubSnap.docs) {
    if (testProfileIds.has(doc.id)) {
      passedBatch.delete(doc.ref);
      passedSubCount++;
    }
  }
  if (passedSubCount > 0) {
    await passedBatch.commit();
    console.log('Deleted', passedSubCount, 'passed subcollection docs');
  }

  // Clean superLiked subcollection
  const superLikedSubSnap = await db.collection('users').doc(reviewerUid).collection('superLiked').get();
  const superLikedBatch = db.batch();
  let superLikedSubCount = 0;
  for (const doc of superLikedSubSnap.docs) {
    if (testProfileIds.has(doc.id)) {
      superLikedBatch.delete(doc.ref);
      superLikedSubCount++;
    }
  }
  if (superLikedSubCount > 0) {
    await superLikedBatch.commit();
    console.log('Deleted', superLikedSubCount, 'superLiked subcollection docs');
  }

  console.log('DONE - Reviewer data cleaned');
}

cleanReviewerSwipes().catch(console.error);
