#!/usr/bin/env node

/**
 * Verificar mensajes en colección raíz (legacy) vs subcolección (nueva)
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function verifyLegacyMessages() {
  console.log('\n🔍 COMPARANDO MENSAJES: LEGACY vs NUEVA ARQUITECTURA\n');
  console.log('═'.repeat(70));
  
  const martinaMatchId = 'sU8xLiwQWNXmbYdR63p1uO6TSm72_xcnPSJTwQTO3sqI6UVnvug0ToXg2';
  
  // 1. Contar mensajes en colección raíz (legacy)
  console.log('\n📋 1. Mensajes en colección RAÍZ (legacy)...');
  const legacyMessages = await db.collection('messages')
    .where('chatId', '==', martinaMatchId)
    .orderBy('timestamp', 'desc')
    .limit(20)
    .get();
  
  console.log(`   📊 Total mensajes legacy: ${legacyMessages.size}`);
  if (legacyMessages.size > 0) {
    console.log('   📝 Últimos 5 mensajes:');
    legacyMessages.docs.slice(0, 5).forEach((doc, index) => {
      const data = doc.data();
      console.log(`   ${index + 1}. ${doc.id.substring(0, 8)}... - "${data.text?.substring(0, 40)}..."`);
      console.log(`      timestamp: ${data.timestamp?.toDate()}`);
    });
  }
  
  // 2. Contar mensajes en subcolección (nueva)
  console.log('\n📋 2. Mensajes en SUBCOLECCIÓN (nueva arquitectura)...');
  const newMessages = await db.collection('matches')
    .doc(martinaMatchId)
    .collection('messages')
    .orderBy('timestamp', 'desc')
    .limit(20)
    .get();
  
  console.log(`   📊 Total mensajes nuevos: ${newMessages.size}`);
  if (newMessages.size > 0) {
    console.log('   📝 Últimos 5 mensajes:');
    newMessages.docs.slice(0, 5).forEach((doc, index) => {
      const data = doc.data();
      console.log(`   ${index + 1}. ${doc.id.substring(0, 8)}... - "${data.text?.substring(0, 40)}..."`);
      console.log(`      timestamp: ${data.timestamp?.toDate()}`);
    });
  }
  
  console.log('\n' + '═'.repeat(70));
  console.log('\n💡 DIAGNÓSTICO:');
  if (legacyMessages.size > 0 && newMessages.size < legacyMessages.size) {
    console.log(`   ⚠️  HAY ${legacyMessages.size} MENSAJES LEGACY que NO están en la subcolección`);
    console.log(`   💡 Se necesita MIGRACIÓN de mensajes de colección raíz a subcolección`);
    console.log(`   📋 Opción 1: Migrar mensajes existentes`);
    console.log(`   📋 Opción 2: Eliminar mensajes legacy y empezar de cero`);
  } else if (newMessages.size > 0) {
    console.log(`   ✅ La nueva arquitectura funciona correctamente`);
    console.log(`   ℹ️  ${newMessages.size} mensajes en subcolección`);
  }
  
  console.log('\n' + '═'.repeat(70));
}

verifyLegacyMessages()
  .then(() => {
    console.log('\n✅ Verificación completada');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
