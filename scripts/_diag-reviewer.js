const admin = require('firebase-admin');
const sa = require('./serviceAccountKey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const REVIEWER_UID = 'g4Zbr8tEguMcpZonw72xM5MGse32';

async function main() {
  // 1. Reviewer profile
  const reviewerDoc = await db.collection('users').doc(REVIEWER_UID).get();
  if (!reviewerDoc.exists) {
    console.log('ERROR: Reviewer profile does NOT exist!');
    process.exit(1);
  }
  const r = reviewerDoc.data();
  console.log('=== REVIEWER PROFILE ===');
  console.log('name:', r.name);
  console.log('male:', r.male);
  console.log('orientation:', r.orientation);
  console.log('userType:', r.userType);
  console.log('latitude:', r.latitude);
  console.log('longitude:', r.longitude);
  console.log('g (geohash):', r.g);
  console.log('paused:', r.paused);
  console.log('accountStatus:', r.accountStatus);
  console.log('visible:', r.visible);
  console.log('minAge:', r.minAge, 'maxAge:', r.maxAge);
  console.log('maxDistance:', r.maxDistance);
  console.log('liked count:', (r.liked || []).length);
  console.log('passed count:', (r.passed || []).length);
  console.log('blocked count:', (r.blocked || []).length);
  console.log('dailyLikesRemaining:', r.dailyLikesRemaining);
  console.log('isTest:', r.isTest, 'isReviewer:', r.isReviewer);

  // 2. Test profiles
  const testSnap = await db.collection('users').where('isTest', '==', true).get();
  console.log('\n=== TEST PROFILES (' + testSnap.size + ') ===');
  testSnap.docs.forEach(d => {
    const p = d.data();
    console.log(`  ${p.name} | male:${p.male} | orient:${p.orientation} | type:${p.userType} | lat:${p.latitude ? 'YES' : 'NO'} | g:${p.g ? 'YES' : 'NO'} | paused:${p.paused} | visible:${p.visible} | status:${p.accountStatus}`);
  });

  // 3. Check swipes - how many has reviewer swiped
  const swipesSnap = await db.collection('swipes').doc(REVIEWER_UID).collection('swipes').get();
  console.log('\n=== REVIEWER SWIPES ===');
  console.log('Total swipes:', swipesSnap.size);

  // 4. Check liked/passed arrays
  console.log('\n=== LIKED/PASSED ===');
  console.log('liked:', JSON.stringify((r.liked || []).slice(0, 5)), '... total:', (r.liked || []).length);
  console.log('passed:', JSON.stringify((r.passed || []).slice(0, 5)), '... total:', (r.passed || []).length);

  // 5. Simulate what getCompatibleProfileIds would do
  console.log('\n=== SIMULATED DISCOVERY ===');
  const excludedIds = new Set([
    ...(r.liked || []),
    ...(r.passed || []),
    ...(r.blocked || []),
    REVIEWER_UID
  ]);
  console.log('excludedIds count:', excludedIds.size);

  let compatible = 0;
  let excluded = 0;
  let bypassed = 0;
  testSnap.docs.forEach(d => {
    const p = d.data();
    const isReviewerProfile = p.isTest === true || p.isReviewer === true;
    const isReviewerUser = true; // we ARE the reviewer
    
    if (excludedIds.has(d.id)) {
      if (isReviewerUser && isReviewerProfile) {
        bypassed++;
        compatible++;
      } else {
        excluded++;
      }
    } else {
      compatible++;
    }
  });
  console.log('Compatible (would show):', compatible);
  console.log('Excluded (swiped but NOT bypassed):', excluded);
  console.log('Bypassed (swiped but reviewer exception):', bypassed);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
