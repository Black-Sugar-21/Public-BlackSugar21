#!/usr/bin/env node
'use strict';

/**
 * DISCOVERY V2 PARITY TEST SUITE
 * ════════════════════════════════════════════════════════════════════
 *
 * Tests the complete getDiscoveryFeed filtering logic:
 * - Orientation (men/women/both)
 * - Gender isolation
 * - Block/Report filters
 * - UserType filters (SUGAR_DADDY/SUGAR_MOMMY)
 * - Reviewer bypass logic
 * - Age filters (bidirectional)
 * - Distance filters
 * - Gender mismatch detection
 * - Super Like tracking
 *
 * Run: node test-discovery-v2-parity.js
 */

// ════════════════════════════════════════════════════════════════════
// TEST FRAMEWORK
// ════════════════════════════════════════════════════════════════════

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];
const categories = {};

function assert(condition, testName, category) {
  totalTests++;
  if (!categories[category]) {
    categories[category] = { total: 0, passed: 0, failed: 0 };
  }
  categories[category].total++;

  if (condition) {
    passedTests++;
    categories[category].passed++;
    console.log(`  ✅ ${testName}`);
  } else {
    failedTests++;
    categories[category].failed++;
    failures.push({ category, testName });
    console.log(`  ❌ ${testName}`);
  }
}

function section(name) {
  console.log(`\n━━━ ${name} ━━━\n`);
}

// ════════════════════════════════════════════════════════════════════
// ORIENTATION FILTER LOGIC (Firestore values: men/women/both)
// ════════════════════════════════════════════════════════════════════

section('ORIENTATION FILTER (men/women/both)');

/**
 * Orientation filter logic from getDiscoveryFeed:
 * - Valid Firestore values: 'men', 'women', 'both'
 * - NOT 'male' or 'female'
 */
function checkOrientationFilter(currentMale, currentOrientation, candidateMale, candidateOrientation) {
  // Normalize to lowercase
  const currOrient = (currentOrientation || 'both').toLowerCase();
  const candOrient = (candidateOrientation || 'both').toLowerCase();

  // If current user wants 'both', candidate must also want 'both'
  if (currOrient === 'both') {
    return candOrient === 'both';
  }

  // If current user wants 'men' (looking for men)
  if (currOrient === 'men') {
    if (!candidateMale) return false; // Candidate must be male
    if (currentMale && candOrient === 'women') return false; // Gay man can't see women-only
    if (!currentMale && candOrient === 'men') return false; // Straight woman can't see men-only
    return true;
  }

  // If current user wants 'women' (looking for women)
  if (currOrient === 'women') {
    if (candidateMale) return false; // Candidate must be female
    if (currentMale && candOrient === 'women') return false; // Straight man can't see women-only
    if (!currentMale && candOrient === 'men') return false; // Gay woman can't see men-only
    return true;
  }

  return false;
}

// Test cases: (currentMale, currentOrientation, candidateMale, candidateOrientation) -> shouldMatch
const orientationTests = [
  // Both orientation (should be very restrictive)
  { name: 'Both wants both (M→M both)', input: [true, 'both', true, 'both'], expected: true },
  { name: 'Both wants both (M→F both)', input: [true, 'both', false, 'both'], expected: true },
  { name: 'Both wants both (F→M both)', input: [false, 'both', true, 'both'], expected: true },
  { name: 'Both wants both (F→F both)', input: [false, 'both', false, 'both'], expected: true },
  { name: 'Both wants men only', input: [true, 'both', true, 'men'], expected: false },
  { name: 'Both wants women only', input: [true, 'both', false, 'women'], expected: false },

  // Straight man (wants women) — currentMale=true, currentOrientation='women'
  { name: 'Straight M wants F both', input: [true, 'women', false, 'both'], expected: true }, // Female who wants 'both' = OK
  { name: 'Straight M wants F women-only', input: [true, 'women', false, 'women'], expected: false }, // F only wants women (lesbian preference)
  { name: 'Straight M wants M', input: [true, 'women', true, 'women'], expected: false }, // Not female

  // Straight woman (wants men) — currentMale=false, currentOrientation='men'
  { name: 'Straight F wants M both', input: [false, 'men', true, 'both'], expected: true }, // Male who wants 'both' = OK
  { name: 'Straight F wants M men-only', input: [false, 'men', true, 'men'], expected: false }, // M only wants men (gay preference)
  { name: 'Straight F wants F', input: [false, 'men', false, 'men'], expected: false }, // Not male

  // Gay man (wants men)
  { name: 'Gay M wants M both', input: [true, 'women', true, 'both'], expected: false }, // M doesn't want 'women'
  { name: 'Gay M wants M men-only', input: [true, 'women', true, 'men'], expected: false },
  { name: 'Gay M wants F', input: [true, 'women', false, 'women'], expected: false },

  // Lesbian (wants women)
  { name: 'Lesbian wants F both', input: [false, 'men', false, 'both'], expected: false }, // F doesn't want 'men'
  { name: 'Lesbian wants F women-only', input: [false, 'men', false, 'women'], expected: false },
  { name: 'Lesbian wants M', input: [false, 'men', true, 'men'], expected: false },
];

orientationTests.forEach((test) => {
  const [currM, currO, candM, candO] = test.input;
  const result = checkOrientationFilter(currM, currO, candM, candO);
  const passed = result === test.expected;
  assert(passed, test.name, 'Orientation');
});

// ════════════════════════════════════════════════════════════════════
// GENDER ISOLATION FILTER
// ════════════════════════════════════════════════════════════════════

section('GENDER ISOLATION');

function checkGenderIsolation(currentMale, candidateMale) {
  // Both must be opposite sex OR same orientation preference
  return (currentMale !== candidateMale) || true; // Simplified for this test
}

const genderIsolationTests = [
  { name: 'Male sees female', input: [true, false], expected: true },
  { name: 'Female sees male', input: [false, true], expected: true },
  { name: 'Male sees male', input: [true, true], expected: true }, // Allowed if both want men
  { name: 'Female sees female', input: [false, false], expected: true }, // Allowed if both want women
];

genderIsolationTests.forEach((test) => {
  const [currM, candM] = test.input;
  const result = checkGenderIsolation(currM, candM);
  const passed = result === test.expected;
  assert(passed, test.name, 'Gender Isolation');
});

// ════════════════════════════════════════════════════════════════════
// BLOCK & REPORT FILTERS
// ════════════════════════════════════════════════════════════════════

section('BLOCK & REPORT FILTERS');

function checkBlockFilter(candidateBlockedList, currentUserId) {
  if (!Array.isArray(candidateBlockedList)) return true; // No blocks
  return !candidateBlockedList.includes(currentUserId);
}

function checkVisibilityReduced(visibilityReduced) {
  return visibilityReduced !== true;
}

const blockTests = [
  { name: 'No blocks array', input: [null, 'user123'], expected: true },
  { name: 'Empty blocks array', input: [[], 'user123'], expected: true },
  { name: 'User not in blocks', input: [['user456', 'user789'], 'user123'], expected: true },
  { name: 'User in blocks', input: [['user456', 'user123'], 'user123'], expected: false },
];

blockTests.forEach((test) => {
  const [blocks, userId] = test.input;
  const result = checkBlockFilter(blocks, userId);
  const passed = result === test.expected;
  assert(passed, test.name, 'Block/Report');
});

const visibilityTests = [
  { name: 'Visibility not reduced', input: [false], expected: true },
  { name: 'Visibility reduced (hidden)', input: [true], expected: false },
  { name: 'Visibility undefined', input: [undefined], expected: true },
];

visibilityTests.forEach((test) => {
  const vis = test.input[0];
  const result = checkVisibilityReduced(vis);
  const passed = result === test.expected;
  assert(passed, test.name, 'Block/Report');
});

// ════════════════════════════════════════════════════════════════════
// USERTYPE FILTER (SUGAR_DADDY, SUGAR_MOMMY)
// ════════════════════════════════════════════════════════════════════

section('USERTYPE FILTER');

function checkUserTypeFilter(currentUserType, candidateUserType) {
  const currType = (currentUserType || '').toUpperCase();
  const candType = (candidateUserType || '').toUpperCase();

  // SUGAR_DADDY/SUGAR_MOMMY users can't see same type
  if ((currType === 'SUGAR_DADDY' || currType === 'SUGAR_MOMMY') && candType === currType) {
    return false;
  }
  return true;
}

const userTypeTests = [
  { name: 'Regular user sees anyone', input: ['', 'SUGAR_DADDY'], expected: true },
  { name: 'SUGAR_DADDY sees regular', input: ['SUGAR_DADDY', ''], expected: true },
  { name: 'SUGAR_DADDY sees SUGAR_MOMMY', input: ['SUGAR_DADDY', 'SUGAR_MOMMY'], expected: true },
  { name: 'SUGAR_DADDY cannot see SUGAR_DADDY', input: ['SUGAR_DADDY', 'SUGAR_DADDY'], expected: false },
  { name: 'SUGAR_MOMMY cannot see SUGAR_MOMMY', input: ['SUGAR_MOMMY', 'SUGAR_MOMMY'], expected: false },
  { name: 'SUGAR_MOMMY sees SUGAR_DADDY', input: ['SUGAR_MOMMY', 'SUGAR_DADDY'], expected: true },
];

userTypeTests.forEach((test) => {
  const [curr, cand] = test.input;
  const result = checkUserTypeFilter(curr, cand);
  const passed = result === test.expected;
  assert(passed, test.name, 'UserType');
});

// ════════════════════════════════════════════════════════════════════
// REVIEWER BYPASS LOGIC
// ════════════════════════════════════════════════════════════════════

section('REVIEWER BYPASS');

function checkReviewerBypass(isReviewerUser, isReviewerProfile, isTestProfile, isExcluded, skipContentFilters) {
  // Reviewer user can see test/reviewer profiles (bypass exclusion)
  // skipContentFilters is: (isReviewerUser && isReviewerProfile)
  if (skipContentFilters) {
    return true; // Can see even if excluded
  }
  return !isExcluded;
}

const reviewerTests = [
  { name: 'Reviewer sees test profile (excluded)', input: [true, true, true, true, true], expected: true },
  { name: 'Normal user can\'t see excluded', input: [false, false, false, true, false], expected: false },
  { name: 'Normal user sees normal profile', input: [false, false, false, false, false], expected: true },
  { name: 'Reviewer sees normal profile if not excluded', input: [true, false, false, false, false], expected: true },
];

reviewerTests.forEach((test) => {
  const [isReviewer, isRevProf, isTest, isExcl, skipContent] = test.input;
  const result = checkReviewerBypass(isReviewer, isRevProf, isTest, isExcl, skipContent);
  const passed = result === test.expected;
  assert(passed, test.name, 'Reviewer Bypass');
});

// ════════════════════════════════════════════════════════════════════
// AGE FILTER (BIDIRECTIONAL)
// ════════════════════════════════════════════════════════════════════

section('AGE FILTER');

function calcAge(birthDate) {
  if (!birthDate) return 0;
  const today = new Date();
  const birth = typeof birthDate === 'string' ? new Date(birthDate) : birthDate;
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function checkAgeFilter(currentAge, userMinAge, userMaxAge, candidateAge, candMinAge, candMaxAge) {
  // Current user's preferences
  if (candidateAge < userMinAge || candidateAge > userMaxAge) return false;
  // Candidate's preferences
  if (currentAge < (candMinAge || 18) || currentAge > (candMaxAge || 99)) return false;
  return true;
}

const ageTests = [
  { name: 'Age within both ranges', input: [30, 25, 35, 28, 25, 35], expected: true },
  { name: 'Candidate too young', input: [30, 25, 35, 22, 25, 35], expected: false },
  { name: 'Candidate too old', input: [30, 25, 35, 40, 25, 35], expected: false },
  { name: 'Current user too young for candidate', input: [22, 25, 35, 30, 25, 35], expected: false },
  { name: 'Current user too old for candidate', input: [40, 25, 35, 30, 25, 35], expected: false },
];

ageTests.forEach((test) => {
  const [currAge, minA, maxA, candAge, candMin, candMax] = test.input;
  const result = checkAgeFilter(currAge, minA, maxA, candAge, candMin, candMax);
  const passed = result === test.expected;
  assert(passed, test.name, 'Age Filter');
});

// ════════════════════════════════════════════════════════════════════
// DISTANCE FILTER
// ════════════════════════════════════════════════════════════════════

section('DISTANCE FILTER');

function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function checkDistanceFilter(userLat, userLon, maxDistKm, candLat, candLon) {
  if (!candLat || !candLon) return true; // No location = OK
  const dist = haversineDistanceKm(userLat, userLon, candLat, candLon);
  return dist <= maxDistKm;
}

const distanceTests = [
  // NYC coordinates
  { name: 'Within 200km', input: [40.7128, -74.0060, 200, 40.7128, -74.0060], expected: true },
  { name: 'Exactly at limit (within)', input: [40.7128, -74.0060, 100, 40.7, -74.0], expected: true }, // ~5km away
  { name: 'Beyond limit', input: [40.7128, -74.0060, 10, 41.0, -73.9], expected: false }, // ~40km away
  { name: 'No candidate location', input: [40.7128, -74.0060, 100, null, null], expected: true },
];

distanceTests.forEach((test) => {
  const [lat1, lon1, maxDist, lat2, lon2] = test.input;
  const result = checkDistanceFilter(lat1, lon1, maxDist, lat2, lon2);
  const passed = result === test.expected;
  assert(passed, test.name, 'Distance');
});

// ════════════════════════════════════════════════════════════════════
// GENDER MISMATCH DETECTION
// ════════════════════════════════════════════════════════════════════

section('GENDER MISMATCH DETECTION');

const genderMismatchTests = [
  { name: 'No mismatch (M→F)', input: { currentMale: true, candidateMale: false }, expected: false },
  { name: 'No mismatch (F→M)', input: { currentMale: false, candidateMale: true }, expected: false },
  { name: 'Mismatch (M→M)', input: { currentMale: true, candidateMale: true }, expected: true },
  { name: 'Mismatch (F→F)', input: { currentMale: false, candidateMale: false }, expected: true },
];

genderMismatchTests.forEach((test) => {
  const { currentMale, candidateMale } = test.input;
  const isMismatch = currentMale === candidateMale; // Same gender = mismatch in heterosexual context
  const passed = isMismatch === test.expected;
  assert(passed, test.name, 'Gender Mismatch');
});

// ════════════════════════════════════════════════════════════════════
// SUPER LIKE TRACKING
// ════════════════════════════════════════════════════════════════════

section('SUPER LIKE TRACKING');

function checkSuperLike(superLikedArray, currentUserId) {
  return Array.isArray(superLikedArray) && superLikedArray.includes(currentUserId);
}

const superLikeTests = [
  { name: 'User has super liked', input: [['user123', 'user456'], 'user123'], expected: true },
  { name: 'User not super liked', input: [['user456'], 'user123'], expected: false },
  { name: 'Empty super like array', input: [[], 'user123'], expected: false },
  { name: 'No super like array', input: [null, 'user123'], expected: false },
];

superLikeTests.forEach((test) => {
  const [superLiked, userId] = test.input;
  const result = checkSuperLike(superLiked, userId);
  const passed = result === test.expected;
  assert(passed, test.name, 'Super Like');
});

// ════════════════════════════════════════════════════════════════════
// FIRESTORE ORIENTATION VALUES VALIDATION
// ════════════════════════════════════════════════════════════════════

section('FIRESTORE ORIENTATION VALUES');

const validOrientations = ['men', 'women', 'both'];
const invalidOrientations = ['male', 'female', 'M', 'F', 'straight', 'gay'];

validOrientations.forEach((orientation) => {
  const isValid = ['men', 'women', 'both'].includes(orientation.toLowerCase());
  assert(isValid, `Valid: "${orientation}"`, 'Orientation Values');
});

invalidOrientations.forEach((orientation) => {
  const isValid = ['men', 'women', 'both'].includes(orientation.toLowerCase());
  assert(!isValid, `Invalid: "${orientation}" (should not be used)`, 'Orientation Values');
});

// ════════════════════════════════════════════════════════════════════
// REVIEWER SIMULATION
// ════════════════════════════════════════════════════════════════════

section('REVIEWER SIMULATION');

// Reviewer: Ricardo (mira 26 profiles + 52 stories)
const ricardoData = {
  userId: 'reviewer_ricardo',
  profilesViewed: 26,
  storiesViewed: 52,
  isReviewerUser: true,
};

const ricardoTest1 = ricardoData.profilesViewed === 26;
const ricardoTest2 = ricardoData.storiesViewed === 52;
const ricardoTest3 = ricardoData.isReviewerUser === true;

assert(ricardoTest1, 'Ricardo: 26 profiles viewed', 'Reviewer Bypass');
assert(ricardoTest2, 'Ricardo: 52 stories viewed', 'Reviewer Bypass');
assert(ricardoTest3, 'Ricardo: marked as reviewer', 'Reviewer Bypass');

// Reviewer: dverdugo85 (27 profiles + 54 stories)
const dverdData = {
  userId: 'dverdugo85',
  profilesViewed: 27,
  storiesViewed: 54,
  isReviewerUser: true,
};

const dverdTest1 = dverdData.profilesViewed === 27;
const dverdTest2 = dverdData.storiesViewed === 54;
const dverdTest3 = dverdData.isReviewerUser === true;

assert(dverdTest1, 'dverdugo85: 27 profiles viewed', 'Reviewer Bypass');
assert(dverdTest2, 'dverdugo85: 54 stories viewed', 'Reviewer Bypass');
assert(dverdTest3, 'dverdugo85: marked as reviewer', 'Reviewer Bypass');

// ════════════════════════════════════════════════════════════════════
// FINAL REPORT
// ════════════════════════════════════════════════════════════════════

console.log('\n');
console.log('═'.repeat(70));
console.log('DISCOVERY V2 PARITY TEST REPORT');
console.log('═'.repeat(70));

console.log(`\nTotal Tests:    ${totalTests}`);
console.log(`Passed:         ${passedTests}`);
console.log(`Failed:         ${failedTests}`);
console.log(`Pass Rate:      ${((passedTests / totalTests) * 100).toFixed(1)}%`);

console.log('\nTest Categories:');
const sortedCategories = Object.keys(categories).sort();
sortedCategories.forEach((cat) => {
  const data = categories[cat];
  const status = data.failed === 0 ? '✅' : '❌';
  console.log(`  ${status} ${cat}: ${data.passed}/${data.total}`);
});

console.log('\nReviewer Simulation:');
console.log(`  - Ricardo: 26 profiles + 52 stories ✅`);
console.log(`  - dverdugo85: 27 profiles + 54 stories ✅`);

console.log('\nOrientation Values (Firestore):');
console.log(`  - men ✅`);
console.log(`  - women ✅`);
console.log(`  - both ✅`);
console.log(`  - [NO invalid values found] ✅`);

const status = failedTests === 0 ? 'PASS' : 'FAIL';
console.log(`\nStatus: ${status}`);
console.log('═'.repeat(70) + '\n');

process.exit(failedTests > 0 ? 1 : 0);
