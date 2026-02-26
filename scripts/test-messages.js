#!/usr/bin/env node

/**
 * 💬 Sistema de Pruebas de Mensajes
 * 
 * Script para realizar pruebas completas del sistema de mensajería:
 * - Crear matches con mensajes iniciales
 * - Enviar mensajes de prueba
 * - Verificar orden de reordenamiento de matches
 * - Simular conversaciones
 * 
 * Autor: GitHub Copilot
 * Fecha: 16 de enero de 2026
 */

const admin = require('firebase-admin');
const readline = require('readline');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

// Usuario de prueba (Daniel)
const DANIEL = {
  email: 'dverdugo85@gmail.com',
  uid: 'sU8xLiwQWNXmbYdR63p1uO6TSm72',
  name: 'Daniel'
};

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
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

/**
 * Listar matches existentes de Daniel
 */
async function listMatches() {
  log('\n📋 MATCHES ACTUALES DE DANIEL', 'cyan');
  log('═'.repeat(60), 'cyan');
  
  const matches1 = await db.collection('matches')
    .where('userId1', '==', DANIEL.uid)
    .get();
  
  const matches2 = await db.collection('matches')
    .where('userId2', '==', DANIEL.uid)
    .get();
  
  const allMatches = [...matches1.docs, ...matches2.docs];
  
  if (allMatches.length === 0) {
    log('\n⚠️ No hay matches disponibles', 'yellow');
    log('💡 Primero crea matches con test-system-unified.js opción 2', 'cyan');
    return [];
  }
  
  // Ordenar por lastMessageTimestamp
  allMatches.sort((a, b) => {
    const timeA = a.data().lastMessageTimestamp?.toMillis() || 0;
    const timeB = b.data().lastMessageTimestamp?.toMillis() || 0;
    return timeB - timeA; // Más reciente primero
  });
  
  log(`\n✅ Encontrados ${allMatches.length} matches\n`, 'green');
  
  for (let i = 0; i < allMatches.length; i++) {
    const match = allMatches[i];
    const data = match.data();
    const otherUserId = data.userId1 === DANIEL.uid ? data.userId2 : data.userId1;
    
    // Obtener nombre del otro usuario
    let otherName = 'Usuario desconocido';
    try {
      const userDoc = await db.collection('users').doc(otherUserId).get();
      if (userDoc.exists) {
        otherName = userDoc.data().name || otherName;
      }
    } catch (e) {
      // Ignorar errores
    }
    
    const lastMsg = data.lastMessage || 'Sin mensajes';
    const seq = data.lastMessageSeq || 0;
    const timestamp = data.lastMessageTimestamp?.toDate();
    const timeStr = timestamp ? timestamp.toLocaleString('es-CL') : 'Sin timestamp';
    
    log(`${i + 1}. ${otherName}`, 'bright');
    log(`   Match ID: ${match.id}`, 'reset');
    log(`   Último mensaje: "${lastMsg}"`, 'reset');
    log(`   Seq: ${seq} | Timestamp: ${timeStr}`, 'reset');
    log('', 'reset');
  }
  
  return allMatches;
}

/**
 * Enviar mensaje de prueba
 */
async function sendTestMessage(matches) {
  if (!matches || matches.length === 0) {
    log('❌ No hay matches disponibles', 'red');
    return;
  }
  
  log('\n💬 ENVIAR MENSAJE DE PRUEBA', 'cyan');
  log('═'.repeat(60), 'cyan');
  
  const choice = await question(`\n¿A qué match enviar mensaje? (1-${matches.length}): `);
  const index = parseInt(choice) - 1;
  
  if (isNaN(index) || index < 0 || index >= matches.length) {
    log('❌ Selección inválida', 'red');
    return;
  }
  
  const matchDoc = matches[index];
  const matchId = matchDoc.id;
  const matchData = matchDoc.data();
  const otherUserId = matchData.userId1 === DANIEL.uid ? matchData.userId2 : matchData.userId1;
  
  // Obtener nombre del otro usuario
  let otherName = 'Usuario';
  try {
    const userDoc = await db.collection('users').doc(otherUserId).get();
    if (userDoc.exists) {
      otherName = userDoc.data().name || otherName;
    }
  } catch (e) {
    // Ignorar
  }
  
  log(`\n💬 Match con: ${otherName}`, 'bright');
  log(`   Último mensaje: "${matchData.lastMessage || 'Sin mensajes'}"`, 'reset');
  log(`   Seq actual: ${matchData.lastMessageSeq || 0}`, 'reset');
  
  const message = await question('\nEscribe el mensaje (o presiona Enter para mensaje automático): ');
  const finalMessage = message.trim() || `Mensaje de prueba ${Date.now()}`;
  
  log('\n⏳ Enviando mensaje...', 'yellow');
  
  const newSeq = (matchData.lastMessageSeq || 0) + 1;
  const now = admin.firestore.Timestamp.now();
  
  // Crear mensaje
  const messageRef = db.collection('messages').doc();
  await messageRef.set({
    matchId: matchId,
    senderId: DANIEL.uid,
    text: finalMessage,
    timestamp: now,
    createdAt: now
  });
  
  // Actualizar match
  await db.collection('matches').doc(matchId).update({
    lastMessage: finalMessage,
    lastMessageSeq: newSeq,
    lastMessageTimestamp: now,
    timestamp: now
  });
  
  log(`✅ Mensaje enviado exitosamente!`, 'green');
  log(`   Nuevo Seq: ${newSeq}`, 'reset');
  log(`\n💡 El match con ${otherName} debería moverse a la posición #1`, 'cyan');
  log(`   Abre la app y verifica que el reordenamiento funcione`, 'yellow');
}

/**
 * Simular conversación automática
 */
async function simulateConversation(matches) {
  if (!matches || matches.length === 0) {
    log('❌ No hay matches disponibles', 'red');
    return;
  }
  
  log('\n🤖 SIMULAR CONVERSACIÓN AUTOMÁTICA', 'cyan');
  log('═'.repeat(60), 'cyan');
  
  const choice = await question(`\n¿Con qué match simular conversación? (1-${matches.length}): `);
  const index = parseInt(choice) - 1;
  
  if (isNaN(index) || index < 0 || index >= matches.length) {
    log('❌ Selección inválida', 'red');
    return;
  }
  
  const numMessages = await question('¿Cuántos mensajes enviar? (1-10): ');
  const count = parseInt(numMessages);
  
  if (isNaN(count) || count < 1 || count > 10) {
    log('❌ Número inválido', 'red');
    return;
  }
  
  const matchDoc = matches[index];
  const matchId = matchDoc.id;
  const matchData = matchDoc.data();
  const otherUserId = matchData.userId1 === DANIEL.uid ? matchData.userId2 : matchData.userId1;
  
  // Obtener nombre
  let otherName = 'Usuario';
  try {
    const userDoc = await db.collection('users').doc(otherUserId).get();
    if (userDoc.exists) {
      otherName = userDoc.data().name || otherName;
    }
  } catch (e) {}
  
  log(`\n💬 Iniciando conversación con ${otherName}...`, 'bright');
  log(`   Se enviarán ${count} mensajes con intervalos de 2 segundos\n`, 'yellow');
  
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
  
  let currentSeq = matchData.lastMessageSeq || 0;
  
  for (let i = 0; i < count; i++) {
    const message = testMessages[i % testMessages.length];
    currentSeq++;
    
    const now = admin.firestore.Timestamp.now();
    
    // Crear mensaje
    const messageRef = db.collection('messages').doc();
    await messageRef.set({
      matchId: matchId,
      senderId: DANIEL.uid,
      text: message,
      timestamp: now,
      createdAt: now
    });
    
    // Actualizar match
    await db.collection('matches').doc(matchId).update({
      lastMessage: message,
      lastMessageSeq: currentSeq,
      lastMessageTimestamp: now,
      timestamp: now
    });
    
    log(`✅ ${i + 1}/${count}: "${message}" (Seq: ${currentSeq})`, 'green');
    
    // Esperar 2 segundos antes del siguiente mensaje
    if (i < count - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  log(`\n🎉 Conversación simulada exitosamente!`, 'green');
  log(`   Se enviaron ${count} mensajes`, 'reset');
  log(`   Seq final: ${currentSeq}`, 'reset');
  log(`\n💡 Abre la app para ver la conversación`, 'cyan');
}

/**
 * Verificar orden de matches
 */
async function verifyMatchOrder() {
  log('\n🔍 VERIFICAR ORDEN DE MATCHES', 'cyan');
  log('═'.repeat(60), 'cyan');
  
  const matches = await listMatches();
  
  if (matches.length < 2) {
    log('\n💡 Se necesitan al menos 2 matches para verificar el orden', 'yellow');
    return;
  }
  
  log('\n📊 ANÁLISIS DE ORDEN:', 'cyan');
  log('═'.repeat(60), 'cyan');
  
  let orderCorrect = true;
  
  for (let i = 0; i < matches.length - 1; i++) {
    const current = matches[i].data();
    const next = matches[i + 1].data();
    
    const currentTime = current.lastMessageTimestamp?.toMillis() || 0;
    const nextTime = next.lastMessageTimestamp?.toMillis() || 0;
    
    const currentSeq = current.lastMessageSeq || 0;
    const nextSeq = next.lastMessageSeq || 0;
    
    const isCorrect = currentTime >= nextTime;
    
    if (!isCorrect) {
      orderCorrect = false;
      log(`❌ Posición ${i + 1} → ${i + 2}: ORDEN INCORRECTO`, 'red');
      log(`   Match ${i + 1}: Seq=${currentSeq}, Time=${new Date(currentTime).toLocaleString()}`, 'reset');
      log(`   Match ${i + 2}: Seq=${nextSeq}, Time=${new Date(nextTime).toLocaleString()}`, 'reset');
    } else {
      log(`✅ Posición ${i + 1} → ${i + 2}: Orden correcto`, 'green');
    }
  }
  
  if (orderCorrect) {
    log(`\n✅ TODOS LOS MATCHES ESTÁN EN ORDEN CORRECTO`, 'green');
  } else {
    log(`\n⚠️ SE DETECTARON PROBLEMAS DE ORDEN`, 'yellow');
    log(`💡 Los matches deberían estar ordenados por lastMessageTimestamp descendente`, 'cyan');
  }
}

/**
 * Menú principal
 */
async function showMenu() {
  console.clear();
  log('\n💬 SISTEMA DE PRUEBAS DE MENSAJES - BlackSugar21', 'bright');
  log('═'.repeat(60), 'cyan');
  log(`Usuario: ${DANIEL.name} (${DANIEL.email})`, 'yellow');
  log('═'.repeat(60), 'cyan');
  
  log('\n📋 OPCIONES:\n', 'cyan');
  log('1. Listar matches actuales', 'reset');
  log('2. Enviar mensaje de prueba', 'reset');
  log('3. Simular conversación automática', 'reset');
  log('4. Verificar orden de matches', 'reset');
  log('5. Refrescar (limpiar pantalla)', 'reset');
  log('6. Salir', 'reset');
  
  const choice = await question('\nSelecciona una opción (1-6): ');
  
  return choice;
}

/**
 * Main
 */
async function main() {
  let matches = [];
  
  while (true) {
    const choice = await showMenu();
    
    try {
      switch (choice) {
        case '1':
          matches = await listMatches();
          break;
          
        case '2':
          if (matches.length === 0) {
            matches = await listMatches();
          }
          await sendTestMessage(matches);
          // Refrescar lista después de enviar
          matches = await listMatches();
          break;
          
        case '3':
          if (matches.length === 0) {
            matches = await listMatches();
          }
          await simulateConversation(matches);
          // Refrescar lista después de simular
          matches = await listMatches();
          break;
          
        case '4':
          await verifyMatchOrder();
          break;
          
        case '5':
          console.clear();
          matches = [];
          continue;
          
        case '6':
          log('\n👋 ¡Hasta luego!', 'cyan');
          rl.close();
          process.exit(0);
          break;
          
        default:
          log('\n❌ Opción inválida', 'red');
      }
      
      await question('\nPresiona Enter para continuar...');
      
    } catch (error) {
      log(`\n❌ ERROR: ${error.message}`, 'red');
      console.error(error);
      await question('\nPresiona Enter para continuar...');
    }
  }
}

main();
