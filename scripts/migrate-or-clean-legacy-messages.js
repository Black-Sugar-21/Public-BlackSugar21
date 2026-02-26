#!/usr/bin/env node

/**
 * Migrar mensajes de colección raíz (legacy) a subcolecciones (nueva arquitectura)
 * O limpiar mensajes legacy para empezar de cero
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function cleanLegacyMessages() {
  console.log('\n🧹 LIMPIAR MENSAJES LEGACY\n');
  console.log('═'.repeat(70));
  
  // 1. Contar mensajes en colección raíz
  console.log('\n📋 1. Contando mensajes en colección raíz (legacy)...');
  const legacyMessages = await db.collection('messages').get();
  
  console.log(`   📊 Total mensajes legacy: ${legacyMessages.size}`);
  
  if (legacyMessages.size === 0) {
    console.log('   ✅ No hay mensajes legacy para limpiar');
    return;
  }
  
  // Agrupar por chatId
  const messagesByChat = {};
  legacyMessages.docs.forEach(doc => {
    const data = doc.data();
    const chatId = data.chatId || data.matchId;
    if (chatId) {
      if (!messagesByChat[chatId]) {
        messagesByChat[chatId] = [];
      }
      messagesByChat[chatId].push({ id: doc.id, ...data });
    }
  });
  
  console.log(`\n📊 Mensajes agrupados por match:`);
  for (const [chatId, messages] of Object.entries(messagesByChat)) {
    console.log(`   ${chatId.substring(0, 20)}...: ${messages.length} mensajes`);
  }
  
  console.log('\n⚠️  OPCIONES:');
  console.log('   1. ❌ ELIMINAR todos los mensajes legacy (empezar de cero)');
  console.log('   2. 🔄 MIGRAR a subcolecciones (preservar historial)');
  console.log('   3. 🚫 CANCELAR');
  
  // Usar argumento de línea de comando o pedir input
  const choice = process.argv[2] || await question('\n👉 Selecciona opción (1-3): ');
  
  if (choice === '1') {
    // ELIMINAR mensajes legacy
    console.log('\n⏳ Eliminando mensajes legacy...');
    const batch = db.batch();
    let count = 0;
    
    for (const doc of legacyMessages.docs) {
      batch.delete(doc.ref);
      count++;
      
      // Firestore batch limit: 500 operations
      if (count % 500 === 0) {
        await batch.commit();
        console.log(`   ✅ ${count}/${legacyMessages.size} eliminados...`);
      }
    }
    
    if (count % 500 !== 0) {
      await batch.commit();
    }
    
    console.log(`\n✅ ${count} mensajes legacy eliminados`);
    console.log('💡 Ahora todos los mensajes nuevos se crearán en subcolecciones');
    
  } else if (choice === '2') {
    // MIGRAR a subcolecciones
    console.log('\n⏳ Migrando mensajes a subcolecciones...');
    let migrated = 0;
    
    for (const [chatId, messages] of Object.entries(messagesByChat)) {
      const batch = db.batch();
      
      for (const message of messages) {
        // Crear en subcolección
        const newRef = db.collection('matches')
          .doc(chatId)
          .collection('messages')
          .doc(message.id);
        
        // Limpiar datos (eliminar chatId/matchId)
        const cleanData = { ...message };
        delete cleanData.id;
        delete cleanData.chatId;
        delete cleanData.matchId;
        
        batch.set(newRef, cleanData);
        
        // Eliminar de colección raíz
        batch.delete(db.collection('messages').doc(message.id));
        migrated++;
      }
      
      await batch.commit();
      console.log(`   ✅ Match ${chatId.substring(0, 20)}...: ${messages.length} mensajes migrados`);
    }
    
    console.log(`\n✅ ${migrated} mensajes migrados a subcolecciones`);
    console.log('💡 Historial preservado en nueva arquitectura');
    
  } else {
    console.log('\n❌ Operación cancelada');
  }
  
  console.log('\n' + '═'.repeat(70));
}

cleanLegacyMessages()
  .then(() => {
    console.log('\n✅ Proceso completado');
    rl.close();
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error);
    rl.close();
    process.exit(1);
  });
