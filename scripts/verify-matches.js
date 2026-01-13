#!/usr/bin/env node

/**
 * Verificador de Matches en Firestore
 * Comprueba que los matches creados existen y están correctos
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const DANIEL_UID = 'sU8xLiwQWNXmbYdR63p1uO6TSm72';

async function verifyMatches() {
  console.log('🔍 Verificando matches de Daniel...\n');
  
  try {
    // Query matches donde Daniel es userId1
    const matches1 = await db.collection('matches')
      .where('userId1', '==', DANIEL_UID)
      .get();
    
    // Query matches donde Daniel es userId2
    const matches2 = await db.collection('matches')
      .where('userId2', '==', DANIEL_UID)
      .get();
    
    const allMatches = [...matches1.docs, ...matches2.docs];
    
    console.log(`✅ Total matches encontrados: ${allMatches.length}\n`);
    
    if (allMatches.length === 0) {
      console.log('⚠️  No hay matches para Daniel');
      return;
    }
    
    // Ordenar por timestamp
    allMatches.sort((a, b) => {
      const timestampA = a.data().timestamp?.toMillis() || 0;
      const timestampB = b.data().timestamp?.toMillis() || 0;
      return timestampB - timestampA;
    });
    
    console.log('📋 Listado de matches:\n');
    
    for (let i = 0; i < allMatches.length; i++) {
      const doc = allMatches[i];
      const data = doc.data();
      const otherUserId = data.userId1 === DANIEL_UID ? data.userId2 : data.userId1;
      
      // Obtener nombre del otro usuario
      let name = 'Usuario';
      try {
        const profile = await db.collection('profiles').doc(otherUserId).get();
        if (profile.exists) {
          name = profile.data().name || 'Usuario';
        }
      } catch (e) {
        // Ignore
      }
      
      const timestamp = data.timestamp?.toDate();
      const lastMessage = data.lastMessage || 'Sin mensaje';
      const isTest = data.isTest ? '🧪' : '';
      
      console.log(`${i + 1}. ${name} ${isTest}`);
      console.log(`   Match ID: ${doc.id}`);
      console.log(`   Último mensaje: ${lastMessage}`);
      console.log(`   Timestamp: ${timestamp?.toLocaleString('es-CL') || 'N/A'}`);
      console.log(`   Seq: ${data.lastMessageSeq || 0}`);
      console.log('');
    }
    
    // Verificar matches de prueba recientes
    const testMatches = allMatches.filter(doc => doc.data().isTest);
    console.log(`\n🧪 Matches de prueba: ${testMatches.length}`);
    console.log(`📱 Matches reales: ${allMatches.length - testMatches.length}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

verifyMatches()
  .then(() => {
    console.log('\n✅ Verificación completada');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error fatal:', error);
    process.exit(1);
  });
