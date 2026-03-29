---
name: blacksugar-testing-system
description: Sistema maestro consolidado de pruebas para BlackSugar21. Gestión completa de datos de prueba incluyendo matches, perfiles de discovery, verificación, limpieza selectiva, y soporte multi-usuario (Daniel/Rosita). Script unificado interactivo que reemplaza 19+ scripts legacy. Usar cuando se trabaje con testing, población de datos, limpieza, o debugging de matches.
---

# BlackSugar21 Testing System - Comprehensive Skill

## Overview
Sistema unificado e interactivo de gestión de datos de prueba para BlackSugar21. Consolida todas las operaciones de testing en un único script maestro con menú categorizado, soporte multi-usuario, y limpieza granular.

## System Context

### Testing System Details
- **Name**: test-system-unified.js
- **Type**: Node.js Interactive CLI Tool
- **Location**: `/scripts/test-system-unified.js`
- **Purpose**: Gestión completa de datos de prueba
- **Users Supported**: Daniel (sU8xLiwQWNXmbYdR63p1uO6TSm72), Rosita (DsDSK5xqEZZXAIKxtIKyBGntw8f2)
- **Backend**: Firebase Admin SDK
- **Replaced Scripts**: 19+ legacy scripts consolidados

### Technology Stack
- **Runtime**: Node.js v18+
- **SDK**: Firebase Admin SDK
- **Database**: Firestore
- **Auth**: Firebase Authentication
- **Storage**: Firebase Storage
- **Interface**: readline (interactive CLI)

### Key Capabilities
1. **Match Management** - Crear, listar, enviar mensajes, verificar orden
2. **Discovery Profiles** - Generar perfiles para swipe/HomeView con fotos
3. **Verification** - Diagnóstico completo del sistema
4. **Selective Cleanup** - Limpieza granular por tipo de datos
5. **Multi-User Support** - Alternar entre usuarios de prueba
6. **Real-time Testing** - Probar reordenamiento de matches en tiempo real

## Project Structure

```
scripts/
├── 📄 Documentation
│   ├── README.md                        # Guía principal
│   ├── TEST_SYSTEM_UNIFIED_README.md    # Docs completas
│   ├── SYSTEM_MAP.md                    # Mapa visual y flujos
│   ├── QUICKSTART.md                    # Inicio rápido
│   ├── SCENARIO_GENERATOR_GUIDE.md      # Escenarios avanzados
│   └── HOME_VIEW_TEST_PLAN.md           # Plan testing HomeView
│
├── 🎯 Main Script (CORE)
│   └── test-system-unified.js           # ⭐ Sistema maestro
│
├── 🔧 Auxiliary Scripts
│   ├── generate-avatar-urls.js          # Generar URLs avatares
│   ├── get-user-email.js                # Lookup email por UID
│   ├── optimize-matches-and-images.js   # Optimizaciones
│   ├── update-avatars-only.js           # Actualizar avatares
│   ├── upload-test-avatars.js           # Subir avatares
│   └── upload-test-avatars-to-storage.js # Subir a Storage
│
└── ⚙️ Configuration
    ├── serviceAccountKey.json           # Firebase credentials (gitignored)
    ├── serviceAccountKey.example.json   # Template
    └── test-avatars-urls.json           # Avatar URLs cache
```

## Core System Architecture

### test-system-unified.js - Main Script

#### User Selection System
```javascript
const TEST_USERS = {
  daniel: {
    email: 'dverdugo85@gmail.com',
    uid: 'sU8xLiwQWNXmbYdR63p1uO6TSm72',
    name: 'Daniel'
  },
  rosita: {
    email: 'rosita@example.com',
    uid: 'DsDSK5xqEZZXAIKxtIKyBGntw8f2',
    name: 'Rosita'
  }
};

let CURRENT_USER = null; // Set by selectTestUser()
```

#### Menu Structure
```
🧪 SISTEMA UNIFICADO DE PRUEBAS
════════════════════════════════════════════

📋 GESTIÓN DE MATCHES
1. Listar matches actuales
2. Crear matches de prueba (1-10)
3. Enviar mensaje a un match
4. Generar escenario completo (3-10)

🎯 PERFILES DE DISCOVERY
5. Crear perfiles para HomeView/Swipe (5-30)

🔍 VERIFICACIÓN Y DIAGNÓSTICO
6. Verificar orden de matches
7. Verificar sistema completo

🧹 LIMPIEZA
8. Limpieza selectiva (por tipo)
9. Limpieza completa (todo)

⚙️ CONFIGURACIÓN
10. Cambiar usuario de prueba
11. Salir
```

## Data Types and Structures

### Match Users
```typescript
interface MatchUser {
  // Firebase Auth
  email: string;  // "test_match_*@bstest.com" | "test_scenario_*@bstest.com"
  password: string; // "Test1234!"
  uid: string;
  
  // Firestore Profile (profiles collection)
  profile: {
    name: string;
    gender: 'male' | 'female';
    userType: 'SUGAR_DADDY' | 'SUGAR_MOMMY' | 'SUGAR_BABY'; // UI: 💎 Elite / 💎 Elite / 🌟 Prime
    age: number;
    city: string;
    createdAt: Timestamp;
    isTest: true;  // Flag for identification
  };
  
  // Match (matches collection)
  match: {
    userId1: string;  // CURRENT_USER.uid
    userId2: string;  // created user uid
    timestamp: Timestamp;  // Staggered timestamps
    lastMessage: string;
    lastMessageSeq: number;
    lastMessageTimestamp: Timestamp;
    createdAt: Timestamp;
    isTest: true;
  };
  
  // Initial Message (messages collection)
  message: {
    matchId: string;
    senderId: string;
    text: string;
    timestamp: Timestamp;
    createdAt: Timestamp;
  };
}
```

### Discovery Profiles
```typescript
interface DiscoveryProfile {
  // Firebase Auth
  email: string;  // "discovery_*@bstest-discovery.com"
  password: string; // "Test1234!"
  uid: string;
  
  // Firestore Profile (profiles collection)
  profile: {
    name: string;  // "FirstName LastName"
    gender: 'male' | 'female';
    userType: 'SUGAR_DADDY' | 'SUGAR_MOMMY' | 'SUGAR_BABY'; // UI: 💎 Elite / 💎 Elite / 🌟 Prime
    age: number;  // 22-40
    city: string;  // Santiago, Valparaíso, Concepción, Viña del Mar
    bio: string;  // From predefined list
    pictureUrls: string[];  // 5 photos from randomuser.me
    createdAt: Timestamp;
    isDiscoveryProfile: true;  // Flag for identification
    isTest: true;
  };
}
```

### Test Data Identification Patterns

**Email Patterns:**
- Match users: `test_match_*@bstest.com`, `test_scenario_*@bstest.com`
- Discovery profiles: `discovery_*@bstest-discovery.com`

**Firestore Flags:**
- `isTest: true` - General test data marker
- `isTestUser: true` - Legacy match users
- `isDiscoveryProfile: true` - Discovery profiles marker

## Core Functions Reference

### 1. User Selection
```javascript
async function selectTestUser()
```
- Shows interactive menu to select Daniel or Rosita
- Verifies user exists in Firebase Auth
- Updates CURRENT_USER global variable
- Called at startup and via option 10

### 2. Match Management Functions

#### listDanielMatches()
```javascript
async function listDanielMatches(): Promise<DocumentSnapshot[]>
```
- Queries matches where userId1 == CURRENT_USER.uid
- Queries matches where userId2 == CURRENT_USER.uid
- Combines and sorts by timestamp DESC → lastMessageSeq DESC
- Fetches other user profiles
- Returns sorted array of match documents

#### createTestMatches()
```javascript
async function createTestMatches()
```
- Prompts for count (1-10)
- Creates users in Firebase Auth
- Creates profiles in Firestore
- Creates matches with staggered timestamps
- Creates initial messages
- Uses batch operations for efficiency

#### sendMessageToMatch()
```javascript
async function sendMessageToMatch(matches: DocumentSnapshot[])
```
- Shows numbered list of matches
- Prompts for match selection and message
- Countdown timer (5 seconds) for app observation
- Updates match document (timestamp, lastMessage, lastMessageSeq)
- Creates message document
- Verifies new order and displays results

#### generateTestScenario()
```javascript
async function generateTestScenario()
```
- Prompts for count (3-10)
- Creates multiple users with profiles
- Creates matches with staggered timestamps
- Sends multiple messages per match (up to 3)
- Creates realistic conversation scenarios
- Displays expected order

### 3. Discovery Profile Functions

#### createDiscoveryProfiles()
```javascript
async function createDiscoveryProfiles()
```
- Prompts for count (5-30)
- Alternates gender for variety
- Determines appropriate userType based on CURRENT_USER
- Generates 5 photos per profile (randomuser.me)
- Creates complete profiles with bio, age, city
- Sets isDiscoveryProfile and isTest flags

### 4. Verification Functions

#### verifyMatchOrder()
```javascript
async function verifyMatchOrder()
```
- Fetches all matches for CURRENT_USER
- Sorts by timestamp DESC → lastMessageSeq DESC
- Displays detailed list with timestamps and sequences
- Validates ordering logic

#### verifySystem()
```javascript
async function verifySystem()
```
- Counts matches for current user
- Counts discovery profiles
- Counts profiles with photos
- Counts test users in Auth
- Counts active conversations
- Displays comprehensive statistics
- Provides suggestions based on state

### 5. Cleanup Functions

#### cleanupTestData()
```javascript
async function cleanupTestData()
```
- Lists all test users (@bstest.com, @bstest-discovery.com)
- Requires confirmation
- Deletes matches (both userId1 and userId2)
- Deletes messages in matches
- Deletes profiles from Firestore
- Deletes users from Auth
- Displays detailed summary

#### selectiveCleanup()
```javascript
async function selectiveCleanup()
```
- Submenu with 4 options
- cleanupMatchesOnly() - Keeps discovery profiles
- cleanupDiscoveryOnly() - Keeps matches
- cleanupKeepScenario() - Reserved for future implementation
- cleanupTestData() - Complete cleanup

## Query Optimization Patterns

### Avoiding Composite Indexes
```javascript
// ❌ BAD: Requires composite index
const matches = await db.collection('matches')
  .where('userId1', '==', userId)
  .orderBy('timestamp', 'desc')
  .get();

// ✅ GOOD: Single field queries, sort in memory
const matches1 = await db.collection('matches')
  .where('userId1', '==', userId)
  .get();
  
const matches2 = await db.collection('matches')
  .where('userId2', '==', userId)
  .get();

const allMatches = [...matches1.docs, ...matches2.docs];
allMatches.sort((a, b) => {
  const tsA = a.data().timestamp?.toMillis() || 0;
  const tsB = b.data().timestamp?.toMillis() || 0;
  if (tsB !== tsA) return tsB - tsA;
  return (b.data().lastMessageSeq || 0) - (a.data().lastMessageSeq || 0);
});
```

### Timestamp Staggering
```javascript
// Crear timestamps escalonados para orden natural
for (let i = 0; i < count; i++) {
  const minutesAgo = (count - i) * 60 * 1000;
  const timestamp = new Date(Date.now() - minutesAgo);
  
  await db.collection('matches').doc(matchId).set({
    // ... other fields
    timestamp: admin.firestore.Timestamp.fromDate(timestamp),
  });
}
```

## Common Testing Workflows

### Workflow 1: Initial Setup
```bash
# Start script
node test-system-unified.js

# Select user (1: Daniel, 2: Rosita)
# Option 7: Verify system → See current state
# Option 5: Create 20-30 discovery profiles
# Option 4: Generate 5-10 matches with conversations
# Option 7: Verify system → Confirm all OK
# Open app and test
```

### Workflow 2: Test Match Reordering
```bash
# Option 1: List matches → See current order
# Option 3: Send message → Watch match move to #1
# Option 6: Verify order → Confirm correct ordering
# Option 1: List matches → Verify new position
```

### Workflow 3: Multi-User Testing
```bash
# User: Daniel
# Option 2: Create 5 matches
# Option 5: Create 15 discovery profiles
# Option 10: Change to Rosita
# Option 2: Create 5 matches
# Option 5: Create 15 discovery profiles
# Test both apps simultaneously
```

### Workflow 4: Selective Cleanup
```bash
# Option 8: Selective cleanup
#   ├─ Option 1: Only matches (keep discovery)
#   ├─ Option 2: Only discovery (keep matches)
#   ├─ Option 3: Keep last scenario
#   └─ Option 4: Complete cleanup
```

## Color Console System

```javascript
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',     // Errors
  green: '\x1b[32m',   // Success
  yellow: '\x1b[33m',  // Warnings
  blue: '\x1b[34m',    // Reserved
  magenta: '\x1b[35m', // Special
  cyan: '\x1b[36m',    // Info/Headers
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}
```

**Usage Conventions:**
- 🔵 Cyan → Títulos, información general
- 🟢 Green → Operaciones exitosas, confirmaciones
- 🟡 Yellow → Advertencias, esperas, procesos
- 🔴 Red → Errores críticos
- ⚪ Bright → Encabezados importantes, separadores

## Test Data Naming Conventions

### Names Arrays
```javascript
const testNames = {
  women: ['Sofia', 'Isabella', 'Valentina', 'Camila', 'Martina', 
          'Lucia', 'Emma', 'Paula', 'Julia', 'Amanda'],
  men: ['Carlos', 'Miguel', 'Alejandro', 'Diego', 'Sebastian', 
        'Mateo', 'Lucas', 'Santiago', 'Nicolas', 'Andres']
};

const lastNames = ['Martinez', 'Lopez', 'Garcia', 'Rodriguez', 
                   'Fernandez', 'Sanchez', 'Ramirez', 'Torres'];

const bios = [
  'Amante del buen vino y viajes exóticos 🍷✈️',
  'Emprendedor exitoso buscando conexión genuina 💼',
  'Aventurera, disfruto de la vida al máximo 🌟',
  // ... more bios
];
```

### Photo URL Generation
```javascript
// 5 photos per profile, rotating indexes 1-99
function getProfilePhotos(isMale, profileIndex) {
  const photos = [];
  const baseIndex = (profileIndex * 3) % 99;
  
  for (let i = 0; i < 5; i++) {
    const photoIndex = (baseIndex + i) % 99 + 1;
    const gender = isMale ? 'men' : 'women';
    photos.push(`https://randomuser.me/api/portraits/${gender}/${photoIndex}.jpg`);
  }
  
  return photos;
}
```

## Error Handling Patterns

### Authentication Errors
```javascript
try {
  const userRecord = await auth.createUser({
    email: email,
    password: password,
    displayName: name
  });
} catch (error) {
  if (error.code === 'auth/email-already-exists') {
    log(`⚠️ Email ya existe, saltando...`, 'yellow');
    continue;
  }
  log(`❌ Error creando usuario: ${error.message}`, 'red');
}
```

### Firestore Errors
```javascript
try {
  await db.collection('matches').doc(matchId).set(data);
} catch (error) {
  if (error.code === 'permission-denied') {
    log(`❌ Permisos insuficientes en Firestore`, 'red');
  } else if (error.code === 'unavailable') {
    log(`⚠️ Firestore temporalmente no disponible, reintentando...`, 'yellow');
    await new Promise(resolve => setTimeout(resolve, 2000));
    // Retry logic
  }
}
```

### User Input Validation
```javascript
const numMatches = await question('¿Cuántos matches? (1-10): ');
const count = parseInt(numMatches);

if (isNaN(count) || count < 1 || count > 10) {
  log('❌ Número inválido. Debe ser entre 1 y 10', 'red');
  return;
}
```

## Performance Optimization Tips

### 1. Batch Operations
```javascript
// ✅ GOOD: Use batch for multiple writes
const batch = db.batch();

for (let i = 0; i < count; i++) {
  const profileRef = db.collection('profiles').doc(userId);
  batch.set(profileRef, profileData);
  
  const matchRef = db.collection('matches').doc(matchId);
  batch.set(matchRef, matchData);
}

await batch.commit(); // Single network call
```

### 2. Parallel Auth Queries
```javascript
// ✅ GOOD: Query both directions in parallel
const [matches1, matches2] = await Promise.all([
  db.collection('matches').where('userId1', '==', userId).get(),
  db.collection('matches').where('userId2', '==', userId).get()
]);
```

### 3. Limit Data Fetching
```javascript
// Only fetch what's needed
const profileDoc = await db.collection('profiles')
  .doc(userId)
  .get();

if (profileDoc.exists) {
  const { name } = profileDoc.data(); // Destructure only needed fields
}
```

## Troubleshooting Guide

### Common Issues and Solutions

#### Issue: "Service account key not found"
```bash
# Solution:
ls -la scripts/serviceAccountKey.json
# If missing, download from Firebase Console
# Project Settings > Service Accounts > Generate New Private Key
```

#### Issue: "No matches for verification"
```javascript
// Solution: Create matches first
// Option 2: Create matches (1-10)
// or
// Option 4: Generate complete scenario (3-10)
```

#### Issue: "Match order not updating"
```javascript
// Verify timestamp and sequence are updating:
await matchRef.update({
  lastMessage: message,
  lastMessageSeq: newSeq,  // Increment sequence
  timestamp: admin.firestore.FieldValue.serverTimestamp(), // Update timestamp
  lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp()
});
```

#### Issue: "Discovery profiles not appearing in app"
```javascript
// Check userType logic:
if (CURRENT_USER.name === 'Daniel') {
  // Daniel es hombre, mostrar mujeres (🌟 Prime / 💎 Elite)
  userType = isMale ? 'SUGAR_DADDY' : (i % 3 === 0 ? 'SUGAR_MOMMY' : 'SUGAR_BABY');
} else {
  // Rosita es mujer, mostrar hombres (💎 Elite)
  userType = isMale ? 'SUGAR_DADDY' : 'SUGAR_BABY';
}
```

#### Issue: "Script hangs or is very slow"
```bash
# Check for existing test data:
# Option 7: Verify system → See counts
# If too many test users, cleanup first:
# Option 9: Complete cleanup
```

## Testing Best Practices

### Before Creating Data
1. ✅ Verify current state (Option 7)
2. ✅ Check for existing test data
3. ✅ Confirm selected user is correct
4. ✅ Plan quantity (recommended: 5-10 matches, 20-30 discovery)

### During Testing
1. ✅ Use option 1 frequently to see current state
2. ✅ Test reordering with option 3 + app observation
3. ✅ Verify order with option 6 after changes
4. ✅ Check both app platforms (iOS/Android/Web)

### After Testing
1. ✅ Use selective cleanup (option 8) if continuing tests
2. ✅ Use complete cleanup (option 9) when finished
3. ✅ Verify cleanup succeeded (option 7)
4. ✅ Document any issues found

## Integration with App Testing

### Testing Match Reordering (Core Feature)
```bash
# 1. Create initial matches
Option 4: Generate scenario (5 matches)

# 2. Open app, observe initial order
# iOS: MatchesView
# Android: MatchesScreen
# Web: Matches component

# 3. Send message from script
Option 3: Send message to match #5

# 4. Observe in app (should move to #1 instantly)
# iOS: Verify list updates via Combine subscription
# Android: Verify list updates via Flow collection
# Web: Verify list updates via RxJS subscription

# 5. Verify programmatically
Option 6: Verify order
```

### Testing Discovery/HomeView
```bash
# 1. Create discovery profiles
Option 5: Create 25 profiles

# 2. Open app HomeView
# iOS: HomeView with CardStackView
# Android: HomeScreen with CardStackView
# Web: Home component with swipe cards

# 3. Verify profiles appear with photos
# Each profile should have 5 photos
# Swipe functionality should work
# Like/dislike actions should create matches

# 4. Check match creation
Option 1: List matches (should increase after likes)
```

### Testing Multi-User Scenarios
```bash
# 1. Setup Daniel
Select user 1 (Daniel)
Option 4: Generate 5 matches
Option 5: Create 15 discovery

# 2. Setup Rosita  
Option 10: Change user
Select user 2 (Rosita)
Option 4: Generate 5 matches
Option 5: Create 15 discovery

# 3. Test cross-user interactions
# Open Daniel app on device 1
# Open Rosita app on device 2
# Create match between them via discovery
# Send messages back and forth
# Verify reordering on both sides
```

## Firebase Admin SDK Best Practices

### Service Account Security
```javascript
// ✅ GOOD: Use environment variable in production
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : require('./serviceAccountKey.json');

// ❌ BAD: Hardcode or commit credentials
// const serviceAccount = { ... };
```

### Connection Reuse
```javascript
// ✅ GOOD: Single initialization
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// ❌ BAD: Multiple initializations
// admin.initializeApp(...) multiple times
```

### Proper Cleanup
```javascript
// Always cleanup resources when exiting
process.on('SIGINT', async () => {
  log('\n👋 Cerrando conexiones...', 'yellow');
  await admin.app().delete();
  process.exit(0);
});
```

## Advanced Usage Patterns

### Programmatic Script Execution
```javascript
// Import as module for automated testing
const { createTestMatches, verifySystem } = require('./test-system-unified.js');

async function runAutomatedTest() {
  // Set user programmatically
  CURRENT_USER = TEST_USERS.daniel;
  
  // Create data
  await createTestMatches();
  
  // Verify
  await verifySystem();
  
  // Cleanup
  await cleanupTestData();
}
```

### Custom Data Generation
```javascript
// Extend for specific test scenarios
async function createSpecificScenario() {
  // Create users with specific characteristics
  const youngUsers = createUsersWithAge(22, 25);
  const oldUsers = createUsersWithAge(35, 40);
  
  // Mix userTypes
  const babies = createUsersWithType('SUGAR_BABY');
  const daddies = createUsersWithType('SUGAR_DADDY');
  
  // Create matches with specific patterns
  await createMatchesBetween(youngUsers, oldUsers);
}
```

## Migration Notes (Legacy Scripts)

### Replaced Scripts Mapping
| Legacy Script | New System Location |
|--------------|---------------------|
| `check-daniel-matches.js` | Option 1: listDanielMatches() |
| `populate-test-matches.js` | Option 2: createTestMatches() |
| `test-match-ordering.js` | Options 3,6: sendMessageToMatch(), verifyMatchOrder() |
| `populate-discovery-profiles.js` | Option 5: createDiscoveryProfiles() |
| `verify-test-data.js` | Option 7: verifySystem() |
| `debug-matches-users.js` | Option 7: verifySystem() (integrated) |
| `cleanup-test-matches.js` | Options 8,9: selectiveCleanup(), cleanupTestData() |

### Benefits of Unified System
- ✅ **95% reduction** in script files (19 → 1)
- ✅ **User selection** without restarting
- ✅ **Selective cleanup** preserves needed data
- ✅ **Integrated verification** with statistics
- ✅ **Menu navigation** more intuitive
- ✅ **Consistent patterns** across all operations

## Related Documentation

- **README.md** - Main guide and quick start
- **TEST_SYSTEM_UNIFIED_README.md** - Complete system documentation
- **SYSTEM_MAP.md** - Visual architecture and workflows
- **QUICKSTART.md** - Fast setup guide
- **SCENARIO_GENERATOR_GUIDE.md** - Advanced scenario patterns
- **HOME_VIEW_TEST_PLAN.md** - HomeView specific testing

## Maintenance and Updates

### Adding New Features
1. Add function after existing functions (before menu)
2. Update menu with new option
3. Add case in switch statement
4. Update documentation (README + SKILL)
5. Test thoroughly before committing

### Adding New Test Users
```javascript
// In TEST_USERS object:
const TEST_USERS = {
  daniel: { ... },
  rosita: { ... },
  newUser: {
    email: 'newuser@example.com',
    uid: 'newUserUidHere',
    name: 'NewUser'
  }
};
```

### Extending Data Types
```javascript
// Add new profile fields:
await db.collection('profiles').doc(userId).set({
  // ... existing fields
  newField: value,
  anotherField: data
});
```

## Quick Command Reference

```bash
# Start system
node test-system-unified.js

# Common workflows
1 → List matches
2 → Create 5-10 matches
3 → Send message + test reorder
4 → Generate complete scenario
5 → Create 20-30 discovery profiles
6 → Verify match order
7 → System statistics
8 → Selective cleanup
9 → Complete cleanup
10 → Change user
11 → Exit
```

## Support and Troubleshooting

### Debug Mode
```javascript
// Add at top of script for verbose logging
const DEBUG = true;

if (DEBUG) {
  console.log('DEBUG:', variableName, value);
}
```

### Firestore Rules Testing
```bash
# Test from terminal
firebase emulators:start --only firestore
# Use emulator for testing without affecting production
```

### Performance Profiling
```javascript
const startTime = Date.now();
await someOperation();
const duration = Date.now() - startTime;
log(`⏱️ Operation took ${duration}ms`, 'cyan');
```

---

**Version**: 2.0  
**Last Updated**: 12 de enero de 2026  
**Author**: GitHub Copilot  
**Status**: Production Ready ✅
