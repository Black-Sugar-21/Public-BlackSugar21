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

async function fixLikedArrays() {
  console.log('🔧 CORRIGIENDO ARRAYS "liked" PARA MATCHES\n');
  
  // 1. Obtener todos los matches de prueba de Daniel
  const matchesSnapshot = await db.collection('matches')
    .where('usersMatched', 'array-contains', DANIEL.uid)
    .where('isTest', '==', true)
    .get();
  
  console.log(`📦 Encontrados ${matchesSnapshot.size} matches de prueba\n`);
  
  if (matchesSnapshot.empty) {
    console.log('⚠️  No hay matches para corregir');
    return;
  }
  
  // 2. Para cada match, actualizar arrays "liked"
  let fixed = 0;
  
  for (const matchDoc of matchesSnapshot.docs) {
    const matchData = matchDoc.data();
    const otherUserId = matchData.usersMatched.find(uid => uid !== DANIEL.uid);
    
    // Obtener datos del otro usuario
    const otherUserDoc = await db.collection('users').doc(otherUserId).get();
    const otherUserData = otherUserDoc.data();
    
    console.log(`🔄 Procesando match con: ${otherUserData?.name || 'Sin nombre'}`);
    
    // 3. Actualizar array "liked" de Daniel
    const danielDoc = await db.collection('users').doc(DANIEL.uid).get();
    const danielLiked = danielDoc.data()?.liked || [];
    
    if (!danielLiked.includes(otherUserId)) {
      console.log(`   ├─ Agregando ${otherUserData?.name} a liked de Daniel...`);
      await db.collection('users').doc(DANIEL.uid).update({
        liked: admin.firestore.FieldValue.arrayUnion(otherUserId)
      });
    } else {
      console.log(`   ├─ ${otherUserData?.name} ya está en liked de Daniel ✓`);
    }
    
    // 4. Actualizar array "liked" del otro usuario
    const otherUserLiked = otherUserData?.liked || [];
    
    if (!otherUserLiked.includes(DANIEL.uid)) {
      console.log(`   └─ Agregando Daniel a liked de ${otherUserData?.name}...`);
      await db.collection('users').doc(otherUserId).update({
        liked: admin.firestore.FieldValue.arrayUnion(DANIEL.uid)
      });
    } else {
      console.log(`   └─ Daniel ya está en liked de ${otherUserData?.name} ✓`);
    }
    
    fixed++;
    console.log(`   ✅ Match corregido\n`);
  }
  
  console.log('─────────────────────────────────────────────────');
  console.log(`✅ ${fixed} matches corregidos con likes bidireccionales\n`);
  
  // 5. VERIFICACIÓN FINAL
  console.log('🔍 VERIFICACIÓN FINAL:\n');
  
  for (const matchDoc of matchesSnapshot.docs) {
    const matchData = matchDoc.data();
    const otherUserId = matchData.usersMatched.find(uid => uid !== DANIEL.uid);
    
    const danielDoc = await db.collection('users').doc(DANIEL.uid).get();
    const danielLiked = danielDoc.data()?.liked || [];
    
    const otherUserDoc = await db.collection('users').doc(otherUserId).get();
    const otherUserData = otherUserDoc.data();
    const otherUserLiked = otherUserData?.liked || [];
    
    const danielHasOther = danielLiked.includes(otherUserId);
    const otherHasDaniel = otherUserLiked.includes(DANIEL.uid);
    
    if (danielHasOther && otherHasDaniel) {
      console.log(`✅ ${otherUserData?.name}: Likes bidireccionales correctos`);
    } else {
      console.log(`❌ ${otherUserData?.name}: FALTAN likes bidireccionales`);
    }
  }
  
  console.log('\n🎉 ¡Corrección completada!');
  console.log('📱 Los matches deberían aparecer ahora en iOS');
}

fixLikedArrays()
  .then(() => {
    console.log('\n✅ Proceso completado exitosamente');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
