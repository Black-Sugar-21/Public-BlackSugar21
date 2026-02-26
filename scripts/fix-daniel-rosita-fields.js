#!/usr/bin/env node

/**
 * 🔧 CORRECCIÓN RÁPIDA: Agregar campos faltantes a Daniel y Rosita
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const USERS = {
  DANIEL: 'sU8xLiwQWNXmbYdR63p1uO6TSm72',
  ROSITA: 'DsDSK5xqEZZXAIKxtIKyBGntw8f2'
};

(async () => {
  try {
    console.log('\n🔧 Corrigiendo campos de Daniel y Rosita...\n');
    
    for (const [name, uid] of Object.entries(USERS)) {
      const userDoc = await db.collection('users').doc(uid).get();
      
      if (!userDoc.exists) {
        console.log(`⚠️  ${name} no existe en Firestore`);
        continue;
      }
      
      const data = userDoc.data();
      const updates = {};
      
      // Verificar y agregar campos faltantes
      if (data.blocked === undefined) {
        updates.blocked = false;
      }
      
      if (data.visible === undefined) {
        updates.visible = true;
      }
      
      if (data.paused === undefined) {
        updates.paused = false;
      }
      
      if (!data.accountStatus || data.accountStatus !== 'active') {
        updates.accountStatus = 'active';
      }
      
      if (Object.keys(updates).length > 0) {
        await db.collection('users').doc(uid).update(updates);
        console.log(`✅ ${name}:`);
        for (const [field, value] of Object.entries(updates)) {
          console.log(`   - ${field}: ${value}`);
        }
      } else {
        console.log(`✅ ${name}: Todos los campos OK`);
      }
    }
    
    console.log('\n🎉 CORRECCIÓN COMPLETADA');
    console.log('\n💡 Ahora:');
    console.log('   1. Cierra la app completamente (swipe up)');
    console.log('   2. Espera 5 segundos');
    console.log('   3. Reabre la app');
    console.log('   4. Los matches deberían aparecer');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    process.exit(1);
  }
})();
