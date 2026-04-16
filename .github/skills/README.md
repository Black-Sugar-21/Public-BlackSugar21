# 🤖 BlackSugar21 Agent Skills — Central Hub

Master guide for all development skills in BlackSugar21. These skills provide AI agents (Claude, Copilot) with specialized knowledge for each platform and subsystem.

---

## 📚 Available Skills (5 Core + 3 Bundled Guides)

### Core Platform Skills

| Skill | Purpose | Use When |
|-------|---------|----------|
| **[blacksugar-public](blacksugar-public/SKILL.md)** | Public website, legal pages, landing pages | Working with public content, terms/privacy, Firebase Hosting |
| **[blacksugar-web-development](blacksugar-web/SKILL.md)** | Angular 21 web development | Building features, testing, deployment workflows |
| **[blacksugar-android](blacksugar-android/SKILL.md)** | Kotlin/Compose development | Android app, Firestore, Cloud Functions, AppCheck |
| **[blacksugar-ios](blacksugar-ios/SKILL.md)** | Swift/SwiftUI development | iOS app, Firestore, Cloud Functions, AppCheck |
| **[blacksugar-testing-system](blacksugar-testing/SKILL.md)** | Unified test data management | Creating test data, debugging, cleanup |

### Bundled Guides (2026-04-16)

| Guide | Purpose | Read When |
|-------|---------|-----------|
| **[QUICKSTART_BY_PLATFORM.md](QUICKSTART_BY_PLATFORM.md)** | 5-minute setup for each platform | First time setup or quick refresh |
| **[MODERN_FEATURES_GUIDE.md](MODERN_FEATURES_GUIDE.md)** | V2 Discovery, Hang the DJ, Coach IA + RAG | Understanding latest architecture |
| **[CROSS_PLATFORM_ALIGNMENT.md](CROSS_PLATFORM_ALIGNMENT.md)** | iOS ↔ Android parity checklist | Before release or verifying alignment |

---

## 🚀 Quick Start (5 Minutes)

### 1️⃣ Choose Your Platform
- **Android?** → [Android QUICKSTART](QUICKSTART_BY_PLATFORM.md#-android-quickstart)
- **iOS?** → [iOS QUICKSTART](QUICKSTART_BY_PLATFORM.md#-ios-quickstart)
- **Web?** → [Web QUICKSTART](QUICKSTART_BY_PLATFORM.md#--web-angular-quickstart)
- **Testing?** → [Testing QUICKSTART](QUICKSTART_BY_PLATFORM.md#-testing-system-quickstart)

### 2️⃣ Create Test Data
```bash
cd /Users/daniel/IdeaProjects/Public-BlackSugar21/scripts
node test-system-unified.js
# Option 2: Create 5-10 matches
# Option 5: Create 20-30 discovery profiles
```

### 3️⃣ Understand Modern Features
- 🎬 **Multi-Universe Simulator** → [See guide](MODERN_FEATURES_GUIDE.md#1-multi-universe-simulator-hang-the-dj)
- 🔍 **Discovery V2** → [See guide](MODERN_FEATURES_GUIDE.md#2-discovery-v2-nuevas-queries)
- 🧠 **Coach IA + RAG** → [See guide](MODERN_FEATURES_GUIDE.md#3-coach-ia--rag-knowledge-base)

---

## 🗂️ Skill Structure

```
.github/skills/
├── README.md                           # THIS FILE
├── QUICKSTART_BY_PLATFORM.md           # Quick setup guides (NEW)
├── MODERN_FEATURES_GUIDE.md            # Latest architecture (NEW)
├── CROSS_PLATFORM_ALIGNMENT.md         # iOS ↔ Android checklist (NEW)
│
├── blacksugar-public/
│   └── SKILL.md                        # Public website + legal pages
├── blacksugar-web/
│   └── SKILL.md                        # Angular 21 web development
├── blacksugar-testing/
│   └── SKILL.md                        # Unified test system
├── blacksugar-ios/
│   └── SKILL.md                        # iOS Swift/SwiftUI
└── blacksugar-android/
    └── SKILL.md                        # Android Kotlin/Compose
```

---

## 📖 Skill Descriptions (How Claude Recognizes Them)

### blacksugar-android
> Expert Kotlin/Jetpack Compose development for BlackSugar21 Android app. Use WHENEVER working with: Android codebase, Firestore operations, Firebase Analytics/Remote Config, phone authentication, swipes/stories/matches, Cloud Functions integration, AppCheck PlayIntegrity, or Android↔iOS homologation.

### blacksugar-ios
> Expert Swift/SwiftUI development for BlackSugar21 iOS app. Use WHENEVER working with: iOS codebase, Firestore operations, Firebase Analytics/Remote Config, phone authentication, swipes/stories/matches, Cloud Functions integration, AppCheck DeviceCheck/AppAttest, or iOS↔Android homologation.

### blacksugar-web-development
> Expert Angular 21 web development for BlackSugar21 public/admin application. Use WHENEVER working with: public website, Angular standalone components, TypeScript/RxJS patterns, Firebase Hosting/Firestore operations, admin scripts, data population, testing workflows, or deployment issues.

### blacksugar-public
> Expert guide for BlackSugar21 Public Repository (Angular 21 + Firebase Hosting). Use WHENEVER working with: public-facing website, legal pages (terms/privacy/data deletion), multi-language content (ES/EN/PT), Firebase Hosting deployment, admin scripts, unified testing system, or data management for development.

### blacksugar-testing-system
> Unified test data management system for BlackSugar21 (replaces 19+ legacy scripts). Use WHENEVER: populating test data, creating matches/discovery profiles, verifying match ordering, selective cleanup, multi-user testing, or debugging match/discovery issues.

---

## 🔑 Key Concepts

### Data Models
- **User**: `orientation` (men/women/both), `userType` (ELITE/ELITE/PRIME), `g` (geohash), `fcmToken`
- **Message**: `type` (text/place/ephemeral), `isEphemeral` (always include)
- **Match**: `lastMessageSeq`, `lastMessageTimestamp`, sorted by timestamp DESC then seq DESC

### Cloud Functions (33+)
- **Discovery V2**: `getDiscoveryFeed` (9 filters, improved performance)
- **Coach**: `dateCoachChat` (RAG-powered), `generateIcebreakers`, `generateSmartReply`
- **Multi-Universe**: `runMultiUniverseSimulation` (5-stage carousel)
- **Photos**: `analyzePhotoBeforeUpload`, `moderateProfileImage`
- **Stories**: `createStory`, `deleteStory`, `markStoryAsViewed`

### Remote Config (12+ keys)
- `coach_daily_credits` (3 — shared pool)
- `enable_safety_checkin`, `enable_screen_protection`
- `reviewer_uid` (test account with special permissions)

### Languages (10)
English, Spanish, Portuguese, French, German, Japanese, Chinese, Russian, Arabic, Indonesian

---

## ⚠️ Critical Rules (All Platforms)

1. **`"g"` NOT `"geohash"`** — Geohash field is exactly `"g"`
2. **Orientation lowercase** — `"men"` / `"women"` / `"both"`
3. **UserType enum** — Firestore: ELITE/ELITE/PRIME (UI: 💎 Elite / 🌟 Prime)
4. **`isEphemeral: false`** — Include in ALL message types
5. **`fcmToken` camelCase** — Exact field name
6. **Remote Config interval** — 3600 seconds (1 hour)
7. **Reviewer bypass** — Skip location updates, see test profiles

---

## 🎯 Common Tasks

### "I need to build a feature"
1. Identify platform(s): Android / iOS / Web / All three?
2. Read skill: [Android](blacksugar-android/SKILL.md) / [iOS](blacksugar-ios/SKILL.md) / [Web](blacksugar-web/SKILL.md)
3. Find files: Use QUICK REFERENCE section
4. Reference code: Study similar features
5. Test: Create test data, verify on device

### "I found a bug"
1. Identify platform
2. Read relevant skill
3. Search key files using QUICK REFERENCE commands
4. Fix & verify with test data
5. Check [CROSS_PLATFORM_ALIGNMENT.md](CROSS_PLATFORM_ALIGNMENT.md) if multi-platform

### "I need to deploy"
1. Android → [Deploy to Play Store](QUICKSTART_BY_PLATFORM.md#android-to-play-store)
2. iOS → [Deploy to TestFlight](QUICKSTART_BY_PLATFORM.md#ios-to-testflight)
3. Web → [Deploy to Firebase](QUICKSTART_BY_PLATFORM.md#web-to-firebase-hosting)

### "I need test data"
1. Read [Testing QUICKSTART](QUICKSTART_BY_PLATFORM.md#-testing-system-quickstart)
2. Run: `node test-system-unified.js`
3. Use menu options 2, 4, 5, or 7

---

## 📋 Improvement Status (2026-04-16)

✅ **Fase 1: COMPLETE**
- Fixed syntax errors in 3 SKILL.md files
- Improved descriptions with better triggering
- Added Table of Contents to large documents

✅ **Fase 2: COMPLETE**
- Created QUICK REFERENCE cards (Android, iOS, Testing)
- Clarified skill separation (public vs web-development)
- Created bundled guides (MODERN_FEATURES_GUIDE, CROSS_PLATFORM_ALIGNMENT, QUICKSTART)

🟡 **Fase 3: IN PROGRESS**
- [x] Created QUICKSTART_BY_PLATFORM.md
- [x] Created MODERN_FEATURES_GUIDE.md
- [x] Created CROSS_PLATFORM_ALIGNMENT.md
- [ ] Update individual skills with references to modern features

---

## 🔍 Navigation Guide

### By Platform
- **Android** → `blacksugar-android/SKILL.md` + [Android QUICKSTART](QUICKSTART_BY_PLATFORM.md#-android-quickstart)
- **iOS** → `blacksugar-ios/SKILL.md` + [iOS QUICKSTART](QUICKSTART_BY_PLATFORM.md#-ios-quickstart)
- **Web** → `blacksugar-web/SKILL.md` + [Web QUICKSTART](QUICKSTART_BY_PLATFORM.md#--web-angular-quickstart)
- **Testing** → `blacksugar-testing/SKILL.md` + [Testing QUICKSTART](QUICKSTART_BY_PLATFORM.md#-testing-system-quickstart)

### By Feature
- **Discovery** → `getDiscoveryFeed` in platform skill + [V2 Guide](MODERN_FEATURES_GUIDE.md#2-discovery-v2-nuevas-queries)
- **Match List** → See data models in [MODERN_FEATURES_GUIDE.md](MODERN_FEATURES_GUIDE.md)
- **Coach IA** → See [Coach + RAG Guide](MODERN_FEATURES_GUIDE.md#3-coach-ia--rag-knowledge-base)
- **Multi-Universe** → See [Hang the DJ Guide](MODERN_FEATURES_GUIDE.md#1-multi-universe-simulator-hang-the-dj)
- **Photos** → See `moderateProfileImage` in platform skills
- **Cross-platform issues** → [CROSS_PLATFORM_ALIGNMENT.md](CROSS_PLATFORM_ALIGNMENT.md)

---

## 📞 Support & Resources

- **For structure questions** → Read the relevant SKILL.md
- **For quick setup** → Check QUICKSTART_BY_PLATFORM.md
- **For modern features** → See MODERN_FEATURES_GUIDE.md
- **For cross-platform issues** → Use CROSS_PLATFORM_ALIGNMENT.md
- **For code patterns** → Use command snippets in QUICK REFERENCE sections

---

## 🤝 Contributing to Skills

To improve a skill:
1. Edit the SKILL.md file in the relevant directory
2. Update QUICK REFERENCE if needed
3. Test documentation by following the guides
4. Commit: `docs(skill): description of change`

---

**Status**: Production Ready ✅  
**Last Updated**: 2026-04-16  
**Coverage**: 5 core skills + 3 bundled guides  
**Platforms**: Android, iOS, Web, Testing, Cross-platform  
**Languages**: 10 (EN, ES, PT, FR, DE, JA, ZH, RU, AR, ID)
