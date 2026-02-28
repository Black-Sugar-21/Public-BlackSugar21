# GitHub Copilot — Agent Skills BlackSugar21

## Identidad del Proyecto

- **App:** Black Sugar 21 (app de citas premium iOS + Android)
- **Firebase Project:** `black-sugar21` (cuenta: `dverdugo85@gmail.com`)
- **Cloud Functions región:** `us-central1`
- **iOS bundle ID:** `com.blacksugar21.app`
- **Android package:** `com.black.sugar21`

---

## Rutas Clave

| Plataforma | Ruta raíz |
|---|---|
| iOS | `/Users/daniel/AndroidStudioProjects/iOS/black-sugar-21/` |
| Android | `/Users/daniel/AndroidStudioProjects/BlackSugar212/app/src/main/java/com/black/sugar21/` |
| Cloud Functions | `/Users/daniel/IdeaProjects/Public-BlackSugar21/functions/index.js` |
| Firestore rules | `/Users/daniel/IdeaProjects/Public-BlackSugar21/firestore.rules` |
| Storage rules | `/Users/daniel/IdeaProjects/Public-BlackSugar21/storage.rules` |
| Remote Config | `/Users/daniel/IdeaProjects/Public-BlackSugar21/current-remote-config.json` |

### Archivos iOS críticos

| Archivo | Propósito |
|---|---|
| `data/datasource/FirestoreRemoteDataSource.swift` | Todas las operaciones Firestore (reads/writes) |
| `data/datasource/model/FirestoreUser.swift` | Modelo usuario Firestore |
| `data/repository/ProfileCardRepository.swift` | Discovery queries + geohash |
| `ui/edit-profile/EditProfileView.swift` | `getModifiedProfileFields()` — update profile |
| `ui/login/PhoneAuth/PhoneAuthViewModel.swift` | Autenticación teléfono |
| `services/AnalyticsService.swift` | Todos los eventos Analytics |
| `services/RemoteConfigService.swift` | Remote Config |

### Archivos Android críticos

| Archivo | Propósito |
|---|---|
| `core/firebase/UserServiceImpl.kt` | Todas las operaciones de usuario en Firestore |
| `core/firebase/MessageServiceImpl.kt` | Mensajes + chats |
| `core/firebase/model/FirestoreUser.kt` | Modelo usuario Firestore |
| `core/firebase/model/FirestoreMessage.kt` | Modelo mensaje + `toData()` + `toPlaceData()` |
| `core/analytics/AnalyticsService.kt` | Todos los eventos Analytics |
| `core/chat/ActiveChatManager.kt` | activeChat + activeChatTimestamp |
| `core/notification/PushNotificationService.kt` | pendingNotifications |
| `feature/home/ui/HomeViewModel.kt` | Swipes + retry WorkManager |
| `auth/create/Phone/viewmodel/PhoneAuthViewModel.kt` | Auth por teléfono |
| `core/config/RemoteConfigManager.kt` | Remote Config |

---

## Firebase Firestore — Colecciones y Campos

### `users/{userId}` — Campos del documento de usuario

```
name: String
birthDate: Timestamp
bio: String
male: Bool
orientation: String          ← SIEMPRE lowercase: "men" | "women" | "both"
userType: String             ← "SUGAR_BABY" | "SUGAR_DADDY" | "SUGAR_MOMMY"
pictures: [String]           ← URLs de Storage
liked: [String]              ← IDs de usuarios con like
passed: [String]             ← IDs de usuarios pasados
latitude: Double
longitude: Double
g: String                    ← geohash (campo "g" NOT "geohash")
minAge: Int
maxAge: Int
maxDistance: Double
paused: Bool
accountStatus: String        ← "active" | "suspended" | "deleted"
interests: [String]
visibilityReduced: Bool
superLikesRemaining: Int
superLikesUsedToday: Int
lastSuperLikeResetDate: Timestamp
dailyLikesRemaining: Int
dailyLikesLimit: Int
lastLikeResetDate: Timestamp
fcmToken: String             ← campo EXACTO: "fcmToken" (camelCase)
timezone: String             ← identificador "America/Mexico_City"
timezoneOffset: Int          ← offset numérico en horas (-6, +1, etc.)
deviceLanguage: String       ← "es", "en", etc.
blocked: [String]            ← IDs bloqueados por este usuario (⚠️ legacy: puede existir como Bool en docs antiguos — clientes tienen decoder resiliente)
blockedBy: [String]          ← IDs de usuarios que bloquearon a este usuario
accountStatus: String        ← "active" | "suspended" | "banned" | "deleted"
visibilityReduced: Bool      ← true si shadowban por reportes
shadowBannedAt: Timestamp?
shadowBanReason: String?
suspendedAt: Timestamp?
suspendedReason: String?
bannedAt: Timestamp?
bannedReason: String?
reportSummary: {             ← resumen acumulado de reportes
  uniqueReporters: Int,
  totalReports: Int,
  reasons: Map<String, Int>
}
aiModerationResult: Map?     ← resultado de análisis IA (Gemini)
activeChat: String?          ← matchId del chat abierto (nil si no hay)
activeChatTimestamp: Timestamp?
visible: Bool                ← false si cuenta pausada
pausedAt: Timestamp?
scheduledForDeletion: Bool
deletionScheduledAt: Timestamp?
```

### `matches/{matchId}` — Documento de match

```
usersMatched: [String]       ← [userId1, userId2]
timestamp: Timestamp
lastMessage: String
lastMessageSenderId: String
lastMessageTimestamp: Timestamp
messageCount: Int
lastSeenTimestamps: Map<String, Timestamp>  ← {"userId1": ts, "userId2": ts}
```

### `matches/{matchId}/messages/{msgId}` — Mensaje de texto

```
message: String
senderId: String
timestamp: Timestamp
type: String                 ← "text" | "place" | "ephemeral_photo"
isEphemeral: Bool            ← siempre false para text/place
```

### `matches/{matchId}/messages/{msgId}` — Mensaje de lugar (type: "place")

```
message: String              ← "📍 {nombre del lugar}"
senderId: String
timestamp: Timestamp
type: "place"
isEphemeral: false
placeData: {
  name, address, rating, latitude, longitude, placeId,
  googleMapsUrl?, website?, phoneNumber?, isOpenNow?,
  instagram?, instagramHandle?, tiktok?, category?,
  photos?: [{url, width, height}], description?
}
```

### `matches/{matchId}/messages/{msgId}` — Foto efímera (type: "ephemeral_photo")

```
type: "ephemeral_photo"
senderId: String
timestamp: Timestamp
isEphemeral: true
viewedBy: [String]
uploadProgress: Double        ← 0.0–1.0 (solo durante upload)
```

### `pendingNotifications/{docId}` — Disparador de notificaciones push

```
token: String               ← FCM token del destinatario
notification: {
  title_loc_key: String     ← "notification_new_message_title" | "notification_new_match_title"
  title_loc_args: [String]  ← [senderName]
  body_loc_key: String      ← "notification_new_message_body" | "notification_new_match_body"
}
data: {
  matchId: String
  senderId: String
  type: String              ← "chat_message" | "new_match"
  senderName: String
  click_action: "OPEN_CHAT" | "OPEN_MATCHES"
  matchedUserName?: String  ← solo en new_match
}
processed: false
createdAt: Timestamp
```

### `reports/{reportId}` — Documento de reporte (Moderación Progresiva)

```
reporterId: String           ← userId del que reporta
reportedUserId: String       ← userId del reportado
reason: String               ← "FAKE_PROFILE" | "INAPPROPRIATE" | "SPAM" | "HARASSMENT" | "UNDERAGE" | "OTHER"
description: String          ← texto libre opcional
matchId: String?             ← match donde ocurrió el incidente
status: String               ← "pending" | "reviewed"
action: String               ← "PERSONAL_BLOCK" | "VISIBILITY_REDUCED" | "VISIBILITY_REDUCED_AI_REVIEW" | "AI_SUSPENDED" | "SUSPENDED" | "BANNED"
uniqueReportCount: Int       ← reportadores únicos al momento del reporte
totalReportCount: Int        ← total de reportes (incluye repetidos)
reasonCounts: Map<String, Int> ← frecuencia de razones: {"FAKE_PROFILE": 3, "SPAM": 1}
aiAnalysis: Map?             ← resultado del análisis IA (shouldSuspend, confidence, reasoning)
createdAt: Timestamp
processedAt: Timestamp
```

### `swipes/{userId}/swipes/{swipedUserId}` — Swipe

```
likedBy: String             ← userId del que hizo swipe
timestamp: Timestamp
```

### `interestItems/{itemId}` y `interestCategories/{catId}` — Intereses

Lectura pública. Sin escritura desde cliente.

---

## Storage — Rutas de Archivos (VERIFICADAS EN CÓDIGO)

| Ruta de Storage | Contenido |
|---|---|
| `users/{userId}/{filename}.jpg` | Fotos de perfil (upload desde cliente) |
| `users/{userId}/{filename}_thumb.jpg` | Thumbnails de fotos de perfil (400px) |
| `ephemeral_photos/{matchId}/{photoId}.jpg` | Fotos efímeras en chat |
| `stories/personal_stories/{userId}/{storyId}.jpg` | Stories/historias |
| `temp_uploads/{userId}/{filename}` | Uploads temporales (moderación IA) |

---

## Cloud Functions — 33 callable + 2 scheduled + triggers (us-central1)

### Funciones principales (todas homologadas iOS = Android)

> ⚠️ NOTA: swipeUser, superLikeUser y sendPlaceMessage NO son CFs callable — ambas
> plataformas hacen esas operaciones directamente en Firestore.
> Los swipes/super likes se escriben en subcolecciones y el array `liked`/`passed` del usuario.

### Funciones Scheduled (Cloud Scheduler)

| CF | Schedule | Propósito |
|---|---|---|
| `resetDailyLikes` | `every 1 hours` | Reset de likes diarios a 100 (timezone-aware) |
| `resetSuperLikes` | `every 1 hours` | Reset de super likes a 5 (timezone-aware) |

**Comportamiento timezone-aware:**
- Cada hora, lee todos los usuarios activos (`paused != true`)
- Para cada usuario, calcula `(currentUTCHour + timezoneOffset) % 24`
- Solo resetea si el resultado es `0` (medianoche local del usuario)
- `resetDailyLikes`: escribe `{dailyLikesRemaining: 100, dailyLikesLimit: 100, lastLikeResetDate: now}`
- `resetSuperLikes`: escribe `{superLikesRemaining: 5, superLikesUsedToday: 0, lastSuperLikeResetDate: now}`

**Notificaciones condicionales:**
- Solo envía push si el usuario usó likes (`dailyLikesRemaining < 100`) o super likes (`superLikesRemaining < 5`)
- Usa `sendEachForMulticast` en batches de 500 tokens
- Claves de localización: `notification-daily-likes-reset-title/body` (iOS), `notification_daily_likes_reset_title/body` (Android)
- `loc-args`/`bodyLocArgs`: daily likes envía `['100']` para reemplazar `%@` (iOS) / `%1$d` (Android). Super likes no usa args (número "5" hardcodeado en strings)
- Requiere campo `timezoneOffset` actualizado en Firestore (ambas apps lo actualizan en HomeView via `updateDeviceSettings()`)

```
analyzeConversationChemistry
analyzePersonalityCompatibility
analyzePhotoBeforeUpload
analyzeProfileWithAI
blockUser
calculateSafetyScore
createStory
deleteStory
deleteUserData
detectProfileRedFlags
findSimilarProfiles
generateConversationStarter
generateIcebreakers
generateSmartReply
getBatchCompatibilityScores
getBatchPersonalStories
getBatchPhotoUrls
getBatchStoryStatus
getCompatibleProfileIds
getDateSuggestions
getDatingAdvice
getEnhancedCompatibilityScore
getMatchesWithMetadata
markStoryAsViewed
moderateMessage
moderateProfileImage
optimizeProfilePhotos
predictMatchSuccess
predictOptimalMessageTime
reportUser
searchPlaces
unmatchUser
validateProfileImage
```

**Solo Android (utilidades de test):** `testDailyLikesResetNotification`, `testSuperLikesResetNotification`

### Payloads CF críticos (verificados en código — iOS = Android ✅)

| CF | Input | Output |
|---|---|---|
| `analyzePersonalityCompatibility` | `{userId, targetUserId}` | `{analysis: {...}}` |
| `analyzeProfileWithAI` | `{currentUserId, targetUserId}` | `{analysis: {...}}` |
| `predictMatchSuccess` | `{userId, targetUserId}` | `{prediction: {...}}` |
| `getEnhancedCompatibilityScore` | `{currentUserId, candidateId}` | `{totalScore, baseScore, aiScore, explanation}` |
| `getBatchCompatibilityScores` | `{currentUserId, targetUserIds: [...]}` | `{success, scores: [{userId, score}], validCount}` |
| `getCompatibleProfileIds` | `{userId, limit}` | `{success, profileIds: [...], totalExcluded, cooldownDays}` |
| `generateConversationStarter` | `{userId, matchUserId}` | `{suggestions: {starters: [{message, reasoning, expectedResponse}]}}` |
| `generateIcebreakers` | `{userId, matchUserId}` | `{starters: [...]}` |
| `generateSmartReply` | `{matchId, lastMessage, userId, userLanguage}` | `{reply}` |
| `analyzeConversationChemistry` | `{matchId, userLanguage}` | `{chemistry: {...}}` |
| `optimizeProfilePhotos` | `{userId}` | `{optimizedOrder, scores: [{url, visualQuality,...}]}` |
| `findSimilarProfiles` | `{userId, limit}` | `{matches: [{userId, similarity}]}` |
| `detectProfileRedFlags` | `{userId}` | `{hasRedFlags, confidence, details}` |
| `calculateSafetyScore` | `{targetUserId, userLanguage}` | `{score, details}` |
| `predictOptimalMessageTime` | `{targetUserId, userLanguage}` | `{optimalTime, ...}` |
| `getDateSuggestions` | — | — |
| `getDatingAdvice` | `{situation, context, userLanguage}` | — |
| `reportUser` | `{reportedUserId, reason, matchId, description?}` | `{success, action, reportId, uniqueReportCount, totalReportCount}` |
| `blockUser` | `{blockedUserId}` | — |
| `unmatchUser` | `{matchId, otherUserId, language}` | — |
| `deleteUserData` | `{userId}` | — |
| `searchPlaces` | `{matchId, query, userLanguage}` | `{places: [...]}` |
| `getBatchPhotoUrls` | `{photoRequests: [{userId, pictureNames, includeThumb?}]}` | `{success, urls: {userId: [{url, thumbUrl}]}, totalPhotos}` |
| `getBatchStoryStatus` | `{userIds: [...]}` | `{storiesStatus: {userId: bool}}` |
| `getBatchPersonalStories` | `{userIds: [...]}` | `{stories: {userId: [...]}, stats}` |
| `markStoryAsViewed` | `{storyId}` | — |
| `deleteStory` | `{storyId}` | — |
| `createStory` | `{imageUrl, matchId, matchParticipants}` | — |
| `moderateMessage` | `{matchId, message, language}` | — |
| `validateProfileImage` | `{imageUrl, expectedIsMale, expectedAge}` | `{isValid, detectedGender, detectedAge, confidence, issues, hasFace}` |
| `moderateProfileImage` | `{imageUrl, expectedGender, userLanguage}` | `{verdict, confidence, violations, explanation}` |
| `analyzePhotoBeforeUpload` | `{photoBase64, userLanguage}` | `{success, score, overallQuality, shouldReplace, strengths, improvements}` |
| `getMatchesWithMetadata` | `{}` (sin parámetros — usa auth) | `{matches: [{id, userId, name, age, ...}]}` ← Android only |

---

## Remote Config — 12 claves (VERIFICADAS EN CÓDIGO)

| Clave | Tipo | Default | Descripción |
|---|---|---|---|
| `compatibility_weights` | JSON String | `CompatibilityWeights.default` | Pesos para score de compatibilidad |
| `matching_scoring_weights` | JSON String | `MatchingScoringWeights.default` | Pesos para MatchingScoreCalculator |
| `daily_likes_limit` | Number | 100 | Límite de likes diarios (SIEMPRE 100, nunca random) |
| `daily_super_likes_limit` | Number | 5 | Límite de super likes diarios |
| `max_search_radius_km` | Number | 200.0 | Radio máximo de búsqueda en km |
| `ai_moderation_confidence_threshold` | Number | 0.80 | Umbral de confianza moderación IA |
| `profile_reappear_cooldown_days` | Number | 14 | Días antes de reaparecer un perfil descartado |
| `bulk_query_batch_size` | Number | 50 | Tamaño de batch para queries múltiples |
| `minimum_age_by_country` | JSON String | `{"default": 18}` | Edad mínima por país |
| `enable_bio_ai_suggestions` | Boolean | false | Habilitar sugerencias de bio con IA |
| `reviewer_test_phone` | String | `"+16505550123"` | Teléfono de prueba para revisores Apple/Google |
| `reviewer_test_code` | String | `"123456"` | Código de verificación para el test phone del reviewer |
| `terms_url` | String | `"https://www.blacksugar21.com/terms"` | URL de términos de uso (leída en LoginView) |
| `privacy_url` | String | `"https://www.blacksugar21.com/privacy"` | URL de política de privacidad (leída en LoginView) |

**Intervalo de actualización:** 3600 segundos (idéntico iOS `services/RemoteConfigService.swift` y Android `core/firebase/RemoteConfigManager.kt`)

---

## Analytics Events — 23 eventos (homologados iOS = Android)

### Eventos verificados ✅

```
profile_like, profile_pass, super_like
match_created, unmatch
message_sent, message_received
photo_upload, photo_delete
profile_edit
filter_change
user_block, user_report
session_end
story_created, story_viewed, story_deleted
purchase_failed
begin_checkout          ← Android: logPurchaseStart() → FirebaseAnalytics.Event.BEGIN_CHECKOUT
phone_verification_code_sent
phone_verification_error
phone_verification_failed
swipe_failed_pending_retry
```

### Parámetros clave por evento

```
profile_like:    target_user_id, action="like", profile_age?, distance_km?
profile_pass:    target_user_id, action="pass"
super_like:      target_user_id, action="super_like"
match_created:   match_user_id, time_since_first_view_ms?
message_sent:    recipient_user_id, message_length, is_first_message
filter_change:   min_age?, max_age?, max_distance_km?, gender_preference?
swipe_failed_pending_retry: user_id, action ("like"|"super_like")
phone_verification_code_sent: method="phone", phone_number
phone_verification_failed: reason
```

---

## Patrones de Alineación iOS ↔ Android

### Reglas CRÍTICAS a verificar en toda auditoría

1. **Geohash:** campo siempre `"g"` (NO `"geohash"`)
2. **Orientación:** SIEMPRE lowercase `"men"` | `"women"` | `"both"`
3. **FCM Token:** campo EXACTO `"fcmToken"` (camelCase)
4. **isEphemeral:** todo mensaje escribe `isEphemeral: false` (incluso text/place)
5. **superLiked:** iOS y Android escriben al array `"superLiked"` del usuario Y en subcolección
6. **activeChat:** se elimina con `FieldValue.delete()` al salir del chat
7. **orientation en root:** iOS escribe `"orientation"` en root del user doc + en `discoveryPreferences.interestedIn`
8. **timezoneOffset:** se escribe en `createUser`, `updateDeviceSettings` Y `updateUserLocation`. Ambas apps llaman `updateDeviceSettings()` en `HomeViewModel.fetchProfiles()` cada vez que el usuario entra a HomeView — esto garantiza que las CFs de reset (`resetDailyLikes`/`resetSuperLikes`) tengan el offset correcto
9. **visible:** solo se escribe al pausar/despausar (no en createUser)
10. **pendingNotifications:** siempre incluye `createdAt: serverTimestamp()`
11. **Crashlytics setUserId:** Android debe llamar `FirebaseCrashlytics.getInstance().setUserId(userId)` al login (homologado con iOS `Crashlytics.crashlytics().setUserID(userId)`)
12. **Storage paths:** rutas correctas: `users/{userId}/{filename}` (fotos perfil), `ephemeral_photos/{matchId}/{photoId}.jpg`, `stories/personal_stories/{userId}/{storyId}.jpg`. NUNCA `profile_images/` — fix aplicado en `MatchFirebaseDataSourceImpl.kt`
13. **Super Like batch:** ambas plataformas usan batch atómico: `{superLikesRemaining: increment(-1), superLikesUsedToday: increment(1), superLiked: arrayUnion()}` + swipe subcolección `{timestamp, isLike:true, isSuperLike:true}` + liked subcolección `{exists:true, superLike:true}` + post-batch `superLiked/{userId}` con `{timestamp}`
14. **Ephemeral photo:** estructura `{message:"", senderId, timestamp, type:"ephemeral_photo", photoUrl, isEphemeral:true, expiresAt, viewedBy:[], isUploading:false}` — idéntica iOS/Android
15. **activeChat lifecycle:** `setActiveChat` → `{activeChat: matchId, activeChatTimestamp: serverTimestamp()}`, `clearActiveChat` → ambos campos con `FieldValue.delete()` — idéntico iOS/Android
16. **pauseAccount:** escribe `{paused:true, visible:false, pausedAt:serverTimestamp()}` — reactivate escribe `{paused:false, visible:true}`
17. **blockUser:** ambas plataformas llaman CF `blockUser({blockedUserId})`. `unblockUser` es local: `FieldValue.arrayRemove(blockedUserId)` del array `blocked`. Bloqueo bidireccional: `blocked` (usuario que bloquea) + `blockedBy` (usuario bloqueado)
18. **fcmBuildType:** solo Android escribe `fcmBuildType` ("debug"|"release") junto al `fcmToken`. iOS solo escribe `fcmToken`. No afecta funcionalidad (no se usa en CFs)
19. **apnsToken:** solo iOS escribe `apnsToken` en dispositivos reales. No tiene equivalente Android. No afecta funcionalidad
20. **Swipe regular:** batch atómico `{liked/passed: arrayUnion, dailyLikesRemaining: increment(-1)}` + swipe subcolección `{timestamp, isLike, isSuperLike:false}` + liked subcolección `{exists:true, superLike:false}` — idéntico iOS/Android
21. **Daily likes reset:** SIEMPRE 100 (nunca random). `createUser` debe inicializar `{dailyLikesRemaining:100, dailyLikesLimit:100}`. Client-side: comparación por día calendario. Server-side: CF `resetDailyLikes` corre `every 1 hours`, verifica `(UTCHour + timezoneOffset) % 24 === 0` para detectar medianoche local. Escribe `{dailyLikesRemaining:100, dailyLikesLimit:100, lastLikeResetDate}`. Solo notifica si `dailyLikesRemaining < 100` (usuario usó likes) — idéntico iOS/Android. ⚠️ NUNCA decrementar `dailyLikesLimit` — solo decrementar `dailyLikesRemaining`
22. **Super likes reset:** SIEMPRE 5. Server-side: CF `resetSuperLikes` corre `every 1 hours`, misma lógica timezone. Escribe `{superLikesRemaining:5, superLikesUsedToday:0, lastSuperLikeResetDate}`. Solo notifica si `superLikesRemaining < 5` — idéntico iOS/Android
23. **Match detection:** `hasUserLikedBack()` lee `otherUser.liked` y verifica si contiene `currentUserId`. 100ms delay antes de verificar — idéntico iOS/Android
24. **Match notification:** enviada por CF trigger `onMatchCreated` (NO por cliente). `sendMatchNotification` en Android es código muerto
25. **Photo upload:** `users/{userId}/{uuid}.jpg` + thumbnail `users/{userId}/{uuid}_thumb.jpg` (400px). Max dimension 1920px, target 500KB — idéntico iOS/Android
26. **Scheduled deletion:** Android escribe 4 campos (`scheduledDeletionDate`, `scheduledForDeletion`, `deletionDate`, `deletionScheduledAt`), iOS escribe 3 (sin `scheduledDeletionDate`). Aceptable — ninguna CF depende de `scheduledDeletionDate`
27. **AI CFs:** 15 CFs de IA idénticas en ambas plataformas. Todas usan `us-central1`. Payloads verificados: `generateSmartReply`, `calculateSafetyScore`, `analyzeConversationChemistry`, `predictOptimalMessageTime`, `getDatingAdvice`, `analyzePhotoBeforeUpload`, `moderateProfileImage`, `validateProfileImage`, `moderateMessage`
28. **searchPlaces CF:** `{matchId, query, userLanguage}` — idéntico iOS/Android (Android también tiene PlacesSDK para edit-profile, pero chat usa CF)
29. **reportUser — Moderación Progresiva:** `reportUser` incluye bloqueo personal (solo el reporter deja de ver al reported) + escalamiento progresivo basado en reportadores ÚNICOS (no raw count). Umbrales: 1-2 → solo bloqueo personal, 3-4 → `visibilityReduced:true`, 5-6 → visibilidad reducida + análisis IA (Gemini 2.0 Flash, auto-suspende si confianza ≥ 0.8), 7-9 → `accountStatus:'suspended'`, 10+ → `accountStatus:'banned'`. Rate limit: máx 5 reportes/día por reporter. Genera `reportSummary` en user doc con `uniqueReporters`, `totalReports`, `reasonCounts`. Elimina match + mensajes + likes mutuos entre reporter y reported. Bloqueo bidireccional: `blocked`/`blockedBy` arrays — idéntico iOS/Android
30. **blocked/blockedBy bidireccional:** `blockUser` y `reportUser` CFs escriben `blocked` (array del que bloquea) + `blockedBy` (array del bloqueado). Discovery filtra ambos arrays. `unblockUser` es local con `arrayRemove` — idéntico iOS/Android

---

## Firestore Security Rules — Colecciones Cubiertas

| Colección | Read | Write | Notas |
|---|---|---|---|
| `users/{userId}` | auth | owner + validaciones lat/lng/maxDistance | Subcolecciones: liked, passed, swipes, superLiked, compatibility_scores |
| `users/{userId}/liked/{id}` | auth | owner | Lectura pública para verificar matches |
| `users/{userId}/passed/{id}` | owner | owner | Solo propietario |
| `users/{userId}/swipes/{id}` | owner | owner | Cooldown de perfiles |
| `users/{userId}/superLiked/{id}` | auth | owner | Lectura pública para super likes recibidos |
| `matches/{matchId}` | participant | participant (create/update) | No delete. Primer mensaje solo DADDY/MOMMY |
| `matches/{matchId}/messages/{id}` | participant | senderId + participant check | Update limitado a uploadProgress/photoUrl/isUploading (sender) o viewedBy (ephemeral) |
| `pendingNotifications/{id}` | false | create (auth) | Solo CFs leen/procesan |
| `stories/{storyId}` | auth | owner + viewedBy update | Cualquier auth puede agregar a viewedBy |
| `interestItems/{id}` | auth | false | Solo admin SDK |
| `interestCategories/{id}` | auth | false | Solo admin SDK |
| `likes/{id}` | legacy | legacy | NO se usa — regla legacy |
| `messages/{id}` | legacy | legacy | NO se usa — regla legacy |

---

## App Check

| Plataforma | Provider |
|---|---|
| iOS | DeviceCheck (production) |
| Android | PlayIntegrity |
| Debug (ambos) | DebugAppCheckProviderFactory |

---

## Comandos de Deploy

```bash
# Desplegar funciones
cd /Users/daniel/IdeaProjects/Public-BlackSugar21
firebase deploy --only functions --force

# Desplegar reglas Firestore
firebase deploy --only firestore:rules

# Desplegar reglas Storage
firebase deploy --only storage

# Desplegar Remote Config (manual via consola Firebase)
# URL: https://console.firebase.google.com/project/black-sugar21/remoteconfig
```

---

## MCP Server — Agent Skills Ejecutables

El servidor MCP `blacksugar-firebase` está registrado en `.vscode/mcp.json` y provee estas herramientas:

| Herramienta | Descripción |
|---|---|
| `full_audit` | Auditoría completa iOS ↔ Android (CFs, Analytics, campos Firestore) |
| `audit_cf_alignment` | Compara Cloud Functions entre iOS y Android |
| `audit_analytics_alignment` | Compara eventos Analytics entre plataformas |
| `search_code` | Busca un patrón en Swift/Kotlin del proyecto |
| `check_firestore_field` | Verifica un campo Firestore en ambas plataformas |
| `read_cloud_function` | Lee el código fuente de una CF en index.js |
| `deploy_firebase` | Despliega functions/rules a Firebase |
| `read_firestore_rules` | Lee el archivo firestore.rules actual |
| `check_orientation_values` | Verifica que orientation sea siempre lowercase |
| `list_project_info` | Muestra estadísticas del proyecto |

---

## Guía de Auditoría Estándar

Cuando audites alineación iOS ↔ Android, siempre verifica:

1. **Nombres de funciones HTTP Callable** — lista completa debe ser idéntica
2. **Payloads de entrada** a cada CF (params enviados)
3. **Campos Firestore escritos** al crear/actualizar usuario
4. **Campos del documento de mensaje** (text + place + ephemeral)
5. **Eventos Analytics** — nombres y parámetros exactos
6. **Remote Config** — claves, tipos y defaults
7. **Storage paths** — rutas exactas de archivos subidos
8. **pendingNotifications** — estructura del documento
9. **activeChat lifecycle** — setActiveChat/clearActiveChat con FieldValue.delete()
10. **Super Like batch** — operación atómica con subcollecciones
11. **Ephemeral photos** — campos del mensaje + viewedBy + photoUrl + 3-step upload flow
12. **Pause/Reactivate** — campos paused, visible, pausedAt
13. **Firestore Security Rules** — verificar que todas las colecciones usadas tengan reglas
14. **Block/Unblock** — blockUser via CF, unblockUser local con arrayRemove. Bloqueo bidireccional: `blocked`/`blockedBy`
15. **reportUser — Moderación Progresiva** — personal block + escalamiento por unique reporters + IA
16. **Swipe regular/pass** — batch atómico + swipe/liked subcollecciones
17. **Daily/Super likes reset** — calendar day comparison, always 100
18. **Match detection** — hasUserLikedBack() + 100ms delay
19. **Photo upload/delete** — UUID.jpg + _thumb.jpg (400px), Storage path `users/{userId}/`
20. **AI CFs (15)** — payloads y nombres idénticos
21. **Photo/Message moderation** — 4 CFs (moderateMessage, moderateProfileImage, validateProfileImage, analyzePhotoBeforeUpload)
22. **Scheduled deletion** — scheduleAccountDeletion/cancelScheduledDeletion campos
23. **Push notifications** — pendingNotifications para mensajes, CF trigger para matches
24. **Compatibility scoring** — getBatchCompatibilityScores + getEnhancedCompatibilityScore
25. **searchPlaces** — CF con {matchId, query, userLanguage}

### Áreas Verificadas ✅ (última auditoría profunda)

| Área | Estado | Resultado |
|---|---|---|
| 33 CF Payloads | ✅ | Todas idénticas iOS = Android |
| createUser fields | ✅ | 22+ campos idénticos |
| updateProfile fields | ✅ | Delta-update, orientation lowercase |
| sendMessage fields | ✅ | text + match update idénticos |
| sendPlaceMessage | ✅ | placeData + 16 campos opcionales |
| Ephemeral photos | ✅ | Estructura completa idéntica |
| pendingNotifications | ✅ | Estructura + localization keys |
| Match creation | ✅ | 7 campos incluyendo userTypesAtMatch |
| Super Like batch | ✅ | Batch atómico + post-batch subcollección |
| activeChat lifecycle | ✅ | set/clear con FieldValue.delete() |
| updateDeviceSettings | ✅ | timezoneOffset + deviceLanguage |
| updateUserLocation | ✅ | lat/lng/g/timezone/timezoneOffset |
| Geohash field "g" | ✅ | PropertyName, queries, constants |
| Pause/Reactivate | ✅ | paused/visible/pausedAt |
| Block/Unblock | ✅ | CF + arrayRemove |
| Storage paths | ✅ | users/, ephemeral_photos/, stories/ |
| Analytics events | ✅ | 24 eventos idénticos |
| Remote Config | ✅ | 10/10 claves + defaults |
| Firestore Rules | ✅ | Todas las colecciones cubiertas |
| FCM token | ✅ | Aceptable (Android +fcmBuildType extra) |
| Swipe regular + pass | ✅ | Batch atómico idéntico |
| Daily/Super likes reset | ✅ | Always 100/5, CF timezone-aware `every 1 hours`, conditional push |
| Match detection | ✅ | hasUserLikedBack() lee otherUser.liked |
| Unmatch/Report/Delete CFs | ✅ | Payloads idénticos |
| reportUser progressive moderation | ✅ | Personal block + unique reporters + AI (Gemini 2.0 Flash) + escalamiento 5 niveles |
| blocked/blockedBy bidireccional | ✅ | blockUser + reportUser CFs escriben ambos arrays |
| Stories CRUD (5 CFs) | ✅ | create/delete/markViewed/batchStatus/batchStories |
| Discovery queries | ✅ | CF primary + geohash fallback |
| lastSeenTimestamps | ✅ | Creación, update, read para unread |
| Crashlytics + App Check | ✅ | setUserId + providers correctos |
| Orientation enforcement | ✅ | Enum lowercase + decoder normaliza |
| Photo upload/delete | ✅ | users/{uuid}.jpg + _thumb.jpg 400px |
| Scheduled deletion | ✅ | Aceptable (Android +scheduledDeletionDate extra) |
| Push notifications | ✅ | pendingNotifications + CF trigger onMatchCreated + reset CFs conditional push |
| 15 AI CFs payloads | ✅ | Todos idénticos iOS = Android |
| Photo/Message moderation | ✅ | 4 CFs moderación idénticas |
| searchPlaces CF | ✅ | {matchId, query, userLanguage} idéntico |
| Ephemeral photo upload | ✅ | 3-step flow + Storage path idéntico |
| Compatibility scoring | ✅ | getBatchCompatibilityScores idéntico |
| updateDeviceSettings on HomeView | ✅ | timezoneOffset + deviceLanguage en fetchProfiles() |
| Remote Config URLs | ✅ | terms_url + privacy_url leídas en LoginView |
| Reset CFs timezone-aware | ✅ | resetDailyLikes + resetSuperLikes `every 1 hours` con push condicional |

### Comandos de auditoría rápida

```bash
# Listar todas las CF llamadas por iOS
grep -rn "httpsCallable" /Users/daniel/AndroidStudioProjects/iOS/black-sugar-21/ --include="*.swift" | grep '"' | sed 's/.*"\([a-zA-Z]*\)".*/\1/' | sort -u

# Listar todas las CF llamadas por Android
grep -rn "getHttpsCallable\|httpsCallable" /Users/daniel/AndroidStudioProjects/BlackSugar212/ --include="*.kt" | grep '"' | sed 's/.*"\([a-zA-Z]*\)".*/\1/' | sort -u

# Comparar eventos analytics iOS
grep -rn "logEvent" /Users/daniel/AndroidStudioProjects/iOS/black-sugar-21/ --include="*.swift" | grep '"[a-z_]*"' | sed 's/.*"\([a-z_]*\)".*/\1/' | sort -u

# Comparar eventos analytics Android
grep -rn "logEvent" /Users/daniel/AndroidStudioProjects/BlackSugar212/ --include="*.kt" | grep '"[a-z_]*"' | sed 's/.*"\([a-z_]*\)".*/\1/' | sort -u
```

---

## Setup & Deployment

### Android — Setup Local

1. **Gemini API Key** en `local.properties`:
   ```properties
   sdk.dir=/Users/daniel/Library/Android/sdk
   GEMINI_API_KEY=tu_api_key_aqui
   ```
   Obtener en: https://aistudio.google.com/app/apikey

2. **Keystore** para release:
   ```bash
   keytool -genkey -v -keystore blacksugar-release-key.jks \
     -keyalg RSA -keysize 2048 -validity 10000 -alias blacksugar-key-alias
   cp keystore.properties.template keystore.properties
   # Editar keystore.properties con passwords reales
   ```

3. **Build:**
   ```bash
   ./gradlew assembleRelease    # APK
   ./gradlew bundleRelease      # AAB (Google Play)
   ```

4. **Debug vs Prod:** centralizado en `AppConfig` (`core/config/AppConfig.kt`). Logging via `AppLogger` (solo `e()` en prod).

### iOS — Setup Local

1. **Xcode:** Abrir `black-sugar-21.xcodeproj`
2. **GoogleService-Info.plist** debe estar en el proyecto
3. **Build:** `Cmd+B` en Xcode o:
   ```bash
   xcodebuild -project black-sugar-21.xcodeproj -scheme black-sugar-21 -configuration Debug build CODE_SIGNING_ALLOWED=NO
   ```

### iOS — CI/CD (GitHub Actions)

Secrets requeridos en GitHub (ver `.github/*.md` en repo iOS para detalles):

| Secret | Descripción |
|---|---|
| `FIREBASE_IOS_APP_ID` | `1:706595096331:ios:xxx` (Firebase Console → Settings) |
| `FIREBASE_SERVICE_ACCOUNT` | JSON de cuenta de servicio Firebase Admin |
| `IOS_CERTIFICATE_BASE64` | Certificado `.p12` en base64 |
| `IOS_CERTIFICATE_PASSWORD` | Password del `.p12` |
| `IOS_PROVISIONING_PROFILE_BASE64` | Provisioning profile en base64 |
| `APP_STORE_CONNECT_API_KEY_ID` | Key ID de App Store Connect API |
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer ID |
| `APP_STORE_CONNECT_API_KEY_BASE64` | Archivo `.p8` en base64 |
| `IOS_DIST_CERTIFICATE_BASE64` | Certificado de distribución en base64 |
| `IOS_PROVISIONING_PROFILE_DIST_BASE64` | Profile de App Store en base64 |

### Web (Angular) — Deploy

```bash
cd /Users/daniel/IdeaProjects/Public-BlackSugar21
./deploy.sh                          # Automático
# o manual:
npm run build:prod && firebase deploy --only hosting
```

**URL:** https://black-sugar21.web.app

### App Check — Debug Token Web

Si error 403 en localhost:
1. Copiar debug token de consola del navegador
2. Firebase Console → App Check → Apps → Web app → Manage debug tokens → Add
3. Recargar localhost

### Cuenta Reviewer (Apple App Store / Google Play)

Cuenta de prueba pre-cargada para validadores de tiendas.

| Campo | Valor |
|---|---|
| Teléfono | `+16505550123` (US, rango 555-01XX reservado ficción) |
| Código OTP | `123456` |
| Auth UID | `VrZigyvzLFR3XoGEkUbpxVTjvd72` |
| Nombre | Ricardo |
| Tipo | SUGAR_DADDY, 35 años, hombre |
| Ubicación | Santiago, Chile (-33.4489, -70.6693) |
| Remote Config | `reviewer_test_phone`, `reviewer_test_code` |

**Datos pre-cargados:**
- 3 fotos de perfil con thumbnails (Storage: `users/{uid}/{uuid}.jpg` + `_thumb.jpg`)
- 8 perfiles de discovery (mujeres, SUGAR_BABY/SUGAR_MOMMY, 21-30 años, Santiago)
- 3 matches con conversaciones de chat (5, 4, 6 mensajes c/u)
- Todos marcados con `isTest: true, isReviewer: true`

**Script de seed:**
```bash
# Crear/recrear toda la data del reviewer
cd /Users/daniel/IdeaProjects/Public-BlackSugar21
node scripts/seed-reviewer.js --clean

# Solo eliminar data existente
node scripts/seed-reviewer.js --delete
```

**Paso manual OBLIGATORIO** (Firebase Console):
1. Ir a Firebase Console → Authentication → Sign-in method → Phone
2. En "Phone numbers for testing" agregar: `+16505550123` con código `123456`
3. Sin este paso, el teléfono no funcionará (Firebase enviará SMS real al número inexistente)

---

## Angular Web App — Estructura y Configuración

### Identidad

- **Framework:** Angular 21 (standalone components)
- **TypeScript:** 5.9.2
- **Firebase SDK:** 12.6.0 (web)
- **Firebase Hosting site:** `black-sugar21`
- **URL:** https://black-sugar21.web.app
- **Dominio custom:** https://blacksugar21.com

### Build & Deploy

```bash
# Build producción
npm run build:prod

# Deploy a Firebase Hosting
npm run deploy                    # build + deploy
npm run deploy:hosting            # build + deploy solo hosting

# Desplegar funciones
firebase deploy --only functions --force

# Desplegar reglas Firestore
firebase deploy --only firestore:rules

# Desplegar reglas Storage
firebase deploy --only storage
```

**Output dir:** `dist/Public-BlackSugar21/browser`
**SPA rewrite:** todas las rutas → `index.html`

### Dependencias

| Paquete | Versión | Propósito |
|---|---|---|
| `@angular/core` | `^21.0.0` | Framework |
| `@angular/router` | `^21.0.0` | Routing |
| `@angular/forms` | `^21.0.0` | Formularios |
| `firebase` | `^12.6.0` | SDK Firebase web |
| `firebase-admin` | `^13.6.0` | Admin SDK (scripts server-side) |
| `typescript` | `~5.9.2` | Compilador |

### Archivos del proyecto web

| Archivo | Propósito |
|---|---|
| `src/app/app.ts` | Componente raíz (standalone) |
| `src/app/app.routes.ts` | Definición de rutas (6 rutas) |
| `src/app/app.config.ts` | Configuración de providers |
| `src/app/firebase.config.ts` | Config Firebase + reCAPTCHA App Check |
| `src/app/firebase.service.ts` | Servicio Firebase (inicialización) |
| `src/app/translation.service.ts` | i18n ES/EN (~689 líneas, todas las traducciones) |
| `src/styles.css` | Estilos globales + CSS variables |
| `src/app/app.css` | Estilos del componente raíz |

### Rutas

| Path | Componente | Descripción |
|---|---|---|
| `/moderation-policy` | `ModerationPolicyComponent` | Políticas de moderación |
| `/politicas-moderacion` | `ModerationPolicyComponent` | Alias español |
| `/terms` | `TermsComponent` | Términos de uso |
| `/privacy` | `PrivacyComponent` | Política de privacidad |
| `/data-deletion` | `DataDeletionComponent` | Eliminación de datos |
| `/safety-standards` | `SafetyStandardsComponent` | Estándares de seguridad infantil |

### Páginas (standalone components)

| Componente | Directorio | Archivos |
|---|---|---|
| `PrivacyComponent` | `src/app/pages/privacy/` | `.ts`, `.html`, `.css` |
| `TermsComponent` | `src/app/pages/terms/` | `.ts`, `.html`, `.css` |
| `DataDeletionComponent` | `src/app/pages/data-deletion/` | `.ts`, `.html`, `.css` |
| `SafetyStandardsComponent` | `src/app/pages/safety-standards/` | `.ts`, `.html`, `.css` |
| `ModerationPolicyComponent` | `src/app/components/moderation-policy/` | `.ts`, `.html`, `.css` |

### Sistema de Colores (CSS Variables — alineado 1:1 con iOS)

**Archivos centrales:** `src/styles.css` + `src/app/app.css` (variables duplicadas en ambos)

**Fuente de verdad:** iOS (`ColorTheme.swift` + `AppColor.swift`). Todos los hex deben coincidir 1:1.

#### Regla CRÍTICA

> **NUNCA usar colores hardcodeados en CSS de componentes.** Siempre usar las CSS variables definidas en `src/styles.css`. Los colores están alineados con la paleta iOS.

#### Paleta completa (`:root`)

```css
:root {
  /* Backgrounds — iOS ColorTheme.swift */
  --bg-dark: #0A0A0A;             /* iOS: primaryDark */
  --bg-card: #1A1A1A;             /* iOS: surfaceDark */
  --bg-overlay: #2D2D2D;          /* iOS: textSecondaryLight */
  --card-bg: #1E1E1E;             /* iOS: cardBgDark */

  /* Gold — iOS AppColor.swift */
  --gold-dark: #B8860B;           /* iOS: accentDark / darkGoldenrod */
  --gold: #D4AF37;                /* iOS: accentVariantDark / metallicGold */
  --gold-variant: #C5A028;        /* iOS: goldVariant */
  --gold-star: #FFD700;           /* iOS: ratingStarGold */

  /* Purple */
  --purple: #4A004F;              /* iOS: secondaryAccentDark */
  --purple-light-accent: #6A1B9A; /* iOS: secondaryAccentLight */
  --purple-vivid: #831bfc;        /* iOS: purpleColors[0] */
  --purple-light: #9c59ea;        /* iOS: purpleColors[1] */

  /* Reactions — iOS AppColor arrays */
  --dislike-red1: #FF6560;        /* iOS: dislikeColors[0] */
  --dislike-red2: #F83770;        /* iOS: dislikeColors[1] */
  --like-green1: #6CEAC5;         /* iOS: likeColors[0] */
  --like-green2: #16DBA1;         /* iOS: likeColors[1] */
  --app-red: #FF4457;             /* iOS: appRed */

  /* Brand */
  --facebook-blue: #1877F2;       /* iOS: facebookBlue */
  --instagram-pink: #E4405F;      /* iOS: instagramPink */

  /* iOS Grays */
  --lighter-gray: #F0F2F4;        /* iOS: lighterGray */
  --light-gray: #E9EBEE;          /* iOS: lightGray */
  --darker-gray: #D2D4D6;         /* iOS: darkerGray */
  --darkest-gray: #D5D7DF;        /* iOS: darkestGray */
  --blue-gray: #505966;           /* iOS: blueGray */

  /* Text — iOS ColorTheme.swift dark mode */
  --text-primary: #FFFFFF;         /* iOS: textPrimaryDark */
  --text-secondary: #E0E0E0;      /* iOS: textSecondaryDark */
  --text-muted: #B0B0B0;          /* gris neutro para hints */

  /* Gradients */
  --gradient-gold: linear-gradient(135deg, var(--gold-dark), var(--gold));
  --gradient-purple: linear-gradient(135deg, #2a002e, var(--purple));
  --gradient-luxury: linear-gradient(135deg, var(--bg-card), #252525);
  --gradient-main: linear-gradient(to bottom, #0A0A14, #140B28, #1C0E38);
}
```

#### Mapeo CSS → iOS → Android

| CSS Variable | Hex | iOS Token | Android Token |
|---|---|---|---|
| `--bg-dark` | `#0A0A0A` | `primaryDark` | `AlmostBlack` |
| `--bg-card` | `#1A1A1A` | `surfaceDark` | `SurfaceDark` |
| `--card-bg` | `#1E1E1E` | `cardBgDark` | `CardBgDark` |
| `--gold-dark` | `#B8860B` | `accentDark` / `darkGoldenrod` | `DarkGoldenrod` |
| `--gold` | `#D4AF37` | `accentVariantDark` / `metallicGold` | `MetallicGold` |
| `--gold-variant` | `#C5A028` | `goldVariant` | `GoldVariant` |
| `--gold-star` | `#FFD700` | `ratingStarGold` | `RatingStarGold` |
| `--purple` | `#4A004F` | `secondaryAccentDark` | `DarkMagenta` |
| `--purple-vivid` | `#831BFC` | `purpleColors[0]` | `Purple1` |
| `--purple-light` | `#9C59EA` | `purpleColors[1]` | `Purple2` |
| `--dislike-red1` | `#FF6560` | `dislikeColors[0]` | `DislikeRed1` |
| `--dislike-red2` | `#F83770` | `dislikeColors[1]` | `DislikeRed2` |
| `--like-green1` | `#6CEAC5` | `likeColors[0]` | `LikeGreen1` |
| `--like-green2` | `#16DBA1` | `likeColors[1]` | `LikeGreen2` |
| `--app-red` | `#FF4457` | `appRed` | `AppRed` |
| `--facebook-blue` | `#1877F2` | `facebookBlue` | `FacebookBlue` |
| `--instagram-pink` | `#E4405F` | `instagramPink` | `InstagramPink` |
| `--text-primary` | `#FFFFFF` | `textPrimaryDark` | `TextPrimaryDark` |
| `--text-secondary` | `#E0E0E0` | `textSecondaryDark` | `TextSecondaryDark` |

**Tipografía:**
- Body: `'Outfit', sans-serif`
- Headers: `'Playfair Display', serif`

### Internacionalización (i18n)

- **Servicio:** `TranslationService` (inyectable, standalone)
- **Idiomas:** `es` (default), `en`
- **Detección:** automática por `navigator.language`
- **Archivo:** `src/app/translation.service.ts` (~689 líneas)
- **Uso en templates:** `{{ t.translate('key') }}`

### Firebase Hosting Config (`firebase.json`)

```json
{
  "hosting": {
    "site": "black-sugar21",
    "public": "dist/Public-BlackSugar21/browser",
    "rewrites": [{ "source": "**", "destination": "/index.html" }],
    "headers": [
      { "source": "**/*.@(jpg|jpeg|gif|png|svg|webp|ico)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
      { "source": "**/*.@(js|css)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }
    ]
  }
}
```

### Scripts de administración

| Script | Propósito |
|---|---|
| `scripts/seed-reviewer.js` | Crear/eliminar data del reviewer de App Store/Play |
| `scripts/seed-profiles.js` | Crear perfiles de prueba en Firestore |
| `scripts/seed-run.js` | Runner para seed scripts |
| `scripts/test-master.js` | Test de integración |

### MCP Server (`mcp-blacksugar/`)

Servidor MCP registrado en `.vscode/mcp.json` para herramientas de auditoría:

| Herramienta | Descripción |
|---|---|
| `full_audit` | Auditoría completa iOS ↔ Android |
| `audit_cf_alignment` | Compara Cloud Functions entre plataformas |
| `audit_analytics_alignment` | Compara eventos Analytics |
| `search_code` | Busca patrón en Swift/Kotlin |
| `check_firestore_field` | Verifica campo Firestore en ambas plataformas |
| `read_cloud_function` | Lee código fuente de una CF |
| `deploy_firebase` | Despliega functions/rules |
| `read_firestore_rules` | Lee firestore.rules |
| `check_orientation_values` | Verifica orientación lowercase |
| `list_project_info` | Estadísticas del proyecto |

### Cloud Functions (`functions/index.js`)

- **Runtime:** Node.js 20
- **SDK:** Firebase Functions v2 (Gen 2)
- **Región:** `us-central1`
- **33 funciones callable** + triggers (ver sección "Cloud Functions" arriba)

### Patrones de Código Angular

```typescript
// Standalone component
@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './privacy.component.html',
  styleUrl: './privacy.component.css'
})
export class PrivacyComponent {
  t = inject(TranslationService);
}
```

### Regla CRÍTICA para estilos web

**NUNCA usar colores hardcodeados en CSS de componentes.** Siempre usar las CSS variables definidas en `src/styles.css`. Los colores están alineados con la paleta iOS de `ColorTheme.swift` y `AppColor.swift`.
