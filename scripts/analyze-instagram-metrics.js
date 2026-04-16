#!/usr/bin/env node
/**
 * Medium-term Analysis: Instagram metrics distribution & insights
 * Analyzes placeInstagram collection for optimization opportunities
 *
 * Usage:
 *   node analyze-instagram-metrics.js [--top N] [--gaps] [--distribution] [--regional] [--export]
 *   node analyze-instagram-metrics.js --full [--output analysis-report.json]
 */

const admin = require('firebase-admin');
const fs = require('fs');

// Initialize Firebase
if (!admin.apps.length) {
  const credentials = require('../functions/.firebase-key.json');
  admin.initializeApp({
    credential: admin.credential.cert(credentials),
    projectId: 'black-sugar21',
  });
}

const db = admin.firestore();

/**
 * Load all Instagram metrics
 */
async function loadAllMetrics() {
  try {
    const snapshot = await db.collection('placeInstagram').get();
    return snapshot.docs.map(d => ({...d.data(), id: d.id}));
  } catch (err) {
    console.error('❌ Error loading metrics:', err.message);
    throw err;
  }
}

/**
 * Calculate distribution statistics
 */
function calculateDistribution(data, field) {
  const values = data
    .filter(d => d[field] != null)
    .map(d => d[field])
    .sort((a, b) => a - b);

  if (values.length === 0) return null;

  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const median = values[Math.floor(values.length / 2)];
  const min = values[0];
  const max = values[values.length - 1];
  const p90 = values[Math.floor(values.length * 0.9)];
  const p75 = values[Math.floor(values.length * 0.75)];

  // Standard deviation
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return {
    count: values.length,
    mean: Math.round(mean),
    median: Math.round(median),
    min,
    max,
    p75: Math.round(p75),
    p90: Math.round(p90),
    stdDev: Math.round(stdDev),
  };
}

/**
 * Analyze overall metrics
 */
function analyzeOverall(data) {
  console.log('\n' + '═'.repeat(100));
  console.log('📊 OVERALL METRICS ANALYSIS');
  console.log('═'.repeat(100));

  const total = data.length;
  const withMetrics = data.filter(d => d.followers != null).length;
  const withFollowers = data.filter(d => d.followers > 0).length;
  const active = data.filter(d => d.isActive).length;
  const private = data.filter(d => d.isPrivate).length;

  console.log('\n📈 COLLECTION OVERVIEW');
  console.log(`  Total Places: ${total}`);
  console.log(`  With Metrics: ${withMetrics} (${((withMetrics / total) * 100).toFixed(1)}%)`);
  console.log(`  With Followers: ${withFollowers}`);
  console.log(`  Active (posted ≤180 days): ${active} (${((active / withMetrics) * 100).toFixed(1)}%)`);
  console.log(`  Private Accounts: ${private}`);

  // Source analysis
  const sourceWebsite = data.filter(d => d.source === 'website').length;
  const sourceSearch = data.filter(d => d.source === 'search').length;
  const sourceUnknown = data.filter(d => !d.source || d.source === 'unknown').length;

  console.log('\n🔍 SOURCE EFFECTIVENESS');
  console.log(`  Website Extraction: ${sourceWebsite} (${((sourceWebsite / total) * 100).toFixed(1)}%)`);
  console.log(`  Google Search: ${sourceSearch} (${((sourceSearch / total) * 100).toFixed(1)}%)`);
  console.log(`  Unknown: ${sourceUnknown} (${((sourceUnknown / total) * 100).toFixed(1)}%)`);

  // Distribution analysis
  console.log('\n📊 DISTRIBUTION STATISTICS');

  const followerDist = calculateDistribution(data, 'followers');
  if (followerDist) {
    console.log('\n  Followers:');
    console.log(`    Mean: ${followerDist.mean.toLocaleString()}`);
    console.log(`    Median: ${followerDist.median.toLocaleString()}`);
    console.log(`    Range: ${followerDist.min.toLocaleString()} - ${followerDist.max.toLocaleString()}`);
    console.log(`    75th percentile: ${followerDist.p75.toLocaleString()}`);
    console.log(`    90th percentile: ${followerDist.p90.toLocaleString()}`);
  }

  const postsDist = calculateDistribution(data, 'posts');
  if (postsDist) {
    console.log('\n  Posts per Account:');
    console.log(`    Mean: ${postsDist.mean}`);
    console.log(`    Median: ${postsDist.median}`);
    console.log(`    Range: ${postsDist.min} - ${postsDist.max}`);
  }

  const scoreDist = calculateDistribution(data, 'igScore');
  if (scoreDist) {
    console.log('\n  IG Score (0-100):');
    console.log(`    Mean: ${scoreDist.mean}`);
    console.log(`    Median: ${scoreDist.median}`);
    console.log(`    Range: ${scoreDist.min} - ${scoreDist.max}`);
  }
}

/**
 * Find data gaps and opportunities
 */
function analyzeGaps(data) {
  console.log('\n' + '═'.repeat(100));
  console.log('⚠️  DATA GAPS & OPPORTUNITIES');
  console.log('═'.repeat(100));

  // Missing Instagram handles
  const noHandle = data.filter(d => !d.instagram).length;
  console.log(`\n❌ No Instagram Handle:`);
  console.log(`   ${noHandle} places (${((noHandle / data.length) * 100).toFixed(1)}%)`);
  if (noHandle > 0 && noHandle <= 20) {
    const places = data.filter(d => !d.instagram).slice(0, 10);
    console.log(`   Examples: ${places.map(p => p.placeName).join(', ')}`);
  }

  // Missing metrics
  const noMetrics = data.filter(d => d.instagram && !d.followers).length;
  console.log(`\n📊 Handle Found But No Metrics:`);
  console.log(`   ${noMetrics} places`);
  console.log(`   (Usually timeout - may be private/deactivated accounts)`);

  // Private accounts
  const privateCount = data.filter(d => d.isPrivate).length;
  console.log(`\n🔒 Private Accounts:`);
  console.log(`   ${privateCount} places (${((privateCount / data.filter(d => d.followers).length) * 100).toFixed(1)}% of metrics)`);

  // Inactive accounts
  const inactive = data.filter(d => d.followers && !d.isActive).length;
  console.log(`\n😴 Inactive Accounts (no posts in 180+ days):`);
  console.log(`   ${inactive} places`);
  console.log(`   Impact: May appear in results but need freshness penalty`);

  // Very low follower counts
  const lowFollowers = data.filter(d => d.followers && d.followers < 100).length;
  console.log(`\n📉 Very Low Followers (<100):`);
  console.log(`   ${lowFollowers} places (${((lowFollowers / data.filter(d => d.followers).length) * 100).toFixed(1)}% of metrics)`);
  console.log(`   These may not meet quality threshold in ranking`);

  // Very high outliers
  const highFollowers = data.filter(d => d.followers && d.followers > 100000).length;
  console.log(`\n🚀 High Follower Outliers (>100K):`);
  console.log(`   ${highFollowers} places`);
  console.log(`   These likely drive high scores and should rank near top`);
}

/**
 * Ranking insights
 */
function analyzeRanking(data) {
  console.log('\n' + '═'.repeat(100));
  console.log('🏆 RANKING INSIGHTS');
  console.log('═'.repeat(100));

  // Score distribution
  const withScores = data.filter(d => d.igScore != null);
  const scoreRanges = {
    '0-20': withScores.filter(d => d.igScore < 20).length,
    '20-40': withScores.filter(d => d.igScore >= 20 && d.igScore < 40).length,
    '40-60': withScores.filter(d => d.igScore >= 40 && d.igScore < 60).length,
    '60-80': withScores.filter(d => d.igScore >= 60 && d.igScore < 80).length,
    '80-100': withScores.filter(d => d.igScore >= 80).length,
  };

  console.log('\n📊 IG Score Distribution:');
  Object.entries(scoreRanges).forEach(([range, count]) => {
    const pct = ((count / withScores.length) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(pct / 2));
    console.log(`  ${range.padEnd(8)}: ${bar.padEnd(50)} ${count} (${pct}%)`);
  });

  // Top scorers
  const top10 = data
    .filter(d => d.igScore)
    .sort((a, b) => b.igScore - a.igScore)
    .slice(0, 10);

  console.log('\n⭐ Top 10 by IG Score:');
  top10.forEach((item, i) => {
    console.log(`  ${i+1}. ${item.placeName} (${item.instagram}) — ${item.igScore}/100 (${item.followers?.toLocaleString()} followers)`);
  });

  // Bottom performers
  const bottom10 = data
    .filter(d => d.igScore && d.followers)
    .sort((a, b) => a.igScore - b.igScore)
    .slice(0, 10);

  console.log('\n📉 Bottom 10 by IG Score (with followers):');
  bottom10.forEach((item, i) => {
    console.log(`  ${i+1}. ${item.placeName} (${item.instagram}) — ${item.igScore}/100 (${item.followers?.toLocaleString()} followers)`);
  });
}

/**
 * Source effectiveness analysis
 */
function analyzeSourceEffectiveness(data) {
  console.log('\n' + '═'.repeat(100));
  console.log('🔍 SOURCE EFFECTIVENESS');
  console.log('═'.repeat(100));

  const bySource = {
    website: data.filter(d => d.source === 'website'),
    search: data.filter(d => d.source === 'search'),
    unknown: data.filter(d => !d.source || d.source === 'unknown'),
  };

  const report = Object.entries(bySource).map(([source, items]) => ({
    source,
    total: items.length,
    withMetrics: items.filter(d => d.followers != null).length,
    avgFollowers: items.filter(d => d.followers).length > 0
      ? Math.round(items.filter(d => d.followers).reduce((sum, d) => sum + d.followers, 0) / items.filter(d => d.followers).length)
      : 0,
    avgScore: items.filter(d => d.igScore).length > 0
      ? Math.round(items.filter(d => d.igScore).reduce((sum, d) => sum + d.igScore, 0) / items.filter(d => d.igScore).length)
      : 0,
  }));

  console.log('\n📊 Performance by Source:');
  report.forEach(r => {
    const successRate = ((r.withMetrics / r.total) * 100).toFixed(1);
    const sourceLabel = r.source === 'website' ? '🌐 Website' : r.source === 'search' ? '🔎 Google Search' : '❓ Unknown';
    console.log(`\n  ${sourceLabel}:`);
    console.log(`    Total: ${r.total}`);
    console.log(`    Success Rate: ${successRate}%`);
    console.log(`    Avg Followers: ${r.avgFollowers.toLocaleString()}`);
    console.log(`    Avg IG Score: ${r.avgScore}/100`);
  });

  // Recommendation
  const websiteEffectiveness = bySource.website.filter(d => d.followers != null).length / bySource.website.length;
  const searchEffectiveness = bySource.search.filter(d => d.followers != null).length / bySource.search.length;

  console.log('\n💡 RECOMMENDATION:');
  if (websiteEffectiveness > searchEffectiveness) {
    console.log(`  Website extraction is more effective (${(websiteEffectiveness * 100).toFixed(1)}% vs ${(searchEffectiveness * 100).toFixed(1)}%)`);
    console.log(`  Consider increasing website scraping attempts before Google Search fallback`);
  } else if (searchEffectiveness > websiteEffectiveness) {
    console.log(`  Google Search Grounding is more effective (${(searchEffectiveness * 100).toFixed(1)}% vs ${(websiteEffectiveness * 100).toFixed(1)}%)`);
    console.log(`  Consider using Search Grounding as primary method`);
  }
}

/**
 * Competitor analysis (places with very high followers)
 */
function analyzeCompetitors(data) {
  console.log('\n' + '═'.repeat(100));
  console.log('🥇 PREMIUM VENUES (High IG Potential)');
  console.log('═'.repeat(100));

  const premium = data
    .filter(d => d.followers && d.followers > 50000)
    .sort((a, b) => b.followers - a.followers)
    .slice(0, 20);

  console.log(`\nTop ${premium.length} venues by followers (>50K):`);
  premium.forEach((item, i) => {
    const source = item.source === 'website' ? '🌐' : '🔎';
    console.log(`  ${i+1}. ${item.placeName.padEnd(30)} ${source} @${item.instagram}`);
    console.log(`     ${item.followers.toLocaleString()} followers • ${item.posts} posts • Score: ${item.igScore}/100`);
  });
}

/**
 * Generate recommendations
 */
function generateRecommendations(data) {
  console.log('\n' + '═'.repeat(100));
  console.log('💡 OPTIMIZATION RECOMMENDATIONS');
  console.log('═'.repeat(100));

  const recs = [];

  // High success rate
  const withMetrics = data.filter(d => d.followers != null).length;
  const successRate = (withMetrics / data.length) * 100;
  if (successRate > 80) {
    recs.push({
      priority: 'INFO',
      text: `Excellent: ${successRate.toFixed(1)}% of venues have Instagram metrics. Continue current approach.`,
    });
  } else if (successRate < 50) {
    recs.push({
      priority: 'HIGH',
      text: `Low coverage: ${successRate.toFixed(1)}% success rate. Consider improving handle extraction or Google Search timeouts.`,
    });
  }

  // Source balance
  const sourceWebsite = data.filter(d => d.source === 'website').length;
  const sourceSearch = data.filter(d => d.source === 'search').length;
  if (sourceWebsite > 0 && sourceSearch > 0) {
    const ratio = sourceWebsite / (sourceWebsite + sourceSearch);
    if (ratio < 0.3) {
      recs.push({
        priority: 'MEDIUM',
        text: `Website extraction underperforming. Only ${(ratio * 100).toFixed(1)}% from websites. Check HTML parsing logic.`,
      });
    }
  }

  // Inactive venues
  const inactive = data.filter(d => d.followers && !d.isActive).length;
  if (inactive > data.length * 0.2) {
    recs.push({
      priority: 'MEDIUM',
      text: `High inactive rate: ${((inactive / data.filter(d => d.followers).length) * 100).toFixed(1)}% haven't posted in 180+ days. Apply freshness penalty in ranking.`,
    });
  }

  // Private accounts
  const private = data.filter(d => d.isPrivate).length;
  if (private > 0) {
    recs.push({
      priority: 'LOW',
      text: `${private} private accounts found. Consider lower ranking or skip in future scrapes.`,
    });
  }

  // Display recommendations
  const byPriority = recs.sort((a, b) => ({HIGH: 1, MEDIUM: 2, INFO: 3}[a.priority] - {HIGH: 1, MEDIUM: 2, INFO: 3}[b.priority]));

  byPriority.forEach(rec => {
    const icon = rec.priority === 'HIGH' ? '🔴' : rec.priority === 'MEDIUM' ? '🟡' : '🟢';
    console.log(`\n${icon} [${rec.priority}] ${rec.text}`);
  });
}

/**
 * Export analysis to JSON
 */
async function exportAnalysis(data, outputPath = 'instagram-analysis.json') {
  const analysis = {
    timestamp: new Date().toISOString(),
    summary: {
      totalPlaces: data.length,
      withMetrics: data.filter(d => d.followers != null).length,
      successRate: Math.round((data.filter(d => d.followers != null).length / data.length) * 100),
    },
    distributions: {
      followers: calculateDistribution(data, 'followers'),
      posts: calculateDistribution(data, 'posts'),
      igScore: calculateDistribution(data, 'igScore'),
    },
    topVenues: data
      .filter(d => d.igScore)
      .sort((a, b) => b.igScore - a.igScore)
      .slice(0, 50)
      .map(d => ({
        name: d.placeName,
        instagram: d.instagram,
        followers: d.followers,
        posts: d.posts,
        score: d.igScore,
        source: d.source,
      })),
  };

  fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2));
  console.log(`\n✅ Analysis exported to: ${outputPath}`);
  return analysis;
}

/**
 * Main CLI
 */
async function main() {
  const args = process.argv.slice(2);

  try {
    console.log('📊 Loading Instagram metrics from Firestore...\n');
    const data = await loadAllMetrics();

    if (data.length === 0) {
      console.log('⚠️  No Instagram data found. Run scraping first.');
      process.exit(1);
    }

    console.log(`✅ Loaded ${data.length} venues\n`);

    // Run analyses based on flags
    if (args.includes('--full') || args.length === 0) {
      analyzeOverall(data);
      analyzeGaps(data);
      analyzeSourceEffectiveness(data);
      analyzeRanking(data);
      analyzeCompetitors(data);
      generateRecommendations(data);

      if (args.includes('--export')) {
        const outputArg = args.find(a => a.startsWith('--output'));
        const output = outputArg ? outputArg.split('=')[1] : 'instagram-analysis.json';
        await exportAnalysis(data, output);
      }
    } else {
      if (args.includes('--distribution')) analyzeOverall(data);
      if (args.includes('--gaps')) analyzeGaps(data);
      if (args.includes('--source')) analyzeSourceEffectiveness(data);
      if (args.includes('--ranking')) analyzeRanking(data);
      if (args.includes('--competitors')) analyzeCompetitors(data);
      if (args.includes('--recommendations')) generateRecommendations(data);
      if (args.includes('--export')) {
        const outputArg = args.find(a => a.startsWith('--output'));
        const output = outputArg ? outputArg.split('=')[1] : 'instagram-analysis.json';
        await exportAnalysis(data, output);
      }
    }

    console.log('\n═'.repeat(100) + '\n');
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
}

main();
