'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { geminiApiKey, AI_MODEL_LITE, getLanguageInstruction, parseGeminiJsonResponse, getLocalizedError } = require('./shared');

exports.unmatchUser = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    const {matchId, otherUserId, userLanguage} = request.data || {};
    const lang = (userLanguage || 'en').split('-')[0].split('_')[0].toLowerCase();
    if (!request.auth) throw new HttpsError('unauthenticated', getLocalizedError('auth_required', lang));
    const currentUserId = request.auth.uid;
    if (!matchId) throw new HttpsError('invalid-argument', getLocalizedError('invalid_argument', lang));

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
      const lang = (request.data?.userLanguage || 'en').split('-')[0].split('_')[0].toLowerCase();
      throw new HttpsError('permission-denied', getLocalizedError('permission_denied', lang));
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
    const {reportedUserId, reason, matchId, description} = request.data || {};
    const lang = (request.data?.userLanguage || 'en').split('-')[0].split('_')[0].toLowerCase();
    if (!request.auth) throw new HttpsError('unauthenticated', getLocalizedError('auth_required', lang));
    const reporterId = request.auth.uid;
    if (!reportedUserId || !reason) throw new HttpsError('invalid-argument', getLocalizedError('invalid_argument', lang));
    if (reportedUserId === reporterId) throw new HttpsError('invalid-argument', getLocalizedError('invalid_argument', lang));

    const db = admin.firestore();

    // ── Rate limiting: máximo 5 reportes por día por reporter (transaction-safe) ──
    // SECURITY: previously a read-then-decide race — 5 rapid clicks before the
    // first report lands in the index could all pass the count check.
    // Now: atomic counter increment at users/{reporterId}/rateLimits/reports
    // with 24h sliding window. Fail-open if tx fails (log and continue).
    const rateLimitRef = db.collection('users').doc(reporterId).collection('rateLimits').doc('reports');
    const WINDOW_MS = 86400000;
    try {
      const allowed = await db.runTransaction(async (tx) => {
        const doc = await tx.get(rateLimitRef);
        const data = doc.exists ? doc.data() : {};
        const windowStart = data.windowStart?.toMillis?.() || data.windowStart || 0;
        const count = data.count || 0;
        const now = Date.now();
        if (now - windowStart > WINDOW_MS) {
          tx.set(rateLimitRef, {count: 1, windowStart: admin.firestore.Timestamp.now()}, {merge: true});
          return true;
        }
        if (count >= 5) return false;
        tx.set(rateLimitRef, {count: count + 1}, {merge: true});
        return true;
      });
      if (!allowed) {
        throw new HttpsError('resource-exhausted', getLocalizedError('reports_rate_limit', lang));
      }
    } catch (txErr) {
      if (txErr instanceof HttpsError) throw txErr;
      // Fail-open on infra errors — don't block legitimate reports due to Firestore hiccup
      logger.warn(`[reportUser] rate-limit tx failed for ${reporterId.substring(0, 8)}: ${txErr.message}`);
    }

    // ── 1. Crear documento de reporte con dedup atómico ──
    // Doc ID determinístico previene el mismo reporter reportando 2x al mismo
    // reportedUser (que inflaría uniqueReporters indirectamente si alguna
    // variante reset el contador). El timestamp en el ID permite re-reports
    // legítimos después de 24h si el usuario vuelve a violar.
    const reportBucket = Math.floor(Date.now() / WINDOW_MS);
    const reportDocId = `${reporterId}_${reportedUserId}_${reportBucket}`;
    const reportRef = db.collection('reports').doc(reportDocId);
    const existingReport = await reportRef.get();
    if (existingReport.exists) {
      logger.info(`[reportUser] Duplicate report in same 24h window ignored: ${reporterId.substring(0, 8)} → ${reportedUserId.substring(0, 8)}`);
      return {success: true, reportId: reportDocId, action: 'ALREADY_REPORTED_TODAY'};
    }
    await reportRef.set({
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

    // Remote-Config-driven thresholds: tunables without redeploy.
    // Defaults match the previous hardcoded 10/7/5/3 + 0.8 AI confidence.
    let thresholds = {banThreshold: 10, suspendThreshold: 7, aiReviewThreshold: 5, aiAutoSuspendConfidence: 0.8};
    try {
      const {getModerationConfig} = require('./moderation');
      const modCfg = await getModerationConfig();
      if (modCfg?.reportEscalation) {
        thresholds = {...thresholds, ...modCfg.reportEscalation};
      }
    } catch (cfgErr) {
      logger.warn(`[reportUser] Could not load escalation thresholds from RC, using defaults: ${cfgErr.message}`);
    }

    // ── Idempotency: si el usuario reportado ya está banned/suspended, no re-ejecutamos
    // el escalamiento (evita double-write concurrente cuando dos reportes cruzan umbrales al mismo tiempo).
    const reportedUserDoc = await db.collection('users').doc(reportedUserId).get();
    const currentStatus = reportedUserDoc.data()?.accountStatus || 'active';
    if (currentStatus === 'banned') {
      logger.info(`[reportUser] ${reportedUserId} already BANNED — skipping re-escalation`);
      return {success: true, reportId: reportRef.id, action: 'ALREADY_BANNED'};
    }

    // ── Escalamiento progresivo basado en reportadores ÚNICOS ──
    if (uniqueReportCount >= thresholds.banThreshold) {
      // 10+ reportadores únicos → BAN PERMANENTE
      await db.collection('users').doc(reportedUserId).update({
        accountStatus: 'banned',
        bannedAt: admin.firestore.FieldValue.serverTimestamp(),
        bannedReason: `Banned by progressive moderation: ${uniqueReportCount} unique reporters`,
        reportSummary: {uniqueReporters: uniqueReportCount, totalReports: totalReportCount, reasons: reasonCounts},
      });
      action = 'BANNED';
      logger.info(`🚫 [reportUser] BANNED ${reportedUserId} — ${uniqueReportCount} unique reporters`);

    } else if (uniqueReportCount >= thresholds.suspendThreshold) {
      // 7-9 reportadores únicos → SUSPENSIÓN TEMPORAL
      await db.collection('users').doc(reportedUserId).update({
        accountStatus: 'suspended',
        suspendedAt: admin.firestore.FieldValue.serverTimestamp(),
        suspendedReason: `Suspended by progressive moderation: ${uniqueReportCount} unique reporters`,
        reportSummary: {uniqueReporters: uniqueReportCount, totalReports: totalReportCount, reasons: reasonCounts},
      });
      action = 'SUSPENDED';
      logger.info(`⛔ [reportUser] SUSPENDED ${reportedUserId} — ${uniqueReportCount} unique reporters`);

    } else if (uniqueReportCount >= thresholds.aiReviewThreshold) {
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
          if (shouldSuspend && confidence >= thresholds.aiAutoSuspendConfidence) {
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
    const {blockedUserId, userLanguage} = request.data || {};
    const lang = (userLanguage || 'en').split('-')[0].split('_')[0].toLowerCase();
    if (!request.auth) throw new HttpsError('unauthenticated', getLocalizedError('auth_required', lang));
    const blockerId = request.auth.uid;
    if (!blockedUserId) throw new HttpsError('invalid-argument', getLocalizedError('invalid_argument', lang));

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
    const {userId, userLanguage} = request.data || {};
    const lang = (userLanguage || 'en').split('-')[0].split('_')[0].toLowerCase();
    if (!request.auth) throw new HttpsError('unauthenticated', getLocalizedError('auth_required', lang));
    const targetUserId = userId || request.auth.uid;

    // Solo se puede borrar la propia cuenta (o admin)
    if (targetUserId !== request.auth.uid) {
      throw new HttpsError('permission-denied', getLocalizedError('permission_denied', lang));
    }

    const db = admin.firestore();

    try {
      // 1. Borrar el documento principal del usuario
      await db.collection('users').doc(targetUserId).delete().catch((e) => {
        logger.warn(`[deleteUserData] Failed to delete user doc: ${e.message}`);
      });

      // 2. Borrar matches del usuario y borrar mensajes
      const matchesSnap = await db.collection('matches')
        .where('usersMatched', 'array-contains', targetUserId)
        .get().catch((e) => {
          logger.warn(`[deleteUserData] Failed to fetch matches: ${e.message}`);
          return {docs: []};
        });

      for (const matchDoc of matchesSnap.docs) {
        const msgs = await matchDoc.ref.collection('messages').limit(500).get().catch((e) => {
          logger.warn(`[deleteUserData] Failed to fetch match messages: ${e.message}`);
          return {docs: [], empty: true};
        });
        if (!msgs.empty) {
          const batch = db.batch();
          msgs.docs.forEach((m) => batch.delete(m.ref));
          await batch.commit();
        }
        await matchDoc.ref.delete().catch((e) => {
          logger.warn(`[deleteUserData] Failed to delete match doc: ${e.message}`);
        });
      }

      // 3. Borrar likes del usuario
      await db.collection('likes').doc(targetUserId).delete().catch((e) => {
        logger.warn(`[deleteUserData] Failed to delete likes doc: ${e.message}`);
      });

      // 4. Borrar swipes
      const swipesSnap = await db.collection('users').doc(targetUserId)
        .collection('swipes').limit(500).get().catch((e) => {
          logger.warn(`[deleteUserData] Failed to fetch swipes: ${e.message}`);
          return {docs: [], empty: true};
        });
      if (!swipesSnap.empty) {
        const batch = db.batch();
        swipesSnap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      // 5. Borrar reportes donde el usuario es el reportado
      const reportsSnap = await db.collection('reports')
        .where('reportedUserId', '==', targetUserId)
        .limit(100).get().catch((e) => {
          logger.warn(`[deleteUserData] Failed to fetch reports: ${e.message}`);
          return {docs: [], empty: true};
        });
      if (!reportsSnap.empty) {
        const batch = db.batch();
        reportsSnap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      // 6. Borrar coach chat history
      const coachMsgs = await db.collection('coachChats').doc(targetUserId)
        .collection('messages').limit(500).get().catch((e) => {
          logger.warn(`[deleteUserData] Failed to fetch coach messages: ${e.message}`);
          return {docs: [], empty: true};
        });
      if (!coachMsgs.empty) {
        const batch = db.batch();
        coachMsgs.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      await db.collection('coachChats').doc(targetUserId).delete().catch((e) => {
        logger.warn(`[deleteUserData] Failed to delete coachChats doc: ${e.message}`);
      });

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
