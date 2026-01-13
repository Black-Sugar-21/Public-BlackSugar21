# BlackSugar21 - Complete Skills Guide
**Multi-Platform Dating Application**

## Overview
Este documento proporciona una guía completa de las GitHub Skills optimizadas para las tres plataformas de BlackSugar21. Use esta guía para trabajar eficientemente con iOS, Android y Web.

## Platform Skills

### 1. iOS Skill
**File**: `/Users/daniel/AndroidStudioProjects/iOS/.github/skills/blacksugar-ios/SKILL.md`
- **Architecture**: MVVM + SwiftUI
- **Language**: Swift 5.9+
- **Min iOS**: 16.0
- **Key Technologies**: Swift Concurrency, Firebase, Gemini AI
- **Build System**: Xcode + Swift Package Manager

### 2. Android Skill
**File**: `/Users/daniel/AndroidStudioProjects/BlackSugar212/.github/skills/blacksugar-android/SKILL.md`
- **Architecture**: MVVM + Clean Architecture  
- **Language**: Kotlin
- **Min SDK**: 33 (Android 13)
- **Key Technologies**: Jetpack Compose, Hilt, Firebase, Gemini AI
- **Build System**: Gradle KTS

### 3. Web Skill
**File**: `/Users/daniel/IdeaProjects/Public-BlackSugar21/.github/skills/blacksugar-web/SKILL.md`
- **Framework**: Angular 21 (Standalone Components)
- **Language**: TypeScript 5.9+
- **Key Technologies**: Firebase Hosting, RxJS, Admin Scripts
- **Build System**: Angular CLI + esbuild

## Shared Infrastructure

### Firebase Backend (All Platforms)
```
Project: black-sugar21
- Firestore Database
- Authentication
- Storage
- Analytics + BigQuery
- Cloud Functions
- Firebase Hosting (Web)
```

### Test Data System (All Platforms)

#### Main Test User
- **UID**: `DsDSK5xqEZZXAIKxtIKyBGntw8f2`
- **Name**: Rosita
- **Purpose**: Primary user with 20+ matches for testing

#### Match Test Users (20)
- **Emails**: `test1@bstest.com` to `test20@bstest.com`
- **Password**: `Test123!`
- **Features**: Each has 1 avatar, matches with main user
- **Flag**: `isTestUser = true`

#### Discovery Profiles (30)
- **Emails**: `discovery1@bstest-discovery.com` to `discovery30@bstest-discovery.com`
- **Password**: `Test123!`
- **Features**: Each has 5 photos (150 total), realistic profiles
- **Flag**: `isDiscoveryProfile = true`
- **Locations**: CDMX neighborhoods

### Image Assets
- **Source**: RandomUser.me CDN (https://randomuser.me/api/portraits/)
- **Format**: JPG, 512x512px
- **Total**: 170 images (20 single avatars + 150 photos for discovery)
- **Config**: `scripts/test-avatars-urls.json`

## Cross-Platform Scripts

### Location
`/Users/daniel/IdeaProjects/Public-BlackSugar21/scripts/`

### Essential Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `populate-test-matches.js` | Create 20 match users | `node populate-test-matches.js` |
| `populate-discovery-profiles.js` | Create 30 discovery profiles | `node populate-discovery-profiles.js` |
| `cleanup-test-matches.js` | Remove match test users | `node cleanup-test-matches.js` |
| `cleanup-discovery-profiles.js` | Remove discovery profiles | `node cleanup-discovery-profiles.js` |
| `verify-test-data.js` | Verify complete system | `node verify-test-data.js` |
| `setup-test-data.js` | Complete setup | `node setup-test-data.js` |
| `check-matches.js` | Debug matches | `node check-matches.js` |
| `get-user-email.js` | Lookup user email | `node get-user-email.js <uid>` |

### Quick Test Data Setup
```bash
cd ~/IdeaProjects/Public-BlackSugar21/scripts

# Complete setup
echo "y" | node cleanup-test-matches.js
echo "y" | node cleanup-discovery-profiles.js
node populate-test-matches.js
node populate-discovery-profiles.js
node verify-test-data.js
```

## Development Workflows

### iOS Development Workflow
```bash
# Build for simulator
cd ~/AndroidStudioProjects/iOS
xcodebuild -project black-sugar-21.xcodeproj \
  -scheme black-sugar-21 \
  -sdk iphonesimulator \
  -configuration Debug \
  clean build

# Run on simulator
open -a Simulator
xcrun simctl install booted "DerivedData/.../Black Sugar.app"
xcrun simctl launch booted com.blacksugar.black-sugar-21

# View logs
xcrun simctl spawn booted log stream --level debug
```

### Android Development Workflow
```bash
# Build APK
cd ~/AndroidStudioProjects/BlackSugar212
./gradlew clean assembleDebug

# Install on device
adb devices
adb install app/build/outputs/apk/debug/app-debug.apk

# View logs
adb logcat | grep -i "BlackSugar\|Firestore"

# Clear app data
adb shell pm clear com.black.sugar21
```

### Web Development Workflow
```bash
# Start dev server
cd ~/IdeaProjects/Public-BlackSugar21
npm start  # localhost:4200

# Build for production
npm run build

# Deploy to Firebase
firebase deploy --only hosting

# Or use script
sh deploy.sh
```

## Testing Scenarios (All Platforms)

### Scenario 1: Match List Testing
**Objective**: Verify match list displays correctly with avatars

**Steps**:
1. Login with main user (Rosita)
2. Navigate to Matches/Chat tab
3. Should see 20+ matches with avatars loading
4. Open a conversation
5. Send a test message
6. Verify real-time updates

**Expected Results**:
- All 20+ matches visible
- Avatars load from RandomUser.me
- Names and last messages display
- Unread indicators show correctly
- Chat opens successfully

### Scenario 2: Discovery/Swipe Testing
**Objective**: Test profile discovery with multiple photos

**Steps**:
1. Login with main user
2. Navigate to Home/Swipe/Discovery view
3. Should see profiles with 5 photos each
4. Swipe through photos on each profile
5. Swipe left/right on profiles
6. Verify photo indicators

**Expected Results**:
- 30 discovery profiles available
- Each profile has 5 navigable photos
- Photo carousel/pager works smoothly
- Like/dislike gestures work
- All 150 images load correctly

### Scenario 3: Multi-Account Testing
**Objective**: Test with different accounts

**Steps**:
1. Logout from main user
2. Login with `test5@bstest.com` / `Test123!`
3. Check profile data
4. Verify matches from this user's perspective
5. Test chat functionality

**Expected Results**:
- Login succeeds with test account
- User's own matches display
- Can send/receive messages
- Profile data correct

### Scenario 4: AI Features Testing
**Objective**: Verify AI services integration

**Steps**:
1. Open a chat conversation
2. Trigger AI Wingman for suggestions
3. Send multiple messages
4. Check Chemistry Detector score
5. Test Dating Coach advice

**Expected Results**:
- Smart reply suggestions appear
- Chemistry score calculates
- Coach advice relevant to context
- No API errors in console/logs

## Common Issues Across Platforms

### Issue: Images Not Loading
**Symptoms**: Blank avatars, no profile photos
**Causes**: 
- Network connectivity
- RandomUser.me CDN unreachable
- CORS issues (web)
- Permissions (iOS/Android)

**Solutions**:
- **iOS**: Check Info.plist for NSAppTransportSecurity
- **Android**: Verify INTERNET permission in AndroidManifest.xml
- **Web**: Check browser console for CORS errors
- **All**: Test URLs directly: `curl https://randomuser.me/api/portraits/men/1.jpg`

### Issue: No Test Data Appearing
**Symptoms**: Empty matches, no discovery profiles
**Causes**:
- Test data not created
- Wrong user logged in
- Firestore queries filtering data
- Data flags incorrect

**Solutions**:
```bash
# Verify test data exists
cd ~/IdeaProjects/Public-BlackSugar21/scripts
node verify-test-data.js

# Should output:
# ✅ 20 match users
# ✅ 30 discovery profiles  
# ✅ 150 photos
# ✅ 50 users in Auth
```

### Issue: Firebase Authentication Fails
**Symptoms**: Login errors, user not found
**Causes**:
- Wrong credentials
- Firebase config incorrect
- Test user doesn't exist

**Solutions**:
- Verify credentials: `test1@bstest.com` / `Test123!`
- Check Firebase Console Authentication tab
- Verify GoogleService-Info.plist (iOS) or google-services.json (Android)
- Check firebase.json and environment configs (Web)

### Issue: Build Failures
**Symptoms**: Compilation errors, dependency conflicts

**Solutions**:
- **iOS**: Clean build folder (⌘ + Shift + K), delete DerivedData
- **Android**: `./gradlew clean`, invalidate caches
- **Web**: `rm -rf node_modules && npm install`
- Check API keys in local.properties / environment files

## API Keys & Configuration

### Required Keys

**Gemini AI** (iOS & Android)
- Get key from: https://makersuite.google.com/app/apikey
- iOS: Add to project secrets or config
- Android: Add to `local.properties`: `GEMINI_API_KEY=your_key`
- Web: Environment variables

**Firebase**
- iOS: `GoogleService-Info.plist`
- Android: `app/google-services.json`
- Web: `src/environments/environment.ts`

**Service Account** (Scripts)
- Location: `scripts/serviceAccountKey.json`
- Get from: Firebase Console > Project Settings > Service Accounts
- Permissions: Firebase Admin SDK

## Performance Benchmarks

### Expected Performance

| Metric | iOS | Android | Web |
|--------|-----|---------|-----|
| Cold Start | < 3s | < 2s | < 1s |
| Image Load | < 500ms | < 500ms | < 300ms |
| Match List | < 1s | < 1s | < 800ms |
| Chat Open | < 500ms | < 500ms | < 400ms |
| AI Response | 2-5s | 2-5s | 2-5s |

### Optimization Tips

**Image Loading**
- Use lazy loading for lists
- Implement caching (SDWebImage, Coil, browser cache)
- Consider image size optimization
- Paginate discovery profiles

**Firestore Queries**
- Use proper indexes (firestore.indexes.json)
- Limit query results (.limit(20))
- Implement pagination
- Cache frequently accessed data

**AI Services**
- Cache AI responses when appropriate
- Implement request debouncing
- Show loading indicators
- Handle timeouts gracefully

## Deployment

### iOS Deployment
```bash
# TestFlight
# 1. Archive in Xcode
# 2. Distribute to App Store Connect
# 3. Add testers in App Store Connect
# 4. Testers receive email invitation
```

### Android Deployment
```bash
# Firebase App Distribution
./deploy-android.sh

# Or manual
./gradlew assembleRelease
# Upload to Firebase Console > App Distribution
```

### Web Deployment
```bash
# Firebase Hosting
npm run build
firebase deploy --only hosting

# Or script
sh deploy.sh
```

## Monitoring & Analytics

### Firebase Analytics Events
- `screen_view`: Track page/screen views
- `user_engagement`: Track active usage
- `match_created`: New match event
- `message_sent`: Chat activity
- `swipe_left/right`: Discovery interaction
- `ai_suggestion_used`: AI feature usage

### BigQuery Integration
- Data automatically exported to BigQuery
- Query from: Firebase Console > Analytics > BigQuery
- Use for advanced analytics and reporting

### Error Monitoring
- Check Firebase Crashlytics for crash reports
- Monitor Cloud Functions logs
- Review app logs (logcat, Xcode console, browser devtools)

## Support & Resources

### Documentation Locations
- iOS Skill: `/Users/daniel/AndroidStudioProjects/iOS/.github/skills/blacksugar-ios/SKILL.md`
- Android Skill: `/Users/daniel/AndroidStudioProjects/BlackSugar212/.github/skills/blacksugar-android/SKILL.md`
- Web Skill: `/Users/daniel/IdeaProjects/Public-BlackSugar21/.github/skills/blacksugar-web/SKILL.md`

### Project Repositories
- iOS: `/Users/daniel/AndroidStudioProjects/iOS`
- Android: `/Users/daniel/AndroidStudioProjects/BlackSugar212`
- Web: `/Users/daniel/IdeaProjects/Public-BlackSugar21`

### Firebase Console
- URL: https://console.firebase.google.com/project/black-sugar21
- Authentication: /authentication/users
- Firestore: /firestore/data
- Storage: /storage
- Analytics: /analytics
- Hosting: /hosting

---

**Last Updated**: January 9, 2026
**Status**: Active Development
**Platforms**: iOS 16+, Android 13+, Web (Modern Browsers)
**Backend**: Firebase
**AI Provider**: Google Gemini 2.0 Flash
