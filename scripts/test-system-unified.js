#!/usr/bin/env node

/**
 * 🧪 Sistema Unificado de Pruebas BlackSugar21
 * 
 * Script maestro consolidado para gestión completa de datos de prueba
 * 
 * Funcionalidades integradas:
 * 1. Gestión de Matches (crear, listar, enviar mensajes, verificar orden)
 * 2. Perfiles de Discovery (crear usuarios para swipe/HomeView)
 * 3. Verificación y diagnóstico (validar datos, debugear matches)
 * 4. Limpieza selectiva (eliminar por tipo, mantener escenarios)
 * 5. Selector de usuario de prueba (Daniel/Rosita)
 * 
 * Autor: GitHub Copilot
 * Fecha: 12 de enero de 2026
 */

const admin = require('firebase-admin');
const readline = require('readline');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

// Constantes - Usuarios de prueba disponibles
const TEST_USERS = {
  daniel: {
    email: 'dverdugo85@gmail.com',
    uid: 'sU8xLiwQWNXmbYdR63p1uO6TSm72',
    name: 'Daniel'
  },
  rosita: {
    email: 'rosita@example.com', // Actualizar con el email real si está disponible
    uid: 'DsDSK5xqEZZXAIKxtIKyBGntw8f2',
    name: 'Rosita'
  }
};

// Usuario activo (se seleccionará al inicio)
let CURRENT_USER = null;

// Datos de prueba
const testNames = {
  women: ['Sofia', 'Isabella', 'Valentina', 'Camila', 'Martina', 'Lucia', 'Emma', 'Paula', 
          'Julia', 'Amanda', 'Carolina', 'Daniela', 'Gabriela', 'Andrea', 'Victoria'],
  men: ['Carlos', 'Miguel', 'Alejandro', 'Diego', 'Sebastian', 'Mateo', 'Lucas',
        'Santiago', 'Nicolas', 'Andres', 'David', 'Jorge', 'Luis', 'Pedro']
};

const lastNames = ['Martinez', 'Lopez', 'Garcia', 'Rodriguez', 'Fernandez', 'Sanchez', 
                   'Ramirez', 'Torres', 'Flores', 'Castro', 'Morales', 'Silva'];

const bios = [
  'Amante del buen vino y viajes exóticos 🍷✈️',
  'Emprendedor exitoso buscando conexión genuina 💼',
  'Aventurera, disfruto de la vida al máximo 🌟',
  'Apasionado por el arte y la cultura 🎨',
  'Fitness lover y healthy lifestyle 💪🥗',
  'Disfrutando cada momento de la vida 🌺',
  'Travel enthusiast con pasión por nuevas culturas 🌎',
  'Fashion lover y trendsetter 👗',
  'Amante de la música en vivo y festivales 🎵'
];

// Colores para consola
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

// Interfaz readline
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

/**
 * Seleccionar usuario de prueba
 */
async function selectTestUser() {
  console.clear();
  log('='.repeat(70), 'bright');
  log('🧪 SISTEMA UNIFICADO DE PRUEBAS - BlackSugar21', 'bright');
  log('='.repeat(70), 'bright');
  log('\n👥 SELECCIONAR USUARIO DE PRUEBA:\n', 'bright');
  log('1. 👨 Daniel (dverdugo85@gmail.com)', 'cyan');
  log('   🆔 UID: sU8xLiwQWNXmbYdR63p1uO6TSm72', 'reset');
  log('\n2. 👩 Rosita', 'magenta');
  log('   🆔 UID: DsDSK5xqEZZXAIKxtIKyBGntw8f2', 'reset');
  log('\n' + '='.repeat(70), 'bright');
  
  const choice = await question('\nSelecciona usuario (1-2): ');
  
  switch(choice) {
    case '1':
      CURRENT_USER = TEST_USERS.daniel;
      log(`\n✅ Usuario seleccionado: ${CURRENT_USER.name} (${CURRENT_USER.email})`, 'green');
      break;
    
    case '2':
      CURRENT_USER = TEST_USERS.rosita;
      log(`\n✅ Usuario seleccionado: ${CURRENT_USER.name}`, 'green');
      break;
    
    default:
      log('\n❌ Opción inválida, seleccionando Daniel por defecto', 'yellow');
      CURRENT_USER = TEST_USERS.daniel;
  }
  
  // Verificar que el usuario existe
  try {
    const userRecord = await auth.getUser(CURRENT_USER.uid);
    log(`✅ Usuario verificado en Firebase`, 'green');
    
    // Actualizar email si es diferente
    if (userRecord.email && CURRENT_USER.email !== userRecord.email) {
      CURRENT_USER.email = userRecord.email;
      log(`📧 Email actualizado: ${userRecord.email}`, 'cyan');
    }
  } catch (error) {
    log(`⚠️  Advertencia: No se pudo verificar el usuario en Firebase`, 'yellow');
    log(`   ${error.message}`, 'yellow');
  }
  
  await new Promise(resolve => setTimeout(resolve, 1500));
}

// ============================================================================
// FUNCIONES PRINCIPALES
// ============================================================================

/**
 * Listar matches actuales del usuario
 */
async function listDanielMatches() {
  log(`\n📋 Listando matches de ${CURRENT_USER.name}...`, 'cyan');
  
  // Consultas simples sin índices compuestos
  const matchesSnapshot = await db.collection('matches')
    .where('userId1', '==', CURRENT_USER.uid)
    .get();
  
  const matches2Snapshot = await db.collection('matches')
    .where('userId2', '==', CURRENT_USER.uid)
    .get();
  
  const allMatches = [...matchesSnapshot.docs, ...matches2Snapshot.docs];
  
  if (allMatches.length === 0) {
    log(`⚠️  ${CURRENT_USER.name} no tiene matches`, 'yellow');
    return [];
  }
  
  // Ordenar por timestamp y secuencia
  allMatches.sort((a, b) => {
    const dataA = a.data();
    const dataB = b.data();
    
    const timestampA = dataA.timestamp?.toMillis() || 0;
    const timestampB = dataB.timestamp?.toMillis() || 0;
    
    if (timestampB !== timestampA) {
      return timestampB - timestampA;
    }
    
    return (dataB.lastMessageSeq || 0) - (dataA.lastMessageSeq || 0);
  });
  
  log(`\n✅ ${allMatches.length} matches encontrados:\n`, 'green');
  
  for (let i = 0; i < allMatches.length; i++) {
    const doc = allMatches[i];
    const data = doc.data();
    const otherUserId = data.userId1 === CURRENT_USER.uid ? data.userId2 : data.userId1;
    
    // Obtener perfil del otro usuario
    let otherUserName = 'Usuario';
    try {
      const profileDoc = await db.collection('profiles').doc(otherUserId).get();
      if (profileDoc.exists) {
        otherUserName = profileDoc.data().name || 'Usuario';
      }
    } catch (e) {
      // Ignorar errores
    }
    
    const timestamp = data.timestamp?.toDate();
    const seq = data.lastMessageSeq || 0;
    const lastMsg = data.lastMessage || '(sin mensajes)';
    
    log(`${i + 1}. ${otherUserName}`, 'bright');
    log(`   Match ID: ${doc.id}`, 'reset');
    log(`   Último mensaje: "${lastMsg}"`, 'reset');
    log(`   Secuencia: ${seq}`, 'reset');
    log(`   Timestamp: ${timestamp ? timestamp.toLocaleString('es-ES') : 'N/A'}`, 'reset');
    console.log('');
  }
  
  return allMatches;
}

/**
 * Crear matches de prueba para el usuario
 */
async function createTestMatches() {
  log(`\n🏗️  Creando matches de prueba para ${CURRENT_USER.name}...`, 'cyan');
  
  const numMatches = await question('¿Cuántos matches deseas crear? (1-10): ');
  const count = parseInt(numMatches);
  
  if (isNaN(count) || count < 1 || count > 10) {
    log('❌ Número inválido. Debe ser entre 1 y 10', 'red');
    return;
  }
  
  const testNames = [
    { name: 'Rosita', gender: 'female', type: 'SUGAR_BABY' },
    { name: 'María', gender: 'female', type: 'SUGAR_BABY' },
    { name: 'Carla', gender: 'female', type: 'SUGAR_MOMMY' },
    { name: 'Ana', gender: 'female', type: 'SUGAR_BABY' },
    { name: 'Laura', gender: 'female', type: 'SUGAR_BABY' },
    { name: 'Sofía', gender: 'female', type: 'SUGAR_BABY' },
    { name: 'Isabella', gender: 'female', type: 'SUGAR_BABY' },
    { name: 'Valentina', gender: 'female', type: 'SUGAR_MOMMY' },
    { name: 'Camila', gender: 'female', type: 'SUGAR_BABY' },
    { name: 'Daniela', gender: 'female', type: 'SUGAR_BABY' }
  ];
  
  const batch = db.batch();
  const createdUsers = [];
  
  log(`\n🔄 Creando ${count} usuarios y matches...\n`, 'yellow');
  
  for (let i = 0; i < count; i++) {
    const userData = testNames[i];
    const email = `test_match_${Date.now()}_${i}@bstest.com`;
    const password = 'Test1234!';
    
    try {
      // Crear usuario en Auth
      const userRecord = await auth.createUser({
        email: email,
        password: password,
        displayName: userData.name
      });
      
      const userId = userRecord.uid;
      
      // Crear perfil
      const profileRef = db.collection('profiles').doc(userId);
      batch.set(profileRef, {
        name: userData.name,
        gender: userData.gender,
        userType: userData.type,
        age: 25 + i,
        city: 'Santiago',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        isTest: true
      });
      
      // Crear match (con timestamp escalonado: -1min, -2min, -3min, etc)
      const matchId = `${CURRENT_USER.uid}_${userId}`;
      const matchRef = db.collection('matches').doc(matchId);
      
      const minutesAgo = (count - i) * 60 * 1000; // Cada match 1 minuto más antiguo
      const matchTimestamp = new Date(Date.now() - minutesAgo);
      
      batch.set(matchRef, {
        userId1: CURRENT_USER.uid,
        userId2: userId,
        timestamp: admin.firestore.Timestamp.fromDate(matchTimestamp),
        lastMessage: `Hola Daniel, soy ${userData.name}!`,
        lastMessageSeq: 1,
        lastMessageTimestamp: admin.firestore.Timestamp.fromDate(matchTimestamp),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        isTest: true
      });
      
      // Crear mensaje inicial
      const messageRef = db.collection('messages').doc();
      batch.set(messageRef, {
        matchId: matchId,
        senderId: userId,
        text: `Hola ${CURRENT_USER.name}, soy ${userData.name}!`,
        timestamp: admin.firestore.Timestamp.fromDate(matchTimestamp),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      createdUsers.push({
        name: userData.name,
        email: email,
        userId: userId,
        matchId: matchId
      });
      
      log(`✅ ${i + 1}. ${userData.name} (${email})`, 'green');
      
    } catch (error) {
      log(`❌ Error creando ${userData.name}: ${error.message}`, 'red');
    }
  }
  
  // Commit batch
  await batch.commit();
  
  log(`\n🎉 ${createdUsers.length} matches creados exitosamente!`, 'green');
  log(`\n📱 Abre la app de ${CURRENT_USER.name} (${CURRENT_USER.email}) para ver los matches`, 'cyan');
  
  return createdUsers;
}

/**
 * Enviar mensaje a un match específico
 */
async function sendMessageToMatch(matches) {
  if (!matches || matches.length === 0) {
    log('❌ No hay matches disponibles', 'red');
    log('💡 Primero crea matches con la opción 2', 'yellow');
    return;
  }
  
  log('\n📤 Enviar mensaje a un match', 'cyan');
  log('\nMatches disponibles:\n', 'reset');
  
  matches.forEach((doc, idx) => {
    const data = doc.data();
    const otherUserId = data.userId1 === CURRENT_USER.uid ? data.userId2 : data.userId1;
    log(`${idx + 1}. Match ${doc.id.substring(0, 12)}... (Seq: ${data.lastMessageSeq || 0})`, 'reset');
  });
  
  const choice = await question(`\n¿A qué match enviar mensaje? (1-${matches.length}): `);
  const index = parseInt(choice) - 1;
  
  if (isNaN(index) || index < 0 || index >= matches.length) {
    log('❌ Selección inválida', 'red');
    return;
  }
  
  const matchDoc = matches[index];
  const matchId = matchDoc.id;
  const matchData = matchDoc.data();
  
  const message = await question('Escribe el mensaje: ');
  
  if (!message || message.trim() === '') {
    log('❌ El mensaje no puede estar vacío', 'red');
    return;
  }
  
  log('\n⏳ Preparando envío...', 'yellow');
  log('\n📱 INSTRUCCIONES:', 'bright');
  log('1. Abre la app iOS/Android AHORA', 'yellow');
  log('2. Ve a la pantalla de Matches', 'yellow');
  log('3. Observa la posición actual del match', 'yellow');
  log('4. El script enviará el mensaje en 5 segundos...', 'yellow');
  
  // Countdown
  for (let i = 5; i > 0; i--) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    log(`⏳ ${i}...`, 'yellow');
  }
  
  // Enviar mensaje
  const newSeq = (matchData.lastMessageSeq || 0) + 1;
  
  // Crear mensaje
  const messageRef = db.collection('messages').doc();
  await messageRef.set({
    matchId: matchId,
    senderId: CURRENT_USER.uid,
    text: message,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  // Actualizar match
  const matchRef = db.collection('matches').doc(matchId);
  await matchRef.update({
    lastMessage: message,
    lastMessageSeq: newSeq,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp()
  });
  
  log('\n✅ Mensaje enviado exitosamente!', 'green');
  log(`   📝 Mensaje: "${message}"`, 'reset');
  log(`   🔢 Secuencia: ${newSeq}`, 'reset');
  log(`   ⏰ Timestamp actualizado`, 'reset');
  
  log('\n📱 ¡MIRA LA APP AHORA!', 'bright');
  log('✅ El match debería haber subido a la posición #1 INSTANTÁNEAMENTE', 'green');
  
  // Esperar 2 segundos para dar tiempo a Firestore
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Verificar orden
  log('\n🔍 Verificando orden de matches...', 'cyan');
  
  // Consultas simples y ordenar en memoria
  const updatedMatches = await db.collection('matches')
    .where('userId1', '==', CURRENT_USER.uid)
    .get();
  
  const updatedMatches2 = await db.collection('matches')
    .where('userId2', '==', CURRENT_USER.uid)
    .get();
  
  const allUpdated = [...updatedMatches.docs, ...updatedMatches2.docs];
  allUpdated.sort((a, b) => {
    const tsA = a.data().timestamp?.toMillis() || 0;
    const tsB = b.data().timestamp?.toMillis() || 0;
    if (tsB !== tsA) return tsB - tsA;
    return (b.data().lastMessageSeq || 0) - (a.data().lastMessageSeq || 0);
  });
  
  log('\n📊 Orden actual de matches:', 'cyan');
  allUpdated.slice(0, 5).forEach((doc, idx) => {
    const data = doc.data();
    const isTarget = doc.id === matchId;
    const emoji = isTarget ? '✅' : '  ';
    const color = isTarget ? 'green' : 'reset';
    log(`${emoji} ${idx + 1}. Match ${doc.id.substring(0, 12)}... | Seq: ${data.lastMessageSeq || 0}`, color);
    if (data.timestamp) {
      const date = data.timestamp.toDate();
      log(`     📅 ${date.toLocaleString('es-ES')}`, color);
    }
  });
  
  if (allUpdated[0].id === matchId) {
    log('\n🎉 ¡ÉXITO! El match está en la posición #1', 'green');
    log('✅ El sistema de reordenamiento funciona correctamente', 'green');
  } else {
    log('\n⚠️  ADVERTENCIA: El match NO está en posición #1', 'yellow');
    log(`   Posición actual: #${allUpdated.findIndex(d => d.id === matchId) + 1}`, 'yellow');
  }
}

/**
 * Verificar orden de matches
 */
async function verifyMatchOrder() {
  log(`\n🔍 Verificando orden de matches de ${CURRENT_USER.name}...`, 'cyan');
  
  // Consultas simples sin índices compuestos
  const matches1 = await db.collection('matches')
    .where('userId1', '==', CURRENT_USER.uid)
    .get();
  
  const matches2 = await db.collection('matches')
    .where('userId2', '==', CURRENT_USER.uid)
    .get();
  
  const allMatches = [...matches1.docs, ...matches2.docs];
  
  if (allMatches.length === 0) {
    log('⚠️  No hay matches para verificar', 'yellow');
    return;
  }
  
  // Ordenar manualmente
  allMatches.sort((a, b) => {
    const dataA = a.data();
    const dataB = b.data();
    
    const tsA = dataA.timestamp?.toMillis() || 0;
    const tsB = dataB.timestamp?.toMillis() || 0;
    
    if (tsB !== tsA) return tsB - tsA;
    
    return (dataB.lastMessageSeq || 0) - (dataA.lastMessageSeq || 0);
  });
  
  log(`\n📊 ${allMatches.length} matches ordenados por timestamp DESC, lastMessageSeq DESC:\n`, 'green');
  
  for (let i = 0; i < allMatches.length; i++) {
    const doc = allMatches[i];
    const data = doc.data();
    const timestamp = data.timestamp?.toDate();
    const seq = data.lastMessageSeq || 0;
    
    log(`${i + 1}. Match ${doc.id.substring(0, 12)}...`, 'bright');
    log(`   Secuencia: ${seq}`, 'reset');
    log(`   Timestamp: ${timestamp ? timestamp.toLocaleString('es-ES') : 'N/A'}`, 'reset');
    log(`   Mensaje: "${data.lastMessage || '(vacío)'}"`, 'reset');
    console.log('');
  }
  
  log('✅ Verificación completada', 'green');
}

/**
 * Limpiar datos de prueba
 */
async function cleanupTestData() {
  log('\n🧹 Limpiando datos de prueba...', 'cyan');
  
  const confirm = await question('⚠️  ¿Estás seguro de eliminar TODOS los datos de prueba? (s/n): ');
  
  if (confirm.toLowerCase() !== 's') {
    log('❌ Operación cancelada', 'yellow');
    return;
  }
  
  log('\n🔍 Buscando usuarios de prueba...', 'yellow');
  
  const users = await auth.listUsers(1000);
  const testUsers = users.users.filter(u => 
    u.email && (
      u.email.includes('@bstest.com') ||
      u.email.includes('test_match_') ||
      u.email.includes('test_user_') ||
      u.email.includes('test-ordering-')
    )
  );
  
  if (testUsers.length === 0) {
    log('✅ No hay usuarios de prueba para eliminar', 'green');
    return;
  }
  
  log(`📋 Encontrados ${testUsers.length} usuarios de prueba:\n`, 'yellow');
  testUsers.forEach((u, idx) => {
    log(`   ${idx + 1}. ${u.email}`, 'reset');
  });
  
  log('\n🔄 Eliminando...', 'yellow');
  
  let deletedUsers = 0;
  let deletedMatches = 0;
  let deletedMessages = 0;
  let deletedProfiles = 0;
  
  for (const user of testUsers) {
    try {
      // Eliminar matches
      const matches1 = await db.collection('matches')
        .where('userId1', '==', user.uid)
        .get();
      
      const matches2 = await db.collection('matches')
        .where('userId2', '==', user.uid)
        .get();
      
      const allMatches = [...matches1.docs, ...matches2.docs];
      
      for (const matchDoc of allMatches) {
        // Eliminar mensajes
        const messages = await db.collection('messages')
          .where('matchId', '==', matchDoc.id)
          .get();
        
        for (const msgDoc of messages.docs) {
          await msgDoc.ref.delete();
          deletedMessages++;
        }
        
        await matchDoc.ref.delete();
        deletedMatches++;
      }
      
      // Eliminar perfil
      const profileDoc = await db.collection('profiles').doc(user.uid).get();
      if (profileDoc.exists) {
        await profileDoc.ref.delete();
        deletedProfiles++;
      }
      
      // Eliminar usuario
      await auth.deleteUser(user.uid);
      deletedUsers++;
      
      log(`   ✅ ${user.email}`, 'green');
      
    } catch (error) {
      log(`   ❌ Error con ${user.email}: ${error.message}`, 'red');
    }
  }
  
  log('\n' + '='.repeat(70), 'reset');
  log('✅ LIMPIEZA COMPLETADA', 'green');
  log('='.repeat(70), 'reset');
  log(`📊 Resumen:`, 'cyan');
  log(`   👥 Usuarios eliminados: ${deletedUsers}`, 'reset');
  log(`   💬 Matches eliminados: ${deletedMatches}`, 'reset');
  log(`   📝 Mensajes eliminados: ${deletedMessages}`, 'reset');
  log(`   🎭 Perfiles eliminados: ${deletedProfiles}`, 'reset');
  log('='.repeat(70), 'reset');
}

/**
 * Generar escenario completo de prueba con múltiples matches y mensajes
 */
async function generateTestScenario() {
  log('\n🎬 Generando escenario de prueba completo...', 'cyan');
  
  const numMatches = await question('¿Cuántos matches deseas crear? (3-10): ');
  const count = parseInt(numMatches);
  
  if (isNaN(count) || count < 3 || count > 10) {
    log('❌ Número inválido. Debe ser entre 3 y 10', 'red');
    return;
  }
  
  log(`\n🔄 Creando ${count} matches con conversaciones activas...\n`, 'yellow');
  
  const testNames = [
    { name: 'Rosita', gender: 'female', type: 'SUGAR_BABY', messages: [`Hola ${CURRENT_USER.name}!`, '¿Cómo estás?', 'Me gustaría conocerte'] },
    { name: 'María', gender: 'female', type: 'SUGAR_BABY', messages: ['Hey!', 'Vi tu perfil', 'Me pareces interesante'] },
    { name: 'Carla', gender: 'female', type: 'SUGAR_MOMMY', messages: ['Hola guapo', '¿Qué tal tu día?'] },
    { name: 'Ana', gender: 'female', type: 'SUGAR_BABY', messages: [`Hi ${CURRENT_USER.name}!`, 'Nice to match with you'] },
    { name: 'Laura', gender: 'female', type: 'SUGAR_BABY', messages: ['Hola!', 'Me encanta tu perfil'] },
    { name: 'Sofía', gender: 'female', type: 'SUGAR_BABY', messages: [`Hey ${CURRENT_USER.name}`, 'Cuéntame de ti'] },
    { name: 'Isabella', gender: 'female', type: 'SUGAR_BABY', messages: ['Hola!', '¿De dónde eres?'] },
    { name: 'Valentina', gender: 'female', type: 'SUGAR_MOMMY', messages: ['Hi!', 'Seems we have a match'] },
    { name: 'Camila', gender: 'female', type: 'SUGAR_BABY', messages: [`Hola ${CURRENT_USER.name}`, 'Me gustas'] },
    { name: 'Daniela', gender: 'female', type: 'SUGAR_BABY', messages: ['Hey!', '¿Salimos?'] }
  ];
  
  const createdMatches = [];
  
  // 1. Crear usuarios y matches iniciales
  for (let i = 0; i < count; i++) {
    const userData = testNames[i];
    const email = `test_scenario_${Date.now()}_${i}@bstest.com`;
    const password = 'Test1234!';
    
    try {
      // Crear usuario en Auth
      const userRecord = await auth.createUser({
        email: email,
        password: password,
        displayName: userData.name
      });
      
      const userId = userRecord.uid;
      
      // Crear perfil
      await db.collection('profiles').doc(userId).set({
        name: userData.name,
        gender: userData.gender,
        userType: userData.type,
        age: 25 + i,
        city: 'Santiago',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        isTest: true
      });
      
      // Crear match (con timestamp escalonado)
      const matchId = `${CURRENT_USER.uid}_${userId}`;
      const minutesAgo = (count - i) * 60 * 1000;
      const matchTimestamp = new Date(Date.now() - minutesAgo);
      
      await db.collection('matches').doc(matchId).set({
        userId1: CURRENT_USER.uid,
        userId2: userId,
        usersMatched: [CURRENT_USER.uid, userId],
        timestamp: admin.firestore.Timestamp.fromDate(matchTimestamp),
        lastMessage: '',
        lastMessageSeq: 0,
        lastMessageTimestamp: admin.firestore.Timestamp.fromDate(matchTimestamp),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        isTest: true
      });
      
      createdMatches.push({
        matchId: matchId,
        userId: userId,
        name: userData.name,
        messages: userData.messages
      });
      
      log(`✅ ${i + 1}. ${userData.name} (${email})`, 'green');
      
    } catch (error) {
      log(`❌ Error creando ${userData.name}: ${error.message}`, 'red');
    }
  }
  
  log(`\n📝 ${createdMatches.length} matches creados`, 'green');
  log('\n⏳ Esperando 2 segundos antes de enviar mensajes...', 'yellow');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 2. Enviar mensajes a diferentes matches (simular conversación)
  log('\n💬 Enviando mensajes para simular conversaciones activas...\n', 'cyan');
  
  let messageCount = 0;
  
  for (let i = 0; i < createdMatches.length; i++) {
    const match = createdMatches[i];
    const numMessages = Math.min(match.messages.length, 3); // Máximo 3 mensajes por match
    
    for (let msgIdx = 0; msgIdx < numMessages; msgIdx++) {
      const message = match.messages[msgIdx];
      const senderId = match.userId;
      
      // Calcular timestamp: más reciente = menor index de match
      const secondsAgo = ((createdMatches.length - i) * 10) + (msgIdx * 5);
      const messageTimestamp = new Date(Date.now() - (secondsAgo * 1000));
      
      // Crear mensaje
      await db.collection('messages').add({
        matchId: match.matchId,
        senderId: senderId,
        text: message,
        timestamp: admin.firestore.Timestamp.fromDate(messageTimestamp),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Actualizar match
      await db.collection('matches').doc(match.matchId).update({
        lastMessage: message,
        lastMessageSeq: msgIdx + 1,
        timestamp: admin.firestore.Timestamp.fromDate(messageTimestamp),
        lastMessageTimestamp: admin.firestore.Timestamp.fromDate(messageTimestamp)
      });
      
      messageCount++;
      log(`  📨 ${match.name}: "${message}"`, 'reset');
      
      // Pequeña pausa entre mensajes
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log('');
  }
  
  log(`\n✅ ${messageCount} mensajes enviados exitosamente!`, 'green');
  log('\n📊 Escenario de prueba generado:', 'cyan');
  log(`   👥 ${createdMatches.length} matches creados`, 'reset');
  log(`   💬 ${messageCount} mensajes enviados`, 'reset');
  log(`   🔢 lastMessageSeq actualizado en cada match`, 'reset');
  log(`   ⏰ Timestamps escalonados para orden natural`, 'reset');
  
  log('\n📱 Abre la app de ' + CURRENT_USER.name + ' para ver los matches ordenados correctamente', 'bright');
  log('💡 El match más reciente (último mensaje) debería estar en posición #1', 'yellow');
  
  // Mostrar orden esperado
  log('\n🎯 Orden esperado (de más reciente a más antiguo):\n', 'cyan');
  
  const sortedMatches = [...createdMatches].reverse(); // Invertir porque el último tiene mensajes más recientes
  sortedMatches.forEach((match, idx) => {
    const lastMsg = match.messages[Math.min(match.messages.length - 1, 2)];
    log(`   ${idx + 1}. ${match.name} - "${lastMsg}"`, 'reset');
  });
}

/**
 * Crear perfiles para Discovery/HomeView (swipe)
 */
async function createDiscoveryProfiles() {
  log('\n🎯 Crear Perfiles de Discovery (HomeView)...', 'cyan');
  
  const numProfiles = await question('¿Cuántos perfiles de discovery crear? (5-30): ');
  const count = parseInt(numProfiles);
  
  if (isNaN(count) || count < 5 || count > 30) {
    log('❌ Número inválido. Debe ser entre 5 y 30', 'red');
    return;
  }
  
  log(`\n🔄 Creando ${count} perfiles de discovery...\n`, 'yellow');
  
  let created = 0;
  let errors = 0;
  
  for (let i = 0; i < count; i++) {
    const isMale = i % 2 === 0; // Alternar género
    const names = isMale ? testNames.men : testNames.women;
    const firstName = names[i % names.length];
    const lastName = lastNames[i % lastNames.length];
    const fullName = `${firstName} ${lastName}`;
    const email = `discovery_${Date.now()}_${i}@bstest-discovery.com`;
    
    try {
      // Crear usuario en Auth
      const userRecord = await auth.createUser({
        email: email,
        password: 'Test1234!',
        displayName: fullName
      });
      
      const userId = userRecord.uid;
      
      // Determinar userType basado en género y usuario actual
      let userType;
      if (CURRENT_USER.name === 'Daniel') {
        // Daniel es hombre, mostrar mujeres (Sugar Baby/Mommy)
        userType = isMale ? 'SUGAR_DADDY' : (i % 3 === 0 ? 'SUGAR_MOMMY' : 'SUGAR_BABY');
      } else {
        // Rosita es mujer, mostrar hombres (Sugar Daddy)
        userType = isMale ? 'SUGAR_DADDY' : 'SUGAR_BABY';
      }
      
      // Generar URLs de fotos
      const photoIndex = (i % 99) + 1;
      const gender = isMale ? 'men' : 'women';
      const pictureUrls = [];
      for (let p = 0; p < 5; p++) {
        const photoNum = ((photoIndex + p) % 99) + 1;
        pictureUrls.push(`https://randomuser.me/api/portraits/${gender}/${photoNum}.jpg`);
      }
      
      // Crear perfil completo
      await db.collection('profiles').doc(userId).set({
        name: fullName,
        gender: isMale ? 'male' : 'female',
        userType: userType,
        age: 22 + (i % 18), // Entre 22 y 40 años
        city: ['Santiago', 'Valparaíso', 'Concepción', 'Viña del Mar'][i % 4],
        bio: bios[i % bios.length],
        pictureUrls: pictureUrls,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        isDiscoveryProfile: true,
        isTest: true
      });
      
      created++;
      log(`✅ ${i + 1}. ${fullName} (${userType})`, 'green');
      
    } catch (error) {
      errors++;
      log(`❌ Error creando perfil ${i + 1}: ${error.message}`, 'red');
    }
  }
  
  log(`\n📊 Resumen:`, 'cyan');
  log(`   ✅ Perfiles creados: ${created}`, 'green');
  if (errors > 0) {
    log(`   ❌ Errores: ${errors}`, 'red');
  }
  log(`\n💡 Estos perfiles aparecerán en el HomeView (swipe) de ${CURRENT_USER.name}`, 'yellow');
}

/**
 * Verificar y diagnosticar sistema completo
 */
async function verifySystem() {
  log('\n🔍 Verificando sistema completo...', 'cyan');
  
  const stats = {
    matches: 0,
    matchUsers: 0,
    discoveryProfiles: 0,
    messages: 0,
    testUsers: 0
  };
  
  try {
    // Matches del usuario actual
    log('\n📊 Matches del usuario actual...', 'yellow');
    const matches1 = await db.collection('matches')
      .where('userId1', '==', CURRENT_USER.uid)
      .get();
    const matches2 = await db.collection('matches')
      .where('userId2', '==', CURRENT_USER.uid)
      .get();
    stats.matches = matches1.size + matches2.size;
    log(`   ✅ ${stats.matches} matches encontrados`, 'green');
    
    // Perfiles de discovery
    log('\n📊 Perfiles de Discovery...', 'yellow');
    const discoverySnap = await db.collection('profiles')
      .where('isDiscoveryProfile', '==', true)
      .get();
    stats.discoveryProfiles = discoverySnap.size;
    log(`   ✅ ${stats.discoveryProfiles} perfiles de discovery`, 'green');
    
    // Perfiles con fotos
    let profilesWithPhotos = 0;
    let totalPhotos = 0;
    discoverySnap.forEach(doc => {
      const data = doc.data();
      if (data.pictureUrls && data.pictureUrls.length > 0) {
        profilesWithPhotos++;
        totalPhotos += data.pictureUrls.length;
      }
    });
    log(`   ✅ ${profilesWithPhotos} perfiles con fotos (${totalPhotos} fotos totales)`, 'green');
    
    // Usuarios de prueba en Auth
    log('\n📊 Usuarios de prueba en Authentication...', 'yellow');
    const users = await auth.listUsers(1000);
    const testUsers = users.users.filter(u => 
      u.email && (
        u.email.includes('@bstest.com') ||
        u.email.includes('@bstest-discovery.com')
      )
    );
    stats.testUsers = testUsers.length;
    log(`   ✅ ${stats.testUsers} usuarios de prueba en Auth`, 'green');
    
    // Mensajes
    log('\n📊 Mensajes en conversaciones...', 'yellow');
    const allMatches = [...matches1.docs, ...matches2.docs];
    for (const matchDoc of allMatches) {
      const messages = await db.collection('messages')
        .where('matchId', '==', matchDoc.id)
        .limit(1)
        .get();
      stats.messages += messages.size;
    }
    log(`   ✅ Al menos ${stats.messages} conversaciones con mensajes`, 'green');
    
    // Resumen final
    log('\n' + '='.repeat(70), 'bright');
    log('📊 RESUMEN DEL SISTEMA', 'bright');
    log('='.repeat(70), 'bright');
    log(`👤 Usuario actual: ${CURRENT_USER.name}`, 'cyan');
    log(`💬 Matches activos: ${stats.matches}`, 'reset');
    log(`🎯 Perfiles de discovery: ${stats.discoveryProfiles}`, 'reset');
    log(`📸 Perfiles con fotos: ${profilesWithPhotos}`, 'reset');
    log(`💬 Conversaciones activas: ${stats.messages}`, 'reset');
    log(`🧪 Usuarios de prueba totales: ${stats.testUsers}`, 'reset');
    log('='.repeat(70), 'bright');
    
    // Estado del sistema
    if (stats.matches === 0) {
      log('\n⚠️  Sugerencia: Crea matches con la opción 2 o 5', 'yellow');
    }
    if (stats.discoveryProfiles === 0) {
      log('\n⚠️  Sugerencia: Crea perfiles de discovery con la opción 9', 'yellow');
    }
    if (stats.matches > 0 && stats.discoveryProfiles > 0) {
      log('\n✅ Sistema completo configurado y listo para pruebas', 'green');
    }
    
  } catch (error) {
    log(`\n❌ Error verificando sistema: ${error.message}`, 'red');
  }
}

/**
 * Limpieza selectiva
 */
async function selectiveCleanup() {
  log('\n🧹 Limpieza Selectiva', 'cyan');
  log('\n¿Qué tipo de datos deseas limpiar?\n', 'bright');
  log('1. Solo matches (mantener perfiles discovery)', 'reset');
  log('2. Solo perfiles discovery (mantener matches)', 'reset');
  log('3. Todo excepto el último escenario creado', 'reset');
  log('4. ❌ TODO (limpieza completa)', 'red');
  log('5. Volver al menú principal', 'yellow');
  
  const choice = await question('\nSelecciona (1-5): ');
  
  switch(choice) {
    case '1':
      await cleanupMatchesOnly();
      break;
    case '2':
      await cleanupDiscoveryOnly();
      break;
    case '3':
      await cleanupKeepScenario();
      break;
    case '4':
      await cleanupTestData();
      break;
    case '5':
      return;
    default:
      log('❌ Opción inválida', 'red');
  }
}

async function cleanupMatchesOnly() {
  log('\n🧹 Limpiando solo matches...', 'yellow');
  
  const confirm = await question('⚠️  Confirmar eliminación de TODOS los matches? (s/n): ');
  if (confirm.toLowerCase() !== 's') {
    log('❌ Operación cancelada', 'yellow');
    return;
  }
  
  let deleted = 0;
  const users = await auth.listUsers(1000);
  const testUsers = users.users.filter(u => 
    u.email && (
      u.email.includes('test_match_') ||
      u.email.includes('test_scenario_') ||
      u.email.includes('@bstest.com')
    ) && !u.email.includes('discovery')
  );
  
  for (const user of testUsers) {
    try {
      await auth.deleteUser(user.uid);
      await db.collection('profiles').doc(user.uid).delete();
      
      const matches1 = await db.collection('matches').where('userId1', '==', user.uid).get();
      const matches2 = await db.collection('matches').where('userId2', '==', user.uid).get();
      
      for (const match of [...matches1.docs, ...matches2.docs]) {
        await match.ref.delete();
        deleted++;
      }
      
      log(`   ✅ ${user.email}`, 'green');
    } catch (error) {
      log(`   ❌ Error: ${error.message}`, 'red');
    }
  }
  
  log(`\n✅ ${deleted} matches eliminados`, 'green');
}

async function cleanupDiscoveryOnly() {
  log('\n🧹 Limpiando solo perfiles de discovery...', 'yellow');
  
  const confirm = await question('⚠️  Confirmar eliminación de perfiles discovery? (s/n): ');
  if (confirm.toLowerCase() !== 's') {
    log('❌ Operación cancelada', 'yellow');
    return;
  }
  
  let deleted = 0;
  const users = await auth.listUsers(1000);
  const discoveryUsers = users.users.filter(u => 
    u.email && u.email.includes('@bstest-discovery.com')
  );
  
  for (const user of discoveryUsers) {
    try {
      await auth.deleteUser(user.uid);
      await db.collection('profiles').doc(user.uid).delete();
      deleted++;
      log(`   ✅ ${user.email}`, 'green');
    } catch (error) {
      log(`   ❌ Error: ${error.message}`, 'red');
    }
  }
  
  log(`\n✅ ${deleted} perfiles de discovery eliminados`, 'green');
}

async function cleanupKeepScenario() {
  log('\n🧹 Limpiando todo excepto último escenario...', 'yellow');
  log('⚠️  Esta función requiere implementación adicional', 'yellow');
  log('💡 Por ahora usa la limpieza completa (opción 4)', 'cyan');
}

// ============================================================================
// MENÚ PRINCIPAL
// ============================================================================

async function showMenu() {
  console.clear();
  log('='.repeat(70), 'bright');
  log('🧪 SISTEMA UNIFICADO DE PRUEBAS - BlackSugar21', 'bright');
  log('='.repeat(70), 'bright');
  log(`\n👤 Usuario: ${CURRENT_USER.name} (${CURRENT_USER.email})`, 'cyan');
  log(`🆔 UID: ${CURRENT_USER.uid}`, 'cyan');
  
  log('\n📋 GESTIÓN DE MATCHES:\n', 'bright');
  log('1. 📋 Listar matches actuales', 'reset');
  log('2. 🏗️  Crear matches de prueba', 'reset');
  log('3. 📤 Enviar mensaje a un match', 'reset');
  log('4. 🎬 Generar escenario completo', 'reset');
  
  log('\n🎯 PERFILES DE DISCOVERY:\n', 'bright');
  log('5. 🌟 Crear perfiles para HomeView/Swipe', 'reset');
  
  log('\n🔍 VERIFICACIÓN Y DIAGNÓSTICO:\n', 'bright');
  log('6. 🔍 Verificar orden de matches', 'reset');
  log('7. 📊 Verificar sistema completo', 'reset');
  
  log('\n🧹 LIMPIEZA:\n', 'bright');
  log('8. 🗑️  Limpieza selectiva (por tipo)', 'reset');
  log('9. 🧹 Limpieza completa (todo)', 'reset');
  
  log('\n⚙️  CONFIGURACIÓN:\n', 'bright');
  log('10. 🔄 Cambiar usuario de prueba', 'reset');
  log('11. 🚪 Salir', 'reset');
  
  log('\n' + '='.repeat(70), 'bright');
  
  const choice = await question('\nSelecciona una opción (1-11): ');
  
  let currentMatches = [];
  
  switch(choice) {
    case '1':
      currentMatches = await listDanielMatches();
      break;
    
    case '2':
      await createTestMatches();
      break;
    
    case '3':
      // Primero listar matches
      currentMatches = await listDanielMatches();
      if (currentMatches.length > 0) {
        await sendMessageToMatch(currentMatches);
      }
      break;
    
    case '4':
      await generateTestScenario();
      break;
    
    case '5':
      await createDiscoveryProfiles();
      break;
    
    case '6':
      await verifyMatchOrder();
      break;
    
    case '7':
      await verifySystem();
      break;
    
    case '8':
      await selectiveCleanup();
      break;
    
    case '9':
      await cleanupTestData();
      break;
    
    case '10':
      await selectTestUser();
      break;
    
    case '11':
      log('\n👋 ¡Hasta luego!', 'cyan');
      rl.close();
      process.exit(0);
      break;
    
    default:
      log('\n❌ Opción inválida', 'red');
  }
  
  // Esperar Enter para volver al menú
  await question('\n💡 Presiona Enter para volver al menú...');
  return showMenu();
}

// ============================================================================
// INICIO
// ============================================================================

async function main() {
  log('\n🚀 Iniciando Sistema de Pruebas...', 'cyan');
  log('📡 Conectando a Firebase...', 'yellow');
  
  // Seleccionar usuario de prueba
  await selectTestUser();
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Mostrar menú
  await showMenu();
}

// Ejecutar
main().catch(error => {
  log(`\n❌ Error fatal: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
