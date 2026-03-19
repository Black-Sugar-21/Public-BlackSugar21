const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const {onObjectFinalized} = require('firebase-functions/v2/storage');
const {onCall} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const {logger} = require('firebase-functions/v2');
const {defineSecret} = require('firebase-functions/params');
const {GoogleGenerativeAI} = require('@google/generative-ai');

const placesApiKey = defineSecret('GOOGLE_PLACES_API_KEY');
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const AI_MODEL_NAME = 'gemini-2.5-flash';
const AI_MODEL_LITE = 'gemini-2.5-flash-lite'; // Cheaper model for classification/moderation (lower thinking cost)
const sharp = require('sharp');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

admin.initializeApp();

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDADES GEOGRÁFICAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcula la distancia en km entre dos coordenadas (fórmula Haversine).
 * Homologado con GeoHashUtils.distance() en Android e iOS.
 */
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Codifica coordenadas a geohash base32.
 * Algoritmo idéntico a GeoHashUtils.encode() de iOS y Android.
 * @param {number} latitude
 * @param {number} longitude
 * @param {number} precision - Caracteres del geohash (default 9 ≈ 4.77m×4.77m)
 * @return {string} geohash
 */
const GEOHASH_BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
function encodeGeohash(latitude, longitude, precision = 9) {
  let lat = [latitude, -90.0, 90.0];
  let lon = [longitude, -180.0, 180.0];
  let geohash = '';
  let isEven = true;
  let bit = 0;
  let ch = 0;

  while (geohash.length < precision) {
    if (isEven) {
      const mid = (lon[1] + lon[2]) / 2;
      if (lon[0] > mid) {
        ch |= (1 << (4 - bit));
        lon[1] = mid;
      } else {
        lon[2] = mid;
      }
    } else {
      const mid = (lat[1] + lat[2]) / 2;
      if (lat[0] > mid) {
        ch |= (1 << (4 - bit));
        lat[1] = mid;
      } else {
        lat[2] = mid;
      }
    }
    isEven = !isEven;
    if (bit < 4) {
      bit++;
    } else {
      geohash += GEOHASH_BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return geohash;
}

/**
 * Calcula la precisión óptima del geohash basada en el radio de búsqueda.
 * Homologado con GeoHashUtils.precisionForRadius() de iOS y Android.
 */
function precisionForRadius(radiusInKm) {
  if (radiusInKm > 630) return 2;
  if (radiusInKm > 78) return 3;
  if (radiusInKm > 20) return 4;
  if (radiusInKm > 2.4) return 5;
  if (radiusInKm > 0.61) return 6;
  if (radiusInKm > 0.076) return 7;
  if (radiusInKm > 0.019) return 8;
  return 9;
}

/**
 * Normaliza longitud al rango [-180, 180].
 * Homologado con GeoHashUtils.normalizeLongitude() de iOS y Android.
 */
function normalizeLongitude(lon) {
  let normalized = lon % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized < -180) normalized += 360;
  return normalized;
}

/**
 * Genera rangos de geohash para consulta geográfica.
 * Calcula el centro + 8 puntos cardinales/intercardinales en el borde del radio.
 * Homologado con GeoHashUtils.queryBounds() de iOS y Android (hasta 9 rangos únicos).
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {number} radiusInKm
 * @return {Array<{start: string, end: string}>}
 */
function queryBoundsForRadius(latitude, longitude, radiusInKm) {
  const precision = precisionForRadius(radiusInKm);

  // Geohash del centro
  const hashes = new Set();
  hashes.add(encodeGeohash(latitude, longitude, precision));

  // Offsets para N, NE, E, SE, S, SW, W, NW
  const offsets = [
    [1, 0], [1, 1], [0, 1], [-1, 1],
    [-1, 0], [-1, -1], [0, -1], [1, -1],
  ];

  // km → grados
  const latDelta = radiusInKm / 110.574;
  const cosLat = Math.cos(latitude * Math.PI / 180);
  const lonDelta = cosLat > 0.001 ? radiusInKm / (111.320 * cosLat) : radiusInKm / 111.320;

  for (const [dLat, dLon] of offsets) {
    const edgeLat = Math.min(90, Math.max(-90, latitude + dLat * latDelta));
    const edgeLon = normalizeLongitude(longitude + dLon * lonDelta);
    hashes.add(encodeGeohash(edgeLat, edgeLon, precision));
  }

  // Convertir cada hash único a un rango de query
  return Array.from(hashes).sort().map((h) => ({start: h, end: h + '~'}));
}

/**
 * Calcula la edad en años a partir de un Firestore Timestamp o Date.
 */
function calcAge(birthDate) {
  if (!birthDate) return 0;
  const birth = birthDate.toDate ? birthDate.toDate() : new Date(birthDate);
  const ageDiff = Date.now() - birth.getTime();
  return Math.floor(ageDiff / (365.25 * 24 * 60 * 60 * 1000));
}

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
    if (!request.auth) {
      throw new Error('Authentication required');
    }

    const {userId, limit = 50} = request.data || {};
    const currentUserId = userId || request.auth.uid;

    if (!currentUserId) {
      throw new Error('userId is required');
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
    try {
      const rc = admin.remoteConfig();
      const template = await rc.getTemplate();
      const cooldownParam = template.parameters['profile_reappear_cooldown_days'];
      if (cooldownParam && cooldownParam.defaultValue && cooldownParam.defaultValue.value) {
        const parsed = parseInt(cooldownParam.defaultValue.value, 10);
        if (!isNaN(parsed) && parsed > 0) cooldownDays = parsed;
      }
    } catch (e) {
      logger.warn('[getCompatibleProfileIds] Could not read Remote Config, using default cooldownDays=14');
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

          // Excluir IDs ya marcados (swipes, matches, bloqueados, self)
          if (excludedIds.has(doc.id)) continue;

          const candidate = doc.data();

          // Excluir perfiles de test/reviewer: solo visibles para el reviewer
          if ((candidate.isTest === true || candidate.isReviewer === true) && currentUserId !== 'g4Zbr8tEguMcpZonw72xM5MGse32') continue;

          // Excluir cuentas no activas o pausadas
          if (candidate.accountStatus !== 'active') continue;
          if (candidate.paused === true) continue;

          // Excluir si el candidato ha bloqueado al usuario actual (bloqueo bidireccional)
          const candidateBlockedArray = candidate.blocked;
          if (Array.isArray(candidateBlockedArray) && candidateBlockedArray.includes(currentUserId)) continue;

          // Excluir visibilidad reducida (usuarios reportados)
          if (candidate.visibilityReduced === true) continue;

          // ═══ FILTRO userType ═══
          // Sugar Daddy y Sugar Mommy no ven su mismo tipo.
          // Sugar Baby puede ver cualquier tipo (incluyendo otro Sugar Baby).
          const candidateUserType = (candidate.userType || '').toUpperCase();
          if (
            (currentUserType === 'SUGAR_DADDY' || currentUserType === 'SUGAR_MOMMY') &&
            candidateUserType === currentUserType
          ) continue;

          // ═══ FILTRO gender + orientation ═══
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

          // Filtrar por rango de edad del usuario actual → edad del candidato
          const candidateAge = calcAge(candidate.birthDate);
          if (candidateAge < userMinAge || candidateAge > userMaxAge) continue;

          // Filtro bidireccional de edad: verificar que la edad del usuario actual
          // esté dentro del rango de búsqueda del candidato
          if (currentUserAge > 0) {
            const candidateMinAge = candidate.minAge || 18;
            const candidateMaxAge = candidate.maxAge || 99;
            if (currentUserAge < candidateMinAge || currentUserAge > candidateMaxAge) continue;
          }

          // Verificar distancia exacta con Haversine (geohash es aproximado)
          const candidateLat = candidate.latitude;
          const candidateLon = candidate.longitude;
          if (candidateLat != null && candidateLon != null) {
            const distKm = haversineDistanceKm(userLat, userLon, candidateLat, candidateLon);
            if (distKm > maxDistanceKm) continue;
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
        if (excludedIds.has(doc.id)) continue;

        const candidate = doc.data();

        // Excluir perfiles de test/reviewer: solo visibles para el reviewer
        if ((candidate.isTest === true || candidate.isReviewer === true) && currentUserId !== 'g4Zbr8tEguMcpZonw72xM5MGse32') continue;

        if (candidate.visibilityReduced === true) continue;

        // Excluir si el candidato ha bloqueado al usuario actual (bloqueo bidireccional)
        const candidateBlockedArray = candidate.blocked;
        if (Array.isArray(candidateBlockedArray) && candidateBlockedArray.includes(currentUserId)) continue;

        // ═══ FILTRO userType (fallback) ═══
        const candidateUserType = (candidate.userType || '').toUpperCase();
        if (
          (currentUserType === 'SUGAR_DADDY' || currentUserType === 'SUGAR_MOMMY') &&
          candidateUserType === currentUserType
        ) continue;

        // ═══ FILTRO gender + orientation (fallback) ═══
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

        const candidateAge = calcAge(candidate.birthDate);
        if (candidateAge < userMinAge || candidateAge > userMaxAge) continue;

        // Filtro bidireccional de edad
        if (currentUserAge > 0) {
          const candidateMinAge = candidate.minAge || 18;
          const candidateMaxAge = candidate.maxAge || 99;
          if (currentUserAge < candidateMinAge || currentUserAge > candidateMaxAge) continue;
        }

        compatibleIds.push(doc.id);
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
          matchedUserName: otherUserName, // ✅ Android lo lee de data["matchedUserName"] en foreground
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
          priority: 'high',
          notification: {
            // Android usa underscores en las keys
            titleLocKey: 'notification_new_match_title',
            bodyLocKey: 'notification_new_match_body',
            bodyLocArgs: [otherUserName],
            sound: 'default',
            channelId: 'matches_channel',
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

    // ✅ Verificar activeChat — no enviar push si el receptor ya tiene el chat abierto
    // Homologado con iOS/Android: ambos escriben activeChat = matchId al entrar al chat
    // ⚠️ STALE CHECK: Si activeChatTimestamp tiene más de 5 minutos, ignorar activeChat
    // porque la app pudo haber sido killed sin limpiar el campo
    const receiverData = receiverDoc.data();
    if (receiverData.activeChat === matchId) {
      const activeChatTs = receiverData.activeChatTimestamp;
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      const isStale = !activeChatTs || (activeChatTs.toMillis && activeChatTs.toMillis() < fiveMinutesAgo);

      if (isStale) {
        logger.warn(`Stale activeChat detected for ${receiverId} — activeChat=${matchId} but timestamp is old. Sending notification anyway.`);
        // Limpiar el activeChat stale
        await admin.firestore().collection('users').doc(receiverId).update({
          activeChat: admin.firestore.FieldValue.delete(),
          activeChatTimestamp: admin.firestore.FieldValue.delete(),
        });
      } else {
        logger.info(`Skipping notification: receiver ${receiverId} has activeChat=${matchId}`);
        await snapshot.ref.update({
          notificationSent: false,
          notificationAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
          notificationSkipReason: 'receiver_in_chat'
        });
        return;
      }
    }

    const senderName = senderDoc.exists ? senderDoc.data().name : 'Usuario';
    const fcmToken = receiverData.fcmToken;

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
        priority: 'high',
        notification: {
          // Android: título localizado con nombre del remitente  
          titleLocKey: 'notification_new_message_title',
          titleLocArgs: [senderName],
          // Body: mensaje genérico localizado (sin contenido real del mensaje)
          bodyLocKey: 'notification_new_message_body',
          sound: 'default',
          channelId: 'default_channel',
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
// ─────────────────────────────────────────────────────────────────────────────
// UNMATCH USER
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Callable: Deshacer match entre dos usuarios.
 * Payload: { matchId, otherUserId, language }
 * Response: { success, messagesDeleted }
 * Homologado: iOS FirestoreRemoteDataSource.unmatchUser / Android MatchFirebaseDataSourceImpl
 */
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

    // También borrar de la subcollección swipes si existe
    if (otherUserId) {
      await Promise.allSettled([
        db.collection('users').doc(currentUserId).collection('swipes').doc(otherUserId).delete(),
        db.collection('users').doc(otherUserId).collection('swipes').doc(currentUserId).delete(),
      ]);
    }

    logger.info(`[unmatchUser] Match ${matchId} deleted, ${messagesDeleted} messages removed`);
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
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || defineSecret('GEMINI_API_KEY').value());
        const model = genAI.getGenerativeModel({model: AI_MODEL_LITE, generationConfig: {maxOutputTokens: 256, responseMimeType: 'application/json'}});
        const result = await model.generateContent(aiPrompt);
        const responseText = result.response.text();
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          aiAnalysis = JSON.parse(jsonMatch[0]);
          // Si la IA recomienda suspensión con alta confianza, escalar
          if (aiAnalysis.shouldSuspend && aiAnalysis.confidence >= 0.8) {
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
exports.createStory = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {imageUrl, matchId, matchParticipants} = request.data || {};
    const senderId = request.auth.uid;
    if (!imageUrl) throw new Error('imageUrl is required');

    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000);

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
          storiesStatus[doc.data().senderId] = true;
        });
      } catch (e) {
        logger.warn(`[getBatchStoryStatus] Error for chunk: ${e.message}`);
      }
    }

    logger.info(`[getBatchStoryStatus] Checked ${userIds.length} users`);
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
exports.validateProfileImage = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {imageUrl} = request.data || {};
    if (!imageUrl) throw new Error('imageUrl is required');

    // Validación básica de URL de Storage de Firebase
    const isFirebaseStorage = imageUrl.includes('firebasestorage.googleapis.com') ||
                               imageUrl.includes('storage.googleapis.com');
    if (!isFirebaseStorage && !imageUrl.startsWith('https://')) {
      return {valid: false, reason: 'invalid_url', scores: {}};
    }

    // En producción se conectaría a Cloud Vision API / Vertex AI
    // Por ahora retornamos aprobación (la moderación real se hace en moderateProfileImage)
    logger.info(`[validateProfileImage] Validated: ${imageUrl}`);
    return {
      valid: true,
      reason: 'approved',
      scores: {safe: 0.99, explicit: 0.01, violence: 0.01},
    };
  },
);

/**
 * Callable: Moderar imagen de perfil o story con Gemini AI.
 * Payload: { imageBase64, expectedGender?, userLanguage?, isStory? }
 * Response: { approved, reason, confidence, categories, category }
 * Homologado: iOS ContentModerationService / Android ContentModerationService
 */
exports.moderateProfileImage = onCall(
  {region: 'us-central1', memory: '512MiB', timeoutSeconds: 60, secrets: [geminiApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {imageBase64, expectedGender, userLanguage, isStory} = request.data || {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      throw new Error('imageBase64 is required');
    }

    const language = (userLanguage || 'en').toLowerCase();
    const isSpanish = language.startsWith('es');

    logger.info(`[moderateProfileImage] isStory=${!!isStory}, lang=${language}, gender=${expectedGender}`);

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        logger.error('[moderateProfileImage] GEMINI_API_KEY not configured');
        // Fail-open for profile, fail-closed for story
        return isStory
          ? {approved: false, reason: 'AI moderation unavailable', confidence: 0, categories: [], category: 'error'}
          : {approved: true, reason: 'AI moderation unavailable', confidence: 0, categories: [], category: 'error'};
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({model: AI_MODEL_LITE, generationConfig: {maxOutputTokens: 512, responseMimeType: 'application/json'}});

      const prompt = isStory
        ? buildStoryImagePrompt(language, isSpanish)
        : buildProfileImagePrompt(language, isSpanish, expectedGender);

      const result = await model.generateContent([
        prompt,
        {inlineData: {data: imageBase64, mimeType: 'image/jpeg'}},
      ]);

      const responseText = result.response.text();
      logger.info(`[moderateProfileImage] Gemini response: ${responseText.substring(0, 200)}`);

      const parsed = parseGeminiJsonResponse(responseText);
      const approved = !!parsed.approved;
      const reason = parsed.reason || '';
      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : (approved ? 1.0 : 0.9);
      const categories = Array.isArray(parsed.categories) ? parsed.categories : [];
      const category = parsed.category || (categories.length > 0 ? categories[0] : (approved ? 'approved' : 'other'));

      return {approved, reason, confidence, categories, category};
    } catch (error) {
      logger.error('[moderateProfileImage] Error:', error);
      // Fail-open for profile photos, fail-closed for stories
      if (isStory) {
        return {approved: false, reason: 'moderation_error', confidence: 0, categories: [], category: 'error'};
      }
      return {approved: true, reason: 'moderation_error', confidence: 0, categories: [], category: 'error'};
    }
  },
);

/**
 * Callable: Moderar texto (mensaje de chat o biografía) con Gemini AI.
 * Payload: { message, language?, type?, matchId? }
 *   type: "biography" | "message" (default: "message" for backward compat)
 * Response: { approved, reason, category, confidence }
 * Homologado: iOS ContentModerationService / Android ContentModerationService / ChatViewModel
 */
exports.moderateMessage = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 30, secrets: [geminiApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {message, language, type, matchId} = request.data || {};
    if (!message || typeof message !== 'string') {
      return {approved: true, reason: 'empty_message', category: 'approved', confidence: 1.0};
    }

    const lang = (language || 'en').toLowerCase();
    const isSpanish = lang.startsWith('es');
    const moderationType = (type || 'message').toLowerCase();

    logger.info(`[moderateMessage] type=${moderationType}, lang=${lang}, len=${message.length}`);

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        logger.error('[moderateMessage] GEMINI_API_KEY not configured');
        return {approved: true, reason: 'AI moderation unavailable', category: 'error', confidence: 0};
      }

      // Retrieve moderation knowledge via RAG (config cached 5min)
      const modConfig = await getModerationConfig();
      const ragContext = await retrieveModerationKnowledge(message, apiKey, lang, moderationType, modConfig.rag || {});

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({model: AI_MODEL_LITE, generationConfig: {maxOutputTokens: 256, responseMimeType: 'application/json'}});

      const prompt = moderationType === 'biography'
        ? buildBioModerationPrompt(message, lang, isSpanish, ragContext)
        : buildMessageModerationPrompt(message, lang, isSpanish, ragContext);

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      logger.info(`[moderateMessage] Gemini response: ${responseText.substring(0, 200)}`);

      const parsed = parseGeminiJsonResponse(responseText);
      const approved = !!parsed.approved;
      // Support both "allowed" (iOS CF compat) and "approved" fields
      const isAllowed = parsed.allowed !== undefined ? !!parsed.allowed : approved;
      const reason = parsed.reason || '';
      const category = (parsed.category || (isAllowed ? 'approved' : 'other')).toLowerCase();
      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : (isAllowed ? 1.0 : 0.9);

      return {approved: isAllowed, reason, category, confidence};
    } catch (error) {
      logger.error('[moderateMessage] Error:', error);
      // Fail-open: approve on error (aligned with client behavior)
      return {approved: true, reason: 'moderation_error', category: 'error', confidence: 0};
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// MODERATION HELPERS — Prompts y parsing para moderación con Gemini
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Obtiene la instrucción de idioma para el prompt de Gemini.
 */
function getLanguageInstruction(lang) {
  if (lang.startsWith('zh')) return '重要提示：请用中文回答所有内容。';
  if (lang.startsWith('ar')) return 'مهم: أجب على كل شيء بالعربية.';
  if (lang.startsWith('id') || lang.startsWith('ms')) return 'PENTING: Jawab SEMUA dalam Bahasa Indonesia.';
  if (lang.startsWith('pt')) return 'IMPORTANTE: Responda TUDO em português.';
  if (lang.startsWith('fr')) return 'IMPORTANT: Répondez à TOUT en français.';
  if (lang.startsWith('ja')) return '重要：すべて日本語で回答してください。';
  if (lang.startsWith('ru')) return 'ВАЖНО: Отвечайте на ВСЁ на русском языке.';
  if (lang.startsWith('de')) return 'WICHTIG: Antworten Sie auf ALLES auf Deutsch.';
  if (lang.startsWith('es')) return 'IMPORTANTE: Responde TODO en ESPAÑOL.';
  return 'IMPORTANT: Respond EVERYTHING in ENGLISH.';
}

/**
 * Construye prompt estricto para fotos de perfil.
 * Homologado con ContentModerationService.kt moderateImage() y ContentModerationService.swift
 */
function buildProfileImagePrompt(lang, isSpanish, expectedGender) {
  const languageInstruction = getLanguageInstruction(lang);

  let genderInstruction = '';
  if (expectedGender !== null && expectedGender !== undefined) {
    if (isSpanish) {
      genderInstruction = expectedGender
        ? '\n- El género de la persona NO corresponde al esperado (se esperaba MASCULINO)'
        : '\n- El género de la persona NO corresponde al esperado (se esperaba FEMENINO)';
    } else {
      genderInstruction = expectedGender
        ? '\n- The person\'s gender does NOT match the expected one (expected MALE)'
        : '\n- The person\'s gender does NOT match the expected one (expected FEMALE)';
    }
  }

  let genderApproval = '';
  if (expectedGender !== null && expectedGender !== undefined) {
    genderApproval = isSpanish
      ? '\n- El género de la persona corresponde al esperado'
      : '\n- The person\'s gender matches the expected one';
  }

  if (isSpanish) {
    return `Analiza esta imagen para una app de citas (estilo Tinder) y determina si es apropiada.

RECHAZAR si contiene:
- Desnudez o contenido sexual explícito
- Violencia o contenido gráfico
- Símbolos de odio o discriminación
- Menores de edad
- Rostros poco claros (la persona principal debe ser claramente visible)
- Contenido ofensivo o inapropiado${genderInstruction}

APROBAR si:
- Muestra claramente el rostro de una persona adulta
- Es una foto apropiada para perfil de citas
- Los LENTES/GAFAS están permitidos
- Accesorios (sombreros, gorras, bufandas ligeras) están permitidos siempre que el rostro sea visible
- MÚLTIPLES PERSONAS están permitidas (fotos con amigos, familia, etc. son aceptables)
- No contiene contenido inapropiado${genderApproval}

${languageInstruction}

Responde SOLO en formato JSON:
{
    "approved": true/false,
    "reason": "explicación breve en español si se rechaza",
    "confidence": 0.0-1.0,
    "categories": ["lista", "de", "problemas", "en", "español"],
    "category": "nudity|violence|underage|unclear_face|screenshot|low_quality|offensive|celebrity|approved"
}`;
  }

  return `Analyze this image for a dating app (Tinder style) and determine if it's appropriate.

REJECT if it contains:
- Nudity or explicit sexual content
- Violence or graphic content
- Hate symbols or discrimination
- Minors
- Unclear faces (the main person's face must be clearly visible)
- Offensive or inappropriate content${genderInstruction}

APPROVE if:
- Clearly shows the face of an adult person
- Is an appropriate photo for a dating profile
- GLASSES/EYEWEAR are allowed
- Accessories (hats, caps, light scarves) are allowed as long as the face is visible
- MULTIPLE PEOPLE are allowed (photos with friends, family, etc. are acceptable)
- Does not contain inappropriate content${genderApproval}

${languageInstruction}

Respond ONLY in JSON format:
{
    "approved": true/false,
    "reason": "brief explanation if rejected",
    "confidence": 0.0-1.0,
    "categories": ["list", "of", "issues"],
    "category": "nudity|violence|underage|unclear_face|screenshot|low_quality|offensive|celebrity|approved"
}`;
}

/**
 * Construye prompt permisivo para stories/historias.
 * Homologado con ContentModerationService.kt moderateStoryImage()
 */
function buildStoryImagePrompt(lang, isSpanish) {
  const languageInstruction = getLanguageInstruction(lang);

  if (isSpanish) {
    return `Analiza esta imagen para una HISTORIA/STORY de app de citas y determina si es apropiada.

RECHAZAR SOLO si contiene:
- Desnudez o contenido sexual explícito
- Violencia gráfica o contenido perturbador
- Símbolos de odio, racismo o discriminación
- Propaganda política o contenido divisivo
- Spam o publicidad comercial excesiva
- Drogas ilegales o consumo de sustancias
- Armas de fuego (armas blancas decorativas están permitidas)
- Contenido ofensivo o lenguaje de odio visible

APROBAR TODO lo demás, incluyendo:
- Paisajes, naturaleza, lugares
- Comida, bebidas, restaurantes
- Objetos, productos (sin publicidad excesiva)
- Animales, mascotas
- Arte, pinturas, esculturas
- Selfies, fotos con amigos/familia
- Fotos SIN personas o SIN rostros visibles
- Pantallas de computadora, escritorios
- Vehículos, autos, motos
- Actividades deportivas, gym, ejercicio
- Eventos sociales, fiestas (sin contenido inapropiado)
- Viajes, turismo, aventuras

IMPORTANTE: Las historias son contenido temporal y casual.
NO se requiere que muestre rostros o personas.
Se permite TODO contenido apropiado y seguro.

${languageInstruction}

Responde SOLO en formato JSON:
{
    "approved": true/false,
    "reason": "explicación breve si se rechaza",
    "confidence": 0.0-1.0,
    "categories": ["lista", "de", "problemas"],
    "category": "nudity|violence|hate|drugs|spam|offensive|approved"
}`;
  }

  return `Analyze this image for a dating app STORY/HISTORIA and determine if it's appropriate.

REJECT ONLY if it contains:
- Nudity or explicit sexual content
- Graphic violence or disturbing content
- Hate symbols, racism, or discrimination
- Political propaganda or divisive content
- Spam or excessive commercial advertising
- Illegal drugs or substance abuse
- Firearms (decorative bladed weapons are allowed)
- Offensive content or visible hate speech

APPROVE everything else, including:
- Landscapes, nature, places
- Food, drinks, restaurants
- Objects, products (without excessive advertising)
- Animals, pets
- Art, paintings, sculptures
- Selfies, photos with friends/family
- Photos WITHOUT people or WITHOUT visible faces
- Computer screens, desks
- Vehicles, cars, motorcycles
- Sports activities, gym, exercise
- Social events, parties (without inappropriate content)
- Travel, tourism, adventures

IMPORTANT: Stories are temporary and casual content.
Faces or people are NOT required.
ALL appropriate and safe content is allowed.

${languageInstruction}

Respond ONLY in JSON format:
{
    "approved": true/false,
    "reason": "brief explanation if rejected",
    "confidence": 0.0-1.0,
    "categories": ["list", "of", "issues"],
    "category": "nudity|violence|hate|drugs|spam|offensive|approved"
}`;
}

/**
 * Construye prompt para moderación de biografías.
 * Homologado con ContentModerationService.kt moderateText(BIOGRAPHY)
 */
function buildBioModerationPrompt(text, lang, isSpanish, ragContext = '') {
  const languageInstruction = getLanguageInstruction(lang);

  if (isSpanish) {
    return `Analiza esta biografía de perfil de aplicación de citas y determina si es apropiada.

Texto: "${text}"

RECHAZA si contiene:
- Contenido sexual explícito o lenguaje vulgar
- Información de contacto (teléfono, email, redes sociales)
- Spam o publicidad
- Lenguaje de odio o discriminación
- Solicitudes de dinero o estafas
- Amenazas o intimidación
- Información personal sensible (dirección, DNI, etc.)

APRUEBA si:
- Es una descripción personal apropiada
- No contiene nada de lo anterior
${ragContext}
${languageInstruction}

Responde SOLO con JSON:
{
  "approved": true/false,
  "reason": "Motivo del rechazo en español o 'approved'",
  "category": "sexual|contact_info|spam|hate_speech|scam|threats|personal_info|approved",
  "confidence": 0.0-1.0
}`;
  }

  return `Analyze this dating app profile biography and determine if it's appropriate.

Text: "${text}"

REJECT if it contains:
- Explicit sexual content or vulgar language
- Contact information (phone, email, social media)
- Spam or advertising
- Hate speech or discrimination
- Money requests or scams
- Threats or intimidation
- Sensitive personal information (address, ID, etc.)

APPROVE if:
- It's an appropriate personal description
- Doesn't contain any of the above
${ragContext}
${languageInstruction}

Respond ONLY with JSON:
{
  "approved": true/false,
  "reason": "Rejection reason or 'approved'",
  "category": "sexual|contact_info|spam|hate_speech|scam|threats|personal_info|approved",
  "confidence": 0.0-1.0
}`;
}

/**
 * Construye prompt para moderación de mensajes de chat.
 * Homologado con ContentModerationService.kt moderateText(MESSAGE)
 */
function buildMessageModerationPrompt(text, lang, isSpanish, ragContext = '') {
  const languageInstruction = getLanguageInstruction(lang);

  if (isSpanish) {
    return `Analiza este mensaje de chat en una app de citas sugar y determina si es apropiado.

Mensaje: "${text}"

CONTEXTO: Esta es una app de citas sugar (Black Sugar 21). El coqueteo, discutir expectativas de relación y estilo de vida es NORMAL y PERMITIDO.

RECHAZA si contiene:
- Acoso o lenguaje abusivo
- Contenido sexual explícito no solicitado
- Spam o enlaces sospechosos
- Amenazas o intimidación
- Lenguaje de odio o discriminación
- Solicitudes directas de dinero con links de pago

APRUEBA si es un mensaje normal de conversación, coqueteo, o discusión de expectativas de relación.
${ragContext}
${languageInstruction}

Responde SOLO con JSON:
{
  "approved": true/false,
  "reason": "Motivo del rechazo en español o 'approved'",
  "category": "harassment|sexual|spam|threats|hate_speech|scam|approved",
  "confidence": 0.0-1.0
}`;
  }

  return `Analyze this chat message in a sugar dating app and determine if it's appropriate.

Message: "${text}"

CONTEXT: This is a sugar dating app (Black Sugar 21). Flirting, discussing relationship expectations, and lifestyle is NORMAL and ALLOWED.

REJECT if it contains:
- Harassment or abusive language
- Unsolicited explicit sexual content
- Spam or suspicious links
- Threats or intimidation
- Hate speech or discrimination
- Direct money requests with payment links

APPROVE if it's a normal conversation message, flirting, or relationship expectations discussion.
${ragContext}
${languageInstruction}

Respond ONLY with JSON:
{
  "approved": true/false,
  "reason": "Rejection reason or 'approved'",
  "category": "harassment|sexual|spam|threats|hate_speech|scam|approved",
  "confidence": 0.0-1.0
}`;
}

/**
 * Normalizes any category string to one of the 14 canonical Google Places
 * categories used by iOS/Android coach & chat UI filters: cafe, restaurant,
 * bar, night_club, movie_theater, park, museum, bowling_alley, art_gallery,
 * bakery, shopping_mall, spa, aquarium, zoo.
 */
function normalizeCategory(cat) {
  if (!cat) return 'restaurant';
  const c = cat.toLowerCase();
  if (/\bcafe\b|coffee|coffeehouse|tea_house/i.test(c)) return 'cafe';
  if (/\bbar\b|pub\b|lounge|speakeasy|cocktail|jazz|wine_bar|brewery|taproom/i.test(c)) return 'bar';
  if (/night_?club|disco|club_nocturno|dancehall/i.test(c)) return 'night_club';
  if (/movie|cinema|cine\b|theater(?!.*museum)|theatre(?!.*museum)/i.test(c)) return 'movie_theater';
  if (/\bpark\b|garden|trail|beach|playa|hik|nature|viewpoint|picnic|botanical|lake|river|scenic|outdoor/i.test(c)) return 'park';
  if (/museum|exhibit|cultural|historical/i.test(c)) return 'museum';
  if (/bowling/i.test(c)) return 'bowling_alley';
  if (/gallery|art_gallery/i.test(c)) return 'art_gallery';
  if (/bakery|pastry|pastel|panaderia|patisserie/i.test(c)) return 'bakery';
  if (/shopping|mall|store|tienda|market(?!.*super)/i.test(c)) return 'shopping_mall';
  if (/\bspa\b|yoga|wellness|massage|meditation|sauna|pilates|thermal/i.test(c)) return 'spa';
  if (/aquarium|acuario/i.test(c)) return 'aquarium';
  if (/\bzoo\b|zoolog/i.test(c)) return 'zoo';
  if (/restaurant|dining|food|pizza|sushi|bistro|grill|steakhouse|brunch|diner|ramen|taco|burger|seafood|buffet/i.test(c)) return 'restaurant';
  return 'restaurant';
}

const categoryEmojiMap = {cafe: '☕', restaurant: '🍽️', bar: '🍺', night_club: '💃', movie_theater: '🎬', park: '🌳', museum: '🏛️', bowling_alley: '🎳', art_gallery: '🎨', bakery: '🥐', shopping_mall: '🛍️', spa: '💆', aquarium: '🐠', zoo: '🦁'};

/**
 * Parsea respuesta JSON de Gemini, extrayendo el JSON de posible markdown.
 */
function parseGeminiJsonResponse(responseText) {
  let cleanText = responseText.trim();
  // Extract from ```json ``` blocks (handles both closed and unclosed)
  const jsonBlockMatch = cleanText.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    cleanText = jsonBlockMatch[1];
  } else {
    // Handle unclosed ```json blocks
    const unclosedMatch = cleanText.match(/```json\s*([\s\S]*)/);
    if (unclosedMatch) {
      cleanText = unclosedMatch[1].trim();
    }
    // Try to find raw JSON object
    const startIdx = cleanText.indexOf('{');
    const endIdx = cleanText.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      cleanText = cleanText.substring(startIdx, endIdx + 1);
    }
  }
  return JSON.parse(cleanText);
}

/**
 * Callable: Generar sugerencias de intereses con Gemini AI.
 * Payload: { bio?, userType? }
 * Response: { success, suggestions: [string] }
 * Android-only por ahora (editprofile legacy VM)
 */
exports.generateInterestSuggestions = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 30, secrets: [geminiApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {bio, userType} = request.data || {};

    const validInterests = [
      'interest_travel_adventures', 'interest_shopping_fashion', 'interest_fine_dining',
      'interest_art_culture', 'interest_fitness_wellness', 'interest_education_growth',
      'interest_exclusive_events', 'interest_spa_relaxation', 'interest_music_concerts',
      'interest_beach_vacation', 'interest_dancing_nightlife', 'interest_mentorship_business',
      'interest_luxury_experiences', 'interest_international_travel', 'interest_gourmet_cuisine',
      'interest_art_collecting', 'interest_golf_premium_sports', 'interest_vip_events',
      'interest_vip_clubs', 'interest_philanthropy', 'interest_wine_spirits',
      'interest_sailing_yachting', 'interest_business_networking', 'interest_real_estate_investments',
      'interest_movies_theater', 'interest_photography', 'interest_books_reading',
      'interest_cooking', 'interest_yoga_meditation', 'interest_nature_outdoors',
    ];

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        logger.error('[generateInterestSuggestions] GEMINI_API_KEY not configured');
        return {success: false, suggestions: []};
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({model: AI_MODEL_LITE, generationConfig: {maxOutputTokens: 256, responseMimeType: 'application/json'}});

      const userBio = (bio || '').substring(0, 200);
      const prompt = `Suggest 5 interest IDs for a ${userType || 'user'} on a premium dating app.
User bio: "${userBio}"
Return ONLY a JSON array of strings from this list (exact keys):
${JSON.stringify(validInterests)}
Return only the JSON array, no explanation.`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();
      logger.info(`[generateInterestSuggestions] Gemini response: ${responseText.substring(0, 200)}`);

      // Parse JSON array from response
      let suggested = [];
      try {
        const parsed = JSON.parse(responseText.replace(/```json\s*|\s*```/g, '').trim());
        if (Array.isArray(parsed)) {
          suggested = parsed.filter((s) => validInterests.includes(s)).slice(0, 5);
        }
      } catch (_e) {
        // Fallback: regex extraction
        const regex = /"(interest_[^"]+)"/g;
        let match;
        while ((match = regex.exec(responseText)) !== null) {
          if (validInterests.includes(match[1])) suggested.push(match[1]);
        }
        suggested = suggested.slice(0, 5);
      }

      return {success: true, suggestions: suggested};
    } catch (error) {
      logger.error('[generateInterestSuggestions] Error:', error);
      return {success: false, suggestions: []};
    }
  },
);

/**
 * Callable: Analizar foto antes de subirla.
 * Payload: { imageBase64?, imageUrl? }
 * Response: { approved, reason, score }
 * Homologado: iOS PhotoAnalyzerService.analyzePhotoBeforeUpload
 */
exports.analyzePhotoBeforeUpload = onCall(
  {region: 'us-central1', memory: '512MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {imageUrl} = request.data || {};
    // En producción usar Cloud Vision API
    logger.info(`[analyzePhotoBeforeUpload] Analyzed photo for user ${request.auth.uid}`);
    return {approved: true, reason: 'photo_approved', score: 0.95};
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// AI FUNCTIONS — Análisis, compatibilidad, consejos, sugerencias
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Callable: Analizar perfil con IA para recomendaciones.
 * Payload: { userId, profileData? }
 * Response: { analysis, recommendations, score }
 * Homologado: iOS ProfileCardRepository / Android ProfileRepositoryImp
 */
exports.analyzeProfileWithAI = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {userId} = request.data || {};
    const targetId = userId || request.auth.uid;
    const db = admin.firestore();

    const userDoc = await db.collection('users').doc(targetId).get();
    if (!userDoc.exists) throw new Error('User not found');

    const user = userDoc.data();
    const recommendations = [];
    let score = 70;

    if (!user.bio || user.bio.length < 20) {
      recommendations.push('Añade una bio más detallada para mejorar tus matches');
      score -= 10;
    }
    const photoCount = Array.isArray(user.pictures) ? user.pictures.length : 1;
    if (photoCount < 3) {
      recommendations.push(`Añade más fotos (tienes ${photoCount}, se recomiendan al menos 3)`);
      score -= 10;
    }
    if (!user.interests || (Array.isArray(user.interests) && user.interests.length < 3)) {
      recommendations.push('Añade más intereses para mejorar la compatibilidad');
      score -= 5;
    }

    logger.info(`[analyzeProfileWithAI] Profile score=${score} for ${targetId}`);
    return {
      success: true,
      score: Math.max(score, 30),
      analysis: 'Perfil analizado con éxito',
      recommendations,
      photoCount,
    };
  },
);

/**
 * Callable: Calcular puntuación de seguridad de conversación.
 * Payload: { userId, messages?, conversationId? }
 * Response: { score, flags, riskLevel }
 * Homologado: iOS SafetyScoreService.calculateSafetyScore
 */
exports.calculateSafetyScore = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {messages} = request.data || {};
    const flags = [];
    let score = 100;

    if (Array.isArray(messages)) {
      const redTerms = ['address', 'where do you live', 'send money', 'venmo', 'paypal', 'onlyfans'];
      messages.forEach((msg) => {
        const text = (typeof msg === 'string' ? msg : msg.message || '').toLowerCase();
        redTerms.forEach((term) => {
          if (text.includes(term)) {
            flags.push(term);
            score -= 15;
          }
        });
      });
    }

    score = Math.max(score, 0);
    const riskLevel = score > 70 ? 'low' : score > 40 ? 'medium' : 'high';
    logger.info(`[calculateSafetyScore] score=${score}, flags=${flags.length}`);
    return {score, flags: [...new Set(flags)], riskLevel, success: true};
  },
);

/**
 * Callable: Analizar química de conversación entre dos usuarios.
 * Payload: { messages, userId1?, userId2? }
 * Response: { score, insights, level }
 * Homologado: iOS ChemistryDetectorService.analyzeConversationChemistry
 */
exports.analyzeConversationChemistry = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {messages} = request.data || {};
    let score = 50;
    const insights = [];

    if (Array.isArray(messages) && messages.length > 0) {
      score = Math.min(50 + messages.length * 2, 100);
      if (messages.length > 20) insights.push('Gran cantidad de mensajes — buena señal de interés mutuo');
      if (messages.length > 5) insights.push('La conversación está fluyendo bien');
    } else {
      insights.push('Inicia la conversación para desbloquear el análisis de química');
    }

    const level = score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low';
    logger.info(`[analyzeConversationChemistry] score=${score}, level=${level}`);
    return {success: true, score, level, insights};
  },
);

/**
 * Callable: Generar respuesta inteligente basada en el contexto del chat.
 * Payload: { messages, context?, matchId? }
 * Response: { reply, alternatives }
 * Homologado: iOS AIWingmanService.generateSmartReply
 */
exports.generateSmartReply = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {messages} = request.data || {};

    // En producción usar Vertex AI / Gemini API
    const lastMessage = Array.isArray(messages) && messages.length > 0
      ? (typeof messages[messages.length - 1] === 'string' ? messages[messages.length - 1] : messages[messages.length - 1].message || '')
      : '';

    const replies = [
      '¡Eso suena genial! Cuéntame más 😊',
      '¡Qué interesante! ¿Y tú qué opinas?',
      'Me encanta cómo piensas 💫',
      '¡Totalmente de acuerdo!',
      '¿Cuándo podríamos conocernos en persona? ☕',
    ];

    const reply = replies[Math.floor(Math.random() * replies.length)];
    logger.info(`[generateSmartReply] Generated reply for user ${request.auth.uid}`);
    return {success: true, reply, alternatives: replies.filter((r) => r !== reply).slice(0, 3)};
  },
);

/**
 * Callable: Analizar compatibilidad de personalidades entre dos usuarios.
 * Payload: { userId1, userId2 }
 * Response: { score, analysis, traits }
 * Homologado: iOS/Android AIEnhancedMatchingService
 */
exports.analyzePersonalityCompatibility = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    // ✅ Homologado: iOS/Android envían {userId, targetUserId} — aceptar ambas nomenclaturas
    const d = request.data || {};
    const uid1 = d.userId || d.userId1;
    const uid2 = d.targetUserId || d.userId2;
    if (!uid1 || !uid2) throw new Error('userId and targetUserId required');

    const db = admin.firestore();
    const [u1Doc, u2Doc] = await Promise.all([
      db.collection('users').doc(uid1).get(),
      db.collection('users').doc(uid2).get(),
    ]);

    let overallScore = 60;
    const strengths = [];
    if (u1Doc.exists && u2Doc.exists) {
      const u1 = u1Doc.data();
      const u2 = u2Doc.data();
      const i1 = new Set((u1.interests || []).map(String));
      const i2 = (u2.interests || []).map(String);
      const common = i2.filter((i) => i1.has(i));
      overallScore = Math.min(60 + common.length * 5, 100);
      if (common.length > 0) strengths.push(`${common.length} intereses en común`);
    }

    // ✅ Respuesta homologada: iOS/Android leen resultData["analysis"] como dict
    return {
      success: true,
      analysis: {
        overallScore,
        valuesCompatibility: Math.round(overallScore * 0.9),
        interestsCompatibility: Math.round(overallScore * 1.05),
        communicationStyle: Math.round(overallScore * 0.95),
        conversationProbability: Math.round(overallScore * 0.85),
        strengths,
        redFlags: [],
      },
    };
  },
);

/**
 * Callable: Predecir probabilidad de éxito del match.
 * Payload: { userId1, userId2 }
 * Response: { probability, factors }
 * Homologado: iOS/Android AIEnhancedMatchingService
 */
exports.predictMatchSuccess = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    // ✅ Homologado: iOS/Android envían {userId, targetUserId}
    const d = request.data || {};
    const uid1 = d.userId || d.userId1;
    const uid2 = d.targetUserId || d.userId2;
    if (!uid1 || !uid2) throw new Error('userId and targetUserId required');

    const db = admin.firestore();
    const [u1Doc, u2Doc] = await Promise.all([
      db.collection('users').doc(uid1).get(),
      db.collection('users').doc(uid2).get(),
    ]);

    let matchProbability = 50;
    const riskFactors = [];

    if (u1Doc.exists && u2Doc.exists) {
      const u1 = u1Doc.data();
      const u2 = u2Doc.data();
      const i1 = new Set((u1.interests || []).map(String));
      const i2 = (u2.interests || []).map(String);
      const common = i2.filter((i) => i1.has(i));
      matchProbability = Math.min(50 + common.length * 5, 95);

      const ageDiff = Math.abs(calcAge(u1.birthDate) - calcAge(u2.birthDate));
      if (ageDiff > 10) riskFactors.push('Large age difference');
    }

    const recommendation = matchProbability >= 80 ? 'highly_recommended'
      : matchProbability >= 60 ? 'recommended' : 'neutral';

    // ✅ Respuesta homologada: iOS/Android leen resultData["prediction"] como dict
    return {
      success: true,
      prediction: {
        matchProbability,
        conversationProbability: Math.round(matchProbability * 0.9),
        longTermPotential: Math.round(matchProbability * 0.8),
        estimatedMessages: Math.round(matchProbability * 0.5),
        riskFactors,
        recommendation,
      },
    };
  },
);

/**
 * Callable: Generar starter de conversación entre dos usuarios.
 * Payload: { userId1, userId2 }
 * Response: { starter, alternatives }
 * Homologado: iOS/Android AIEnhancedMatchingService
 */
exports.generateConversationStarter = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const starterTexts = [
      {message: '¿Cuál es el lugar más increíble que has visitado? 🌍', reasoning: 'Travel shared experience', expectedResponse: 'A destination or travel story'},
      {message: 'Si pudieras hacer cualquier cosa este fin de semana, ¿qué sería? ☀️', reasoning: 'Reveals lifestyle', expectedResponse: 'Weekend plans or wishes'},
      {message: '¿Cuál es tu película favorita de todos los tiempos? 🎬', reasoning: 'Cultural common ground', expectedResponse: 'A movie title or genre'},
      {message: '¿Qué es lo que más te apasiona en la vida? ✨', reasoning: 'Shows depth of character', expectedResponse: 'A passion or goal'},
      {message: '¿Si pudieras viajar a cualquier lugar ahora mismo, adónde irías? ✈️', reasoning: 'Dream exploration', expectedResponse: 'A place or reason'},
    ];
    const idx = Math.floor(Math.random() * starterTexts.length);
    const chosen = starterTexts[idx];
    const rest = starterTexts.filter((_, i) => i !== idx);
    // ✅ Respuesta homologada: iOS/Android leen resultData["suggestions"]["starters"] como [[String:Any]]
    return {
      success: true,
      suggestions: {
        starters: [chosen, ...rest],
      },
    };
  },
);

/**
 * Callable: Optimizar fotos de perfil con IA.
 * Payload: { userId, photos? }
 * Response: { recommendations, orderedPhotos }
 * Homologado: iOS/Android AIEnhancedMatchingService
 */
exports.optimizeProfilePhotos = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {photos, userId} = request.data || {};
    const photoList = Array.isArray(photos) ? photos : [];
    // ✅ Respuesta homologada: iOS/Android leen optimizedOrder:[String] y scores:[{url,...}]
    const scores = photoList.map((url, i) => ({
      url: typeof url === 'string' ? url : String(url),
      visualQuality: 75,
      faceClarity: 80,
      aesthetic: 70,
      engagement: 72,
      isPrimaryCandidate: i === 0,
      overallScore: 75,
    }));
    return {
      success: true,
      optimizedOrder: photoList.map((u) => (typeof u === 'string' ? u : String(u))),
      scores,
    };
  },
);

/**
 * Callable: Encontrar perfiles similares.
 * Payload: { userId }
 * Response: { profileIds }
 * Homologado: iOS/Android AIEnhancedMatchingService
 */
exports.findSimilarProfiles = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {userId} = request.data || {};
    const uid = userId || request.auth.uid;

    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return {success: true, matches: []};

    const user = userDoc.data();
    const interests = user.interests || [];
    // ✅ FIX: Obtener lista de bloqueados del usuario actual para excluirlos
    const userBlockedArray = Array.isArray(user.blocked) ? user.blocked : [];

    // Buscar perfiles con intereses similares
    let snap = {docs: []};
    if (interests.length > 0) {
      snap = await db.collection('users')
        .where('accountStatus', '==', 'active')
        .where('paused', '==', false)
        .limit(20)
        .get().catch(() => ({docs: []}));
    }

    const interestSet = new Set((interests || []).map(String));
    const REVIEWER_UID = 'g4Zbr8tEguMcpZonw72xM5MGse32';
    // ✅ Respuesta homologada: iOS/Android leen resultData["matches"] como [{userId, similarity}]
    const matches = snap.docs
      .filter((d) => {
        if (d.id === uid) return false;
        const data = d.data();
        // ✅ Excluir perfiles test/reviewer: solo visibles para el reviewer
        if ((data.isTest === true || data.isReviewer === true) && uid !== REVIEWER_UID) return false;
        // ✅ Excluir usuarios con accountStatus inactivo
        if ((data.accountStatus || 'active') !== 'active') return false;
        // ✅ Excluir usuarios que el usuario actual ha bloqueado
        if (userBlockedArray.includes(d.id)) return false;
        // ✅ FIX: Bloqueo bidireccional — excluir si el candidato bloqueó al usuario actual
        const candidateBlocked = Array.isArray(data.blocked) ? data.blocked : [];
        if (candidateBlocked.includes(uid)) return false;
        // ✅ FIX: Excluir usuarios con visibilidad reducida
        if (data.visibilityReduced === true) return false;
        return true;
      })
      .slice(0, 10)
      .map((d) => {
        const data = d.data();
        const candidateInterests = (data.interests || []).map(String);
        const common = candidateInterests.filter((i) => interestSet.has(i));
        const similarity = Math.min(50 + common.length * 10, 100);
        return {userId: d.id, similarity};
      });

    return {success: true, matches};
  },
);

/**
 * Callable: Obtener puntuación de compatibilidad mejorada con IA.
 * Payload: { userId1, userId2 }
 * Response: { score, breakdown }
 * Homologado: iOS/Android AIEnhancedMatchingService
 */
exports.getEnhancedCompatibilityScore = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    // ✅ Homologado: iOS/Android envían {currentUserId, candidateId}
    const d = request.data || {};
    const uid1 = d.currentUserId || d.userId1;
    const uid2 = d.candidateId || d.userId2;
    if (!uid1 || !uid2) throw new Error('currentUserId and candidateId required');

    const db = admin.firestore();
    const [u1Doc, u2Doc] = await Promise.all([
      db.collection('users').doc(uid1).get(),
      db.collection('users').doc(uid2).get(),
    ]);

    let baseScore = 50;
    let interestsScore = 0;

    if (u1Doc.exists && u2Doc.exists) {
      const u1 = u1Doc.data();
      const u2 = u2Doc.data();
      const i1 = new Set((u1.interests || []).map(String));
      const i2 = (u2.interests || []).map(String);
      const common = i2.filter((i) => i1.has(i));
      interestsScore = Math.min(common.length * 10, 40);
      const distanceScore = 30;
      const ageScore = Math.max(30 - Math.abs(calcAge(u1.birthDate) - calcAge(u2.birthDate)) * 2, 0);
      baseScore = Math.min(interestsScore + distanceScore + ageScore, 100);
    }

    const aiScore = Math.round(baseScore * 0.3);
    const totalScore = Math.min(baseScore * 0.7 + aiScore, 100);

    // ✅ Respuesta homologada: iOS/Android leen totalScore, baseScore, aiScore, explanation
    return {
      success: true,
      totalScore,
      baseScore,
      aiScore,
      explanation: `Compatibilidad basada en ${interestsScore > 0 ? 'intereses comunes y' : ''} factores de perfil`,
    };
  },
);

/**
 * Callable: Detectar señales de alerta en perfil.
 * Payload: { userId }
 * Response: { flags, riskScore }
 * Homologado: iOS/Android AIEnhancedMatchingService
 */
exports.detectProfileRedFlags = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {userId} = request.data || {};
    const targetId = userId || request.auth.uid;

    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(targetId).get();
    const flags = [];
    let riskScore = 0;

    if (userDoc.exists) {
      const user = userDoc.data();
      if (!user.photoFileName && !Array.isArray(user.pictures)) {
        flags.push('no_profile_photo');
        riskScore += 20;
      }
      if (!user.bio || user.bio.length < 10) {
        flags.push('empty_bio');
        riskScore += 10;
      }
      if (user.visibilityReduced) {
        flags.push('previously_reported');
        riskScore += 30;
      }
    }

    riskScore = Math.min(riskScore, 100);
    // ✅ Respuesta homologada: iOS/Android leen hasRedFlags, flags, confidence, details
    return {
      success: true,
      hasRedFlags: flags.length > 0,
      flags,
      confidence: flags.length > 0 ? Math.min(flags.length * 30, 90) : 0,
      details: flags.length > 0 ? `Se detectaron ${flags.length} señal(es) de alerta` : 'Perfil sin señales de alerta',
      riskScore,
    };
  },
);

/**
 * Callable: Generar preguntas rompehielo personalizadas.
 * Payload: { userId1, userId2 }
 * Response: { icebreakers }
 * Homologado: iOS/Android AIEnhancedMatchingService
 */
exports.generateIcebreakers = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    // ✅ Respuesta homologada: iOS/Android leen resultData["starters"] como [String]
    const starters = [
      '¿Cuál es tu hobby secreto que pocas personas conocen? 🤫',
      '¿Cuál fue la última vez que intentaste algo nuevo? 🌟',
      '¿Café ☕ o té 🍵? ¿Y por qué?',
      '¿Qué serie estás viendo ahora mismo? 📺',
      '¿Cuál es tu lugar favorito en la ciudad? 🏙️',
    ];
    return {success: true, starters};
  },
);

/**
 * Callable: Predecir el momento óptimo para enviar mensajes.
 * Payload: { userId }
 * Response: { optimalTime, timezone, confidence }
 * Homologado: iOS OptimalTimeService / Android OptimalTimeService
 */
exports.predictOptimalMessageTime = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    // En producción analizar patrones de actividad del usuario
    const optimalHours = [19, 20, 21]; // 7pm-9pm son las horas pico habituales
    const optimalTime = optimalHours[Math.floor(Math.random() * optimalHours.length)];
    logger.info(`[predictOptimalMessageTime] Optimal hour: ${optimalTime}:00`);
    return {
      success: true,
      optimalTime: `${optimalTime}:00`,
      optimalHour: optimalTime,
      timezone: 'UTC-6',
      confidence: 0.75,
      reasoning: 'Los usuarios son más activos entre 7pm y 9pm',
    };
  },
);

/**
 * Callable: Obtener consejo de citas personalizado.
 * Payload: { context, topic? }
 * Response: { advice, tips }
 * Homologado: iOS DatingCoachService.getDatingAdvice
 */
exports.getDatingAdvice = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {topic} = request.data || {};

    const adviceMap = {
      'first_message': {
        advice: 'Haz una pregunta específica sobre algo de su perfil para mostrar que te interesan genuinamente',
        tips: ['Menciona un interés en común', 'Sé específico, no genérico', 'Termina con una pregunta abierta'],
      },
      'first_date': {
        advice: 'Elige un lugar cómodo y con buena conversación, evita el cine en la primera cita',
        tips: ['Toma café o un paseo', 'Escucha activamente', 'Sé tú mismo/a'],
      },
      'default': {
        advice: 'La autenticidad es la clave del éxito en las citas modernas',
        tips: ['Sé auténtico/a', 'Muestra interés genuino', 'No te presiones'],
      },
    };

    const selected = adviceMap[topic] || adviceMap['default'];
    logger.info(`[getDatingAdvice] Advice for topic=${topic || 'default'}`);
    return {success: true, ...selected};
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// DATE COACH CHAT — Conversational AI dating coach with Gemini
// ─────────────────────────────────────────────────────────────────────────────

// In-memory cache for reverse geocoded city names (per userId, TTL 30min)
const _cityCache = {};
const CITY_CACHE_TTL = 30 * 60 * 1000;

// In-memory cache for forward geocoded city → coordinates (keyed by normalized city name, TTL 30min)
const _forwardGeoCache = {};

/**
 * Reverse geocode lat/lng to city name using Google Geocoding API.
 * Returns cached value if available and fresh.
 * @param {number} lat
 * @param {number} lng
 * @param {string} userId - for caching
 * @return {Promise<string|null>} city name or null
 */
async function reverseGeocode(lat, lng, userId) {
  const cached = _cityCache[userId];
  if (cached && (Date.now() - cached.ts) < CITY_CACHE_TTL) return cached.city;
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&result_type=locality&language=en`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const result = data.results && data.results[0];
    const city = result ? (result.address_components || []).find((c) => (c.types || []).includes('locality'))?.long_name || null : null;
    _cityCache[userId] = {city, ts: Date.now()};
    return city;
  } catch (e) {
    logger.warn(`[reverseGeocode] Failed: ${e.message}`);
    return null;
  }
}

/**
 * Forward geocode a city/location name to coordinates using Google Geocoding API.
 * Returns cached value if available and fresh.
 * @param {string} cityName - city or area name to geocode
 * @return {Promise<{latitude: number, longitude: number}|null>} coordinates or null
 */
async function forwardGeocode(cityName) {
  if (!cityName || typeof cityName !== 'string' || cityName.trim().length < 2) return null;
  const normalized = cityName.trim().toLowerCase();
  const cached = _forwardGeoCache[normalized];
  if (cached && (Date.now() - cached.ts) < CITY_CACHE_TTL) return cached.coords;
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;
  try {
    const encoded = encodeURIComponent(cityName.trim());
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const result = data.results && data.results[0];
    if (!result || !result.geometry || !result.geometry.location) return null;
    const coords = {latitude: result.geometry.location.lat, longitude: result.geometry.location.lng};
    _forwardGeoCache[normalized] = {coords, ts: Date.now()};
    logger.info(`[forwardGeocode] "${cityName}" → ${coords.latitude},${coords.longitude}`);
    return coords;
  } catch (e) {
    logger.warn(`[forwardGeocode] Failed for "${cityName}": ${e.message}`);
    return null;
  }
}

// Localized "Places in {city}" chip text — keyed by 2-letter language code
const PLACES_CHIP_I18N = {
  en: (city) => `📍 Places in ${city}`,
  es: (city) => `📍 Lugares en ${city}`,
  fr: (city) => `📍 Lieux à ${city}`,
  de: (city) => `📍 Orte in ${city}`,
  pt: (city) => `📍 Lugares em ${city}`,
  ja: (city) => `📍 ${city}のスポット`,
  zh: (city) => `📍 ${city}的好去处`,
  ru: (city) => `📍 Места в ${city}`,
  ar: (city) => `📍 أماكن في ${city}`,
  id: (city) => `📍 Tempat di ${city}`,
};

// In-memory cache for coach config (Cloud Functions instance lives ~15min)
let _coachConfigCache = null;
let _coachConfigCacheTime = 0;
const COACH_CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ─── Default purchase/gift detection pattern sections (configurable via RC coach_config.placeSearch) ──
// Each section is a pipe-separated regex fragment used in purchaseGiftPattern.
// Override via Remote Config to add terms dynamically without redeployment.
const DEFAULT_PURCHASE_VERBS =
  'comprar(le)?|regalar(le)?|buscar\\s*(un\\s*)?(regalo|detalle|presente|obsequio)|deseo\\s+(comprar|regalar|llevar|dar)|necesito\\s+(comprar|buscar)|quiero\\s+(comprar|regalar|dar|llevar)(le)?' +
  '|buy(ing)?|shop(ping)?\\s*for|purchase|gift\\s*(for|idea)|present\\s*for|pick\\s*up\\s*(some|a|the)' +
  '|acheter|offrir(\\s+(un|des|du))?|chercher\\s*(un\\s*)?(cadeau|bouquet)' +
  '|kaufen|schenken|besorgen|ein\\s*Geschenk|Geschenkidee' +
  '|quero\\s+(comprar|dar|presentear)|presentear|dar\\s*de\\s*presente' +
  '|買[うい]|買いたい|プレゼント|贈り物|贈る|あげたい|お土産' +
  '|买[点个]?|送[礼给她他]|想[买送]|礼物' +
  '|купить|подарить|подарок|хочу\\s*(купить|подарить)' +
  '|اشتري|أشتري|شراء|هدي[ةه]|أريد\\s*(شراء|أشتري)' +
  '|beli(kan)?|membeli|hadiah|oleh-?oleh|mau\\s*beli';

const DEFAULT_PURCHASE_PRODUCTS =
  'pizza(s)?|chocolate(s)?|chocolat(es)?|bombones?|helado(s)?|ramen|empanada(s)?|ceviche|churro(s)?|macaron(s|es)?|croissant(s)?|waffle(s)?|cr[eê]pe(s)?|boba|bubble\\s*tea|donut(s)?|cupcake(s)?|mochi|gyros?|falafel|shawarma|kebab' +
  '|Schokolade|Pralinen|Bratwurst|Bretzel|Strudel|D[oö]ner|Kuchen|Eis(diele)?' +
  '|brigadeiro(s)?|a[cç]a[ií]|pastel\\s*de\\s*nata|p[aã]o\\s*de\\s*queijo|sorvete' +
  '|チョコ(レート)?|アイス(クリーム)?|ラーメン|もち|餅|ケーキ|和菓子|たこ焼き|お好み焼き|団子|寿司|刺身' +
  '|巧克力|冰[淇激]淋|火[锅鍋]|拉[面麵]|珍珠奶茶|月[饼餅]|蛋糕|[饺餃]子|包子|奶茶|煎[饼餅]' +
  '|шоколад(ки)?|мороженое|пицца|торт|суши|пирожн|блин(ы|чики)?' +
  '|شوكولاتة?|كنافة|بقلاو[ةه]|آيس\\s*كريم' +
  '|cokelat|bakso|nasi\\s*goreng|martabak|rendang|sat[ae]y?|kue|es\\s*krim';

const DEFAULT_PURCHASE_GIFTS =
  'rosas?|roses?|bouquet|tulipan(es)?|tulips?|Rosen|розы?|バラ|玫瑰|ورد|bunga(\\s*mawar)?' +
  '|peluche(s)?|teddy\\s*bear|stuffed\\s*animal|oso\\s*de\\s*peluche|ourson|Teddyb[aä]r|pel[uú]cia|ぬいぐるみ|毛[绒絨]|دبدوب|boneka' +
  '|anillo(s)?|ring(s)?|bague|anel|指輪|戒指|خاتم|cincin' +
  '|collar(es)?|necklace(s)?|collier|Halskette|colar|ネックレス|[项項][链鏈]|قلادة|kalung' +
  '|pulsera(s)?|bracelet(s)?|Armband|pulseira|ブレスレット|手[链鏈]|سوار|gelang' +
  '|arete(s)?|pendientes?|earring(s)?|boucles?|Ohrring(e)?|brinco(s)?|イヤリング|耳[环環]|أقراط' +
  '|reloj(es)?|watch(es)?|montre|Uhr(en)?|rel[oó]gio|腕時計|手[表錶]|ساعة|jam\\s*tangan' +
  '|perfume(s)?|parfum(s)?|Parfüm|香水|عطر' +
  '|vino(s)?|wine(s)?|vin(ho)?|Wein|ワイン|葡萄酒|[红紅]酒|نبيذ|anggur|champagn?[ea]?|champ[aá][ñn]|espumante|シャンパン|香[槟檳]|شمبانيا' +
  '|vela(s)?|candle(s)?|bougie(s)?|Kerzen?|キャンドル|[蜡蠟][烛燭]|شموع|lilin' +
  '|lingeri[ea]|lencer[ií]a|Dessous|ランジェリー|内衣' +
  '|dulces?|sweets?|candy|bonbon(s)?|S[uü][ßs]igkeit|doce(s)?|お菓子|糖果|حلوى|permen|caramelo(s)?' +
  '|pastel(es)?|cake(s)?|tarta(s)?|g[aâ]teau(x)?|bolo(s)?|kue\\s*tart' +
  '|joya(s)?|bijou(x)?|Schmuck|joias?|ジュエリー|珠[宝寶]|مجوهرات|perhiasan';

/**
 * Reads coach configuration from Remote Config with fallback defaults.
 * Caches in memory for 5 minutes to avoid repeated Remote Config reads.
 * Keys: coach_config (JSON with all coach settings)
 */
async function getCoachConfig() {
  if (_coachConfigCache && (Date.now() - _coachConfigCacheTime) < COACH_CONFIG_CACHE_TTL) {
    return _coachConfigCache;
  }
  const defaults = {
    enabled: true,
    dailyCredits: 5,
    maxMessageLength: 2000,
    historyLimit: 10,
    maxActivities: 30,
    maxSuggestions: 3,
    maxReplyLength: 5000,
    rateLimitPerHour: 30,
    temperature: 0.9,
    maxTokens: 2048,
    personalityTone: 'warm, supportive, encouraging but honest. Like a best friend who is also a dating expert',
    responseStyle: {
      maxParagraphs: 4,
      useEmojis: true,
      formalityLevel: 'casual_professional',
      encouragementLevel: 'high',
    },
    coachingSpecializations: {
      SUGAR_BABY: 'Focus on authenticity, making memorable impressions, conversation skills, self-confidence, and navigating age-gap dynamics gracefully. Help them present their best genuine self. Guide them on setting healthy boundaries while building real connections. Emphasize self-worth beyond appearances. WHEN SINGLE: help them craft standout profiles, manage multiple conversations strategically, recover from ghosting/rejection, build confidence after a breakup, and know when to invest energy vs. move on. WHEN IN A RELATIONSHIP: help them maintain their individuality, communicate needs without seeming demanding, plan thoughtful surprises within their means, navigate meeting their partner\'s social circle, handle lifestyle differences gracefully, and keep the spark alive with creative date ideas.',
      SUGAR_DADDY: 'Focus on genuine connection beyond material things, creating unique experiences, showing authentic interest, and making their personality shine. Help them stand out through thoughtfulness rather than spending. Guide them on building trust and reading genuine interest vs. transactional behavior. WHEN SINGLE: help them write authentic profiles that attract genuine connections, craft first messages that show real interest, identify matches who value them as a person, manage dating app fatigue, and transition from online to meaningful in-person dates. WHEN IN A RELATIONSHIP: help them plan experiences that deepen emotional connection (not just expensive ones), navigate exclusivity conversations, handle partner\'s friends/family dynamics, show vulnerability appropriately, maintain romance through small daily gestures, deal with insecurities about age-gap perception, and build a partnership based on mutual growth.',
      SUGAR_MOMMY: 'Focus on confidence, authentic connections, creative and memorable date ideas, and expressing genuine interest. Help them leverage their experience, sophistication, and independence as strengths. Guide them on navigating social dynamics and building connections based on mutual respect. WHEN SINGLE: help them overcome hesitation about re-entering the dating scene, build an engaging profile that balances confidence with approachability, manage conversations with younger matches, handle societal double standards gracefully, and maintain standards without seeming intimidating. WHEN IN A RELATIONSHIP: help them balance independence with partnership, plan dates that play to their strengths, handle power dynamics in the relationship, communicate expectations clearly, navigate public perception as a couple, keep the relationship exciting through shared new experiences, and build trust through consistent emotional availability.',
    },
    stagePrompts: {
      no_conversation_yet: "This is a NEW match with zero messages exchanged. The user needs help crafting the PERFECT first message. Analyze the match's profile deeply — bio keywords, interests, photos — and create 2-3 highly personalized openers that reference specific details. Explain WHY each opener works psychologically. Also suggest the best TIME to send the first message based on temporal context. If the user seems anxious about reaching out, normalize first-message nerves and boost their confidence.",
      just_started_talking: 'They just started chatting (1-5 messages). Focus on: keeping momentum alive, asking engaging open-ended questions, showing genuine interest, strategic self-disclosure (share something personal to build trust), and avoiding common early-chat mistakes (one-word replies, too many questions, moving too fast). Warn them about red flags to watch for at this stage. Suggest conversation topics based on the match\'s profile. Help them gauge mutual interest level from response patterns (timing, length, enthusiasm).',
      getting_to_know: "They're in the getting-to-know phase (5-20 messages). Focus on: deepening the conversation beyond surface level, finding shared values and experiences, injecting humor and personality, creating inside jokes, and naturally transitioning toward suggesting a first date or call. Help them stand out from other matches. Suggest specific date ideas based on shared interests. Coach them on how to propose meeting up without seeming too eager or too passive. Help them handle if the conversation is going great but the other person avoids meeting in person.",
      building_connection: "There's a real connection forming (20-50 messages). Focus on: taking it to the next level (video call, phone call, in-person date), showing vulnerability appropriately, navigating the exclusivity question, maintaining mystery while being open, and creating memorable shared experiences. Help them read signs of genuine interest vs. casual chatting. If they've already met in person, help them plan the perfect second/third date. Coach them on the transition from texting to a real relationship — pace, expectations, and emotional availability.",
      active_conversation: 'They have an active, ongoing connection (50+ messages or already in a relationship). Focus on: MAINTAINING THE SPARK through creative and surprising date ideas, navigating relationship milestones (DTR talk, meeting friends/family, moving in, anniversaries), dealing with conflicts constructively using healthy communication frameworks, deepening emotional intimacy through meaningful conversations and shared experiences. COUPLE-SPECIFIC guidance: help with planning anniversary surprises, recovering from arguments, keeping routine from killing romance, balancing individual identity with partnership, handling jealousy or insecurities, navigating long-distance phases, managing stress as a couple, planning travel together, dealing with external pressures (family opinions, work-life balance), reigniting passion after a flat period, and building shared goals/dreams. Always suggest PLACES and ACTIVITIES to strengthen their bond.',
    },
    allowedTopics: [
      'dating_advice', 'conversation_tips', 'profile_improvement',
      'date_ideas', 'relationship_building', 'confidence_tips',
      'first_date_advice', 'communication_skills', 'flirting_tips',
      'body_language', 'online_dating', 'match_analysis',
      'icebreakers', 'activity_suggestions', 'venue_recommendations',
      'gift_ideas', 'grooming_fashion', 'emotional_intelligence',
      'dealing_with_rejection', 'red_flags', 'green_flags',
      'long_distance', 'cultural_differences', 'self_improvement',
      'love_languages', 'attachment_styles', 'dating_strategy',
      'sugar_dynamics', 'travel_dates', 'luxury_experiences',
      'age_gap_dynamics', 'social_perception', 'boundary_setting',
      'romantic_gestures', 'anniversary_ideas', 'breakup_recovery',
      'ghosting', 'situationship', 'friends_to_dating',
      'dating_apps_strategy', 'photo_tips', 'bio_writing',
      'texting_etiquette', 'video_dating', 'safety_tips',
      'couple_activities', 'seasonal_dates', 'budget_dates',
      'luxury_dates', 'group_dates', 'double_dates',
      'conflict_resolution', 'jealousy', 'trust_building',
      'physical_chemistry', 'emotional_connection',
      'meeting_family', 'moving_in_together', 'relationship_milestones',
      'reigniting_spark', 'routine_boredom', 'couple_communication',
      'managing_multiple_conversations', 'dating_burnout', 'social_anxiety_dating',
      'starting_over', 'post_toxic_recovery', 'self_worth',
      'couple_travel', 'surprise_planning', 'reconciliation',
      'shared_goals', 'work_life_dating_balance', 'cohabitation',
      'dealing_with_ex', 'dating_as_parent', 'second_chance_romance',
    ],
    blockedTopics: [
      'politics', 'religion_debate', 'illegal_activities', 'violence',
      'self_harm', 'medical_advice', 'legal_advice', 'financial_advice',
      'hacking', 'drugs', 'weapons', 'gambling', 'academic_help',
      'coding', 'math_homework', 'explicit_content', 'harassment_tips',
      'stalking', 'manipulation_tactics', 'revenge',
      'personal_data_extraction', 'contact_info_exchange',
    ],
    offTopicMessages: {
      en: "I appreciate your curiosity! 😊 As your Date Coach, I'm here to help you with everything related to dating, relationships, and making great connections. Ask me about conversation tips, date ideas, profile advice, or anything romance-related — I'd love to help!",
      es: "¡Aprecio tu curiosidad! 😊 Como tu Coach de Citas, estoy aquí para ayudarte con todo lo relacionado con citas, relaciones y conexiones. Pregúntame sobre consejos de conversación, ideas para citas, mejoras de perfil o cualquier tema romántico — ¡me encantaría ayudarte!",
      fr: "J'apprécie ta curiosité ! 😊 En tant que Coach Dating, je suis là pour t'aider avec tout ce qui concerne les rencontres, les relations et les connexions. Demande-moi des conseils de conversation, des idées de rendez-vous ou des améliorations de profil !",
      de: "Ich schätze deine Neugier! 😊 Als dein Dating-Coach bin ich hier, um dir bei allem rund um Dating, Beziehungen und Verbindungen zu helfen. Frag mich nach Gesprächstipps, Date-Ideen oder Profilverbesserungen!",
      pt: "Agradeço sua curiosidade! 😊 Como seu Coach de Encontros, estou aqui para ajudar com tudo relacionado a encontros, relacionamentos e conexões. Me pergunte sobre dicas de conversa, ideias para encontros ou melhorias no perfil!",
      ja: "ご質問ありがとう！😊 デートコーチとして、デート、恋愛、素敵な出会いに関するすべてをお手伝いします。会話のコツ、デートのアイデア、プロフィール改善など、何でも聞いてください！",
      zh: "感谢你的好奇心！😊 作为你的约会教练，我专注于帮助你处理约会、感情和人际关系方面的问题。可以问我聊天技巧、约会创意、个人资料改进等恋爱相关话题！",
      ru: "Ценю твоё любопытство! 😊 Как твой тренер по свиданиям, я здесь, чтобы помочь со всем, что связано с отношениями и знакомствами. Спрашивай о советах для общения, идеях для свиданий или улучшении профиля!",
      ar: "أقدّر فضولك! 😊 كمدرب مواعدة، أنا هنا لمساعدتك في كل ما يتعلق بالمواعدة والعلاقات. اسألني عن نصائح المحادثة، أفكار المواعيد، أو تحسين ملفك الشخصي!",
      id: "Aku menghargai rasa penasaranmu! 😊 Sebagai Coach Kencan, aku di sini untuk membantumu dengan segala hal tentang kencan, hubungan, dan koneksi. Tanyakan tentang tips percakapan, ide kencan, atau perbaikan profil!",
    },
    safetyMessages: {
      en: "Your safety is my priority. If you're in an unsafe situation, please contact local emergency services. For relationship concerns, consider reaching out to a professional counselor.",
      es: 'Tu seguridad es mi prioridad. Si estás en una situación insegura, contacta los servicios de emergencia locales. Para temas de relaciones, considera buscar un consejero profesional.',
      fr: "Votre sécurité est ma priorité. Si vous êtes dans une situation dangereuse, veuillez contacter les services d'urgence locaux. Pour des préoccupations relationnelles, envisagez de consulter un conseiller professionnel.",
      de: 'Deine Sicherheit hat Priorität. Wenn du in einer unsicheren Situation bist, kontaktiere bitte den lokalen Notdienst. Bei Beziehungsproblemen ziehe professionelle Beratung in Betracht.',
      pt: 'Sua segurança é minha prioridade. Se você está em uma situação insegura, entre em contato com os serviços de emergência locais. Para questões de relacionamento, considere procurar um conselheiro profissional.',
      ja: 'あなたの安全が最優先です。危険な状況にある場合は、地域の緊急サービスに連絡してください。恋愛の悩みについては、専門カウンセラーへの相談をお勧めします。',
      zh: '您的安全是我的首要任务。如果您处于不安全的状况，请联系当地紧急服务。对于感情问题，建议咨询专业顾问。',
      ru: 'Ваша безопасность — мой приоритет. Если вы в опасной ситуации, обратитесь в местные экстренные службы. По вопросам отношений рассмотрите обращение к профессиональному консультанту.',
      ar: 'سلامتك هي أولويتي. إذا كنت في موقف غير آمن، يرجى الاتصال بخدمات الطوارئ المحلية. لمخاوف العلاقات، فكر في التواصل مع مستشار متخصص.',
      id: 'Keselamatanmu adalah prioritasku. Jika kamu dalam situasi tidak aman, silakan hubungi layanan darurat setempat. Untuk masalah hubungan, pertimbangkan untuk berkonsultasi dengan konselor profesional.',
    },
    additionalGuidelines: '',
    edgeCaseExtensions: '',
    learningEnabled: true,
    placeSearch: {
      enableWithoutLocation: true,
      minActivitiesForPlaceSearch: 6,
      defaultRadius: 100000,
      minRadius: 3000,
      maxRadius: 300000,
      radiusSteps: [100000, 130000, 180000, 250000, 300000],
      progressiveRadiusSteps: [15000, 30000, 60000, 120000, 200000, 300000],
      minPlacesTarget: 30,
      loadMoreDefaultBaseRadius: 60000,
      loadMoreExpansionBase: 2,
      loadMoreMaxExpansionStep: 4,
      perQueryResults: 20,
      maxPlacesIntermediate: 60,
      maxOutputTokensBudget: 8192,
      purchaseExtraTerms: '',
    },
    rag: {
      enabled: true,
      topK: 3,
      minScore: 0.3,
      fetchMultiplier: 2,
      maxQueryLength: 500,
      maxChunkLength: 1500,
      embeddingModel: 'gemini-embedding-001',
      dimensions: 768,
      collection: 'coachKnowledge',
      promptHeader: 'EXPERT KNOWLEDGE BASE (use this verified dating advice to ground your response — reference specific tips when relevant):',
    },
  };

  try {
    const rc = admin.remoteConfig();
    const template = await rc.getTemplate();
    const param = template.parameters['coach_config'];
    if (param && param.defaultValue && param.defaultValue.value) {
      const rcConfig = JSON.parse(param.defaultValue.value);
      const result = {...defaults, ...rcConfig};
      // Deep merge sub-objects so individual RC fields override individual defaults
      if (rcConfig.placeSearch && defaults.placeSearch) {
        result.placeSearch = {...defaults.placeSearch, ...rcConfig.placeSearch};
      }
      if (rcConfig.rag && defaults.rag) {
        result.rag = {...defaults.rag, ...rcConfig.rag};
      }
      _coachConfigCache = result;
      _coachConfigCacheTime = Date.now();
      return result;
    }
  } catch (err) {
    logger.warn(`[getCoachConfig] Failed to read Remote Config, using defaults: ${err.message}`);
    _coachConfigCache = defaults;
    _coachConfigCacheTime = Date.now();
  }
  return defaults;
}

// ─── Coach Learning System ─────────────────────────────────────────────────────

/**
 * Analyze user message to extract topics, sentiment, and communication style.
 * Lightweight keyword-based analysis — no extra Gemini call needed.
 */
function analyzeUserMessage(msg) {
  const lower = msg.toLowerCase();
  const topics = [];
  const topicPatterns = {
    first_date: /first date|primera cita|premier rendez|erstes date|primeiro encontro|first time meeting|primera vez|conocernos en persona|meet in person|meet up|quedar|verse en persona|wo treffen|où se voir|initial date|first outing|get to know|conocernos mejor|salir juntos|rendez-vous|Treffen|kennenlernen|nos vamos|let'?s meet/,
    conversation_tips: /conversation|what to say|how to talk|qué decir|hablar con|conversa|chat tip|qué le digo|qué escribir|what.*write|how.*respond|cómo responder|qué contestar|mensaje|topic.*talk|tema.*hablar|de qué hablar|what.*discuss|keep.*talking|mantener.*conversación|awkward silence|silencio|boring chat|aburrida la conversación|interesting|interesante/,
    profile_help: /profile|bio|photo|picture|perfil|foto|about me|descripción|description|improve.*profile|mejorar.*perfil|write.*bio|escribir.*bio|selfie|headshot|prompt|más fotos|more photos|best photo|mejor foto|what.*write.*about|qué poner en/,
    match_analysis: /match|she said|he said|they said|dijo|wrote me|respond|what does.*mean|qué significa|analiz|what.*think|qué opinas|le gust[oó]|likes me|interesad[oa]|interested|does she|does he|le parezco|tiene interés|señales|signals|signs|she means|he means|chemistry|vibe|compatible|compatib|química|feeling|sentí|conexión|connection|spark|chispa/,
    confidence: /confidence|nervous|shy|anxious|afraid|scared|miedo|nervios|insecure|insegur|self.?esteem|autoestima|worthy|digno|not good enough|no soy suficiente|doubt|duda|overthink|pensar demasiado|worry|preocup|embarrass|vergüenza|assertive|seguridad|brave|valiente|fear|temo|intimid|imposter|fake it|pretend|fingir|insuficiente|not enough|no merezco/,
    icebreakers: /icebreaker|opener|first message|how to start|como empezar|primer mensaje|iniciar|open.*conversation|abrir.*conversación|romper.*hielo|break.*ice|creative.*opener|que.*le.*digo.*primero|what.*say.*first|intro|presentar|greet|saludar/,
    date_ideas: /date idea|where.*go|what.*do|plan.*date|idea.*cita|qué hacer|dónde ir|activit|planeando|planning|sorpresa|surprise|special|romantic.*plan|plan.*romântic|creative date|cita creativa|segunda cita|second date|tercera cita|third date|next date|próxima cita|weekend plan|fin de semana|evening plan|noche|staycation|road trip|adventure date|weekend getaway|escapada|getaway|day trip|excursión|outing|salida/,
    activity_places: /restaurant|bar|café|place|venue|lugar|sitio|club|hotel|spa|parque|park|playa|beach|cine|cinema|teatro|theater|museo|museum|bowling|karaoke|escape room|rooftop|garden|jardín|picnic|camping|senderismo|hiking|concert|concierto|galería|gallery|tienda|shop|store|mall|florerr?ía|bakery|pastelería|helad[eo]ría|ice cream|gym|gimnasio|yoga|plaza|mirador|lago|lake|montaña|mountain|food|comida|cena|dinner|brunch|breakfast|desayuno|wine|vino|cocktail|coctel|cerveza|beer/,
    texting: /text back|message back|reply.*fast|respond|answer|responder|contestar|double text|doble mensaje|when.*text|cuándo.*escribir|how often|cada cuánto|too much|demasiado|clingy|pegajos|leave.*on read|dejar en visto|en visto|seen|visto|blue tick|late reply|tarda en responder|demora|slow.*reply|quick.*reply|fast.*reply/,
    rejection: /reject|ghost|ignored|no resp|left on read|rechaz|ignorar|unmatch|deshacer match|blocked|bloqueó|friendzone|zona de amigos|not interested|no le intereso|turn.*down|moved on|avanzó|over me|olvidó|forgot|abandoned|dejó|dumped|botó|broke up|terminó|ended|se acabó/,
    red_flags: /red flag|warning sign|suspicious|bandera roja|señal de alerta|toxic|tóxic|narcis|manipulat|controlling|controlador|jealous partner|pareja celos|possessive|posesiv|gaslighting|love bombing|breadcrumbing|catfish|fake profile|perfil falso|liar|mentiros|trust issue|problema de confianza|cheating|infidelidad|engañ/,
    relationship: /relationship|serious|committed|exclusiv|relación|pareja|compromis|boyfriend|girlfriend|novia?o?|partner|together|juntos|official|formalizar|define.*relation|definir.*relación|long term|largo plazo|future|futuro|move in|vivir juntos|marriage|matrimonio|wedding|boda|engagement|compromiso|love|amor|soul ?mate|media naranja|the one|donde vamos|where.*going|next step|siguiente paso|DTR|commitment phob|miedo al compromiso|situationship|casual|open relationship|relación abierta/,
    appearance: /look|fashion|outfit|dress|groom|style|ropa|vestir|apariencia|handsome|guap[oa]|attractive|atractiv|what.*wear|qué.*ponerme|qué.*vestir|hair|pelo|peinado|cologne|perfume|fragrance|makeup|maquillaje|accessories|accesorios|shoes|zapatos|suit|traje|casual|elegant|body|cuerpo|fitness|fit|gym|workout/,
    emotional: /feeling|emotion|hurt|love|sad|happy|lonely|sentir|emoción|triste|soledad|disappointment|decepción|frustra|heartbreak|corazón roto|miss|extrañ|attached|apegad|vulnerability|vulnerab|open up|abrirse|share.*feelings|compartir.*sentimientos|overwhelming|abrumad|excited|emocionad|butterflies|mariposas|fell.*for|me enamoré|catch feelings|connected|conexión/,
    safety: /safe|danger|uncomfortable|unsafe|segur|peligr|creepy|acoso|harass|stalker|follow.*me|me sigue|pressure|presion|force|forzar|unwanted|no deseado|boundary|límite|consent|consentimiento|respect|respeto|abuse|abuso|drunk|borracho|alone|solo.*con|first.*meet|meet.*stranger/,
    gift_ideas: /gift|regalo|present|surprise|sorpresa|buy.*for|comprar.*para|what.*give|qué.*regalar|flower|flor|chocolate|wine|vino|jewelry|joya|ring|anillo|romantic gesture|gesto romántico|anniversary|aniversario|birthday.*date|cumpleaños|valentine|san valentín|detail|detalle|special.*occasion|ocasión especial|DIY|handmade|hecho a mano|playlist|experience gift|regalo experiencia|voucher|gift card|tarjeta regalo|personalized|personalizado/,
    love_languages: /love language|lenguaje.*amor|acts of service|actos de servicio|words of affirmation|palabras.*afirmación|quality time|tiempo de calidad|physical touch|contacto físico|gift giving|dar regalos|show.*love|demostrar.*amor|how.*show|cómo.*demostrar|affection|cariño|spontaneous|espontáneo|attachment style|estilo de apego|emotional needs|necesidades emocionales|avoidant|ansioso|secure attachment|apego seguro/,
    communication: /communicate|comunicar|listen|escuchar|understand|entender|misunderstand|malentendido|argument|discusión|fight|pelea|disagree|desacuerdo|conflict|conflicto|apologize|disculpar|forgive|perdonar|compromise|comprom|boundaries|límites|space|espacio|need.*talk|necesito.*hablar|express|expresar|open.*up|abrirse|nonverbal|tono de voz|tone of voice|assertive|asertiv|difficult conversation|conversación difícil/,
    dating_strategy: /strategy|estrategia|approach|enfoque|technique|técnica|tactic|táctica|improve|mejorar|optimize|optimizar|more matches|más matches|better|mejor|successful|éxito|stand out|destacar|algorithm|algoritmo|likes|swipe|discovery|descubrimiento|visibility|visibilidad|app.*tip|expand pool|niche|más visible|more visible|boost|premium|super like|upgrade/,
    sugar_dynamics: /sugar|arrangement|allowance|expectation|financial|spoil|consentir|lujo|luxury|lavish|generous|generos[oa]|benefactor|mentor|provider|proveedor|pamper|mimar|treat|tratar bien|age.?gap|diferencia de edad|younger.*older|older.*younger|mayor.*menor|sugar baby|sugar daddy|sugar mommy|mutually beneficial|beneficio mutuo|lifestyle|estilo de vida|travel.*together|viajar juntos|experience.*together|experiencia|fine dining|upscale|exclusiv/,
    self_care: /self[- ]?care|auto[- ]?cuidado|me time|consentirme|cuidarme|bienestar|wellness|solo.*activit|día.*para\s*mí|jour.*pour\s*moi|Tag.*für\s*mich|dia.*para\s*mim|ご褒美|犒劳自己|побаловать\s*себя|عناية\s*بالنفس|perawatan\s*diri|treat\s*myself|me\s*faire\s*plaisir|mir.*gönnen|spa\s*day|yoga.*sol[oa]|paseo.*sol[oa]|walk.*alone|stroll/,
    group_activities: /double\s*date|doble\s*cita|group\s*(date|outing|activity)|cita\s*(grupal|en\s*grupo)|triple\s*date|friend.*date|cita.*amig|game\s*night|noche.*juegos|salida.*amigos|bowling.*group|karaoke.*group|escape\s*room.*friend|amigos.*juntos|Doppel[- ]?date|encontro\s*duplo|ダブルデート|双人约会|двойное\s*свидание|موعد\s*جماعي/,
    vague_intent: /\bbored\b|\baburrido\b|no\s*s[eé]\s*qu[eé]\s*hacer|what.*(should|can)\s*I\s*do|don'?t\s*know\s*what\s*to|qu[eé]\s*hago|qu[eé]\s*puedo\s*hacer|surprise\s*me|sorpréndeme|something\s*(fun|different)|algo\s*(divertido|diferente)|plan.*for\s*me|planea.*para\s*mí|cualquier\s*cosa|whatever|indeciso|undecided|not\s*sure\s*what/,
  };

  for (const [topic, pattern] of Object.entries(topicPatterns)) {
    if (pattern.test(lower)) topics.push(topic);
  }

  const positivePattern = /thank|great|helpful|awesome|perfect|love it|exactly|gracias|genial|excelente|perfecto|muy bien|buen consejo|útil|merci|danke|obrigad/;
  const isPositive = positivePattern.test(lower);
  const style = msg.length > 200 ? 'detailed' : msg.length < 30 ? 'brief' : 'moderate';

  return {
    topics: topics.length > 0 ? topics : ['general'],
    isPositive,
    style,
    messageLength: msg.length,
  };
}

/**
 * Build a personalized context string from the user's learning profile.
 * Injected into the system prompt so Gemini can tailor responses.
 */
function buildLearningContext(learningProfile) {
  if (!learningProfile) return '';
  const parts = [];

  const total = learningProfile.totalInteractions || 0;
  if (total === 1) {
    parts.push('This is their second conversation with you — they found you helpful before.');
  } else if (total > 1 && total < 5) {
    parts.push(`This user has had ${total} previous interactions. They\'re getting familiar with your coaching style.`);
  } else if (total >= 5 && total < 20) {
    parts.push(`Returning user with ${total} interactions. They trust your advice — be personalized and skip basics they already know.`);
  } else if (total >= 20) {
    parts.push(`Power user with ${total}+ interactions. They value advanced, detailed advice. Skip introductory topics.`);
  }

  const topicFreq = learningProfile.topicFrequency || {};
  const sortedTopics = Object.entries(topicFreq)
    .filter(([t]) => t !== 'general')
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
  if (sortedTopics.length > 0) {
    const topStr = sortedTopics.map(([t, c]) => `${t.replace(/_/g, ' ')} (${c}x)`).join(', ');
    parts.push(`Their most discussed topics: ${topStr}. Lean into these interests when relevant.`);
  }

  const styleCount = learningProfile.styleCount || {};
  const styles = Object.entries(styleCount).sort(([, a], [, b]) => b - a);
  if (styles.length > 0) {
    const dominant = styles[0][0];
    const styleAdvice = {
      brief: 'They prefer short messages — keep responses concise and actionable.',
      detailed: 'They write detailed messages — they appreciate thorough, in-depth responses.',
      moderate: 'They write moderate-length messages — balance detail with brevity.',
    };
    if (styleAdvice[dominant]) parts.push(styleAdvice[dominant]);
  }

  const positive = learningProfile.positiveSignals || 0;
  if (total > 5 && positive > 0) {
    const ratio = positive / total;
    if (ratio > 0.4) {
      parts.push('High engagement: they frequently express gratitude. Your advice resonates well.');
    } else if (ratio < 0.1 && total > 10) {
      parts.push('Low expressed satisfaction — try varying your approach. Be more specific and actionable.');
    }
  }

  const recent = learningProfile.recentTopics || [];
  if (recent.length > 0 && total > 2) {
    parts.push(`Recently discussed: ${recent.join(', ')}. Reference these for continuity.`);
  }

  return parts.length > 0
    ? '\n\nUSER LEARNING PROFILE (personalize your response based on this):\n' + parts.join('\n')
    : '';
}

/**
 * Update per-user learning profile and global insights in Firestore.
 * Non-critical — errors are logged but do not affect the response.
 * Stores data in coachChats/{userId}.learningProfile and coachInsights/global.
 */
async function updateCoachLearning(db, userId, analysis, geminiTopics) {
  try {
    const allTopics = [...new Set([...analysis.topics, ...(geminiTopics || [])])];
    const profileRef = db.collection('coachChats').doc(userId);

    const updates = {
      'learningProfile.totalInteractions': admin.firestore.FieldValue.increment(1),
      'learningProfile.lastInteraction': admin.firestore.FieldValue.serverTimestamp(),
      'learningProfile.recentTopics': allTopics.slice(0, 5),
      'learningProfile.lastMessageLength': analysis.messageLength,
      [`learningProfile.styleCount.${analysis.style}`]: admin.firestore.FieldValue.increment(1),
    };

    for (const topic of allTopics) {
      updates[`learningProfile.topicFrequency.${topic}`] = admin.firestore.FieldValue.increment(1);
    }

    if (analysis.isPositive) {
      updates['learningProfile.positiveSignals'] = admin.firestore.FieldValue.increment(1);
    }

    // Update global insights in parallel
    const globalRef = db.collection('coachInsights').doc('global');
    const globalUpdates = {
      totalInteractions: admin.firestore.FieldValue.increment(1),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    };
    for (const topic of allTopics) {
      globalUpdates[`topicCounts.${topic}`] = admin.firestore.FieldValue.increment(1);
    }

    await Promise.all([
      profileRef.set(updates, {merge: true}),
      globalRef.set(globalUpdates, {merge: true}),
    ]);
  } catch (err) {
    logger.warn(`[updateCoachLearning] Non-critical error: ${err.message}`);
  }
}

// ─── RAG: Retrieve relevant knowledge from coachKnowledge vector store ───────
const RAG_COLLECTION = 'coachKnowledge';
const RAG_EMBEDDING_MODEL = 'gemini-embedding-001';
const RAG_DIMENSIONS = 768;
const RAG_DEFAULT_TOP_K = 3;
const RAG_MIN_SCORE = 0.3; // minimum cosine similarity to include results
const RAG_MAX_QUERY_LENGTH = 500;
const RAG_FETCH_MULTIPLIER = 2;
const RAG_MAX_CHUNK_LENGTH = 1500;

// ─── Moderation RAG: Retrieve moderation rules from moderationKnowledge ──────
const MOD_RAG_COLLECTION = 'moderationKnowledge';
const MOD_RAG_TOP_K = 4;
const MOD_RAG_MIN_SCORE = 0.25;
const MOD_RAG_FETCH_MULTIPLIER = 3;

// In-memory cache for moderation config
let _moderationConfigCache = null;
let _moderationConfigCacheTime = 0;
const MODERATION_CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Reads moderation RAG configuration from Remote Config with fallback defaults.
 * Caches in memory for 5 minutes. Key: moderation_config (JSON).
 * @return {Promise<object>} moderation config with rag sub-object
 */
async function getModerationConfig() {
  if (_moderationConfigCache && (Date.now() - _moderationConfigCacheTime) < MODERATION_CONFIG_CACHE_TTL) {
    return _moderationConfigCache;
  }
  const defaults = {
    rag: {
      enabled: true,
      topK: MOD_RAG_TOP_K,
      minScore: MOD_RAG_MIN_SCORE,
      fetchMultiplier: MOD_RAG_FETCH_MULTIPLIER,
      collection: MOD_RAG_COLLECTION,
    },
  };
  try {
    const rc = admin.remoteConfig();
    const template = await rc.getTemplate();
    const param = template.parameters['moderation_config'];
    if (param && param.defaultValue && param.defaultValue.value) {
      const parsed = JSON.parse(param.defaultValue.value);
      const config = {...defaults, ...parsed};
      if (parsed.rag) config.rag = {...defaults.rag, ...parsed.rag};
      _moderationConfigCache = config;
      _moderationConfigCacheTime = Date.now();
      return config;
    }
  } catch (err) {
    logger.warn('[getModerationConfig] Falling back to defaults:', err.message);
  }
  _moderationConfigCache = defaults;
  _moderationConfigCacheTime = Date.now();
  return defaults;
}

/**
 * Retrieve relevant moderation knowledge chunks via Firestore native vector search.
 * Reuses the same embedding model as coach RAG but targets moderationKnowledge collection.
 * Language-aware: prefers user language → English → any.
 * @param {string} textToModerate - the text being moderated (used as query)
 * @param {string} apiKey - Gemini API key
 * @param {string} lang - user language code
 * @param {string} moderationType - "message" or "biography"
 * @return {Promise<string>} retrieved moderation context or empty string
 */
async function retrieveModerationKnowledge(textToModerate, apiKey, lang = 'en', moderationType = 'message', ragConfig = {}) {
  const isEnabled = ragConfig.enabled !== undefined ? ragConfig.enabled : true;
  if (!isEnabled || !apiKey) return '';

  const topK = Math.min(Math.max(ragConfig.topK || MOD_RAG_TOP_K, 1), 10);
  const minScore = Math.min(Math.max(ragConfig.minScore || MOD_RAG_MIN_SCORE, 0), 1);
  const fetchMultiplier = Math.min(Math.max(ragConfig.fetchMultiplier || MOD_RAG_FETCH_MULTIPLIER, 1), 5);
  const collection = ragConfig.collection || MOD_RAG_COLLECTION;

  try {
    if (!textToModerate || typeof textToModerate !== 'string' || textToModerate.trim().length < 3) return '';
    const trimmedQuery = textToModerate.trim().substring(0, RAG_MAX_QUERY_LENGTH);

    // 1. Embed the text being moderated
    const genai = new GoogleGenerativeAI(apiKey);
    const embeddingModel = genai.getGenerativeModel({model: RAG_EMBEDDING_MODEL});

    const embedPromise = embeddingModel.embedContent({
      content: {parts: [{text: trimmedQuery}]},
      taskType: 'RETRIEVAL_QUERY',
      outputDimensionality: RAG_DIMENSIONS,
    });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Moderation RAG embedding timeout (5s)')), 5000),
    );
    const embResult = await Promise.race([embedPromise, timeoutPromise]);
    const queryVector = embResult.embedding.values;

    if (!queryVector || queryVector.length !== RAG_DIMENSIONS) return '';

    // 2. Firestore vector search
    const db = admin.firestore();
    const collRef = db.collection(collection);
    const fetchLimit = topK * fetchMultiplier;
    const vectorQuery = collRef.findNearest('embedding', queryVector, {
      limit: fetchLimit,
      distanceMeasure: 'COSINE',
      distanceResultField: '_distance',
    });

    const snapshot = await vectorQuery.get();
    if (snapshot.empty) return '';

    // 3. Parse, filter by minScore, language-aware ranking
    const langNorm = (lang || 'en').substring(0, 2).toLowerCase();
    const docs = snapshot.docs.map((doc) => {
      const data = doc.data();
      const distance = data._distance ?? 1;
      return {
        text: (data.text || '').substring(0, RAG_MAX_CHUNK_LENGTH),
        category: data.category || 'general',
        language: data.language || 'en',
        similarity: 1 - distance,
      };
    }).filter((d) => d.similarity >= minScore && d.text.length > 0);

    if (docs.length === 0) return '';

    // Language priority: user lang → English → other
    const userLangDocs = docs.filter((d) => d.language === langNorm);
    const enDocs = docs.filter((d) => d.language === 'en' && d.language !== langNorm);
    const otherDocs = docs.filter((d) => d.language !== langNorm && d.language !== 'en');
    const ranked = [...userLangDocs, ...enDocs, ...otherDocs];

    // For moderation, include context_guidelines and classification_guide always
    // but deduplicate violation-type categories
    const seenCategories = new Set();
    const deduped = ranked.filter((d) => {
      // Always include guidelines/context (don't dedup these)
      if (['context_guidelines', 'classification_guide', 'bio_moderation', 'evasion_tactics', 'payment_solicitation'].includes(d.category)) {
        const guideKey = `${d.category}_${d.language}`;
        if (seenCategories.has(guideKey)) return false;
        seenCategories.add(guideKey);
        return true;
      }
      if (seenCategories.has(d.category)) return false;
      seenCategories.add(d.category);
      return true;
    });

    const selected = deduped.slice(0, topK);
    if (selected.length === 0) return '';

    logger.info(`[ModerationRAG] Retrieved ${selected.length}/${snapshot.size} chunks for ${moderationType} (lang=${langNorm}, categories: ${selected.map((d) => d.category).join(', ')})`);

    return '\n\nMODERATION KNOWLEDGE BASE — Use these rules and cultural patterns to improve your analysis:\n' +
      selected.map((d, i) => `[${i + 1}] ${d.text}`).join('\n\n');
  } catch (err) {
    logger.warn(`[ModerationRAG] Retrieval failed (non-critical): ${err.message}`);
    return '';
  }
}

/**
 * Retrieve relevant dating knowledge chunks via Firestore native vector search.
 * Embeds the user query with gemini-embedding-001, then uses findNearest() for COSINE similarity.
 * Returns concatenated text of top-k relevant chunks, or empty string on failure.
 * All parameters are configurable via coach_config.rag in Remote Config.
 * @param {string} query - user message to embed
 * @param {string} apiKey - Gemini API key
 * @param {object} ragConfig - optional config from coach_config.rag
 * @param {string} lang - user language for filtering
 * @return {Promise<string>} retrieved knowledge context or empty string
 */
async function retrieveCoachKnowledge(query, apiKey, ragConfig = {}, lang = 'en') {
  if (!apiKey || ragConfig.enabled === false) return '';

  // Config from RC with fallback to hardcoded defaults
  const topK = Math.min(Math.max(ragConfig.topK || RAG_DEFAULT_TOP_K, 1), 10);
  const minScore = Math.min(Math.max(ragConfig.minScore ?? RAG_MIN_SCORE, 0), 1);
  const fetchMultiplier = Math.min(Math.max(ragConfig.fetchMultiplier || RAG_FETCH_MULTIPLIER, 1), 5);
  const maxQueryLength = ragConfig.maxQueryLength || RAG_MAX_QUERY_LENGTH;
  const maxChunkLength = ragConfig.maxChunkLength || RAG_MAX_CHUNK_LENGTH;
  const embeddingModelName = ragConfig.embeddingModel || RAG_EMBEDDING_MODEL;
  const dimensions = ragConfig.dimensions || RAG_DIMENSIONS;
  const collectionName = ragConfig.collection || RAG_COLLECTION;
  const promptHeader = ragConfig.promptHeader || 'EXPERT KNOWLEDGE BASE (use this verified dating advice to ground your response — reference specific tips when relevant):';

  try {
    // Validate and truncate query
    if (!query || typeof query !== 'string' || query.trim().length < 3) return '';
    const trimmedQuery = query.trim().substring(0, maxQueryLength);

    // 1. Embed the user query with timeout
    const genai = new GoogleGenerativeAI(apiKey);
    const embeddingModel = genai.getGenerativeModel({model: embeddingModelName});

    const embedPromise = embeddingModel.embedContent({
      content: {parts: [{text: trimmedQuery}]},
      taskType: 'RETRIEVAL_QUERY',
      outputDimensionality: dimensions,
    });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('RAG embedding timeout (5s)')), 5000),
    );
    const embResult = await Promise.race([embedPromise, timeoutPromise]);
    const queryVector = embResult.embedding.values;

    if (!queryVector || queryVector.length !== dimensions) {
      logger.warn(`[RAG] Unexpected embedding dimension: ${queryVector?.length}, expected ${dimensions}`);
      return '';
    }

    // 2. Firestore vector search with findNearest
    const db = admin.firestore();
    const collRef = db.collection(collectionName);
    const fetchLimit = topK * fetchMultiplier;
    const vectorQuery = collRef.findNearest('embedding', queryVector, {
      limit: fetchLimit,
      distanceMeasure: 'COSINE',
      distanceResultField: '_distance',
    });

    const snapshot = await vectorQuery.get();
    if (snapshot.empty) {
      logger.info('[RAG] No knowledge chunks found');
      return '';
    }

    // 3. Parse docs with distance scores and filter by minScore
    // COSINE distance in Firestore = 1 - cosine_similarity, so lower = better
    // Convert to similarity: similarity = 1 - distance
    const docs = snapshot.docs.map((doc) => {
      const data = doc.data();
      const distance = data._distance ?? 1;
      return {
        text: (data.text || '').substring(0, maxChunkLength),
        category: data.category || 'general',
        language: data.language || 'en',
        similarity: 1 - distance,
      };
    }).filter((d) => d.similarity >= minScore && d.text.length > 0);

    if (docs.length === 0) {
      logger.info(`[RAG] All ${snapshot.size} chunks filtered out (minScore=${minScore})`);
      return '';
    }

    // 4. Language-aware ranking: prefer user lang, then English, then any
    const langNorm = (lang || 'en').substring(0, 2).toLowerCase();
    const userLangDocs = docs.filter((d) => d.language === langNorm);
    const enDocs = docs.filter((d) => d.language === 'en' && d.language !== langNorm);
    const otherDocs = docs.filter((d) => d.language !== langNorm && d.language !== 'en');

    // Merge maintaining similarity order within each language group
    const ranked = [...userLangDocs, ...enDocs, ...otherDocs];
    // Deduplicate by category (keep highest similarity per category)
    const seenCategories = new Set();
    const deduped = ranked.filter((d) => {
      if (seenCategories.has(d.category)) return false;
      seenCategories.add(d.category);
      return true;
    });
    const selected = deduped.slice(0, topK);

    if (selected.length === 0) return '';

    logger.info(`[RAG] Retrieved ${selected.length}/${snapshot.size} chunks (categories: ${selected.map((d) => d.category).join(', ')}, scores: ${selected.map((d) => d.similarity.toFixed(2)).join(', ')})`);

    return `\n\n${promptHeader}\n` +
      selected.map((d, i) => `[${i + 1}] (${d.category}): ${d.text}`).join('\n\n');
  } catch (err) {
    logger.warn(`[RAG] Knowledge retrieval failed (non-critical): ${err.message}`);
    return '';
  }
}

/**
 * Callable: Send a message to the AI Date Coach and get a Gemini-powered response.
 * The coach reads the user's profile for context and optionally match/conversation data.
 * Both the user message and the coach reply are stored in Firestore.
 * Configuration is dynamic via Remote Config key "coach_config".
 * Off-topic questions receive an elegant redirect message.
 * Payload: { message: string, matchId?: string, userLanguage: string }
 * Response: { success, reply, suggestions?, activitySuggestions? }
 * Location is always read from the user's Firestore profile (updated by HomeView).
 * Homologado: iOS CoachChatViewModel / Android CoachChatViewModel
 */
exports.dateCoachChat = onCall(
  {region: 'us-central1', memory: '512MiB', timeoutSeconds: 60, secrets: [geminiApiKey, placesApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const userId = request.auth.uid;
    const {message, matchId, userLanguage, loadMoreActivities, category: requestCategory, excludePlaceIds: rawExcludePlaceIds, loadCount: rawLoadCount} = request.data || {};
    const safeLoadCount = Math.max(0, Math.min(20, parseInt(rawLoadCount) || 0));

    // 0. Load dynamic configuration from Remote Config
    const config = await getCoachConfig();
    const placesSearchConfig = await getPlacesSearchConfig();
    const categoryQueryMap = getCategoryQueryMap(placesSearchConfig);

    if (!config.enabled) {
      throw new Error('Date Coach is temporarily unavailable. Please try again later.');
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw new Error('Message is required');
    }
    if (message.length > config.maxMessageLength) {
      throw new Error(`Message too long (max ${config.maxMessageLength} characters)`);
    }

    const lang = (userLanguage || 'en').toLowerCase();
    const db = admin.firestore();

    try {
      // 0.5. Credit check — verify user has remaining coach messages (skip for load more)
      const userRefForCredits = db.collection('users').doc(userId);
      const creditDoc = await userRefForCredits.get();
      const creditData = creditDoc.exists ? creditDoc.data() : {};
      const coachMessagesRemaining = typeof creditData.coachMessagesRemaining === 'number'
        ? creditData.coachMessagesRemaining : 5;

      if (!loadMoreActivities && coachMessagesRemaining <= 0) {
        const noCreditsMsg = {
          en: "You've used all your daily coach messages. They'll reset at midnight! ✨",
          es: '¡Has usado todos tus mensajes diarios del coach. Se renovarán a medianoche! ✨',
          fr: 'Vous avez utilisé tous vos messages quotidiens du coach. Ils seront renouvelés à minuit ! ✨',
          pt: 'Você usou todas as suas mensagens diárias do coach. Elas serão renovadas à meia-noite! ✨',
          de: 'Du hast alle täglichen Coach-Nachrichten aufgebraucht. Sie werden um Mitternacht erneuert! ✨',
          zh: '您已用完今天的教练消息。它们将在午夜重置！✨',
          ar: 'لقد استخدمت جميع رسائل المدرب اليومية. ستتجدد عند منتصف الليل! ✨',
          id: 'Anda telah menggunakan semua pesan pelatih harian. Akan diperbarui pada tengah malam! ✨',
          ru: 'Вы использовали все ежедневные сообщения коуча. Они обновятся в полночь! ✨',
          ja: 'コーチへの1日のメッセージを使い切りました。深夜にリセットされます！✨',
        };
        return {
          success: true,
          reply: noCreditsMsg[lang] || noCreditsMsg.en,
          suggestions: [],
          coachMessagesRemaining: 0,
        };
      }

      // 1. Rate limiting — check messages in last hour (skip for load more)
      if (loadMoreActivities) {
        // Fast path: skip profile, match, learning, history reads — only fetch places + call Gemini
        const lmUserData = creditDoc.exists ? creditDoc.data() : {};
        const lmLat = lmUserData.latitude;
        const lmLng = lmUserData.longitude;
        const lmHasLocation = !!(lmLat && lmLng);

        // Temporal context (lightweight)
        const lmOffset = typeof lmUserData.timezoneOffset === 'number' ? lmUserData.timezoneOffset : 0;
        const lmLocalTime = new Date(Date.now() + lmOffset * 3600000);
        const lmHour = lmLocalTime.getUTCHours();
        const lmTimeOfDay = lmHour < 6 ? 'late night' : lmHour < 12 ? 'morning' : lmHour < 17 ? 'afternoon' : lmHour < 21 ? 'evening' : 'night';

        // Track initial search radius for progressive loadMore expansion
        const lmPsDefaults = config.placeSearch || {};
        let lmBaseRadius = lmPsDefaults.loadMoreDefaultBaseRadius || 60000; // RC-configurable fallback if cache has no lastRadiusUsed
        let lmLocationOverridden = false;

        // Cache-first: check if we have cached places from the original query
        // Skip cache on loadCount=0 (category switch → always fresh fetch)
        if (safeLoadCount > 0) try {
          const cacheDoc = await db.collection('coachChats').doc(userId).collection('placesCache').doc('latest').get();
          if (cacheDoc.exists) {
            const cacheData = cacheDoc.data();
            // Read initial search radius for progressive expansion in loadMore
            if (typeof cacheData.lastRadiusUsed === 'number' && cacheData.lastRadiusUsed > 0) lmBaseRadius = cacheData.lastRadiusUsed;
            // Inherit location override from initial search (e.g. user mentioned "Buenos Aires")
            if (typeof cacheData.overrideLat === 'number' && typeof cacheData.overrideLng === 'number') {
              lmLat = cacheData.overrideLat; lmLng = cacheData.overrideLng; lmHasLocation = true; lmLocationOverridden = true;
              logger.info(`[dateCoachChat] loadMore: using cached override location (${lmLat.toFixed(2)}, ${lmLng.toFixed(2)})`);
            }
            const cacheExpiry = cacheData.expiresAt instanceof Date ? cacheData.expiresAt.getTime()
              : (cacheData.expiresAt && typeof cacheData.expiresAt.toDate === 'function') ? cacheData.expiresAt.toDate().getTime()
              : 0;
            if (cacheExpiry > Date.now() && Array.isArray(cacheData.places) && cacheData.places.length > 0) {
              // Cache is still valid — serve from cache
              const excludeSet = new Set([
                ...(Array.isArray(rawExcludePlaceIds) ? rawExcludePlaceIds.filter((id) => typeof id === 'string') : []),
                ...(Array.isArray(cacheData.returnedPlaceIds) ? cacheData.returnedPlaceIds : []),
              ]);
              const cachedCategoryFilter = requestCategory || null;
              const available = cacheData.places.filter((rp) =>
                rp.placeId && !excludeSet.has(rp.placeId) &&
                (!cachedCategoryFilter || normalizeCategory(rp.category) === cachedCategoryFilter),
              );
              if (available.length > 0) {
                const batch = available.slice(0, 20);
                const cachedActivities = batch.map((rp) => ({
                  emoji: categoryEmojiMap[normalizeCategory(rp.category)] || '📍',
                  title: (rp.name || 'Place').substring(0, 50),
                  description: (rp.description || rp.address || '').replace(/\$+/g, '').trim().substring(0, 120),
                  category: normalizeCategory(rp.category),
                  bestFor: 'fun',
                  ...(rp.priceLevel ? {priceLevel: rp.priceLevel} : {}),
                  ...(rp.rating != null ? {rating: rp.rating} : {}),
                  ...(rp.reviewCount ? {reviewCount: rp.reviewCount} : {}),
                  ...(rp.website ? {website: rp.website} : {}),
                  ...(rp.googleMapsUrl ? {googleMapsUrl: rp.googleMapsUrl} : {}),
                  ...(rp.address ? {address: rp.address} : {}),
                  ...(rp.latitude != null ? {latitude: rp.latitude} : {}),
                  ...(rp.longitude != null ? {longitude: rp.longitude} : {}),
                  ...(rp.placeId ? {placeId: rp.placeId} : {}),
                  ...(rp.photos && rp.photos.length > 0 ? {photos: rp.photos} : {}),
                }));
                // Update cache with newly returned placeIds (non-blocking)
                const newReturned = [...(cacheData.returnedPlaceIds || []), ...batch.filter((rp) => rp.placeId).map((rp) => rp.placeId)];
                db.collection('coachChats').doc(userId).collection('placesCache').doc('latest').update({returnedPlaceIds: newReturned}).catch(() => {});
                logger.info(`[dateCoachChat] loadMore served ${cachedActivities.length} from cache (${available.length - batch.length} remaining)`);
                return {
                  success: true,
                  activitySuggestions: cachedActivities,
                  coachMessagesRemaining,
                  ...(cacheData.dominantCategory ? {dominantCategory: cacheData.dominantCategory} : {}),
                };
              }
            }
          }
        } catch (cacheReadErr) {
          logger.warn(`[dateCoachChat] Cache read failed (continuing with fresh fetch): ${cacheReadErr.message}`);
        } // end cache block (skipped when safeLoadCount === 0)

        // Fetch Google Places (works with or without location)
        let lmPlaces = [];
        const lmPsConfig = config.placeSearch || {};
        const placesKey = process.env.GOOGLE_PLACES_API_KEY;
        if (placesKey) {
          try {
            // Progressive radius: double from initial search radius each loadMore step
            // e.g. if initial found results at 15km → loadMore 0: 30km, 1: 60km, 2: 120km, 3: 240km, 4+: 300km (capped)
            const lmMaxR = lmPsConfig.maxRadius || 300000;
            const lmExpBase = lmPsConfig.loadMoreExpansionBase || 2;
            const lmMaxStep = lmPsConfig.loadMoreMaxExpansionStep || 4;
            const lmSearchRadius = Math.min(lmMaxR, lmBaseRadius * Math.pow(lmExpBase, Math.min(safeLoadCount, lmMaxStep) + 1));
            const center = lmHasLocation ? {latitude: lmLat, longitude: lmLng} : null;
            const lmCat = requestCategory && categoryQueryMap[requestCategory] ? requestCategory : null;
            // Determine includedType for category-specific loadMore searches
            const lmIncludedType = lmCat && CATEGORY_TO_PLACES_TYPE[lmCat] ? [CATEGORY_TO_PLACES_TYPE[lmCat]] : null;
            let lmQueries;
            if (lmCat) {
              // Run 3 queries for category-specific search for more diverse results
              const canonicalQ = categoryQueryMap[lmCat];
              const terms = canonicalQ.split(' ').filter((t) => t.length > 2);
              const subQ = terms.length > 3
                ? [terms.slice(0, 3).join(' '), terms.slice(3).join(' ')]
                : [terms.join(' ')];
              lmQueries = [canonicalQ, ...subQ].slice(0, 3);
            } else {
              lmQueries = Object.keys(categoryQueryMap).sort(() => Math.random() - 0.5).slice(0, 4).map((k) => categoryQueryMap[k]);
            }
            const perQ = lmPsConfig.perQueryResults || 20;
            const lmUseRestriction = lmHasLocation && center && !lmLocationOverridden;
            logger.info(`[dateCoachChat] loadMore Places: ${lmQueries.length} queries, radius=${lmSearchRadius}m, type=${lmIncludedType ? lmIncludedType[0] : 'any'}, baseRadius=${lmBaseRadius}m`);
            const res = await Promise.all(
              lmQueries.map((q) => placesTextSearch(q, center, lmSearchRadius, lang, null, perQ, lmUseRestriction, lmIncludedType).catch(() => ({places: []}))),
            );
            logger.info(`[dateCoachChat] loadMore radius: ${lmSearchRadius}m (base=${lmBaseRadius}m, loadCount=${safeLoadCount})`);
            const seen = new Set();
            const excludeSet = Array.isArray(rawExcludePlaceIds) ? new Set(rawExcludePlaceIds.filter((id) => typeof id === 'string')) : new Set();
            const lmMaxIntermediate = lmPsConfig.maxPlacesIntermediate || 60;
            lmPlaces = res.flatMap((r) => r.places).filter((p) => p.id && !seen.has(p.id) && !excludeSet.has(p.id) && seen.add(p.id)).slice(0, lmMaxIntermediate)
              .map((p) => {
                const photoArr = p.photos || [];
                return {
                  name: p.displayName?.text || '', address: p.formattedAddress || '',
                  rating: p.rating || 0, reviewCount: p.userRatingCount || 0, photoCount: photoArr.length,
                  latitude: p.location?.latitude || 0, longitude: p.location?.longitude || 0,
                  placeId: p.id || '', website: p.websiteUri || null, googleMapsUrl: p.googleMapsUri || null,
                  category: p.primaryType || null, description: p.editorialSummary?.text || null,
                  priceLevel: googlePriceLevelToString(p.priceLevel) || null,
                  photos: photoArr.slice(0, 3).map((ph) => ({
                    url: `https://places.googleapis.com/v1/${ph.name}/media?maxHeightPx=${lmPsConfig.photoMaxHeightPx || 400}&key=${placesKey}`,
                    width: ph.widthPx || 400, height: ph.heightPx || 300,
                  })),
                };
              });
          } catch (err) {
            logger.warn(`[dateCoachChat] loadMore places fetch failed: ${err.message}`);
          }
        }

        const lmPlacesCtx = lmPlaces.length > 0
          ? '\nREAL PLACES (select from these and use their placeId):\n' + lmPlaces.map((p, i) =>
            `${i + 1}. "${p.name}" [placeId:${p.placeId}] — ${p.address}${p.rating ? `, ★${p.rating}` : ''}${p.reviewCount ? ` (${p.reviewCount} reviews)` : ''}${p.priceLevel ? ` ${p.priceLevel}` : ''}${p.category ? ` [${p.category}]` : ''}${p.website ? ` | ${p.website}` : ''}${p.description ? `\n   ${p.description}` : ''}`).join('\n')
          : '';

        const lmExampleCat = requestCategory || 'restaurant';
        const lmPrompt = `You are a dating coach assistant. Generate ${config.maxActivities} NEW and DIFFERENT activity/venue suggestions.` +
          `\nUser's local time: ${lmTimeOfDay} (${lmHour}:00). Consider this for relevance.` +
          (lmHasLocation ? `\nLocation: lat ${lmLat.toFixed(2)}, lng ${lmLng.toFixed(2)}` : '') +
          (requestCategory ? `\nCategory focus: ${requestCategory}. ALL activities MUST use category: "${requestCategory}".` : '') +
          lmPlacesCtx +
          `\n\nThe user already has these activities: ${message.substring(0, 500)}` +
          `\nProvide COMPLETELY DIFFERENT suggestions. Respond in ${lang}.` +
          `\nRespond ONLY with valid JSON: {"activitySuggestions": [{"emoji": "🍷", "title": "Place Name", "placeId": "ChIJ...", "description": "Why great for dating (NEVER include price symbols like $)", "category": "${lmExampleCat}", "bestFor": "romantic", "priceLevel": "$$$", "instagram": null}]}`
          + `\nIMPORTANT: If a place has a placeId, include it exactly as given. NEVER include $ symbols in description. For instagram, only include if CERTAIN it exists — otherwise use null. NEVER invent website URLs. For priceLevel, use the value from Google Maps data — if unknown, use null.`;

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('AI service unavailable');
        const genAI = new GoogleGenerativeAI(apiKey);
        const lmTokenBudget = lmPsConfig.maxOutputTokensBudget || 8192;
        const lmModel = genAI.getGenerativeModel({
          model: AI_MODEL_NAME,
          generationConfig: {temperature: config.temperature, maxOutputTokens: Math.max(config.maxTokens, lmTokenBudget), responseMimeType: 'application/json'},
        });
        let lmText = null;
        try {
          const lmResult = await (async () => {
            try {
              return await lmModel.generateContent(lmPrompt);
            } catch (e) {
              logger.warn(`[dateCoachChat] loadMore Gemini retry: ${e.message}`);
              await new Promise((r) => setTimeout(r, 1000));
              return await lmModel.generateContent(lmPrompt);
            }
          })();
          lmText = lmResult.response.text();
        } catch (geminiErr) {
          logger.warn(`[dateCoachChat] loadMore Gemini failed, using Places fallback: ${geminiErr.message}`);
        }

        let lmActivities;
        try {
          const parsed = parseGeminiJsonResponse(lmText);
          const acts = parsed.activitySuggestions || parsed.activity_suggestions || parsed.activities || parsed.places;
          if (Array.isArray(acts)) {
            const lmLookupById = new Map();
            const lmLookupByName = new Map();
            for (const rp of lmPlaces) {
              if (rp.placeId) lmLookupById.set(rp.placeId, rp);
              if (rp.name) lmLookupByName.set(rp.name.toLowerCase().trim(), rp);
            }
            lmActivities = acts.slice(0, config.maxActivities).map((a) => {
              const title = (a.title || a.name || '').substring(0, 50);
              const geminiPlaceId = a.placeId || a.place_id || null;
              const matched = fuzzyMatchPlace(title, geminiPlaceId, lmLookupById, lmLookupByName, lmPlaces);
              const rawDesc = (a.description || '').substring(0, 120);
              const cleanDesc = rawDesc.replace(/\$+/g, '').trim();
              const resolvedPriceLevel = (matched && matched.priceLevel) || a.priceLevel || a.price_level || null;
              const validatedInstagram = sanitizeInstagramHandle(a.instagram || a.instagramHandle || null);
              const validatedWebsite = (matched && matched.website) || sanitizeWebsiteUrl(a.website) || null;
              const base = {
                emoji: (a.emoji || '📍').substring(0, 4), title,
                description: cleanDesc || rawDesc,
                category: normalizeCategory(a.category), bestFor: a.bestFor || a.best_for || 'fun',
                ...(resolvedPriceLevel ? {priceLevel: resolvedPriceLevel} : {}),
                ...(validatedInstagram ? {instagram: validatedInstagram} : {}),
                ...(validatedWebsite ? {website: validatedWebsite} : {}),
              };
              if (matched) {
                return {...base,
                  ...(matched.rating != null ? {rating: matched.rating} : {}),
                  ...(matched.reviewCount ? {reviewCount: matched.reviewCount} : {}),
                  ...(matched.googleMapsUrl ? {googleMapsUrl: matched.googleMapsUrl} : {}),
                  ...(matched.address ? {address: matched.address} : {}),
                  ...(matched.latitude != null ? {latitude: matched.latitude} : {}),
                  ...(matched.longitude != null ? {longitude: matched.longitude} : {}),
                  ...(matched.placeId ? {placeId: matched.placeId} : {}),
                  ...(matched.photos?.length > 0 ? {photos: matched.photos} : {}),
                };
              }
              return {...base, ...(a.rating ? {rating: Math.min(5, Math.max(0, parseFloat(a.rating) || 0))} : {})};
            });
          }
        } catch {
          logger.warn('[dateCoachChat] loadMore JSON parse failed');
        }

        // Fallback: build from Google Places if Gemini failed
        if ((!lmActivities || lmActivities.length === 0) && lmPlaces.length > 0) {
          logger.info(`[dateCoachChat] loadMore fallback from ${lmPlaces.length} Google Places`);
          lmActivities = lmPlaces.slice(0, config.maxActivities).map((rp) => ({
            emoji: categoryEmojiMap[normalizeCategory(rp.category)] || '📍', title: (rp.name || 'Place').substring(0, 50),
            description: (rp.description || rp.address || '').replace(/\$+/g, '').trim().substring(0, 120),
            category: normalizeCategory(rp.category), bestFor: 'fun',
            ...(rp.priceLevel ? {priceLevel: rp.priceLevel} : {}),
            ...(rp.rating != null ? {rating: rp.rating} : {}),
            ...(rp.googleMapsUrl ? {googleMapsUrl: rp.googleMapsUrl} : {}),
            ...(rp.address ? {address: rp.address} : {}),
            ...(rp.latitude != null ? {latitude: rp.latitude} : {}),
            ...(rp.longitude != null ? {longitude: rp.longitude} : {}),
            ...(rp.placeId ? {placeId: rp.placeId} : {}),
            ...(rp.photos && rp.photos.length > 0 ? {photos: rp.photos} : {}),
          }));
        }

        // Force requested category on all activities when a specific category was requested
        // (Google Places already filtered by includedType, so all places match the category;
        //  Gemini may assign different categories despite prompt instructions)
        if (requestCategory && lmActivities && lmActivities.length > 0) {
          const normalizedReqCat = normalizeCategory(requestCategory);
          for (const a of lmActivities) a.category = normalizedReqCat;
        }

        // Sort by popularity: places with more reviews and higher ratings appear first
        if (lmActivities && lmActivities.length > 1) {
          lmActivities.sort((a, b) => {
            const scoreA = (a.rating || 0) * 0.4 + Math.log10(1 + (a.reviewCount || 0)) * 0.6;
            const scoreB = (b.rating || 0) * 0.4 + Math.log10(1 + (b.reviewCount || 0)) * 0.6;
            return scoreB - scoreA;
          });
        }

        // Compute dominant category for loadMore results
        let lmDominantCategory = null;
        if (lmActivities && lmActivities.length > 0) {
          const lmCatCounts = {};
          for (const a of lmActivities) {
            if (a.category) lmCatCounts[a.category] = (lmCatCounts[a.category] || 0) + 1;
          }
          const lmTopCat = Object.entries(lmCatCounts).sort(([, a], [, b]) => b - a)[0];
          if (lmTopCat && lmTopCat[1] / lmActivities.length >= 0.4) {
            lmDominantCategory = lmTopCat[0];
          }
        }

        return {
          success: true,
          activitySuggestions: lmActivities || [],
          coachMessagesRemaining,
          ...(lmDominantCategory ? {dominantCategory: lmDominantCategory} : {}),
        };
      }
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentMsgCount = !loadMoreActivities ? await db.collection('coachChats').doc(userId)
        .collection('messages')
        .where('sender', '==', 'user')
        .where('timestamp', '>', admin.firestore.Timestamp.fromDate(oneHourAgo))
        .count().get() : null;
      if (!loadMoreActivities && recentMsgCount && recentMsgCount.data().count >= config.rateLimitPerHour) {
        const rateLimitMsgs = {
          en: "You've been very active! To ensure quality advice, please wait a few minutes before sending more messages.",
          es: '¡Has estado muy activo! Para asegurar consejos de calidad, espera unos minutos antes de enviar más mensajes.',
          fr: "Tu as été très actif ! Pour garantir des conseils de qualité, attends quelques minutes avant d'envoyer plus de messages.",
          de: 'Du warst sehr aktiv! Um qualitativ hochwertige Ratschläge zu gewährleisten, warte bitte ein paar Minuten.',
          pt: 'Você está muito ativo! Para garantir conselhos de qualidade, aguarde alguns minutos antes de enviar mais mensagens.',
          ja: 'とてもアクティブですね！質の高いアドバイスのために、数分お待ちください。',
          zh: '你很活跃！为确保高质量建议，请等待几分钟再发送更多消息。',
          ru: 'Вы были очень активны! Для качественных советов подождите несколько минут.',
          ar: 'لقد كنت نشطًا جدًا! لضمان نصائح عالية الجودة، يرجى الانتظار بضع دقائق.',
          id: 'Kamu sangat aktif! Untuk memastikan saran berkualitas, tunggu beberapa menit sebelum mengirim pesan lagi.',
        };
        return {
          success: true,
          reply: rateLimitMsgs[lang] || rateLimitMsgs.en,
          suggestions: [],
          coachMessagesRemaining,
        };
      }

      // 2. Read user profile + learning profile + match count in parallel
      const matchesCountPromise = db.collection('matches')
        .where('usersMatched', 'array-contains', userId).count().get();
      const [userDoc, learningDoc, matchesCountSnap] = await Promise.all([
        Promise.resolve(creditDoc), // Reuse already-fetched user doc
        config.learningEnabled ? db.collection('coachChats').doc(userId).get() : Promise.resolve(null),
        matchesCountPromise,
      ]);
      const learningProfile = learningDoc?.exists ? (learningDoc.data()?.learningProfile || null) : null;
      const learningContext = config.learningEnabled ? buildLearningContext(learningProfile) : '';
      const userData = userDoc.exists ? userDoc.data() : {};
      const userName = userData.name || 'User';
      const userAge = userData.birthDate
        ? Math.floor((Date.now() - userData.birthDate.toDate().getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : null;
      const userType = userData.userType || '';
      const userBio = userData.bio || '';
      const userInterests = (userData.interests || []).slice(0, 10).join(', ');
      const userOrientation = userData.orientation || 'both';
      const userGender = userData.male ? 'male' : 'female';
      const userLat = userData.latitude;
      const userLng = userData.longitude;
      // Extended profile data for richer context
      const userPhotosCount = (userData.pictures || []).length;
      const userTimezone = userData.timezone || '';
      const userTimezoneOffset = typeof userData.timezoneOffset === 'number' ? userData.timezoneOffset : null;
      const totalMatches = matchesCountSnap.data().count || 0;
      const likedCount = (userData.liked || []).length;
      const passedCount = (userData.passed || []).length;
      const dailyLikesRemaining = typeof userData.dailyLikesRemaining === 'number' ? userData.dailyLikesRemaining : 100;
      const superLikesRemaining = typeof userData.superLikesRemaining === 'number' ? userData.superLikesRemaining : 5;
      const maxDistance = userData.maxDistance || 200;
      const minAge = userData.minAge;
      const maxAge = userData.maxAge;

      // 3. Optionally read match context
      let matchContext = '';
      let matchName = '';
      let matchInterests = '';
      let matchLat = null;
      let matchLng = null;
      let sharedInterests = '';
      let relationshipStage = null;
      if (matchId) {
        const matchDoc = await db.collection('matches').doc(matchId).get();
        if (matchDoc.exists) {
          const matchData = matchDoc.data();
          // Security: validate user belongs to this match
          const usersMatched = matchData.usersMatched || [];
          if (!usersMatched.includes(userId)) {
            logger.warn(`[dateCoachChat] User ${userId} tried to access match ${matchId} they don't belong to`);
          } else {
          const matchMessageCount = matchData.messageCount || 0;
          const matchTimestamp = matchData.timestamp;
          const otherUserId = usersMatched.find((id) => id !== userId);
          if (otherUserId) {
            const otherDoc = await db.collection('users').doc(otherUserId).get();
            if (otherDoc.exists) {
              const other = otherDoc.data();
              matchName = other.name || 'someone';
              const otherInterestsArr = (other.interests || []).slice(0, 12);
              matchInterests = otherInterestsArr.join(', ');
              matchLat = other.latitude;
              matchLng = other.longitude;
              const matchAge = other.birthDate
                ? Math.floor((Date.now() - other.birthDate.toDate().getTime()) / (365.25 * 24 * 60 * 60 * 1000))
                : null;
              const matchGender = other.male ? 'male' : 'female';
              const matchOrientation = other.orientation || 'both';
              const matchType = other.userType || '';
              const matchPhotosCount = (other.pictures || []).length;

              // Calculate shared interests
              const userInterestsArr = (userData.interests || []).slice(0, 10);
              const shared = userInterestsArr.filter((i) => otherInterestsArr.includes(i));
              sharedInterests = shared.join(', ');

              // Calculate match age (how long they've been matched)
              let matchAgeDays = null;
              if (matchTimestamp) {
                const matchDate = matchTimestamp.toDate ? matchTimestamp.toDate() : new Date(matchTimestamp);
                matchAgeDays = Math.floor((Date.now() - matchDate.getTime()) / (24 * 60 * 60 * 1000));
              }

              // Determine relationship stage based on messages and time
              relationshipStage = 'new_match';
              if (matchMessageCount === 0) {
                relationshipStage = 'no_conversation_yet';
              } else if (matchMessageCount < 5) {
                relationshipStage = 'just_started_talking';
              } else if (matchMessageCount < 20) {
                relationshipStage = 'getting_to_know';
              } else if (matchMessageCount < 50) {
                relationshipStage = 'building_connection';
              } else {
                relationshipStage = 'active_conversation';
              }

              matchContext = `\nThe user is asking about a specific match:` +
                `\n- Name: ${matchName}${matchAge ? `, Age: ${matchAge}` : ''}` +
                `, Gender: ${matchGender}, Interest: ${matchOrientation}` +
                (matchType ? `, Type: ${matchType}` : '') +
                `\n- Photos: ${matchPhotosCount}` +
                (other.bio ? `\n- Bio: "${other.bio.substring(0, 300)}"` : '\n- Bio: (no bio set)') +
                (matchInterests ? `\n- Interests: ${matchInterests}` : '\n- Interests: (none)') +
                (sharedInterests ? `\n- SHARED INTERESTS with user: ${sharedInterests} (use these for personalized advice!)` : '\n- No shared interests (suggest finding common ground)') +
                `\n- Relationship stage: ${relationshipStage} (${matchMessageCount} messages exchanged${matchAgeDays !== null ? `, matched ${matchAgeDays} day(s) ago` : ''})` +
                '\n';
            }
          }
          // Read recent messages for conversation context (increase limit for better analysis)
          const msgLimit = Math.min(config.historyLimit * 2, 20);
          const recentMsgs = await db.collection('matches').doc(matchId)
            .collection('messages').orderBy('timestamp', 'desc').limit(msgLimit).get();
          if (!recentMsgs.empty) {
            const msgs = recentMsgs.docs.reverse().map((d) => {
              const m = d.data();
              const sender = m.senderId === userId ? 'User' : matchName;
              const msgType = m.type || 'text';
              if (msgType === 'ephemeral_photo') return `${sender}: [sent a photo]`;
              if (msgType === 'place') return `${sender}: [suggested a place: ${(m.message || '').substring(2, 100)}]`;
              return `${sender}: ${(m.message || '').substring(0, 200)}`;
            }).join('\n');
            matchContext += `Recent conversation with ${matchName} (${recentMsgs.size} messages):\n${msgs}`;

            // Analyze conversation dynamics
            const userMsgs = recentMsgs.docs.filter((d) => d.data().senderId === userId);
            const matchMsgs = recentMsgs.docs.filter((d) => d.data().senderId !== userId);
            const avgUserLen = userMsgs.length > 0
              ? Math.round(userMsgs.reduce((sum, d) => sum + (d.data().message || '').length, 0) / userMsgs.length) : 0;
            const avgMatchLen = matchMsgs.length > 0
              ? Math.round(matchMsgs.reduce((sum, d) => sum + (d.data().message || '').length, 0) / matchMsgs.length) : 0;
            matchContext += `\nConversation dynamics: User avg message length: ${avgUserLen} chars, ${matchName} avg: ${avgMatchLen} chars. ` +
              `User sent ${userMsgs.length}/${recentMsgs.size} messages (${Math.round(userMsgs.length / recentMsgs.size * 100)}%).`;
          } else {
            matchContext += `\nNo messages exchanged yet — this is an opportunity to help craft the perfect first message!`;
          }
        }
      } // end usersMatched.includes security check
      }

      // 3b. Build location context for activity suggestions
      // Location always from Firestore profile (updated by HomeView via updateDeviceSettings)
      const effectiveLat = userLat;
      const effectiveLng = userLng;
      const hasLocation = !!(effectiveLat && effectiveLng);

      // Temporal context — inject local time, day of week, season for relevant suggestions
      const userOffset = typeof userData.timezoneOffset === 'number' ? userData.timezoneOffset : 0;
      const userLocalTime = new Date(Date.now() + userOffset * 3600000);
      const userLocalHour = userLocalTime.getUTCHours();
      const userLocalDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][userLocalTime.getUTCDay()];
      const userLocalMonth = userLocalTime.getUTCMonth(); // 0-11
      const isWeekend = userLocalTime.getUTCDay() === 0 || userLocalTime.getUTCDay() === 6;
      const season = userLocalMonth <= 1 || userLocalMonth === 11 ? 'winter' : userLocalMonth <= 4 ? 'spring' : userLocalMonth <= 7 ? 'summer' : 'autumn';
      const timeOfDay = userLocalHour < 6 ? 'late night' : userLocalHour < 12 ? 'morning' : userLocalHour < 17 ? 'afternoon' : userLocalHour < 21 ? 'evening' : 'night';
      const temporalContext = `\nUser's local time: ${userLocalDay} ${timeOfDay} (${userLocalHour}:00, ${season}). ${isWeekend ? 'It is the weekend.' : 'It is a weekday.'} Consider this when suggesting activities — avoid nightlife in the morning, outdoor activities late at night, etc.`;

      let locationContext = '';
      if (hasLocation) {
        locationContext = `\nUser location: lat ${effectiveLat.toFixed(2)}, lng ${effectiveLng.toFixed(2)}`;
        if (matchLat && matchLng) {
          const midLat = ((effectiveLat + matchLat) / 2).toFixed(2);
          const midLng = ((effectiveLng + matchLng) / 2).toFixed(2);
          locationContext += ` | Match location: lat ${matchLat.toFixed(2)}, lng ${matchLng.toFixed(2)} | Midpoint: ${midLat}, ${midLng}`;
        }
      }

      // Append temporal context to location context
      locationContext += temporalContext;

      // 3c. Fetch real places from Google Places API when location is available
      // Detect if user message is a place search — two patterns:
      // 1. Proximity words in 10 languages (e.g., "cercana", "nearby", "near me")
      const proximityPattern = /\b(cercan[ao]s?|nearby|near me|near here|close by|around here|cerca de (aqu[ií]|m[ií])|por aqu[ií]|en la zona|en mi zona|dans le coin|in der nähe|perto de mim|perto daqui|近くの|附近|поблизости|рядом|dekat sini|di sekitar|around (downtown|the city|town|centro)|alrededor de|close to|junto a|in the .{2,20} area|en la zona de|بالقرب|قريب من هنا|في المنطقة|حولي|بجانبي)\b/i;
      // 2. Place/business type keywords relevant for dating (all languages supported)
      const placeTypePattern = /\b(florerr?[ií]a|florist|flower\s*shop|flor(es|ist)|joyerr?[ií]a|jewel(ry|er)|chocolater[ií]a|chocolate\s*shop|bomboner[ií]a|pastel(er[ií]a|shop)|baker[yi]|panader[ií]a|dulcer[ií]a|candy|helade?r[ií]a|ice\s*cream|gelater[ií]a|perfumer[ií]a|perfume\s*shop|regal(os?|er[ií]a)|gift\s*shop|tienda de regalos|restaurante?s?|café|cafeter[ií]a|coffee\s*shop|bar(es)?|pub|lounge|cocktail|coctel(er[ií]a)?|wine\s*bar|vinoteca|cervece?r[ií]a|brewery|brunch|bistro|trattoria|pizzer[ií]a|sushi|cena|dinner|comida|food|taquería|taco|burger|hamburgues(a|er[ií]a)|bbq|parrilla|asador|marisquer[ií]a|seafood|spa|masaje|massage|wellness|yoga|gym|gimnasio|sal[oó]n de belleza|beauty\s*salon|peluquer[ií]a|barber|hair\s*salon|mall|centro comercial|shopping|boutique|tienda de ropa|clothing|museo|museum|galer[ií]a de arte|art\s*gallery|teatro|theater|theatre|cine|cinema|movie|pel[ií]cul|bowling|boliche|karaoke|escape\s*room|arcade|mini\s*golf|parque|park|jardín|garden|bot[aá]nic|plaza|mirador|viewpoint|rooftop|terraza|playa|beach|club|discoteca|nightclub|disco|pista de baile|dance|lago|lake|monta[ñn]a|mountain|sendero|trail|hiking|camping|picnic|zoo(l[oó]gico)?|acuario|aquarium|planetario|planetarium|librer[ií]a|bookstore|book\s*shop|antique|antig[üu]edad|tattoo|tatuaje|pier(cing)?|fotograf[ií]a|photo\s*(studio|booth)|cooking\s*class|clase de cocina|potter[yi]|cer[aá]mica|art\s*class|mezcaler[ií]a|tequiler[ií]a|licorerr?[ií]a|liquor|wine\s*shop|deli|market|mercado|feria|fair|concert|concierto|m[uú]sica en vivo|live\s*music|jazz|show|espect[aá]culo|hotel|motel|hostal|hostel|airbnb|cabin|caba[ñn]a|resort|country\s*club|golf|tenis|tennis|ski|surf|d[oó]nde (comprar|llevar|ir|encontrar|buscar)|where\s*(to\s*)?(buy|find|go|get|take)|dance\s*class|clase de baile|adventure\s*park|parque de aventura|go-?karts?|karting|farmer'?s?\s*market|mercado org[aá]nico|food\s*truck|couple\s*photoshoot|sesi[oó]n de fotos|speakeasy|wine\s*tasting|cata de vinos?|cooking\s*experience|experiencia gastron[oó]mica|zip\s*line|tirolesa|paintball|laser\s*tag|trampoline|camas el[aá]sticas|boat\s*(ride|tour)|paseo en bote)\b/i;
      // 3. Additional place search detection — intent phrases, food/drink verbs, proximity, all 10 languages
      const placeSearchPattern = /\b(cerca\b|aqu[ií]\s*cerca|ac[aá]\s*cerca|por\s*ac[aá]|comer|cenar|almorzar|desayunar|merendar|tomar\s*(algo|caf[eé]|un\s*(trago|copa|coctel|drink|café))|ir\s*a\s*(comer|cenar|almorzar|desayunar|tomar)|salir\s*(a\s*)?(comer|cenar|de\s*cita|de\s*noche|a\s*pasear)|vamos\s*a\s*(comer|cenar|almorzar|tomar|salir)|lugar(es)?(\s+(para|donde|que|bonito|lindo|bueno))?|sitio(s)?(\s+(para|donde|que|bonito|lindo|bueno))?|recomi[eé]nd(ame|a(me)?|en)|sugi[eé]r(eme|e(me)?)|d[oó]nde\s*(puedo|podemos|deber[ií]a|voy|vamos|hay|queda|ir|comer|cenar)|qu[eé]\s*(me\s*)?recomiendas|conoces\s*alg[uú]n|sabes\s*de\s*alg[uú]n|hay\s*alg[uú]n|un\s*(buen|lindo|bonito)\s*(lugar|sitio|restaurante|bar|caf[eé])|mejore?s?\s*(lugar|sitio|restaurante|bar)e?s?|algún\s*(lugar|sitio|bar|café|restaurante)|alguna\s*(idea|sugerencia|recomendaci[oó]n)|ideas?\s*(de|para)\s*(lugar|sitio|cita|date|salir)|eat(ing)?|dine|din(ner|ing)(\s*(spot|place))?|lunch(ing)?|grab\s*(a\s*)?(bite|food|coffee|drink|beer)|get\s*(food|lunch|dinner|coffee|drinks?)|go\s*(out\s*)?(for|to)\s*(eat|dinner|lunch|drinks?|food)|want\s*to\s*(eat|go|try|find|visit|explore)|where\s*(can|should|do|to)\s*(i|we)?\s*(eat|go|find|get|drink|have)|best\s*(place|spot|restaurant|bar|venue)s?\s*(to|for|near|in|around)?|recommend(ation)?s?\s*(for|a)?|suggest(ion)?s?\s*(for|a)?|know\s*(of\s*)?(any|a)\s*(good|nice|great)?|looking\s*for\s*(a|some|the)?\s*(place|spot|restaurant|bar|venue)|somewhere\s*(nice|good|cool|fun|romantic|to\s*eat)|take\s*(me|her|him|us)\s*(to|somewhere)|manger|o[uù]\s*(aller|manger|boire|sortir)|un\s*endroit|quelque\s*part|id[eé]es?\s*de\s*(lieu|sortie|restaurant)|essen(\s*gehen)?|wohin(\s*gehen)?|irgendwo|wo\s*(kann|soll)|食べ(る|に|たい|よう|に行)?|飲み(に|たい|に行)?|どこ(か|に|で|へ)|おすすめ|いい(店|場所|レストラン)|吃[饭飯]?|喝|哪[里裡]|推[荐薦]|好的?(餐[厅廳]|地方|店)|makan|minum|tempat\s*(makan|bagus)|dimana|kemana|perto|pr[oó]ximo|onde\s*(posso|comer|ir|fica)|por\s*aqu[ií]|por\s*ac[aá]|поесть|поужинать|пообедать|позавтракать|где\s*(можно|поесть|найти)|порекомендуй|посоветуй|хорошее?\s*(место|ресторан|бар|кафе)|أين\s*(أجد|يمكن|نذهب|نأكل|نشرب)|مطعم|مقهى|بار|مكان\s*(جيد|حلو|رومانسي|للأكل|للشرب)|أريد\s*(أكل|أذهب|مكان)|أفضل\s*(مطعم|مقهى|مكان)|اقترح|وين\s*(نروح|أروح|أقدر\s*آكل))\b/i;
      // 4. Purchase, gifting & product search — catches buy/gift intent + standalone date-relevant products (10 languages)
      // Aligned with RAG categories: gift_ideas, date_ideas, activity_places in coachKnowledge
      // Configurable via Remote Config coach_config.placeSearch: purchaseExtraTerms (append new terms without redeploy)
      const ps = config.placeSearch || {};
      const purchaseVerbs = DEFAULT_PURCHASE_VERBS;
      const purchaseProducts = DEFAULT_PURCHASE_PRODUCTS;
      const purchaseGifts = DEFAULT_PURCHASE_GIFTS;
      const extraTerms = (ps.purchaseExtraTerms || '').trim();
      let purchaseFullPattern = `${purchaseVerbs}|${purchaseProducts}|${purchaseGifts}`;
      if (extraTerms) purchaseFullPattern += `|${extraTerms}`;
      const purchaseGiftPattern = new RegExp('\\b(' + purchaseFullPattern + ')\\b', 'i');
      // 5. Lifestyle, emotional & vague intent — catches surprise planning, celebrations, self-care,
      //    reconciliation, travel, group activities, undecided/bored users, and compound requests (10 languages)
      //    These queries imply the user wants PLACE suggestions but don't explicitly name a venue type or product
      const lifestyleIntentPattern = /\b(sorprender(l[aeo])?|surpris[ea]|überrasch(en|ung)|surpreender|サプライズ|惊喜|удивить|مفاجأة|kejutan|celebrar(le)?|festejar|celebrate|fêter|feiern|祝う|庆祝|отпразд|احتفل|merayakan|aniversario|anniversary|anniversaire|Jahrestag|aniversário|記念日|纪念日|годовщин|ذكرى|ulang\s*tahun|reconcili(ar|arse|ación)?|disculpar(me|se|nos)?|make\s*it\s*up\s*(to|with)|apologize\s*(to|with)|se\s*réconcilier|versöhn(en|ung)|仲直り|和好|помирить|مصالحة|berdamai|auto[- ]?cuidado|self[- ]?care|me\s*time|consentirme|cuidarme|treat\s*myself|me\s*faire\s*plaisir|mir\s*(etwas\s*)?gönnen|自分へのご褒美|犒劳自己|побаловать\s*себя|عناية\s*(ب|ال)نفس|perawatan\s*diri|conocer\s*gente|meet\s*(new\s*)?people|rencontrer\s*des?\s*gens|Leute\s*kennenlernen|conhecer\s*pessoas|出会い(の場)?|认识(新)?人|познакоми|التعرف\s*على|kenalan|aburrido|me\s*aburro|no\s*s[eé]\s*qu[eé]\s*hacer|bored|don'?t\s*know\s*what\s*to\s*do|je\s*m'?ennuie|langweilig|Langeweile|entediado|退屈|无聊|скучно|не\s*знаю\s*что\s*делать|ملل|bosan|qu[eé]\s*hago\s*(hoy|este|esta)?|qu[eé]\s*puedo\s*hacer|what\s*(can|should)\s*I\s*do|viaje\s*rom[aá]ntic|escapad[ao]|getaway|romantic\s*(trip|getaway|escape)|voyage\s*romantique|romantische\s*Reise|viagem\s*rom[aâ]ntica|旅行(デート)?|浪漫旅[行游]|романтическ\w*\s*(поездк|путешестви)|رحلة\s*رومانسية|liburan\s*romantis|doble\s*cita|double\s*date|cita\s*(grupal|en\s*grupo)|group\s*(date|outing|activity)|sortie\s*(en\s*)?groupe|Doppel[- ]?date|encontro\s*duplo|ダブルデート|双人约会|двойное\s*свидание|موعد\s*جماعي|llevar(l[aeo]|le|les)\s*(a|de)|take\s*(her|him|them)\s*(out|somewhere|to)|emmener|mitnehmen|levar\s*(el[ae])|連れて行|带.{0,4}去|сводить|يأخذ(ها)?|ajak\s*(dia\s*)?keluar|planificar\s*(una\s*)?(cita|salida|noche|velada)|plan\s*(a|the|our)?\s*(date|outing|night|evening)|organiser\s*(une\s*)?soirée|Abend\s*planen|planejar\s*(um\s*)?(encontro|noite)|デートの?(計画|プラン)|计划.{0,4}(约会|晚上)|спланировать\s*(свидание|вечер)|خطة?\s*(موعد|سهرة)|rencana\s*kencan|noche\s*especial|special\s*(night|evening|occasion)|soirée\s*spéciale|besonderer\s*Abend|noite\s*especial|特別な夜|特别的(夜晚|晚上)|особенный\s*вечер|ليلة\s*خاصة|malam\s*spesial|fin\s*de\s*semana|weekend\s*(plan|idea|activity)|week-?end|Wochenende|fim\s*de\s*semana|週末|周末|выходн|عطلة\s*نهاية|akhir\s*pekan|mantener\s*la\s*(chispa|llama|pasi[oó]n)|reignit|rekindle|keep\s*the\s*spark|spice\s*things?\s*up|rutina\s*(de?\s*pareja|en\s*la\s*relaci[oó]n)|relationship\s*rut|stuck\s*in\s*a?\s*rut|conocer\s*(a\s*)?(sus?\s*)?(padres?|familia|amigos?|suegr)|meet\s*(the\s*)?(parents?|family|friends|in-?laws)|présenter\s*(aux?\s*)?parents|Eltern\s*(kennen\s*)?lernen|conhecer\s*(os\s*)?(pais?|família)|親に会|见家长|познакомить(ся)?\s*(с\s*)?(родител|семь)|يقابل\s*(أهل|عائلة)|kenalan\s*orang\s*tua|mudarnos?\s*juntos?|moving?\s*(in)?\s*together|emm[eé]nager\s*ensemble|zusammen\s*(ein)?ziehen|morar\s*juntos?|同棲|同居|переехать\s*вместе|living\s*together|conviv(ir|encia)|cohabita(r|tion)|celos?\s*(de?\s*mi\s*pareja)?|jealous(y)?|cel[oó]s[oa]?|eifersüchtig|ciúmes?|嫉妬|吃醋|ревност|غيرة|cemburu|pelea\s*(con\s*mi\s*pareja)?|argument\s*with\s*(my\s*)?(partner|boyfriend|girlfriend)|discusi[oó]n\s*(con|de\s*pareja)|fight\s*with\s*(my\s*)?(partner|boyfriend|girlfriend)|nos?\s*peleamos|had\s*a\s*fight|recuperar\s*(la\s*)?(confianza|relaci[oó]n)|rebuild\s*trust|volver\s*a\s*confiar|starting\s*over\s*(after|dating)|empezar\s*de\s*nuevo|volver\s*a\s*salir|regres[aoe]\s*(a\s*las?\s*)?citas|volver\s*a\s*intentar|getting\s*back\s*(out\s*there|into\s*dating)|retour\s*(aux?\s*)?rencontres|wieder\s*daten|voltar\s*a\s*namorar|再びデート|重新约会|вернуться\s*к\s*свиданиям|العودة\s*للمواعدة|kembali\s*berkencan|dating\s*fatigue|cansado\s*de\s*(las\s*)?citas|harto\s*de\s*(buscar|citas|apps?)|tired\s*of\s*(dating|swiping|apps?))\b/i;
      const isUserPlaceSearch = proximityPattern.test(message) || placeTypePattern.test(message) || placeSearchPattern.test(message) || purchaseGiftPattern.test(message) || lifestyleIntentPattern.test(message) || message.includes('📍');

      const noLocationInstruction = !hasLocation
        ? (isUserPlaceSearch
          ? `\n\nNOTE — LIMITED LOCATION: You do not have the user's exact location, but they are searching for places. Provide the best suggestions you can based on the search results and your knowledge. At the end of your response, briefly and casually mention (in the user's language ${lang}) that you could give more precise local recommendations if they enable location in the app or mention their city. Do NOT refuse to suggest places — always provide recommendations even without exact location.`
          : `\n\nIMPORTANT — NO LOCATION AVAILABLE: You do not have the user's location. When the user asks about places, venues, date spots, things to do, or activity recommendations, you MUST first ask them what city or area they would like suggestions for before providing venue recommendations. Ask this question IN THE USER'S LANGUAGE (${lang}). Once the user mentions a city or area in the conversation (current or previous messages in history), use that location for your suggestions. If the user already mentioned a city or area in their current message, use that directly without asking again.`)
        : '';

      // Phase 1: Intent Extraction — lightweight Gemini call to parse WHAT and WHERE from user message
      let extractedIntent = null;
      if (isUserPlaceSearch) {
        try {
          const intentApiKey = process.env.GEMINI_API_KEY;
          if (intentApiKey) {
            const intentAI = new GoogleGenerativeAI(intentApiKey);
            const intentModel = intentAI.getGenerativeModel({
              model: AI_MODEL_NAME,
              generationConfig: {temperature: 0.1, maxOutputTokens: 256, responseMimeType: 'application/json'},
            });
            const intentPrompt = `Extract search intent from this message. The user speaks "${lang}".
Message: "${message.substring(0, 300)}"

Return JSON: {"placeType": "short type for Google search (e.g. pub, bar, restaurant, café, sushi, spa, park, flower shop, chocolate shop, jewelry store, gift shop, wine shop, bakery, perfume store, pizzeria, ice cream shop)", "placeQueries": ["2-3 short search queries in the user's language optimized for Google Places. IMPORTANT: Map PRODUCTS to SHOPS — e.g. 'comprar chocolates' → ['chocolatería', 'tienda de chocolates', 'chocolate artesanal'], 'buy flowers' → ['florist', 'flower shop', 'bouquet delivery'], 'quiero pizza' → ['pizzería', 'pizza restaurant', 'mejor pizza'], 'pub con buena música' → ['pub música en vivo', 'bar con música', 'pub popular'], 'rosas para mi cita' → ['florería', 'rosas frescas', 'floristería'], 'acheter du vin' → ['cave à vin', 'caviste', 'wine shop'], 'Schokolade kaufen' → ['Schokoladenladen', 'Chocolatier', 'Pralinenladen']"], "locationMention": "city/area mentioned in message or null", "mood": "desired vibe in 2-3 words or null", "googleCategory": "closest Google Places type from: cafe, restaurant, bar, night_club, movie_theater, park, museum, bowling_alley, art_gallery, bakery, shopping_mall, spa, aquarium, zoo, or null (use shopping_mall for gift/product/jewelry shops, bakery for chocolate/pastry/sweets shops, cafe for ice cream shops)"}`;
            const intentResult = await intentModel.generateContent(intentPrompt);
            const intentText = intentResult.response.text();
            extractedIntent = parseGeminiJsonResponse(intentText);
            logger.info(`[dateCoachChat] Intent extracted: placeType=${extractedIntent.placeType}, location=${extractedIntent.locationMention}, category=${extractedIntent.googleCategory}`);
          }
        } catch (intentErr) {
          logger.warn(`[dateCoachChat] Intent extraction failed (non-critical): ${intentErr.message}`);
        }
      }

      let placesLastRadiusUsed = 0;
      const fetchCoachPlaces = async () => {
        const placesKey = process.env.GOOGLE_PLACES_API_KEY;
        if (!placesKey) return [];
        const ps = config.placeSearch || {};
        if (!hasLocation && !(isUserPlaceSearch && ps.enableWithoutLocation !== false)) return [];
        try {
          const psConfig = config.placeSearch || {};
          const minR = psConfig.minRadius || 3000;
          const maxR = psConfig.maxRadius || 300000;
          // Coach IA: search around user's location OR the city mentioned in the message
          // If the user mentions a specific city (e.g. "voy a Buenos Aires") → forward geocode it
          let center = hasLocation
            ? {latitude: effectiveLat, longitude: effectiveLng}
            : null;
          let locationOverridden = false;
          if (extractedIntent && typeof extractedIntent.locationMention === 'string' && extractedIntent.locationMention.length >= 2) {
            try {
              const mentionedCoords = await forwardGeocode(extractedIntent.locationMention);
              if (mentionedCoords) {
                center = mentionedCoords;
                locationOverridden = true;
                logger.info(`[dateCoachChat] Location overridden to "${extractedIntent.locationMention}": ${mentionedCoords.latitude}, ${mentionedCoords.longitude}`);
              }
            } catch (geoErr) {
              logger.warn(`[dateCoachChat] Forward geocode failed for "${extractedIntent.locationMention}": ${geoErr.message}`);
            }
          }
          // Start from smallest progressive radius step (no minimum skip)
          // In cities like Concepción, 15km finds plenty of results
          const computedMinR = 0;

          let queries;
          const effectiveCategory = requestCategory || null;
          // Determine the Google Places includedType for category-specific searches
          let searchIncludedType = null;
          if (effectiveCategory && CATEGORY_TO_PLACES_TYPE[effectiveCategory]) {
            searchIncludedType = [CATEGORY_TO_PLACES_TYPE[effectiveCategory]];
          } else if (isUserPlaceSearch && extractedIntent && extractedIntent.googleCategory) {
            // Use intent category as type filter — even when location overridden to a mentioned city
            // "restaurants in Temuco" → includedType: restaurant. "places in Temuco" → googleCategory=null → no filter
            const intentCat = normalizeCategory(extractedIntent.googleCategory);
            if (intentCat && CATEGORY_TO_PLACES_TYPE[intentCat]) {
              searchIncludedType = [CATEGORY_TO_PLACES_TYPE[intentCat]];
            }
          }

          if (effectiveCategory && categoryQueryMap[effectiveCategory]) {
            // Category filter — run 3 queries: canonical + split terms for diversity
            const canonicalQuery = categoryQueryMap[effectiveCategory];
            const terms = canonicalQuery.split(' ').filter((t) => t.length > 2);
            const subQueries = terms.length > 3
              ? [terms.slice(0, 3).join(' '), terms.slice(3).join(' ')]
              : [terms.join(' ')];
            queries = [canonicalQuery, ...subQueries].slice(0, 3);
          } else if (isUserPlaceSearch && extractedIntent && locationOverridden) {
            // City mentioned (e.g. "restaurants in Temuco") — use intent-aware queries for relevant results
            const intentQueries = Array.isArray(extractedIntent.placeQueries) && extractedIntent.placeQueries.length > 0
              ? extractedIntent.placeQueries.filter((q) => typeof q === 'string' && q.length > 0).slice(0, 3)
              : [];
            if (intentQueries.length > 0) {
              queries = intentQueries;
              // Add canonical category query for extra coverage
              if (extractedIntent.googleCategory) {
                const catKey = normalizeCategory(extractedIntent.googleCategory);
                if (catKey && categoryQueryMap[catKey] && !queries.includes(categoryQueryMap[catKey])) {
                  queries.push(categoryQueryMap[catKey]);
                }
              }
            } else {
              // No specific intent queries — diverse categories as fallback
              const allCats = Object.keys(categoryQueryMap);
              const shuffled = [...allCats].sort(() => Math.random() - 0.5);
              queries = shuffled.slice(0, 5).map((k) => categoryQueryMap[k]);
            }
          } else if (isUserPlaceSearch && extractedIntent) {
            // Intent-aware search: use Gemini-extracted queries in user's language
            const intentQueries = Array.isArray(extractedIntent.placeQueries) && extractedIntent.placeQueries.length > 0
              ? extractedIntent.placeQueries.filter((q) => typeof q === 'string' && q.length > 0).slice(0, 3)
              : [];
            if (intentQueries.length > 0) {
              queries = intentQueries;
              // Add canonical category query if we have one for extra coverage
              if (searchIncludedType && extractedIntent.googleCategory) {
                const catKey = normalizeCategory(extractedIntent.googleCategory);
                if (catKey && categoryQueryMap[catKey] && !queries.includes(categoryQueryMap[catKey])) {
                  queries.push(categoryQueryMap[catKey]);
                }
              }
            } else {
              // Fallback: use extracted placeType or raw message
              queries = [extractedIntent.placeType || message.substring(0, 100)];
            }
          } else if (isUserPlaceSearch) {
            // Place search detected but intent extraction failed — use raw message
            queries = [message.substring(0, 100)];
          } else {
            // General conversation — use diverse category queries for variety
            const allCats = Object.keys(categoryQueryMap);
            const shuffled = [...allCats].sort(() => Math.random() - 0.5);
            queries = shuffled.slice(0, 4).map((k) => categoryQueryMap[k]);
          }

          const perQuery = psConfig.perQueryResults || 20;
          // Use locationRestriction (hard geographic filter) when user has location
          // When location is overridden to a mentioned city, use locationBias (soft preference)
          // so Google returns results FROM that city, not filtered to the user's physical area
          const useRestriction = hasLocation && center && !locationOverridden;

          // Progressive radius: start small (15km), expand if fewer than minTarget results
          // Optimized: in urban areas (most users) a single round suffices; suburban 2 rounds; rural 3+
          const progressiveSteps = Array.isArray(psConfig.progressiveRadiusSteps) && psConfig.progressiveRadiusSteps.length > 0
            ? psConfig.progressiveRadiusSteps : [15000, 30000, 60000, 120000, 200000, 300000];
          const minTarget = psConfig.minPlacesTarget || 30;
          const maxIntermediate = psConfig.maxPlacesIntermediate || 60;

          // Skip steps smaller than computedMinR (match midpoint requires coverage of both users)
          const effectiveSteps = hasLocation
            ? (progressiveSteps.filter((s) => s >= computedMinR).length > 0
              ? progressiveSteps.filter((s) => s >= computedMinR)
              : [Math.min(maxR, Math.max(...progressiveSteps))])
            : [null]; // no location = single query without radius

          const allUniqueIds = new Set();
          let allRawPlaces = [];
          let lastRadius = 0;

          for (const stepRadius of effectiveSteps) {
            const radiusMeters = stepRadius ? Math.min(maxR, stepRadius) : null;
            lastRadius = stepRadius || 0;

            const results = await Promise.all(
              queries.map((q) => placesTextSearch(q, center, radiusMeters, lang, null, perQuery, useRestriction, searchIncludedType).catch(() => ({places: []}))),
            );

            const newPlaces = results.flatMap((r) => r.places).filter((p) => {
              if (!p.id || allUniqueIds.has(p.id)) return false;
              allUniqueIds.add(p.id);
              return true;
            });
            allRawPlaces = [...allRawPlaces, ...newPlaces];

            logger.info(`[dateCoachChat] Progressive radius: ${radiusMeters}m → ${newPlaces.length} new places (total: ${allRawPlaces.length}, target: ${minTarget})`);

            if (allRawPlaces.length >= minTarget) break;
          }

          placesLastRadiusUsed = lastRadius;
          const unique = allRawPlaces.slice(0, maxIntermediate);

          return unique.map((p) => {
            const photoArr = p.photos || [];
            return {
              name: p.displayName?.text || '',
              address: p.formattedAddress || '',
              rating: p.rating || 0,
              reviewCount: p.userRatingCount || 0,
              photoCount: photoArr.length,
              latitude: p.location?.latitude || 0,
              longitude: p.location?.longitude || 0,
              placeId: p.id || '',
              website: p.websiteUri || null,
              googleMapsUrl: p.googleMapsUri || null,
              category: p.primaryType || null,
              description: p.editorialSummary?.text || null,
              priceLevel: googlePriceLevelToString(p.priceLevel) || null,
              photos: photoArr.slice(0, 3).map((ph) => ({
                url: `https://places.googleapis.com/v1/${ph.name}/media?maxHeightPx=${psConfig.photoMaxHeightPx || 400}&key=${placesKey}`,
                width: ph.widthPx || 400,
                height: ph.heightPx || 300,
              })),
            };
          });
        } catch (err) {
          logger.warn(`[dateCoachChat] Places fetch failed (non-critical): ${err.message}`);
          return [];
        }
      };

      // 4. Read coach history + fetch real places + RAG knowledge in parallel
      const ragConfig = config.rag || {};
      const [historySnap, realPlaces, ragKnowledge] = await Promise.all([
        db.collection('coachChats').doc(userId)
          .collection('messages').orderBy('timestamp', 'desc').limit(config.historyLimit).get(),
        fetchCoachPlaces(),
        retrieveCoachKnowledge(message, process.env.GEMINI_API_KEY, ragConfig, lang),
      ]);
      if (isUserPlaceSearch) {
        logger.info(`[dateCoachChat] Place search: hasLocation=${hasLocation}, realPlaces=${realPlaces.length}, isUserPlaceSearch=${isUserPlaceSearch}`);
      }
      const history = historySnap.empty ? '' : historySnap.docs.reverse().map((d) => {
        const m = d.data();
        return `${m.sender === 'user' ? 'User' : 'Coach'}: ${(m.message || '').substring(0, 300)}`;
      }).join('\n');

      // Build real places context for Gemini
      let realPlacesContext = '';
      if (realPlaces.length > 0) {
        realPlacesContext = '\n\nREAL PLACES FROM GOOGLE MAPS (you MUST select from these for activity suggestions):\n' +
          realPlaces.map((p, i) =>
            `${i + 1}. "${p.name}" [placeId:${p.placeId}] — ${p.address}${p.rating ? `, ★${p.rating}` : ''}${p.reviewCount ? ` (${p.reviewCount} reviews)` : ''}${p.priceLevel ? ` ${p.priceLevel}` : ''}${p.category ? ` [${p.category}]` : ''}${p.website ? ` | ${p.website}` : ''}${p.description ? `\n   ${p.description}` : ''}`,
          ).join('\n');
      }

      // 5. Build system prompt with content guardrails + activity suggestions
      const langInstruction = getLanguageInstruction(lang);
      const hasMatchContext = !!matchId && matchContext.length > 0;

      const blockedTopicsStr = (config.blockedTopics || []).join(', ');
      const offTopicMsg = (config.offTopicMessages || {})[lang] || (config.offTopicMessages || {}).en ||
        "I'm your Date Coach — I'm best at helping with dating, relationships, and connections!";

      // When user is explicitly searching for places, force activitySuggestions inclusion
      const minPlaceResults = (config.placeSearch || {}).minActivitiesForPlaceSearch || 6;
      const placeSearchInstruction = isUserPlaceSearch
        ? `\n\nCRITICAL — USER IS SEARCHING FOR PLACES OR PRODUCTS:
The user is explicitly asking about places, venues, locations, shops, or products to buy (gifts, food, drinks, etc.).
1. You MUST include an "activitySuggestions" array in your JSON response with at least ${minPlaceResults} places/shops.
2. Keep your "reply" text SHORT (2-3 sentences max) — just briefly introduce the suggestions. The MAIN content is the activitySuggestions array.
3. Select places from the REAL PLACES list provided. Use their EXACT names.
4. This is NOT optional — if you omit activitySuggestions, the response is INVALID.
5. NEVER respond with only text. The activitySuggestions array is the PRIORITY.
6. For PRODUCT searches (chocolates, flowers, wine, gifts, jewelry, perfume, pizza, cake, etc.), suggest SHOPS and STORES where they can buy those products — prioritize specialty stores over generic venues.`
        : '';

      // Build activity block — use real Google Maps places when available
      const hasRealPlaces = realPlaces.length > 0;
      const targetActivities = config.maxActivities;
      const activityFormatSpec = `Each activity suggestion must have:
- "emoji": a single relevant emoji
- "title": the EXACT name of the place as shown in Google Maps (do NOT rename or translate). Max 50 chars
- "placeId": the placeId from the Google Maps data (copy it exactly). null if not from Google Maps
- "description": why this is great for them specifically, in the user's language (max 80 chars). NEVER include price symbols ($) or price info in description — the priceLevel field handles pricing separately
- "category": one of "cafe", "restaurant", "bar", "night_club", "movie_theater", "park", "museum", "bowling_alley", "art_gallery", "bakery", "shopping_mall", "spa", "aquarium", "zoo"
- "bestFor": one of "first_date", "romantic", "fun", "adventurous", "relaxed", "special_occasion"
- "priceLevel": one of "$", "$$", "$$$", "$$$$" (use the price shown in Google Maps data if available. If no price data, use null — NEVER guess)
- "rating": use the REAL rating from Google Maps if provided. Otherwise omit
- "website": use the REAL website from the place data if provided. null if unknown. NEVER invent URLs
- "instagram": ONLY include if this venue's Instagram handle appears in the Google Maps data provided. Use the exact handle without @. If the Google Maps data does not include an Instagram handle for this place, use null. NEVER guess or make up handles — hallucinated handles damage user trust`;

      const activityBlock = hasRealPlaces
        ? (hasMatchContext
          ? `\nWhen the context is appropriate (user asks about dates, activities, where to go, what to do, wants suggestions), include an "activitySuggestions" array with 8-${targetActivities} personalized date ideas.

You MUST select places from the REAL PLACES list provided below (from Google Maps). Do NOT invent or hallucinate venue names. Pick the ones most relevant for this couple based on:
- Both users' shared interests (${sharedInterests || 'none — pick diverse places to discover common ground'})
- User interests: ${userInterests || 'none'} | Match interests: ${matchInterests || 'none'}
- The conversation tone, topics discussed, and relationship stage
- The user type dynamics (${userType || 'unknown'} dating ${matchName})
- Vary categories: restaurants, outdoor plans, cultural events, nightlife, adventures, wellness, entertainment
- Include a mix of price levels and moods (first date, romantic, fun, adventurous, relaxed, special occasion)

${activityFormatSpec}

Only include activitySuggestions when contextually relevant (user discusses dates, asks for ideas, mentions going out, etc.). Do NOT include them for generic profile advice or conversation tips.${realPlacesContext}`
          : `\nIf the user asks about places to go, things to do, or recommendations, include an "activitySuggestions" array with 8-${targetActivities} great places.

You MUST select places from the REAL PLACES list provided below (from Google Maps). Do NOT invent or hallucinate venue names. Pick the most interesting ones for the user based on their interests (${userInterests || 'none specified'}).
Focus on: trendy restaurants, cool bars, cultural spots, outdoor activities, entertainment, wellness, nightlife.

${activityFormatSpec}

Include activitySuggestions when the user asks about places, things to do, going out, or recommendations.${realPlacesContext}`)
        : (hasMatchContext
          ? `\nWhen the context is appropriate (user asks about dates, activities, where to go, what to do, wants suggestions), include an "activitySuggestions" array with 8-${targetActivities} personalized date ideas. Base these on:
- Both users' shared interests (${sharedInterests || 'none — suggest activities to discover common ground'})
- User interests: ${userInterests || 'none'} | Match interests: ${matchInterests || 'none'}
- The conversation tone, topics discussed, and relationship stage
- The user type dynamics (${userType || 'unknown'} dating ${matchName})
- Creative, specific ideas (not generic "go to dinner") — vary categories: restaurants, outdoor plans, cultural events, nightlife, adventures, wellness experiences, entertainment
- Include a mix of price levels and moods (first date, romantic, fun, adventurous, relaxed, special occasion)${locationContext ? `\n- Their approximate location context: ${locationContext}` : ''}

IMPORTANT: Suggest REAL, well-known, highly-rated venues and places — not generic ideas.

${activityFormatSpec}

Only include activitySuggestions when contextually relevant (user discusses dates, asks for ideas, mentions going out, etc.). Do NOT include them for generic profile advice or conversation tips.`
          : `\nIf the user asks about places to go, things to do, or recommendations, include an "activitySuggestions" array with 8-${targetActivities} great places and experiences to enjoy. These are NOT date suggestions — they are general lifestyle recommendations for the user based on their interests (${userInterests || 'none specified'}).${locationContext ? `\n- Consider their location context: ${locationContext}` : ''}
Focus on: trendy restaurants, cool bars, cultural spots, outdoor activities, entertainment, wellness, nightlife — places worth visiting regardless of dating.
IMPORTANT: Suggest REAL, well-known, highly-rated venues — not generic ideas.

${activityFormatSpec}

Include activitySuggestions when the user asks about places, things to do, going out, or recommendations.`);

      // Build user-type specialization from config
      const userTypeSpec = (config.coachingSpecializations || {})[userType] || '';
      const stagePrompt = relationshipStage ? ((config.stagePrompts || {})[relationshipStage] || '') : '';
      const responseStyleConfig = config.responseStyle || {};

      const contentGuardrails = `
CONTENT GUARDRAILS — STRICTLY ENFORCE:
You are EXCLUSIVELY a dating, relationship, and connection coach. You MUST stay within your domain at all times.
WHEN IN DOUBT, ANSWER. If a topic is even remotely related to dating, relationships, attraction, social skills, personal improvement for dating, or places/gifts for dates — it IS on-topic. Be generous in interpreting relevance.

ALLOWED TOPICS — COMPREHENSIVE LIST (answer ALL of these enthusiastically):

🗣️ CONVERSATION & COMMUNICATION:
- Conversation tips, what to say, how to respond, texting etiquette
- Icebreakers, openers, first messages for new matches
- How to keep a conversation interesting and engaging
- How to flirt (subtle vs. direct), banter, humor in dating
- Active listening techniques, asking better questions
- How to handle awkward silences or boring chats
- Double texting, response timing, message frequency
- How to express interest without being too intense
- How to bring up serious topics (exclusivity, boundaries, future)
- Voice notes, video calls, phone call tips
- How to transition from app chat to real life

💘 DATING & DATES:
- First date advice, second date ideas, creative date planning
- Where to go, what to do, venue recommendations, activity suggestions
- Date logistics: timing, duration, who pays, transportation
- How to create a memorable date experience
- Themed dates, budget-friendly dates, luxury dates
- Group dates, double dates, friend introductions
- Weekend plans, evening plans, daytime dates
- Season-specific date ideas (winter, summer, rainy day, holiday)
- Virtual/long-distance date ideas
- How to read the vibe during a date (is it going well?)
- Post-date etiquette: texting after, follow-up, asking for a second date

📍 PLACES & VENUES (ALWAYS ON-TOPIC — people search places for dates):
- ANY place, business, store, restaurant, bar, café, park search
- Gift shops, florists, jewelry, bakeries, chocolatiers, wine shops
- Romantic venues, rooftops, viewpoints, scenic spots
- Entertainment: bowling, karaoke, escape rooms, arcades, movies, theater
- Wellness: spas, yoga, gyms (for couples or self-improvement)
- Museums, galleries, cultural venues, concerts, live music
- Hotels, resorts, B&Bs (for travel dates or special occasions)
- Outdoor activities: hiking, beaches, parks, gardens, picnics
- Shopping areas, malls, boutiques (for date outfits or gift shopping)

🎁 ROMANTIC GESTURES & GIFTS:
- Gift ideas for any occasion (birthdays, anniversaries, Valentine's, Christmas, "just because")
- Romantic surprises, thoughtful details, creative gestures
- Love letters, poems, playlists, handmade gifts
- How to plan a special occasion or celebration
- How to show appreciation and gratitude to a partner
- Love languages: understanding and applying them
- Anniversary ideas, milestone celebrations
- How to apologize meaningfully with gestures

👤 PROFILE & SELF-PRESENTATION:
- Profile optimization: bio writing, prompt answers, headline crafting
- Photo tips: which photos work best, order, variety, selfie vs. candid
- How to show personality through a profile
- What to include/exclude in a dating profile
- Profile review and constructive feedback
- Discovery settings optimization (age range, distance, preferences)
- App strategy: when to swipe, super likes, daily routines

💪 CONFIDENCE & SELF-IMPROVEMENT FOR DATING:
- Building confidence, overcoming shyness, reducing anxiety
- Self-esteem in dating, knowing your worth
- Overcoming fear of rejection, vulnerability
- Body language, posture, eye contact
- Grooming, fashion, outfit ideas for dates
- Fitness and wellness as part of dating confidence
- Overcoming dating burnout and app fatigue
- Building an interesting life (hobbies, social circles) that attracts people
- Introvert dating strategies vs. extrovert dating
- How to be authentic while still making a good impression

❤️ RELATIONSHIPS & CONNECTIONS:
- Understanding attraction, chemistry, compatibility
- Red flags and green flags in dating and relationships
- How to know if someone is interested (signals, signs)
- Defining the relationship (DTR), exclusivity talk
- Moving from dating to a committed relationship
- Trust building, emotional intimacy, vulnerability
- Dealing with jealousy, insecurity in relationships
- Conflict resolution, healthy arguments, communication styles
- Long-distance relationships: maintaining connection, planning visits
- Cultural differences in dating, cross-cultural relationships
- Age-gap relationships, sugar dating dynamics and etiquette
- Attachment styles: understanding yours and your partner's
- Boundaries: setting, respecting, and communicating them
- When to give space vs. when to pursue
- Dealing with mixed signals
- Physical chemistry, timing of physical intimacy (tasteful advice only)
- Meeting friends and family of a partner
- Balancing independence and togetherness
- Navigating different relationship expectations
- Polyamory/open relationships (if asked — non-judgmental, factual)

💔 DEALING WITH DIFFICULTY:
- Rejection: how to handle being rejected gracefully
- Ghosting: coping, understanding, moving on
- Breakup recovery and moving on
- Unrequited feelings, friendzone navigation
- Dating after a long relationship or divorce
- Being left on read, ignored, unmatched
- Catfishing awareness and how to verify profiles
- Toxic relationship patterns: recognizing and breaking free
- Heartbreak and emotional healing
- Comparison syndrome (comparing yourself to others' relationships)
- When to let go vs. when to fight for a connection
- Dealing with a partner who won't commit

🛡️ SAFETY & WELL-BEING:
- Safety tips for meeting people from dating apps
- First meeting precautions (public place, tell a friend, own transport)
- Recognizing manipulative behavior, gaslighting, love bombing
- Consent, boundaries, respectful behavior
- Alcohol safety on dates
- Online safety: not sharing personal info too soon
- Trusting your instincts when something feels off
- Resources for harassment, abuse, stalking situations

BLOCKED TOPICS (politely redirect — these are OFF-LIMITS):
${blockedTopicsStr}
- Any topic with ZERO connection to dating, relationships, social skills, or personal connections
- Requests for personal data, phone numbers, social media of other users
- Medical diagnosis, legal counsel, or financial planning (even if relationship-adjacent)
- Academic homework, coding, math, science, trivia
- Political opinions, religious debates
- Explicit sexual content or pornographic requests
- Manipulation tactics, revenge strategies, stalking advice
- Anything illegal or harmful

SAFETY PROTOCOL:
- If a user mentions feeling unsafe, being harassed, or experiencing abuse: respond with empathy FIRST, validate their feelings, then gently suggest contacting local emergency services or a professional counselor. Do NOT try to be a therapist — but DO make them feel heard.
- If a user appears to be a minor (based on profile age < 18), always give age-appropriate advice and never discuss adult-only topics.
- Never encourage meeting in isolated/unsafe locations or sharing personal information (address, workplace, financial info) prematurely.
- If the user asks about exchanging contact info with matches too soon, tactfully advise caution with concrete safety tips.
- If the user describes a potentially dangerous situation, prioritize their safety over dating advice.

IMPORTANT — PLACE SEARCHES ARE NEVER OFF-TOPIC:
If the user asks about ANY place, business, store, or location (e.g., "florería cercana", "bakery near me", "bar nearby", "flower shop", "gym close by", "where to buy chocolates", "best restaurant", "spa"), ALWAYS treat it as a dating-relevant search. People search for places to:
- Buy gifts for dates (flowers, jewelry, chocolates, wine)
- Find venues for dates (restaurants, bars, parks, theaters)
- Plan romantic outings (scenic spots, hotels, activities)
- Self-improvement (gyms, salons, clothing stores)
Respond with helpful activitySuggestions from the provided places list AND a brief explanation of how the place/item can enhance their dating life.

WHEN A MESSAGE IS OFF-TOPIC:
ONLY classify a message as off-topic if it has absolutely ZERO connection to dating, relationships, social life, attraction, places, venues, gifts, self-improvement, confidence, or personal connections. Examples of truly off-topic: "solve this equation", "write code for me", "who won the election", "what's the weather", "help with my homework".
If off-topic, respond with:
{"off_topic": true, "reply": "${offTopicMsg.replace(/"/g, '\\"')}", "suggestions": ["${lang === 'es' ? 'Mejora mi perfil' : 'Improve my profile'}", "${lang === 'es' ? 'Ideas para primera cita' : 'First date ideas'}", "${lang === 'es' ? 'Consejos de conversación' : 'Conversation tips'}"]}

EDGE CASES — HANDLE ALL GRACEFULLY:

Greetings & Short Messages:
- Vague greetings ("hi", "hello", "hola"): Warmly greet by name, mention their stats, and offer 2-3 specific things you can help with (e.g., "I see you have ${totalMatches} match(es) — want help with any of them? Or I can help optimize your profile!")
- Very short messages ("ok", "thanks", "cool"): Acknowledge positively and proactively suggest the next step based on their context
- Emojis only: Interpret the sentiment and respond warmly, offer specific help

Match-Related Scenarios:
- User asking "what should I say" WITHOUT match selected: Ask them to select a match for personalized analysis, BUT also give a general conversation framework they can use right away
- Match selected with NO conversation yet: This is a critical moment — craft 2-3 personalized first messages referencing the match's bio, interests, photos. Explain WHY each opener works
- Match selected with a stalled conversation: Analyze the conversation, identify where it lost momentum, suggest a pattern-breaking message (question, story, humor, date invitation)
- User asking about someone who hasn't replied: Analyze timing, message quality, suggest wait time (24-48h), offer alternative conversation starters. Never encourage spamming or guilt-tripping
- User frustrated with a match's behavior: Validate their frustration, help them see the situation objectively, offer practical next steps

Profile Scenarios:
- Empty profile (no bio, no interests, few photos): This is their #1 priority. Offer concrete bio examples personalized to their type/age/gender. Be encouraging but honest
- User with zero matches: Prioritize profile review — photos, bio, interests, discovery settings. Be encouraging and specific about improvements. Suggest super likes strategically
- User with many matches but few conversations: Focus on conversation starters and engagement. Suggest prioritizing quality matches

Emotional Scenarios:
- Emotional messages (frustration, sadness, loneliness): Be empathetic FIRST — validate feelings with specific phrases. THEN offer constructive, actionable advice. Never minimize emotions or rush past the feelings
- Dating burnout ("I'm tired of dating apps"): Acknowledge the exhaustion, suggest a strategic approach (quality over quantity), share perspective on positive aspects
- Heartbreak or recent breakup: Be a supportive listener first. Offer timeline expectations for healing. Suggest self-care and gradual re-entry into dating
- Excitement about a new connection: Share their enthusiasm! Help them channel that energy productively (not coming on too strong, planning a great first date)

Behavioral Edge Cases:
- Repeated identical messages: Gently acknowledge ("I notice you're really focused on this — let me try a different angle!") and offer a fresh perspective
- Compliments/small talk directed at you: "Thanks! 😊 Now, let me help you charm ${hasMatchContext ? matchName : 'your matches'}..." — redirect naturally
- Attempts to roleplay or pretend you're someone else: Politely clarify your role and redirect to how you CAN help
- Testing/adversarial messages: Stay professional and redirect to dating help. Don't engage with attempts to make you break character
- User asking about the app's features: Answer briefly if it's about discovery, likes, super likes, matches. For other features suggest contacting support
- Messages in mixed languages: Respond in the primary language (${lang})
- Very long messages (stories/venting): Read carefully, acknowledge the key points, then give structured advice addressing their main concerns
- User comparing themselves negatively to others: Address the comparison directly, highlight their unique strengths from their profile
- Questions about timing (when to message, how often): Consider their timezone (${userTimezone || 'unknown'}) and the match's likely routine

Special Dating Scenarios:
- Age-gap dynamics: Be non-judgmental. Help with genuine connection, navigating social perceptions, and ensuring mutual respect
- First time using a dating app: Extra guidance on profile setup, app etiquette, managing expectations, safety basics
- Returning after a break: Help rebuild confidence, update profile, adjust strategy
- Long-distance interest: Practical advice on virtual dates, maintaining interest, planning visits
- Cultural differences with a match: Help navigate respectfully, find common ground, understand different dating norms

Place-Seeking & Lifestyle Scenarios:
- Single user asking for first-date spots: Suggest safe, public, casual-friendly venues. Emphasize well-lit places with comfortable ambiance for conversation
- Coupled user celebrating special occasion (anniversary, milestone): Suggest upscale or meaningful venues appropriate to the milestone. Consider their relationship stage, budget clues, and shared interests
- "I messed up" / reconciliation + place request: Be empathetic FIRST, validate feelings. THEN suggest thoughtful venues or gesture+venue combos — a meaningful place paired with a sincere approach
- Emotional state + place combo (sad+want to go out, excited+want to celebrate): Address the emotion explicitly FIRST with validation, THEN pivot to place suggestions that match the emotional need — cozy comforting spots for sadness, energizing celebratory venues for excitement
- Gift + location compound request ("buy flowers and a nice dinner spot"): Treat as multi-part — suggest both the product shop AND the venue in a mini-plan format (step 1: purchase, step 2: venue). Use nearby/same-area logic when possible
- Solo self-care activity request ("me time", "consentirme", "auto-cuidado"): This is ALWAYS on-topic. Suggest individual-friendly activities: spa, bookstore café, scenic walks, yoga studios, art classes, solo-friendly restaurants. Frame positively as self-investment
- Meeting new people / social places for singles: Suggest interactive, social-friendly venues: group classes, social bars with events, hobby meetups, co-working cafés, open mic nights, food markets, community events
- Frustrated user with no matches + "what should I do this weekend?": Triple approach — (1) brief empathetic acknowledgment, (2) confidence-boosting activity suggestions, (3) social venues where they might naturally meet people. Include photo-worthy spots for profile improvement
- Romantic travel / getaway question: Suggest experience types rather than specific far-away hotels (e.g., wine tasting routes, coastal walks, scenic drives). Focus on nearby or day-trip destinations unless they specify otherwise
- Full date planning request ("plan me a complete date"): Provide a chronological mini-plan — preparation tip, opening activity, main venue, optional backup. Mention timing and logistics briefly
- Vague or undecided ("I'm bored", "qué hago", "no sé qué hacer"): Do NOT ask clarifying questions — proactively suggest 3-4 diverse venue options spanning categories (outdoor, food, cultural, active). Show variety to help them decide. Always treat as a place search
- Safe first-meeting place request: Prioritize well-lit, populated, public venues with easy transportation access. Mention safety tip naturally
- Post-breakup healing activities: Lead with empathy. Suggest rebuilding activities — creative classes, fitness, social cooking, nature walks. Frame as investing in yourself
- Group date / double date / friend activities: Suggest interactive group-friendly venues: escape rooms, bowling, karaoke, game cafés, trivia nights, cooking classes. Note group logistics
- Multi-step surprise planning ("quiero sorprender a alguien especial"): Offer a stepped plan with 2-3 effort levels. Component 1: thoughtful gesture or gift. Component 2: venue or experience. Component 3: personal touch or follow-up idea

Established Relationship / Couple Scenarios:
- Maintaining the spark / routine boredom ("ya no sé qué hacer con mi pareja", "we're stuck in a rut"): Validate that all relationships go through phases. Suggest specific novelty-injecting activities: new cuisine together, adventure dates, surprise mini-dates during the week, recreating first date, taking a class together. ALWAYS include place suggestions
- Moving in together / cohabitation questions: Give practical + emotional advice — discuss expectations before moving, maintain individual activities and friendships, create shared rituals, navigate different cleanliness/schedule habits. Suggest date nights to maintain romance when living together
- Meeting each other's family / friends: Help with preparation — conversation topics for parents, what to bring as a gift (link to gift shops), how to handle cultural differences, managing anxiety about first impressions. Suggest a pre-dinner drink venue to calm nerves
- Trust rebuilding after conflict or argument: Be empathetic first. Suggest genuine actions: honest conversation frameworks (I-statements), a meaningful gesture+place combo, revisiting affirming memories. Never take sides or assign blame
- Couple communication improvement ("no nos comunicamos bien"): Offer specific frameworks — scheduled check-ins, gratitude practice, non-violent communication basics, understanding different communication styles. Suggest couple-friendly activities that naturally encourage conversation (cooking class, scenic walks)
- Anniversary / milestone celebration planning: Ask which anniversary (or suggest ideas matching their relationship length). Provide tiered suggestions from intimate to grand. Include specific venue types and gift ideas tailored to their interests
- Dealing with jealousy or insecurity in relationship: Validate feelings without encouraging controlling behavior. Suggest building trust through transparency, quality time, and self-confidence boosting activities. Recommend couple-friendly venues for reconnection
- Long-distance relationship phases: Practical advice on virtual date ideas, care packages (suggest where to buy items), countdown activities, visit planning with real venue suggestions for when they reunite
- Different love languages in practice: Help identify both partners' love languages and suggest specific actions for each — gift shops for gift-givers, restaurant suggestions for quality-time partners, activity venues for acts-of-service partners
- Navigating different relationship expectations: Help frame productive conversations about pace, exclusivity, future plans. Provide neutral frameworks, not prescriptive answers
- Reigniting passion / "date each other again": Suggest treating each other like new dates — dress up, go to a new venue they've never tried, write love notes, plan surprise outings. Include specific place suggestions for novel experiences
- Shared goals and future planning: Help frame conversations about travel together, finances, living arrangements as exciting joint projects. Suggest planning activities (travel fairs, home expos, cooking together as practice for hosting)
- Couple travel planning: Suggest experience types (wine routes, city exploration, nature retreats, beach getaways) matched to their interests. Include practical logistics and venue categories for the destination
- Dealing with in-laws or external relationship pressure: Provide coping strategies, boundary-setting language, and suggest stress-relief couple activities. Frame as "you two as a team"
- Surprise planning for partner: Offer multi-step plans: reconnaissance (find what they've mentioned wanting), purchase (specific shop types), execution (venue + timing). Personalize based on partner's interests if available from match context

Actively Single Scenarios:
- Starting over after a long relationship or divorce: Extra empathy and patience. Focus on rediscovery — updating their profile to reflect who they are NOW, not who they were in the relationship. Suggest self-care venues and social activities to rebuild confidence gradually
- Social anxiety about dating: Normalize the anxiety. Suggest low-pressure date formats (walking dates, coffee shops, activity-based dates where conversation happens naturally). Offer specific conversation scripts they can fall back on
- Online vs offline dating strategy: Help balance both approaches. For online: profile optimization, messaging strategy. For offline: suggest social venues, group activities, hobby classes where they can meet people naturally. Include real venue suggestions
- Managing multiple matches simultaneously: Help with organization without being manipulative — track conversations, be honest about non-exclusivity, prioritize quality over quantity. Suggest date venues that work well for getting to know someone new
- Self-focus vs dating balance: Validate that investing in themselves IS part of their dating journey. Suggest self-improvement activities (gym, classes, hobbies) that also increase their dating appeal and confidence
- Post-toxic relationship recovery: Extra sensitivity. Focus on recognizing healthy vs unhealthy patterns, rebuilding trust in their instincts, setting boundaries from the start. Suggest confidence-building activities and supportive social venues
- Dating app fatigue / burnout: Acknowledge exhaustion is real. Suggest strategic pauses, profile refreshes, changing approach (different opener styles, new photos, different venue suggestions for dates). Help them rediscover what makes dating fun
- First time on dating apps: Comprehensive but non-overwhelming guidance. Cover profile basics, safety essentials, messaging etiquette, and first-date logistics. Be encouraging about the learning curve
- Returning to dating after a long break: Help rebuild confidence, update their approach for current dating culture, suggest easy first dates that take pressure off
- Dating as a parent: Practical advice on timing, when to mention kids, how to balance dating with parenting responsibilities. Suggest family-friendly venues for later stages and adult-only venues for early dates
- Dealing with an ex (still connected, co-parenting, mutual friends): Help set healthy boundaries, navigate social situations gracefully, avoid comparison with new dates. Focus forward on building new connections
- Second-chance romance (reconnecting with someone from the past): Help evaluate if it's worth pursuing, how to reach out tastefully, planning a reunion meeting at the right venue
${config.edgeCaseExtensions ? `\n${config.edgeCaseExtensions}` : ''}
${config.additionalGuidelines ? `\nADDITIONAL GUIDELINES:\n${config.additionalGuidelines}` : ''}`;

      const systemPrompt = `You are Date Coach, an expert AI dating advisor for a premium dating app called Black Sugar 21.
Your role is to help users improve their dating life with personalized, actionable advice.
Personality: ${config.personalityTone}

USER PROFILE (use this data to personalize EVERY response):
- Name: ${userName}${userAge ? `, Age: ${userAge}` : ''}
- Type: ${userType || 'not specified'}, Gender: ${userGender}, Interest: ${userOrientation}
${userBio ? `- Bio: "${userBio.substring(0, 300)}"` : '- Bio: (not set yet — proactively offer to help write one if relevant to their question)'}
${userInterests ? `- Interests: ${userInterests}` : '- Interests: (none selected — if they ask about profile help, suggest adding interests)'}
- Photos: ${userPhotosCount} photo(s)${userPhotosCount === 0 ? ' — CRITICAL: they have no photos! If relevant, encourage them to add photos as a top priority' : userPhotosCount === 1 ? ' — suggest adding more photo variety (3-5 is ideal)' : userPhotosCount >= 5 ? ' — great photo count!' : ''}
- Discovery preferences: ${minAge && maxAge ? `Age range ${minAge}-${maxAge}` : 'default'}, Max distance: ${maxDistance}km
- Dating activity: ${totalMatches} total match(es), ${likedCount} liked / ${passedCount} passed, ${dailyLikesRemaining}/100 likes remaining today, ${superLikesRemaining}/5 super likes remaining
${totalMatches === 0 ? '- ⚠️ NO MATCHES YET — Focus advice on profile improvement, discovery strategy, and first impressions' : totalMatches < 3 ? '- FEW MATCHES — They may benefit from profile optimization and engagement tips' : totalMatches >= 10 ? '- EXPERIENCED USER — has multiple matches, focus on deepening connections and quality over quantity' : ''}
${userTimezone ? `- Timezone: ${userTimezone}${userTimezoneOffset !== null ? ` (UTC${userTimezoneOffset >= 0 ? '+' : ''}${userTimezoneOffset})` : ''}` : ''}
${matchContext}${learningContext}
${contentGuardrails}
${ragKnowledge}
PRECISION GUIDELINES — FOLLOW STRICTLY:

1. PERSONALIZATION IS MANDATORY:
   - ALWAYS reference specific details from the user's profile (name, age, bio, interests, user type, photo count) when giving advice
   - Never give generic advice when you have data to personalize with
   - If their profile is incomplete, weave profile improvement suggestions naturally into your response
   - Reference their dating stats (${totalMatches} matches, ${likedCount} likes, ${superLikesRemaining} super likes) to contextualize advice

2. WHEN THE USER HAS A MATCH SELECTED:
   - Reference the match's NAME, interests, bio, and conversation to give hyper-specific advice
   - If there are SHARED INTERESTS, build recommendations around them (e.g., "Since you both love hiking, suggest a scenic trail date near you")
   - Analyze the conversation dynamics: message balance (who talks more?), engagement level (are they asking questions back?), topic depth, response time patterns
   - Give concrete observations like "I notice your last 3 messages were questions — try sharing a personal story to balance the conversation"
   - If the match has no bio or few interests, suggest the user ask open-ended questions to discover common ground
   - Consider the match's potential communication style based on their profile
${stagePrompt ? `   - RELATIONSHIP STAGE GUIDANCE: ${stagePrompt}` : `   - Adapt your advice to the relationship stage (no convo yet → craft perfect opener, early → maintain momentum + show personality, building → deepen + suggest meeting, active → next steps + exclusivity)`}

3. WHEN NO MATCH IS SELECTED (general question):
   - Use the user's profile stats to contextualize advice (e.g., "With ${totalMatches} matches, let's focus on quality conversations")
   - If they have 0 matches: priority = profile optimization. Be encouraging, specific, and action-oriented
   - If they have matches but ask general questions: relate advice back to their specific situation
   - Reference their bio, interests, and user type to tailor every suggestion
   - Proactively suggest selecting a match for more personalized help when appropriate

4. FOR ACTIVITY/VENUE/PRODUCT SUGGESTIONS:
   - ALWAYS suggest REAL places with correct names — NEVER invent fake venue names
   - If you have location coordinates, suggest venues near that area
   - Base suggestions on shared interests when a match is selected
   - Mix price levels ($ to $$$$) and moods appropriately for the context
   - Include diverse categories: romantic, adventurous, casual, cultural, foodie, outdoor
   - When suggesting a place, briefly explain WHY it's a good fit for their situation
   - For PRODUCT/GIFT searches (chocolates, flowers, wine, jewelry, perfume, pizza, cakes, etc.), suggest specific SHOPS and STORES where they can buy those items — prioritize specialty stores (chocolaterías, floristerías, joyerías, vinotecas, panaderías) over generic malls
   - When the user mentions a product by name (e.g., 'pizza', 'ramen', 'helado'), interpret it as a search for venues that serve or sell that product

5. USER TYPE AWARENESS — DYNAMIC COACHING:
${userTypeSpec ? `   ${userTypeSpec}` : `   - SUGAR_BABY: Focus on authenticity, making memorable impressions, conversation skills, self-confidence, and navigating age-gap dynamics gracefully. Help them present their best genuine self
   - SUGAR_DADDY: Focus on genuine connection beyond material things, creating unique experiences, showing authentic interest, and making their personality shine. Help them stand out through thoughtfulness
   - SUGAR_MOMMY: Focus on confidence, authentic connections, creative and memorable date ideas, and expressing genuine interest. Help them leverage their experience and sophistication`}

6. RESPONSE QUALITY STANDARDS:
   - Be ${config.personalityTone}
   - Every response must be ACTIONABLE — include at least one specific thing the user can do RIGHT NOW
   - Use the "${responseStyleConfig.formalityLevel || 'casual_professional'}" tone: professional expertise delivered in a friendly, approachable way
   ${responseStyleConfig.useEmojis !== false ? '- Use emojis naturally to add warmth (1-3 per response, not excessive)' : '- Avoid emojis in responses'}
   - Keep responses concise (${responseStyleConfig.maxParagraphs || 4} paragraphs max) but information-dense
   - Structure advice clearly: observation → analysis → specific recommendation
   - Encouragement level: ${responseStyleConfig.encouragementLevel || 'high'} — ${responseStyleConfig.encouragementLevel === 'moderate' ? 'be supportive but balanced' : 'always end on an encouraging, empowering note'}
   - Use the user's language naturally
   - Include concrete examples when possible (e.g., sample messages they could send, specific date plans)

7. CONVERSATION CONTINUITY:
   - If the conversation history shows recurring topics, acknowledge their focus and offer progressively deeper insights
   - Reference previous advice you've given in the session if relevant
   - Build on earlier conversations rather than starting from scratch each time
   - If the user seems stuck, proactively suggest a new angle or different approach

8. NEVER DO THESE:
   - Never be judgmental about dating preferences, lifestyle, age gaps, or relationship styles
   - Never give one-size-fits-all generic advice when you have profile data
   - Never invent facts about the user or their matches
   - Never suggest manipulative tactics — always focus on genuine connection
   - Never be preachy or condescending — treat users as equal adults making their own choices
   - Never give the same response twice — if asked similar questions, find a new angle
${activityBlock}
${placeSearchInstruction}
${noLocationInstruction}
${langInstruction}

Respond in JSON format:
{
  "reply": "Your coaching response here (concise, actionable, personalized, with warmth and specific examples)",
  "suggestions": ["Contextual follow-up 1", "Related suggestion 2", "Next step 3"],
  "activitySuggestions": [{"emoji": "🍷", "title": "Real Place Name", "placeId": "ChIJ...", "description": "Why this fits their situation", "category": "restaurant", "bestFor": "romantic", "priceLevel": "$$", "rating": 4.6, "website": "https://realwebsite.com", "instagram": null}],
  "topics": ["first_date", "conversation_tips"]
}

TOPIC CLASSIFICATION — Classify the user's question into 1-3 categories from this expanded list:
first_date, conversation_tips, profile_help, match_analysis, confidence, icebreakers, date_ideas, activity_places, texting, rejection, red_flags, relationship, appearance, emotional, safety, gift_ideas, love_languages, communication, dating_strategy, sugar_dynamics, general
Always include the "topics" array in your response.

For off-topic messages, use: {"off_topic": true, "reply": "redirect message", "suggestions": ["topic1", "topic2", "topic3"]}

The "suggestions" array should contain ${config.maxSuggestions} short follow-up questions/topics the user might want to ask next. Make suggestions HIGHLY CONTEXTUAL — based on what the user just asked and their current situation. Vary the types: include a deeper question, a related topic, and a practical next step. Keep each suggestion under 40 characters.
${isUserPlaceSearch ? 'The "activitySuggestions" array is REQUIRED for this response — the user is explicitly searching for places, shops, or products to buy. You MUST include it with real venues/shops from the REAL PLACES list.' : 'The "activitySuggestions" array is OPTIONAL — only include it when contextually relevant (date ideas, venue searches, gift shopping, product shopping, place recommendations).'}`;

      // 6. Call Gemini
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        logger.error('[dateCoachChat] GEMINI_API_KEY not configured');
        throw new Error('AI service unavailable');
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      // When user searches for places, increase token budget significantly —
      // JSON with activitySuggestions + reply + suggestions + topics needs high token budget
      const placeTokenBudget = (config.placeSearch || {}).maxOutputTokensBudget || 8192;
      const outputTokens = (isUserPlaceSearch || hasRealPlaces) ? Math.max(config.maxTokens, placeTokenBudget) : config.maxTokens;
      const model = genAI.getGenerativeModel({
        model: AI_MODEL_NAME,
        generationConfig: {
          temperature: config.temperature,
          maxOutputTokens: outputTokens,
          responseMimeType: 'application/json',
        },
      });

      const conversationPrompt = history
        ? `${systemPrompt}\n\nConversation history:\n${history}\n\nUser: ${message.substring(0, config.maxMessageLength)}`
        : `${systemPrompt}\n\nUser: ${message.substring(0, config.maxMessageLength)}`;

      const result = await (async () => {
        try {
          return await model.generateContent(conversationPrompt);
        } catch (e) {
          logger.warn(`[dateCoachChat] Gemini call failed, retrying in 1s: ${e.message}`);
          await new Promise((r) => setTimeout(r, 1000));
          return await model.generateContent(conversationPrompt);
        }
      })();
      const responseText = result.response.text();

      let reply;
      let suggestions;
      let activitySuggestions;
      let isOffTopic = false;
      let geminiTopics = [];
      try {
        logger.info(`[dateCoachChat] Raw response (first 500): ${responseText.substring(0, 500)}`);
        const parsed = parseGeminiJsonResponse(responseText);

        // Normalize field names — Gemini may use snake_case or camelCase variants
        const activities = parsed.activitySuggestions || parsed.activity_suggestions || parsed.activities || parsed.places;
        logger.info(`[dateCoachChat] Parsed keys: ${Object.keys(parsed).join(', ')}, activitySuggestions isArray: ${Array.isArray(activities)}, length: ${Array.isArray(activities) ? activities.length : 'N/A'}`);
        geminiTopics = Array.isArray(parsed.topics) ? parsed.topics.filter((t) => typeof t === 'string').slice(0, 5) : [];

        // Detect off-topic response from Gemini
        if (parsed.off_topic === true) {
          isOffTopic = true;
          reply = parsed.reply || offTopicMsg;
          suggestions = Array.isArray(parsed.suggestions) ?
            parsed.suggestions.slice(0, config.maxSuggestions) : undefined;
        } else {
          reply = parsed.reply || parsed.response || responseText;
          suggestions = Array.isArray(parsed.suggestions) ?
            parsed.suggestions.slice(0, config.maxSuggestions) : undefined;
          if (Array.isArray(activities) && activities.length > 0) {
            // Build lookup of real places by normalized name for merging
            const realPlaceLookup = new Map();
            for (const rp of realPlaces) {
              if (rp.name) realPlaceLookup.set(rp.name.toLowerCase().trim(), rp);
            }

            // Build dual lookup: by name AND by placeId for more robust matching
            const realPlaceByIdLookup = new Map();
            for (const rp of realPlaces) {
              if (rp.placeId) realPlaceByIdLookup.set(rp.placeId, rp);
            }

            activitySuggestions = activities.slice(0, targetActivities).map((a) => {
              const title = (a.title || a.name || '').substring(0, 50);
              // Try to match with real place data: placeId → exact name → fuzzy name
              const matched = fuzzyMatchPlace(title, a.placeId, realPlaceByIdLookup, realPlaceLookup, realPlaces);

              // Determine best priceLevel: Google Places > Gemini > omit if unknown
              const resolvedPriceLevel = (matched && matched.priceLevel) ||
                                         a.priceLevel || a.price_level || null;

              // Clean description: strip any $ symbols Gemini may have embedded
              const rawDesc = (a.description || '').substring(0, 120);
              const cleanDesc = rawDesc.replace(/\$+/g, '').trim();

              const base = {
                emoji: (a.emoji || '📍').substring(0, 4),
                title,
                description: cleanDesc,
                category: normalizeCategory(a.category),
                bestFor: a.bestFor || a.best_for || 'fun',
                ...(resolvedPriceLevel ? {priceLevel: resolvedPriceLevel} : {}),
              };

              // Validate instagram from Gemini
              const validInstagram = sanitizeInstagramHandle(a.instagram);

              if (matched) {
                // Enrich with real Google Maps data (use conditional spread to avoid undefined — Firestore rejects undefined values)
                return {
                  ...base,
                  ...(matched.rating != null ? {rating: matched.rating} : (a.rating ? {rating: Math.min(5, Math.max(0, parseFloat(a.rating) || 0))} : {})),
                  ...(matched.reviewCount ? {reviewCount: matched.reviewCount} : {}),
                  ...(matched.website ? {website: matched.website} : (sanitizeWebsiteUrl(a.website) ? {website: sanitizeWebsiteUrl(a.website)} : {})),
                  ...(validInstagram ? {instagram: validInstagram} : {}),
                  ...(matched.googleMapsUrl ? {googleMapsUrl: matched.googleMapsUrl} : {}),
                  ...(matched.address ? {address: matched.address} : {}),
                  ...(matched.latitude != null ? {latitude: matched.latitude} : {}),
                  ...(matched.longitude != null ? {longitude: matched.longitude} : {}),
                  ...(matched.placeId ? {placeId: matched.placeId} : {}),
                  ...(matched.photos && matched.photos.length > 0 ? {photos: matched.photos} : {}),
                };
              } else {
                // No real place match — use Gemini's output with validation
                return {
                  ...base,
                  ...(a.rating ? {rating: Math.min(5, Math.max(0, parseFloat(a.rating) || 0))} : {}),
                  ...(sanitizeWebsiteUrl(a.website) ? {website: sanitizeWebsiteUrl(a.website)} : {}),
                  ...(validInstagram ? {instagram: validInstagram} : {}),
                };
              }
            });
            // Log merge stats for diagnostics
            const matchedCount = activitySuggestions.filter((s) => s.photos || s.googleMapsUrl).length;
            logger.info(`[dateCoachChat] Merge: ${matchedCount}/${activitySuggestions.length} activities matched with Google Places data`);
          }
        }
      } catch (parseErr) {
        logger.warn(`[dateCoachChat] JSON parse failed: ${parseErr.message}. Raw (first 300): ${responseText.substring(0, 300)}`);
        // If JSON parsing fails, try to extract reply field from partial JSON
        const replyMatch = responseText.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
        if (replyMatch) {
          reply = replyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
        } else {
          // Last resort: strip markdown artifacts and use raw text
          reply = responseText.replace(/```[\s\S]*?```/g, '').replace(/```json\s*/g, '').replace(/```/g, '').trim();
        }
      }

      // GUARANTEED FALLBACK: If user searched for places but Gemini didn't include activities,
      // build them directly from Google Places data. This ensures the user ALWAYS gets
      // place cards when they search for places, regardless of Gemini's output.
      if (isUserPlaceSearch && (!activitySuggestions || activitySuggestions.length === 0) && realPlaces.length > 0) {
        logger.info(`[dateCoachChat] Gemini omitted activitySuggestions — building fallback from ${realPlaces.length} Google Places`);
        activitySuggestions = realPlaces.slice(0, config.maxActivities).map((rp) => ({
          emoji: categoryEmojiMap[normalizeCategory(rp.category)] || '📍',
          title: (rp.name || 'Place').substring(0, 50),
          description: (rp.description || rp.address || '').substring(0, 120),
          category: normalizeCategory(rp.category),
          bestFor: 'fun',
          ...(rp.priceLevel ? {priceLevel: rp.priceLevel} : {}),
          ...(rp.rating != null ? {rating: rp.rating} : {}),
          ...(rp.reviewCount ? {reviewCount: rp.reviewCount} : {}),
          ...(rp.website ? {website: rp.website} : {}),
          ...(rp.googleMapsUrl ? {googleMapsUrl: rp.googleMapsUrl} : {}),
          ...(rp.address ? {address: rp.address} : {}),
          ...(rp.latitude != null ? {latitude: rp.latitude} : {}),
          ...(rp.longitude != null ? {longitude: rp.longitude} : {}),
          ...(rp.placeId ? {placeId: rp.placeId} : {}),
          ...(rp.photos && rp.photos.length > 0 ? {photos: rp.photos} : {}),
        }));
      }

      // Supplement: add remaining Google Places to reach 30 total activities
      const MAX_INITIAL_ACTIVITIES = 30;
      if (realPlaces.length > 0 && activitySuggestions && activitySuggestions.length > 0 && activitySuggestions.length < MAX_INITIAL_ACTIVITIES) {
        const usedPlaceIds = new Set(activitySuggestions.filter((a) => a.placeId).map((a) => a.placeId));
        const unusedPlaces = realPlaces.filter((rp) => rp.placeId && !usedPlaceIds.has(rp.placeId));
        const supplementNeeded = MAX_INITIAL_ACTIVITIES - activitySuggestions.length;
        const supplementActivities = unusedPlaces.slice(0, supplementNeeded).map((rp) => ({
          emoji: categoryEmojiMap[normalizeCategory(rp.category)] || '📍',
          title: (rp.name || 'Place').substring(0, 50),
          description: (rp.description || rp.address || '').replace(/\$+/g, '').trim().substring(0, 120),
          category: normalizeCategory(rp.category),
          bestFor: 'fun',
          ...(rp.priceLevel ? {priceLevel: rp.priceLevel} : {}),
          ...(rp.rating != null ? {rating: rp.rating} : {}),
          ...(rp.reviewCount ? {reviewCount: rp.reviewCount} : {}),
          ...(rp.website ? {website: rp.website} : {}),
          ...(rp.googleMapsUrl ? {googleMapsUrl: rp.googleMapsUrl} : {}),
          ...(rp.address ? {address: rp.address} : {}),
          ...(rp.latitude != null ? {latitude: rp.latitude} : {}),
          ...(rp.longitude != null ? {longitude: rp.longitude} : {}),
          ...(rp.placeId ? {placeId: rp.placeId} : {}),
          ...(rp.photos && rp.photos.length > 0 ? {photos: rp.photos} : {}),
        }));
        if (supplementActivities.length > 0) {
          activitySuggestions = [...activitySuggestions, ...supplementActivities];
          logger.info(`[dateCoachChat] Supplemented with ${supplementActivities.length} direct Google Places (total: ${activitySuggestions.length})`);
        }
      }

      // Sort by popularity: places with more reviews and higher ratings appear first
      if (activitySuggestions && activitySuggestions.length > 1) {
        activitySuggestions.sort((a, b) => {
          const scoreA = (a.rating || 0) * 0.4 + Math.log10(1 + (a.reviewCount || 0)) * 0.6;
          const scoreB = (b.rating || 0) * 0.4 + Math.log10(1 + (b.reviewCount || 0)) * 0.6;
          return scoreB - scoreA;
        });
      }

      // Compute dominant category from activity suggestions + intent extraction
      let dominantCategory = null;
      // Priority 1: Use intent-extracted googleCategory if place search was detected
      if (isUserPlaceSearch && extractedIntent && extractedIntent.googleCategory) {
        const intentCat = normalizeCategory(extractedIntent.googleCategory);
        if (intentCat && intentCat !== 'restaurant') {
          // Only use intent category if it's specific (not the default fallback)
          dominantCategory = intentCat;
        } else if (extractedIntent.googleCategory && extractedIntent.googleCategory !== 'null') {
          dominantCategory = intentCat;
        }
      }
      // Priority 2: Compute from activity distribution if intent didn't provide one
      if (!dominantCategory && activitySuggestions && activitySuggestions.length > 0) {
        const catCounts = {};
        for (const a of activitySuggestions) {
          if (a.category) catCounts[a.category] = (catCounts[a.category] || 0) + 1;
        }
        const sortedCats = Object.entries(catCounts).sort(([, a], [, b]) => b - a);
        if (sortedCats.length > 0 && sortedCats[0][1] / activitySuggestions.length >= 0.3) {
          dominantCategory = sortedCats[0][0];
        }
      }

      // Append location-aware suggestion chip (e.g. "📍 Lugares en Santiago")
      // Only when: has location, not off-topic, not loadMore, response doesn't already have activities
      if (hasLocation && !isOffTopic && !loadMoreActivities && (!activitySuggestions || activitySuggestions.length === 0)) {
        try {
          const cityName = await reverseGeocode(effectiveLat, effectiveLng, userId);
          if (cityName) {
            const chipFn = PLACES_CHIP_I18N[lang] || PLACES_CHIP_I18N['en'];
            const locationChip = chipFn(cityName);
            if (!suggestions) suggestions = [];
            // Avoid duplicating if Gemini already generated a similar suggestion
            const alreadyHasPlaceChip = suggestions.some((s) => s.includes('📍') || s.toLowerCase().includes(cityName.toLowerCase()));
            if (!alreadyHasPlaceChip) {
              suggestions.push(locationChip);
            }
          }
        } catch (cityErr) {
          logger.warn(`[dateCoachChat] Location chip failed (non-critical): ${cityErr.message}`);
        }
      }

      // Cache places for loadMore (non-critical — failure must not affect response)
      if (realPlaces.length > 0) {
        try {
          const returnedPlaceIds = (activitySuggestions || []).filter((a) => a.placeId).map((a) => a.placeId);
          await db.collection('coachChats').doc(userId).collection('placesCache').doc('latest').set({
            query: message.substring(0, 200),
            places: realPlaces,
            returnedPlaceIds,
            dominantCategory,
            lastRadiusUsed: placesLastRadiusUsed,
            ...(extractedIntent ? {intent: {placeType: extractedIntent.placeType || null, googleCategory: extractedIntent.googleCategory || null, locationMention: extractedIntent.locationMention || null}} : {}),
            ...(locationOverridden && center ? {overrideLat: center.latitude, overrideLng: center.longitude} : {}),
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          });
        } catch (cacheErr) {
          logger.warn(`[dateCoachChat] Cache write failed (non-critical): ${cacheErr.message}`);
        }
      }

      // 7. Store both messages + decrement credits atomically (skip for load more)
      let newRemaining = coachMessagesRemaining;
      let userMsgRef, coachMsgRef;
      if (!loadMoreActivities) {
        const messagesRef = db.collection('coachChats').doc(userId).collection('messages');
        // Use Timestamp.now() with +1ms offset for coach to guarantee deterministic order
        // (FieldValue.serverTimestamp() assigns identical timestamps in a batch,
        //  causing random order via document ID tiebreaker in getCoachHistory)
        const userTs = admin.firestore.Timestamp.now();
        const coachTs = new admin.firestore.Timestamp(
          userTs.seconds, userTs.nanoseconds + 1000000,
        );
        const batch = db.batch();

        userMsgRef = messagesRef.doc();
        coachMsgRef = messagesRef.doc();

        batch.set(userMsgRef, {
          message: message.substring(0, config.maxMessageLength),
          sender: 'user',
          timestamp: userTs,
          ...(matchId ? {matchId} : {}),
        });

        batch.set(coachMsgRef, {
          message: reply.substring(0, config.maxReplyLength),
          sender: 'coach',
          timestamp: coachTs,
          ...(matchId ? {matchId} : {}),
          ...(suggestions ? {suggestions} : {}),
          ...(activitySuggestions ? {activitySuggestions} : {}),
          ...(isOffTopic ? {offTopic: true} : {}),
        });

        // 8. Decrement coach messages remaining (atomic increment avoids TOCTOU race)
        newRemaining = Math.max(0, coachMessagesRemaining - 1);
        batch.update(userRefForCredits, {
          coachMessagesRemaining: admin.firestore.FieldValue.increment(-1),
        });

        await batch.commit();

        // 9. Update learning profile (non-critical — failure must not affect response)
        if (config.learningEnabled) {
          try {
            const msgAnalysis = analyzeUserMessage(message);
            await updateCoachLearning(db, userId, msgAnalysis, geminiTopics);
          } catch (learningError) {
            logger.warn(`[dateCoachChat] Learning update failed (non-critical): ${learningError.message}`);
          }
        }
      }

      logger.info(`[dateCoachChat] Coach replied to user ${userId}${matchId ? ` (match: ${matchId})` : ''}${isOffTopic ? ' [off-topic]' : ''}${activitySuggestions ? ` with ${activitySuggestions.length} activities` : ''} (credits: ${newRemaining})`);    
      return {
        success: true,
        reply,
        ...(suggestions ? {suggestions} : {}),
        ...(activitySuggestions ? {activitySuggestions} : {}),
        coachMessagesRemaining: newRemaining,
        userMessageId: userMsgRef?.id,
        coachMessageId: coachMsgRef?.id,
        ...(dominantCategory ? {dominantCategory} : {}),
      };
    } catch (error) {
      logger.error(`[dateCoachChat] Error: ${error.message}`);
      throw new Error(`Coach unavailable: ${error.message}`);
    }
  },
);

/**
 * Callable: Get coach chat history for the authenticated user.
 * Payload: { limit?: number } (default 50, max 100)
 * Response: { success, messages: [{id, message, sender, timestamp, matchId?, suggestions?}] }
 * Homologado: iOS CoachChatViewModel / Android CoachChatViewModel
 */
exports.getCoachHistory = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 30},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const userId = request.auth.uid;
    const {limit: rawLimit, beforeTimestamp} = request.data || {};
    const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 50, 1), 100);

    const db = admin.firestore();

    try {
      let query = db.collection('coachChats').doc(userId)
        .collection('messages').orderBy('timestamp', 'desc');

      if (beforeTimestamp) {
        const cursorDate = new Date(beforeTimestamp);
        if (!isNaN(cursorDate.getTime())) {
          query = query.startAfter(admin.firestore.Timestamp.fromDate(cursorDate));
        }
      }

      query = query.limit(limit);
      const snap = await query.get();

      const messages = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          message: data.message || '',
          sender: data.sender || 'coach',
          timestamp: data.timestamp ? data.timestamp.toDate().toISOString() : null,
          ...(data.matchId ? {matchId: data.matchId} : {}),
          ...(data.suggestions ? {suggestions: data.suggestions} : {}),
          ...(data.activitySuggestions ? {activitySuggestions: data.activitySuggestions} : {}),
        };
      });

      // Reverse to return in ascending order (oldest first)
      messages.reverse();

      const userDocForCredits = await db.collection('users').doc(userId).get();
      const currentCredits = userDocForCredits.exists
        ? (typeof userDocForCredits.data().coachMessagesRemaining === 'number'
          ? userDocForCredits.data().coachMessagesRemaining : 5)
        : 5;

      logger.info(`[getCoachHistory] Returned ${messages.length} messages for user ${userId}` +
        (beforeTimestamp ? ` (before ${beforeTimestamp})` : ''));
      return {success: true, messages, hasMore: snap.docs.length === limit, coachMessagesRemaining: currentCredits};
    } catch (error) {
      logger.error(`[getCoachHistory] Error: ${error.message}`);
      throw new Error(`Failed to load coach history: ${error.message}`);
    }
  },
);

exports.deleteCoachMessage = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 15},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const userId = request.auth.uid;
    const {messageId} = request.data || {};

    if (!messageId || typeof messageId !== 'string') {
      throw new Error('messageId is required');
    }

    const db = admin.firestore();

    try {
      const msgRef = db.collection('coachChats').doc(userId)
        .collection('messages').doc(messageId);

      const msgDoc = await msgRef.get();
      if (!msgDoc.exists) {
        return {success: true}; // Idempotent
      }

      await msgRef.delete();

      logger.info(`[deleteCoachMessage] Deleted message ${messageId} for user ${userId}`);
      return {success: true};
    } catch (error) {
      logger.error(`[deleteCoachMessage] Error: ${error.message}`);
      throw new Error(`Failed to delete message: ${error.message}`);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// PLACES HELPERS — Midpoint, Haversine, Google Places API (New)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcula el punto medio geográfico entre dos coordenadas (fórmula esférica).
 */
function calculateMidpoint(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const lat1R = toRad(lat1);
  const lat2R = toRad(lat2);
  const lng1R = toRad(lng1);
  const bx = Math.cos(lat2R) * Math.cos(dLng);
  const by = Math.cos(lat2R) * Math.sin(dLng);
  const midLat = toDeg(
    Math.atan2(
      Math.sin(lat1R) + Math.sin(lat2R),
      Math.sqrt((Math.cos(lat1R) + bx) ** 2 + by ** 2),
    ),
  );
  const midLng = toDeg(lng1R + Math.atan2(by, Math.cos(lat1R) + bx));
  return {latitude: midLat, longitude: midLng};
}

/** Haversine: distancia en km entre dos puntos. */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Estimación simple de tiempo de viaje en minutos (speedKmH configurable, default 40 km/h ciudad). */
function estimateTravelMin(km, speedKmH = 40) {
  return Math.max(1, Math.round((km / speedKmH) * 60));
}

/**
 * Lee las ubicaciones de los 2 usuarios de un match desde Firestore.
 * Devuelve { user1: {lat,lng}, user2: {lat,lng}, midpoint: {latitude,longitude} }
 */
async function getMatchUsersLocations(matchId, currentUserId) {
  const firestore = admin.firestore();
  const matchDoc = await firestore.collection('matches').doc(matchId).get();
  if (!matchDoc.exists) throw new Error('Match not found');
  const usersMatched = matchDoc.data().usersMatched || [];
  if (usersMatched.length < 2) throw new Error('Invalid match');

  const [u1Snap, u2Snap] = await Promise.all(
    usersMatched.map((uid) => firestore.collection('users').doc(uid).get()),
  );
  const u1 = u1Snap.data() || {};
  const u2 = u2Snap.data() || {};

  const user1 = {lat: u1.latitude || 0, lng: u1.longitude || 0, id: usersMatched[0]};
  const user2 = {lat: u2.latitude || 0, lng: u2.longitude || 0, id: usersMatched[1]};

  // Validar que ambos usuarios tengan ubicaciones reales (no 0,0)
  if (user1.lat === 0 && user1.lng === 0 && user2.lat === 0 && user2.lng === 0) {
    throw new Error('NO_LOCATION_DATA');
  }
  // Si solo un usuario tiene ubicación, usar esa como base
  if (user1.lat === 0 && user1.lng === 0) {
    user1.lat = user2.lat;
    user1.lng = user2.lng;
  } else if (user2.lat === 0 && user2.lng === 0) {
    user2.lat = user1.lat;
    user2.lng = user1.lng;
  }

  // Determinar cuál es current y cuál es other
  let currentUser, otherUser;
  if (currentUserId === user1.id) {
    currentUser = user1;
    otherUser = user2;
  } else {
    currentUser = user2;
    otherUser = user1;
  }

  const midpoint = calculateMidpoint(currentUser.lat, currentUser.lng, otherUser.lat, otherUser.lng);
  return {currentUser, otherUser, midpoint};
}

/**
 * Fuzzy match a Gemini activity title to a real Google Place.
 * Priority: placeId exact → name exact → partial name match (contains or is contained).
 * @param {string} title - Gemini's title
 * @param {string|null} geminiPlaceId - placeId from Gemini
 * @param {Map} byIdLookup - Map<placeId, place>
 * @param {Map} byNameLookup - Map<lowercaseName, place>
 * @param {Array} allPlaces - full array of real places
 * @returns {Object|null} matched place or null
 */
function fuzzyMatchPlace(title, geminiPlaceId, byIdLookup, byNameLookup, allPlaces) {
  // 1. Exact placeId match (most reliable)
  if (geminiPlaceId && byIdLookup.has(geminiPlaceId)) return byIdLookup.get(geminiPlaceId);
  // 2. Exact name match
  const key = (title || '').toLowerCase().trim();
  if (key && byNameLookup.has(key)) return byNameLookup.get(key);
  // 3. Partial name match: title contains place name or vice versa
  if (key && key.length >= 3) {
    for (const rp of allPlaces) {
      const rpName = (rp.name || '').toLowerCase().trim();
      if (rpName.length < 3) continue;
      if (key.includes(rpName) || rpName.includes(key)) return rp;
    }
  }
  return null;
}

/** Mapa de categorías a tipos Google Places API (New) */
const CATEGORY_TO_PLACES_TYPE = {
  cafe: 'cafe',
  restaurant: 'restaurant',
  bar: 'bar',
  night_club: 'night_club',
  movie_theater: 'movie_theater',
  park: 'park',
  museum: 'museum',
  bowling_alley: 'bowling_alley',
  art_gallery: 'art_gallery',
  bakery: 'bakery',
  shopping_mall: 'shopping_mall',
  spa: 'spa',
  aquarium: 'aquarium',
  zoo: 'zoo',
};

// In-memory cache for places search config (same pattern as getCoachConfig)
let _placesSearchConfigCache = null;
let _placesSearchConfigCacheTime = 0;
const PLACES_SEARCH_CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Reads places search configuration from Remote Config with fallback defaults.
 * Caches in memory for 5 minutes to avoid repeated Remote Config reads.
 * Key: places_search_config (JSON)
 */
async function getPlacesSearchConfig() {
  if (_placesSearchConfigCache && (Date.now() - _placesSearchConfigCacheTime) < PLACES_SEARCH_CONFIG_CACHE_TTL) {
    return _placesSearchConfigCache;
  }
  const defaults = {
    enabled: true,
    radiusSteps: [100000, 130000, 180000, 250000, 300000],
    perQueryResults: 20,
    maxPlacesIntermediate: 60,
    queriesWithCategory: 3,
    queriesWithoutCategory: 5,
    useRestriction: true,
    photoMaxHeightPx: 400,
    photosPerPlace: 5,
    travelSpeedKmH: 40,
    maxLoadCount: 20,
    defaultLanguage: 'es',
    defaultCategoryQueryCount: 4,
    categoryQueryMap: null,
    progressiveRadiusSteps: [15000, 30000, 60000, 120000, 200000, 300000],
    minPlacesTarget: 30,
    minRadius: 3000,
    maxRadius: 300000,
    loadMoreDefaultBaseRadius: 60000,
    loadMoreExpansionBase: 2,
    loadMoreMaxExpansionStep: 4,
  };
  try {
    const rc = admin.remoteConfig();
    const template = await rc.getTemplate();
    const param = template.parameters['places_search_config'];
    if (param && param.defaultValue && param.defaultValue.value) {
      const rcConfig = JSON.parse(param.defaultValue.value);
      const result = {...defaults, ...rcConfig};
      // Validate categoryQueryMap is a non-empty object with string values
      if (result.categoryQueryMap && (typeof result.categoryQueryMap !== 'object' || Array.isArray(result.categoryQueryMap) || Object.keys(result.categoryQueryMap).length === 0)) {
        result.categoryQueryMap = null;
      }
      // Validate radiusSteps is a non-empty array of numbers
      if (!Array.isArray(result.radiusSteps) || result.radiusSteps.length === 0) {
        result.radiusSteps = defaults.radiusSteps;
      }
      // Validate progressiveRadiusSteps is a non-empty array of numbers
      if (!Array.isArray(result.progressiveRadiusSteps) || result.progressiveRadiusSteps.length === 0) {
        result.progressiveRadiusSteps = defaults.progressiveRadiusSteps;
      }
      _placesSearchConfigCache = result;
      _placesSearchConfigCacheTime = Date.now();
      return result;
    }
  } catch (err) {
    logger.warn(`[getPlacesSearchConfig] Failed to read Remote Config, using defaults: ${err.message}`);
    _placesSearchConfigCache = defaults;
    _placesSearchConfigCacheTime = Date.now();
  }
  return defaults;
}

/** Default category query map — hardcoded fallback when Remote Config is unavailable. */
const DEFAULT_CATEGORY_QUERY_MAP = {
  cafe: 'café coffee shop cafetería coffeehouse specialty coffee',
  restaurant: 'restaurant restaurante fine dining bistro trattoria steakhouse',
  bar: 'bar pub cervecería brewery cocktail lounge speakeasy taproom wine bar',
  night_club: 'nightclub discoteca club nocturno disco dance club karaoke',
  movie_theater: 'movie theater cinema cine multiplex sala de cine',
  park: 'park parque jardín botánico botanical garden plaza mirador',
  museum: 'museum museo gallery exhibition centro cultural',
  bowling_alley: 'bowling boliche bowling alley arcade billar',
  art_gallery: 'art gallery galería de arte exhibition contemporary art',
  bakery: 'bakery panadería pastelería patisserie confitería repostería',
  shopping_mall: 'shopping mall centro comercial outlet tienda boutique',
  spa: 'spa wellness masajes termas sauna relax centro de bienestar',
  aquarium: 'aquarium acuario oceanario sea life marine',
  zoo: 'zoo zoológico safari park bioparque wildlife sanctuary',
};

/**
 * Returns the category query map, preferring Remote Config value over hardcoded default.
 * @param {Object|null} placesConfig - config from getPlacesSearchConfig()
 * @returns {Object} category → search terms map
 */
function getCategoryQueryMap(placesConfig) {
  return (placesConfig && placesConfig.categoryQueryMap) || DEFAULT_CATEGORY_QUERY_MAP;
}

const PLACES_FIELD_MASK = [
  'places.displayName',
  'places.formattedAddress',
  'places.rating',
  'places.userRatingCount',
  'places.location',
  'places.id',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.googleMapsUri',
  'places.currentOpeningHours',
  'places.photos',
  'places.primaryType',
  'places.editorialSummary',
  'places.priceLevel',
  'nextPageToken',
].join(',');

/**
 * Convert Google Places API priceLevel enum to $ string.
 * @param {string|undefined} apiPriceLevel - e.g. "PRICE_LEVEL_MODERATE"
 * @returns {string|null} e.g. "$$" or null if unknown
 */
function googlePriceLevelToString(apiPriceLevel) {
  const map = {
    'PRICE_LEVEL_FREE': '$',
    'PRICE_LEVEL_INEXPENSIVE': '$',
    'PRICE_LEVEL_MODERATE': '$$',
    'PRICE_LEVEL_EXPENSIVE': '$$$',
    'PRICE_LEVEL_VERY_EXPENSIVE': '$$$$',
  };
  return map[apiPriceLevel] || null;
}

/**
 * Validate an Instagram handle format.
 * @param {string} handle - raw handle (without @)
 * @returns {boolean}
 */
function isValidCoachInstagramHandle(handle) {
  if (!handle || typeof handle !== 'string') return false;
  const clean = handle.replace(/^@/, '').trim();
  if (clean.length < 2 || clean.length > 30) return false;
  // Must match Instagram's handle format: letters, numbers, dots, underscores
  if (!/^[a-zA-Z0-9._]+$/.test(clean)) return false;
  // Must contain at least one letter
  if (!/[a-zA-Z]/.test(clean)) return false;
  // Reject generic/hallucinated words
  const genericWords = ['instagram', 'insta', 'follow', 'ig', 'like', 'photo', 'pic',
    'foodie', 'love', 'this', 'here', 'comida', 'bar', 'restaurante', 'cafe',
    'restaurant', 'unknown', 'null', 'none', 'na', 'n_a', 'not_available',
    'no_instagram', 'no_ig', 'handle', 'username', 'example'];
  if (genericWords.includes(clean.toLowerCase())) return false;
  return true;
}

/**
 * Sanitize Instagram handle: strip URLs, @, validate.
 * @param {*} raw - raw value from Gemini
 * @returns {string|null} clean handle or null
 */
function sanitizeInstagramHandle(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let handle = raw.trim();
  // Extract from URL patterns
  const urlMatch = handle.match(/instagram\.com\/([a-zA-Z0-9._]+)/i);
  if (urlMatch) handle = urlMatch[1];
  // Strip @ prefix and trailing slashes/spaces
  handle = handle.replace(/^@/, '').replace(/[\/\s]+$/, '').trim();
  return isValidCoachInstagramHandle(handle) ? handle : null;
}

/**
 * Validate a website URL is well-formed.
 * @param {*} raw - raw value
 * @returns {string|null} valid URL or null
 */
function sanitizeWebsiteUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const url = raw.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) return null;
  // Reject obviously hallucinated URLs
  if (url.includes('example.com') || url.includes('placeholder')) return null;
  try {
    new URL(url);
    return url.substring(0, 200);
  } catch {
    return null;
  }
}

/**
 * Llama a Google Places API (New) Text Search.
 * @param {string} textQuery
 * @param {{latitude:number,longitude:number}} center
 * @param {number} radiusMeters
 * @param {string} languageCode
 * @param {string|null} pageToken
 * @param {number} maxResults
 * @param {boolean} useRestriction - true to use locationRestriction (hard filter) instead of locationBias
 * @returns {Promise<{places:Array, nextPageToken:string|null}>}
 */
async function placesTextSearch(textQuery, center, radiusMeters, languageCode, pageToken, maxResults = 20, useRestriction = false, includedTypes = null) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not configured');

  const body = {
    textQuery,
    languageCode: languageCode || 'es',
    maxResultCount: maxResults,
  };
  if (includedTypes && Array.isArray(includedTypes) && includedTypes.length > 0) {
    body.includedType = includedTypes[0];
  }
  if (center && center.latitude && center.longitude) {
    const radius = radiusMeters || 100000;
    if (useRestriction) {
      // locationRestriction requires rectangle (low/high), NOT circle
      const deltaLat = radius / 111320;
      const deltaLng = radius / (111320 * Math.cos(center.latitude * Math.PI / 180));
      body.locationRestriction = {
        rectangle: {
          low: {latitude: center.latitude - deltaLat, longitude: center.longitude - deltaLng},
          high: {latitude: center.latitude + deltaLat, longitude: center.longitude + deltaLng},
        },
      };
    } else {
      // locationBias accepts circle (soft preference hint)
      body.locationBias = {
        circle: {
          center: {latitude: center.latitude, longitude: center.longitude},
          radius,
        },
      };
    }
  }
  if (pageToken) body.pageToken = pageToken;

  const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': PLACES_FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    logger.error(`[placesTextSearch] API error ${resp.status}: ${errText}`);
    throw new Error(`Places API error: ${resp.status}`);
  }

  const data = await resp.json();
  return {
    places: data.places || [],
    nextPageToken: data.nextPageToken || null,
  };
}

/**
 * Transforma un lugar de la API de Google Places (New) a nuestro formato PlaceSuggestion.
 * @param {Object} placesConfig - optional config from getPlacesSearchConfig() for photoMaxHeightPx, photosPerPlace, travelSpeedKmH
 */
function transformPlaceToSuggestion(place, currentUser, otherUser, apiKey, placesConfig) {
  const lat = place.location?.latitude || 0;
  const lng = place.location?.longitude || 0;
  const distUser1 = haversineKm(currentUser.lat, currentUser.lng, lat, lng);
  const distUser2 = haversineKm(otherUser.lat, otherUser.lng, lat, lng);

  // Config-driven photo settings
  const maxPhotos = (placesConfig && placesConfig.photosPerPlace) || 5;
  const photoHeight = (placesConfig && placesConfig.photoMaxHeightPx) || 400;
  const speedKmH = (placesConfig && placesConfig.travelSpeedKmH) || 40;

  // Photos: construir URLs con la Place Photos API
  let photos = null;
  if (place.photos && place.photos.length > 0) {
    photos = place.photos.slice(0, maxPhotos).map((p) => ({
      url: `https://places.googleapis.com/v1/${p.name}/media?maxHeightPx=${photoHeight}&key=${apiKey}`,
      width: p.widthPx || 400,
      height: p.heightPx || 300,
    }));
  }

  return {
    name: place.displayName?.text || '',
    address: place.formattedAddress || '',
    rating: place.rating || 0,
    distanceUser1: Math.round(distUser1 * 10) / 10,
    distanceUser2: Math.round(distUser2 * 10) / 10,
    travelTimeUser1: estimateTravelMin(distUser1, speedKmH),
    travelTimeUser2: estimateTravelMin(distUser2, speedKmH),
    latitude: lat,
    longitude: lng,
    placeId: place.id || '',
    score: Math.round((1 / (1 + (distUser1 + distUser2) / 2)) * 100) / 100,
    website: place.websiteUri || null,
    phoneNumber: place.nationalPhoneNumber || null,
    googleMapsUrl: place.googleMapsUri || null,
    isOpenNow: place.currentOpeningHours?.openNow ?? null,
    tiktok: null,
    instagram: null,
    instagramHandle: null,
    category: place.primaryType || null,
    photos: photos,
    description: place.editorialSummary?.text || null,
  };
}

/**
 * Callable: Obtener sugerencias de lugares para una cita.
 * Payload: { matchId, userLanguage, category?, pageToken? }
 * Response: { success, suggestions: [PlaceSuggestion], nextPageToken? }
 * Homologado: iOS ChatView.getDateSuggestions + Android ChatViewModel.requestDateSuggestions
 *
 * Calcula el punto medio entre los 2 usuarios del match y busca lugares cercanos.
 * Usa patrón multi-query paralelo (como Coach IA) para obtener más resultados variados.
 */
exports.getDateSuggestions = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60, secrets: [placesApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {matchId, userLanguage, category, pageToken, loadCount, excludePlaceIds} = request.data || {};
    if (!matchId) throw new Error('matchId is required');

    const currentUserId = request.auth.uid;

    try {
      // Read dynamic config from Remote Config
      const config = await getPlacesSearchConfig();
      const catQueryMap = getCategoryQueryMap(config);
      const step = Math.min(Math.max(0, loadCount || 0), config.maxLoadCount || 20);
      logger.info(`[getDateSuggestions] matchId=${matchId} category=${category || 'all'} page=${!!pageToken} loadCount=${step}`);

      const {currentUser, otherUser, midpoint} = await getMatchUsersLocations(matchId, currentUserId);
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      const lang = userLanguage || config.defaultLanguage || 'es';
      if (!config.enabled) {
        return {success: false, error: 'Place suggestions are currently disabled', suggestions: []};
      }

      // Progressive radius from config
      const radiusSteps = config.radiusSteps;
      const stepIndex = Math.min(step, radiusSteps.length - 1);
      const radiusMeters = radiusSteps[stepIndex];
      const maxResults = config.perQueryResults;
      const maxPlaces = config.maxPlacesIntermediate;

      // Set of placeIds to exclude (for "load more" dedup)
      const excludeSet = new Set(Array.isArray(excludePlaceIds) ? excludePlaceIds : []);

      // Pagination path: single query with pageToken (backward compatible)
      if (pageToken) {
        const catQuery = (category && catQueryMap[category]) ? catQueryMap[category] : 'restaurant café bar';
        const {places, nextPageToken: npt} = await placesTextSearch(
          catQuery, midpoint, radiusMeters, lang, pageToken, maxResults,
        );
        const suggestions = places.map((p) => transformPlaceToSuggestion(p, currentUser, otherUser, apiKey, config));
        suggestions.sort((a, b) => b.score - a.score);
        const result = {success: true, suggestions, hasMore: !!npt || stepIndex < radiusSteps.length - 1};
        if (npt) result.nextPageToken = npt;
        return result;
      }

      // Multi-query parallel search (dynamic query counts from config)
      let queries;
      if (category && catQueryMap[category]) {
        // Specific category: primary + supplementary (queriesWithCategory - 1)
        const supplementaryCount = Math.max(0, config.queriesWithCategory - 1);
        const allCats = Object.keys(catQueryMap).filter((c) => c !== category);
        const shuffledCats = [...allCats].sort(() => Math.random() - 0.5);
        queries = [catQueryMap[category], ...shuffledCats.slice(0, supplementaryCount).map((k) => catQueryMap[k])];
      } else {
        // No category: random diverse category queries
        const queryCount = config.queriesWithoutCategory;
        const allCats = Object.keys(catQueryMap);
        const shuffled = [...allCats].sort(() => Math.random() - 0.5);
        queries = shuffled.slice(0, queryCount).map((k) => catQueryMap[k]);
      }

      // Progressive radius strategy (same as Coach IA — configurable via RC places_search_config):
      // Initial (step=0): start small (15km), expand progressively until minTarget results
      // LoadMore (step>0): exponential expansion from base radius, no repeated placeIds
      const progressiveSteps = Array.isArray(config.progressiveRadiusSteps) && config.progressiveRadiusSteps.length > 0
        ? config.progressiveRadiusSteps : [15000, 30000, 60000, 120000, 200000, 300000];
      const minTarget = config.minPlacesTarget || 30;
      const maxR = config.maxRadius || 300000;
      const pMinR = config.minRadius || 3000;
      // Minimum radius to cover both users of the match
      const userDistKm = haversineKm(currentUser.lat, currentUser.lng, otherUser.lat, otherUser.lng);
      const computedMinR = userDistKm / 2 * 1000 + pMinR;

      let unique;
      let lastRadiusUsed = 0;

      if (step === 0) {
        // Initial load: progressive radius loop — start small, expand until minTarget results
        const effectiveSteps = progressiveSteps.filter((s) => s >= computedMinR).length > 0
          ? progressiveSteps.filter((s) => s >= computedMinR)
          : [Math.min(maxR, Math.max(...progressiveSteps))];

        const allUniqueIds = new Set([...excludeSet]);
        let allRawPlaces = [];

        for (const stepRadius of effectiveSteps) {
          const radiusM = Math.min(maxR, stepRadius);
          lastRadiusUsed = radiusM;
          const results = await Promise.all(
            queries.map((q) => placesTextSearch(q, midpoint, radiusM, lang, null, maxResults, config.useRestriction).catch(() => ({places: []}))),
          );
          const newPlaces = results.flatMap((r) => r.places).filter((p) => {
            if (!p.id || allUniqueIds.has(p.id)) return false;
            allUniqueIds.add(p.id);
            return true;
          });
          allRawPlaces = [...allRawPlaces, ...newPlaces];
          logger.info(`[getDateSuggestions] Progressive: ${radiusM}m → ${newPlaces.length} new (total: ${allRawPlaces.length}, target: ${minTarget})`);
          if (allRawPlaces.length >= minTarget) break;
        }
        unique = allRawPlaces.slice(0, maxPlaces);
      } else {
        // LoadMore: exponential expansion (configurable via RC)
        const lmBase = config.loadMoreDefaultBaseRadius || 60000;
        const lmExpBase = config.loadMoreExpansionBase || 2;
        const lmMaxStep = config.loadMoreMaxExpansionStep || 4;
        const lmRadius = Math.min(maxR, Math.max(computedMinR, lmBase) * Math.pow(lmExpBase, Math.min(step, lmMaxStep) + 1));
        lastRadiusUsed = lmRadius;

        const results = await Promise.all(
          queries.map((q) => placesTextSearch(q, midpoint, lmRadius, lang, null, maxResults, config.useRestriction).catch(() => ({places: []}))),
        );
        const seen = new Set();
        unique = results.flatMap((r) => r.places).filter((p) => {
          if (!p.id || seen.has(p.id) || excludeSet.has(p.id)) return false;
          seen.add(p.id);
          return true;
        }).slice(0, maxPlaces);
      }

      const suggestions = unique.map((p) => transformPlaceToSuggestion(p, currentUser, otherUser, apiKey, config));
      suggestions.sort((a, b) => b.score - a.score);

      const hasMore = lastRadiusUsed < maxR;
      logger.info(`[getDateSuggestions] Found ${suggestions.length} places (radius=${lastRadiusUsed / 1000}km, step=${step}, hasMore=${hasMore})`);
      return {success: true, suggestions, hasMore};
    } catch (err) {
      logger.error(`[getDateSuggestions] Error: ${err.message}`);
      return {success: false, error: err.message, suggestions: []};
    }
  },
);

/**
 * Callable: Buscar lugares por texto para una cita.
 * Payload: { matchId, query, userLanguage, pageToken? }
 * Response: { success, places: [PlaceSuggestion], nextPageToken? }
 * Homologado: iOS ChatView.searchPlaces + Android ChatViewModel.searchPlaces
 *
 * Busca lugares usando Google Places API Text Search con patrón multi-query paralelo.
 * Usa locationRestriction (hard) para resultados geográficamente relevantes.
 */
exports.searchPlaces = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60, secrets: [placesApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {matchId, query, userLanguage, pageToken, loadCount, excludePlaceIds} = request.data || {};
    if (!matchId) throw new Error('matchId is required');
    if (!query && !pageToken) throw new Error('query is required');

    const currentUserId = request.auth.uid;

    try {
      // Read dynamic config from Remote Config
      const config = await getPlacesSearchConfig();
      const catQueryMap = getCategoryQueryMap(config);
      const step = Math.min(Math.max(0, loadCount || 0), config.maxLoadCount || 20);
      logger.info(`[searchPlaces] matchId=${matchId} query="${query}" page=${!!pageToken} loadCount=${step}`);

      const {currentUser, otherUser, midpoint} = await getMatchUsersLocations(matchId, currentUserId);
      if (!config.enabled) {
        return {success: false, error: 'Place search is currently disabled', places: []};
      }

      // Try to detect city mention in query for location override
      let searchCenter = midpoint;
      let searchLocationOverridden = false;
      const cityExtract = (query || '').match(/(?:\b(?:en|in|at|near|à|em|dans|в|で|在|di)\b\s+)(.{2,50})$/i);
      if (cityExtract) {
        const geocoded = await forwardGeocode(cityExtract[1].trim());
        if (geocoded) {
          searchCenter = geocoded;
          searchLocationOverridden = true;
          logger.info(`[searchPlaces] City mention "${cityExtract[1].trim()}" → override center (${geocoded.latitude.toFixed(2)}, ${geocoded.longitude.toFixed(2)})`);
        }
      }

      // Progressive radius from config
      const radiusSteps = config.radiusSteps;
      const stepIndex = Math.min(step, radiusSteps.length - 1);
      const radiusMeters = radiusSteps[stepIndex];
      const maxResults = config.perQueryResults;
      const maxPlaces = config.maxPlacesIntermediate;
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      const lang = userLanguage || config.defaultLanguage || 'es';

      // Set of placeIds to exclude (for "load more" dedup)
      const excludeSet = new Set(Array.isArray(excludePlaceIds) ? excludePlaceIds : []);

      // Use soft locationBias when center was overridden by city mention
      const effectiveUseRestriction = searchLocationOverridden ? false : config.useRestriction;

      // Pagination path: single query with pageToken (backward compatible)
      if (pageToken) {
        const {places, nextPageToken: npt} = await placesTextSearch(
          query || '', searchCenter, radiusMeters, lang, pageToken, maxResults, effectiveUseRestriction,
        );
        const suggestions = places.map((p) => transformPlaceToSuggestion(p, currentUser, otherUser, apiKey, config));
        suggestions.sort((a, b) => b.score - a.score);
        const result = {success: true, places: suggestions, hasMore: !!npt || stepIndex < radiusSteps.length - 1};
        if (npt) result.nextPageToken = npt;
        return result;
      }

      // Multi-query search: user query + related category + supplementary queries
      const queries = [query];

      // Detect matching category from user's query to add canonical terms
      const queryLower = (query || '').toLowerCase();
      const matchedCategories = [];
      for (const [cat, catQuery] of Object.entries(catQueryMap)) {
        const keywords = catQuery.toLowerCase().split(/\s+/);
        if (keywords.some((kw) => kw.length >= 3 && (queryLower.includes(kw) || kw.includes(queryLower)))) {
          matchedCategories.push(cat);
        }
      }

      // Add matched category's full query for richer terms
      if (matchedCategories.length > 0) {
        const primaryCatQuery = catQueryMap[matchedCategories[0]];
        if (primaryCatQuery.toLowerCase() !== queryLower) {
          queries.push(primaryCatQuery);
        }
      }

      // Add 1-2 random different categories for variety
      const usedCats = new Set(matchedCategories);
      const availableCats = Object.keys(catQueryMap).filter((c) => !usedCats.has(c));
      const shuffled = [...availableCats].sort(() => Math.random() - 0.5);
      const extraCount = matchedCategories.length > 0 ? 1 : 2;
      queries.push(...shuffled.slice(0, extraCount).map((k) => catQueryMap[k]));

      // Progressive radius strategy (same as Coach IA — configurable via RC places_search_config):
      const progressiveSteps = Array.isArray(config.progressiveRadiusSteps) && config.progressiveRadiusSteps.length > 0
        ? config.progressiveRadiusSteps : [15000, 30000, 60000, 120000, 200000, 300000];
      const minTarget = config.minPlacesTarget || 30;
      const maxR = config.maxRadius || 300000;
      const pMinR = config.minRadius || 3000;
      const userDistKm = haversineKm(currentUser.lat, currentUser.lng, otherUser.lat, otherUser.lng);
      const computedMinR = userDistKm / 2 * 1000 + pMinR;

      let unique;
      let lastRadiusUsed = 0;

      if (step === 0) {
        // Initial load: progressive radius loop
        const effectiveSteps = progressiveSteps.filter((s) => s >= computedMinR).length > 0
          ? progressiveSteps.filter((s) => s >= computedMinR)
          : [Math.min(maxR, Math.max(...progressiveSteps))];

        const allUniqueIds = new Set([...excludeSet]);
        let allRawPlaces = [];

        for (const stepRadius of effectiveSteps) {
          const radiusM = Math.min(maxR, stepRadius);
          lastRadiusUsed = radiusM;
          const results = await Promise.all(
            queries.map((q) => placesTextSearch(q, searchCenter, radiusM, lang, null, maxResults, effectiveUseRestriction).catch(() => ({places: []}))),
          );
          const newPlaces = results.flatMap((r) => r.places).filter((p) => {
            if (!p.id || allUniqueIds.has(p.id)) return false;
            allUniqueIds.add(p.id);
            return true;
          });
          allRawPlaces = [...allRawPlaces, ...newPlaces];
          logger.info(`[searchPlaces] Progressive: ${radiusM}m → ${newPlaces.length} new (total: ${allRawPlaces.length}, target: ${minTarget})`);
          if (allRawPlaces.length >= minTarget) break;
        }
        unique = allRawPlaces.slice(0, maxPlaces);
      } else {
        // LoadMore: exponential expansion (configurable via RC)
        const lmBase = config.loadMoreDefaultBaseRadius || 60000;
        const lmExpBase = config.loadMoreExpansionBase || 2;
        const lmMaxStep = config.loadMoreMaxExpansionStep || 4;
        const lmRadius = Math.min(maxR, Math.max(computedMinR, lmBase) * Math.pow(lmExpBase, Math.min(step, lmMaxStep) + 1));
        lastRadiusUsed = lmRadius;

        const results = await Promise.all(
          queries.map((q) => placesTextSearch(q, searchCenter, lmRadius, lang, null, maxResults, effectiveUseRestriction).catch(() => ({places: []}))),
        );
        const seen = new Set();
        unique = results.flatMap((r) => r.places).filter((p) => {
          if (!p.id || seen.has(p.id) || excludeSet.has(p.id)) return false;
          seen.add(p.id);
          return true;
        }).slice(0, maxPlaces);
      }

      const suggestions = unique.map((p) => transformPlaceToSuggestion(p, currentUser, otherUser, apiKey, config));
      suggestions.sort((a, b) => b.score - a.score);

      const hasMore = lastRadiusUsed < maxR;
      logger.info(`[searchPlaces] Found ${suggestions.length} places for "${query}" (radius=${lastRadiusUsed / 1000}km, step=${step}, overridden=${searchLocationOverridden})`);
      return {success: true, places: suggestions, hasMore};
    } catch (err) {
      logger.error(`[searchPlaces] Error: ${err.message}`);
      return {success: false, error: err.message, places: []};
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// TEST NOTIFICATIONS (preservadas — testSuperLikesResetNotification, testDailyLikesResetNotification)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Callable: Probar notificación de reset de super likes.
 * Payload: { userId }
 * Homologado: Android NotificationTestHelper
 */
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

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULED FUNCTIONS — Reset de likes/super likes, matches, eliminaciones
// ─────────────────────────────────────────────────────────────────────────────
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {onDocumentUpdated} = require('firebase-functions/v2/firestore');

/**
 * Scheduled: Reset de likes diarios.
 * Corre cada hora. Resetea solo usuarios cuya medianoche local ya pasó (usa timezoneOffset).
 * Siempre 100 — alineado con Remote Config daily_likes_limit.
 * Solo notifica si el usuario usó likes (dailyLikesRemaining < 100).
 */
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

/**
 * Scheduled: Procesar eliminaciones programadas de cuentas.
 * Borra usuarios cuya deletionDate ya pasó.
 * Homologado con scheduleAccountDeletion() en iOS/Android.
 */
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
  'get naked', 'strip for', 'show me your',

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

  // ── Variaciones con números/símbolos ──
  's3x', 's3xo', 'f*ck', 'f**k', 'p0rn', 'pr0n', 'n00ds', 'n00des',
  'c0ger', 'f0llar', 'f0der', 'tr4nsar',
];

/** Términos de la blacklist que son explícitamente sexuales (para categorización) */
const SEXUAL_BLACKLIST_TERMS = [
  'nudes', 'nude', 'dick', 'pussy', 'sex pics', 'porn', 'xxx', 'sextape', 'onlyfans',
  'only fans', 'fotos desnuda', 'fotos íntimas', 'desnudos', 'pack', 'video porno',
  'coger', 'follar', 'culear', 'mamar', 'chupar', 'fotos nua', 'nus', 'pornô',
  'fuck', 'suck', 'lick', 'cum', 'blow job', 'hand job', 'dtf', 'horny',
  'baise', 'suce', 'fick', 'blas', 'geil', 'foder', 'tesão',
];

/**
 * SHA-256 hash del mensaje normalizado (lowercase, trim) — clave de caché.
 */
function getMessageHash(message) {
  return crypto.createHash('sha256')
    .update(message.toLowerCase().trim())
    .digest('hex');
}

/**
 * Filtros rápidos sin IA para mensajes obviamente seguros o prohibidos.
 * Reduce ~60% de llamadas a Gemini.
 */
function applyQuickFilters(message) {
  const messageLower = message.toLowerCase().trim();

  // 1. Mensajes muy cortos → generalmente seguros (emoji, "hola", "ok")
  if (message.length <= 3) {
    return {isSafe: true, category: 'SAFE', reason: 'Message too short to be harmful'};
  }

  // 2. Blacklist de palabras/frases
  for (const term of MODERATION_BLACKLIST) {
    if (messageLower.includes(term)) {
      let category = 'SPAM';
      let severity = 'HIGH';
      if (SEXUAL_BLACKLIST_TERMS.some((st) => term.includes(st))) {
        category = 'INAPPROPRIATE';
      } else if (/money|dinero|dinheiro|bitcoin|paypal|bank|cuenta|transferen/.test(term)) {
        category = 'SCAM';
      }
      return {
        isSafe: false, allowed: false, category, severity,
        reason: `Detected blacklisted term: "${term}"`, confidence: 95,
      };
    }
  }

  // 3. URLs externas sospechosas
  if (/(https?:\/\/|www\.|bit\.ly|tinyurl|shorturl|t\.me\/|wa\.me\/)/i.test(message)) {
    return {
      isSafe: false, allowed: false, category: 'SCAM', severity: 'MEDIUM',
      reason: 'External URL detected', confidence: 85,
    };
  }

  // 4. Números de teléfono (internacional)
  if (/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(message)) {
    return {
      isSafe: false, allowed: false, category: 'PERSONAL_INFO', severity: 'MEDIUM',
      reason: 'Phone number detected', confidence: 90,
    };
  }

  // 5. Emails
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(message)) {
    return {
      isSafe: false, allowed: false, category: 'PERSONAL_INFO', severity: 'LOW',
      reason: 'Email address detected', confidence: 95,
    };
  }

  // 6. Caracteres repetitivos (spam)
  if (/(.)\1{4,}/.test(message)) {
    return {
      isSafe: false, allowed: false, category: 'SPAM', severity: 'LOW',
      reason: 'Repetitive characters detected', confidence: 80,
    };
  }

  // No conclusivo → necesita análisis IA
  return {isSafe: false, needsAI: true};
}

/**
 * Busca resultado en caché Firestore. TTL: 1 hora. Versión: 3.
 */
async function getCachedModerationResult(messageHash, db) {
  try {
    const CACHE_VERSION = 3;
    const oneHourAgo = new Date(Date.now() - 3600000);
    const doc = await db.collection('moderationCache').doc(messageHash).get();
    if (doc.exists) {
      const cached = doc.data();
      const cacheTime = cached.timestamp?.toDate() || new Date(0);
      if ((cached.version || 1) < CACHE_VERSION) return null; // versión antigua
      if (cacheTime > oneHourAgo) {
        return {
          allowed: cached.allowed, category: cached.category,
          severity: cached.severity, reason: cached.reason,
          confidence: cached.confidence, fromCache: true,
        };
      }
    }
  } catch (err) {
    logger.warn('[Cache Read] Error:', err.message);
  }
  return null;
}

/**
 * Guarda resultado de moderación en caché Firestore.
 */
async function saveModerationToCache(messageHash, result, db) {
  try {
    const CACHE_VERSION = 3;
    await db.collection('moderationCache').doc(messageHash).set({
      allowed: result.allowed, category: result.category,
      severity: result.severity, reason: result.reason,
      confidence: result.confidence, version: CACHE_VERSION,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});
  } catch (err) {
    logger.warn('[Cache Write] Error:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-MODERATION TRIGGER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Trigger: Auto-moderar mensajes al crearse en un match.
 * Pipeline: caché → quick filters → RAG + Gemini AI.
 * Complementa a moderateMessage CF callable (invocada explícitamente por la app).
 */
exports.autoModerateMessage = onDocumentCreated(
  {document: 'matches/{matchId}/messages/{messageId}', region: 'us-central1', memory: '256MiB', timeoutSeconds: 30},
  async (event) => {
    const db = admin.firestore();
    const snapshot = event.data;
    if (!snapshot) return;
    const data = snapshot.data();
    const messageId = event.params.messageId;
    const matchId = event.params.matchId;

    // Solo moderar mensajes de texto
    if (!data.message || data.type !== 'text') return;

    const message = data.message;
    const senderId = data.senderId;

    try {
      // ── 1. Cache check ──
      const messageHash = getMessageHash(message);
      const cachedResult = await getCachedModerationResult(messageHash, db);
      if (cachedResult) {
        if (!cachedResult.allowed && cachedResult.severity === 'HIGH') {
          await snapshot.ref.update({
            moderated: true, moderationResult: cachedResult,
            moderatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          logger.warn(`[autoModerate] Cached HIGH flagged ${messageId}`);
        }
        return;
      }

      // ── 2. Quick filters (sin IA) ──
      const quickCheck = applyQuickFilters(message);

      if (quickCheck.isSafe) {
        await saveModerationToCache(messageHash, {allowed: true, category: 'SAFE', severity: 'NONE', confidence: 100}, db);
        return;
      }

      if (quickCheck.allowed === false) {
        await saveModerationToCache(messageHash, quickCheck, db);
        await snapshot.ref.update({
          moderated: true, moderationResult: quickCheck,
          moderatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Auto-reporte para HIGH severity
        if (quickCheck.severity === 'HIGH') {
          await db.collection('reports').add({
            reportedUserId: senderId, reporterUserId: 'SYSTEM_AUTO_MODERATE',
            matchId, messageId, reason: `Auto-detected: ${quickCheck.category}`,
            category: quickCheck.category, severity: quickCheck.severity,
            autoGenerated: true, message: message.substring(0, 500),
            timestamp: admin.firestore.FieldValue.serverTimestamp(), status: 'pending',
          });
        }

        // Audit trail
        await db.collection('moderatedMessages').add({
          matchId, messageId, senderId, message: message.substring(0, 500),
          category: quickCheck.category, severity: quickCheck.severity,
          reason: quickCheck.reason, confidence: quickCheck.confidence,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          filteredBy: 'auto-moderate-quick-filter', messageHash: messageHash.substring(0, 16),
        });
        logger.warn(`[autoModerate] Quick-filter flagged ${messageId}: ${quickCheck.category}`);
        return;
      }

      // ── 3. IA analysis (requiere Gemini) ──
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        logger.warn('[autoModerate] GEMINI_API_KEY not configured, allowing message');
        return;
      }

      // RAG: obtener contexto de moderación + idioma del sender + config en paralelo
      let ragContext = '';
      try {
        const [senderDoc, modConfig] = await Promise.all([
          db.collection('users').doc(senderId).get(),
          getModerationConfig(),
        ]);
        const senderLang = senderDoc.exists ? (senderDoc.data().deviceLanguage || 'en') : 'en';
        ragContext = await retrieveModerationKnowledge(message, apiKey, senderLang, 'message', modConfig.rag || {});
      } catch (ragErr) {
        logger.warn('[autoModerate] RAG fallback:', ragErr.message);
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({model: AI_MODEL_LITE});

      const ragSection = ragContext ? `\n\nMODERATION KNOWLEDGE BASE:\n${ragContext}\n` : '';
      const prompt = `You are a content moderation system for Black Sugar 21, a sugar dating app. Analyze the following chat message and classify it.
${ragSection}
Message: "${message.substring(0, 1000)}"

Categories:
- SAFE: Normal conversation, greetings, innocent questions, flirting appropriate for a dating app
- SPAM: Repetitive messages, promotional content, advertising
- SCAM: Scams, phishing, money requests, false promises, payment platform links
- INAPPROPRIATE: Unsolicited explicit sexual content, harassment, insults, violence, threats
- PERSONAL_INFO: Phone numbers, addresses, social media handles, emails shared unsolicited

IMPORTANT CONTEXT: This is a sugar dating app. Compliments about appearance, casual flirting, discussing lifestyle expectations, and mentioning dates/dinners are NORMAL and should be classified as SAFE. Only flag genuinely harmful, explicit, or predatory content.

Severity (only if NOT SAFE):
- LOW: Mild, warning sufficient
- MEDIUM: Moderate, needs review
- HIGH: Severe, immediate block and report

Respond ONLY with valid JSON (no markdown):
{"category":"SAFE|SPAM|SCAM|INAPPROPRIATE|PERSONAL_INFO","severity":"NONE|LOW|MEDIUM|HIGH","confidence":0-100,"reason":"brief explanation"}`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();
      const cleanText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const analysis = JSON.parse(cleanText);

      const moderationResult = {
        allowed: analysis.category === 'SAFE',
        category: analysis.category || 'SAFE',
        severity: analysis.severity || 'NONE',
        reason: analysis.reason || '',
        confidence: analysis.confidence || 0,
        analyzedBy: 'gemini-ai',
      };

      await saveModerationToCache(messageHash, moderationResult, db);

      if (!moderationResult.allowed) {
        await snapshot.ref.update({
          moderated: true, moderationResult,
          moderatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        if (moderationResult.severity === 'HIGH') {
          await db.collection('reports').add({
            reportedUserId: senderId, reporterUserId: 'SYSTEM_AUTO_MODERATE',
            matchId, messageId, reason: `Auto-detected by AI: ${moderationResult.category}`,
            category: moderationResult.category, severity: moderationResult.severity,
            autoGenerated: true, message: message.substring(0, 500),
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            status: 'pending', aiConfidence: moderationResult.confidence,
          });
        }

        await db.collection('moderatedMessages').add({
          matchId, messageId, senderId, message: message.substring(0, 500),
          category: moderationResult.category, severity: moderationResult.severity,
          reason: moderationResult.reason, confidence: moderationResult.confidence,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          filteredBy: 'auto-moderate-gemini-ai', messageHash: messageHash.substring(0, 16),
        });

        logger.warn(`[autoModerate] AI flagged ${messageId}: ${moderationResult.category} (conf:${moderationResult.confidence})`);
      }
    } catch (error) {
      // Fail-open: no bloquear mensajes si hay error
      logger.error(`[autoModerate] Error processing ${messageId}:`, error);
    }
  },
);

/**
 * Trigger: Validar y auto-reparar geohash cuando se actualiza la ubicación del usuario.
 * Si el usuario tiene lat/lng pero no campo "g" (geohash), lo calcula y escribe automáticamente.
 * Algoritmo encodeGeohash() idéntico al de iOS y Android.
 */
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
exports.getRealtimeCoachTips = onCall(
  {region: 'us-central1', memory: '512MiB', timeoutSeconds: 60, secrets: [geminiApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const userId = request.auth.uid;
    const {matchId, userLanguage} = request.data || {};

    if (!matchId) throw new Error('matchId is required');
    const lang = (userLanguage || 'en').toLowerCase();
    const db = admin.firestore();

    try {
      // 1. Read match and verify participant
      const matchDoc = await db.collection('matches').doc(matchId).get();
      if (!matchDoc.exists) throw new Error('Match not found');
      const matchData = matchDoc.data();
      const usersMatched = matchData.usersMatched || [];
      if (!usersMatched.includes(userId)) throw new Error('Not a participant');
      const otherUserId = usersMatched.find((id) => id !== userId);

      // 2. Read both profiles + last 20 messages in parallel
      const [userDoc, otherDoc, messagesSnap] = await Promise.all([
        db.collection('users').doc(userId).get(),
        db.collection('users').doc(otherUserId).get(),
        db.collection('matches').doc(matchId)
          .collection('messages').orderBy('timestamp', 'desc').limit(20).get(),
      ]);

      const userData = userDoc.exists ? userDoc.data() : {};
      const otherData = otherDoc.exists ? otherDoc.data() : {};
      const userName = userData.name || 'User';
      const matchName = otherData.name || 'Match';
      const userInterests = (userData.interests || []).slice(0, 8).join(', ');
      const matchInterests = (otherData.interests || []).slice(0, 8).join(', ');

      const messages = messagesSnap.docs.map((d) => {
        const m = d.data();
        return {
          sender: m.senderId === userId ? 'user' : 'match',
          text: (m.message || '').substring(0, 200),
          type: m.type || 'text',
        };
      }).reverse();

      // 3. If too few messages, return basic response
      if (messages.length < 3) {
        return {
          success: true,
          chemistryScore: 50,
          chemistryTrend: 'stable',
          engagementLevel: 'low',
          tips: [],
          preDateDetected: false,
          suggestedAction: null,
        };
      }

      // 4. Build conversation transcript
      const transcript = messages
        .filter((m) => m.type === 'text')
        .map((m) => `${m.sender === 'user' ? userName : matchName}: ${m.text}`)
        .join('\n');

      // 5. Build Gemini prompt
      const langInstruction = getLanguageInstruction(lang);
      const systemPrompt = `You are a real-time dating coach AI analyzing a live chat conversation.
Analyze the following conversation between ${userName} and ${matchName} and provide actionable coaching insights.

User profile: ${userData.userType || 'unknown'}, interests: ${userInterests || 'none'}
Match profile: ${otherData.userType || 'unknown'}, interests: ${matchInterests || 'none'}

Recent conversation:
${transcript}

${langInstruction}

Respond ONLY with a valid JSON object (no markdown, no extra text):
{
  "chemistryScore": <number 0-100, based on mutual engagement, emotional connection, humor, and reciprocity>,
  "chemistryTrend": "<rising|falling|stable> based on how the conversation energy is evolving",
  "engagementLevel": "<high|medium|low> based on response length, questions asked, enthusiasm",
  "tips": [
    {"text": "<specific actionable tip based on the conversation>", "type": "<conversation|flirting|suggestion|warning>", "icon": "<lightbulb|heart|calendar|alert>"}
  ],
  "preDateDetected": <true if they are discussing meeting up, planning a date, or mentioning places/times to meet>,
  "suggestedAction": {"type": "<ask_question|compliment|suggest_date|change_topic|be_playful>", "text": "<specific suggested message the user could send>"}
}

Rules:
- Give 1-3 tips maximum, each specific to THIS conversation (not generic)
- The suggestedAction text should be a concrete message the user could copy and send
- chemistryScore should reflect genuine connection signals (not just message count)
- Set preDateDetected=true ONLY if there are clear signals of planning to meet
- Tips should reference specific things said in the conversation
- Be encouraging but honest — if engagement is low, say so constructively`;

      // 6. Call Gemini
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('AI service unavailable');

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({model: AI_MODEL_LITE, generationConfig: {maxOutputTokens: 1024, responseMimeType: 'application/json'}});
      const result = await model.generateContent(systemPrompt);
      const responseText = result.response.text();

      // 7. Parse response
      let parsed;
      try {
        parsed = parseGeminiJsonResponse(responseText);
      } catch {
        logger.warn(`[getRealtimeCoachTips] Failed to parse Gemini response: ${responseText.substring(0, 200)}`);
        return {
          success: true,
          chemistryScore: 50,
          chemistryTrend: 'stable',
          engagementLevel: 'medium',
          tips: [],
          preDateDetected: false,
          suggestedAction: null,
        };
      }

      const tips = Array.isArray(parsed.tips) ? parsed.tips.slice(0, 3).map((t) => ({
        text: (t.text || '').substring(0, 200),
        type: t.type || 'conversation',
        icon: t.icon || 'lightbulb',
      })) : [];

      const suggestedAction = parsed.suggestedAction ? {
        type: parsed.suggestedAction.type || 'ask_question',
        text: (parsed.suggestedAction.text || '').substring(0, 200),
      } : null;

      logger.info(`[getRealtimeCoachTips] matchId=${matchId}, score=${parsed.chemistryScore}, tips=${tips.length}`);
      return {
        success: true,
        chemistryScore: Math.max(0, Math.min(100, parseInt(parsed.chemistryScore) || 50)),
        chemistryTrend: ['rising', 'falling', 'stable'].includes(parsed.chemistryTrend) ? parsed.chemistryTrend : 'stable',
        engagementLevel: ['high', 'medium', 'low'].includes(parsed.engagementLevel) ? parsed.engagementLevel : 'medium',
        tips,
        preDateDetected: !!parsed.preDateDetected,
        suggestedAction,
      };
    } catch (error) {
      logger.error(`[getRealtimeCoachTips] Error: ${error.message}`);
      throw new Error(`Coach analysis unavailable: ${error.message}`);
    }
  },
);
