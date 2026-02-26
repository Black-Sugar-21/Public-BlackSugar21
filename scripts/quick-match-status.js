#!/usr/bin/env node

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const DANIEL_UID = 'sU8xLiwQWNXmbYdR63p1uO6TSm72';

(async () => {
  try {
    console.log('\n📊 RESUMEN RÁPIDO - Estado de Matches de Daniel\n');
    
    // Verificar Daniel
    const danielDoc = await db.collection('users').doc(DANIEL_UID).get();
    const danielData = danielDoc.data();
    
    console.log('👤 DANIEL:');
    console.log(`   accountStatus: ${danielData.accountStatus} ${danielData.accountStatus === 'active' ? '✅' : '❌'}`);
    console.log(`   paused: ${danielData.paused} ${danielData.paused === false ? '✅' : '❌'}`);
    console.log(`   blocked: ${danielData.blocked} ${danielData.blocked === false ? '✅' : '❌'}`);
    console.log(`   visible: ${danielData.visible} ${danielData.visible === true ? '✅' : '❌'}`);
    
    // Buscar matches
    const matchesSnapshot = await db.collection('matches')
      .where('usersMatched', 'array-contains', DANIEL_UID)
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();
    
    console.log(`\n📱 MATCHES: ${matchesSnapshot.size} encontrados\n`);
    
    let validMatches = 0;
    let invalidMatches = 0;
    
    for (const matchDoc of matchesSnapshot.docs) {
      const matchData = matchDoc.data();
      const otherUserId = matchData.userId1 === DANIEL_UID ? matchData.userId2 : matchData.userId1;
      
      if (!otherUserId) {
        console.log(`❌ Match ${matchDoc.id}: Otro usuario no definido`);
        invalidMatches++;
        continue;
      }
      
      const otherUserDoc = await db.collection('users').doc(otherUserId).get();
      
      if (!otherUserDoc.exists) {
        console.log(`❌ Match con ${otherUserId}: Usuario no existe`);
        invalidMatches++;
        continue;
      }
      
      const otherUserData = otherUserDoc.data();
      const isValid = 
        otherUserData.accountStatus === 'active' &&
        otherUserData.paused === false &&
        otherUserData.blocked === false &&
        otherUserData.visible === true;
      
      if (isValid) {
        console.log(`✅ Match con ${otherUserData.name}`);
        validMatches++;
      } else {
        console.log(`❌ Match con ${otherUserData.name}:`);
        if (otherUserData.accountStatus !== 'active') console.log(`      accountStatus: ${otherUserData.accountStatus}`);
        if (otherUserData.paused !== false) console.log(`      paused: ${otherUserData.paused}`);
        if (otherUserData.blocked !== false) console.log(`      blocked: ${otherUserData.blocked}`);
        if (otherUserData.visible !== true) console.log(`      visible: ${otherUserData.visible}`);
        invalidMatches++;
      }
    }
    
    console.log(`\n📊 RESULTADO:`);
    console.log(`   ✅ Matches válidos (deberían aparecer): ${validMatches}`);
    console.log(`   ❌ Matches inválidos (NO aparecerán): ${invalidMatches}`);
    
    if (validMatches > 0) {
      console.log(`\n🎉 ¡Hay ${validMatches} matches válidos!`);
      console.log('\n💡 Para verlos en la app:');
      console.log('   1. Cierra la app completamente (swipe up)');
      console.log('   2. Espera 5 segundos');
      console.log('   3. Reabre la app');
      console.log('   4. Ve a la sección de Matches');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    process.exit(1);
  }
})();
