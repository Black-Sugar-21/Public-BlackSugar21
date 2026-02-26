const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const DANIEL = {
  uid: 'sU8xLiwQWNXmbYdR63p1uO6TSm72',
  name: 'Daniel'
};

async function checkLikedArrays() {
  console.log('🔍 VERIFICANDO ARRAYS "liked" PARA DIAGNÓSTICO DE MATCHES\n');
  
  // 1. Obtener campo "liked" de Daniel
  console.log('1️⃣ Campo "liked" de DANIEL:');
  const danielDoc = await db.collection('users').doc(DANIEL.uid).get();
  const danielData = danielDoc.data();
  const danielLiked = danielData?.liked || [];
  console.log(`   Daniel tiene ${danielLiked.length} likes:`, danielLiked);
  console.log('');
  
  // 2. Obtener matches de Daniel
  console.log('2️⃣ MATCHES DE DANIEL:');
  const matchesSnapshot = await db.collection('matches')
    .where('usersMatched', 'array-contains', DANIEL.uid)
    .where('isTest', '==', true)
    .get();
  
  console.log(`   Total matches encontrados: ${matchesSnapshot.size}\n`);
  
  // 3. Verificar cada match
  for (const matchDoc of matchesSnapshot.docs) {
    const matchData = matchDoc.data();
    const otherUserId = matchData.usersMatched.find(uid => uid !== DANIEL.uid);
    
    // Obtener datos del otro usuario
    const otherUserDoc = await db.collection('users').doc(otherUserId).get();
    const otherUserData = otherUserDoc.data();
    const otherUserLiked = otherUserData?.liked || [];
    
    console.log(`   Match con: ${otherUserData?.name || 'Sin nombre'} (${otherUserId})`);
    console.log(`   ├─ Daniel tiene a este usuario en "liked": ${danielLiked.includes(otherUserId) ? '✅ SÍ' : '❌ NO'}`);
    console.log(`   └─ Este usuario tiene a Daniel en "liked": ${otherUserLiked.includes(DANIEL.uid) ? '✅ SÍ' : '❌ NO'}`);
    console.log('');
  }
  
  // 4. ANÁLISIS
  console.log('📊 ANÁLISIS:');
  console.log('─────────────────────────────────────────────────');
  
  let allMatchesHaveBidirectionalLikes = true;
  
  for (const matchDoc of matchesSnapshot.docs) {
    const matchData = matchDoc.data();
    const otherUserId = matchData.usersMatched.find(uid => uid !== DANIEL.uid);
    
    const otherUserDoc = await db.collection('users').doc(otherUserId).get();
    const otherUserData = otherUserDoc.data();
    const otherUserLiked = otherUserData?.liked || [];
    
    const danielHasOther = danielLiked.includes(otherUserId);
    const otherHasDaniel = otherUserLiked.includes(DANIEL.uid);
    
    if (!danielHasOther || !otherHasDaniel) {
      allMatchesHaveBidirectionalLikes = false;
      console.log(`❌ Match con ${otherUserData?.name}: NO tiene likes bidireccionales`);
      console.log(`   Daniel → Usuario: ${danielHasOther ? '✅' : '❌'}`);
      console.log(`   Usuario → Daniel: ${otherHasDaniel ? '✅' : '❌'}`);
    }
  }
  
  console.log('');
  if (allMatchesHaveBidirectionalLikes) {
    console.log('✅ TODOS los matches tienen likes bidireccionales');
  } else {
    console.log('⚠️  ALGUNOS matches NO tienen likes bidireccionales');
    console.log('');
    console.log('💡 HIPÓTESIS:');
    console.log('   iOS podría estar verificando que:');
    console.log('   1. El match existe en colección "matches" ✅');
    console.log('   2. Ambos usuarios se tienen mutuamente en "liked" ❓');
    console.log('');
    console.log('🔧 SOLUCIÓN POTENCIAL:');
    console.log('   Actualizar arrays "liked" para incluir likes bidireccionales');
  }
}

checkLikedArrays()
  .then(() => {
    console.log('\n✅ Verificación completada');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
