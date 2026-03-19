#!/usr/bin/env node
/**
 * 🏥 Coach Health Monitor — Auto-detect, diagnose, fix & deploy
 * ==============================================================
 * Monitors dateCoachChat CF logs, detects known error patterns,
 * applies fixes if available, deploys, and tracks in Firestore + GA4.
 *
 * Usage:
 *   node scripts/coach-health-monitor.js                # Analyze last 30 min
 *   node scripts/coach-health-monitor.js --fix          # Analyze + auto-fix + deploy
 *   node scripts/coach-health-monitor.js --minutes=60   # Custom time window
 *   node scripts/coach-health-monitor.js --dry-run      # Preview fixes without deploying
 *
 * Tracking:
 *   - Firestore: coachAutoFixes/{docId} — every detected issue + action taken
 *   - GA4 Measurement Protocol (optional): set GA4_MEASUREMENT_ID + GA4_API_SECRET env vars
 */

const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// ─── Configuration ───────────────────────────────────────────
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CF_SOURCE = path.join(PROJECT_ROOT, 'functions', 'index.js');
const COACH_FUNCTIONS = ['dateCoachChat', 'getCoachHistory', 'deleteCoachMessage', 'resetCoachMessages', 'getRealtimeCoachTips'];
const AUTO_FIX = process.argv.includes('--fix');
const DRY_RUN = process.argv.includes('--dry-run');
const minutesArg = process.argv.find((a) => a.startsWith('--minutes='));
const MINUTES = minutesArg ? parseInt(minutesArg.split('=')[1], 10) : 30;

// ─── Firebase Init ───────────────────────────────────────────
const sa = require(path.join(__dirname, 'serviceAccountKey.json'));
if (!admin.apps.length) admin.initializeApp({credential: admin.credential.cert(sa)});
const db = admin.firestore();

// ─── Known Error Patterns ────────────────────────────────────
const ERROR_PATTERNS = [
  {
    id: 'PLACES_CIRCLE_FORMAT',
    severity: 'CRITICAL',
    regex: /Invalid JSON.*"circle".*location_restriction|"circle" at 'location_restriction'/,
    description: 'Google Places API rejects circle in locationRestriction (must use rectangle)',
    autoFix: {
      type: 'deploy',
      verify: () => {
        const code = fs.readFileSync(CF_SOURCE, 'utf8');
        const placesFunc = code.substring(code.indexOf('async function placesTextSearch'));
        return placesFunc.includes('rectangle:') && !placesFunc.includes('locationRestriction') || placesFunc.includes('rectangle:');
      },
      functions: ['dateCoachChat'],
    },
  },
  {
    id: 'GEMINI_RATE_LIMIT',
    severity: 'WARNING',
    regex: /429 Too Many Requests.*gemini/i,
    description: 'Gemini API rate limit (429) — too many requests per minute',
    autoFix: {type: 'none', recommendation: 'Wait for quota reset or upgrade Gemini API plan'},
  },
  {
    id: 'GEMINI_QUOTA_EXHAUSTED',
    severity: 'CRITICAL',
    regex: /Quota exceeded.*free_tier/i,
    description: 'Gemini free tier daily quota exhausted',
    autoFix: {type: 'none', recommendation: 'Upgrade to paid Gemini API plan (free tier limit: 20 RPD)'},
  },
  {
    id: 'PLACES_API_KEY_MISSING',
    severity: 'CRITICAL',
    regex: /GOOGLE_PLACES_API_KEY not configured/,
    description: 'Google Places API key not set in CF secrets',
    autoFix: {type: 'none', recommendation: 'Set GOOGLE_PLACES_API_KEY secret: firebase functions:secrets:set GOOGLE_PLACES_API_KEY'},
  },
  {
    id: 'GEMINI_API_KEY_MISSING',
    severity: 'CRITICAL',
    regex: /GEMINI_API_KEY.*not configured|AI service unavailable/,
    description: 'Gemini API key not set in CF secrets',
    autoFix: {type: 'none', recommendation: 'Set GEMINI_API_KEY secret: firebase functions:secrets:set GEMINI_API_KEY'},
  },
  {
    id: 'COACH_DISABLED',
    severity: 'INFO',
    regex: /Coach feature is currently disabled/,
    description: 'Coach kill switch is ON (coach_config.enabled=false)',
    autoFix: {type: 'none', recommendation: 'Set coach_config.enabled=true in Remote Config'},
  },
  {
    id: 'FIRESTORE_PERMISSION',
    severity: 'CRITICAL',
    regex: /PERMISSION_DENIED.*coachChats/,
    description: 'Firestore permission denied on coachChats collection',
    autoFix: {type: 'none', recommendation: 'Check Firestore rules for coachChats/{userId} collection'},
  },
  {
    id: 'MERGE_FAILURE',
    severity: 'WARNING',
    regex: /Merge.*0\/\d+|fuzzyMatch.*0 matched/i,
    description: 'Place merge failure — Gemini names don\'t match Google Places results',
    autoFix: {
      type: 'deploy',
      verify: () => fs.readFileSync(CF_SOURCE, 'utf8').includes('fuzzyMatchPlace'),
      functions: ['dateCoachChat'],
    },
  },
  {
    id: 'LOADMORE_UNHANDLED',
    severity: 'CRITICAL',
    regex: /Unhandled error.*Coach unavailable.*loadMore|loadMore Gemini failed/i,
    description: 'loadMoreActivities Gemini failure not caught — crashes instead of falling back to Places',
    autoFix: {
      type: 'deploy',
      verify: () => {
        const code = fs.readFileSync(CF_SOURCE, 'utf8');
        return code.includes('loadMore Gemini failed, using Places fallback');
      },
      functions: ['dateCoachChat'],
    },
  },
];

// ─── Log Fetching ────────────────────────────────────────────
function fetchLogs() {
  console.log(`📋 Fetching dateCoachChat logs (last ${MINUTES} min)...\n`);
  try {
    const raw = execSync(
      `cd "${PROJECT_ROOT}" && firebase functions:log --only dateCoachChat 2>&1`,
      {encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 30000},
    );
    // Filter by time window
    const cutoff = new Date(Date.now() - MINUTES * 60 * 1000);
    return raw.split('\n').filter((line) => {
      const match = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
      if (!match) return false;
      return new Date(match[1]) >= cutoff;
    });
  } catch {
    console.error('❌ Failed to fetch logs. Is Firebase CLI authenticated?');
    return [];
  }
}

// ─── Analysis ────────────────────────────────────────────────
function analyzeErrors(logLines) {
  const errorLines = logLines.filter((l) => /\bE\b|Error:|error:|CRITICAL|Unhandled/i.test(l));
  const findings = [];
  const seen = new Set();

  for (const line of errorLines) {
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.regex.test(line) && !seen.has(pattern.id)) {
        seen.add(pattern.id);
        const count = errorLines.filter((l) => pattern.regex.test(l)).length;
        findings.push({...pattern, occurrences: count, sampleLog: line.substring(0, 200)});
      }
    }
  }

  // Sort by severity
  const severity = {CRITICAL: 0, WARNING: 1, INFO: 2};
  findings.sort((a, b) => (severity[a.severity] ?? 3) - (severity[b.severity] ?? 3));
  return findings;
}

// ─── Auto-Fix ────────────────────────────────────────────────
function applyFixes(findings) {
  const deployNeeded = new Set();
  const actions = [];

  for (const f of findings) {
    if (f.autoFix.type === 'deploy' && f.autoFix.verify()) {
      f.autoFix.functions.forEach((fn) => deployNeeded.add(fn));
      actions.push({patternId: f.id, action: 'deploy', status: 'ready'});
      console.log(`  🔧 ${f.id}: Fix exists locally → will deploy`);
    } else if (f.autoFix.type === 'deploy' && !f.autoFix.verify()) {
      actions.push({patternId: f.id, action: 'manual_fix_needed', status: 'blocked'});
      console.log(`  ⚠️  ${f.id}: Fix NOT in local code → manual fix required`);
    } else {
      actions.push({patternId: f.id, action: 'none', recommendation: f.autoFix.recommendation, status: 'acknowledged'});
      console.log(`  ℹ️  ${f.id}: ${f.autoFix.recommendation}`);
    }
  }

  if (deployNeeded.size > 0 && !DRY_RUN) {
    const fnList = [...deployNeeded].map((f) => `functions:${f}`).join(',');
    console.log(`\n🚀 Deploying: ${fnList}`);
    try {
      execSync(`cd "${PROJECT_ROOT}" && firebase deploy --only ${fnList} --force 2>&1`, {
        encoding: 'utf8', stdio: 'inherit', timeout: 120000,
      });
      actions.filter((a) => a.action === 'deploy').forEach((a) => a.status = 'deployed');
      console.log('✅ Deploy successful');
    } catch {
      actions.filter((a) => a.action === 'deploy').forEach((a) => a.status = 'deploy_failed');
      console.error('❌ Deploy failed');
    }
  } else if (DRY_RUN && deployNeeded.size > 0) {
    console.log(`\n🔍 DRY RUN — would deploy: ${[...deployNeeded].join(', ')}`);
  }

  return actions;
}

// ─── Tracking ────────────────────────────────────────────────
async function trackFindings(findings, actions) {
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();

  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    const a = actions[i] || {action: 'none', status: 'unknown'};
    const docRef = db.collection('coachAutoFixes').doc();
    batch.set(docRef, {
      patternId: f.id,
      severity: f.severity,
      description: f.description,
      occurrences: f.occurrences,
      action: a.action,
      status: a.status,
      recommendation: a.recommendation || null,
      sampleLog: f.sampleLog || null,
      timestamp,
      monitorVersion: '1.0',
    });
  }

  if (findings.length > 0) {
    await batch.commit();
    console.log(`\n📊 Tracked ${findings.length} findings in Firestore (coachAutoFixes)`);
  }

  // GA4 Measurement Protocol (optional)
  const measurementId = process.env.GA4_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_API_SECRET;
  if (measurementId && apiSecret && findings.length > 0) {
    try {
      const events = findings.map((f, i) => ({
        name: 'coach_auto_fix',
        params: {
          pattern_id: f.id,
          severity: f.severity,
          occurrences: f.occurrences,
          action_taken: actions[i]?.action || 'none',
          status: actions[i]?.status || 'unknown',
        },
      }));
      await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`, {
        method: 'POST',
        body: JSON.stringify({client_id: 'coach-health-monitor', events}),
      });
      console.log('📈 GA4 events sent');
    } catch (gaErr) {
      console.warn(`⚠️  GA4 tracking failed: ${gaErr.message}`);
    }
  }
}

// ─── Report ──────────────────────────────────────────────────
function printReport(findings) {
  if (findings.length === 0) {
    console.log('🎉 No errors detected — Coach is healthy!\n');
    return;
  }

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           COACH HEALTH MONITOR — REPORT                ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Time window: last ${MINUTES} minutes`);
  console.log(`  Issues found: ${findings.length}\n`);

  for (const f of findings) {
    const icon = f.severity === 'CRITICAL' ? '🔴' : f.severity === 'WARNING' ? '🟡' : '🔵';
    console.log(`  ${icon} [${f.severity}] ${f.id} (×${f.occurrences})`);
    console.log(`     ${f.description}`);
    if (f.autoFix.type === 'deploy') console.log('     → Auto-fixable via deploy');
    else if (f.autoFix.recommendation) console.log(`     → ${f.autoFix.recommendation}`);
    console.log('');
  }
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  console.log('🏥 Coach Health Monitor v1.0\n');

  const logLines = fetchLogs();
  if (logLines.length === 0) {
    console.log('ℹ️  No logs found in time window.');
    process.exit(0);
  }
  console.log(`  📄 ${logLines.length} log lines analyzed\n`);

  const findings = analyzeErrors(logLines);
  printReport(findings);

  let actions = [];
  if (findings.length > 0 && (AUTO_FIX || DRY_RUN)) {
    console.log(AUTO_FIX ? '🔧 AUTO-FIX MODE:' : '🔍 DRY-RUN MODE:');
    actions = applyFixes(findings);
  } else if (findings.length > 0 && !AUTO_FIX) {
    console.log('💡 Run with --fix to auto-deploy available fixes.\n');
    actions = findings.map((f) => ({patternId: f.id, action: 'detected', status: 'no_action'}));
  }

  await trackFindings(findings, actions);

  // Summary
  const deployed = actions.filter((a) => a.status === 'deployed').length;
  const manual = actions.filter((a) => a.status === 'blocked' || a.action === 'none').length;
  if (deployed > 0) console.log(`\n✅ ${deployed} fix(es) deployed to production`);
  if (manual > 0) console.log(`⚠️  ${manual} issue(s) require manual intervention`);

  process.exit(findings.some((f) => f.severity === 'CRITICAL' && !actions.find((a) => a.patternId === f.id && a.status === 'deployed')) ? 1 : 0);
}

main().catch((err) => {
  console.error('❌ Monitor error:', err.message);
  process.exit(1);
});
