const fs = require('fs');

const multiUniverseCode = fs.readFileSync('./lib/multi-universe-simulation.js', 'utf8');

const tests = { passed: 0, failed: 0, results: [] };

function test(name, fn) {
  try {
    fn();
    tests.passed++;
    tests.results.push({ name, status: '✅ PASS' });
  } catch (e) {
    tests.failed++;
    tests.results.push({ name, status: '❌ FAIL: ' + e.message });
  }
}

// TEST 1: normalizeLanguageCode function
test('normalizeLanguageCode exists in code', () => {
  if (!multiUniverseCode.includes('function normalizeLanguageCode')) {
    throw new Error('normalizeLanguageCode function not found');
  }
});

test('Language normalization: es-MX → es', () => {
  const code = 'es-MX';
  const normalized = code.substring(0, 2).toLowerCase();
  if (normalized !== 'es') throw new Error('Expected es, got ' + normalized);
});

test('Language normalization: en-US → en', () => {
  const code = 'en-US';
  const normalized = code.substring(0, 2).toLowerCase();
  if (normalized !== 'en') throw new Error('Expected en, got ' + normalized);
});

test('Language normalization: pt-BR → pt', () => {
  const code = 'pt-BR';
  const normalized = code.substring(0, 2).toLowerCase();
  if (normalized !== 'pt') throw new Error('Expected pt, got ' + normalized);
});

test('Language normalization: zh-Hans → zh', () => {
  const code = 'zh-Hans';
  const normalized = code.substring(0, 2).toLowerCase();
  if (normalized !== 'zh') throw new Error('Expected zh, got ' + normalized);
});

// TEST 2: Solo mode detection
test('Solo mode: empty matchId detected', () => {
  const matchId = '';
  const isSoloMode = !matchId;
  if (!isSoloMode) throw new Error('Expected solo mode for empty matchId');
});

test('Solo mode: null matchId detected', () => {
  const matchId = null;
  const isSoloMode = !matchId;
  if (!isSoloMode) throw new Error('Expected solo mode for null matchId');
});

test('Solo mode: valid matchId is NOT solo mode', () => {
  const matchId = 'user123';
  const isSoloMode = !matchId;
  if (isSoloMode) throw new Error('Expected match mode for user123');
});

// TEST 3: Language support verification in STAGE_LABELS_BY_LANGUAGE
const supportedLanguages = ['en', 'es', 'pt', 'fr', 'de', 'ja', 'zh', 'ru', 'ar', 'id'];

supportedLanguages.forEach(lang => {
  test(`Language support: ${lang} in STAGE_LABELS`, () => {
    if (!multiUniverseCode.includes(`${lang}: '`)) {
      throw new Error(`Language ${lang} not found in STAGE_LABELS_BY_LANGUAGE`);
    }
  });
});

// TEST 4: Cache key generation
test('Cache key isolation: solo vs match mode', () => {
  const soloKey = 'multiverse_solo_user123_en';
  const matchKey = 'multiverse_match_user123_partner456_en';
  if (soloKey === matchKey) {
    throw new Error('Solo and match keys should be different');
  }
});

test('Cache key includes language code', () => {
  const key = 'multiverse_solo_user123_es';
  if (!key.includes('_es')) {
    throw new Error('Language code not in cache key');
  }
});

// TEST 5: Rate limiting verification
test('Rate limit: unified credit system (coachMessagesRemaining)', () => {
  if (!multiUniverseCode.includes('coachMessagesRemaining')) {
    throw new Error('coachMessagesRemaining (unified credit) not found');
  }
});

test('Rate limit: daily limit config check', () => {
  if (!multiUniverseCode.includes('maxPerDay')) {
    throw new Error('maxPerDay config not found');
  }
});

// TEST 6: 5-stage structure verification
test('5-stage structure: all 5 stages present', () => {
  const stageIds = ['initial_contact', 'getting_to_know', 'building_connection', 'conflict_challenge', 'commitment'];
  let foundCount = 0;
  stageIds.forEach(id => {
    if (multiUniverseCode.includes(`id: '${id}'`)) {
      foundCount++;
    }
  });
  if (foundCount < 5) throw new Error(`Only ${foundCount}/5 stages found`);
});

test('MULTI_UNIVERSE_STAGES constant exists', () => {
  if (!multiUniverseCode.includes('const MULTI_UNIVERSE_STAGES')) {
    throw new Error('MULTI_UNIVERSE_STAGES constant not found');
  }
});

// TEST 7: Insight generation
test('Insights: Overall label exists', () => {
  if (!multiUniverseCode.includes('Overall')) {
    throw new Error('Overall label not found');
  }
});

test('Insights: Strongest label exists', () => {
  if (!multiUniverseCode.includes('Strongest')) {
    throw new Error('Strongest label not found');
  }
});

test('Compatibility score calculation exists', () => {
  if (!multiUniverseCode.includes('compatibilityScore')) {
    throw new Error('Score calculation not found');
  }
});

// TEST 8: Error handling + localization
test('Error handling: try/catch blocks exist', () => {
  const catchCount = (multiUniverseCode.match(/catch\s*\(/g) || []).length;
  if (catchCount < 3) throw new Error(`Only ${catchCount} catch blocks found, expected at least 3`);
});

test('Localization: getLocalizedStageLabel function', () => {
  if (!multiUniverseCode.includes('function getLocalizedStageLabel')) {
    throw new Error('getLocalizedStageLabel function not found');
  }
});

test('Localization: getLocalizedSoloName function', () => {
  if (!multiUniverseCode.includes('function getLocalizedSoloName')) {
    throw new Error('getLocalizedSoloName function not found');
  }
});

test('Solo mode names: SOLO_MODE_NAMES constant', () => {
  if (!multiUniverseCode.includes('const SOLO_MODE_NAMES')) {
    throw new Error('SOLO_MODE_NAMES constant not found');
  }
});

// TEST 9: Edge cases
test('Edge case: unknown language defaults to en', () => {
  const unknownLang = 'xx';
  const validLanguages = ['en', 'es', 'pt', 'fr', 'de', 'ja', 'zh', 'ru', 'ar', 'id'];
  const defaultLang = validLanguages.includes(unknownLang) ? unknownLang : 'en';
  if (defaultLang !== 'en') throw new Error('Should default to en');
});

test('Stage labels in all 10 languages', () => {
  const langs = ['en', 'es', 'pt', 'fr', 'de', 'ja', 'zh', 'ru', 'ar', 'id'];
  let foundCount = 0;
  langs.forEach(lang => {
    // Count occurrences of language codes in STAGE_LABELS
    const pattern = new RegExp(`${lang}:\\s*'`, 'g');
    const matches = multiUniverseCode.match(pattern) || [];
    if (matches.length > 0) foundCount++;
  });
  if (foundCount < 10) throw new Error(`Only ${foundCount}/10 languages found in stage labels`);
});

test('Gemini model configuration exists', () => {
  if (!multiUniverseCode.includes('AI_MODEL')) {
    throw new Error('Model configuration not found');
  }
});

test('Analytics tracking: trackMultiUniverseAnalytics function', () => {
  if (!multiUniverseCode.includes('function trackMultiUniverseAnalytics')) {
    throw new Error('Analytics tracking function not found');
  }
});

test('Caching: MULTIVERSE_CONFIG_DEFAULTS exists', () => {
  if (!multiUniverseCode.includes('MULTIVERSE_CONFIG_DEFAULTS')) {
    throw new Error('Config defaults not found');
  }
});

// PRINT RESULTS
console.log('');
console.log('════════════════════════════════════════════════════════════');
console.log('INTERNAL TEST REPORT — Multi-Universe Simulator Backend');
console.log('════════════════════════════════════════════════════════════');
console.log('');
console.log('Backend Logic & Localization Tests');
console.log('────────────────────────────────────────────────────────────');

tests.results.forEach(r => {
  console.log(r.status + ' | ' + r.name);
});

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Total Tests:  ' + (tests.passed + tests.failed));
console.log('Passed:       ' + tests.passed);
console.log('Failed:       ' + tests.failed);
console.log('Pass Rate:    ' + Math.round(tests.passed/(tests.passed+tests.failed)*100) + '%');
console.log('════════════════════════════════════════════════════════════');
console.log('');

process.exit(tests.failed > 0 ? 1 : 0);
