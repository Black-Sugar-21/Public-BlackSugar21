#!/usr/bin/env node

/**
 * 🔍 VERIFICAR PERFILES DISCOVERY
 * Script simple para contar y listar perfiles discovery
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'black-sugar21.firebasestorage.app'
});

const db = admin.firestore();

async function checkDiscoveryProfiles() {
  console.log('\n🔍 VERIFICANDO PERFILES DISCOVERY...\n');
  
  try {
    // Contar perfiles con isDiscoveryProfile = true
    const discoverySnapshot = await db.collection('users')
      .where('isDiscoveryProfile', '==', true)
      .get();
    
    console.log(`📊 Total perfiles discovery: ${discoverySnapshot.size}`);
    
    if (discoverySnapshot.size === 0) {
      console.log('❌ No hay perfiles discovery en la base de datos');
      console.log('💡 Ejecuta la opción 6 del test-master.js para crearlos');
      process.exit(0);
    }
    
    console.log('\n📋 LISTA DE PERFILES DISCOVERY:\n');
    
    discoverySnapshot.forEach((doc, index) => {
      const data = doc.data();
      const age = data.birthDate ? 
        Math.floor((Date.now() - data.birthDate.toDate().getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 
        'N/A';
      
      console.log(`${index + 1}. ${data.name || 'Sin nombre'} (${doc.id.substring(0, 8)}...)`);
      console.log(`   - Edad: ${age} años`);
      console.log(`   - Género: ${data.male ? 'MALE' : 'FEMALE'}`);
      console.log(`   - Orientación: busca ${data.orientation || 'both'}`);
      console.log(`   - Geohash: ${data.g || 'Sin geohash'}`);
      console.log(`   - Ubicación: ${data.latitude}, ${data.longitude}`);
      console.log(`   - Fotos: ${data.pictures ? data.pictures.length : 0}`);
      console.log(`   - Visible: ${data.visible !== false}`);
      console.log(`   - Pausado: ${data.paused || false}`);
      console.log(`   - AccountStatus: ${data.accountStatus || 'N/A'}`);
      console.log('');
    });
    
    // Obtener perfil de Daniel para comparar
    const danielDoc = await db.collection('users').doc('sU8xLiwQWNXmbYdR63p1uO6TSm72').get();
    
    if (danielDoc.exists) {
      const daniel = danielDoc.data();
      console.log('\n👤 PERFIL DE DANIEL PARA COMPARACIÓN:');
      console.log(`   - Geohash: ${daniel.g || 'Sin geohash'} (prefix: ${daniel.g ? daniel.g.substring(0, 3) : 'N/A'})`);
      console.log(`   - Ubicación: ${daniel.latitude}, ${daniel.longitude}`);
      console.log(`   - Busca: ${daniel.orientation || 'both'}`);
      console.log(`   - Rango edad: ${daniel.minAge || 18}-${daniel.maxAge || 99}`);
      console.log(`   - Distancia máx: ${daniel.maxDistance || 200} km`);
      console.log(`   - Pausado: ${daniel.paused || false}`);
      
      // Verificar compatibilidad
      console.log('\n✅ ANÁLISIS DE COMPATIBILIDAD:');
      
      const danielGeohashPrefix = daniel.g ? daniel.g.substring(0, 3) : '';
      let compatibleCount = 0;
      let incompatibleReasons = {
        geohash: 0,
        orientation: 0,
        gender: 0,
        age: 0,
        paused: 0
      };
      
      discoverySnapshot.forEach(doc => {
        const profile = doc.data();
        let isCompatible = true;
        let reasons = [];
        
        // Verificar geohash
        const profileGeohashPrefix = profile.g ? profile.g.substring(0, 3) : '';
        if (profileGeohashPrefix !== danielGeohashPrefix) {
          isCompatible = false;
          reasons.push('❌ Geohash diferente');
          incompatibleReasons.geohash++;
        }
        
        // Verificar orientación de Daniel hacia el perfil
        if (daniel.orientation !== 'both') {
          const profileIsMale = profile.male === true;
          const danielWantsProfile = (daniel.orientation === 'men' && profileIsMale) || 
                                      (daniel.orientation === 'women' && !profileIsMale);
          if (!danielWantsProfile) {
            isCompatible = false;
            reasons.push(`❌ Daniel busca ${daniel.orientation} pero perfil es ${profileIsMale ? 'MALE' : 'FEMALE'}`);
            incompatibleReasons.gender++;
          }
        }
        
        // Verificar orientación del perfil hacia Daniel
        const profileOrientation = profile.orientation || 'both';
        if (profileOrientation !== 'both') {
          const danielIsMale = daniel.male === true;
          const profileWantsDaniel = danielIsMale ? 
            profileOrientation === 'men' : 
            profileOrientation === 'women';
          if (!profileWantsDaniel) {
            isCompatible = false;
            reasons.push(`❌ Perfil busca ${profileOrientation} pero Daniel es ${danielIsMale ? 'MALE' : 'FEMALE'}`);
            incompatibleReasons.orientation++;
          }
        }
        
        // Verificar edad
        const profileAge = profile.birthDate ? 
          Math.floor((Date.now() - profile.birthDate.toDate().getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 
          null;
        
        if (profileAge !== null) {
          const danielMinAge = daniel.minAge || 18;
          const danielMaxAge = daniel.maxAge || 99;
          
          if (profileAge < danielMinAge || profileAge > danielMaxAge) {
            isCompatible = false;
            reasons.push(`❌ Edad ${profileAge} fuera del rango ${danielMinAge}-${danielMaxAge}`);
            incompatibleReasons.age++;
          }
        }
        
        // Verificar paused
        if (profile.paused === true) {
          isCompatible = false;
          reasons.push('❌ Perfil pausado');
          incompatibleReasons.paused++;
        }
        
        if (isCompatible) {
          compatibleCount++;
        }
      });
      
      console.log(`\n📊 RESULTADO:`);
      console.log(`   ✅ Perfiles compatibles: ${compatibleCount}/${discoverySnapshot.size}`);
      console.log(`   ❌ Incompatibles por:`);
      console.log(`      - Geohash diferente: ${incompatibleReasons.geohash}`);
      console.log(`      - Orientación incompatible: ${incompatibleReasons.orientation}`);
      console.log(`      - Género no buscado: ${incompatibleReasons.gender}`);
      console.log(`      - Edad fuera de rango: ${incompatibleReasons.age}`);
      console.log(`      - Perfil pausado: ${incompatibleReasons.paused}`);
      
      if (compatibleCount === 0) {
        console.log('\n❌ PROBLEMA ENCONTRADO: No hay perfiles compatibles');
        console.log('💡 Solución: Ejecutar opción 6 del test-master.js para crear perfiles compatibles');
      } else {
        console.log('\n✅ Hay perfiles compatibles disponibles');
        console.log('💡 Si iOS no los muestra, verifica la Cloud Function getCompatibleProfileIds');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
  
  process.exit(0);
}

checkDiscoveryProfiles();
