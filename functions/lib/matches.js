'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

exports.onMatchCreated = onDocumentCreated(
  {
    document: 'matches/{matchId}',
    database: '(default)',
    region: 'us-central1'
  },
  async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    logger.warn('No data associated with the event');
    return;
  }

  const match = snapshot.data();
  const matchId = event.params.matchId;

  // ✅ Las apps (iOS y Android) escriben usersMatched[] y users[]
  // NO usan userId1/userId2 — compatibilidad total con ambas plataformas
  const usersMatched = match.usersMatched || match.users || [];
  const userId1 = usersMatched[0];
  const userId2 = usersMatched[1];

  logger.info(`New match created: ${matchId}`, { userId1, userId2 });

  if (!userId1 || !userId2) {
    logger.warn(`Match ${matchId} has no valid usersMatched/users array`, { match });
    return;
  }

  try {
    // Obtener tokens FCM de ambos usuarios
    const [user1Doc, user2Doc] = await Promise.all([
      admin.firestore().collection('users').doc(userId1).get(),
      admin.firestore().collection('users').doc(userId2).get(),
    ]);

    const fcmTokens = [];

    // Usuario 1
    if (user1Doc.exists && user1Doc.data().fcmToken) {
      const user1Data = user1Doc.data();
      fcmTokens.push({
        token: user1Data.fcmToken,
        userId: userId1,
        otherUserId: userId2,
        otherUserName: user2Doc.exists ? user2Doc.data().name : 'Usuario',
        language: user1Data.language || user1Data.locale || 'es',
      });
    }

    // Usuario 2
    if (user2Doc.exists && user2Doc.data().fcmToken) {
      const user2Data = user2Doc.data();
      fcmTokens.push({
        token: user2Data.fcmToken,
        userId: userId2,
        otherUserId: userId1,
        otherUserName: user1Doc.exists ? user1Doc.data().name : 'Usuario',
        language: user2Data.language || user2Data.locale || 'es',
      });
    }

    if (fcmTokens.length === 0) {
      logger.warn('No FCM tokens found for match users');
      
      // Actualizar match aunque no haya tokens (para tracking)
      await snapshot.ref.update({
        notificationSent: false,
        notificationAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
        notificationSkipReason: 'no_fcm_tokens'
      });
      
      return;
    }

    // Enviar notificaciones usando localización nativa de FCM
    const notifications = fcmTokens.map(async ({token, otherUserName, language}) => {
      const message = {
        data: {
          type: 'new_match',
          matchId: matchId,
          matchedUserName: otherUserName, // ✅ Android lo lee de data["matchedUserName"] en foreground
          timestamp: Date.now().toString(),
        },
        token: token,
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              alert: {
                // iOS usa guiones en las keys
                'title-loc-key': 'notification-new-match-title',
                'loc-key': 'notification-new-match-body',
                'loc-args': [otherUserName],
              },
            },
          },
        },
        android: {
          priority: 'high',
          notification: {
            // Android usa underscores en las keys
            titleLocKey: 'notification_new_match_title',
            bodyLocKey: 'notification_new_match_body',
            bodyLocArgs: [otherUserName],
            sound: 'default',
            channelId: 'matches_channel',
            priority: 'high',
          },
        },
      };

      try {
        const response = await admin.messaging().send(message);
        logger.info(`Notification sent successfully: ${response}`);
        return {success: true, response};
      } catch (error) {
        logger.error(`Error sending notification: ${error.message}`, {
          token,
          error: error.code,
        });
        return {success: false, error: error.message};
      }
    });

    const results = await Promise.allSettled(notifications);
    const successCount = results.filter((r) => r.status === 'fulfilled' && r.value.success).length;

    logger.info(`Match notifications sent: ${successCount}/${fcmTokens.length}`);

    // Actualizar match con flag de notificación enviada
    await snapshot.ref.update({
      notificationSent: true,
      notificationSentAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logger.error(`Error in onMatchCreated: ${error.message}`, {
      matchId,
      error: error.stack,
    });
  }
});

/**
 * Cloud Function: Enviar notificación cuando se crea un nuevo mensaje
 * Trigger: Firestore onCreate en subcollection 'messages' dentro de 'matches'
 */
exports.onMessageCreated = onDocumentCreated(
  {
    document: 'matches/{matchId}/messages/{messageId}',
    database: '(default)',
    region: 'us-central1'
  },
  async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    logger.warn('No data associated with the event');
    return;
  }

  const message = snapshot.data();
  const messageId = event.params.messageId;
  const matchId = event.params.matchId;  // 🔥 Obtenemos matchId del path

  logger.info(`New message created: ${messageId}`, {
    matchId: matchId,
    senderId: message.senderId,
  });

  try {
    
    if (!matchId) {
      logger.warn('Message has no chatId or matchId');
      return;
    }
    
    // Obtener información del match para determinar el receptor
    const matchDoc = await admin.firestore().collection('matches').doc(matchId).get();

    if (!matchDoc.exists) {
      logger.warn(`Match not found: ${matchId}`);
      return;
    }

    const match = matchDoc.data();
    // ✅ Las apps escriben usersMatched[] — NO usan userId1/userId2
    const usersMatched = match.usersMatched || match.users || [];
    const receiverId = usersMatched.find(uid => uid !== message.senderId) || null;
    if (!receiverId) {
      logger.warn(`Cannot determine receiver for message ${messageId} in match ${matchId}`);
      return;
    }

    // Obtener perfil del receptor y remitente
    const [receiverDoc, senderDoc] = await Promise.all([
      admin.firestore().collection('users').doc(receiverId).get(),
      admin.firestore().collection('users').doc(message.senderId).get(),
    ]);

    if (!receiverDoc.exists || !receiverDoc.data().fcmToken) {
      logger.warn(`Receiver has no FCM token: ${receiverId}`);
      
      // Actualizar mensaje aunque no haya token (para tracking)
      await snapshot.ref.update({
        notificationSent: false,
        notificationAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
        notificationSkipReason: 'no_fcm_token'
      });
      
      return;
    }

    // ✅ Verificar activeChat — no enviar push si el receptor ya tiene el chat abierto
    // Homologado con iOS/Android: ambos escriben activeChat = matchId al entrar al chat
    // ⚠️ STALE CHECK: Si activeChatTimestamp tiene más de 5 minutos, ignorar activeChat
    // porque la app pudo haber sido killed sin limpiar el campo
    const receiverData = receiverDoc.data();
    if (receiverData.activeChat === matchId) {
      const activeChatTs = receiverData.activeChatTimestamp;
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      const isStale = !activeChatTs || (activeChatTs.toMillis && activeChatTs.toMillis() < fiveMinutesAgo);

      if (isStale) {
        logger.warn(`Stale activeChat detected for ${receiverId} — activeChat=${matchId} but timestamp is old. Sending notification anyway.`);
        // Limpiar el activeChat stale
        await admin.firestore().collection('users').doc(receiverId).update({
          activeChat: admin.firestore.FieldValue.delete(),
          activeChatTimestamp: admin.firestore.FieldValue.delete(),
        });
      } else {
        logger.info(`Skipping notification: receiver ${receiverId} has activeChat=${matchId}`);
        await snapshot.ref.update({
          notificationSent: false,
          notificationAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
          notificationSkipReason: 'receiver_in_chat'
        });
        return;
      }
    }

    const senderName = senderDoc.exists ? senderDoc.data().name : 'Usuario';
    const fcmToken = receiverData.fcmToken;

    // ⚠️ PRIVACIDAD: No mostrar contenido del mensaje en la notificación
    // Solo avisar que hay un mensaje nuevo
    // El usuario debe abrir la app → ir a Matches → ver el mensaje

    // Usar localización nativa de FCM
    const notification = {
      data: {
        type: 'new_message',
        action: 'open_chat',
        screen: 'ChatView',
        matchId: matchId,
        chatId: matchId,
        messageId: messageId,
        senderId: message.senderId,
        senderName: senderName,
        receiverId: receiverId,
        navigationPath: 'home/messages/chat',
        timestamp: Date.now().toString(),
      },
      token: fcmToken,
      apns: {
        headers: {
          // iOS: reemplaza la notificación anterior del mismo match (no acumula)
          'apns-collapse-id': matchId,
        },
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            // thread-id: agrupa notificaciones por match en el centro de notificaciones de iOS
            'thread-id': matchId,
            alert: {
              'title-loc-key': 'notification-new-message-title',
              'title-loc-args': [senderName],
              'loc-key': 'notification-new-message-body',
            },
          },
        },
      },
      android: {
        priority: 'high',
        // collapseKey: reemplaza la notificación anterior del mismo match
        collapseKey: matchId,
        notification: {
          // tag: Android usa el tag para reemplazar notificaciones del mismo match
          tag: matchId,
          titleLocKey: 'notification_new_message_title',
          titleLocArgs: [senderName],
          bodyLocKey: 'notification_new_message_body',
          sound: 'default',
          channelId: 'default_channel',
          priority: 'high',
        },
      },
    };

    const response = await admin.messaging().send(notification);
    logger.info(`Message notification sent: ${response}`);

    // Actualizar mensaje con flag de notificación enviada
    await snapshot.ref.update({
      notificationSent: true,
      notificationSentAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logger.error(`Error in onMessageCreated: ${error.message}`, {
      messageId,
      error: error.stack,
    });
  }
});

/**
 * Callable Function: Enviar notificación de prueba
 * Para testing desde el script o app
 */
