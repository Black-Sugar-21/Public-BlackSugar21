#!/usr/bin/env node

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function addPhotosToTestUsers() {
  console.log('\n🔧 AGREGANDO FOTOS A USUARIOS DE PRUEBA\n');
  
  const danielUid = 'sU8xLiwQWNXmbYdR63p1uO6TSm72';
  
  // Obtener matches de Daniel
  const matchesSnapshot = await db.collection('matches')
    .where('usersMatched', 'array-contains', danielUid)
    .where('isTest', '==', true)
    .get();
  
  console.log(`📦 Encontrados ${matchesSnapshot.size} matches de prueba\n`);
  
  let updated = 0;
  
  for (const matchDoc of matchesSnapshot.docs) {
    const matchData = matchDoc.data();
    const otherUserId = matchData.usersMatched.find(uid => uid !== danielUid);
    
    // Obtener usuario
    const userDoc = await db.collection('users').doc(otherUserId).get();
    if (!userDoc.exists) {
      console.log(`⚠️  Usuario ${otherUserId} no existe, saltando`);
      continue;
    }
    
    const userData = userDoc.data();
    const userName = userData.name || 'Unknown';
    
    // Verificar si ya tiene fotos
    if (userData.pictures && userData.pictures.length > 0) {
      console.log(`✅ ${userName} - Ya tiene fotos, saltando`);
      continue;
    }
    
    console.log(`🔄 Agregando fotos a ${userName}...`);
    
    // Agregar fotos
    await db.collection('users').doc(otherUserId).update({
      pictures: ['test_photo.jpg'],
      firstPictureName: 'test_photo.jpg'
    });
    
    console.log(`   ✅ Fotos agregadas`);
    updated++;
  }
  
  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`✅ ${updated} usuarios actualizados con fotos`);
  console.log(`\n💡 Ahora los matches deberían aparecer en iOS`);
  console.log(`📱 Cierra y vuelve a abrir la app iOS\n`);
}

addPhotosToTestUsers()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  });
