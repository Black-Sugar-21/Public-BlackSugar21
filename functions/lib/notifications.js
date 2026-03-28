'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

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

// TODO: Notificaciones de super likes deshabilitadas por cambio de estrategia.
// Super likes ya no se usan en el UI — reemplazados por Coach IA questions.
// Descomentar cuando se reactive la feature de super likes.
/*
exports.testSuperLikesResetNotification = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 30},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {userId} = request.data || {};
    const targetId = userId || request.auth.uid;

    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(targetId).get();
    if (!userDoc.exists || !userDoc.data().fcmToken) {
      return {success: false, reason: 'no_fcm_token'};
    }

    const message = {
      data: {type: 'super_likes_reset', timestamp: Date.now().toString()},
      token: userDoc.data().fcmToken,
      apns: {payload: {aps: {sound: 'default', badge: 1,
        alert: {'title-loc-key': 'notification-super-likes-reset-title', 'loc-key': 'notification-super-likes-reset-body'}}}},
      android: {priority: 'high', notification: {
        titleLocKey: 'notification_super_likes_reset_title',
        bodyLocKey: 'notification_super_likes_reset_body',
        sound: 'default', channelId: 'super_likes_channel', priority: 'high',
      }},
    };

    const response = await admin.messaging().send(message);
    return {success: true, messageId: response};
  },
);
*/

/**
 * Callable: Probar notificación de reset de likes diarios.
 * Payload: { userId }
 * Homologado: Android NotificationTestHelper
 */
exports.testDailyLikesResetNotification = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 30},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {userId} = request.data || {};
    const targetId = userId || request.auth.uid;

    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(targetId).get();
    if (!userDoc.exists || !userDoc.data().fcmToken) {
      return {success: false, reason: 'no_fcm_token'};
    }

    const message = {
      data: {type: 'daily_likes_reset', timestamp: Date.now().toString()},
      token: userDoc.data().fcmToken,
      apns: {payload: {aps: {sound: 'default', badge: 1,
        alert: {'title-loc-key': 'notification-daily-likes-reset-title', 'loc-key': 'notification-daily-likes-reset-body', 'loc-args': ['100']}}}},
      android: {priority: 'high', notification: {
        titleLocKey: 'notification_daily_likes_reset_title',
        bodyLocKey: 'notification_daily_likes_reset_body',
        bodyLocArgs: ['100'],
        sound: 'default', channelId: 'daily_likes_channel', priority: 'high',
      }},
    };

    const response = await admin.messaging().send(message);
    return {success: true, messageId: response};
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GENERATE MISSING THUMBNAILS (función admin existente — no modificada)
// ─────────────────────────────────────────────────────────────────────────────

exports.handlePendingNotification = onDocumentCreated(
  {document: 'pendingNotifications/{notificationId}', region: 'us-central1'},
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const data = snapshot.data();

    // Skip si ya fue procesado
    if (data.processed === true) return;

    const token = data.token;
    if (!token) {
      await snapshot.ref.update({
        processed: true,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        error: 'no_token',
      });
      return;
    }

    // Si el tipo es chat_message, onMessageCreated ya envía la notificación.
    // Marcar como procesado sin re-enviar para evitar duplicados.
    const notificationType = (data.data && data.data.type) || '';
    if (notificationType === 'chat_message' || notificationType === 'new_match') {
      await snapshot.ref.update({
        processed: true,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        processedBy: 'handlePendingNotification_dedup',
        note: `Skipped: ${notificationType} handled by trigger`,
      });
      logger.info(`[handlePendingNotification] Skipped ${notificationType} (handled by trigger): ${event.params.notificationId}`);
      return;
    }

    // Para otros tipos de notificación (futuros), procesar normalmente
    try {
      const notification = data.notification || {};
      const messageData = data.data || {};

      const message = {
        token,
        data: Object.fromEntries(
          Object.entries(messageData).map(([k, v]) => [k, String(v)]),
        ),
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              alert: {
                'title-loc-key': notification.title_loc_key || '',
                'title-loc-args': notification.title_loc_args || [],
                'loc-key': notification.body_loc_key || '',
                'loc-args': notification.body_loc_args || [],
              },
            },
          },
        },
        android: {
          priority: 'high',
          notification: {
            titleLocKey: notification.title_loc_key || '',
            titleLocArgs: notification.title_loc_args || [],
            bodyLocKey: notification.body_loc_key || '',
            bodyLocArgs: notification.body_loc_args || [],
            sound: 'default',
            channelId: 'default_channel',
            priority: 'high',
          },
        },
      };

      await admin.messaging().send(message);
      await snapshot.ref.update({
        processed: true,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        processedBy: 'handlePendingNotification',
      });
      logger.info(`[handlePendingNotification] Sent: ${event.params.notificationId}`);
    } catch (error) {
      await snapshot.ref.update({
        processed: true,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        error: error.message,
        processedBy: 'handlePendingNotification',
      });
      logger.error(`[handlePendingNotification] Error: ${error.message}`);
    }
  },
);

/**
 * Callable: Enviar notificación de prueba a un usuario específico.
 * Payload: { userId?, title?, body?, data? }
 */

exports.sendTestNotificationToUser = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 30},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {userId, title, body, data: extraData} = request.data || {};
    const targetId = userId || request.auth.uid;

    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(targetId).get();
    if (!userDoc.exists || !userDoc.data().fcmToken) {
      return {success: false, reason: 'no_fcm_token'};
    }

    const message = {
      notification: {title: title || '🧪 Test', body: body || 'Test notification from BlackSugar21'},
      data: extraData || {type: 'test'},
      token: userDoc.data().fcmToken,
    };

    const response = await admin.messaging().send(message);
    return {success: true, messageId: response};
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-MODERATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Blacklist multilingüe de palabras/frases para detección rápida.
 * Cubre: spam, scam financiero, contenido sexual explícito, plataformas de pago.
 * 10 idiomas: EN, ES, PT, FR, DE, AR, JA, RU, ZH, ID/MS
 */
const MODERATION_BLACKLIST = [
  // ── Spam común ──
  'viagra', 'cialis', 'casino', 'poker', 'lottery', 'prize', 'winner',
  'click here', 'limited offer', 'act now', 'free money', 'get rich',
  'work from home', 'business opportunity', 'investment opportunity',

  // ── Scams financieros (EN) ──
  'send money', 'western union', 'moneygram', 'bitcoin wallet', 'crypto wallet',
  'bank account', 'routing number', 'social security', 'credit card number',
  'paypal me', 'cashapp', 'venmo me', 'zelle me',

  // ── Scams financieros (ES) ──
  'envía dinero', 'transferencia bancaria', 'cuenta bancaria', 'tarjeta de crédito',
  'oportunidad de negocio', 'gana dinero fácil', 'inversión segura',

  // ── Scams financieros (PT) ──
  'envie dinheiro', 'transferência bancária', 'cartão de crédito',
  'oportunidade de negócio', 'ganhe dinheiro fácil',

  // ── Plataformas de pago ──
  'onlyfans', 'only fans', 'premium snap', 'private snap',
  'venmo.me', 'cash.app', 'paypal.me', 'bizum', 'revolut.me', 'ko-fi.com',

  // ── Contenido sexual explícito (EN) ──
  'send nudes', 'dick pic', 'dick pics', 'nude pic', 'nude pics',
  'sex pics', 'naked pic', 'naked pics', 'sex video', 'sex tape', 'sextape',
  'fuck me', 'wanna fuck', 'lets fuck', 'down to fuck', 'dtf',
  'suck my', 'blow me', 'cum on', 'blow job', 'blowjob', 'hand job', 'handjob',
  'so horny', 'im horny', 'feeling horny', 'jerk off', 'jack off',
  'get naked', 'strip for',

  // ── Contenido sexual explícito (ES) ──
  'fotos desnuda', 'fotos desnudo', 'fotos íntimas', 'manda nudes', 'envía nudes',
  'tu pack', 'mi pack', 'video porno', 'sexo ahora', 'sexo ya',
  'cogerte', 'follarte', 'culearte', 'mámamela', 'chúpamela',
  'estoy caliente', 'masturbarte', 'desnúdate', 'quítate la ropa',

  // ── Contenido sexual explícito (PT) ──
  'fotos nua', 'fotos nu', 'manda nudes', 'envia nudes', 'seu pack',
  'vídeo pornô', 'sexo agora', 'sexo já', 'te foder', 'te comer',
  'boquete', 'tô com tesão', 'fica pelada', 'fica pelado', 'tira a roupa',

  // ── Contenido sexual explícito (FR) ──
  'photos nues', 'envoie nudes', 'vidéo porno', 'baise moi',
  'suce moi', 'je suis excité',

  // ── Contenido sexual explícito (DE) ──
  'nacktfotos', 'fick mich', 'blas mir', 'ich bin geil',

  // ── Contenido sexual explícito / scams (AR) ──
  'صور عارية', 'ارسلي صور', 'ابعثلي صور', 'فيديو اباحي', 'نيكني',
  'ارسل فلوس', 'حوالة بنكية', 'حساب بنكي', 'بطاقة ائتمان',
  'فرصة استثمار', 'اربح فلوس', 'كازينو', 'يانصيب',

  // ── Contenido sexual explícito / scams (JA) ──
  'ヌード送って', '裸の写真', 'エロ動画', 'セックスしよう', 'やらせて',
  '口座番号', 'クレジットカード', '振り込んで', '送金して',
  '投資チャンス', '簡単に稼げる', 'カジノ', '宝くじ',

  // ── Contenido sexual explícito / scams (RU) ──
  'пришли фото голой', 'голые фото', 'интим фото', 'порно видео', 'трахни меня',
  'отсоси', 'переведи деньги', 'банковский счёт', 'кредитная карта',
  'номер карты', 'инвестиция', 'лёгкие деньги', 'казино', 'лотерея',

  // ── Contenido sexual explícito / scams (ZH) ──
  '发裸照', '发裸体照片', '色情视频', '做爱吧', '约炮',
  '汇款', '银行账户', '信用卡号', '转账给我',
  '投资机会', '轻松赚钱', '赌场', '彩票中奖',

  // ── Contenido sexual explícito / scams (ID) ──
  'kirim foto bugil', 'foto telanjang', 'video porno', 'mau ngentot',
  'transfer uang', 'rekening bank', 'kartu kredit', 'nomor rekening',
  'peluang investasi', 'uang mudah', 'kasino', 'lotere',

  // ── Variaciones con números/símbolos ──
  's3x', 's3xo', 'f*ck', 'f**k', 'p0rn', 'pr0n', 'n00ds', 'n00des',
  'c0ger', 'f0llar', 'f0der', 'tr4nsar',
];

/** Términos de la blacklist que son explícitamente sexuales (para categorización) */
const SEXUAL_BLACKLIST_TERMS = [
  'nudes', 'nude', 'dick', 'pussy', 'sex pics', 'porn', 'xxx', 'sextape', 'onlyfans',
  'only fans', 'fotos desnuda', 'fotos íntimas', 'desnudos', 'tu pack', 'mi pack', 'video porno',
  'coger', 'follar', 'culear', 'mamar', 'chupar', 'fotos nua', 'nus', 'pornô',
  'fuck', 'suck', 'lick', 'cum', 'blow job', 'hand job', 'dtf', 'horny',
  'baise', 'suce', 'fick', 'blas', 'geil', 'foder', 'tesão',
];

// Export blacklist constants for use by moderation.js
exports.MODERATION_BLACKLIST = MODERATION_BLACKLIST;
exports.SEXUAL_BLACKLIST_TERMS = SEXUAL_BLACKLIST_TERMS;

/**
 * SHA-256 hash del mensaje normalizado (lowercase, trim) — clave de caché.
 */
