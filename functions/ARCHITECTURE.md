# BlackSugar21 — Backend Architecture

Firebase Cloud Functions (Node.js CommonJS). Entry point: `index.js` — flat re-export of 24 lib modules.
No shared state between cold-start instances; all cross-request state lives in Firestore or Remote Config.

---

## 1. Mapa de archivos lib/

| archivo | responsabilidad | líneas | usa Gemini | costo est. |
|---|---|---|---|---|
| `coach.js` | dateCoachChat, getCoachHistory, getRealtimeCoachTips, onBlueprintShared | 5 609 | ✅ | ~$0.002/msg |
| `ai-services.js` | 22 CFs auxiliares: smartReply, icebreakers, blueprint, photoCoach, compatibility, safetyScore, etc. | 3 269 | ✅ | $0.001–$0.01/call |
| `multi-universe-simulation.js` | simulateMultiUniverse: 5 etapas × debate × caché 6 meses | 2 596 | ✅ | ~$0.375/call (debate) / $0.006 (single-agent) |
| `simulation.js` | simulateRelationship: 10 sims × 4 escenarios, agente dual | 1 823 | ✅ | ~$0.02/call |
| `places-helpers.js` | Helpers internos de Places: anti-alucinación, scoring, Instagram scraping | 1 679 | ✅ (embedding) | N/A (helper) |
| `moderation.js` | moderateProfileImage, moderateMessage, autoModerateMessage, RAG, resolución de disputas | 1 568 | ✅ | ~$0.003/call |
| `situation-simulation.js` | simulateSituation: situación abierta → 3–5 enfoques con alternativePhrases + followUpTips | 1 026 | ✅ | ~$0.006/call |
| `shared.js` | Helpers globales: rate limit, errores localizados, analytics, Gemini safety, PII redact | 966 | ✅ (embedding) | N/A (helper) |
| `scheduled.js` | Tareas cron: limpieza de caché, nudges, métricas diarias | 553 | ✅ | batch |
| `events.js` | fetchLocalEvents via Gemini Search Grounding | 545 | ✅ | ~$0.005/call |
| `users.js` | Gestión de perfil, bloqueos, reportes, escalación a ban | 541 | ❌ | N/A |
| `wingperson.js` | getWingPersonAdvice: consejo de ala contextual | 494 | ✅ | ~$0.003/call |
| `notifications.js` | FCM push, MODERATION_BLACKLIST, rate limit de reportes | 441 | ❌ | N/A |
| `coach-nudge-agent.js` | Nudge proactivo programado: sugiere usar el coach cuando el chat lleva tiempo sin respuesta | 404 | ✅ | batch |
| `safety.js` | Verificación de seguridad de perfil, safety score | 402 | ✅ | ~$0.002/call |
| `discovery.js` | getCompatibleProfileIds: filtros de orientación, edad, distancia, cooldown | 400 | ❌ | N/A |
| `debate-psychology.js` | PERSPECTIVE_AGENTS × 3, STAGE_PERSPECTIVE_PRINCIPLES (51 principios), DEBATE_CONFIG_DEFAULTS | 394 | ❌ | N/A (datos puros) |
| `coach-quality-monitor.js` | Evaluación de calidad de respuestas del coach con Claude Haiku como juez independiente | 348 | ✅ (Claude) | ~$0.0002/eval |
| `stories.js` | CRUD de historias efímeras, moderación en upload | 347 | ✅ | ~$0.002/upload |
| `places.js` | getDateSuggestions, searchPlaces: orchestration de intent → búsqueda → scoring | 345 | ✅ | ~$0.008/call |
| `discovery-feed.js` | getDiscoveryFeed: combina perfiles + fotos + historias en 1 solo call paralelo | 339 | ❌ | N/A |
| `matches.js` | Creación de matches, unmatch, lectura de perfil cruzado | 327 | ❌ | N/A |
| `batch.js` | Operaciones bulk admin: seed, migración, cleanup de datos obsoletos | 263 | ❌ | N/A |
| `geo.js` | Haversine, geocoding, midpoint, estimación de tiempo de viaje | 230 | ❌ | N/A |
| `debate-synthesizer.js` | synthesizeDebateApproaches: fusiona 3 perspectivas → 4 enfoques finales (flash) | 227 | ✅ | ~$0.004/stage |
| `multiverse-places.js` | getMultiversePlaces: wrapper CF que llama a places-helpers desde contexto multiverse | 226 | ✅ | ~$0.008/call |
| `debate-agents.js` | generatePerspectiveApproaches: genera 3 enfoques por perspectiva (flash-lite) | 226 | ✅ | ~$0.001/agent |
| `storage.js` | Upload de fotos, delete, validación de tipo/tamaño | 219 | ❌ | N/A |
| `testers.js` | Endpoints de QA: reset créditos, seed matches, bypass moderation (reviewer_uid gated) | 189 | ❌ | N/A |
| `debate-orchestrator.js` | Orquesta debate completo: Phase 1 paralelo + Phase 2 síntesis + 3 tiers de fallback | 169 | ❌ (orquestador) | N/A |
| `analytics.js` | Lectura de aiAnalytics/*, dashboard de costos y uso por función | 123 | ❌ | N/A |
| `geohash.js` | Geohash encode/decode para queries de proximidad en Firestore | 120 | ❌ | N/A |

---

## 2. Cloud Functions — Catálogo

#### `simulateMultiUniverse`
- **Auth**: sí + `coachMessagesRemaining > 0` (pool compartido con dateCoachChat, 3/día)
- **Input**: `{ matchId?, userContext? (≤500 chars), language }`
- **Output**: `{ stages[5], compatibilityScore, starRating, insights[3], debateMetadata? }`
- **RC**: `simulation_config` — claves `debate.enabled`, `debate.minPerspectives`, `gemini.approachMaxTokens`
- **Gemini**: flash-lite × 3 agentes × 5 etapas (Phase 1) + flash × 5 síntesis (Phase 2)
- **Costo real**: ~$0.375/call con debate habilitado; ~$0.006/call single-agent fallback
- **Caché**: `multiverse_{matchId|solo}_{lang}_{sha256_8}` en `multiUniverseCache/`, TTL 6 meses; `CACHE_SCHEMA_VERSION=11`
- **Modos**: `matchId` presente = match mode (carga últimos 20 mensajes); `matchId` vacío = solo practice

#### `simulateSituation`
- **Auth**: sí + `coachMessagesRemaining > 0`
- **Input**: `{ situationText, matchId?, language }`
- **Output**: `{ approaches[3–5], coachTip, alternativePhrases[3], followUpTips }`
- **RC**: `simulation_config` (enabled, betaMode, allowedUserIds, simulationCount)
- **Gemini**: flash-lite, 1 call + retry ×2
- **Costo real**: ~$0.006/call
- **Fallback**: embeds `situationText` snippet en fallback degradado cuando Gemini falla; `degraded:true` flag

#### `dateCoachChat`
- **Auth**: sí + `coachMessagesRemaining > 0`
- **Input**: `{ message, matchId?, language, mode? }`
- **Output**: `{ reply, coachTip?, placeSuggestions?, blueprintCard?, evaluationScore? }`
- **RC**: `coach_config` — modo, límites de tokens, `placeSearch.enabled`, `places.searchConfig`
- **Gemini**: flash (chat) + flash-lite (tips laterales) + flash-lite (icebreakers)
- **Claude**: Haiku (quality monitor, 20% sample)
- **RAG**: `coachKnowledge` (396 chunks) + `moderationKnowledge`
- **Costo real**: ~$0.002/mensaje, ~$0.0002 evaluación Claude
- **Side effects**: `onBlueprintShared` trigger en Firestore; geolocalización server-side para sugerencias de lugares

#### `getDiscoveryFeed`
- **Auth**: sí
- **Input**: `{ limit? (1–100, default 50), language }`
- **Output**: `{ profiles[], totalExcluded, processingMs }`
- **RC**: `profile_reappear_cooldown_days`, `reviewer_uid`
- **Gemini**: ❌
- **Nota**: Reemplaza flujo multi-call cliente (getCompatibleProfileIds + foto URLs + historias) en 1 request paralelo

#### `moderateProfileImage`
- **Auth**: sí (solo imagen propia o reviewer_uid)
- **Input**: `{ imageUrl, userId }`
- **Output**: `{ approved, confidence, reason, flags[] }`
- **RC**: `moderation_config` (rag.enabled, failPolicy: fail-closed)
- **Gemini**: flash-lite (vision) + embedding (RAG)
- **Costo real**: ~$0.003/imagen
- **Fallback**: fail-closed (rechaza si Gemini no responde)

#### `moderateMessage`
- **Auth**: sí
- **Input**: `{ message, matchId, language }`
- **Output**: `{ approved, severity, reason }`
- **RC**: `moderation_config` (rag.enabled, failPolicy: fail-open para chat)
- **Gemini**: flash-lite + NFKC normalización pre-Gemini (homoglifos, Cyrillic/Greek lookalikes)
- **Fallback**: fail-open (aprueba si Gemini no responde — chat no se bloquea)

#### `generateSmartReply`
- **Auth**: sí + `enforceAiRateLimit` (20/hora)
- **Input**: `{ matchId, language }`
- **Output**: `{ replies[3] }` — tono: direct, playful, empathetic
- **RC**: `ai_feature_flags.smartReply`
- **Gemini**: flash-lite + retry ×2
- **Costo real**: ~$0.001/call

#### `getDateSuggestions`
- **Auth**: sí
- **Input**: `{ message, matchId, language, location? }`
- **Output**: `{ places[], dominantCategory, searchQuery }`
- **RC**: `places_search_config`, `coach_config.placeSearch`
- **Gemini**: flash (intent extraction) + embedding (anti-alucinación) + Google Places API
- **Anti-alucinación**: `validateAndCorrectIntent()` + `validateDominantCategory()` sobreescriben categoría de Gemini si contradice keywords del mensaje
- **Costo real**: ~$0.008/call

---

## 3. Patrones reutilizables (shared.js)

| helper | firma | propósito |
|---|---|---|
| `checkCoachCredit` | `(db, userId, lang) → Promise<number>` | Lee `users/{uid}.coachMessagesRemaining`; lanza `resource-exhausted` si ≤ 0. Llamar ANTES de Gemini. |
| `decrementCoachCredit` | `(db, userId, admin?) → Promise<void>` | Decrementa en -1 con FieldValue.increment. Fail-open (no propaga error). Llamar DESPUÉS de Gemini. |
| `getLocalizedError` | `(key, lang) → string` | Devuelve mensaje user-facing en el idioma del usuario. 15 keys × 10 langs + regionales (pt-PT, zh-TW, zh-HK). |
| `checkGeminiSafety` | `(result, fnName?) → {ok, reason, detail}` | Inspecciona `blockReason`, `finishReason`, candidatos. `ok=false` cuando truncado o bloqueado. |
| `enforceAiRateLimit` | `(db, userId, fnName, maxPerHour?) → Promise<{allowed, remaining, retryAfterSec}>` | Rate limit por usuario × función × hora. Fail-open en error Firestore. |
| `trackAICall` | `({functionName, model, operation, usage, latencyMs, error, userId})` | Fire-and-forget a `aiAnalytics/{date}`. Atomic increments + 20% sample de detalle. |
| `trackedGenerateContent` | `(model, prompt, {functionName, operation, userId}) → Promise<result>` | Wrapper de `generateContent` que llama `trackAICall` automáticamente. |
| `assertAiFeatureEnabled` | `(flagName, userLang?) → Promise<void>` | Lanza `failed-precondition` si `ai_feature_flags[flagName] === false` en RC. |
| `normalizeForModeration` | (en moderation.js) | NFKC + homoglyph map Cyrillic/Greek/fullwidth antes de Gemini |
| `redactEmail` | `(email) → string` | `jo***@domain.com` — safe para Cloud Logging |
| `redactToken` | `(token) → string` | `abc123…xyz9` — safe para Cloud Logging |
| `parseGeminiJsonResponse` | `(text) → object\|null` | Extrae JSON de bloques ` ```json ` o texto crudo; `null` en fallo. |
| `getLanguageInstruction` | `(lang) → string` | Instrucción ⚠️ CRÍTICO por idioma para prompt final; cubre regionales zh-TW/zh-HK/pt-PT. |
| `AI_MODEL_NAME` | `= 'gemini-2.5-flash'` | Modelo para síntesis, coach, blueprint. Importar de shared, nunca hardcodear. |
| `AI_MODEL_LITE` | `= 'gemini-2.5-flash-lite'` | Modelo para operaciones de baja latencia (tips, moderation, perspectives). |

---

## 4. Sistema de Debate Multi-Agente

Activado con `simulation_config.debate.enabled = true` en Remote Config.

```
Por etapa (5 etapas en paralelo vía Promise.allSettled):

  Phase 1 — paralelo, timeout configurable (default 15s):
    [A: Attachment & Safety]  [B: Social Dynamics]  [C: Communication & Repair]
         flash-lite                flash-lite              flash-lite
         ~800 tokens               ~800 tokens             ~800 tokens
         Bowlby, Ainsworth,        Cialdini, Fisher,       Gottman, Brown,
         Johnson, Mikulincer       Aron, Ambady            Rosenberg, Chapman

  Phase 2 — síntesis, timeout configurable (default 20s):
       └──────────────────────────────┘
                    flash
                 ~6000 tokens
                     ↓
             4 enfoques finales
        (tones: direct, playful, romantic_vulnerable, grounded_honest)
```

**Fallback tiers** (debate-orchestrator.js):

| Tier | Condición | Acción |
|---|---|---|
| 1 | 1 perspectiva falla | Sintetiza con las 2 restantes (normal) |
| 2 | < `minPerspectives` (default 2) éxitos | `return null` → caller usa single-agent (`generateApproachesForMultiverse`) |
| 3 | Síntesis falla | Devuelve enfoques de la mejor perspectiva según `stageStrength[stageId]` |

**stageStrength** (0–1, guía selección de mejor perspectiva en Tier 3):

| Agente | initial_contact | getting_to_know | building_connection | conflict_challenge | commitment |
|---|---|---|---|---|---|
| A: Attachment | 0.7 | 0.8 | 1.0 | 0.9 | 0.8 |
| B: Social | 1.0 | 0.9 | 0.7 | 0.6 | 0.7 |
| C: Communication | 0.6 | 0.7 | 0.8 | 1.0 | 1.0 |

**Scoring**: `scoreApproachWithDebate(heuristic, synthesisConfidence)` = `0.6 × h + 0.4 × llm`, clamped [4, 10].

---

## 5. Remote Config — Mapa de dependencias

| clave RC | CFs que la leen | impacto si cambia |
|---|---|---|
| `simulation_config` (JSON) | `simulateMultiUniverse`, `simulateRelationship`, `simulateSituation` | Kill switch global, betaMode, debate.enabled, token budgets |
| `coach_config` (JSON) | `dateCoachChat`, `getRealtimeCoachTips` | Modos del coach, placeSearch, maxTokens, créditos extra |
| `places_search_config` (JSON) | `getDateSuggestions`, `searchPlaces`, `getMultiversePlaces` | Radio de búsqueda, min score, categorías habilitadas |
| `moderation_config` (JSON) | `moderateProfileImage`, `moderateMessage`, `autoModerateMessage` | RAG topK/minScore, escalation thresholds, failPolicy |
| `ai_feature_flags` (JSON) | Todos los CFs AI vía `assertAiFeatureEnabled` | Kill switch por feature: `smartReply`, `multiUniverse`, `situationSim`, etc. (15 flags) |
| `coach_daily_credits` | `dateCoachChat` (lectura en reset schedulado) | Cantidad de créditos que se reponen a medianoche (default 3) |
| `ai_moderation_confidence_threshold` | `autoModerateMessage`, `moderateProfileImage` | Floor de confianza para auto-acción sin revisión humana |
| `reviewer_uid` | `testers.js`, `discovery-feed.js`, `moderation.js` | UID que bypassea cooldowns y accede a endpoints de QA |

Todos los valores RC se cachean 5 min en memoria de la instancia. Fallback: valores por defecto hardcodeados en cada módulo.

---

## 6. Firestore — Colecciones principales

| colección | R/W | CFs que la usan |
|---|---|---|
| `users/{uid}` | R/W | Todos los CFs autenticados — perfil, créditos, orientación, ubicación |
| `users/{uid}/aiRateLimits/{fnName}` | R/W (transacción) | `enforceAiRateLimit` en shared.js |
| `users/{uid}/coachChat/{msgId}` | R/W | `dateCoachChat`, `getCoachHistory`, `deleteCoachMessage` |
| `users/{uid}/multiverseAnalytics/{date}` | W | `trackMultiUniverseAnalytics` en multi-universe-simulation.js |
| `matches/{id}` | R/W | `matches.js`, `dateCoachChat` (verifica membresía), `moderateMessage` |
| `multiUniverseCache/{cacheKey}` | R/W | `simulateMultiUniverse` — TTL 6 meses, CACHE_SCHEMA_VERSION=11 |
| `aiAnalytics/{date}` | W (atomic increment) | `trackAICall` — agregado diario por función y modelo |
| `aiAnalytics/{date}/calls/{id}` | W (20% sample) | `trackAICall` — detalle individual |
| `aiAnalytics/multiverse/daily/{date}` | W | `trackMultiUniverseAnalytics` — debate stats |
| `coachKnowledge` | R | `dateCoachChat`, `simulateSituation` — RAG (396 chunks) |
| `moderationKnowledge` | R | `moderateMessage`, `moderateProfileImage` — RAG |
| `simulations/{uid}` | R/W | `simulateRelationship` — historial de simulaciones de compatibilidad |

---

## 7. Suite de Tests

Todos los tests son estáticos (análisis de código fuente, sin llamadas a Gemini) salvo `test-e2e-smoke.js` y `test-live-lang-probe.js` que requieren conexión a Firebase.

| archivo | assertions | qué cubre |
|---|---|---|
| `test-comprehensive-300.js` | 333 | Regex, sanitización, guards, clamping, i18n, validación, config, safe-response |
| `test-debate.js` | 410 | debate-psychology, debate-agents, debate-synthesizer, debate-orchestrator, integración con multi-universe |
| `test-multiverse-scenarios.js` | 467 | Escenarios multiverse: match/solo, userContext, neutralFrame, caché, langs |
| `test-multiverse-usercontext.js` | 311 | userContext input: hash, longitud, caracteres especiales, integración |
| `test-post-deploy-350.js` | 311 (reportados) | Validaciones post-deploy: estructura de respuesta, RAG, debate metadata |
| `test-internal-comprehensive.js` | 71 | Core logic, helpers, serialización, edge cases |
| `test-situation-sim.js` | 41 | simulateSituation: 6 modos, estructura output, degraded flag |
| `test-moderation-homoglyph.js` | 47 | normalizeForModeration, HOMOGLYPH_MAP (Cyrillic/Greek/fullwidth) |
| `test-discovery-v2-parity.js` | 24 | Parity discovery V1 vs V2: 9 filtros, lógica de cooldown |
| `test-multiverse.js` | 36 | Caché, CACHE_SCHEMA_VERSION, input validation, score clamping |
| `test-multiverse-places-exhaustive.js` | 48 | 14 categorías × localización × edge cases |
| `test-multiverse-places-local.js` | 36 | Lógica local de places: scoring, deduplicación, fallback |
| `test-multiverse-places-robust.js` | ~30 | Places robustness: timeouts, errores de API, datos parciales |
| `test-multiverse-places-cf-validation.js` | ~30 | Validación de payload CF: tipos, rangos, campos requeridos |
| `test-e2e-smoke.js` | 6 | Live: Firestore read, RC fetch, RAG query, caché hit — requiere Firebase |
| `test-live-lang-probe.js` | ~10 | Live: probe de traducción por idioma — requiere Firebase |

**CI gate**: Los tests `test-comprehensive-300.js`, `test-debate.js`, `test-moderation-homoglyph.js`, `test-internal-comprehensive.js`, `test-multiverse-scenarios.js`, `test-multiverse-usercontext.js`, `test-situation-sim.js` corren en cada push. Total offline gate: ~1 750 assertions, <18s.

---

## 8. Patrones de seguridad críticos

### Anti-patrones a evitar

```js
// ❌ Silent catch — Gemini/Firestore errors desaparecen silenciosamente
try { ... } catch () {}

// ✅ Siempre loguear con contexto
try { ... } catch (e) { logger.warn('[FunctionName] Op failed:', e.message); }
```

```js
// ❌ HttpsError con string hardcodeado en inglés
throw new HttpsError('not-found', 'User not found');

// ✅ Mensaje localizado en el idioma del usuario
throw new HttpsError('not-found', getLocalizedError('profile_not_found', userLanguage));
```

```js
// ❌ Usar texto Gemini sin verificar safety/finish
const text = result.response.text();

// ✅ Verificar antes de usar
const safety = checkGeminiSafety(result, 'myFunction');
if (!safety.ok) { logger.warn(...); return fallback(); }
const text = result.response.text();
```

```js
// ❌ Leer secrets de Firebase v2 sin declararlos
const key = geminiApiKey.value(); // solo funciona si está en secrets:[]

// ✅ Siempre declarar en el onCall handler
exports.myFn = onCall({ secrets: ['GEMINI_API_KEY'] }, async (req) => { ... });
```

```js
// ❌ admin.firestore.FieldValue fuera del scope correcto
db.FieldValue.increment(1); // crash en runtime

// ✅ Siempre desde admin namespace
admin.firestore.FieldValue.increment(1);
```

```js
// ❌ Loguear emails o FCM tokens en claro
logger.info(`Sending to ${user.email} token=${fcmToken}`);

// ✅ Redactar antes de loguear
logger.info(`Sending to ${redactEmail(user.email)} token=${redactToken(fcmToken)}`);
```

### Reglas de rate limit

- **`coachMessagesRemaining`** (pool diario compartido): solo `dateCoachChat`, `simulateSituation`, `simulateMultiUniverse`. Leer con `checkCoachCredit`, decrementar con `decrementCoachCredit`.
- **`enforceAiRateLimit`**: para CFs AI secundarias (smartReply 20/h, safetyScore 30/h, etc.) que NO consumen el pool diario.
- CFs secundarias (icebreakers, photoCoach, eventPlan, compatibility) **NO** deben llamar a `checkCoachCredit`.

### Invariantes de caché

- Cambios en el shape del output de `simulateMultiUniverse` **requieren** bump de `CACHE_SCHEMA_VERSION` en multi-universe-simulation.js.
- La cache key incluye `sha256_8` del `userContext` — clientes (iOS/Android) y servidor deben producir el hash idéntico (lowercase, UTF-8).
- RC `simulation_config` se cachea 5 min en instancia; RC changes tardan hasta 5 min + cold-start en propagarse.
