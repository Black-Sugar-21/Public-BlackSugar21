#!/usr/bin/env node

/**
 * Script de Verificación: Limpieza de Storage
 * 
 * Verifica que cuando se elimina un usuario, se eliminan correctamente
 * todas sus carpetas en Firebase Storage:
 * - users/{userId}/
 * - ephemeral_photos/{userId}/
 * - stories/{userId}/
 * - personal/{userId}/
 */

const admin = require('firebase-admin');
const readline = require('readline');

// Inicializar Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'black-sugar21.firebasestorage.app'
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

// Colores para terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function log(message, color = 'reset') {
  console.log(colors[color] + message + colors.reset);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(colors.cyan + prompt + colors.reset, resolve);
  });
}

/**
 * Lista todas las carpetas en Storage que podrían contener archivos de usuarios
 */
async function listStorageFolders() {
  log('\n📂 ESTRUCTURA DE STORAGE', 'cyan');
  log('═'.repeat(70), 'cyan');
  
  const folderPrefixes = [
    'users/',
    'ephemeral_photos/',
    'stories/',
    'personal/',
    'global/'
  ];
  
  for (const prefix of folderPrefixes) {
    try {
      const [files] = await bucket.getFiles({ prefix, maxResults: 1 });
      const hasFiles = files.length > 0;
      const status = hasFiles ? '✅' : '⚪';
      log(`${status} ${prefix}${hasFiles ? ' (tiene archivos)' : ' (vacía)'}`, hasFiles ? 'green' : 'gray');
    } catch (error) {
      log(`❌ ${prefix} (error: ${error.message})`, 'red');
    }
  }
}

/**
 * Lista todos los archivos de un usuario específico en Storage
 */
async function listUserFiles(userId) {
  const folderPrefixes = [
    `users/${userId}/`,
    `ephemeral_photos/${userId}/`,
    `stories/${userId}/`,
    `personal/${userId}/`
  ];
  
  const results = {
    totalFiles: 0,
    folderDetails: []
  };
  
  for (const prefix of folderPrefixes) {
    try {
      const [files] = await bucket.getFiles({ prefix });
      results.folderDetails.push({
        path: prefix,
        fileCount: files.length,
        files: files.map(f => f.name)
      });
      results.totalFiles += files.length;
    } catch (error) {
      results.folderDetails.push({
        path: prefix,
        fileCount: 0,
        error: error.message
      });
    }
  }
  
  return results;
}

/**
 * Audita Storage buscando carpetas huérfanas (usuarios que no existen en Firestore)
 */
async function auditOrphanedFolders() {
  log('\n🔍 AUDITORÍA DE CARPETAS HUÉRFANAS', 'cyan');
  log('═'.repeat(70), 'cyan');
  log('Buscando carpetas en Storage de usuarios que no existen en Firestore...', 'yellow');
  
  const folderPrefixes = ['users/', 'ephemeral_photos/', 'stories/', 'personal/'];
  const userIdsInStorage = new Set();
  
  // 1. Obtener todos los userIds de Storage
  log('\n1️⃣  Escaneando Storage...', 'cyan');
  for (const prefix of folderPrefixes) {
    try {
      const [files] = await bucket.getFiles({ prefix });
      files.forEach(file => {
        // Extraer userId del path: prefix/userId/filename
        const parts = file.name.split('/');
        if (parts.length >= 2) {
          const userId = parts[1];
          if (userId) userIdsInStorage.add(userId);
        }
      });
    } catch (error) {
      log(`   ⚠️  Error escaneando ${prefix}: ${error.message}`, 'yellow');
    }
  }
  
  log(`   ✅ Encontrados ${userIdsInStorage.size} usuarios únicos en Storage`, 'green');
  
  // 2. Verificar cuáles existen en Firestore
  log('\n2️⃣  Verificando usuarios en Firestore...', 'cyan');
  const orphanedUsers = [];
  let checked = 0;
  
  for (const userId of userIdsInStorage) {
    checked++;
    if (checked % 10 === 0) {
      process.stdout.write(`\r   📊 Verificados: ${checked}/${userIdsInStorage.size}`);
    }
    
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        const files = await listUserFiles(userId);
        orphanedUsers.push({
          userId,
          totalFiles: files.totalFiles,
          folders: files.folderDetails.filter(f => f.fileCount > 0)
        });
      }
    } catch (error) {
      log(`\n   ⚠️  Error verificando ${userId}: ${error.message}`, 'yellow');
    }
  }
  
  process.stdout.write('\r' + ' '.repeat(60) + '\r');
  
  // 3. Mostrar resultados
  log('\n3️⃣  Resultados:', 'cyan');
  if (orphanedUsers.length === 0) {
    log('   ✅ No se encontraron carpetas huérfanas', 'green');
  } else {
    log(`   ⚠️  Encontradas ${orphanedUsers.length} carpetas huérfanas:`, 'yellow');
    
    let totalOrphanedFiles = 0;
    orphanedUsers.forEach(user => {
      totalOrphanedFiles += user.totalFiles;
      log(`\n   📁 Usuario: ${user.userId}`, 'reset');
      log(`      Archivos totales: ${user.totalFiles}`, 'gray');
      user.folders.forEach(folder => {
        log(`      - ${folder.path} (${folder.fileCount} archivo(s))`, 'gray');
      });
    });
    
    log(`\n   📊 Total: ${totalOrphanedFiles} archivos huérfanos`, 'yellow');
  }
  
  return orphanedUsers;
}

/**
 * Prueba de eliminación de usuario
 */
async function testUserDeletion() {
  log('\n🧪 PRUEBA DE ELIMINACIÓN DE USUARIO', 'cyan');
  log('═'.repeat(70), 'cyan');
  
  // Buscar usuario de prueba (discovery profile)
  const usersSnapshot = await db.collection('users')
    .where('isDiscoveryProfile', '==', true)
    .limit(1)
    .get();
  
  if (usersSnapshot.empty) {
    log('⚠️  No hay usuarios de prueba disponibles', 'yellow');
    log('💡 Crea usuarios discovery primero con el test-master.js', 'cyan');
    return;
  }
  
  const userDoc = usersSnapshot.docs[0];
  const userId = userDoc.id;
  const userData = userDoc.data();
  
  log(`\n📋 Usuario de prueba seleccionado:`, 'yellow');
  log(`   ID: ${userId}`, 'reset');
  log(`   Nombre: ${userData.name || 'Sin nombre'}`, 'reset');
  
  // 1. ANTES: Listar archivos del usuario
  log('\n1️⃣  ANTES - Archivos en Storage:', 'cyan');
  const beforeFiles = await listUserFiles(userId);
  
  if (beforeFiles.totalFiles === 0) {
    log('   ⚪ Usuario no tiene archivos en Storage', 'gray');
  } else {
    log(`   📊 Total de archivos: ${beforeFiles.totalFiles}`, 'reset');
    beforeFiles.folderDetails.forEach(folder => {
      if (folder.fileCount > 0) {
        log(`   📁 ${folder.path}: ${folder.fileCount} archivo(s)`, 'gray');
        folder.files.forEach(file => {
          log(`      - ${file}`, 'gray');
        });
      }
    });
  }
  
  // Confirmar eliminación
  const confirm = await question('\n⚠️  ¿Eliminar este usuario para probar? (escribe "SI" para confirmar): ');
  
  if (confirm !== 'SI') {
    log('✅ Cancelado', 'green');
    return;
  }
  
  // 2. ELIMINAR: Llamar a la Cloud Function
  log('\n2️⃣  Eliminando usuario...', 'yellow');
  
  try {
    // Usar la misma lógica que deleteUserCompletely del test-master.js
    const auth = admin.auth();
    
    // Eliminar de Auth
    try {
      await auth.deleteUser(userId);
      log('   ✅ Usuario eliminado de Auth', 'green');
    } catch (e) {
      log(`   ⚪ Usuario no estaba en Auth`, 'gray');
    }
    
    // Eliminar archivos de Storage
    const folderPrefixes = [
      `users/${userId}/`,
      `ephemeral_photos/${userId}/`,
      `stories/${userId}/`,
      `personal/${userId}/`
    ];
    
    let deletedFiles = 0;
    for (const prefix of folderPrefixes) {
      try {
        const [files] = await bucket.getFiles({ prefix });
        for (const file of files) {
          await file.delete();
          deletedFiles++;
          log(`   ✅ Eliminado: ${file.name}`, 'gray');
        }
      } catch (e) {
        // Carpeta puede no existir
      }
    }
    
    log(`   ✅ ${deletedFiles} archivo(s) eliminado(s) de Storage`, 'green');
    
    // Eliminar de Firestore
    await userDoc.ref.delete();
    log('   ✅ Usuario eliminado de Firestore', 'green');
    
  } catch (error) {
    log(`   ❌ Error: ${error.message}`, 'red');
    return;
  }
  
  // 3. DESPUÉS: Verificar que no quedan archivos
  log('\n3️⃣  DESPUÉS - Verificando limpieza:', 'cyan');
  
  // Esperar un momento
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const afterFiles = await listUserFiles(userId);
  
  if (afterFiles.totalFiles === 0) {
    log('   ✅ ÉXITO: Todas las carpetas fueron eliminadas correctamente', 'green');
  } else {
    log(`   ❌ ERROR: Aún quedan ${afterFiles.totalFiles} archivo(s) en Storage:`, 'red');
    afterFiles.folderDetails.forEach(folder => {
      if (folder.fileCount > 0) {
        log(`   📁 ${folder.path}: ${folder.fileCount} archivo(s)`, 'yellow');
        folder.files.forEach(file => {
          log(`      - ${file}`, 'gray');
        });
      }
    });
  }
}

/**
 * Menú principal
 */
async function mainMenu() {
  log('\n🔍 VERIFICACIÓN DE LIMPIEZA DE STORAGE', 'cyan');
  log('═'.repeat(70), 'cyan');
  
  log('\n¿Qué deseas hacer?\n', 'yellow');
  log('1. Listar estructura de carpetas en Storage', 'reset');
  log('2. Auditar carpetas huérfanas (usuarios eliminados)', 'reset');
  log('3. Hacer prueba de eliminación (con usuario discovery)', 'reset');
  log('4. Verificar archivos de un usuario específico', 'reset');
  log('5. Salir', 'reset');
  
  const choice = await question('\nSelecciona opción (1-5): ');
  
  switch (choice) {
    case '1':
      await listStorageFolders();
      break;
    
    case '2':
      await auditOrphanedFolders();
      break;
    
    case '3':
      await testUserDeletion();
      break;
    
    case '4':
      const userId = await question('\nIngresa el userId: ');
      if (userId.trim()) {
        log(`\n📋 Archivos del usuario ${userId}:`, 'yellow');
        const files = await listUserFiles(userId.trim());
        
        if (files.totalFiles === 0) {
          log('   ⚪ Usuario no tiene archivos en Storage', 'gray');
        } else {
          log(`   📊 Total de archivos: ${files.totalFiles}`, 'reset');
          files.folderDetails.forEach(folder => {
            if (folder.fileCount > 0) {
              log(`\n   📁 ${folder.path}: ${folder.fileCount} archivo(s)`, 'green');
              folder.files.forEach(file => {
                log(`      - ${file}`, 'gray');
              });
            }
          });
        }
      }
      break;
    
    case '5':
      log('\n👋 Hasta luego!', 'green');
      rl.close();
      process.exit(0);
      return;
    
    default:
      log('⚠️  Opción inválida', 'yellow');
  }
  
  // Preguntar si desea continuar
  const continuar = await question('\n¿Realizar otra operación? (S/N): ');
  
  if (continuar.toUpperCase() === 'S') {
    await mainMenu();
  } else {
    log('\n👋 Hasta luego!', 'green');
    rl.close();
    process.exit(0);
  }
}

// Ejecutar
mainMenu().catch(error => {
  log(`\n❌ Error fatal: ${error.message}`, 'red');
  console.error(error);
  rl.close();
  process.exit(1);
});
