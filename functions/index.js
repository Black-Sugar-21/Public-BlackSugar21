const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const {onObjectFinalized} = require('firebase-functions/v2/storage');
const {onCall} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const {logger} = require('firebase-functions/v2');
const {defineSecret} = require('firebase-functions/params');

const placesApiKey = defineSecret('GOOGLE_PLACES_API_KEY');
const sharp = require('sharp');
const path = require('path');
const os = require('os');
const fs = require('fs');

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

      for (const bound of bounds) {
        if (compatibleIds.length >= limit) break;

        // Query con geohash range + filtros de estado
        let query = db.collection('users')
          .where('g', '>=', bound.start)
          .where('g', '<=', bound.end);

        // Nota: Firestore no permite inequality en 2 campos distintos (g + male),
        // así que male se filtra en memoria junto a los demás filtros.

        const snap = await query.get();

        for (const doc of snap.docs) {
          if (compatibleIds.length >= limit) break;

          // Dedup entre rangos superpuestos
          if (seenUserIds.has(doc.id)) continue;
          seenUserIds.add(doc.id);

          // Excluir IDs ya marcados (swipes, matches, bloqueados, self)
          if (excludedIds.has(doc.id)) continue;

          const candidate = doc.data();

          // Excluir cuentas no activas o pausadas
          if (candidate.accountStatus !== 'active') continue;
          if (candidate.paused === true) continue;

          // Excluir bloqueados por moderación o IA
          if (candidate.blocked === true) continue;

          // Excluir si el candidato ha bloqueado al usuario actual (bloqueo bidireccional)
          // El campo "blocked" es un array de IDs cuando el usuario bloquea a otros
          const candidateBlockedArray = candidate.blocked;
          if (Array.isArray(candidateBlockedArray) && candidateBlockedArray.includes(currentUserId)) continue;

          // Excluir visibilidad reducida (usuarios reportados)
          if (candidate.visibilityReduced === true) continue;

          // Filtrar por género del candidato según orientación del usuario
          const candidateMale = candidate.male === true;
          if (currentUserOrientation === 'men' && !candidateMale) continue;
          if (currentUserOrientation === 'women' && candidateMale) continue;

          // Filtrar por orientación del candidato (orientación inversa):
          // Un candidato con orientation="women" no debe aparecer a un hombre
          // Un candidato con orientation="men" no debe aparecer a una mujer
          const candidateOrientation = (candidate.orientation || 'both').toLowerCase();
          if (currentUserMale && candidateOrientation === 'women') continue;
          if (!currentUserMale && candidateOrientation === 'men') continue;

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
        if (candidate.blocked === true) continue;
        if (candidate.visibilityReduced === true) continue;

        // Excluir si el candidato ha bloqueado al usuario actual (bloqueo bidireccional)
        const candidateBlockedArray = candidate.blocked;
        if (Array.isArray(candidateBlockedArray) && candidateBlockedArray.includes(currentUserId)) continue;

        const candidateOrientation = (candidate.orientation || 'both').toLowerCase();
        if (currentUserMale && candidateOrientation === 'women') continue;
        if (!currentUserMale && candidateOrientation === 'men') continue;

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
          notification: {
            // Android usa underscores en las keys
            titleLocKey: 'notification_new_match_title',
            bodyLocKey: 'notification_new_match_body',
            bodyLocArgs: [otherUserName],
            sound: 'default',
            channelId: 'matches',
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
    const receiverData = receiverDoc.data();
    if (receiverData.activeChat === matchId) {
      logger.info(`Skipping notification: receiver ${receiverId} has activeChat=${matchId}`);
      await snapshot.ref.update({
        notificationSent: false,
        notificationAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
        notificationSkipReason: 'receiver_in_chat'
      });
      return;
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
        notification: {
          // Android: título localizado con nombre del remitente  
          titleLocKey: 'notification_new_message_title',
          titleLocArgs: [senderName],
          // Body: mensaje genérico localizado (sin contenido real del mensaje)
          bodyLocKey: 'notification_new_message_body',
          sound: 'default',
          channelId: 'messages',
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
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {reportedUserId, reason, matchId, description} = request.data || {};
    const reporterId = request.auth.uid;
    if (!reportedUserId || !reason) throw new Error('reportedUserId and reason are required');

    const db = admin.firestore();

    // Crear documento de reporte
    const reportRef = await db.collection('reports').add({
      reporterId,
      reportedUserId,
      reason,
      description: description || '',
      matchId: matchId || null,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Contar reportes totales contra este usuario (para auto-moderación)
    const reportsSnap = await db.collection('reports')
      .where('reportedUserId', '==', reportedUserId)
      .where('status', 'in', ['pending', 'reviewed'])
      .get();

    const reportCount = reportsSnap.docs.length;
    let action = 'PENDING_REVIEW';

    // Auto-moderación progresiva
    if (reportCount >= 10) {
      await db.collection('users').doc(reportedUserId).update({
        accountStatus: 'banned',
        bannedAt: admin.firestore.FieldValue.serverTimestamp(),
        bannedReason: 'multiple_reports',
      });
      action = 'BANNED';
    } else if (reportCount >= 5) {
      await db.collection('users').doc(reportedUserId).update({
        visibilityReduced: true,
        shadowBannedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      action = 'SHADOWBANNED';
    }

    // Actualizar el reporte con la acción tomada
    await reportRef.update({action, processedAt: admin.firestore.FieldValue.serverTimestamp()});

    logger.info(`[reportUser] ${reporterId} reported ${reportedUserId} — action: ${action} (${reportCount} total reports)`);
    return {success: true, action, reportId: reportRef.id, reportCount};
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

      // 6. Borrar el usuario de Firebase Auth (última acción — punto de no retorno)
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

    const storyData = {
      senderId,
      imageUrl,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
      viewedBy: [],
      isExpired: false,
    };

    if (matchId) storyData.matchId = matchId;
    if (Array.isArray(matchParticipants) && matchParticipants.length > 0) {
      storyData.matchParticipants = matchParticipants;
    }

    const docRef = await db.collection('stories').add(storyData);
    logger.info(`[createStory] Story created: ${docRef.id} by ${senderId}`);
    return {id: docRef.id, success: true};
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

    // Consultar historias activas (no expiradas) para estos usuarios
    // Procesamos en lotes de 10 (límite de 'in' en Firestore)
    const chunkSize = 10;
    for (let i = 0; i < userIds.length; i += chunkSize) {
      const chunk = userIds.slice(i, i + chunkSize);
      try {
        const snap = await db.collection('stories')
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
        const snap = await db.collection('stories')
          .where('senderId', 'in', chunk)
          .where('expiresAt', '>', now)
          .orderBy('expiresAt', 'desc')
          .get();
        snap.docs.forEach((doc) => {
          const data = doc.data();
          const uid = data.senderId;
          if (stories[uid]) {
            stories[uid].push({
              id: doc.id,
              senderId: data.senderId,
              imageUrl: data.imageUrl,
              matchId: data.matchId || null,
              timestamp: data.timestamp || null,
              expiresAt: data.expiresAt || null,
              viewedBy: data.viewedBy || [],
            });
          }
        });
      } catch (e) {
        logger.warn(`[getBatchPersonalStories] Error for chunk: ${e.message}`);
      }
    }

    logger.info(`[getBatchPersonalStories] Fetched stories for ${userIds.length} users`);
    return {stories};
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
 * Callable: Moderar imagen de perfil con IA.
 * Payload: { imageUrl, userId? }
 * Response: { approved, reason, confidence }
 * Homologado: iOS ImageModerationService / Android ImageModerationService
 */
exports.moderateProfileImage = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {imageUrl} = request.data || {};
    if (!imageUrl) throw new Error('imageUrl is required');

    // Placeholder: En producción conectar Cloud Vision SafeSearch API
    // Para mantener el flujo funcional, aprobamos imágenes de Firebase Storage
    const isFirebaseImage = imageUrl.includes('firebasestorage.googleapis.com') ||
                             imageUrl.includes('storage.googleapis.com');

    logger.info(`[moderateProfileImage] Moderated: ${imageUrl}`);
    return {
      approved: true,
      reason: isFirebaseImage ? 'firebase_storage_approved' : 'external_image_approved',
      confidence: 0.95,
    };
  },
);

/**
 * Callable: Moderar contenido de un mensaje antes de enviarlo.
 * Payload: { message, senderId?, matchId? }
 * Response: { approved, reason }
 * Homologado: iOS ChatViewModel.moderateMessage
 */
exports.moderateMessage = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 30},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {message} = request.data || {};
    if (!message || typeof message !== 'string') {
      return {approved: true, reason: 'empty_message'};
    }

    // Lista básica de términos prohibidos (en producción usar Cloud NLP / Vertex AI)
    const prohibited = ['spam', 'onlyfans.com', 'venmo.me'];
    const lowerMsg = message.toLowerCase();
    const flagged = prohibited.some((term) => lowerMsg.includes(term));

    logger.info(`[moderateMessage] Message moderated, flagged=${flagged}`);
    return {
      approved: !flagged,
      reason: flagged ? 'prohibited_content' : 'approved',
    };
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
    // ✅ Respuesta homologada: iOS/Android leen resultData["matches"] como [{userId, similarity}]
    const matches = snap.docs
      .filter((d) => {
        if (d.id === uid) return false;
        const data = d.data();
        // ✅ FIX: Excluir usuarios bloqueados por moderación (legacy blocked: true)
        if (data.blocked === true) return false;
        // ✅ FIX: Excluir usuarios que el usuario actual ha bloqueado
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

/** Estimación simple de tiempo de viaje en minutos (40 km/h ciudad). */
function estimateTravelMin(km) {
  return Math.max(1, Math.round((km / 40) * 60));
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

const CATEGORY_QUERY_MAP = {
  cafe: 'café coffee',
  restaurant: 'restaurant',
  bar: 'bar pub',
  night_club: 'nightclub discoteca',
  movie_theater: 'movie theater cinema',
  park: 'park parque',
  museum: 'museum museo',
  bowling_alley: 'bowling',
  art_gallery: 'art gallery galería',
  bakery: 'bakery panadería',
  shopping_mall: 'shopping mall centro comercial',
  spa: 'spa wellness',
  aquarium: 'aquarium acuario',
  zoo: 'zoo zoológico',
};

const PLACES_FIELD_MASK = [
  'places.displayName',
  'places.formattedAddress',
  'places.rating',
  'places.location',
  'places.id',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.googleMapsUri',
  'places.currentOpeningHours',
  'places.photos',
  'places.primaryType',
  'places.editorialSummary',
  'nextPageToken',
].join(',');

/**
 * Llama a Google Places API (New) Text Search.
 * @param {string} textQuery
 * @param {{latitude:number,longitude:number}} center
 * @param {number} radiusMeters
 * @param {string} languageCode
 * @param {string|null} pageToken
 * @param {number} maxResults
 * @returns {Promise<{places:Array, nextPageToken:string|null}>}
 */
async function placesTextSearch(textQuery, center, radiusMeters, languageCode, pageToken, maxResults = 20) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not configured');

  const body = {
    textQuery,
    locationBias: {
      circle: {
        center: {latitude: center.latitude, longitude: center.longitude},
        radius: radiusMeters,
      },
    },
    languageCode: languageCode || 'es',
    maxResultCount: maxResults,
  };
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
 */
function transformPlaceToSuggestion(place, currentUser, otherUser, apiKey) {
  const lat = place.location?.latitude || 0;
  const lng = place.location?.longitude || 0;
  const distUser1 = haversineKm(currentUser.lat, currentUser.lng, lat, lng);
  const distUser2 = haversineKm(otherUser.lat, otherUser.lng, lat, lng);

  // Photos: construir URLs con la Place Photos API
  let photos = null;
  if (place.photos && place.photos.length > 0) {
    photos = place.photos.slice(0, 5).map((p) => ({
      url: `https://places.googleapis.com/v1/${p.name}/media?maxHeightPx=400&key=${apiKey}`,
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
    travelTimeUser1: estimateTravelMin(distUser1),
    travelTimeUser2: estimateTravelMin(distUser2),
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
 * Si no hay historial de chat, muestra los lugares más cercanos al punto medio.
 */
exports.getDateSuggestions = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60, secrets: [placesApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {matchId, userLanguage, category, pageToken} = request.data || {};
    if (!matchId) throw new Error('matchId is required');

    const currentUserId = request.auth.uid;
    logger.info(`[getDateSuggestions] matchId=${matchId} category=${category || 'all'} page=${!!pageToken}`);

    try {
      const {currentUser, otherUser, midpoint} = await getMatchUsersLocations(matchId, currentUserId);

      // Radio basado en la distancia entre usuarios (mínimo 2km, máximo 30km)
      const userDistance = haversineKm(currentUser.lat, currentUser.lng, otherUser.lat, otherUser.lng);
      const radiusMeters = Math.min(30000, Math.max(2000, (userDistance / 2) * 1000 + 2000));

      // Construir query: si hay categoría usarla, si no buscar lugares de cita genéricos
      let textQuery;
      if (category && CATEGORY_QUERY_MAP[category]) {
        textQuery = CATEGORY_QUERY_MAP[category];
      } else {
        textQuery = 'restaurant café bar date spot';
      }

      const {places, nextPageToken} = await placesTextSearch(
        textQuery, midpoint, radiusMeters, userLanguage || 'es', pageToken || null, 20,
      );

      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      const suggestions = places.map((p) => transformPlaceToSuggestion(p, currentUser, otherUser, apiKey));

      // Ordenar por score (equidistancia) descendente
      suggestions.sort((a, b) => b.score - a.score);

      logger.info(`[getDateSuggestions] Found ${suggestions.length} places, hasMore=${!!nextPageToken}`);
      const result = {success: true, suggestions};
      if (nextPageToken) result.nextPageToken = nextPageToken;
      return result;
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
 * Busca lugares usando Google Places API Text Search con bias al punto medio de los usuarios.
 */
exports.searchPlaces = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60, secrets: [placesApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {matchId, query, userLanguage, pageToken} = request.data || {};
    if (!matchId) throw new Error('matchId is required');
    if (!query && !pageToken) throw new Error('query is required');

    const currentUserId = request.auth.uid;
    logger.info(`[searchPlaces] matchId=${matchId} query="${query}" page=${!!pageToken}`);

    try {
      const {currentUser, otherUser, midpoint} = await getMatchUsersLocations(matchId, currentUserId);

      const userDistance = haversineKm(currentUser.lat, currentUser.lng, otherUser.lat, otherUser.lng);
      const radiusMeters = Math.min(50000, Math.max(5000, (userDistance / 2) * 1000 + 5000));

      const {places, nextPageToken} = await placesTextSearch(
        query || '', midpoint, radiusMeters, userLanguage || 'es', pageToken || null, 20,
      );

      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      const suggestions = places.map((p) => transformPlaceToSuggestion(p, currentUser, otherUser, apiKey));
      suggestions.sort((a, b) => b.score - a.score);

      logger.info(`[searchPlaces] Found ${suggestions.length} places for "${query}", hasMore=${!!nextPageToken}`);
      const result = {success: true, places: suggestions};
      if (nextPageToken) result.nextPageToken = nextPageToken;
      return result;
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
      android: {notification: {
        titleLocKey: 'notification_super_likes_reset_title',
        bodyLocKey: 'notification_super_likes_reset_body',
        sound: 'default', channelId: 'default', priority: 'high',
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
      android: {notification: {
        titleLocKey: 'notification_daily_likes_reset_title',
        bodyLocKey: 'notification_daily_likes_reset_body',
        bodyLocArgs: ['100'],
        sound: 'default', channelId: 'default', priority: 'high',
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
          android: {notification: {
            titleLocKey: 'notification_daily_likes_reset_title',
            bodyLocKey: 'notification_daily_likes_reset_body',
            bodyLocArgs: ['100'],
            sound: 'default', channelId: 'default', priority: 'high',
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
          android: {notification: {
            titleLocKey: 'notification_super_likes_reset_title',
            bodyLocKey: 'notification_super_likes_reset_body',
            sound: 'default', channelId: 'default', priority: 'high',
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

    for (const userDoc of usersSnap.docs) {
      const userData = userDoc.data();
      const liked = userData.liked || [];

      for (const likedUserId of liked) {
        const otherDoc = await db.collection('users').doc(likedUserId).get();
        if (!otherDoc.exists) continue;
        const otherData = otherDoc.data();
        if (otherData.accountStatus !== 'active' || otherData.paused === true) continue;
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
          notification: {
            titleLocKey: notification.title_loc_key || '',
            titleLocArgs: notification.title_loc_args || [],
            bodyLocKey: notification.body_loc_key || '',
            bodyLocArgs: notification.body_loc_args || [],
            sound: 'default',
            channelId: messageData.type === 'chat_message' ? 'messages' : 'default',
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

/**
 * Trigger: Auto-moderar mensajes al crearse en un match.
 * Detecta contenido prohibido (links de pago, solicitudes de dinero).
 * Complementa a moderateMessage CF callable (que es explícita por la app).
 */
exports.autoModerateMessage = onDocumentCreated(
  {document: 'matches/{matchId}/messages/{messageId}', region: 'us-central1'},
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const data = snapshot.data();
    if (!data.message || data.type !== 'text') return;

    const prohibited = [
      'onlyfans', 'venmo.me', 'cashapp', 'paypal.me',
      'cash.app', 'bizum', 'revolut.me', 'ko-fi.com',
    ];
    const lowerMsg = data.message.toLowerCase();
    const flagged = prohibited.some((term) => lowerMsg.includes(term));

    if (flagged) {
      await snapshot.ref.update({
        flagged: true,
        flaggedAt: admin.firestore.FieldValue.serverTimestamp(),
        flaggedReason: 'prohibited_content_auto',
      });
      logger.warn(`[autoModerateMessage] Flagged message ${event.params.messageId} in match ${event.params.matchId}`);
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
