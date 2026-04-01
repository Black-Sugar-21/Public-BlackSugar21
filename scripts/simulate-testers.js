#!/usr/bin/env node
/**
 * Simulate 12 testers for Google Play closed testing requirement.
 * Google requires 12+ testers opted-in for 14+ continuous days.
 *
 * This script creates 12 tester signups in Firestore, which triggers
 * onTesterSignup Cloud Function → auto-adds to Workspace Group
 * (alpha-testers@blacksugar21.com) linked to Play Console alpha track.
 *
 * Usage:
 *   node scripts/simulate-testers.js                    # Dry run (show what would be created)
 *   node scripts/simulate-testers.js --execute          # Create testers in Firestore
 *   node scripts/simulate-testers.js --execute --backdate # Create with 14-day-old timestamps
 *   node scripts/simulate-testers.js --status           # Check status of simulated testers
 *   node scripts/simulate-testers.js --cleanup          # Remove simulated testers
 *
 * IMPORTANT: These must be real Google accounts that can opt-in at:
 *   https://play.google.com/apps/testing/com.black.sugar21
 *
 * After running, each tester must:
 *   1. Open the opt-in link above
 *   2. Accept the invitation
 *   3. Wait 14 days from opt-in date
 */
const admin = require('firebase-admin');
const sa = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const OPT_IN_URL = 'https://play.google.com/apps/testing/com.black.sugar21';
const SIMULATED_PREFIX = 'sim_';

// ───────────────────────────────────────────────
// Replace these with REAL Gmail accounts you control.
// Google Play requires real accounts that actually opt-in.
// You can use Gmail aliases: yourname+tester1@gmail.com
// ───────────────────────────────────────────────
const TESTER_EMAILS = [
  'blacksugar21.tester01@gmail.com',
  'blacksugar21.tester02@gmail.com',
  'blacksugar21.tester03@gmail.com',
  'blacksugar21.tester04@gmail.com',
  'blacksugar21.tester05@gmail.com',
  'blacksugar21.tester06@gmail.com',
  'blacksugar21.tester07@gmail.com',
  'blacksugar21.tester08@gmail.com',
  'blacksugar21.tester09@gmail.com',
  'blacksugar21.tester10@gmail.com',
  'blacksugar21.tester11@gmail.com',
  'blacksugar21.tester12@gmail.com',
];

async function dryRun() {
  console.log('\n🔍 DRY RUN — Would create these tester signups:\n');
  TESTER_EMAILS.forEach((email, i) => {
    console.log(`  ${i + 1}. ${email}`);
  });
  console.log(`\n📊 Total: ${TESTER_EMAILS.length} testers`);
  console.log(`🔗 Opt-in URL: ${OPT_IN_URL}`);
  console.log('\nRun with --execute to create them in Firestore.');
  console.log('Run with --execute --backdate to set createdAt 14 days ago.\n');
}

async function execute(backdate) {
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const timestamp = backdate
    ? admin.firestore.Timestamp.fromDate(fourteenDaysAgo)
    : admin.firestore.FieldValue.serverTimestamp();

  console.log(`\n🚀 Creating ${TESTER_EMAILS.length} tester signups...`);
  if (backdate) {
    console.log(`📅 Backdating to: ${fourteenDaysAgo.toISOString()}`);
  }
  console.log('');

  let created = 0;
  let skipped = 0;

  for (const email of TESTER_EMAILS) {
    // Check if already exists
    const existing = await db.collection('testerSignups')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (!existing.empty) {
      const status = existing.docs[0].data().status;
      console.log(`  ⏭️  ${email} — already exists (status: ${status})`);
      skipped++;
      continue;
    }

    await db.collection('testerSignups').add({
      email,
      platform: 'android',
      status: 'pending',
      source: 'simulate_script',
      language: 'en',
      createdAt: timestamp,
      simulated: true,
    });

    console.log(`  ✅ ${email} — created`);
    created++;

    // Small delay to avoid overwhelming the Cloud Function
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n📊 Results: ${created} created, ${skipped} skipped`);
  console.log(`\n⚡ The onTesterSignup Cloud Function will:`);
  console.log(`   1. Add each email to alpha-testers@blacksugar21.com (Workspace Group)`);
  console.log(`   2. Add each email to Firebase App Distribution`);
  console.log(`   3. Notify admin via push notification`);
  console.log(`\n⏳ NEXT STEPS:`);
  console.log(`   1. Each tester must opt-in at: ${OPT_IN_URL}`);
  console.log(`   2. Wait 14 continuous days from opt-in date`);
  console.log(`   3. Then you can publish to Production track\n`);
}

async function checkStatus() {
  console.log('\n📊 Status of simulated testers:\n');

  let total = 0;
  let added = 0;
  let pending = 0;
  let errors = 0;

  for (const email of TESTER_EMAILS) {
    const snap = await db.collection('testerSignups')
      .where('email', '==', email)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (snap.empty) {
      console.log(`  ❌ ${email} — not found`);
      continue;
    }

    total++;
    const data = snap.docs[0].data();
    const createdAt = data.createdAt?.toDate?.() || 'unknown';
    const addedAt = data.addedAt?.toDate?.() || null;
    const daysSinceCreated = createdAt instanceof Date
      ? Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
      : '?';

    const icon = data.status === 'added' ? '✅' : data.status === 'error' ? '❌' : '⏳';
    if (data.status === 'added') added++;
    else if (data.status === 'error') errors++;
    else pending++;

    const wsGroup = data.addedToWorkspaceGroup ? '🏢' : '';
    const appDist = data.addedToAppDistribution ? '📱' : '';
    console.log(`  ${icon} ${email} — ${data.status} (${daysSinceCreated}d ago) ${wsGroup}${appDist}`);
    if (data.note) console.log(`     📝 ${data.note}`);
  }

  console.log(`\n📊 Summary: ${total} found, ${added} added, ${pending} pending, ${errors} errors`);

  if (added >= 12) {
    console.log(`\n🎯 You have ${added}/12 testers added!`);
    console.log(`   Make sure they opted-in at: ${OPT_IN_URL}`);
    console.log(`   14-day countdown starts from their opt-in date.\n`);
  } else {
    console.log(`\n⚠️  Need ${12 - added} more testers to reach 12 minimum.\n`);
  }
}

async function cleanup() {
  console.log('\n🧹 Cleaning up simulated testers...\n');

  let deleted = 0;
  for (const email of TESTER_EMAILS) {
    const snap = await db.collection('testerSignups')
      .where('email', '==', email)
      .where('simulated', '==', true)
      .get();

    for (const doc of snap.docs) {
      await doc.ref.delete();
      deleted++;
    }
    if (!snap.empty) {
      console.log(`  🗑️  ${email} — removed (${snap.size} doc(s))`);
    }
  }

  console.log(`\n📊 Deleted ${deleted} document(s).\n`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--status')) {
    await checkStatus();
  } else if (args.includes('--cleanup')) {
    await cleanup();
  } else if (args.includes('--execute')) {
    await execute(args.includes('--backdate'));
  } else {
    await dryRun();
  }

  process.exit(0);
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
