#!/usr/bin/env node

/**
 * 🔍 Verificar Matches y Notificaciones
 * 
 * Script para verificar el estado de los matches y notificaciones:
 * - Lista todos los matches de Daniel
 * - Verifica estado de notificaciones
 * - Muestra información para debugging
 * 
 * Fecha: 16 de enero de 2026
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const DANIEL_UID = 'sU8xLiwQWNXmbYdR63p1uO6TSm72';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function verifyMatches() {
  try {
    log('\n🔍 VERIFICACIÓN DE MATCHES Y NOTIFICACIONES', 'cyan');
    log('═'.repeat(70), 'cyan');
    
    // 1. Obtener todos los matches de Daniel
    log('\n📋 Obteniendo matches de Daniel...', 'yellow');
    
    const matchesSnapshot = await db.collection('matches')
      .where('usersMatched', 'array-contains', DANIEL_UID)
      .orderBy('timestamp', 'desc')
      .get();
    
    if (matchesSnapshot.empty) {
      log('\n⚠️  No se encontraron matches para Daniel', 'yellow');
      log('💡 Ejecuta: node create-match-with-notification.js para crear matches', 'cyan');
      process.exit(0);
    }
    
    log(`\n✅ Encontrados ${matchesSnapshot.size} matches\n`, 'green');
    
    // 2. Procesar cada match
    const matches = [];
    
    for (const doc of matchesSnapshot.docs) {
      const data = doc.data();
      const otherUserId = data.userId1 === DANIEL_UID ? data.userId2 : data.userId1;
      
      // Obtener información del otro usuario
      let otherUserName = 'Usuario desconocido';
      let otherUserEmail = 'N/A';
      
      try {
        const userDoc = await db.collection('users').doc(otherUserId).get();
        if (userDoc.exists) {
          otherUserName = userDoc.data().name || otherUserName;
          otherUserEmail = userDoc.data().email || otherUserEmail;
        }
      } catch (e) {
        // Ignorar errores
      }
      
      matches.push({
        matchId: doc.id,
        otherUserId: otherUserId,
        otherUserName: otherUserName,
        otherUserEmail: otherUserEmail,
        lastMessage: data.lastMessage || '(sin mensajes)',
        lastMessageSeq: data.lastMessageSeq || 0,
        timestamp: data.timestamp?.toDate(),
        createdAt: data.createdAt?.toDate(),
        notificationSent: data.notificationSent || false,
        notificationSentAt: data.notificationSentAt?.toDate(),
        notificationSkipReason: data.notificationSkipReason,
        isTest: data.isTest || false,
      });
    }
    
    // 3. Mostrar matches
    log('📊 LISTA DE MATCHES:', 'cyan');
    log('═'.repeat(70), 'cyan');
    
    matches.forEach((match, idx) => {
      log(`\n${idx + 1}. ${match.otherUserName}`, 'bright');
      log(`   Match ID: ${match.matchId}`, 'reset');
      log(`   Usuario ID: ${match.otherUserId}`, 'reset');
      log(`   Email: ${match.otherUserEmail}`, 'reset');
      log(`   Último mensaje: "${match.lastMessage}"`, 'reset');
      log(`   Secuencia: ${match.lastMessageSeq}`, 'reset');
      log(`   Timestamp: ${match.timestamp ? match.timestamp.toLocaleString('es-CL') : 'N/A'}`, 'reset');
      
      if (match.notificationSent) {
        log(`   📲 Notificación: ✅ Enviada`, 'green');
        if (match.notificationSentAt) {
          log(`      Enviada: ${match.notificationSentAt.toLocaleString('es-CL')}`, 'reset');
        }
      } else {
        log(`   📲 Notificación: ⚠️ No enviada`, 'yellow');
        if (match.notificationSkipReason) {
          log(`      Razón: ${match.notificationSkipReason}`, 'yellow');
        }
      }
      
      if (match.isTest) {
        log(`   🧪 Match de prueba`, 'cyan');
      }
    });
    
    // 4. Estadísticas
    log('\n\n📊 ESTADÍSTICAS:', 'cyan');
    log('═'.repeat(70), 'cyan');
    
    const total = matches.length;
    const withNotifications = matches.filter(m => m.notificationSent).length;
    const withoutNotifications = total - withNotifications;
    const testMatches = matches.filter(m => m.isTest).length;
    
    log(`\n✅ Total de matches: ${total}`, 'green');
    log(`📲 Con notificación enviada: ${withNotifications}`, withNotifications > 0 ? 'green' : 'yellow');
    log(`⚠️  Sin notificación: ${withoutNotifications}`, withoutNotifications > 0 ? 'yellow' : 'green');
    log(`🧪 Matches de prueba: ${testMatches}`, 'cyan');
    
    // 5. Verificar FCM token de Daniel
    log('\n\n🔍 VERIFICACIÓN DE FCM TOKEN:', 'cyan');
    log('═'.repeat(70), 'cyan');
    
    const danielDoc = await db.collection('users').doc(DANIEL_UID).get();
    const danielData = danielDoc.data();
    const fcmToken = danielData?.fcmToken;
    
    if (fcmToken) {
      log(`\n✅ Daniel tiene FCM token registrado`, 'green');
      log(`   Token: ${fcmToken.substring(0, 40)}...`, 'reset');
      log(`\n💡 Las notificaciones pueden ser enviadas`, 'cyan');
    } else {
      log(`\n⚠️  Daniel NO tiene FCM token registrado`, 'yellow');
      log(`\n💡 Para recibir notificaciones:`, 'cyan');
      log(`   1. Abre la app en el dispositivo`, 'reset');
      log(`   2. Acepta permisos de notificaciones`, 'reset');
      log(`   3. La app debe registrar el FCM token automáticamente`, 'reset');
    }
    
    // 6. Verificar últimos matches sin notificación
    const matchesWithoutNotification = matches.filter(m => !m.notificationSent);
    
    if (matchesWithoutNotification.length > 0) {
      log('\n\n⚠️  MATCHES SIN NOTIFICACIÓN:', 'yellow');
      log('═'.repeat(70), 'cyan');
      
      matchesWithoutNotification.forEach(match => {
        log(`\n• ${match.otherUserName}`, 'bright');
        log(`  Match ID: ${match.matchId}`, 'reset');
        if (match.notificationSkipReason) {
          log(`  Razón: ${match.notificationSkipReason}`, 'yellow');
        } else {
          log(`  Razón: Cloud Function no ejecutada o en proceso`, 'yellow');
        }
      });
      
      log('\n💡 Posibles causas:', 'cyan');
      log('   - Cloud Function no ha procesado el match aún', 'reset');
      log('   - Usuario no tiene FCM token registrado', 'reset');
      log('   - Error en la Cloud Function (revisar logs)', 'reset');
    }
    
    // 7. Instrucciones para verificar en la app
    log('\n\n📱 VERIFICAR EN LA APP:', 'cyan');
    log('═'.repeat(70), 'cyan');
    
    log('\n1. Abre BlackSugar21 en el dispositivo de Daniel', 'yellow');
    log('2. Ve a la pestaña "Matches"', 'yellow');
    log(`3. Deberías ver ${total} match${total !== 1 ? 'es' : ''}`, 'yellow');
    log('4. Si no aparecen, pull to refresh para actualizar', 'yellow');
    
    if (withNotifications > 0) {
      log(`\n📲 Deberías haber recibido ${withNotifications} notificación${withNotifications !== 1 ? 'es' : ''} push`, 'green');
    }
    
    log('\n\n🔗 FIREBASE CONSOLE:', 'cyan');
    log('═'.repeat(70), 'cyan');
    
    log('\n• Firestore:', 'yellow');
    log('  https://console.firebase.google.com/project/black-sugar21/firestore/data/~2Fmatches', 'reset');
    
    log('\n• Cloud Functions Logs:', 'yellow');
    log('  https://console.firebase.google.com/project/black-sugar21/functions/logs', 'reset');
    log('  Buscar: "onMatchCreated"', 'reset');
    
    log('\n✅ VERIFICACIÓN COMPLETADA\n', 'green');
    
  } catch (error) {
    log(`\n❌ ERROR: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

verifyMatches();
