#!/usr/bin/env node
/**
 * Test: Enviar notificaciones de reset de likes y super likes a un usuario.
 * Usage: node scripts/test-reset-notif.js [email]
 */
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

async function main() {
  const email = process.argv[2] || 'dverdugo85@gmail.com';
  console.log(`\n🔍 Buscando usuario: ${email}`);

  // 1. Get Auth user
  const user = await admin.auth().getUserByEmail(email);
  console.log(`✅ UID: ${user.uid}`);
  console.log(`   Phone: ${user.phoneNumber || 'N/A'}`);

  // 2. Get Firestore doc
  const doc = await admin.firestore().collection('users').doc(user.uid).get();
  if (!doc.exists) {
    console.error('❌ No existe documento Firestore para este usuario');
    process.exit(1);
  }

  const data = doc.data();
  console.log(`   Name: ${data.name}`);
  console.log(`   fcmToken: ${data.fcmToken ? data.fcmToken.substring(0, 40) + '...' : '❌ NO TOKEN'}`);
  console.log(`   dailyLikesRemaining: ${data.dailyLikesRemaining}`);
  console.log(`   superLikesRemaining: ${data.superLikesRemaining}`);
  console.log(`   timezoneOffset: ${data.timezoneOffset}`);
  console.log(`   deviceLanguage: ${data.deviceLanguage}`);

  if (!data.fcmToken) {
    console.error('\n❌ El usuario no tiene fcmToken — la app debe estar abierta al menos una vez');
    process.exit(1);
  }

  // 3. Send daily likes reset notification
  console.log('\n📤 Enviando notificación de reset de LIKES DIARIOS...');
  try {
    const dailyMsg = {
      data: { type: 'daily_likes_reset', timestamp: Date.now().toString() },
      token: data.fcmToken,
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            alert: {
              'title-loc-key': 'notification-daily-likes-reset-title',
              'loc-key': 'notification-daily-likes-reset-body',
              'loc-args': ['100'],
            },
          },
        },
      },
      android: {
        notification: {
          titleLocKey: 'notification_daily_likes_reset_title',
          bodyLocKey: 'notification_daily_likes_reset_body',
          bodyLocArgs: ['100'],
          sound: 'default',
          channelId: 'default',
          priority: 'high',
        },
      },
    };
    const resp1 = await admin.messaging().send(dailyMsg);
    console.log(`✅ Daily likes reset notification sent: ${resp1}`);
  } catch (e) {
    console.error(`❌ Error daily likes: ${e.message}`);
  }

  // 4. Send super likes reset notification
  console.log('\n📤 Enviando notificación de reset de SUPER LIKES...');
  try {
    const superMsg = {
      data: { type: 'super_likes_reset', timestamp: Date.now().toString() },
      token: data.fcmToken,
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            alert: {
              'title-loc-key': 'notification-super-likes-reset-title',
              'loc-key': 'notification-super-likes-reset-body',
            },
          },
        },
      },
      android: {
        notification: {
          titleLocKey: 'notification_super_likes_reset_title',
          bodyLocKey: 'notification_super_likes_reset_body',
          sound: 'default',
          channelId: 'default',
          priority: 'high',
        },
      },
    };
    const resp2 = await admin.messaging().send(superMsg);
    console.log(`✅ Super likes reset notification sent: ${resp2}`);
  } catch (e) {
    console.error(`❌ Error super likes: ${e.message}`);
  }

  console.log('\n🎉 Test completado — verifica las notificaciones en tu dispositivo');
  process.exit(0);
}

main().catch((e) => {
  console.error('Error fatal:', e.message);
  process.exit(1);
});
