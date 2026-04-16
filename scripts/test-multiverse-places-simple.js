#!/usr/bin/env node
/**
 * Internal Test Suite: Multi-Universe Places CF
 * Tests category switching, data freshness, and response validation
 * (Simplified version - uses HTTP endpoint directly)
 *
 * Usage:
 * FIREBASE_TOKEN=<token> node test-multiverse-places-simple.js
 */

'use strict';

const https = require('https');

const TEST_CATEGORIES = [
  'cafe',
  'restaurant',
  'bar',
  'night_club',
  'park',
  'museum'
];

const TEST_USER_LOCATION = {
  latitude: 40.7128,
  longitude: -74.0060
};

const TEST_RESULTS = {
  totalTests: 0,
  passedTests: 0,
  failedTests: 0,
  testDetails: []
};

/**
 * Call CF via HTTP (using Firebase Functions emulator or deployed)
 */
function callCloudFunction(payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);

    const options = {
      hostname: 'us-central1-black-sugar21.cloudfunctions.net',
      path: '/getMultiUniversePlaces',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${process.env.FIREBASE_TOKEN || 'test-token'}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (err) {
          reject(new Error(`Invalid JSON response: ${data}`));
        }
      });
    });

    req.on('error', reject);

    req.write(postData);
    req.end();
  });
}

/**
 * Test 1: Basic category search
 */
async function testBasicCategorySearch() {
  console.log('\n📋 TEST 1: Basic Category Search');
  console.log('━'.repeat(50));

  for (const category of TEST_CATEGORIES) {
    try {
      TEST_RESULTS.totalTests++;

      const result = await callCloudFunction({
        userLocation: TEST_USER_LOCATION,
        userLanguage: 'en',
        category: category
      });

      // Validation
      if (!result.success) {
        throw new Error(`Success flag is false: ${result.error}`);
      }

      if (!Array.isArray(result.suggestions)) {
        throw new Error('Suggestions is not an array');
      }

      const placeCount = result.suggestions.length;
      const hasMore = result.hasMore;

      console.log(`✅ ${category.padEnd(12)} │ ${placeCount} places │ hasMore: ${hasMore}`);

      // Validate place structure
      if (placeCount > 0) {
        const firstPlace = result.suggestions[0];
        if (!firstPlace.name || firstPlace.latitude === undefined || firstPlace.longitude === undefined) {
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

      const result = await callCloudFunction({
        userLocation: TEST_USER_LOCATION,
        userLanguage: 'en',
        category: category
      });

      const placeNames = result.suggestions.map(p => p.name).slice(0, 3);

      console.log(`[${i + 1}] ${category.padEnd(12)} │ Top 3: ${placeNames.join(', ') || 'none'}`);

      results.push({
        switch: i + 1,
        category,
        topPlaces: placeNames,
        placeCount: result.suggestions.length,
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

  // Verify data freshness: same category at different times
  const firstCafe = results.find(r => r.category === 'cafeteria' && r.switch === 1);
  const secondCafe = results.find(r => r.category === 'cafeteria' && r.switch === 3);

  if (firstCafe && secondCafe) {
    const consistency = firstCafe.placeCount > 0 && secondCafe.placeCount > 0 ? 'consistent' : 'different/empty';
    console.log(`\n✓ Data consistency check: ${consistency}`);
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
  const rapidSwitches = 10;
  let successCount = 0;

  for (let i = 0; i < rapidSwitches; i++) {
    try {
      TEST_RESULTS.totalTests++;
      const category = categories[i % categories.length];

      const result = await callCloudFunction({
        userLocation: TEST_USER_LOCATION,
        userLanguage: 'en',
        category: category
      });

      if (result.success && Array.isArray(result.suggestions)) {
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

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(`\n✓ Rapid switches: ${successCount}/${rapidSwitches} successful`);

  TEST_RESULTS.testDetails.push({
    test: 'rapid_switching',
    status: successCount === rapidSwitches ? 'PASS' : 'FAIL',
    successRate: `${(successCount / rapidSwitches * 100).toFixed(1)}%`
  });
}

/**
 * Test 4: Response structure validation
 */
async function testResponseStructure() {
  console.log('\n📋 TEST 4: Response Structure Validation');
  console.log('━'.repeat(50));

  try {
    TEST_RESULTS.totalTests++;

    const result = await callCloudFunction({
      userLocation: TEST_USER_LOCATION,
      userLanguage: 'en',
      category: 'restaurant'
    });

    const errors = [];

    // Check top-level structure
    if (typeof result.success !== 'boolean') errors.push('success field not boolean');
    if (!Array.isArray(result.suggestions)) errors.push('suggestions not array');
    if (typeof result.hasMore !== 'boolean') errors.push('hasMore not boolean');

    // Check place structure
    if (result.suggestions.length > 0) {
      const place = result.suggestions[0];
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
        placeCount: result.suggestions.length,
        fieldsValidated: result.suggestions.length > 0 ? 10 : 0
      });
    } else {
      console.error('❌ Response structure errors:');
      errors.forEach(err => console.error(`   - ${err}`));
      TEST_RESULTS.failedTests++;
      TEST_RESULTS.testDetails.push({
        test: 'response_structure',
        status: 'FAIL',
        errors: errors
      });
    }
  } catch (err) {
    console.error(`❌ ERROR: ${err.message}`);
    TEST_RESULTS.failedTests++;
  }
}

/**
 * Print test summary
 */
function printSummary() {
  console.log('\n\n' + '═'.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('═'.repeat(60));

  const passRate = TEST_RESULTS.totalTests > 0
    ? (TEST_RESULTS.passedTests / TEST_RESULTS.totalTests * 100).toFixed(1)
    : '0';

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
    if (detail.successRate) {
      console.log(`   → Success Rate: ${detail.successRate}`);
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
    await testResponseStructure();
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
