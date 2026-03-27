#!/usr/bin/env node
/**
 * Export pending tester emails from Firestore.
 * Copy the output and paste into Play Console > Prueba cerrada > Testers > lista de emails.
 *
 * Usage:
 *   node scripts/export-testers.js           # Show pending emails
 *   node scripts/export-testers.js --mark    # Show and mark as 'added'
 */
const admin = require('firebase-admin');
const sa = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function main() {
  const markAsAdded = process.argv.includes('--mark');

  const snap = await db.collection('testerSignups')
    .where('status', 'in', ['pending', 'received'])
    .get();

  if (snap.empty) {
    console.log('No pending tester signups.');
    process.exit(0);
  }

  console.log(`\n📋 ${snap.size} pending tester(s):\n`);

  const emails = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    console.log(`  ${data.email} (${data.language || '?'}) — ${data.status}`);
    emails.push(data.email);

    if (markAsAdded) {
      await doc.ref.update({
        status: 'added',
        addedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  console.log('\n📧 Copy-paste for Play Console:\n');
  console.log(emails.join('\n'));

  if (markAsAdded) {
    console.log(`\n✅ Marked ${snap.size} signup(s) as 'added'`);
  } else {
    console.log(`\nRun with --mark to mark these as added after pasting to Play Console.`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
