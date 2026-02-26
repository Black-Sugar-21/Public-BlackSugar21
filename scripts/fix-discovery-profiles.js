#!/usr/bin/env node

/**
 * 🔧 Fix Discovery Profiles
 * 
 * Diagnóstico y corrección de perfiles de discovery que no aparecen en HomeView
 * 
 * Problema detectado:
 * - Los perfiles se crean en colección 'profiles' 
 * - La Cloud Function getCompatibleProfileIds busca en colección 'users'
 * - Faltan campos requeridos: male, birthDate, orientation, paused, g (geohash), etc.
 * 
 * Solución:
 * 1. Diagnosticar perfiles de discovery existentes
 * 2. Crear documentos en colección 'users' con todos los campos requeridos
 * 3. Verificar que aparezcan correctamente en HomeView
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Colores para consola
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

/**
 * Función para generar geohash simplificado (solo para testing)
 * En producción se debería usar la librería geofire-common
 */
function generateSimpleGeohash(lat, lon) {
  // Geohash simplificado para Chile
  // Santiago centro: lat -33.4489, lon -70.6693
  // Simplificamos usando prefijos conocidos para Chile
  const chileGeohashes = [
    '66m', // Santiago centro
    '66q', // Santiago oriente
    '66k', // Santiago poniente
    '66t', // Providencia/Las Condes
    '66h', // Región de Valparaíso
    '66j', // Viña del Mar
    '66f', // Concepción
  ];
  
  return chileGeohashes[Math.floor(Math.random() * chileGeohashes.length)];
}

/**
 * Diagnosticar perfiles de discovery existentes
 */
async function diagnoseDiscoveryProfiles() {
  log('\n🔍 DIAGNÓSTICO DE PERFILES DE DISCOVERY', 'cyan');
  log('═'.repeat(60), 'cyan');
  
  // 1. Buscar en colección 'profiles'
  log('\n📂 Buscando en colección "profiles"...', 'yellow');
  const profilesSnapshot = await db.collection('profiles')
    .where('isDiscoveryProfile', '==', true)
    .get();
  
  log(`   ✅ Encontrados ${profilesSnapshot.size} perfiles en "profiles"`, 'green');
  
  if (profilesSnapshot.size > 0) {
    log('\n   Primeros 5 perfiles:', 'reset');
    profilesSnapshot.docs.slice(0, 5).forEach((doc, idx) => {
      const data = doc.data();
      log(`   ${idx + 1}. ${data.name} - ${data.gender} - ${data.age} años - ${data.userType}`, 'reset');
      log(`      ID: ${doc.id}`, 'reset');
    });
  }
  
  // 2. Buscar en colección 'users'
  log('\n📂 Buscando en colección "users"...', 'yellow');
  const usersSnapshot = await db.collection('users')
    .where('isDiscoveryProfile', '==', true)
    .get();
  
  log(`   ${usersSnapshot.size > 0 ? '✅' : '⚠️'} Encontrados ${usersSnapshot.size} perfiles en "users"`, 
      usersSnapshot.size > 0 ? 'green' : 'yellow');
  
  if (usersSnapshot.size > 0) {
    log('\n   Primeros 5 perfiles:', 'reset');
    usersSnapshot.docs.slice(0, 5).forEach((doc, idx) => {
      const data = doc.data();
      const hasRequiredFields = !!(data.male !== undefined && data.birthDate && data.orientation && data.paused !== undefined);
      log(`   ${idx + 1}. ${data.name || 'Sin nombre'} - ${hasRequiredFields ? '✅' : '❌'} Campos requeridos`, 
          hasRequiredFields ? 'green' : 'red');
      log(`      ID: ${doc.id}`, 'reset');
      if (!hasRequiredFields) {
        log(`      Faltan campos: ${!data.male ? 'male, ' : ''}${!data.birthDate ? 'birthDate, ' : ''}${!data.orientation ? 'orientation, ' : ''}${data.paused === undefined ? 'paused' : ''}`, 'red');
      }
    });
  }
  
  // 3. Resultado
  log('\n📊 RESUMEN DEL DIAGNÓSTICO:', 'cyan');
  log('═'.repeat(60), 'cyan');
  
  if (profilesSnapshot.size > 0 && usersSnapshot.size === 0) {
    log('❌ PROBLEMA DETECTADO:', 'red');
    log('   - Los perfiles existen en colección "profiles"', 'yellow');
    log('   - Pero NO existen en colección "users"', 'red');
    log('   - La Cloud Function getCompatibleProfileIds busca en "users"', 'yellow');
    log('\n💡 SOLUCIÓN: Ejecutar la función fixDiscoveryProfiles()', 'cyan');
    return true; // Necesita corrección
  } else if (usersSnapshot.size > 0) {
    // Verificar si tienen todos los campos requeridos
    let needsFix = false;
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      if (!data.male !== undefined || !data.birthDate || !data.orientation || data.paused === undefined) {
        needsFix = true;
      }
    });
    
    if (needsFix) {
      log('⚠️ PROBLEMA PARCIAL:', 'yellow');
      log('   - Los perfiles existen en colección "users"', 'green');
      log('   - Pero algunos tienen campos faltantes', 'yellow');
      log('\n💡 SOLUCIÓN: Ejecutar la función fixDiscoveryProfiles()', 'cyan');
      return true;
    } else {
      log('✅ TODO CORRECTO:', 'green');
      log('   - Los perfiles existen en colección "users"', 'green');
      log('   - Tienen todos los campos requeridos', 'green');
      log('\n💡 Si no aparecen en la app, revisar filtros de orientación/edad', 'cyan');
      return false;
    }
  } else {
    log('⚠️ No se encontraron perfiles de discovery', 'yellow');
    log('\n💡 Primero crea perfiles con test-system-unified.js opción 5', 'cyan');
    return false;
  }
}

/**
 * Corregir perfiles de discovery
 */
async function fixDiscoveryProfiles() {
  log('\n🔧 CORRECCIÓN DE PERFILES DE DISCOVERY', 'cyan');
  log('═'.repeat(60), 'cyan');
  
  // Obtener perfiles de la colección 'profiles'
  const profilesSnapshot = await db.collection('profiles')
    .where('isDiscoveryProfile', '==', true)
    .get();
  
  if (profilesSnapshot.size === 0) {
    log('⚠️ No hay perfiles de discovery para corregir', 'yellow');
    return;
  }
  
  log(`\n📦 Procesando ${profilesSnapshot.size} perfiles...\n`, 'yellow');
  
  let fixed = 0;
  let errors = 0;
  
  for (const doc of profilesSnapshot.docs) {
    const profileData = doc.data();
    const userId = doc.id;
    
    try {
      // Calcular birthDate desde la edad
      const age = profileData.age || 25;
      const birthYear = new Date().getFullYear() - age;
      const birthDate = new Date(birthYear, 0, 1);
      
      // Determinar orientación basada en userType
      let orientation = 'both';
      if (profileData.userType === 'SUGAR_DADDY') {
        orientation = 'women'; // Sugar Daddy busca mujeres
      } else if (profileData.userType === 'SUGAR_MOMMY') {
        orientation = 'men'; // Sugar Mommy busca hombres
      } else if (profileData.userType === 'SUGAR_BABY') {
        // Sugar Baby puede buscar ambos
        orientation = profileData.gender === 'male' ? 'women' : 'men';
      }
      
      // Generar geohash para Santiago (aprox)
      const geohash = generateSimpleGeohash(-33.4489, -70.6693);
      
      // Crear documento completo en colección 'users'
      const userData = {
        // Campos básicos desde profiles
        name: profileData.name || 'Sin nombre',
        bio: profileData.bio || '',
        city: profileData.city || 'Santiago',
        
        // Campos requeridos por Cloud Function
        male: profileData.gender === 'male',
        birthDate: admin.firestore.Timestamp.fromDate(birthDate),
        orientation: orientation,
        paused: false,
        visible: true,
        blocked: false,
        
        // Rangos de edad
        minAge: 18,
        maxAge: 99,
        maxDistance: 200,
        
        // Geolocalización
        g: geohash,
        latitude: -33.4489,
        longitude: -70.6693,
        
        // Fotos
        pictures: profileData.pictureUrls || [],
        
        // Metadatos
        userType: profileData.userType || 'SUGAR_BABY',
        isDiscoveryProfile: true,
        isTest: true,
        createdAt: profileData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      
      // Guardar en colección 'users'
      await db.collection('users').doc(userId).set(userData, { merge: true });
      
      fixed++;
      log(`✅ ${fixed}. ${profileData.name} (${profileData.userType})`, 'green');
      log(`   - Género: ${userData.male ? 'Hombre' : 'Mujer'}`, 'reset');
      log(`   - Orientación: ${orientation}`, 'reset');
      log(`   - Edad: ${age} años`, 'reset');
      log(`   - Geohash: ${geohash}`, 'reset');
      
    } catch (error) {
      errors++;
      log(`❌ Error procesando ${profileData.name}: ${error.message}`, 'red');
    }
  }
  
  log(`\n📊 RESUMEN:`, 'cyan');
  log(`   ✅ Perfiles corregidos: ${fixed}`, 'green');
  if (errors > 0) {
    log(`   ❌ Errores: ${errors}`, 'red');
  }
  
  log(`\n💡 PRÓXIMOS PASOS:`, 'cyan');
  log('   1. Abrir la app de Daniel', 'yellow');
  log('   2. Ir a la pantalla de swipe (HomeView)', 'yellow');
  log('   3. Pull to refresh para recargar perfiles', 'yellow');
  log('   4. Deberías ver los perfiles creados', 'green');
  
  log(`\n🔍 DEBUGGING:`, 'cyan');
  log('   - Si no aparecen, revisar logs de Cloud Function en Firebase Console', 'yellow');
  log('   - Buscar: "getCompatibleProfileIds" en Functions Logs', 'yellow');
  log('   - Verificar filtros de orientación, edad, y geohash', 'yellow');
}

/**
 * Verificar un usuario específico de Daniel
 */
async function verifyDanielProfile() {
  log('\n🔍 VERIFICANDO PERFIL DE DANIEL', 'cyan');
  log('═'.repeat(60), 'cyan');
  
  const danielUid = 'sU8xLiwQWNXmbYdR63p1uO6TSm72';
  
  const userDoc = await db.collection('users').doc(danielUid).get();
  
  if (!userDoc.exists) {
    log('❌ No se encontró el perfil de Daniel en "users"', 'red');
    return;
  }
  
  const userData = userDoc.data();
  const age = userData.birthDate ? 
    Math.floor((Date.now() - userData.birthDate.toDate().getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 
    'N/A';
  
  log('\n👤 PERFIL DE DANIEL:', 'green');
  log(`   - Nombre: ${userData.name || 'Sin nombre'}`, 'reset');
  log(`   - Género: ${userData.male ? 'Hombre' : 'Mujer'}`, 'reset');
  log(`   - Orientación: ${userData.orientation || 'both'}`, 'reset');
  log(`   - Edad: ${age} años`, 'reset');
  log(`   - Busca edad: ${userData.minAge || 18}-${userData.maxAge || 99} años`, 'reset');
  log(`   - Distancia máx: ${userData.maxDistance || 200} km`, 'reset');
  log(`   - Geohash: ${userData.g || 'Sin geohash'}`, 'reset');
  log(`   - Pausado: ${userData.paused || false}`, 'reset');
  
  log('\n📋 CRITERIOS DE BÚSQUEDA:', 'cyan');
  if (userData.male) {
    log('   - Buscará MUJERES (gender: female)', 'yellow');
    log(`   - Con orientación: ${userData.orientation === 'both' ? 'heterosexual o bisexual' : userData.orientation}`, 'yellow');
  } else {
    log('   - Buscará HOMBRES (gender: male)', 'yellow');
    log(`   - Con orientación: ${userData.orientation === 'both' ? 'heterosexual o bisexual' : userData.orientation}`, 'yellow');
  }
  log(`   - Edad entre: ${userData.minAge || 18}-${userData.maxAge || 99} años`, 'yellow');
  log(`   - Y que también busquen ${userData.male ? 'hombres' : 'mujeres'} en su rango de edad`, 'yellow');
}

/**
 * Main
 */
async function main() {
  try {
    log('\n🧪 HERRAMIENTA DE DIAGNÓSTICO Y CORRECCIÓN - DISCOVERY PROFILES', 'bright');
    log('═'.repeat(60), 'cyan');
    
    // 1. Verificar perfil de Daniel
    await verifyDanielProfile();
    
    // 2. Diagnosticar perfiles de discovery
    const needsFix = await diagnoseDiscoveryProfiles();
    
    // 3. Corregir si es necesario
    if (needsFix) {
      log('\n⏳ Iniciando corrección en 3 segundos...', 'yellow');
      await new Promise(resolve => setTimeout(resolve, 3000));
      await fixDiscoveryProfiles();
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
