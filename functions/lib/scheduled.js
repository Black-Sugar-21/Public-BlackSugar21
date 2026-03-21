'use strict';
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

exports.resetDailyLikes = onSchedule(
  {schedule: 'every 1 hours', region: 'us-central1', memory: '512MiB', timeoutSeconds: 300},
  async () => {
    const db = admin.firestore();
    const nowUTC = new Date();
    const currentUTCHour = nowUTC.getUTCHours();

    let resetCount = 0;
    let notifCount = 0;
    let skippedFull = 0;
    let lastDoc = null;
    const BATCH_LIMIT = 450;
    const tokensToNotify = [];

    while (resetCount < BATCH_LIMIT) {
      let query = db.collection('users')
        .where('accountStatus', '==', 'active')
        .limit(500);

      if (lastDoc) query = query.startAfter(lastDoc);
      const usersSnap = await query.get();
      if (usersSnap.empty) break;

      lastDoc = usersSnap.docs[usersSnap.docs.length - 1];
      const batch = db.batch();
      let batchCount = 0;

      for (const doc of usersSnap.docs) {
        const data = doc.data();

        // Calcular medianoche local del usuario
        const userOffset = typeof data.timezoneOffset === 'number' ? data.timezoneOffset : 0;
        // La hora local del usuario es: currentUTCHour + userOffset
        // Verificar si la hora actual UTC corresponde a medianoche (0:00) en la zona del usuario
        // Es decir: (currentUTCHour + userOffset) mod 24 === 0
        let userLocalHour = (currentUTCHour + userOffset) % 24;
        if (userLocalHour < 0) userLocalHour += 24;
        if (userLocalHour !== 0) continue; // No es medianoche para este usuario

        const lastReset = data.lastLikeResetDate;
        let needsReset = !lastReset;

        if (lastReset) {
          const lastResetDate = lastReset.toDate ? lastReset.toDate() : new Date(lastReset);
          // Calcular inicio del día actual en la zona del usuario
          const userNow = new Date(nowUTC.getTime() + userOffset * 3600000);
          const userTodayStart = new Date(userNow);
          userTodayStart.setUTCHours(0, 0, 0, 0);
          needsReset = lastResetDate < userTodayStart;
        }

        if (needsReset) {
          const newLimit = 100;
          batch.update(doc.ref, {
            dailyLikesRemaining: newLimit,
            dailyLikesLimit: newLimit,
            lastLikeResetDate: admin.firestore.Timestamp.now(),
          });
          batchCount++;
          resetCount++;

          // Solo notificar si el usuario realmente usó likes (remaining < 100)
          const remaining = typeof data.dailyLikesRemaining === 'number' ? data.dailyLikesRemaining : 0;
          if (remaining < 100 && data.fcmToken && !data.paused) {
            tokensToNotify.push(data.fcmToken);
          } else if (remaining >= 100) {
            skippedFull++;
          }

          if (resetCount >= BATCH_LIMIT) break;
        }
      }

      if (batchCount > 0) await batch.commit();
      if (usersSnap.docs.length < 500) break;
    }

    // Enviar notificaciones push en batches de 500 (límite FCM)
    for (let i = 0; i < tokensToNotify.length; i += 500) {
      const tokenBatch = tokensToNotify.slice(i, i + 500);
      try {
        const response = await admin.messaging().sendEachForMulticast({
          tokens: tokenBatch,
          data: {type: 'daily_likes_reset', timestamp: Date.now().toString()},
          apns: {payload: {aps: {sound: 'default', badge: 1,
            alert: {'title-loc-key': 'notification-daily-likes-reset-title', 'loc-key': 'notification-daily-likes-reset-body', 'loc-args': ['100']}}}},
          android: {priority: 'high', notification: {
            titleLocKey: 'notification_daily_likes_reset_title',
            bodyLocKey: 'notification_daily_likes_reset_body',
            bodyLocArgs: ['100'],
            sound: 'default', channelId: 'daily_likes_channel', priority: 'high',
          }},
        });
        notifCount += response.successCount;
      } catch (err) {
        logger.error(`[resetDailyLikes] Notification batch error:`, err);
      }
    }

    logger.info(`[resetDailyLikes] UTC hour=${currentUTCHour}, reset=${resetCount}, notified=${notifCount}, skippedFull=${skippedFull}`);
  },
);

/**
 * Scheduled: Reset de super likes diarios.
 * Corre cada hora. Resetea solo usuarios cuya medianoche local ya pasó (usa timezoneOffset).
 * Siempre restaura a 5 super likes.
 * Solo notifica si el usuario usó super likes (superLikesRemaining < 5).
 */
exports.resetSuperLikes = onSchedule(
  {schedule: 'every 1 hours', region: 'us-central1', memory: '512MiB', timeoutSeconds: 300},
  async () => {
    const db = admin.firestore();
    const nowUTC = new Date();
    const currentUTCHour = nowUTC.getUTCHours();

    let resetCount = 0;
    let notifCount = 0;
    let skippedFull = 0;
    let lastDoc = null;
    const BATCH_LIMIT = 450;
    const tokensToNotify = [];

    while (resetCount < BATCH_LIMIT) {
      let query = db.collection('users')
        .where('accountStatus', '==', 'active')
        .limit(500);

      if (lastDoc) query = query.startAfter(lastDoc);
      const usersSnap = await query.get();
      if (usersSnap.empty) break;

      lastDoc = usersSnap.docs[usersSnap.docs.length - 1];
      const batch = db.batch();
      let batchCount = 0;

      for (const doc of usersSnap.docs) {
        const data = doc.data();

        // Calcular medianoche local del usuario
        const userOffset = typeof data.timezoneOffset === 'number' ? data.timezoneOffset : 0;
        let userLocalHour = (currentUTCHour + userOffset) % 24;
        if (userLocalHour < 0) userLocalHour += 24;
        if (userLocalHour !== 0) continue; // No es medianoche para este usuario

        const lastReset = data.lastSuperLikeResetDate;
        let needsReset = !lastReset;

        if (lastReset) {
          const lastResetDate = lastReset.toDate ? lastReset.toDate() : new Date(lastReset);
          const userNow = new Date(nowUTC.getTime() + userOffset * 3600000);
          const userTodayStart = new Date(userNow);
          userTodayStart.setUTCHours(0, 0, 0, 0);
          needsReset = lastResetDate < userTodayStart;
        }

        if (needsReset) {
          batch.update(doc.ref, {
            superLikesRemaining: 5,
            superLikesUsedToday: 0,
            lastSuperLikeResetDate: admin.firestore.Timestamp.now(),
          });
          batchCount++;
          resetCount++;

          // Solo notificar si el usuario realmente usó super likes (remaining < 5)
          const remaining = typeof data.superLikesRemaining === 'number' ? data.superLikesRemaining : 0;
          if (remaining < 5 && data.fcmToken && !data.paused) {
            tokensToNotify.push(data.fcmToken);
          } else if (remaining >= 5) {
            skippedFull++;
          }

          if (resetCount >= BATCH_LIMIT) break;
        }
      }

      if (batchCount > 0) await batch.commit();
      if (usersSnap.docs.length < 500) break;
    }

    // Enviar notificaciones push en batches de 500 (límite FCM)
    for (let i = 0; i < tokensToNotify.length; i += 500) {
      const tokenBatch = tokensToNotify.slice(i, i + 500);
      try {
        const response = await admin.messaging().sendEachForMulticast({
          tokens: tokenBatch,
          data: {type: 'super_likes_reset', timestamp: Date.now().toString()},
          apns: {payload: {aps: {sound: 'default', badge: 1,
            alert: {'title-loc-key': 'notification-super-likes-reset-title', 'loc-key': 'notification-super-likes-reset-body'}}}},
          android: {priority: 'high', notification: {
            titleLocKey: 'notification_super_likes_reset_title',
            bodyLocKey: 'notification_super_likes_reset_body',
            sound: 'default', channelId: 'super_likes_channel', priority: 'high',
          }},
        });
        notifCount += response.successCount;
      } catch (err) {
        logger.error(`[resetSuperLikes] Notification batch error:`, err);
      }
    }

    logger.info(`[resetSuperLikes] UTC hour=${currentUTCHour}, reset=${resetCount}, notified=${notifCount}, skippedFull=${skippedFull}`);
  },
);

/**
 * Read coach_config from Remote Config (server-side JSON).
 * Lightweight version for scheduled functions — reads only dailyCredits.
 */
async function getCoachConfig() {
  try {
    const rc = admin.remoteConfig();
    const template = await rc.getServerTemplate();
    const serverConfig = template.evaluate();
    const rawValue = serverConfig.getString('coach_config');
    if (rawValue) return JSON.parse(rawValue);
  } catch (e) {
    logger.warn(`[getCoachConfig] Failed to read Remote Config: ${e.message}`);
  }
  return {dailyCredits: 5};
}

/**
 * Scheduled: Reset de mensajes del AI Date Coach diarios.
 * Corre cada hora. Resetea solo usuarios cuya medianoche local ya pasó (usa timezoneOffset).
 * Siempre restaura a 20 mensajes.
 * Solo notifica si el usuario usó mensajes (coachMessagesRemaining < 5).
 */
exports.resetCoachMessages = onSchedule(
  {schedule: 'every 1 hours', region: 'us-central1', memory: '512MiB', timeoutSeconds: 300},
  async () => {
    const db = admin.firestore();
    const nowUTC = new Date();
    const currentUTCHour = nowUTC.getUTCHours();

    let resetCount = 0;
    let notifCount = 0;
    let skippedFull = 0;
    let lastDoc = null;
    const BATCH_LIMIT = 450;
    const tokensToNotify = [];

    // Read daily credits from coach_config (Remote Config) — same source of truth as client-side coach_daily_credits
    let DAILY_COACH_MESSAGES = 5;
    try {
      const config = await getCoachConfig();
      DAILY_COACH_MESSAGES = typeof config.dailyCredits === 'number' && config.dailyCredits >= 1 && config.dailyCredits <= 100
        ? config.dailyCredits : 5;
    } catch (e) {
      logger.warn('[resetCoachMessages] Failed to read coach_config, using default 5');
    }

    while (resetCount < BATCH_LIMIT) {
      let query = db.collection('users')
        .where('accountStatus', '==', 'active')
        .limit(500);

      if (lastDoc) query = query.startAfter(lastDoc);
      const usersSnap = await query.get();
      if (usersSnap.empty) break;

      lastDoc = usersSnap.docs[usersSnap.docs.length - 1];
      const batch = db.batch();
      let batchCount = 0;

      for (const doc of usersSnap.docs) {
        const data = doc.data();

        // Calcular medianoche local del usuario
        const userOffset = typeof data.timezoneOffset === 'number' ? data.timezoneOffset : 0;
        let userLocalHour = (currentUTCHour + userOffset) % 24;
        if (userLocalHour < 0) userLocalHour += 24;
        if (userLocalHour !== 0) continue; // No es medianoche para este usuario

        const lastReset = data.lastCoachResetDate;
        let needsReset = !lastReset;

        if (lastReset) {
          const lastResetDate = lastReset.toDate ? lastReset.toDate() : new Date(lastReset);
          const userNow = new Date(nowUTC.getTime() + userOffset * 3600000);
          const userTodayStart = new Date(userNow);
          userTodayStart.setUTCHours(0, 0, 0, 0);
          needsReset = lastResetDate < userTodayStart;
        }

        if (needsReset) {
          batch.update(doc.ref, {
            coachMessagesRemaining: DAILY_COACH_MESSAGES,
            lastCoachResetDate: admin.firestore.Timestamp.now(),
          });
          batchCount++;
          resetCount++;

          // Solo notificar si el usuario realmente usó mensajes del coach (remaining < 5)
          const remaining = typeof data.coachMessagesRemaining === 'number' ? data.coachMessagesRemaining : DAILY_COACH_MESSAGES;
          if (remaining < DAILY_COACH_MESSAGES && data.fcmToken && !data.paused) {
            tokensToNotify.push(data.fcmToken);
          } else if (remaining >= DAILY_COACH_MESSAGES) {
            skippedFull++;
          }

          if (resetCount >= BATCH_LIMIT) break;
        }
      }

      if (batchCount > 0) await batch.commit();
      if (usersSnap.docs.length < 500) break;
    }

    // Enviar notificaciones push en batches de 500 (límite FCM)
    for (let i = 0; i < tokensToNotify.length; i += 500) {
      const tokenBatch = tokensToNotify.slice(i, i + 500);
      try {
        const response = await admin.messaging().sendEachForMulticast({
          tokens: tokenBatch,
          data: {type: 'coach_messages_reset', timestamp: Date.now().toString()},
          apns: {payload: {aps: {sound: 'default', badge: 1,
            alert: {'title-loc-key': 'notification-coach-reset-title', 'loc-key': 'notification-coach-reset-body'}}}},
          android: {priority: 'high', notification: {
            titleLocKey: 'notification_coach_reset_title',
            bodyLocKey: 'notification_coach_reset_body',
            sound: 'default', channelId: 'coach_channel', priority: 'high',
          }},
        });
        notifCount += response.successCount;
      } catch (err) {
        logger.error(`[resetCoachMessages] Notification batch error:`, err);
      }
    }

    logger.info(`[resetCoachMessages] UTC hour=${currentUTCHour}, reset=${resetCount}, notified=${notifCount}, skippedFull=${skippedFull}`);
  },
);

/**
 * Scheduled: Verificar likes mutuos y crear matches automáticamente.
 * Safety net — normalmente los clientes detectan matches con hasUserLikedBack() + 100ms delay.
 * Corre cada 30 min para cubrir edge cases de timing.
 */
exports.checkMutualLikesAndCreateMatch = onSchedule(
  {schedule: 'every 30 minutes', region: 'us-central1', memory: '512MiB', timeoutSeconds: 300},
  async () => {
    const db = admin.firestore();
    const usersSnap = await db.collection('users')
      .where('accountStatus', '==', 'active')
      .where('paused', '==', false)
      .limit(200)
      .get();

    let matchesCreated = 0;

    const REVIEWER_UID = 'g4Zbr8tEguMcpZonw72xM5MGse32';
    for (const userDoc of usersSnap.docs) {
      const userData = userDoc.data();
      // ✅ Skip test/reviewer profiles — no deben generar matches con usuarios reales
      if ((userData.isTest === true || userData.isReviewer === true) && userDoc.id !== REVIEWER_UID) continue;
      const liked = userData.liked || [];

      for (const likedUserId of liked) {
        const otherDoc = await db.collection('users').doc(likedUserId).get();
        if (!otherDoc.exists) continue;
        const otherData = otherDoc.data();
        if (otherData.accountStatus !== 'active' || otherData.paused === true) continue;
        // ✅ Skip si el otro usuario es test/reviewer y el actual no es reviewer
        if ((otherData.isTest === true || otherData.isReviewer === true) && userDoc.id !== REVIEWER_UID) continue;
        const otherLiked = otherData.liked || [];

        if (!otherLiked.includes(userDoc.id)) continue;

        // Verificar que no exista ya un match
        const existingMatch = await db.collection('matches')
          .where('usersMatched', 'array-contains', userDoc.id)
          .get();

        const alreadyMatched = existingMatch.docs.some((d) => {
          const users = d.data().usersMatched || d.data().users || [];
          return users.includes(likedUserId);
        });

        if (alreadyMatched) continue;

        // Crear match — estructura homologada con iOS/Android createMatch()
        await db.collection('matches').add({
          users: [userDoc.id, likedUserId],
          usersMatched: [userDoc.id, likedUserId],
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(),
          messageCount: 0,
          lastSeenTimestamps: {},
          userTypesAtMatch: {
            [userDoc.id]: userData.userType || 'SUGAR_BABY',
            [likedUserId]: otherData.userType || 'SUGAR_BABY',
          },
        });
        matchesCreated++;
      }
    }

    logger.info(`[checkMutualLikesAndCreateMatch] Created ${matchesCreated} matches`);
  },
);

// Alias — nombre legacy usado en algunas configuraciones
exports.scheduledCheckMutualLikes = exports.checkMutualLikesAndCreateMatch;

exports.processScheduledDeletions = onSchedule(
  {schedule: 'every 24 hours', region: 'us-central1', memory: '512MiB', timeoutSeconds: 300},
  async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    const usersSnap = await db.collection('users')
      .where('scheduledForDeletion', '==', true)
      .get();

    let deletedCount = 0;

    for (const doc of usersSnap.docs) {
      const data = doc.data();
      // Android escribe deletionDate + scheduledDeletionDate, iOS solo deletionDate
      const deletionDate = data.deletionDate || data.scheduledDeletionDate || data.deletionScheduledAt;
      if (!deletionDate) continue;

      const deleteAt = deletionDate.toDate ? deletionDate.toDate() : new Date(deletionDate);
      if (deleteAt > now.toDate()) continue;

      try {
        // 1. Borrar subcollecciones del usuario
        const subcollections = ['swipes', 'liked', 'passed', 'superLiked', 'compatibility_scores'];
        for (const sub of subcollections) {
          const subSnap = await doc.ref.collection(sub).limit(500).get();
          if (!subSnap.empty) {
            const batch = db.batch();
            subSnap.docs.forEach((d) => batch.delete(d.ref));
            await batch.commit();
          }
        }

        // 2. Borrar del array liked/passed de otros usuarios (opcional, no crítico)

        // 3. Borrar matches y sus mensajes
        const matchesSnap = await db.collection('matches')
          .where('usersMatched', 'array-contains', doc.id)
          .get();

        for (const matchDoc of matchesSnap.docs) {
          const msgs = await matchDoc.ref.collection('messages').limit(500).get();
          if (!msgs.empty) {
            const batch = db.batch();
            msgs.docs.forEach((m) => batch.delete(m.ref));
            await batch.commit();
          }
          await matchDoc.ref.delete();
        }

        // 4. Borrar fotos de Storage
        try {
          const bucket = admin.storage().bucket();
          const [files] = await bucket.getFiles({prefix: `users/${doc.id}/`});
          await Promise.all(files.map((f) => f.delete().catch(() => {})));
        } catch (storageErr) {
          logger.warn(`[processScheduledDeletions] Storage cleanup failed for ${doc.id}: ${storageErr.message}`);
        }

        // 5. Borrar documento principal
        await doc.ref.delete();

        // 6. Borrar de Firebase Auth
        await admin.auth().deleteUser(doc.id).catch(() => {});

        deletedCount++;
        logger.info(`[processScheduledDeletions] Deleted user ${doc.id}`);
      } catch (e) {
        logger.error(`[processScheduledDeletions] Error deleting ${doc.id}: ${e.message}`);
      }
    }

    logger.info(`[processScheduledDeletions] Processed ${deletedCount} deletions`);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// TRIGGER FUNCTIONS — Notificaciones pendientes, auto-moderación, geohash
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Trigger: Procesar notificaciones pendientes al crearse en pendingNotifications.
 * Las apps (iOS/Android) escriben aquí cuando el receptor NO tiene el chat abierto.
 * Complementa a onMessageCreated (que también envía notificaciones).
 * Para evitar duplicados: verifica si ya fue procesado.
 */
