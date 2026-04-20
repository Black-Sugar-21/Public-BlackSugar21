# BlackSugar21 — Backend Architecture (Firebase Cloud Functions)

> Last updated: 2026-04-20 — deploy confirmado (7 CFs)

## Overview

Node.js Firebase Cloud Functions v2. 32 modules in `lib/`, re-exported via `index.js`.
Total: ~26 900 lines, 101 exported Cloud Functions.

---

## Module Inventory (`lib/`)

| File | Lines | Responsabilidad |
|---|---|---|
| coach.js | 5 609 | AI dating coach chat, learning, quality eval |
| ai-services.js | 3 269 | AI features: safety score, smart reply, blueprints, icebreakers |
| multi-universe-simulation.js | 2 633 | 5-stage multi-universe relationship simulation (debate pipeline) |
| simulation.js | 1 837 | Full relationship simulation (persona × persona) |
| places-helpers.js | 1 679 | Google Places helpers, Instagram extraction, caching |
| moderation.js | 1 568 | Content moderation: messages, photos, stories, RAG |
| situation-simulation.js | 1 249 | Single-situation communication approach simulation (debate pipeline) |
| shared.js | 986 | Shared utilities: language, embedding, AI tracking, rate limits, PII redaction |
| scheduled.js | 553 | Scheduled jobs: daily likes reset, deletions, match check |
| events.js | 545 | Ticketmaster / Eventbrite / Meetup event search |
| users.js | 541 | User actions: unmatch, report, block, delete |
| wingperson.js | 494 | Proactive match nudge agent |
| notifications.js | 441 | FCM push notifications and pending notification queue |
| coach-nudge-agent.js | 404 | Scheduled coach nudge push notifications |
| safety.js | 402 | Date safety check-in: schedule, cancel, respond, process |
| discovery.js | 400 | Compatible profile discovery |
| debate-psychology.js | 426 | Psychology research principles + DEBATE_CONFIG_DEFAULTS |
| coach-quality-monitor.js | 348 | Coach response quality monitoring and cross-language checks |
| stories.js | 347 | Stories: create, view, delete, batch, cleanup |
| places.js | 345 | Date suggestions and place search CFs |
| discovery-feed.js | 339 | Discovery feed endpoint |
| matches.js | 327 | Match creation trigger, message trigger |
| debate-synthesizer.js | 270 | Debate synthesizer: merges agent perspectives into final output |
| batch.js | 263 | Batch photo URL fetching and compatibility scoring |
| debate-agents.js | 290 | Debate agent prompt builder (3 psychology perspectives) |
| geo.js | 230 | Geohash encode, Haversine distance, reverse geocode |
| multiverse-places.js | 226 | Multi-universe places CF |
| debate-orchestrator.js | 243 | Debate orchestration: selects best perspective, backfills tones |
| storage.js | 219 | Profile thumbnail generation (Cloud Storage trigger) |
| testers.js | 189 | Beta tester signup and App Distribution enrollment |
| analytics.js | 123 | AI analytics dashboard and daily health check |
| geohash.js | 120 | Geohash validation/repair triggers and scheduled update |

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
| `debate-agents.js` | Builds per-agent debate prompts (3 psychology perspectives) |
| `debate-synthesizer.js` | Synthesizes multi-agent debate results into final approaches |
| `debate-orchestrator.js` | Orchestrates debate pipeline for simulateMultiUniverse |
| `debate-psychology.js` | Psychology principles data (5 stages × 3 agents) + DEBATE_CONFIG_DEFAULTS |

---

## Sistema de Debate Multi-Agente

El pipeline de debate produce enfoques con fundamentación psicológica multi-perspectiva.
Usado por `simulateMultiUniverse` (vía `debate-orchestrator.js`) y por `simulateSituation`
(vía `generateApproachesWithDebate` local en `situation-simulation.js`).

```
Phase 1: 3 perspective agents in parallel [gemini-2.5-flash-lite]
         perspectiveMaxTokens = 800, perspectiveTemperature = 0.9
         Promise.race(agentCall, timeout(perspectiveTimeoutMs=12 000ms)) per agent
         PERSPECTIVES:
           - attachment_safety      (Bowlby, Johnson, Perel)
           - social_dynamics        (Cialdini, Hofstede, Ting-Toomey)
           - communication_repair   (Gottman, Rosenberg, Byron)
         8th arg: userContext → activates rankPrinciplesByContext for reordering
                  principles by relevance before building the agent prompt

Phase 2: Synthesizer [gemini-2.5-flash]
         synthesisMaxTokens = 6 000, synthesisTemperature = 0.7
         Promise.race(synthesisCall, timeout(synthesisTimeoutMs=45 000ms))
         neutralFrame-aware: derives dating vs communication coach role priming
         Filters invalid tones post-synthesis (backfills with neutralFrame-aware defaults)

Phase 3: Scoring (scoreApproachWithDebate)
         60% heuristic + 40% LLM confidence
         +0.5 academic citation bonus
         +0.3 multi-source bonus (≥2 distinct researchers)
         -0.2 duplicate researcher penalty
         citedResearchersInSet uses strict academic regex:
           /([A-Z][a-z]{1,})(?:\s+et\s+al\.?|,\s*\d{4}|\s+\(\d{4}\)|\s+\d{4}\b)/
         (avoids false positives capturing "The", "This", "He")

Fallback tiers:
  Tier 1 — 1 perspective fails → synthesize with remaining 2
  Tier 2 — 2+ perspectives fail → single-agent generation path
  Tier 3 — synthesis fails → return best perspective by stageStrength score
```

### `generateApproachesWithDebate` en `situation-simulation.js`

`situation-simulation.js` tiene su **propia** implementación de este pipeline (no usa
`debate-orchestrator.js`). Diferencias respecto al orquestador de multi-universe:

- Los mismos 3 tiers de fallback
- `neutralFrame` siempre `false` (contexto de citas siempre)
- `synthesisTimeoutMs` = 30 000ms (vs 45 000ms en multi-universe)
- `synthesisMaxTokens` = 3 000 (bump desde 2 000 en commit `62ab498`)
- `situation` pasa como 8º arg a `generatePerspectiveApproaches` (para que `rankPrinciplesByContext` funcione)

---

## Multi-Universe Simulation — 4 Escenarios de Caché

`neutralFrame` se deriva **server-side**: `isSoloMode && !!userContext`. Nunca viene del cliente.

`CACHE_SCHEMA_VERSION = 15` (historial: v3→v4 context-adaptive → v5 fallback snippet →
v6 neutralFrame → v9 RAG enrichment → v12 debate bonuses → v13 tone array →
v14 tones post-filter + cache key prefix `multiverse_match_` →
v15 +10 principios debate 2022-2025: Métellus, Hu/Zhu/Zhang, Flicker, Itzchakov/Reis,
Lin, Randall, Spengler/Wiebe/Wittenborn, Zahl-Olsen, Mikulincer & Shaver 2024, Lenger)

| Escenario | isSoloMode | userContext | neutralFrame | Cache key |
|---|---|---|---|---|
| 1 | false (match) | presente | false | `multiverse_match_{matchId}_{lang}_{hash8}[_d1]` |
| 2 | false (match) | ausente | false | `multiverse_match_{matchId}_{lang}[_d1]` |
| 3 | true (solo) | presente | **true** | `multiverse_solo_{lang}_{hash8}[_d1]` |
| 4 | true (solo) | ausente | false | `multiverse_solo_{lang}[_d1]` |

Sufijo `_d1` se agrega cuando `cfg.debate.enabled = true` (separa slot de caché debate vs no-debate).

`hash8` = primeros 8 hex chars del SHA-256 del `userContext` en minúsculas. El cliente
genera el mismo hash byte-a-byte para consultar caché sin llamar al servidor.

---

## Remote Config — `simulation_config.debate`

Valores leídos de Remote Config y fusionados con `DEBATE_CONFIG_DEFAULTS` (floor values
aplicados vía `Math.max` para timeouts — el CF no puede bajar debajo de defaults).

| Campo | Default | Descripción |
|---|---|---|
| `enabled` | `false` | Kill switch del pipeline de debate |
| `minPerspectives` | `2` | Perspectivas mínimas para continuar a síntesis |
| `perspectiveModel` | `gemini-2.5-flash-lite` | Modelo de agentes de perspectiva |
| `perspectiveMaxTokens` | `800` | Max output tokens por perspectiva |
| `perspectiveTemperature` | `0.9` | Temperatura por perspectiva |
| `perspectiveTimeoutMs` | `12 000` | Timeout por perspectiva (ms) — floor |
| `synthesisModel` | `gemini-2.5-flash` | Modelo del sintetizador |
| `synthesisMaxTokens` | `6 000` | Max output tokens del sintetizador |
| `synthesisTemperature` | `0.7` | Temperatura del sintetizador |
| `synthesisTimeoutMs` | `45 000` | Timeout síntesis (ms) — floor |
| `parallelStages` | `true` | Ejecutar los 5 stages del multi-universe en paralelo |

---

## Kill switches (assertAiFeatureEnabled)

CFs con kill switch activo:

- `dateCoachChat` → `assertAiFeatureEnabled('coach', lang)`
- `simulateSituation` → `assertAiFeatureEnabled('situationSim', lang)`
- `simulateMultiUniverse` → `assertAiFeatureEnabled('multiUniverse', userLanguage)`
- `generateDateBlueprint`, `generateEventDatePlan`, `getPhotoCoachAnalysis` (ai-services.js)

Para activar/desactivar: Remote Config > `ai_feature_flags.<key> = false`
TTL: 5 minutos (cache RC)

---

## Patrones de seguridad aplicados

1. **Firebase v2 secrets**: toda CF que usa `geminiApiKey` DEBE declarar `secrets:[geminiApiKey]`
   y usar `geminiApiKey.value()` — `process.env.GEMINI_API_KEY` es `undefined` sin esta declaración
2. **birthDate cross-platform**: usar `.toDate ? .toDate() : new Date(birthDate)`
   (Android escribe Long, iOS escribe Firestore Timestamp)
3. **`checkGeminiSafety`** antes de `.text()` en todos los `generateContent` críticos
4. **`HttpsError` + `getLocalizedError`** en TODOS los `onCall` catch blocks
5. **`autoModerateMessage` (onDocumentCreated)**: DEBE declarar `secrets:[geminiApiKey]` —
   los triggers `onDocumentCreated` NO heredan secrets automáticamente.
   Bug confirmado: sin esta declaración, `process.env.GEMINI_API_KEY` es `undefined` →
   100% de mensajes evadían moderación IA en producción (fail-open silencioso).

---

## Test Suite

Todos los tests son estáticos (no requieren API). Total: **2 200 / 2 200 assertions**.

| Archivo | Assertions | Qué cubre |
|---|---|---|
| test-debate.js | 512 | Pipeline debate completo: perspectivas, síntesis, scoring, fallbacks, neutralFrame, tone filters, citedResearchers regex, cache schema v15, 78 principios |
| test-multiverse-usercontext.js | 311 | userContext hash, neutralFrame derivation, buildStageContext 6 params, RAG injection, STAGE_PSYCHOLOGY/CITATIONS coverage (10 langs) |
| test-multiverse-scenarios.js | 572 | 4 escenarios de caché, cache key format (`multiverse_match_` prefix), Section 9: 105 asserts de escenarios combinados |
| test-situation-sim.js | 116 | Section 9: debate robustness en situación-sim, timeouts perspectiva+síntesis, userContext 8th arg, fallback tiers, synthesisMaxTokens ≥ 3000 |
| test-shared-helpers.js | 244 | lib/shared.js: AI models, getLocalizedError 14 keys×10 langs, normalizeLanguageCode, redactEmail/Token, extractSituationSnippet |
| test-comprehensive-300.js | 333 | Edge cases, cultural, security, i18n, situación-sim general |
| test-moderation-homoglyph.js | 47 | Homoglyph attack normalization (Cyrillic/Greek lookalikes, fullwidth, zero-width) |
| test-internal-comprehensive.js | 65 | Edge cases, sim, cultura, security |
| test-discovery-v2-parity.js | — | V2 discovery feed parity (64 asserts) |
| test-multiverse.js | — | Multi-universe base |
| test-e2e-smoke.js | — | End-to-end smoke (requiere live API) |
| test-live-lang-probe.js | — | Language probe (requiere live API) |
| test-post-deploy-350.js | — | Post-deploy (requiere live API) |
| test-multiverse-places-*.js | — | Multiverse places (requiere live API) |

> Tests marcados sin conteo de assertions requieren credenciales Gemini/Places en vivo.

---

## Patrones críticos de `situation-simulation.js`

## simulateSituation — Pipeline de debate

1. `classifySituation()` → tipo de situación (dating, conflict, etc.)
2. `generateApproachesWithDebate()` — debate local con 3 perspectivas paralelas:
   - `attachment_safety` | `social_dynamics` | `communication_repair`
   - Cada perspectiva con timeout individual (12s) via `Promise.race`
   - Síntesis con timeout (30s), `neutralFrame=false` (siempre dating)
   - `situation` completa como 8º arg → `rankPrinciplesByContext` activo
3. `enrichApproachesWithAlternatives()` → 6 variaciones + `followUpTips` por approach
4. Fallback: si debate falla → single-agent `generateApproaches()`

---

### `buildStageContext` — 6 parámetros (desde v9)

```js
buildStageContext(stageId, stageName, situation, userContext, retrievedKnowledge, neutralFrame)
```

El label del bloque `userContext` en el prompt es `"BACKGROUND CONTEXT (do NOT echo in phrases)"`.
Incluye `MESSAGE DIRECTION` hint con ejemplos WRONG ❌ / RIGHT ✅ para evitar que el LLM
genere frases dirigidas al coach en lugar del match. (`debate-agents.js` tiene OVERRIDE rule
adicional que refuerza esto cuando `neutralFrame=true`.)

### Flujo de debate en `situation-simulation.js`

```
simulateSituation CF
  └─ generateApproachesWithDebate(situation, cfg, ...)  ← función local, no debate-orchestrator
       ├─ Phase 1: Promise.race × 3 (timeout 12 000ms each)
       ├─ Phase 2: Promise.race (timeout 30 000ms)
       │   synthesisMaxTokens = 3 000
       └─ Fallback Tier 1/2/3 (mismo patrón que debate-orchestrator)
```

### Patrones de `debate-orchestrator.js`

```
simulateMultiUniverse CF
  └─ generateApproachesWithDebate (via debate-orchestrator)
       ├─ Phase 1: Promise.race × 3 (timeout 12 000ms each)
       │   8th arg userContext → rankPrinciplesByContext
       ├─ Phase 2: Promise.race (timeout 45 000ms)
       │   JSON template tone es neutralFrame-aware
       │   Post-synthesis: filtra tones inválidos, backfill respetando neutralFrame
       └─ Fallback Tier 1/2/3
```

---

## Psychology RAG Enrichment

`retrieveStageKnowledge(stageId, userContext, apiKey)` consulta la colección Firestore
`coachKnowledge` por stage usando búsqueda vectorial COSINE. Resultados inyectados como
`ADDITIONAL RESEARCH` en el prompt Gemini junto a `STAGE_PSYCHOLOGY`.

- 21 RAG chunks indexados (EN) en `psychology-stages.json`
- Colecciones adicionales: `psychology-research.json` (EN general), `psychology-research-es.json` (ES), `psychology-research-multilang.json` (multi-idioma)
- Script de re-indexado: `scripts/index-psychology-knowledge.js`
- `buildStageContext` recibe `retrievedKnowledge` como 5º parámetro

Ver `SKILL.md` del skill `psychology-updater` para workflow de actualización de conocimiento.
