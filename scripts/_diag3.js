#!/usr/bin/env node
'use strict';
const admin = require('firebase-admin');
const sa = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const REVIEWER_UID = 'g4Zbr8tEguMcpZonw72xM5MGse32';

async function main() {
  // 1. Get reviewer data
  const revSnap = await db.collection('users').doc(REVIEWER_UID).get();
  const revData = revSnap.data();
  console.log('=== REVIEWER ===');
  console.log(`  Name: ${revData.name}, orientation: ${revData.orientation}, userType: ${revData.userType}`);
  console.log(`  liked: ${(revData.liked || []).length}, passed: ${(revData.passed || []).length}`);
  console.log(`  maxDistance: ${revData.maxDistance}`);
  console.log(`  lat: ${revData.latitude}, lon: ${revData.longitude}`);

  // 2. Get all isReviewer profiles
  const allSnap = await db.collection('users').where('isReviewer', '==', true).get();
  
  // 3. Get reviewer's matches
  const matchSnap = await db.collection('matches')
    .where('usersMatched', 'array-contains', REVIEWER_UID).get();
  const matchedUserIds = new Set();
  matchSnap.docs.forEach(d => {
    const users = d.data().usersMatched || [];
    users.forEach(uid => { if (uid !== REVIEWER_UID) matchedUserIds.add(uid); });
  });
  console.log(`\n=== MATCHES (${matchedUserIds.size}) ===`);
  matchedUserIds.forEach(uid => console.log(`  ${uid}`));

  // 4. Get all stories for reviewer profiles
  const profileIds = allSnap.docs.map(d => d.id).filter(id => id !== REVIEWER_UID);
  const storyCounts = {};
  
  // Query stories for all reviewer profiles
  const storySnap = await db.collection('stories')
    .where('isReviewer', '==', true)
    .where('isPersonal', '==', true)
    .get();
  
  for (const doc of storySnap.docs) {
    const data = doc.data();
    const sid = data.senderId;
    if (!storyCounts[sid]) storyCounts[sid] = [];
    storyCounts[sid].push({
      id: doc.id,
      neverExpires: data.neverExpires || false,
      expiresAt: data.expiresAt ? data.expiresAt.toDate().toISOString() : 'N/A',
    });
  }

  // 5. Categorize profiles
  const likedSet = new Set(revData.liked || []);
  const passedSet = new Set(revData.passed || []);
  
  const discovery = [];
  const matched = [];
  const other = [];
  
  for (const doc of allSnap.docs) {
    if (doc.id === REVIEWER_UID) continue;
    const data = doc.data();
    const isMatched = matchedUserIds.has(doc.id);
    const isLiked = likedSet.has(doc.id);
    const isPassed = passedSet.has(doc.id);
    const stories = storyCounts[doc.id] || [];
    
    const info = {
      id: doc.id,
      name: data.name,
      userType: data.userType,
      male: data.male,
      orientation: data.orientation,
      stories: stories.length,
      isMatched,
      isLiked,
      isPassed,
      accountStatus: data.accountStatus,
      paused: data.paused,
    };
    
    if (isMatched) {
      matched.push(info);
    } else {
      discovery.push(info);
    }
  }

  console.log(`\n=== DISCOVERY PROFILES (${discovery.length}) ===`);
  let withStories = 0;
  for (const p of discovery) {
    const flag = p.stories > 0 ? '📖' : '  ';
    const warn = (p.isLiked || p.isPassed) ? ' ⚠️FILTERED' : '';
    console.log(`  ${flag} ${p.name.padEnd(22)} ${p.userType.padEnd(14)} ${p.male ? 'M' : 'F'} orient:${p.orientation.padEnd(5)} stories:${p.stories}${warn}`);
    if (p.stories > 0) withStories++;
  }

  console.log(`\n=== MATCH PROFILES (${matched.length}) ===`);
  for (const p of matched) {
    console.log(`  ${p.name.padEnd(22)} ${p.userType.padEnd(14)} stories:${p.stories}`);
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`  Discovery profiles: ${discovery.length}`);
  console.log(`  With stories: ${withStories}`);  
  console.log(`  Without stories: ${discovery.length - withStories}`);
  console.log(`  Match profiles: ${matched.length}`);
  console.log(`  Total stories (isReviewer): ${storySnap.size}`);
  
  // 6. Check which discovery profiles WOULD be filtered by orientation
  // Reviewer: male=true, orientation=both, userType=SUGAR_DADDY
  console.log(`\n=== ORIENTATION COMPATIBILITY (reviewer: male=true, orient=both, type=SUGAR_DADDY) ===`);
  // With orientation "both", the CF filters to only show candidates with orientation "both"
  // Also SUGAR_DADDY can't see other SUGAR_DADDY
  for (const p of discovery) {
    const orOk = p.orientation === 'both'; // reviewer is "both" → only sees "both"
    const typeOk = p.userType !== 'SUGAR_DADDY'; // Daddy can't see Daddy
    const visible = orOk && typeOk;
    if (!visible) {
      console.log(`  ❌ ${p.name} — orient:${p.orientation}, type:${p.userType} → HIDDEN`);
    } else {
      console.log(`  ✅ ${p.name} — orient:${p.orientation}, type:${p.userType} → VISIBLE`);
    }
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
