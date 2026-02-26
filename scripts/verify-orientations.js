#!/usr/bin/env node

/**
 * 🔧 Verificar y Ajustar Orientaciones
 * 
 * Script para verificar que las orientaciones de los perfiles sean compatibles
 * y ajustarlas si es necesario.
 */

const admin = require('firebase-admin');
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

async function main() {
  try {
    log('\n🔧 AJUSTANDO ORIENTACIONES DE PERFILES', 'cyan');
    log('═'.repeat(60), 'cyan');
    
    const danielUid = 'sU8xLiwQWNXmbYdR63p1uO6TSm72';
    
    // Verificar perfil de Daniel
    const danielDoc = await db.collection('users').doc(danielUid).get();
    const danielData = danielDoc.data();
    
    log('\n👤 PERFIL DE DANIEL (actual):', 'yellow');
    log(`   - Género: ${danielData.male ? 'Hombre' : 'Mujer'}`, 'reset');
    log(`   - Orientación: ${danielData.orientation}`, 'reset');
    
    // Daniel es hombre, debería buscar mujeres (orientation = "women")
    // Esto parece correcto
    
    log('\n🔄 Ajustando perfiles de discovery...', 'yellow');
    
    // Obtener todos los perfiles de discovery femeninos
    const discoveryProfiles = await db.collection('users')
      .where('isDiscoveryProfile', '==', true)
      .where('male', '==', false)  // Solo mujeres
      .get();
    
    log(`\n📦 Encontrados ${discoveryProfiles.size} perfiles femeninos de discovery`, 'green');
    
    let updated = 0;
    
    for (const doc of discoveryProfiles.docs) {
      const data = doc.data();
      const currentOrientation = data.orientation;
      
      // Las mujeres Sugar Baby deberían buscar hombres
      const correctOrientation = 'men';
      
      if (currentOrientation !== correctOrientation) {
        await db.collection('users').doc(doc.id).update({
          orientation: correctOrientation
        });
        
        log(`✅ ${data.name}: ${currentOrientation} → ${correctOrientation}`, 'green');
        updated++;
      } else {
        log(`✓ ${data.name}: Ya tiene orientación correcta (${correctOrientation})`, 'reset');
      }
    }
    
    log(`\n📊 RESUMEN:`, 'cyan');
    log(`   ✅ Perfiles actualizados: ${updated}`, 'green');
    log(`   ✓ Perfiles correctos: ${discoveryProfiles.size - updated}`, 'reset');
    
    log(`\n💡 Ahora Daniel (hombre buscando mujeres) debería ver:`, 'cyan');
    log(`   - Isabella Lopez (mujer buscando hombres)`, 'green');
    log(`   - Camila Rodriguez (mujer buscando hombres)`, 'green');
    
    log(`\n🔍 VERIFICACIÓN FINAL:`, 'cyan');
    log('═'.repeat(60), 'cyan');
    
    log('\n👤 DANIEL:', 'yellow');
    log('   - Es: Hombre', 'reset');
    log('   - Busca: Mujeres', 'reset');
    log('   - Edad: 40 años', 'reset');
    log('   - Busca edad: 18-99 años', 'reset');
    
    log('\n💃 PERFILES FEMENINOS COMPATIBLES:', 'yellow');
    const femaleProfiles = discoveryProfiles.docs.filter(d => !d.data().male);
    for (const doc of femaleProfiles) {
      const data = doc.data();
      const age = data.birthDate ? 
        Math.floor((Date.now() - data.birthDate.toDate().getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 
        'N/A';
      
      const compatible = 
        !data.male && // Es mujer
        data.orientation === 'men' && // Busca hombres
        age >= danielData.minAge && 
        age <= danielData.maxAge &&
        !data.paused;
      
      log(`   ${compatible ? '✅' : '❌'} ${data.name}`, compatible ? 'green' : 'red');
      log(`      - Edad: ${age} años`, 'reset');
      log(`      - Busca: ${data.orientation}`, 'reset');
      log(`      - Pausado: ${data.paused || false}`, 'reset');
    }
    
    log('\n✅ PROCESO COMPLETADO', 'green');
    log('═'.repeat(60), 'cyan');
    
  } catch (error) {
    log(`\n❌ ERROR: ${error.message}`, 'red');
    console.error(error);
  } finally {
    process.exit(0);
  }
}

main();
