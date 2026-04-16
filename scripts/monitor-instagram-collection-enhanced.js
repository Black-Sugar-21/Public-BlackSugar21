#!/usr/bin/env node
/**
 * Enhanced Monitor: placeInstagram Firestore collection with time-series tracking
 * Tracks: success rate, metrics coverage, collection growth, source effectiveness
 * Features: Hourly automated reports, trend analysis, persistent history, dashboard
 *
 * Usage:
 *   node monitor-instagram-collection-enhanced.js [--daemon] [--interval 3600] [--report-type full]
 *   node monitor-instagram-collection-enhanced.js --dashboard [--output ./instagram-dashboard.html]
 *   node monitor-instagram-collection-enhanced.js --analyze [--days 7]
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase
if (!admin.apps.length) {
  try {
    // Try loading from .firebase-key.json first
    const credentials = require('../functions/.firebase-key.json');
    admin.initializeApp({
      credential: admin.credential.cert(credentials),
      projectId: 'black-sugar21',
    });
  } catch (err) {
    // Fallback: use Application Default Credentials or GOOGLE_APPLICATION_CREDENTIALS env var
    admin.initializeApp({
      projectId: 'black-sugar21',
    });
  }
}

const db = admin.firestore();

/**
 * Core monitoring function - captures current snapshot
 */
async function captureMetrics() {
  try {
    const snapshot = await db.collection('placeInstagram').get();
    const docs = snapshot.docs.map(d => ({...d.data(), id: d.id}));

    const now = new Date();
    const timestamp = now.getTime();
    const oneHourAgo = timestamp - 3600000;
    const oneDayAgo = timestamp - 86400000;
    const sevenDaysAgo = timestamp - (7 * 86400000);

    // Core statistics
    const stats = {
      timestamp: now.toISOString(),
      timestampMs: timestamp,

      // Collection size
      totalDocs: docs.length,

      // Instagram metrics coverage
      withMetrics: docs.filter(d => d.followers != null).length,
      withFollowers: docs.filter(d => d.followers > 0).length,
      withPosts: docs.filter(d => d.posts != null && d.posts > 0).length,
      withScore: docs.filter(d => d.igScore != null).length,
      metricsSuccessRate: 0, // % of docs with full metrics

      // Scraping source breakdown
      sourceWebsite: docs.filter(d => d.source === 'website').length,
      sourceSearch: docs.filter(d => d.source === 'search').length,
      sourceUnknown: docs.filter(d => !d.source || d.source === 'unknown').length,

      // Activity tracking
      createdInLastHour: 0,
      createdInLast24h: 0,
      createdInLast7days: 0,

      // Aggregated metrics
      avgFollowers: 0,
      avgPosts: 0,
      avgScore: 0,
      medianFollowers: 0,
      minFollowers: 0,
      maxFollowers: 0,

      // Rankings
      topByFollowers: [],
      topByScore: [],

      // Quality metrics
      activeAccounts: 0, // posted within 180 days
      privateAccounts: 0,
    };

    // Calculate success rate
    stats.metricsSuccessRate = stats.totalDocs > 0
      ? Math.round((stats.withMetrics / stats.totalDocs) * 100)
      : 0;

    // Filter docs with metrics for aggregations
    const withMetrics = docs.filter(d => d.followers != null);

    if (withMetrics.length > 0) {
      const followers = withMetrics.map(d => d.followers || 0).sort((a, b) => a - b);
      const posts = withMetrics.map(d => d.posts || 0);
      const scores = withMetrics.map(d => d.igScore || 0);

      stats.avgFollowers = Math.round(followers.reduce((a, b) => a + b) / followers.length);
      stats.avgPosts = Math.round(posts.reduce((a, b) => a + b) / posts.length);
      stats.avgScore = Math.round(scores.reduce((a, b) => a + b) / scores.length);
      stats.medianFollowers = followers[Math.floor(followers.length / 2)];
      stats.minFollowers = Math.min(...followers);
      stats.maxFollowers = Math.max(...followers);

      stats.activeAccounts = withMetrics.filter(d => d.isActive).length;
      stats.privateAccounts = withMetrics.filter(d => d.isPrivate).length;
    }

    // Time-based counts
    docs.forEach(d => {
      const verified = d.verifiedAt?.toMillis?.() || 0;
      if (verified > oneHourAgo) stats.createdInLastHour++;
      if (verified > oneDayAgo) stats.createdInLast24h++;
      if (verified > sevenDaysAgo) stats.createdInLast7days++;
    });

    // Top venues
    stats.topByFollowers = docs
      .filter(d => d.followers)
      .sort((a, b) => b.followers - a.followers)
      .slice(0, 10)
      .map((d, i) => ({
        rank: i + 1,
        place: d.placeName,
        handle: d.instagram,
        followers: d.followers,
        posts: d.posts,
        source: d.source,
      }));

    stats.topByScore = docs
      .filter(d => d.igScore)
      .sort((a, b) => b.igScore - a.igScore)
      .slice(0, 10)
      .map((d, i) => ({
        rank: i + 1,
        place: d.placeName,
        handle: d.instagram,
        score: d.igScore,
        followers: d.followers,
        source: d.source,
      }));

    return stats;
  } catch (err) {
    console.error('❌ Error capturing metrics:', err.message);
    throw err;
  }
}

/**
 * Store metrics in Firestore for time-series analysis
 */
async function storeMetrics(stats) {
  try {
    const metricsCollection = 'instagramMonitoringMetrics';
    const dateKey = new Date(stats.timestamp).toISOString().split('T')[0];
    const hourKey = `${dateKey}T${String(new Date(stats.timestamp).getHours()).padStart(2, '0')}:00Z`;

    await db.collection(metricsCollection).doc(hourKey).set({
      timestamp: new Date(stats.timestamp),
      timestampMs: stats.timestampMs,
      totalDocs: stats.totalDocs,
      withMetrics: stats.withMetrics,
      metricsSuccessRate: stats.metricsSuccessRate,
      avgFollowers: stats.avgFollowers,
      avgScore: stats.avgScore,
      sourceWebsite: stats.sourceWebsite,
      sourceSearch: stats.sourceSearch,
      createdInLastHour: stats.createdInLastHour,
      activeAccounts: stats.activeAccounts,
    });
  } catch (err) {
    console.warn('⚠️  Warning: Failed to store metrics:', err.message);
    // Don't throw - continue with reporting
  }
}

/**
 * Display formatted report
 */
function displayReport(stats, reportType = 'standard') {
  const timestamp = stats.timestamp;

  console.log('\n' + '═'.repeat(100));
  console.log('📊 INSTAGRAM MONITORING REPORT');
  console.log('═'.repeat(100));
  console.log(`⏰ Timestamp: ${timestamp}`);
  console.log('');

  // Collection Overview
  console.log('📈 COLLECTION OVERVIEW');
  console.log('─'.repeat(100));
  console.log(`  Total Documents:        ${stats.totalDocs}`);
  console.log(`  With Metrics:           ${stats.withMetrics} (${stats.metricsSuccessRate}% success rate ✅)`);
  console.log(`  With Followers Data:    ${stats.withFollowers}`);
  console.log(`  With Posts Data:        ${stats.withPosts}`);
  console.log(`  Active Accounts:        ${stats.activeAccounts} (posted within 180 days)`);
  console.log(`  Private Accounts:       ${stats.privateAccounts}`);
  console.log('');

  // Source Breakdown
  console.log('🔍 SOURCE BREAKDOWN (Scraping Effectiveness)');
  console.log('─'.repeat(100));
  const totalSources = stats.sourceWebsite + stats.sourceSearch + stats.sourceUnknown;
  if (totalSources > 0) {
    const websitePct = ((stats.sourceWebsite / totalSources) * 100).toFixed(1);
    const searchPct = ((stats.sourceSearch / totalSources) * 100).toFixed(1);
    const unknownPct = ((stats.sourceUnknown / totalSources) * 100).toFixed(1);
    console.log(`  Website Extraction:     ${stats.sourceWebsite} (${websitePct}%) 🌐`);
    console.log(`  Google Search:          ${stats.sourceSearch} (${searchPct}%) 🔎`);
    console.log(`  Unknown Source:         ${stats.sourceUnknown} (${unknownPct}%)`);
  }
  console.log('');

  // Growth Activity
  console.log('⚡ RECENT ACTIVITY (Growth Tracking)');
  console.log('─'.repeat(100));
  console.log(`  Added in Last Hour:     ${stats.createdInLastHour} documents`);
  console.log(`  Added in Last 24h:      ${stats.createdInLast24h} documents`);
  console.log(`  Added in Last 7 days:   ${stats.createdInLast7days} documents`);
  if (stats.createdInLastHour > 0) {
    console.log(`  → Avg rate: ${(stats.createdInLastHour * 24).toFixed(0)} docs/day`);
  }
  console.log('');

  // Instagram Metrics
  console.log('👥 INSTAGRAM METRICS (Aggregated)');
  console.log('─'.repeat(100));
  if (stats.withMetrics > 0) {
    console.log(`  Average Followers:      ${stats.avgFollowers.toLocaleString()}`);
    console.log(`  Median Followers:       ${stats.medianFollowers.toLocaleString()}`);
    console.log(`  Min Followers:          ${stats.minFollowers.toLocaleString()}`);
    console.log(`  Max Followers:          ${stats.maxFollowers.toLocaleString()}`);
    console.log(`  Average Posts:          ${stats.avgPosts}`);
    console.log(`  Average IG Score:       ${stats.avgScore}/100`);
  } else {
    console.log(`  No metrics available yet`);
  }
  console.log('');

  // Top Venues by Followers
  console.log('⭐ TOP 10 VENUES BY FOLLOWERS');
  console.log('─'.repeat(100));
  if (stats.topByFollowers.length > 0) {
    stats.topByFollowers.forEach(v => {
      const source = v.source === 'website' ? '🌐' : v.source === 'search' ? '🔎' : '❓';
      console.log(`  ${String(v.rank).padEnd(2)} ${source} ${v.place} (@${v.handle})`);
      console.log(`     ${v.followers.toLocaleString()} followers • ${v.posts || 'N/A'} posts`);
    });
  } else {
    console.log(`  No venues with follower data yet`);
  }
  console.log('');

  // Top Venues by IG Score
  console.log('🏆 TOP 10 VENUES BY IG SCORE');
  console.log('─'.repeat(100));
  if (stats.topByScore.length > 0) {
    stats.topByScore.forEach(v => {
      const source = v.source === 'website' ? '🌐' : v.source === 'search' ? '🔎' : '❓';
      console.log(`  ${String(v.rank).padEnd(2)} ${source} ${v.place} (@${v.handle})`);
      console.log(`     Score: ${v.score}/100 • ${v.followers?.toLocaleString() || 'N/A'} followers`);
    });
  } else {
    console.log(`  No venues with IG scores yet`);
  }
  console.log('');

  console.log('═'.repeat(100));
  console.log(`✅ Report generated at ${new Date().toLocaleTimeString()}`);
  console.log('═'.repeat(100) + '\n');
}

/**
 * Generate HTML dashboard
 */
async function generateDashboard(outputPath = './instagram-dashboard.html') {
  try {
    // Get recent metrics (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const snapshot = await db.collection('instagramMonitoringMetrics')
      .where('timestamp', '>=', thirtyDaysAgo)
      .orderBy('timestamp', 'asc')
      .get();

    const metrics = snapshot.docs.map(d => d.data());
    const currentStats = await captureMetrics();

    // Generate HTML
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Instagram Monitoring Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
        .container { max-width: 1400px; margin: 0 auto; }
        h1 { color: #1a1a1a; margin-bottom: 10px; }
        .timestamp { color: #666; font-size: 14px; margin-bottom: 30px; }

        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .card h3 { color: #666; font-size: 13px; text-transform: uppercase; margin-bottom: 10px; }
        .card .value { font-size: 32px; font-weight: 600; color: #1a1a1a; }
        .card .detail { font-size: 12px; color: #999; margin-top: 5px; }

        .card.success { border-left: 4px solid #10b981; }
        .card.warning { border-left: 4px solid #f59e0b; }
        .card.info { border-left: 4px solid #3b82f6; }

        .chart-container { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .chart-container h3 { color: #1a1a1a; margin-bottom: 20px; font-size: 16px; }
        canvas { max-height: 400px; }

        .source-breakdown { display: flex; gap: 20px; }
        .source-item { flex: 1; }
        .source-bar { height: 10px; background: #e5e7eb; border-radius: 5px; overflow: hidden; margin-top: 5px; }
        .source-bar-fill { height: 100%; background: #3b82f6; }
        .source-label { font-size: 14px; color: #1a1a1a; font-weight: 500; }
        .source-value { font-size: 12px; color: #999; margin-top: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Instagram Scraping Monitoring Dashboard</h1>
        <p class="timestamp">Last updated: ${currentStats.timestamp}</p>

        <div class="grid">
            <div class="card success">
                <h3>Total Documents</h3>
                <div class="value">${currentStats.totalDocs}</div>
                <div class="detail">places with Instagram data</div>
            </div>

            <div class="card success">
                <h3>Success Rate</h3>
                <div class="value">${currentStats.metricsSuccessRate}%</div>
                <div class="detail">${currentStats.withMetrics}/${currentStats.totalDocs} with metrics</div>
            </div>

            <div class="card info">
                <h3>Avg Followers</h3>
                <div class="value">${currentStats.avgFollowers.toLocaleString()}</div>
                <div class="detail">median: ${currentStats.medianFollowers.toLocaleString()}</div>
            </div>

            <div class="card info">
                <h3>Avg IG Score</h3>
                <div class="value">${currentStats.avgScore}/100</div>
                <div class="detail">quality metric</div>
            </div>

            <div class="card warning">
                <h3>Added Today</h3>
                <div class="value">${currentStats.createdInLast24h}</div>
                <div class="detail">${currentStats.createdInLastHour} in last hour</div>
            </div>

            <div class="card info">
                <h3>Active Accounts</h3>
                <div class="value">${currentStats.activeAccounts}</div>
                <div class="detail">posted within 180 days</div>
            </div>
        </div>

        <div class="chart-container">
            <h3>Collection Growth (Last 30 Days)</h3>
            <canvas id="growthChart"></canvas>
        </div>

        <div class="chart-container">
            <h3>Source Effectiveness</h3>
            <div class="source-breakdown">
                <div class="source-item">
                    <div class="source-label">Website Extraction 🌐</div>
                    <div class="source-value">${currentStats.sourceWebsite} (${((currentStats.sourceWebsite / (currentStats.sourceWebsite + currentStats.sourceSearch + currentStats.sourceUnknown)) * 100).toFixed(1)}%)</div>
                    <div class="source-bar"><div class="source-bar-fill" style="width: ${(currentStats.sourceWebsite / (currentStats.sourceWebsite + currentStats.sourceSearch + currentStats.sourceUnknown)) * 100}%"></div></div>
                </div>
                <div class="source-item">
                    <div class="source-label">Google Search 🔎</div>
                    <div class="source-value">${currentStats.sourceSearch} (${((currentStats.sourceSearch / (currentStats.sourceWebsite + currentStats.sourceSearch + currentStats.sourceUnknown)) * 100).toFixed(1)}%)</div>
                    <div class="source-bar"><div class="source-bar-fill" style="width: ${(currentStats.sourceSearch / (currentStats.sourceWebsite + currentStats.sourceSearch + currentStats.sourceUnknown)) * 100}%; background: #10b981;"></div></div>
                </div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div class="chart-container">
                <h3>🏆 Top 5 by Followers</h3>
                <table style="width: 100%; font-size: 13px;">
                    ${currentStats.topByFollowers.slice(0, 5).map(v => `
                    <tr style="border-bottom: 1px solid #e5e7eb; padding: 10px 0;">
                        <td>${v.rank}</td>
                        <td style="padding: 0 10px;">${v.place}</td>
                        <td style="text-align: right; color: #666;">${v.followers.toLocaleString()}</td>
                    </tr>
                    `).join('')}
                </table>
            </div>

            <div class="chart-container">
                <h3>⭐ Top 5 by IG Score</h3>
                <table style="width: 100%; font-size: 13px;">
                    ${currentStats.topByScore.slice(0, 5).map(v => `
                    <tr style="border-bottom: 1px solid #e5e7eb; padding: 10px 0;">
                        <td>${v.rank}</td>
                        <td style="padding: 0 10px;">${v.place}</td>
                        <td style="text-align: right; color: #666;">${v.score}/100</td>
                    </tr>
                    `).join('')}
                </table>
            </div>
        </div>
    </div>

    <script>
        const metrics = ${JSON.stringify(metrics)};
        const labels = metrics.map(m => new Date(m.timestamp).toLocaleDateString());

        const ctx = document.getElementById('growthChart');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Total Documents',
                    data: metrics.map(m => m.totalDocs),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.3,
                    fill: true,
                }, {
                    label: 'With Metrics',
                    data: metrics.map(m => m.withMetrics),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.3,
                    fill: true,
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'top' },
                    filler: { propagate: true }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    </script>
</body>
</html>`;

    fs.writeFileSync(outputPath, html);
    console.log(`✅ Dashboard generated: ${outputPath}`);
    return outputPath;
  } catch (err) {
    console.error('❌ Error generating dashboard:', err.message);
    throw err;
  }
}

/**
 * Analyze trends
 */
async function analyzeTrends(days = 7) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const snapshot = await db.collection('instagramMonitoringMetrics')
      .where('timestamp', '>=', startDate)
      .orderBy('timestamp', 'asc')
      .get();

    const metrics = snapshot.docs.map(d => d.data());

    if (metrics.length < 2) {
      console.log('⚠️  Not enough data for trend analysis (need at least 2 data points)');
      return;
    }

    const first = metrics[0];
    const last = metrics[metrics.length - 1];

    const docGrowth = last.totalDocs - first.totalDocs;
    const docGrowthPct = first.totalDocs > 0 ? ((docGrowth / first.totalDocs) * 100).toFixed(1) : 0;
    const metricsGrowth = last.withMetrics - first.withMetrics;
    const successRateChange = last.metricsSuccessRate - first.metricsSuccessRate;

    console.log('\n' + '═'.repeat(100));
    console.log('📈 TREND ANALYSIS (Last ' + days + ' Days)');
    console.log('═'.repeat(100));
    console.log(`Start: ${first.timestamp}`);
    console.log(`End:   ${last.timestamp}`);
    console.log('');

    console.log('📊 GROWTH METRICS');
    console.log('─'.repeat(100));
    console.log(`  Total Documents:       ${first.totalDocs} → ${last.totalDocs} (${docGrowthPct > 0 ? '+' : ''}${docGrowthPct}% change)`);
    console.log(`  Documents with Metrics: ${first.withMetrics} → ${last.withMetrics} (${metricsGrowth > 0 ? '+' : ''}${metricsGrowth} added)`);
    console.log(`  Success Rate:          ${first.metricsSuccessRate}% → ${last.metricsSuccessRate}% (${successRateChange > 0 ? '+' : ''}${successRateChange}pp)`);
    console.log('');

    // Calculate daily average growth
    const timeSpan = (last.timestampMs - first.timestampMs) / (1000 * 86400); // days
    const docsPerDay = (docGrowth / timeSpan).toFixed(1);
    const metricsPerDay = (metricsGrowth / timeSpan).toFixed(1);

    console.log('📈 DAILY VELOCITY');
    console.log('─'.repeat(100));
    console.log(`  Docs/Day:              ${docsPerDay}`);
    console.log(`  Metrics/Day:           ${metricsPerDay}`);
    if (docGrowth > 0) {
      const daysUntilDoubleSize = Math.log(2) / Math.log(1 + (docGrowth / first.totalDocs) / timeSpan);
      console.log(`  Days to 2x Size:       ${daysUntilDoubleSize.toFixed(1)} days`);
    }
    console.log('');

    console.log('✅ Analysis complete');
    console.log('═'.repeat(100) + '\n');
  } catch (err) {
    console.error('❌ Error analyzing trends:', err.message);
    throw err;
  }
}

/**
 * Main daemon/scheduler
 */
async function runDaemon(interval = 3600000) { // 1 hour default
  console.log(`🔄 Starting monitoring daemon (checking every ${(interval / 1000 / 60).toFixed(0)} minutes)...\n`);

  const runCheck = async () => {
    try {
      const stats = await captureMetrics();
      await storeMetrics(stats);
      displayReport(stats, 'standard');
    } catch (err) {
      console.error('❌ Daemon error:', err.message);
    }
  };

  // Run immediately
  await runCheck();

  // Schedule subsequent checks
  setInterval(runCheck, interval);
}

// CLI argument parsing
async function main() {
  const args = process.argv.slice(2);

  try {
    if (args.includes('--daemon')) {
      const intervalArg = args.find(a => a.startsWith('--interval'));
      const interval = intervalArg ? parseInt(intervalArg.split('=')[1]) * 1000 : 3600000;
      await runDaemon(interval);
    } else if (args.includes('--dashboard')) {
      const outputArg = args.find(a => a.startsWith('--output'));
      const outputPath = outputArg ? outputArg.split('=')[1] : './instagram-dashboard.html';
      await generateDashboard(outputPath);
    } else if (args.includes('--analyze')) {
      const daysArg = args.find(a => a.startsWith('--days'));
      const days = daysArg ? parseInt(daysArg.split('=')[1]) : 7;
      await analyzeTrends(days);
    } else {
      // Default: single report
      const stats = await captureMetrics();
      await storeMetrics(stats);
      displayReport(stats);
    }
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
}

main().then(() => {
  // Keep alive if daemon mode, otherwise exit
  if (!process.argv.slice(2).includes('--daemon')) {
    process.exit(0);
  }
});
