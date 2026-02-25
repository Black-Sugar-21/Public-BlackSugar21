const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const {onObjectFinalized} = require('firebase-functions/v2/storage');
const {onCall} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const {logger} = require('firebase-functions/v2');
const sharp = require('sharp');
const path = require('path');
const os = require('os');
const fs = require('fs');

admin.initializeApp();

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
          notification: {
            // Android usa underscores en las keys
            titleLocKey: 'notification_new_match_title',
            bodyLocKey: 'notification_new_match_body',
            bodyLocArgs: [otherUserName],
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

    const senderName = senderDoc.exists ? senderDoc.data().name : 'Usuario';
    const fcmToken = receiverDoc.data().fcmToken;

    // ⚠️ PRIVACIDAD: No mostrar contenido del mensaje en la notificación
    // Solo avisar que hay un mensaje nuevo
    // El usuario debe abrir la app → ir a Matches → ver el mensaje

    // Usar localización nativa de FCM
    const notification = {
      data: {
        type: 'new_message',
        action: 'open_chat', // Acción específica: abrir chat
        screen: 'ChatView', // Pantalla destino
        matchId: matchId,
        chatId: matchId, // Redundancia para compatibilidad
        messageId: messageId,
        senderId: message.senderId,
        senderName: senderName, // Nombre del remitente para navegación directa
        receiverId: receiverId, // ID del receptor
        navigationPath: 'home/messages/chat', // Ruta de navegación: Home → TabBar Messages → ChatView
        timestamp: Date.now().toString(),
        // NO incluir messagePreview por privacidad
      },
      token: fcmToken,
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            alert: {
              // iOS: título localizado con nombre del remitente
              'title-loc-key': 'notification-new-message-title',
              'title-loc-args': [senderName],
              // Body: mensaje genérico localizado (sin contenido real del mensaje)
              'loc-key': 'notification-new-message-body',
            },
          },
        },
      },
      android: {
        notification: {
          // Android: título localizado con nombre del remitente  
          titleLocKey: 'notification_new_message_title',
          titleLocArgs: [senderName],
          // Body: mensaje genérico localizado (sin contenido real del mensaje)
          bodyLocKey: 'notification_new_message_body',
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

// ─────────────────────────────────────────────────────────────────────────────
// PROCESAMIENTO DE IMÁGENES — Pipeline progresivo (shimmer → thumb → full)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cloud Function: Generar thumbnail al subir imagen de perfil (safety net)
 *
 * Trigger: Firebase Storage onObjectFinalized
 * Path relevante: users/{userId}/{uuid}.jpg
 * Output:         users/{userId}/{uuid}_thumb.jpg  (400px max, JPEG 75%)
 *
 * Rol en la arquitectura:
 *   - iOS y Android ya generan _thumb.jpg en el cliente durante el upload.
 *   - Esta función actúa como safety net: si el cliente falla al subir el thumb,
 *     la Cloud Function lo regenera automáticamente en el servidor.
 *   - También procesa imágenes subidas por otros medios (admin, scripts).
 *
 * Reglas de skip:
 *   - Archivos _thumb (evita bucle infinito de triggers)
 *   - Paths fuera de users/ (stories, chat son full-size sin thumb)
 *   - No-JPEG (PNG, GIF, etc. no usan el pipeline progresivo)
 *   - Thumb ya existente (idempotente)
 */
exports.generateProfileThumbnail = onObjectFinalized(
  {
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 60,
  },
  async (event) => {
    const filePath = event.data.name;        // ej: 'users/abc123/uuid.jpg'
    const contentType = event.data.contentType;
    const bucket = admin.storage().bucket(event.data.bucket);

    // ── REGLA 1: Solo imágenes ────────────────────────────────────────────────
    if (!contentType || !contentType.startsWith('image/')) {
      logger.info(`[thumb] Skipping — not an image: ${filePath}`);
      return;
    }

    // ── REGLA 2: Solo fotos de perfil (users/) ───────────────────────────────
    // Stories van a: stories/{matchId}/ y stories/personal_stories/{userId}/
    // Esos paths NO necesitan thumbnail (se cargan full-size, son temporales 24h)
    if (!filePath.startsWith('users/')) {
      logger.info(`[thumb] Skipping — not a profile picture: ${filePath}`);
      return;
    }

    // ── REGLA 3: No procesar _thumb para evitar bucle ─────────────────────────
    const fileName = path.basename(filePath);
    if (fileName.includes('_thumb')) {
      logger.info(`[thumb] Skipping — already a thumbnail: ${filePath}`);
      return;
    }

    // ── REGLA 4: Solo JPEG (el formato que usan iOS y Android) ───────────────
    const ext = path.extname(fileName).toLowerCase();
    if (ext !== '.jpg' && ext !== '.jpeg') {
      logger.info(`[thumb] Skipping — not JPEG: ${filePath}`);
      return;
    }

    // ── Construir path del thumbnail ──────────────────────────────────────────
    const dir = path.dirname(filePath);
    const nameWithoutExt = path.basename(fileName, ext);
    const thumbFileName = `${nameWithoutExt}_thumb.jpg`;
    const thumbPath = `${dir}/${thumbFileName}`;

    // ── REGLA 5: Idempotente — saltar si thumb ya existe ─────────────────────
    const [thumbExists] = await bucket.file(thumbPath).exists();
    if (thumbExists) {
      logger.info(`[thumb] Skipping — thumbnail already exists: ${thumbPath}`);
      return;
    }

    logger.info(`[thumb] Generating: ${filePath} → ${thumbPath}`);

    const tmpOriginal = path.join(os.tmpdir(), `orig_${fileName}`);
    const tmpThumb = path.join(os.tmpdir(), `th_${thumbFileName}`);

    try {
      // Descargar imagen original a /tmp
      await bucket.file(filePath).download({destination: tmpOriginal});

      // Generar thumbnail 400px max — igual que el cliente iOS/Android
      // fit: 'inside' conserva aspect ratio sin recortar
      // withoutEnlargement: no agranda si ya es ≤ 400px
      await sharp(tmpOriginal)
        .resize(400, 400, {fit: 'inside', withoutEnlargement: true})
        .jpeg({quality: 75, progressive: true})
        .toFile(tmpThumb);

      // Subir thumbnail con metadata explicativa
      await bucket.upload(tmpThumb, {
        destination: thumbPath,
        metadata: {
          contentType: 'image/jpeg',
          metadata: {
            generatedBy: 'generateProfileThumbnail',
            originalFile: filePath,
            generatedAt: new Date().toISOString(),
          },
        },
      });

      logger.info(`[thumb] ✅ Thumbnail generado: ${thumbPath}`);
    } finally {
      // Limpiar /tmp siempre, incluso si hay error
      if (fs.existsSync(tmpOriginal)) fs.unlinkSync(tmpOriginal);
      if (fs.existsSync(tmpThumb)) fs.unlinkSync(tmpThumb);
    }
  },
);

/**
 * Callable Function: Generar thumbnails faltantes de forma retroactiva
 *
 * Útil para imágenes históricas subidas antes de implementar el pipeline
 * progresivo, o imágenes cuyo cliente falló al subir el _thumb.jpg.
 *
 * Parámetros:
 *   - userId (opcional): si se pasa, solo procesa fotos de ese usuario.
 *     Si no se pasa, procesa TODOS los usuarios (operación costosa).
 *
 * Uso desde Firebase Console o script admin:
 *   firebase functions:call generateMissingThumbnails --data '{"userId":"abc123"}'
 */
exports.generateMissingThumbnails = onCall(
  {
    region: 'us-central1',
    memory: '1GiB',
    timeoutSeconds: 540,
  },
  async (request) => {
    if (!request.auth) {
      throw new Error('Authentication required');
    }

    const {userId} = request.data || {};
    const bucket = admin.storage().bucket();
    const prefix = userId ? `users/${userId}/` : 'users/';

    logger.info(`[generateMissingThumbnails] Starting scan: prefix="${prefix}"`);

    const [files] = await bucket.getFiles({prefix});

    let processed = 0;
    let skipped = 0;
    let errors = 0;
    const errorList = [];

    for (const file of files) {
      const filePath = file.name;
      const fileName = path.basename(filePath);

      // Saltar: thumbnails existentes, no-JPEG
      const ext = path.extname(fileName).toLowerCase();
      if (fileName.includes('_thumb') || (ext !== '.jpg' && ext !== '.jpeg')) {
        skipped++;
        continue;
      }

      // Construir path del thumbnail esperado
      const dir = path.dirname(filePath);
      const nameWithoutExt = path.basename(fileName, ext);
      const thumbFileName = `${nameWithoutExt}_thumb.jpg`;
      const thumbPath = `${dir}/${thumbFileName}`;

      // Saltar si thumb ya existe
      const [thumbExists] = await bucket.file(thumbPath).exists();
      if (thumbExists) {
        skipped++;
        continue;
      }

      const tmpOriginal = path.join(os.tmpdir(), `orig_${fileName}`);
      const tmpThumb = path.join(os.tmpdir(), `th_${thumbFileName}`);

      try {
        await bucket.file(filePath).download({destination: tmpOriginal});
        await sharp(tmpOriginal)
          .resize(400, 400, {fit: 'inside', withoutEnlargement: true})
          .jpeg({quality: 75, progressive: true})
          .toFile(tmpThumb);
        await bucket.upload(tmpThumb, {
          destination: thumbPath,
          metadata: {
            contentType: 'image/jpeg',
            metadata: {generatedBy: 'generateMissingThumbnails', originalFile: filePath},
          },
        });
        processed++;
        logger.info(`[generateMissingThumbnails] ✅ ${thumbPath}`);
      } catch (e) {
        errors++;
        errorList.push({file: filePath, error: e.message});
        logger.error(`[generateMissingThumbnails] ❌ ${filePath}: ${e.message}`);
      } finally {
        if (fs.existsSync(tmpOriginal)) fs.unlinkSync(tmpOriginal);
        if (fs.existsSync(tmpThumb)) fs.unlinkSync(tmpThumb);
      }
    }

    const summary = {processed, skipped, errors, total: files.length, errorList};
    logger.info(`[generateMissingThumbnails] Done:`, summary);
    return summary;
  },
);
