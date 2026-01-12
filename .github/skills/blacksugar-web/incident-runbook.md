# BlackSugar21 Web - Incident Response Runbook

## Overview
This runbook provides step-by-step procedures for responding to common incidents in the BlackSugar21 Web application.

---

## 🚨 CRITICAL ISSUES

### 1. Website Down / Not Loading

**Severity**: P0 (Critical)  
**Impact**: Users cannot access the application

#### Symptoms
- Website returns 404 or 500 errors
- White screen / blank page
- Firebase Hosting shows errors
- DNS not resolving

#### Immediate Actions
1. Check Firebase Hosting status
   ```
   https://status.firebase.google.com/
   Look for: Hosting, Firestore, Functions
   ```

2. Check last deployment
   ```bash
   firebase hosting:channel:list
   
   # Check deployment history
   firebase deploy:history --only hosting
   ```

3. Verify build output exists
   ```bash
   ls -la dist/public-black-sugar21/browser/
   ```

4. Check browser console for errors
   ```
   Open DevTools → Console
   Look for: JavaScript errors, network errors, CORS issues
   ```

#### Common Causes & Solutions

**Cause 1**: Failed deployment
```bash
# Rollback to previous version
firebase hosting:clone SOURCE_SITE_ID:CHANNEL_ID TARGET_SITE_ID:live

# Or redeploy
npm run build:prod
firebase deploy --only hosting
```

**Cause 2**: Build errors
```bash
# Check build logs
npm run build:prod 2>&1 | tee build.log

# Common fixes:
rm -rf node_modules .angular
npm install
npm run build:prod
```

**Cause 3**: firebase.json misconfiguration
```json
{
  "hosting": {
    "public": "dist/public-black-sugar21/browser",  // ✅ Correct path
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{
      "source": "**",
      "destination": "/index.html"  // ✅ SPA routing
    }]
  }
}
```

**Cause 4**: CORS issues
```javascript
// Check Firebase Functions CORS configuration
exports.myFunction = onCall({
  cors: true,  // ✅ Enable CORS
  region: 'us-central1'
}, async (req) => { ... });
```

#### Prevention
- Test build locally before deploying
- Use Firebase Hosting preview channels for testing
- Monitor deployment success
- Set up uptime monitoring (e.g., UptimeRobot)

---

### 2. Admin Scripts Failing

**Severity**: P1 (High)  
**Impact**: Cannot manage data or perform admin tasks

#### Symptoms
- Scripts throw authentication errors
- "Permission denied" errors
- Data not updating in Firestore
- Scripts timeout

#### Immediate Actions
1. Verify service account key
   ```bash
   ls -la scripts/serviceAccountKey.json
   
   # Check file contents (first few lines)
   head -n 5 scripts/serviceAccountKey.json
   ```

2. Check Firebase project ID
   ```bash
   # In serviceAccountKey.json
   grep "project_id" scripts/serviceAccountKey.json
   
   # Should match .firebaserc
   cat .firebaserc
   ```

3. Test Firebase Admin connection
   ```bash
   node -e "
   const admin = require('firebase-admin');
   const serviceAccount = require('./scripts/serviceAccountKey.json');
   admin.initializeApp({credential: admin.credential.cert(serviceAccount)});
   console.log('✅ Connected to Firebase');
   "
   ```

#### Common Causes & Solutions

**Cause 1**: Missing or invalid service account key
```bash
# Download new key from Firebase Console:
# Project Settings → Service Accounts → Generate New Private Key
# Save as: scripts/serviceAccountKey.json

# Set proper permissions
chmod 600 scripts/serviceAccountKey.json
```

**Cause 2**: Firestore rules blocking admin operations
```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Admin operations use service account, not these rules
    // But if testing locally, ensure rules allow operations
    
    match /{document=**} {
      allow read, write: if false;  // ❌ Blocks everything
    }
  }
}

// For development, use more permissive rules
// For production, keep strict rules (admin bypasses them)
```

**Cause 3**: Script errors / bugs
```bash
# Run script with detailed logging
node scripts/populate-test-matches.js --verbose

# Check for common issues:
# - Missing await keywords
# - Incorrect field names
# - Invalid data types
# - Missing error handling
```

**Cause 4**: Network issues / timeouts
```bash
# Increase timeout in script
const db = admin.firestore();
db.settings({
  ignoreUndefinedProperties: true,
  timeout: 60000  // 60 seconds
});
```

#### Prevention
- Keep serviceAccountKey.json secure and up-to-date
- Add error handling to all scripts
- Test scripts on development data first
- Document all scripts in README
- Version control scripts (not credentials)

---

### 3. Firestore Data Corruption

**Severity**: P1 (High)  
**Impact**: Invalid data affecting app functionality

#### Symptoms
- App crashes when loading certain data
- Missing required fields
- Invalid data types
- Orphaned documents

#### Immediate Actions
1. Identify corrupt data
   ```bash
   # Use debug script
   node scripts/debug-matches-users.js
   
   # Check specific collection
   node scripts/check-matches.js
   ```

2. Assess impact
   ```bash
   # Count affected documents
   # Query in Firebase Console or script
   ```

3. Backup before fixes
   ```bash
   # Export Firestore data
   gcloud firestore export gs://black-sugar21-backup/$(date +%Y%m%d)
   ```

4. Fix data
   ```bash
   # Use appropriate script
   node scripts/clean-orphan-matches.js
   node scripts/fix-test-users-male-field.js
   ```

#### Common Causes & Solutions

**Cause 1**: Missing required fields
```typescript
// Add validation before writing
function validateMatch(match: any): boolean {
  const required = ['participants', 'status', 'createdAt'];
  return required.every(field => field in match && match[field] != null);
}

if (!validateMatch(matchData)) {
  throw new Error('Invalid match data');
}
```

**Cause 2**: Incorrect data types
```typescript
// Type checking
interface Match {
  participants: string[];  // Must be array
  status: 'active' | 'inactive' | 'deleted';  // Must be one of these
  lastMessageTimestamp: number;  // Must be number
}

// Runtime validation
function isValidMatch(data: any): data is Match {
  return (
    Array.isArray(data.participants) &&
    ['active', 'inactive', 'deleted'].includes(data.status) &&
    typeof data.lastMessageTimestamp === 'number'
  );
}
```

**Cause 3**: Orphaned documents
```bash
# Clean up orphans
node scripts/clean-orphan-matches.js

# Prevention: Use Cloud Functions to cascade deletes
exports.onUserDeleted = onDocumentDeleted('users/{userId}', async (event) => {
  const userId = event.params.userId;
  
  // Delete user's matches
  const matches = await admin.firestore()
    .collection('matches')
    .where('participants', 'array-contains', userId)
    .get();
  
  const batch = admin.firestore().batch();
  matches.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
});
```

#### Prevention
- Implement data validation on write
- Use TypeScript interfaces
- Add Firestore security rules for data validation
- Regular data integrity checks
- Use transactions for atomic operations

---

## ⚠️ HIGH PRIORITY ISSUES

### 4. Slow Page Load Times

**Severity**: P2 (Medium)  
**Impact**: Poor user experience

#### Immediate Actions
1. Check Lighthouse scores
   ```bash
   # In Chrome DevTools
   Lighthouse → Generate Report
   ```

2. Analyze bundle size
   ```bash
   npm run build:prod -- --stats-json
   # Analyze with webpack-bundle-analyzer
   ```

3. Check Firebase Performance Monitoring
   ```
   Firebase Console → Performance → Web
   ```

#### Solutions
```typescript
// 1. Lazy load routes
const routes: Routes = [
  {
    path: 'admin',
    loadComponent: () => import('./admin/admin.component')
      .then(m => m.AdminComponent)
  }
];

// 2. Use OnPush change detection
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush
})

// 3. Optimize images
// Use WebP format, compress images, lazy load

// 4. Cache API responses
private cache = new Map<string, any>();

getData(key: string): Observable<any> {
  if (this.cache.has(key)) {
    return of(this.cache.get(key));
  }
  
  return this.apiCall().pipe(
    tap(data => this.cache.set(key, data))
  );
}
```

---

### 5. Authentication Issues

**Severity**: P2 (Medium)  
**Impact**: Users cannot login

#### Immediate Actions
1. Check Firebase Auth status
2. Verify API keys in environment files
3. Check browser console for auth errors

#### Solutions
```typescript
// Proper error handling
async login(email: string, password: string) {
  try {
    const credential = await signInWithEmailAndPassword(
      this.auth,
      email,
      password
    );
    return credential.user;
  } catch (error: any) {
    switch (error.code) {
      case 'auth/user-not-found':
        throw new Error('User not found');
      case 'auth/wrong-password':
        throw new Error('Invalid password');
      case 'auth/too-many-requests':
        throw new Error('Too many attempts. Try again later.');
      default:
        throw new Error('Login failed');
    }
  }
}
```

---

## 📊 MONITORING

### Key Metrics to Watch

1. **Firebase Hosting**
   - Requests per minute
   - Bandwidth usage
   - Error rate
   - Response time

2. **Firestore**
   - Read/Write operations
   - Query performance
   - Storage size
   - Index usage

3. **Cloud Functions**
   - Execution count
   - Error rate
   - Execution time
   - Cold starts

4. **Web Vitals**
   - FCP (First Contentful Paint) < 1.8s
   - LCP (Largest Contentful Paint) < 2.5s
   - CLS (Cumulative Layout Shift) < 0.1
   - FID (First Input Delay) < 100ms

### Alert Thresholds

```yaml
Critical (Immediate):
  - Website down (status 500)
  - Error rate > 10%
  - All scripts failing

High (Within 1 hour):
  - Error rate > 5%
  - Response time > 5s
  - Firestore quota exceeded

Medium (Within 4 hours):
  - Error rate > 2%
  - Performance degradation
  - Script failures (non-critical)
```

---

## 🔧 DEBUGGING TOOLS

### 1. Browser DevTools
```bash
# Console
Filter by: Errors, Warnings

# Network
Filter by: XHR, Fetch
Look for: Failed requests, slow responses

# Performance
Record → Analyze timeline

# Application
Check: Local Storage, Session Storage, Cookies
Firebase: Auth state, Firestore cache
```

### 2. Firebase Console
```bash
# Hosting
https://console.firebase.google.com/project/black-sugar21/hosting

# Firestore
https://console.firebase.google.com/project/black-sugar21/firestore

# Functions
https://console.firebase.google.com/project/black-sugar21/functions

# Performance
https://console.firebase.google.com/project/black-sugar21/performance
```

### 3. Firebase CLI
```bash
# Check deployment
firebase hosting:channel:list

# View logs
firebase functions:log

# Test locally
firebase emulators:start

# Debug specific function
firebase functions:log --only functionName --limit 50
```

---

## 📞 ESCALATION

### Contact Information

**L1 Support**
- Check monitoring dashboards
- Follow this runbook
- Test basic functionality

**L2 Engineering**
- Code debugging
- Deploy fixes
- Database operations

**L3 Senior Engineering**
- Architecture issues
- Major incidents
- Security concerns

### Escalation Criteria
- P0 unresolved in 30 minutes
- P1 unresolved in 2 hours
- Data loss detected
- Security vulnerability
- Multiple systems affected

---

## 📝 POST-INCIDENT

### Incident Report Template

```markdown
## Incident Report

**Date**: YYYY-MM-DD
**Duration**: HH:MM - HH:MM
**Severity**: P0/P1/P2
**Status**: Resolved

### Summary
Brief description of what happened

### Impact
- Number of users affected
- Services impacted
- Duration of impact

### Timeline
- HH:MM - Issue detected
- HH:MM - Investigation began
- HH:MM - Root cause identified
- HH:MM - Fix deployed
- HH:MM - Issue resolved

### Root Cause
Technical explanation

### Resolution
What fixed it

### Prevention
- Action items
- Process improvements
- Code changes needed

### Lessons Learned
What went well, what to improve
```

---

**Last Updated**: January 2026  
**Version**: 1.0  
**Owner**: BlackSugar21 Web Team
