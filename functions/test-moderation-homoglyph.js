#!/usr/bin/env node
/**
 * Moderation Homoglyph + NFKC Normalization Tests
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Guards the evasion-resistance of applyQuickFilters() in moderation.js.
 * These tests were missing from the offline gate as of 2026-04-18 — a
 * future regression in normalizeForModeration() or HOMOGLYPH_MAP would
 * have slipped through silently.
 *
 * Static-analysis only: reads lib/moderation.js as text + replays the
 * normalizer logic inline so we don't need Firebase Admin SDK init. Exit
 * code matches CI gate expectations (1 on any failure).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'lib/moderation.js'), 'utf8');

let totalTests = 0;
let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, name) {
  totalTests++;
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL: ${name}`);
  }
}

// ─── Extract HOMOGLYPH_MAP + normalizeForModeration from source ──────────
// Parse the const table verbatim to make sure tests exercise the same
// mappings production uses (no drift between test doubles and source).

function extractHomoglyphMap() {
  const match = src.match(/const HOMOGLYPH_MAP = \{([\s\S]*?)\n\};/);
  if (!match) throw new Error('HOMOGLYPH_MAP not found in moderation.js');
  const body = match[1];
  const entries = {};
  const rx = /'(.)': '([^']*)'/g;
  let m;
  while ((m = rx.exec(body)) !== null) {
    entries[m[1]] = m[2];
  }
  return entries;
}

function extractNormalizeRegex() {
  const m = src.match(/s = s\.replace\(\/(\[[^\/]+\])\/g/);
  if (!m) throw new Error('normalize regex not found');
  return new RegExp(m[1], 'g');
}

const MAP = extractHomoglyphMap();
const CHAR_CLASS = extractNormalizeRegex();

// Inline port of normalizeForModeration so tests exercise the same logic.
function normalize(raw) {
  let s = String(raw || '').normalize('NFKC').toLowerCase();
  s = s.replace(CHAR_CLASS, ch => MAP[ch] || ch);
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '');
  return s.trim();
}

console.log('── Moderation Homoglyph + NFKC Tests ──\n');

// ═══════════════════════════════════════════════════════════════════════
// 1. HOMOGLYPH_MAP integrity
// ═══════════════════════════════════════════════════════════════════════

assert(typeof MAP.а === 'string' && MAP.а === 'a', 'HOMOGLYPH_MAP: Cyrillic а → a');
assert(typeof MAP.е === 'string' && MAP.е === 'e', 'HOMOGLYPH_MAP: Cyrillic е → e');
assert(typeof MAP.о === 'string' && MAP.о === 'o', 'HOMOGLYPH_MAP: Cyrillic о → o');
assert(typeof MAP.с === 'string' && MAP.с === 'c', 'HOMOGLYPH_MAP: Cyrillic с → c');
assert(typeof MAP.у === 'string' && MAP.у === 'y', 'HOMOGLYPH_MAP: Cyrillic у → y');
assert(typeof MAP.α === 'string' && MAP.α === 'a', 'HOMOGLYPH_MAP: Greek α → a');
assert(typeof MAP.ρ === 'string' && MAP.ρ === 'p', 'HOMOGLYPH_MAP: Greek ρ → p');
assert(typeof MAP.υ === 'string' && MAP.υ === 'u', 'HOMOGLYPH_MAP: Greek υ → u');
assert(typeof MAP.ø === 'string' && MAP.ø === 'o', 'HOMOGLYPH_MAP: Latin ø → o');
assert(typeof MAP.ß === 'string' && MAP.ß === 'ss', 'HOMOGLYPH_MAP: Latin ß → ss');

// ═══════════════════════════════════════════════════════════════════════
// 2. Evasion: Cyrillic lookalikes should normalise to Latin
// ═══════════════════════════════════════════════════════════════════════

assert(normalize('сashapp').includes('cashapp'), 'Evasion: Cyrillic сashapp → cashapp');
assert(normalize('раураl').includes('paypal'), 'Evasion: Cyrillic раураl → paypal');
assert(normalize('vеnmо').includes('venmo'), 'Evasion: Cyrillic mixed vеnmо → venmo');
assert(normalize('саsh').includes('cash'), 'Evasion: Cyrillic саsh → cash');

// ═══════════════════════════════════════════════════════════════════════
// 3. Evasion: Greek lookalikes
// ═══════════════════════════════════════════════════════════════════════

assert(normalize('ραypal').includes('paypal'), 'Evasion: Greek ρ + α → paypal');
assert(normalize('κash').includes('kash'), 'Evasion: Greek κ → k');
assert(normalize('βitcoin').includes('bitcoin'), 'Evasion: Greek β → b');

// ═══════════════════════════════════════════════════════════════════════
// 4. NFKC: fullwidth / styled / ligatures collapse
// ═══════════════════════════════════════════════════════════════════════

assert(normalize('ＶＥＮＭＯ').includes('venmo'), 'NFKC: fullwidth ＶＥＮＭＯ → venmo');
assert(normalize('𝐯𝐞𝐧𝐦𝐨').includes('venmo'), 'NFKC: math-bold 𝐯𝐞𝐧𝐦𝐨 → venmo');
assert(normalize('ｃａｓｈ').includes('cash'), 'NFKC: fullwidth ｃａｓｈ → cash');
assert(normalize('ﬁle').includes('file'), 'NFKC: ligature ﬁle → file');

// ═══════════════════════════════════════════════════════════════════════
// 5. Zero-width injection cleanup
// ═══════════════════════════════════════════════════════════════════════

assert(normalize('ven\u200Bmo') === 'venmo', 'ZWSP: ven‌mo → venmo (ZWSP stripped)');
assert(normalize('c\u200Ca\u200Cs\u200Ch') === 'cash', 'ZWNJ: c‌a‌s‌h → cash');
assert(normalize('pay\uFEFFpal') === 'paypal', 'BOM: pay\\uFEFFpal → paypal');
assert(normalize('bit\u202Ecoin') === 'bitcoin', 'RTL-override: bit‮coin → bitcoin');

// ═══════════════════════════════════════════════════════════════════════
// 6. Edge cases: empty / null / surrogates / long input
// ═══════════════════════════════════════════════════════════════════════

assert(normalize('') === '', 'Edge: empty string → empty');
assert(normalize(null) === '', 'Edge: null → empty');
assert(normalize(undefined) === '', 'Edge: undefined → empty');
assert(normalize('   ').length === 0, 'Edge: whitespace only → empty (trimmed)');
assert(normalize('😀hello').includes('hello'), 'Edge: emoji preserved, word normalized');
assert(normalize('a'.repeat(5000)).length === 5000, 'Edge: 5000-char input does not crash');

// ═══════════════════════════════════════════════════════════════════════
// 7. Negative: legitimate text unchanged
// ═══════════════════════════════════════════════════════════════════════

assert(normalize('hola como estas') === 'hola como estas', 'Negative: legit Spanish unchanged');
assert(normalize('Hello World') === 'hello world', 'Negative: legit EN only lowercased');
assert(normalize('привет').length > 0, 'Negative: legit Russian word returns normalized non-empty');

// ═══════════════════════════════════════════════════════════════════════
// 8. Source integrity: verify the function is actually invoked
// ═══════════════════════════════════════════════════════════════════════

assert(src.includes('const messageNormalized = normalizeForModeration(message);'),
  'Source: applyQuickFilters calls normalizeForModeration');
assert(src.includes('messageNormalized.includes(term) || messageLower.includes(term)'),
  'Source: dual-check (normalized || lowercase) pattern present');
assert(/\.normalize\(['"]NFKC['"]\)/.test(src),
  'Source: NFKC normalization active');

// ═══════════════════════════════════════════════════════════════════════
// FINAL REPORT
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log(`Moderation Homoglyph Tests: ${totalTests} total | ${passed} passed | ${failed} failed`);
console.log(`Result: ${failed === 0 ? 'ALL PASSED' : `${failed} FAILURES`}`);
console.log('═'.repeat(60));

if (failures.length > 0) {
  console.log('\nFailed:');
  failures.forEach(f => console.log(`  - ${f}`));
}

process.exit(failed > 0 ? 1 : 0);
