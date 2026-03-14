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
| `ui/login/PhoneAuth/PhoneAuthView.swift` | UI phone auth con country picker + OTP |
| `ui/onboarding/OnboardingBirthdayView.swift` | Birthday input con validación edad dinámica |
| `ui/onboarding/OnboardingCoordinator.swift` | Coordinator onboarding — validateCurrentStep() |
| `services/AnalyticsService.swift` | Todos los eventos Analytics |
| `services/RemoteConfigService.swift` | Remote Config |
| `ui/home/SwipeView.swift` | Tarjeta de perfil en swipe stack (~918 líneas) — StoryRingButton premium, info button |
| `ui/story/AutoPlayStoryView.swift` | Auto-reproducción de stories con avatar+nombre en header |
| `domain/story/StoryRepository.swift` | Stories CRUD — timestamp parsing inline (ISO 8601 via `ISO8601DateFormatter`) |

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
| `feature/home/ui/components/ProfileCardView.kt` | Profile card en swipe stack (~678 líneas) — StoryRingButton premium, info button, ProfileDetailsSheet |
| `ui/story/AutoPlayStoryDialog.kt` | Diálogo autoplay de historias con timer 10s, avatar+nombre en header (~366 líneas) |
| `core/firebase/StoryRepository.kt` | Stories CRUD + `parseTimestampField()` (3 formatos: ISO 8601, Timestamp, HashMap) |
| `auth/create/Phone/viewmodel/PhoneAuthViewModel.kt` | Auth por teléfono (~606 líneas) — cooldown 30s, 6 tipos error |
| `auth/create/screen/Phone/util/PhoneAuthState.kt` | Data class estado Phone Auth |
| `feature/onboarding/steps/BirthdayStepScreen.kt` | Birthday input con hint card dorado |
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
interests: [String]
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
blocked: [String]            ← IDs bloqueados por este usuario
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
| `stories/personal_stories/{userId}/{storyId}.jpg` | Stories/historias (expiran a las 24h, cleanup por `cleanupExpiredStories` CF) |
| `temp_uploads/{userId}/{filename}` | Uploads temporales (moderación IA) |
| `temp_validations/{fileName}` | Validaciones temporales IA |
| `temp_moderation/{fileName}` | Moderación temporal IA |

---

## Cloud Functions — 35 callable + 7 scheduled + 6 triggers + 1 alias (us-central1)

### Funciones principales (todas homologadas iOS = Android)

> ⚠️ NOTA: swipeUser, superLikeUser y sendPlaceMessage NO son CFs callable — ambas
> plataformas hacen esas operaciones directamente en Firestore.
> Los swipes/super likes se escriben en subcolecciones y el array `liked`/`passed` del usuario.

### Funciones Scheduled (Cloud Scheduler)

| CF | Schedule | Propósito |
|---|---|---|
| `resetDailyLikes` | `every 1 hours` | Reset de likes diarios a 100 (timezone-aware) |
| `resetSuperLikes` | `every 1 hours` | Reset de super likes a 5 (timezone-aware) |
| `cleanupExpiredStories` | `every 1 hours` | Elimina stories expiradas (>24h) de Firestore + Storage |
| `checkMutualLikesAndCreateMatch` | scheduled | Detección de matches mutuos |
| `processScheduledDeletions` | scheduled | Procesar eliminaciones programadas |
| `updategeohashesscheduled` | scheduled | Actualizar geohashes |
| `monitorGeohashHealth` | scheduled | Monitoreo de salud de geohashes |

**Alias:** `scheduledCheckMutualLikes` → alias de `checkMutualLikesAndCreateMatch`

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

### Callable Functions (35 de producción + 6 utilidades)

**Producción (homologadas iOS = Android):**
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
generateInterestSuggestions
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

**Utilidades admin/test (no llamadas por clientes en producción):**
```
sendTestNotification
sendTestNotificationToUser
testDailyLikesResetNotification
testSuperLikesResetNotification
updateFCMToken
generateMissingThumbnails
```

### Triggers (6)

| Trigger | Evento | Propósito |
|---|---|---|
| `onMatchCreated` | DocumentCreated en `matches/` | Envía push de nuevo match |
| `onMessageCreated` | DocumentCreated en `messages/` | Procesa nuevo mensaje |
| `generateProfileThumbnail` | ObjectFinalized en Storage | Genera thumbnail automático |
| `handlePendingNotification` | DocumentCreated en `pendingNotifications/` | Envía push notification |
| `autoModerateMessage` | DocumentCreated en `messages/` | Moderación automática de mensajes |
| `validateGeohashOnUpdate` | DocumentUpdated en `users/` | Valida geohash al actualizar ubicación |

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
| `moderateMessage` | `{message, language?, type?, matchId?}` | `{approved, reason, category, confidence}` |
| `validateProfileImage` | `{imageUrl, expectedIsMale, expectedAge}` | `{isValid, detectedGender, detectedAge, confidence, issues, hasFace}` |
| `moderateProfileImage` | `{imageBase64, expectedGender?, userLanguage?, isStory?}` | `{approved, reason, confidence, categories, category}` |
| `analyzePhotoBeforeUpload` | `{photoBase64, userLanguage}` | `{success, score, overallQuality, shouldReplace, strengths, improvements}` |
| `generateInterestSuggestions` | `{bio?, userType?}` | `{success, suggestions: [string]}` ← Android only |
| `getMatchesWithMetadata` | `{}` (sin parámetros — usa auth) | `{matches: [{id, userId, name, age, ...}]}` ← Android only |

---

## Remote Config — 16 claves

### Claves leídas por RemoteConfigManager (12 — verificadas en código iOS y Android)

| Clave | Tipo | Default | Descripción |
|---|---|---|---|
| `compatibility_weights` | JSON String | `CompatibilityWeights.default` | Pesos para score de compatibilidad |
| `matching_scoring_weights` | JSON String | `MatchingScoringWeights.default` | Pesos para MatchingScoreCalculator |
| `daily_likes_limit` | Number | 100 | Límite de likes diarios (SIEMPRE 100, nunca random) |
| `daily_super_likes_limit` | Number | 5 | Límite de super likes diarios |
| `max_search_radius_km` | Number | 200.0 | Radio máximo de búsqueda en km |
| `ai_moderation_confidence_threshold` | Number | 0.80 | Umbral de confianza moderación IA |
| `profile_reappear_cooldown_days` | Number | 14 | Días antes de reaparecer un perfil descartado |
| `bulk_query_batch_size` | Number | 30 | Tamaño de batch para queries múltiples (límite Firestore whereIn) |
| `minimum_age_by_country` | JSON String | `{"default": 18}` | Edad mínima por país |
| `enable_bio_ai_suggestions` | Boolean | false | Habilitar sugerencias de bio con IA |
| `moderation_image_max_dimension` | Number | 512 | Dimensión máx (px) para compresión de imagen en moderación IA (rango 256–1024) |
| `gemini_tokens` | Number | 1024 | Max tokens para respuestas Gemini |
| `moderation_image_jpeg_quality` | Number | 50 | Calidad JPEG (%) para compresión de imagen en moderación IA (rango 20–100). iOS convierte a 0.0–1.0 |
| `enable_screen_protection` | Boolean | true | Habilitar/deshabilitar protección contra capturas de pantalla y grabación de pantalla |

### Claves leídas directamente por UI (no via RemoteConfigManager)

| Clave | Tipo | Default | Descripción |
|---|---|---|---|
| `terms_url` | String | `"https://www.blacksugar21.com/terms"` | URL de términos de uso (leída en LoginView) |
| `privacy_url` | String | `"https://www.blacksugar21.com/privacy"` | URL de política de privacidad (leída en LoginView) |

### Claves de referencia (solo en Firebase Console, no leídas por apps)

| Clave | Tipo | Default | Descripción |
|---|---|---|---|
| `reviewer_test_phone` | String | `"+16505550123"` | Documentación del teléfono de prueba del reviewer |
| `reviewer_test_code` | String | `"123456"` | Documentación del código OTP del reviewer |

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
14. **Ephemeral photo:** estructura `{message:"", senderId, timestamp, type:"ephemeral_photo", photoUrl, isEphemeral:true, expiresAt, viewedBy:[], isUploading:false}` — idéntica iOS/Android. **Compresión optimizada:** maxDimension=800px, JPEG quality=65% (iOS: `ephemeralMaxDimension=800`, `imageCompressionQuality=0.65`; Android: `ephemeralMaxDimension=800`, `imageCompressionQuality=65`). Fotos efímeras se ven solo 10s — no necesitan alta resolución
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
25. **Photo upload:** `users/{userId}/{uuid}.jpg` + thumbnail `users/{userId}/{uuid}_thumb.jpg` (400px). Max dimension 1920px, target 500KB. **Ephemeral photos:** max 800px, JPEG 65% (optimizado — se ven solo 10s). **⚠️ Storage Rules requieren `contentType.matches('image/.*')`:** iOS DEBE pasar `StorageMetadata()` con `contentType = "image/jpeg"` en todo `putData()` — con `metadata: nil` el SDK iOS NO infiere content type → permission denied. Android SDK infiere `image/jpeg` de la extensión `.jpg` automáticamente en `putBytes()` — no requiere metadata explícita
26. **Scheduled deletion:** Android escribe 4 campos (`scheduledDeletionDate`, `scheduledForDeletion`, `deletionDate`, `deletionScheduledAt`), iOS escribe 3 (sin `scheduledDeletionDate`). Aceptable — ninguna CF depende de `scheduledDeletionDate`
27. **AI CFs:** 16 CFs de IA. Todas usan `us-central1`. 15 idénticas en ambas plataformas + `generateInterestSuggestions` (Android only). Payloads verificados: `generateSmartReply`, `calculateSafetyScore`, `analyzeConversationChemistry`, `predictOptimalMessageTime`, `getDatingAdvice`, `analyzePhotoBeforeUpload`, `moderateProfileImage`, `validateProfileImage`, `moderateMessage`, `generateInterestSuggestions`. **⚠️ TODA la IA se ejecuta server-side en CFs** — modelo `gemini-2.5-flash`, secret `GEMINI_API_KEY`. Los clientes iOS y Android ya NO ejecutan Gemini localmente ni dependen del SDK `FirebaseAI`/`firebase-ai`. `ContentModerationService` en ambas plataformas es un wrapper delgado que envía base64/texto al CF y parsea la respuesta. Imagen: comprime según Remote Config (`moderation_image_max_dimension` default 512px, `moderation_image_jpeg_quality` default 50%), envía base64. Texto: envía string + type (`"message"` | `"biography"`). `generateInterestSuggestions`: envía `{bio, userType}`, recibe `{suggestions: [string]}` (solo Android, `EditProfileViewModel.kt`). Error handling: fotos de perfil → aprobar en error, stories → rechazar en error, texto → aprobar en error
28. **searchPlaces CF + Place Photos:** `{matchId, query, userLanguage}` — idéntico iOS/Android (Android también tiene PlacesSDK para edit-profile, pero chat usa CF). La CF retorna hasta 20 campos por lugar incluyendo `photos: [{url, width, height}]` y `description`. **⚠️ `parsePlaceSuggestions()` en Android (`ChatViewModel.kt`) y `parsePlaceSuggestions()` en iOS (`ChatViewModel.swift`) DEBEN parsear `photos` y `description`** — si se omiten, el carrusel de fotos en `PlaceSuggestionsSheet`/`PlaceSuggestionsView` no muestra imágenes. iOS: `PlacePhotoCarousel` con `TabView` + `AsyncImage`. Android: `PlacePhotoCarousel` con `HorizontalPager` + `AsyncImage`
29. **reportUser — Moderación Progresiva:** `reportUser` incluye bloqueo personal (solo el reporter deja de ver al reported) + escalamiento progresivo basado en reportadores ÚNICOS (no raw count). Umbrales: 1-2 → solo bloqueo personal, 3-4 → `visibilityReduced:true`, 5-6 → visibilidad reducida + análisis IA (Gemini 2.0 Flash, auto-suspende si confianza ≥ 0.8), 7-9 → `accountStatus:'suspended'`, 10+ → `accountStatus:'banned'`. Rate limit: máx 5 reportes/día por reporter. Genera `reportSummary` en user doc con `uniqueReporters`, `totalReports`, `reasonCounts`. Elimina match + mensajes + likes mutuos entre reporter y reported. Bloqueo bidireccional: `blocked`/`blockedBy` arrays — idéntico iOS/Android
30. **blocked/blockedBy bidireccional:** `blockUser` y `reportUser` CFs escriben `blocked` (array del que bloquea) + `blockedBy` (array del bloqueado). Discovery filtra ambos arrays. `unblockUser` es local con `arrayRemove` — idéntico iOS/Android
31. **ProfileDetailsSheet** — Android usa `ModalBottomSheet(skipPartiallyExpanded = true)`. NO usar `fillMaxHeight(0.95f)`, `contentWindowInsets`, `fillMaxHeight()` hacks. Botón de cierre requiere `.zIndex(10f)` para ser clickable
32. **Story lifecycle (24h):** `createStory` CF escribe `expiresAt = now + 24h`. Queries (`getBatchStoryStatus`, `getBatchPersonalStories`) filtran `expiresAt > now`. `cleanupExpiredStories` (scheduled `every 1 hours`) elimina stories expiradas de Firestore + imágenes de Storage (`stories/personal_stories/{userId}/{storyId}.jpg`). Proceso: query `expiresAt <= now`, batch delete docs + Storage files, en batches de 500. **⚠️ CRÍTICO: `getBatchStoryStatus` DEBE incluir `.where('isPersonal', '==', true)` en su query** — sin este filtro la query falla silenciosamente porque no existe un índice compuesto `(senderId, expiresAt)` solo, todos los índices existentes incluyen `isPersonal`. La CF retorna `{allFalse}` como respuesta válida, el cliente no activa fallback, y el carrusel de stories no aparece
33. **storyModels en profile models:** `ProfileCardModel` (iOS) y `Profile` (Android) llevan `storyModels: [StoryModel]` con timestamps reales de Firestore. Esto permite que el visor de stories desde swipe card muestre tiempo relativo correcto ("17h", "2h") en vez de "now". `ProfileCardRepository` (iOS) y `ProfileRepositoryImp` (Android) propagan los `StoryModel` completos al construir los profile models. **⚠️ NUNCA crear `StoryModel` dummy con `Date()`/`Timestamp.now()` para stories en swipe card — siempre usar los modelos reales del repository**

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
11. **Ephemeral photos** — campos del mensaje + viewedBy + photoUrl + 3-step upload flow. Compresión: 800px max, JPEG 65%
12. **Pause/Reactivate** — campos paused, visible, pausedAt
13. **Firestore Security Rules** — verificar que todas las colecciones usadas tengan reglas
14. **Block/Unblock** — blockUser via CF, unblockUser local con arrayRemove. Bloqueo bidireccional: `blocked`/`blockedBy`
15. **reportUser — Moderación Progresiva** — personal block + escalamiento por unique reporters + IA
16. **Swipe regular/pass** — batch atómico + swipe/liked subcollecciones
17. **Daily/Super likes reset** — calendar day comparison, always 100
18. **Match detection** — hasUserLikedBack() + 100ms delay
19. **Photo upload/delete** — UUID.jpg + _thumb.jpg (400px), Storage path `users/{userId}/`
20. **AI CFs (16)** — 15 idénticas + `generateInterestSuggestions` (Android only). TODA la IA es server-side (`gemini-2.5-flash`, `GEMINI_API_KEY`). Clientes NO usan SDK `FirebaseAI`/`firebase-ai`
21. **Photo/Message moderation** — 4 CFs (moderateMessage, moderateProfileImage, validateProfileImage, analyzePhotoBeforeUpload). `moderateProfileImage` y `moderateMessage` implementan Gemini AI server-side (`gemini-2.5-flash`). `ContentModerationService` en iOS/Android son wrappers delgados de CF (no ejecutan Gemini localmente). Compresión de imagen configurable via Remote Config: `moderation_image_max_dimension` (512px default), `moderation_image_jpeg_quality` (50% default)
22. **Scheduled deletion** — scheduleAccountDeletion/cancelScheduledDeletion campos
23. **Push notifications** — pendingNotifications para mensajes, CF trigger para matches
24. **Compatibility scoring** — getBatchCompatibilityScores + getEnhancedCompatibilityScore
25. **searchPlaces + PlaceSuggestions** — CF `searchPlaces` con `{matchId, query, userLanguage}` retorna `{places: [{name, address, rating, latitude, longitude, placeId, googleMapsUrl, website, phoneNumber, isOpenNow, instagram, instagramHandle, tiktok, category, description, photos: [{url, width, height}], distanceUser1, distanceUser2, travelTimeUser1, travelTimeUser2, score}]}`. Ambas plataformas deben parsear TODOS los campos incluyendo `photos` y `description`
26. **Story lifecycle** — `createStory` escribe `expiresAt = now + 24h`, queries filtran `expiresAt > now`, `cleanupExpiredStories` (hourly) elimina expiradas de Firestore + Storage. storyModels con timestamps reales propagados a profile models para tiempo relativo correcto en swipe cards
27. **Match list listener** — ambas plataformas usan Firestore snapshot listener real-time (no CF one-shot). Lightweight stream: no descargar fotos/stories dentro del stream. Auto-start, auto-retry 3s. iOS: `ensureListenerActive()` en onAppear como safety net. **⚠️ NUNCA stopListeningToMatches en onDisappear de MainTabView (iOS)**
28. **activeChat stale cleanup** — iOS/Android limpian activeChat al iniciar app. CF `onMessageCreated` detecta stale >5min y limpia antes de enviar push
29. **FCM channel alignment** — CF `handlePendingNotification` envía `android.channelId` que DEBE coincidir con los `NotificationChannel` registrados en la app Android
30. **Phone Auth** — cooldown 30s (ambas), timeout iOS 30s (`verificationTimeoutTask`) vs Android SDK `onCodeAutoRetrievalTimeOut` 60s. iOS: `@MainActor`, `canSendCode` computed, `Timer.scheduledTimer`. Android: requiere `Activity`, guarda `ForceResendingToken`, 6 tipos de error inline. Strings localizadas en 10 idiomas (iOS kebab-case: `resend-code`, Android snake_case: `resend_code`)
31. **Birthday validation** — edad mínima dinámica por país via Remote Config `minimum_age_by_country`. iOS usa `OnboardingCoordinator.validateCurrentStep()` centralizado (sin hint card). Android usa `showBirthdateHint` hint card dorado + `showUnderageDialog`. Strings: `underage-alert-title`/`underage_alert_title` y `enter-birthdate-required`/`enter_birthdate_required` en 10 idiomas
32. **StoryRingButton** — botón premium animado en swipe cards. Android: componente inline en `ProfileCardView.kt` (Canvas, sweepGradient, Path). iOS: `StoryRingButton` struct + `PlayTriangle: Shape` en `SwipeView.swift` (AngularGradient). Ambos: anillo rotatorio 360°/3s, glow breathing 0.3→0.7/1.8s, pulse 1.0→1.08/1.8s, play triangle dorado, badge de story count
33. **AutoPlayStory avatar** — Android recibe `userPhotoUrl: String?` (URL completa de Firebase Storage), iOS recibe `userPhoto: UIImage?` (pre-cargado). Ambos muestran círculo gris 40dp/pt si null. **⚠️ Android:** NUNCA pasar `profile.pictureNames` (son filenames), siempre extraer URL de `ProfilePictureState` (Remote > Thumb)
34. **StoryRepository parseTimestampField** — Android tiene `parseTimestampField()` dedicada que maneja 3 formatos: (1) ISO 8601 String, (2) Timestamp nativo, (3) HashMap `{_seconds, _nanoseconds}` legacy. iOS parsea timestamps inline usando `ISO8601DateFormatter` (sin función dedicada). Ambas plataformas manejan los mismos datos pero con implementación diferente
35. **ProfileDetailsSheet** — Android usa `ModalBottomSheet(skipPartiallyExpanded = true)`. NO usar `fillMaxHeight(0.95f)`, `contentWindowInsets`, `fillMaxHeight()` hacks. Botón de cierre requiere `.zIndex(10f)` para ser clickable
36. **Story lifecycle (24h)** — `createStory` escribe `expiresAt = now + 24h`. `cleanupExpiredStories` CF (hourly) elimina expiradas. Profile models (`ProfileCardModel`/`Profile`) propagan `storyModels: [StoryModel]` con timestamps reales. **⚠️ NUNCA crear StoryModel dummy con Date()/Timestamp.now() para swipe cards**
37. **storyModels en swipe cards** — `ProfileCardRepository` (iOS) y `ProfileRepositoryImp` (Android) pasan `storyModels` al construir profile models. SwipeView/ProfileCardView usa `model.storyModels` si disponible, con fallback a dummy solo como safety net
38. **Match list listener resilience** — ambas plataformas usan Firestore snapshot listener real-time (NO CF one-shot). iOS: `AsyncThrowingStream` pipeline (`FirestoreRemoteDataSource` → `MatchRepository` → `MatchListViewModel`). Android: `Flow<Result<List<Match>>>` pipeline (`MatchFirebaseDataSource` → `MatchRepository` → `GetMatchesUseCase` → `MatchListViewModel`). Auto-start en `init`, auto-retry 3s tras error. Patrón lightweight: NO descargar fotos/stories dentro del stream — `loadMissingPictures()` async post-emisión. iOS usa `ensureListenerActive()` en `MatchListView.onAppear` como safety net (SwiftfulRouting puede matar el listener). Android no necesita safety net (ViewModel vive en Hilt scope). **⚠️ NUNCA llamar `stopListeningToMatches()` en `.onDisappear` de MainTabView (iOS)** — SwiftfulRouting `.push` triggerea `onDisappear` en el padre
39. **activeChat stale cleanup** — 3 capas de protección: (1) iOS `black_sugar_21App.swift` limpia `activeChat` al detectar usuario autenticado al inicio (via `FirestoreRemoteDataSource.shared.clearActiveChat()`), (2) Android `MainActivity.onCreate()` llama `clearActiveChat()`, (3) CF `onMessageCreated` detecta activeChat stale (>5 min sin `activeChatTimestamp` actualizado) y lo limpia antes de decidir enviar push. Esto evita que un usuario no reciba notificaciones por un `activeChat` huérfano
40. **FCM notification delivery** — Android: `handlePendingNotification` CF envía `android.priority: "high"` + `android.notification.channelId` = `"Messages"` | `"Matches"` | `"Likes"` | `"General"`. Los channel IDs del CF DEBEN coincidir con los `NotificationChannel` registrados en `MyFirebaseMessagingService.kt`. Si no coinciden, Android puede no mostrar la notificación. iOS: solo usa APNs headers (`apns-priority: "10"`, `apns-push-type: "alert"`)
41. **Caché optimista de lectura** — `MatchListViewModel` en ambas plataformas mantiene `recentlyReadMatches` con TTL 30s. Evita flash de "unread" cuando Firestore emite snapshot antes de que `lastSeenTimestamps` se actualice en el servidor. Keyed por `lastMessageSeq` (iOS) / `lastMessage` (Android) — idéntico comportamiento
42. **Story Carousel en Match List** — ambas plataformas muestran un carrusel horizontal estilo Instagram en la parte superior de la lista de matches. Solo muestra matches con `hasActiveStories == true`. Flujo: `MatchListViewModel` llama CF `getBatchStoryStatus` dentro de `startObservingMatches()`/`observeMatches()` para poblar `storyStatusCache: [String: Bool]`. El listener de stories solo **upgradea** estado (`false→true`, nunca `true→false`) para evitar flickering — las degradaciones las maneja `refreshStoriesIfNeeded()`. iOS: `StoryCarouselView` con `ScrollView(.horizontal)`. Android: `StoryCarousel` composable con `LazyRow`
43. **`refreshStoriesIfNeeded()` — throttled story refresh** — ambas plataformas implementan `refreshStoriesIfNeeded()` con throttle de 3 segundos. Se llama cada vez que el usuario vuelve a la lista de matches (iOS: `ensureListenerActive()` → `refreshStoriesIfNeeded()`, Android: `ON_RESUME` lifecycle → `refreshStoriesIfNeeded()`). Consulta CF `getBatchStoryStatus` con los userIds de los matches actuales y actualiza `storyStatusCache`, permitiendo que stories expiradas desaparezcan del carrusel sin reiniciar el listener completo. **⚠️ El throttle de 3s evita llamadas excesivas a la CF al navegar frecuentemente entre tabs**
44. **⚠️ `isPersonal` filter en queries de stories** — TODAS las queries Firestore a la colección `stories` que usen índices compuestos DEBEN incluir `isPersonal == true`. Los índices existentes son: `(isPersonal ASC, senderId ASC, expiresAt ASC)`, `(isPersonal ASC, expiresAt ASC)`. Sin `isPersonal`, la query falla silenciosamente (Firestore requiere índice compuesto exacto). Esto aplica a: CF `getBatchStoryStatus`, CF `getBatchPersonalStories`, `fallbackGetActiveStories()` (iOS/Android), `listenToPersonalStories()` (iOS/Android). Patrón de fallo silencioso: la CF catch-ea el error, retorna `{storiesStatus: {todosEnFalse}}`, y el cliente acepta la respuesta "válida" sin activar fallback local
45. **Story Carousel avatar layout** — El nombre del match debe ser hijo directo del contenedor vertical (`Column`/`VStack`), NUNCA hijo del contenedor del avatar (`Box`/`ZStack`). Estructura correcta: `Column/VStack { Box/ZStack(avatar+ring) → Spacer → Text(name) }`. Si el `Text` está dentro del `Box`/`ZStack`, se renderiza centrado sobre el avatar en vez de debajo. iOS usa `VStack(spacing: 6) { ZStack {...} Text(name) }`. Android usa `Column { Box(totalSize) {...} Spacer(6.dp) Text(name) }` — homologado
47. **Ephemeral photo compression** — ambas plataformas comprimen fotos efímeras a maxDimension=800px y JPEG quality=65% (reducción ~60-70% vs perfil). Android: constantes `ephemeralMaxDimension=800`, `imageCompressionQuality=65` en `ChatViewModel.kt`, ambos upload methods (`uploadEphemeralPhotoWithProgress` + `uploadEphemeralPhoto`) aplican resize. iOS: `ephemeralMaxDimension=800`, `imageCompressionQuality=0.65` en `ChatViewModel.swift`, usa `resizeForUpload(maxDimension:)` de `UIImage+Resize.swift`. Fotos de perfil mantienen 1920px/500KB target — NO afectadas por este cambio
48. **Match cache sync** — Android `MatchDao.replaceAllMatches()` hace `DELETE NOT IN` + `INSERT(REPLACE)` para eliminar entries huérfanas del Room cache. iOS `CoreDataManager.saveMatches()` hace delete-all + insert-all. **⚠️ NUNCA usar solo `insertMatches(REPLACE)` en Android** — no elimina matches que ya no existen en Firestore, causando duplicados en la UI
49. **Screen protection (granular)** — `enable_screen_protection` (Boolean, default `true`) controla protección contra capturas/grabación via Remote Config. **Protección SOLO en vistas sensibles** (no global): Home (swipe cards), MatchList, Chat, Stories (overlay sobre vistas protegidas), fotos efímeras (dentro de Chat). **SIN protección:** Likes, Profile, EditProfile, Settings, WebView, ThemeSelection, LocationPicker. **Android:** `Constants.ENABLE_SCREEN_PROTECTION` lee dinámicamente de `FirebaseRemoteConfig`. `NavigationGraph` usa **lista de rutas protegidas** (`Routes.Home`, `Routes.MatchList`, `Routes.Chat`) via `LaunchedEffect`. `ChatActivity` mantiene su propio `FLAG_SECURE` en `onCreate()`. Activities de EditProfile, Delete, Settings, WebView, Theme, LocationPicker ya NO tienen `FLAG_SECURE`. **iOS:** `.secureScreen()` aplicado en `MainTabView` (NO en `RouterView`) condicional por tab: `selectedTab == 0 || selectedTab == 1`. Tab 0=Home, Tab 1=MatchList/Chat. Push desde Tab 1 a ChatView mantiene selectedTab=1 → protegido. Tabs 2 (Likes) y 3 (Profile) sin protección. `SecureScreenModifier` (DRM-level: `UITextField.isSecureTextEntry` + CALayer). **⚠️ iOS `Constants.swift` ya NO contiene `ENABLE_SCREEN_PROTECTION`** — toda la lógica pasa por `RemoteConfigService`
50. **Discovery filtering (`getCompatibleProfileIds`)** — CF server-side aplica 2 filtros en ambos paths (geo query + fallback). **Filtro userType:** Daddy no ve Daddy, Mommy no ve Mommy, Baby ve todos (3 tipos). **Filtro gender+orientation:** `men`/`women` filtra por género del candidato + cross-check bidireccional (candidato debe "querer" el género del usuario). `both` solo ve otros `both` (cualquier género). Tabla verificada: (1) Mujer+Hombres+Mommy→Baby(H)+Daddy(H), (2) Hombre+Mujeres+Daddy→Baby(M)+Mommy(M), (3) Hombre+Mujeres+Baby→Baby(M)+Daddy(M)+Mommy(M), (4) Mujer+Hombres+Baby→Baby(H)+Daddy(H)+Mommy(H), (5) Mujer+Mujeres+Mommy→Baby(M)+Daddy(M), (6) Hombre+Hombres+Daddy→Baby(H)+Mommy(H), (7) Hombre+Hombres+Baby→Baby(H)+Daddy(H)+Mommy(H), (8) Mujer+Mujeres+Baby→Baby(M)+Daddy(M)+Mommy(M), (9) Hombre+Ambos+Cualquiera→Solo `both` sin mismo tipo, (10) Mujer+Ambos+Cualquiera→Solo `both` sin mismo tipo. H=Hombre(male=true), M=Mujer(male=false). Candidatos deben tener orientación compatible (cross-check). **⚠️ Asimetría `both`:** usuario `men`/`women` puede ver candidatos `both`, pero usuario `both` NO ve candidatos `men`/`women`**
51. **Place Suggestions — Photo Carousel parity** — CF `searchPlaces` retorna `photos: [{url, width, height}]` y `description` por lugar. iOS: `PlaceSuggestionsView.swift` con `PlacePhotoCarousel` (`TabView` + `AsyncImage` + dot indicators). Android: `PlaceSuggestionsSheet.kt` con `PlacePhotoCarousel` (`HorizontalPager` + `AsyncImage` + dot indicators). **⚠️ `parsePlaceSuggestions()` en ambos `ChatViewModel` DEBE parsear `photos` y `description`** — sin estos campos el carrusel de fotos existe en la UI pero recibe `photos = null` y no muestra imágenes. Campos obligatorios del CF response: `name`, `address`, `rating`, `latitude`/`lat`, `longitude`/`lng`, `placeId`, `score`, `website`, `phoneNumber`, `googleMapsUrl`, `isOpenNow`, `tiktok`, `instagram`, `instagramHandle`, `category`, `description`, `photos`, `distanceUser1`, `distanceUser2`, `travelTimeUser1`, `travelTimeUser2`

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
- **AI Model:** `gemini-2.5-flash` (secret `GEMINI_API_KEY`)
- **Total:** 35 callable + 7 scheduled + 6 triggers + 1 alias (ver sección "Cloud Functions" arriba)

**Dependencias functions (`functions/package.json`):**

| Paquete | Versión |
|---|---|
| `firebase-admin` | `^12.0.0` |
| `firebase-functions` | `^5.1.1` |
| `@google/generative-ai` | `^0.24.1` |
| `sharp` | `^0.33.5` |
| `geofire-common` | `^6.0.0` (root only) |

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
