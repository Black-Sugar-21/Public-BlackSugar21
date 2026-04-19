# BlackSugar21 — Backend Architecture (Firebase Cloud Functions)

> Last updated: 2026-04-19

## Overview

Node.js Firebase Cloud Functions v2. 34 modules in `lib/`, re-exported via `index.js`.
Total: ~26 800 lines, 101 exported Cloud Functions.

---

## Module Inventory (`lib/`)

| File | Lines | Domain |
|---|---|---|
| coach.js | 5 644 | AI dating coach chat, learning, quality eval |
| ai-services.js | 3 293 | AI features: safety score, smart reply, blueprints, icebreakers |
| multi-universe-simulation.js | 2 600 | 5-stage multi-universe relationship simulation |
| simulation.js | 1 845 | Full relationship simulation (persona × persona) |
| places-helpers.js | 1 725 | Google Places helpers, Instagram extraction, caching |
| moderation.js | 1 598 | Content moderation: messages, photos, stories, RAG |
| situation-simulation.js | 1 070 | Single-situation communication approach simulation |
| shared.js | 1 009 | Shared utilities: language, embedding, AI tracking, rate limits |
| events.js | 593 | Ticketmaster / Eventbrite / Meetup event search |
| scheduled.js | 559 | Scheduled jobs: daily likes reset, deletions, match check |
| users.js | 547 | User actions: unmatch, report, block, delete |
| wingperson.js | 494 | Proactive match nudge agent |
| notifications.js | 452 | FCM push notifications and pending notification queue |
| coach-nudge-agent.js | 424 | Scheduled coach nudge push notifications |
| safety.js | 420 | Date safety check-in: schedule, cancel, respond, process |
| discovery.js | 400 | Compatible profile discovery |
| stories.js | 358 | Stories: create, view, delete, batch, cleanup |
| coach-quality-monitor.js | 358 | Coach response quality monitoring and cross-language checks |
| places.js | 352 | Date suggestions and place search CFs |
| discovery-feed.js | 339 | Discovery feed endpoint |
| debate-psychology.js | 334 | Psychology research principles for debate agents |
| matches.js | 332 | Match creation trigger, message trigger |
| batch.js | 269 | Batch photo URL fetching and compatibility scoring |
| debate-synthesizer.js | 241 | Debate synthesizer: merges agent perspectives |
| debate-agents.js | 241 | Debate agent prompt builder (3 psychology perspectives) |
| geo.js | 230 | Geohash encode, Haversine distance, reverse geocode |
| multiverse-places.js | 226 | Multi-universe places CF |
| storage.js | 224 | Profile thumbnail generation (Cloud Storage trigger) |
| testers.js | 189 | Beta tester signup and App Distribution enrollment |
| debate-orchestrator.js | 169 | Debate orchestration: selects best perspective |
| geohash.js | 124 | Geohash validation/repair triggers and scheduled update |
| analytics.js | 123 | AI analytics dashboard and daily health check |

---

## Exported Cloud Functions (101 total)

### AI Services (`ai-services.js`) — 22 CFs
`generateInterestSuggestions`, `analyzePhotoBeforeUpload`, `analyzeProfileWithAI`,
`calculateSafetyScore`, `analyzeConversationChemistry`, `generateSmartReply`,
`trackSmartReplyToneChoice`, `analyzePersonalityCompatibility`, `predictMatchSuccess`,
`generateConversationStarter`, `optimizeProfilePhotos`, `findSimilarProfiles`,
`getEnhancedCompatibilityScore`, `detectProfileRedFlags`, `generateIcebreakers`,
`predictOptimalMessageTime`, `getDatingAdvice`, `calculateAIChemistry`,
`generateDateBlueprint`, `generateEventDatePlan`, `getPhotoCoachAnalysis`, `analyzeOutfit`

### Coach (`coach.js`) — 13 CFs
`dateCoachChat`, `getCoachHistory`, `deleteCoachMessage`, `getRealtimeCoachTips`,
`onBlueprintShared`, `triggerDateDebriefs`, `requestDateDebrief`, `rateCoachResponse`,
`analyzeCoachQuality`, `updateCoachKnowledge`, `dailyCoachMicroUpdate`,
`evaluateCoachResponses`, `generateCoachImprovements`

### Moderation (`moderation.js`) — 9 CFs
`validateProfileImage`, `moderateProfileImage`, `moderateMessage`, `autoModerateMessage`,
`disputeModeration`, `analyzeModerationQuality`, `updateModerationKnowledge`,
`resolveDisputesDaily`, `dailyModerationMicroUpdate`

### Scheduled (`scheduled.js`) — 6 CFs
`resetDailyLikes`, `resetSuperLikes`, `resetCoachMessages`,
`checkMutualLikesAndCreateMatch`, `scheduledCheckMutualLikes`, `processScheduledDeletions`

### Stories (`stories.js`) — 6 CFs
`createStory`, `markStoryAsViewed`, `deleteStory`, `getBatchStoryStatus`,
`getBatchPersonalStories`, `cleanupExpiredStories`

### Notifications (`notifications.js`) — 6 CFs
`sendTestNotification`, `updateFCMToken`, `testDailyLikesResetNotification`,
`handlePendingNotification`, `sendTestNotificationToUser`

### Users (`users.js`) — 4 CFs
`unmatchUser`, `reportUser`, `blockUser`, `deleteUserData`

### Coach Quality Monitor (`coach-quality-monitor.js`) — 4 CFs
`monitorCoachQuality`, `evaluateResponseRelevance`, `trackRAGIntegration`,
`checkCrossLanguageConsistency`

### Batch (`batch.js`) — 3 CFs
`getBatchPhotoUrls`, `getMatchesWithMetadata`, `getBatchCompatibilityScores`

### Places (`places.js`) — 2 CFs
`getDateSuggestions`, `searchPlaces`

### Safety (`safety.js`) — 4 CFs
`scheduleDateCheckIn`, `cancelDateCheckIn`, `respondToDateCheckIn`, `processDateCheckIns`

### Geohash (`geohash.js`) — 3 CFs
`validateGeohashOnUpdate`, `updategeohashesscheduled`, `monitorGeohashHealth`

### Storage (`storage.js`) — 2 CFs
`generateProfileThumbnail`, `generateMissingThumbnails`

### Analytics (`analytics.js`) — 2 CFs
`getAIAnalytics`, `dailyAIHealthCheck`

### Simulations
- `simulation.js` → `simulateRelationship`
- `situation-simulation.js` → `simulateSituation`
- `multi-universe-simulation.js` → `simulateMultiUniverse`
- `multiverse-places.js` → `getMultiUniversePlaces`

### Other single-CF modules
- `discovery.js` → `getCompatibleProfileIds`
- `discovery-feed.js` → `getDiscoveryFeed`
- `matches.js` → `onMatchCreated`, `onMessageCreated`
- `events.js` → `searchEvents`, `trackEventInteraction`
- `wingperson.js` → `wingPersonAnalysis`
- `coach-nudge-agent.js` → `coachNudgeAgent`
- `testers.js` → `onTesterSignup`

---

## Internal Helper Modules (not in index.js)

| Module | Role |
|---|---|
| `places-helpers.js` | Google Places text search, Instagram handle resolution, place scoring |
| `geo.js` | Haversine distance, geohash encode, reverse/forward geocode |
| `shared.js` | Language instructions, embedding cache, AI tracking, rate limits, PII redaction |
| `debate-agents.js` | Builds per-agent debate prompts |
| `debate-synthesizer.js` | Synthesizes multi-agent debate results |
| `debate-orchestrator.js` | Selects best perspective from debate |
| `debate-psychology.js` | Psychology principles data (5 stages × 3 agents) |

---

## Test Suite

| File | Coverage | Last result |
|---|---|---|
| test-comprehensive-300.js | Edge cases, situation sim, cultural, security | 333 / 333 pass |
| test-moderation-homoglyph.js | Homoglyph attack normalization | ALL PASSED |
| test-multiverse-scenarios.js | Multi-universe scenarios | 467 / 467 pass |
| test-multiverse-usercontext.js | Multi-universe user context | 311 / 311 pass |
| test-internal-comprehensive.js | Edge cases, sim, culture, security, i18n | 71 / 91 pass (20 i18n infra failures — pre-existing) |
| test-debate.js | Debate system assertions | ~380 assertions |
| test-situation-sim.js | Situation simulation | pass |
| test-e2e-smoke.js | End-to-end smoke (network) | requires live API |
| test-live-lang-probe.js | Language probe (network) | requires live API |
| test-post-deploy-350.js | Post-deploy (network) | requires live API |
| test-multiverse-places-*.js | Multiverse places (network) | requires live API |

> Note: tests marked "requires live API" make real Gemini/Places API calls and will fail without credentials.
