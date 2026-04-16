# Cross-Platform Alignment Checklist (iOS ↔ Android)

**Propósito:** Validar que iOS y Android mantienen paridad en features, data structures, y UX.

**Uso:** Ejecutar antes de cada release para detectar divergencias.

---

## 1. Data Models & Firestore

### User Profile
- [ ] `orientation` field: enum `men`/`women`/`both` (lowercase en ambos)
- [ ] `userType` field: enum ELITE/ELITE/PRIME (Firestore raw value)
- [ ] `male` field: boolean (Android) vs interpretación en iOS
- [ ] `g` field: geohash (NO `geohash`)
- [ ] `fcmToken` field: camelCase exacto
- [ ] `timezone` + `timezoneOffset`: ambos presentes
- [ ] `accountStatus`: 'active'/'paused'/'deleted'
- [ ] `pictures` array: URLs firmadas desde Storage

### Messages
- [ ] `type` field: "text", "place", "ephemeral"
- [ ] `isEphemeral` flag: SIEMPRE presente, incluso en text
- [ ] `placeData` structure: idéntica (name, address, rating, etc)
- [ ] `timestamp`: FieldValue.serverTimestamp() en ambos
- [ ] `senderId` + `senderName`: campos requeridos

### Matches
- [ ] `lastMessageSeq`: número incrementado en ambos
- [ ] `lastMessageTimestamp`: FieldValue.serverTimestamp()
- [ ] `createdAt` vs `timestamp`: consistente
- [ ] Bloqueos bidireccionales: ambos lados registran

---

## 2. Cloud Functions Integration

### Discovery V2 (getDiscoveryFeed)
- [ ] Android: `HomeViewModel.fetchProfiles()` calls CF
- [ ] iOS: `ProfileCardRepository.getProfilesV2()` calls CF
- [ ] Request payload: mismo formato (userId, limit, lastDocId)
- [ ] Response parsing: ambos manejan `totalCount`, `lastDocId`
- [ ] Fallback logic: ambos intentan V2 primero, V1 como backup
- [ ] Photo URLs: ambos usan respuesta V2 directamente (sin getBatchPhotoUrls)

### Multi-Universe Simulator (runMultiUniverseSimulation)
- [ ] Android: `CoachChatScreen.kt` → llama CF
- [ ] iOS: `CoachChatView.swift` → llama CF
- [ ] Payload: `matchId`, `matchName`, `situation` (optional)
- [ ] Response: 5-stage array con compatibility scores
- [ ] Carousel UI: ambos muestran 5 etapas horizontales
- [ ] Credit deduction: ambos decrementan counter después de simulación
- [ ] Localization: ambos usan mismas keys para 10 idiomas

### Coach IA (dateCoachChat)
- [ ] Request: `situation`, `userLanguage`, `context` fields
- [ ] Response: structured advice + activities + suggestions
- [ ] RAG integration: ambos buscan chunks en 10 idiomas
- [ ] Credit system: ambos usan shared pool (no separado)
- [ ] Icebreakers: ambos generan en chat vacío

---

## 3. UI/UX Consistency

### Colors & Dark Mode
- [ ] Gold accent: `#FFC107` (ambos use semantic names)
- [ ] Dark background: mismo shade en ambos
- [ ] Purple secondary: `#9C27B0` o similar
- [ ] Text colors: ON-background semantic consistency
- [ ] Gradients: Match layout + styling
- [ ] Icons: Mismo set (MaterialDesign en Android, SF Symbols en iOS)

### Elite/Prime Badge
- [ ] Android: inline emoji + text ("💎 Elite" o "🌟 Prime")
- [ ] iOS: inline emoji + text (mismo formato)
- [ ] Selection UI: 2 opciones (Elite/Prime), mismo descriptor
- [ ] Chat restriction: Elite only → ambos muestran mismo error

### Multi-Universe Carousel
- [ ] Stage indicators: mismo número de dots/dividers
- [ ] Detail sheet layout: idéntica estructura
- [ ] Animation timing: 300ms+ para transiciones suaves
- [ ] Scroll behavior: snap to center en ambos

### Icebreaker Chips
- [ ] Loading state: shimmer placeholders (3)
- [ ] Tap action: pre-llena input + focus
- [ ] Styling: gold background, rounded corners
- [ ] Animation: fade in cuando carga

---

## 4. Photo Management

### Upload Flow
- [ ] Compression: ambos comprimen antes de upload
- [ ] Moderation: ambos llaman `moderateProfileImage` CF
- [ ] Gender mismatch: ambos muestran error si Gemini detecta mismatch
- [ ] Retry: ambos reintetan fallidos (WorkManager vs background task)

### Display
- [ ] Thumb URLs: ambos usan `_thumb` variants donde disponible
- [ ] Placeholder: mismo skeleton/loading state
- [ ] Error handling: ambos muestran error + retry option
- [ ] Cache: ambos cachean foto list en memoria

### Photo Coach
- [ ] Trigger: ambos en edit profile
- [ ] Title: `"AI Photo Coach"` en 10 idiomas
- [ ] Loading spinner: gold tint en ambos
- [ ] Results: feedback visual idéntico

---

## 5. Real-Time Features

### Active Chat
- [ ] Write on enter: `activeChat` + `activeChatTimestamp`
- [ ] Delete on exit: `FieldValue.delete()` en ambos
- [ ] Read receipts: ambos tracking `lastSeenTimestamp`
- [ ] Typing indicators: si implementado, idéntico

### Match List Ordering
- [ ] Primary sort: `timestamp` DESC
- [ ] Secondary sort: `lastMessageSeq` DESC
- [ ] Stagger: ambos re-ordenan en <500ms
- [ ] Persistence: ambos actualiza Firestore inmediatamente
- [ ] UI refresh: ambos actualiza lista antes de CF response (optimistic)

### Stories
- [ ] Delete flow: ambos llaman `deleteStory` CF
- [ ] View tracking: `markStoryAsViewed` CF response handling
- [ ] Auto-expire: `expiresAt` check en ambos (24h)
- [ ] Permissions: ambos piden camera/photo library

---

## 6. Authentication & Security

### Phone Auth
- [ ] Input validation: ambos aceptan +1 a +999
- [ ] OTP handling: ambos timeout en 60 segundos
- [ ] Retry limit: ambos permiten N intentos (default 3)
- [ ] Error messages: mismo tono (user-friendly)

### Firestore Rules
- [ ] User creation: auth.uid == usuarioId
- [ ] Message read: auth.uid == participante del match
- [ ] Block operations: ambos enforce en rules
- [ ] Admin operations: auth.uid in allowlist

### App Check
- [ ] Android: PlayIntegrity token en cada CF
- [ ] iOS: AppAttest token en cada CF
- [ ] Fallback: si App Check falla, ambo retry con backoff

---

## 7. Internationalization (10 Idiomas)

### Strings Coverage
- [ ] Multi-universe: "Universos Posibles", stage labels, insights (all 10 langs)
- [ ] Coach: UI labels + error messages (all 10 langs)
- [ ] Icebreakers: suggestions (all 10 langs)
- [ ] Photo Coach: feedback (all 10 langs)

### Locale Detection
- [ ] Android: `Locale.getDefault()` → device language
- [ ] iOS: `Locale.current` → device language
- [ ] Fallback: ambos → "en" si idioma no soportado

### RTL Support (Arabic)
- [ ] Layout: ambos support RTL para árabe
- [ ] Text direction: bidirectional text handling
- [ ] Icons: ambos flip segun RTL

---

## 8. Analytics Events

### Consistency
- [ ] Event names: idénticos en ambos (e.g., "profile_like")
- [ ] Parameter names: idénticos (e.g., "target_user_id")
- [ ] Timing: ambos log inmediatamente (no batching)
- [ ] 23 eventos: verify ambos platform cubren mismo set

### Key Events
- [ ] `profile_like`, `profile_pass`, `super_like`
- [ ] `match_created`, `unmatch`
- [ ] `message_sent`, `message_received`
- [ ] `story_created`, `story_viewed`, `story_deleted`
- [ ] `swipe_failed_pending_retry`

---

## 9. Remote Config

### Keys Sync
- [ ] `daily_likes_limit`: SIEMPRE 100 (constante)
- [ ] `daily_super_likes_limit`: SIEMPRE 5 (constante)
- [ ] `coach_daily_credits`: ambos leen mismo valor
- [ ] `enable_safety_checkin`: ambos respetan mismo flag
- [ ] `reviewer_uid`: ambos bypass location updates

### Fetch Interval
- [ ] Android: 3600 segundos (1 hora)
- [ ] iOS: 3600 segundos (1 hora)
- [ ] On-demand: ambos tienen método manual refresh

---

## 10. Error Handling

### Network Errors
- [ ] 502/503: retry con backoff exponencial
- [ ] Timeout: user-facing message idéntica
- [ ] Offline: ambos queue operaciones locally

### Validation Errors
- [ ] Empty bio: same error message (10 langs)
- [ ] Invalid birth date: same validation logic
- [ ] Photo size: same dimension checks

### Firebase Errors
- [ ] Permission-denied: user-friendly message
- [ ] Document not found: graceful fallback
- [ ] Auth errors: same recovery flow

---

## 11. Performance Metrics

### Latency Targets
- [ ] Discovery load: <2s (ambos)
- [ ] Message send: <500ms (ambos)
- [ ] CF response: <3s p95 (ambos)
- [ ] UI interaction: <100ms (ambos)

### Memory Usage
- [ ] Profile list: <50MB cache (ambos)
- [ ] Photo cache: <100MB (ambos)
- [ ] Firestore listener count: <10 active (ambos)

---

## 12. Testing Parity

### Test Data
- [ ] Creation: ambos usan `test-system-unified.js`
- [ ] Accounts: same Daniel/Rosita setup
- [ ] Discovery profiles: 20-30 per platform
- [ ] Matches: 5-10 pre-populated

### Manual Test Cases
- [ ] First match swipe → like → create match
- [ ] Send message → observe reorder
- [ ] Start multi-universe simulation → view results
- [ ] Ask Coach IA question → get response
- [ ] Take photo → pass moderation
- [ ] Switch language → all strings updated

---

## Quick Validation Script

```bash
# Run from project root
cat <<'EOF' > /tmp/alignment-check.sh
#!/bin/bash

echo "📋 iOS ↔ Android Alignment Check"
echo "=================================="

# Check orientation enum
echo -e "\n✓ Orientation values:"
grep -r "enum.*Orientation" /Users/daniel/AndroidStudioProjects/iOS --include="*.swift" | head -1
grep -r "enum class FirestoreOrientation" /Users/daniel/AndroidStudioProjects/BlackSugar212 --include="*.kt" | head -1

# Check userType
echo -e "\n✓ UserType values:"
grep -r "case elite\|case prime" /Users/daniel/AndroidStudioProjects/iOS --include="*.swift" | head -2
grep -r "ELITE\|PRIME" /Users/daniel/AndroidStudioProjects/BlackSugar212 --include="*.kt" | grep "enum\|case" | head -2

# Check geohash field
echo -e "\n✓ Geohash field naming:"
grep -r '\"g\"' /Users/daniel/AndroidStudioProjects/iOS --include="*.swift" | wc -l
grep -r '\"g\"' /Users/daniel/AndroidStudioProjects/BlackSugar212 --include="*.kt" | wc -l

# Check isEphemeral
echo -e "\n✓ isEphemeral presence:"
grep -r 'isEphemeral' /Users/daniel/AndroidStudioProjects/iOS --include="*.swift" | wc -l
grep -r 'isEphemeral' /Users/daniel/AndroidStudioProjects/BlackSugar212 --include="*.kt" | wc -l

echo -e "\n✅ Manual verification required for:"
echo "  - UI color consistency"
echo "  - Animation timing"
echo "  - Error message parity"
echo "  - Language coverage (10 langs)"
EOF

chmod +x /tmp/alignment-check.sh
/tmp/alignment-check.sh
```

---

## Resolution Process

**Si encuentras divergencia:**
1. **Document**: Add to DIVERGENCES.md con línea/archivo exacto
2. **Assign**: Owner (iOS/Android) para fix
3. **Fix**: En ambas platforms simultáneamente
4. **Verify**: Re-run alignment checklist
5. **Commit**: `homolog(platform): Fix NAME_OF_DIVERGENCE`

**Owner assignments:**
- Android: `/Users/daniel/AndroidStudioProjects/BlackSugar212`
- iOS: `/Users/daniel/AndroidStudioProjects/iOS`
- Shared: Database schemas, CF responses, Remote Config

---

**Last Updated:** 2026-04-16  
**Review Cadence:** Antes de cada release + weekly spot-checks
