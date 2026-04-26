---
name: remote-config
description: Todas las 21 claves de Remote Config de BlackSugar21 organizadas por tipo — 12 via RemoteConfigManager, 2 UI-direct, 3 server-side JSON (coach_config 23 campos, places_search_config 21 campos, moderation_config 5 campos), 4 scheduled/referencia. Rangos, defaults y reglas de validacion. Usar cuando se trabaje con Remote Config, configuracion dinamica, o se necesite saber que campos controlan que comportamiento.
globs:
  - "functions/lib/coach.js"
  - "functions/lib/places.js"
  - "functions/lib/moderation.js"
  - "functions/lib/scheduled.js"
  - "current-remote-config.json"
---

# Remote Config — BlackSugar21 (21 claves)

**Intervalo de actualizacion**: 3600 segundos (identico iOS/Android)
**Firebase Console**: https://console.firebase.google.com/project/black-sugar21/remoteconfig

## Claves leidas por RemoteConfigManager (12)

Verificadas en codigo iOS (`RemoteConfigService.swift`) y Android (`RemoteConfigManager.kt`).

| Clave | Tipo | Default | Rango | Descripcion |
|---|---|---|---|---|
| `compatibility_weights` | JSON String | `CompatibilityWeights.default` | — | Pesos para score de compatibilidad |
| `matching_scoring_weights` | JSON String | `MatchingScoringWeights.default` | — | Pesos para MatchingScoreCalculator |
| `daily_likes_limit` | Number | `100` | SIEMPRE 100 | Limite de likes diarios |
| `daily_super_likes_limit` | Number | `5` | SIEMPRE 5 | Limite de super likes diarios |
| `max_search_radius_km` | Number | `200.0` | — | Radio maximo de busqueda en km |
| `ai_moderation_confidence_threshold` | Number | `0.80` | 0.0-1.0 | Umbral de confianza moderacion IA |
| `profile_reappear_cooldown_days` | Number | `14` | — | Dias antes de reaparecer perfil descartado |
| `bulk_query_batch_size` | Number | `30` | Limite Firestore whereIn | Tamano de batch para queries multiples |
| `minimum_age_by_country` | JSON String | `{"default": 18}` | — | Edad minima por pais |
| `enable_bio_ai_suggestions` | Boolean | `false` | — | Habilitar sugerencias de bio con IA |
| `moderation_image_max_dimension` | Number | `512` | 256-1024 | Dimension max (px) para compresion imagen moderacion |
| `moderation_image_jpeg_quality` | Number | `50` | 20-100 | Calidad JPEG (%) moderacion. iOS convierte a 0.0-1.0 |
| `gemini_tokens` | Number | `1024` | — | Max tokens para respuestas Gemini |
| `enable_screen_protection` | Boolean | `true` | — | Proteccion contra capturas/grabacion |
| `reviewer_uid` | String | `IlG6U9cfcOcnKJvEv4tAD4IZ0513,...` | — | UIDs comma-separated del reviewer. Exento de screen protection + ve test profiles en discovery + skip location update. Leido por iOS/Android y discovery.js CF |
| `enable_safety_checkin` | Boolean | `false` | — | Habilita Safety Check-In en menu de chat. Default false — habilitar cuando este listo para produccion |
| `coach_max_input_length` | Number | `2000` | 100-10000 | Largo maximo input Coach Chat |
| `coach_daily_credits` | Number | `5` | 1-100 | Creditos diarios Coach Chat |

## Claves leidas directamente por UI (2)

No pasan por RemoteConfigManager — leidas directamente en LoginView.

| Clave | Tipo | Default | Descripcion |
|---|---|---|---|
| `terms_url` | String | `"https://www.blacksugar21.com/terms"` | URL de terminos de uso |
| `privacy_url` | String | `"https://www.blacksugar21.com/privacy"` | URL de politica de privacidad |

## Claves de tienda (2)

| Clave | Tipo | Default |
|---|---|---|
| `store_url_ios` | String | `"https://testflight.apple.com/join/gSquX4CT"` |
| `store_url_android` | String | `"https://play.google.com/apps/internaltest/..."` |

## Claves de referencia — solo Firebase Console (2)

| Clave | Tipo | Default | Nota |
|---|---|---|---|
| `reviewer_test_phone` | String | `"+16505550123"` | Documentacion telefono prueba |
| `reviewer_test_code` | String | `"123456"` | Documentacion codigo OTP |

## Claves server-side JSON (3) — leidas por Cloud Functions

### `coach_config` (23 campos)

Leido por CFs del Coach. Cache 5 min. Cambiar sin redeploy.

| Campo | Tipo | Default | Descripcion |
|---|---|---|---|
| `enabled` | Boolean | `true` | Kill switch del coach |
| `dailyCredits` | Number | `5` | Creditos diarios. Leido por `resetCoachMessages` CF |
| `maxMessageLength` | Number | `2000` | Largo maximo mensaje usuario |
| `historyLimit` | Number | `10` | Mensajes de historial para contexto |
| `maxActivities` | Number | `10` | Max activity suggestions por respuesta |
| `maxSuggestions` | Number | `12` | Max quick-reply suggestions per coach response |
| `maxFreeClarifications` | Number | `3` | Max free context clarifications before charging credit |
| `clarificationChips` | Array | `["At a cafe", "At a bar/pub", "At a nightclub", "At a park", "Via chat/app", "At a restaurant"]` | Customizable context chips for clarification flow |
| `clarificationPrompt` | String | `""` | System prompt extension for clarification logic |
| `clarificationEnabled` | Boolean | `true` | Enable/disable context clarification flow |
| `maxReplyLength` | Number | `5000` | Largo maximo respuesta del coach |
| `rateLimitPerHour` | Number | `30` | Max mensajes de usuario por hora |
| `temperature` | Number | `0.9` | Temperatura de Gemini |
| `maxTokens` | Number | `2048` | Max tokens de salida Gemini |
| `personalityTone` | String | `"warm, supportive, encouraging but honest..."` | Tono de personalidad |
| `responseStyle` | Object | `{maxParagraphs:4, useEmojis:true, formalityLevel:"casual_professional", encouragementLevel:"high"}` | Formato y estilo |
| `allowedTopics` | Array | ~70 temas | Lista de temas permitidos |
| `coachingSpecializations` | Object | Claves: `ELITE` (💎 Elite), `ELITE` (💎 Elite), `PRIME` (🌟 Prime) | Guia especifica por userType (WHEN SINGLE / WHEN IN A RELATIONSHIP) |
| `stagePrompts` | Object | Claves: `no_conversation_yet`, `just_started_talking`, `getting_to_know`, `building_connection`, `active_conversation` | Prompts por etapa de relacion |
| `blockedTopics` | Array | Lista de temas off-topic | Deteccion de off-topic |
| `offTopicMessages` | Object | 10 idiomas | Mensajes de redireccion localizados |
| `safetyMessages` | Object | 10 idiomas | Mensajes de seguridad localizados |
| `additionalGuidelines` | String | `""` | Guidelines extra en system prompt |
| `edgeCaseExtensions` | String | `""` | Extensiones de edge cases inyectables sin redeploy |
| `placeSearch` | Object | (ver abajo) | Config de busqueda de lugares en coach |
| `learningEnabled` | Boolean | — | Habilitar Coach Learning System |

**`coach_config.placeSearch` subcampos:**

| Campo | Tipo | Default | Descripcion |
|---|---|---|---|
| `enableWithoutLocation` | Boolean | `true` | Busquedas sin ubicacion del usuario |
| `minActivitiesForPlaceSearch` | Number | `6` | Min actividades en busqueda explicita |
| `defaultRadius` | Number | `100000` | Radio default en metros |
| `minRadius` | Number | `3000` | Limite inferior radio dinamico |
| `maxRadius` | Number | `300000` | Limite superior radio (300km) |
| `radiusSteps` | Array | `[100000,130000,180000,250000,300000]` | Radios legacy loadMore |
| `progressiveRadiusSteps` | Array | `[15000,30000,60000,120000,200000,300000]` | Pasos de radio progresivo busqueda inicial |
| `minPlacesTarget` | Number | `30` | Min lugares antes de expandir radio |
| `loadMoreDefaultBaseRadius` | Number | `60000` | Radio base fallback loadMore (60km) |
| `loadMoreExpansionBase` | Number | `2` | Base multiplicador exponencial |
| `loadMoreMaxExpansionStep` | Number | `4` | Cap del exponente |
| `perQueryResults` | Number | `20` | Resultados por query Google Places |
| `maxPlacesIntermediate` | Number | `60` | Cap places antes de Gemini |
| `maxOutputTokensBudget` | Number | `8192` | Budget tokens Gemini con places |
| `purchaseExtraTerms` | String | `""` | Terminos extra pipe-separated para deteccion compra/regalo |

### `places_search_config` (21 campos)

Leido por CFs `getDateSuggestions` y `searchPlaces`. Cache 5 min via `getPlacesSearchConfig()`.

| Campo | Tipo | Default | Descripcion |
|---|---|---|---|
| `enabled` | Boolean | `true` | Kill switch busqueda de lugares en ChatView |
| `radiusSteps` | Array | `[100000,130000,180000,250000,300000]` | Radios para path de pageToken (backward compatible) |
| `progressiveRadiusSteps` | Array | `[15000,30000,60000,120000,200000,300000]` | Pasos de radio progresivo busqueda inicial |
| `minPlacesTarget` | Number | `30` | Min lugares antes de expandir radio |
| `minRadius` | Number | `3000` | Buffer minimo sumado a mitad distancia usuarios |
| `maxRadius` | Number | `300000` | Radio maximo (300km). `hasMore = lastRadiusUsed < maxRadius` |
| `loadMoreDefaultBaseRadius` | Number | `60000` | Radio base (60km) para expansion loadMore |
| `loadMoreExpansionBase` | Number | `2` | Base multiplicador exponencial |
| `loadMoreMaxExpansionStep` | Number | `4` | Cap exponente. Ej: base=60km, exp=2 -> step1:120km, step2:240km, step3:300km(cap) |
| `perQueryResults` | Number | `20` | Resultados por query Google Places API |
| `maxPlacesIntermediate` | Number | `60` | Cap de places unicos antes de scoring/ranking |
| `queriesWithCategory` | Number | `3` | Queries paralelas con categoria |
| `queriesWithoutCategory` | Number | `5` | Queries paralelas random sin categoria |
| `useRestriction` | Boolean | `true` | `true` = hard geo filter (restriction), `false` = soft (locationBias) |
| `photoMaxHeightPx` | Number | `400` | Altura max px fotos Google Places |
| `photosPerPlace` | Number | `5` | Max fotos por lugar |
| `travelSpeedKmH` | Number | `40` | Velocidad estimada (km/h) para tiempo de viaje |
| `maxLoadCount` | Number | `20` | Clamp maximo para loadCount en paginacion |
| `defaultLanguage` | String | `'es'` | Idioma fallback |
| `defaultCategoryQueryCount` | Number | `4` | Queries paralelas default con categoria |
| `categoryQueryMap` | Object | `null` | Override dinamico de terminos busqueda por categoria. Si null, usa `DEFAULT_CATEGORY_QUERY_MAP` (14 categorias bilingues). Helper: `getCategoryQueryMap(config)` |

### `moderation_config` (14 campos · expandido 2026-04-17)

Leido por `moderateMessage`, `autoModerateMessage` y `reportUser`. Cache 5 min via `getModerationConfig()`.

| Campo | Tipo | Default | Rango | Descripcion |
|---|---|---|---|---|
| `rag.enabled` | Boolean | `true` | — | Kill switch Moderation RAG |
| `rag.topK` | Number | `4` | 1-10 | Chunks a seleccionar tras filtrado |
| `rag.minScore` | Number | `0.25` | 0-1 | Umbral minimo similaridad COSINE (1-distance) |
| `rag.fetchMultiplier` | Number | `3` | 1-5 | Multiplica topK para busqueda inicial Firestore |
| `rag.collection` | String | `'moderationKnowledge'` | — | Coleccion Firestore con chunks |
| `reportEscalation.banThreshold` | Number | `10` | 5-20 | Reportadores únicos → ban permanente |
| `reportEscalation.suspendThreshold` | Number | `7` | 4-15 | Reportadores únicos → suspensión temporal |
| `reportEscalation.aiReviewThreshold` | Number | `5` | 2-10 | Reportadores únicos → AI review + visibility reduced |
| `reportEscalation.aiAutoSuspendConfidence` | Number | `0.8` | 0.5-1.0 | Confianza IA mínima para auto-suspender |
| `failurePolicy.profileImage` | String | `'closed'` | closed/open | Si Gemini falla → rechazar foto (safe) o aprobar |
| `failurePolicy.storyImage` | String | `'open'` | closed/open | Stories son temporales → fail-open acceptable |
| `failurePolicy.message` | String | `'open'` | closed/open | Mensajes → fail-open para no bloquear chat |
| `failurePolicy.bio` | String | `'closed'` | closed/open | Bios persisten → fail-closed safer |

### `ai_feature_flags` (15 kill switches · nuevo 2026-04-17)

Leido por `assertAiFeatureEnabled(flag, lang)` via `getAiFeatureFlags()` en `shared.js`. Cache 5 min.

| Campo | Default | Impacto si `false` |
|---|---|---|
| `smartReply` | `true` | Deshabilita sugerencias de respuesta en chat |
| `icebreakers` | `true` | Deshabilita icebreakers AI |
| `chemistry` | `true` | Deshabilita chemistry score |
| `blueprint` | `true` | Deshabilita Date Blueprint (AI + Places, cara) |
| `eventPlan` | `true` | Deshabilita Event Date Plan (Search Grounding, muy cara) |
| `photoCoach` | `true` | Deshabilita Photo Coach (Gemini Vision, muy cara) |
| `outfitAnalysis` | `true` | Deshabilita analyzeOutfit |
| `safetyScore` | `true` | Deshabilita calculateSafetyScore (fallback algorítmico sigue activo) |
| `personalityCompat` | `true` | Deshabilita analyzePersonalityCompatibility |
| `matchSuccess` | `true` | Deshabilita predictMatchSuccess |
| `interestSuggestions` | `true` | Deshabilita generateInterestSuggestions |
| `situationSim` | `true` | Deshabilita simulateSituation (Ensayar situación) |
| `multiUniverse` | `true` | Deshabilita simulateMultiUniverse (Universos Posibles) |
| `realtimeCoachTips` | `true` | Deshabilita getRealtimeCoachTips |
| `wingPerson` | `true` | Deshabilita wingPersonAnalysis (scheduled push) |

**Uso**: cuando Gemini cae, hay prompt injection detectado, o spike de costos. Un toggle en Firebase Console desactiva el feature en 5min (cache TTL) sin redeploy. El cliente recibe `failed-precondition` HttpsError con mensaje `feature_unavailable` localizado en los 10 idiomas.

### `simulation_config` (multi-universe + situation-sim debate, audit MiroFish round 9 2026-04-26)

Leido por `simulateMultiUniverse` y `simulateSituation`. Cache 5 min via `getMultiUniverseConfig()`.

#### Top-level

| Campo | Tipo | Default | Descripcion |
|---|---|---|---|
| `enabled` | Boolean | `true` | Kill switch para simulaciones (multi-universe + situation-sim) |

#### `simulation_config.debate` (multi-agent debate pipeline)

| Campo | Tipo | Default | Rango | Descripcion |
|---|---|---|---|---|
| `enabled` | Boolean | `false` | — | Kill switch maestro del debate (master ON/OFF). Si `false`, ambos CFs caen a single-agent. |
| `minPerspectives` | Number | `2` | 1-5 | Minimo de perspectivas validas para sintesis. Si valid<min → fallback single-agent |
| `perspectiveModel` | String | `'gemini-2.5-flash-lite'` | — | Modelo Gemini para perspective agents (drafts, baratos) |
| `perspectiveMaxTokens` | Number | `800` | 400-2000 | Max output tokens por perspective |
| `perspectiveTemperature` | Number | `0.9` | 0.0-1.0 | Temperatura perspective (alta = mas variacion) |
| `perspectiveTimeoutMs` | Number | `12000` | ≥5000 | Timeout por perspective (AbortController cancela Gemini call). Floor guard ≥5000ms |
| `synthesisModel` | String | `'gemini-2.5-flash'` | — | Modelo Gemini para synthesizer (output final, calidad) |
| `synthesisMaxTokens` | Number | `6000` | ≥2000 | Max output tokens synth. Floor guard ≥2000 (CJK/AR + adviceMode requieren ≥6000) |
| `synthesisTemperature` | Number | `0.7` | 0.0-1.0 | Temperatura synthesizer |
| `synthesisTimeoutMs` | Number | `45000` | ≥10000 | Timeout synth (con AbortController). Round 6 subido de 30s a 45s |
| `parallelStages` | Boolean | `true` | — | Multi-universe: 5 stages en paralelo via Promise.allSettled. Si `false`, secuencial con sleep 200ms |
| `topKPerspectives` | Number | `5` | 1-5 | Round 7: cap perspectives by `stageStrength`. `<5` slicea top-K (saves ~40% tokens stages "easy"). Default 5 (todas) |
| `abTestSplitPercent` | Number | `100` | 0-100 | Round 7: AB test split. User-hash bucket (`parseInt(userId.substring(0,8), 16) % 100`). Default 100 = todos en debate. `50` = 50/50 split. `0` = single-agent only (effectively disables) |

**Cache key behavior** (`multi-universe-simulation.js:720`):
- `cacheKey = multiverse_{base}_{lang}_{sha256_8}` + suffix `_d1` cuando `debate.enabled=true`
- Aislamiento entre toggle: cache de debate-on no contamina cache de debate-off

**AB test bucketing** (audit D round 7):
- Bucket determinista: `parseInt(userId.substring(0, 8), 16) % 100`
- Estabilidad per-usuario: mismo userId siempre va al mismo bucket
- `userInDebateBucket = userBucket < abTestSplitPercent` → si `false`, force `debate.enabled=false` para este request
- Analytics: `debateEnabled` (effective), `debateMasterEnabled` (RC), `abTestBucket` (0-99), `abSplitPercent`
- Daily counter: `aiAnalytics/multiverse/daily/{day}` con `abControlRuns` + `abTreatmentRuns`

**Telemetria nueva (round 7-9)** — daily counters per `aiAnalytics/multiverse/daily/{YYYY-MM-DD}`:
- `debateRuns`, `debateStagesSucceeded`, `debateStagesFallback`, `debatePerspectivesTotal`
- `confidenceLow` / `confidenceMid` / `confidenceHigh` (B3 calibration histogram buckets)
- `attributionDiscrepancyTotal` (B4 self-report vs trigram-measured sourceAgents)
- `abControlRuns` / `abTreatmentRuns`

### `coach_config.placeSearch` subcampos

(Ya documentado arriba en `coach_config`.)

## Reglas de validacion

1. `daily_likes_limit` es SIEMPRE 100 — NUNCA cambiar a valores random
2. `daily_super_likes_limit` es SIEMPRE 5
3. `moderation_image_max_dimension` rango 256-1024 px
4. `moderation_image_jpeg_quality` rango 20-100%. iOS convierte a 0.0-1.0 internamente
5. `coach_max_input_length` rango 100-10000
6. `coach_daily_credits` rango 1-100
7. `ai_moderation_confidence_threshold` rango 0.0-1.0
8. CFs server-side (`coach_config`, `places_search_config`, `moderation_config`, `simulation_config`) tienen cache de 5 minutos
9. Clientes iOS/Android tienen intervalo de fetch de 3600 segundos
10. `categoryQueryMap` si es `null` o ausente, las CFs usan `DEFAULT_CATEGORY_QUERY_MAP` hardcodeado con 14 categorias bilingues
11. `simulation_config.debate.synthesisMaxTokens` floor 6000 (Math.max guard upstream — situation-sim + multi-universe)
12. `simulation_config.debate.abTestSplitPercent` rango 0-100. NUNCA usar valores random — solo 0/25/50/75/100 para AB rollouts limpios.
13. `simulation_config.debate.topKPerspectives` rango 1-5. `5` = full debate (default, max calidad). `3` = top-3 by stageStrength (-40% tokens).
14. CACHE_SCHEMA_VERSION en `multi-universe-simulation.js` (actualmente **v19**). Bumpa cada vez que cambia el shape de `debateMetadata` o `approaches` (campos: `measuredSources`, `confidenceHistogram`, `attributionDiscrepancyCount`, `partial`, `phase1Ms`/`phase2Ms`).
