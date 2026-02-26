#!/usr/bin/env node

/**
 * 🎯 Crear Match con Notificación - BlackSugar21
 * 
 * Script para crear matches de prueba que:
 * 1. Crea usuarios completos en collection 'users' (no solo profiles)
 * 2. Crea el match en Firestore
 * 3. Dispara notificación automática via Cloud Function
 * 4. Actualiza la lista de matches en la app en tiempo real
 * 
 * Flujo completo:
 * - Crear usuario en Auth
 * - Crear documento en 'users' collection (con todos los campos)
 * - Crear match (dispara Cloud Function onMatchCreated)
 * - Cloud Function envía notificación push
 * - App recibe notificación y actualiza lista de matches
 * 
 * Fecha: 16 de enero de 2026
 */

const admin = require('firebase-admin');
const readline = require('readline');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

// Usuario de prueba (Daniel)
const DANIEL = {
  email: 'dverdugo85@gmail.com',
  uid: 'sU8xLiwQWNXmbYdR63p1uO6TSm72',
  name: 'Daniel'
};

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

/**
 * Generar geohash simplificado para Chile
 */
function generateChileGeohash() {
  const chileGeohashes = [
    '66m', // Santiago centro
    '66q', // Santiago oriente
    '66k', // Santiago poniente
    '66h', // Valparaíso
    '66j', // Viña del Mar
  ];
  
  return chileGeohashes[Math.floor(Math.random() * chileGeohashes.length)];
}

/**
 * Crear match con notificación automática
 */
async function createMatchWithNotification() {
  log('\n🎯 CREAR MATCH CON NOTIFICACIÓN', 'cyan');
  log('═'.repeat(60), 'cyan');
  
  const numMatches = await question('\n¿Cuántos matches crear? (1-10): ');
  const count = parseInt(numMatches);
  
  if (isNaN(count) || count < 1 || count > 10) {
    log('❌ Número inválido. Debe ser entre 1 y 10', 'red');
    rl.close();
    return;
  }
  
  // Verificar FCM token de Daniel
  log('\n🔍 Verificando FCM token de Daniel...', 'yellow');
  const danielDoc = await db.collection('users').doc(DANIEL.uid).get();
  const danielData = danielDoc.data();
  const danielFcmToken = danielData?.fcmToken;
  
  if (!danielFcmToken) {
    log('⚠️  Daniel no tiene FCM token registrado', 'yellow');
    log('💡 Para recibir notificaciones, asegúrate de que la app esté instalada', 'cyan');
  } else {
    log(`✅ FCM Token encontrado: ${danielFcmToken.substring(0, 30)}...`, 'green');
  }
  
  const testUsers = [
    { name: 'Isabella', lastName: 'López', type: 'SUGAR_BABY', age: 23 },
    { name: 'Valentina', lastName: 'Martínez', type: 'SUGAR_BABY', age: 25 },
    { name: 'Camila', lastName: 'García', type: 'SUGAR_MOMMY', age: 32 },
    { name: 'Sofía', lastName: 'Rodríguez', type: 'SUGAR_BABY', age: 24 },
    { name: 'Martina', lastName: 'Fernández', type: 'SUGAR_BABY', age: 26 },
    { name: 'Lucía', lastName: 'Silva', type: 'SUGAR_BABY', age: 22 },
    { name: 'Emma', lastName: 'Torres', type: 'SUGAR_BABY', age: 27 },
    { name: 'Daniela', lastName: 'Morales', type: 'SUGAR_MOMMY', age: 30 },
    { name: 'Victoria', lastName: 'Castro', type: 'SUGAR_BABY', age: 24 },
    { name: 'Carolina', lastName: 'Flores', type: 'SUGAR_BABY', age: 25 },
  ];
  
  log(`\n🔄 Creando ${count} matches con notificaciones...\n`, 'yellow');
  
  const created = [];
  
  for (let i = 0; i < count; i++) {
    const user = testUsers[i];
    const fullName = `${user.name} ${user.lastName}`;
    const email = `match_test_${Date.now()}_${i}@blacksugar.test`;
    
    try {
      log(`\n📦 ${i + 1}/${count} - Creando ${fullName}...`, 'cyan');
      
      // 1. Crear usuario en Auth
      log('   1️⃣  Creando en Firebase Auth...', 'reset');
      const userRecord = await auth.createUser({
        email: email,
        password: 'Test1234!',
        displayName: fullName
      });
      
      const userId = userRecord.uid;
      log(`   ✅ Usuario Auth creado: ${userId}`, 'green');
      
      // 2. Calcular birthDate desde edad
      const birthYear = new Date().getFullYear() - user.age;
      const birthDate = new Date(birthYear, 0, 1);
      
      // 3. Crear documento completo en 'users' collection
      log('   2️⃣  Creando documento en collection "users"...', 'reset');
      await db.collection('users').doc(userId).set({
        // Campos básicos
        name: fullName,
        email: email,
        male: false, // Todas mujeres para Daniel
        birthDate: admin.firestore.Timestamp.fromDate(birthDate),
        
        // Orientación y preferencias
        orientation: 'men', // Buscan hombres
        userType: user.type,
        
        // Ubicación
        city: 'Santiago',
        g: generateChileGeohash(),
        latitude: -33.4489,
        longitude: -70.6693,
        
        // Configuración
        minAge: 18,
        maxAge: 99,
        maxDistance: 200,
        
        // Estado (CRÍTICO para iOS - estos campos son verificados por el filtro)
        paused: false,        // Si true, usuario NO aparece en matches iOS
        visible: true,        // Usuario visible en la app
        blocked: false,       // Si true, match se ELIMINA automáticamente
        accountStatus: 'active', // 🔥 CRÍTICO: iOS filtra si !== "active"
        
        // Metadatos
        isTest: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      log(`   ✅ Documento en "users" creado`, 'green');
      
      // 4. También crear en 'profiles' para compatibilidad
      log('   3️⃣  Creando documento en collection "profiles"...', 'reset');
      await db.collection('profiles').doc(userId).set({
        name: fullName,
        gender: 'female',
        userType: user.type,
        age: user.age,
        city: 'Santiago',
        isTest: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      log(`   ✅ Documento en "profiles" creado`, 'green');
      
      // 5. Crear match (esto disparará la Cloud Function onMatchCreated)
      log('   4️⃣  Creando match (disparará notificación)...', 'reset');
      
      const matchId = [DANIEL.uid, userId].sort().join('_');
      const now = admin.firestore.Timestamp.now();
      
      await db.collection('matches').doc(matchId).set({
        // IDs de usuarios
        userId1: DANIEL.uid,
        userId2: userId,
        usersMatched: [DANIEL.uid, userId],
        
        // Timestamps
        timestamp: now,
        createdAt: now,
        
        // Mensaje inicial
        lastMessage: `¡Hola! Tenemos un match 💕`,
        lastMessageSeq: 1,
        lastMessageTimestamp: now,
        
        // Metadatos
        isTest: true,
        
        // La Cloud Function agregará estos campos después de enviar notificación:
        // - notificationSent: true/false
        // - notificationSentAt: Timestamp
        // - notificationSkipReason: string (si no se envió)
      });
      
      log(`   ✅ Match creado: ${matchId}`, 'green');
      
      // 6. Esperar un momento para que la Cloud Function procese
      log('   ⏳ Esperando Cloud Function (2 segundos)...', 'yellow');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 7. Verificar si la notificación se envió
      const matchDoc = await db.collection('matches').doc(matchId).get();
      const matchData = matchDoc.data();
      
      if (matchData.notificationSent) {
        log(`   ✅ Notificación enviada exitosamente`, 'green');
      } else if (matchData.notificationSkipReason) {
        log(`   ⚠️  Notificación no enviada: ${matchData.notificationSkipReason}`, 'yellow');
      } else {
        log(`   ⏳ Notificación en proceso...`, 'yellow');
      }
      
      created.push({
        name: fullName,
        userId: userId,
        matchId: matchId,
        email: email,
        notificationSent: matchData.notificationSent || false
      });
      
      log(`   🎉 ${fullName} - COMPLETADO`, 'bright');
      
    } catch (error) {
      log(`   ❌ Error creando ${fullName}: ${error.message}`, 'red');
    }
  }
  
  // Resumen
  log('\n\n📊 RESUMEN', 'cyan');
  log('═'.repeat(60), 'cyan');
  log(`\n✅ Matches creados: ${created.length}/${count}`, 'green');
  
  const withNotification = created.filter(m => m.notificationSent).length;
  log(`📲 Notificaciones enviadas: ${withNotification}/${created.length}`, 
      withNotification > 0 ? 'green' : 'yellow');
  
  log('\n📋 Lista de matches:\n', 'cyan');
  created.forEach((match, idx) => {
    log(`${idx + 1}. ${match.name}`, 'bright');
    log(`   Match ID: ${match.matchId}`, 'reset');
    log(`   Email: ${match.email}`, 'reset');
    log(`   Notificación: ${match.notificationSent ? '✅ Enviada' : '⚠️ Pendiente'}`, 
        match.notificationSent ? 'green' : 'yellow');
  });
  
  log('\n\n💡 VERIFICACIÓN EN LA APP:', 'cyan');
  log('═'.repeat(60), 'cyan');
  log('\n1. Abre la app de BlackSugar21 en el dispositivo de Daniel', 'yellow');
  log('2. Deberías ver notificación(es) de nuevo match', 'yellow');
  log('3. Abre la app → ve a la pestaña Matches', 'yellow');
  log('4. Deberías ver los nuevos matches en la lista', 'green');
  log('5. Cada match debe mostrar: "¡Hola! Tenemos un match 💕"', 'reset');
  
  log('\n\n📱 FLUJO DE ACTUALIZACIÓN:', 'cyan');
  log('═'.repeat(60), 'cyan');
  log('\n1. Cloud Function detecta nuevo match → envía notificación', 'reset');
  log('2. App recibe notificación push → muestra badge', 'reset');
  log('3. Usuario abre app → Firestore listener detecta cambios', 'reset');
  log('4. Lista de matches se actualiza automáticamente', 'green');
  
  log('\n\n🔍 VERIFICAR EN FIREBASE CONSOLE:', 'cyan');
  log('═'.repeat(60), 'cyan');
  log('\n1. Firestore → matches → buscar IDs creados', 'reset');
  log('2. Functions → Logs → buscar "onMatchCreated"', 'reset');
  log('3. Verificar que notificationSent = true', 'reset');
  
  rl.close();
}

// Ejecutar
createMatchWithNotification().catch(error => {
  log(`\n❌ ERROR FATAL: ${error.message}`, 'red');
  console.error(error);
  rl.close();
  process.exit(1);
});
