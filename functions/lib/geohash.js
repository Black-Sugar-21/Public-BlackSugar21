'use strict';
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { encodeGeohash } = require('./geo');

exports.validateGeohashOnUpdate = onDocumentUpdated(
  {document: 'users/{userId}', region: 'us-central1'},
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();

    // Solo actuar si cambió lat/lng
    if (before.latitude === after.latitude && before.longitude === after.longitude) return;
    if (!after.latitude || !after.longitude) return;

    // Verificar que el geohash "g" exista — campo "g" NOT "geohash"
    if (!after.g) {
      const userId = event.params.userId;
      logger.warn(`[validateGeohashOnUpdate] User ${userId} has coords but no geohash "g" — auto-repairing`);
      
      // Auto-reparar: calcular y escribir el geohash
      const geohash = encodeGeohash(after.latitude, after.longitude);
      await admin.firestore().collection('users').doc(userId).update({g: geohash});
      logger.info(`[validateGeohashOnUpdate] Auto-repaired geohash for ${userId}: ${geohash}`);
    }
  },
);

/**
 * Scheduled: Detectar y reparar geohashes faltantes cada 6 horas.
 * Batch-fix: calcula y escribe el campo "g" para usuarios que tengan lat/lng sin geohash.
 */
exports.updategeohashesscheduled = onSchedule(
  {schedule: 'every 6 hours', region: 'us-central1', memory: '256MiB', timeoutSeconds: 300},
  async () => {
    const db = admin.firestore();
    const usersSnap = await db.collection('users')
      .where('accountStatus', '==', 'active')
      .limit(500)
      .get();

    let fixedCount = 0;
    const batch = db.batch();
    
    for (const doc of usersSnap.docs) {
      const data = doc.data();
      if (data.latitude && data.longitude && !data.g) {
        const geohash = encodeGeohash(data.latitude, data.longitude);
        batch.update(doc.ref, {g: geohash});
        fixedCount++;
        // Firestore batch limit = 500 writes
        if (fixedCount >= 400) break;
      }
    }
    
    if (fixedCount > 0) {
      await batch.commit();
      logger.info(`[updategeohashesscheduled] Auto-repaired ${fixedCount} missing geohashes out of ${usersSnap.docs.length} users`);
    } else {
      logger.info(`[updategeohashesscheduled] All ${usersSnap.docs.length} users have valid geohashes ✅`);
    }
  },
);

/**
 * Scheduled: Monitorear salud del sistema de geohashes cada 24h.
 * Escribe a systemHealth/geohash para dashboard de monitoreo.
 */
exports.monitorGeohashHealth = onSchedule(
  {schedule: 'every 24 hours', region: 'us-central1', memory: '256MiB', timeoutSeconds: 120},
  async () => {
    const db = admin.firestore();
    const usersSnap = await db.collection('users')
      .where('accountStatus', '==', 'active')
      .limit(1000)
      .get();

    let withGeohash = 0;
    let withoutGeohash = 0;
    let withoutCoords = 0;

    for (const doc of usersSnap.docs) {
      const data = doc.data();
      if (!data.latitude || !data.longitude) {
        withoutCoords++;
      } else if (data.g) {
        withGeohash++;
      } else {
        withoutGeohash++;
      }
    }

    const total = withGeohash + withoutGeohash;
    const health = {
      totalUsers: usersSnap.docs.length,
      withGeohash,
      withoutGeohash,
      withoutCoords,
      healthPercentage: total > 0 ? Math.round((withGeohash / total) * 100) : 100,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('systemHealth').doc('geohash').set(health, {merge: true});
    logger.info(`[monitorGeohashHealth] Health: ${health.healthPercentage}%`, health);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULED: Limpieza automática de stories expiradas (24h)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scheduled: cleanupExpiredStories
 * Se ejecuta cada hora para eliminar stories con expiresAt <= now.
 * Elimina tanto el documento de Firestore como la imagen en Storage.
 * Las stories duran 24 horas (expiresAt = timestamp + 24h, definido en createStory).
 * Homologado: iOS StoryModel.isExpired / Android StoryModel.isExpired()
 */
