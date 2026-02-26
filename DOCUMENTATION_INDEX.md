# BlackSugar21 - Unified Documentation Index

> **📢 IMPORTANTE**: La documentación ha sido consolidada en GitHub Skills (15 de enero de 2026)  
> **Ver**: [DOCUMENTATION_CONSOLIDATION_SUMMARY.md](DOCUMENTATION_CONSOLIDATION_SUMMARY.md) para detalles completos

---

## 🎯 GitHub Skills - Única Fuente de Verdad

Toda la documentación principal está consolidada en los archivos **SKILL.md**:

### 1. 🤖 Android Development
**Location**: `BlackSugar212/.github/skills/blacksugar-android/SKILL.md`
- **Framework**: Kotlin, Jetpack Compose, MVVM
- **Topics**: 
  - Architecture & Project Structure
  - AI Features (Gemini 2.0 Flash)
  - Analytics & Tracking System ✨ **NUEVO**
  - Deployment Guide (Firebase App Distribution) ✨ **NUEVO**
  - Firebase Integration & Remote Config ✨ **NUEVO**
  - Testing, Build & Release
  
### 2. 🍎 iOS Development
**Location**: `iOS/.github/skills/blacksugar-ios/SKILL.md`
- **Framework**: Swift, SwiftUI, MVVM
- **Topics**: 
  - Architecture & Project Structure
  - AI Features (Gemini 2.0 Flash)
  - SwiftUI Patterns
  - TestFlight Deployment
  - Firebase Integration
  - Testing & Build

### 3. 🌐 Web Development
**Location**: `Public-BlackSugar21/.github/skills/blacksugar-web/SKILL.md`
- **Framework**: Angular 21, TypeScript
- **Topics**: 
  - Standalone Components
  - Firebase Hosting & Firestore
  - RxJS Patterns
  - Admin Scripts
  - Test Data System
  - Deployment Workflows

### 4. 🧪 Testing System (Unified)
**Location**: `Public-BlackSugar21/.github/skills/blacksugar-testing/SKILL.md`
- **Sistema Maestro Consolidado**
- **Topics**: 
  - Match Management
  - Discovery Profiles Generation
  - Verification & Diagnostics
  - Selective Cleanup
  - Multi-User Support (Daniel/Rosita)
  - Real-time Testing

### 5. 🌍 Public Repository
**Location**: `Public-BlackSugar21/.github/skills/blacksugar-public/SKILL.md`
- **Sitio Web Público**
- **Topics**: 
  - Landing Pages (Multi-idioma: es/en/pt)
  - Legal Policies (Terms, Privacy, Data Deletion)
  - Corporate Documentation
  - Firebase Hosting
  - Multi-language Support

---

## 📊 Documentation Consolidation

**Fecha**: 15 de enero de 2026  
**Archivos eliminados**: ~60 archivos (25% reducción)  
**Beneficios**: 
- ✅ Única fuente de verdad
- ✅ Sin duplicados
- ✅ Mantenimiento simplificado
- ✅ Mejor descubribilidad

**Ver detalles completos**: [DOCUMENTATION_CONSOLIDATION_SUMMARY.md](DOCUMENTATION_CONSOLIDATION_SUMMARY.md)

---

## 📚 Main Documentation

### GitHub Skills (Primary Documentation)
- [Android Development SKILL](../../../AndroidStudioProjects/BlackSugar212/.github/skills/blacksugar-android/SKILL.md) - Kotlin/Compose/Firebase
- [iOS Development SKILL](../../../AndroidStudioProjects/iOS/.github/skills/blacksugar-ios/SKILL.md) - Swift/SwiftUI/Firebase
- [Web Development SKILL](.github/skills/blacksugar-web/SKILL.md) - Angular 21/Firebase Hosting
- [Testing System SKILL](.github/skills/blacksugar-testing/SKILL.md) - Unified Test Data Management
- [Public Repository SKILL](.github/skills/blacksugar-public/SKILL.md) - Landing & Legal Pages

### Project READMEs
- [Android README](../../../AndroidStudioProjects/BlackSugar212/README.md) - Overview & Quick Start
- [iOS README](../../../AndroidStudioProjects/iOS/README.md) - Overview & Quick Start
- [Web/Public README](README.md) - Overview & Quick Start

## 🚀 Quick Start

### Development Server
```bash
npm start                    # http://localhost:4200
npm run build                # Production build
npm test                     # Run tests
```

### Deployment
```bash
firebase deploy --only hosting
# Or use deploy script
sh deploy.sh
```

### Test Accounts
```
Main User (Rosita):
- UID: DsDSK5xqEZZXAIKxtIKyBGntw8f2

Match Test Users:
- test1@bstest.com to test20@bstest.com
- Password: Test123!

Discovery Profiles:
- discovery1@bstest-discovery.com to discovery30@bstest-discovery.com
- Password: Test123!
```

## 📦 Test Data Management Scripts

**Location**: `scripts/`

### Core Scripts

| Script | Purpose | Command |
|--------|---------|---------|
| `populate-test-matches.js` | Create 20 match users | `node scripts/populate-test-matches.js` |
| `populate-discovery-profiles.js` | Create 30 discovery profiles (5 photos each) | `node scripts/populate-discovery-profiles.js` |
| `cleanup-test-matches.js` | Remove match test users | `node scripts/cleanup-test-matches.js` |
| `cleanup-discovery-profiles.js` | Remove discovery profiles | `node scripts/cleanup-discovery-profiles.js` |
| `verify-test-data.js` | Verify system status | `node scripts/verify-test-data.js` |
| `setup-test-data.js` | Complete setup workflow | `node scripts/setup-test-data.js` |

### Utility Scripts

| Script | Purpose | Command |
|--------|---------|---------|
| `check-matches.js` | Debug match data | `node scripts/check-matches.js` |
| `clean-orphan-matches.js` | Remove orphaned matches | `node scripts/clean-orphan-matches.js` |
| `debug-matches-users.js` | Debug match relationships | `node scripts/debug-matches-users.js` |
| `get-user-email.js` | Lookup user by UID | `node scripts/get-user-email.js <userId>` |
| `fix-test-users-male-field.js` | Fix gender field issues | `node scripts/fix-test-users-male-field.js` |

### Quick Setup
```bash
cd scripts

# Complete reset and setup
echo "y" | node cleanup-test-matches.js
echo "y" | node cleanup-discovery-profiles.js
node populate-test-matches.js
node populate-discovery-profiles.js
node verify-test-data.js
```

## 🔧 Common Commands

### Development
```bash
npm start                    # Dev server (port 4200)
npm run build                # Production build
npm run watch                # Build with watch mode
npm test                     # Run tests
npm run lint                 # Lint check
```

### Firebase Operations
```bash
# Deploy
firebase deploy --only hosting
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy                # Deploy all

# Login & Setup
firebase login
firebase use black-sugar21
firebase projects:list
```

### Script Operations
```bash
cd scripts

# Test Data
node populate-test-matches.js
node populate-discovery-profiles.js
node verify-test-data.js

# Cleanup
node cleanup-test-matches.js
node cleanup-discovery-profiles.js

# Debugging
node check-matches.js
node get-user-email.js <userId>
```

## 📖 Project Structure

```
Public-BlackSugar21/
├── src/
│   ├── app/                 # Angular application
│   │   ├── components/      # UI components
│   │   ├── services/        # Business logic
│   │   ├── models/          # Data models
│   │   └── guards/          # Route guards
│   ├── environments/        # Environment configs
│   └── styles.css          # Global styles
├── scripts/                 # Node.js utilities
│   ├── serviceAccountKey.json  # Firebase Admin SDK (git-ignored)
│   ├── test-avatars-urls.json  # Avatar URLs configuration
│   └── *.js                # Management scripts
├── public/                  # Static files
├── firebase.json           # Firebase hosting config
├── firestore.rules         # Security rules
├── firestore.indexes.json  # Database indexes
└── package.json            # Dependencies
```

## 🗄️ Test Data System

### Data Overview
- **Match Users**: 20 users with single avatars
- **Discovery Profiles**: 30 users with 5 photos each
- **Total Images**: 170 (20 + 150)
- **Image Source**: RandomUser.me CDN
- **Total Matches**: 20+ (with main user)

### Firebase Collections

**users collection**
```typescript
{
  userId: string
  name: string
  email: string
  gender: 'Hombre' | 'Mujer'
  userType: 'SUGAR_BABY' | 'SUGAR_DADDY' | 'SUGAR_MOMMY'
  avatarUrl?: string           // Single avatar (match users)
  pictureUrls?: string[]       // Multiple photos (discovery)
  isTestUser?: boolean         // Match test flag
  isDiscoveryProfile?: boolean // Discovery flag
  location: { latitude, longitude, address }
}
```

**matches collection**
```typescript
{
  matchId: string
  user1Id: string
  user2Id: string
  timestamp: Timestamp
  unread: boolean
  lastMessage?: string
  lastMessageTime?: Timestamp
}
```

## 🐛 Troubleshooting

### Scripts Fail with Auth Error
```bash
# Verify serviceAccountKey.json exists
ls scripts/serviceAccountKey.json

# Check permissions
chmod 600 scripts/serviceAccountKey.json
```

### Images Not Loading
- Check internet connection
- Verify test-avatars-urls.json
- Test URLs in browser
- Check CORS in browser console

### Deploy Fails
```bash
# Reinstall Firebase CLI
npm install -g firebase-tools

# Re-login
firebase login

# Select project
firebase use black-sugar21

# Try again
firebase deploy
```

### Too Many Test Users
```bash
# Complete cleanup
cd scripts
echo "y" | node cleanup-test-matches.js
echo "y" | node cleanup-discovery-profiles.js
node verify-test-data.js  # Should show 0 users
```

## 🚀 Deployment

### Firebase Hosting
```bash
# Build production
npm run build

# Deploy
firebase deploy --only hosting

# Output location
dist/public-black-sugar21/browser/
```

### Custom Deploy Script
```bash
sh deploy.sh
# Handles: build + deploy + verification
```

## 📊 Monitoring

### Firebase Console
- **URL**: https://console.firebase.google.com/project/black-sugar21
- **Authentication**: /authentication/users
- **Firestore**: /firestore/data
- **Storage**: /storage
- **Hosting**: /hosting
- **Analytics**: /analytics

### Logs
- Script logs: `scripts/cleanup-log-*.txt`
- Firebase logs: `firebase functions:log`

## 📞 Support & Resources

### Documentation
- [SKILL.md](.github/skills/blacksugar-web/SKILL.md) - Web development guide
- [SKILLS_COMPLETE_GUIDE.md](SKILLS_COMPLETE_GUIDE.md) - Multi-platform guide
- [scripts/README.md](scripts/README.md) - Scripts documentation
- [scripts/QUICKSTART.md](scripts/QUICKSTART.md) - Quick start guide

### Related Projects
- iOS: `/Users/daniel/AndroidStudioProjects/iOS`
- Android: `/Users/daniel/AndroidStudioProjects/BlackSugar212`

### External Resources
- Angular Docs: https://angular.io/docs
- Firebase Docs: https://firebase.google.com/docs
- RandomUser API: https://randomuser.me/documentation

---
**Last Updated**: January 9, 2026  
**Framework**: Angular 21  
**Status**: Active Development
