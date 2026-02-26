#!/usr/bin/env node

/**
 * 🔍 Diagnóstico iOS - Matches No Aparecen
 * 
 * Verifica:
 * 1. Matches existen en Firestore
 * 2. Campo usersMatched está correcto
 * 3. Daniel está en el array usersMatched
 * 4. Todos los campos requeridos por iOS están presentes
 * 5. Compara con el último match que SÍ funcionó
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const DANIEL_UID = 'sU8xLiwQWNXmbYdR63p1uO6TSm72';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

(async () => {
  try {
    log('\n🔍 DIAGNÓSTICO iOS - MATCHES', 'cyan');
    log('═'.repeat(70), 'cyan');
    
    // 1. Obtener todos los matches de Daniel
    log('\n1️⃣  Consultando matches en Firestore...', 'yellow');
    
    const matchesSnapshot = await db.collection('matches')
      .where('usersMatched', 'array-contains', DANIEL_UID)
      .get();
    
    if (matchesSnapshot.empty) {
      log('❌ NO HAY MATCHES en Firestore', 'red');
      log('💡 Primero crea matches con: node test-master.js', 'cyan');
      process.exit(1);
    }
    
    log(`✅ Encontrados ${matchesSnapshot.size} matches\n`, 'green');
    
    // 2. Analizar cada match
    log('2️⃣  Analizando estructura de cada match:\n', 'yellow');
    
    const matches = [];
    
    for (const doc of matchesSnapshot.docs) {
      const data = doc.data();
      const matchId = doc.id;
      
      // Verificar campos requeridos por iOS
      const requiredFields = {
        'usersMatched': data.usersMatched,
        'timestamp': data.timestamp,
        'lastMessageTimestamp': data.lastMessageTimestamp,
        'lastMessage': data.lastMessage,
        'lastMessageSeq': data.lastMessageSeq
      };
      
      const missingFields = [];
      const presentFields = [];
      
      for (const [field, value] of Object.entries(requiredFields)) {
        if (value === undefined || value === null) {
          missingFields.push(field);
        } else {
          presentFields.push(field);
        }
      }
      
      matches.push({
        matchId,
        data,
        missingFields,
        presentFields
      });
    }
    
    // 3. Mostrar el match más reciente (el que debería aparecer primero)
    matches.sort((a, b) => {
      const timeA = a.data.lastMessageTimestamp?.toMillis() || a.data.timestamp?.toMillis() || 0;
      const timeB = b.data.lastMessageTimestamp?.toMillis() || b.data.timestamp?.toMillis() || 0;
      return timeB - timeA;
    });
    
    const mostRecent = matches[0];
    
    log('📊 MATCH MÁS RECIENTE (debería aparecer primero en la app):\n', 'bright');
    log(`Match ID: ${mostRecent.matchId}`, 'reset');
    log(`userId1: ${mostRecent.data.userId1}`, 'reset');
    log(`userId2: ${mostRecent.data.userId2}`, 'reset');
    
    // Verificar usersMatched
    if (mostRecent.data.usersMatched && Array.isArray(mostRecent.data.usersMatched)) {
      log(`\nusersMatched: [`, 'reset');
      mostRecent.data.usersMatched.forEach(uid => {
        const isDaniel = uid === DANIEL_UID;
        log(`  "${uid}"${isDaniel ? ' ← Daniel' : ''}`, isDaniel ? 'green' : 'reset');
      });
      log(`]`, 'reset');
      
      if (mostRecent.data.usersMatched.includes(DANIEL_UID)) {
        log('✅ Daniel SÍ está en usersMatched', 'green');
      } else {
        log('❌ Daniel NO está en usersMatched', 'red');
        log('⚠️  Este es el problema: la app iOS no detectará este match', 'yellow');
      }
    } else {
      log('❌ Campo usersMatched NO ES un array', 'red');
    }
    
    log(`\ntimestamp: ${mostRecent.data.timestamp?.toDate().toISOString()}`, 'reset');
    log(`lastMessageTimestamp: ${mostRecent.data.lastMessageTimestamp?.toDate().toISOString()}`, 'reset');
    log(`lastMessage: "${mostRecent.data.lastMessage}"`, 'reset');
    log(`lastMessageSeq: ${mostRecent.data.lastMessageSeq}`, 'reset');
    log(`notificationSent: ${mostRecent.data.notificationSent || false}`, 'reset');
    
    // 4. Verificar campos faltantes
    log('\n', 'reset');
    if (mostRecent.missingFields.length > 0) {
      log(`⚠️  Campos faltantes: ${mostRecent.missingFields.join(', ')}`, 'yellow');
    } else {
      log('✅ Todos los campos requeridos están presentes', 'green');
    }
    
    // 5. Verificar otros matches
    log('\n3️⃣  Resumen de todos los matches:\n', 'yellow');
    
    matches.forEach((match, idx) => {
      const otherUserId = match.data.userId1 === DANIEL_UID ? match.data.userId2 : match.data.userId1;
      const time = match.data.lastMessageTimestamp?.toDate() || match.data.timestamp?.toDate();
      
      log(`${idx + 1}. Match ${match.matchId.substring(0, 20)}...`, 'reset');
      log(`   Otro usuario: ${otherUserId}`, 'reset');
      log(`   Timestamp: ${time?.toISOString()}`, 'reset');
      log(`   Campos OK: ${match.presentFields.length}/5`, match.missingFields.length === 0 ? 'green' : 'yellow');
      if (match.missingFields.length > 0) {
        log(`   Faltantes: ${match.missingFields.join(', ')}`, 'red');
      }
      log('', 'reset');
    });
    
    // 6. Verificar query que usa iOS
    log('4️⃣  Verificando query de iOS:\n', 'yellow');
    log('La app iOS usa esta query:', 'reset');
    log('  db.collection("matches")', 'cyan');
    log('    .whereField("usersMatched", arrayContains: userId)', 'cyan');
    log('', 'reset');
    
    const iosMatches = matches.filter(m => 
      m.data.usersMatched && 
      Array.isArray(m.data.usersMatched) && 
      m.data.usersMatched.includes(DANIEL_UID)
    );
    
    log(`Matches que iOS DEBERÍA detectar: ${iosMatches.length}/${matches.length}`, 
        iosMatches.length === matches.length ? 'green' : 'yellow');
    
    if (iosMatches.length < matches.length) {
      log(`⚠️  ${matches.length - iosMatches.length} matches NO serán detectados`, 'yellow');
    }
    
    // 7. Conclusión y recomendaciones
    log('\n═'.repeat(70), 'cyan');
    log('📋 CONCLUSIÓN:', 'bright');
    log('', 'reset');
    
    if (iosMatches.length === 0) {
      log('❌ NO HAY MATCHES VÁLIDOS para iOS', 'red');
      log('', 'reset');
      log('Problema: Ningún match tiene el campo usersMatched correcto', 'yellow');
      log('Solución: Recrear los matches con el script:', 'cyan');
      log('  cd /Users/daniel/IdeaProjects/Public-BlackSugar21/scripts', 'reset');
      log('  node test-master.js', 'reset');
      log('  → Opción 1: Crear matches con notificaciones', 'reset');
    } else {
      log(`✅ HAY ${iosMatches.length} MATCHES VÁLIDOS en Firestore`, 'green');
      log('', 'reset');
      log('Posibles causas de que NO aparezcan en la app iOS:', 'yellow');
      log('', 'reset');
      log('1. 🔄 Cache de Firestore', 'bright');
      log('   Solución: Cerrar app completamente y reabrir', 'reset');
      log('   - Swipe up para cerrar (no solo minimizar)', 'reset');
      log('   - Esperar 5 segundos', 'reset');
      log('   - Reabrir la app', 'reset');
      log('', 'reset');
      log('2. 📡 Listener no está activo', 'bright');
      log('   Solución: Ver logs de Xcode para verificar:', 'reset');
      log('   - "🔔 [LISTENER] Iniciando listener"', 'reset');
      log('   - "🔔 [LISTENER] Procesando X matches"', 'reset');
      log('   - "✨ [LISTENER] X MATCHES NUEVOS detectados"', 'reset');
      log('', 'reset');
      log('3. 🌐 Sin conexión a internet', 'bright');
      log('   Solución: Verificar que el simulador/dispositivo tenga internet', 'reset');
      log('', 'reset');
      log('4. 🚫 Firestore en modo offline', 'bright');
      log('   Solución: Limpiar datos de la app y reinstalar', 'reset');
    }
    
    log('\n═'.repeat(70), 'cyan');
    log('💡 ACCIÓN RECOMENDADA:', 'bright');
    log('', 'reset');
    log('1. Cerrar la app iOS completamente (swipe up)', 'reset');
    log('2. Esperar 5 segundos', 'reset');
    log('3. Reabrir la app', 'reset');
    log('4. Ir a Matches tab', 'reset');
    log('5. Esperar 10 segundos (para que Firestore sincronice)', 'reset');
    log('6. Pull to refresh (deslizar hacia abajo)', 'reset');
    log('', 'reset');
    log('Si después de esto NO aparecen, el problema está en el listener.', 'yellow');
    log('Revisa los logs de Xcode para ver si hay errores.', 'yellow');
    
    process.exit(0);
    
  } catch (error) {
    log(`\n❌ ERROR: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
})();
