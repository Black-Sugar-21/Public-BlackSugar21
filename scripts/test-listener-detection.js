#!/usr/bin/env node

const admin = require('firebase-admin');
const serviceAccount = require('../service-account-key.json');

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function testListenerDetection() {
  const matchId = 'sU8xLiwQWNXmbYdR63p1uO6TSm72_xcnPSJTwQTO3sqI6UVnvug0ToXg2';
  
  console.log('🧪 TEST: ¿Detecta iOS cambios en match document?');
  console.log('══════════════════════════════════════════════════════════════════════\n');
  console.log('⚠️  MANTÉN LA APP ABIERTA EN MATCHLISTVIEW\n');
  console.log('📱 En Xcode, busca estos logs:');
  console.log('   "📝 [LISTENER] X matches modificados"');
  console.log('   "🔔 [LISTENER] Procesando 15 matches..."\n');
  
  console.log('🔄 Actualizando match document en 5 segundos...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  console.log('📝 Actualizando match con timestamp server-side...');
  await db.collection('matches').doc(matchId).update({
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    lastMessage: `TEST LISTENER ${Date.now()}`,
    lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp()
  });
  
  console.log('✅ Match actualizado');
  console.log('\n📱 VERIFICA EN XCODE:');
  console.log('   ✅ ¿Apareció log "📝 [LISTENER] X matches modificados"?');
  console.log('   ✅ ¿La UI se actualizó automáticamente?');
  console.log('\n❌ Si NO aparecieron logs:');
  console.log('   → El listener NO está activo o NO detecta cambios');
  console.log('   → Problema: Firestore caché o listener cancelado');
  
  process.exit(0);
}

testListenerDetection().catch(console.error);
