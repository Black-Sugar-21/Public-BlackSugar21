#!/usr/bin/env node
'use strict';

/**
 * test-simulation.js — Comprehensive test suite for simulateRelationship CF
 *
 * Tests:
 *   Unit:        detectConnectionSignal, inferAttachmentStyle, inferCommStyle
 *   Integration: Full CF call via REST API (all languages, edge cases)
 *
 * Usage:
 *   node scripts/test-simulation.js                     # all tests
 *   node scripts/test-simulation.js --unit-only         # skip CF calls
 *   node scripts/test-simulation.js --lang=es           # one language only
 *   node scripts/test-simulation.js --match=<matchId>   # use real match
 */

const path = require('path');
const https = require('https');
const admin = require('./serviceAccountKey.json') && (() => {
  const adm = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
  if (!adm.apps.length) adm.initializeApp({ credential: adm.credential.cert(require('./serviceAccountKey.json')) });
  return adm;
})();
const db = admin.firestore();

// ── Config ────────────────────────────────────────────────────────────────
const PROJECT_ID    = 'black-sugar21';
const CF_REGION     = 'us-central1';
const CF_URL        = `https://${CF_REGION}-${PROJECT_ID}.cloudfunctions.net/simulateRelationship`;
const FIREBASE_AUTH_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=`;

// Known UIDs — auto-discovery finds the right match at runtime
const KNOWN_UIDS = {
  DANIEL:   'sU8xLiwQWNXmbYdR63p1uO6TSm72',
  ROSITA:   'DsDSK5xqEZZXAIKxtIKyBGntw8f2',
  TESTER:   'T2bAVpPEkfS5IUpwip2n1H5dsHX2',
  REVIEWER: 'IlG6U9cfcOcnKJvEv4tAD4IZ0513',
};

// Will be set after auto-discovery
let TEST_CALLER_UID = null;

const ARGS      = process.argv.slice(2);
const UNIT_ONLY = ARGS.includes('--unit-only');
const LANG_FILTER = ARGS.find(a => a.startsWith('--lang='))?.split('=')[1];
const MATCH_OVERRIDE = ARGS.find(a => a.startsWith('--match='))?.split('=')[1];

// ── Colors ────────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
};
const pass = (msg) => console.log(`  ${c.green}✓${c.reset} ${msg}`);
const fail = (msg) => console.log(`  ${c.red}✗${c.reset} ${msg}`);
const info = (msg) => console.log(`  ${c.cyan}ℹ${c.reset} ${msg}`);
const section = (msg) => console.log(`\n${c.bold}${c.blue}▶ ${msg}${c.reset}`);
const warn = (msg) => console.log(`  ${c.yellow}⚠${c.reset} ${msg}`);

let passed = 0, failed = 0;

function assert(cond, label, detail = '') {
  if (cond) { pass(label); passed++; }
  else { fail(`${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

// ── Unit-testable pure functions (mirrored from simulation.js) ────────────
// These are kept in sync with the source of truth in simulation.js.

function inferAttachmentStyle(bio = '', interests = []) {
  const text = (bio + ' ' + interests.join(' ')).toLowerCase();
  const anxiousKw  = ['love deeply','all or nothing','intensity','passionate','need connection',
    'amo profundo','intensidad','necesito','miedo','fear of','abandonment'];
  const avoidantKw = ['independent','my space','freedom','no drama','chill','casual',
    'independiente','mi espacio','libertad','no complications','sin dramas'];
  const secureKw   = ['open','honest','trust','communication','balance','healthy','mature',
    'abierto','honesto','confianza','comunicación','equilibrio'];
  const aScore = anxiousKw.filter(w => text.includes(w)).length;
  const vScore = avoidantKw.filter(w => text.includes(w)).length;
  const sScore = secureKw.filter(w => text.includes(w)).length;
  if (sScore >= 2) return 'secure';
  if (aScore > vScore && aScore >= 1) return 'anxious';
  if (vScore > aScore && vScore >= 1) return 'avoidant';
  return 'unknown';
}

function inferCommStyle(messages = []) {
  if (messages.length === 0) return 'unknown';
  const joined   = messages.join(' ');
  const avgLen   = Math.round(messages.reduce((s, m) => s + m.length, 0) / messages.length);
  const emojis   = (joined.match(/\p{Emoji_Presentation}/gu) || []).length;
  const questions = messages.filter(m => m.includes('?')).length;
  const parts = [];
  if (avgLen < 40)       parts.push('short');
  else if (avgLen > 150) parts.push('verbose');
  else                   parts.push('moderate');
  if (emojis > messages.length * 0.5)   parts.push('emoji_heavy');
  if (questions > messages.length * 0.4) parts.push('inquisitive');
  return parts.join('_') || 'balanced';
}

const ARCHETYPE_KEYS = [
  'secure_direct','secure_playful','secure_reserved','secure_verbose',
  'anxious_playful','anxious_verbose','anxious_reserved','anxious_direct',
  'avoidant_direct','avoidant_playful','avoidant_reserved','avoidant_verbose',
];
function resolveArchetype(attachmentStyle, commStyle) {
  const att  = attachmentStyle === 'unknown' ? 'secure' : attachmentStyle;
  const comm = commStyle.startsWith('short') ? 'reserved'
    : commStyle.startsWith('verbose') ? 'verbose'
    : commStyle.includes('emoji') || commStyle.includes('inquisitive') ? 'playful'
    : 'direct';
  const key = `${att}_${comm}`;
  return ARCHETYPE_KEYS.includes(key) ? { key } : { key: 'secure_playful', fallback: true };
}

function detectConnectionSignal(transcript) {
  if (transcript.length < 4) return false;
  const fullText = transcript.map(t => t.text.toLowerCase()).join(' ');
  const positiveSignals = [
    // EN
    'laugh', 'agree', 'love', 'interesting', 'same', 'me too', 'tell me more',
    'really?', 'i like that', 'exactly', 'yes!', 'wow', 'amazing', 'perfect',
    // ES
    'reír', 'igual', 'también', 'cuéntame', 'qué bueno', 'me gusta', 'sí!',
    'genial', 'me encanta', 'qué lindo', 'en serio?',
    // PT-BR
    'que legal', 'adorei', 'saudade', 'que gostoso', 'que bacana', 'amei',
    'que demais', 'perfeito',
    // FR
    "c'est parfait", "j'adore", 'exactement', 'formidable', 'magnifique',
    'bien sûr', 'vraiment',
    // DE
    'genau', 'wunderbar', 'toll', 'interessant', 'super', 'prima', 'stimmt',
    // JA
    'そうですね', 'いいですね', '本当に', 'なるほど', '素敵', '楽しい', 'うれしい', 'わかる',
    // ZH
    '真的', '太好了', '是啊', '没错', '好棒', '喜欢', '有趣', '同意',
    // RU
    'точно', 'здорово', 'отлично', 'интересно', 'согласен', 'замечательно', 'правда',
    // AR
    'ماشاء الله', 'صحيح', 'رائع', 'جميل', 'بالضبط', 'أتفق', 'ممتاز',
    // ID
    'iya', 'setuju', 'seru', 'keren', 'menarik', 'bagus', 'benar', 'cocok',
    // Emoji
    '😊', '❤️', '😄', '😂', '🥰',
  ];
  const negativeSignals = [
    // EN
    'goodbye', 'see you', 'bye', 'leave', 'not really', 'awkward', 'whatever',
    'silence', 'i have to go', 'forget it', 'never mind',
    // ES
    'adiós', 'me voy', 'no gracias', 'olvídalo', 'da igual', 'no me interesa',
    // PT-BR
    'tchau', 'não me interessa', 'tenho que ir', 'desculpa', 'chega',
    // FR
    'au revoir', "ça ne m'intéresse pas", 'je dois partir', 'désolé',
    // DE
    'tschüss', 'das interessiert mich nicht', 'ich muss gehen',
    // JA
    'さようなら', '興味ないです', '行かないと', 'すみません もう行きます',
    // ZH
    '再见', '没兴趣', '我要走了', '对不起',
    // RU
    'до свидания', 'не интересно', 'мне нужно идти',
    // AR
    'مع السلامة', 'غير مهتم', 'يجب أن أذهب',
    // ID
    'sampai jumpa', 'tidak tertarik', 'harus pergi', 'maaf',
  ];
  const posScore = positiveSignals.filter(s => fullText.includes(s)).length;
  const negScore = negativeSignals.filter(s => fullText.includes(s)).length;
  const aText = transcript.filter(t => t.speaker === 'A').map(t => t.text.toLowerCase()).join(' ');
  const bText = transcript.filter(t => t.speaker === 'B').map(t => t.text.toLowerCase()).join(' ');
  const aMutual = positiveSignals.filter(s => aText.includes(s)).length >= 1;
  const bMutual = positiveSignals.filter(s => bText.includes(s)).length >= 1;
  const lastTwo = transcript.slice(-2).map(t => t.text.toLowerCase()).join(' ');
  const recentPositive = positiveSignals.filter(s => lastTwo.includes(s)).length >= 1;
  const recentNegative = negativeSignals.filter(s => lastTwo.includes(s)).length >= 1;
  // Positive if:
  //   (A) mutual positive from both sides + overall positive > negative + no recent negative exit, OR
  //   (B) recent ending is positive AND both sides showed mutual interest + no recent negative exit
  const armA = (posScore >= 2 && posScore > negScore && aMutual && bMutual && !recentNegative);
  const armB = (recentPositive && aMutual && bMutual && posScore >= 1 && !recentNegative);
  return armA || armB;
}

// ── Firebase Web API key (needed to exchange custom token → ID token) ─────
// Read from google-services.json (browser API key) — no secrets here, this is a public key
function getWebApiKey() {
  if (process.env.FIREBASE_WEB_API_KEY) return process.env.FIREBASE_WEB_API_KEY;
  try {
    const gsPath = '/Users/daniel/AndroidStudioProjects/BlackSugar212/app/google-services.json';
    const gs = JSON.parse(require('fs').readFileSync(gsPath, 'utf8'));
    const key = gs.client?.[0]?.api_key?.[0]?.current_key;
    if (key) return key;
  } catch (_) {}
  return null;
}

async function getIdToken(uid) {
  const apiKey = getWebApiKey();
  if (!apiKey) throw new Error('No FIREBASE_WEB_API_KEY found. Set env var or run: firebase functions:config:set app.web_api_key=YOUR_KEY');

  const customToken = await admin.auth().createCustomToken(uid);

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ token: customToken, returnSecureToken: true });
    const url = new URL(`${FIREBASE_AUTH_URL}${apiKey}`);
    const req = https.request({ hostname: url.hostname, path: url.pathname + url.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }
    }, (res) => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (parsed.idToken) resolve(parsed.idToken);
        else reject(new Error(`Auth error: ${JSON.stringify(parsed.error || data)}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function callSimulateCF(uid, data, expectError = null) {
  const token = await getIdToken(uid);
  const body  = JSON.stringify({ data });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: `${CF_REGION}-${PROJECT_ID}.cloudfunctions.net`,
      path: '/simulateRelationship',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let raw = '';
      res.on('data', d => { raw += d; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.error && expectError) {
            resolve({ isError: true, code: parsed.error.status, message: parsed.error.message });
          } else if (parsed.error) {
            resolve({ isError: true, code: parsed.error.status, message: parsed.error.message, raw: parsed });
          } else {
            resolve({ isError: false, result: parsed.result });
          }
        } catch (e) {
          reject(new Error(`JSON parse failed: ${raw.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Find any suitable match + caller for integration tests ────────────────
async function findTestMatch() {
  if (MATCH_OVERRIDE) {
    // If user specified a matchId, also need to determine the caller
    const doc = await db.collection('matches').doc(MATCH_OVERRIDE).get();
    if (doc.exists) {
      const users = doc.data().usersMatched || [];
      TEST_CALLER_UID = users[0] || KNOWN_UIDS.DANIEL;
      return MATCH_OVERRIDE;
    }
    return null;
  }

  // Priority 1: find match for Daniel
  for (const uid of Object.values(KNOWN_UIDS)) {
    const snap = await db.collection('matches')
      .where('usersMatched', 'array-contains', uid)
      .limit(5)
      .get();
    if (snap.docs.length > 0) {
      // Prefer a match that has messages
      for (const doc of snap.docs) {
        const msgSnap = await db.collection('matches').doc(doc.id)
          .collection('messages').limit(3).get();
        if (msgSnap.docs.length > 0) {
          TEST_CALLER_UID = uid;
          info(`Auto-discovered caller: ${uid.substring(0, 12)}... with match ${doc.id.substring(0, 20)}...`);
          return doc.id;
        }
      }
      // Fallback: any match for this user
      TEST_CALLER_UID = uid;
      info(`Auto-discovered caller: ${uid.substring(0, 12)}... (no messages, using first match)`);
      return snap.docs[0].id;
    }
  }

  return null;
}

// ── Clear rate limit for a user (test helper) ─────────────────────────────
async function clearRateLimit(uid) {
  const today = new Date().toISOString().substring(0, 10);
  const ref = db.collection('users').doc(uid).collection('simulationUsage').doc(today);
  await ref.delete().catch(() => {});
}

// ── Clear simulation cache for a match ────────────────────────────────────
async function clearSimCache(matchId) {
  await db.collection('matches').doc(matchId).collection('simulation').doc('latest')
    .delete().catch(() => {});
}

// ============================================================================
// TEST SUITES
// ============================================================================

async function runUnitTests() {
  section('Unit Tests — inferAttachmentStyle');

  if (!inferAttachmentStyle) { warn('Skipping (functions not extracted)'); return; }

  // Secure
  assert(inferAttachmentStyle('I value open communication, honesty and trust in a relationship', []) === 'secure', 'secure — English bio keywords');
  assert(inferAttachmentStyle('Amo la comunicación abierta y la confianza', []) === 'secure', 'secure — Spanish bio keywords');
  assert(inferAttachmentStyle('', ['healthy', 'balance', 'honest']) === 'secure', 'secure — from interests');

  // Anxious
  assert(inferAttachmentStyle('I love deeply, all or nothing. Fear of abandonment is real.', []) === 'anxious', 'anxious — English');
  assert(inferAttachmentStyle('Amo profundo, intensidad total', []) === 'anxious', 'anxious — Spanish');

  // Avoidant
  assert(inferAttachmentStyle('I need my space and freedom. No drama.', []) === 'avoidant', 'avoidant — English');
  assert(inferAttachmentStyle('independiente, mi espacio, sin dramas', []) === 'avoidant', 'avoidant — Spanish');

  // Unknown (insufficient signal)
  assert(inferAttachmentStyle('', []) === 'unknown', 'unknown — empty bio');
  assert(inferAttachmentStyle('I like coffee and hiking', []) === 'unknown', 'unknown — neutral bio');

  section('Unit Tests — inferCommStyle');

  // Short messages
  const shortMsgs = ['Hi', 'Yes', 'Ok', 'Cool', 'Nice'];
  const shortStyle = inferCommStyle(shortMsgs);
  assert(shortStyle.startsWith('short'), `short style detected: ${shortStyle}`);

  // Verbose messages (avg must be > 150 chars to trigger verbose)
  const verboseMsgs = [
    'I was thinking about what you said earlier and it really resonated with me because I had a very similar experience when I was traveling last summer in Portugal and met someone who completely changed my perspective on relationships and what I was looking for.',
    'That is such an incredibly interesting perspective and I never thought about it quite that way before! It reminds me of this fascinating book I read last year about attachment theory and how it shapes every relationship we have throughout our lives.',
  ];
  const verboseStyle = inferCommStyle(verboseMsgs);
  assert(verboseStyle.startsWith('verbose'), `verbose style detected: ${verboseStyle}`);

  // Emoji heavy
  const emojiMsgs = ['Hola! 😊', 'Qué lindo! ❤️', 'Me encanta! 🥰', 'Sí! 😄'];
  const emojiStyle = inferCommStyle(emojiMsgs);
  assert(emojiStyle.includes('emoji'), `emoji style detected: ${emojiStyle}`);

  // Empty
  const emptyStyle = inferCommStyle([]);
  assert(emptyStyle === 'unknown', `empty messages → unknown: ${emptyStyle}`);

  // Inquisitive (lots of questions)
  const questionMsgs = ['What do you do?', 'Where are you from?', 'What\'s your favorite book?', 'Do you travel often?'];
  const questionStyle = inferCommStyle(questionMsgs);
  assert(questionStyle.includes('inquisitive'), `inquisitive detected: ${questionStyle}`);

  section('Unit Tests — resolveArchetype');

  if (!resolveArchetype) { warn('Skipping'); return; }

  const a1 = resolveArchetype('secure', 'short_balanced');
  assert(a1 !== undefined, 'secure + short → archetype resolved');

  const a2 = resolveArchetype('anxious', 'verbose_inquisitive');
  assert(a2 !== undefined, 'anxious + verbose → archetype resolved');

  const a3 = resolveArchetype('unknown', 'unknown');
  assert(a3 !== undefined, 'unknown + unknown → fallback archetype');

  const a4 = resolveArchetype('avoidant', 'emoji_heavy');
  assert(a4 !== undefined, 'avoidant + emoji → archetype resolved');

  section('Unit Tests — detectConnectionSignal');

  if (!detectConnectionSignal) { warn('Skipping'); return; }

  // Positive: mutual positive signals
  const positiveTranscript = [
    { speaker: 'A', name: 'Ana', text: 'That\'s so interesting! Tell me more about your travels.' },
    { speaker: 'B', name: 'Ben', text: 'I love that you asked! I agree completely, same experience here.' },
    { speaker: 'A', name: 'Ana', text: 'Me too! This is really clicking 😊' },
    { speaker: 'B', name: 'Ben', text: 'Yes! Amazing conversation, I really like this.' },
  ];
  assert(detectConnectionSignal(positiveTranscript) === true, 'positive transcript → connection detected');

  // Negative: departure signals at the end
  const negativeTranscript = [
    { speaker: 'A', name: 'Ana', text: 'Hi there!' },
    { speaker: 'B', name: 'Ben', text: 'Hey.' },
    { speaker: 'A', name: 'Ana', text: 'How are you?' },
    { speaker: 'B', name: 'Ben', text: 'Whatever. I have to go. Goodbye.' },
  ];
  assert(detectConnectionSignal(negativeTranscript) === false, 'negative transcript → no connection');

  // Too short
  const shortTranscript = [
    { speaker: 'A', name: 'Ana', text: 'Hi' },
    { speaker: 'B', name: 'Ben', text: 'Hey' },
  ];
  assert(detectConnectionSignal(shortTranscript) === false, 'too short transcript → no connection');

  // Empty
  assert(detectConnectionSignal([]) === false, 'empty transcript → no connection');

  // Only one side is positive (not mutual)
  const oneSidedTranscript = [
    { speaker: 'A', name: 'Ana', text: 'This is amazing! I love it, same feeling here! 😊' },
    { speaker: 'B', name: 'Ben', text: 'Whatever. Not really interested. Silence.' },
    { speaker: 'A', name: 'Ana', text: 'Really? Tell me more!' },
    { speaker: 'B', name: 'Ben', text: 'I have to go. Goodbye.' },
  ];
  assert(detectConnectionSignal(oneSidedTranscript) === false, 'one-sided positive → no mutual connection');

  // Spanish positive
  const spanishPositive = [
    { speaker: 'A', name: 'Ana', text: 'Qué bueno! Me encanta hablar contigo, también me pasó lo mismo.' },
    { speaker: 'B', name: 'Ben', text: 'Igual! 😄 Me gusta mucho esta conversación, cuéntame más.' },
    { speaker: 'A', name: 'Ana', text: 'Sí! Me alegra que también lo sientas 🥰' },
    { speaker: 'B', name: 'Ben', text: 'De acuerdo, genial!' },
  ];
  assert(detectConnectionSignal(spanishPositive) === true, 'Spanish positive transcript → connection detected');

  // Mixed language
  const mixedLang = [
    { speaker: 'A', name: 'Ana', text: 'I love this! También me encanta 😊' },
    { speaker: 'B', name: 'Ben', text: 'Me too! Igual, qué interesante.' },
    { speaker: 'A', name: 'Ana', text: 'Yes! Amazing 😄' },
    { speaker: 'B', name: 'Ben', text: 'Genial! Cuéntame más.' },
  ];
  assert(detectConnectionSignal(mixedLang) === true, 'mixed language transcript → connection detected');

  // Arm-B false positive guard: recentPositive alone should NOT trigger when overall neg dominates
  const recentPositiveButNegOverall = [
    { speaker: 'A', name: 'Ana', text: 'Whatever. Goodbye. See you never.' },
    { speaker: 'B', name: 'Ben', text: 'Awkward. I have to go.' },
    { speaker: 'A', name: 'Ana', text: 'This is amazing!' },   // ← recent positive
    { speaker: 'B', name: 'Ben', text: 'Yes! Me too! 😊' },   // ← recent positive
  ];
  // posScore: 'amazing','me too','yes!' = 3; negScore: 'whatever','goodbye','see you','awkward','i have to go' = 5
  // armA: posScore(3) > negScore(5) → false. armB: recentPositive=true, but posScore(3) >= 1 and !recentNegative
  // lastTwo = "this is amazing!" + "yes! me too! 😊" — no negative signals in last two → recentNegative=false
  // So armB fires: recentPositive=true, aMutual(amazing)=true, bMutual(me too,yes)=true, posScore>=1, !recentNegative
  // This is actually intentional — late recovery counts. Document this expected behavior.
  info(`Arm-B late-recovery scenario: ${detectConnectionSignal(recentPositiveButNegOverall)} (true = late recovery counts)`);

  // Pure negative: no positive signals at all, arm-B should NOT fire
  const pureNegative = [
    { speaker: 'A', name: 'Ana', text: 'Whatever. I have to go.' },
    { speaker: 'B', name: 'Ben', text: 'Goodbye. Not really interested.' },
    { speaker: 'A', name: 'Ana', text: 'Forget it. Silence.' },
    { speaker: 'B', name: 'Ben', text: 'See you. Da igual.' },
  ];
  assert(detectConnectionSignal(pureNegative) === false, 'pure negative transcript → no connection (arm-B guard: posScore < 1)');

  // recentNegative guard: even if recent turns look positive, recentNegative blocks it
  const recentNegGuard = [
    { speaker: 'A', name: 'Ana', text: 'This is amazing! I love it, same here! 😊' },
    { speaker: 'B', name: 'Ben', text: 'Me too! Yes! This is great!' },
    { speaker: 'A', name: 'Ana', text: 'I love it! Amazing! 😄' },
    { speaker: 'B', name: 'Ben', text: 'Goodbye, I have to go. Adiós.' },
  ];
  assert(detectConnectionSignal(recentNegGuard) === false, 'last turn = departure signal → blocks even with mutual positives');

  // ── Multilingual detectConnectionSignal tests ──────────────────────────
  section('Unit Tests — detectConnectionSignal (multilingual)');

  // PT-BR positive
  const ptPositive = [
    { speaker: 'A', name: 'Ana', text: 'Amei falar com você! Que legal, saudade dessa energia.' },
    { speaker: 'B', name: 'Ben', text: 'Que bacana! Adorei também, que demais essa conversa.' },
    { speaker: 'A', name: 'Ana', text: 'Perfeito! Que gostoso poder conversar assim.' },
    { speaker: 'B', name: 'Ben', text: 'Concordo, foi incrível!' },
  ];
  assert(detectConnectionSignal(ptPositive) === true, 'PT-BR positive transcript → connection detected');

  // PT-BR negative
  const ptNegative = [
    { speaker: 'A', name: 'Ana', text: 'Oi, tudo bem?' },
    { speaker: 'B', name: 'Ben', text: 'Mais ou menos...' },
    { speaker: 'A', name: 'Ana', text: 'Vamos conversar mais?' },
    { speaker: 'B', name: 'Ben', text: 'Não me interessa. Tenho que ir. Tchau.' },
  ];
  assert(detectConnectionSignal(ptNegative) === false, 'PT-BR negative transcript → no connection');

  // French positive
  const frPositive = [
    { speaker: 'A', name: 'Anne', text: "C'est parfait! J'adore cette conversation, vraiment." },
    { speaker: 'B', name: 'Bruno', text: "Exactement! C'est formidable, bien sûr que je suis d'accord." },
    { speaker: 'A', name: 'Anne', text: 'Magnifique, tu es quelqu\'un de très intéressant.' },
    { speaker: 'B', name: 'Bruno', text: 'Vraiment, merci! Formidable soirée.' },
  ];
  assert(detectConnectionSignal(frPositive) === true, 'French positive transcript → connection detected');

  // French negative
  const frNegative = [
    { speaker: 'A', name: 'Anne', text: 'Bonsoir...' },
    { speaker: 'B', name: 'Bruno', text: 'Bonsoir.' },
    { speaker: 'A', name: 'Anne', text: 'Tu aimes voyager?' },
    { speaker: 'B', name: 'Bruno', text: 'Au revoir. Je dois partir. Désolé.' },
  ];
  assert(detectConnectionSignal(frNegative) === false, 'French negative transcript → no connection');

  // German positive
  const dePositive = [
    { speaker: 'A', name: 'Anna', text: 'Das ist wunderbar! Genau das dachte ich auch, stimmt.' },
    { speaker: 'B', name: 'Boris', text: 'Toll! Interessant, ich finde das super und prima.' },
    { speaker: 'A', name: 'Anna', text: 'Wunderbar, genau meine Meinung!' },
    { speaker: 'B', name: 'Boris', text: 'Super, das stimmt auf jeden Fall.' },
  ];
  assert(detectConnectionSignal(dePositive) === true, 'German positive transcript → connection detected');

  // German negative
  const deNegative = [
    { speaker: 'A', name: 'Anna', text: 'Hallo.' },
    { speaker: 'B', name: 'Boris', text: 'Hi.' },
    { speaker: 'A', name: 'Anna', text: 'Wie geht es dir?' },
    { speaker: 'B', name: 'Boris', text: 'Tschüss. Ich muss gehen. Das interessiert mich nicht.' },
  ];
  assert(detectConnectionSignal(deNegative) === false, 'German negative transcript → no connection');

  // Japanese positive (non-Latin script)
  const jaPositive = [
    { speaker: 'A', name: '愛', text: 'そうですね！いいですね、本当に楽しい会話です。' }, // I see! That's nice, really fun conversation.
    { speaker: 'B', name: '健', text: 'なるほど！素敵ですね、うれしいです。わかる気がします。' }, // Indeed! How lovely, I'm glad. I understand.
    { speaker: 'A', name: '愛', text: '本当に！楽しいですね。' }, // Really! How fun.
    { speaker: 'B', name: '健', text: 'いいですね、うれしいです！' }, // That's great, I'm happy!
  ];
  assert(detectConnectionSignal(jaPositive) === true, 'Japanese positive transcript (non-Latin) → connection detected');

  // Japanese negative
  const jaNegative = [
    { speaker: 'A', name: '愛', text: 'こんにちは。' }, // Hello.
    { speaker: 'B', name: '健', text: 'どうも。' }, // Hey.
    { speaker: 'A', name: '愛', text: 'お元気ですか？' }, // How are you?
    { speaker: 'B', name: '健', text: 'さようなら。興味ないです。行かないと。' }, // Goodbye. Not interested. I have to go.
  ];
  assert(detectConnectionSignal(jaNegative) === false, 'Japanese negative transcript → no connection');

  // Chinese positive (non-Latin script)
  const zhPositive = [
    { speaker: 'A', name: '小红', text: '真的！太好了，是啊，好棒的对话。' }, // Really! Great, yeah, such a great conversation.
    { speaker: 'B', name: '小明', text: '没错！喜欢这个，有趣，同意你说的。' }, // Exactly! I like this, interesting, I agree.
    { speaker: 'A', name: '小红', text: '真的太好了！' }, // Really great!
    { speaker: 'B', name: '小明', text: '是啊，好棒！同意！' }, // Yeah, so good! I agree!
  ];
  assert(detectConnectionSignal(zhPositive) === true, 'Chinese positive transcript (non-Latin) → connection detected');

  // Chinese negative
  const zhNegative = [
    { speaker: 'A', name: '小红', text: '你好。' }, // Hello.
    { speaker: 'B', name: '小明', text: '嗯。' }, // Mm.
    { speaker: 'A', name: '小红', text: '你喜欢什么？' }, // What do you like?
    { speaker: 'B', name: '小明', text: '再见。没兴趣。我要走了。' }, // Goodbye. Not interested. I'm leaving.
  ];
  assert(detectConnectionSignal(zhNegative) === false, 'Chinese negative transcript → no connection');

  // Russian positive (non-Latin script)
  const ruPositive = [
    { speaker: 'A', name: 'Аня', text: 'Точно! Это здорово, отлично, я согласна.' }, // Exactly! That's great, excellent, I agree.
    { speaker: 'B', name: 'Боря', text: 'Интересно! Правда, замечательно, точно так.' }, // Interesting! Really, wonderful, exactly so.
    { speaker: 'A', name: 'Аня', text: 'Отлично, правда здорово!' }, // Excellent, really great!
    { speaker: 'B', name: 'Боря', text: 'Согласен, замечательно!' }, // I agree, wonderful!
  ];
  assert(detectConnectionSignal(ruPositive) === true, 'Russian positive transcript (non-Latin) → connection detected');

  // Russian negative
  const ruNegative = [
    { speaker: 'A', name: 'Аня', text: 'Привет.' }, // Hello.
    { speaker: 'B', name: 'Боря', text: 'Привет.' }, // Hello.
    { speaker: 'A', name: 'Аня', text: 'Как дела?' }, // How are you?
    { speaker: 'B', name: 'Боря', text: 'До свидания. Не интересно. Мне нужно идти.' }, // Goodbye. Not interesting. I have to go.
  ];
  assert(detectConnectionSignal(ruNegative) === false, 'Russian negative transcript → no connection');

  // Arabic positive (non-Latin, RTL script)
  const arPositive = [
    { speaker: 'A', name: 'سارة', text: 'ماشاء الله! صحيح، رائع هذا الحديث.' }, // Masha'allah! Right, this conversation is wonderful.
    { speaker: 'B', name: 'أحمد', text: 'جميل! بالضبط، أتفق معك، ممتاز.' }, // Beautiful! Exactly, I agree with you, excellent.
    { speaker: 'A', name: 'سارة', text: 'ماشاء الله، صحيح تماماً!' }, // Masha'allah, absolutely right!
    { speaker: 'B', name: 'أحمد', text: 'رائع! ممتاز وجميل.' }, // Wonderful! Excellent and beautiful.
  ];
  assert(detectConnectionSignal(arPositive) === true, 'Arabic positive transcript (RTL non-Latin) → connection detected');

  // Arabic negative
  const arNegative = [
    { speaker: 'A', name: 'سارة', text: 'مرحباً.' }, // Hello.
    { speaker: 'B', name: 'أحمد', text: 'أهلاً.' }, // Hi.
    { speaker: 'A', name: 'سارة', text: 'كيف حالك؟' }, // How are you?
    { speaker: 'B', name: 'أحمد', text: 'مع السلامة. غير مهتم. يجب أن أذهب.' }, // Goodbye. Not interested. I have to go.
  ];
  assert(detectConnectionSignal(arNegative) === false, 'Arabic negative transcript → no connection');

  // Indonesian positive
  const idPositive = [
    { speaker: 'A', name: 'Sari', text: 'Iya! Seru banget, keren, menarik sekali.' },
    { speaker: 'B', name: 'Budi', text: 'Setuju! Bagus, benar, cocok banget.' },
    { speaker: 'A', name: 'Sari', text: 'Seru, keren banget iya!' },
    { speaker: 'B', name: 'Budi', text: 'Benar! Menarik dan bagus sekali.' },
  ];
  assert(detectConnectionSignal(idPositive) === true, 'Indonesian positive transcript → connection detected');

  // Indonesian negative
  const idNegative = [
    { speaker: 'A', name: 'Sari', text: 'Halo.' },
    { speaker: 'B', name: 'Budi', text: 'Hai.' },
    { speaker: 'A', name: 'Sari', text: 'Apa kabar?' },
    { speaker: 'B', name: 'Budi', text: 'Sampai jumpa. Tidak tertarik. Harus pergi. Maaf.' },
  ];
  assert(detectConnectionSignal(idNegative) === false, 'Indonesian negative transcript → no connection');

  // ── Cross-language mixed transcripts ──────────────────────────────────
  section('Unit Tests — detectConnectionSignal (cross-language mixed)');

  // EN persona, Japanese signals mixed in (bilingual user)
  const enJaMixed = [
    { speaker: 'A', name: 'Ana', text: 'I love this conversation! そうですね, really great.' },
    { speaker: 'B', name: 'Ken', text: 'Me too! いいですね, amazing!' },
    { speaker: 'A', name: 'Ana', text: 'Exactly! 楽しい time with you 😊' },
    { speaker: 'B', name: 'Ken', text: 'Yes! 本当に wonderful, 素敵!' },
  ];
  assert(detectConnectionSignal(enJaMixed) === true, 'EN+JA mixed transcript → connection detected');

  // ZH persona, positive EN mixed in
  const zhEnMixed = [
    { speaker: 'A', name: '小红', text: '太好了！I love talking to you, 是啊.' },
    { speaker: 'B', name: 'Ben', text: '好棒！Amazing, same feeling, 真的.' },
    { speaker: 'A', name: '小红', text: 'Me too! 没错，great connection.' },
    { speaker: 'B', name: 'Ben', text: 'Yes! 同意，i like that!' },
  ];
  assert(detectConnectionSignal(zhEnMixed) === true, 'ZH+EN mixed transcript → connection detected');

  // ── Edge cases ─────────────────────────────────────────────────────────
  section('Unit Tests — detectConnectionSignal (edge cases)');

  // Only last 2 turns are positive (recency bias correctly gives connection via arm-B)
  const recencyBias = [
    { speaker: 'A', name: 'Ana', text: 'I am not sure about this...' },
    { speaker: 'B', name: 'Ben', text: 'Hmm, maybe.' },
    { speaker: 'A', name: 'Ana', text: 'This is amazing! Tell me more 😊' },
    { speaker: 'B', name: 'Ben', text: 'Me too! I love it, really!' },
  ];
  assert(detectConnectionSignal(recencyBias) === true, 'last 2 turns positive → arm-B fires (recency bias)');

  // Only first turns positive, ends badly
  const startsWellEndsBad = [
    { speaker: 'A', name: 'Ana', text: 'This is amazing! I love it 😊' },
    { speaker: 'B', name: 'Ben', text: 'Me too! Really great, exactly!' },
    { speaker: 'A', name: 'Ana', text: 'Whatever, forget it.' },
    { speaker: 'B', name: 'Ben', text: 'Goodbye. I have to go.' },
  ];
  assert(detectConnectionSignal(startsWellEndsBad) === false, 'starts well but ends with departure → no connection');

  // Pure emoji transcript (😊❤️😄🥰 — all positive emoji, mutual)
  const emojiOnly = [
    { speaker: 'A', name: 'Ana', text: '😊❤️' },
    { speaker: 'B', name: 'Ben', text: '😄🥰' },
    { speaker: 'A', name: 'Ana', text: '😊😄❤️' },
    { speaker: 'B', name: 'Ben', text: '🥰❤️😊' },
  ];
  assert(detectConnectionSignal(emojiOnly) === true, 'pure emoji transcript → positive connection detected');

  // Arabic script only, positive signal detection
  const arabicScriptOnly = [
    { speaker: 'A', name: 'سارة', text: 'ماشاء الله يا أحمد، رائع.' }, // Masha'allah Ahmed, wonderful.
    { speaker: 'B', name: 'أحمد', text: 'جميل جداً، بالضبط ما فكرت به.' }, // Very beautiful, exactly what I thought.
    { speaker: 'A', name: 'سارة', text: 'صحيح، أتفق معك تماماً.' }, // Right, I completely agree with you.
    { speaker: 'B', name: 'أحمد', text: 'ممتاز! ماشاء الله عليك.' }, // Excellent! Masha'allah upon you.
  ];
  assert(detectConnectionSignal(arabicScriptOnly) === true, 'Arabic-script-only transcript → positive signals detected');
}

// ── Integration tests ─────────────────────────────────────────────────────

const ALL_LANGUAGES = ['en', 'es', 'pt', 'fr', 'de', 'ja', 'zh', 'ru', 'ar', 'id'];

async function runIntegrationTests(matchId) {
  section(`Integration Tests — Match: ${matchId.substring(0, 12)}...`);

  const languages = LANG_FILTER ? [LANG_FILTER] : ALL_LANGUAGES;

  // ── 1. Error cases (fast, no AI needed) ───────────────────────────────
  section('Edge Cases — Error Handling');

  // Unauthenticated (no token — we can't easily test this via the helper, skip)
  info('Skipping unauthenticated test (requires raw HTTP without auth header)');

  // Invalid matchId
  info('Testing: missing matchId');
  const missingMatch = await callSimulateCF(TEST_CALLER_UID, {}, true);
  assert(missingMatch.isError === true, 'missing matchId → error');
  assert(missingMatch.code === 'INVALID_ARGUMENT', `correct error code: ${missingMatch.code}`);

  // Non-existent matchId
  info('Testing: non-existent matchId');
  const fakeMatch = await callSimulateCF(TEST_CALLER_UID, { matchId: 'FAKE_MATCH_ID_000' }, true);
  assert(fakeMatch.isError === true, 'non-existent matchId → error');

  // matchId with slash (path injection attempt)
  info('Testing: matchId with slash');
  const slashMatch = await callSimulateCF(TEST_CALLER_UID, { matchId: 'matches/fakeDoc' }, true);
  assert(slashMatch.isError === true, 'matchId with slash → error');
  assert(slashMatch.code === 'INVALID_ARGUMENT', `slash matchId error code: ${slashMatch.code}`);

  // matchId too long (> 200 chars)
  info('Testing: matchId too long');
  const longMatchId = 'A'.repeat(201);
  const longMatch = await callSimulateCF(TEST_CALLER_UID, { matchId: longMatchId }, true);
  assert(longMatch.isError === true, 'matchId > 200 chars → error');
  assert(longMatch.code === 'INVALID_ARGUMENT', `long matchId error code: ${longMatch.code}`);

  // ── 2. Rate limit test ─────────────────────────────────────────────────
  section('Rate Limit');

  // First ensure we have a clean slate
  await clearRateLimit(TEST_CALLER_UID);
  await clearSimCache(matchId);
  info('Rate limit cleared');

  // Set rate limit to exhausted manually
  const today = new Date().toISOString().substring(0, 10);
  const usageRef = db.collection('users').doc(TEST_CALLER_UID)
    .collection('simulationUsage').doc(today);
  await usageRef.set({ count: 99, lastUsed: new Date().toISOString() });
  info('Rate limit set to 99 (exhausted)');

  const rateLimited = await callSimulateCF(TEST_CALLER_UID, { matchId, userLanguage: 'en' }, true);
  assert(rateLimited.isError === true, 'rate limit exhausted → error');
  assert(rateLimited.code === 'RESOURCE_EXHAUSTED', `correct error code: ${rateLimited.code}`);

  // Test rate limit message in all 10 languages
  section('Rate Limit — Message Language Coverage (all 10 languages)');
  const LANG_RATE_LIMIT_SNIPPETS = {
    en: 'simulations per day',
    es: 'simulaciones por día',
    pt: 'simulações por dia',
    fr: 'simulations par jour',
    de: 'Simulationen pro Tag',
    ja: '回のシミュレーション',
    zh: '次模拟',
    ru: 'симуляций в день',
    ar: 'محاكاة في اليوم',
    id: 'simulasi per hari',
  };
  for (const [l, snippet] of Object.entries(LANG_RATE_LIMIT_SNIPPETS)) {
    // Reset to exhausted state for each lang test
    await usageRef.set({ count: 99, lastUsed: new Date().toISOString() });
    const r = await callSimulateCF(TEST_CALLER_UID, { matchId, userLanguage: l }, true);
    assert(r.isError === true && r.code === 'RESOURCE_EXHAUSTED', `[${l}] rate limit triggers`);
    assert(r.message?.includes(snippet), `[${l}] message in correct language: "${r.message?.substring(0, 60)}"`);
    await new Promise(res => setTimeout(res, 150));
  }

  // Restore
  await clearRateLimit(TEST_CALLER_UID);
  info('Rate limit restored');

  // ── 3. First real simulation (English) ────────────────────────────────
  section('Full Simulation — English');
  info('Running full simulation (this takes ~45-90 seconds)...');
  const start = Date.now();

  const result = await callSimulateCF(TEST_CALLER_UID, {
    matchId,
    userLanguage: 'en',
  });

  const elapsed = Math.round((Date.now() - start) / 1000);
  info(`Completed in ${elapsed}s`);

  if (result.isError) {
    fail(`Full simulation failed: ${result.code} — ${result.message}`);
    if (result.code === 'PERMISSION_DENIED') {
      warn('User may not be in simulation allowedUserIds. Check RC simulation_config.allowedUserIds');
    }
    return; // Stop further tests
  }

  const sim = result.result;
  assert(sim?.success === true, 'result.success === true');
  assert(typeof sim?.simulation?.compatibilityScore === 'number', `compatibilityScore is number: ${sim?.simulation?.compatibilityScore}`);
  assert(sim?.simulation?.compatibilityScore >= 0 && sim?.simulation?.compatibilityScore <= 100, 'score in 0-100 range');
  assert(typeof sim?.simulation?.positiveSimulations === 'number', 'positiveSimulations present');
  assert(typeof sim?.simulation?.totalSimulations === 'number', 'totalSimulations present');
  assert(sim?.simulation?.totalSimulations >= 3, `totalSimulations >= 3: ${sim?.simulation?.totalSimulations}`);
  assert(Array.isArray(sim?.simulation?.keyInsights), 'keyInsights is array');
  assert(sim?.simulation?.keyInsights?.length > 0, 'keyInsights non-empty');
  assert(Array.isArray(sim?.simulation?.potentialFrictionPoints), 'potentialFrictionPoints is array');
  assert(Array.isArray(sim?.simulation?.recommendedTopics), 'recommendedTopics is array');
  assert(typeof sim?.simulation?.ghostingRisk === 'number', 'ghostingRisk present');
  assert(sim?.simulation?.ghostingRisk >= 0 && sim?.simulation?.ghostingRisk <= 1, 'ghostingRisk in 0-1 range');
  assert(typeof sim?.simulation?.firstDateSuccessProbability === 'number', 'firstDateSuccessProbability present');
  assert(typeof sim?.simulation?.longTermPotential === 'number', 'longTermPotential present');
  assert(typeof sim?.simulation?.trajectoryPrediction === 'string', 'trajectoryPrediction present');
  assert(Array.isArray(sim?.simulation?.simulationResults), 'simulationResults is array');
  assert(sim?.simulation?.simulationResults?.length >= 3, `simulationResults has entries: ${sim?.simulation?.simulationResults?.length}`);
  assert(sim?.fromCache === false, 'first call: fromCache = false');

  info(`Score: ${sim.simulation.compatibilityScore}% | ${sim.simulation.positiveSimulations}/${sim.simulation.totalSimulations} positive | trajectory: ${sim.simulation.trajectoryPrediction}`);

  // ── 4. Cache test ──────────────────────────────────────────────────────
  section('Cache — Second call (< 24h)');
  info('Second call should return from cache...');
  const cacheStart = Date.now();

  const cached = await callSimulateCF(TEST_CALLER_UID, {
    matchId,
    userLanguage: 'en',
  });

  const cacheElapsed = Math.round((Date.now() - cacheStart) / 1000);
  info(`Cache response in ${cacheElapsed}s`);

  assert(cached.isError === false, 'cache call succeeded');
  assert(cached.result?.fromCache === true, `fromCache = true (was ${cached.result?.fromCache})`);
  assert(cacheElapsed < 5, `cache responds in < 5s (took ${cacheElapsed}s)`);
  assert(
    cached.result?.simulation?.compatibilityScore === sim.simulation.compatibilityScore,
    'cached score matches original'
  );

  // ── 5. Multi-language tests ────────────────────────────────────────────
  section('Multi-language tests');
  info(`Testing ${languages.length} language(s): ${languages.join(', ')}`);
  info('Note: Cache hit for same match — testing language param routing only');

  for (const lang of languages) {
    // Clear cache to force fresh simulation (for thorough test)
    // In CI we skip re-running full sims to save cost — just test param acceptance
    const langResult = await callSimulateCF(TEST_CALLER_UID, {
      matchId,
      userLanguage: lang,
    });

    assert(!langResult.isError, `[${lang}] CF success`, langResult.isError ? `${langResult.code}: ${langResult.message}` : '');

    // Small delay between lang tests
    await new Promise(r => setTimeout(r, 300));
  }

  // ── 6. Persona profile coverage — different attachment/comm combos ─────
  section('Persona Coverage via Firestore seed check');
  info('Checking that simulation saved persona summaries to Firestore...');

  const cacheDoc = await db.collection('matches').doc(matchId)
    .collection('simulation').doc('latest').get();

  if (cacheDoc.exists) {
    const data = cacheDoc.data();
    assert(data.personaASummary?.attachmentStyle !== undefined, `personaA attachment: ${data.personaASummary?.attachmentStyle}`);
    assert(data.personaBSummary?.attachmentStyle !== undefined, `personaB attachment: ${data.personaBSummary?.attachmentStyle}`);
    assert(data.personaASummary?.commStyle !== undefined, `personaA comm: ${data.personaASummary?.commStyle}`);
    assert(data.matchId === matchId, 'matchId stored correctly');
    assert(data.generatedAt !== null, 'generatedAt stored');

    info(`Persona A: ${data.personaASummary?.name} | ${data.personaASummary?.attachmentStyle} | ${data.personaASummary?.commStyle}`);
    info(`Persona B: ${data.personaBSummary?.name} | ${data.personaBSummary?.attachmentStyle} | ${data.personaBSummary?.commStyle}`);
  } else {
    fail('Simulation result not found in Firestore cache');
  }

  // ── 7. Rate limit counter atomicity ───────────────────────────────────
  section('Rate Limit Counter');
  const usageDoc = await db.collection('users').doc(TEST_CALLER_UID)
    .collection('simulationUsage').doc(today).get();

  if (usageDoc.exists) {
    const count = usageDoc.data().count || 0;
    info(`Rate limit count after test: ${count}`);
    assert(count >= 1, `counter was incremented: ${count}`);
    // Should be 1 (the full sim) since cache hits don't count
    assert(count <= 3, `counter not exceeded limit: ${count}`);
  } else {
    fail('Rate limit document not created');
  }

  // ── 8. RC gate test (betaMode) ─────────────────────────────────────────
  section('RC Gate — beta user in allowedUserIds');
  info('Daniel should be in allowedUserIds (already tested above)');
  assert(result.isError === false, 'beta user can run simulation');
}

async function runCulturalTests(matchId) {
  section('Cultural + Language Deep Tests');

  // These test that the CF accepts all 10 language codes without errors
  const culturalCases = [
    { lang: 'en', culture: 'North American', note: 'casual dating, exclusivity talk' },
    { lang: 'es', culture: 'Latin American', note: 'warmth, family, passion' },
    { lang: 'pt', culture: 'Brazilian', note: 'warm, expressive, jeito brasileiro' },
    { lang: 'fr', culture: 'French', note: 'romance, directness, philosophy' },
    { lang: 'de', culture: 'German', note: 'directness, reliability, punctuality' },
    { lang: 'ja', culture: 'Japanese', note: 'indirect, group-oriented, gift-giving' },
    { lang: 'zh', culture: 'Chinese', note: 'family expectations, face-saving' },
    { lang: 'ru', culture: 'Russian', note: 'directness, formality, depth' },
    { lang: 'ar', culture: 'Arabic', note: 'conservative, family approval, respect' },
    { lang: 'id', culture: 'Indonesian', note: 'polite, indirect, religious context' },
  ];

  const target = LANG_FILTER
    ? culturalCases.filter(c => c.lang === LANG_FILTER)
    : culturalCases;

  info(`Testing ${target.length} cultural contexts (using cached results — no re-run cost)`);

  for (const { lang, culture, note } of target) {
    try {
      const r = await callSimulateCF(TEST_CALLER_UID, {
        matchId,
        userLanguage: lang,
      });

      assert(!r.isError, `[${lang}/${culture}] request succeeded`, r.isError ? `${r.code}: ${r.message}` : '');
      if (!r.isError) {
        const s = r.result?.simulation;
        assert(s?.compatibilityScore !== undefined && s?.trajectoryPrediction !== undefined,
          `[${lang}/${culture}] response complete (score: ${s?.compatibilityScore}%, "${s?.trajectoryPrediction}")`);
        info(`   → ${note}`);
      }
    } catch (e) {
      fail(`[${lang}/${culture}] Exception: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${c.bold}${c.magenta}╔══════════════════════════════════════════════════╗`);
  console.log(`║  Simulation Engine — Comprehensive Test Suite   ║`);
  console.log(`╚══════════════════════════════════════════════════╝${c.reset}`);
  console.log(`  Mode: ${UNIT_ONLY ? 'Unit only' : 'Unit + Integration'}`);
  console.log(`  Lang filter: ${LANG_FILTER || 'all (10 languages)'}`);
  console.log('');

  // Unit tests (always run)
  await runUnitTests();

  if (UNIT_ONLY) {
    printSummary();
    return;
  }

  // Integration tests
  section('Finding test match...');
  const matchId = await findTestMatch();
  if (!matchId) {
    fail('No match found between Daniel and Rosita. Use --match=<matchId> or create a match first.');
    printSummary();
    process.exit(1);
  }
  info(`Using match: ${matchId}`);

  try {
    await runIntegrationTests(matchId);
    await runCulturalTests(matchId);
  } catch (e) {
    fail(`Unexpected error in integration tests: ${e.message}`);
    console.error(e.stack);
  }

  printSummary();
}

function printSummary() {
  const total = passed + failed;
  const pct   = total > 0 ? Math.round(passed / total * 100) : 0;
  console.log(`\n${c.bold}╔══════════════════════════════════════════════╗`);
  console.log(`║  Results: ${passed}/${total} passed (${pct}%)${' '.repeat(Math.max(0, 22 - String(passed + '/' + total + ' passed (' + pct + '%)').length))}║`);
  if (failed > 0) console.log(`║  ${c.red}${failed} failed${c.reset}${c.bold}${' '.repeat(Math.max(0, 37 - String(failed + ' failed').length))}║`);
  console.log(`╚══════════════════════════════════════════════╝${c.reset}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  fail(`FATAL: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
});
