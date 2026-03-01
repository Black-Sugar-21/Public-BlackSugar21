#!/usr/bin/env node
const admin = require('firebase-admin');
const sa = require('./serviceAccountKey.json');

if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}
const db = admin.firestore();

(async () => {
  const userDoc = await db.collection('users').doc('C3QgIAGvMvRLPrnBtfHqYRsrV7p2').get();
  if (!userDoc.exists) { console.log('User not found'); process.exit(1); }
  const data = userDoc.data();
  const token = data.fcmToken;
  console.log('Rosita:', data.name);
  console.log('FCM token:', token ? token.substring(0, 40) + '...' : 'NO TOKEN');
  if (!token) { process.exit(1); }

  const msg = {
    data: {
      type: 'new_message',
      action: 'open_chat',
      screen: 'ChatView',
      matchId: 'test-notif-' + Date.now(),
      senderId: 'test-sender-daniel',
      senderName: 'Daniel',
      receiverId: 'DsDSK5xqEZZXAIKxtIKyBGntw8f2',
      navigationPath: 'home/messages/chat',
      timestamp: Date.now().toString(),
    },
    token: token,
    android: {
      priority: 'high',
      notification: {
        titleLocKey: 'notification_new_message_title',
        titleLocArgs: ['Daniel'],
        bodyLocKey: 'notification_new_message_body',
        sound: 'default',
        channelId: 'default_channel',
        priority: 'high',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
          alert: {
            'title-loc-key': 'notification-new-message-title',
            'title-loc-args': ['Daniel'],
            'loc-key': 'notification-new-message-body',
          },
        },
      },
    },
  };

  try {
    const response = await admin.messaging().send(msg);
    console.log('Notification sent:', response);
  } catch (err) {
    console.log('Error:', err.message);
  }
  process.exit(0);
})();
