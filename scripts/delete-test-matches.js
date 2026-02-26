#!/usr/bin/env node

/**
 * 🗑️ LIMPIEZA RÁPIDA: Borrar solo matches de prueba
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

(async () => {
  try {
    console.log('\n🗑️ BORRAR MATCHES DE PRUEBA\n');
    
    // Buscar matches de prueba
    const matchesSnapshot = await db.collection('matches')
      .where('isTest', '==', true)
      .get();
    
    if (matchesSnapshot.empty) {
      console.log('✅ No hay matches de prueba para borrar');
      process.exit(0);
    }
    
    console.log(`📦 Encontrados ${matchesSnapshot.size} matches de prueba\n`);
    
    let deleted = 0;
    let errors = 0;
    
    for (const doc of matchesSnapshot.docs) {
      try {
        const data = doc.data();
        const otherUserId = data.userId1 || data.userId2;
        
        // Buscar y eliminar mensajes asociados
        const messagesSnapshot = await db.collection('messages')
          .where('matchId', '==', doc.id)
          .get();
        
        for (const msgDoc of messagesSnapshot.docs) {
          await msgDoc.ref.delete();
        }
        
        // Eliminar el match
        await doc.ref.delete();
        
        deleted++;
        console.log(`✅ ${deleted}. Match ${doc.id.substring(0, 20)}... (${messagesSnapshot.size} mensajes)`);
        
      } catch (error) {
        errors++;
        console.log(`❌ Error: ${error.message}`);
      }
    }
    
    console.log(`\n📊 RESUMEN:`);
    console.log(`   ✅ Matches eliminados: ${deleted}`);
    if (errors > 0) {
      console.log(`   ❌ Errores: ${errors}`);
    }
    
    console.log('\n💡 Matches de prueba borrados exitosamente');
    console.log('   Los usuarios de prueba siguen existiendo');
    console.log('   Usa: node test-master.js → opción 1 para crear nuevos matches');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    process.exit(1);
  }
})();
