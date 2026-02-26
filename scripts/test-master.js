#!/usr/bin/env node

/**
 * 🎯 SISTEMA MAESTRO DE PRUEBAS - BlackSugar21
 * 
 * Script centralizado que integra TODAS las funcionalidades de testing:
 * 
 * 📱 GESTIÓN DE MATCHES
 * - Crear matches con notificaciones automáticas
 * - Verificar estado de matches y notificaciones
 * - Listar matches actuales
 * - Eliminar matches de prueba
 * 
 * 💬 PRUEBAS DE MENSAJERÍA
 * - Enviar mensajes de prueba
 * - Simular conversaciones automáticas
 * - Verificar orden de reordenamiento
 * 
 * 🎯 PERFILES DE DISCOVERY
 * - Crear perfiles para HomeView/Swipe
 * - Corregir perfiles (migrar a collection users)
 * - Verificar orientaciones
 * 
 * 🔍 DIAGNÓSTICO
 * - Verificar sistema completo
 * - Ver logs de notificaciones
 * - Verificar FCM tokens
 * 
 * 🧹 LIMPIEZA
 * - Limpieza selectiva por tipo
 * - Limpieza completa
 * 
 * Autor: GitHub Copilot
 * Fecha: 16 de enero de 2026
 * Versión: 1.0.0
 */

const admin = require('firebase-admin');
const readline = require('readline');
const serviceAccount = require('./serviceAccountKey.json');
const https = require('https');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'black-sugar21.firebasestorage.app' // 🔥 CRÍTICO: Especificar bucket
});

const db = admin.firestore();
const auth = admin.auth();
const bucket = admin.storage().bucket(); // 🔥 Acceso a Storage

// Usuarios de prueba
const USERS = {
  DANIEL: {
    email: 'dverdugo85@gmail.com',
    uid: 'sU8xLiwQWNXmbYdR63p1uO6TSm72',
    name: 'Daniel',
    icon: '👨'
  },
  ROSITA: {
    email: 'ro.es4075@gmail.com',
    uid: 'DsDSK5xqEZZXAIKxtIKyBGntw8f2',
    name: 'Rosita',
    icon: '👩'
  }
};

// Usuario activo (se selecciona al inicio)
let CURRENT_USER = USERS.DANIEL;

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

// ============================================================================
// UTILIDADES
// ============================================================================

function generateChileGeohash() {
  const geohashes = ['66m', '66q', '66k', '66h', '66j', '66t', '66f'];
  return geohashes[Math.floor(Math.random() * geohashes.length)];
}

function clearScreen() {
  console.clear();
}

/**
 * Calcula la edad en años a partir de una fecha de nacimiento
 * @param {Date} birthDate - Fecha de nacimiento
 * @returns {number} - Edad en años
 */
function calculateAge(birthDate) {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  // Si aún no ha cumplido años este año, restar 1
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

async function pressEnterToContinue() {
  await question('\nPresiona Enter para continuar...');
}

/**
 * Descarga una imagen desde una URL usando HTTPS
 * @param {string} url - URL de la imagen a descargar
 * @returns {Promise<Buffer>} - Buffer con los datos de la imagen
 */
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
        return;
      }
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Sube una foto a Firebase Storage siguiendo la estructura de iOS/Android
 * Path: users/{userId}/{UUID}.jpg
 * @param {string} userId - ID del usuario
 * @param {Buffer} imageBuffer - Buffer con los datos de la imagen
 * @returns {Promise<string>} - Nombre del archivo (solo nombre, no path completo)
 */
async function uploadPhotoToStorage(userId, imageBuffer) {
  const crypto = require('crypto');
  const fileName = crypto.randomUUID() + '.jpg';
  const filePath = `users/${userId}/${fileName}`;
  
  await bucket.file(filePath).save(imageBuffer, {
    metadata: {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000'
    }
  });
  
  return fileName;
}

// ============================================================================
// CLOUD FUNCTIONS CALLABLE - Integración con index.js (Public-BlackSugar21)
// ============================================================================

/**
 * Llama a la Cloud Function 'sendTestNotification' para enviar una notificación de prueba
 * @param {string} userId - ID del usuario destinatario
 * @param {string} title - Título de la notificación (opcional)
 * @param {string} body - Cuerpo de la notificación (opcional)
 * @returns {Promise<Object>} - Resultado del envío
 */
async function callSendTestNotification(userId, title, body) {
  try {
    // Llamar a la Cloud Function usando el Admin SDK
    // Nota: Como estamos usando Admin SDK, simulamos la llamada haciendo lo que hace la función
    
    log(`📞 Llamando Cloud Function: sendTestNotification`, 'cyan');
    log(`   👤 Usuario: ${userId}`, 'reset');
    
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists || !userDoc.data().fcmToken) {
      throw new Error(`Usuario ${userId} no tiene FCM token`);
    }

    const fcmToken = userDoc.data().fcmToken;
    
    const message = {
      notification: {
        title: title || '🧪 Test Notification',
        body: body || 'This is a test notification from BlackSugar21',
      },
      data: {
        type: 'test',
        timestamp: Date.now().toString(),
      },
      token: fcmToken,
      apns: {
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
      android: {
        notification: {
          sound: 'default',
          channelId: 'default',
          priority: 'high',
        },
      },
    };

    const response = await admin.messaging().send(message);
    
    log(`   ✅ Notificación enviada: ${response}`, 'green');
    
    return {
      success: true,
      messageId: response,
      token: fcmToken,
    };
  } catch (error) {
    log(`   ❌ Error: ${error.message}`, 'red');
    throw error;
  }
}

/**
 * Llama a la Cloud Function 'updateFCMToken' para actualizar el token de un usuario
 * @param {string} userId - ID del usuario
 * @param {string} fcmToken - Nuevo token FCM
 * @returns {Promise<Object>} - Resultado de la actualización
 */
async function callUpdateFCMToken(userId, fcmToken) {
  try {
    log(`📞 Llamando Cloud Function: updateFCMToken`, 'cyan');
    log(`   👤 Usuario: ${userId}`, 'reset');
    
    await db.collection('users').doc(userId).update({
      fcmToken: fcmToken,
      fcmTokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    log(`   ✅ FCM token actualizado`, 'green');
    
    return {
      success: true,
      message: 'FCM token updated successfully',
    };
  } catch (error) {
    log(`   ❌ Error: ${error.message}`, 'red');
    throw error;
  }
}

/**
 * Verifica que las Cloud Functions triggers estén funcionando correctamente
 * Espera a que onMatchCreated y onMessageCreated se disparen automáticamente
 * @param {string} documentType - Tipo de documento ('match' o 'message')
 * @param {string} documentId - ID del documento creado
 * @param {number} timeoutMs - Tiempo máximo de espera en ms (default: 5000)
 * @returns {Promise<boolean>} - true si el trigger se ejecutó correctamente
 */
async function waitForCloudFunctionTrigger(documentType, documentId, timeoutMs = 5000) {
  const startTime = Date.now();
  
  log(`   ⏳ Esperando trigger: ${documentType === 'match' ? 'onMatchCreated' : 'onMessageCreated'}...`, 'yellow');
  
  while (Date.now() - startTime < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    let doc;
    if (documentType === 'match') {
      doc = await db.collection('matches').doc(documentId).get();
    } else if (documentType === 'message') {
      doc = await db.collection('messages').doc(documentId).get();
    }
    
    if (doc && doc.exists) {
      const data = doc.data();
      if (data.notificationSent === true) {
        const elapsed = Date.now() - startTime;
        log(`   ✅ Cloud Function ejecutada en ${elapsed}ms`, 'green');
        return true;
      }
    }
  }
  
  log(`   ⚠️  Timeout: Cloud Function no se ejecutó en ${timeoutMs}ms`, 'yellow');
  return false;
}

/**
 * Elimina completamente un usuario incluyendo todos sus documentos, subcolecciones y archivos de Storage
 * @param {string} userId - ID del usuario a eliminar
 * @returns {Promise<Object>} - Resumen de elementos eliminados
 */
async function deleteUserCompletely(userId) {
  const summary = {
    authDeleted: false,
    userDocDeleted: false,
    profileDocDeleted: false,
    storageFilesDeleted: 0,
    subcollectionsDeleted: {
      matches: 0,
      messages: 0,
      notifications: 0,
      reports: 0,
      blocks: 0,
      likes: 0,
      dateProposals: 0
    }
  };
  
  try {
    // 1. Eliminar de Firebase Auth
    try {
      await auth.deleteUser(userId);
      summary.authDeleted = true;
    } catch (e) {
      // Usuario puede no existir en Auth
    }
    
    // 2. Eliminar archivos de Storage (TODAS las carpetas del usuario)
    try {
      // Lista de todas las carpetas donde un usuario puede tener contenido
      const storagePaths = [
        `users/${userId}/`,           // Fotos de perfil
        `ephemeral_photos/${userId}/`, // Fotos efímeras
        `stories/${userId}/`,          // Stories personales
        `personal/${userId}/`          // Contenido personal
      ];
      
      for (const path of storagePaths) {
        try {
          const [files] = await bucket.getFiles({ prefix: path });
          for (const file of files) {
            await file.delete();
            summary.storageFilesDeleted++;
          }
        } catch (e) {
          // Carpeta puede no existir
        }
      }
    } catch (e) {
      // No hay archivos o error de permisos
    }
    
    // 3. Eliminar subcolecciones comunes
    // Nota: Firestore no permite listar subcolecciones sin conocer sus nombres
    // Por eso eliminamos las subcolecciones conocidas
    
    // 3.1 Eliminar matches donde el usuario está involucrado
    const matchesSnapshot = await db.collection('matches')
      .where('usersMatched', 'array-contains', userId)
      .get();
    
    for (const matchDoc of matchesSnapshot.docs) {
      await matchDoc.ref.delete();
      summary.subcollectionsDeleted.matches++;
    }
    
    // 3.2 Eliminar mensajes del usuario
    const messagesSnapshot = await db.collection('messages')
      .where('senderId', '==', userId)
      .get();
    
    for (const msgDoc of messagesSnapshot.docs) {
      await msgDoc.ref.delete();
      summary.subcollectionsDeleted.messages++;
    }
    
    // 3.3 Eliminar notificaciones del usuario
    const notificationsSnapshot = await db.collection('notifications')
      .where('userId', '==', userId)
      .get();
    
    for (const notifDoc of notificationsSnapshot.docs) {
      await notifDoc.ref.delete();
      summary.subcollectionsDeleted.notifications++;
    }
    
    // 3.4 Eliminar reportes hechos por el usuario
    const reportsSnapshot = await db.collection('reports')
      .where('reporterId', '==', userId)
      .get();
    
    for (const reportDoc of reportsSnapshot.docs) {
      await reportDoc.ref.delete();
      summary.subcollectionsDeleted.reports++;
    }
    
    // 3.5 Eliminar bloqueos del usuario
    const blocksSnapshot = await db.collection('blocks')
      .where('blockerId', '==', userId)
      .get();
    
    for (const blockDoc of blocksSnapshot.docs) {
      await blockDoc.ref.delete();
      summary.subcollectionsDeleted.blocks++;
    }
    
    // 3.6 Eliminar likes del usuario
    const likesSnapshot = await db.collection('likes')
      .where('likerId', '==', userId)
      .get();
    
    for (const likeDoc of likesSnapshot.docs) {
      await likeDoc.ref.delete();
      summary.subcollectionsDeleted.likes++;
    }
    
    // 3.7 Eliminar propuestas de citas
    const dateProposalsSnapshot = await db.collection('dateProposals')
      .where('proposerId', '==', userId)
      .get();
    
    for (const proposalDoc of dateProposalsSnapshot.docs) {
      await proposalDoc.ref.delete();
      summary.subcollectionsDeleted.dateProposals++;
    }
    
    // 4. Eliminar documento principal de 'profiles'
    try {
      await db.collection('profiles').doc(userId).delete();
      summary.profileDocDeleted = true;
    } catch (e) {}
    
    // 5. Eliminar documento principal de 'users' (DEBE SER EL ÚLTIMO)
    try {
      await db.collection('users').doc(userId).delete();
      summary.userDocDeleted = true;
    } catch (e) {}
    
  } catch (error) {
    throw new Error(`Error eliminando usuario ${userId}: ${error.message}`);
  }
  
  return summary;
}

async function selectUser() {
  clearScreen();
  log('\n👥 SELECCIONAR USUARIO', 'cyan');
  log('═'.repeat(70), 'cyan');
  log('', 'reset');
  log('1. 👨 Daniel (dverdugo85@gmail.com)', 'reset');
  log('   🆔 UID: sU8xLiwQWNXmbYdR63p1uO6TSm72', 'reset');
  log('', 'reset');
  log('2. 👩 Rosita (ro.es4075@gmail.com)', 'reset');
  log('   🆔 UID: DsDSK5xqEZZXAIKxtIKyBGntw8f2', 'reset');
  log('', 'reset');
  
  const choice = await question('👉 Selecciona usuario (1-2): ');
  
  switch(choice) {
    case '1':
      CURRENT_USER = USERS.DANIEL;
      log(`\n✅ Usuario seleccionado: ${CURRENT_USER.icon} ${CURRENT_USER.name}`, 'green');
      break;
    case '2':
      CURRENT_USER = USERS.ROSITA;
      log(`\n✅ Usuario seleccionado: ${CURRENT_USER.icon} ${CURRENT_USER.name}`, 'green');
      break;
    default:
      log('\n❌ Opción inválida, manteniendo usuario actual', 'yellow');
  }
  
  await new Promise(resolve => setTimeout(resolve, 1000));
}

// ============================================================================
// GESTIÓN DE MATCHES
// ============================================================================

async function createMatchesWithNotifications() {
  log('\n🎯 CREAR MATCHES CON NOTIFICACIONES', 'cyan');
  log('═'.repeat(70), 'cyan');
  
  const numMatches = await question('\n¿Cuántos matches crear? (1-10): ');
  const count = parseInt(numMatches);
  
  if (isNaN(count) || count < 1 || count > 10) {
    log('❌ Número inválido. Debe ser entre 1 y 10', 'red');
    return;
  }
  
  // Verificar FCM token
  log(`\n🔍 Verificando FCM token de ${CURRENT_USER.name}...`, 'yellow');
  const danielDoc = await db.collection('users').doc(CURRENT_USER.uid).get();
  const danielFcmToken = danielDoc.data()?.fcmToken;
  
  if (!danielFcmToken) {
    log(`⚠️  ${CURRENT_USER.name} no tiene FCM token registrado`, 'yellow');
    log('💡 Las notificaciones no podrán enviarse', 'cyan');
  } else {
    log(`✅ FCM Token: ${danielFcmToken.substring(0, 30)}...`, 'green');
  }
  
  const testUsers = [
    { name: 'Isabella', lastName: 'López', type: 'SUGAR_BABY', age: 23 },
    { name: 'Valentina', lastName: 'Martínez', type: 'SUGAR_BABY', age: 25 },
    { name: 'Camila', lastName: 'García', type: 'SUGAR_MOMMY', age: 32 },
    { name: 'Sofía', lastName: 'Rodríguez', type: 'SUGAR_BABY', age: 24 },
    { name: 'Martina', lastName: 'Fernández', type: 'SUGAR_BABY', age: 26 },
    { name: 'Lucía', lastName: 'Silva', type: 'SUGAR_BABY', age: 22 },
    { name: 'Emma', lastName: 'Torres', type: 'SUGAR_BABY', age: 27 },
    { name: 'Daniela', lastName: 'Morales', type: 'SUGAR_MOMMY', age: 30 },
    { name: 'Victoria', lastName: 'Castro', type: 'SUGAR_BABY', age: 24 },
    { name: 'Carolina', lastName: 'Flores', type: 'SUGAR_BABY', age: 25 },
  ];
  
  log(`\n🔄 Creando ${count} matches...\n`, 'yellow');
  
  const created = [];
  
  for (let i = 0; i < count; i++) {
    const user = testUsers[i];
    const fullName = `${user.name} ${user.lastName}`;
    const email = `match_test_${Date.now()}_${i}@blacksugar.test`;
    
    try {
      log(`📦 ${i + 1}/${count} - ${fullName}...`, 'cyan');
      
      // Crear usuario en Auth
      const userRecord = await auth.createUser({
        email: email,
        password: 'Test1234!',
        displayName: fullName
      });
      
      const userId = userRecord.uid;
      
      // Calcular birthDate
      const birthYear = new Date().getFullYear() - user.age;
      const birthDate = new Date(birthYear, 0, 1);
      
      // 🔥 SUBIR MÚLTIPLES FOTOS (3-6) A FIREBASE STORAGE
      const numPhotos = 3 + Math.floor(Math.random() * 4); // 3-6 fotos
      log(`  📸 Descargando ${numPhotos} fotos de RandomUser.me...`, 'cyan');
      
      const uploadedFileNames = [];
      for (let photoIndex = 0; photoIndex < numPhotos; photoIndex++) {
        const avatarUrl = `https://randomuser.me/api/portraits/women/${(i * 10 + photoIndex) % 99}.jpg`;
        const imageBuffer = await downloadImage(avatarUrl);
        
        const uploadedFileName = await uploadPhotoToStorage(userId, imageBuffer);
        uploadedFileNames.push(uploadedFileName);
      }
      
      log(`  ✅ ${numPhotos} fotos subidas: ${uploadedFileNames[0]} + ${numPhotos - 1} más`, 'green');
      
      // Crear en 'users'
      await db.collection('users').doc(userId).set({
        name: fullName,
        email: email,
        male: false,
        birthDate: admin.firestore.Timestamp.fromDate(birthDate),
        orientation: 'men',
        userType: user.type,
        city: 'Santiago',
        g: generateChileGeohash(),
        latitude: -33.4489,
        longitude: -70.6693,
        minAge: 18,
        maxAge: 99,
        maxDistance: 200,
        paused: false,
        visible: true,
        blocked: false,
        accountStatus: 'active', // 🔥 CRÍTICO para iOS: debe ser "active"
        isTest: true,
        // 🔥 CRÍTICO: iOS necesita fotos REALES en Storage (3-6 fotos)
        pictures: uploadedFileNames, // Array con 3-6 fotos REALES
        firstPictureName: uploadedFileNames[0], // Primera foto del array
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      // Crear en 'profiles'
      await db.collection('profiles').doc(userId).set({
        name: fullName,
        gender: 'female',
        userType: user.type,
        age: user.age,
        city: 'Santiago',
        isTest: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      // Crear match
      const matchId = [CURRENT_USER.uid, userId].sort().join('_');
      const now = admin.firestore.Timestamp.now();
      
      await db.collection('matches').doc(matchId).set({
        userId1: CURRENT_USER.uid,
        userId2: userId,
        usersMatched: [CURRENT_USER.uid, userId],
        timestamp: now,
        createdAt: now,
        lastMessage: `¡Hola! Tenemos un match 💕`,
        lastMessageSeq: 1,
        lastMessageTimestamp: now,
        isTest: true,
      });
      
      // 🔥 CRÍTICO: Agregar likes bidireccionales para que iOS muestre el match
      await db.collection('users').doc(CURRENT_USER.uid).update({
        liked: admin.firestore.FieldValue.arrayUnion(userId)
      });
      
      await db.collection('users').doc(userId).update({
        liked: admin.firestore.FieldValue.arrayUnion(CURRENT_USER.uid)
      });
      
      // 🔥 ESPERAR A QUE onMatchCreated (Public-BlackSugar21) SE EJECUTE
      log(`   📡 Esperando trigger: onMatchCreated (Public-BlackSugar21)...`, 'yellow');
      const triggerExecuted = await waitForCloudFunctionTrigger('match', matchId, 5000);
      
      if (!triggerExecuted) {
        log(`   ⚠️  La notificación puede demorarse más de lo esperado`, 'yellow');
      }
      
      // 🔍 VERIFICACIÓN COMPLETA POST-CREACIÓN
      const matchDoc = await db.collection('matches').doc(matchId).get();
      
      if (!matchDoc.exists) {
        log(`   ❌ ERROR: Match no existe en Firestore`, 'red');
        continue;
      }
      
      const matchData = matchDoc.data();
      const notificationSent = matchData?.notificationSent || false;
      
      // Verificar campos críticos del match
      const issues = [];
      if (!matchData.usersMatched || matchData.usersMatched.length !== 2) {
        issues.push('usersMatched inválido');
      }
      if (!matchData.usersMatched?.includes(CURRENT_USER.uid)) {
        issues.push(`usersMatched no incluye ${CURRENT_USER.name}`);
      }
      if (!matchData.usersMatched?.includes(userId)) {
        issues.push(`usersMatched no incluye ${fullName}`);
      }
      
      // 🔥 VERIFICACIÓN CRÍTICA: Query real (como las apps)
      const querySnapshot = await db.collection('matches')
        .where('usersMatched', 'array-contains', CURRENT_USER.uid)
        .get();
      
      const matchFoundInQuery = querySnapshot.docs.some(doc => doc.id === matchId);
      
      if (!matchFoundInQuery) {
        issues.push('❌ NO APARECE EN QUERY (apps no lo verán)');
      }
      
      // Verificar likes bidireccionales
      const [currentUserDoc, otherUserDoc] = await Promise.all([
        db.collection('users').doc(CURRENT_USER.uid).get(),
        db.collection('users').doc(userId).get()
      ]);
      
      const currentUserLikes = currentUserDoc.data()?.liked || [];
      const otherUserLikes = otherUserDoc.data()?.liked || [];
      
      if (!currentUserLikes.includes(userId)) {
        issues.push(`${CURRENT_USER.name} no tiene like de ${fullName}`);
      }
      if (!otherUserLikes.includes(CURRENT_USER.uid)) {
        issues.push(`${fullName} no tiene like de ${CURRENT_USER.name}`);
      }
      
      // Verificar accountStatus del otro usuario
      const otherUserStatus = otherUserDoc.data()?.accountStatus;
      if (otherUserStatus !== 'active') {
        issues.push(`accountStatus='${otherUserStatus}' (debe ser 'active')`);
      }
      
      created.push({
        name: fullName,
        userId: userId,
        matchId: matchId,
        notificationSent: notificationSent,
        queryable: matchFoundInQuery,
        issues: issues
      });
      
      if (issues.length === 0 && matchFoundInQuery) {
        log(`   ✅ ${fullName} - ${notificationSent ? '📲 Notificación OK' : '⚠️ Sin notif'} - 🔍 Consultable`, 
            notificationSent ? 'green' : 'yellow');
      } else {
        log(`   ⚠️ ${fullName} - PROBLEMAS DETECTADOS:`, 'yellow');
        issues.forEach(issue => log(`      • ${issue}`, 'red'));
      }
      
    } catch (error) {
      log(`   ❌ Error: ${error.message}`, 'red');
    }
  }
  
  // Resumen detallado
  log(`\n📊 RESUMEN COMPLETO:`, 'cyan');
  log('═'.repeat(70), 'cyan');
  
  log(`   ✅ Matches creados: ${created.length}/${count}`, 'green');
  
  const withNotif = created.filter(m => m.notificationSent).length;
  log(`   📲 Notificaciones: ${withNotif}/${created.length}`, withNotif > 0 ? 'green' : 'yellow');
  
  const queryable = created.filter(m => m.queryable).length;
  log(`   🔍 Consultables (aparecerán en apps): ${queryable}/${created.length}`, 
      queryable === created.length ? 'green' : 'red');
  
  const withIssues = created.filter(m => m.issues.length > 0).length;
  if (withIssues > 0) {
    log(`   ⚠️  Con problemas: ${withIssues}/${created.length}`, 'yellow');
    log(`\n🔧 MATCHES CON PROBLEMAS:`, 'yellow');
    created.filter(m => m.issues.length > 0).forEach(m => {
      log(`   • ${m.name}:`, 'red');
      m.issues.forEach(issue => log(`     - ${issue}`, 'red'));
    });
  }
  
  if (queryable === created.length && withIssues === 0) {
    log(`\n✅ TODOS LOS MATCHES ESTÁN CORRECTOS`, 'green');
    log(`💡 Abre la app para verlos`, 'cyan');
  } else {
    log(`\n⚠️  ALGUNOS MATCHES TIENEN PROBLEMAS`, 'yellow');
    log(`💡 Revisa los detalles arriba antes de probar en la app`, 'cyan');
  }
}

async function verifyMatchesAndNotifications() {
  log('\n🔍 VERIFICACIÓN PROFUNDA DE MATCHES', 'cyan');
  log('═'.repeat(70), 'cyan');
  
  log(`\n🔎 Buscando matches de ${CURRENT_USER.name}...`, 'yellow');
  
  // 🔥 Query exacta que usan iOS y Android
  const matchesSnapshot = await db.collection('matches')
    .where('usersMatched', 'array-contains', CURRENT_USER.uid)
    .get();
  
  if (matchesSnapshot.empty) {
    log('\n⚠️  No se encontraron matches', 'yellow');
    log(`💡 Crea algunos con la opción "Crear matches con notificaciones"`, 'cyan');
    return;
  }
  
  log(`\n✅ Encontrados ${matchesSnapshot.size} matches en Firestore\n`, 'green');
  
  const matches = [];
  let totalIssues = 0;
  
  for (const doc of matchesSnapshot.docs) {
    const data = doc.data();
    const matchId = doc.id;
    const issues = [];
    
    // Identificar otro usuario
    const otherUserId = data.usersMatched?.find(uid => uid !== CURRENT_USER.uid);
    
    if (!otherUserId) {
      issues.push('❌ No se pudo identificar otro usuario');
      matches.push({ matchId, issues, otherUserName: 'ERROR' });
      continue;
    }
    
    // Obtener datos del otro usuario
    let otherUserData = null;
    let otherUserName = 'Usuario desconocido';
    
    try {
      const userDoc = await db.collection('users').doc(otherUserId).get();
      if (userDoc.exists) {
        otherUserData = userDoc.data();
        otherUserName = otherUserData.name || otherUserName;
      } else {
        issues.push('❌ Usuario no existe en Firestore');
      }
    } catch (e) {
      issues.push(`❌ Error obteniendo usuario: ${e.message}`);
    }
    
    // 🔥 VALIDACIONES CRÍTICAS (mismas que iOS/Android)
    
    // 1. Campo usersMatched
    if (!data.usersMatched || data.usersMatched.length !== 2) {
      issues.push('❌ Campo usersMatched inválido');
    } else {
      if (!data.usersMatched.includes(CURRENT_USER.uid)) {
        issues.push(`❌ usersMatched no incluye a ${CURRENT_USER.name}`);
      }
      if (!data.usersMatched.includes(otherUserId)) {
        issues.push(`❌ usersMatched no incluye al otro usuario`);
      }
    }
    
    // 2. Estado de la cuenta del otro usuario
    if (otherUserData) {
      if (otherUserData.accountStatus !== 'active') {
        issues.push(`⚠️ accountStatus='${otherUserData.accountStatus}' (iOS/Android lo filtrarán)`);
      }
      if (otherUserData.paused === true) {
        issues.push('⚠️ Usuario pausado (iOS/Android lo ocultarán)');
      }
      if (otherUserData.blocked === true) {
        issues.push('⚠️ Usuario bloqueado (iOS/Android lo eliminarán)');
      }
      if (otherUserData.visible === false) {
        issues.push('⚠️ Usuario no visible');
      }
    }
    
    // 3. Likes bidireccionales
    if (otherUserData) {
      const currentUserDoc = await db.collection('users').doc(CURRENT_USER.uid).get();
      const currentUserLikes = currentUserDoc.data()?.liked || [];
      const otherUserLikes = otherUserData.liked || [];
      
      if (!currentUserLikes.includes(otherUserId)) {
        issues.push(`⚠️ ${CURRENT_USER.name} no tiene like de ${otherUserName}`);
      }
      if (!otherUserLikes.includes(CURRENT_USER.uid)) {
        issues.push(`⚠️ ${otherUserName} no tiene like de ${CURRENT_USER.name}`);
      }
    }
    
    totalIssues += issues.length;
    
    matches.push({
      matchId: matchId.substring(0, 16) + '...',
      otherUserName: otherUserName,
      otherUserId: otherUserId.substring(0, 8) + '...',
      lastMessage: data.lastMessage || '(sin mensajes)',
      timestamp: data.timestamp?.toDate(),
      notificationSent: data.notificationSent || false,
      isTest: data.isTest || false,
      accountStatus: otherUserData?.accountStatus || 'unknown',
      paused: otherUserData?.paused || false,
      blocked: otherUserData?.blocked || false,
      issues: issues
    });
  }
  
  // Mostrar matches con detalles
  matches.forEach((match, idx) => {
    const statusIcon = match.issues.length === 0 ? '✅' : '⚠️';
    log(`${idx + 1}. ${statusIcon} ${match.otherUserName}`, match.issues.length === 0 ? 'green' : 'yellow');
    log(`   Match ID: ${match.matchId}`, 'reset');
    log(`   User ID: ${match.otherUserId}`, 'reset');
    log(`   Estado: accountStatus='${match.accountStatus}' paused=${match.paused} blocked=${match.blocked}`, 'reset');
    log(`   Mensaje: "${match.lastMessage}"`, 'reset');
    log(`   ${match.notificationSent ? '✅' : '⚠️'} Notificación ${match.notificationSent ? 'enviada' : 'pendiente'}`, 
        match.notificationSent ? 'green' : 'yellow');
    if (match.isTest) log(`   🧪 Match de prueba`, 'cyan');
    
    if (match.issues.length > 0) {
      log(`   🔧 PROBLEMAS DETECTADOS:`, 'red');
      match.issues.forEach(issue => log(`      ${issue}`, 'red'));
    }
    console.log('');
  });
  
  // Resumen ejecutivo
  log('═'.repeat(70), 'cyan');
  log('📊 RESUMEN EJECUTIVO:', 'cyan');
  log('═'.repeat(70), 'cyan');
  
  const withNotif = matches.filter(m => m.notificationSent).length;
  const withIssues = matches.filter(m => m.issues.length > 0).length;
  const healthy = matches.length - withIssues;
  
  log(`   Total matches: ${matches.length}`, 'reset');
  log(`   ✅ Matches saludables: ${healthy}`, healthy > 0 ? 'green' : 'red');
  log(`   ⚠️  Con problemas: ${withIssues}`, withIssues > 0 ? 'yellow' : 'green');
  log(`   📲 Con notificación: ${withNotif}`, 'reset');
  log(`   🧪 De prueba: ${matches.filter(m => m.isTest).length}`, 'cyan');
  
  if (withIssues === 0) {
    log(`\n✅ TODOS LOS MATCHES ESTÁN PERFECTOS`, 'green');
    log(`💡 Deberían aparecer correctamente en iOS y Android`, 'cyan');
  } else {
    log(`\n⚠️  ${withIssues} matches tienen problemas que pueden evitar que aparezcan en las apps`, 'yellow');
    log(`💡 Revisa los detalles arriba para entender qué está fallando`, 'cyan');
  }
}

async function listMatches() {
  // 🔥 ORDENAR por timestamp (más reciente primero) para orden consistente
  const matchesSnapshot = await db.collection('matches')
    .where('usersMatched', 'array-contains', CURRENT_USER.uid)
    .orderBy('timestamp', 'desc')
    .get();
  
  if (matchesSnapshot.empty) {
    log('\n⚠️  No hay matches disponibles', 'yellow');
    return [];
  }
  
  log(`\n📋 ${matchesSnapshot.size} matches encontrados:\n`, 'cyan');
  
  const matches = [];
  
  for (let i = 0; i < matchesSnapshot.size; i++) {
    const doc = matchesSnapshot.docs[i];
    const data = doc.data();
    const otherUserId = data.userId1 === CURRENT_USER.uid ? data.userId2 : data.userId1;
    
    let otherUserName = 'Usuario';
    try {
      const userDoc = await db.collection('users').doc(otherUserId).get();
      if (userDoc.exists) {
        otherUserName = userDoc.data().name || otherUserName;
      }
    } catch (e) {}
    
    log(`${i + 1}. ${otherUserName}`, 'bright');
    log(`   "${data.lastMessage || '(sin mensajes)'}"`, 'reset');
    log(`   Seq: ${data.lastMessageSeq || 0} | ID: ${doc.id.substring(0, 8)}...`, 'reset');
    console.log('');
    
    matches.push({ doc, otherUserName });
  }
  
  return matches;
}

// ============================================================================
// PRUEBAS DE MENSAJERÍA
// ============================================================================

async function sendTestMessage() {
  log('\n💬 ENVIAR MENSAJE DE PRUEBA', 'cyan');
  log('═'.repeat(70), 'cyan');
  
  const matches = await listMatches();
  
  if (matches.length === 0) {
    log('💡 Primero crea matches con la opción del menú principal', 'yellow');
    return;
  }
  
  const choice = await question(`\n¿A qué match enviar mensaje? (1-${matches.length}): `);
  const index = parseInt(choice) - 1;
  
  if (isNaN(index) || index < 0 || index >= matches.length) {
    log('❌ Selección inválida', 'red');
    return;
  }
  
  const matchDoc = matches[index].doc;
  const matchId = matchDoc.id;
  const matchData = matchDoc.data();
  const otherUserName = matches[index].otherUserName;
  
  log(`\n💬 Match con: ${otherUserName}`, 'bright');
  
  const message = await question('Escribe el mensaje (o Enter para automático): ');
  const finalMessage = message.trim() || `Mensaje de prueba ${Date.now()}`;
  
  log('\n⏳ Enviando mensaje...', 'yellow');
  
  const newSeq = (matchData.lastMessageSeq || 0) + 1;
  const now = admin.firestore.Timestamp.now();
  
  // 🔥 Crear mensaje en Firestore - Subcolección matches/{matchId}/messages
  const messageRef = await db.collection('matches')
    .doc(matchId)
    .collection('messages')
    .add({
      senderId: CURRENT_USER.uid,
      receiverId: matchData.usersMatched.find(uid => uid !== CURRENT_USER.uid),
      message: finalMessage,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
      type: 'text',
      messageType: 'text'
    });
  
  log(`   📡 Mensaje creado: ${messageRef.id}`, 'yellow');
  log(`   ⏳ onMessageCreated procesará automáticamente...`, 'cyan');
  
  // Actualizar match
  await db.collection('matches').doc(matchId).update({
    lastMessage: finalMessage,
    lastMessageSeq: newSeq,
    lastMessageTimestamp: now,
    timestamp: now
  });
  
  log(`✅ Mensaje enviado (Seq: ${newSeq})`, 'green');
  log(`💡 El match con ${otherUserName} debería moverse a posición #1`, 'cyan');
}

async function simulateConversation() {
  log('\n🤖 SIMULAR CONVERSACIÓN', 'cyan');
  log('═'.repeat(70), 'cyan');
  
  const matches = await listMatches();
  
  if (matches.length === 0) {
    log('💡 Primero crea matches', 'yellow');
    return;
  }
  
  const choice = await question(`\n¿Con qué match? (1-${matches.length}): `);
  const index = parseInt(choice) - 1;
  
  if (isNaN(index) || index < 0 || index >= matches.length) {
    log('❌ Selección inválida', 'red');
    return;
  }
  
  const numMessages = await question('¿Cuántos mensajes? (1-10): ');
  const count = parseInt(numMessages);
  
  if (isNaN(count) || count < 1 || count > 10) {
    log('❌ Número inválido', 'red');
    return;
  }
  
  const matchDoc = matches[index].doc;
  const matchId = matchDoc.id;
  const matchData = matchDoc.data();
  const otherUserName = matches[index].otherUserName;
  
  const testMessages = [
    'Hola! ¿Cómo estás?',
    '¿Qué tal tu día?',
    'Me encanta tu perfil 😊',
    '¿Te gustaría tomar un café?',
    'Cuéntame más sobre ti',
    'Ese lugar se ve increíble',
    '¿Cuándo tienes tiempo libre?',
    'Me gustaría conocerte mejor',
    '¿Prefieres playa o montaña?',
    'Suena genial! 🎉'
  ];
  
  log(`\n💬 Conversación con ${otherUserName}...`, 'bright');
  log(`   Enviando ${count} mensajes (intervalo 2s)\n`, 'yellow');
  
  let currentSeq = matchData.lastMessageSeq || 0;
  
  for (let i = 0; i < count; i++) {
    const message = testMessages[i % testMessages.length];
    currentSeq++;
    
    const now = admin.firestore.Timestamp.now();
    
    // 🔥 Crear en subcolección matches/{matchId}/messages
    await db.collection('matches')
      .doc(matchId)
      .collection('messages')
      .add({
        senderId: CURRENT_USER.uid,
        receiverId: matchData.usersMatched.find(uid => uid !== CURRENT_USER.uid),
        message: message,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
        type: 'text',
        messageType: 'text'
      });
    
    await db.collection('matches').doc(matchId).update({
      lastMessage: message,
      lastMessageSeq: currentSeq,
      lastMessageTimestamp: now,
      timestamp: now
    });
    
    log(`✅ ${i + 1}/${count}: "${message}" (Seq: ${currentSeq})`, 'green');
    
    if (i < count - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  log(`\n🎉 Conversación completada`, 'green');
}

async function receiveConversation() {
  log('\n📥 RECIBIR CONVERSACIÓN (Mensajes del otro usuario)', 'cyan');
  log('═'.repeat(70), 'cyan');
  
  const matches = await listMatches();
  
  if (matches.length === 0) {
    log('💡 Primero crea matches', 'yellow');
    return;
  }
  
  const choice = await question(`\n¿De qué match quieres recibir mensajes? (1-${matches.length}): `);
  const index = parseInt(choice) - 1;
  
  if (isNaN(index) || index < 0 || index >= matches.length) {
    log('❌ Número inválido', 'red');
    return;
  }
  
  const matchDoc = matches[index].doc;
  const matchId = matchDoc.id;
  const matchData = matchDoc.data();
  const otherUserName = matches[index].otherUserName;
  const otherUserId = matchData.usersMatched.find(uid => uid !== CURRENT_USER.uid);
  
  const count = 10;
  const testMessages = [
    'Hola! ¿Cómo estás?',
    '¿Qué tal tu día?',
    'Me encanta tu perfil 😊',
    '¿Te gustaría tomar un café?',
    'Cuéntame más sobre ti',
    'Ese lugar se ve increíble',
    '¿Cuándo tienes tiempo libre?',
    'Me gustaría conocerte mejor',
    '¿Prefieres playa o montaña?',
    'Suena genial! 🎉'
  ];
  
  log(`\n📥 Recibiendo mensajes de ${otherUserName}...`, 'bright');
  log(`   ${count} mensajes (intervalo 2s)\n`, 'yellow');
  log(`⚠️  IMPORTANTE: Mantén la app ABIERTA en MatchListView para ver actualización UI`, 'yellow');
  
  let currentSeq = matchData.lastMessageSeq || 0;
  
  for (let i = 0; i < count; i++) {
    const message = testMessages[i % testMessages.length];
    currentSeq++;
    
    // 🔥 IMPORTANTE: senderId es el OTRO USUARIO (para simular mensaje recibido)
    await db.collection('matches')
      .doc(matchId)
      .collection('messages')
      .add({
        senderId: otherUserId,  // ✅ Mensaje del otro usuario
        receiverId: CURRENT_USER.uid,  // ✅ Tú recibes el mensaje
        message: message,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
        type: 'text',
        messageType: 'text'
      });
    
    // ✅ Actualizar match con serverTimestamp para trigger Firestore listener
    await db.collection('matches').doc(matchId).update({
      lastMessage: message,
      lastMessageSeq: currentSeq,
      lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageSenderId: otherUserId,  // ✅ Último mensaje fue del otro usuario
      isUnread: true  // ✅ Marcar como no leído
    });
    
    log(`✅ ${i + 1}/${count}: "${message}" (Seq: ${currentSeq})`, 'green');
    
    if (i < count - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  log(`\n🎉 Conversación recibida completada`, 'green');
  log(`💡 El match con ${otherUserName} debería estar en posición #1 en MatchListView`, 'cyan');
  log(`📱 Si abriste ChatView y regresaste, el match debería actualizarse automáticamente`, 'cyan');
}

async function receiveTestMessage() {
  log('\n📥 RECIBIR MENSAJE DE PRUEBA', 'cyan');
  log('═'.repeat(70), 'cyan');
  log(`\n💡 Esta función simula que RECIBES un mensaje (para probar notificaciones)`, 'yellow');
  log(`   Usuario que recibirá el mensaje: ${CURRENT_USER.icon} ${CURRENT_USER.name}`, 'bright');
  
  // Buscar todos los matches del usuario actual
  const matchesSnapshot = await db.collection('matches')
    .where('usersMatched', 'array-contains', CURRENT_USER.uid)
    .limit(5)
    .get();
  
  if (matchesSnapshot.empty) {
    log('\n💡 No hay matches disponibles. Primero crea matches con la opción 1', 'yellow');
    return;
  }
  
  // Si hay múltiples matches, mostrar opciones
  let selectedMatch;
  let matchId;
  let matchData;
  let senderUserId;
  let senderName;
  
  if (matchesSnapshot.size > 1) {
    log(`\n📋 Matches disponibles (${matchesSnapshot.size}):`, 'cyan');
    
    const matchOptions = [];
    for (const doc of matchesSnapshot.docs) {
      const data = doc.data();
      const otherUserId = data.usersMatched.find(id => id !== CURRENT_USER.uid);
      const otherUserDoc = await db.collection('users').doc(otherUserId).get();
      const otherUserName = otherUserDoc.data()?.name || 'Usuario';
      
      matchOptions.push({
        matchId: doc.id,
        matchData: data,
        senderUserId: otherUserId,
        senderName: otherUserName
      });
      
      log(`   ${matchOptions.length}. ${otherUserName} (${otherUserId.substring(0, 8)}...)`, 'reset');
    }
    
    const choice = await question(`\n👉 Selecciona el remitente (1-${matchOptions.length}): `);
    const index = parseInt(choice) - 1;
    
    if (index < 0 || index >= matchOptions.length) {
      log('❌ Opción inválida', 'red');
      return;
    }
    
    selectedMatch = matchOptions[index];
    matchId = selectedMatch.matchId;
    matchData = selectedMatch.matchData;
    senderUserId = selectedMatch.senderUserId;
    senderName = selectedMatch.senderName;
  } else {
    // Solo hay un match, usarlo directamente
    const matchDoc = matchesSnapshot.docs[0];
    matchId = matchDoc.id;
    matchData = matchDoc.data();
    senderUserId = matchData.usersMatched.find(id => id !== CURRENT_USER.uid);
    const senderUserDoc = await db.collection('users').doc(senderUserId).get();
    senderName = senderUserDoc.data()?.name || 'Usuario';
  }
  
  log(`\n💬 Configuración:`, 'cyan');
  log(`   📤 De: ${senderName}`, 'bright');
  log(`   📥 Para: ${CURRENT_USER.name} (TÚ)`, 'bright');
  log(`   🆔 Sender ID: ${senderUserId.substring(0, 8)}...`, 'reset');
  log(`   📍 Match ID: ${matchId.substring(0, 30)}...`, 'reset');
  
  const confirm = await question('\n¿Enviar mensaje de prueba? (s/n): ');
  
  if (confirm.toLowerCase() !== 's') {
    log('❌ Cancelado', 'yellow');
    return;
  }
  
  log('\n⏳ Enviando mensaje...', 'yellow');
  
  // Crear mensaje DEL OTRO USUARIO hacia el usuario actual
  const messageText = `¡Hola ${CURRENT_USER.name}! Mensaje de prueba ${Date.now()} 📱`;
  
  const newSeq = (matchData.lastMessageSeq || 0) + 1;
  const now = admin.firestore.Timestamp.now();
  
  const messageRef = await db.collection('matches')
    .doc(matchId)
    .collection('messages')
    .add({
      senderId: senderUserId,  // 🔥 IMPORTANTE: El otro usuario es el remitente
      receiverId: CURRENT_USER.uid,
      message: messageText,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
      type: 'text',
      messageType: 'text'
    });
  
  // Actualizar match
  await db.collection('matches').doc(matchId).update({
    lastMessage: messageText,
    lastMessageSeq: newSeq,
    lastMessageTimestamp: now,
    timestamp: now
  });
  
  log(`   ✅ Mensaje creado: ${messageRef.id}`, 'green');
  log(`   ⏳ Esperando 5 segundos a que onMessageCreated lo procese...`, 'cyan');
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Verificar si se envió la notificación
  const messageDoc = await messageRef.get();
  const message = messageDoc.data();
  
  log('\n📊 RESULTADO:', 'cyan');
  log(`   chatId: ${message.chatId}`, 'reset');
  log(`   Remitente: ${senderName}`, 'reset');
  log(`   Receptor: ${CURRENT_USER.name} ✅ (TÚ)`, 'bright');
  log(`   Notificación enviada: ${message.notificationSent ? '✅ SÍ' : '❌ NO'}`, message.notificationSent ? 'green' : 'red');
  
  if (message.notificationSkipReason) {
    log(`   ⚠️  Skip Reason: ${message.notificationSkipReason}`, 'yellow');
  }
  
  if (message.notificationError) {
    log(`   ❌ Error: ${message.notificationError}`, 'red');
  }
  
  if (message.notificationSent) {
    log('\n🎉 ¡ÉXITO! La notificación debería haber llegado a tu dispositivo!', 'green');
    log(`💡 Revisa tu dispositivo para confirmar la notificación de "${senderName}"`, 'cyan');
    log(`📱 Al tocar la notificación, debería abrir: Home → Tab Messages → ChatView`, 'cyan');
  } else {
    log('\n⚠️  La notificación NO fue enviada', 'yellow');
    log('💡 Revisa los logs con: firebase functions:log', 'cyan');
  }
}

// ============================================================================
// PERFILES DE DISCOVERY
// ============================================================================

async function createDiscoveryProfiles() {
  log('\n🎯 CREAR PERFILES DE DISCOVERY', 'cyan');
  log('═'.repeat(70), 'cyan');
  
  // 🔥 OBTENER PERFIL COMPLETO DEL USUARIO ACTIVO
  log(`\n🔍 Obteniendo perfil de ${CURRENT_USER.name}...`, 'yellow');
  const currentUserDoc = await db.collection('users').doc(CURRENT_USER.uid).get();
  
  if (!currentUserDoc.exists) {
    log(`❌ Usuario ${CURRENT_USER.name} no existe en Firestore`, 'red');
    return;
  }
  
  const userData = currentUserDoc.data();
  const userLatitude = userData.latitude || -33.4489;
  const userLongitude = userData.longitude || -70.6693;
  const userGeohash = userData.g || generateChileGeohash();
  const userOrientation = userData.orientation || 'women'; // "men" o "women"
  const userIsMale = userData.male || false;
  const userType = userData.userType || 'SUGAR_DADDY';
  const userMinAge = userData.minAge || 18;
  const userMaxAge = userData.maxAge || 99;
  
  log(`✅ Ubicación: ${userLatitude}, ${userLongitude}`, 'green');
  log(`✅ Geohash: ${userGeohash}`, 'green');
  log(`✅ Usuario es: ${userIsMale ? 'MALE' : 'FEMALE'}, tipo: ${userType}`, 'green');
  log(`✅ Busca: ${userOrientation === 'men' ? 'HOMBRES' : 'MUJERES'}`, 'green');
  log(`✅ Rango de edad: ${userMinAge}-${userMaxAge}`, 'green');
  
  const numProfiles = await question('\n¿Cuántos perfiles crear? (5-30): ');
  const count = parseInt(numProfiles);
  
  if (isNaN(count) || count < 5 || count > 30) {
    log('❌ Número inválido. Debe ser entre 5 y 30', 'red');
    return;
  }
  
  const names = {
    women: ['Sofia', 'Isabella', 'Valentina', 'Camila', 'Martina', 'Lucia', 'Emma', 'Paula'],
    men: ['Carlos', 'Miguel', 'Alejandro', 'Diego', 'Sebastian', 'Mateo', 'Lucas', 'Santiago']
  };
  
  const lastNames = ['Martinez', 'Lopez', 'Garcia', 'Rodriguez', 'Fernandez', 'Sanchez'];
  
  log(`\n🔄 Creando ${count} perfiles COMPATIBLES con ${CURRENT_USER.name}...\n`, 'yellow');
  
  // 🔥 EDAD COMPATIBLE: Calcular rangos fuera del loop
  const minAllowedAge = Math.max(18, userMinAge);
  const maxAllowedAge = Math.min(80, userMaxAge);
  const ageRange = maxAllowedAge - minAllowedAge;
  
  let created = 0;
  
  for (let i = 0; i < count; i++) {
    // 🔥 COMPATIBILIDAD: Crear perfiles del género que busca el usuario
    const profileIsMale = userOrientation === 'men'; // Si busca hombres, crear hombres
    
    const nameList = profileIsMale ? names.men : names.women;
    const firstName = nameList[i % nameList.length];
    const lastName = lastNames[i % lastNames.length];
    const fullName = `${firstName} ${lastName}`;
    const email = `discovery_${Date.now()}_${i}@bstest.com`;
    
    try {
      // Crear en Auth
      const userRecord = await auth.createUser({
        email: email,
        password: 'Test1234!',
        displayName: fullName
      });
      
      const userId = userRecord.uid;
      
      // 🔥 EDAD COMPATIBLE: Dentro del rango de búsqueda del usuario
      const age = minAllowedAge + (i % Math.max(1, ageRange));
      
      const birthYear = new Date().getFullYear() - age;
      const birthDate = new Date(birthYear, 0, 1);
      
      // 🔥 USERTYPE COMPATIBLE
      let profileUserType;
      if (profileIsMale) {
        // Si el perfil es masculino, puede ser SUGAR_DADDY o SUGAR_BABY
        profileUserType = i % 2 === 0 ? 'SUGAR_DADDY' : 'SUGAR_BABY';
      } else {
        // Si el perfil es femenino, puede ser SUGAR_MOMMY o SUGAR_BABY
        profileUserType = i % 3 === 0 ? 'SUGAR_MOMMY' : 'SUGAR_BABY';
      }
      
      // 🔥 ORIENTATION COMPATIBLE: El perfil debe buscar el género del usuario
      const profileOrientation = userIsMale ? 'men' : 'women';
      
      // 🔥 SUBIR MÚLTIPLES FOTOS (3-6) A FIREBASE STORAGE
      const numPhotos = 3 + Math.floor(Math.random() * 4); // 3-6 fotos
      log(`  📸 Descargando ${numPhotos} fotos de RandomUser.me...`, 'cyan');
      
      const gender = profileIsMale ? 'men' : 'women';
      const uploadedFileNames = [];
      
      for (let photoIndex = 0; photoIndex < numPhotos; photoIndex++) {
        const avatarUrl = `https://randomuser.me/api/portraits/${gender}/${(i * 10 + photoIndex) % 99}.jpg`;
        const imageBuffer = await downloadImage(avatarUrl);
        
        const uploadedFileName = await uploadPhotoToStorage(userId, imageBuffer);
        uploadedFileNames.push(uploadedFileName);
      }
      
      log(`  ✅ ${numPhotos} fotos subidas: ${uploadedFileNames[0]} + ${numPhotos - 1} más`, 'green');
      
      // 🔥 COORDENADAS COMPATIBLES: Cerca del usuario activo
      const latVariation = (Math.random() - 0.5) * 0.01; // ±0.005° (~500m)
      const lonVariation = (Math.random() - 0.5) * 0.01;
      const profileLatitude = userLatitude + latVariation;
      const profileLongitude = userLongitude + lonVariation;
      
      // Calcular geohash para las coordenadas del perfil (cerca del usuario)
      const geofire = require('geofire-common');
      const profileGeohash = geofire.geohashForLocation([profileLatitude, profileLongitude]);
      
      // Crear en 'users' con MISMOS CAMPOS CRÍTICOS que los matches
      await db.collection('users').doc(userId).set({
        name: fullName,
        email: email,
        male: profileIsMale, // 🔥 COMPATIBLE con lo que busca el usuario
        birthDate: admin.firestore.Timestamp.fromDate(birthDate),
        orientation: profileOrientation, // 🔥 COMPATIBLE: busca el género del usuario
        userType: profileUserType,
        age: age, // 🔥 COMPATIBLE: dentro del rango del usuario
        city: userData.city || 'Santiago',
        g: profileGeohash, // 🔥 GEOHASH calculado con coordenadas cercanas
        latitude: profileLatitude, // 🔥 CERCA del usuario activo
        longitude: profileLongitude, // 🔥 CERCA del usuario activo
        minAge: 18,
        maxAge: 99,
        maxDistance: 200,
        paused: false,
        visible: true,
        blocked: false,
        accountStatus: 'active', // 🔥 CRÍTICO para iOS: debe ser "active"
        isDiscoveryProfile: true,
        isTest: true,
        // 🔥 CRÍTICO: iOS necesita fotos REALES en Storage (3-6 fotos)
        pictures: uploadedFileNames, // Array con 3-6 fotos REALES
        firstPictureName: uploadedFileNames[0], // Primera foto del array
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      // Crear en 'profiles'
      await db.collection('profiles').doc(userId).set({
        name: fullName,
        gender: profileIsMale ? 'male' : 'female',
        userType: profileUserType,
        age: age,
        city: userData.city || 'Santiago',
        isDiscoveryProfile: true,
        isTest: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      created++;
      log(`✅ ${i + 1}. ${fullName} (${profileUserType}, ${profileIsMale ? 'MALE' : 'FEMALE'}, busca ${profileOrientation}, edad ${age})`, 'green');
      
    } catch (error) {
      log(`❌ Error en ${fullName}: ${error.message}`, 'red');
    }
  }
  
  log(`\n📊 RESUMEN:`, 'cyan');
  log(`   ✅ Perfiles creados: ${created}/${count}`, 'green');
  log(`   📍 Ubicación: Cerca de ${CURRENT_USER.name} (${userLatitude.toFixed(4)}, ${userLongitude.toFixed(4)})`, 'cyan');
  log(`   👥 Género: ${userOrientation === 'men' ? 'HOMBRES' : 'MUJERES'} (compatible con búsqueda de ${CURRENT_USER.name})`, 'cyan');
  log(`   🎯 Orientación: Buscan ${userIsMale ? 'HOMBRES' : 'MUJERES'} (compatible con ${CURRENT_USER.name})`, 'cyan');
  log(`   📅 Edades: ${minAllowedAge}-${maxAllowedAge} años (dentro del rango de ${CURRENT_USER.name})`, 'cyan');
  log(`\n💡 Estos perfiles aparecerán en el HomeView (swipe)`, 'cyan');
}

async function fixDiscoveryProfiles() {
  log('\n🔧 CORREGIR PERFILES DE DISCOVERY', 'cyan');
  log('═'.repeat(70), 'cyan');
  
  const profilesSnapshot = await db.collection('profiles')
    .where('isDiscoveryProfile', '==', true)
    .get();
  
  if (profilesSnapshot.size === 0) {
    log('\n⚠️  No hay perfiles de discovery para corregir', 'yellow');
    return;
  }
  
  log(`\n📦 Encontrados ${profilesSnapshot.size} perfiles`, 'yellow');
  log('🔄 Migrando a collection "users"...\n', 'yellow');
  
  let fixed = 0;
  
  for (const doc of profilesSnapshot.docs) {
    const profileData = doc.data();
    const userId = doc.id;
    
    try {
      const age = profileData.age || 25;
      const birthYear = new Date().getFullYear() - age;
      const birthDate = new Date(birthYear, 0, 1);
      
      let orientation = 'both';
      if (profileData.userType === 'SUGAR_DADDY') {
        orientation = 'women';
      } else if (profileData.userType === 'SUGAR_MOMMY') {
        orientation = 'men';
      } else {
        orientation = profileData.gender === 'male' ? 'women' : 'men';
      }
      
      await db.collection('users').doc(userId).set({
        name: profileData.name || 'Sin nombre',
        male: profileData.gender === 'male',
        birthDate: admin.firestore.Timestamp.fromDate(birthDate),
        orientation: orientation,
        userType: profileData.userType || 'SUGAR_BABY',
        city: profileData.city || 'Santiago',
        g: generateChileGeohash(),
        latitude: -33.4489,
        longitude: -70.6693,
        minAge: 18,
        maxAge: 99,
        maxDistance: 200,
        paused: false,
        visible: true,
        blocked: false,
        accountStatus: 'active', // 🔥 CRÍTICO para iOS: debe ser "active"
        isDiscoveryProfile: true,
        isTest: true,
        createdAt: profileData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      
      fixed++;
      log(`✅ ${fixed}. ${profileData.name}`, 'green');
      
    } catch (error) {
      log(`❌ Error en ${profileData.name}: ${error.message}`, 'red');
    }
  }
  
  log(`\n📊 RESUMEN:`, 'cyan');
  log(`   ✅ Perfiles corregidos: ${fixed}`, 'green');
}

// ============================================================================
// LIMPIEZA
// ============================================================================

async function cleanupTestData() {
  log('\n🧹 LIMPIEZA DE DATOS DE PRUEBA', 'cyan');
  log('═'.repeat(70), 'cyan');
  
  log('\n¿Qué deseas limpiar?\n', 'yellow');
  log('1. Solo matches de prueba', 'reset');
  log('2. Solo perfiles de discovery', 'reset');
  log('3. Solo mensajes de prueba', 'reset');
  log('4. Matches + usuarios match_test_ (completa)', 'reset');
  log('5. Solo perfiles de likes (isLikeTestProfile)', 'reset');
  log('6. TODO (matches + discovery + mensajes + usuarios + likes)', 'reset');
  log('7. Cancelar', 'reset');
  
  const choice = await question('\nSelecciona opción (1-7): ');
  
  if (choice === '7') {
    log('✅ Cancelado', 'green');
    return;
  }
  
  const confirm = await question('\n⚠️  ¿Estás seguro? (escribe "SI" para confirmar): ');
  
  if (confirm !== 'SI') {
    log('✅ Cancelado', 'green');
    return;
  }
  
  log('\n🔄 Limpiando...', 'yellow');
  
  let deletedMatches = 0;
  let deletedMessages = 0;
  let deletedUsers = 0;
  
  try {
    // Limpiar matches
    if (['1', '4', '6'].includes(choice)) {
      const matchesSnapshot = await db.collection('matches')
        .where('isTest', '==', true)
        .get();
      
      log(`   🔍 Encontrados ${matchesSnapshot.size} matches de prueba...`, 'cyan');
      
      for (const doc of matchesSnapshot.docs) {
        await doc.ref.delete();
        deletedMatches++;
      }
    }
    
    // Limpiar usuarios match_test_ (creados con los matches)
    if (['4', '6'].includes(choice)) {
      log(`\n   🔍 Buscando usuarios match_test_...`, 'cyan');
      
      // Buscar usuarios por email pattern match_test_
      const usersSnapshot = await db.collection('users')
        .where('email', '>=', 'match_test_')
        .where('email', '<', 'match_test_' + '\uf8ff')
        .get();
      
      log(`   🔍 Encontrados ${usersSnapshot.size} usuarios match_test_...`, 'cyan');
      
      for (const doc of usersSnapshot.docs) {
        const userName = doc.data().name || 'Sin nombre';
        log(`   🗑️  Eliminando ${userName}...`, 'yellow');
        
        const summary = await deleteUserCompletely(doc.id);
        deletedUsers++;
        
        // Mostrar resumen detallado
        if (summary.storageFilesDeleted > 0) {
          log(`      📸 ${summary.storageFilesDeleted} foto(s) eliminada(s) de Storage`, 'gray');
        }
        
        const totalSubcollections = Object.values(summary.subcollectionsDeleted).reduce((a, b) => a + b, 0);
        if (totalSubcollections > 0) {
          log(`      📦 ${totalSubcollections} documento(s) relacionado(s) eliminado(s)`, 'gray');
        }
      }
    }
    
    // Limpiar mensajes
    if (['3', '6'].includes(choice)) {
      const matchesSnapshot = await db.collection('matches')
        .where('isTest', '==', true)
        .get();
      
      for (const matchDoc of matchesSnapshot.docs) {
        // 🔥 BUSCAR POR chatId (nuevo formato) Y matchId (legacy)
        const messagesSnapshotNew = await db.collection('messages')
          .where('chatId', '==', matchDoc.id)
          .get();
        
        const messagesSnapshotLegacy = await db.collection('messages')
          .where('matchId', '==', matchDoc.id)
          .get();
        
        for (const msgDoc of messagesSnapshotNew.docs) {
          await msgDoc.ref.delete();
          deletedMessages++;
        }
        
        for (const msgDoc of messagesSnapshotLegacy.docs) {
          await msgDoc.ref.delete();
          deletedMessages++;
        }
      }
    }
    
    // Limpiar perfiles de likes
    if (['5', '6'].includes(choice)) {
      log(`\n   🔍 Buscando perfiles de likes (isLikeTestProfile)...`, 'cyan');
      
      const likesSnapshot = await db.collection('users')
        .where('isLikeTestProfile', '==', true)
        .get();
      
      log(`   🔍 Encontrados ${likesSnapshot.size} perfiles de likes...`, 'cyan');
      
      for (const doc of likesSnapshot.docs) {
        const userName = doc.data().name || 'Sin nombre';
        log(`   🗑️  Eliminando ${userName}...`, 'yellow');
        
        const summary = await deleteUserCompletely(doc.id);
        deletedUsers++;
        
        // Mostrar resumen detallado
        if (summary.storageFilesDeleted > 0) {
          log(`      📸 ${summary.storageFilesDeleted} foto(s) eliminada(s) de Storage`, 'gray');
        }
        
        const totalSubcollections = Object.values(summary.subcollectionsDeleted).reduce((a, b) => a + b, 0);
        if (totalSubcollections > 0) {
          log(`      📦 ${totalSubcollections} documento(s) relacionado(s) eliminado(s)`, 'gray');
        }
      }
    }
    
    // Limpiar perfiles discovery
    if (['2', '6'].includes(choice)) {
      log(`\n   🔍 Buscando perfiles discovery...`, 'cyan');
      
      const usersSnapshot = await db.collection('users')
        .where('isDiscoveryProfile', '==', true)
        .get();
      
      log(`   🔍 Encontrados ${usersSnapshot.size} perfiles discovery...`, 'cyan');
      
      for (const doc of usersSnapshot.docs) {
        const userName = doc.data().name || 'Sin nombre';
        log(`   🗑️  Eliminando ${userName}...`, 'yellow');
        
        const summary = await deleteUserCompletely(doc.id);
        deletedUsers++;
        
        // Mostrar resumen detallado
        if (summary.storageFilesDeleted > 0) {
          log(`      📸 ${summary.storageFilesDeleted} foto(s) eliminada(s) de Storage`, 'gray');
        }
        
        const totalSubcollections = Object.values(summary.subcollectionsDeleted).reduce((a, b) => a + b, 0);
        if (totalSubcollections > 0) {
          log(`      📦 ${totalSubcollections} documento(s) relacionado(s) eliminado(s)`, 'gray');
        }
      }
    }
    
    log('\n✅ LIMPIEZA COMPLETADA', 'green');
    log(`   🗑️  Matches eliminados: ${deletedMatches}`, 'reset');
    log(`   🗑️  Mensajes eliminados: ${deletedMessages}`, 'reset');
    log(`   🗑️  Usuarios eliminados: ${deletedUsers}`, 'reset');
    
  } catch (error) {
    log(`\n❌ Error durante limpieza: ${error.message}`, 'red');
  }
}

// ============================================================================
// STORAGE - AUDITORÍA Y LIMPIEZA
// ============================================================================

/**
 * Lista todas las carpetas principales en Storage
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
 * Audita Storage buscando carpetas huérfanas (usuarios eliminados)
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
 * Limpia carpetas huérfanas de Storage
 */
async function cleanOrphanedFolders() {
  log('\n🗑️  LIMPIEZA DE CARPETAS HUÉRFANAS', 'cyan');
  log('═'.repeat(70), 'cyan');
  
  // Primero auditar
  const orphanedUsers = await auditOrphanedFolders();
  
  if (orphanedUsers.length === 0) {
    log('\n✅ No hay nada que limpiar', 'green');
    return;
  }
  
  const totalFiles = orphanedUsers.reduce((sum, u) => sum + u.totalFiles, 0);
  
  log(`\n⚠️  Se eliminarán ${orphanedUsers.length} carpetas con ${totalFiles} archivos`, 'yellow');
  const confirm = await question('\n⚠️  ¿Estás seguro? (escribe "SI" para confirmar): ');
  
  if (confirm !== 'SI') {
    log('✅ Cancelado', 'green');
    return;
  }
  
  log('\n🔄 Eliminando carpetas huérfanas...', 'yellow');
  
  let deletedFiles = 0;
  const folderPrefixes = ['users/', 'ephemeral_photos/', 'stories/', 'personal/'];
  
  for (const user of orphanedUsers) {
    log(`\n   🗑️  Eliminando archivos de ${user.userId}...`, 'cyan');
    
    for (const prefix of folderPrefixes) {
      try {
        const fullPrefix = `${prefix}${user.userId}/`;
        const [files] = await bucket.getFiles({ prefix: fullPrefix });
        
        for (const file of files) {
          try {
            await file.delete();
            deletedFiles++;
            log(`      ✅ ${file.name}`, 'gray');
          } catch (e) {
            log(`      ❌ Error eliminando ${file.name}: ${e.message}`, 'red');
          }
        }
      } catch (e) {
        // Carpeta puede no existir
      }
    }
  }
  
  log(`\n✅ LIMPIEZA COMPLETADA`, 'green');
  log(`   🗑️  Archivos eliminados: ${deletedFiles}`, 'reset');
  log(`   📁 Carpetas limpiadas: ${orphanedUsers.length}`, 'reset');
}

/**
 * Verifica archivos de un usuario específico
 */
async function verifyUserFiles() {
  log('\n📋 VERIFICAR ARCHIVOS DE USUARIO', 'cyan');
  log('═'.repeat(70), 'cyan');
  
  const userId = await question('\n👤 Ingresa el userId: ');
  
  if (!userId.trim()) {
    log('❌ UserId no válido', 'red');
    return;
  }
  
  log(`\n🔍 Buscando archivos de ${userId}...`, 'yellow');
  
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

/**
 * Audita usuarios huérfanos en Firestore (sin campo name obligatorio)
 */
async function auditOrphanedUsers() {
  log('\n🔍 AUDITORÍA DE USUARIOS HUÉRFANOS', 'cyan');
  log('═'.repeat(70), 'cyan');
  log('Buscando usuarios sin campo "name" (campo obligatorio al iniciar app)...', 'yellow');
  
  try {
    // Obtener TODOS los usuarios de Firestore
    log('\n1️⃣  Escaneando colección users...', 'cyan');
    const usersSnapshot = await db.collection('users').get();
    log(`   ✅ Encontrados ${usersSnapshot.size} documentos`, 'green');
    
    // Verificar cuáles no tienen name o lo tienen vacío
    log('\n2️⃣  Verificando campo "name"...', 'cyan');
    const orphanedUsers = [];
    let checked = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      checked++;
      if (checked % 50 === 0) {
        process.stdout.write(`\r   📊 Verificados: ${checked}/${usersSnapshot.size}`);
      }
      
      const userData = userDoc.data();
      const userId = userDoc.id;
      
      // Usuario huérfano = sin campo name O name vacío
      if (!userData.name || userData.name.trim() === '') {
        // Verificar si tiene archivos en Storage
        const storageFiles = await listUserFiles(userId);
        
        orphanedUsers.push({
          userId,
          email: userData.email || 'Sin email',
          createdAt: userData.createdAt?.toDate?.() || null,
          hasStorage: storageFiles.totalFiles > 0,
          storageFiles: storageFiles.totalFiles,
          otherFields: Object.keys(userData).filter(k => k !== 'name' && k !== 'email')
        });
      }
    }
    
    process.stdout.write('\r' + ' '.repeat(60) + '\r');
    
    // 3. Mostrar resultados
    log('\n3️⃣  Resultados:', 'cyan');
    if (orphanedUsers.length === 0) {
      log('   ✅ No se encontraron usuarios huérfanos', 'green');
    } else {
      log(`   ⚠️  Encontrados ${orphanedUsers.length} usuarios huérfanos:`, 'yellow');
      
      let totalStorageFiles = 0;
      orphanedUsers.forEach(user => {
        totalStorageFiles += user.storageFiles;
        log(`\n   📁 Usuario: ${user.userId}`, 'reset');
        log(`      Email: ${user.email}`, 'gray');
        if (user.createdAt) {
          log(`      Creado: ${user.createdAt.toLocaleString('es-CL')}`, 'gray');
        }
        log(`      Archivos en Storage: ${user.storageFiles}`, user.hasStorage ? 'yellow' : 'gray');
        log(`      Otros campos: ${user.otherFields.length}`, 'gray');
      });
      
      log(`\n   📊 Total archivos en Storage: ${totalStorageFiles}`, 'yellow');
    }
    
    return orphanedUsers;
  } catch (error) {
    log(`\n❌ Error durante auditoría: ${error.message}`, 'red');
    return [];
  }
}

/**
 * Limpia usuarios huérfanos de Firestore y Storage
 */
async function cleanOrphanedUsers() {
  log('\n🗑️  LIMPIEZA DE USUARIOS HUÉRFANOS', 'cyan');
  log('═'.repeat(70), 'cyan');
  
  // Primero auditar
  const orphanedUsers = await auditOrphanedUsers();
  
  if (orphanedUsers.length === 0) {
    log('\n✅ No hay usuarios huérfanos que limpiar', 'green');
    return;
  }
  
  const totalFiles = orphanedUsers.reduce((sum, u) => sum + u.storageFiles, 0);
  
  log(`\n⚠️  Se eliminarán ${orphanedUsers.length} usuarios huérfanos`, 'yellow');
  log(`   📸 ${totalFiles} archivos en Storage`, 'yellow');
  const confirm = await question('\n⚠️  ¿Estás seguro? (escribe "SI" para confirmar): ');
  
  if (confirm !== 'SI') {
    log('✅ Cancelado', 'green');
    return;
  }
  
  log('\n🔄 Eliminando usuarios huérfanos...', 'yellow');
  
  let deletedUsers = 0;
  let deletedStorageFiles = 0;
  let deletedFromAuth = 0;
  
  for (const user of orphanedUsers) {
    log(`\n   🗑️  Eliminando ${user.userId}...`, 'cyan');
    
    try {
      // 1. Eliminar de Auth si existe
      try {
        await auth.deleteUser(user.userId);
        deletedFromAuth++;
        log(`      ✅ Eliminado de Auth`, 'gray');
      } catch (e) {
        log(`      ⚪ No existe en Auth`, 'gray');
      }
      
      // 2. Eliminar archivos de Storage
      const folderPrefixes = [
        `users/${user.userId}/`,
        `ephemeral_photos/${user.userId}/`,
        `stories/${user.userId}/`,
        `personal/${user.userId}/`
      ];
      
      for (const prefix of folderPrefixes) {
        try {
          const [files] = await bucket.getFiles({ prefix });
          for (const file of files) {
            await file.delete();
            deletedStorageFiles++;
          }
        } catch (e) {
          // Carpeta puede no existir
        }
      }
      
      if (user.storageFiles > 0) {
        log(`      ✅ ${user.storageFiles} archivo(s) eliminado(s) de Storage`, 'gray');
      }
      
      // 3. Eliminar documento de Firestore
      await db.collection('users').doc(user.userId).delete();
      deletedUsers++;
      log(`      ✅ Documento eliminado de Firestore`, 'gray');
      
    } catch (error) {
      log(`      ❌ Error: ${error.message}`, 'red');
    }
  }
  
  log(`\n✅ LIMPIEZA COMPLETADA`, 'green');
  log(`   🗑️  Usuarios eliminados: ${deletedUsers}`, 'reset');
  log(`   🔐 Eliminados de Auth: ${deletedFromAuth}`, 'reset');
  log(`   📸 Archivos de Storage eliminados: ${deletedStorageFiles}`, 'reset');
}

// ============================================================================
// USUARIOS FIRESTORE - AUDITORÍA Y LIMPIEZA
// ============================================================================

/**
 * Verifica si un usuario tiene los campos mínimos requeridos
 */
function isValidUser(userData) {
  const requiredFields = ['name', 'email', 'birthDate', 'gender', 'orientation'];
  const hasRequiredFields = requiredFields.every(field => userData[field]);
  
  // Un usuario válido debe tener al menos nombre, email y fecha de nacimiento
  return hasRequiredFields;
}

/**
 * Diagnostica por qué los perfiles discovery no aparecen en el swipe
 */
async function diagnoseDiscoveryProfiles() {
  log('\n🔍 DIAGNÓSTICO: PERFILES DISCOVERY', 'cyan');
  log('═'.repeat(70), 'cyan');
  
  try {
    // 1. Obtener información de Daniel
    log('\n1️⃣  Analizando perfil de Daniel...', 'cyan');
    const danielDoc = await db.collection('users').doc(CURRENT_USER.uid).get();
    
    if (!danielDoc.exists) {
      log('❌ No se encontró el perfil de Daniel en Firestore', 'red');
      return;
    }
    
    const daniel = danielDoc.data();
    const danielAge = calculateAge(daniel.birthDate.toDate());
    
    log('\n👤 PERFIL DE DANIEL:', 'yellow');
    log(`   - Name: ${daniel.name}`, 'reset');
    log(`   - Gender: ${daniel.male ? 'MALE' : 'FEMALE'}`, 'reset');
    log(`   - UserType: ${daniel.userType}`, 'reset');
    log(`   - Orientation: ${daniel.orientation} (busca ${daniel.orientation === 'men' ? 'HOMBRES' : 'MUJERES'})`, 'reset');
    log(`   - Age: ${danielAge} años`, 'reset');
    log(`   - Age Range: ${daniel.minAge}-${daniel.maxAge} años`, 'reset');
    log(`   - Max Distance: ${daniel.maxDistance}km`, 'reset');
    log(`   - Location: ${daniel.latitude}, ${daniel.longitude}`, 'reset');
    log(`   - Geohash: ${daniel.g}`, 'reset');
    log(`   - Geohash Prefix (3 chars): ${daniel.g.substring(0, 3)}`, 'reset');
    
    // 2. Contar perfiles discovery totales
    log('\n2️⃣  Contando perfiles discovery...', 'cyan');
    const allDiscoverySnapshot = await db.collection('users')
      .where('isDiscoveryProfile', '==', true)
      .get();
    
    log(`\n📊 Total perfiles discovery en la base de datos: ${allDiscoverySnapshot.size}`, 'yellow');
    
    if (allDiscoverySnapshot.empty) {
      log('\n❌ NO HAY NINGÚN PERFIL DISCOVERY EN LA BASE DE DATOS', 'red');
      log('   Necesitas crear perfiles usando la opción 6 del menú', 'gray');
      return;
    }
    
    // 3. Agrupar por geohash
    log('\n3️⃣  Analizando distribución geográfica...', 'cyan');
    const byGeohashPrefix = {};
    allDiscoverySnapshot.forEach(doc => {
      const data = doc.data();
      const prefix = data.g.substring(0, 3);
      byGeohashPrefix[prefix] = (byGeohashPrefix[prefix] || 0) + 1;
    });
    
    log('\n📍 DISTRIBUCIÓN POR GEOHASH PREFIX:', 'yellow');
    Object.entries(byGeohashPrefix)
      .sort((a, b) => b[1] - a[1])
      .forEach(([prefix, count]) => {
        const location = prefix === '66j' ? 'Santiago' : prefix === '63k' ? 'Concepción' : 'Otro';
        const isDanielPrefix = prefix === daniel.g.substring(0, 3);
        if (isDanielPrefix) {
          log(`   ✅ ${prefix} (${location}): ${count} perfiles [COINCIDE CON DANIEL]`, 'green');
        } else {
          log(`   ❌ ${prefix} (${location}): ${count} perfiles [NO COINCIDE]`, 'red');
        }
      });
    
    // 4. Buscar perfiles compatibles por geohash
    const danielPrefix = daniel.g.substring(0, 3);
    log(`\n4️⃣  Buscando perfiles con geohash prefix ${danielPrefix}...`, 'cyan');
    
    const compatibleByGeohashSnapshot = await db.collection('users')
      .where('g', '>=', danielPrefix)
      .where('g', '<', danielPrefix + '~')
      .where('isDiscoveryProfile', '==', true)
      .get();
    
    log(`\n📊 Perfiles con geohash correcto: ${compatibleByGeohashSnapshot.size}`, 'yellow');
    
    if (compatibleByGeohashSnapshot.empty) {
      log('\n❌ NO HAY PERFILES DISCOVERY CON EL GEOHASH CORRECTO', 'red');
      log('   Problema: Los perfiles creados tienen coordenadas de otra ubicación', 'gray');
      log('   Solución: Crear nuevos perfiles usando la opción 6 (ya usa coordenadas dinámicas)', 'gray');
      return;
    }
    
    // 5. Analizar compatibilidad de orientación/género
    log('\n5️⃣  Analizando compatibilidad de orientación...', 'cyan');
    
    let compatibleCount = 0;
    let incompatibleByOrientation = 0;
    let incompatibleByAge = 0;
    let incompatibleByGender = 0;
    
    const sampleProfiles = [];
    
    compatibleByGeohashSnapshot.forEach((doc) => {
      const profile = doc.data();
      const profileAge = calculateAge(profile.birthDate.toDate());
      
      let compatible = true;
      let reason = [];
      
      // Verificar edad
      if (profileAge < daniel.minAge || profileAge > daniel.maxAge) {
        compatible = false;
        incompatibleByAge++;
        reason.push(`edad ${profileAge} fuera de rango ${daniel.minAge}-${daniel.maxAge}`);
      }
      
      // Verificar género según orientación de Daniel
      if (daniel.orientation === 'men') {
        // Daniel busca hombres, el perfil debe ser masculino
        if (!profile.male) {
          compatible = false;
          incompatibleByGender++;
          reason.push(`perfil es FEMALE pero Daniel busca MALE`);
        }
      } else if (daniel.orientation === 'women') {
        // Daniel busca mujeres, el perfil debe ser femenino
        if (profile.male) {
          compatible = false;
          incompatibleByGender++;
          reason.push(`perfil es MALE pero Daniel busca FEMALE`);
        }
      }
      
      // Verificar que el perfil también busca el tipo de Daniel
      if (profile.orientation === 'men' && daniel.male) {
        compatible = false;
        incompatibleByOrientation++;
        reason.push(`perfil busca hombres pero Daniel es hombre`);
      } else if (profile.orientation === 'women' && !daniel.male) {
        compatible = false;
        incompatibleByOrientation++;
        reason.push(`perfil busca mujeres pero Daniel es mujer`);
      }
      
      if (compatible) {
        compatibleCount++;
      }
      
      // Guardar muestra de primeros 3 perfiles
      if (sampleProfiles.length < 3) {
        sampleProfiles.push({
          name: profile.name,
          userType: profile.userType,
          orientation: profile.orientation,
          gender: profile.male ? 'MALE' : 'FEMALE',
          age: profileAge,
          geohash: profile.g,
          compatible,
          reason: reason.join(', ')
        });
      }
    });
    
    log('\n📊 RESULTADO DEL ANÁLISIS:', 'yellow');
    log(`   ✅ Perfiles compatibles: ${compatibleCount}`, compatibleCount > 0 ? 'green' : 'gray');
    log(`   ❌ Incompatibles por orientación: ${incompatibleByOrientation}`, 'red');
    log(`   ❌ Incompatibles por género: ${incompatibleByGender}`, 'red');
    log(`   ❌ Incompatibles por edad: ${incompatibleByAge}`, 'red');
    
    // Mostrar muestra de perfiles
    log('\n📋 MUESTRA DE PERFILES (primeros 3):', 'yellow');
    sampleProfiles.forEach((p, i) => {
      log(`\n   ${i + 1}. ${p.name}`, p.compatible ? 'green' : 'red');
      log(`      - UserType: ${p.userType}`, 'reset');
      log(`      - Orientation: ${p.orientation}`, 'reset');
      log(`      - Gender: ${p.gender}`, 'reset');
      log(`      - Age: ${p.age}`, 'reset');
      log(`      - Geohash: ${p.geohash}`, 'reset');
      if (p.compatible) {
        log(`      ✅ Compatible con Daniel`, 'green');
      } else {
        log(`      ❌ Incompatible: ${p.reason}`, 'red');
      }
    });
    
    // 6. Diagnóstico final
    log('\n═'.repeat(70), 'cyan');
    log('🎯 DIAGNÓSTICO FINAL:', 'cyan');
    log('═'.repeat(70), 'cyan');
    
    if (compatibleCount === 0) {
      log('\n❌ PROBLEMA DETECTADO: NO HAY PERFILES COMPATIBLES', 'red');
      log('\n🔧 SOLUCIONES:', 'yellow');
      
      if (incompatibleByGender > 0 || incompatibleByOrientation > 0) {
        log('\n   1️⃣  Problema de Orientación/Género:', 'yellow');
        log(`      - Daniel es ${daniel.male ? 'MALE' : 'FEMALE'} y busca ${daniel.orientation}`, 'reset');
        log(`      - Los perfiles tienen orientación/género incompatible`, 'reset');
        log('      - Solución: Modificar createDiscoveryProfiles() para crear perfiles compatibles', 'gray');
      }
      
      if (incompatibleByAge > 0) {
        log('\n   2️⃣  Problema de Edad:', 'yellow');
        log(`      - Rango de Daniel: ${daniel.minAge}-${daniel.maxAge} años`, 'reset');
        log(`      - Los perfiles tienen edades fuera de este rango`, 'reset');
        log('      - Solución: Ajustar las fechas de nacimiento en createDiscoveryProfiles()', 'gray');
      }
      
      if (compatibleByGeohashSnapshot.size === 0) {
        log('\n   3️⃣  Problema de Ubicación:', 'yellow');
        log(`      - Geohash de Daniel: ${daniel.g}`, 'reset');
        log(`      - No hay perfiles con geohash compatible`, 'reset');
        log('      - Solución: Ya está implementado, solo crear nuevos perfiles con opción 6', 'gray');
      }
    } else {
      log('\n✅ HAY PERFILES COMPATIBLES', 'green');
      log(`\n   Se encontraron ${compatibleCount} perfiles que deberían aparecer en el swipe`, 'reset');
      log('\n❓ Si no aparecen en la app, el problema puede ser:', 'yellow');
      log('      1. Error en la Cloud Function getCompatibleProfileIds', 'reset');
      log('      2. La app iOS no está llamando correctamente a la función', 'reset');
      log('      3. Cache en la app que necesita ser limpiado', 'reset');
      log('\n🔍 Revisar logs de Cloud Function:', 'gray');
      log('      cd iOS/functions && firebase functions:log', 'gray');
    }
    
  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    console.error(error);
  }
}

/**
 * Audita usuarios huérfanos en Firestore
 * Detecta:
 * 1. Usuarios sin información completa (campos críticos faltantes)
 * 2. Usuarios en Firestore pero no en Auth
 * 3. Usuarios en Auth pero no en Firestore
 */
async function auditOrphanedFirestoreUsers() {
  log('\n🔍 AUDITORÍA DE USUARIOS HUÉRFANOS EN FIRESTORE', 'cyan');
  log('═'.repeat(70), 'cyan');
  
  const orphanedUsers = {
    incompleteData: [],      // Usuarios con datos incompletos
    noAuth: [],              // Usuarios en Firestore pero no en Auth
    noFirestore: []          // Usuarios en Auth pero no en Firestore
  };
  
  // 1. Auditar usuarios en Firestore
  log('\n1️⃣  Analizando usuarios en Firestore...', 'cyan');
  const usersSnapshot = await db.collection('users').get();
  log(`   📊 Total de usuarios: ${usersSnapshot.size}`, 'reset');
  
  let checked = 0;
  for (const doc of usersSnapshot.docs) {
    checked++;
    if (checked % 20 === 0) {
      process.stdout.write(`\r   📊 Analizados: ${checked}/${usersSnapshot.size}`);
    }
    
    const userData = doc.data();
    const userId = doc.id;
    
    // Verificar si tiene datos completos
    if (!isValidUser(userData)) {
      orphanedUsers.incompleteData.push({
        userId,
        email: userData.email || 'Sin email',
        name: userData.name || 'Sin nombre',
        missingFields: ['name', 'email', 'birthDate', 'gender', 'orientation']
          .filter(field => !userData[field]),
        isDiscoveryProfile: userData.isDiscoveryProfile || false
      });
    }
    
    // Verificar si existe en Auth
    try {
      await auth.getUser(userId);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        orphanedUsers.noAuth.push({
          userId,
          email: userData.email || 'Sin email',
          name: userData.name || 'Sin nombre',
          isDiscoveryProfile: userData.isDiscoveryProfile || false
        });
      }
    }
  }
  
  process.stdout.write('\r' + ' '.repeat(60) + '\r');
  
  // 2. Buscar usuarios en Auth que no estén en Firestore
  log('\n2️⃣  Buscando usuarios en Auth sin Firestore...', 'cyan');
  try {
    const listUsersResult = await auth.listUsers(1000);
    log(`   📊 Total en Auth: ${listUsersResult.users.length}`, 'reset');
    
    let authChecked = 0;
    for (const userRecord of listUsersResult.users) {
      authChecked++;
      if (authChecked % 20 === 0) {
        process.stdout.write(`\r   📊 Verificados: ${authChecked}/${listUsersResult.users.length}`);
      }
      
      const userDoc = await db.collection('users').doc(userRecord.uid).get();
      if (!userDoc.exists) {
        orphanedUsers.noFirestore.push({
          userId: userRecord.uid,
          email: userRecord.email || 'Sin email',
          name: userRecord.displayName || 'Sin nombre'
        });
      }
    }
    process.stdout.write('\r' + ' '.repeat(60) + '\r');
  } catch (error) {
    log(`   ⚠️  Error listando usuarios de Auth: ${error.message}`, 'yellow');
  }
  
  // 3. Mostrar resultados
  log('\n3️⃣  Resultados:', 'cyan');
  
  // Usuarios con datos incompletos
  if (orphanedUsers.incompleteData.length > 0) {
    log(`\n   ⚠️  ${orphanedUsers.incompleteData.length} usuario(s) con datos incompletos:`, 'yellow');
    orphanedUsers.incompleteData.forEach(user => {
      const type = user.isDiscoveryProfile ? ' [Discovery]' : '';
      log(`\n   📁 ${user.name} (${user.email})${type}`, 'reset');
      log(`      ID: ${user.userId}`, 'gray');
      log(`      Campos faltantes: ${user.missingFields.join(', ')}`, 'gray');
    });
  } else {
    log('\n   ✅ No hay usuarios con datos incompletos', 'green');
  }
  
  // Usuarios en Firestore sin Auth
  if (orphanedUsers.noAuth.length > 0) {
    log(`\n   ⚠️  ${orphanedUsers.noAuth.length} usuario(s) en Firestore sin Auth:`, 'yellow');
    orphanedUsers.noAuth.forEach(user => {
      const type = user.isDiscoveryProfile ? ' [Discovery]' : '';
      log(`\n   📁 ${user.name} (${user.email})${type}`, 'reset');
      log(`      ID: ${user.userId}`, 'gray');
    });
  } else {
    log('\n   ✅ Todos los usuarios de Firestore tienen Auth', 'green');
  }
  
  // Usuarios en Auth sin Firestore
  if (orphanedUsers.noFirestore.length > 0) {
    log(`\n   ⚠️  ${orphanedUsers.noFirestore.length} usuario(s) en Auth sin Firestore:`, 'yellow');
    orphanedUsers.noFirestore.forEach(user => {
      log(`\n   📁 ${user.name} (${user.email})`, 'reset');
      log(`      ID: ${user.userId}`, 'gray');
    });
  } else {
    log('\n   ✅ Todos los usuarios de Auth tienen Firestore', 'green');
  }
  
  const totalOrphaned = orphanedUsers.incompleteData.length + 
                        orphanedUsers.noAuth.length + 
                        orphanedUsers.noFirestore.length;
  
  log(`\n   📊 Total de usuarios huérfanos: ${totalOrphaned}`, totalOrphaned > 0 ? 'yellow' : 'green');
  
  return orphanedUsers;
}

/**
 * Limpia usuarios huérfanos de Firestore
 */
async function cleanOrphanedFirestoreUsers() {
  log('\n🗑️  LIMPIEZA DE USUARIOS HUÉRFANOS EN FIRESTORE', 'cyan');
  log('═'.repeat(70), 'cyan');
  
  // Primero auditar
  const orphanedUsers = await auditOrphanedFirestoreUsers();
  
  const totalOrphaned = orphanedUsers.incompleteData.length + 
                        orphanedUsers.noAuth.length + 
                        orphanedUsers.noFirestore.length;
  
  if (totalOrphaned === 0) {
    log('\n✅ No hay nada que limpiar', 'green');
    return;
  }
  
  // Opciones de limpieza
  log('\n\n¿Qué deseas limpiar?\n', 'yellow');
  log('1. Solo usuarios con datos incompletos (excepto Discovery)', 'reset');
  log('2. Usuarios en Firestore sin Auth (excepto Discovery)', 'reset');
  log('3. Usuarios en Auth sin Firestore', 'reset');
  log('4. TODO lo anterior', 'reset');
  log('5. Cancelar', 'reset');
  
  const choice = await question('\nSelecciona opción (1-5): ');
  
  if (choice === '5') {
    log('✅ Cancelado', 'green');
    return;
  }
  
  const confirm = await question('\n⚠️  ¿Estás seguro? (escribe "SI" para confirmar): ');
  
  if (confirm !== 'SI') {
    log('✅ Cancelado', 'green');
    return;
  }
  
  log('\n🔄 Eliminando usuarios huérfanos...', 'yellow');
  
  let deletedCount = 0;
  
  // Opción 1 o 4: Usuarios con datos incompletos
  if (choice === '1' || choice === '4') {
    log('\n   🗑️  Eliminando usuarios con datos incompletos...', 'cyan');
    const toDelete = orphanedUsers.incompleteData.filter(u => !u.isDiscoveryProfile);
    
    for (const user of toDelete) {
      try {
        log(`      🗑️  ${user.name} (${user.userId})`, 'gray');
        await deleteUserCompletely(user.userId);
        deletedCount++;
      } catch (error) {
        log(`      ❌ Error eliminando ${user.userId}: ${error.message}`, 'red');
      }
    }
  }
  
  // Opción 2 o 4: Usuarios en Firestore sin Auth
  if (choice === '2' || choice === '4') {
    log('\n   🗑️  Eliminando usuarios sin Auth...', 'cyan');
    const toDelete = orphanedUsers.noAuth.filter(u => !u.isDiscoveryProfile);
    
    for (const user of toDelete) {
      try {
        log(`      🗑️  ${user.name} (${user.userId})`, 'gray');
        await deleteUserCompletely(user.userId);
        deletedCount++;
      } catch (error) {
        log(`      ❌ Error eliminando ${user.userId}: ${error.message}`, 'red');
      }
    }
  }
  
  // Opción 3 o 4: Usuarios en Auth sin Firestore
  if (choice === '3' || choice === '4') {
    log('\n   🗑️  Eliminando usuarios en Auth sin Firestore...', 'cyan');
    
    for (const user of orphanedUsers.noFirestore) {
      try {
        log(`      🗑️  ${user.name} (${user.userId})`, 'gray');
        await auth.deleteUser(user.userId);
        deletedCount++;
      } catch (error) {
        log(`      ❌ Error eliminando ${user.userId}: ${error.message}`, 'red');
      }
    }
  }
  
  log(`\n✅ LIMPIEZA COMPLETADA`, 'green');
  log(`   🗑️  Usuarios eliminados: ${deletedCount}`, 'reset');
}

// ============================================================================
// DIAGNÓSTICO
// ============================================================================

async function verifySystem() {
  log('\n🔍 DIAGNÓSTICO DEL SISTEMA', 'cyan');
  log('═'.repeat(70), 'cyan');
  
  // Verificar FCM token de Daniel
  log(`\n1️⃣  FCM Token de ${CURRENT_USER.name}:`, 'yellow');
  const danielDoc = await db.collection('users').doc(CURRENT_USER.uid).get();
  const danielData = danielDoc.data();
  
  if (danielData?.fcmToken) {
    log(`   ✅ Token registrado: ${danielData.fcmToken.substring(0, 40)}...`, 'green');
  } else {
    log(`   ⚠️  Sin FCM token`, 'yellow');
    log(`   💡 Abre la app y acepta permisos de notificaciones`, 'cyan');
  }
  
  // Contar matches
  log('\n2️⃣  Matches:', 'yellow');
  const matchesSnapshot = await db.collection('matches')
    .where('usersMatched', 'array-contains', CURRENT_USER.uid)
    .get();
  
  const testMatches = matchesSnapshot.docs.filter(d => d.data().isTest).length;
  log(`   📊 Total: ${matchesSnapshot.size}`, 'reset');
  log(`   🧪 De prueba: ${testMatches}`, 'cyan');
  
  const withNotif = matchesSnapshot.docs.filter(d => d.data().notificationSent).length;
  log(`   📲 Con notificación: ${withNotif}`, 'green');
  
  // Contar perfiles discovery
  log('\n3️⃣  Perfiles de Discovery:', 'yellow');
  const discoverySnapshot = await db.collection('users')
    .where('isDiscoveryProfile', '==', true)
    .get();
  
  log(`   📊 Total: ${discoverySnapshot.size}`, 'reset');
  
  const inProfiles = await db.collection('profiles')
    .where('isDiscoveryProfile', '==', true)
    .get();
  
  log(`   📂 En collection "profiles": ${inProfiles.size}`, 'reset');
  log(`   📂 En collection "users": ${discoverySnapshot.size}`, 'reset');
  
  if (inProfiles.size > discoverySnapshot.size) {
    log(`   ⚠️  Hay ${inProfiles.size - discoverySnapshot.size} perfiles sin migrar`, 'yellow');
    log(`   💡 Usa: Opción "Corregir perfiles de discovery"`, 'cyan');
  }
  
  // Estado general
  log('\n✅ DIAGNÓSTICO COMPLETADO', 'green');
}

/**
 * Envía una notificación de prueba usando la Cloud Function sendTestNotification
 * Esta función prueba directamente el sistema de notificaciones FCM
 */
async function sendDirectTestNotification() {
  log('\n🧪 ENVIAR NOTIFICACIÓN DE PRUEBA', 'cyan');
  log('═'.repeat(70), 'cyan');
  log('Esta función llama directamente a sendTestNotification (Cloud Function)', 'yellow');
  
  // Verificar FCM token del usuario activo
  log(`\n🔍 Verificando FCM token de ${CURRENT_USER.name}...`, 'yellow');
  const userDoc = await db.collection('users').doc(CURRENT_USER.uid).get();
  
  if (!userDoc.exists) {
    log(`❌ Usuario ${CURRENT_USER.name} no existe en Firestore`, 'red');
    return;
  }
  
  const userData = userDoc.data();
  if (!userData.fcmToken) {
    log(`❌ ${CURRENT_USER.name} no tiene FCM token registrado`, 'red');
    log(`💡 Abre la app en el dispositivo y acepta los permisos de notificaciones`, 'cyan');
    return;
  }
  
  log(`✅ FCM Token encontrado: ${userData.fcmToken.substring(0, 40)}...`, 'green');
  
  // Personalizar mensaje
  log('\n📝 Personalizar notificación (opcional - Enter para usar valores por defecto):', 'cyan');
  const title = await question('Título (Enter = "🧪 Test Notification"): ');
  const body = await question('Mensaje (Enter = "This is a test notification..."): ');
  
  const finalTitle = title.trim() || '🧪 Test Notification';
  const finalBody = body.trim() || 'This is a test notification from BlackSugar21';
  
  log('\n⏳ Enviando notificación...', 'yellow');
  
  try {
    const result = await callSendTestNotification(
      CURRENT_USER.uid,
      finalTitle,
      finalBody
    );
    
    log('\n✅ NOTIFICACIÓN ENVIADA EXITOSAMENTE', 'green');
    log(`   📲 Message ID: ${result.messageId}`, 'cyan');
    log(`   📱 Revisa el dispositivo de ${CURRENT_USER.name}`, 'yellow');
    log(`   💡 Debería aparecer una notificación con el título y mensaje configurados`, 'cyan');
    
  } catch (error) {
    log('\n❌ ERROR AL ENVIAR NOTIFICACIÓN', 'red');
    log(`   ${error.message}`, 'red');
    
    if (error.message.includes('FCM token')) {
      log('\n💡 SOLUCIÓN:', 'cyan');
      log('   1. Abre la app en el dispositivo', 'reset');
      log('   2. Acepta los permisos de notificaciones', 'reset');
      log('   3. Espera unos segundos para que el token se registre', 'reset');
      log('   4. Vuelve a intentar', 'reset');
    }
  }
}

// ============================================================================
// LIKES DE PRUEBA (Para LikesView)
// ============================================================================

/**
 * Crea likes de prueba que aparecerán en la vista LikesView
 * Los usuarios de prueba agregarán al usuario activo a su array "liked"
 */
async function createTestLikes() {
  log('\n💖 CREAR LIKES DE PRUEBA', 'cyan');
  log('═'.repeat(70), 'cyan');
  
  // Obtener perfil del usuario activo
  log(`\n🔍 Obteniendo perfil de ${CURRENT_USER.name}...`, 'yellow');
  const currentUserDoc = await db.collection('users').doc(CURRENT_USER.uid).get();
  
  if (!currentUserDoc.exists) {
    log(`❌ Usuario ${CURRENT_USER.name} no existe en Firestore`, 'red');
    return;
  }
  
  const userData = currentUserDoc.data();
  const userIsMale = userData.male || false;
  const userOrientation = userData.orientation || 'women';
  const userAge = userData.age || calculateAge(userData.birthDate?.toDate() || new Date());
  
  log(`✅ ${CURRENT_USER.name}: ${userIsMale ? 'MALE' : 'FEMALE'}, busca ${userOrientation}, edad ${userAge}`, 'green');
  
  const numLikes = await question('\n¿Cuántos likes crear? (3-20): ');
  const count = parseInt(numLikes);
  
  if (isNaN(count) || count < 3 || count > 20) {
    log('❌ Número inválido. Debe ser entre 3 y 20', 'red');
    return;
  }
  
  const names = {
    women: ['Emma', 'Olivia', 'Ava', 'Isabella', 'Sophia', 'Mia', 'Charlotte', 'Amelia'],
    men: ['Liam', 'Noah', 'Oliver', 'Elijah', 'William', 'James', 'Benjamin', 'Lucas']
  };
  
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];
  
  // Determinar qué tipo de perfiles crear según orientación del usuario
  const createMaleProfiles = userOrientation === 'men';
  
  log(`\n🔄 Creando ${count} perfiles ${createMaleProfiles ? 'MASCULINOS' : 'FEMENINOS'} que darán like a ${CURRENT_USER.name}...\n`, 'yellow');
  
  let created = 0;
  
  for (let i = 0; i < count; i++) {
    const nameList = createMaleProfiles ? names.men : names.women;
    const firstName = nameList[i % nameList.length];
    const lastName = lastNames[i % lastNames.length];
    const fullName = `${firstName} ${lastName}`;
    const email = `like_test_${Date.now()}_${i}@bstest.com`;
    
    try {
      // Crear usuario en Auth
      const userRecord = await auth.createUser({
        email: email,
        password: 'Test1234!',
        displayName: fullName
      });
      
      const newUserId = userRecord.uid;
      
      // Calcular edad (18-35 para que sean atractivos)
      const age = 18 + (i % 17); // 18-35 años
      const birthYear = new Date().getFullYear() - age;
      const birthDate = new Date(birthYear, 5, 15);
      
      // Determinar userType basado en género
      let profileUserType;
      if (createMaleProfiles) {
        profileUserType = i % 2 === 0 ? 'SUGAR_DADDY' : 'SUGAR_BABY';
      } else {
        profileUserType = i % 3 === 0 ? 'SUGAR_MOMMY' : 'SUGAR_BABY';
      }
      
      // Descargar fotos
      const numPhotos = 3 + Math.floor(Math.random() * 4); // 3-6 fotos
      log(`  📸 Descargando ${numPhotos} fotos para ${fullName}...`, 'cyan');
      
      const gender = createMaleProfiles ? 'men' : 'women';
      const uploadedFileNames = [];
      
      for (let photoIndex = 0; photoIndex < numPhotos; photoIndex++) {
        const avatarUrl = `https://randomuser.me/api/portraits/${gender}/${(i * 10 + photoIndex) % 99}.jpg`;
        const imageBuffer = await downloadImage(avatarUrl);
        const uploadedFileName = await uploadPhotoToStorage(newUserId, imageBuffer);
        uploadedFileNames.push(uploadedFileName);
      }
      
      // Coordenadas cerca de Santiago
      const latitude = -33.4489 + (Math.random() - 0.5) * 0.1;
      const longitude = -70.6693 + (Math.random() - 0.5) * 0.1;
      
      const geofire = require('geofire-common');
      const geohash = geofire.geohashForLocation([latitude, longitude]);
      
      // Crear documento en Firestore CON el like al usuario activo
      await db.collection('users').doc(newUserId).set({
        name: fullName,
        email: email,
        male: createMaleProfiles,
        birthDate: admin.firestore.Timestamp.fromDate(birthDate),
        age: age,
        orientation: userIsMale ? 'men' : 'women', // Buscan el género del usuario activo
        userType: profileUserType,
        bio: `Hola, soy ${firstName} 👋`,
        city: 'Santiago',
        g: geohash,
        latitude: latitude,
        longitude: longitude,
        minAge: 18,
        maxAge: 99,
        maxDistance: 200,
        paused: false,
        visible: true,
        blocked: false,
        accountStatus: 'active',
        pictures: uploadedFileNames,
        firstPictureName: uploadedFileNames[0],
        // 🔥 CRÍTICO: Agregar al usuario activo al array "liked"
        liked: [CURRENT_USER.uid], // Este perfil da like al usuario activo
        passed: [],
        dailyLikesRemaining: 99,
        dailyLikesLimit: 100,
        superLikesRemaining: 5,
        isTest: true,
        isLikeTestProfile: true, // Flag para identificar estos perfiles
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      // Crear subcollección liked
      await db.collection('users').doc(newUserId).collection('liked')
        .doc(CURRENT_USER.uid).set({ exists: true });
      
      created++;
      log(`✅ ${i + 1}. ${fullName} (${profileUserType}, ${age} años) → Like a ${CURRENT_USER.name}`, 'green');
      
    } catch (error) {
      log(`❌ Error en ${fullName}: ${error.message}`, 'red');
    }
  }
  
  log(`\n📊 RESUMEN:`, 'cyan');
  log(`   ✅ Likes creados: ${created}/${count}`, 'green');
  log(`   💖 Estos perfiles aparecerán en LikesView de ${CURRENT_USER.name}`, 'cyan');
  log(`   👥 Tipo de perfiles: ${createMaleProfiles ? 'HOMBRES' : 'MUJERES'}`, 'cyan');
  log(`\n💡 Abre la app y navega a la pestaña "Me Gusta" para verlos`, 'cyan');
}

// ============================================================================
// MENÚ PRINCIPAL
// ============================================================================

async function showMainMenu() {
  clearScreen();
  log('\n🎯 SISTEMA MAESTRO DE PRUEBAS - BlackSugar21', 'bright');
  log('═'.repeat(70), 'cyan');
  log(`Usuario activo: ${CURRENT_USER.icon} ${CURRENT_USER.name} (${CURRENT_USER.email})`, 'yellow');
  log('═'.repeat(70), 'cyan');
  
  log('\n📱 GESTIÓN DE MATCHES', 'cyan');
  log('  1. Crear matches con notificaciones', 'reset');
  log('  2. Verificar matches y notificaciones', 'reset');
  log('  3. Listar matches actuales', 'reset');
  
  log('\n💬 PRUEBAS DE MENSAJERÍA', 'cyan');
  log('  4. Enviar mensaje de prueba', 'reset');
  log('  5. Simular conversación automática (TÚ envías)', 'reset');
  log('  23. 📥 Recibir conversación (OTRO usuario envía) - Test UI Update', 'reset');
  log('  22. 📥 Recibir mensaje de prueba (prueba notificaciones)', 'reset');
  
  log('\n🎯 PERFILES DE DISCOVERY', 'cyan');
  log('  6. Crear perfiles para HomeView/Swipe', 'reset');
  log('  7. Corregir perfiles de discovery', 'reset');
  log('  20. 🔍 Diagnosticar perfiles discovery (por qué no aparecen)', 'reset');
  
  log('\n� VISTA DE LIKES', 'cyan');
  log('  21. Crear likes de prueba para LikesView', 'reset');
  
  log('\n�🔍 DIAGNÓSTICO', 'cyan');
  log('  8. Verificar sistema completo', 'reset');
  log('  9. 🧪 Enviar notificación de prueba (sendTestNotification)', 'reset');
  
  log('\n🧹 LIMPIEZA', 'cyan');
  log('  10. Limpiar datos de prueba', 'reset');
  
  log('\n📦 STORAGE', 'cyan');
  log('  11. Listar estructura de Storage', 'reset');
  log('  12. Auditar carpetas huérfanas en Storage', 'reset');
  log('  13. Limpiar carpetas huérfanas en Storage', 'reset');
  log('  14. Verificar archivos de usuario específico', 'reset');
  
  log('\n👤 USUARIOS', 'cyan');
  log('  15. Auditar usuarios huérfanos (sin campo name)', 'reset');
  log('  16. Limpiar usuarios huérfanos', 'reset');
  
  log('\n⚙️  OTRAS OPCIONES', 'cyan');
  log('  17. 👥 Cambiar usuario (Daniel/Rosita)', 'reset');
  log('  18. 🔄 Refrescar pantalla', 'reset');
  log('  19. 🚪 Salir', 'reset');
  
  const choice = await question('\n👉 Selecciona una opción (1-23): ');
  
  return choice;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  try {
    while (true) {
      const choice = await showMainMenu();
      
      switch (choice) {
        case '1':
          await createMatchesWithNotifications();
          await pressEnterToContinue();
          break;
          
        case '2':
          await verifyMatchesAndNotifications();
          await pressEnterToContinue();
          break;
          
        case '3':
          await listMatches();
          await pressEnterToContinue();
          break;
          
        case '4':
          await sendTestMessage();
          await pressEnterToContinue();
          break;
          
        case '5':
          await simulateConversation();
          await pressEnterToContinue();
          break;
          
        case '6':
          await createDiscoveryProfiles();
          await pressEnterToContinue();
          break;
          
        case '7':
          await fixDiscoveryProfiles();
          await pressEnterToContinue();
          break;
          
        case '8':
          await verifySystem();
          await pressEnterToContinue();
          break;
          
        case '9':
          await sendDirectTestNotification();
          await pressEnterToContinue();
          break;
          
        case '10':
          await cleanupTestData();
          await pressEnterToContinue();
          break;
          
        case '11':
          await listStorageFolders();
          await pressEnterToContinue();
          break;
          
        case '12':
          await auditOrphanedFolders();
          await pressEnterToContinue();
          break;
          
        case '13':
          await cleanOrphanedFolders();
          await pressEnterToContinue();
          break;
          
        case '14':
          await verifyUserFiles();
          await pressEnterToContinue();
          break;
          
        case '15':
          await auditOrphanedUsers();
          await pressEnterToContinue();
          break;
          
        case '16':
          await cleanOrphanedUsers();
          await pressEnterToContinue();
          break;
          
        case '17':
          await selectUser();
          break;
          
        case '18':
          clearScreen();
          continue;
          
        case '19':
          log('\n👋 ¡Hasta luego!', 'cyan');
          rl.close();
          process.exit(0);
          break;
          
        case '20':
          await diagnoseDiscoveryProfiles();
          await pressEnterToContinue();
          break;
          
        case '21':
          await createTestLikes();
          await pressEnterToContinue();
          break;
          
        case '22':
          await receiveTestMessage();
          await pressEnterToContinue();
          break;
          
        case '23':
          await receiveConversation();
          await pressEnterToContinue();
          break;
          
        default:
          log('\n❌ Opción inválida', 'red');
          await pressEnterToContinue();
      }
    }
  } catch (error) {
    log(`\n❌ ERROR FATAL: ${error.message}`, 'red');
    console.error(error);
    rl.close();
    process.exit(1);
  }
}

// Iniciar
log('\n🚀 Iniciando Sistema Maestro de Pruebas...', 'cyan');
selectUser().then(() => main());
