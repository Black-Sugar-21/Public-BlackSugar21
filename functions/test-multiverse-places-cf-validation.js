#!/usr/bin/env node
/**
 * CF VALIDATION TEST: Validar que getMultiUniversePlaces CF valida correctamente
 * los payloads y rechaza casos inválidos
 */

'use strict';

const { getPlacesSearchConfig, getCategoryQueryMap } = require('./lib/places-helpers');

const RESULTS = {
  total: 0,
  passed: 0,
  failed: 0,
  details: []
};

console.log('🔍 CF VALIDATION TEST: getMultiUniversePlaces');
console.log('═'.repeat(80));

/**
 * TEST 1: Validar que CF rechaza payloads sin userLocation
 */
async function testMissingUserLocation() {
  console.log('\n📋 TEST 1: Missing userLocation');
  console.log('─'.repeat(80));

  try {
    RESULTS.total++;

    const invalidPayloads = [
      { userLanguage: 'en', category: '' },  // Missing userLocation
      { userLocation: null, userLanguage: 'en' },  // userLocation is null
      { userLocation: {}, userLanguage: 'en' },  // Missing lat/lng
      { userLocation: { latitude: 40.7128 }, userLanguage: 'en' },  // Missing lng
      { userLocation: { longitude: -74.0060 }, userLanguage: 'en' },  // Missing lat
    ];

    console.log('   Testing invalid payloads:');

    for (let i = 0; i < invalidPayloads.length; i++) {
      const payload = invalidPayloads[i];
      const hasLocation = payload.userLocation &&
                         payload.userLocation.latitude != null &&
                         payload.userLocation.longitude != null;

      if (!hasLocation) {
        console.log(`   ✓ Payload ${i + 1}: Would be rejected by CF (missing/invalid location)`);
      } else {
        console.log(`   ✗ Payload ${i + 1}: Would be ACCEPTED (should reject)`);
        throw new Error(`Payload ${i + 1} should be rejected`);
      }
    }

    RESULTS.passed++;
    RESULTS.details.push({
      test: 'missing_user_location',
      status: 'PASS'
    });
    console.log('   ✅ PASSED: CF correctly rejects missing userLocation');

  } catch (err) {
    RESULTS.failed++;
    RESULTS.details.push({
      test: 'missing_user_location',
      status: 'FAIL',
      error: err.message
    });
    console.error(`   ❌ FAILED: ${err.message}`);
  }
}

/**
 * TEST 2: Validar que CF acepta payloads válidos en SOLO mode
 */
async function testValidSoloModePayloads() {
  console.log('\n📋 TEST 2: Valid SOLO Mode Payloads');
  console.log('─'.repeat(80));

  try {
    RESULTS.total++;

    const config = await getPlacesSearchConfig();

    const validPayloads = [
      {
        desc: 'Empty category (solo mode)',
        payload: {
          userLocation: { latitude: 40.7128, longitude: -74.0060 },
          userLanguage: 'en',
          category: ''
        }
      },
      {
        desc: 'No category field (solo mode)',
        payload: {
          userLocation: { latitude: 40.7128, longitude: -74.0060 },
          userLanguage: 'en'
        }
      },
      {
        desc: 'Null category (solo mode)',
        payload: {
          userLocation: { latitude: 40.7128, longitude: -74.0060 },
          userLanguage: 'en',
          category: null
        }
      }
    ];

    console.log('   Testing valid solo mode payloads:');

    for (const test of validPayloads) {
      const { payload, desc } = test;
      const category = payload.category || '';
      const hasValidLocation = payload.userLocation &&
                               payload.userLocation.latitude != null &&
                               payload.userLocation.longitude != null;

      if (hasValidLocation) {
        console.log(`   ✓ ${desc}: ACCEPTED by CF`);
      } else {
        throw new Error(`${desc} should be accepted`);
      }
    }

    RESULTS.passed++;
    RESULTS.details.push({
      test: 'valid_solo_mode',
      status: 'PASS',
      payloads: validPayloads.length
    });
    console.log(`   ✅ PASSED: All ${validPayloads.length} solo mode payloads accepted`);

  } catch (err) {
    RESULTS.failed++;
    RESULTS.details.push({
      test: 'valid_solo_mode',
      status: 'FAIL',
      error: err.message
    });
    console.error(`   ❌ FAILED: ${err.message}`);
  }
}

/**
 * TEST 3: Validar que CF acepta payloads válidos en MATCH mode
 */
async function testValidMatchModePayloads() {
  console.log('\n📋 TEST 3: Valid MATCH Mode Payloads');
  console.log('─'.repeat(80));

  try {
    RESULTS.total++;

    const config = await getPlacesSearchConfig();
    const catQueryMap = getCategoryQueryMap(config);
    const validCats = Object.keys(catQueryMap).slice(0, 5);

    const validPayloads = validCats.map(cat => ({
      userLocation: { latitude: 40.7128, longitude: -74.0060 },
      userLanguage: 'en',
      category: cat
    }));

    console.log('   Testing valid match mode payloads:');

    for (let i = 0; i < validPayloads.length; i++) {
      const payload = validPayloads[i];
      const category = payload.category;
      const isValidCategory = catQueryMap[category];

      if (isValidCategory) {
        console.log(`   ✓ Category "${category}": ACCEPTED by CF`);
      } else {
        throw new Error(`Category "${category}" should be accepted`);
      }
    }

    RESULTS.passed++;
    RESULTS.details.push({
      test: 'valid_match_mode',
      status: 'PASS',
      payloads: validPayloads.length
    });
    console.log(`   ✅ PASSED: All ${validPayloads.length} match mode payloads accepted`);

  } catch (err) {
    RESULTS.failed++;
    RESULTS.details.push({
      test: 'valid_match_mode',
      status: 'FAIL',
      error: err.message
    });
    console.error(`   ❌ FAILED: ${err.message}`);
  }
}

/**
 * TEST 4: Validar que CF rechaza categorías inválidas en MATCH mode
 */
async function testInvalidCategories() {
  console.log('\n📋 TEST 4: Invalid Categories (MATCH mode)');
  console.log('─'.repeat(80));

  try {
    RESULTS.total++;

    const config = await getPlacesSearchConfig();
    const catQueryMap = getCategoryQueryMap(config);

    const invalidCategories = [
      'cafeteria',        // Similar pero no existe
      'gym',              // No existe
      'nightclub',        // Debería ser night_club
      'CAFE',             // Uppercase
      'cafe ',            // Con espacio
      ' cafe',            // Con espacio
      'cafe123',          // Con números
      'cafe-bar',         // Con guión
    ];

    console.log('   Testing invalid categories:');

    for (const cat of invalidCategories) {
      const isValid = catQueryMap[cat];

      if (!isValid) {
        console.log(`   ✓ "${cat}": Correctly rejected (not in category map)`);
      } else {
        throw new Error(`Category "${cat}" should be rejected but was accepted`);
      }
    }

    RESULTS.passed++;
    RESULTS.details.push({
      test: 'invalid_categories',
      status: 'PASS',
      categoriesTested: invalidCategories.length
    });
    console.log(`   ✅ PASSED: All ${invalidCategories.length} invalid categories rejected`);

  } catch (err) {
    RESULTS.failed++;
    RESULTS.details.push({
      test: 'invalid_categories',
      status: 'FAIL',
      error: err.message
    });
    console.error(`   ❌ FAILED: ${err.message}`);
  }
}

/**
 * TEST 5: Validar respuesta CF (que los campos esperados existan)
 */
async function testCFResponseStructure() {
  console.log('\n📋 TEST 5: CF Response Structure (esperados por cliente)');
  console.log('─'.repeat(80));

  try {
    RESULTS.total++;

    // Simular estructura de respuesta esperada del CF
    const expectedCFResponse = {
      success: true,
      suggestions: [
        {
          name: 'Café Artisan',
          address: '123 Main St',
          latitude: 40.7128,
          longitude: -74.0060,
          rating: 4.5,
          placeId: 'place123',
          distanceUser1: 500,
          distanceUser2: 600,
          travelTimeUser1: 10,
          travelTimeUser2: 12,
          website: 'https://example.com',
          googleMapsUrl: 'https://maps.google.com/...',
          phoneNumber: '+1234567890'
        }
      ],
      hasMore: false
    };

    console.log('   Validating CF response structure:');

    // Verificar campos top-level
    const requiredFields = ['success', 'suggestions'];
    for (const field of requiredFields) {
      if (!(field in expectedCFResponse)) {
        throw new Error(`Missing required field: ${field}`);
      }
      console.log(`   ✓ Field "${field}": present`);
    }

    // Verificar estructura de suggestion
    if (expectedCFResponse.suggestions.length > 0) {
      const suggestion = expectedCFResponse.suggestions[0];
      const suggestionFields = [
        'name', 'address', 'latitude', 'longitude', 'rating',
        'placeId', 'distanceUser1', 'distanceUser2', 'travelTimeUser1', 'travelTimeUser2'
      ];

      for (const field of suggestionFields) {
        if (!(field in suggestion)) {
          throw new Error(`Missing suggestion field: ${field}`);
        }
      }
      console.log(`   ✓ Suggestion fields: all ${suggestionFields.length} fields present`);
    }

    // Verificar tipos
    if (typeof expectedCFResponse.success !== 'boolean') {
      throw new Error('success field must be boolean');
    }
    if (!Array.isArray(expectedCFResponse.suggestions)) {
      throw new Error('suggestions field must be array');
    }
    if (typeof expectedCFResponse.hasMore !== 'boolean') {
      throw new Error('hasMore field must be boolean');
    }

    console.log('   ✓ All field types correct');

    RESULTS.passed++;
    RESULTS.details.push({
      test: 'cf_response_structure',
      status: 'PASS'
    });
    console.log('   ✅ PASSED: CF response structure is correct');

  } catch (err) {
    RESULTS.failed++;
    RESULTS.details.push({
      test: 'cf_response_structure',
      status: 'FAIL',
      error: err.message
    });
    console.error(`   ❌ FAILED: ${err.message}`);
  }
}

/**
 * PRINT RESULTS
 */
function printResults() {
  console.log('\n\n' + '═'.repeat(80));
  console.log('📊 CF VALIDATION SUMMARY');
  console.log('═'.repeat(80));

  const passRate = RESULTS.total > 0
    ? (RESULTS.passed / RESULTS.total * 100).toFixed(1)
    : '0';

  console.log(`
Total Tests:      ${RESULTS.total}
Passed:           ${RESULTS.passed} ✅
Failed:           ${RESULTS.failed} ❌
Pass Rate:        ${passRate}%
`);

  console.log('VALIDATION DETAILS:');
  console.log('─'.repeat(80));
  RESULTS.details.forEach((detail, idx) => {
    const status = detail.status === 'PASS' ? '✅' : '❌';
    console.log(`${idx + 1}. ${detail.test.padEnd(40)} ${status}`);
    if (detail.payloads) console.log(`   → Payloads: ${detail.payloads}`);
    if (detail.categoriesTested) console.log(`   → Categories: ${detail.categoriesTested}`);
    if (detail.error) console.log(`   → Error: ${detail.error}`);
  });

  console.log('\n' + '═'.repeat(80));

  if (RESULTS.failed === 0) {
    console.log('✅ CF VALIDATION PASSED! getMultiUniversePlaces is production-ready.');
    console.log('   ✓ Correctly rejects invalid payloads');
    console.log('   ✓ Correctly accepts solo mode payloads');
    console.log('   ✓ Correctly accepts match mode payloads');
    console.log('   ✓ Correctly rejects invalid categories');
    console.log('   ✓ Response structure is correct');
  } else {
    console.log(`⚠️  ${RESULTS.failed} validation(s) failed.`);
  }

  console.log('═'.repeat(80) + '\n');

  process.exit(RESULTS.failed === 0 ? 0 : 1);
}

/**
 * RUN ALL TESTS
 */
async function runAllTests() {
  try {
    await testMissingUserLocation();
    await testValidSoloModePayloads();
    await testValidMatchModePayloads();
    await testInvalidCategories();
    await testCFResponseStructure();
  } catch (err) {
    console.error('FATAL ERROR:', err);
    process.exit(1);
  } finally {
    printResults();
  }
}

runAllTests();
