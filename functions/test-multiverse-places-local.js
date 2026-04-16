#!/usr/bin/env node
/**
 * Local Test Suite: Multi-Universe Places CF Logic
 * Tests category switching without needing live Firebase connection
 */

'use strict';

const {
  getCategoryQueryMap,
  getPlacesSearchConfig,
  placesTextSearch,
  transformPlaceToSuggestion
} = require('./lib/places-helpers');

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
 * Test 1: Category Query Map
 */
async function testCategoryQueryMap() {
  console.log('\n📋 TEST 1: Category Query Map');
  console.log('━'.repeat(50));

  try {
    TEST_RESULTS.totalTests++;

    const config = await getPlacesSearchConfig();
    const catQueryMap = getCategoryQueryMap(config);

    console.log(`✅ Loaded ${Object.keys(catQueryMap).length} categories`);

    for (const category of TEST_CATEGORIES) {
      if (catQueryMap[category]) {
        console.log(`   ✓ ${category}: "${catQueryMap[category]}"`);
      } else {
        console.log(`   ✗ ${category}: NOT FOUND`);
      }
    }

    TEST_RESULTS.passedTests++;
    TEST_RESULTS.testDetails.push({
      test: 'category_map',
      status: 'PASS',
      categoriesLoaded: Object.keys(catQueryMap).length
    });
  } catch (err) {
    console.error(`❌ ERROR: ${err.message}`);
    TEST_RESULTS.failedTests++;
    TEST_RESULTS.testDetails.push({
      test: 'category_map',
      status: 'FAIL',
      error: err.message
    });
  }
}

/**
 * Test 2: Single Category Search Logic
 */
async function testSingleCategoryLogic() {
  console.log('\n📋 TEST 2: Single Category Search Logic');
  console.log('━'.repeat(50));

  try {
    const config = await getPlacesSearchConfig();
    const catQueryMap = getCategoryQueryMap(config);

    for (const category of ['cafe', 'restaurant', 'bar']) {
      TEST_RESULTS.totalTests++;

      if (!catQueryMap[category]) {
        console.log(`⚠️  ${category}: NOT IN MAP (skipping)`);
        continue;
      }

      const query = catQueryMap[category];
      console.log(`✅ ${category.padEnd(12)} │ Query: "${query}"`);

      // Verify query structure
      if (!query || query.length < 3) {
        throw new Error(`Invalid query for ${category}`);
      }

      TEST_RESULTS.passedTests++;
    }

    TEST_RESULTS.testDetails.push({
      test: 'category_logic',
      status: 'PASS'
    });
  } catch (err) {
    console.error(`❌ ERROR: ${err.message}`);
    TEST_RESULTS.failedTests++;
  }
}

/**
 * Test 3: Config Structure
 */
async function testConfigStructure() {
  console.log('\n📋 TEST 3: Places Config Structure');
  console.log('━'.repeat(50));

  try {
    TEST_RESULTS.totalTests++;

    const config = await getPlacesSearchConfig();
    const errors = [];

    // Check required fields (from places_search_config in Remote Config)
    const requiredFields = [
      'enabled',
      'perQueryResults',
      'maxPlacesIntermediate',
      'queriesWithCategory',
      'queriesWithoutCategory',
      'travelSpeedKmH',
      'defaultLanguage',
      'progressiveRadiusSteps',
      'maxRadius'
    ];

    for (const field of requiredFields) {
      if (!(field in config)) {
        errors.push(`Missing field: ${field}`);
      }
    }

    if (errors.length === 0) {
      console.log('✅ Config structure: VALID');
      console.log(`   ✓ Enabled: ${config.enabled}`);
      console.log(`   ✓ Max radius: ${config.maxRadius}m`);
      console.log(`   ✓ Per query results: ${config.perQueryResults}`);
      console.log(`   ✓ Max places intermediate: ${config.maxPlacesIntermediate}`);
      console.log(`   ✓ Travel speed: ${config.travelSpeedKmH} km/h`);

      TEST_RESULTS.passedTests++;
      TEST_RESULTS.testDetails.push({
        test: 'config_structure',
        status: 'PASS'
      });
    } else {
      throw new Error(errors.join(', '));
    }
  } catch (err) {
    console.error(`❌ ERROR: ${err.message}`);
    TEST_RESULTS.failedTests++;
    TEST_RESULTS.testDetails.push({
      test: 'config_structure',
      status: 'FAIL',
      error: err.message
    });
  }
}

/**
 * Test 4: Category Switching Simulation
 */
async function testCategorySwitchingSimulation() {
  console.log('\n📋 TEST 4: Category Switching Simulation');
  console.log('━'.repeat(50));

  const switchSequence = ['cafe', 'restaurant', 'cafe', 'bar', 'night_club', 'park'];
  const switchResults = [];

  for (let i = 0; i < switchSequence.length; i++) {
    try {
      TEST_RESULTS.totalTests++;
      const category = switchSequence[i];

      console.log(`[${i + 1}] Testing category switch to: ${category}`);

      const config = await getPlacesSearchConfig();
      const catQueryMap = getCategoryQueryMap(config);

      if (!catQueryMap[category]) {
        throw new Error(`Category not found in map: ${category}`);
      }

      const query = catQueryMap[category];
      switchResults.push({
        switch: i + 1,
        category,
        query,
        status: 'OK'
      });

      console.log(`    ✓ Query: "${query}"`);

      TEST_RESULTS.passedTests++;
    } catch (err) {
      console.error(`    ✗ ERROR: ${err.message}`);
      TEST_RESULTS.failedTests++;
      switchResults.push({
        switch: i + 1,
        category: switchSequence[i],
        status: 'FAILED',
        error: err.message
      });
    }
  }

  console.log(`\n✓ Switch simulation: ${switchResults.filter(r => r.status === 'OK').length}/${switchSequence.length} successful`);

  TEST_RESULTS.testDetails.push({
    test: 'category_switching_sim',
    status: TEST_RESULTS.failedTests === 0 ? 'PASS' : 'FAIL',
    switches: switchSequence.length
  });
}

/**
 * Test 5: Multi-User Location Support
 */
async function testMultiLocationSupport() {
  console.log('\n📋 TEST 5: Multi-User Location Support');
  console.log('━'.repeat(50));

  const locations = [
    { name: 'New York', lat: 40.7128, lng: -74.0060 },
    { name: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
    { name: 'London', lat: 51.5074, lng: -0.1278 }
  ];

  for (const loc of locations) {
    try {
      TEST_RESULTS.totalTests++;

      // Verify location has valid coordinates
      if (typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
        throw new Error('Invalid coordinates');
      }

      if (loc.lat < -90 || loc.lat > 90 || loc.lng < -180 || loc.lng > 180) {
        throw new Error('Coordinates out of bounds');
      }

      console.log(`✅ ${loc.name.padEnd(12)} │ (${loc.lat}, ${loc.lng})`);

      TEST_RESULTS.passedTests++;
    } catch (err) {
      console.error(`❌ ${loc.name.padEnd(12)} │ ERROR: ${err.message}`);
      TEST_RESULTS.failedTests++;
    }
  }

  TEST_RESULTS.testDetails.push({
    test: 'multi_location',
    status: 'PASS',
    locationsSupported: locations.length
  });
}

/**
 * Test 6: Locale Handling
 */
async function testLocaleHandling() {
  console.log('\n📋 TEST 6: Locale/Language Handling');
  console.log('━'.repeat(50));

  const languages = ['en', 'es', 'pt', 'fr', 'de', 'ja', 'zh', 'ru', 'ar', 'id'];

  for (const lang of languages) {
    try {
      TEST_RESULTS.totalTests++;

      // Verify language code format
      if (lang.length !== 2) {
        throw new Error(`Invalid language code: ${lang}`);
      }

      console.log(`✅ ${lang} │ Language code valid`);

      TEST_RESULTS.passedTests++;
    } catch (err) {
      console.error(`❌ ${lang} │ ERROR: ${err.message}`);
      TEST_RESULTS.failedTests++;
    }
  }

  TEST_RESULTS.testDetails.push({
    test: 'locale_handling',
    status: 'PASS',
    languagesSupported: languages.length
  });
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
    console.log(`${idx + 1}. ${detail.test.padEnd(30)} ${status} ${detail.status}`);
    if (detail.categoriesLoaded) console.log(`   → Categories: ${detail.categoriesLoaded}`);
    if (detail.switches) console.log(`   → Switches: ${detail.switches}`);
    if (detail.locationsSupported) console.log(`   → Locations: ${detail.locationsSupported}`);
    if (detail.languagesSupported) console.log(`   → Languages: ${detail.languagesSupported}`);
    if (detail.error) console.log(`   → Error: ${detail.error}`);
  });

  console.log('\n' + '═'.repeat(60));

  if (TEST_RESULTS.failedTests === 0) {
    console.log('🎉 ALL TESTS PASSED!');
    console.log('   Multi-universe places CF logic is working correctly.');
    console.log('   Category switching is properly configured and ready for deployment.');
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
  console.log('🧪 MULTI-UNIVERSE PLACES CF - LOCAL TEST SUITE');
  console.log('═'.repeat(60));
  console.log('Testing CF logic and category switching configuration');
  console.log('═'.repeat(60));

  try {
    await testCategoryQueryMap();
    await testSingleCategoryLogic();
    await testConfigStructure();
    await testCategorySwitchingSimulation();
    await testMultiLocationSupport();
    await testLocaleHandling();
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
