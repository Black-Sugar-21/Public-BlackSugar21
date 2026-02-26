#!/usr/bin/env node

/**
 * ✅ Validación de Usuarios de Prueba
 * 
 * Verifica que todos los usuarios de prueba tengan los campos críticos
 * que iOS requiere para mostrar los matches:
 * 
 * CAMPOS CRÍTICOS:
 * - accountStatus: debe ser "active" (si no existe o es diferente, iOS filtra)
 * - paused: debe ser false (si es true, iOS oculta temporalmente)
 * - blocked: debe ser false (si es true, iOS elimina el match)
 * - visible: debe ser true
 * 
 * Este script encuentra usuarios con problemas y ofrece corregirlos.
 */

const admin = require('firebase-admin');
const readline = require('readline');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

(async () => {
  try {
    log('\n✅ VALIDACIÓN DE USUARIOS DE PRUEBA', 'cyan');
    log('═'.repeat(70), 'cyan');
    
    log('\n🔍 Buscando usuarios de prueba...', 'yellow');
    
    // Buscar usuarios de prueba
    const usersSnapshot = await db.collection('users')
      .where('isTest', '==', true)
      .get();
    
    if (usersSnapshot.empty) {
      log('\n⚠️  No hay usuarios de prueba', 'yellow');
      rl.close();
      process.exit(0);
    }
    
    log(`\n📦 Encontrados ${usersSnapshot.size} usuarios de prueba\n`, 'green');
    
    // Analizar cada usuario
    const problematicUsers = [];
    const okUsers = [];
    
    for (const doc of usersSnapshot.docs) {
      const data = doc.data();
      const userId = doc.id;
      const name = data.name || 'Usuario sin nombre';
      
      const issues = [];
      
      // Verificar accountStatus
      if (!data.accountStatus) {
        issues.push('❌ accountStatus: NO EXISTE → iOS filtrará este usuario');
      } else if (data.accountStatus !== 'active') {
        issues.push(`❌ accountStatus: "${data.accountStatus}" → iOS requiere "active"`);
      }
      
      // Verificar paused
      if (data.paused === true) {
        issues.push('⚠️  paused: true → Usuario NO aparecerá en matches iOS');
      } else if (data.paused === undefined) {
        issues.push('⚠️  paused: undefined → Puede causar problemas');
      }
      
      // Verificar blocked
      if (data.blocked === true) {
        issues.push('❌ blocked: true → Match se ELIMINARÁ automáticamente');
      } else if (data.blocked === undefined) {
        issues.push('⚠️  blocked: undefined → Puede causar problemas');
      }
      
      // Verificar visible
      if (data.visible === false) {
        issues.push('⚠️  visible: false → Usuario oculto');
      } else if (data.visible === undefined) {
        issues.push('⚠️  visible: undefined → Puede causar problemas');
      }
      
      if (issues.length > 0) {
        problematicUsers.push({
          userId,
          name,
          issues,
          data
        });
      } else {
        okUsers.push({ userId, name });
      }
    }
    
    // Mostrar resultados
    log('📊 RESULTADOS DE VALIDACIÓN:\n', 'bright');
    
    if (okUsers.length > 0) {
      log(`✅ ${okUsers.length} usuarios OK (todos los campos correctos)`, 'green');
    }
    
    if (problematicUsers.length > 0) {
      log(`❌ ${problematicUsers.length} usuarios CON PROBLEMAS\n`, 'red');
      
      log('═'.repeat(70), 'yellow');
      log('USUARIOS CON PROBLEMAS:', 'bright');
      log('═'.repeat(70), 'yellow');
      
      problematicUsers.forEach((user, idx) => {
        log(`\n${idx + 1}. ${user.name}`, 'bright');
        log(`   User ID: ${user.userId}`, 'reset');
        user.issues.forEach(issue => {
          log(`   ${issue}`, 'yellow');
        });
      });
      
      log('\n═'.repeat(70), 'yellow');
      
      // Ofrecer corrección automática
      log('\n💡 ¿Deseas corregir estos usuarios automáticamente?', 'cyan');
      log('   Se aplicarán los siguientes valores:', 'reset');
      log('   - accountStatus: "active"', 'green');
      log('   - paused: false', 'green');
      log('   - blocked: false', 'green');
      log('   - visible: true', 'green');
      
      const answer = await question('\n¿Corregir? (S/N): ');
      
      if (answer.toUpperCase() === 'S') {
        log('\n🔧 Corrigiendo usuarios...\n', 'yellow');
        
        let fixed = 0;
        
        for (const user of problematicUsers) {
          try {
            await db.collection('users').doc(user.userId).update({
              accountStatus: 'active',
              paused: false,
              blocked: false,
              visible: true,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            
            fixed++;
            log(`✅ ${fixed}. ${user.name} - Corregido`, 'green');
          } catch (error) {
            log(`❌ Error en ${user.name}: ${error.message}`, 'red');
          }
        }
        
        log(`\n📊 RESUMEN:`, 'cyan');
        log(`   ✅ Usuarios corregidos: ${fixed}/${problematicUsers.length}`, 'green');
        log(`\n💡 Ahora cierra y reabre la app iOS para ver los cambios`, 'cyan');
      } else {
        log('\n⏭️  Corrección cancelada', 'yellow');
      }
    } else {
      log('\n🎉 ¡Todos los usuarios tienen los campos correctos!', 'green');
      log('   Los matches deberían aparecer en iOS sin problemas', 'cyan');
    }
    
    log('\n═'.repeat(70), 'cyan');
    log('📋 CAMPOS CRÍTICOS PARA iOS:', 'bright');
    log('', 'reset');
    log('1. accountStatus: "active"', 'reset');
    log('   ❌ Si no existe o !== "active" → iOS FILTRA el match', 'yellow');
    log('', 'reset');
    log('2. paused: false', 'reset');
    log('   ⚠️  Si es true → iOS OCULTA temporalmente', 'yellow');
    log('', 'reset');
    log('3. blocked: false', 'reset');
    log('   ❌ Si es true → iOS ELIMINA el match', 'yellow');
    log('', 'reset');
    log('4. visible: true', 'reset');
    log('   ℹ️  Control de visibilidad general', 'yellow');
    log('═'.repeat(70), 'cyan');
    
    rl.close();
    process.exit(0);
    
  } catch (error) {
    log(`\n❌ ERROR: ${error.message}`, 'red');
    console.error(error);
    rl.close();
    process.exit(1);
  }
})();
