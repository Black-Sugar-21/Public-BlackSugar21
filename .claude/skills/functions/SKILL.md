---
name: functions
description: Gestion completa de Firebase Cloud Functions de BlackSugar21. 38 callable + 8 scheduled + 6 triggers + 1 alias en us-central1. Arquitectura modular en functions/lib/. Modelos Gemini duales, Coach RAG, Moderation RAG, autoModerateMessage pipeline. Usar cuando se trabaje con Cloud Functions, deploy, debug, logs o testing de CFs.
globs:
  - "functions/**/*.js"
  - "functions/package.json"
  - "firebase.json"
---

# Firebase Cloud Functions — BlackSugar21

## Proyecto

- **Firebase Project**: `black-sugar21`
- **Region**: `us-central1`
- **Runtime**: Node.js 20 / Firebase Functions v2 (Gen 2)
- **Directorio**: `/Users/daniel/IdeaProjects/Public-BlackSugar21/functions/`
- **Entry point**: `functions/index.js` (27 lineas — re-exporta modulos de `lib/`)

## Arquitectura modular

`index.js` importa y re-exporta 12 modulos de `functions/lib/`:

| Modulo | Archivo | CFs exportadas |
|---|---|---|
| Discovery | `lib/discovery.js` | `getCompatibleProfileIds` (L27) |
| Matches | `lib/matches.js` | `onMatchCreated` (L7), `onMessageCreated` (L155) |
| Notifications | `lib/notifications.js` | `sendTestNotification` (L7), `updateFCMToken` (L69), `testSuperLikesResetNotification` (L120), `testDailyLikesResetNotification` (L155), `handlePendingNotification` (L190), `sendTestNotificationToUser` (L286) |
| Storage | `lib/storage.js` | `generateProfileThumbnail` (L11), `generateMissingThumbnails` (L125) |
| Users | `lib/users.js` | `unmatchUser` (L8), `reportUser` (L66), `blockUser` (L274), `deleteUserData` (L349) |
| Batch | `lib/batch.js` | `getBatchPhotoUrls` (L6), `getMatchesWithMetadata` (L83), `getBatchCompatibilityScores` (L181) |
| Stories | `lib/stories.js` | `createStory` (L9), `markStoryAsViewed` (L57), `deleteStory` (L81), `getBatchStoryStatus` (L110), `getBatchPersonalStories` (L161), `cleanupExpiredStories` (L246) |
| Moderation | `lib/moderation.js` | `validateProfileImage` (L489), `moderateProfileImage` (L520), `moderateMessage` (L585), `autoModerateMessage` (L773) |
| AI Services | `lib/ai-services.js` | `generateInterestSuggestions` (L9), `analyzePhotoBeforeUpload` (L80), `analyzeProfileWithAI` (L101), `calculateSafetyScore` (L147), `analyzeConversationChemistry` (L181), `generateSmartReply` (L209), `analyzePersonalityCompatibility` (L240), `predictMatchSuccess` (L290), `generateConversationStarter` (L345), `optimizeProfilePhotos` (L375), `findSimilarProfiles` (L405), `getEnhancedCompatibilityScore` (L470), `detectProfileRedFlags` (L521), `generateIcebreakers` (L568), `predictOptimalMessageTime` (L590), `getDatingAdvice` (L615) |
| Coach | `lib/coach.js` | `dateCoachChat` (L520), `getCoachHistory` (L2223), `deleteCoachMessage` (L2279), `getRealtimeCoachTips` (L2321) |
| Places | `lib/places.js` | `getDateSuggestions` (L13), `searchPlaces` (L156) |
| Scheduled | `lib/scheduled.js` | `resetDailyLikes` (L6), `resetSuperLikes` (L115), `resetCoachMessages` (L235), `checkMutualLikesAndCreateMatch` (L346), `scheduledCheckMutualLikes` (L410 — alias), `processScheduledDeletions` (L412) |
| Geohash | `lib/geohash.js` | `validateGeohashOnUpdate` (L8), `updategeohashesscheduled` (L35), `monitorGeohashHealth` (L71) |
| Places Helpers | `lib/places-helpers.js` | No exporta CFs — helpers internos: `haversineKm` (L26), `fuzzyMatchPlace` (L99), `placesTextSearch` (L413) |
| Shared | `lib/shared.js` | Utilidades compartidas (no exporta CFs) |
| Geo | `lib/geo.js` | Utilidades geo (no exporta CFs) |

## Conteo total

- **38 callable** (produccion)
- **6 utilidades admin/test** (`sendTestNotification`, `sendTestNotificationToUser`, `testDailyLikesResetNotification`, `testSuperLikesResetNotification`, `updateFCMToken`, `generateMissingThumbnails`)
- **8 scheduled** (timezone-aware via `timezoneOffset`)
- **6 triggers** (Firestore + Storage events)
- **1 alias** (`scheduledCheckMutualLikes` -> `checkMutualLikesAndCreateMatch`)

## Modelos Gemini (Arquitectura Dual)

| Modelo | Constante | Uso |
|---|---|---|
| `gemini-2.5-flash` | `AI_MODEL_NAME` | CFs pesadas: `dateCoachChat`, `analyzeProfileWithAI`, `analyzePersonalityCompatibility`, `generateConversationStarter`, `predictMatchSuccess`, etc. |
| `gemini-2.5-flash-lite` | `AI_MODEL_LITE` | CFs ligeras: `autoModerateMessage`, `moderateMessage`, `moderateProfileImage`, `reportUser`, `generateInterestSuggestions`, `getRealtimeCoachTips` |

**Secrets**: `GEMINI_API_KEY`, `GOOGLE_PLACES_API_KEY`
**Embedding**: `gemini-embedding-001` (768 dims, COSINE) — usado por RAG systems

Los clientes iOS/Android NO ejecutan Gemini localmente — TODA la IA es server-side.

## Coach RAG System

- **Coleccion**: `coachKnowledge`
- **368 chunks** (antes 256), 18+ categorias, 12+ idiomas (en/es/fr/de/pt/ar/id/ja/ru/zh/ko/tr/it)
- Enriquece respuestas de `dateCoachChat` con dating advice curado
- Embedding: `gemini-embedding-001` (768 dims, COSINE)
- Configurable via RC: `coach_config.rag`
- Script de indexacion: `scripts/index-coach-knowledge.js` (`--clean`, `--dry-run`)

### Coach Learning System

`analyzeUserMessage()` -> `buildLearningContext()` -> `updateCoachLearning()`

Almacena en:
- `coachChats/{userId}.learningProfile` — perfil individual
- `coachInsights/global` — insights globales

Config: `coach_config.learningEnabled`

## Moderation RAG System

- **Coleccion**: `moderationKnowledge`
- **73 chunks**, 13 categorias, 10 idiomas
- Distribucion: EN:31, ES:17, FR:4, DE:3, PT:3, AR:3, JA:3, RU:3, ZH:3, ID:3
- 13 categorias: `harassment`, `sexual`, `spam`, `threats`, `hate_speech`, `scam`, `contact_info`, `personal_info`, `evasion_tactics`, `payment_solicitation`, `context_guidelines`, `bio_moderation`, `classification_guide`
- Configurable via RC: `moderation_config.rag`
- Script de indexacion: `scripts/index-moderation-knowledge.js` (`--clean`, `--dry-run`)

## autoModerateMessage — Pipeline de 9 pasos

Trigger: `onDocumentCreated` en `matches/{matchId}/messages/{messageId}`
Solo procesa `type:"text"` — ignora `ephemeral_photo` y `place`.

1. **BLACKLIST** — ~100+ terminos EN/ES/PT/FR/DE + variantes con simbolos
2. **SHA-256 cache** — coleccion `moderationCache`, TTL 1h, VERSION=3
3. **Quick filters** — URLs (`t.me/`, `wa.me/`), telefonos, emails, caracteres repetitivos
4. **RAG context** — lee `deviceLanguage` del sender + `getModerationConfig()` en paralelo
5. **Gemini** `gemini-2.5-flash-lite` -> JSON `{approved, category, severity, confidence, reason}`
6. **Cache write** — escribe resultado en `moderationCache`
7. **Message marking** — marca mensaje si flaggeado
8. **Auto-report** — genera reporte en `reports` si severity `"high"`
9. **Audit trail** — escribe en `moderatedMessages`

## Payloads de CFs criticas

| CF | Input | Output |
|---|---|---|
| `dateCoachChat` | `{message, matchId?, userLanguage?, loadMoreActivities?, category?, excludePlaceIds?, loadCount?}` | `{success, reply, suggestions?, activitySuggestions?, userMessageId?, coachMessageId?, coachMessagesRemaining?, dominantCategory?}` |
| `getCoachHistory` | `{limit?, beforeTimestamp?}` | `{success, messages: [{id, message, sender, timestamp, matchId?, suggestions?, activitySuggestions?}], hasMore, coachMessagesRemaining}` |
| `deleteCoachMessage` | `{messageId}` | `{success: true}` (idempotente) |
| `getRealtimeCoachTips` | `{matchId, userLanguage?}` | `{success, chemistryScore, chemistryTrend, engagementLevel, tips, preDateDetected, suggestedAction?}` |
| `searchPlaces` | `{matchId, query, userLanguage?, pageToken?, loadCount?, excludePlaceIds?}` | `{success, suggestions: [PlaceSuggestion], hasMore, nextPageToken?}` |
| `getDateSuggestions` | `{matchId, userLanguage?, category?, pageToken?, loadCount?, excludePlaceIds?}` | `{success, suggestions: [PlaceSuggestion], hasMore, nextPageToken?}` |
| `reportUser` | `{reportedUserId, reason, matchId, description?}` | `{success, action, reportId, uniqueReportCount, totalReportCount}` |
| `moderateMessage` | `{message, language?, type?, matchId?}` | `{approved, reason, category, confidence}` |
| `moderateProfileImage` | `{imageBase64, expectedGender?, userLanguage?, isStory?}` | `{approved, reason, confidence, categories, category}` |

## Scheduled CFs (timezone-aware)

| CF | Schedule | Logica |
|---|---|---|
| `resetDailyLikes` | every 1h | `(UTCHour + timezoneOffset) % 24 === 0` -> reset a 100 |
| `resetSuperLikes` | every 1h | misma logica timezone -> reset a 5 |
| `resetCoachMessages` | every 1h | lee `coach_config.dailyCredits` de RC -> reset creditos |
| `cleanupExpiredStories` | every 1h | elimina Firestore + Storage de stories >24h |
| `checkMutualLikesAndCreateMatch` | every 5min | deteccion de matches mutuos |
| `processScheduledDeletions` | every 1h | procesa eliminaciones programadas |
| `updategeohashesscheduled` | every 24h | actualiza geohashes |
| `monitorGeohashHealth` | every 6h | monitoreo de salud |

## Triggers (6)

| Trigger | Archivo | Evento | Proposito |
|---|---|---|---|
| `onMatchCreated` | matches.js:L7 | DocumentCreated en `matches/` | Push de nuevo match |
| `onMessageCreated` | matches.js:L155 | DocumentCreated en `messages/` | Procesa nuevo mensaje |
| `generateProfileThumbnail` | storage.js:L11 | ObjectFinalized en Storage | Thumbnail automatico |
| `handlePendingNotification` | notifications.js:L190 | DocumentCreated en `pendingNotifications/` | Envia push |
| `autoModerateMessage` | moderation.js:L773 | DocumentCreated en `messages/` | Moderacion automatica 9 pasos |
| `validateGeohashOnUpdate` | geohash.js:L8 | DocumentUpdated en `users/` | Valida geohash al actualizar ubicacion |

## Comandos de deploy

```bash
cd /Users/daniel/IdeaProjects/Public-BlackSugar21

# Deploy CF especifica (recomendado)
firebase deploy --only functions:dateCoachChat --force

# Deploy multiples CFs
firebase deploy --only functions:dateCoachChat,functions:getCoachHistory,functions:deleteCoachMessage --force

# Deploy todas las CFs
firebase deploy --only functions --force

# Deploy reglas Firestore
firebase deploy --only firestore:rules

# Deploy reglas Storage
firebase deploy --only storage
```

## Logs y debug

```bash
cd /Users/daniel/IdeaProjects/Public-BlackSugar21

# Logs de una CF
firebase functions:log --only dateCoachChat | tail -50

# Logs filtrados
firebase functions:log --only dateCoachChat | grep -E "(Merge|Place search|API error|ERROR)"

# Health monitor Coach
node scripts/coach-health-monitor.js --minutes=60
node scripts/coach-health-monitor.js --fix
```

## Reglas

- SIEMPRE usar `--force` en deploys (evita confirmacion interactiva)
- SIEMPRE especificar CFs por nombre (no `--only functions` a menos que sea necesario)
- NUNCA deploy sin verificar el diff primero
- Verificar build exitoso antes de reportar exito

## Troubleshooting

| Error | Causa | Fix |
|---|---|---|
| `locationRestriction circle 400` | Formato incorrecto Places API | Usar bounding box rectangle |
| Merge 0/N matched | fuzzyMatchPlace insuficiente | Ver `places-helpers.js:L99` |
| Ghost messages | Gate `coachMessageId` ausente | Verificar client-side gate |
| Stories no aparecen | Falta `isPersonal == true` en query | Agregar filtro obligatorio |
| Coach loadMore sin resultado | `lastRadiusUsed` no en cache | Fallback a `loadMoreDefaultBaseRadius` (60km) |
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

Filtro anti-falsos-positivos con `skipWords` set. Si detecta ciudad → llama a `forwardGeocode` en `lib/geo.js` → override de coordenadas para Places search.

### Suggestion chip — ciudad correcta

El chip `"📍 Lugares en X"` ahora usa la **ciudad mencionada** (no el GPS del usuario) cuando hay location override activo. Fix: se pasa `mentionedCity` al builder de suggestions.

## Location Override Instruction

Cuando el usuario menciona otra ciudad (ej. "Buenos Aires") y Places search se ejecuta con coordenadas de esa ciudad:
- Se genera `locationOverrideInstruction` para Gemini
- Indica que los REAL PLACES provienen de la ciudad mencionada, NO del GPS del usuario
- Evita que Gemini diga "mis recomendaciones son para tu ciudad local" cuando muestra resultados de otra ciudad

### Cache propagation (overrideLat/overrideLng)

Cuando `forwardGeocode` resuelve una ciudad, las coordenadas override (`overrideLat`/`overrideLng`) se almacenan en `placesCache` junto con los resultados. El path de `loadMore` lee estas coordenadas del caché para mantener la búsqueda en la ciudad mencionada sin necesidad de re-geocodificar.

## Coach RAG — 368 chunks (actualizado)

- **Colección**: `coachKnowledge`
- **368 chunks** (antes 256), 18 categorías ampliadas:
  - `travel_dating` (13 langs), `long_distance` (11), `travel_safety` (12)
  - `expat_dating`, `business_trip_dating`, `study_abroad_dating`, `language_barrier`
  - `festival_dating`, `digital_nomad`, `budget_dating`, `relocation_dating`, `first_time_abroad`
  - `cultural_dating_latam` (AR/CL/CO/MX/PE/BR), `cultural_dating_europe` (ES/FR/IT/DE/UK)
  - `cultural_dating_asia` (JP/KR/CN/IN/TH/SEA), `cultural_dating_mena` (UAE/TR/MA/LB/EG)
  - `cultural_dating_other` (AU/NZ/ZA/KE/NG/GH)
  - `nightlife_dating`, `city_exploration`, `solo_dating`, `visiting_connections`, `match_other_city`
- **112 chunks nuevos** agregados via 3 scripts de seed: `seed-coach-rag-travel.js`, `v2.js`, `v3.js`
- Embedding: `gemini-embedding-001` (768 dims, COSINE)
