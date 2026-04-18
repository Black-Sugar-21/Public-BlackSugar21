'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { MODEL_PRICING, getLocalizedError } = require('./shared');

/**
 * Callable: Get AI analytics dashboard data.
 * Returns: daily totals, per-function breakdown, per-model breakdown, trends.
 */
exports.getAIAnalytics = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 30},
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', getLocalizedError('auth_required', (request.data?.userLanguage || 'en').split('-')[0].toLowerCase()));
    const db = admin.firestore();
    const days = Math.min(request.data?.days || 7, 30);

    const results = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.now() - i * 86400000).toISOString().substring(0, 10);
      const doc = await db.collection('aiAnalytics').doc(date).get();
      if (doc.exists) {
        results.push({date, ...doc.data()});
      }
    }

    // Compute summary
    const summary = {
      totalCalls: 0, totalTokens: 0, totalCostUsd: 0, totalErrors: 0,
      avgLatencyMs: 0, days: results.length,
    };
    let totalLatency = 0;
    for (const day of results) {
      summary.totalCalls += day.totalCalls || 0;
      summary.totalTokens += day.totalTokens || 0;
      summary.totalCostUsd += day.totalCostUsd || 0;
      summary.totalErrors += day.totalErrors || 0;
      totalLatency += day.totalLatencyMs || 0;
    }
    summary.avgLatencyMs = summary.totalCalls > 0 ? Math.round(totalLatency / summary.totalCalls) : 0;
    summary.errorRate = summary.totalCalls > 0 ? Math.round((summary.totalErrors / summary.totalCalls) * 10000) / 100 : 0;
    summary.avgCostPerDay = results.length > 0 ? summary.totalCostUsd / results.length : 0;
    summary.pricing = MODEL_PRICING;

    return {success: true, summary, daily: results};
  },
);

/**
 * Scheduled: Daily AI health check (5:00 AM).
 * Analyzes yesterday's AI analytics for anomalies and alerts.
 */
exports.dailyAIHealthCheck = onSchedule(
  {schedule: 'every day 05:00', region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async () => {
    const db = admin.firestore();
    const yesterday = new Date(Date.now() - 86400000).toISOString().substring(0, 10);
    const dayBefore = new Date(Date.now() - 2 * 86400000).toISOString().substring(0, 10);

    const [yDoc, dDoc] = await Promise.all([
      db.collection('aiAnalytics').doc(yesterday).get(),
      db.collection('aiAnalytics').doc(dayBefore).get(),
    ]);

    if (!yDoc.exists) {
      logger.warn('[AIHealthCheck] No analytics data for yesterday');
      return;
    }

    const y = yDoc.data();
    const d = dDoc.exists ? dDoc.data() : null;

    const alerts = [];

    // Error rate check
    const errorRate = y.totalCalls > 0 ? (y.totalErrors / y.totalCalls) * 100 : 0;
    if (errorRate > 5) {
      alerts.push(`HIGH ERROR RATE: ${errorRate.toFixed(1)}% (${y.totalErrors}/${y.totalCalls} calls)`);
    }

    // Cost spike check (>2x previous day)
    if (d && y.totalCostUsd > d.totalCostUsd * 2 && y.totalCostUsd > 0.10) {
      alerts.push(`COST SPIKE: $${y.totalCostUsd.toFixed(4)} vs $${d.totalCostUsd.toFixed(4)} previous day (${((y.totalCostUsd / d.totalCostUsd - 1) * 100).toFixed(0)}% increase)`);
    }

    // Avg latency check
    const avgLatency = y.totalCalls > 0 ? y.totalLatencyMs / y.totalCalls : 0;
    if (avgLatency > 5000) {
      alerts.push(`HIGH LATENCY: ${Math.round(avgLatency)}ms avg (target: <5000ms)`);
    }

    // Token usage anomaly
    if (d && y.totalTokens > d.totalTokens * 3 && y.totalTokens > 10000) {
      alerts.push(`TOKEN SPIKE: ${y.totalTokens} vs ${d.totalTokens} previous day`);
    }

    // Per-function error check
    const functions = y.functions || {};
    for (const [fn, stats] of Object.entries(functions)) {
      if (stats.errors > 5) {
        alerts.push(`${fn}: ${stats.errors} errors, $${(stats.costUsd || 0).toFixed(4)} cost`);
      }
    }

    // Save health report
    await db.collection('aiAnalytics').doc(yesterday).update({
      healthCheck: {
        errorRate: Math.round(errorRate * 100) / 100,
        avgLatencyMs: Math.round(avgLatency),
        totalCostUsd: y.totalCostUsd,
        alerts,
        checkedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });

    if (alerts.length > 0) {
      logger.warn(`[AIHealthCheck] ${alerts.length} ALERTS for ${yesterday}:\n${alerts.join('\n')}`);
    } else {
      logger.info(`[AIHealthCheck] ${yesterday} OK — ${y.totalCalls} calls, $${y.totalCostUsd.toFixed(4)}, ${Math.round(avgLatency)}ms avg, ${errorRate.toFixed(1)}% errors`);
    }
  },
);
