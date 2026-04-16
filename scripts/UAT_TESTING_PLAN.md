# User Acceptance Testing (UAT) Plan
## Multi-Universe Places + Instagram Scraping

**Test Period**: 2026-04-16 → 2026-04-18  
**Platforms**: iOS (iPhone 17 Pro) + Android (Pixel 8 Pro)  
**Test Scope**: Multi-universe simulation flow with Instagram-enhanced venue suggestions

---

## Pre-UAT Verification

### ✅ CloudFunction Deployment
```bash
# Verify deployed
firebase functions:list | grep getMultiUniversePlaces

# Check recent logs
firebase functions:log --only getMultiUniversePlaces | head -20
```

**Expected**: CF shows "SUCCESSFUL" status, recent logs show Instagram scraping activity

### ✅ Firestore Collections Exist
```bash
# Check placeInstagram collection
firebase firestore:query placeInstagram --limit 5
```

**Expected**: Collection contains documents with `instagram`, `followers`, `igScore` fields

### ✅ Both Apps Compile & Launch
- Android: `./gradlew assembleDebug` → success
- iOS: `xcodebuild build` → success
- Both apps launch without crashes

---

## UAT Test Matrix

### Phase 1: Basic Flow (Day 1 — 30 min)

**Test 1.1: Multi-Universe Button Appears**
- ✅ Open Coach Chat
- ✅ Verify "Universos Posibles" button visible
- ✅ Button disabled (no context)
- ✅ Type 5+ characters → button enabled
- ✅ Select a match → button enabled
- **Pass Criteria**: Button state matches context (empty field = disabled unless match selected)

**Test 1.2: Modal Shows Before Simulation**
- ✅ Type text + click "Universos Posibles"
- ✅ Modal appears (not CF results)
- ✅ Modal shows "5 stages" explanation
- ✅ Modal has "Cancelar" + "Explorar universos" buttons
- **Pass Criteria**: Modal displays correctly, CF not called until "Explorar" clicked

**Test 1.3: Modal Cancel Closes Without Action**
- ✅ Open modal → click "Cancelar"
- ✅ Modal closes
- ✅ No simulation runs
- ✅ Credits not consumed
- **Pass Criteria**: Cancel is safe, no side effects

---

### Phase 2: Simulation Flow (Day 1 — 1 hour)

**Test 2.1: Solo Mode (User Text)**
- ✅ Type situation (e.g., "Quiero alguien para café tranquilo")
- ✅ Click "Universos Posibles" → modal appears
- ✅ Click "Explorar universos" → simulation runs
- ✅ Results show 12-15 venues
- ✅ Check credits decremented (3/3 → 2/3)
- **Pass Criteria**: Simulation completes, credit system works

**Test 2.2: Match Mode (Real Conversation)**
- ✅ Select a match
- ✅ Leave situation field empty
- ✅ Click "Universos Posibles" → button should be enabled
- ✅ Modal shows (with match name visible)
- ✅ "Explorar universos" runs simulation with match's conversation
- ✅ Credits decremented
- **Pass Criteria**: Match mode uses backend conversation, not user text

**Test 2.3: Venue Details Correct**
- ✅ Verify each venue shows:
  - [ ] Place name
  - [ ] Address
  - [ ] Google rating
  - [ ] Distance from user
  - [ ] Photo carousel
  - [ ] Map button (opens Maps app)
- **Pass Criteria**: All venue info displays correctly

---

### Phase 3: Instagram Metrics (Day 1-2 — 1 hour)

**Test 3.1: Instagram Handles Present**
- ✅ Check first 5 venues in results
- ✅ Some should have Instagram handles visible (implementation dependent)
- ✅ Handles match actual Instagram accounts (@cafecoolnyc)
- **Pass Criteria**: Instagram integration visible in data

**Test 3.2: Firestore Logging**
- ✅ Run simulation
- ✅ Check Firestore `placeInstagram` collection
- ✅ Verify new documents created with:
  - [ ] Instagram handle
  - [ ] Followers count
  - [ ] Posts count
  - [ ] IG score (0-100)
  - [ ] Source (website | search)
- **Pass Criteria**: All venues logged to Firestore

**Test 3.3: Monitor Script Works**
```bash
cd /Users/daniel/IdeaProjects/Public-BlackSugar21
node scripts/monitor-instagram-collection-enhanced.js
```
- ✅ Shows total documents
- ✅ Shows success rate
- ✅ Shows top venues by followers
- **Pass Criteria**: Monitor reflects placeInstagram data

---

### Phase 4: All 14 Categories (Day 2 — 1.5 hours)

Test each category to ensure CF handles all properly:

| Category | iOS | Android | Notes |
|----------|-----|---------|-------|
| Café | ✅ | ✅ | Should load first, default |
| Restaurante | ✅ | ✅ | — |
| Bar | ✅ | ✅ | — |
| Discoteca | ✅ | ✅ | — |
| Parque | ✅ | ✅ | — |
| Museo | ✅ | ✅ | — |
| Zona comercial | ✅ | ✅ | — |
| Gym | ✅ | ✅ | — |
| Cine | ✅ | ✅ | — |
| Biblioteca | ✅ | ✅ | — |
| Hotel | ✅ | ✅ | — |
| Iglesia | ✅ | ✅ | — |
| Parque temático | ✅ | ✅ | — |
| Zoo | ✅ | ✅ | — |

**Per Category Test**:
- ✅ Click category
- ✅ Venues load (should be relevant to category)
- ✅ Modal appears and works
- ✅ Simulation runs correctly

**Pass Criteria**: All 14 categories functional, relevant results

---

### Phase 5: Dark Mode (Day 2 — 30 min)

**iOS Dark Mode**
- ✅ Enable Dark Mode in Settings
- ✅ Open Coach Chat
- ✅ Check modal colors are readable
- ✅ Check venue cards are readable
- ✅ Disable Dark Mode, verify light theme works
- **Pass Criteria**: Both themes readable, no contrast issues

**Android Dark Mode**
- ✅ Enable Dark Mode in system settings
- ✅ Open Coach Chat
- ✅ Check modal colors
- ✅ Check venue cards
- ✅ Disable Dark Mode
- **Pass Criteria**: Both themes readable

---

### Phase 6: Localization (Day 2 — 1 hour)

**Test each of 10 languages**:
1. English (EN)
2. Español (ES)
3. Português (PT)
4. Français (FR)
5. Deutsch (DE)
6. 日本語 (JA)
7. 中文 (ZH)
8. Русский (RU)
9. العربية (AR)
10. Indonesia (ID)

**Per Language**:
- ✅ Change app language in settings
- ✅ Verify modal title localized
- ✅ Verify "5 stages" text localized
- ✅ Verify button labels localized ("Explorar universos" → equivalent)
- ✅ Verify category names localized
- **Pass Criteria**: All 10 languages display correctly

---

### Phase 7: Edge Cases (Day 2 — 1 hour)

**Test 7.1: No Results Found**
- ✅ Search in area with few venues
- ✅ Modal should show graceful "no results" message
- ✅ Credit not consumed if fails
- **Pass Criteria**: Error handled elegantly

**Test 7.2: Network Error During Simulation**
- ✅ Turn off WiFi/cellular mid-simulation
- ✅ Error should display
- ✅ Retry button should work
- **Pass Criteria**: Network error handled

**Test 7.3: Rapid Category Switching**
- ✅ Switch categories 5+ times quickly
- ✅ Each category should load correctly
- ✅ No stale data shown
- **Pass Criteria**: No race conditions

**Test 7.4: Multiple Simulations in Same Session**
- ✅ Run simulation for Café
- ✅ Run simulation for Restaurant
- ✅ Run simulation for Bar
- ✅ Verify each shows different venues
- **Pass Criteria**: Each simulation independent

---

## Performance Testing

### Load Time Targets
| Operation | iOS | Android | Target |
|-----------|-----|---------|--------|
| Modal appears | < 200ms | < 200ms | <250ms |
| Simulation starts (CF call) | < 3s | < 3s | <3.5s |
| Results display | < 1s | < 1s | <1.5s |
| Photo carousel scroll | 60fps | 60fps | Smooth |

**Measurement Method**:
```
1. Open Coach Chat (note time)
2. Click Universos Posibles (modal appear time)
3. Click Explorar (CF call start)
4. Results appear (total time)
```

---

## Regression Testing

### Check These Don't Break
- ✅ Regular place suggestions still work (non-multi-universe)
- ✅ Chat messages work normally
- ✅ Other Coach features (outfit, events, icebreakers)
- ✅ App doesn't crash on back button
- ✅ App doesn't crash on app switcher
- ✅ App doesn't crash on memory pressure

---

## UAT Report Template

```
# UAT REPORT — MULTI-UNIVERSE PLACES

Date: 2026-04-16 to 2026-04-18
Platforms: iOS, Android
Tester: [Name]

## Test Summary
Total Tests: [ ]
Passed: [ ]
Failed: [ ]
Skipped: [ ]
Pass Rate: [ ]%

## Critical Issues
- [ ] None
- [ ] Issue 1: [Description]
- [ ] Issue 2: [Description]

## High Priority
- [ ] None
- [ ] Issue 1: [Description]

## Medium Priority
- [ ] None
- [ ] Issue 1: [Description]

## Low Priority (Nice-to-have)
- [ ] None
- [ ] Issue 1: [Description]

## Performance Results
Modal Appear Time: [ms] (Target: <250ms)
Simulation Time: [s] (Target: <3.5s)
Scrolling FPS: [fps] (Target: 60fps)

## Localization Results
Languages Tested: 10/10
Strings Missing: 0
Display Issues: 0

## Recommendation
[ ] Approve for Production
[ ] Approve with Minor Fixes
[ ] Reject - Major Issues Found

## Sign-Off
Tester: _______________
Date: _______________
```

---

## UAT Success Criteria

✅ **Go/No-Go Decision** based on:

| Criteria | Required | Current |
|----------|----------|---------|
| All 14 categories work | YES | ⏳ TBD |
| Modal appears correctly | YES | ⏳ TBD |
| Simulation runs (solo + match mode) | YES | ⏳ TBD |
| Instagram data logged to Firestore | YES | ⏳ TBD |
| All 10 languages display | YES | ⏳ TBD |
| Dark mode works | YES | ⏳ TBD |
| No crashes on regression tests | YES | ⏳ TBD |
| Performance meets targets | STRONGLY DESIRED | ⏳ TBD |

**Decision Threshold**: ✅ All "YES" criteria must pass

---

## Next Steps After UAT

### If All Pass ✅
1. Deploy to Play Store (internal test track)
2. Deploy to TestFlight (iOS)
3. Gather user feedback
4. Monitor Firebase Console metrics
5. Proceed to optimization phase

### If Issues Found 🔧
1. Document issue severity
2. Create fixes on main branch
3. Re-test specific areas
4. Get sign-off before production deployment

---

**Ready to begin UAT?** Run this script to generate testing checklist:
```bash
node scripts/generate-uat-checklist.js
```

(Checklist script in separate file)
