'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

exports.getBatchPhotoUrls = onCall(
  {region: 'us-central1', memory: '512MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {photoRequests} = request.data || {};
    if (!Array.isArray(photoRequests) || photoRequests.length === 0) {
      return {success: true, urls: {}, totalPhotos: 0, totalUsers: 0};
    }

    const bucket = admin.storage().bucket();
    const SIGNED_URL_EXPIRES = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 días

    const urls = {};
    let totalPhotos = 0;

    await Promise.allSettled(
      photoRequests.map(async ({userId, pictureNames, includeThumb}) => {
        if (!userId || !Array.isArray(pictureNames) || pictureNames.length === 0) return;

        const photoEntries = [];
        await Promise.allSettled(
          pictureNames.map(async (fileName) => {
            try {
              const filePath = `users/${userId}/${fileName}`;
              const file = bucket.file(filePath);
              const [exists] = await file.exists();
              if (!exists) return;

              const [signedUrl] = await file.getSignedUrl({
                action: 'read',
                expires: SIGNED_URL_EXPIRES,
              });

              let thumbUrl = null;
              if (includeThumb !== false) {
                const ext = fileName.includes('.') ? `.${fileName.split('.').pop()}` : '.jpg';
                const nameNoExt = fileName.replace(/\.[^.]+$/, '');
                const thumbFileName = `${nameNoExt}_thumb${ext}`;
                const thumbFile = bucket.file(`users/${userId}/${thumbFileName}`);
                const [thumbExists] = await thumbFile.exists();
                if (thumbExists) {
                  const [tUrl] = await thumbFile.getSignedUrl({
                    action: 'read',
                    expires: SIGNED_URL_EXPIRES,
                  });
                  thumbUrl = tUrl;
                }
              }

              photoEntries.push({url: signedUrl, thumbUrl, fileName});
            } catch (e) {
              logger.warn(`[getBatchPhotoUrls] Error getting URL for ${userId}/${fileName}: ${e.message}`);
            }
          }),
        );

        if (photoEntries.length > 0) {
          urls[userId] = photoEntries;
          totalPhotos += photoEntries.length;
        }
      }),
    );

    logger.info(`[getBatchPhotoUrls] Returned ${totalPhotos} URLs for ${Object.keys(urls).length} users`);
    return {success: true, urls, totalPhotos, totalUsers: Object.keys(urls).length};
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET MATCHES WITH METADATA
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Callable: Obtener matches con metadata de perfil del otro usuario.
 * Payload: {} (usa el userId del token)
 * Response: { success, matches: [{id, userId, name, birthDate, stories, lastMessage, hasUnreadMessage, lastMessageSeq, ...}] }
 * Homologado: iOS MatchRepository.getMatchesWithMetadata / Android MatchFirebaseDataSourceImpl
 */
exports.getMatchesWithMetadata = onCall(
  {region: 'us-central1', memory: '512MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const currentUserId = request.auth.uid;
    const db = admin.firestore();

    // Obtener todos los matches del usuario
    const matchesSnap = await db.collection('matches')
      .where('usersMatched', 'array-contains', currentUserId)
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();

    if (matchesSnap.empty) {
      return {success: true, matches: []};
    }

    // Recopilar los IDs del otro usuario en cada match
    const matchDataList = matchesSnap.docs.map((doc) => {
      const data = doc.data();
      const usersMatched = data.usersMatched || data.users || [];
      const otherUserId = usersMatched.find((uid) => uid !== currentUserId) || null;
      return {matchId: doc.id, otherUserId, data};
    }).filter((m) => m.otherUserId !== null);

    // Obtener perfiles del otro usuario en batch
    const otherUserIds = [...new Set(matchDataList.map((m) => m.otherUserId))];
    const userDocs = {};
    await Promise.allSettled(
      otherUserIds.map(async (uid) => {
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists) userDocs[uid] = userDoc.data();
      }),
    );

    // Calcular lastSeenTimestamp para unread badge
    const matches = matchDataList.map(({matchId, otherUserId: uid, data}) => {
      const user = userDocs[uid] || {};
      const lastSeenTimestamps = data.lastSeenTimestamps || {};
      const lastSeenTs = lastSeenTimestamps[currentUserId];
      const lastMsgTs = data.lastMessageTimestamp;
      const lastMsgSenderId = data.lastMessageSenderId;

      let hasUnreadMessage = false;
      if (lastMsgTs && lastMsgSenderId && lastMsgSenderId !== currentUserId) {
        const lastMsgMs = lastMsgTs.toMillis ? lastMsgTs.toMillis() : new Date(lastMsgTs).getTime();
        const lastSeenMs = lastSeenTs ? (lastSeenTs.toMillis ? lastSeenTs.toMillis() : new Date(lastSeenTs).getTime()) : 0;
        hasUnreadMessage = lastMsgMs > lastSeenMs;
      }

      // Calcular edad desde birthDate
      let age = null;
      if (user.birthDate) {
        const bd = user.birthDate.toDate ? user.birthDate.toDate() : new Date(user.birthDate);
        const today = new Date();
        age = today.getFullYear() - bd.getFullYear();
        const monthDiff = today.getMonth() - bd.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < bd.getDate())) age--;
      }

      // firstPictureName: primer elemento del array pictures (usado por iOS y Android)
      const pictures = Array.isArray(user.pictures) ? user.pictures : [];
      const firstPictureName = pictures.length > 0 ? pictures[0] : null;

      return {
        id: matchId,
        userId: uid,
        name: user.name || '',
        age,
        birthDate: user.birthDate ? (user.birthDate.toDate ? user.birthDate.toDate().toISOString() : user.birthDate) : null,
        firstPictureName,
        pictures,
        lastMessage: data.lastMessage || null,
        lastMessageSenderId: data.lastMessageSenderId || null,
        lastMessageTimestamp: data.lastMessageTimestamp || null,
        lastMessageSeq: data.lastMessageSeq || 0,
        messageCount: data.messageCount || 0,
        hasUnreadMessage,
        timestamp: data.timestamp || null,
        stories: [], // Stories se cargan por separado para evitar over-fetch
      };
    });

    logger.info(`[getMatchesWithMetadata] User ${currentUserId}: ${matches.length} matches`);
    return {success: true, matches};
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET BATCH COMPATIBILITY SCORES
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Callable: Calcular puntuaciones de compatibilidad en batch.
 * Payload: { currentUserId, targetUserIds: [] }
 * Response: { success, scores: [{userId, score}], validCount }
 * Homologado: iOS FirestoreRemoteDataSource / Android UserServiceImpl
 */
exports.getBatchCompatibilityScores = onCall(
  {region: 'us-central1', memory: '512MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {currentUserId, targetUserIds} = request.data || {};
    const uid = currentUserId || request.auth.uid;
    if (!Array.isArray(targetUserIds) || targetUserIds.length === 0) {
      return {success: true, scores: [], validCount: 0};
    }

    const db = admin.firestore();
    const currentUserDoc = await db.collection('users').doc(uid).get();
    if (!currentUserDoc.exists) {
      return {success: true, scores: [], validCount: 0};
    }
    const currentUser = currentUserDoc.data();

    const scores = [];
    await Promise.allSettled(
      targetUserIds.slice(0, 50).map(async (targetId) => {
        try {
          const targetDoc = await db.collection('users').doc(targetId).get();
          if (!targetDoc.exists) return;
          const target = targetDoc.data();
          // ✅ Excluir perfiles test/reviewer: solo visibles para el reviewer
          if ((target.isTest === true || target.isReviewer === true) && uid !== 'g4Zbr8tEguMcpZonw72xM5MGse32') return;

          let score = 50; // Base

          // Compatibilidad por intereses comunes
          const myInterests = currentUser.interests || currentUser.interestsIds || [];
          const targetInterests = target.interests || target.interestsIds || [];
          if (Array.isArray(myInterests) && Array.isArray(targetInterests)) {
            const mySet = new Set(myInterests.map(String));
            const common = targetInterests.filter((i) => mySet.has(String(i)));
            score += Math.min(common.length * 5, 30); // máx +30
          }

          // Compatibilidad por rango de edad
          const myAge = calcAge(currentUser.birthDate);
          const targetAge = calcAge(target.birthDate);
          const ageDiff = Math.abs(myAge - targetAge);
          if (ageDiff <= 3) score += 10;
          else if (ageDiff <= 7) score += 5;

          // Compatibilidad por distancia
          if (currentUser.latitude && currentUser.longitude && target.latitude && target.longitude) {
            const dist = haversineDistanceKm(currentUser.latitude, currentUser.longitude, target.latitude, target.longitude);
            if (dist <= 10) score += 10;
            else if (dist <= 30) score += 5;
          }

          scores.push({userId: targetId, score: Math.min(score, 100)});
        } catch (e) {
          logger.warn(`[getBatchCompatibilityScores] Error for target ${targetId}: ${e.message}`);
        }
      }),
    );

    logger.info(`[getBatchCompatibilityScores] Computed ${scores.length} scores for user ${uid}`);
    return {success: true, scores, validCount: scores.length};
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// STORIES — Create, View, Delete, Batch Status, Batch Personal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Callable: Crear una historia en Firestore.
 * Payload: { imageUrl, matchId?, matchParticipants?: [] }
 * Response: { id }
 * Homologado: iOS StoryRepository.createStory / Android StoryRepository
 */
