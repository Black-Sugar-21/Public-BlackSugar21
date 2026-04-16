#!/usr/bin/env node
/**
 * Internal Test Suite: Multi-Universe Places CF
 * Tests category switching, data freshness, and response validation
 *
 * Usage:
 * node test-multiverse-places.js
 */

'use strict';

const admin = require('firebase-admin');

// Initialize Firebase
if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'black-sugar21' });
}

const functions = admin.functions('us-central1');
const auth = admin.auth();
const db = admin.firestore();

// Test configuration
const TEST_CATEGORIES = [
  'cafe',
  'restaurant',
  'bar',
  'night_club',
  'park',
  'museum'
];

const TEST_USER_LOCATION = {
  latitude: 40.7128,   // New York, NY
  longitude: -74.0060
};

const TEST_RESULTS = {
  totalTests: 0,
  passedTests: 0,
  failedTests: 0,
  testDetails: []
};

/**
 * Test 1: Basic category search
 */
async function testBasicCategorySearch() {
  console.log('\n📋 TEST 1: Basic Category Search');
  console.log('━'.repeat(50));

  for (const category of TEST_CATEGORIES) {
    try {
      TEST_RESULTS.totalTests++;

      const callable = functions.httpsCallable('getMultiUniversePlaces');
      const result = await callable({
        userLocation: TEST_USER_LOCATION,
        userLanguage: 'en',
        category: category
      });

      const data = result.data;

      // Validation
      if (!data.success) {
        throw new Error(`Success flag is false: ${data.error}`);
      }

      if (!Array.isArray(data.suggestions)) {
        throw new Error('Suggestions is not an array');
      }

      const placeCount = data.suggestions.length;
      const hasMore = data.hasMore;

      console.log(`✅ ${category.padEnd(12)} │ ${placeCount} places │ hasMore: ${hasMore}`);

      // Validate place structure
      if (placeCount > 0) {
        const firstPlace = data.suggestions[0];
        if (!firstPlace.name || !firstPlace.latitude || !firstPlace.longitude) {
          throw new Error('Place missing required fields');
        }
      }

      TEST_RESULTS.passedTests++;
      TEST_RESULTS.testDetails.push({
        test: `category_${category}`,
        status: 'PASS',
        placeCount,
        hasMore
      });
    } catch (err) {
      console.error(`❌ ${category.padEnd(12)} │ ERROR: ${err.message}`);
      TEST_RESULTS.failedTests++;
      TEST_RESULTS.testDetails.push({
        test: `category_${category}`,
        status: 'FAIL',
        error: err.message
      });
    }
  }
}

/**
 * Test 2: Category switching (simulates user pressing different venues)
 */
async function testCategorySwitching() {
  console.log('\n📋 TEST 2: Category Switching (Sequential)');
  console.log('━'.repeat(50));

  const switchSequence = ['cafe', 'restaurant', 'cafe', 'bar', 'night_club', 'park'];
  const results = [];

  for (let i = 0; i < switchSequence.length; i++) {
    try {
      TEST_RESULTS.totalTests++;
      const category = switchSequence[i];

      const callable = functions.httpsCallable('getMultiUniversePlaces');
      const result = await callable({
        userLocation: TEST_USER_LOCATION,
        userLanguage: 'en',
        category: category
      });

      const placeNames = result.data.suggestions.map(p => p.name).slice(0, 3);

      console.log(`[${i + 1}] ${category.padEnd(12)} │ Top 3: ${placeNames.join(', ') || 'none'}`);

      results.push({
        switch: i + 1,
        category,
        topPlaces: placeNames,
        timestamp: new Date().toISOString()
      });

      TEST_RESULTS.passedTests++;
    } catch (err) {
      console.error(`[${i + 1}] ❌ ERROR: ${err.message}`);
      TEST_RESULTS.failedTests++;
    }

    // Small delay between switches to simulate real user behavior
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Verify data freshness: same category at different times should have consistent results
  const firstCafe = results.find(r => r.category === 'cafeteria' && r.switch === 1);
  const secondCafe = results.find(r => r.category === 'cafeteria' && r.switch === 3);

  if (firstCafe && secondCafe) {
    const samePlaces = firstCafe.topPlaces.every(p => secondCafe.topPlaces.includes(p));
    console.log(`\n✓ Data consistency check: ${samePlaces ? 'PASS' : 'WARN'}`);
  }

  TEST_RESULTS.testDetails.push({
    test: 'category_switching',
    status: TEST_RESULTS.failedTests === 0 ? 'PASS' : 'FAIL',
    switches: switchSequence.length,
    uniqueCategories: [...new Set(switchSequence)].length
  });
}

/**
 * Test 3: Rapid category switching (stress test)
 */
async function testRapidCategorySwitching() {
  console.log('\n📋 TEST 3: Rapid Category Switching (Stress Test)');
  console.log('━'.repeat(50));

  const categories = ['cafe', 'restaurant', 'bar', 'night_club'];
  const rapidSwitches = 15;
  let successCount = 0;

  for (let i = 0; i < rapidSwitches; i++) {
    try {
      TEST_RESULTS.totalTests++;
      const category = categories[i % categories.length];

      const callable = functions.httpsCallable('getMultiUniversePlaces');
      const result = await callable({
        userLocation: TEST_USER_LOCATION,
        userLanguage: 'en',
        category: category
      });

      if (result.data.success && Array.isArray(result.data.suggestions)) {
        successCount++;
        process.stdout.write('.');
      } else {
        process.stdout.write('F');
      }

      TEST_RESULTS.passedTests++;
    } catch (err) {
      process.stdout.write('E');
      TEST_RESULTS.failedTests++;
    }

    // Very small delay
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`\n✓ Rapid switches: ${successCount}/${rapidSwitches} successful`);

  TEST_RESULTS.testDetails.push({
    test: 'rapid_switching',
    status: successCount === rapidSwitches ? 'PASS' : 'FAIL',
    successRate: `${(successCount / rapidSwitches * 100).toFixed(1)}%`
  });
}

/**
 * Test 4: Different user locations
 */
async function testDifferentLocations() {
  console.log('\n📋 TEST 4: Different User Locations');
  console.log('━'.repeat(50));

  const locations = [
    { name: 'New York', lat: 40.7128, lng: -74.0060 },
    { name: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
    { name: 'London', lat: 51.5074, lng: -0.1278 },
    { name: 'Tokyo', lat: 35.6762, lng: 139.6503 }
  ];

  for (const loc of locations) {
    try {
      TEST_RESULTS.totalTests++;

      const callable = functions.httpsCallable('getMultiUniversePlaces');
      const result = await callable({
        userLocation: {
          latitude: loc.lat,
          longitude: loc.lng
        },
        userLanguage: 'en',
        category: 'restaurant'
      });

      const placeCount = result.data.suggestions.length;
      console.log(`✅ ${loc.name.padEnd(12)} │ ${placeCount} restaurants found`);

      TEST_RESULTS.passedTests++;
      TEST_RESULTS.testDetails.push({
        test: `location_${loc.name}`,
        status: 'PASS',
        placeCount
      });
    } catch (err) {
      console.error(`❌ ${loc.name.padEnd(12)} │ ERROR: ${err.message}`);
      TEST_RESULTS.failedTests++;
    }
  }
}

/**
 * Test 5: Response structure validation
 */
async function testResponseStructure() {
  console.log('\n📋 TEST 5: Response Structure Validation');
  console.log('━'.repeat(50));

  try {
    TEST_RESULTS.totalTests++;

    const callable = functions.httpsCallable('getMultiUniversePlaces');
    const result = await callable({
      userLocation: TEST_USER_LOCATION,
      userLanguage: 'en',
      category: 'restaurant'
    });

    const data = result.data;
    const errors = [];

    // Check top-level structure
    if (typeof data.success !== 'boolean') errors.push('success field not boolean');
    if (!Array.isArray(data.suggestions)) errors.push('suggestions not array');
    if (typeof data.hasMore !== 'boolean') errors.push('hasMore not boolean');

    // Check place structure
    if (data.suggestions.length > 0) {
      const place = data.suggestions[0];
      const requiredFields = [
        'name', 'address', 'latitude', 'longitude', 'rating',
        'placeId', 'distanceUser1', 'distanceUser2', 'travelTimeUser1', 'travelTimeUser2'
      ];

      for (const field of requiredFields) {
        if (!(field in place)) {
          errors.push(`Place missing field: ${field}`);
        }
      }

      // Validate field types
      if (typeof place.latitude !== 'number') errors.push('latitude not number');
      if (typeof place.longitude !== 'number') errors.push('longitude not number');
      if (typeof place.rating !== 'number') errors.push('rating not number');
      if (typeof place.distanceUser1 !== 'number') errors.push('distanceUser1 not number');
    }

    if (errors.length === 0) {
      console.log('✅ Response structure: VALID');
      TEST_RESULTS.passedTests++;
      TEST_RESULTS.testDetails.push({
        test: 'response_structure',
        status: 'PASS',
        placeCount: data.suggestions.length,
        fieldsValidated: data.suggestions.length > 0 ? 10 : 0
      });
    } else {
      console.error('❌ Response structure errors:');
      errors.forEach(err => console.error(`   - ${err}`));
      TEST_RESULTS.failedTests++;
    }
  } catch (err) {
    console.error(`❌ ERROR: ${err.message}`);
    TEST_RESULTS.failedTests++;
  }
}

/**
 * Test 6: Language handling
 */
async function testLanguageHandling() {
  console.log('\n📋 TEST 6: Language Handling');
  console.log('━'.repeat(50));

  const languages = ['en', 'es', 'pt', 'fr', 'de', 'ja', 'zh', 'ru', 'ar', 'id'];

  for (const lang of languages) {
    try {
      TEST_RESULTS.totalTests++;

      const callable = functions.httpsCallable('getMultiUniversePlaces');
      const result = await callable({
        userLocation: TEST_USER_LOCATION,
        userLanguage: lang,
        category: 'restaurant'
      });

      const placeCount = result.data.suggestions.length;
      console.log(`✅ ${lang.padEnd(4)} │ ${placeCount} places`);

      TEST_RESULTS.passedTests++;
    } catch (err) {
      console.error(`❌ ${lang.padEnd(4)} │ ERROR: ${err.message}`);
      TEST_RESULTS.failedTests++;
    }
  }
}

/**
 * Print test summary
 */
function printSummary() {
  console.log('\n\n' + '═'.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('═'.repeat(60));

  const passRate = (TEST_RESULTS.passedTests / TEST_RESULTS.totalTests * 100).toFixed(1);

  console.log(`
Total Tests:    ${TEST_RESULTS.totalTests}
Passed:         ${TEST_RESULTS.passedTests} ✅
Failed:         ${TEST_RESULTS.failedTests} ❌
Pass Rate:      ${passRate}%
`);

  console.log('TEST DETAILS:');
  console.log('─'.repeat(60));
  TEST_RESULTS.testDetails.forEach((detail, idx) => {
    const status = detail.status === 'PASS' ? '✅' : '❌';
    console.log(`${idx + 1}. ${detail.test.padEnd(25)} ${status} ${detail.status}`);
    if (detail.placeCount !== undefined) {
      console.log(`   → Places: ${detail.placeCount}`);
    }
    if (detail.error) {
      console.log(`   → Error: ${detail.error}`);
    }
  });

  console.log('\n' + '═'.repeat(60));

  if (TEST_RESULTS.failedTests === 0) {
    console.log('🎉 ALL TESTS PASSED! Multi-universe places CF is working correctly.');
  } else {
    console.log(`⚠️  ${TEST_RESULTS.failedTests} test(s) failed. Review errors above.`);
  }

  console.log('═'.repeat(60) + '\n');

  process.exit(TEST_RESULTS.failedTests === 0 ? 0 : 1);
}

/**
 * Main execution
 */
async function main() {
  console.log('🧪 MULTI-UNIVERSE PLACES CF - INTERNAL TEST SUITE');
  console.log('═'.repeat(60));
  console.log(`Location: ${TEST_USER_LOCATION.latitude}, ${TEST_USER_LOCATION.longitude}`);
  console.log(`Categories tested: ${TEST_CATEGORIES.length}`);
  console.log('═'.repeat(60));

  try {
    await testBasicCategorySearch();
    await testCategorySwitching();
    await testRapidCategorySwitching();
    await testDifferentLocations();
    await testResponseStructure();
    await testLanguageHandling();
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    printSummary();
  }
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
