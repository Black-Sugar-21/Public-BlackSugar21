#!/usr/bin/env node
'use strict';

/**
 * seed-reviewer-stories.js
 *
 * Creates permanent stories with elegant landscape photos for all
 * reviewer/test profiles. Stories are marked with neverExpires: true
 * and isReviewer: true so cleanupExpiredStories never deletes them.
 *
 * Usage:
 *   node scripts/seed-reviewer-stories.js           # Create stories
 *   node scripts/seed-reviewer-stories.js --clean    # Delete existing + Create
 *   node scripts/seed-reviewer-stories.js --delete   # Only delete
 */

const admin  = require('firebase-admin');
const crypto = require('crypto');
const https  = require('https');
const http   = require('http');
const sharp  = require('sharp');

// ─── Firebase ────────────────────────────────────────────────────────────────

const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential:    admin.credential.cert(serviceAccount),
  storageBucket: 'black-sugar21.firebasestorage.app',
});
const db     = admin.firestore();
const bucket = admin.storage().bucket();

// ─── Constants ───────────────────────────────────────────────────────────────

const REVIEWER_UID = 'g4Zbr8tEguMcpZonw72xM5MGse32';

// Elegant landscape photos — Unsplash CDN (public, no auth required)
// Each ID is a verified high-quality landscape/nature photo
const LANDSCAPE_PHOTOS = [
  'photo-1506905925346-21bda4d32df4', // Swiss Alps panorama
  'photo-1470071459604-3b5ec3a7fe05', // Misty green forest
  'photo-1441974231531-c6227db76b6e', // Sun rays through forest canopy
  'photo-1472214103451-9374bd1c798e', // Mountain lake panorama
  'photo-1469474968028-56623f02e42e', // Road at golden sunset
  'photo-1501785888041-af3ef285b470', // Mountain reflection on lake
  'photo-1507525428034-b723cf961d3e', // Tropical turquoise beach
  'photo-1476514525535-07fb3b4ae5f1', // Dramatic waterfall cascade
  'photo-1433086966358-54859d0ed716', // Waterfall in lush forest
  'photo-1544550581-5f7ceaf7f992', // Golden hour beach sunset
  'photo-1470252649378-9c29740c9fa8', // Palm trees silhouette at sunset
  'photo-1559128010-7c1ad6e1b6a5', // Aerial tropical island view
  'photo-1419242902214-272b3f66ee7a', // Starry night sky
  'photo-1414609245224-afa02bfb3fda', // Winding mountain road
  'photo-1497436072909-60f360e1d4b1', // Lush green valley
  'photo-1505118380757-91f5f5632de0', // Ocean waves aerial view
  'photo-1504567961542-e24d9439a724', // Mountain peak above clouds
  'photo-1494500764479-0c8f2919a3d8', // Towering redwood forest
  'photo-1523712999610-f77fbcfc3843', // Dramatic sunset clouds
  'photo-1519681393784-d120267933ba', // Snow mountains at night
  'photo-1509316975850-ff9c5deb0cd9', // Autumn forest colors
  'photo-1476842634003-7dcca8f832de', // Colorful sunset sky
  'photo-1490730141103-6cac27aaab94', // Mountains and clouds panorama
  'photo-1505765050516-f72dcac9c60e', // Flower meadow with mountains
  'photo-1532274402911-5a369e4c4bb5', // Santorini at sunset
  'photo-1464822759023-fed622ff2c3b', // Dramatic mountain peaks
  'photo-1475924156734-496f6cac6ec1', // Northern lights aurora
  'photo-1468276311594-df7cb65d8df6', // Misty sunrise mountains
  'photo-1447752875215-b2761acb3c5d', // Autumn road through forest
  'photo-1439853949127-fa647821eba0', // Blue alpine lake
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const C = {
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', magenta: '\x1b[35m', gray: '\x1b[90m',
  bold: '\x1b[1m', reset: '\x1b[0m',
};
const log  = (msg, color = 'reset') => console.log(`${C[color] || ''}${msg}${C.reset}`);
const ok   = (msg) => log(`  ✅ ${msg}`, 'green');
const err  = (msg) => log(`  ❌ ${msg}`, 'red');
const warn = (msg) => log(`  ⚠️  ${msg}`, 'yellow');
const info = (msg) => log(`  ℹ️  ${msg}`, 'gray');
const sep  = () => log('  ' + '─'.repeat(60), 'gray');

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const handler = (resp) => {
      if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
        const redirectUrl = resp.headers.location;
        const lib = redirectUrl.startsWith('https') ? https : http;
        lib.get(redirectUrl, handler).on('error', reject);
        return;
      }
      if (resp.statusCode !== 200) {
        reject(new Error(`HTTP ${resp.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('end', () => resolve(Buffer.concat(chunks)));
      resp.on('error', reject);
    };
    https.get(url, handler).on('error', reject);
  });
}

async function uploadStoryImage(userId, imageBuffer) {
  // Resize to 1080x1920 story format (9:16 vertical)
  const resized = await sharp(imageBuffer)
    .resize(1080, 1920, { fit: 'cover', position: 'centre', kernel: 'lanczos3' })
    .sharpen()
    .jpeg({ quality: 85 })
    .toBuffer();

  const token       = crypto.randomUUID();
  const storagePath = `stories/personal_stories/${userId}/${token}.jpg`;
  const file        = bucket.file(storagePath);

  await file.save(resized, {
    contentType: 'image/jpeg',
    metadata: {
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });

  const encodedPath = encodeURIComponent(storagePath);
  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;

  return { storagePath, downloadUrl, storyId: token };
}

// ─── Delete ──────────────────────────────────────────────────────────────────

async function deleteReviewerStories() {
  log('\n🗑️  Eliminando stories del reviewer...', 'yellow');
  sep();

  const snap = await db.collection('stories')
    .where('isReviewer', '==', true)
    .get();

  if (snap.empty) {
    info('No se encontraron stories del reviewer.');
    return;
  }

  info(`Encontradas ${snap.size} stories para eliminar.`);

  let deleted = 0;
  for (const doc of snap.docs) {
    try {
      const data = doc.data();
      // Delete Storage file
      const storagePath = `stories/personal_stories/${data.senderId}/${doc.id}.jpg`;
      try {
        await bucket.file(storagePath).delete();
      } catch {
        // File might not exist — ok
      }
      // Delete Firestore doc
      await doc.ref.delete();
      deleted++;
    } catch (e) {
      err(`Story ${doc.id}: ${e.message}`);
    }
  }

  ok(`${deleted}/${snap.size} stories eliminadas.`);
}

// ─── Create Stories ──────────────────────────────────────────────────────────

async function createStories() {
  log('\n📸 Creando stories con paisajes elegantes...', 'cyan');
  sep();

  // 1. Get all test profiles
  const testSnap = await db.collection('users')
    .where('isTest', '==', true)
    .get();

  if (testSnap.empty) {
    err('No se encontraron perfiles de test. Ejecuta seed-reviewer.js primero.');
    return;
  }

  const profiles = [];
  for (const doc of testSnap.docs) {
    const data = doc.data();
    profiles.push({
      uid:  doc.id,
      name: data.name || 'Unknown',
      isReviewerAccount: doc.id === REVIEWER_UID,
    });
  }

  info(`${profiles.length} perfiles de test encontrados (incluye reviewer).`);
  sep();

  let created = 0;
  let photoIndex = 0;

  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];
    // Reviewer gets 2 stories, ~40% of others get 2, rest get 1
    const storyCount = p.isReviewerAccount ? 2 : (1 + (i % 3 === 0 ? 1 : 0));

    log(`  [${i + 1}/${profiles.length}] ${p.name}${p.isReviewerAccount ? ' (REVIEWER)' : ''} — ${storyCount} stories...`, 'cyan');

    for (let s = 0; s < storyCount; s++) {
      const photoId = LANDSCAPE_PHOTOS[photoIndex % LANDSCAPE_PHOTOS.length];
      photoIndex++;

      const photoUrl = `https://images.unsplash.com/${photoId}?w=1080&q=80`;

      try {
        const buf = await downloadImage(photoUrl);
        const { downloadUrl, storyId } = await uploadStoryImage(p.uid, buf);

        // Spread timestamps naturally within last 6 hours
        const hoursAgo      = Math.random() * 6;
        const storyTimestamp = new Date(Date.now() - hoursAgo * 3_600_000);
        const farFuture      = new Date('2099-12-31T23:59:59Z');

        await db.collection('stories').doc(storyId).set({
          senderId:     p.uid,
          imageUrl:     downloadUrl,
          timestamp:    admin.firestore.Timestamp.fromDate(storyTimestamp),
          expiresAt:    admin.firestore.Timestamp.fromDate(farFuture),
          viewedBy:     [],
          isExpired:    false,
          isPersonal:   true,
          neverExpires: true,
          isReviewer:   true,
        });

        process.stdout.write('  🖼️');
        created++;
      } catch (e) {
        warn(`Story ${s + 1} para ${p.name}: ${e.message}`);
      }
    }
    console.log();
  }

  sep();
  ok(`${created} stories creadas con paisajes elegantes.`);
}

// ─── Verify ──────────────────────────────────────────────────────────────────

async function verifyStories() {
  log('\n🔍 Verificando stories...', 'cyan');
  sep();

  const snap = await db.collection('stories')
    .where('isReviewer', '==', true)
    .get();

  const bySender = {};
  for (const doc of snap.docs) {
    const d = doc.data();
    if (!bySender[d.senderId]) bySender[d.senderId] = 0;
    bySender[d.senderId]++;
  }

  ok(`Total: ${snap.size} stories permanentes`);
  ok(`Perfiles con stories: ${Object.keys(bySender).length}`);

  for (const [uid, count] of Object.entries(bySender)) {
    const isRev = uid === REVIEWER_UID;
    info(`  ${uid.substring(0, 12)}... → ${count} story(s)${isRev ? ' (REVIEWER)' : ''}`);
  }
  sep();
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const argv     = process.argv.slice(2);
  const doDelete = argv.includes('--delete');
  const doClean  = argv.includes('--clean');

  log('\n' + '═'.repeat(72), 'magenta');
  log('🖼️  SEED REVIEWER STORIES — Paisajes Elegantes', 'bold');
  log('    Stories permanentes para perfiles de test', 'gray');
  log('═'.repeat(72), 'magenta');

  if (doDelete) {
    await deleteReviewerStories();
    log('\n✅ Stories del reviewer eliminadas.\n', 'green');
    process.exit(0);
  }

  if (doClean) {
    await deleteReviewerStories();
  }

  await createStories();
  await verifyStories();

  log('\n✅ Stories de reviewer creadas exitosamente.\n', 'green');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Fatal:', e);
  process.exit(1);
});
