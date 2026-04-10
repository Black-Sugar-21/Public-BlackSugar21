'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { geminiApiKey, AI_MODEL_LITE, getLanguageInstruction, parseGeminiJsonResponse } = require('./shared');

exports.unmatchUser = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {matchId, otherUserId} = request.data || {};
    const currentUserId = request.auth.uid;
    if (!matchId) throw new Error('matchId is required');

    const db = admin.firestore();
    const matchRef = db.collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();

    if (!matchDoc.exists) {
      return {success: true, messagesDeleted: 0};
    }

    // Verificar que el usuario pertenece al match
    const matchData = matchDoc.data();
    const usersMatched = matchData.usersMatched || matchData.users || [];
    if (!usersMatched.includes(currentUserId)) {
      throw new Error('Not authorized to unmatch this match');
    }

    // Borrar mensajes en batch (hasta 500)
    const messagesSnap = await matchRef.collection('messages').limit(500).get();
    let messagesDeleted = 0;
    if (!messagesSnap.empty) {
      const batch = db.batch();
      messagesSnap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      messagesDeleted = messagesSnap.docs.length;
    }

    // Borrar el documento del match
    await matchRef.delete();

    // Borrar swipes + likes + passed de AMBOS usuarios para reset completo
    // Así ambos deben darse like de nuevo para hacer match
    const resolvedOtherUserId = otherUserId || usersMatched.find((uid) => uid !== currentUserId);
    if (resolvedOtherUserId) {
      await Promise.allSettled([
        // ── Subcollections (documents) ──
        db.collection('users').doc(currentUserId).collection('swipes').doc(resolvedOtherUserId).delete(),
        db.collection('users').doc(resolvedOtherUserId).collection('swipes').doc(currentUserId).delete(),
        db.collection('users').doc(currentUserId).collection('liked').doc(resolvedOtherUserId).delete(),
        db.collection('users').doc(resolvedOtherUserId).collection('liked').doc(currentUserId).delete(),
        db.collection('users').doc(currentUserId).collection('passed').doc(resolvedOtherUserId).delete(),
        db.collection('users').doc(resolvedOtherUserId).collection('passed').doc(currentUserId).delete(),
        db.collection('users').doc(currentUserId).collection('superLiked').doc(resolvedOtherUserId).delete(),
        db.collection('users').doc(resolvedOtherUserId).collection('superLiked').doc(currentUserId).delete(),
        // ── Array fields on user documents (CRITICAL: without this, mutual like in array triggers auto-match) ──
        db.collection('users').doc(currentUserId).update({
          liked: admin.firestore.FieldValue.arrayRemove(resolvedOtherUserId),
          passed: admin.firestore.FieldValue.arrayRemove(resolvedOtherUserId),
          superLiked: admin.firestore.FieldValue.arrayRemove(resolvedOtherUserId),
        }),
        db.collection('users').doc(resolvedOtherUserId).update({
          liked: admin.firestore.FieldValue.arrayRemove(currentUserId),
          passed: admin.firestore.FieldValue.arrayRemove(currentUserId),
          superLiked: admin.firestore.FieldValue.arrayRemove(currentUserId),
        }),
      ]);
    }

    logger.info(`[unmatchUser] Match ${matchId} deleted, ${messagesDeleted} messages removed, likes/swipes/passed cleared`);
    return {success: true, messagesDeleted};
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// REPORT USER
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Callable: Reportar a un usuario.
 * Payload: { reportedUserId, reason, matchId?, description? }
 * Response: { success, action, reportId, reportCount }
 * Homologado: iOS FirestoreRemoteDataSource.reportUser / Android UserServiceImpl
 */
exports.reportUser = onCall(
  {region: 'us-central1', memory: '512MiB', timeoutSeconds: 120},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {reportedUserId, reason, matchId, description} = request.data || {};
    const reporterId = request.auth.uid;
    if (!reportedUserId || !reason) throw new Error('reportedUserId and reason are required');
    if (reportedUserId === reporterId) throw new Error('Cannot report yourself');

    const db = admin.firestore();

    // ── Rate limiting: máximo 5 reportes por día por reporter ──
    const oneDayAgo = new Date(Date.now() - 86400000);
    const recentReports = await db.collection('reports')
      .where('reporterId', '==', reporterId)
      .where('createdAt', '>', oneDayAgo)
      .get();
    if (recentReports.size >= 5) {
      throw new Error('Rate limit exceeded — max 5 reports per day');
    }

    // ── 1. Crear documento de reporte ──
    const reportRef = await db.collection('reports').add({
      reporterId,
      reportedUserId,
      reason,
      description: description || '',
      matchId: matchId || null,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // ── 2. BLOQUEO PERSONAL: el reportador bloquea al reportado (solo para él) ──
    // Bidireccional: blocked (reporter) + blockedBy (reported)
    try {
      await Promise.all([
        db.collection('users').doc(reporterId).update({
          blocked: admin.firestore.FieldValue.arrayUnion(reportedUserId),
        }),
        db.collection('users').doc(reportedUserId).update({
          blockedBy: admin.firestore.FieldValue.arrayUnion(reporterId),
        }),
      ]);
      logger.info(`[reportUser] Personal block: ${reporterId} → ${reportedUserId}`);
    } catch (blockErr) {
      logger.warn(`[reportUser] Personal block error: ${blockErr.message}`);
    }

    // ── 3. Limpiar likes mutuos ──
    try {
      await Promise.all([
        db.collection('users').doc(reporterId).update({
          liked: admin.firestore.FieldValue.arrayRemove(reportedUserId),
        }),
        db.collection('users').doc(reportedUserId).update({
          liked: admin.firestore.FieldValue.arrayRemove(reporterId),
        }),
        db.collection('users').doc(reporterId).collection('liked').doc(reportedUserId).delete(),
        db.collection('users').doc(reportedUserId).collection('liked').doc(reporterId).delete(),
      ]);
    } catch (cleanupErr) {
      logger.warn(`[reportUser] Likes cleanup error: ${cleanupErr.message}`);
    }

    // ── 4. Eliminar match si existe ──
    if (matchId) {
      try {
        const matchRef = db.collection('matches').doc(matchId);
        const matchDoc = await matchRef.get();
        if (matchDoc.exists) {
          const msgs = await matchRef.collection('messages').limit(500).get();
          if (!msgs.empty) {
            const batch = db.batch();
            msgs.docs.forEach((m) => batch.delete(m.ref));
            await batch.commit();
          }
          await matchRef.delete();
          logger.info(`[reportUser] Match ${matchId} deleted`);
        }
      } catch (matchErr) {
        logger.warn(`[reportUser] Match cleanup error: ${matchErr.message}`);
      }
    }

    // ── 5. MODERACIÓN PROGRESIVA con IA ──
    // Contar reportes ÚNICOS (de usuarios distintos) contra este usuario
    const reportsSnap = await db.collection('reports')
      .where('reportedUserId', '==', reportedUserId)
      .where('status', 'in', ['pending', 'reviewed'])
      .get();

    // Contar reportadores únicos (evita que un solo usuario infle el conteo)
    const uniqueReporters = new Set(reportsSnap.docs.map((d) => d.data().reporterId));
    const uniqueReportCount = uniqueReporters.size;
    const totalReportCount = reportsSnap.docs.length;

    // Categorizar razones de los reportes para el análisis
    const reasonCounts = {};
    reportsSnap.docs.forEach((d) => {
      const r = d.data().reason || 'OTHER';
      reasonCounts[r] = (reasonCounts[r] || 0) + 1;
    });

    let action = 'PERSONAL_BLOCK';
    let aiAnalysis = null;

    // ── Escalamiento progresivo basado en reportadores ÚNICOS ──
    if (uniqueReportCount >= 10) {
      // 10+ reportadores únicos → BAN PERMANENTE
      await db.collection('users').doc(reportedUserId).update({
        accountStatus: 'banned',
        bannedAt: admin.firestore.FieldValue.serverTimestamp(),
        bannedReason: `Banned by progressive moderation: ${uniqueReportCount} unique reporters`,
        reportSummary: {uniqueReporters: uniqueReportCount, totalReports: totalReportCount, reasons: reasonCounts},
      });
      action = 'BANNED';
      logger.info(`🚫 [reportUser] BANNED ${reportedUserId} — ${uniqueReportCount} unique reporters`);

    } else if (uniqueReportCount >= 7) {
      // 7-9 reportadores únicos → SUSPENSIÓN TEMPORAL
      await db.collection('users').doc(reportedUserId).update({
        accountStatus: 'suspended',
        suspendedAt: admin.firestore.FieldValue.serverTimestamp(),
        suspendedReason: `Suspended by progressive moderation: ${uniqueReportCount} unique reporters`,
        reportSummary: {uniqueReporters: uniqueReportCount, totalReports: totalReportCount, reasons: reasonCounts},
      });
      action = 'SUSPENDED';
      logger.info(`⛔ [reportUser] SUSPENDED ${reportedUserId} — ${uniqueReportCount} unique reporters`);

    } else if (uniqueReportCount >= 5) {
      // 5-6 reportadores únicos → Análisis IA + visibilidad reducida
      await db.collection('users').doc(reportedUserId).update({
        visibilityReduced: true,
        shadowBannedAt: admin.firestore.FieldValue.serverTimestamp(),
        shadowBanReason: `AI review triggered: ${uniqueReportCount} unique reporters`,
        reportSummary: {uniqueReporters: uniqueReportCount, totalReports: totalReportCount, reasons: reasonCounts},
      });
      action = 'VISIBILITY_REDUCED_AI_REVIEW';

      // Análisis IA asíncrono del perfil reportado
      try {
        const reportedUserDoc = await db.collection('users').doc(reportedUserId).get();
        const reportedUser = reportedUserDoc.data() || {};
        const aiPrompt = `Analyze this dating profile for policy violations. User has ${uniqueReportCount} unique reporters with reasons: ${JSON.stringify(reasonCounts)}. ` +
          `Profile: name="${reportedUser.name || ''}", bio="${reportedUser.bio || ''}", userType="${reportedUser.userType || ''}". ` +
          `Should this user be suspended? Respond with JSON: {"shouldSuspend": bool, "confidence": 0-1, "reasoning": "string"}`;

        const {GoogleGenerativeAI} = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({model: AI_MODEL_LITE, generationConfig: {maxOutputTokens: 256, responseMimeType: 'application/json'}});
        const result = await model.generateContent(aiPrompt);
        const responseText = result.response.text();
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          aiAnalysis = JSON.parse(jsonMatch[0]);
          // Validate types strictly — this path suspends users
          const shouldSuspend = aiAnalysis.shouldSuspend === true;
          const confidence = typeof aiAnalysis.confidence === 'number' ? aiAnalysis.confidence : -1;
          aiAnalysis.reasoning = typeof aiAnalysis.reasoning === 'string' ? aiAnalysis.reasoning : '';
          // Si la IA recomienda suspensión con alta confianza, escalar
          if (shouldSuspend && confidence >= 0.8) {
            await db.collection('users').doc(reportedUserId).update({
              accountStatus: 'suspended',
              suspendedAt: admin.firestore.FieldValue.serverTimestamp(),
              suspendedReason: `AI-recommended suspension: ${aiAnalysis.reasoning}`,
              aiModerationResult: aiAnalysis,
            });
            action = 'AI_SUSPENDED';
            logger.info(`🤖 [reportUser] AI SUSPENDED ${reportedUserId} — confidence: ${aiAnalysis.confidence}`);
          }
        }
      } catch (aiErr) {
        logger.warn(`[reportUser] AI analysis error (non-blocking): ${aiErr.message}`);
      }
      logger.info(`⚠️ [reportUser] VISIBILITY_REDUCED ${reportedUserId} — ${uniqueReportCount} unique reporters`);

    } else if (uniqueReportCount >= 3) {
      // 3-4 reportadores únicos → Visibilidad reducida (shadowban suave)
      await db.collection('users').doc(reportedUserId).update({
        visibilityReduced: true,
        shadowBannedAt: admin.firestore.FieldValue.serverTimestamp(),
        shadowBanReason: `Multiple reports: ${uniqueReportCount} unique reporters`,
      });
      action = 'VISIBILITY_REDUCED';
      logger.info(`⚠️ [reportUser] Visibility reduced for ${reportedUserId} — ${uniqueReportCount} unique reporters`);
    }
    // 1-2 reportadores únicos → Solo bloqueo personal, no acción global

    // ── 6. Actualizar reporte con acción tomada ──
    await reportRef.update({
      action,
      uniqueReportCount,
      totalReportCount,
      reasonCounts,
      aiAnalysis: aiAnalysis || null,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info(`[reportUser] ${reporterId} reported ${reportedUserId} — action: ${action} (${uniqueReportCount} unique reporters, ${totalReportCount} total)`);
    return {success: true, action, reportId: reportRef.id, uniqueReportCount, totalReportCount};
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK USER
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Callable: Bloquear a un usuario.
 * Payload: { blockedUserId }
 * Response: { success, matchDeleted }
 * Homologado: iOS FirestoreRemoteDataSource.blockUser / Android UserServiceImpl
 */
exports.blockUser = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {blockedUserId} = request.data || {};
    const blockerId = request.auth.uid;
    if (!blockedUserId) throw new Error('blockedUserId is required');

    const db = admin.firestore();

    // ✅ FIX: Bloqueo bidireccional — homologado con iOS blockUser CF
    // 1. Añadir al array 'blocked' en el doc del bloqueador
    // 2. Añadir al array 'blockedBy' en el doc del usuario bloqueado
    await Promise.all([
      db.collection('users').doc(blockerId).update({
        blocked: admin.firestore.FieldValue.arrayUnion(blockedUserId),
      }),
      db.collection('users').doc(blockedUserId).update({
        blockedBy: admin.firestore.FieldValue.arrayUnion(blockerId),
      }),
    ]);

    // Buscar y eliminar match existente entre ambos
    const matchesSnap = await db.collection('matches')
      .where('usersMatched', 'array-contains', blockerId)
      .get();

    let matchDeleted = false;
    for (const doc of matchesSnap.docs) {
      const matchData = doc.data();
      const usersMatched = matchData.usersMatched || matchData.users || [];
      if (usersMatched.includes(blockedUserId)) {
        // Borrar mensajes primero
        const msgs = await doc.ref.collection('messages').limit(500).get();
        if (!msgs.empty) {
          const batch = db.batch();
          msgs.docs.forEach((m) => batch.delete(m.ref));
          await batch.commit();
        }
        await doc.ref.delete();
        matchDeleted = true;
        break;
      }
    }

    // ✅ FIX: Limpiar likes mutuos — homologado con iOS blockUser CF
    try {
      await Promise.all([
        db.collection('users').doc(blockerId).update({
          liked: admin.firestore.FieldValue.arrayRemove(blockedUserId),
        }),
        db.collection('users').doc(blockedUserId).update({
          liked: admin.firestore.FieldValue.arrayRemove(blockerId),
        }),
        db.collection('users').doc(blockerId).collection('liked').doc(blockedUserId).delete(),
        db.collection('users').doc(blockedUserId).collection('liked').doc(blockerId).delete(),
      ]);
    } catch (cleanupErr) {
      logger.warn(`[blockUser] Likes cleanup partial error: ${cleanupErr.message}`);
    }

    logger.info(`[blockUser] ${blockerId} blocked ${blockedUserId}, matchDeleted=${matchDeleted}`);
    return {success: true, matchDeleted};
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE USER DATA
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Callable: Eliminar todos los datos de un usuario (GDPR/borrado de cuenta).
 * Payload: { userId }
 * Response: { success }
 * Homologado: iOS FirestoreRemoteDataSource.deleteUserData / Android UserServiceImpl
 */
exports.deleteUserData = onCall(
  {region: 'us-central1', memory: '512MiB', timeoutSeconds: 120},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {userId} = request.data || {};
    const targetUserId = userId || request.auth.uid;

    // Solo se puede borrar la propia cuenta (o admin)
    if (targetUserId !== request.auth.uid) {
      throw new Error('Can only delete your own account');
    }

    const db = admin.firestore();

    try {
      // 1. Borrar el documento principal del usuario
      await db.collection('users').doc(targetUserId).delete().catch(() => {});

      // 2. Borrar matches del usuario y borrar mensajes
      const matchesSnap = await db.collection('matches')
        .where('usersMatched', 'array-contains', targetUserId)
        .get().catch(() => ({docs: []}));

      for (const matchDoc of matchesSnap.docs) {
        const msgs = await matchDoc.ref.collection('messages').limit(500).get().catch(() => ({docs: [], empty: true}));
        if (!msgs.empty) {
          const batch = db.batch();
          msgs.docs.forEach((m) => batch.delete(m.ref));
          await batch.commit();
        }
        await matchDoc.ref.delete().catch(() => {});
      }

      // 3. Borrar likes del usuario
      await db.collection('likes').doc(targetUserId).delete().catch(() => {});

      // 4. Borrar swipes
      const swipesSnap = await db.collection('users').doc(targetUserId)
        .collection('swipes').limit(500).get().catch(() => ({docs: [], empty: true}));
      if (!swipesSnap.empty) {
        const batch = db.batch();
        swipesSnap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      // 5. Borrar reportes donde el usuario es el reportado
      const reportsSnap = await db.collection('reports')
        .where('reportedUserId', '==', targetUserId)
        .limit(100).get().catch(() => ({docs: [], empty: true}));
      if (!reportsSnap.empty) {
        const batch = db.batch();
        reportsSnap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      // 6. Borrar coach chat history
      const coachMsgs = await db.collection('coachChats').doc(targetUserId)
        .collection('messages').limit(500).get().catch(() => ({docs: [], empty: true}));
      if (!coachMsgs.empty) {
        const batch = db.batch();
        coachMsgs.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      await db.collection('coachChats').doc(targetUserId).delete().catch(() => {});

      // 7. Borrar el usuario de Firebase Auth (última acción — punto de no retorno)
      await admin.auth().deleteUser(targetUserId);

      logger.info(`[deleteUserData] User ${targetUserId} deleted successfully`);
      return {success: true};
    } catch (error) {
      logger.error(`[deleteUserData] Error deleting user ${targetUserId}: ${error.message}`);
      throw new Error(`Failed to delete user data: ${error.message}`);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET BATCH PHOTO URLS
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Callable: Obtener URLs firmadas de fotos de perfil en batch.
 * Payload: { photoRequests: [{userId, pictureNames: [], includeThumb?}] }
 * Response: { success, urls: {userId: [{url, thumbUrl}]}, totalPhotos, totalUsers }
 * Homologado: iOS StorageRemoteDataSource.getBatchPhotoUrls / Android PictureServiceImpl
 */
