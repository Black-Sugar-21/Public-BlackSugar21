#!/usr/bin/env node

/**
 * 🔍 Diagnóstico detallado: Por qué los matches no aparecen en la app
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const DANIEL_UID = 'sU8xLiwQWNXmbYdR63p1uO6TSm72';

(async () => {
  try {
    console.log('\n🔍 DIAGNÓSTICO DETALLADO - Matches no aparecen\n');
    console.log('═'.repeat(70));
    
    // 1. Verificar Daniel
    console.log('\n1️⃣  VERIFICAR USUARIO PRINCIPAL (Daniel)\n');
    
    const danielDoc = await db.collection('users').doc(DANIEL_UID).get();
    if (!danielDoc.exists) {
      console.log('❌ Daniel no existe en Firestore');
      process.exit(1);
    }
    
    const danielData = danielDoc.data();
    console.log('✅ Daniel existe');
    console.log(`   Nombre: ${danielData.name}`);
    console.log(`   accountStatus: ${danielData.accountStatus} ${danielData.accountStatus === 'active' ? '✅' : '❌'}`);
    console.log(`   paused: ${danielData.paused} ${danielData.paused === false ? '✅' : '❌'}`);
    console.log(`   blocked: ${danielData.blocked} ${danielData.blocked === false ? '✅' : '❌'}`);
    console.log(`   visible: ${danielData.visible} ${danielData.visible === true ? '✅' : '❌'}`);
    
    // 2. Buscar matches
    console.log('\n2️⃣  BUSCAR MATCHES EN FIRESTORE\n');
    
    const matchesSnapshot = await db.collection('matches')
      .where('usersMatched', 'array-contains', DANIEL_UID)
      .get();
    
    if (matchesSnapshot.empty) {
      console.log('❌ NO HAY MATCHES en Firestore');
      process.exit(0);
    }
    
    console.log(`✅ Encontrados ${matchesSnapshot.size} matches\n`);
    
    // 3. Analizar cada match
    console.log('3️⃣  ANÁLISIS DETALLADO DE CADA MATCH\n');
    console.log('═'.repeat(70));
    
    let validMatches = 0;
    let problems = [];
    
    for (const matchDoc of matchesSnapshot.docs) {
      const matchData = matchDoc.data();
      const matchId = matchDoc.id;
      
      console.log(`\n📊 Match: ${matchData.userId2 ? 'Con ' + matchData.userId2.substring(0, 10) + '...' : matchId.substring(0, 20) + '...'}`);
      console.log(`   Creado: ${matchData.createdAt?.toDate() || matchData.timestamp?.toDate() || 'Sin fecha'}`);
      
      let matchProblems = [];
      let matchOK = true;
      
      // Verificar campos del match
      console.log('\n   📋 Campos del match:');
      
      // usersMatched
      if (!matchData.usersMatched || !Array.isArray(matchData.usersMatched)) {
        console.log('      ❌ usersMatched: NO existe o no es array');
        matchProblems.push('usersMatched inválido');
        matchOK = false;
      } else if (matchData.usersMatched.length !== 2) {
        console.log(`      ❌ usersMatched: tiene ${matchData.usersMatched.length} elementos (debe ser 2)`);
        matchProblems.push('usersMatched debe tener 2 elementos');
        matchOK = false;
      } else if (!matchData.usersMatched.includes(DANIEL_UID)) {
        console.log(`      ❌ usersMatched: NO incluye a Daniel`);
        matchProblems.push('usersMatched no incluye a Daniel');
        matchOK = false;
      } else {
        console.log(`      ✅ usersMatched: [${matchData.usersMatched[0].substring(0, 10)}..., ${matchData.usersMatched[1].substring(0, 10)}...]`);
      }
      
      // timestamp
      if (!matchData.timestamp) {
        console.log('      ⚠️  timestamp: NO existe (requerido para ordenar)');
        matchProblems.push('Falta timestamp');
      } else {
        console.log(`      ✅ timestamp: ${matchData.timestamp.toDate()}`);
      }
      
      // createdAt
      if (!matchData.createdAt) {
        console.log('      ⚠️  createdAt: NO existe');
      } else {
        console.log(`      ✅ createdAt: ${matchData.createdAt.toDate()}`);
      }
      
      // Determinar el otro usuario
      const otherUserId = matchData.userId1 === DANIEL_UID ? matchData.userId2 : matchData.userId1;
      
      if (!otherUserId) {
        console.log('\n   ❌ OTRO USUARIO: NO IDENTIFICADO');
        matchProblems.push('No se puede identificar el otro usuario');
        matchOK = false;
        continue;
      }
      
      // Verificar el otro usuario
      console.log(`\n   👤 Otro usuario: ${otherUserId.substring(0, 15)}...`);
      
      const otherUserDoc = await db.collection('users').doc(otherUserId).get();
      
      if (!otherUserDoc.exists) {
        console.log('      ❌ USUARIO NO EXISTE en Firestore');
        console.log('      → iOS eliminará este match automáticamente');
        matchProblems.push('Usuario no existe');
        matchOK = false;
        continue;
      }
      
      const otherUserData = otherUserDoc.data();
      console.log(`      ✅ Usuario existe: ${otherUserData.name}`);
      
      // Verificar campos críticos del otro usuario
      console.log('\n      📋 Campos críticos del usuario:');
      
      const criticalChecks = [
        {
          field: 'accountStatus',
          value: otherUserData.accountStatus,
          expected: 'active',
          critical: true,
          impact: '🔥 iOS ELIMINA el match'
        },
        {
          field: 'paused',
          value: otherUserData.paused,
          expected: false,
          critical: true,
          impact: '⚠️  iOS OCULTA el match'
        },
        {
          field: 'blocked',
          value: otherUserData.blocked,
          expected: false,
          critical: true,
          impact: '❌ iOS ELIMINA el match'
        },
        {
          field: 'visible',
          value: otherUserData.visible,
          expected: true,
          critical: false,
          impact: 'ℹ️  Usuario oculto'
        }
      ];
      
      for (const check of criticalChecks) {
        const isOK = check.value === check.expected;
        const icon = isOK ? '✅' : '❌';
        
        if (isOK) {
          console.log(`         ${icon} ${check.field}: ${JSON.stringify(check.value)}`);
        } else {
          console.log(`         ${icon} ${check.field}: ${JSON.stringify(check.value)} (esperado: ${JSON.stringify(check.expected)})`);
          console.log(`            ${check.impact}`);
          matchProblems.push(`${check.field} = ${check.value}`);
          if (check.critical) matchOK = false;
        }
      }
      
      // Resultado del match
      if (matchOK) {
        console.log('\n   ✅ Este match DEBERÍA aparecer en iOS');
        validMatches++;
      } else {
        console.log('\n   ❌ Este match NO aparecerá en iOS');
        console.log(`   Problemas: ${matchProblems.join(', ')}`);
        problems.push({
          match: matchId.substring(0, 20) + '...',
          user: otherUserData.name,
          problems: matchProblems
        });
      }
      
      console.log('\n' + '─'.repeat(70));
    }
    
    // 4. Resumen final
    console.log('\n\n4️⃣  RESUMEN FINAL\n');
    console.log('═'.repeat(70));
    
    console.log(`\n📊 Matches en Firestore: ${matchesSnapshot.size}`);
    console.log(`   ✅ Válidos (deberían aparecer): ${validMatches}`);
    console.log(`   ❌ Con problemas (NO aparecerán): ${matchesSnapshot.size - validMatches}`);
    
    if (problems.length > 0) {
      console.log('\n❌ PROBLEMAS ENCONTRADOS:\n');
      problems.forEach((p, idx) => {
        console.log(`   ${idx + 1}. ${p.user}:`);
        p.problems.forEach(prob => console.log(`      • ${prob}`));
      });
      
      console.log('\n🔧 SOLUCIONES:');
      console.log('   1. Ejecutar: node fix-account-status.js');
      console.log('      → Corrige todos los usuarios de prueba');
      console.log('');
      console.log('   2. Ejecutar: node validate-test-users.js');
      console.log('      → Valida y corrige usuarios automáticamente');
    } else {
      console.log('\n✅ ¡TODOS LOS MATCHES SON VÁLIDOS!');
      console.log('\n💡 Si aún no aparecen en la app iOS:');
      console.log('   1. Cierra la app completamente (force quit)');
      console.log('   2. Espera 10 segundos');
      console.log('   3. Reabre la app');
      console.log('   4. Espera a que cargue completamente');
      console.log('   5. Ve a la sección de Matches');
      console.log('\n📱 Si siguen sin aparecer:');
      console.log('   • Revisa logs de Xcode para ver errores');
      console.log('   • Verifica que estés usando el usuario correcto (Daniel)');
      console.log('   • Verifica que no haya filtros activos en la app');
    }
    
    console.log('\n═'.repeat(70));
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error);
    process.exit(1);
  }
})();
