# Instagram Monitoring Setup & Usage Guide

## Overview
Enhanced monitoring system for `placeInstagram` Firestore collection with time-series tracking, success rate analytics, and automated reporting.

---

## Quick Start

### 1. One-Time Report
Get current snapshot of Instagram scraping status:
```bash
cd /Users/daniel/IdeaProjects/Public-BlackSugar21
node scripts/monitor-instagram-collection-enhanced.js
```

**Output**: Detailed report with:
- Total documents & success rate
- Source breakdown (website extraction vs Google Search)
- Top 10 venues by followers & IG score
- Average metrics (followers, posts, scores)
- Activity tracking (last hour/24h/7 days)

---

### 2. Hourly Daemon Mode
Run continuous monitoring with hourly reports:
```bash
node scripts/monitor-instagram-collection-enhanced.js --daemon --interval=3600
```

**Features**:
- Captures metrics every hour
- Stores time-series data in `instagramMonitoringMetrics` Firestore collection
- Displays formatted report each cycle
- Press `Ctrl+C` to stop

**For background execution** (macOS/Linux):
```bash
nohup node scripts/monitor-instagram-collection-enhanced.js --daemon > logs/instagram-monitor.log 2>&1 &
echo $! > logs/instagram-monitor.pid
```

Stop background process:
```bash
kill $(cat logs/instagram-monitor.pid)
```

---

### 3. HTML Dashboard
Generate interactive web dashboard from historical data:
```bash
node scripts/monitor-instagram-collection-enhanced.js --dashboard --output=./instagram-dashboard.html
```

Then open `instagram-dashboard.html` in a browser.

**Dashboard displays**:
- 📊 Real-time KPIs (total docs, success rate, avg followers)
- 📈 30-day growth chart
- 🌐 Source effectiveness breakdown
- 🏆 Top venues rankings

---

### 4. Trend Analysis
Analyze growth patterns over past N days:
```bash
node scripts/monitor-instagram-collection-enhanced.js --analyze --days=7
```

**Metrics analyzed**:
- Document growth rate (% change)
- Success rate trend
- Daily velocity (docs/day, metrics/day)
- Projected doubling time

---

## Metrics Tracked

### Collection Size
- **Total Documents**: Total places with Instagram data
- **With Metrics**: Places with full metrics (followers, posts, score)
- **Metrics Success Rate**: % of docs with complete metrics

### Source Effectiveness
- **Website Extraction**: Handles found from place websites (🌐)
- **Google Search**: Handles found via Gemini Search Grounding (🔎)
- **Unknown**: No source recorded

### Instagram Data
- **Avg Followers**: Average follower count across venues
- **Median Followers**: Middle value (less affected by outliers)
- **Min/Max Followers**: Range of follower counts
- **Avg Posts**: Average post count per account
- **Avg IG Score**: Average ranking score (0-100)
- **Active Accounts**: Posted within 180 days
- **Private Accounts**: Private profiles

### Activity
- **Last Hour**: Documents added in last 60 min
- **Last 24h**: Documents added in last 24 hours
- **Last 7 Days**: Documents added in last 7 days

---

## Firestore Collections

### `placeInstagram` (source data)
```
Document ID: <Google Places ID>
Fields:
  - placeName: string
  - instagram: string (handle without @)
  - source: "website" | "search" | "unknown"
  - verifiedAt: Timestamp
  - followers: number
  - posts: number
  - lastPostDate: string (ISO)
  - isActive: boolean (posted within 180 days)
  - isPrivate: boolean
  - igScore: number (0-100)
```

### `instagramMonitoringMetrics` (time-series)
```
Document ID: YYYY-MM-DDTHH:00Z (hourly snapshots)
Fields:
  - timestamp: Timestamp
  - totalDocs: number
  - withMetrics: number
  - metricsSuccessRate: number (0-100)
  - avgFollowers: number
  - avgScore: number
  - sourceWebsite: number
  - sourceSearch: number
  - createdInLastHour: number
  - activeAccounts: number
```

Time-series data enables:
- Historical trends
- Growth velocity calculations
- Predictive analytics

---

## Interpreting Reports

### Success Rate Interpretation
- **> 80%**: Excellent - most venues have full Instagram data
- **50-80%**: Good - majority have metrics, some missing
- **< 50%**: Fair - significant gaps in Instagram data

### Source Breakdown Interpretation
- **Website > 60%**: Strong HTML extraction, good place website coverage
- **Search > 30%**: Good fallback effectiveness
- **Both > 80% combined**: Healthy overall coverage

### Growth Metrics
- **Growth > 10%/week**: Healthy scraping velocity
- **Success rate stable**: Algorithm working consistently
- **Active accounts > 70%**: Good quality, recently-updated venues

---

## Troubleshooting

### "No metrics available yet"
- Instagram scraping hasn't completed for any venues
- Check CloudFunction logs: `firebase functions:log --only getMultiUniversePlaces`
- Ensure `placeInstagram` collection exists in Firestore

### "Not enough data for trend analysis"
- Need at least 2+ hourly snapshots for trends
- Run in daemon mode for a few hours to collect baseline data

### Low success rate (< 50%)
- Check if `getMultiUniversePlaces` is extracting Instagram handles correctly
- Verify `extractInstagramFromWebsite` and `findInstagramViaSearch` are implemented
- Review CF logs for Instagram scraping errors

### Dashboard shows stale data
- Historical metrics stored in `instagramMonitoringMetrics` collection
- To refresh: regenerate dashboard after running monitor
- Dashboard pulls from Firestore, so older data reflects older runs

---

## Integration with CI/CD

### Scheduled Daily Report
Add to GitHub Actions (`.github/workflows/instagram-monitoring.yml`):
```yaml
name: Daily Instagram Monitoring Report

on:
  schedule:
    - cron: '0 4 * * *'  # 4 AM UTC daily

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm ci
      - name: Run monitoring
        env:
          GOOGLE_APPLICATION_CREDENTIALS: ${{ secrets.FIREBASE_CREDENTIALS }}
        run: node scripts/monitor-instagram-collection-enhanced.js
      - name: Generate dashboard
        run: node scripts/monitor-instagram-collection-enhanced.js --dashboard --output=./dashboard.html
      - name: Upload dashboard
        uses: actions/upload-artifact@v3
        with:
          name: instagram-dashboard
          path: ./dashboard.html
```

### Continuous Daemon
Run on a dedicated server/VM:
```bash
#!/bin/bash
# Start monitoring daemon
cd /Users/daniel/IdeaProjects/Public-BlackSugar21
nohup node scripts/monitor-instagram-collection-enhanced.js --daemon --interval=3600 > logs/instagram-monitor.log 2>&1 &
```

Ensure logs directory exists and has appropriate permissions.

---

## Success Criteria

After deploying Instagram scraping, you should see:

| Metric | Target | Timeline |
|--------|--------|----------|
| Total Documents | > 100 | 1 week |
| Success Rate | > 70% | 2 weeks |
| Avg Followers | > 5K | 2 weeks |
| Active Accounts | > 60% | 2 weeks |
| Website Source | > 50% | Ongoing |

Monitor these metrics to ensure scraping is working effectively.

---

## Next Steps

1. **Start daemon**: `node scripts/monitor-instagram-collection-enhanced.js --daemon`
2. **Monitor for 24-48 hours**: Collect baseline data
3. **Generate dashboard**: `node scripts/monitor-instagram-collection-enhanced.js --dashboard`
4. **Analyze trends**: `node scripts/monitor-instagram-collection-enhanced.js --analyze --days=7`
5. **Optimize**: Use insights to improve place ranking, fix low-coverage sources

---

**Last Updated**: 2026-04-16  
**Status**: ✅ Ready for Production Monitoring
