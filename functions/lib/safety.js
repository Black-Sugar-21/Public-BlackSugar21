'use strict';
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {logger} = require('firebase-functions/v2');
const admin = require('firebase-admin');
const {getLocalizedError} = require('./shared');

const db = admin.firestore();

// ---------------------------------------------------------------------------
// 1. scheduleDateCheckIn — callable
// ---------------------------------------------------------------------------
/**
 * CF: Schedules a date safety check-in that will send an alert if the user doesn't respond.
 * @param {Object} request.data - {matchId: string, scheduledTime: string, emergencyContactPhone?: string, userLanguage?: string}
 * @returns {Promise<{success: boolean, checkInId?: string}>}
 * @throws {HttpsError} unauthenticated
 */
exports.scheduleDateCheckIn = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 30},
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', getLocalizedError('auth_required', (request.data?.userLanguage || 'en').split('-')[0].toLowerCase()));
    const {matchId, scheduledTime, emergencyContactPhone} = request.data || {};

    if (!matchId || !scheduledTime) return {success: false, error: 'missing_params'};

    const scheduled = new Date(scheduledTime);
    if (scheduled <= new Date()) return {success: false, error: 'time_must_be_future'};

    // Prevent duplicate active check-ins for same match
    const existing = await db.collection('dateCheckIns')
      .where('userId', '==', request.auth.uid)
      .where('matchId', '==', matchId)
      .where('status', 'in', ['scheduled', 'check_in_sent'])
      .limit(1).get();
    if (!existing.empty) return {success: false, error: 'already_active'};

    // Get user's FCM token
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    const fcmToken = userDoc.data()?.fcmToken || '';
    const userName = userDoc.data()?.name || '';

    const docRef = await db.collection('dateCheckIns').add({
      userId: request.auth.uid,
      userName,
      matchId,
      scheduledTime: admin.firestore.Timestamp.fromDate(scheduled),
      emergencyContactPhone: emergencyContactPhone || null,
      status: 'scheduled',
      fcmToken,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {success: true, checkInId: docRef.id};
  }
);

// ---------------------------------------------------------------------------
// 2. cancelDateCheckIn — callable
// ---------------------------------------------------------------------------
/**
 * CF: Cancels an active date safety check-in. Only the owner can cancel.
 * @param {Object} request.data - {checkInId: string, userLanguage?: string}
 * @returns {Promise<{success: boolean}>}
 * @throws {HttpsError} unauthenticated
 */
exports.cancelDateCheckIn = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 30},
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', getLocalizedError('auth_required', (request.data?.userLanguage || 'en').split('-')[0].toLowerCase()));
    const {checkInId} = request.data || {};
    if (!checkInId) return {success: false, error: 'missing_id'};

    const docRef = db.collection('dateCheckIns').doc(checkInId);
    const doc = await docRef.get();
    if (!doc.exists) return {success: false, error: 'not_found'};
    if (doc.data().userId !== request.auth.uid) return {success: false, error: 'unauthorized'};
    if (!['scheduled', 'check_in_sent'].includes(doc.data().status)) return {success: false, error: 'cannot_cancel'};

    await docRef.update({
      status: 'cancelled',
      lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return {success: true};
  }
);

// ---------------------------------------------------------------------------
// 3. respondToDateCheckIn — callable
// ---------------------------------------------------------------------------
/**
 * CF: Records the user's response ('ok' or 'sos') to a date safety check-in alert.
 * @param {Object} request.data - {checkInId: string, response: 'ok'|'sos', userLanguage?: string}
 * @returns {Promise<{success: boolean}>}
 * @throws {HttpsError} unauthenticated
 */
exports.respondToDateCheckIn = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 30},
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', getLocalizedError('auth_required', (request.data?.userLanguage || 'en').split('-')[0].toLowerCase()));
    const {checkInId, response} = request.data || {};
    if (!checkInId || !['ok', 'sos'].includes(response)) return {success: false, error: 'invalid_params'};

    const docRef = db.collection('dateCheckIns').doc(checkInId);
    const doc = await docRef.get();
    if (!doc.exists) return {success: false, error: 'not_found'};
    if (doc.data().userId !== request.auth.uid) return {success: false, error: 'unauthorized'};
    if (!['check_in_sent', 'follow_up_sent'].includes(doc.data().status)) {
      return {success: false, error: 'invalid_status'};
    }

    const now = admin.firestore.Timestamp.now();

    if (response === 'ok') {
      // Schedule follow-up (configurable, default 2 hours)
      const safetyConfig = await db.collection('appConfig').doc('safetyCheckIn').get();
      const followUpMinutes = (safetyConfig.exists ? safetyConfig.data().followUpDelayMinutes : null) || 120;
      const followUp = new Date(Date.now() + followUpMinutes * 60 * 1000);
      await docRef.update({
        status: 'ok_responded',
        responseAt: now,
        followUpScheduledAt: admin.firestore.Timestamp.fromDate(followUp),
        lastUpdatedAt: now,
      });
      return {success: true, message: 'ok_recorded'};
    }

    if (response === 'sos') {
      await docRef.update({
        status: 'sos_responded',
        responseAt: now,
        lastUpdatedAt: now,
      });

      // Trigger emergency alert
      const data = doc.data();
      if (data.emergencyContactPhone) {
        // Store in pendingNotifications for SMS processing
        await db.collection('pendingEmergencyAlerts').add({
          phone: data.emergencyContactPhone,
          userName: data.userName || 'User',
          type: 'sos_alert',
          createdAt: now,
          processed: false,
        });
      }

      // Also send a push notification to the user with emergency resources
      if (data.fcmToken) {
        try {
          // Lookup user's language for localized safety message
          let lang = 'en';
          try {
            const userDoc = await db.collection('users').doc(request.auth.uid).get();
            if (userDoc.exists) {
              lang = ((userDoc.data().deviceLanguage || 'en').split('-')[0].split('_')[0] || 'en').toLowerCase();
            }
          } catch (e) {
            logger.warn(`[calculateSafetyScore] Could not read user lang for ${request.auth.uid.substring(0,8)}, defaulting to 'en': ${e.message}`);
          }

          const EMERGENCY_TITLE = {
            en: 'Emergency resources',
            es: 'Recursos de emergencia',
            pt: 'Recursos de emergência',
            fr: 'Ressources d\'urgence',
            de: 'Notfall-Ressourcen',
            ja: '緊急リソース',
            zh: '紧急资源',
            ru: 'Экстренные ресурсы',
            ar: 'موارد الطوارئ',
            id: 'Sumber daya darurat',
          };
          const EMERGENCY_BODY = {
            en: 'Call your local emergency number if you need immediate help.',
            es: 'Llama a tu número de emergencia local si necesitas ayuda inmediata.',
            pt: 'Ligue para o seu número de emergência local se precisar de ajuda imediata.',
            fr: 'Appelle ton numéro d\'urgence local si tu as besoin d\'aide immédiate.',
            de: 'Ruf deine örtliche Notrufnummer an, wenn du sofort Hilfe brauchst.',
            ja: '今すぐ助けが必要な場合は、地域の緊急番号に電話してください。',
            zh: '如果你需要立即帮助，请拨打当地紧急电话。',
            ru: 'Позвони по местному номеру экстренной помощи, если нужна срочная помощь.',
            ar: 'اتصل برقم الطوارئ المحلي إذا كنت بحاجة إلى مساعدة فورية.',
            id: 'Hubungi nomor darurat setempat jika kamu butuh bantuan segera.',
          };

          await admin.messaging().send({
            token: data.fcmToken,
            notification: {
              title: EMERGENCY_TITLE[lang] || EMERGENCY_TITLE.en,
              body: EMERGENCY_BODY[lang] || EMERGENCY_BODY.en,
            },
            data: {type: 'safety_emergency', checkInId},
            android: {priority: 'high', notification: {channelId: 'safety_checkin_channel'}},
            apns: {payload: {aps: {sound: 'default', 'content-available': 1}}},
          });
        } catch (e) {
          logger.warn(`[respondToDateCheckIn] FCM send error: ${e.message}`);
        }
      }

      return {success: true, message: 'sos_recorded'};
    }
  }
);

// ---------------------------------------------------------------------------
// 4. processDateCheckIns — scheduled every 5 minutes
// ---------------------------------------------------------------------------
exports.processDateCheckIns = onSchedule(
  {schedule: 'every 30 minutes', region: 'us-central1', memory: '512MiB', timeoutSeconds: 120},
  async () => {
    const now = admin.firestore.Timestamp.now();
    const nowMs = Date.now();

    const configDoc = await db.collection('appConfig').doc('safetyCheckIn').get();
    const config = configDoc.exists ? configDoc.data() : {};
    const REMINDER_DELAY_MS = (config.reminderDelayMinutes || 15) * 60 * 1000;
    const EMERGENCY_DELAY_MS = (config.emergencyDelayMinutes || 30) * 60 * 1000;
    const BATCH_LIMIT = config.batchLimit || 50;

    // Pass 1: Send initial check-in notifications
    const scheduled = await db.collection('dateCheckIns')
      .where('status', '==', 'scheduled')
      .where('scheduledTime', '<=', now)
      .limit(BATCH_LIMIT).get();

    for (const doc of scheduled.docs) {
      const data = doc.data();
      if (!data.fcmToken) continue;
      const MAX_FCM_RETRIES = config.maxFcmRetryCount || 3;
      if ((data.fcmRetryCount || 0) >= MAX_FCM_RETRIES) {
        await doc.ref.update({status: 'failed', lastUpdatedAt: now});
        continue;
      }
      try {
        await admin.messaging().send({
          token: data.fcmToken,
          data: {type: 'safety_checkin', checkInId: doc.id, action: 'check_in'},
          android: {
            priority: 'high',
            notification: {
              channelId: 'safety_checkin_channel',
              titleLocKey: 'notification_safety_checkin_title',
              bodyLocKey: 'notification_safety_checkin_body',
            },
          },
          apns: {
            payload: {
              aps: {
                alert: {
                  'title-loc-key': 'notification_safety_checkin_title',
                  'loc-key': 'notification_safety_checkin_body',
                },
                sound: 'default',
                category: 'SAFETY_CHECKIN_CATEGORY',
              },
            },
          },
        });
        await doc.ref.update({status: 'check_in_sent', checkInSentAt: now, lastUpdatedAt: now});
      } catch (e) {
        logger.warn(`[processDateCheckIns] FCM error for ${doc.id}: ${e.message}`);
        await doc.ref.update({fcmRetryCount: admin.firestore.FieldValue.increment(1), lastFcmError: e.message});
      }
    }

    // Pass 2: Send reminder (configurable delay, default 15 min no response)
    // Note: Firestore can't query where field doesn't exist, so we filter in code
    const reminderCutoff = admin.firestore.Timestamp.fromMillis(nowMs - REMINDER_DELAY_MS);
    const needsReminder = await db.collection('dateCheckIns')
      .where('status', '==', 'check_in_sent')
      .where('checkInSentAt', '<=', reminderCutoff)
      .limit(BATCH_LIMIT).get();

    let reminderCount = 0;
    for (const doc of needsReminder.docs) {
      const data = doc.data();
      if (data.reminderSentAt) continue; // already reminded
      if (!data.fcmToken) continue;
      try {
        await admin.messaging().send({
          token: data.fcmToken,
          data: {type: 'safety_checkin', checkInId: doc.id, action: 'reminder'},
          android: {
            priority: 'high',
            notification: {
              channelId: 'safety_checkin_channel',
              titleLocKey: 'notification_safety_reminder_title',
              bodyLocKey: 'notification_safety_reminder_body',
            },
          },
          apns: {
            payload: {
              aps: {
                alert: {
                  'title-loc-key': 'notification_safety_reminder_title',
                  'loc-key': 'notification_safety_reminder_body',
                },
                sound: 'default',
                category: 'SAFETY_CHECKIN_CATEGORY',
              },
            },
          },
        });
        await doc.ref.update({reminderSentAt: now, lastUpdatedAt: now});
        reminderCount++;
      } catch (e) {
        logger.warn(`[processDateCheckIns] Reminder FCM error for ${doc.id}: ${e.message}`);
      }
    }

    // Pass 3: Emergency alert (configurable delay, default 30 min no response after check-in sent)
    const emergencyCutoff = admin.firestore.Timestamp.fromMillis(nowMs - EMERGENCY_DELAY_MS);
    const needsEmergency = await db.collection('dateCheckIns')
      .where('status', '==', 'check_in_sent')
      .where('checkInSentAt', '<=', emergencyCutoff)
      .limit(BATCH_LIMIT).get();

    let emergencyCount = 0;
    for (const doc of needsEmergency.docs) {
      const data = doc.data();
      if (data.emergencyAlertedAt) continue; // Already alerted
      if (!data.reminderSentAt) continue; // must have received reminder first

      // Alert emergency contact if available
      if (data.emergencyContactPhone) {
        await db.collection('pendingEmergencyAlerts').add({
          phone: data.emergencyContactPhone,
          userName: data.userName || 'User',
          type: 'no_response_alert',
          checkInId: doc.id,
          createdAt: now,
          processed: false,
        });
      }

      // Send urgent push to user
      if (data.fcmToken) {
        try {
          await admin.messaging().send({
            token: data.fcmToken,
            data: {type: 'safety_checkin', checkInId: doc.id, action: 'emergency'},
            android: {
              priority: 'high',
              notification: {
                channelId: 'safety_checkin_channel',
                titleLocKey: 'notification_safety_emergency_title',
                bodyLocKey: 'notification_safety_emergency_body',
              },
            },
            apns: {
              payload: {
                aps: {
                  alert: {
                    'title-loc-key': 'notification_safety_emergency_title',
                    'loc-key': 'notification_safety_emergency_body',
                  },
                  sound: 'default',
                  'interruption-level': 'critical',
                },
              },
            },
          });
        } catch (e) {
          logger.warn(`[processDateCheckIns] Emergency FCM error: ${e.message}`);
        }
      }

      await doc.ref.update({status: 'emergency_alerted', emergencyAlertedAt: now, lastUpdatedAt: now});
      emergencyCount++;
    }

    // Pass 4: Follow-up "Did you get home safe?" (2h after OK response)
    const followUps = await db.collection('dateCheckIns')
      .where('status', '==', 'ok_responded')
      .where('followUpScheduledAt', '<=', now)
      .limit(BATCH_LIMIT).get();

    for (const doc of followUps.docs) {
      const data = doc.data();
      if (!data.fcmToken) continue;
      try {
        await admin.messaging().send({
          token: data.fcmToken,
          data: {type: 'safety_checkin', checkInId: doc.id, action: 'follow_up'},
          android: {
            priority: 'high',
            notification: {
              channelId: 'safety_checkin_channel',
              titleLocKey: 'notification_safety_followup_title',
              bodyLocKey: 'notification_safety_followup_body',
            },
          },
          apns: {
            payload: {
              aps: {
                alert: {
                  'title-loc-key': 'notification_safety_followup_title',
                  'loc-key': 'notification_safety_followup_body',
                },
                sound: 'default',
                category: 'SAFETY_CHECKIN_CATEGORY',
              },
            },
          },
        });
        await doc.ref.update({status: 'follow_up_sent', lastUpdatedAt: now});
      } catch (e) {
        logger.warn(`[processDateCheckIns] Follow-up FCM error: ${e.message}`);
      }
    }

    const total = scheduled.size + reminderCount + emergencyCount + followUps.size;
    if (total > 0) {
      logger.info(`[processDateCheckIns] Processed ${total} check-ins (${scheduled.size} initial, ${reminderCount} reminders, ${emergencyCount} emergencies, ${followUps.size} follow-ups)`);
    }
  }
);
