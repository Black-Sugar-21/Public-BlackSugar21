const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  const matchesSnapshot = await db.collection('matches')
    .where('usersMatched', 'array-contains', 'sU8xLiwQWNXmbYdR63p1uO6TSm72')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  
  if (matchesSnapshot.empty) {
    console.log('No hay matches');
    process.exit(1);
  }
  
  const matchData = matchesSnapshot.docs[0].data();
  const otherUserId = matchData.userId1 === 'sU8xLiwQWNXmbYdR63p1uO6TSm72' 
    ? matchData.userId2 
    : matchData.userId1;
  
  console.log('🔍 Verificando usuario del último match:');
  console.log('User ID:', otherUserId);
  
  const userDoc = await db.collection('users').doc(otherUserId).get();
  
  if (!userDoc.exists) {
    console.log('❌ Usuario NO EXISTE en Firestore');
    process.exit(1);
  }
  
  const userData = userDoc.data();
  console.log('\n📋 Campos del usuario:');
  console.log('  name:', userData.name);
  console.log('  paused:', userData.paused);
  console.log('  blocked:', userData.blocked);
  console.log('  accountStatus:', userData.accountStatus);
  console.log('  visible:', userData.visible);
  
  console.log('\n📊 Análisis (Filtros de iOS):');
  
  if (userData.paused === true) {
    console.log('❌ PROBLEMA: Usuario está PAUSADO → iOS lo filtra');
  } else if (userData.paused === false) {
    console.log('✅ paused: false (OK)');
  } else {
    console.log('⚠️  paused: undefined → Puede causar problemas');
  }
  
  if (userData.blocked === true) {
    console.log('❌ PROBLEMA: Usuario está BLOQUEADO → iOS lo filtra');
  } else if (userData.blocked === false) {
    console.log('✅ blocked: false (OK)');
  } else {
    console.log('⚠️  blocked: undefined');
  }
  
  if (!userData.accountStatus) {
    console.log('❌ PROBLEMA: accountStatus NO EXISTE → iOS lo filtra');
    console.log('   💡 iOS requiere: accountStatus === "active"');
  } else if (userData.accountStatus !== 'active') {
    console.log(`❌ PROBLEMA: accountStatus = "${userData.accountStatus}" → iOS lo filtra`);
  } else {
    console.log('✅ accountStatus: "active" (OK)');
  }
  
  process.exit(0);
})();
