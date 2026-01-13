#!/usr/bin/env node

/**
 * 🔔 Enviar Notificación de Prueba
 * 
 * Script para probar notificaciones FCM usando Cloud Functions
 */

const admin = require('firebase-admin');
const readline = require('readline');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'blacksugar21'
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

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

async function sendTestNotification() {
  console.clear();
  log('='.repeat(70), 'bright');
  log('🔔 ENVIAR NOTIFICACIÓN DE PRUEBA', 'bright');
  log('='.repeat(70), 'bright');
  
  log('\n👥 SELECCIONAR USUARIO:\n', 'cyan');
  log('1. 👨 Daniel (dverdugo85@gmail.com)', 'reset');
  log('   🆔 UID: sU8xLiwQWNXmbYdR63p1uO6TSm72', 'reset');
  log('\n2. 👩 Rosita', 'reset');
  log('   🆔 UID: DsDSK5xqEZZXAIKxtIKyBGntw8f2', 'reset');
  
  const choice = await question('\nSelecciona usuario (1-2): ');
  
  let userId;
  let userName;
  
  switch(choice) {
    case '1':
      userId = 'sU8xLiwQWNXmbYdR63p1uO6TSm72';
      userName = 'Daniel';
      break;
    case '2':
      userId = 'DsDSK5xqEZZXAIKxtIKyBGntw8f2';
      userName = 'Rosita';
      break;
    default:
      log('\n❌ Opción inválida', 'red');
      rl.close();
      process.exit(1);
  }
  
  log(`\n✅ Usuario seleccionado: ${userName}`, 'green');
  
  // Verificar FCM token
  log(`\n🔍 Verificando FCM token...`, 'yellow');
  
  try {
    const profileDoc = await admin.firestore().collection('profiles').doc(userId).get();
    
    if (!profileDoc.exists) {
      log(`❌ Perfil no encontrado para usuario ${userId}`, 'red');
      rl.close();
      process.exit(1);
    }
    
    const profile = profileDoc.data();
    const fcmToken = profile.fcmToken;
    
    if (!fcmToken) {
      log(`⚠️  El usuario ${userName} no tiene FCM token configurado`, 'yellow');
      log(`\n💡 Para configurar el token:`, 'cyan');
      log(`   1. Abre la app en el dispositivo del usuario`, 'reset');
      log(`   2. Asegúrate de que las notificaciones estén habilitadas`, 'reset');
      log(`   3. La app debe llamar a updateFCMToken() al iniciar`, 'reset');
      rl.close();
      process.exit(1);
    }
    
    log(`✅ FCM Token encontrado: ${fcmToken.substring(0, 30)}...`, 'green');
    
    // Solicitar título y mensaje
    log(`\n📝 Personalizar notificación:\n`, 'cyan');
    const title = await question('Título (Enter para default): ');
    const body = await question('Mensaje (Enter para default): ');
    
    log(`\n🚀 Enviando notificación...`, 'yellow');
    
    // Construir mensaje FCM
    const message = {
      notification: {
        title: title || '🧪 Test Notification',
        body: body || 'This is a test notification from BlackSugar21'
      },
      data: {
        type: 'test',
        timestamp: Date.now().toString()
      },
      token: fcmToken,
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      },
      android: {
        notification: {
          sound: 'default',
          channelId: 'default',
          priority: 'high'
        }
      }
    };
    
    // Enviar notificación
    const response = await admin.messaging().send(message);
    
    log(`\n✅ Notificación enviada exitosamente!`, 'green');
    log(`📬 Message ID: ${response}`, 'cyan');
    log(`\n📱 Revisa el dispositivo de ${userName}`, 'yellow');
    
  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    
    if (error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered') {
      log(`\n💡 El token FCM es inválido o expiró`, 'yellow');
      log(`   Solución: Abre la app y vuelve a iniciar sesión`, 'cyan');
    }
    
    console.error(error);
  }
  
  rl.close();
  process.exit(0);
}

sendTestNotification();
