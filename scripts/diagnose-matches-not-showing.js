#!/usr/bin/env node

/**
 * 🔍 DIAGNÓSTICO: Por qué los matches no aparecen
 * 
 * Verifica TODOS los campos y condiciones que iOS revisa
 * para mostrar un match en la lista.
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

const USERS = {
  DANIEL: 'sU8xLiwQWNXmbYdR63p1uO6TSm72',
  ROSITA: 'DsDSK5xqEZZXAIKxtIKyBGntw8f2'
};

(async () => {
  try {
    log('\n🔍 DIAGNÓSTICO COMPLETO - Por qué no aparecen matches', 'cyan');
    log('═'.repeat(80), 'cyan');
    
    // Seleccionar usuario
    console.log('\n¿Para qué usuario verificar?');
    console.log('1. Daniel (sU8xLiwQWNXmbYdR63p1uO6TSm72)');
    console.log('2. Rosita (DsDSK5xqEZZXAIKxtIKyBGntw8f2)');
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise(resolve => {
      rl.question('\nSelecciona (1-2): ', resolve);
    });
    rl.close();
    
    const userId = answer === '2' ? USERS.ROSITA : USERS.DANIEL;
    const userName = answer === '2' ? 'Rosita' : 'Daniel';
    
    log(`\n✅ Verificando para: ${userName}`, 'green');
    log(`   UID: ${userId}`, 'reset');
    
    // 1. Verificar usuario principal
    log('\n\n━'.repeat(40), 'cyan');
    log('1️⃣  USUARIO PRINCIPAL', 'cyan');
    log('━'.repeat(40), 'cyan');
    
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      log('❌ Usuario NO EXISTE en Firestore', 'red');
      process.exit(1);
    }
    
    const userData = userDoc.data();
    log('✅ Usuario existe', 'green');
    log(`   Nombre: ${userData.name}`, 'reset');
    log(`   Email: ${userData.email}`, 'reset');
    
    // Verificar campos críticos del usuario principal
    log('\n📋 Campos críticos del usuario:', 'yellow');
    const criticalFields = {
      accountStatus: { expected: 'active', critical: true },
      paused: { expected: false, critical: true },
      blocked: { expected: false, critical: true },
      visible: { expected: true, critical: false }
    };
    
    let userOK = true;
    for (const [field, config] of Object.entries(criticalFields)) {
      const value = userData[field];
      const isOK = value === config.expected;
      const icon = isOK ? '✅' : (config.critical ? '❌' : '⚠️');
      
      log(`   ${icon} ${field}: ${JSON.stringify(value)} ${!isOK ? `(debe ser ${JSON.stringify(config.expected)})` : ''}`, 
          isOK ? 'reset' : 'yellow');
      
      if (!isOK && config.critical) {
        userOK = false;
      }
    }
    
    if (!userOK) {
      log('\n❌ PROBLEMA ENCONTRADO: El usuario principal tiene campos críticos incorrectos', 'red');
      log('💡 Ejecuta: node fix-account-status.js', 'cyan');
    }
    
    // 2. Buscar matches
    log('\n\n━'.repeat(40), 'cyan');
    log('2️⃣  MATCHES EN FIRESTORE', 'cyan');
    log('━'.repeat(40), 'cyan');
    
    const matchesSnapshot = await db.collection('matches')
      .where('usersMatched', 'array-contains', userId)
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();
    
    if (matchesSnapshot.empty) {
      log('❌ NO HAY MATCHES en Firestore', 'red');
      log('💡 Crea matches con: node test-master.js → opción 1', 'cyan');
      process.exit(0);
    }
    
    log(`✅ Encontrados ${matchesSnapshot.size} matches en Firestore`, 'green');
    
    // 3. Verificar cada match
    log('\n\n━'.repeat(40), 'cyan');
    log('3️⃣  ANÁLISIS DETALLADO DE CADA MATCH', 'cyan');
    log('━'.repeat(40), 'cyan');
    
    let matchesOK = 0;
    let matchesProblems = 0;
    
    for (const matchDoc of matchesSnapshot.docs) {
      const matchData = matchDoc.data();
      const matchId = matchDoc.id;
      
      // Determinar el otro usuario
      const otherUserId = matchData.userId1 === userId ? matchData.userId2 : matchData.userId1;
      
      log(`\n📊 Match: ${matchId}`, 'cyan');
      log(`   Timestamp: ${matchData.timestamp?.toDate()}`, 'reset');
      
      // Verificar campos del match
      log('   📋 Campos del match:', 'yellow');
      
      const matchFields = {
        usersMatched: matchData.usersMatched,
        userId1: matchData.userId1,
        userId2: matchData.userId2,
        timestamp: matchData.timestamp ? '✅' : '❌',
        createdAt: matchData.createdAt ? '✅' : '❌'
      };
      
      let matchOK = true;
      
      // Verificar usersMatched
      if (!matchData.usersMatched || !Array.isArray(matchData.usersMatched)) {
        log('      ❌ usersMatched: NO ES ARRAY', 'red');
        matchOK = false;
      } else if (!matchData.usersMatched.includes(userId)) {
        log(`      ❌ usersMatched: NO incluye a ${userName}`, 'red');
        matchOK = false;
      } else {
        log(`      ✅ usersMatched: [${matchData.usersMatched.join(', ')}]`, 'green');
      }
      
      if (!matchData.timestamp) {
        log('      ❌ timestamp: NO EXISTE', 'red');
        matchOK = false;
      }
      
      // Verificar otro usuario
      log(`\n   👤 Otro usuario: ${otherUserId}`, 'yellow');
      
      if (!otherUserId) {
        log('      ❌ OTRO USUARIO NO DEFINIDO → Match inválido', 'red');
        matchOK = false;
        matchesProblems++;
        continue;
      }
      
      const otherUserDoc = await db.collection('users').doc(otherUserId).get();
      
      if (!otherUserDoc.exists) {
        log('      ❌ USUARIO NO EXISTE → iOS eliminará este match', 'red');
        matchOK = false;
      } else {
        const otherUserData = otherUserDoc.data();
        log(`      ✅ Usuario existe: ${otherUserData.name}`, 'green');
        
        // Verificar campos críticos del otro usuario
        log('      📋 Campos críticos:', 'yellow');
        
        const checks = [
          { 
            field: 'accountStatus', 
            value: otherUserData.accountStatus,
            expected: 'active',
            behavior: 'iOS ELIMINA el match'
          },
          { 
            field: 'paused', 
            value: otherUserData.paused,
            expected: false,
            behavior: 'iOS OCULTA el match'
          },
          { 
            field: 'blocked', 
            value: otherUserData.blocked,
            expected: false,
            behavior: 'iOS ELIMINA el match'
          },
          { 
            field: 'visible', 
            value: otherUserData.visible,
            expected: true,
            behavior: 'Usuario oculto'
          }
        ];
        
        for (const check of checks) {
          const isOK = check.value === check.expected;
          const icon = isOK ? '✅' : '❌';
          
          if (isOK) {
            log(`         ${icon} ${check.field}: ${JSON.stringify(check.value)}`, 'green');
          } else {
            log(`         ${icon} ${check.field}: ${JSON.stringify(check.value)} (debe ser ${JSON.stringify(check.expected)})`, 'red');
            log(`            → ${check.behavior}`, 'yellow');
            matchOK = false;
          }
        }
      }
      
      if (matchOK) {
        matchesOK++;
        log('\n   ✅ Este match DEBERÍA aparecer en iOS', 'green');
      } else {
        matchesProblems++;
        log('\n   ❌ Este match NO aparecerá en iOS', 'red');
      }
    }
    
    // 4. Resumen final
    log('\n\n━'.repeat(40), 'cyan');
    log('4️⃣  RESUMEN Y RECOMENDACIONES', 'cyan');
    log('━'.repeat(40), 'cyan');
    
    log(`\n📊 Matches en Firestore: ${matchesSnapshot.size}`, 'reset');
    log(`   ✅ Matches válidos (deberían aparecer): ${matchesOK}`, 'green');
    log(`   ❌ Matches con problemas (NO aparecerán): ${matchesProblems}`, 'red');
    
    if (matchesProblems > 0) {
      log('\n🔧 SOLUCIONES:', 'yellow');
      log('   1. Ejecutar: node fix-account-status.js', 'cyan');
      log('      → Corrige campos de usuarios existentes', 'reset');
      log('', 'reset');
      log('   2. Ejecutar: node validate-test-users.js', 'cyan');
      log('      → Valida y corrige usuarios de prueba', 'reset');
      log('', 'reset');
      log('   3. Crear nuevos matches: node test-master.js → opción 1', 'cyan');
      log('      → Los nuevos ya tendrán campos correctos', 'reset');
    } else {
      log('\n✅ TODOS LOS MATCHES SON VÁLIDOS', 'green');
      log('', 'reset');
      log('💡 Si aún no aparecen en la app:', 'cyan');
      log('   1. Cierra la app completamente (swipe up)', 'reset');
      log('   2. Espera 5 segundos', 'reset');
      log('   3. Reabre la app', 'reset');
      log('   4. Ve a la sección de Matches', 'reset');
    }
    
    log('\n═'.repeat(80), 'cyan');
    process.exit(0);
    
  } catch (error) {
    log(`\n❌ ERROR: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
})();
