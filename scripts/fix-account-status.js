#!/usr/bin/env node

/**
 * 🔧 Corregir Usuarios Existentes - Agregar accountStatus
 * 
 * Este script agrega el campo accountStatus: 'active' a todos los
 * usuarios de prueba que no lo tienen, para que iOS no los filtre.
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

(async () => {
  try {
    log('\n🔧 CORRIGIENDO USUARIOS EXISTENTES', 'cyan');
    log('═'.repeat(60), 'cyan');
    
    log('\n1️⃣  Buscando usuarios sin accountStatus...', 'yellow');
    
    // Buscar usuarios de prueba (isTest = true)
    const usersSnapshot = await db.collection('users')
      .where('isTest', '==', true)
      .get();
    
    log(`\n📦 Encontrados ${usersSnapshot.size} usuarios de prueba\n`, 'yellow');
    
    let updated = 0;
    let skipped = 0;
    
    for (const doc of usersSnapshot.docs) {
      const data = doc.data();
      const userId = doc.id;
      const name = data.name || 'Usuario';
      
      if (!data.accountStatus || data.accountStatus !== 'active') {
        // Actualizar usuario
        await db.collection('users').doc(userId).update({
          accountStatus: 'active'
        });
        
        updated++;
        log(`✅ ${updated}. ${name} - accountStatus agregado`, 'green');
      } else {
        skipped++;
      }
    }
    
    log(`\n📊 RESUMEN:`, 'cyan');
    log(`   ✅ Usuarios actualizados: ${updated}`, 'green');
    log(`   ⏭️  Usuarios ya tenían el campo: ${skipped}`, 'yellow');
    log(`   📱 Total procesados: ${usersSnapshot.size}`, 'reset');
    
    if (updated > 0) {
      log(`\n💡 Ahora cierra y reabre la app iOS para ver los matches`, 'cyan');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
})();
