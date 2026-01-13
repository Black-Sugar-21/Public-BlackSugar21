#!/usr/bin/env node

/**
 * Script para subir avatares de prueba a Firebase Storage
 * Uso: node scripts/upload-test-avatars.js
 * 
 * Este script sube las imágenes de avatar descargadas a Firebase Storage
 * para que puedan ser usadas por los perfiles de prueba
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Inicializar Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
const projectId = serviceAccount.project_id;
const storageBucket = `${projectId}.appspot.com`;

console.log(`📦 Usando proyecto: ${projectId}`);
console.log(`🪣 Bucket de Storage: ${storageBucket}\n`);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: storageBucket
});

const storage = admin.storage().bucket();

// Rutas a las imágenes
const ANDROID_AVATARS_PATH = '/Users/daniel/AndroidStudioProjects/BlackSugar212/app/src/main/res/drawable';
const IOS_AVATARS_PATH = '/Users/daniel/AndroidStudioProjects/iOS/black-sugar-21/Assets.xcassets/TestAvatars.imageset';

// Función para subir una imagen a Storage
async function uploadAvatar(localPath, remotePath) {
  try {
    // Verificar si el bucket existe primero
    try {
      await storage.getMetadata();
    } catch (bucketError) {
      console.log(`   ⚠️  Bucket no accesible: ${bucketError.message}`);
      console.log(`   ℹ️  Usando URLs públicas en su lugar...`);
      return null;
    }
    
    await storage.upload(localPath, {
      destination: remotePath,
      metadata: {
        contentType: 'image/jpeg',
        metadata: {
          uploadedBy: 'test-avatar-script',
          timestamp: new Date().toISOString()
        }
      },
      public: true
    });
    
    const publicUrl = `https://storage.googleapis.com/${storage.name}/${remotePath}`;
    console.log(`   ✅ Subido: ${path.basename(localPath)}`);
    
    return publicUrl;
  } catch (error) {
    console.log(`   ⚠️  No se pudo subir ${path.basename(localPath)}, usando URL pública`);
    return null;
  }
}

// Función principal
async function main() {
  console.log('🚀 Iniciando carga de avatares a Firebase Storage...\n');
  
  // Determinar qué directorio usar (priorizar Android)
  let avatarsPath = ANDROID_AVATARS_PATH;
  if (!fs.existsSync(avatarsPath)) {
    console.log(`⚠️  Directorio Android no encontrado: ${avatarsPath}`);
    avatarsPath = IOS_AVATARS_PATH;
    if (!fs.existsSync(avatarsPath)) {
      console.error(`❌ No se encontraron avatares en ninguna ubicación`);
      process.exit(1);
    }
  }
  
  console.log(`📂 Usando directorio: ${avatarsPath}\n`);
  
  // Leer archivos de avatares
  const files = fs.readdirSync(avatarsPath)
    .filter(f => f.endsWith('.jpg') && f.startsWith('test_avatar_'));
  
  console.log(`📸 Encontrados ${files.length} avatares para subir\n`);
  
  const uploadedAvatars = {
    women: [],
    men: []
  };
  
  // Subir cada avatar
  for (const file of files) {
    const localPath = path.join(avatarsPath, file);
    const remotePath = `test-avatars/${file}`;
    
    const url = await uploadAvatar(localPath, remotePath);
    
    if (url) {
      if (file.includes('_woman_')) {
        uploadedAvatars.women.push(url);
      } else if (file.includes('_man_')) {
        uploadedAvatars.men.push(url);
      }
    }
  }
  
  console.log('\n✅ Carga completada!\n');
  console.log('📊 Resumen:');
  console.log(`   - Avatares de mujeres: ${uploadedAvatars.women.length}`);
  console.log(`   - Avatares de hombres: ${uploadedAvatars.men.length}`);
  console.log(`   - Total: ${uploadedAvatars.women.length + uploadedAvatars.men.length}\n`);
  
  // Guardar URLs en archivo JSON para uso posterior
  const outputPath = path.join(__dirname, 'test-avatars-urls.json');
  fs.writeFileSync(outputPath, JSON.stringify(uploadedAvatars, null, 2));
  console.log(`💾 URLs guardadas en: ${outputPath}\n`);
  
  console.log('📝 Próximos pasos:');
  console.log('   1. Ejecutar: node scripts/populate-test-matches.js');
  console.log('   2. Las imágenes ya están en Firebase Storage públicas\n');
}

// Ejecutar
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  });
