#!/usr/bin/env node
/**
 * Live Language Probe — Post-Deploy Regression Gate
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Hits each critical callable CF with an UNAUTHENTICATED request in each
 * of the 10 supported languages and verifies the response is:
 *   1. HTTP 401 UNAUTHENTICATED (not 500 INTERNAL)
 *   2. Contains a localized auth_required message in the caller's language
 *
 * Why this exists — the bug this catches:
 *   Firebase v2 HttpsError uses plain codes ('unauthenticated',
 *   'invalid-argument', etc.) — NOT the legacy v1 `functions/*` prefix.
 *   A catch block that does `error.code.startsWith('functions/')` will
 *   silently wrap every HttpsError as INTERNAL, breaking localized errors.
 *
 *   Offline static-analysis tests CAN'T detect this because the string
 *   'HttpsError' is present in the source. Only a real HTTP invocation
 *   reveals the wrapping. This is our v1→v2 migration regression gate.
 *
 * Runs with no auth — no credentials or service accounts required. Just
 * plain HTTPS POST against the public Callable endpoints.
 *
 * Run:
 *   node test-live-lang-probe.js
 *
 * Exit code: 0 if all pass, 1 if any fail.
 */
'use strict';

const https = require('https');

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'black-sugar21';
const REGION = 'us-central1';

// CFs to probe. All must require auth as their first check. Any new
// user-facing Callable should be added here.
const CFS = [
  'dateCoachChat',
  'simulateMultiUniverse',
  'simulateSituation',
  'calculateAIChemistry',
  'generateSmartReply',
  'generateIcebreakers',
  'calculateSafetyScore',
  'searchEvents',
  'moderateMessage',
  'unmatchUser',
];

// Expected localized fragment per language in the auth_required message.
// Must match what's actually in shared.js ERROR_MESSAGES.auth_required.
const EXPECTED_FRAGMENTS = {
  en: 'sign in',
  es: 'iniciar sesión',
  pt: 'precisa entrar',
  fr: 'te connecter',
  de: 'anmelden',
  ja: 'サインイン',
  zh: '需要登录',
  ru: 'войти',
  ar: 'تسجيل',
  id: 'masuk',
};

const LANGS = Object.keys(EXPECTED_FRAGMENTS);

function call(fn, lang) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({data: {userLanguage: lang}});
    const req = https.request(`https://${REGION}-${PROJECT}.cloudfunctions.net/${fn}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Content-Length': payload.length},
      timeout: 10000,
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve({status: res.statusCode, body}));
    });
    req.on('error', (e) => resolve({status: 0, body: `ERROR: ${e.message}`}));
    req.on('timeout', () => { req.destroy(); resolve({status: 0, body: 'TIMEOUT'}); });
    req.write(payload);
    req.end();
  });
}

(async () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('LIVE LANG PROBE — post-deploy regression gate');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Project: ${PROJECT}`);
  console.log(`CFs:     ${CFS.length} × Langs: ${LANGS.length} = ${CFS.length * LANGS.length} probes\n`);

  let pass = 0;
  let fail = 0;
  const failures = [];

  for (const cf of CFS) {
    for (const lang of LANGS) {
      const r = await call(cf, lang);
      // Correct behavior: 401 UNAUTHENTICATED with localized message
      const isUnauth = r.status === 401;
      const hasLocalized = r.body.includes(EXPECTED_FRAGMENTS[lang]);
      const ok = isUnauth && hasLocalized;
      if (ok) {
        pass++;
      } else {
        fail++;
        failures.push(`${cf}[${lang}] status=${r.status} body=${r.body.substring(0, 140)}`);
      }
    }
  }

  console.log(`Total: ${pass + fail} | Passed: ${pass} | Failed: ${fail}\n`);
  if (failures.length > 0) {
    console.log('Failures:');
    failures.slice(0, 15).forEach((f) => console.log(`  ${f}`));
    if (failures.length > 15) console.log(`  ... and ${failures.length - 15} more`);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(fail === 0 ? 'ALL PROBES PASSED' : `${fail} PROBES FAILED`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  process.exit(fail > 0 ? 1 : 0);
})();
