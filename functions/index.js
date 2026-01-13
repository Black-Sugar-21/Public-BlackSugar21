const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const {onCall} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const {logger} = require('firebase-functions/v2');

admin.initializeApp();

/**
 * Obtener textos localizados según el idioma del usuario
 */
const getLocalizedTexts = (language, type, params = {}) => {
  const translations = {
    match: {
      es: {
        title: '💘 ¡Nuevo Match!',
        body: `Tienes un match con ${params.otherUserName}`,
      },
      en: {
        title: '💘 New Match!',
        body: `You have a match with ${params.otherUserName}`,
      },
      pt: {
        title: '💘 Novo Match!',
        body: `Você tem um match com ${params.otherUserName}`,
      },
    },
    message: {
      es: {
        title: params.senderName,
        body: params.messagePreview,
      },
      en: {
        title: params.senderName,
        body: params.messagePreview,
      },
      pt: {
        title: params.senderName,
        body: params.messagePreview,
      },
    },
  };

  // Default a español si el idioma no está soportado
  const lang = ['es', 'en', 'pt'].includes(language) ? language : 'es';
  return translations[type][lang];
};

/**
 * Cloud Function: Enviar notificación cuando se crea un nuevo match
 * Trigger: Firestore onCreate en collection 'matches'
 */
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

  logger.info(`New match created: ${matchId}`, {
    userId1: match.userId1,
    userId2: match.userId2,
  });

  try {
    // Obtener tokens FCM de ambos usuarios
    const [user1Doc, user2Doc] = await Promise.all([
      admin.firestore().collection('users').doc(match.userId1).get(),
      admin.firestore().collection('users').doc(match.userId2).get(),
    ]);

    const fcmTokens = [];

    // Usuario 1
    if (user1Doc.exists && user1Doc.data().fcmToken) {
      const user1Data = user1Doc.data();
      fcmTokens.push({
        token: user1Data.fcmToken,
        userId: match.userId1,
        otherUserId: match.userId2,
        otherUserName: user2Doc.exists ? user2Doc.data().name : 'Usuario',
        language: user1Data.language || user1Data.locale || 'es',
      });
    }

    // Usuario 2
    if (user2Doc.exists && user2Doc.data().fcmToken) {
      const user2Data = user2Doc.data();
      fcmTokens.push({
        token: user2Data.fcmToken,
        userId: match.userId2,
        otherUserId: match.userId1,
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

    // Enviar notificaciones
    const notifications = fcmTokens.map(async ({token, otherUserName, language}) => {
      // Obtener textos localizados según el idioma del usuario
      const localizedText = getLocalizedTexts(language, 'match', {otherUserName});
      
      const message = {
        notification: {
          title: localizedText.title,
          body: localizedText.body,
        },
        data: {
          type: 'new_match',
          matchId: matchId,
          timestamp: Date.now().toString(),
        },
        token: token,
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
        android: {
          notification: {
            sound: 'default',
            channelId: 'matches',
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
 * Trigger: Firestore onCreate en collection 'messages'
 */
exports.onMessageCreated = onDocumentCreated(
  {
    document: 'messages/{messageId}',
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

  logger.info(`New message created: ${messageId}`, {
    matchId: message.matchId,
    senderId: message.senderId,
  });

  try {
    // Obtener información del match para determinar el receptor
    const matchDoc = await admin.firestore().collection('matches').doc(message.matchId).get();

    if (!matchDoc.exists) {
      logger.warn(`Match not found: ${message.matchId}`);
      return;
    }

    const match = matchDoc.data();
    const receiverId = match.userId1 === message.senderId ? match.userId2 : match.userId1;

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

    const senderName = senderDoc.exists ? senderDoc.data().name : 'Usuario';
    const fcmToken = receiverDoc.data().fcmToken;
    const receiverLanguage = receiverDoc.data().language || receiverDoc.data().locale || 'es';

    // Truncar mensaje si es muy largo
    const messagePreview = message.text.length > 100 ?
      `${message.text.substring(0, 100)}...` :
      message.text;

    // Obtener textos localizados según el idioma del receptor
    const localizedText = getLocalizedTexts(receiverLanguage, 'message', {
      senderName,
      messagePreview,
    });

    const notification = {
      notification: {
        title: localizedText.title,
        body: localizedText.body,
      },
      data: {
        type: 'new_message',
        matchId: message.matchId,
        messageId: messageId,
        senderId: message.senderId,
        timestamp: Date.now().toString(),
      },
      token: fcmToken,
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
      android: {
        notification: {
          sound: 'default',
          channelId: 'messages',
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
exports.sendTestNotification = onCall(async (request) => {
  const {userId, title, body} = request.data;

  if (!userId) {
    throw new Error('userId is required');
  }

  logger.info('Sending test notification', {userId, title, body});

  try {
    // Obtener FCM token del usuario
    const userDoc = await admin.firestore().collection('users').doc(userId).get();

    if (!userDoc.exists || !userDoc.data().fcmToken) {
      throw new Error(`User ${userId} has no FCM token`);
    }

    const fcmToken = userDoc.data().fcmToken;

    const message = {
      notification: {
        title: title || '🧪 Test Notification',
        body: body || 'This is a test notification from BlackSugar21',
      },
      data: {
        type: 'test',
        timestamp: Date.now().toString(),
      },
      token: fcmToken,
      apns: {
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
      android: {
        notification: {
          sound: 'default',
          channelId: 'default',
          priority: 'high',
        },
      },
    };

    const response = await admin.messaging().send(message);
    logger.info(`Test notification sent: ${response}`);

    return {
      success: true,
      messageId: response,
      token: fcmToken,
    };
  } catch (error) {
    logger.error(`Error sending test notification: ${error.message}`);
    throw new Error(`Failed to send notification: ${error.message}`);
  }
});
/**
 * Callable Function: Actualizar FCM token del usuario
 * Llamar desde la app cuando se obtiene/actualiza el token
 */
exports.updateFCMToken = onCall(async (request) => {
  const {userId, fcmToken} = request.data;

  if (!userId || !fcmToken) {
    throw new Error('userId and fcmToken are required');
  }

  logger.info('Updating FCM token', {userId});

  try {
    await admin.firestore().collection('users').doc(userId).update({
      fcmToken: fcmToken,
      fcmTokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info(`FCM token updated for user: ${userId}`);

    return {
      success: true,
      message: 'FCM token updated successfully',
    };
  } catch (error) {
    logger.error(`Error updating FCM token: ${error.message}`);
    throw new Error(`Failed to update FCM token: ${error.message}`);
  }
});
