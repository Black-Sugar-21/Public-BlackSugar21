#!/usr/bin/env node

/**
 * Script MAESTRO de optimización y corrección de matches/imágenes
 * 1. Elimina matches huérfanos (usuarios eliminados)
 * 2. Verifica y repara imágenes de usuarios existentes (subiendo a Storage si falta)
 * 3. Asegura consistencia de datos para iOS/Android
 */

const admin = require('firebase-admin');
const https = require('https');
const { promisify } = require('util');

if (!admin.apps.length) {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'black-sugar21.firebasestorage.app'
  });
}

const db = admin.firestore();
const bucket = admin.storage().bucket();
const DANIEL_UID = 'sU8xLiwQWNXmbYdR63p1uO6TSm72';

// Utilidad para descarga
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Status ${response.statusCode}`));
        return;
      }
      const chunks = [];
      response.on('data', c => chunks.push(c));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

async function optimize() {
  console.log('🚀 Iniciando optimización de matches e imágenes para Daniel...\n');

  try {
    // 1. Obtener todos los matches de Daniel
    const matchesSnapshot = await db.collection('matches')
      .where('usersMatched', 'array-contains', DANIEL_UID)
      .get();
      
    console.log(`📊 Total matches encontrados: ${matchesSnapshot.size}`);
    
    let deleted = 0;
    let repaired = 0;
    let skipped = 0;
    
    // Mapeo de avatares para reparación
    const avatarBaseUrls = {
      men: [2, 7, 11, 15, 20, 24, 29, 33, 38, 42, 46, 50, 54, 58, 62, 66],
      women: [1, 5, 9, 12, 16, 19, 23, 28, 32, 37, 41, 45, 49, 53, 57, 61]
    };

    for (const doc of matchesSnapshot.docs) {
      const matchData = doc.data();
      const usersMatched = matchData.usersMatched || [];
      const otherUserId = usersMatched.find(id => id !== DANIEL_UID);
      
      if (!otherUserId) {
        console.log(`⚠️ Match ${doc.id} inválido sin otro usuario. Eliminando...`);
        await doc.ref.delete();
        deleted++;
        continue;
      }
      
      // Verificar si el usuario existe
      const userDoc = await db.collection('users').doc(otherUserId).get();
      
      if (!userDoc.exists) {
        console.log(`🗑️ Eliminando match con usuario inexistente (ID: ${otherUserId.substring(0,8)}...)`);
        await doc.ref.delete();
        deleted++;
        continue;
      }
      
      const userData = userDoc.data();
      const isTestUser = userData.isTestUser === true;
      let needsUpdate = false;
      let updates = {};

      // Solo repara usuarios de prueba
      if (isTestUser) {
        // Verificar si tiene firstPictureName y si es válido
        const hasPictureName = userData.firstPictureName && userData.firstPictureName.length > 0;
        const hasPicturesArray = Array.isArray(userData.pictures) && userData.pictures.length > 0;
        
        // Verificar si el archivo realmente existe en Storage (check file existence)
        const fileName = userData.firstPictureName || 'avatar.jpg';
        const file = bucket.file(`users/${otherUserId}/${fileName}`);
        const [exists] = await file.exists();
        
        if (!hasPictureName || !hasPicturesArray || !exists) {
            process.stdout.write(`🔧 Reparando usuario ${userData.name || 'Sin Nombre'}... `);
            
            // Generar URL de avatar
            const isMale = userData.male === true; // Asumir male si undefined
            const randomIdx = Math.floor(Math.random() * 10);
            const avatarNum = isMale ? avatarBaseUrls.men[randomIdx] : avatarBaseUrls.women[randomIdx];
            const avatarUrl = `https://randomuser.me/api/portraits/${isMale ? 'men' : 'women'}/${avatarNum}.jpg`;
            
            try {
                // Descargar y subir
                const buffer = await downloadImage(avatarUrl);
                const targetFileName = 'avatar.jpg';
                await bucket.file(`users/${otherUserId}/${targetFileName}`).save(buffer, {
                    metadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000' }
                });
                
                // Actualizar Firestore
                updates.firstPictureName = targetFileName;
                updates.pictures = [targetFileName];
                updates.avatarUrl = avatarUrl; // Fallback
                updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
                
                await userDoc.ref.update(updates);
                console.log('✅ Reparado y subido a Storage');
                repaired++;
            } catch (err) {
                console.log(`❌ Error reparando: ${err.message}`);
                updates.avatarUrl = avatarUrl; // Al menos poner la URL externa
                await userDoc.ref.update(updates);
            }
        } else {
            skipped++; // Usuario está saludable
        }
      } else {
          skipped++; // No tocar usuarios reales
      }
    }
    
    console.log('\n🏁 Optimización finalizada:');
    console.log(`   🔸 Eliminados (huérfanos): ${deleted}`);
    console.log(`   🔹 Reparados (imágenes): ${repaired}`);
    console.log(`   ▫️ Correctos/Omitidos: ${skipped}`);
    console.log(`   📊 Total final matches: ${matchesSnapshot.size - deleted}`);
    console.log('\n📱 Verifica ahora en iOS/Android. Los matches rotos han desaparecido y las imágenes deberían cargar.');

  } catch (error) {
    console.error('❌ Error fatal:', error);
  }
}

optimize();
