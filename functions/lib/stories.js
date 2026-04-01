'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

// Reviewer UIDs from Remote Config (comma-separated)
let _reviewerUids = null;
async function getReviewerUids() {
  if (_reviewerUids) return _reviewerUids;
  try {
    const template = await admin.remoteConfig().getTemplate();
    const raw = template.parameters?.reviewer_uid?.defaultValue?.value || '';
    _reviewerUids = new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
  } catch (e) {
    _reviewerUids = new Set(['g4Zbr8tEguMcpZonw72xM5MGse32', 'IlG6U9cfcOcnKJvEv4tAD4IZ0513']);
  }
  return _reviewerUids;
}
function isReviewerUid(uid, reviewerSet) { return reviewerSet.has(uid); }

exports.createStory = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {imageUrl, matchId, matchParticipants} = request.data || {};
    const senderId = request.auth.uid;
    if (!imageUrl) throw new Error('imageUrl is required');

    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const isReviewerUser = isReviewerUid(senderId, await getReviewerUids());
    const expiresAt = isReviewerUser
      ? admin.firestore.Timestamp.fromDate(new Date('2099-12-31T23:59:59Z'))
      : admin.firestore.Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000);

    const isPersonal = !matchId;
    const storyData = {
      senderId,
      imageUrl,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
      viewedBy: [],
      isExpired: false,
      isPersonal,
    };

    if (isReviewerUser) {
      storyData.neverExpires = true;
      storyData.isReviewer = true;
    }

    if (matchId) storyData.matchId = matchId;
    if (Array.isArray(matchParticipants) && matchParticipants.length > 0) {
      storyData.matchParticipants = matchParticipants;
    }

    const docRef = await db.collection('stories').add(storyData);
    logger.info(`[createStory] Story created: ${docRef.id} by ${senderId}`);
    return {id: docRef.id, storyId: docRef.id, success: true};
  },
);

/**
 * Callable: Marcar historia como vista.
 * Payload: { storyId, viewerId? }
 * Response: { success }
 * Homologado: iOS StoryRepository.markStoryAsViewed / Android StoryRepository
 */
exports.markStoryAsViewed = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 30},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {storyId} = request.data || {};
    const viewerId = request.auth.uid;
    if (!storyId) throw new Error('storyId is required');

    const db = admin.firestore();
    await db.collection('stories').doc(storyId).update({
      viewedBy: admin.firestore.FieldValue.arrayUnion(viewerId),
    });

    logger.info(`[markStoryAsViewed] Story ${storyId} viewed by ${viewerId}`);
    return {success: true};
  },
);

/**
 * Callable: Eliminar una historia.
 * Payload: { storyId }
 * Response: { success }
 * Homologado: iOS StoryRepository.deleteStory / Android StoryRepository
 */
exports.deleteStory = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 30},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {storyId} = request.data || {};
    const currentUserId = request.auth.uid;
    if (!storyId) throw new Error('storyId is required');

    const db = admin.firestore();
    const storyDoc = await db.collection('stories').doc(storyId).get();
    if (!storyDoc.exists) return {success: true};

    // Solo puede borrar el creador
    if (storyDoc.data().senderId !== currentUserId) {
      throw new Error('Not authorized to delete this story');
    }

    await db.collection('stories').doc(storyId).delete();
    logger.info(`[deleteStory] Story ${storyId} deleted by ${currentUserId}`);
    return {success: true};
  },
);

/**
 * Callable: Verificar si múltiples usuarios tienen historias activas.
 * Payload: { userIds: [] }
 * Response: { storiesStatus: { userId: bool } }
 * Homologado: iOS StoryRepository.getBatchStoryStatus / Android StoryRepository
 */
exports.getBatchStoryStatus = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {userIds} = request.data || {};
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return {storiesStatus: {}};
    }

    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const storiesStatus = {};
    const isReviewerUser = isReviewerUid(request.auth.uid, await getReviewerUids());

    // Inicializar todos como false
    userIds.forEach((uid) => { storiesStatus[uid] = false; });

    // Consultar historias personales activas (no expiradas) para estos usuarios
    // Usa índice compuesto: (isPersonal ASC, senderId ASC, expiresAt ASC)
    // Procesamos en lotes de 10 (límite de 'in' en Firestore)
    const chunkSize = 10;
    for (let i = 0; i < userIds.length; i += chunkSize) {
      const chunk = userIds.slice(i, i + chunkSize);
      try {
        const snap = await db.collection('stories')
          .where('isPersonal', '==', true)
          .where('senderId', 'in', chunk)
          .where('expiresAt', '>', now)
          .get();
        snap.docs.forEach((doc) => {
          const data = doc.data();
          // Reviewer stories solo visibles para el reviewer
          if (data.isReviewer === true && !isReviewerUser) return;
          storiesStatus[data.senderId] = true;
        });
      } catch (e) {
        logger.warn(`[getBatchStoryStatus] Error for chunk: ${e.message}`);
      }
    }

    logger.info(`[getBatchStoryStatus] Checked ${userIds.length} users, reviewer=${isReviewerUser}`);
    return {storiesStatus};
  },
);

/**
 * Callable: Obtener historias personales para múltiples usuarios.
 * Payload: { userIds: [] }
 * Response: { stories: { userId: [{id, imageUrl, timestamp, expiresAt, viewedBy, senderId}] } }
 * Homologado: iOS StoryRepository.getBatchPersonalStories / Android StoryRepository
 */
exports.getBatchPersonalStories = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {userIds} = request.data || {};
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return {stories: {}};
    }

    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const stories = {};
    const isReviewerUser = isReviewerUid(request.auth.uid, await getReviewerUids());

    userIds.forEach((uid) => { stories[uid] = []; });

    const chunkSize = 10;
    for (let i = 0; i < userIds.length; i += chunkSize) {
      const chunk = userIds.slice(i, i + chunkSize);
      try {
        // Query homologada con iOS getPersonalStories():
        // - isPersonal == true (solo historias personales)
        // - senderId IN chunk (batch de usuarios)
        // - expiresAt > now (solo activas)
        // - orderBy expiresAt ASC (usa índice existente: isPersonal ASC, senderId ASC, expiresAt ASC)
        const snap = await db.collection('stories')
          .where('isPersonal', '==', true)
          .where('senderId', 'in', chunk)
          .where('expiresAt', '>', now)
          .orderBy('expiresAt', 'asc')
          .get();
        snap.docs.forEach((doc) => {
          const data = doc.data();
          // Reviewer stories solo visibles para el reviewer
          if (data.isReviewer === true && !isReviewerUser) return;
          const uid = data.senderId;
          if (stories[uid]) {
            // Convertir Firestore Timestamps a ISO strings para parseo correcto en Android/iOS
            const ts = data.timestamp;
            const exp = data.expiresAt;
            const timestampISO = ts && ts.toDate ? ts.toDate().toISOString() : null;
            const expiresAtISO = exp && exp.toDate ? exp.toDate().toISOString() : null;
            stories[uid].push({
              id: doc.id,
              senderId: data.senderId,
              imageUrl: data.imageUrl,
              matchId: data.matchId || null,
              timestamp: timestampISO,
              expiresAt: expiresAtISO,
              viewedBy: data.viewedBy || [],
              isPersonal: true,
            });
          }
        });
      } catch (e) {
        logger.error(`[getBatchPersonalStories] Error for chunk [${chunk.join(',')}]: ${e.message}`);
      }
    }

    // Calcular stats (requerido por iOS guard y Android logging)
    let totalStories = 0;
    let usersWithStories = 0;
    for (const uid of Object.keys(stories)) {
      if (stories[uid].length > 0) {
        usersWithStories++;
        totalStories += stories[uid].length;
      }
    }

    logger.info(`[getBatchPersonalStories] Fetched ${totalStories} stories for ${usersWithStories}/${userIds.length} users`);
    return {stories, stats: {totalStories, usersWithStories}};
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE VALIDATION & MODERATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Callable: Validar imagen de perfil antes de guardarla.
 * Payload: { imageUrl, userId? }
 * Response: { valid, reason, scores }
 * Homologado: iOS ImageValidationService / Android ImageValidationService
 */

exports.cleanupExpiredStories = onSchedule(
  {schedule: 'every 1 hours', region: 'us-central1', memory: '512MiB', timeoutSeconds: 120},
  async () => {
    const db = admin.firestore();
    const now = new Date();

    logger.info('[cleanupExpiredStories] Starting cleanup of expired stories');

    // Obtener todas las stories con expiresAt <= ahora
    const expiredSnap = await db.collection('stories')
      .where('expiresAt', '<=', now)
      .get();

    logger.info(`[cleanupExpiredStories] Found ${expiredSnap.size} expired stories`);

    if (expiredSnap.empty) {
      logger.info('[cleanupExpiredStories] No expired stories to clean up');
      return;
    }

    const bucket = admin.storage().bucket();
    let deletedCount = 0;
    let errorCount = 0;

    for (const doc of expiredSnap.docs) {
      try {
        const story = doc.data();

        // Proteger stories del reviewer (nunca expirar)
        if (story.neverExpires === true || story.isReviewer === true) {
          logger.info(`[cleanupExpiredStories] Skipping reviewer story ${doc.id}`);
          continue;
        }

        // 1. Eliminar imagen de Storage si existe
        if (story.imageUrl) {
          try {
            // Extraer ruta de Storage desde la URL de descarga de Firebase
            // URL format: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}?alt=...
            const url = new URL(story.imageUrl);
            const pathMatch = url.pathname.match(/\/o\/(.+?)(\?|$)/);
            if (pathMatch) {
              const storagePath = decodeURIComponent(pathMatch[1]);
              const file = bucket.file(storagePath);
              const [exists] = await file.exists();
              if (exists) {
                await file.delete();
                logger.info(`[cleanupExpiredStories] Deleted storage file: ${storagePath}`);
              }
            }
          } catch (storageErr) {
            // No bloquear eliminación de Firestore por error en Storage
            logger.warn(`[cleanupExpiredStories] Storage delete error for story ${doc.id}: ${storageErr.message}`);
          }
        }

        // 2. Eliminar documento de Firestore
        await doc.ref.delete();
        deletedCount++;
      } catch (storyErr) {
        logger.error(`[cleanupExpiredStories] Error processing story ${doc.id}: ${storyErr.message}`);
        errorCount++;
      }
    }

    logger.info(`[cleanupExpiredStories] Completed: ${deletedCount} deleted, ${errorCount} errors`);
  },
);

/**
 * Callable: Real-time AI Coach Tips for in-chat analysis.
 * Analyzes recent conversation and returns chemistry score, contextual tips,
 * pre-date detection, and suggested actions.
 * Payload: { matchId, userLanguage }
 * Response: { success, chemistryScore, chemistryTrend, engagementLevel, tips[], preDateDetected, suggestedAction }
 */
