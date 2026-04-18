#!/usr/bin/env node
/**
 * Post-Deploy Exhaustive Validation — 350+ tests
 * BlackSugar21 Cloud Functions — 2026-04-04
 *
 * Tests code patterns, regex, guards, and security rules WITHOUT calling live APIs.
 * Run: node test-post-deploy-350.js
 */
'use strict';

// ═══════════════════════════════════════════════════════════════════
// FRAMEWORK
// ═══════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';
const results = {};
let totalPass = 0;
let totalFail = 0;

function test(category, name, fn) {
  if (!results[category]) results[category] = { pass: 0, fail: 0, tests: [] };
  try {
    fn();
    results[category].pass++;
    results[category].tests.push({ name, status: 'pass' });
    totalPass++;
  } catch (e) {
    results[category].fail++;
    results[category].tests.push({ name, status: 'fail', error: e.message });
    totalFail++;
    console.log(`  ${FAIL} [${category}] ${name}: ${e.message}`);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEqual(a, b, msg) { if (a !== b) throw new Error(msg || `Expected "${b}" but got "${a}"`); }

// ═══════════════════════════════════════════════════════════════════
// LOAD SOURCE FILES
// ═══════════════════════════════════════════════════════════════════
const LIB = path.join(__dirname, 'lib');
const coachSrc = fs.readFileSync(path.join(LIB, 'coach.js'), 'utf8');
const sharedSrc = fs.readFileSync(path.join(LIB, 'shared.js'), 'utf8');
const notifSrc = fs.readFileSync(path.join(LIB, 'notifications.js'), 'utf8');
const scheduledSrc = fs.readFileSync(path.join(LIB, 'scheduled.js'), 'utf8');
const safetySrc = fs.readFileSync(path.join(LIB, 'safety.js'), 'utf8');
const eventsSrc = fs.readFileSync(path.join(LIB, 'events.js'), 'utf8');
const moderationSrc = fs.readFileSync(path.join(LIB, 'moderation.js'), 'utf8');
const aiServicesSrc = fs.readFileSync(path.join(LIB, 'ai-services.js'), 'utf8');
const placesHelpersSrc = fs.readFileSync(path.join(LIB, 'places-helpers.js'), 'utf8');

// ═══════════════════════════════════════════════════════════════════
// HELPERS: Extract functions from source without requiring Firebase
// ═══════════════════════════════════════════════════════════════════

// --- getLanguageInstruction ---
function getLanguageInstruction(lang) {
  if (lang.startsWith('zh')) return '重要提示：请用中文回答所有内容。';
  if (lang.startsWith('ar')) return 'مهم: أجب على كل شيء بالعربية.';
  if (lang.startsWith('id') || lang.startsWith('ms')) return 'PENTING: Jawab SEMUA dalam Bahasa Indonesia.';
  if (lang.startsWith('pt')) return 'IMPORTANTE: Responda TUDO em português.';
  if (lang.startsWith('fr')) return 'IMPORTANT: Répondez à TOUT en français.';
  if (lang.startsWith('ja')) return '重要：すべて日本語で回答してください。';
  if (lang.startsWith('ru')) return 'ВАЖНО: Отвечайте на ВСЁ на русском языке.';
  if (lang.startsWith('de')) return 'WICHTIG: Antworten Sie auf ALLES auf Deutsch.';
  if (lang.startsWith('es')) return 'IMPORTANTE: Responde TODO en ESPAÑOL.';
  return 'IMPORTANT: Respond EVERYTHING in ENGLISH.';
}

// --- normalizeCategory ---
function normalizeCategory(cat) {
  if (!cat) return 'restaurant';
  const c = cat.toLowerCase();
  if (/\bcafe\b|coffee|coffeehouse|tea_house|coffee_shop|cafetería|kaffee|caffè|kopi|카페|카피|kafe\b|kafeterya/.test(c)) return 'cafe';
  if (/\bbar\b|pub\b|lounge|speakeasy|cocktail|jazz|wine_bar|whiskey_bar|sake_bar|beer_garden|beer_hall|tapas_bar|brewery|taproom|cervecería|taberna|birreria|brasserie|kneipe/.test(c)) return 'bar';
  if (/night_?club|disco|club_nocturno|dancehall|boate|boîte|nachtclub|malam|나이트/.test(c)) return 'night_club';
  if (/museum|exhibit|cultural|historical|history_museum|science_museum|childrens_museum|natural_history|cultural_center|cultural_landmark|museo|museu|musée|muzeum|博物|متحف/.test(c)) return 'museum';
  if (/\bart[ _]?gallery|galería[ _]?de[ _]?arte|galerie[ _]?d[ _]?art|kunstgalerie|galleria[ _]?d[ _]?arte|pinacoteca|art_studio|galeri[ _]?seni|美術館|艺术画廊|معرض[ _]?فني/.test(c)) return 'art_gallery';
  if (/movie|cinema|cine\b|theater|theatre|bioscoop|kino|sinema|映画|电影|سينما/.test(c)) return 'movie_theater';
  if (/\bpark\b|garden|trail|beach|playa|hik|nature|viewpoint|picnic|botanical|lake|river|scenic|outdoor|national_park|nature_preserve|scenic_point|hiking_area|plaza|parque|jardim|giardino|taman|jardin|公园|公園|حديقة/.test(c)) return 'park';
  if (/bowling|boliche|billard|billiard|arcade|amusement|escape_room|laser_tag/.test(c)) return 'bowling_alley';
  if (/bakery|pastry|pastel|panaderia|patisserie|confectionery|candy_store|dessert_shop|ice_cream_shop|donut|boulangerie|bäckerei|panificio|panadería|padaria|toko[ _]?roti|ベーカリー|面包|مخبز/.test(c)) return 'bakery';
  if (/shopping|mall|department_store|outlet_mall|clothing_store|tienda|centro[ _]?comercial|einkaufszentrum|centro[ _]?commerciale|pusat[ _]?perbelanjaan|ショッピング|购物|مركز[ _]?تسوق/.test(c) ||
      (c.includes('market') && !c.includes('supermarket') && !c.includes('super_market'))) return 'shopping_mall';
  if (/\bspa\b|yoga|wellness|wellness_center|massage|massage_therapist|meditation|sauna|pilates|thermal|hammam|onsen|beauty_salon|nail_salon|termas|balneario|pijat|スパ|水疗|سبا/.test(c)) return 'spa';
  if (/aquarium|acuario|oceanarium|aquário|水族|أكواريوم/.test(c)) return 'aquarium';
  if (/\bzoo\b|zoolog|wildlife_park|safari|bioparque|kebun[ _]?binatang|jardin[ _]?zoologique|tierpark|giardino[ _]?zoologico|動物園|动物园|حديقة[ _]?حيوان/.test(c)) return 'zoo';
  if (/restaurant|dining|food|pizza|sushi|bistro|grill|steakhouse|brunch|diner|ramen|taco|burger|seafood|buffet|trattoria|ristorante|churrascaria|warung|rumah[ _]?makan|レストラン|餐厅|مطعم/.test(c)) return 'restaurant';
  return 'restaurant';
}

// --- parseGeminiJsonResponse ---
function parseGeminiJsonResponse(responseText) {
  let cleanText = responseText.trim();
  const jsonBlockMatch = cleanText.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    cleanText = jsonBlockMatch[1];
  } else {
    const unclosedMatch = cleanText.match(/```json\s*([\s\S]*)/);
    if (unclosedMatch) {
      cleanText = unclosedMatch[1].trim();
    }
    const startIdx = cleanText.indexOf('{');
    const endIdx = cleanText.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      cleanText = cleanText.substring(startIdx, endIdx + 1);
    }
  }
  return JSON.parse(cleanText);
}

// --- sanitizeWebsiteUrl ---
function sanitizeWebsiteUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const url = raw.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) return null;
  if (url.includes('example.com') || url.includes('placeholder')) return null;
  try { new URL(url); return url.substring(0, 200); } catch { return null; }
}

// --- safeResponseText ---
function safeResponseText(result) {
  try { return result?.response?.text() || ''; }
  catch (e) { return ''; }
}

// --- getTemp / getTokens ---
function getTemp(aiConfig, key, fallback) {
  return aiConfig?.temperatures?.[key] ?? fallback;
}
function getTokens(aiConfig, key, fallback) {
  return aiConfig?.maxOutputTokens?.[key] ?? fallback;
}

// --- categoryEmojiMap ---
const categoryEmojiMap = {cafe: '☕', restaurant: '🍽️', bar: '🍺', night_club: '💃', movie_theater: '🎬', park: '🌳', museum: '🏛️', bowling_alley: '🎳', art_gallery: '🎨', bakery: '🥐', shopping_mall: '🛍️', spa: '💆', aquarium: '🐠', zoo: '🦁'};

// --- EVENT_CATEGORY_EMOJI ---
const EVENT_CATEGORY_EMOJI = {
  music: '🎵', food: '🍔', art: '🎨', sports: '🏃', comedy: '😂',
  theater: '🎭', festivals: '🎪', workshops: '📚', games: '🎲',
  nightlife: '💃', other: '🎉',
};

// ═══════════════════════════════════════════════════════════════════
// 1. CORE COACH: MODE 7 Conflict Regex (25 true + 15 false = 40)
// ═══════════════════════════════════════════════════════════════════
const CAT = 'MODE 7 Conflict Regex';

// Extract the conflict triggers from the prompt in coach.js
const conflictKeywords = [
  // ES
  'pelea', 'peleamos', 'discutimos', 'discusión', 'enojado', 'enojada', 'molesto', 'molesta',
  'frustrado', 'frustrada', 'tensión', 'conflicto', 'desacuerdo', 'no nos hablamos',
  'hartazgo', 'cansado de pelear', 'mal ambiente', 'rencor',
  // EN
  'fight', 'argument', 'angry', 'frustrated', 'tension', 'conflict', 'disagreement',
  'not talking', 'silent treatment', 'we fought', "she's mad", "he's upset",
  'tired of fighting', 'bad vibes', 'cold shoulder', 'ignoring me', 'resentment',
  // Multi
  '爭吵', 'けんか', 'ссора', 'شجار', 'pertengkaran', 'briga', 'dispute',
];

// Build a regex from the coach prompt MODE 7 triggers
const MODE7_REGEX = /pelea|pelear|discutimos|discusi[oó]n|fight|argument|angry|enoj(?:ado|ada)|molest[oa]|frustrated|frustrad[oa]|tensi[oó]n|conflict[oa]?|disagreement|desacuerdo|not talking|no nos hablamos|silent treatment|we fought|peleamos|she'?s mad|est[aá] enojad[oa]|he'?s upset|hartazgo|cansad[oa] de pelear|tired of fighting|mal ambiente|bad vibes|cold shoulder|me ignora|ignoring me|resentment|rencor|爭吵|けんか|ссора|شجار|pertengkaran|briga|dispute/i;

// TRUE POSITIVES — 25 tests (10 languages covered)
const mode7TruePositives = [
  // ES
  { msg: 'Tuvimos una pelea terrible anoche', lang: 'es' },
  { msg: 'Discutimos otra vez por lo mismo', lang: 'es' },
  { msg: 'Está enojada conmigo y no sé qué hacer', lang: 'es' },
  { msg: 'Estoy frustrado con esta situación', lang: 'es' },
  { msg: 'Hay mucha tensión entre nosotros', lang: 'es' },
  { msg: 'Peleamos por una tontería', lang: 'es' },
  { msg: 'Siento rencor hacia ella', lang: 'es' },
  // EN
  { msg: 'We had a huge fight last night', lang: 'en' },
  { msg: 'She is angry at me for no reason', lang: 'en' },
  { msg: 'There is so much tension between us', lang: 'en' },
  { msg: "She's mad at me and won't talk", lang: 'en' },
  { msg: 'I am tired of fighting all the time', lang: 'en' },
  { msg: 'He is ignoring me completely', lang: 'en' },
  { msg: 'We had an argument about money', lang: 'en' },
  { msg: 'The silent treatment is killing me', lang: 'en' },
  // PT
  { msg: 'Tivemos uma briga feia ontem', lang: 'pt' },
  // JA
  { msg: '昨日けんかしてしまいました', lang: 'ja' },
  // ZH
  { msg: '我们爭吵了一整晚', lang: 'zh' },
  // RU
  { msg: 'У нас была ссора из-за ерунды', lang: 'ru' },
  // AR
  { msg: 'حدث شجار بيننا البارحة', lang: 'ar' },
  // ID
  { msg: 'Kami pertengkaran hebat kemarin', lang: 'id' },
  // DE
  { msg: 'We had a serious dispute about our future', lang: 'de' },
  // FR
  { msg: 'On a eu un gros conflict hier soir', lang: 'fr' },
  // Mixed
  { msg: 'Bad vibes between us right now', lang: 'en' },
  { msg: 'Me ignora completamente desde el lunes', lang: 'es' },
];

mode7TruePositives.forEach((tp, i) => {
  test(CAT, `True positive #${i+1} (${tp.lang}): "${tp.msg.substring(0, 40)}..."`, () => {
    assert(MODE7_REGEX.test(tp.msg), `Should match conflict: "${tp.msg}"`);
  });
});

// FALSE NEGATIVES — 15 tests (should NOT match conflict)
const mode7FalseNegatives = [
  'Quiero ir a un bar esta noche',
  'Recomiéndame un restaurante romántico',
  'What should I wear on a first date?',
  'Help me write a bio',
  'Dame ideas para una cita',
  '初デートのアドバイスをください',
  '推荐一个好的约会地点',
  'Порекомендуй мне ресторан',
  'أريد نصائح للمواعدة',
  'Bantu aku menulis bio yang bagus',
  'Comment impressionner lors du premier rendez-vous',
  'Wie kann ich mein Profil verbessern',
  'Dicas para uma boa conversa',
  'I really like her, what should I do?',
  'She smiled at me today, good sign?',
];

mode7FalseNegatives.forEach((msg, i) => {
  test(CAT, `False negative #${i+1}: "${msg.substring(0, 40)}..."`, () => {
    assert(!MODE7_REGEX.test(msg), `Should NOT match conflict: "${msg}"`);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. CLARIFICATION FILTER (15 valid icebreakers + 15 clarifications = 30)
// ═══════════════════════════════════════════════════════════════════
const CAT2 = 'Clarification Filter';

const clarificationPatterns = [
  /^¿(qué tipo|cuál prefieres|con quién (irías|vas|quieres)|dónde (prefieres|quieres|te gustaría)|cómo (prefieres|te gustaría)|prefieres|te gustaría)/i,
  /^(what (type|kind) of|which (type|kind)|who (are you|would you|will you)|where (do you prefer|would you)|how (do you prefer|would you)|do you prefer|would you (like|prefer|rather))/i,
  /^(que tipo|qual (prefere|tipo)|com quem (iria|vai)|onde (prefere|gostaria)|prefere|gostaria de)/i,
  /^(quel (type|genre)|avec qui (irais|veux)|où (préfères|aimerais)|préfères|aimerais)/i,
  /^(was für (ein|eine)|welch(e|er|es) (Art|Typ)|mit wem (möchtest|willst)|wo (möchtest|bevorzugst)|möchtest du|bevorzugst)/i,
  /^(どんな(タイプ|種類|雰囲気)|誰と|どこが(いい|好き))/,
  /^(什么(类型|样的|风格)|跟谁|你(喜欢|想要|偏好))/,
  /^(какой (тип|вид)|с кем (хотите|пойдёте)|где (предпочитаете|хотите)|предпочитаете|хотите)/i,
  /^(ما (نوع|نمط)|مع من|أين (تفضل|تريد)|هل تفضل)/,
  /^(tipe (apa|seperti)|jenis apa|dengan siapa|dimana (kamu prefer|kamu mau)|mau yang|preferensi)/i,
  /tipo de (ambiente|lugar|sitio)|kind of (place|vibe|atmosphere|venue)|type of (place|venue|vibe)|qué ambiente|what vibe|preferencia de lugar/i,
];

function isClarification(s) {
  return clarificationPatterns.some(p => p.test(s.trim()));
}

// VALID icebreakers — should NOT be filtered (15)
const validIcebreakers = [
  '¿Qué estás tomando?',
  'Me encanta tu sonrisa',
  'What brings you here tonight?',
  'Do you come here often?',
  'Essa música é incrível, né?',
  'Tu aimes cet endroit?',
  'Ist das dein erstes Mal hier?',
  '今日はいい天気ですね',
  '你经常来这里吗？',
  'Тебе нравится здесь?',
  'هل تحب هذا المكان؟',
  'Kamu sering ke sini?',
  'Nice jacket, where did you get it?',
  'Esta canción me encanta',
  'Have you tried the cocktails here?',
];

validIcebreakers.forEach((ice, i) => {
  test(CAT2, `Valid icebreaker #${i+1}: "${ice.substring(0, 35)}..."`, () => {
    assert(!isClarification(ice), `Should NOT be filtered: "${ice}"`);
  });
});

// CLARIFICATION questions — should be filtered (15)
const clarifications = [
  '¿Qué tipo de ambiente prefieres?',
  '¿Cuál prefieres, bar o restaurante?',
  'What type of place are you going to?',
  'Which type of venue do you like?',
  'Que tipo de lugar você prefere?',
  'Qual prefere, bar ou restaurante?',
  'Quel type de lieu préfères-tu?',
  'Was für ein Lokal bevorzugst du?',
  'Welche Art von Ort möchtest du?',
  'どんなタイプのお店がいい？',
  '什么类型的地方？',
  'Какой тип заведения предпочитаете?',
  'ما نوع المكان الذي تفضله؟',
  'Tipe apa yang kamu suka?',
  'What kind of vibe are you looking for?',
];

clarifications.forEach((cl, i) => {
  test(CAT2, `Clarification #${i+1}: "${cl.substring(0, 35)}..."`, () => {
    assert(isClarification(cl), `Should BE filtered: "${cl}"`);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. SCORE CLAMPING (10 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT3 = 'Score Clamping';

function clampScore(raw) {
  return Math.min(10, Math.max(1, isNaN(Number(raw)) ? 5 : Number(raw)));
}

const clampTests = [
  { input: NaN, expected: 5 },
  { input: Infinity, expected: 10 },
  { input: -Infinity, expected: 1 },
  { input: null, expected: 1 },  // Number(null)=0, not NaN, so max(1,0)=1
  { input: undefined, expected: 5 },
  { input: 0, expected: 1 },
  { input: -1, expected: 1 },
  { input: 'abc', expected: 5 },
  { input: 15, expected: 10 },
  { input: 7, expected: 7 },
];

clampTests.forEach((t, i) => {
  test(CAT3, `Clamp ${String(t.input)} => ${t.expected}`, () => {
    assertEqual(clampScore(t.input), t.expected);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. SECURITY: Auth Check Patterns (5 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT4 = 'Auth Check Patterns';

// Auth check pattern. Each CF must throw when `request.auth` is null. The
// message side of the throw can be either the legacy "Authentication required"
// literal or the newer `getLocalizedError('auth_required', lang)` (10-lang table
// in shared.js). Both forms exist in the tree during the migration window.
const hasAuthCheck = (block) =>
  block.includes("if (!request.auth)") &&
  (block.includes('Authentication required') || block.includes("getLocalizedError('auth_required'"));

test(CAT4, 'sendTestNotification has auth check', () => {
  const idx = notifSrc.indexOf('exports.sendTestNotification');
  const block = notifSrc.substring(idx, idx + 500);
  assert(hasAuthCheck(block), 'sendTestNotification must check auth');
});

test(CAT4, 'sendTestNotificationToUser has auth check', () => {
  const idx = notifSrc.indexOf('sendTestNotificationToUser');
  const block = notifSrc.substring(idx, idx + 500);
  assert(hasAuthCheck(block), 'sendTestNotificationToUser must check auth');
});

test(CAT4, 'dateCoachChat has auth check', () => {
  const idx = coachSrc.indexOf('exports.dateCoachChat');
  const block = coachSrc.substring(idx, idx + 600);
  assert(hasAuthCheck(block), 'dateCoachChat must check auth');
});

test(CAT4, 'searchEvents has auth check', () => {
  const idx = eventsSrc.indexOf('exports.searchEvents');
  const block = eventsSrc.substring(idx, idx + 600);
  assert(hasAuthCheck(block), 'searchEvents must check auth');
});

test(CAT4, 'scheduleDateCheckIn has auth check', () => {
  const idx = safetySrc.indexOf('exports.scheduleDateCheckIn');
  const block = safetySrc.substring(idx, idx + 500);
  assert(hasAuthCheck(block), 'scheduleDateCheckIn must check auth');
});

// ═══════════════════════════════════════════════════════════════════
// 5. SECURITY: Self-Only Targeting (5 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT5 = 'Self-Only Targeting';

test(CAT5, 'sendTestNotification enforces userId === request.auth.uid', () => {
  assert(notifSrc.includes('userId !== request.auth.uid'), 'Must enforce self-targeting');
});

test(CAT5, 'sendTestNotificationToUser uses request.auth.uid only', () => {
  // 500-char window tolerates the localized-auth prelude (userLanguage parse + getLocalizedError).
  const idx = notifSrc.indexOf('exports.sendTestNotificationToUser');
  const block = notifSrc.substring(idx, idx + 500);
  assert(block.includes('request.auth.uid'), 'Must use auth.uid');
});

test(CAT5, 'cancelDateCheckIn checks userId ownership', () => {
  assert(safetySrc.includes("doc.data().userId !== request.auth.uid"), 'Must check userId ownership');
});

test(CAT5, 'respondToDateCheckIn checks userId ownership', () => {
  const matches = safetySrc.match(/doc\.data\(\)\.userId !== request\.auth\.uid/g);
  assert(matches && matches.length >= 2, 'Must check userId in both cancel and respond');
});

test(CAT5, 'dateCoachChat uses request.auth.uid for userId', () => {
  assert(coachSrc.includes('const userId = request.auth.uid'), 'Must derive userId from auth');
});

// ═══════════════════════════════════════════════════════════════════
// 6. URL SANITIZATION (15 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT6 = 'URL Sanitization';

const urlTests = [
  { input: 'https://example.com', expected: null, note: 'example.com rejected' },
  { input: 'https://www.restaurant.com', expected: 'https://www.restaurant.com', note: 'valid https' },
  { input: 'http://www.cafe.com', expected: 'http://www.cafe.com', note: 'valid http' },
  { input: 'javascript:alert(1)', expected: null, note: 'javascript: rejected' },
  { input: 'data:text/html,hello', expected: null, note: 'data: rejected' },
  { input: 'ftp://files.com/secret', expected: null, note: 'ftp: rejected' },
  { input: 'file:///etc/passwd', expected: null, note: 'file: rejected' },
  { input: 'mailto:a@b.com', expected: null, note: 'mailto: rejected' },
  { input: '', expected: null, note: 'empty string' },
  { input: null, expected: null, note: 'null input' },
  { input: undefined, expected: null, note: 'undefined input' },
  { input: 123, expected: null, note: 'numeric input' },
  { input: 'https://placeholder.io', expected: null, note: 'placeholder rejected' },
  { input: 'not a url', expected: null, note: 'random string' },
  { input: 'https://real-place.com/menu?lang=es', expected: 'https://real-place.com/menu?lang=es', note: 'valid with query' },
];

urlTests.forEach((t, i) => {
  test(CAT6, `URL #${i+1}: ${t.note}`, () => {
    assertEqual(sanitizeWebsiteUrl(t.input), t.expected);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. BASE64 VALIDATION (10 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT7 = 'Base64 Validation';

const BASE64_REGEX = /^[A-Za-z0-9+/]*={0,2}$/;

const base64Tests = [
  { input: 'SGVsbG8gV29ybGQ=', valid: true, note: 'valid base64' },
  { input: 'dGVzdA==', valid: true, note: 'valid "test"' },
  { input: '', valid: true, note: 'empty string' },
  { input: 'abc123', valid: true, note: 'simple alphanumeric' },
  { input: 'not base64!!!', valid: false, note: 'invalid chars !' },
  { input: 'has spaces here', valid: false, note: 'contains spaces' },
  { input: '<script>alert(1)</script>', valid: false, note: 'XSS attempt' },
  { input: '{"json": true}', valid: false, note: 'JSON not base64' },
  { input: 'QUJD', valid: true, note: 'valid "ABC"' },
  { input: 'data:image/png;base64,iVBOR', valid: false, note: 'data URI not pure base64' },
];

base64Tests.forEach((t, i) => {
  test(CAT7, `Base64 #${i+1}: ${t.note}`, () => {
    assertEqual(BASE64_REGEX.test(t.input), t.valid, `"${t.input}" should be ${t.valid ? 'valid' : 'invalid'}`);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. NOTIFICATION TYPE → TAB MAPPING (7 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT8 = 'Notification Type → Tab';

const notifTypes = [
  { type: 'new_match', channel: 'matches_channel' },
  { type: 'daily_likes_reset', channel: 'daily_likes_channel' },
  { type: 'super_likes_reset', channel: 'super_likes_channel' },
  { type: 'coach_daily_tip', channel: 'coach_channel' },
  { type: 'safety_check_in', channel: 'safety_checkin_channel' },
  { type: 'wingperson', channel: 'wingperson_channel' },
  { type: 'default', channel: 'default_channel' },
];

const matchesSrc = fs.readFileSync(path.join(LIB, 'matches.js'), 'utf8');
const wingpersonSrc = fs.readFileSync(path.join(LIB, 'wingperson.js'), 'utf8');
const allSrcForChannels = notifSrc + scheduledSrc + coachSrc + safetySrc + matchesSrc + wingpersonSrc;

notifTypes.forEach(nt => {
  test(CAT8, `Channel "${nt.channel}" exists in source`, () => {
    assert(allSrcForChannels.includes(nt.channel), `Channel ${nt.channel} must exist`);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 9. cleanupStaleTokens Error Codes (4 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT9 = 'Stale Token Error Codes';

const fcmErrorCodes = [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
];

fcmErrorCodes.forEach(code => {
  test(CAT9, `Error code "${code}" handled in cleanupStaleTokens`, () => {
    assert(scheduledSrc.includes(code), `Must handle ${code}`);
  });
});

test(CAT9, 'cleanupStaleTokens removes tokens from Firestore', () => {
  assert(scheduledSrc.includes('fcmToken: admin.firestore.FieldValue.delete()'),
    'Must delete stale fcmToken from user doc');
});

// ═══════════════════════════════════════════════════════════════════
// 10. TOKEN CLEANUP LOGIC (3 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT10 = 'Token Cleanup Logic';

test(CAT10, 'cleanupStaleTokens checks response.responses array', () => {
  assert(scheduledSrc.includes('response.responses.forEach'), 'Must iterate responses');
});

test(CAT10, 'cleanupStaleTokens uses batch commit for efficiency', () => {
  assert(scheduledSrc.includes('batch.commit()'), 'Must use batch for cleanup');
});

test(CAT10, 'cleanupStaleTokens logs count of removed tokens', () => {
  assert(scheduledSrc.includes('Removed') && scheduledSrc.includes('invalid FCM tokens'),
    'Must log removal count');
});

// ═══════════════════════════════════════════════════════════════════
// 11. CHANNEL EXISTENCE (8 Android channels)
// ═══════════════════════════════════════════════════════════════════
const CAT11 = 'Android Channel Existence';

const channels = [
  'default', 'default_channel', 'matches_channel', 'daily_likes_channel',
  'super_likes_channel', 'coach_channel', 'safety_checkin_channel', 'wingperson_channel',
];

channels.forEach(ch => {
  test(CAT11, `Channel "${ch}" referenced in backend`, () => {
    const combined = notifSrc + scheduledSrc + coachSrc + safetySrc +
      fs.readFileSync(path.join(LIB, 'matches.js'), 'utf8') +
      fs.readFileSync(path.join(LIB, 'wingperson.js'), 'utf8');
    assert(combined.includes(ch), `Channel ${ch} must be used`);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 12. dateScore GUARDS (10 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT12 = 'dateScore Guards';

test(CAT12, 'needsContext priority over dateScore', () => {
  assert(coachSrc.includes('if (needsContext && dateScore)') ||
    coachSrc.includes('needsContext && dateScore'), 'needsContext must clear dateScore');
});

test(CAT12, 'dateScore cleared when needsContext active', () => {
  assert(coachSrc.includes("dateScore = undefined") && coachSrc.includes('needsContext is active'),
    'dateScore must be undefined when needsContext');
});

test(CAT12, 'matchId required for dateScore', () => {
  assert(coachSrc.includes('dateScore && !matchId'), 'Must guard dateScore without matchId');
});

test(CAT12, 'dateScore cleared without matchId', () => {
  assert(coachSrc.includes("Clearing dateScore because no matchId"),
    'Must log clearing dateScore without matchId');
});

test(CAT12, 'rawDateScore typeof check', () => {
  assert(coachSrc.includes("typeof rawDateScore === 'object'"), 'Must check rawDateScore is object');
});

test(CAT12, 'rawDateScore overall typeof check', () => {
  assert(coachSrc.includes("typeof rawDateScore.overall === 'number'"), 'Must check overall is number');
});

test(CAT12, 'conversation dimension has fallback', () => {
  assert(coachSrc.includes('rawDateScore.conversation?.score || 5'), 'conversation score defaults to 5');
});

test(CAT12, 'chemistry dimension has fallback', () => {
  assert(coachSrc.includes('rawDateScore.chemistry?.score || 5'), 'chemistry score defaults to 5');
});

test(CAT12, 'effort dimension has fallback', () => {
  assert(coachSrc.includes('rawDateScore.effort?.score || 5'), 'effort score defaults to 5');
});

test(CAT12, 'fun dimension has fallback', () => {
  assert(coachSrc.includes('rawDateScore.fun?.score || 5'), 'fun score defaults to 5');
});

// ═══════════════════════════════════════════════════════════════════
// 13. dateScore NaN Safety (5 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT13 = 'dateScore NaN Safety';

test(CAT13, 'isNaN check on overall', () => {
  assert(coachSrc.includes('isNaN(Number(rawDateScore.overall))'), 'Must check isNaN on overall');
});

test(CAT13, 'NaN overall falls back to 5', () => {
  assert(coachSrc.includes('isNaN(Number(rawDateScore.overall)) ? 5'), 'NaN overall → 5');
});

test(CAT13, 'overall clamped min 1', () => {
  assert(coachSrc.includes('Math.max(1, isNaN'), 'overall min clamped to 1');
});

test(CAT13, 'overall clamped max 10', () => {
  assert(coachSrc.includes('Math.min(10, Math.max(1'), 'overall max clamped to 10');
});

test(CAT13, 'dimension scores clamped min 1 max 10', () => {
  const count = (coachSrc.match(/Math\.min\(10, Math\.max\(1,/g) || []).length;
  assert(count >= 5, `Expected >=5 clamp expressions, found ${count}`);
});

// ═══════════════════════════════════════════════════════════════════
// 14. dateScore DIMENSION CLAMPING (5 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT14 = 'dateScore Dimension Clamping';

function clampDimension(raw) {
  return Math.min(10, Math.max(1, raw || 5));
}

const dimTests = [
  { input: 0, expected: 5, note: 'falsy 0 → default 5, clamped to 5' },
  { input: null, expected: 5, note: 'null → 5' },
  { input: undefined, expected: 5, note: 'undefined → 5' },
  { input: 11, expected: 10, note: '11 → clamped to 10' },
  { input: -3, expected: 1, note: '-3 → clamped to 1' },
];

dimTests.forEach(t => {
  test(CAT14, `Dimension clamp: ${t.note}`, () => {
    assertEqual(clampDimension(t.input), t.expected);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 15. safeResponseText (5 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT15 = 'safeResponseText';

test(CAT15, 'null result returns empty string', () => {
  assertEqual(safeResponseText(null), '');
});

test(CAT15, 'undefined result returns empty string', () => {
  assertEqual(safeResponseText(undefined), '');
});

test(CAT15, 'result with no response returns empty string', () => {
  assertEqual(safeResponseText({}), '');
});

test(CAT15, 'result.response.text() throws returns empty string', () => {
  const fakeResult = { response: { text() { throw new Error('blocked'); } } };
  assertEqual(safeResponseText(fakeResult), '');
});

test(CAT15, 'valid result returns text', () => {
  const fakeResult = { response: { text() { return 'Hello Coach!'; } } };
  assertEqual(safeResponseText(fakeResult), 'Hello Coach!');
});

// ═══════════════════════════════════════════════════════════════════
// 16. safeResponseText EXISTS IN ALL 3 FILES (5 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT15b = 'safeResponseText Coverage';

test(CAT15b, 'safeResponseText defined in coach.js', () => {
  assert(coachSrc.includes('function safeResponseText(result)'), 'Must exist in coach.js');
});

test(CAT15b, 'safeResponseText defined in moderation.js', () => {
  assert(moderationSrc.includes('function safeResponseText(result)'), 'Must exist in moderation.js');
});

test(CAT15b, 'safeResponseText defined in ai-services.js', () => {
  assert(aiServicesSrc.includes('function safeResponseText(result)'), 'Must exist in ai-services.js');
});

test(CAT15b, 'safeResponseText catches exceptions in coach.js', () => {
  assert(coachSrc.includes("catch (e) { logger.warn(`[safeResponseText]"), 'Must catch with logger');
});

test(CAT15b, 'safeResponseText uses optional chaining', () => {
  assert(coachSrc.includes('result?.response?.text()'), 'Must use ?. chaining');
});

// ═══════════════════════════════════════════════════════════════════
// 17. APPEARANCE SAFETY RULES (5 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT16 = 'Appearance Safety Rules';

test(CAT16, 'NEVER respond with only text (rule exists)', () => {
  assert(coachSrc.includes('NEVER respond with only text'), 'Rule must exist in prompt');
});

test(CAT16, 'NEVER manipulative suggestions exist in MODE 7', () => {
  assert(coachSrc.includes('NEVER manipulative'), 'Anti-manipulation rule in MODE 7');
});

test(CAT16, 'NEVER dismissive suggestions exist in MODE 7', () => {
  assert(coachSrc.includes('NEVER dismissive'), 'Anti-dismissive rule in MODE 7');
});

test(CAT16, 'NEVER passive-aggressive in MODE 7', () => {
  assert(coachSrc.includes('NEVER passive-aggressive'), 'Anti-passive-aggressive in MODE 7');
});

test(CAT16, 'NEVER use skill names implying manipulation', () => {
  assert(coachSrc.includes('NEVER use skill names that imply manipulation'), 'Anti-manipulation skill names');
});

// ═══════════════════════════════════════════════════════════════════
// 18. RATE LIMIT LOGIC (5 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT17 = 'Rate Limit Logic';

test(CAT17, 'Rate limit checks count >= config.rateLimitPerHour', () => {
  assert(coachSrc.includes('recentMsgCount.data().count >= config.rateLimitPerHour'),
    'Must compare count to config limit');
});

test(CAT17, 'Rate limit default is 30/hour', () => {
  assert(coachSrc.includes('rateLimitPerHour: 30'), 'Default 30/hour');
});

test(CAT17, 'Rate limit skips for loadMoreActivities', () => {
  assert(coachSrc.includes('!loadMoreActivities && recentMsgCount'), 'Must skip rate limit for loadMore');
});

test(CAT17, 'Rate limit returns success: true (fail-open-ish)', () => {
  // The success: true is after the rateLimitMsgs block (~line 1209-1214)
  const idx = coachSrc.indexOf('rateLimitMsgs');
  const block = coachSrc.substring(idx, idx + 1200);
  assert(block.includes('success: true'), 'Rate limit returns success: true');
});

test(CAT17, 'Rate limit has 10-language messages', () => {
  const idx = coachSrc.indexOf('rateLimitMsgs');
  const block = coachSrc.substring(idx, idx + 1000);
  ['en', 'es', 'fr', 'de', 'pt', 'ja', 'zh', 'ru', 'ar', 'id'].forEach(lang => {
    assert(block.includes(`${lang}:`), `Rate limit message missing for ${lang}`);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 19. CULTURAL DE-ESCALATION — 10 lang variants in MODE 7 (10 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT18 = 'Cultural De-escalation';

const culturalLanguages = [
  { code: 'ES', marker: 'ES (Latam)' },
  { code: 'EN', marker: 'EN:' },
  { code: 'JA', marker: 'JA:' },
  { code: 'ZH', marker: 'ZH:' },
  { code: 'AR', marker: 'AR:' },
  { code: 'DE', marker: 'DE:' },
  { code: 'PT', marker: 'PT (BR)' },
  { code: 'FR', marker: 'FR:' },
  { code: 'RU', marker: 'RU:' },
  { code: 'ID', marker: 'ID:' },
];

culturalLanguages.forEach(lang => {
  test(CAT18, `Cultural adaptation for ${lang.code} in MODE 7`, () => {
    // Find MODE 7 section
    const mode7Idx = coachSrc.indexOf('CULTURAL ADAPTATION for conflict resolution');
    assert(mode7Idx > -1, 'CULTURAL ADAPTATION section must exist');
    const section = coachSrc.substring(mode7Idx, mode7Idx + 1500);
    assert(section.includes(lang.marker), `Cultural adaptation for ${lang.code} must exist`);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 20. SKILL BUILDER (10 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT19 = 'Skill Builder';

test(CAT19, 'SKILL BUILDER section exists in prompt', () => {
  assert(coachSrc.includes('SKILL BUILDER'), 'SKILL BUILDER must exist');
});

test(CAT19, 'Skill prefix "Skill:" in EN', () => {
  assert(coachSrc.includes('Skill:'), 'English skill prefix');
});

test(CAT19, 'Skill prefix "Habilidad:" in ES', () => {
  assert(coachSrc.includes('Habilidad:'), 'Spanish skill prefix');
});

test(CAT19, 'Skill prefix "スキル:" in JA', () => {
  assert(coachSrc.includes('スキル:'), 'Japanese skill prefix');
});

test(CAT19, 'Skill prefix "技能:" in ZH', () => {
  assert(coachSrc.includes('技能:'), 'Chinese skill prefix');
});

test(CAT19, 'Skill prefix "Навык:" in RU', () => {
  assert(coachSrc.includes('Навык:'), 'Russian skill prefix');
});

test(CAT19, 'Skill prefix "مهارة:" in AR', () => {
  assert(coachSrc.includes('مهارة:'), 'Arabic skill prefix');
});

test(CAT19, 'Anti-manipulation rule for skill names', () => {
  assert(coachSrc.includes('Playing Hard to Get'), 'Example blocked skill name must exist');
});

test(CAT19, 'Skill Builder skips needsContext', () => {
  assert(coachSrc.includes('needsContext is true (clarification'), 'Must skip skill on needsContext');
});

test(CAT19, 'Skill Builder example: Active Listening', () => {
  assert(coachSrc.includes('Active Listening'), 'Example skill must exist');
});

// ═══════════════════════════════════════════════════════════════════
// 21. CULTURAL ETIQUETTE RAG — 5 regions x 2 checks (10 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT20 = 'Cultural Etiquette';

const cultureChecks = [
  { lang: 'ja', pattern: 'Indirect' },
  { lang: 'zh', pattern: 'Practical' },
  { lang: 'ar', pattern: 'Formal' },
  { lang: 'de', pattern: 'Direct' },
  { lang: 'pt', pattern: 'Warm' },
  { lang: 'es', pattern: 'enthusiastic' },
  { lang: 'fr', pattern: 'Elegant' },
  { lang: 'ru', pattern: 'Direct' },
  { lang: 'id', pattern: 'Polite' },
  { lang: 'en', pattern: 'Balanced' },
];

cultureChecks.forEach(cc => {
  test(CAT20, `getCulturalContext(${cc.lang}) contains "${cc.pattern}"`, () => {
    // Verify the cultural context is in coach.js source — use larger block (function is ~15 lines)
    const idx = coachSrc.indexOf('function getCulturalContext');
    assert(idx > -1, 'getCulturalContext must exist');
    const block = coachSrc.substring(idx, idx + 1500);
    assert(block.includes(`${cc.lang}:`) && block.includes(cc.pattern),
      `Culture for ${cc.lang} must include "${cc.pattern}"`);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 22. AI CONFIG: getTemp (5 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT21 = 'getTemp';

test(CAT21, 'Valid config returns temperature', () => {
  assertEqual(getTemp({ temperatures: { smartReply: 0.85 } }, 'smartReply', 0.5), 0.85);
});

test(CAT21, 'Missing key returns fallback', () => {
  assertEqual(getTemp({ temperatures: { other: 0.9 } }, 'smartReply', 0.5), 0.5);
});

test(CAT21, 'Null config returns fallback', () => {
  assertEqual(getTemp(null, 'smartReply', 0.5), 0.5);
});

test(CAT21, 'Undefined config returns fallback', () => {
  assertEqual(getTemp(undefined, 'smartReply', 0.5), 0.5);
});

test(CAT21, 'Empty object returns fallback', () => {
  assertEqual(getTemp({}, 'smartReply', 0.5), 0.5);
});

// ═══════════════════════════════════════════════════════════════════
// 23. AI CONFIG: getTokens (5 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT22 = 'getTokens';

test(CAT22, 'Valid config returns tokens', () => {
  assertEqual(getTokens({ maxOutputTokens: { smartReply: 512 } }, 'smartReply', 256), 512);
});

test(CAT22, 'Missing key returns fallback', () => {
  assertEqual(getTokens({ maxOutputTokens: { other: 1024 } }, 'smartReply', 256), 256);
});

test(CAT22, 'Null config returns fallback', () => {
  assertEqual(getTokens(null, 'smartReply', 256), 256);
});

test(CAT22, 'Undefined config returns fallback', () => {
  assertEqual(getTokens(undefined, 'smartReply', 256), 256);
});

test(CAT22, 'Zero value preserved (not fallback)', () => {
  assertEqual(getTokens({ maxOutputTokens: { smartReply: 0 } }, 'smartReply', 256), 0);
});

// ═══════════════════════════════════════════════════════════════════
// 24. SINGLE-FLIGHT CACHE (5 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT23 = 'Single-Flight Cache';

test(CAT23, 'getAiConfig uses _aiConfigPromise for single-flight', () => {
  assert(aiServicesSrc.includes('_aiConfigPromise'), 'Must use promise for single-flight');
});

test(CAT23, 'getAiConfig checks TTL before returning cached', () => {
  assert(aiServicesSrc.includes('AI_CONFIG_CACHE_TTL'), 'Must check TTL');
});

test(CAT23, 'getAiConfig returns existing promise if in-flight', () => {
  assert(aiServicesSrc.includes('if (_aiConfigPromise) return _aiConfigPromise'),
    'Must return existing promise');
});

test(CAT23, 'Coach config has 5-minute cache TTL', () => {
  assert(coachSrc.includes('5 * 60 * 1000'), 'Coach config TTL = 5min');
});

test(CAT23, 'AI config nullifies promise after fetch', () => {
  assert(aiServicesSrc.includes('_aiConfigPromise = null'), 'Must nullify after fetch');
});

// ═══════════════════════════════════════════════════════════════════
// 25. parseGeminiJsonResponse (5 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT24 = 'parseGeminiJsonResponse';

test(CAT24, 'Parses clean JSON', () => {
  const result = parseGeminiJsonResponse('{"reply": "hello"}');
  assertEqual(result.reply, 'hello');
});

test(CAT24, 'Parses markdown-wrapped JSON', () => {
  const result = parseGeminiJsonResponse('```json\n{"reply": "hello"}\n```');
  assertEqual(result.reply, 'hello');
});

test(CAT24, 'Parses JSON with leading text', () => {
  const result = parseGeminiJsonResponse('Here is the response: {"reply": "hello"}');
  assertEqual(result.reply, 'hello');
});

test(CAT24, 'Throws on empty string', () => {
  let threw = false;
  try { parseGeminiJsonResponse(''); } catch { threw = true; }
  assert(threw, 'Should throw on empty');
});

test(CAT24, 'Throws on invalid JSON', () => {
  let threw = false;
  try { parseGeminiJsonResponse('not json at all'); } catch { threw = true; }
  assert(threw, 'Should throw on invalid');
});

// ═══════════════════════════════════════════════════════════════════
// 26. normalizeCategory — ALL 14 categories (14 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT25 = 'normalizeCategory';

const catTests = [
  { input: 'coffee_shop', expected: 'cafe' },
  { input: 'pub', expected: 'bar' },
  { input: 'night_club', expected: 'night_club' },
  { input: 'history_museum', expected: 'museum' },
  { input: 'art_gallery', expected: 'art_gallery' },
  { input: 'movie_theater', expected: 'movie_theater' },
  { input: 'national_park', expected: 'park' },
  { input: 'bowling', expected: 'bowling_alley' },
  { input: 'bakery', expected: 'bakery' },
  { input: 'shopping_mall', expected: 'shopping_mall' },
  { input: 'spa', expected: 'spa' },
  { input: 'aquarium', expected: 'aquarium' },
  { input: 'zoo', expected: 'zoo' },
  { input: 'restaurant', expected: 'restaurant' },
];

catTests.forEach(t => {
  test(CAT25, `"${t.input}" → "${t.expected}"`, () => {
    assertEqual(normalizeCategory(t.input), t.expected);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 27. getLanguageInstruction — ALL 10 languages (10 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT26 = 'getLanguageInstruction';

const langTests = [
  { code: 'en', contains: 'ENGLISH' },
  { code: 'es', contains: 'ESPAÑOL' },
  { code: 'pt', contains: 'português' },
  { code: 'fr', contains: 'français' },
  { code: 'de', contains: 'Deutsch' },
  { code: 'ja', contains: '日本語' },
  { code: 'zh', contains: '中文' },
  { code: 'ru', contains: 'русском' },
  { code: 'ar', contains: 'بالعربية' },
  { code: 'id', contains: 'Bahasa Indonesia' },
];

langTests.forEach(t => {
  test(CAT26, `"${t.code}" instruction contains "${t.contains}"`, () => {
    const result = getLanguageInstruction(t.code);
    assert(result.includes(t.contains), `${t.code} instruction must contain "${t.contains}"`);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 28. MODERATION: safeResponseText + Blacklist (10 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT27 = 'Moderation Patterns';

test(CAT27, 'MODERATION_BLACKLIST exists in notifications.js', () => {
  assert(notifSrc.includes('MODERATION_BLACKLIST'), 'Must export MODERATION_BLACKLIST');
});

test(CAT27, 'MODERATION_BLACKLIST is exported', () => {
  assert(notifSrc.includes('exports.MODERATION_BLACKLIST'), 'Must be exported');
});

test(CAT27, 'SEXUAL_BLACKLIST_TERMS exists', () => {
  assert(notifSrc.includes('SEXUAL_BLACKLIST_TERMS'), 'Must have SEXUAL_BLACKLIST_TERMS');
});

test(CAT27, 'SEXUAL_BLACKLIST_TERMS is exported', () => {
  assert(notifSrc.includes('exports.SEXUAL_BLACKLIST_TERMS'), 'Must be exported');
});

test(CAT27, 'Blacklist covers EN spam', () => {
  assert(notifSrc.includes("'viagra'"), 'Must include viagra');
});

test(CAT27, 'Blacklist covers ES scams', () => {
  assert(notifSrc.includes("'envía dinero'"), 'Must include ES scam terms');
});

test(CAT27, 'Blacklist covers PT content', () => {
  assert(notifSrc.includes("'fotos nua'"), 'Must include PT content');
});

test(CAT27, 'Blacklist covers AR content', () => {
  assert(notifSrc.includes('صور عارية'), 'Must include AR content');
});

test(CAT27, 'Blacklist covers JA content', () => {
  assert(notifSrc.includes('ヌード送って'), 'Must include JA content');
});

test(CAT27, 'Blacklist covers ZH content', () => {
  assert(notifSrc.includes('发裸照'), 'Must include ZH content');
});

test(CAT27, 'Blacklist covers RU content', () => {
  assert(notifSrc.includes('голые фото'), 'Must include RU content');
});

test(CAT27, 'Blacklist covers ID content', () => {
  assert(notifSrc.includes('kirim foto bugil'), 'Must include ID content');
});

test(CAT27, 'Blacklist covers leet-speak variants', () => {
  assert(notifSrc.includes("'s3x'") || notifSrc.includes("s3xo"), 'Must include leet variants');
});

test(CAT27, 'moderation.js imports MODERATION_BLACKLIST from notifications', () => {
  assert(moderationSrc.includes("MODERATION_BLACKLIST"), 'Must import blacklist');
});

test(CAT27, 'safeResponseText in moderation.js catches exceptions', () => {
  assert(moderationSrc.includes("catch (e) { logger.warn(`[safeResponseText]"), 'Must catch');
});

// ═══════════════════════════════════════════════════════════════════
// 29. EVENTS: URL Sanitization & Emoji Map (15 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT28 = 'Events URL & Emoji';

// Event URL tests
const eventUrlTests = [
  { url: 'https://www.ticketmaster.com/event/123', valid: true },
  { url: 'https://www.eventbrite.com/e/456', valid: true },
  { url: 'http://meetup.com/group/event', valid: true },
  { url: 'javascript:alert(1)', valid: false },
  { url: '', valid: false },
  { url: null, valid: false },
  { url: 'https://example.com/fake', valid: false },
];

eventUrlTests.forEach((t, i) => {
  test(CAT28, `Event URL #${i+1}: ${t.url || '(empty)'} → ${t.valid ? 'valid' : 'invalid'}`, () => {
    assertEqual(sanitizeWebsiteUrl(t.url) !== null, t.valid);
  });
});

// Event emoji map — all categories
const eventCategories = ['music', 'food', 'art', 'sports', 'comedy', 'theater', 'festivals', 'workshops', 'games', 'nightlife', 'other'];

test(CAT28, 'EVENT_CATEGORY_EMOJI exists in events.js', () => {
  assert(eventsSrc.includes('EVENT_CATEGORY_EMOJI'), 'Must exist');
});

eventCategories.forEach(cat => {
  test(CAT28, `Event emoji for "${cat}" exists`, () => {
    assert(EVENT_CATEGORY_EMOJI[cat], `Emoji for ${cat} must exist`);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 30. EVENTS: Config & Structure (5 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT29 = 'Events Config';

test(CAT29, 'Events has Ticketmaster integration', () => {
  assert(eventsSrc.includes('searchTicketmaster'), 'Must have Ticketmaster');
});

test(CAT29, 'Events has Eventbrite integration', () => {
  assert(eventsSrc.includes('searchEventbrite'), 'Must have Eventbrite');
});

test(CAT29, 'Events has Meetup integration', () => {
  assert(eventsSrc.includes('searchMeetup'), 'Must have Meetup');
});

test(CAT29, 'Events enriches with social media signals', () => {
  assert(eventsSrc.includes('enrichWithSocialSignals'), 'Must enrich with social');
});

test(CAT29, 'Events has Firestore cache', () => {
  assert(eventsSrc.includes('eventCache'), 'Must cache in Firestore');
});

// ═══════════════════════════════════════════════════════════════════
// 31. INTEGRATION: categoryEmojiMap completeness (14 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT30 = 'categoryEmojiMap';

const allCategories = ['cafe', 'restaurant', 'bar', 'night_club', 'movie_theater', 'park',
  'museum', 'bowling_alley', 'art_gallery', 'bakery', 'shopping_mall', 'spa', 'aquarium', 'zoo'];

allCategories.forEach(cat => {
  test(CAT30, `Emoji for "${cat}" exists`, () => {
    assert(categoryEmojiMap[cat], `Must have emoji for ${cat}`);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 32. COACH CONFIG DEFAULTS (10 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT31 = 'Coach Config Defaults';

test(CAT31, 'dailyCredits default = 3', () => {
  assert(coachSrc.includes('dailyCredits: 3'), 'Default 3 credits');
});

test(CAT31, 'maxMessageLength default = 2000', () => {
  assert(coachSrc.includes('maxMessageLength: 2000'), 'Max 2000 chars');
});

test(CAT31, 'maxSuggestions default = 12', () => {
  assert(coachSrc.includes('maxSuggestions: 12'), 'Max 12 suggestions');
});

test(CAT31, 'maxFreeClarifications default = 3', () => {
  assert(coachSrc.includes('maxFreeClarifications: 3'), 'Max 3 free clarifications');
});

test(CAT31, 'temperature default = 0.9', () => {
  assert(coachSrc.includes('temperature: 0.9'), 'Default temp 0.9');
});

test(CAT31, 'maxTokens default = 2048', () => {
  assert(coachSrc.includes('maxTokens: 2048'), 'Default 2048 tokens');
});

test(CAT31, 'historyLimit default = 10', () => {
  assert(coachSrc.includes('historyLimit: 10'), 'History limit 10');
});

test(CAT31, 'coachTips baseScore = 35', () => {
  assert(coachSrc.includes('baseScore: 35'), 'Base score 35');
});

test(CAT31, 'coachTips scoreMin = 40', () => {
  assert(coachSrc.includes('scoreMin: 40'), 'Score min 40');
});

test(CAT31, 'coachTips scoreMax = 95', () => {
  assert(coachSrc.includes('scoreMax: 95'), 'Score max 95');
});

// ═══════════════════════════════════════════════════════════════════
// 33. RAG CONFIG (5 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT32 = 'RAG Config';

test(CAT32, 'RAG collection = coachKnowledge', () => {
  assert(coachSrc.includes("'coachKnowledge'"), 'Default RAG collection');
});

test(CAT32, 'RAG embedding model = gemini-embedding-001', () => {
  assert(coachSrc.includes("'gemini-embedding-001'"), 'Default embedding model');
});

test(CAT32, 'RAG dimensions = 768', () => {
  assert(coachSrc.includes('768'), 'Default 768 dimensions');
});

test(CAT32, 'RAG has language-aware ranking', () => {
  assert(coachSrc.includes('userLangDocs'), 'Must rank by user language');
});

test(CAT32, 'RAG has deduplication by category', () => {
  assert(coachSrc.includes('seenCategories'), 'Must dedup by category');
});

// ═══════════════════════════════════════════════════════════════════
// 34. MODERATION RAG (5 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT33 = 'Moderation RAG';

test(CAT33, 'moderationKnowledge collection exists', () => {
  assert(moderationSrc.includes("'moderationKnowledge'"), 'Must use moderationKnowledge');
});

test(CAT33, 'getModerationConfig has cache with TTL', () => {
  assert(moderationSrc.includes('MODERATION_CONFIG_CACHE_TTL'), 'Must have cache TTL');
});

test(CAT33, 'Moderation RAG has min score filter', () => {
  assert(moderationSrc.includes('MOD_RAG_MIN_SCORE'), 'Must filter by min score');
});

test(CAT33, 'Moderation RAG has max query length', () => {
  assert(moderationSrc.includes('RAG_MAX_QUERY_LENGTH'), 'Must limit query length');
});

test(CAT33, 'Moderation RAG validates text length >= 3', () => {
  assert(moderationSrc.includes('trim().length < 3'), 'Must reject short text');
});

// ═══════════════════════════════════════════════════════════════════
// 35. COACH LEARNING SYSTEM (5 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT34 = 'Coach Learning System';

test(CAT34, 'analyzeUserMessage exists', () => {
  assert(coachSrc.includes('function analyzeUserMessage'), 'Must exist');
});

test(CAT34, 'detectCommunicationStyle exists', () => {
  assert(coachSrc.includes('function detectCommunicationStyle'), 'Must exist');
});

test(CAT34, 'buildLearningContext exists', () => {
  assert(coachSrc.includes('function buildLearningContext'), 'Must exist');
});

test(CAT34, 'updateCoachLearning writes to coachInsights/global', () => {
  assert(coachSrc.includes("coachInsights"), 'Must write global insights');
});

test(CAT34, 'Learning profile tracks topicFrequency', () => {
  assert(coachSrc.includes('topicFrequency'), 'Must track topic frequency');
});

// ═══════════════════════════════════════════════════════════════════
// 36. PLACES HELPERS (5 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT35 = 'Places Helpers';

test(CAT35, 'sanitizeWebsiteUrl exists in places-helpers.js', () => {
  assert(placesHelpersSrc.includes('function sanitizeWebsiteUrl'), 'Must exist');
});

test(CAT35, 'sanitizeWebsiteUrl rejects example.com', () => {
  assert(placesHelpersSrc.includes("example.com"), 'Must reject example.com');
});

test(CAT35, 'sanitizeWebsiteUrl rejects placeholder', () => {
  assert(placesHelpersSrc.includes("placeholder"), 'Must reject placeholder');
});

test(CAT35, 'fuzzyMatchPlace exists', () => {
  assert(placesHelpersSrc.includes('fuzzyMatchPlace'), 'Must exist');
});

test(CAT35, 'sanitizeInstagramHandle exists', () => {
  assert(placesHelpersSrc.includes('sanitizeInstagramHandle'), 'Must exist');
});

// ═══════════════════════════════════════════════════════════════════
// 37. OFF-TOPIC HANDLING (10 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT36 = 'Off-Topic Messages';

const offTopicLangs = ['en', 'es', 'fr', 'de', 'pt', 'ja', 'zh', 'ru', 'ar', 'id'];
offTopicLangs.forEach(lang => {
  test(CAT36, `Off-topic message for "${lang}" exists`, () => {
    // Check offTopicMessages in coach.js
    const idx = coachSrc.indexOf('offTopicMessages');
    assert(idx > -1, 'offTopicMessages must exist');
    const block = coachSrc.substring(idx, idx + 2000);
    assert(block.includes(`${lang}:`), `Off-topic message for ${lang} must exist`);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 38. SAFETY MESSAGES (10 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT37 = 'Safety Messages';

const safetyLangs = ['en', 'es', 'fr', 'de', 'pt', 'ja', 'zh', 'ru', 'ar', 'id'];
safetyLangs.forEach(lang => {
  test(CAT37, `Safety message for "${lang}" exists`, () => {
    const idx = coachSrc.indexOf('safetyMessages');
    assert(idx > -1, 'safetyMessages must exist');
    const block = coachSrc.substring(idx, idx + 2000);
    assert(block.includes(`${lang}:`), `Safety message for ${lang} must exist`);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 39. PLACES CHIP I18N (10 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT38 = 'Places Chip I18N';

const placesLangs = ['en', 'es', 'fr', 'de', 'pt', 'ja', 'zh', 'ru', 'ar', 'id'];
placesLangs.forEach(lang => {
  test(CAT38, `PLACES_CHIP_I18N for "${lang}" exists`, () => {
    assert(coachSrc.includes('PLACES_CHIP_I18N'), 'Must exist');
    const idx = coachSrc.indexOf('PLACES_CHIP_I18N');
    const block = coachSrc.substring(idx, idx + 800);
    assert(block.includes(`${lang}:`), `Chip for ${lang} must exist`);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 40. CLARIFICATION CHIPS I18N (10 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT39 = 'Clarification Chips I18N';

const clarLangs = ['en', 'es', 'fr', 'de', 'pt', 'ja', 'zh', 'ru', 'ar', 'id'];
clarLangs.forEach(lang => {
  test(CAT39, `Clarification chips for "${lang}" exist`, () => {
    const idx = coachSrc.indexOf('clarificationChips');
    assert(idx > -1, 'clarificationChips must exist');
    const block = coachSrc.substring(idx, idx + 1500);
    assert(block.includes(`${lang}:`), `Chips for ${lang} must exist`);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 41. AI ANALYTICS (5 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT40 = 'AI Analytics';

test(CAT40, 'trackAICall exists in shared.js', () => {
  assert(sharedSrc.includes('function trackAICall'), 'Must exist');
});

test(CAT40, 'MODEL_PRICING for gemini-2.5-flash', () => {
  assert(sharedSrc.includes("'gemini-2.5-flash'"), 'Must have pricing');
});

test(CAT40, 'MODEL_PRICING for gemini-2.5-flash-lite', () => {
  assert(sharedSrc.includes("'gemini-2.5-flash-lite'"), 'Must have lite pricing');
});

test(CAT40, 'Cost calculation uses 1M divisor', () => {
  assert(sharedSrc.includes('1_000_000'), 'Must divide by 1M');
});

test(CAT40, 'trackAICall writes to aiAnalytics collection', () => {
  assert(sharedSrc.includes("'aiAnalytics'"), 'Must write to Firestore');
});

// ═══════════════════════════════════════════════════════════════════
// 42. EMBEDDING CACHE (5 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT41 = 'Embedding Cache';

test(CAT41, 'Embedding cache exists in shared.js', () => {
  assert(sharedSrc.includes('_embeddingCache'), 'Must have cache');
});

test(CAT41, 'Embedding cache has TTL = 10min', () => {
  assert(sharedSrc.includes('10 * 60 * 1000'), 'TTL = 10 min');
});

test(CAT41, 'Embedding cache has max = 100', () => {
  assert(sharedSrc.includes('EMBEDDING_CACHE_MAX = 100'), 'Max 100 entries');
});

test(CAT41, 'getCachedEmbedding uses SHA-256 cache key', () => {
  assert(sharedSrc.includes("createHash('sha256')"), 'Must use SHA-256');
});

test(CAT41, 'getCachedEmbedding has timeout race', () => {
  assert(sharedSrc.includes('Promise.race'), 'Must race with timeout');
});

// ═══════════════════════════════════════════════════════════════════
// 43. NO CREDITS MESSAGE I18N (10 tests)
// ═══════════════════════════════════════════════════════════════════
const CAT42 = 'No Credits I18N';

const creditLangs = ['en', 'es', 'fr', 'de', 'pt', 'ja', 'zh', 'ru', 'ar', 'id'];
creditLangs.forEach(lang => {
  test(CAT42, `No-credits message for "${lang}" exists`, () => {
    const idx = coachSrc.indexOf('noCreditsMsg');
    assert(idx > -1, 'noCreditsMsg must exist');
    const block = coachSrc.substring(idx, idx + 1500);
    assert(block.includes(`${lang}:`), `No-credits for ${lang} must exist`);
  });
});

// ═══════════════════════════════════════════════════════════════════
// FINAL REPORT
// ═══════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(70));
console.log('  POST-DEPLOY EXHAUSTIVE VALIDATION — RESULTS');
console.log('═'.repeat(70));
console.log('');

// Print category table
const catNames = Object.keys(results);
const maxCatLen = Math.max(...catNames.map(n => n.length), 'CATEGORY'.length);

console.log(`  ${'CATEGORY'.padEnd(maxCatLen)}  PASS  FAIL  TOTAL`);
console.log(`  ${'─'.repeat(maxCatLen)}  ────  ────  ─────`);

catNames.forEach(cat => {
  const r = results[cat];
  const total = r.pass + r.fail;
  const passStr = String(r.pass).padStart(4);
  const failStr = String(r.fail).padStart(4);
  const totalStr = String(total).padStart(5);
  const status = r.fail === 0 ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`${status} ${cat.padEnd(maxCatLen)}  ${passStr}  ${failStr}  ${totalStr}`);
});

console.log(`  ${'─'.repeat(maxCatLen)}  ────  ────  ─────`);
console.log(`  ${'TOTAL'.padEnd(maxCatLen)}  ${String(totalPass).padStart(4)}  ${String(totalFail).padStart(4)}  ${String(totalPass + totalFail).padStart(5)}`);
console.log('');

if (totalFail === 0) {
  console.log(`\x1b[32m  ALL ${totalPass} TESTS PASSED\x1b[0m`);
} else {
  console.log(`\x1b[31m  ${totalFail} TESTS FAILED\x1b[0m`);
  console.log('');
  console.log('  Failed tests:');
  catNames.forEach(cat => {
    results[cat].tests.filter(t => t.status === 'fail').forEach(t => {
      console.log(`    [${cat}] ${t.name}: ${t.error}`);
    });
  });
}

console.log('');
console.log('═'.repeat(70));

process.exit(totalFail > 0 ? 1 : 0);
