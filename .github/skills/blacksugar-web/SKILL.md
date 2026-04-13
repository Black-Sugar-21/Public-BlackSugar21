---
name: blacksugar-web-development
description: Comprehensive development guide for BlackSugar21 Web application. Covers Angular 21 standalone components, TypeScript, Firebase Hosting/Firestore, RxJS patterns, admin scripts for data management, and deployment workflows. Use when working with Angular web app, Firebase admin operations, or debugging deployment issues.
---

# BlackSugar21 Web Application Development Skill

## Overview
BlackSugar21 es la aplicación web pública/admin con Angular y Firebase. Esta skill proporciona guía completa para trabajar con el proyecto web.

## Project Context

### Application Details
- **Name**: public-black-sugar21
- **Type**: Web Application (Admin/Public)
- **Framework**: Angular 21
- **Language**: TypeScript 5.9+
- **Hosting**: Firebase Hosting
- **Backend**: Firebase (Firestore, Functions, Auth)

### Technology Stack
- **Frontend**: Angular 21 + Standalone Components
- **Styling**: CSS (Custom)
- **State Management**: RxJS + Services
- **Build Tool**: Angular CLI + esbuild
- **Backend**: Firebase Firestore, Functions, Auth
- **Deployment**: Firebase Hosting
- **Package Manager**: npm 11.6.2

### Key Features
1. **Admin Panel**
   - User management
   - Match monitoring
   - Analytics dashboard
   - Content moderation
   - Reports handling

2. **Public Features**
   - Landing page
   - User authentication
   - Profile management
   - Testing utilities

3. **Scripts & Tools**
   - **Testing System** (see blacksugar-testing skill)
     - Unified test data management
     - Match population and verification
     - Discovery profile generation
     - Selective cleanup operations
   - Firebase admin operations
   - Data migration scripts

## Project Structure

```
Public-BlackSugar21/
├── src/
│   ├── app/
│   │   ├── components/        # UI components
│   │   ├── services/          # Business logic
│   │   ├── models/            # Data models
│   │   ├── guards/            # Route guards
│   │   └── pipes/             # Custom pipes
│   ├── assets/                # Static assets
│   ├── environments/          # Environment configs
│   ├── styles.css            # Global styles
│   └── main.ts               # App bootstrap
├── scripts/                   # Node.js utilities
│   ├── check-matches.js
│   ├── clean-orphan-matches.js
│   ├── cleanup-test-matches.js
│   ├── debug-matches-users.js
│   ├── fix-test-users-male-field.js
│   ├── get-user-email.js
│   ├── populate-test-matches.js
│   ├── QUICKSTART.md
│   └── README.md
├── public/                    # Static files
├── firebase.json              # Firebase config
├── firestore.rules           # Security rules
├── firestore.indexes.json    # Firestore indexes
├── angular.json              # Angular config
├── package.json              # Dependencies
└── tsconfig.json             # TypeScript config
```

## Important Configuration Files

### firebase.json
```json
{
  "hosting": {
    "public": "dist/public-black-sugar21/browser",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{
      "source": "**",
      "destination": "/index.html"
    }]
  }
}
```

## Test Data Management Scripts

### Available Scripts (scripts/ directory)

#### 1. populate-test-matches.js
**Purpose**: Creates 20 test users with matches for testing match list functionality
```bash
cd scripts && node populate-test-matches.js
```
- Creates 20 users (test1@bstest.com - test20@bstest.com)
- Password: Test123!
- Each user has a match with main user (DsDSK5xqEZZXAIKxtIKyBGntw8f2)
- Generates bidirectional matches in Firestore
- Avatars from RandomUser.me API (direct URLs)
- Creates sample messages for each match
- Sets isTestUser flag for easy cleanup

#### 2. populate-discovery-profiles.js
**Purpose**: Creates 30 discovery profiles with 5 photos each for HomeView testing
```bash
cd scripts && node populate-discovery-profiles.js
```
- Creates 30 users (discovery1@bstest-discovery.com - discovery30@bstest-discovery.com)
- Password: Test123!
- Each profile has 5 photos (pictureUrls array)
- Realistic bios, interests, occupations
- Distributed locations across CDMX (Centro, Polanco, Condesa, Roma, etc.)
- Mix of user types: ELITE (💎 Elite), ELITE (💎 Elite), PRIME (🌟 Prime)
- Sets isDiscoveryProfile flag for identification

#### 3. cleanup-test-matches.js
**Purpose**: Removes test users from Firebase Auth and Firestore
```bash
cd scripts && node cleanup-test-matches.js
```
- Searches by email pattern (@bstest.com) and isTestUser flag
- Deletes from both Firebase Auth and Firestore users collection
- Removes associated matches
- Interactive confirmation prompt
- Generates cleanup log file

#### 4. cleanup-discovery-profiles.js
**Purpose**: Removes discovery test profiles
```bash
cd scripts && node cleanup-discovery-profiles.js
```
- Searches by email pattern (@bstest-discovery.com) and isDiscoveryProfile flag
- Deletes from Auth and Firestore
- Interactive confirmation

#### 5. verify-test-data.js
**Purpose**: Comprehensive verification of test data system
```bash
cd scripts && node verify-test-data.js
```
- Counts match users and discovery profiles
- Verifies photos configuration (150 total)
- Checks Firebase Authentication users
- Validates matches in Firestore
- Reports system status (ready/incomplete)

#### 6. setup-test-data.js
**Purpose**: Master script to run complete setup
```bash
cd scripts && node setup-test-data.js
```
- Runs cleanup scripts
- Populates match users
- Populates discovery profiles
- Runs verification

#### 7. check-matches.js
**Purpose**: Debug and inspect match data
```bash
node scripts/check-matches.js
```
- Lists all matches in system
- Shows user details for each match
- Identifies orphaned matches

#### 8. clean-orphan-matches.js
**Purpose**: Removes matches without valid users
```bash
node scripts/clean-orphan-matches.js
```

#### 9. get-user-email.js
**Purpose**: Look up user email by UID
```bash
node scripts/get-user-email.js <userId>
```

### Test Data Configuration

**Main Test User (Rosita)**
- UID: `DsDSK5xqEZZXAIKxtIKyBGntw8f2`
- Has matches with all 20 test users
- Use this account for primary testing

**Match Test Users**
- Emails: test1@bstest.com through test20@bstest.com
- Password: Test123!
- Each has 1 avatar from RandomUser.me
- Flag: isTestUser = true
- Total: 20 users, 20 avatars

**Discovery Profiles**
- Emails: discovery1@bstest-discovery.com through discovery30@bstest-discovery.com
- Password: Test123!
- Each has 5 photos (150 total images)
- Flag: isDiscoveryProfile = true
- Locations: CDMX neighborhoods (Centro, Polanco, Condesa, Roma Norte, etc.)
- Realistic data: bios, interests, occupations

### Avatar URLs Source
**File**: scripts/test-avatars-urls.json
- Contains RandomUser.me CDN URLs
- 10 women avatars
- 10 men avatars
- Used by populate scripts to assign profile photos

### Firebase Collections Structure

**users collection**
```typescript
{
  userId: string,
  name: string,
  email: string,
  gender: 'Hombre' | 'Mujer',
  userType: 'ELITE' | 'ELITE' | 'PRIME', // UI: 💎 Elite / 💎 Elite / 🌟 Prime
  avatarUrl?: string,           // Single avatar (match users)
  pictureUrls?: string[],       // Multiple photos (discovery profiles)
  isTestUser?: boolean,         // Flag for match test users
  isDiscoveryProfile?: boolean, // Flag for discovery profiles
  location: {
    latitude: number,
    longitude: number,
    address: string
  },
  // ... other fields
}
```

**matches collection**
```typescript
{
  matchId: string,
  user1Id: string,
  user2Id: string,
  timestamp: Timestamp,
  unread: boolean,
  lastMessage?: string,
  lastMessageTime?: Timestamp
}
```

## Common Development Commands

### Development Server
```bash
cd ~/IdeaProjects/Public-BlackSugar21
npm start                    # Start dev server (port 4200)
npm run build                # Production build
npm run watch                # Build with watch mode
npm test                     # Run tests
```

### Firebase Operations
```bash
# Deploy to hosting
firebase deploy --only hosting

# Deploy firestore rules
firebase deploy --only firestore:rules

# Deploy indexes
firebase deploy --only firestore:indexes

# Complete deploy
sh deploy.sh
```

### Script Operations
```bash
# Test data management
cd scripts
node populate-test-matches.js
node populate-discovery-profiles.js
node verify-test-data.js
node cleanup-test-matches.js
node cleanup-discovery-profiles.js

# Debugging
node check-matches.js
node debug-matches-users.js
node get-user-email.js <userId>

# Maintenance
node clean-orphan-matches.js
node fix-test-users-male-field.js
```

## Build & Deployment

### Production Build
```bash
# Build for production
npm run build

# Output location
dist/public-black-sugar21/browser/

# Deploy to Firebase Hosting
firebase deploy --only hosting

# Or use deploy script
sh deploy.sh
```

### Environment Configuration
```typescript
// src/environments/environment.ts (development)
export const environment = {
  production: false,
  firebaseConfig: {
    apiKey: 'your-api-key',
    authDomain: 'black-sugar21.firebaseapp.com',
    projectId: 'black-sugar21',
    storageBucket: 'black-sugar21.appspot.com',
    messagingSenderId: 'your-sender-id',
    appId: 'your-app-id'
  }
};

// src/environments/environment.prod.ts (production)
export const environment = {
  production: true,
  firebaseConfig: { /* same config */ }
};
```

## Common Issues & Solutions

### Issue: Scripts Fail with Auth Error
**Solution**: Verify serviceAccountKey.json exists in scripts/
```bash
# Check file exists
ls scripts/serviceAccountKey.json

# Verify permissions
chmod 600 scripts/serviceAccountKey.json
```

### Issue: Images Not Loading in App
**Cause**: RandomUser.me CDN unreachable or CORS issues
**Solution**: 
- Check internet connection
- Verify URLs in test-avatars-urls.json are valid
- Test URL directly in browser
- Check browser console for CORS errors

### Issue: Deploy Fails
**Solution**: 
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Select project
firebase use black-sugar21

# Try deploy again
firebase deploy
```

### Issue: Node Script Timeout
**Solution**: Increase timeout or check Firebase connection
```javascript
// In script, add:
const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://black-sugar21.firebaseio.com'
});

// Set timeout
const db = admin.firestore();
db.settings({ timestampsInSnapshots: true });
```

### Issue: Too Many Test Users
**Solution**: Run cleanup before repopulating
```bash
cd scripts
echo "y" | node cleanup-test-matches.js
echo "y" | node cleanup-discovery-profiles.js
node verify-test-data.js  # Should show 0 users
node populate-test-matches.js
node populate-discovery-profiles.js
```

## Quick Reference

### Important Files & Locations
```
Key Configuration:
- firebase.json              # Firebase hosting config
- firestore.rules           # Security rules
- firestore.indexes.json    # Database indexes
- angular.json              # Angular build config
- package.json              # Dependencies
- scripts/serviceAccountKey.json  # Firebase Admin SDK

Build Output:
- dist/public-black-sugar21/browser/  # Production build

Logs:
- scripts/cleanup-log-*.txt  # Cleanup operation logs
```

### Key UIDs & Credentials
```
Main Test User (Rosita):
- UID: DsDSK5xqEZZXAIKxtIKyBGntw8f2

Match Test Accounts:
- test1@bstest.com through test20@bstest.com
- Password: Test123!

Discovery Test Accounts:
- discovery1@bstest-discovery.com through discovery30@bstest-discovery.com
- Password: Test123!
```

### Useful Firebase Console Links
```
Firebase Console: https://console.firebase.google.com/project/black-sugar21
- Authentication: /authentication/users
- Firestore: /firestore/data
- Storage: /storage
- Hosting: /hosting
- Analytics: /analytics
```

## Performance Optimization

### Bundle Size Analysis
```bash
npm run build -- --stats-json
npx webpack-bundle-analyzer dist/public-black-sugar21/browser/stats.json
```

### Lazy Loading
```typescript
// Use standalone component lazy loading
const routes: Routes = [
  {
    path: 'admin',
    loadComponent: () => import('./admin/admin.component').then(m => m.AdminComponent)
  }
];
```

### Image Optimization
- Use WebP format when possible
- Implement lazy loading for images
- Use CDN URLs (RandomUser.me) for test data
- Consider Firebase Storage for production images

---

**Last Updated**: January 2026
**Project Status**: Active Development
**Firebase Project**: black-sugar21
  timestamp: Timestamp,
  unread: boolean,
  lastMessage?: string,
  lastMessageTime?: Timestamp
}
```

### angular.json
- Build configuration
- Output path: `dist/public-black-sugar21/browser`
- Assets and styles configuration

### package.json Scripts
```bash
ng serve              # Development server
ng build              # Development build
npm run build:prod    # Production build
npm run deploy        # Build + Deploy to Firebase
npm run deploy:hosting # Deploy only hosting
npm run populate-test-data    # Add test matches
npm run cleanup-test-data     # Remove test data
```

## Common Development Tasks

### 1. Local Development

```bash
# Install dependencies
npm install

# Start development server
npm start
# or
ng serve

# Server runs at http://localhost:4200
# Auto-reloads on file changes
```

### 2. Building the App

```bash
# Development build
ng build

# Production build (optimized)
ng build --configuration production
# or
npm run build:prod

# Output: dist/public-black-sugar21/browser/
```

### 3. Firebase Deployment

```bash
# Full deployment (build + hosting + functions + rules)
npm run deploy

# Deploy only hosting (faster)
npm run deploy:hosting

# Deploy specific services
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### 4. Working with Scripts

The `scripts/` directory contains Node.js utilities for Firebase admin operations:

#### Populate Test Data
```bash
# Add test matches for development/testing
npm run populate-test-data
# or
node scripts/populate-test-matches.js

# What it does:
# - Creates test users
# - Creates matches between users
# - Adds sample messages
# - Useful for development/testing
```

#### Cleanup Test Data
```bash
# Remove all test data
npm run cleanup-test-data
# or
node scripts/cleanup-test-matches.js

# What it does:
# - Removes test users
# - Removes test matches
# - Cleans up messages
# - Resets database to clean state
```

#### Debug Matches
```bash
# Debug match/user issues
node scripts/debug-matches-users.js

# Check specific match
node scripts/check-matches.js

# Clean orphan matches
node scripts/clean-orphan-matches.js

# Get user email by ID
node scripts/get-user-email.js <userId>
```

### 5. Firebase Configuration

All scripts require `serviceAccountKey.json` for Firebase Admin access:

```bash
# Setup service account key
# 1. Download from Firebase Console:
#    Project Settings → Service Accounts → Generate New Private Key
# 2. Save as: scripts/serviceAccountKey.json
# 3. NEVER commit this file to git (.gitignore includes it)

# Example serviceAccountKey.json structure:
{
  "type": "service_account",
  "project_id": "black-sugar21",
  "private_key_id": "...",
  "private_key": "...",
  "client_email": "...",
  "client_id": "...",
  "auth_uri": "...",
  "token_uri": "...",
  "auth_provider_x509_cert_url": "...",
  "client_x509_cert_url": "..."
}
```

## Angular Best Practices

### 1. Component Structure

```typescript
// Standalone component (Angular 21)
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-example',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './example.component.html',
  styleUrl: './example.component.css'
})
export class ExampleComponent {
  // Component logic
}
```

### 2. Service Pattern

```typescript
// Injectable service
import { Injectable } from '@angular/core';
import { Firestore, collection, query, where, getDocs } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  constructor(private firestore: Firestore) {}

  getUsers(): Observable<User[]> {
    // Implementation
  }
}
```

### 3. Firebase Integration

```typescript
// Firestore operations
import { 
  Firestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  query,
  where,
  orderBy,
  limit
} from '@angular/fire/firestore';

// Read document
const userDoc = doc(this.firestore, 'users', userId);
const snapshot = await getDoc(userDoc);
const user = snapshot.data();

// Query collection
const usersCol = collection(this.firestore, 'users');
const q = query(
  usersCol, 
  where('status', '==', 'active'),
  orderBy('createdAt', 'desc'),
  limit(10)
);
const snapshot = await getDocs(q);
const users = snapshot.docs.map(doc => ({
  id: doc.id,
  ...doc.data()
}));

// Write data
const matchesCol = collection(this.firestore, 'matches');
await addDoc(matchesCol, matchData);

// Update document
const matchDoc = doc(this.firestore, 'matches', matchId);
await updateDoc(matchDoc, { status: 'active' });

// Delete document
await deleteDoc(matchDoc);
```

### 4. RxJS Patterns

```typescript
import { Observable, of, from, BehaviorSubject } from 'rxjs';
import { map, catchError, switchMap, debounceTime } from 'rxjs/operators';

// BehaviorSubject for state
private usersSubject = new BehaviorSubject<User[]>([]);
users$ = this.usersSubject.asObservable();

// Observable from Promise
getUser(id: string): Observable<User> {
  const promise = getDoc(doc(this.firestore, 'users', id));
  return from(promise).pipe(
    map(snapshot => snapshot.data() as User),
    catchError(error => {
      console.error('Error:', error);
      return of(null);
    })
  );
}

// Debounce search
searchUsers(searchTerm: string): Observable<User[]> {
  return of(searchTerm).pipe(
    debounceTime(300),
    switchMap(term => this.performSearch(term))
  );
}
```

## Common Issues & Solutions

### 1. Build Errors

**Issue**: Module not found
**Solution**: 
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Angular cache
rm -rf .angular
```

**Issue**: TypeScript errors
**Solution**: Check `tsconfig.json` settings, update dependencies

### 2. Firebase Issues

**Issue**: Permission denied in Firestore
**Solution**: Check `firestore.rules`:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

**Issue**: Functions not working locally
**Solution**: 
```bash
# Use Firebase emulators
firebase emulators:start

# Connect Angular to emulators
# In environment.ts:
export const environment = {
  useEmulators: true,
  firebase: { ... }
};
```

### 3. Deployment Issues

**Issue**: Deploy fails
**Solution**: 
```bash
# Check build output exists
ls -la dist/public-black-sugar21/browser/

# Verify firebase.json paths
# Rebuild and deploy
npm run build:prod
firebase deploy --only hosting

# Check Firebase CLI version
firebase --version
npm install -g firebase-tools@latest
```

### 4. Scripts Issues

**Issue**: Script can't connect to Firebase
**Solution**: 
```bash
# Verify serviceAccountKey.json exists
ls scripts/serviceAccountKey.json

# Check file permissions
chmod 600 scripts/serviceAccountKey.json

# Verify project ID matches
grep project_id scripts/serviceAccountKey.json
```

## Testing

### Unit Tests
```bash
# Run tests
npm test

# Tests use Vitest (configured in package.json)
# Test files: *.spec.ts
```

### E2E Testing
```bash
# Manual testing in browser
npm start
# Open http://localhost:4200

# Test different scenarios:
# - User authentication
# - Data loading
# - Form submissions
# - Error handling
```

## Scripts Documentation

### Available Scripts

#### 1. check-matches.js
Verifies match integrity and displays match information
```bash
node scripts/check-matches.js
```

#### 2. clean-orphan-matches.js
Removes matches with missing or invalid users
```bash
node scripts/clean-orphan-matches.js
```

#### 3. cleanup-test-matches.js
Removes all test data (users, matches, messages)
```bash
node scripts/cleanup-test-matches.js
```

#### 4. debug-matches-users.js
Debug utility for investigating match/user issues
```bash
node scripts/debug-matches-users.js
```

#### 5. fix-test-users-male-field.js
Fixes gender field inconsistencies in test users
```bash
node scripts/fix-test-users-male-field.js
```

#### 6. get-user-email.js
Retrieves user email by user ID
```bash
node scripts/get-user-email.js <userId>
```

#### 7. populate-test-matches.js
Creates comprehensive test data for development
```bash
node scripts/populate-test-matches.js
```

## Environment Configuration

### Development (environment.ts)
```typescript
export const environment = {
  production: false,
  firebase: {
    apiKey: "...",
    authDomain: "...",
    projectId: "black-sugar21",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
  },
  useEmulators: true // Use Firebase emulators
};
```

### Production (environment.prod.ts)
```typescript
export const environment = {
  production: true,
  firebase: { ... },
  useEmulators: false
};
```

## Performance Optimization

### 1. Build Optimization
```bash
# Production build includes:
# - Tree shaking
# - Minification
# - Bundling
# - AOT compilation
npm run build:prod
```

### 2. Lazy Loading
```typescript
// In routes
const routes = [
  {
    path: 'admin',
    loadComponent: () => import('./admin/admin.component')
      .then(m => m.AdminComponent)
  }
];
```

### 3. Change Detection
```typescript
import { ChangeDetectionStrategy } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush // Better performance
})
```

## Git Workflow

```bash
# Branch naming
feature/admin-dashboard
bugfix/fix-user-query
hotfix/critical-security-patch

# Commit messages
feat: Add user management dashboard
fix: Resolve Firestore query issue
refactor: Improve service structure
docs: Update README with scripts info
```

## Monitoring & Analytics

### Firebase Analytics
```typescript
import { Analytics, logEvent } from '@angular/fire/analytics';

// Track events
logEvent(this.analytics, 'page_view', {
  page_title: 'Admin Dashboard',
  page_location: window.location.href
});

logEvent(this.analytics, 'user_action', {
  action_type: 'edit_user',
  user_id: userId
});
```

### Error Tracking
```typescript
// Global error handler
import { ErrorHandler } from '@angular/core';

export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: any): void {
    console.error('Global error:', error);
    // Send to error tracking service
  }
}
```

## Deployment Checklist

- [ ] Run tests: `npm test`
- [ ] Build production: `npm run build:prod`
- [ ] Check build output: `ls dist/`
- [ ] Test locally: Serve dist folder
- [ ] Verify environment config
- [ ] Check Firebase rules
- [ ] Deploy: `npm run deploy`
- [ ] Verify deployment: Check hosting URL
- [ ] Monitor for errors
- [ ] Check analytics

## Support & Resources

- Angular Documentation: https://angular.dev/
- Firebase Documentation: https://firebase.google.com/docs
- RxJS Documentation: https://rxjs.dev/
- TypeScript Documentation: https://www.typescriptlang.org/docs/

---

**Last Updated**: January 2026  
**Project**: BlackSugar21 Web  
**Status**: Production Ready
