const admin = require('firebase-admin');
const sa = require('./serviceAccountKey.json');
if (admin.apps.length === 0) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function main() {
  // 1. Check all reviewer/test profiles
  const [byReviewer, byTest] = await Promise.all([
    db.collection('users').where('isReviewer', '==', true).get(),
    db.collection('users').where('isTest', '==', true).get()
  ]);

  const allIds = new Set();
  const profiles = [];

  for (const snap of [byReviewer, byTest]) {
    for (const doc of snap.docs) {
      if (allIds.has(doc.id)) continue;
      allIds.add(doc.id);
      const d = doc.data();
      profiles.push({
        id: doc.id,
        name: d.name || '(no name)',
        email: d.email || '(no email)',
        isReviewer: d.isReviewer || false,
        isTest: d.isTest || false,
        accountStatus: d.accountStatus || '(none)',
        paused: d.paused || false,
        visible: d.visible,
        userType: d.userType || '(none)',
        male: d.male
      });
    }
  }

  console.log(`\n=== REVIEWER/TEST PROFILES (${profiles.length}) ===`);
  
  const discProfiles = profiles.filter(p => p.email && p.email.startsWith('reviewer_disc_'));
  const chatProfiles = profiles.filter(p => p.email && p.email.startsWith('reviewer_chat_'));
  const otherProfiles = profiles.filter(p => !p.email || (!p.email.startsWith('reviewer_disc_') && !p.email.startsWith('reviewer_chat_')));

  console.log(`\n--- Discovery profiles (reviewer_disc_*): ${discProfiles.length} ---`);
  for (const p of discProfiles) {
    console.log(`  ${p.id} | ${p.name} | ${p.email} | status=${p.accountStatus} | isReviewer=${p.isReviewer} | isTest=${p.isTest} | paused=${p.paused}`);
  }

  console.log(`\n--- Chat profiles (reviewer_chat_*): ${chatProfiles.length} ---`);
  for (const p of chatProfiles) {
    console.log(`  ${p.id} | ${p.name} | ${p.email} | status=${p.accountStatus} | isReviewer=${p.isReviewer} | isTest=${p.isTest} | paused=${p.paused}`);
  }

  if (otherProfiles.length > 0) {
    console.log(`\n--- OTHER profiles with isReviewer/isTest: ${otherProfiles.length} ---`);
    for (const p of otherProfiles) {
      console.log(`  ${p.id} | ${p.name} | email=${p.email} | isReviewer=${p.isReviewer} | isTest=${p.isTest}`);
    }
  }

  // 2. Check reviewer user swipes status
  const reviewerUid = 'g4Zbr8tEguMcpZonw72xM5MGse32';
  const [swipes, liked, passed, superLiked, reviewerDoc] = await Promise.all([
    db.collection('users').doc(reviewerUid).collection('swipes').get(),
    db.collection('users').doc(reviewerUid).collection('liked').get(),
    db.collection('users').doc(reviewerUid).collection('passed').get(),
    db.collection('users').doc(reviewerUid).collection('superLiked').get(),
    db.collection('users').doc(reviewerUid).get()
  ]);

  const rd = reviewerDoc.data();
  console.log(`\n=== REVIEWER USER (${reviewerUid}) ===`);
  console.log(`  swipes subcol: ${swipes.size}`);
  console.log(`  liked subcol: ${liked.size}`);
  console.log(`  passed subcol: ${passed.size}`);
  console.log(`  superLiked subcol: ${superLiked.size}`);
  console.log(`  liked array: ${(rd.liked || []).length}`);
  console.log(`  passed array: ${(rd.passed || []).length}`);

  // 3. Check which test profile IDs are in excludedIds
  const testIds = [...allIds].filter(id => id !== reviewerUid);
  const swipeIds = new Set(swipes.docs.map(d => d.id));
  const likedSubIds = new Set(liked.docs.map(d => d.id));
  const passedSubIds = new Set(passed.docs.map(d => d.id));
  
  console.log(`\n=== TEST PROFILE IDs IN EXCLUDED COLLECTIONS ===`);
  for (const tid of testIds) {
    const inSwipes = swipeIds.has(tid);
    const inLiked = likedSubIds.has(tid);
    const inPassed = passedSubIds.has(tid);
    const inLikedArr = (rd.liked || []).includes(tid);
    const inPassedArr = (rd.passed || []).includes(tid);
    if (inSwipes || inLiked || inPassed || inLikedArr || inPassedArr) {
      console.log(`  ${tid}: swipes=${inSwipes} liked=${inLiked} passed=${inPassed} likedArr=${inLikedArr} passedArr=${inPassedArr}`);
    }
  }
  console.log('  (empty = all clean, test profiles will appear in discovery)');

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
