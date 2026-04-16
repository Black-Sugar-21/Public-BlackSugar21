# Quickstart Guides by Platform

Guías rápidas para empezar desarrollo en cada plataforma.

---

## 🤖 Android Quickstart

### Environment Setup
```bash
# 1. Open project
open -a "Android Studio" /Users/daniel/AndroidStudioProjects/BlackSugar212

# 2. Gradle sync (auto on open)
# Wait for "Gradle build finished"

# 3. Verify build
./gradlew assembleDebug
# Expected: "BUILD SUCCESSFUL"
```

### First Run
```bash
# 1. Connect device or open emulator
adb devices

# 2. Run app
./gradlew installDebug

# 3. Open app logcat
adb logcat | grep "sugar21\|Coach\|Discovery"
```

### Key Files to Know
| Task | File |
|------|------|
| Swipes/Discovery | `HomeViewModel.kt`, `UserServiceImpl.kt` |
| Messages | `ChatViewModel.kt`, `MessageServiceImpl.kt` |
| Coach IA | `CoachChatScreen.kt`, `CoachChatViewModel.kt` |
| Multi-Universe | `CoachChatScreen.kt` → `runMultiUniverseSimulation()` |
| Photo Upload | `EditProfileViewModel.kt`, `ImageModerationService.kt` |
| Analytics | `AnalyticsService.kt` |

### Common Tasks
```bash
# View logs
adb logcat | grep -i "coach\|discovery\|error"

# Test specific CF
# In CoachChatViewModel, uncomment test call

# Create test data
cd /Users/daniel/IdeaProjects/Public-BlackSugar21/scripts
node test-system-unified.js
# Option 2: Create 5-10 matches
# Option 5: Create 20-30 discovery

# Run tests
./gradlew testDebug

# Build release
./gradlew bundleRelease --no-build-cache
```

### Troubleshooting
```bash
# Clean build
./gradlew clean && ./gradlew assembleDebug

# Check dependencies
./gradlew dependencies --configuration debugRuntimeClasspath | grep -i firebase

# View Firestore rules
firebase firestore:rules:view
```

---

## 🍎 iOS Quickstart

### Environment Setup
```bash
# 1. Open project
open /Users/daniel/AndroidStudioProjects/iOS/black-sugar-21.xcodeproj

# 2. Select scheme
# Select "black-sugar-21" scheme, simulator "iPhone 17 Pro"

# 3. Build (⌘B)
# Expected: "Build Succeeded"
```

### First Run
```bash
# 1. Run app (⌘R)
# App should launch in simulator

# 2. View logs
# Xcode → View → Debug Area → Show Debug Output (⌘⇧Y)

# 3. Filter logs
# Input: [app name] or [Coach] or [Discovery]
```

### Key Files to Know
| Task | File |
|------|------|
| Swipes/Discovery | `ProfileCardRepository.swift`, `HomeViewModel.swift` |
| Messages | `ChatViewModel.swift`, `FirestoreRemoteDataSource.swift` |
| Coach IA | `CoachChatView.swift`, `CoachChatViewModel.swift` |
| Multi-Universe | `CoachChatView.swift` → `runMultiUniverseSimulation()` |
| Photo Upload | `EditProfileView.swift`, `ImageModerationService.swift` |
| Analytics | `AnalyticsService.swift` |

### Common Tasks
```bash
# Clear data
# iOS Simulator → Device → Erase All Content and Settings

# View logs
# Xcode → Output → Filter text to [Coach] or [Discovery]

# Test cloud function
# In CoachChatViewModel, uncomment test call

# Create test data
cd /Users/daniel/IdeaProjects/Public-BlackSugar21/scripts
node test-system-unified.js
# Option 2: Create 5-10 matches
# Option 5: Create 20-30 discovery

# Run unit tests
⌘U (or Xcode → Product → Test)
```

### Troubleshooting
```bash
# Clean build
⌘⇧K (Product → Clean Build Folder)
⌘B (rebuild)

# Pod issues
cd /Users/daniel/AndroidStudioProjects/iOS
pod repo update
pod install

# Check Firebase config
grep -r "projectId" . --include="*.swift" | head -1
```

---

## 🌐 Web (Angular) Quickstart

### Environment Setup
```bash
# 1. Go to project
cd /Users/daniel/IdeaProjects/Public-BlackSugar21

# 2. Install dependencies
npm install

# 3. Start dev server
npm start
# Opens http://localhost:4200 automatically
```

### First Run
```bash
# 1. Dev server running
# Ctrl+C to stop

# 2. Open browser
open http://localhost:4200

# 3. Open dev tools (F12)
# Console should show "Angular is running" message
```

### Key Files to Know
| Task | File |
|------|------|
| Components | `src/app/` (standalone components) |
| Services | `src/app/services/` |
| Routing | `src/app/app.routes.ts` |
| Firestore | `data/datasource/FirestoreRemoteDataSource.ts` |
| Testing | `scripts/test-system-unified.js` |
| Deployment | `firebase.json`, `deploy.sh` |

### Common Tasks
```bash
# Build production
npm run build:prod
# Output: dist/public-black-sugar21/browser/

# Deploy to Firebase
firebase deploy --only hosting

# Run tests
npm test

# Create test data
cd scripts
node test-system-unified.js
# Option 2: Create 5-10 matches
# Option 5: Create 20-30 discovery
```

### Troubleshooting
```bash
# Clear cache
rm -rf .angular node_modules dist
npm install

# Check Firebase config
grep -r "projectId" src/app/ --include="*.ts" | head -1

# Port already in use
lsof -i :4200
kill -9 <PID>
npm start
```

---

## 🧪 Testing System Quickstart

### Setup
```bash
# 1. Go to scripts
cd /Users/daniel/IdeaProjects/Public-BlackSugar21/scripts

# 2. Run unified testing system
node test-system-unified.js

# 3. Select user (Daniel or Rosita)
# Follow interactive menu
```

### Quick Commands
```bash
# Create test matches
# Option 2 → enter 5-10 → confirm

# Create discovery profiles
# Option 5 → enter 20-30 → confirm

# Verify system
# Option 7 → see statistics

# Cleanup
# Option 9 → confirm deletion
```

### Test Accounts
```
Daniel:
  UID: sU8xLiwQWNXmbYdR63p1uO6TSm72
  Role: Test user (create matches, has discovery)

Rosita:
  UID: DsDSK5xqEZZXAIKxtIKyBGntw8f2
  Role: Test user (alternative account)

Test Matches:
  Email: test_match_*@bstest.com
  Password: Test1234!

Discovery Profiles:
  Email: discovery_*@bstest-discovery.com
  Password: Test1234!
```

### Typical Workflow
```bash
# 1. Setup (do once)
node test-system-unified.js
# Option 7 (verify) → should show 0 users
# Option 2 (create 5 matches)
# Option 5 (create 20 discovery)
# Option 7 (verify) → should show 5 matches + 20 discovery

# 2. Development testing
# Run app, interact with matches/discovery

# 3. Reorder test
# node test-system-unified.js
# Option 3 (send message to match 5)
# Watch app → match should move to #1

# 4. Cleanup (when done)
# Option 9 (complete cleanup)
```

---

## 🚀 Deployment Quickstart

### Android to Play Store
```bash
cd /Users/daniel/AndroidStudioProjects/BlackSugar212

# 1. Generate release notes
git log <last-tag>..HEAD --oneline -15

# 2. Deploy
/deploy-full.sh --no-auto-notes --skip-validation

# 3. Monitor
firebase functions:log --only getDiscoveryFeed,dateCoachChat

# 4. Verify
# Play Console → Internal Testing → Version appears in 30min
```

### iOS to TestFlight
```bash
cd /Users/daniel/AndroidStudioProjects/iOS

# 1. Deploy
./deploy-testflight.sh

# 2. Monitor
firebase functions:log --only getDiscoveryFeed,dateCoachChat

# 3. Verify
# TestFlight → Build appears in ~15min
# Testers can install after it processes
```

### Web to Firebase Hosting
```bash
cd /Users/daniel/IdeaProjects/Public-BlackSugar21

# 1. Build
npm run build:prod

# 2. Deploy
npm run deploy:hosting

# 3. Verify
open https://black-sugar21.web.app
```

---

## 💡 Pro Tips

### Android
- Use `adb logcat -c` to clear logs before testing
- Emulator slower? Use physical device
- "Gradle sync failed"? Try `./gradlew --stop`

### iOS
- Always clean before building (`⌘⇧K`)
- Simulator slow? Close other apps
- Pod issues? `pod repo update && pod install`

### Web
- Dev server auto-reloads on file save
- Use Angular DevTools extension (Chrome)
- Build takes 30-60s (first time slower)

### Testing
- Always verify system before creating data (Option 7)
- Use selective cleanup (Option 8) to preserve specific scenarios
- Multi-user testing: run script twice (Option 10 to switch)

---

## 🆘 Getting Help

1. **For Android issues**: See `blacksugar-android` skill
2. **For iOS issues**: See `blacksugar-ios` skill  
3. **For web issues**: See `blacksugar-web-development` skill
4. **For testing issues**: See `blacksugar-testing-system` skill
5. **For cross-platform alignment**: See `CROSS_PLATFORM_ALIGNMENT.md`
6. **For modern features**: See `MODERN_FEATURES_GUIDE.md`

---

**Last Updated:** 2026-04-16  
**Next Review:** After next release
