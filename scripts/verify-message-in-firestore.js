#!/usr/bin/env node

/**
 * Verificar si el mensaje existe en la subcolección correcta
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function verifyMessage() {
  console.log('\n🔍 VERIFICANDO MENSAJE EN FIRESTORE\n');
  console.log('═'.repeat(70));
  
  const messageId = 'slaSMcVSZTL39S5F70C2';
  
  // 1. Buscar en qué match está Martina Fernández
  console.log('\n📋 1. Buscando match de Martina Fernández...');
  const matchesSnapshot = await db.collection('matches')
    .where('usersMatched', 'array-contains', 'sU8xLiwQWNXmbYdR63p1uO6TSm72') // Daniel's UID
    .get();
  
  let martinaMatch = null;
  for (const doc of matchesSnapshot.docs) {
    const data = doc.data();
    // Buscar match que tenga a Martina (buscar por nombre en users collection)
    const userIds = data.usersMatched || [];
    for (const userId of userIds) {
      if (userId !== 'sU8xLiwQWNXmbYdR63p1uO6TSm72') {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists && userDoc.data().name === 'Martina Fernández') {
          martinaMatch = { id: doc.id, ...data };
          console.log(`   ✅ Match encontrado: ${doc.id}`);
          console.log(`   📊 lastMessageSeq: ${data.lastMessageSeq}`);
          console.log(`   💬 lastMessage: ${data.lastMessage?.substring(0, 50)}`);
          break;
        }
      }
    }
    if (martinaMatch) break;
  }
  
  if (!martinaMatch) {
    console.log('   ❌ No se encontró match con Martina Fernández');
    return;
  }
  
  // 2. Verificar si el mensaje existe en la subcolección
  console.log(`\n📋 2. Verificando mensaje ${messageId} en subcolección...`);
  const messageDoc = await db.collection('matches')
    .doc(martinaMatch.id)
    .collection('messages')
    .doc(messageId)
    .get();
  
  if (messageDoc.exists) {
    console.log('   ✅ Mensaje EXISTE en subcolección');
    const data = messageDoc.data();
    console.log(`   📊 Datos del mensaje:`);
    console.log(`      senderId: ${data.senderId}`);
    console.log(`      receiverId: ${data.receiverId || 'N/A'}`);
    console.log(`      text: ${data.text}`);
    console.log(`      type: ${data.type || data.messageType}`);
    console.log(`      timestamp: ${data.timestamp?.toDate() || 'N/A'}`);
  } else {
    console.log('   ❌ Mensaje NO EXISTE en subcolección');
    
    // Verificar si quedó en colección raíz (legacy)
    console.log('\n📋 3. Verificando en colección raíz (legacy)...');
    const rootMessageDoc = await db.collection('messages').doc(messageId).get();
    if (rootMessageDoc.exists) {
      console.log('   ⚠️  Mensaje está en colección RAÍZ (esto está MAL)');
      console.log('   💡 test-master.js está usando el path antiguo');
    }
  }
  
  // 3. Listar todos los mensajes de este match
  console.log(`\n📋 4. Listando mensajes en subcolección...`);
  const messagesSnapshot = await db.collection('matches')
    .doc(martinaMatch.id)
    .collection('messages')
    .orderBy('timestamp', 'desc')
    .limit(5)
    .get();
  
  console.log(`   📊 Total mensajes: ${messagesSnapshot.size}`);
  messagesSnapshot.docs.forEach((doc, index) => {
    const data = doc.data();
    console.log(`   ${index + 1}. ${doc.id.substring(0, 8)}... - "${data.text?.substring(0, 30)}..."`);
  });
  
  console.log('\n' + '═'.repeat(70));
}

verifyMessage()
  .then(() => {
    console.log('\n✅ Verificación completada');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
