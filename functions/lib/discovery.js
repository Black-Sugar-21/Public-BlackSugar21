'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { haversineDistanceKm, encodeGeohash, precisionForRadius, normalizeLongitude, queryBoundsForRadius, calcAge } = require('./geo');
const { getLocalizedError } = require('./shared');


// ─────────────────────────────────────────────────────────────────────────────
// CLOUD FUNCTION: getCompatibleProfileIds
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Callable Function: Obtener IDs de perfiles compatibles para el swipe deck.
 *
 * Lógica homologada con Android UserServiceImpl.getCompatibleUsers():
 *   1. Excluir swipes recientes (cooldown de N días desde Remote Config, default 14)
 *   2. Excluir matches existentes
 *   3. Excluir usuarios bloqueados
 *   4. Filtrar por orientación/género
 *   5. Filtrar por accountStatus = "active" y paused = false
 *   6. Filtrar por rango de edad del usuario actual
 *   7. Filtrar por distancia (si coordenadas disponibles)
 *   8. Devolver hasta `limit` IDs ordenados por super likes primero.
 *
 * Respuesta: { success: true, profileIds: [...], totalExcluded: N, cooldownDays: N }
 */
exports.getCompatibleProfileIds = onCall(
  {
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 60,
  },
  async (request) => {
    const {userId, limit = 50, userLanguage} = request.data || {};
    const lang = (userLanguage || 'en').split('-')[0].toLowerCase();
    if (!request.auth) {
      throw new HttpsError('unauthenticated', getLocalizedError('auth_required', lang));
    }

    const currentUserId = userId || request.auth.uid;

    if (!currentUserId) {
      throw new HttpsError('invalid-argument', getLocalizedError('invalid_argument', lang));
    }

    const db = admin.firestore();

    // 1. Leer datos del usuario actual
    const userDoc = await db.collection('users').doc(currentUserId).get();
    if (!userDoc.exists) {
      logger.warn(`[getCompatibleProfileIds] User not found: ${currentUserId}`);
      return {success: true, profileIds: [], totalExcluded: 0, cooldownDays: 14};
    }

    const currentUser = userDoc.data();
    const currentUserMale = currentUser.male === true;
    const currentUserOrientation = (currentUser.orientation || 'both').toLowerCase();
    const currentUserType = (currentUser.userType || '').toUpperCase();
    const currentUserAge = calcAge(currentUser.birthDate);
    const userMinAge = currentUser.minAge || 18;
    const userMaxAge = currentUser.maxAge || 99;
    const userLat = currentUser.latitude;
    const userLon = currentUser.longitude;
    const maxDistanceKm = currentUser.maxDistance || 200;

    // 2. Obtener cooldown desde Remote Config (default 14 días)
    const COOLDOWN_DAYS_DEFAULT = 14;
    let cooldownDays = COOLDOWN_DAYS_DEFAULT;
    let reviewerUids = new Set(['g4Zbr8tEguMcpZonw72xM5MGse32']); // fallback
    try {
      const rc = admin.remoteConfig();
      const template = await rc.getTemplate();
      const cooldownParam = template.parameters['profile_reappear_cooldown_days'];
      if (cooldownParam && cooldownParam.defaultValue && cooldownParam.defaultValue.value) {
        const parsed = parseInt(cooldownParam.defaultValue.value, 10);
        if (!isNaN(parsed) && parsed > 0) cooldownDays = parsed;
      }
      const reviewerParam = template.parameters['reviewer_uid'];
      if (reviewerParam && reviewerParam.defaultValue && reviewerParam.defaultValue.value) {
        reviewerUids = new Set(reviewerParam.defaultValue.value.split(',').map(s => s.trim()).filter(Boolean));
      }
    } catch (e) {
      logger.warn('[getCompatibleProfileIds] Could not read Remote Config, using defaults');
    }

    const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
    const cutoffTime = new Date(Date.now() - cooldownMs);

    // 3. Construir set de IDs excluidos en paralelo
    const excludedIds = new Set([currentUserId]);

    const [swipesSnap, matchesSnap] = await Promise.all([
      // Swipes recientes dentro del cooldown
      db.collection('users').doc(currentUserId).collection('swipes')
        .where('timestamp', '>=', cutoffTime)
        .get()
        .catch(() => ({docs: []})),

      // Matches existentes
      db.collection('matches')
        .where('usersMatched', 'array-contains', currentUserId)
        .get()
        .catch(() => ({docs: []})),
    ]);

    // Agregar swipes recientes al set de excluidos
    swipesSnap.docs.forEach((doc) => excludedIds.add(doc.id));

    // Agregar usuarios ya matcheados
    matchesSnap.docs.forEach((doc) => {
      const data = doc.data();
      const users = data.usersMatched || data.users || [];
      users.forEach((uid) => {
        if (uid !== currentUserId) excludedIds.add(uid);
      });
    });

    // Agregar usuarios bloqueados — "blocked" es un campo array en el documento de usuario
    // (homologado con Android: userDoc.get("blocked") as? List<*>)
    // (homologado con iOS: userDoc.data()?["blocked"] as? [String])
    const blockedField = currentUser.blocked;
    if (Array.isArray(blockedField)) {
      blockedField.forEach((uid) => excludedIds.add(uid));
    }

    logger.info(`[getCompatibleProfileIds] Excluded: ${excludedIds.size} users (cooldown: ${cooldownDays}d)`);

    // 4. GEOHASH-BASED QUERY — Homologado con iOS ProfileCardRepository.getCompatibleUsersWithGeoQuery()
    //    y Android UserServiceImpl.getCompatibleUsersWithGeoQuery()
    //
    //    En lugar de escanear 200 docs arbitrarios, usamos geohash bounds para
    //    limitar geográficamente los candidatos. Si el usuario no tiene coordenadas,
    //    se usa un fallback sin filtro geográfico.

    const compatibleIds = [];
    const seenUserIds = new Set(); // Dedup entre rangos de geohash superpuestos

    const useGeoQuery = userLat != null && userLon != null;

    if (useGeoQuery) {
      // Generar rangos de geohash (hasta 9 celdas: centro + 8 puntos cardinales)
      const bounds = queryBoundsForRadius(userLat, userLon, maxDistanceKm);
      logger.info(`[getCompatibleProfileIds] Geohash query: ${bounds.length} ranges, radius: ${maxDistanceKm}km`);

      // ⚡ OPTIMIZACIÓN: Ejecutar TODAS las queries de geohash en paralelo
      // En lugar de for..of secuencial (~9 queries × 100-200ms = 900-1800ms)
      // Promise.all ejecuta las 9 queries simultáneamente (~200-400ms total)
      const snapshots = await Promise.all(
        bounds.map((bound) =>
          db.collection('users')
            .where('g', '>=', bound.start)
            .where('g', '<=', bound.end)
            .get()
            .catch((err) => {
              logger.warn(`[getCompatibleProfileIds] Geohash range query failed: ${err.message}`);
              return {docs: []};
            }),
        ),
      );

      // Procesar todos los resultados y aplicar filtros in-memory
      for (const snap of snapshots) {
        for (const doc of snap.docs) {
          if (compatibleIds.length >= limit) break;

          // Dedup entre rangos superpuestos
          if (seenUserIds.has(doc.id)) continue;
          seenUserIds.add(doc.id);

          const candidate = doc.data();

          // NUNCA mostrar el propio perfil en discovery
          if (doc.id === currentUserId) continue;

          // Reviewer siempre ve perfiles de test/reviewer (incluso tras swipe)
          const isReviewerProfile = candidate.isTest === true || candidate.isReviewer === true;
          const isReviewerUser = reviewerUids.has(currentUserId);

          // Excluir perfiles de test/reviewer para usuarios normales
          if (isReviewerProfile && !isReviewerUser) continue;

          // Excluir IDs ya marcados (swipes, matches, bloqueados, self)
          // Para el reviewer, los perfiles de test/reviewer siempre pasan
          if (excludedIds.has(doc.id) && !(isReviewerUser && isReviewerProfile)) continue;

          // Excluir cuentas no activas o pausadas
          if (candidate.accountStatus !== 'active') continue;
          if (candidate.paused === true) continue;

          // Excluir si el candidato ha bloqueado al usuario actual (bloqueo bidireccional)
          const candidateBlockedArray = candidate.blocked;
          if (Array.isArray(candidateBlockedArray) && candidateBlockedArray.includes(currentUserId)) continue;

          // Excluir visibilidad reducida (usuarios reportados)
          if (candidate.visibilityReduced === true) continue;

          // Reviewer: test/reviewer profiles bypass ALL content filters
          // (userType, orientation, age, distance) so they always appear
          const skipContentFilters = isReviewerUser && isReviewerProfile;

          // ═══ FILTRO userType ═══
          // Sugar Daddy y Sugar Mommy no ven su mismo tipo.
          // Sugar Baby puede ver cualquier tipo (incluyendo otro Sugar Baby).
          if (!skipContentFilters) {
            const candidateUserType = (candidate.userType || '').toUpperCase();
            if (
              (currentUserType === 'SUGAR_DADDY' || currentUserType === 'SUGAR_MOMMY') &&
              candidateUserType === currentUserType
            ) continue;
          }

          // ═══ FILTRO gender + orientation ═══
          if (!skipContentFilters) {
            const candidateMale = candidate.male === true;
            const candidateOrientation = (candidate.orientation || 'both').toLowerCase();

            if (currentUserOrientation === 'both') {
              // orientation="both" solo ve candidatos que también quieren "both"
              if (candidateOrientation !== 'both') continue;
            } else if (currentUserOrientation === 'men') {
              // Solo ver hombres
              if (!candidateMale) continue;
              // Cross-check: el candidato debe querer mi género
              if (currentUserMale && candidateOrientation === 'women') continue;
              if (!currentUserMale && candidateOrientation === 'men') continue;
            } else if (currentUserOrientation === 'women') {
              // Solo ver mujeres
              if (candidateMale) continue;
              // Cross-check: el candidato debe querer mi género
              if (currentUserMale && candidateOrientation === 'women') continue;
              if (!currentUserMale && candidateOrientation === 'men') continue;
            }
          }

          // Filtrar por rango de edad del usuario actual → edad del candidato
          if (!skipContentFilters) {
            const candidateAge = calcAge(candidate.birthDate);
            if (candidateAge < userMinAge || candidateAge > userMaxAge) continue;

            // Filtro bidireccional de edad: verificar que la edad del usuario actual
            // esté dentro del rango de búsqueda del candidato
            if (currentUserAge > 0) {
              const candidateMinAge = candidate.minAge || 18;
              const candidateMaxAge = candidate.maxAge || 99;
              if (currentUserAge < candidateMinAge || currentUserAge > candidateMaxAge) continue;
            }
          }

          // Verificar distancia exacta con Haversine (geohash es aproximado)
          if (!skipContentFilters) {
            const candidateLat = candidate.latitude;
            const candidateLon = candidate.longitude;
            if (candidateLat != null && candidateLon != null) {
              const distKm = haversineDistanceKm(userLat, userLon, candidateLat, candidateLon);
              if (distKm > maxDistanceKm) continue;
            }
          }

          compatibleIds.push(doc.id);
        }
        if (compatibleIds.length >= limit) break;
      }
    } else {
      // Fallback sin ubicación: query sin geohash (comportamiento legacy)
      logger.warn(`[getCompatibleProfileIds] User ${currentUserId} has no coordinates, using fallback query`);

      let query = db.collection('users')
        .where('accountStatus', '==', 'active')
        .where('paused', '==', false);

      if (currentUserOrientation === 'men') {
        query = query.where('male', '==', true);
      } else if (currentUserOrientation === 'women') {
        query = query.where('male', '==', false);
      }

      query = query.limit(200);
      const candidatesSnap = await query.get();

      for (const doc of candidatesSnap.docs) {
        if (compatibleIds.length >= limit) break;
        const candidate = doc.data();

        // NUNCA mostrar el propio perfil en discovery
        if (doc.id === currentUserId) continue;

        // Reviewer siempre ve perfiles de test/reviewer (incluso tras swipe)
        const isReviewerProfile = candidate.isTest === true || candidate.isReviewer === true;
        const isReviewerUser = reviewerUids.has(currentUserId);

        // Excluir perfiles de test/reviewer para usuarios normales
        if (isReviewerProfile && !isReviewerUser) continue;

        // Excluir IDs ya marcados (swipes, matches, bloqueados, self)
        // Para el reviewer, los perfiles de test/reviewer siempre pasan
        if (excludedIds.has(doc.id) && !(isReviewerUser && isReviewerProfile)) continue;

        if (candidate.visibilityReduced === true) continue;

        // Excluir si el candidato ha bloqueado al usuario actual (bloqueo bidireccional)
        const candidateBlockedArray = candidate.blocked;
        if (Array.isArray(candidateBlockedArray) && candidateBlockedArray.includes(currentUserId)) continue;

        // Reviewer: test/reviewer profiles bypass ALL content filters
        const skipContentFilters = isReviewerUser && isReviewerProfile;

        // ═══ FILTRO userType (fallback) ═══
        if (!skipContentFilters) {
          const candidateUserType = (candidate.userType || '').toUpperCase();
          if (
            (currentUserType === 'SUGAR_DADDY' || currentUserType === 'SUGAR_MOMMY') &&
            candidateUserType === currentUserType
          ) continue;
        }

        // ═══ FILTRO gender + orientation (fallback) ═══
        if (!skipContentFilters) {
          const candidateMale = candidate.male === true;
          const candidateOrientation = (candidate.orientation || 'both').toLowerCase();

          if (currentUserOrientation === 'both') {
            if (candidateOrientation !== 'both') continue;
          } else if (currentUserOrientation === 'men') {
            if (!candidateMale) continue;
            if (currentUserMale && candidateOrientation === 'women') continue;
            if (!currentUserMale && candidateOrientation === 'men') continue;
          } else if (currentUserOrientation === 'women') {
            if (candidateMale) continue;
            if (currentUserMale && candidateOrientation === 'women') continue;
            if (!currentUserMale && candidateOrientation === 'men') continue;
          }
        }

        if (!skipContentFilters) {
          const candidateAge = calcAge(candidate.birthDate);
          if (candidateAge < userMinAge || candidateAge > userMaxAge) continue;

          // Filtro bidireccional de edad
          if (currentUserAge > 0) {
            const candidateMinAge = candidate.minAge || 18;
            const candidateMaxAge = candidate.maxAge || 99;
            if (currentUserAge < candidateMinAge || currentUserAge > candidateMaxAge) continue;
          }
        }

        compatibleIds.push(doc.id);
      }
    }

    // ═══ REVIEWER GEO BYPASS ═══
    // Los perfiles de test/reviewer pueden estar en otra ciudad (ej: Santiago)
    // mientras el reviewer está en otra ubicación (ej: Concepción, 430km).
    // El geohash query solo cubre maxDistance (~200km), así que los perfiles
    // de test quedan fuera. Esta query adicional los trae sin filtro geográfico.
    const isReviewerUser = reviewerUids.has(currentUserId);
    if (isReviewerUser && compatibleIds.length < limit) {
      try {
        const reviewerSnap = await db.collection('users')
          .where('isReviewer', '==', true)
          .get();

        for (const doc of reviewerSnap.docs) {
          if (compatibleIds.length >= limit) break;
          if (doc.id === currentUserId) continue;
          if (seenUserIds.has(doc.id)) continue;
          if (compatibleIds.includes(doc.id)) continue;

          const candidate = doc.data();
          // Reviewer siempre ve perfiles de test/reviewer (incluso tras swipe)
          const isReviewerProfile = candidate.isTest === true || candidate.isReviewer === true;
          if (excludedIds.has(doc.id) && !(isReviewerUser && isReviewerProfile)) continue;

          if (candidate.accountStatus !== 'active') continue;
          if (candidate.paused === true) continue;

          seenUserIds.add(doc.id);
          compatibleIds.push(doc.id);
        }
        logger.info(`[getCompatibleProfileIds] Reviewer geo bypass: added profiles, total now ${compatibleIds.length}`);
      } catch (err) {
        logger.warn(`[getCompatibleProfileIds] Reviewer geo bypass query failed: ${err.message}`);
      }
    }

    logger.info(`[getCompatibleProfileIds] Returning ${compatibleIds.length} compatible profiles (geo: ${useGeoQuery}, seen: ${seenUserIds.size})`);

    return {
      success: true,
      profileIds: compatibleIds,
      totalExcluded: excludedIds.size - 1, // -1 para no contar al usuario mismo
      cooldownDays,
    };
  },
);

/**
 * Cloud Function: Enviar notificación cuando se crea un nuevo match
 * Trigger: Firestore onCreate en collection 'matches'
 */
