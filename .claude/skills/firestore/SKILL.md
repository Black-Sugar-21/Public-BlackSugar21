---
name: firestore
description: Esquema completo de Firestore de BlackSugar21 — todas las colecciones, campos, tipos, Storage paths, Security Rules, Remote Config 21 claves y 46 reglas de alineación iOS↔Android. Fuente de verdad cross-platform. Usar cuando se trabaje con datos Firestore, esquemas, campos de usuario, matches, mensajes, o cuando se audite alineación iOS↔Android.
---

# BlackSugar21 — Firestore Schema Completo

**Firebase Project**: `black-sugar21` | **Cuenta**: `dverdugo85@gmail.com` | **Región CFs**: `us-central1`

---

## Colecciones

### `users/{userId}`

```
name, age, bio, gender (bool: male=true), userType (SUGAR_DADDY|SUGAR_BABY|SUGAR_MOMMY)
email, phoneNumber, photoURL, pictureNames [String], pictureCount
latitude, longitude, g (geohash — SIEMPRE "g", NUNCA "geohash"), city, country, countryCode
orientation ("men"|"women"|"both" — SIEMPRE lowercase)
fcmToken (camelCase exacto), apnsToken (solo iOS), fcmBuildType (solo Android: "debug"|"release")
timezoneOffset (número), timezone (string), deviceLanguage
dailyLikesRemaining (100), dailyLikesLimit (100), dailyLikesUsedToday
superLikesRemaining (5), superLikesUsedToday, lastLikeResetDate, lastSuperLikeResetDate
coachMessagesRemaining (5), lastCoachResetDate
liked [String], superLiked [String], passed [String], blocked [String], blockedBy [String]
isOnline, lastSeen, activeChat, activeChatTimestamp, activeMatchId
paused, visible, pausedAt — pauseAccount: {paused:true, visible:false, pausedAt:serverTimestamp()}
accountStatus ("active"|"suspended"|"banned"), reportSummary {uniqueReporters, totalReports, reasonCounts}
visibilityReduced, aiModerationResult
scheduledForDeletion, deletionDate, deletionScheduledAt
(Android also: scheduledDeletionDate — not used by CFs)
interests [String], discoveryPreferences {minAge, maxAge, maxDistance, interestedIn}
createdAt, updatedAt, onboardingComplete
isTest, isReviewer — para cuentas de prueba/reviewer
wingPersonOptOut (bool), wingPersonLastNotifiedAt, wingPersonNotifCountToday, wingPersonLastResetDate
```

**Subcolecciones**:
- `liked/{userId}` — `{exists:true, superLike:bool, timestamp}`
- `passed/{userId}` — `{exists:true}`
- `swipes/{userId}` — `{timestamp, isLike, isSuperLike:false}`
- `superLiked/{userId}` — `{timestamp}`
- `compatibility_scores/{userId}` — scores cacheados

### `matches/{matchId}`

```
userId1, userId2
usersMatched [userId1, userId2]
timestamp (Timestamp) — orden principal en match list
lastMessage (String), lastMessageSeq (Number), lastMessageTimestamp (Timestamp)
createdAt, messageCount
lastSeenTimestamps {userId: Timestamp} — para indicador de mensajes no leídos
isTest — para matches de prueba
```

### `matches/{matchId}/messages/{messageId}`

**Tipo text**:
```
message, senderId, timestamp, type:"text", isEphemeral:false, messageSeq
```

**Tipo place**:
```
message, senderId, timestamp, type:"place", isEphemeral:false
placeData: {name, address, rating, latitude, longitude, placeId, googleMapsUrl,
  website, phoneNumber, isOpenNow, instagram, instagramHandle, tiktok, category,
  description, photos:[{url,width,height}], distanceUser1, distanceUser2,
  travelTimeUser1, travelTimeUser2, score}
```

**Tipo date_blueprint**:
```
message (texto formateado con emojis — backward compat), senderId, timestamp, type:"date_blueprint", isEphemeral:false
blueprintData: {
  title, totalDuration, estimatedBudget, dresscode, icebreaker,
  steps: [{
    order, time, duration, activity, placeName, tip, whyThisPlace, travelTimeToNext,
    photoUrl, googleMapsUrl, placeId, address, rating
  }]
}
```
⚠️ `blueprintData` puede ser null en mensajes antiguos (solo tenían `message` texto).
`autoModerateMessage` ignora `type:"date_blueprint"`.
Match list preview: `lastMessage` = `"✨ {title}"`.

**Tipo ephemeral_photo**:
```
message:"", senderId, timestamp, type:"ephemeral_photo"
photoUrl, isEphemeral:true, expiresAt, viewedBy:[]
isUploading:false (upload flag en 3 pasos)
```
Compresión: maxDimension=800px, JPEG quality=65% (iOS: 0.65, Android: 65)

### `pendingNotifications/{id}`

```
toUserId, fromUserId, type ("new_message"|"new_match"|...)
matchId, message, senderName, timestamp, createdAt:serverTimestamp()
```
`createdAt` SIEMPRE incluido. Solo CFs leen/procesan.

### `reports/{reportId}`

```
reporterId, reportedUserId, reason, matchId, description?
timestamp, status, action
uniqueReportCount, totalReportCount
```

**Moderación Progresiva** (por unique reporters):
- 1-2 → bloqueo personal
- 3-4 → `visibilityReduced:true`
- 5-6 → visibilityReduced + análisis IA (auto-suspende si confianza ≥0.8)
- 7-9 → `accountStatus:'suspended'`
- 10+ → `accountStatus:'banned'`

### `coachChats/{userId}/messages/{msgId}`

```
message, sender ("user"|"coach"), timestamp (Timestamp.now() para user, +1ms para coach)
matchId?, suggestions [String]?, offTopic bool
feedback: String? ("helpful"|"not_helpful") — written by rateCoachResponse callable CF
activitySuggestions [{
  id (placeId ?? UUID), name, category, emoji, description, address
  googleMapsUrl, website, phoneNumber, instagram, instagramHandle, tiktok
  photos [{url,width,height}], rating, reviewCount, score, priceLevel
  distanceUser1, distanceUser2, travelTimeUser1, travelTimeUser2
  lat, lng, isOpenNow
}]
```

**Timestamps batch**: user=`Timestamp.now()`, coach=`Timestamp.now() + 1ms` — garantiza orden determinista.

`coachChats/{userId}` (doc raíz):
```
learningProfile: {interactionCount, positiveEngagementCount, topTopics, recentTopics, preferredStyle, lastUpdated, satisfactionRate, feedbackCount, lowQualityTopics}
```

`coachChats/{userId}/placesCache/latest`:
```
places, lastRadiusUsed, timestamp (TTL 15min)
```

### `moderationKnowledge/{chunkId}`

93 chunks multilingües (EN:39, ES:21, FR:5, DE:4, PT:5, AR:4, JA:4, RU:4, ZH:4, ID:3). 13 categorías. Embedding 768 dims `gemini-embedding-001`.

### `moderationCache/{hash}`

```
hash (SHA-256 del mensaje normalizado), result {approved,category,severity,confidence,reason}
createdAt, CACHE_VERSION:3, TTL:1h
```

### `moderatedMessages/{id}`

Audit trail: mensajes flaggeados por `autoModerateMessage`. `type:"text"` solamente.

### `stories/{storyId}`

```
senderId, imageUrl, matchId, matchParticipants [String]
createdAt, expiresAt (now + 24h), isPersonal:true
viewedBy [String]
```
**⚠️ TODAS las queries deben incluir `.where('isPersonal', '==', true)`** — índices compuestos lo requieren.

### `swipes/{id}`, `interestItems/{id}`, `interestCategories/{id}`

- `swipes`: `{userId, swipedUserId, timestamp, isLike, isSuperLike}`
- `interestItems/interestCategories`: solo lectura pública, escritura solo Admin SDK

### `coachInsights/global`

Aggregated topic counts del Coach Learning System.

### `users/{userId}/aiPreferences/smartReply`

```
toneHistory: [{tone, timestamp, matchId}]
toneCounts: {casual: Number, flirty: Number, deep: Number}
preferredTone: String ("casual"|"flirty"|"deep")
updatedAt: Timestamp
```
Written by `trackSmartReplyToneChoice` CF. Read by `generateSmartReply` to weight tone preference.

### `wingPersonNotifications/{id}`

```
userId, matchId, signalType, notificationBody, sentAt, language, metadata
```
Written by `wingPersonAnalysis` scheduled CF. Server-side only. Rate limited 2/day per user.

### `pendingDebriefs/{id}`

```
matchId, messageId, usersMatched [String]
blueprintTimestamp: Timestamp, status: "pending"|"triggered"
createdAt: Timestamp, triggeredAt?: Timestamp
```
Written by `onBlueprintShared` trigger. Processed by `triggerDateDebriefs` (24-48h later).

### `coachChats/{userId}/debriefs/{matchId}`

```
blueprintMessageId, triggeredAt: Timestamp
status: "pending"|"completed", matchName
```
Written by `triggerDateDebriefs` or `requestDateDebrief`.

### `dateCheckIns/{id}`

```
userId, matchId
scheduledTime: Timestamp
emergencyContactPhone: String? (optional)
status: String — "scheduled"|"check_in_sent"|"ok_responded"|"sos_responded"|"emergency_alerted"|"follow_up_sent"|"failed"|"cancelled"
fcmToken: String
fcmRetryCount: Number (default 0)
userName: String
createdAt: Timestamp, lastUpdatedAt: Timestamp
checkInSentAt?: Timestamp, responseAt?: Timestamp
followUpScheduledAt?: Timestamp, reminderSentAt?: Timestamp
emergencyAlertedAt?: Timestamp, lastFcmError?: String
```
Status transitions enforced server-side by `processDateCheckIns` and callable CFs. Clients should NOT write directly to this collection.

### `appConfig/safetyCheckIn`

```
reminderDelayMinutes: Number (default 15) — minutes after check-in sent before sending reminder
emergencyDelayMinutes: Number (default 30) — minutes after check-in sent before alerting emergency contact
batchLimit: Number (default 50) — max check-ins processed per scheduled run
```
Read by `processDateCheckIns` on each execution. Editable via Firebase Console without redeploy.

### `pendingEmergencyAlerts/{id}`

```
phone: String — emergency contact phone number
userName: String — name of the user on the date
type: String — "no_response"|"sos"
checkInId?: String — reference to dateCheckIns doc
createdAt: Timestamp
processed: Boolean (default false)
```
Created by `respondToDateCheckIn` (SOS) or `processDateCheckIns` (no response). Consumed by external alerting system.

---

## Storage Paths

| Path | Contenido |
|---|---|
| `users/{userId}/{uuid}.jpg` | Foto de perfil (max 1920px, target 500KB) |
| `users/{userId}/{uuid}_thumb.jpg` | Thumbnail (400px) |
| `ephemeral_photos/{matchId}/{photoId}.jpg` | Foto efímera (800px, JPEG 65%) |
| `stories/personal_stories/{userId}/{storyId}.jpg` | Story |
| `temp_uploads/{userId}/{filename}` | Uploads temporales (moderación) |

**⚠️ NUNCA usar `profile_images/`** — fix aplicado en `MatchFirebaseDataSourceImpl.kt`
**⚠️ iOS SIEMPRE requiere `StorageMetadata()` con `contentType = "image/jpeg"`** — Android infiere de `.jpg`

---

## Remote Config — 21 Claves

### Leídas por RemoteConfigManager (iOS y Android)

| Clave | Tipo | Default |
|---|---|---|
| `compatibility_weights` | JSON | `CompatibilityWeights.default` |
| `matching_scoring_weights` | JSON | `MatchingScoringWeights.default` |
| `daily_likes_limit` | Number | 100 (SIEMPRE 100) |
| `daily_super_likes_limit` | Number | 5 |
| `max_search_radius_km` | Number | 200.0 |
| `ai_moderation_confidence_threshold` | Number | 0.80 |
| `profile_reappear_cooldown_days` | Number | 14 |
| `bulk_query_batch_size` | Number | 30 |
| `minimum_age_by_country` | JSON | `{"default": 18}` |
| `enable_bio_ai_suggestions` | Boolean | false |
| `moderation_image_max_dimension` | Number | 512px |
| `gemini_tokens` | Number | 1024 |
| `moderation_image_jpeg_quality` | Number | 50 (iOS: /100 → 0.0-1.0) |
| `enable_screen_protection` | Boolean | true (solo afecta iOS actualmente) |
| `reviewer_uid` | String | `g4Zbr8tEguMcpZonw72xM5MGse32` |
| `coach_max_input_length` | Number | 2000 |
| `coach_daily_credits` | Number | 5 |

### Leídas directamente por UI (no via RemoteConfigManager)

| Clave | Tipo | Default |
|---|---|---|
| `terms_url` | String | `https://www.blacksugar21.com/terms` |
| `privacy_url` | String | `https://www.blacksugar21.com/privacy` |
| `store_url_ios` | String | TestFlight URL |
| `store_url_android` | String | Play Store Internal URL |

### Solo server-side (Cloud Functions)

| Clave | Descripción |
|---|---|
| `coach_config` | 19+ campos: enabled, dailyCredits, maxMessageLength, coachingSpecializations, stagePrompts, placeSearch, rag, learningEnabled, etc. |
| `places_search_config` | 21 campos: progressiveRadiusSteps, minPlacesTarget, loadMoreExpansionBase, categoryQueryMap, etc. |
| `moderation_config` | rag: {enabled, topK:4, minScore:0.25, fetchMultiplier:3, collection} |

**Intervalo fetch**: 3600s (idéntico iOS y Android).

---

## Firestore Security Rules

| Colección | Read | Write |
|---|---|---|
| `users/{userId}` | auth | owner + validaciones lat/lng/maxDistance |
| `users/{userId}/liked/{id}` | auth | owner |
| `users/{userId}/passed/{id}` | owner | owner |
| `users/{userId}/swipes/{id}` | owner | owner |
| `users/{userId}/superLiked/{id}` | auth | owner |
| `matches/{matchId}` | participant | participant (no delete; 1er msg solo DADDY/MOMMY) |
| `matches/{matchId}/messages/{id}` | participant | senderId + participant check |
| `pendingNotifications/{id}` | false | create (auth) |
| `stories/{storyId}` | auth | owner + viewedBy update |
| `interestItems/{id}` | auth | false |
| `interestCategories/{id}` | auth | false |

---

## App Check

| Plataforma | Provider |
|---|---|
| iOS (prod) | DeviceCheck |
| Android (prod) | PlayIntegrity |
| Debug (ambos) | DebugAppCheckProviderFactory |

---

## Reglas de Alineación iOS ↔ Android (56 reglas)

Las más críticas:

1. **Geohash**: campo `"g"` (NO `"geohash"`)
2. **Orientation**: SIEMPRE lowercase `"men"` | `"women"` | `"both"`
3. **FCM Token**: campo exacto `"fcmToken"` (camelCase)
4. **isEphemeral**: todo mensaje escribe `isEphemeral: false` (incluso text/place)
5. **superLiked**: escribe al array `"superLiked"` del usuario Y en subcolección `superLiked/{userId}`
6. **activeChat**: eliminar con `FieldValue.delete()` al salir del chat
7. **timezoneOffset**: escribe en createUser, updateDeviceSettings Y updateUserLocation
8. **visible**: solo se escribe al pausar/despausar (NO en createUser)
9. **pendingNotifications**: siempre incluye `createdAt: serverTimestamp()`
10. **Crashlytics**: `setUserId()` en login (Android: `FirebaseCrashlytics.getInstance()`, iOS: `Crashlytics.crashlytics()`)
11. **Storage paths**: `users/{userId}/{filename}` — NUNCA `profile_images/`
12. **Super Like batch**: atómico: `{superLikesRemaining: increment(-1), superLikesUsedToday: increment(1), superLiked: arrayUnion()}` + swipe/liked subcolecciones + `superLiked/{userId}`
13. **Ephemeral photo**: `{message:"", senderId, timestamp, type:"ephemeral_photo", photoUrl, isEphemeral:true, expiresAt, viewedBy:[], isUploading:false}` — 800px, JPEG 65%
14. **activeChat lifecycle**: `setActiveChat` → `{activeChat: matchId, activeChatTimestamp: serverTimestamp()}`, `clearActiveChat` → ambos campos con `FieldValue.delete()`
15. **pauseAccount**: `{paused:true, visible:false, pausedAt:serverTimestamp()}` — reactivate: `{paused:false, visible:true}`
16. **blockUser**: via CF. unblockUser: local `FieldValue.arrayRemove(blockedUserId)`. Bidireccional: `blocked` + `blockedBy`
17. **Daily likes reset**: SIEMPRE 100 — `{dailyLikesRemaining:100, dailyLikesLimit:100}`. NUNCA decrementar `dailyLikesLimit`
18. **Match detection**: `hasUserLikedBack()` + 100ms delay
19. **Match notification**: enviada por CF trigger `onMatchCreated` (NO por cliente)
20. **Photo upload**: iOS SIEMPRE pasa `StorageMetadata` con `contentType = "image/jpeg"` — Android infiere automáticamente
21. **fcmBuildType**: solo Android escribe ("debug"|"release"). No afecta funcionalidad
22. **apnsToken**: solo iOS. No afecta funcionalidad
23. **Swipe regular**: batch atómico `{liked/passed: arrayUnion, dailyLikesRemaining: increment(-1)}` + swipe + liked subcollecciones
24. **AI CFs**: TODA la IA es server-side. Clientes NO usan SDK `FirebaseAI`/`firebase-ai`
25. **Gemini models**: `gemini-2.5-flash` (CFs pesadas) y `gemini-2.5-flash-lite` (CFs ligeras: autoModerate, moderateMessage, reportUser, generateInterestSuggestions, getRealtimeCoachTips)
26. **getBatchStoryStatus**: DEBE incluir `.where('isPersonal', '==', true)` — sin este filtro falla silenciosamente
27. **storyModels**: NUNCA crear `StoryModel` dummy con `Date()`/`Timestamp.now()` para swipe cards — usar modelos reales del repository
28. **Match list listener**: Firestore snapshot listener real-time (NO CF one-shot). Auto-retry 3s. NUNCA `stopListeningToMatches()` en `.onDisappear` de MainTabView (iOS)
29. **activeChat stale cleanup**: (1) iOS `App.swift` limpia al inicio, (2) Android `MainActivity.onCreate()`, (3) CF `onMessageCreated` detecta stale >5min
30. **FCM channels**: `handlePendingNotification` envía `android.channelId` que DEBE coincidir con los `NotificationChannel` de la app Android
31. **recentlyReadMatches cache**: TTL 30s — evita flash de "unread" al actualizar `lastSeenTimestamps`
32. **ProfileDetailsSheet**: `ModalBottomSheet(skipPartiallyExpanded = true)`. NO usar `fillMaxHeight(0.95f)`, botón close requiere `.zIndex(10f)`
33. **Coach timestamps**: batch usa `Timestamp.now()` user y `+1ms` coach — garantiza orden determinista
34. **Coach message gate**: solo agrega burbuja local si `coachMessageId` presente en CF response
35. **ActivitySuggestion id**: `placeId ?: UUID` como key único — sin esto, venues duplicados causan crash en `LazyColumn`
36. **accumulatedActivities**: state LOCAL de la Screen/View (NO del ViewModel). Cap 100 items
37. **Story carousel**: `isPersonal == true` filter OBLIGATORIO en todas las queries a `stories`
38. **Match cache sync**: Android: `replaceAllMatches()` hace `DELETE NOT IN` + `INSERT(REPLACE)` — NUNCA solo `insertMatches(REPLACE)`
39. **Screen protection**: solo en Home, MatchList, Chat. SIN protección en Likes, Profile, EditProfile, Settings. `reviewer_uid` exento
40. **autoModerateMessage**: solo modera `type:"text"` — ignora `ephemeral_photo`, `place` y `date_blueprint`
41. **date_blueprint messages**: `blueprintData` estructurado (title, steps con fotos/Maps/rating) + `message` texto fallback. `blueprintData` nullable (backward compat). `lastMessage` = `"✨ {title}"` (fallback "Date Plan" si vacío). Homologado iOS ↔ Android: ambos guardan y leen datos estructurados, ambos tienen BlueprintViewSheet + PlaceDetailSheet
42. **Smart Reply 3-tone**: CF retorna `replies` array + legacy `suggestions`. Tone preference en `aiPreferences/smartReply`. Homologado iOS ↔ Android
43. **Wing-Person notifications**: server-side only (CF scheduled). Opt-out via `wingPersonOptOut`. Rate limit 2/day. Quiet hours 22-9 local. Fallback 10 idiomas
44. **Date Debrief**: `onBlueprintShared` trigger → `pendingDebriefs` → `triggerDateDebriefs` 24-48h → coach message `type: "debrief_prompt"`. `requestDateDebrief` para trigger manual
45. **Safety Check-In payloads**: iOS and Android MUST send identical payloads to `scheduleDateCheckIn` and `respondToDateCheckIn`. Fields: `{matchId, scheduledTime, emergencyContactPhone?, userName}` for schedule, `{checkInId, response}` for respond
46. **dateCheckIns status transitions**: Enforced server-side only — clients should NOT write directly to `dateCheckIns` collection. All status changes go through callable CFs or `processDateCheckIns` scheduled CF

---

## CF Count Total: 47 callable + 13 scheduled + 8 triggers + 1 alias

### Scheduled (11)

| CF | Schedule | Notas |
|---|---|---|
| `resetDailyLikes` | every 1 hours | Timezone-aware: `(UTCHour + timezoneOffset) % 24 === 0`. Siempre 100 |
| `resetSuperLikes` | every 1 hours | Siempre 5 |
| `cleanupExpiredStories` | every 1 hours | Elimina stories expiradas Firestore + Storage |
| `checkMutualLikesAndCreateMatch` | every 5 minutes | Verifica likes mutuos |
| `processScheduledDeletions` | every 1 hours | Procesa cuentas programadas para eliminación |
| `updategeohashesscheduled` | every 24 hours | Actualiza geohashes |
| `monitorGeohashHealth` | every 6 hours | Monitorea salud de geohashes |
| `resetCoachMessages` | every 1 hours | Lee `coach_config.dailyCredits` de RC |
| `wingPersonAnalysis` | every 4 hours | Analiza matches, envía push proactivas via Gemini. 1GiB. 5 signal types. Rate limit 2/day. Quiet hours 22-9 |
| `triggerDateDebriefs` | every 6 hours | Procesa pending debriefs 24-48h después de blueprint compartido. Envía coach message |
| `processDateCheckIns` | every 5 minutes | Procesa safety check-in lifecycle: envía FCM, reminders, emergency alerts. 512MiB, 120s. Config via `appConfig/safetyCheckIn` |

### Triggers (7)

| Trigger | Evento | Propósito |
|---|---|---|
| `onMatchCreated` | DocumentCreated `matches/` | Push nuevo match |
| `onMessageCreated` | DocumentCreated `messages/` | Procesa nuevo mensaje |
| `generateProfileThumbnail` | ObjectFinalized Storage | Genera thumbnail automático |
| `handlePendingNotification` | DocumentCreated `pendingNotifications/` | Envía push |
| `autoModerateMessage` | DocumentCreated `messages/` | Pipeline: BLACKLIST → SHA-256 cache → quick filters → RAG → Gemini → auto-report HIGH → audit trail |
| `validateGeohashOnUpdate` | DocumentUpdated `users/` | Valida geohash al actualizar ubicación |
| `onBlueprintShared` | DocumentCreated `matches/{matchId}/messages/{messageId}` | Detecta `type:"date_blueprint"`, escribe a `pendingDebriefs` |

### Admin/test (no llamadas en producción)

```
sendTestNotification, sendTestNotificationToUser
testDailyLikesResetNotification, testSuperLikesResetNotification
updateFCMToken, generateMissingThumbnails
```

---

## New Fields & Collections (Session 2026-03-26)

### `replyTo` field in `matches/{matchId}/messages/{messageId}`

```
replyTo: {
  messageId: String,      // ID of the original message being replied to
  senderId: String,       // sender of the original message
  senderName: String,     // display name of original sender
  text: String,           // preview text of original message (truncated)
  type: String            // type of original message: "text"|"place"|"event"|"date_blueprint"
}
```
Optional field. Present only when a message is a reply to another message. Both iOS and Android write identical structure.

### `eventData` field in `matches/{matchId}/messages/{messageId}` (type "event")

```
type: "event"
eventData: {
  title: String,
  date: String,
  venue: String,
  url: String?,
  imageUrl: String?,
  source: String?,       // "ticketmaster"|"eventbrite"|"meetup"
  category: String?,
  priceRange: String?
}
```
New message type for sharing events in chat. `autoModerateMessage` ignores `type:"event"`. Match list preview: `lastMessage` = event title.

### `eventCache/{id}` collection

```
events: [{id, title, date, venue, url, imageUrl, source, category, priceRange, lat, lng}]
latitude: Number, longitude: Number
radius: Number
createdAt: Timestamp (TTL 1h)
```
Server-side cache for event search results. Written by `fetchLocalEvents` CF. Auto-expires after 1 hour.

### `eventInteractions/{id}` collection

```
userId: String, eventId: String
action: String ("view"|"share"|"dismiss")
matchId: String?, timestamp: Timestamp
```
Tracks user interactions with events for recommendation learning.

### `coachChats/{userId}` doc — eventPreferences field

```
eventPreferences: {
  preferredCategories: [String],    // "music", "sports", "food", "arts", etc.
  dislikedCategories: [String],
  lastEventSearch: Timestamp,
  interactionCount: Number
}
```
Stored on the `coachChats/{userId}` root document alongside `learningProfile`.

### `testerSignups/{id}` collection

```
email: String
platform: String           // "ios"|"android"|"both"
optInTimestamp: Timestamp
source: String             // "web_modal"|"landing_page"
```
Written by web tester auto-enrollment modal. Used for beta tester management.

### `dateCheckIns` collection — updated fields

- `userName` field now sanitized server-side (strips special chars)
- `emergencyContactPhone` normalized with `sanitizePhoneNumber()` before storage
- No schema changes, just data quality improvements

### Alignment rule 47 — replyTo messages
```
47. **replyTo messages**: iOS and Android MUST write identical `replyTo` structure: {messageId, senderId, senderName, text, type}. Field is optional — only present on reply messages. Both platforms must render quoted preview in chat bubbles.
```

### Alignment rule 48 — event messages
```
48. **event messages**: `type:"event"` with `eventData` structured field. `autoModerateMessage` ignores `type:"event"` (like date_blueprint). Both platforms must render EventMessageCard with image, title, date, venue, source badge. `lastMessage` = event title.
```

### `coachInsights/daily/{YYYY-MM-DD}` collection

```
satisfactionRate: Number (0.0-1.0)
totalFeedback: Number
helpfulCount: Number
notHelpfulCount: Number
topNegativeTopics: [String]
responseQualityMetrics: Map
createdAt: Timestamp
```
Written daily by `analyzeCoachQuality` scheduled CF (2 AM UTC). Aggregates feedback from `coachChats/*/messages` with `feedback` field.

### `coachInsights/ragUpdates` doc

```
lastRunAt: Timestamp
chunksAdded: Number
lastTopics: [String]
totalAutoGenerated: Number
```
Updated weekly by `updateCoachKnowledge` scheduled CF (Sunday 3 AM UTC). Tracks auto-generated RAG chunks from negative feedback.

### Scheduled CFs (updated — 13 total)

| CF | Schedule | Notas |
|---|---|---|
| `analyzeCoachQuality` | daily 2 AM UTC | Aggregates coach feedback metrics → `coachInsights/daily/{date}` |
| `updateCoachKnowledge` | weekly Sunday 3 AM UTC | Auto-generates RAG chunks from negative feedback → `coachKnowledge` |

### Triggers (updated — 8 total)

| Trigger | Evento | Propósito |
|---|---|---|
| `onTesterSignup` | DocumentCreated `testerSignups/` | Processes new tester signups from web modal |

### Security Rules — `testerSignups`

| Colección | Read | Write |
|---|---|---|
| `testerSignups/{id}` | false | create (public — no auth required) |
