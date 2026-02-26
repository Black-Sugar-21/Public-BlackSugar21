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
blocked: [String]            ← IDs bloqueados
accountStatus: String
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

## Cloud Functions — 33 funciones callable (us-central1)

### Funciones principales (todas homologadas iOS = Android)

> ⚠️ NOTA: swipeUser, superLikeUser y sendPlaceMessage NO son CFs callable — ambas
> plataformas hacen esas operaciones directamente en Firestore.
> Los swipes/super likes se escriben en subcolecciones y el array `liked`/`passed` del usuario.

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
| `reportUser` | `{reportedUserId, reason, matchId}` | — |
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

## Remote Config — 10 claves (VERIFICADAS EN CÓDIGO)

| Clave | Tipo | Default | Descripción |
|---|---|---|---|
| `compatibility_weights` | JSON String | `CompatibilityWeights.default` | Pesos para score de compatibilidad |
| `matching_scoring_weights` | JSON String | `MatchingScoringWeights.default` | Pesos para MatchingScoreCalculator |
| `daily_likes_limit` | Number | 100 | Límite de likes diarios |
| `daily_super_likes_limit` | Number | 5 | Límite de super likes diarios |
| `max_search_radius_km` | Number | 200.0 | Radio máximo de búsqueda en km |
| `ai_moderation_confidence_threshold` | Number | 0.80 | Umbral de confianza moderación IA |
| `profile_reappear_cooldown_days` | Number | 14 | Días antes de reaparecer un perfil descartado |
| `bulk_query_batch_size` | Number | 50 | Tamaño de batch para queries múltiples |
| `minimum_age_by_country` | JSON String | `{"default": 18}` | Edad mínima por país |
| `enable_bio_ai_suggestions` | Boolean | false | Habilitar sugerencias de bio con IA |

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
8. **timezoneOffset:** se escribe en `createUser`, `updateDeviceSettings` Y `updateUserLocation` (iOS: `ProfileRepository.swift` fix aplicado)
9. **visible:** solo se escribe al pausar/despausar (no en createUser)
10. **pendingNotifications:** siempre incluye `createdAt: serverTimestamp()`
11. **Crashlytics setUserId:** Android debe llamar `FirebaseCrashlytics.getInstance().setUserId(userId)` al login (homologado con iOS `Crashlytics.crashlytics().setUserID(userId)`)
12. **Storage paths:** rutas correctas: `users/{userId}/{filename}` (fotos perfil), `ephemeral_photos/{matchId}/{photoId}.jpg`, `stories/personal_stories/{userId}/{storyId}.jpg`. NUNCA `profile_images/` — fix aplicado en `MatchFirebaseDataSourceImpl.kt`
13. **Super Like batch:** ambas plataformas usan batch atómico: `{superLikesRemaining: increment(-1), superLikesUsedToday: increment(1), superLiked: arrayUnion()}` + swipe subcolección `{timestamp, isLike:true, isSuperLike:true}` + liked subcolección `{exists:true, superLike:true}` + post-batch `superLiked/{userId}` con `{timestamp}`
14. **Ephemeral photo:** estructura `{message:"", senderId, timestamp, type:"ephemeral_photo", photoUrl, isEphemeral:true, expiresAt, viewedBy:[], isUploading:false}` — idéntica iOS/Android
15. **activeChat lifecycle:** `setActiveChat` → `{activeChat: matchId, activeChatTimestamp: serverTimestamp()}`, `clearActiveChat` → ambos campos con `FieldValue.delete()` — idéntico iOS/Android
16. **pauseAccount:** escribe `{paused:true, visible:false, pausedAt:serverTimestamp()}` — reactivate escribe `{paused:false, visible:true}`
17. **blockUser:** ambas plataformas llaman CF `blockUser({blockedUserId})`. `unblockUser` es local: `FieldValue.arrayRemove(blockedUserId)` del array `blocked`
18. **fcmBuildType:** solo Android escribe `fcmBuildType` ("debug"|"release") junto al `fcmToken`. iOS solo escribe `fcmToken`. No afecta funcionalidad (no se usa en CFs)
19. **apnsToken:** solo iOS escribe `apnsToken` en dispositivos reales. No tiene equivalente Android. No afecta funcionalidad
20. **Swipe regular:** batch atómico `{liked/passed: arrayUnion, dailyLikesRemaining: increment(-1)}` + swipe subcolección `{timestamp, isLike, isSuperLike:false}` + liked subcolección `{exists:true, superLike:false}` — idéntico iOS/Android
21. **Daily likes reset:** comparación por día calendario (midnight), NO ventana de 24h. Random `50..100`. Escribe `{dailyLikesRemaining, dailyLikesLimit, lastLikeResetDate}` — idéntico iOS/Android
22. **Super likes reset:** comparación por día calendario. Escribe `{superLikesRemaining:5, superLikesUsedToday:0, lastSuperLikeResetDate}` — idéntico iOS/Android
23. **Match detection:** `hasUserLikedBack()` lee `otherUser.liked` y verifica si contiene `currentUserId`. 100ms delay antes de verificar — idéntico iOS/Android
24. **Match notification:** enviada por CF trigger `onMatchCreated` (NO por cliente). `sendMatchNotification` en Android es código muerto
25. **Photo upload:** `users/{userId}/{uuid}.jpg` + thumbnail `users/{userId}/{uuid}_thumb.jpg` (400px). Max dimension 1920px, target 500KB — idéntico iOS/Android
26. **Scheduled deletion:** Android escribe 4 campos (`scheduledDeletionDate`, `scheduledForDeletion`, `deletionDate`, `deletionScheduledAt`), iOS escribe 3 (sin `scheduledDeletionDate`). Aceptable — ninguna CF depende de `scheduledDeletionDate`
27. **AI CFs:** 15 CFs de IA idénticas en ambas plataformas. Todas usan `us-central1`. Payloads verificados: `generateSmartReply`, `calculateSafetyScore`, `analyzeConversationChemistry`, `predictOptimalMessageTime`, `getDatingAdvice`, `analyzePhotoBeforeUpload`, `moderateProfileImage`, `validateProfileImage`, `moderateMessage`
28. **searchPlaces CF:** `{matchId, query, userLanguage}` — idéntico iOS/Android (Android también tiene PlacesSDK para edit-profile, pero chat usa CF)

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
14. **Block/Unblock** — blockUser via CF, unblockUser local con arrayRemove
15. **Swipe regular/pass** — batch atómico + swipe/liked subcollecciones
16. **Daily/Super likes reset** — calendar day comparison, random(50..100)
17. **Match detection** — hasUserLikedBack() + 100ms delay
18. **Photo upload/delete** — UUID.jpg + _thumb.jpg (400px), Storage path `users/{userId}/`
19. **AI CFs (15)** — payloads y nombres idénticos
20. **Photo/Message moderation** — 4 CFs (moderateMessage, moderateProfileImage, validateProfileImage, analyzePhotoBeforeUpload)
21. **Scheduled deletion** — scheduleAccountDeletion/cancelScheduledDeletion campos
22. **Push notifications** — pendingNotifications para mensajes, CF trigger para matches
23. **Compatibility scoring** — getBatchCompatibilityScores + getEnhancedCompatibilityScore
24. **searchPlaces** — CF con {matchId, query, userLanguage}

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
| Daily/Super likes reset | ✅ | Calendar day comparison, random(50..100) |
| Match detection | ✅ | hasUserLikedBack() lee otherUser.liked |
| Unmatch/Report/Delete CFs | ✅ | Payloads idénticos |
| Stories CRUD (5 CFs) | ✅ | create/delete/markViewed/batchStatus/batchStories |
| Discovery queries | ✅ | CF primary + geohash fallback |
| lastSeenTimestamps | ✅ | Creación, update, read para unread |
| Crashlytics + App Check | ✅ | setUserId + providers correctos |
| Orientation enforcement | ✅ | Enum lowercase + decoder normaliza |
| Photo upload/delete | ✅ | users/{uuid}.jpg + _thumb.jpg 400px |
| Scheduled deletion | ✅ | Aceptable (Android +scheduledDeletionDate extra) |
| Push notifications | ✅ | pendingNotifications + CF trigger onMatchCreated |
| 15 AI CFs payloads | ✅ | Todos idénticos iOS = Android |
| Photo/Message moderation | ✅ | 4 CFs moderación idénticas |
| searchPlaces CF | ✅ | {matchId, query, userLanguage} idéntico |
| Ephemeral photo upload | ✅ | 3-step flow + Storage path idéntico |
| Compatibility scoring | ✅ | getBatchCompatibilityScores idéntico |

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
