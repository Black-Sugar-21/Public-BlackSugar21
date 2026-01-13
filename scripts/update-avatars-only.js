#!/usr/bin/env node

/**
 * Script para actualizar SOLO el campo avatarUrl de usuarios de prueba existentes
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function updateAvatars() {
  console.log('🔄 Actualizando avatarUrl en usuarios de prueba...\n');
  
  try {
    // Obtener todos los usuarios de prueba
    const testUsersSnapshot = await db.collection('users')
      .where('isTestUser', '==', true)
      .get();
    
    console.log(`📊 Encontrados ${testUsersSnapshot.size} usuarios de prueba\n`);
    
    const avatarBaseUrls = {
      men: [2, 7, 11, 15, 20, 24, 29, 33, 38, 42, 46, 50, 54, 58, 62, 66, 70, 74, 78, 82],
      women: [1, 5, 9, 12, 16, 19, 23, 28, 32, 37, 41, 45, 49, 53, 57, 61, 65, 69, 73, 77]
    };
    
    let updated = 0;
    let index = 0;
    
    for (const doc of testUsersSnapshot.docs) {
      const userData = doc.data();
      const userId = doc.id;
      const isMale = userData.male === true;
      
      // Seleccionar avatar según género e índice
      const avatarIndex = index % 10;
      const avatarNum = isMale ? avatarBaseUrls.men[avatarIndex] : avatarBaseUrls.women[avatarIndex];
      const avatarUrl = `https://randomuser.me/api/portraits/${isMale ? 'men' : 'women'}/${avatarNum}.jpg`;
      
      // Actualizar SOLO el campo avatarUrl
      await db.collection('users').doc(userId).update({
        avatarUrl: avatarUrl,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`✅ ${updated + 1}: ${userData.name}`);
      console.log(`   ID: ${userId.substring(0, 8)}...`);
      console.log(`   Avatar: ${avatarUrl}\n`);
      
      updated++;
      index++;
    }
    
    console.log(`\n🎉 ${updated} usuarios actualizados con avatarUrl`);
    console.log('\n📱 Ahora prueba en la app - los avatares deberían cargar');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
  
  process.exit(0);
}

updateAvatars();
