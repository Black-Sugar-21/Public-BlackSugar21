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
| `coachingSpecializations` | Object | Claves: `SUGAR_DADDY` (💎 Elite), `SUGAR_MOMMY` (💎 Elite), `SUGAR_BABY` (🌟 Prime) | Guia especifica por userType (WHEN SINGLE / WHEN IN A RELATIONSHIP) |
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

### `moderation_config` (5 campos)

Leido por `moderateMessage` y `autoModerateMessage`. Cache 5 min via `getModerationConfig()`.

| Campo | Tipo | Default | Rango | Descripcion |
|---|---|---|---|---|
| `rag.enabled` | Boolean | `true` | — | Kill switch Moderation RAG |
| `rag.topK` | Number | `4` | 1-10 | Chunks a seleccionar tras filtrado |
| `rag.minScore` | Number | `0.25` | 0-1 | Umbral minimo similaridad COSINE (1-distance) |
| `rag.fetchMultiplier` | Number | `3` | 1-5 | Multiplica topK para busqueda inicial Firestore |
| `rag.collection` | String | `'moderationKnowledge'` | — | Coleccion Firestore con chunks |

## Reglas de validacion

1. `daily_likes_limit` es SIEMPRE 100 — NUNCA cambiar a valores random
2. `daily_super_likes_limit` es SIEMPRE 5
3. `moderation_image_max_dimension` rango 256-1024 px
4. `moderation_image_jpeg_quality` rango 20-100%. iOS convierte a 0.0-1.0 internamente
5. `coach_max_input_length` rango 100-10000
6. `coach_daily_credits` rango 1-100
7. `ai_moderation_confidence_threshold` rango 0.0-1.0
8. CFs server-side (`coach_config`, `places_search_config`, `moderation_config`) tienen cache de 5 minutos
9. Clientes iOS/Android tienen intervalo de fetch de 3600 segundos
10. `categoryQueryMap` si es `null` o ausente, las CFs usan `DEFAULT_CATEGORY_QUERY_MAP` hardcodeado con 14 categorias bilingues
