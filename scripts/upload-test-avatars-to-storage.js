#!/usr/bin/env node

/**
 * Script para subir avatares de prueba a Firebase Storage
 * Descarga imágenes de RandomUser.me y las sube al bucket correcto
 */

const admin = require('firebase-admin');
const https = require('https');
const { promisify } = require('util');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);

if (!admin.apps.length) {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'black-sugar21.firebasestorage.app' // Bucket correcto
  });
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

/**
 * Descarga una imagen desde URL
 */
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Sube imagen a Firebase Storage
 */
async function uploadToStorage(userId, fileName, imageBuffer) {
  const filePath = `users/${userId}/${fileName}`;
  const file = bucket.file(filePath);
  
  await file.save(imageBuffer, {
    metadata: {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000',
    },
  });
  
  console.log(`   ✅ Subido a Storage: ${filePath}`);
  return filePath;
}

async function uploadTestAvatars() {
  console.log('📤 Subiendo avatares de prueba a Firebase Storage...\n');
  
  try {
    // Verificar que el bucket existe
    const [exists] = await bucket.exists();
    if (!exists) {
      console.log('❌ Firebase Storage bucket no existe.');
      console.log('   Ve a: https://console.firebase.google.com/project/black-sugar21/storage');
      console.log('   Y activa Firebase Storage\n');
      process.exit(1);
    }
    
    console.log(`✅ Bucket encontrado: ${bucket.name}\n`);
    
    // Obtener usuarios de prueba
    const testUsersSnapshot = await db.collection('users')
      .where('isTestUser', '==', true)
      .get();
    
    console.log(`📊 Encontrados ${testUsersSnapshot.size} usuarios de prueba\n`);
    
    const avatarBaseUrls = {
      men: [2, 7, 11, 15, 20, 24, 29, 33, 38, 42],
      women: [1, 5, 9, 12, 16, 19, 23, 28, 32, 37]
    };
    
    let uploaded = 0;
    let index = 0;
    
    for (const doc of testUsersSnapshot.docs) {
      const userData = doc.data();
      const userId = doc.id;
      const isMale = userData.male === true;
      
      // URL del avatar
      const avatarIndex = index % 10;
      const avatarNum = isMale ? avatarBaseUrls.men[avatarIndex] : avatarBaseUrls.women[avatarIndex];
      const avatarUrl = `https://randomuser.me/api/portraits/${isMale ? 'men' : 'women'}/${avatarNum}.jpg`;
      
      console.log(`${uploaded + 1}. ${userData.name}`);
      console.log(`   Descargando: ${avatarUrl}`);
      
      try {
        // Descargar imagen
        const imageBuffer = await downloadImage(avatarUrl);
        console.log(`   📥 Descargado: ${imageBuffer.length} bytes`);
        
        // Subir a Storage
        const fileName = 'avatar.jpg';
        await uploadToStorage(userId, fileName, imageBuffer);
        
        // Actualizar Firestore con el nombre del archivo
        await db.collection('users').doc(userId).update({
          pictures: [fileName],
          firstPictureName: fileName,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`   ✅ Actualizado Firestore con firstPictureName\n`);
        uploaded++;
        
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}\n`);
      }
      
      index++;
      
      // Pequeña pausa para no saturar
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`\n🎉 ${uploaded} avatares subidos exitosamente a Firebase Storage`);
    console.log('\n📱 Ahora abre las apps iOS/Android:');
    console.log('   - Login: dverdugo85@gmail.com');
    console.log('   - Ve a Matches');
    console.log('   - Las imágenes deberían cargar desde Firebase Storage\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code === 'storage/bucket-not-found') {
      console.log('\n💡 Solución:');
      console.log('   1. Ve a https://console.firebase.google.com/project/black-sugar21/storage');
      console.log('   2. Haz clic en "Get Started"');
      console.log('   3. Selecciona "Start in test mode"');
      console.log('   4. Ejecuta este script nuevamente\n');
    }
  }
  
  process.exit(0);
}

uploadTestAvatars();
