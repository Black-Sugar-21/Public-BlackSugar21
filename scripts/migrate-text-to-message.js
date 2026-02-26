#!/usr/bin/env node

/**
 * 🔄 SCRIPT: Migrar campo 'text' → 'message' en mensajes existentes
 * 
 * Este script actualiza todos los mensajes en Firestore que tienen el campo
 * 'text' para usar 'message' en su lugar, homologando con iOS/Android.
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ID del match de Martina Fernández
const MARTINA_MATCH_ID = 'sU8xLiwQWNXmbYdR63p1uO6TSm72_xcnPSJTwQTO3sqI6UVnvug0ToXg2';

async function migrateTextToMessage() {
  console.log('🔄 Migrando campo "text" → "message" en mensajes existentes\n');
  
  try {
    // Obtener todos los mensajes de Martina que tengan el campo 'text'
    const messagesSnapshot = await db.collection('matches')
      .doc(MARTINA_MATCH_ID)
      .collection('messages')
      .get();
    
    console.log(`📊 Total mensajes encontrados: ${messagesSnapshot.size}\n`);
    
    let migrated = 0;
    let skipped = 0;
    
    for (const doc of messagesSnapshot.docs) {
      const data = doc.data();
      
      // Si tiene 'text' pero NO tiene 'message', migrar
      if (data.text && !data.message) {
        console.log(`🔄 Migrando mensaje ${doc.id}:`);
        console.log(`   Texto: "${data.text}"`);
        
        // Actualizar: agregar 'message' y eliminar 'text'
        await doc.ref.update({
          message: data.text,
          text: admin.firestore.FieldValue.delete()
        });
        
        console.log(`   ✅ Migrado\n`);
        migrated++;
      } 
      // Si tiene 'message' pero también tiene 'text', solo eliminar 'text'
      else if (data.message && data.text) {
        console.log(`🧹 Limpiando campo duplicado en ${doc.id}:`);
        console.log(`   Manteniendo: "${data.message}"`);
        console.log(`   Eliminando: "${data.text}"`);
        
        await doc.ref.update({
          text: admin.firestore.FieldValue.delete()
        });
        
        console.log(`   ✅ Limpiado\n`);
        migrated++;
      }
      // Si solo tiene 'message', no hacer nada
      else if (data.message) {
        console.log(`✓ Mensaje ${doc.id} ya usa 'message' (sin cambios)\n`);
        skipped++;
      }
      // Si no tiene ni 'text' ni 'message' (mensaje vacío/efímero)
      else {
        console.log(`⚠️ Mensaje ${doc.id} sin texto (type: ${data.type})\n`);
        skipped++;
      }
    }
    
    console.log('━'.repeat(60));
    console.log('✅ Migración completada');
    console.log(`📊 Mensajes migrados: ${migrated}`);
    console.log(`📊 Mensajes sin cambios: ${skipped}`);
    console.log('━'.repeat(60));
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

migrateTextToMessage()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  });
