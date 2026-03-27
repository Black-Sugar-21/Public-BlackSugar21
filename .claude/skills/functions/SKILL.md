---
name: functions
description: Gestión de Firebase Cloud Functions de BlackSugar21. Deploy, logs, debug y monitoreo — 46 callable + 11 scheduled + 7 triggers + 1 alias en us-central1. Modelos Gemini duales, RC server-side, Moderation RAG, Coach RAG/Learning. Usar cuando se quiera desplegar, debuggear, monitorear o testear Cloud Functions.
disable-model-invocation: true
argument-hint: "[nombre-funcion | all | logs | monitor]"
---

Eres el **Firebase Functions Manager de Black Sugar 21**. Gestionas las Cloud Functions del proyecto.

## Proyecto

- **Firebase Project**: `black-sugar21`
- **Región**: `us-central1`
- **Archivo principal**: `/Users/daniel/IdeaProjects/Public-BlackSugar21/functions/index.js`
- **Directorio**: `/Users/daniel/IdeaProjects/Public-BlackSugar21`

## Estado actual

### Branch activo
!`cd /Users/daniel/IdeaProjects/Public-BlackSugar21 && git branch --show-current`

### Cambios pendientes en functions/
!`cd /Users/daniel/IdeaProjects/Public-BlackSugar21 && git diff --stat HEAD -- functions/`

## Grupos de CFs por feature

### AI Date Coach (5 CFs)
```
dateCoachChat, getCoachHistory, deleteCoachMessage, resetCoachMessages, getRealtimeCoachTips
```

### AI Date Blueprint (1 CF)
```
generateDateBlueprint  // {matchId, userLanguage, duration} → {success, blueprint: {title, totalDuration, estimatedBudget, dresscode, icebreaker, steps: [{order, time, duration, activity, place: {name, photos:[{url,width,height}], googleMapsUrl, placeId, address, rating}, tip, whyThisPlace, travelTimeToNext}]}}
// ⚠️ Fotos usan GOOGLE_PLACES_API_KEY (no GEMINI_API_KEY). Título elegante sin nombre del match (max 5 palabras)
```

### AI Features (18 CFs)
```
generateSmartReply, trackSmartReplyToneChoice, analyzeConversationChemistry, analyzePersonalityCompatibility,
analyzePhotoBeforeUpload, analyzeProfileWithAI, calculateSafetyScore,
detectProfileRedFlags, findSimilarProfiles, generateConversationStarter,
generateIcebreakers, getBatchCompatibilityScores, getEnhancedCompatibilityScore,
optimizeProfilePhotos, predictMatchSuccess, predictOptimalMessageTime,
requestDateDebrief, getPhotoCoachAnalysis
```

### Safety Check-In (3 CFs)
```
scheduleDateCheckIn, cancelDateCheckIn, respondToDateCheckIn
```

### Core / Moderación (8 CFs)
```
blockUser, reportUser, unmatchUser, deleteUserData,
moderateMessage, moderateProfileImage, validateProfileImage, searchPlaces
```

### Stories / Matches / Misc (5+ CFs)
```
createStory, deleteStory, markStoryAsViewed, getBatchPersonalStories, getBatchStoryStatus,
getBatchPhotoUrls, getBatchCompatibilityScores, getCompatibleProfileIds,
getMatchesWithMetadata, getDateSuggestions, getDatingAdvice
```

### AI Chemistry (1 CF)
```
calculateAIChemistry
```

## calculateAIChemistry (NEW)

**File**: `functions/lib/ai-services.js` (line ~642)
**Type**: Callable, 512MiB, 30s timeout, requires GEMINI_API_KEY secret
**Payload**: `{ targetUserId }`
**Response**: `{ success, score (48-92), reasons[], tip, factors{algorithmic, ai, sharedInterests, ragChunksUsed}, cached }`

### Algorithm (3 layers)
1. **Client-side** (instant): 6-factor weighted algorithm in HomeViewModel
   - Interests (25), Age (15), Geo (15), Type (15), Range (10), Completeness (5)
   - Score range: 45-92% (generous for new app)
2. **Server AI** (~3s): RAG vector search + Gemini flash-lite analysis
   - Blend: 40% algorithmic + 60% AI
   - RAG queries coachKnowledge (397 chunks) for compatibility advice
3. **Cache**: Firestore `chemistryCache/{pairId}` (TTL 7 days)
   - pairId = sorted(userId1, userId2) to avoid duplicates

### Firestore Collection: chemistryCache
- `{pairId}`: score, reasons[], tip, factors{}, calculatedAt (Timestamp)
- TTL: 7 days, auto-refreshed on next request

## calculateSafetyScore — AI Safety Shield

**File**: `functions/lib/ai-services.js`
**Type**: Callable, 256MiB, 60s timeout, GEMINI_API_KEY secret

### Dual Mode
- **Mode 1 (Chat Safety)**: `{matchId, userId, userLanguage}` → reads last 15 messages, quick regex (6 patterns × 10 langs) + Gemini AI deep analysis (temperature 0.1). Detects: financial requests, platform redirects, money solicitation, love bombing, manipulation, scam patterns, inappropriate pressure, impersonation.
- **Mode 2 (Profile Safety)**: `{targetUserId}` → profile-based scoring with breakdown (photos, bio, reports).

### Response: `{success, score, safetyScore, riskLevel, flags[], concerns[], warnings[{type, message, severity}], summary, badges[], breakdown?}`

### UI Integration
- **iOS**: `SafetyShieldBanner.swift` in ChatView — color-coded (red/orange/yellow), expandable, dismiss
- **Android**: `SafetyShieldBanner.kt` in ChatView — same design, Material3 icons
- Both: triggered every 10 new messages, `Dispatchers.IO`/`Task.detached`, non-blocking UI

## generateSmartReply — Contextual AI Smart Replies (3-Tone)

**File**: `functions/lib/ai-services.js`
**Type**: Callable, 256MiB, 60s timeout, GEMINI_API_KEY secret
**Payload**: `{matchId, lastMessage, userId, userLanguage}`
**Response**: `{success, replies: [{text, tone, explanation}], suggestions: {playful, thoughtful, casual, tone, engagementTip}, executionTime}`

`replies` is the new 3-tone format; `suggestions` is kept for backward compatibility with older clients.
Reads user tone preference from `users/{userId}/aiPreferences/smartReply` (field `preferredTone`).

### Pipeline
1. Read last 8 text messages (skip place/ephemeral), truncate to 300 chars each
2. Read both user profiles (bio, interests, shared interests)
3. Read user tone preference from `aiPreferences/smartReply` (if exists)
4. RAG: embed lastMessage → top 2 chunks from coachKnowledge (4s timeout)
5. Gemini `AI_MODEL_LITE`: generate 3 tone-categorized replies (casual/flirty/deep) in user's language, weighted by preference
6. Sanitize (150 chars), validate tone (neutral/flirty/serious)
7. Build both `replies` (new) and `suggestions` (legacy) response formats
8. 10-language fallback if Gemini fails

## trackSmartReplyToneChoice — Smart Reply Tone Tracking

**File**: `functions/lib/ai-services.js`
**Type**: Callable
**Payload**: `{matchId, tone}`
**Response**: `{success}`

Tracks user's preferred reply tone. Writes to `users/{userId}/aiPreferences/smartReply`:
- Appends to `toneHistory` array: `{tone, timestamp, matchId}`
- Increments `toneCounts.{tone}` (casual/flirty/deep)
- Recalculates `preferredTone` based on highest count
- Sets `updatedAt`

## wingPersonAnalysis — Proactive Wing-Person Notifications

**File**: `functions/lib/ai-services.js`
**Type**: Scheduled every 4h, 1GiB memory, GEMINI_API_KEY secret

Analyzes matches and sends proactive push notifications via Gemini. Server-side only.

### Signal Types (5)
Detects 5 signal types across user's active matches to generate contextual nudges.

### Rate Limiting
- Max 2 notifications per user per day
- Quiet hours: 22:00-09:00 local time
- Tracks via user fields: `wingPersonLastNotifiedAt`, `wingPersonNotifCountToday`, `wingPersonLastResetDate`
- Opt-out via `wingPersonOptOut` (boolean) on user doc
- Fallback: 10 languages

### Output
Writes to `wingPersonNotifications/{id}`: `{userId, matchId, signalType, notificationBody, sentAt, language, metadata}`

## onBlueprintShared — Date Blueprint Trigger

**File**: `functions/lib/ai-services.js`
**Type**: Firestore trigger on `matches/{matchId}/messages/{messageId}`

Detects messages with `type:"date_blueprint"` and writes to `pendingDebriefs/{id}`:
`{matchId, messageId, usersMatched, blueprintTimestamp, status:"pending", createdAt}`

## triggerDateDebriefs — Scheduled Debrief Processor

**File**: `functions/lib/ai-services.js`
**Type**: Scheduled every 6h, GEMINI_API_KEY secret

Processes pending debriefs 24-48h after blueprint was shared:
1. Queries `pendingDebriefs` where `status == "pending"` and `createdAt` is 24-48h ago
2. Generates coach debrief message via Gemini
3. Writes coach message with `type: "debrief_prompt"` to coach chat
4. Updates `pendingDebriefs` status to `"triggered"`, sets `triggeredAt`
5. Creates/updates `coachChats/{userId}/debriefs/{matchId}`: `{blueprintMessageId, triggeredAt, status, matchName}`

## requestDateDebrief — Manual Debrief Trigger

**File**: `functions/lib/ai-services.js`
**Type**: Callable
**Payload**: `{matchId}`
**Response**: `{success}`

Manually triggers a date debrief in the coach chat for the authenticated user. Bypasses the 24-48h wait of `triggerDateDebriefs`.

## getPhotoCoachAnalysis — AI Photo Coach

**File**: `functions/lib/ai-services.js`
**Type**: Callable, 512MiB, 60s timeout, GEMINI_API_KEY secret
**Payload**: `{photoUrl, userId, userLanguage}`
**Response**: `{success, analysis: {overallScore (1-10), strengths[], improvements[], tips[], categoryScores: {lighting, composition, background, expression, quality}}}`

Analyzes a user's photo using Gemini vision and provides actionable feedback for dating profile optimization. Uses RAG context from `coachKnowledge` for dating-specific photo advice.

## scheduleDateCheckIn — Safety Check-In: Schedule

**File**: `functions/lib/safety.js`
**Type**: Callable, 256MiB, 30s timeout
**Payload**: `{matchId, scheduledTime (ISO8601), emergencyContactPhone?, userName}`
**Response**: `{success, checkInId}`

Creates a `dateCheckIns/{id}` doc with status `"scheduled"`. Stores FCM token from caller's `users/{userId}.fcmToken`. Both iOS and Android MUST send identical payloads.

## cancelDateCheckIn — Safety Check-In: Cancel

**File**: `functions/lib/safety.js`
**Type**: Callable, 256MiB, 30s timeout
**Payload**: `{checkInId}`
**Response**: `{success}`

Sets status to `"cancelled"` if current status is `"scheduled"` or `"check_in_sent"`. Rejects if already responded/alerted.

## respondToDateCheckIn — Safety Check-In: Respond

**File**: `functions/lib/safety.js`
**Type**: Callable, 256MiB, 30s timeout
**Payload**: `{checkInId, response ("ok"|"sos")}`
**Response**: `{success}`

Updates status to `"ok_responded"` or `"sos_responded"`. If SOS: immediately creates `pendingEmergencyAlerts/{id}` for emergency contact notification. Both iOS and Android MUST send identical payloads.

## processDateCheckIns — Safety Check-In: Scheduled Processor

**File**: `functions/lib/safety.js`
**Type**: Scheduled every 5 min, 512MiB, 120s timeout

Processes the check-in lifecycle:
1. Finds `dateCheckIns` where `status == "scheduled"` and `scheduledTime <= now` → sends FCM push, sets status `"check_in_sent"`
2. Finds `status == "check_in_sent"` past reminder threshold → sends reminder FCM, sets status `"follow_up_sent"`
3. Finds `status == "follow_up_sent"` past emergency threshold → creates `pendingEmergencyAlerts`, sets status `"emergency_alerted"`

Thresholds configurable via `appConfig/safetyCheckIn`: `reminderDelayMinutes` (default 15), `emergencyDelayMinutes` (default 30), `batchLimit` (default 50).

## generateIcebreakers — RAG-enhanced AI Icebreakers

**File**: `functions/lib/ai-services.js`
**Type**: Callable, 256MiB, 60s timeout, GEMINI_API_KEY secret
**Payload**: `{ userId1, userId2 }`
**Response**: `{ success, icebreakers: [{message, reasoning, emoji}], starters: [String] }`

### Pipeline
1. Read both user profiles from Firestore (name, bio, interests, userType, age, deviceLanguage)
2. Normalize language (`es-CL` → `es`), detect shared interests
3. **Edge cases**: no bio + no interests → multilingual fallback; no API key → fallback
4. **RAG retrieval**: embed query based on shared interests → `coachKnowledge` vector search → top 2 chunks
   - Travel interests → `icebreakers_travel` chunk
   - Food interests → `icebreakers_food` chunk
   - Empty profiles → `icebreakers_sparse` chunk
   - Age gap → `icebreakers_agegap` chunk
5. Gemini `AI_MODEL_LITE` generates 3 icebreakers with RAG context + profile data
6. Style variation: 1 playful, 1 thoughtful, 1 creative
7. Sanitize: truncate message 200 chars, emoji 4 chars, filter empty
8. Fallback: 10-language starters if AI fails

### RAG Icebreaker Categories (11 specialized)
`icebreakers` (10 langs), `icebreakers_travel`, `icebreakers_food`, `icebreakers_fitness`, `icebreakers_music`, `icebreakers_culture`, `icebreakers_nature`, `icebreakers_movies`, `icebreakers_nightlife`, `icebreakers_pets`, `icebreakers_sparse`, `icebreakers_agegap`

### UI Integration
- **Android**: `NewMatchView.kt` shows 3 icebreaker chips in NewMatchDialog (shimmer → fade-in)
- **iOS**: `NewMatchIcebreakersView.swift` fullscreen cover with gold/purple gradient, 3 icebreaker buttons
- Both: tapping icebreaker → opens chat with message pre-filled

## Workflow según argumento `$ARGUMENTS`

- **nombre-funcion**: deploy solo esa CF → `firebase deploy --only functions:<nombre> --force`
- **all**: deploy TODAS las CFs → `firebase deploy --only functions --force`
- **logs**: ver logs de las últimas CFs activas
- **monitor**: ejecutar health monitor del Coach
- **(vacío)**: preguntar qué acción realizar

## Comandos de deploy

```bash
cd /Users/daniel/IdeaProjects/Public-BlackSugar21

# Deploy CFs específicas (recomendado)
firebase deploy --only functions:dateCoachChat,functions:getCoachHistory --force

# Deploy coach completo
firebase deploy --only functions:dateCoachChat,functions:getCoachHistory,functions:deleteCoachMessage,functions:resetCoachMessages,functions:getRealtimeCoachTips --force

# Deploy todas las CFs
firebase deploy --only functions --force
```

## Logs y debug

```bash
cd /Users/daniel/IdeaProjects/Public-BlackSugar21

# Logs de una CF específica
firebase functions:log --only dateCoachChat | tail -50

# Logs filtrados (errores del Coach)
firebase functions:log --only dateCoachChat | grep -E "(Merge|Place search|API error|realPlaces|ERROR)"

# Health monitor Coach
node scripts/coach-health-monitor.js --minutes=60
node scripts/coach-health-monitor.js --fix
node scripts/coach-health-monitor.js --dry-run
```

## Reglas

- SIEMPRE usar `--force` en los deploys (evita confirmación interactiva)
- SIEMPRE especificar nombres de CFs explícitamente (no `--only functions` a menos que sea necesario)
- NUNCA deploy sin verificar el diff primero
- Verificar build exitoso antes de reportar éxito
- Reportar al final: CFs desplegadas, versión, tiempo

## CF Count Total

- **46 callable** (producción) + **6 admin/test** (no prod)
- **11 scheduled** (timezone-aware via `timezoneOffset`)
- **7 triggers** (Firestore + Storage events)
- **1 alias**

### Modelos Gemini (Dual Architecture)

| Modelo | Constante | Uso |
|---|---|---|
| `gemini-2.5-flash` | `AI_MODEL_NAME` | CFs pesadas: dateCoachChat, analyzeProfileWithAI, analyzePersonalityCompatibility, generateConversationStarter, etc. |
| `gemini-2.5-flash-lite` | `AI_MODEL_LITE` | CFs ligeras: autoModerateMessage, moderateMessage, moderateProfileImage, reportUser, generateInterestSuggestions, getRealtimeCoachTips, generateSmartReply |

**⚠️ Clientes iOS/Android NO ejecutan Gemini localmente** — TODA la IA es server-side.

### RAG Systems (server-side)

| Sistema | Colección | Chunks | Uso |
|---|---|---|---|
| Coach RAG | `coachKnowledge` | 397 chunks (70 categorías, 12+ idiomas) | `dateCoachChat` — enriquece respuestas con dating advice curado |
| Moderation RAG | `moderationKnowledge` | 93 chunks (13 categorías, 10 idiomas) | `moderateMessage` + `autoModerateMessage` |

Embedding: `gemini-embedding-001` (768 dims, COSINE). Configurables via RC: `coach_config.rag` y `moderation_config.rag`.

### Coach Learning System

`analyzeUserMessage()` → `buildLearningContext()` → `updateCoachLearning()`. Almacena en `coachChats/{userId}.learningProfile` + `coachInsights/global`. Config: `coach_config.learningEnabled`. Los clientes NO necesitan cambios.

### Scheduled CFs (timezone-aware)

```
resetDailyLikes         → every 1h, (UTCHour + timezoneOffset) % 24 === 0, siempre 100
resetSuperLikes         → every 1h, misma lógica timezone, siempre 5 (NOTIFICACIONES DESHABILITADAS — super likes pausados en UI, reemplazados por Coach IA questions)
cleanupExpiredStories   → every 1h, elimina Firestore + Storage
checkMutualLikes...     → every 5min
processScheduledDeletion→ every 1h
updategeohashesscheduled→ every 24h
monitorGeohashHealth    → every 6h
resetCoachMessages      → every 1h, lee coach_config.dailyCredits de RC
wingPersonAnalysis      → every 4h, analyzes matches, sends proactive push via Gemini. 1GiB. 5 signal types. Rate limit 2/day. Quiet hours 22-9
triggerDateDebriefs     → every 6h, processes pending debriefs 24-48h after blueprint shared, sends coach message
processDateCheckIns    → every 5min, 512MiB, 120s. Processes safety check-in lifecycle: send FCM, reminders, emergency alerts. Configurable via appConfig/safetyCheckIn
```

### Modules
- `functions/index.js` — main entry, exports all CFs
- `functions/lib/ai-services.js` — AI callable + scheduled CFs (coach, blueprint, chemistry, smart reply, icebreakers, photo coach, etc.)
- `functions/lib/safety.js` — Safety Check-In CFs (scheduleDateCheckIn, cancelDateCheckIn, respondToDateCheckIn, processDateCheckIns)
- `functions/lib/coach.js` — Coach chat pipeline, intent extraction, places search
- `functions/lib/geo.js` — Geocoding, geohash utilities

### Line Map (index.js)

| CF/función | Línea aprox |
|---|---|
| `dateCoachChat` start | L3349 |
| `fuzzyMatchPlace()` | L4882 |
| `fetchCoachPlaces()` | ~L3500 |
| `placesTextSearch()` | ~L3600 |

### Places Search Config (`places_search_config` RC)

21 campos clave: `progressiveRadiusSteps` (default `[15000,30000,60000,120000,200000,300000]`), `minPlacesTarget` (30), `loadMoreExpansionBase` (2), `loadMoreMaxExpansionStep` (4), `maxRadius` (300000), `categoryQueryMap` (14 categorías bilingüe). `computedMinR = haversineKm(u1,u2)/2*1000 + minRadius`.

### autoModerateMessage Pipeline

`type:"text"` SOLO. Ignora `ephemeral_photo` y `place`.
1. BLACKLIST (~100+ terms EN/ES/PT/FR/DE + variantes con símbolos)
2. SHA-256 cache (`moderationCache`, TTL 1h, VERSION=3)
3. Quick filters: URLs (`t.me/`, `wa.me/`), phones, emails, chars repetitivos
4. RAG context (lee `deviceLanguage` del sender + `getModerationConfig()` en paralelo)
5. Gemini `gemini-2.5-flash-lite` → JSON `{approved, category, severity, confidence, reason}`
6. Cache write
7. Message marking si flaggeado
8. Auto-report a `reports` si severity `"high"`
9. Audit trail en `moderatedMessages`

## Troubleshooting común

| Error | Causa | Fix |
|-------|-------|-----|
| `locationRestriction circle 400` | Formato incorrecto Places API | Usar bounding box rectangle |
| Merge 0/N matched | fuzzyMatchPlace insuficiente | Ver L4882 en index.js |
| Ghost messages | Gate `coachMessageId` ausente | Verificar client-side gate |
| `gemini-2.0-flash` deprecated | Modelo obsoleto (Jun 1 2026) | Migrar a `gemini-2.5-flash-lite` |
| Stories no aparecen | Falta `isPersonal == true` en query | Agregar filtro obligatorio |
| Coach loadMore sin resultado | `lastRadiusUsed` no en caché | Fallback a `loadMoreDefaultBaseRadius` (60km) |
| `ReferenceError: lmLastRadius is not defined` | `let lmLastRadius` declarado dentro de bloque `try` pero referenciado fuera | Mover declaración al scope padre (antes del `if (placesKey)`) — `coach.js` |
| `Unexpected end of JSON input` en intent extraction | `maxOutputTokens: 256` muy bajo → Gemini trunca JSON de extracción de intent | Aumentar a `maxOutputTokens: 512` y simplificar prompt de intent — `coach.js` |
| `forwardGeocode` nunca se llama al mencionar otra ciudad | Intent extraction fallaba (JSON truncado) → no detectaba ciudad mencionada | Fix de maxOutputTokens + regex fallback multilingüe (ES/EN/PT/FR/DE) — `coach.js` |

## Detección de ciudad por regex (fallback)

Cuando Gemini intent extraction falla, regex detecta patrones de viaje en **55 patrones en 12 idiomas** (ES/EN/PT/FR/DE/IT/JA/ZH/RU/AR/ID/KO/TR) cubriendo 9 casos de uso:
- **Viaje:** `"voy a Buenos Aires"`, `"going to Paris"`, `"vou para SP"`
- **Preguntas:** `"qué hacer en Madrid"`, `"things to do in London"`
- **Recomendaciones:** `"bares en Medellín"`, `"restaurants in Tokyo"`
- **Coloquial:** `"qué onda en CDMX"`, `"hitting up NYC"`, `"rolê em SP"`
- **Condicional:** `"si voy a Córdoba"`, `"when I get to Berlin"`
- **Relaciones:** `"mi novia vive en Lima"`, `"my match is in Tokyo"`
- **Curiosidad:** `"cómo es Roma"`, `"tell me about Barcelona"`
- **Solo travel:** `"mochilero en Perú"`, `"digital nomad in Bali"`
- **Contexto de vida:** `"I live in Prague"`, `"trabajo en Miami"`

Filtro anti-falsos-positivos con `skipWords` set. Si detecta ciudad → llama a `forwardGeocode` en `geo.js` → override de coordenadas para Places search.

### Suggestion chip — ciudad correcta

El chip `"📍 Lugares en X"` ahora usa la **ciudad mencionada** (no el GPS del usuario) cuando hay location override activo. Fix: se pasa `mentionedCity` al builder de suggestions.

## Location Override Instruction

Cuando el usuario menciona otra ciudad (ej. "Buenos Aires") y Places search se ejecuta con coordenadas de esa ciudad:
- Se genera `locationOverrideInstruction` para Gemini
- Indica que los REAL PLACES provienen de la ciudad mencionada, NO del GPS del usuario
- Evita que Gemini diga "mis recomendaciones son para tu ciudad local" cuando muestra resultados de otra ciudad

### Cache propagation (overrideLat/overrideLng)

Cuando `forwardGeocode` resuelve una ciudad, las coordenadas override (`overrideLat`/`overrideLng`) se almacenan en `placesCache` junto con los resultados. El path de `loadMore` lee estas coordenadas del caché para mantener la búsqueda en la ciudad mencionada sin necesidad de re-geocodificar.

## Coach RAG — 307 chunks, 80+ categorías (actualizado)

- **Colección**: `coachKnowledge`
- **307 chunks**, 80+ categorías ampliadas:
  - **11 icebreaker especializados**: `icebreakers` (10 idiomas genéricos) + `icebreakers_travel`, `icebreakers_food`, `icebreakers_fitness`, `icebreakers_music`, `icebreakers_culture`, `icebreakers_nature`, `icebreakers_movies`, `icebreakers_nightlife`, `icebreakers_pets`, `icebreakers_sparse` (empty profiles), `icebreakers_agegap` (age gap matches) — todos `multi` language
  - **10 florist**: `florist_guide` (10 idiomas), `date_flowers` (10 idiomas)
  - **10 liquor**: `liquor_gift` (10 idiomas)
  - **10 takeaway**: `takeaway_gift` (10 idiomas)
  - `travel_dating` (13 langs), `long_distance` (11), `travel_safety` (12)
  - `expat_dating`, `business_trip_dating`, `study_abroad_dating`, `language_barrier`
  - `festival_dating`, `digital_nomad`, `budget_dating`, `relocation_dating`, `first_time_abroad`
  - `cultural_dating_latam` (AR/CL/CO/MX/PE/BR), `cultural_dating_europe` (ES/FR/IT/DE/UK)
  - `cultural_dating_asia` (JP/KR/CN/IN/TH/SEA), `cultural_dating_mena` (UAE/TR/MA/LB/EG)
  - `cultural_dating_other` (AU/NZ/ZA/KE/NG/GH)
  - `nightlife_dating`, `city_exploration`, `solo_dating`, `visiting_connections`, `match_other_city`
  - **13 cuisine**: `cuisine_arabic`, `cuisine_chinese`, `cuisine_french`, `cuisine_fusion`, `cuisine_indian`, `cuisine_italian`, `cuisine_japanese`, `cuisine_korean`, `cuisine_mediterranean`, `cuisine_mexican`, `cuisine_peruvian`, `cuisine_thai`, `cuisine_vegan`
  - **6 gift**: `gift_chocolate`, `gift_flowers`, `gift_jewelry`, `gift_perfume`, `gift_wine`, `gift_general`
  - **10 date type**: `date_adventure`, `date_bar`, `date_budget`, `date_cafe`, `date_cultural`, `date_nightlife`, `date_outdoor`, `date_seasonal`, `date_spa`, `date_special_occasion`
- **141 chunks nuevos** agregados via 4 scripts de seed: `seed-coach-rag-travel.js`, `v2.js`, `v3.js`, `seed-coach-rag-cuisine-shopping.js`
- Embedding: `gemini-embedding-001` (768 dims, COSINE)
- **Language-aware ranking**: user_lang → en → other, dedup por categoría, top 3

## Coach Search Pipeline — Cocina + Compras + Lugares (actualizado)

### Cuisine Search
- **placeTypePattern**: +80 términos de cocina en 10 idiomas (árabe, china, italiana, mexicana, japonesa, tailandesa, india, peruana, coreana, francesa, griega, turca, vietnamita, brasileña, mediterránea, asiática, vegana, vegetariana, fusión, criolla, nikkei, tex-mex + platos: dim sum, hot pot, pho, pad thai, curry, tandoori, hummus, shawarma, falafel, kebab, bibimbap, ramen, dumpling, poke bowl)
- **Intent extraction**: `cuisineType` (59 tipos), mapeo plato→restaurante (shawarma→arabic, pad thai→thai)
- **cuisineInstruction**: 3 escenarios (muchos/pocos/cero resultados) + `cuisineAlternatives` map (59 cocinas→alternativas similares)
- **Zero resultados**: NUNCA vacío — sugiere alternativas similares con entusiasmo + tip de cocina
- **Cuisine fallback queries**: query principal + query alternativa automática (arabic→mediterranean, chinese→asian, etc.)
- **CATEGORY_TO_PLACES_TYPE.restaurant**: 27 subtipos Google Places

### Shopping/Purchase Search
- **`searchType`**: nuevo campo intent: `"eat"` (cocina), `"buy"` (compras), `"visit"` (actividades)
- **Mapeo compras→categoría**: chocolates/dulces→`bakery`, flores/joyas/regalos/perfume→`shopping_mall`
- **Intent prompt mejorado**: mapeo explícito de 9 tipos de productos→queries de tiendas (chocolatería, florería, joyería, perfumería, vinoteca, pastelería, heladería, boutique, tienda de regalos)
- **`isBuySearch` flag**: evita agregar queries de restaurante, agrega fallback de tiendas especializadas
- **Gemini shopping instruction**: priorizar tiendas especializadas > department stores > genéricos + tip romántico sobre el producto
- **`purchaseVerbs` expandido**: +3 patterns EN (`gift ideas`, `what to buy/get/give`, `best gift`)
- **Cache**: `searchType` persistido en `placesCache.intent` para loadMore

### Shared
- **Cache completo**: `placesCache.intent = {placeType, googleCategory, locationMention, cuisineType, searchType}`
- **loadMore hereda**: cuisine, searchType, location override del cache
- **RC extensible**: `coach_config.placeSearch.purchaseExtraTerms` — agregar términos sin redeploy

### Cobertura por idioma (10)
| Idioma | Purchase verbs | Products | Cuisine patterns |
|--------|---------------|----------|------------------|
| ES | comprar, regalar, buscar | chocolates, flores, helados | comida árabe/china/italiana... |
| EN | buy, shop, gift, purchase | chocolate, flowers, ice cream | arabic/chinese/italian food |
| FR | acheter, offrir, chercher | chocolat, bouquet | cuisine arabe/chinoise... |
| DE | kaufen, schenken, besorgen | Schokolade, Rosen | arabisches/chinesisches Essen |
| PT | comprar, presentear | brigadeiro, açaí | comida árabe/chinesa... |
| JA | 買う, プレゼント, 贈る | チョコ, ケーキ | アラブ料理, 中華料理... |
| ZH | 买, 送礼, 想买 | 巧克力, 蛋糕 | 阿拉伯菜, 中餐... |
| RU | купить, подарить | шоколад, мороженое | арабская/китайская кухня |
| AR | اشتري, شراء, هدية | شوكولاتة, كنافة | مطعم عربي/صيني... |
| ID | beli, membeli, hadiah | cokelat, kue | makanan arab/cina... |

### Remote Config — Nuevas claves coach_config.placeSearch (sin redeploy)

| RC Key | Tipo | Default | Descripción |
|--------|------|---------|-------------|
| `cuisineAlternatives` | Object | 59 cocinas→alternativas | Merge con defaults, agregar cocinas nuevas sin deploy |
| `cuisineFallbackQueries` | Object | 59 cocinas→query fallback | Merge con defaults (arabic→"mediterranean restaurant") |
| `shopFallbacks` | Object | 14 categories×10 langs (792 queries) | Agregar tiendas especializadas por región |
| `purchaseExtraTerms` | String | "" | Regex extra para detectar compras (append a patterns) |

### Remote Config — Nuevas claves coach_config.intentExtraction

| RC Key | Tipo | Default | Descripción |
|--------|------|---------|-------------|
| `temperature` | Number | 0.1 | Temperature del modelo de intent extraction |
| `maxTokens` | Number | 512 | Max output tokens del intent extraction |

### Patrón RC en código
Todos los maps usan spread merge: `{...DEFAULT, ...rcOverride}` — RC agrega/sobreescribe pero nunca elimina defaults.

## Events Discovery — events.js (NEW)

**File**: `functions/lib/events.js`
**3 callable CFs**:

### searchEvents
- **Payload**: `{latitude, longitude, radius?, category?, userLanguage?}`
- **Response**: `{success, events: [{id, title, date, venue, url, imageUrl, source, category, priceRange, lat, lng}]}`
- **Sources**: Ticketmaster API + Eventbrite API + Meetup API (parallel fetch, merge + dedup)
- **Dedup**: by title similarity + venue + date window (`dedupWindowHours` RC-configurable, default 4h)
- `searchGooglePlacesEvents` removed (was undefined/unused)

### trackEventInteraction
- **Payload**: `{eventId, action ("view"|"share"|"dismiss"), matchId?}`
- **Response**: `{success}`
- Writes to `eventInteractions/{id}` for recommendation learning

### fetchLocalEvents
- **Payload**: `{latitude, longitude, daysAhead?}`
- **Response**: `{success, events[]}`
- `searchDaysAhead` RC-configurable (default 14)
- Caches results in `eventCache` collection (TTL 1h)

## isInappropriateVenue Filter (NEW)

**File**: `functions/lib/coach.js`
- Filters adult/inappropriate venues from Coach place suggestions
- Blocks strip clubs, adult entertainment, massage parlors (non-spa), hookah lounges flagged as adult
- 10-language keyword matching (EN/ES/FR/DE/PT/JA/ZH/RU/AR/ID)
- Applied in `fetchCoachPlaces()` pipeline before returning results

## Brand Search — 90+ Franchises (NEW)

**File**: `functions/lib/coach.js`
- `BRAND_TYPE_MAP`: 90+ franchise names mapped to Google Places types
- Starbucks, McDonald's, Zara, H&M, Sephora, Nike, etc.
- When user asks "Starbucks near me", maps to correct Places API type + brand query
- Improves search accuracy for franchise-specific requests

## Behavioral Pattern Detection in getRealtimeCoachTips (NEW)

**File**: `functions/lib/ai-services.js`
- `getRealtimeCoachTips` now detects behavioral patterns in conversation:
  - Message frequency trends (increasing/decreasing engagement)
  - Response time patterns (quick vs delayed)
  - Topic diversity (stuck on one topic vs varied conversation)
  - Emoji/tone evolution over conversation arc
- Provides more nuanced coaching tips based on conversation dynamics

## Adaptive Personality Tone (NEW)

**File**: `functions/lib/coach.js`
- `detectCommunicationStyle(messages)`: analyzes user's writing style (formal/casual/playful/emotional)
- `getCulturalContext(language, country)`: adapts coaching style to cultural norms
- Coach responses now mirror user's communication style for better engagement
- Supports all 10 languages with culture-specific dating advice nuances

## sanitizeBlueprintTitle (NEW)

**File**: `functions/lib/ai-services.js`
- Strips personal names from blueprint titles (privacy protection)
- Replaces "Romantic Evening with Maria" → "Romantic Evening"
- Applied in `generateDateBlueprint` before returning to client
- Max 5 words enforced

## RC-Configurable Values (NEW)

### Events Config (`coach_config.events`)
| RC Key | Type | Default | Description |
|--------|------|---------|-------------|
| `searchDaysAhead` | Number | 14 | Days ahead to search for events |
| `dedupWindowHours` | Number | 4 | Hours window for event deduplication |

### Notification Titles (10 languages)
| RC Key | Type | Description |
|--------|------|-------------|
| `notificationTitles` | Object | Localized notification titles for events in ES/EN/FR/DE/PT/JA/ZH/RU/AR/ID |

## Coach Quality Improvements (NEW)

### Sports Venue Mapping
- Maps sport-related queries to correct Google Places types
- "basketball court" → `sport`, "tennis club" → `sport`, "golf course" → `golf_course`
- Stadium, arena, field mapping for spectator sports

### Luxury Intent Detection
- Detects luxury-seeking queries: "upscale", "fine dining", "5-star", "exclusive", "premium"
- Routes to higher-rated venues (min 4.0 rating) and premium categories
- 10-language luxury keyword detection

### Self-Deprecation Handling
- Detects self-deprecating messages in coaching context
- Responds with empathetic encouragement rather than generic advice
- Pattern detection: "I'm not good enough", "nobody likes me", "I always mess up" (10 languages)

### Cabaret → Nightclub Mapping (LatAm)
- "cabaret" queries from LatAm users now map to `night_club` Google Places type
- Prevents routing to adult entertainment venues in countries where "cabaret" means nightclub
- Applied in intent extraction + `CATEGORY_TO_PLACES_TYPE` mapping

## Coach System Improvements (Session 2026-03-26)

### Stalled Stage Detection
- `getRealtimeCoachTips` detects "stalled" conversations (7+ days inactive)
- Provides re-engagement strategies and conversation starters
- Triggers more proactive coaching when relationship momentum is fading

### System Prompt Compacted 38%
- Coach system prompt reduced by 38% in token count
- Same instructions, fewer tokens → lower Gemini costs + faster responses
- Applied in `dateCoachChat` system prompt builder

### Places Cache Cross-Message
- `placesCache` now persists across multiple coach messages (not just current request)
- Stored in `coachChats/{userId}/placesCache/latest` (TTL 15min)
- Prevents redundant Places API calls when user asks follow-up questions about same area
- `loadMore` reads from cache including overrideLat/overrideLng

### RAG in getRealtimeCoachTips
- `getRealtimeCoachTips` now uses RAG from `coachKnowledge` collection
- Enriches coaching tips with curated dating advice based on conversation context
- Same embedding pipeline as `dateCoachChat` (gemini-embedding-001, COSINE)

### Shared Embedding Cache (LRU 100 entries)
- In-memory LRU cache for embedding vectors (100 entries max)
- Shared across `dateCoachChat`, `getRealtimeCoachTips`, `generateSmartReply`, moderation RAG
- Reduces duplicate Gemini embedding API calls within same CF instance lifecycle

### P0 Bug Fixes
- **flagPenalty**: Fixed incorrect penalty calculation in moderation scoring
- **temperature RC**: Coach temperature now correctly read from `coach_config.temperature` RC key (was hardcoded)

### Tester Auto-Enrollment Modal (Web)
- Web landing page shows auto-enrollment modal for new testers
- Writes to `testerSignups` Firestore collection
- Captures email, platform preference, and opt-in timestamp

## Slash Commands (Session 2026-03-26)

### /audit-alignment
- Read-only auditor that checks iOS/Android parity
- Compares Firestore models, CF calls, strings, colors, features
- Reports divergences without making changes

### /events-discovery
- Specialist agent for AI Events Discovery feature
- Integrates Ticketmaster, Eventbrite, Meetup APIs
- Creates event-based date suggestions

### /improve-moderation
- Specialist for improving moderation system
- Diagnosis, RAG optimization, false positive/negative reduction
- Blacklist improvements, threshold tuning, Safety Shield

### /improve-agents — Expanded (41 scenarios)
- Meta-agent covering ALL dating scenarios + edge cases
- 41 test scenarios for Coach IA quality validation
- Covers: first dates, long-distance, cultural differences, budget constraints, accessibility, etc.

### SessionStart Hook
- Automatically runs alignment check on session start
- Validates iOS/Android parity for recently changed files

### PostToolUse Hook
- Automatically syncs skills after CF deploy
- Triggers skill file update when functions are deployed
