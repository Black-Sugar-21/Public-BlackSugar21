````skill
---
name: blacksugar-android
description: App Android de BlackSugar21 (Kotlin/Jetpack Compose). Usar cuando se trabaje con el código Android, Firestore UserServiceImpl/MessageServiceImpl, Firebase Analytics, Remote Config, autenticación por teléfono, SwipeUploadWorker, swipes, stories, Cloud Functions desde Android, AppCheck PlayIntegrity, o auditoría iOS ↔ Android.
---

# BlackSugar21 — Android App Skill

## Información del Proyecto

**Package:** `com.black.sugar21`  
**Lenguaje:** Kotlin + Jetpack Compose  
**Firebase Project:** `black-sugar21`  
**App Check:** PlayIntegrity (Debug: DebugAppCheckProviderFactory)  
**Ruta raíz:** `/Users/daniel/AndroidStudioProjects/BlackSugar212/app/src/main/java/com/black/sugar21/`

---

## Archivos Clave (Android)

| Archivo | Propósito |
|---|---|
| `core/firebase/UserServiceImpl.kt` | **PRINCIPAL** — CRUD usuario, discovery, swipes, pausa |
| `core/firebase/MessageServiceImpl.kt` | Mensajes, chats, lastSeenTimestamps |
| `core/firebase/model/FirestoreUser.kt` | Data class + FirestoreUserProperties |
| `core/firebase/model/FirestoreMessage.kt` | `toData()` + `toPlaceData()` para mensajes |
| `core/firebase/model/FirestoreOrientation.kt` | Enum: `men`, `women`, `both` (lowercase) |
| `core/analytics/AnalyticsService.kt` | Todos los eventos Firebase Analytics |
| `core/chat/ActiveChatManager.kt` | `activeChat` + `activeChatTimestamp` en Firestore |
| `core/notification/PushNotificationService.kt` | Escribe en `pendingNotifications` |
| `feature/home/ui/HomeViewModel.kt` | Swipes + WorkManager retry |
| `core/worker/SwipeUploadWorker.kt` | Retry swipes fallados via WorkManager |
| `auth/create/Phone/viewmodel/PhoneAuthViewModel.kt` | Auth teléfono + analytics |
| `core/config/RemoteConfigManager.kt` | 10 claves Remote Config |

---

## Firestore — Operaciones Android

### `createUser()` — Campos escritos al registrar usuario

```kotlin
userData["name"]                    = name
userData["birthDate"]               = birthdate.toDate()
userData["bio"]                     = bio
userData["male"]                    = isMale
userData["orientation"]             = orientation.name       // enum lowercase: "men"|"women"|"both"
userData["pictures"]                = pictures
userData["minAge"]                  = minAge
userData["maxAge"]                  = maxAge
userData["maxDistance"]             = maxDistance
userData["liked"]                   = emptyList<String>()
userData["passed"]                  = emptyList<String>()
userData["superLikesRemaining"]     = 5
userData["superLikesUsedToday"]     = 0
userData["lastSuperLikeResetDate"]  = FieldValue.serverTimestamp()
userData["dailyLikesRemaining"]     = randomLimit            // 50–100
userData["dailyLikesLimit"]         = randomLimit
userData["lastLikeResetDate"]       = FieldValue.serverTimestamp()
userData["timezoneOffset"]          = offsetHours            // -6, +1, etc.
userData["timezone"]                = timezoneId             // "America/Mexico_City"
userData["deviceLanguage"]          = deviceLanguage         // "es", "en"
userData["paused"]                  = false
userData["accountStatus"]           = "active"
userData["g"]                       = GeoHashUtils.encode(lat, lon) // campo EXACTO "g"
```

### `FirestoreMessageProperties.toData()` — Mensaje de texto

```kotlin
mapOf(
  "message"     to text,
  "senderId"    to userId,
  "timestamp"   to FieldValue.serverTimestamp(),
  "type"        to "text",
  "isEphemeral" to false              // ✅ SIEMPRE escribir, incluso en text
)
```

### `FirestoreMessageProperties.toPlaceData()` — Mensaje de lugar

```kotlin
mapOf(
  "message"     to "📍 ${place.name}",
  "senderId"    to userId,
  "timestamp"   to FieldValue.serverTimestamp(),
  "type"        to "place",
  "placeData"   to mapOf(
    "name", "address", "rating", "latitude", "longitude", "placeId",
    "googleMapsUrl"?, "website"?, "phoneNumber"?, "isOpenNow"?,
    "instagram"?, "instagramHandle"?, "tiktok"?, "category"?,
    "photos"?: [{"url", "width", "height"}], "description"?
  ).filterValues { it != null },
  "isEphemeral" to false
)
```

### Pausa / Reanudar cuenta

```kotlin
// pauseAccount():
mapOf(
  FirestoreUserProperties.paused   to true,
  FirestoreUserProperties.visible  to false,
  FirestoreUserProperties.pausedAt to FieldValue.serverTimestamp()
)

// resumeAccount():
mapOf(
  FirestoreUserProperties.paused  to false,
  FirestoreUserProperties.visible to true
)
```

### `pendingNotifications` — PushNotificationService

```kotlin
hashMapOf(
  "token"        to recipientToken,
  "notification" to hashMapOf(
    "title_loc_key"  to "notification_new_message_title",
    "title_loc_args" to listOf(senderName),
    "body_loc_key"   to "notification_new_message_body"
  ),
  "data" to hashMapOf(
    "matchId"      to matchId,
    "senderId"     to senderUserId,
    "type"         to "chat_message",     // o "new_match"
    "senderName"   to senderName,
    "click_action" to "OPEN_CHAT"         // o "OPEN_MATCHES"
  ),
  "processed"  to false,
  "createdAt"  to FieldValue.serverTimestamp()
)
```

---

## Firebase Analytics — 23 eventos Android

### AnalyticsService.kt — Métodos disponibles

```kotlin
analyticsService.logProfileLike(targetUserId, profileAge, distance)
analyticsService.logProfilePass(targetUserId, profileAge, distance)
analyticsService.logSuperLike(targetUserId, profileAge, distance)
analyticsService.logMatchCreated(matchUserId, timeSinceFirstView)
analyticsService.logUnmatch(matchUserId)
analyticsService.logMessageSent(recipientUserId, messageLength, isFirstMessage)
analyticsService.logMessageReceived(senderUserId, messageLength)
analyticsService.logPhotoUpload(photoPosition, totalPhotos)
analyticsService.logPhotoDelete(photoPosition, totalPhotos)
analyticsService.logProfileEdit(fieldsChanged)
analyticsService.logFilterChange(minAge, maxAge, maxDistance, gender)
analyticsService.logBlock(blockedUserId)
analyticsService.logReport(reportedUserId, reason)
analyticsService.logSessionEnd(durationSeconds)
analyticsService.logStoryCreated(matchId)
analyticsService.logStoryViewed(storyId, authorId, viewDuration)
analyticsService.logStoryDeleted(storyId)
analyticsService.logPurchaseFailed(productId, error)
analyticsService.logPurchaseStart(productId, price)    // → BEGIN_CHECKOUT
analyticsService.logPhoneVerificationCodeSent(phoneNumber)
analyticsService.logPhoneVerificationError(error)
analyticsService.logPhoneVerificationFailed(reason)
analyticsService.logSwipeFailedPendingRetry(userId, action)  // "like"|"super_like"
```

---

## UserType — Elite/Prime (2 opciones UI, 3 valores backend)

```kotlin
// profile/model/UserType.kt
enum class UserType(val displayName: String) {
    SUGAR_DADDY("Elite"),   // 💎 (hombre)
    SUGAR_MOMMY("Elite"),   // 💎 (mujer)
    SUGAR_BABY("Prime"),    // 🌟

    val emoji: String       // "💎" o "🌟"
    val minimumAge: Int     // 18 para todos
    val localizationKey: String
}
// core/config/UserType.kt — misma estructura con emoji como constructor param
```

**UI muestra solo 2 opciones**: 💎 Elite y 🌟 Prime
- Si elige **Elite**: `eliteIndex = if (genderIndex == 0) 1 else 2` → SUGAR_DADDY (hombre) o SUGAR_MOMMY (mujer)
- Si elige **Prime**: index 0 → SUGAR_BABY
- Botón "?" abre AlertDialog con descripción de cada tipo
- Onboarding: `UserTypeStepScreen.kt` → `eliteIndex` resuelve según `genderIndex`
- Badge en ProfileCardView: `"💎 Elite"` o `"🌟 Prime"` (emoji inline)
- Dialog en ProfileCardView: usa `contains("Elite")` / `contains("Prime")` para match
- Firestore rawValues **NO cambian**: `SUGAR_DADDY`, `SUGAR_MOMMY`, `SUGAR_BABY`
- Descripciones (10 idiomas): Elite = "compartir estilo de vida y sorprender", Prime = "conexiones significativas y que me sorprendan"

---

## Remote Config — 10 Claves Android

```kotlin
// RemoteConfigManager.kt — intervalo: 3600s
"compatibility_weights"              → getString()  (default: Gson JSON de CompatibilityWeights.DEFAULT)
"matching_scoring_weights"           → getString()  (default: Gson JSON de MatchingScoringWeights.DEFAULT)
"daily_likes_limit"                  → getLong()    (default: 100)
"daily_super_likes_limit"            → getLong()    (default: 5)
"max_search_radius_km"               → getDouble()  (default: 200.0)
"ai_moderation_confidence_threshold" → getDouble()  (default: 0.80)
"profile_reappear_cooldown_days"     → getLong()    (default: 14)
"bulk_query_batch_size"              → getLong()    (default: 50)
"minimum_age_by_country"             → getString()  (default: "{\"default\": 18}")
"enable_bio_ai_suggestions"          → getBoolean() (default: false)
```

---

## Cloud Functions llamadas desde Android (33 + 2 test)

```kotlin
// AIEnhancedMatchingService.kt, StoryRepository.kt, UserServiceImpl.kt, etc.
// ⚠️ swipeUser, superLikeUser, sendPlaceMessage NO son CFs — se hacen directo a Firestore
analyzeConversationChemistry       // payload: {matchId, userLanguage}
analyzePersonalityCompatibility    // payload: {userId, targetUserId}
analyzePhotoBeforeUpload           // payload: {photoBase64, userLanguage}
analyzeProfileWithAI               // payload: {currentUserId, targetUserId}
blockUser                          // payload: {blockedUserId}
calculateSafetyScore               // payload: {targetUserId, userLanguage}
createStory                        // payload: {imageUrl, matchId, matchParticipants}
deleteStory                        // payload: {storyId}
deleteUserData                     // payload: {userId}
detectProfileRedFlags              // payload: {userId}
findSimilarProfiles                // payload: {userId, limit}
generateConversationStarter        // payload: {userId, matchUserId}
generateIcebreakers                // payload: {userId, matchUserId}
generateSmartReply                 // payload: {matchId, lastMessage, userId, userLanguage}
getBatchCompatibilityScores        // payload: {currentUserId, targetUserIds: [...]}
getBatchPersonalStories            // payload: {userIds: [...]}
getBatchPhotoUrls                  // payload: {photoRequests: [{userId, pictureNames}]}
getBatchStoryStatus                // payload: {userIds: [...]}
getCompatibleProfileIds            // payload: {userId, limit}
getDateSuggestions                 // payload: —
getDatingAdvice                    // payload: {situation, context, userLanguage}
getEnhancedCompatibilityScore      // payload: {currentUserId, candidateId}
getMatchesWithMetadata             // payload: {} (sin params — usa auth) → Android only CF optimizado
markStoryAsViewed                  // payload: {storyId}
moderateMessage                    // payload: {matchId, message, language}
moderateProfileImage               // payload: {imageUrl, expectedGender, userLanguage}
optimizeProfilePhotos              // payload: {userId}
predictMatchSuccess                // payload: {userId, targetUserId}
predictOptimalMessageTime          // payload: {targetUserId, userLanguage}
reportUser                         // payload: {reportedUserId, reason, matchId}
searchPlaces                       // payload: {matchId, query, userLanguage}
unmatchUser                        // payload: {matchId, otherUserId, language}
validateProfileImage               // payload: {imageUrl, expectedIsMale, expectedAge}
// Solo Android (test):
// testDailyLikesResetNotification
// testSuperLikesResetNotification
```

---

## FirestoreOrientation Enum

```kotlin
// FirestoreOrientation.kt — valores SIEMPRE lowercase
enum class FirestoreOrientation {
    men,    // → "men"
    women,  // → "women"
    both    // → "both"
}
// orientation.name produce "men"/"women"/"both" (lowercase por diseño del enum)
// updateProfile usa orientation.name.lowercase() como precaución extra
```

---

## WorkManager — SwipeUploadWorker

```kotlin
// feature/home/ui/HomeViewModel.kt
// Cuando un swipe falla, se encola para retry:
enqueueSwipeWork(swipedUserId, isLike = true, isSuperLike = false)

// Inmediatamente después:
analyticsService.logSwipeFailedPendingRetry(profileId, "like")  // o "super_like"

// SwipeUploadWorker.kt — max 3 reintentos con backoff exponencial
```

---

## Storage — Rutas (Android)

```kotlin
// Fotos de perfil
firebaseStorage.reference.child("users").child(userId).child(filename)         // full .jpg
firebaseStorage.reference.child("users").child(userId).child(thumbFilename)    // _thumb.jpg

// Fotos efímeras de chat
storage.reference.child("ephemeral_photos/$matchId/$photoId.jpg")

// Stories
// storageRef = storage.reference.child("stories")
// storageRef.child("personal_stories/$userId/$storyId.jpg")
// → ruta completa: stories/personal_stories/{userId}/{storyId}.jpg

// Uploads temporales (moderación)
storage.reference.child("temp_uploads/$userId/$filename")
```

---

## Reglas Críticas Android

1. **`"g"` — NO `"geohash"`** al escribir/leer el campo de geohash
2. **`orientation.name`** — el enum `FirestoreOrientation` usa minúsculas nativamente
3. **`"fcmToken"` camelCase** — campo exacto del token FCM
4. **`isEphemeral: false`** — escribirlo en TODOS los tipos de mensaje via `toData()`/`toPlaceData()`
5. **`activeChat` con `FieldValue.delete()`** al salir del chat (ActiveChatManager)
6. **`timezoneOffset` Y `timezone`** — ambos se escriben en `createUser`, `updateDeviceSettings` Y `updateUserLocation`
7. **`pendingNotifications.createdAt`** — siempre incluir `FieldValue.serverTimestamp()`
8. **`swipe_failed_pending_retry`** — usar `analyticsService.logSwipeFailedPendingRetry()` (no el logEvent directo de Firebase)
9. **Crashlytics setUserId** — tras login exitoso llamar `FirebaseCrashlytics.getInstance().setUserId(userId)` además de `analyticsService.setUserId(userId)` (homologado con iOS)
10. **Storage paths** — fotos de perfil SIEMPRE en `users/{userId}/{filename}` (NUNCA `profile_images/`). Fix aplicado en `MatchFirebaseDataSourceImpl.kt` (getMatchesOptimized + fallback de fotos)

---

## Comandos de Búsqueda Rápida

```bash
# Buscar campo Firestore en Android
grep -rn '"nombreCampo"' /Users/daniel/AndroidStudioProjects/BlackSugar212/app/src/main/java/com/black/sugar21/ --include="*.kt" | grep -v "Log\."

# Listar CFs llamadas por Android
grep -rn 'getHttpsCallable\|httpsCallable' /Users/daniel/AndroidStudioProjects/BlackSugar212/ --include="*.kt" | grep '"' | sed 's/.*"\([a-zA-Z]*\)".*/\1/' | sort -u

# Ver eventos Analytics Android
grep -rn 'logEvent' /Users/daniel/AndroidStudioProjects/BlackSugar212/ --include="*.kt" | grep '"[a-z_]*"' | sed 's/.*"\([a-z_]*\)".*/\1/' | sort -u

# Listar constantes FirestoreUserProperties
grep -n "const val" /Users/daniel/AndroidStudioProjects/BlackSugar212/app/src/main/java/com/black/sugar21/core/firebase/model/FirestoreUser.kt
```
````
