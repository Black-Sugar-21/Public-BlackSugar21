````skill
---
name: blacksugar-ios
description: App iOS de BlackSugar21 (Swift/SwiftUI). Usar cuando se trabaje con el código iOS, Firestore datasource, Firebase Analytics, Remote Config, autenticación por teléfono, mensajes efímeros, swipes, stories, Cloud Functions desde iOS, AppCheck, o auditoría iOS ↔ Android.
---

# BlackSugar21 — iOS App Skill

## Información del Proyecto

**Bundle ID:** `com.blacksugar21.app`  
**Lenguaje:** Swift 5.9 + SwiftUI  
**Firebase Project:** `black-sugar21`  
**App Check:** DeviceCheck + AppAttest (Debug: DebugAppCheckProviderFactory)  
**Ruta raíz:** `/Users/daniel/AndroidStudioProjects/iOS/black-sugar-21/`

---

## Archivos Clave (iOS)

| Archivo | Propósito |
|---|---|
| `data/datasource/FirestoreRemoteDataSource.swift` | **PRINCIPAL** — Toda operación Firestore: create, read, update, write |
| `data/datasource/model/FirestoreUser.swift` | Modelo Codable del usuario en Firestore |
| `data/repository/ProfileCardRepository.swift` | Discovery queries con geohash |
| `ui/edit-profile/EditProfileView.swift` | `getModifiedProfileFields()` — update perfil |
| `ui/login/PhoneAuth/PhoneAuthViewModel.swift` | Autenticación teléfono + analytics |
| `services/AnalyticsService.swift` | Todos los eventos Firebase Analytics |
| `services/RemoteConfigService.swift` | 10 claves Remote Config |
| `core/chat/ActiveChatManager.swift` | `activeChat` + `activeChatTimestamp` |

---

## Firestore — Operaciones iOS

### `createUserProfile()` — Campos escritos al registrar usuario

```swift
userData["name"]                    = name
userData["birthDate"]               = birthDate
userData["bio"]                     = bio
userData["male"]                    = male
userData["orientation"]             = orientation.rawValue  // "men"|"women"|"both" LOWERCASE
userData["userType"]                = userType.rawValue     // "SUGAR_DADDY"|"SUGAR_MOMMY"|"SUGAR_BABY" (Firestore raw, UI: 💎 Elite / 🌟 Prime)
userData["pictures"]                = pictures
userData["liked"]                   = []
userData["passed"]                  = []
userData["latitude"]                = latitude              // opcional
userData["longitude"]               = longitude             // opcional
userData["g"]                       = geohash               // campo EXACTO "g"
userData["minAge"]                  = minAge
userData["maxAge"]                  = maxAge
userData["maxDistance"]             = maxDistance
userData["superLikesRemaining"]     = 5
userData["superLikesUsedToday"]     = 0
userData["lastSuperLikeResetDate"]  = FieldValue.serverTimestamp()
userData["dailyLikesRemaining"]     = randomLimit           // 50–100
userData["dailyLikesLimit"]         = randomLimit
userData["lastLikeResetDate"]       = FieldValue.serverTimestamp()
userData["timezone"]                = timezoneId            // "America/Mexico_City"
userData["timezoneOffset"]          = timezoneOffset        // offset numérico (-6, +1)
userData["deviceLanguage"]          = deviceLanguage        // "es", "en"
userData["paused"]                  = false
userData["accountStatus"]           = "active"
```

### `sendMessage()` — Mensaje de texto

```swift
[
  "message": text,
  "senderId": userId,
  "timestamp": FieldValue.serverTimestamp(),
  "type": "text",
  "isEphemeral": false              // ✅ SIEMPRE escribir, incluso en text
]
```

### `sendPlaceMessage()` — Mensaje de lugar

```swift
[
  "message": "📍 \(place.name)",
  "senderId": userId,
  "timestamp": FieldValue.serverTimestamp(),
  "type": "place",
  "placeData": {
    "name", "address", "rating", "latitude", "longitude", "placeId",
    "googleMapsUrl"?, "website"?, "phoneNumber"?, "isOpenNow"?,
    "instagram"?, "instagramHandle"?, "tiktok"?, "category"?,
    "photos"?: [{"url", "width", "height"}], "description"?
  },
  "isEphemeral": false
]
```

### `pauseAccount()` / `resumeAccount()`

```swift
// pause:
["paused": true, "visible": false, "pausedAt": FieldValue.serverTimestamp()]

// resume:
["paused": false, "visible": true]
```

### `pendingNotifications` — Estructura del documento

```swift
[
  "token": fcmToken,
  "notification": [
    "title_loc_key": "notification_new_message_title",
    "title_loc_args": [senderName],
    "body_loc_key": "notification_new_message_body"
  ],
  "data": [
    "matchId": matchId,
    "senderId": senderId,
    "type": "chat_message",            // o "new_match"
    "senderName": senderName,
    "click_action": "OPEN_CHAT"        // o "OPEN_MATCHES"
  ],
  "processed": false,
  "createdAt": FieldValue.serverTimestamp()
]
```

---

## Firebase Analytics — 23 eventos iOS

### Eventos con su llamada Swift

```swift
Analytics.logEvent("profile_like",   parameters: ["target_user_id": id, "action": "like"])
Analytics.logEvent("profile_pass",   parameters: ["target_user_id": id, "action": "pass"])
Analytics.logEvent("super_like",     parameters: ["target_user_id": id, "action": "super_like"])
Analytics.logEvent("match_created",  parameters: ["match_user_id": id])
Analytics.logEvent("unmatch",        parameters: ["match_user_id": id])
Analytics.logEvent("message_sent",   parameters: ["recipient_user_id": id, "message_length": n, "is_first_message": bool])
Analytics.logEvent("message_received", parameters: ["sender_user_id": id])
Analytics.logEvent("photo_upload",   parameters: ["photo_position": n, "total_photos": n])
Analytics.logEvent("photo_delete",   parameters: ["photo_position": n, "total_photos": n])
Analytics.logEvent("profile_edit",   parameters: ["fields_changed": "bio,name,..."])
Analytics.logEvent("filter_change",  parameters: ["min_age": n, "max_age": n, "max_distance_km": n, "gender_preference": s])
Analytics.logEvent("user_block",     parameters: ["blocked_user_id": id])
Analytics.logEvent("user_report",    parameters: ["reported_user_id": id, "reason": s])
Analytics.logEvent("session_end",    parameters: ["duration_seconds": n])
Analytics.logEvent("story_created",  parameters: ["match_id": id])
Analytics.logEvent("story_viewed",   parameters: ["story_id": id, "author_id": id])
Analytics.logEvent("story_deleted",  parameters: ["story_id": id])
Analytics.logEvent("purchase_failed",parameters: ["product_id": id])
Analytics.logEvent("begin_checkout", parameters: [...])
Analytics.logEvent("phone_verification_code_sent", parameters: ["method": "phone", "phone_number": n])
Analytics.logEvent("phone_verification_error",     parameters: ["error": s])
Analytics.logEvent("phone_verification_failed",    parameters: ["reason": s])
Analytics.logEvent("swipe_failed_pending_retry",   parameters: ["user_id": id, "action": "like"|"super_like"])
```

---

## UserType — Elite/Prime (2 opciones UI, 3 valores backend)

```swift
// domain/profile/UserType.swift
enum UserType: String, CaseIterable, Codable, Identifiable {
    var id: String { rawValue }
    case sugarDaddy = "SUGAR_DADDY"   // 💎 Elite (hombre)
    case sugarMommy = "SUGAR_MOMMY"   // 💎 Elite (mujer)
    case sugarBaby  = "SUGAR_BABY"    // 🌟 Prime

    var emoji: String       // 💎 o 🌟
    var displayName: String // "Elite" o "Prime" (desde RemoteConfigService)
    var localizationKey: String
    var minimumAge: Int     // 18 para todos
}
```

**UI muestra solo 2 opciones**: 💎 Elite y 🌟 Prime
- Si elige **Elite**: backend asigna `SUGAR_DADDY` (hombre) o `SUGAR_MOMMY` (mujer) automáticamente según género
- Si elige **Prime**: backend asigna `SUGAR_BABY`
- Botón "?" abre modal `UserTypeInfoSheet` con descripción de cada tipo
- Onboarding: `OnboardingUserTypeView.swift` → `resolveUserType(for: "elite")` mapea según `coordinator.userData.male`
- EditProfile: `EditProfileView.swift` → `selectElite()` mapea según `userGender == "man"` (Constants.genderOptions)
- Badge en SwipeView/ProfileDetailsSheet: `"\(userType.emoji) \(userType.displayName)"` → "💎 Elite" o "🌟 Prime"
- Firestore rawValues **NO cambian**: `SUGAR_DADDY`, `SUGAR_MOMMY`, `SUGAR_BABY`
- Descripciones (10 idiomas): Elite = "compartir estilo de vida y sorprender", Prime = "conexiones significativas y que me sorprendan"
- Chat restriction: Solo Elite puede enviar primer mensaje. Prime ve "Only Elite users can start the conversation"
- Labels: `user_type_sugar_daddy_label` = "Elite", `user_type_sugar_daddy_mommy_label` = "Elite"
- Photo Coach: title + button = "AI Photo Coach" / "Coach IA de Fotos" (10 langs)
- Photo Coach spinner: `.tint(AppColor.metallicGold)` (dark/light compatible)
- SwipeView type dialog: `.sheet(item: $selectedUserType)` con `Identifiable` (no `isPresented`)
- Edit profile nav title: `NSLocalizedString("edit-profile")` (no raw key)
- SafetyCheckIn: behind RC `enable_safety_checkin` (default false)
- Reviewer location: skip `updateUserLocation()` via `isReviewerUid()` — ubicación fija Santiago

### AI Icebreakers en Chat vacío
- Cuando el chat tiene 0 mensajes, se muestran 3 icebreakers generados por `generateIcebreakers` CF
- `ChatViewModel.fetchIcebreakers(matchUserId:)` → `AIWingmanService.shared.generateIcebreakers(userId1:userId2:)`
- Task con `[weak self]` + `MainActor.run` (sin memory leak)
- UI: `icebreakersSuggestions` view en `messagesScrollContent()` con `.flippedUpsideDown()`
- Tap icebreaker → pre-llena `typingMessage` + focus input
- Condición: `messageList.isEmpty && !firstMessageSent`
- Guard: `icebreakersLoaded` flag previene calls repetidos
- Loading: 3 shimmer rectangles con gold gradient
- Error: fail silently (shimmer desaparece, chat usable)
- ForEach: `enumerated(), id: \.offset` (safe IDs)

---

## Remote Config — 10 Claves iOS

```swift
// services/RemoteConfigService.swift — intervalo: 3600s
"compatibility_weights"              → JSON  (default: CompatibilityWeights.default)
"matching_scoring_weights"           → JSON  (default: MatchingScoringWeights.default)
"daily_likes_limit"                  → Int   (default: 100)
"daily_super_likes_limit"            → Int   (default: 5)
"max_search_radius_km"               → Double(default: 200.0)
"ai_moderation_confidence_threshold" → Double(default: 0.80)
"profile_reappear_cooldown_days"     → Int   (default: 14)
"bulk_query_batch_size"              → Int   (default: 50)
"minimum_age_by_country"             → JSON  (default: {"default": 18})
"enable_bio_ai_suggestions"          → Bool  (default: false)
```

---

## Cloud Functions llamadas desde iOS (33)

```swift
// AIEnhancedMatchingService.swift, StoryRepository.swift, FirestoreRemoteDataSource.swift, etc.
// ⚠️ swipeUser, superLikeUser, sendPlaceMessage NO son CFs — se hacen directo a Firestore
// ℹ️ getMatchesWithMetadata: iOS usa query Firestore directa (Android sí usa esta CF)
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
getBatchPhotoUrls                  // payload: {photoRequests: [{userId, pictureNames, includeThumb?}]}
getBatchStoryStatus                // payload: {userIds: [...]}
getCompatibleProfileIds            // payload: {userId, limit}
getDateSuggestions                 // payload: —
getDatingAdvice                    // payload: {situation, context, userLanguage}
getEnhancedCompatibilityScore      // payload: {currentUserId, candidateId}
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
```

---

## Storage — Rutas (iOS)

```swift
// Fotos de perfil
storage.child("users").child(userId).child(fileName)         // full .jpg
storage.child("users").child(userId).child(thumbFileName)    // _thumb.jpg (400px)

// Fotos efímeras de chat
"ephemeral_photos/\(matchId)/\(photoId).jpg"

// Stories
"stories/personal_stories/\(userId)/\(storyId).jpg"

// Uploads temporales (moderación)
// tempPath definido por ImageModerationService
```

---

## Reglas Críticas iOS

1. **`"g"` — NO `"geohash"`** al escribir/leer el campo de geohash
2. **`orientation` lowercase** — siempre `"men"` | `"women"` | `"both"`
3. **`"fcmToken"` camelCase** — campo exacto del token FCM
4. **`isEphemeral: false`** — escribirlo en TODOS los tipos de mensaje (text/place)
5. **`activeChat` con `FieldValue.delete()`** al salir del chat
6. **`timezoneOffset`** se escribe en `createUser`, `updateDeviceSettings` Y `updateUserLocation` (ProfileRepository.swift)
7. **`pendingNotifications.createdAt`** — siempre incluir serverTimestamp

---

## Comandos de Búsqueda Rápida

```bash
# Buscar campo Firestore en iOS
grep -rn '"nombreCampo"' /Users/daniel/AndroidStudioProjects/iOS/black-sugar-21/ --include="*.swift" | grep -v "//"

# Listar CFs llamadas por iOS
grep -rn "httpsCallable" /Users/daniel/AndroidStudioProjects/iOS/black-sugar-21/ --include="*.swift" | grep '"' | sed 's/.*"\([a-zA-Z]*\)".*/\1/' | sort -u

# Ver eventos Analytics iOS
grep -rn 'logEvent' /Users/daniel/AndroidStudioProjects/iOS/black-sugar-21/ --include="*.swift" | grep '"[a-z_]*"' | sed 's/.*"\([a-z_]*\)".*/\1/' | sort -u
```
````
