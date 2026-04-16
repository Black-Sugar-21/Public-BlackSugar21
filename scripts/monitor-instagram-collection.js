#!/usr/bin/env node
/**
 * Monitor placeInstagram Firestore collection growth
 * Tracks Instagram scraping success rate and metrics
 * Usage: node monitor-instagram-collection.js [--watch] [--interval 30]
 */

const admin = require('firebase-admin');

// Initialize Firebase if not already done
if (!admin.apps.length) {
  const credentials = require('../functions/.firebase-key.json');
  admin.initializeApp({
    credential: admin.credential.cert(credentials),
    projectId: 'black-sugar21',
  });
}

const db = admin.firestore();

async function monitorCollection() {
  try {
    const snapshot = await db.collection('placeInstagram').get();
    const docs = snapshot.docs.map(d => d.data());

    const stats = {
      totalDocs: docs.length,
      withMetrics: docs.filter(d => d.followers != null).length,
      withFollowers: docs.filter(d => d.followers > 0).length,
      avgFollowers: 0,
      avgPosts: 0,
      avgScore: 0,
      sourceBreakdown: {},
      topByFollowers: [],
      topByScore: [],
      createdInLastHour: 0,
      createdInLast24h: 0,
    };

    // Calculate metrics
    const withMetrics = docs.filter(d => d.followers != null);
    if (withMetrics.length > 0) {
      stats.avgFollowers = Math.round(
        withMetrics.reduce((sum, d) => sum + (d.followers || 0), 0) / withMetrics.length
      );
      stats.avgPosts = Math.round(
        withMetrics.reduce((sum, d) => sum + (d.posts || 0), 0) / withMetrics.length
      );
      stats.avgScore = Math.round(
        withMetrics.reduce((sum, d) => sum + (d.igScore || 0), 0) / withMetrics.length
      );
    }

    // Source breakdown
    docs.forEach(d => {
      const source = d.source || 'unknown';
      stats.sourceBreakdown[source] = (stats.sourceBreakdown[source] || 0) + 1;
    });

    // Time-based filtering
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const oneDayAgo = now - 86400000;

    docs.forEach(d => {
      const verified = d.verifiedAt?.toMillis?.() || 0;
      if (verified > oneHourAgo) stats.createdInLastHour++;
      if (verified > oneDayAgo) stats.createdInLast24h++;
    });

    // Top by followers
    stats.topByFollowers = docs
      .filter(d => d.followers)
      .sort((a, b) => b.followers - a.followers)
      .slice(0, 5)
      .map(d => ({
        place: d.placeName,
        handle: d.instagram,
        followers: d.followers,
      }));

    // Top by score
    stats.topByScore = docs
      .filter(d => d.igScore)
      .sort((a, b) => b.igScore - a.igScore)
      .slice(0, 5)
      .map(d => ({
        place: d.placeName,
        handle: d.instagram,
        score: d.igScore,
      }));

    // Display stats
    console.log('\n' + '═'.repeat(80));
    console.log('placeInstagram Collection Monitor');
    console.log('═'.repeat(80));
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log('');

    console.log('📊 Collection Stats');
    console.log('─'.repeat(80));
    console.log(`  Total documents: ${stats.totalDocs}`);
    console.log(`  With metrics: ${stats.withMetrics} (${((stats.withMetrics / stats.totalDocs) * 100).toFixed(1)}%)`);
    console.log(`  With followers: ${stats.withFollowers}`);
    console.log(`  Average followers: ${stats.avgFollowers.toLocaleString()}`);
    console.log(`  Average posts: ${stats.avgPosts}`);
    console.log(`  Average IG score: ${stats.avgScore}`);
    console.log('');

    console.log('📈 Recent Activity');
    console.log('─'.repeat(80));
    console.log(`  Created in last hour: ${stats.createdInLastHour}`);
    console.log(`  Created in last 24h: ${stats.createdInLast24h}`);
    console.log('');

    console.log('🔍 Source Breakdown');
    console.log('─'.repeat(80));
    Object.entries(stats.sourceBreakdown).forEach(([source, count]) => {
      const pct = ((count / stats.totalDocs) * 100).toFixed(1);
      console.log(`  ${source}: ${count} (${pct}%)`);
    });
    console.log('');

    console.log('⭐ Top 5 by Followers');
    console.log('─'.repeat(80));
    stats.topByFollowers.forEach((item, i) => {
      console.log(`  ${i + 1}. ${item.place} (@${item.handle})`);
      console.log(`     Followers: ${item.followers.toLocaleString()}`);
    });
    console.log('');

    console.log('🏆 Top 5 by IG Score');
    console.log('─'.repeat(80));
    stats.topByScore.forEach((item, i) => {
      console.log(`  ${i + 1}. ${item.place} (@${item.handle})`);
      console.log(`     Score: ${item.score}/100`);
    });
    console.log('');

    console.log('═'.repeat(80));
    console.log(`✅ Monitor complete at ${new Date().toLocaleTimeString()}`);
    console.log('═'.repeat(80) + '\n');

    return stats;
  } catch (err) {
    console.error('❌ Error monitoring collection:', err.message);
    process.exit(1);
  }
}

// Parse arguments
const args = process.argv.slice(2);
const watch = args.includes('--watch');
const intervalArg = args.find(a => a.startsWith('--interval'));
const interval = intervalArg ? parseInt(intervalArg.split('=')[1]) * 1000 : 30000;

// Run monitor
(async () => {
  await monitorCollection();

  if (watch) {
    console.log(`🔄 Watching collection every ${interval / 1000}s... (Press Ctrl+C to stop)\n`);
    setInterval(monitorCollection, interval);
  } else {
    process.exit(0);
  }
})();
