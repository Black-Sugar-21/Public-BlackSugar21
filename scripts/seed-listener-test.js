#!/usr/bin/env node
/**
 * seed-listener-test.js
 * ─────────────────────
 * Crea un ciclo de pruebas con matches y chats para un usuario,
 * diseñado para verificar que los listeners de match list funcionen
 * correctamente (real-time updates, auto-retry, foreground restart, etc.)
 *
 * Uso:
 *   node scripts/seed-listener-test.js                                    # Default: Daniel
 *   node scripts/seed-listener-test.js --uid=XXXX --name=Nombre           # Usuario específico
 *   node scripts/seed-listener-test.js --delete                           # Solo eliminar datos
 *   node scripts/seed-listener-test.js --clean                            # Eliminar y recrear
 *   node scripts/seed-listener-test.js --add-message                      # Agregar mensaje real-time
 *   node scripts/seed-listener-test.js --uid=XXXX --name=Nombre --clean   # Limpiar y recrear para usuario
 *
 * Escenarios de test:
 *   Match 1: Conversación activa con mensajes recientes (test real-time updates)
 *   Match 2: Conversación con mensajes no leídos (test unread badge)
 *   Match 3: Match nuevo sin mensajes (test new match)
 *   Match 4: Conversación larga (test scroll + history)
 *   Match 5: Match con último mensaje del otro usuario (test notification context)
 */

'use strict';

const admin    = require('firebase-admin');
const https    = require('https');
const crypto   = require('crypto');
const { geohashForLocation } = require('geofire-common');

let sharp;
try {
  sharp = require('sharp');
} catch (_) {
  console.log('⚠️  sharp no disponible — se usarán fotos sin redimensionar');
  sharp = null;
}

// ─── INIT FIREBASE ───────────────────────────────────────────────────────────

const sa = require('./serviceAccountKey.json');
admin.initializeApp({
  credential:  admin.credential.cert(sa),
  storageBucket: 'black-sugar21.firebasestorage.app',
});

const db          = admin.firestore();
const auth        = admin.auth();
const bucket      = admin.storage().bucket();
const FieldValue  = admin.firestore.FieldValue;

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

// Parse CLI args for --uid=XXX and --name=YYY
const argv = process.argv.slice(2);
function getArg(name) {
  const arg = argv.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.split('=').slice(1).join('=') : null;
}

const TARGET_UID  = getArg('uid')  || '5WfIqnJGBfa4Per0kr3Cz7FVh343';
const TARGET_NAME = getArg('name') || 'Daniel';

const BASE_LAT = -33.4489;   // Santiago, Chile
const BASE_LON = -70.6693;

// Prefijo para identificar datos de este script específico
// Incluye UID truncado para separar datos por usuario target
const TEST_TAG = `listenerTest_${TARGET_UID.substring(0, 8)}`;

// ─── MATCH PROFILES (5 perfiles femeninos) ───────────────────────────────────

const MATCH_PROFILES = [
  {
    name: 'Alejandra',
    age: 27,
    userType: 'SUGAR_BABY',
    bio: 'Amante del arte y la buena música 🎨🎵',
    interests: ['art', 'music', 'travel', 'wine'],
  },
  {
    name: 'Camila',
    age: 24,
    userType: 'SUGAR_BABY',
    bio: 'Exploradora nata, siempre buscando nuevas aventuras ✈️',
    interests: ['travel', 'photography', 'fitness', 'cooking'],
  },
  {
    name: 'Valentina',
    age: 30,
    userType: 'SUGAR_MOMMY',
    bio: 'Empresaria y amante de la vida elegante 💎',
    interests: ['business', 'fashion', 'wine', 'yoga'],
  },
  {
    name: 'Isabella',
    age: 25,
    userType: 'SUGAR_BABY',
    bio: 'Bailarina profesional, amo la danza y el fitness 💃',
    interests: ['dance', 'fitness', 'music', 'travel'],
  },
  {
    name: 'Sofía',
    age: 28,
    userType: 'SUGAR_BABY',
    bio: 'Diseñadora gráfica y foodie 🍣',
    interests: ['design', 'food', 'photography', 'art'],
  },
];

// ─── CONVERSACIONES ──────────────────────────────────────────────────────────

// Match 1: Conversación activa con mensajes recientes
const CONVERSATION_ACTIVE = [
  { from: 'match', text: 'Hola Daniel! Vi tu perfil y me pareció muy interesante 😊' },
  { from: 'target', text: 'Hola Alejandra! Gracias, el tuyo también. Me encanta que te guste el arte' },
  { from: 'match', text: 'Sí! Estuve en una exposición increíble el fin de semana' },
  { from: 'target', text: 'Me encantaría que me cuentes más. ¿Qué tipo de arte te gusta?' },
  { from: 'match', text: 'Me fascina el impresionismo, especialmente Monet' },
  { from: 'target', text: '¿Has ido al Museo de Bellas Artes? Tienen una colección hermosa' },
  { from: 'match', text: 'Sí! Es mi lugar favorito en Santiago 🎨' },
];

// Match 2: Conversación con mensajes NO leídos por Daniel
const CONVERSATION_UNREAD = [
  { from: 'target', text: 'Hola Camila! ¿Cómo estás?' },
  { from: 'match', text: 'Hola! Todo bien, acabo de volver de un viaje increíble' },
  { from: 'target', text: 'Qué genial! A dónde fuiste?' },
  { from: 'match', text: 'A la Patagonia, fue una experiencia única! Te muestro fotos cuando quieras' },
  { from: 'match', text: '¿Tú has viajado últimamente? 🌎' },  // <- no leído por Daniel
];

// Match 3: Sin mensajes (match nuevo)
// No conversation needed

// Match 4: Conversación larga
const CONVERSATION_LONG = [
  { from: 'match', text: 'Hola Daniel! Mucho gusto' },
  { from: 'target', text: 'Hola Isabella! El gusto es mío 😊' },
  { from: 'match', text: 'Vi que te gusta la música, ¿qué escuchas?' },
  { from: 'target', text: 'De todo un poco, pero me encanta el jazz y la bossa nova' },
  { from: 'match', text: 'Qué buen gusto! A mí me encanta bailar salsa' },
  { from: 'target', text: 'Nunca he probado la salsa pero me gustaría aprender' },
  { from: 'match', text: 'Te puedo enseñar! Es muy divertido 💃' },
  { from: 'target', text: 'Me parece genial, ¿dónde practicas?' },
  { from: 'match', text: 'Hay una academia en Providencia que tiene clases para principiantes' },
  { from: 'target', text: 'Perfecto, me anoto' },
  { from: 'match', text: 'Genial! Los martes y jueves a las 7pm' },
  { from: 'target', text: '¿Este martes te parece?' },
];

// Match 5: Último mensaje del match (para test de notificación)
const CONVERSATION_LAST_FROM_MATCH = [
  { from: 'target', text: 'Hola Sofía! Me encantó tu perfil' },
  { from: 'match', text: 'Gracias Daniel! El tuyo también me pareció genial' },
  { from: 'target', text: '¿Qué tipo de diseño haces?' },
  { from: 'match', text: 'Principalmente branding y UI/UX para startups 🎨' },
  { from: 'match', text: 'Oye, ¿te gustaría ir a tomar un café esta semana?' },
];

const CONVERSATIONS = [
  CONVERSATION_ACTIVE,
  CONVERSATION_UNREAD,
  null,  // Match 3: sin mensajes
  CONVERSATION_LONG,
  CONVERSATION_LAST_FROM_MATCH,
];

// ─── LOGGING ─────────────────────────────────────────────────────────────────

const COLORS = {
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m',
  magenta: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m', bold: '\x1b[1m',
  reset: '\x1b[0m',
};
const log  = (msg, c = 'reset') => console.log(`${COLORS[c] || ''}${msg}${COLORS.reset}`);
const ok   = (msg) => log(`  ✅ ${msg}`, 'green');
const err  = (msg) => log(`  ❌ ${msg}`, 'red');
const info = (msg) => log(`  ℹ️  ${msg}`, 'gray');
const warn = (msg) => log(`  ⚠️  ${msg}`, 'yellow');
const sep  = () => log('  ' + '─'.repeat(60), 'gray');

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function nearbyGeo(baseLat, baseLon, radiusKm) {
  const r         = radiusKm / 111.32;
  const angle     = Math.random() * 2 * Math.PI;
  const dist      = Math.random() * r;
  const lat       = baseLat + dist * Math.cos(angle);
  const lon       = baseLon + dist * Math.sin(angle) / Math.cos(baseLat * Math.PI / 180);
  const geohash   = geohashForLocation([lat, lon]);
  return { lat, lon, geohash };
}

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const get = (u) => {
      https.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location);
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    };
    get(url);
  });
}

async function uploadPictureWithThumb(userId, imageBuffer) {
  const uuid      = crypto.randomUUID();
  const fileName  = `${uuid}.jpg`;
  const thumbName = `${uuid}_thumb.jpg`;
  const basePath  = `users/${userId}`;

  let fullBuffer, thumbBuffer;

  if (sharp) {
    fullBuffer = await sharp(imageBuffer)
      .resize(1920, null, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();

    thumbBuffer = await sharp(imageBuffer)
      .resize(400, 400, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 75 })
      .toBuffer();
  } else {
    fullBuffer = imageBuffer;
    thumbBuffer = imageBuffer;
  }

  await Promise.all([
    bucket.file(`${basePath}/${fileName}`).save(fullBuffer, {
      metadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000' },
    }),
    bucket.file(`${basePath}/${thumbName}`).save(thumbBuffer, {
      metadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000' },
    }),
  ]);

  return fileName;
}

function buildUserDoc({ name, birthDate, bio, male, orientation, userType, pictures, lat, lon, geohash, interests = [] }) {
  const now        = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return {
    name,
    birthDate:   admin.firestore.Timestamp.fromDate(birthDate),
    bio:         bio || null,
    male,
    orientation,
    userType,
    interests,
    pictures,
    minAge:       18,
    maxAge:       99,
    maxDistance:  200,
    latitude:     lat,
    longitude:    lon,
    g:            geohash,
    geohash,
    accountStatus:     'active',
    paused:            false,
    blocked:           [],
    visibilityReduced: false,
    liked:               [],
    passed:              [],
    dailyLikesRemaining: 100,
    dailyLikesLimit:     100,
    lastLikeResetDate:   admin.firestore.Timestamp.fromDate(todayStart),
    superLiked:              [],
    superLikesRemaining:     5,
    superLikesUsedToday:     0,
    lastSuperLikeResetDate:  admin.firestore.Timestamp.fromDate(todayStart),
    isTest:      true,
    testTag:     TEST_TAG,     // Tag específico para este script
    createdAt:   FieldValue.serverTimestamp(),
  };
}

// ─── CLEANUP ─────────────────────────────────────────────────────────────────

async function deleteTestData() {
  log('\n🗑️  Eliminando datos de listener test...', 'magenta');
  sep();

  // Buscar perfiles con testTag = listenerTest
  const testProfiles = await db.collection('users')
    .where('testTag', '==', TEST_TAG)
    .get();

  const idsToDelete = new Set();
  testProfiles.forEach((d) => idsToDelete.add(d.id));

  if (idsToDelete.size === 0) {
    info('No hay datos de listener test para limpiar.');

    // Aún así buscar matches con isTest=true donde Daniel participa
    const matchSnap = await db.collection('matches')
      .where('usersMatched', 'array-contains', TARGET_UID)
      .get();
    let matchesDeleted = 0;
    for (const mDoc of matchSnap.docs) {
      if (mDoc.data().testTag === TEST_TAG) {
        const msgs = await mDoc.ref.collection('messages').get();
        const batch = db.batch();
        msgs.forEach((m) => batch.delete(m.ref));
        batch.delete(mDoc.ref);
        await batch.commit();
        matchesDeleted++;
      }
    }
    if (matchesDeleted > 0) ok(`${matchesDeleted} matches huérfanos eliminados`);
    return;
  }

  log(`  📦 ${idsToDelete.size} perfiles a eliminar...`, 'yellow');
  let deleted = 0;

  for (const userId of idsToDelete) {
    try {
      // Auth
      try { await auth.deleteUser(userId); } catch (_) {}

      const batch = db.batch();

      // Matches que involucran este usuario
      const matchSnap = await db.collection('matches')
        .where('usersMatched', 'array-contains', userId).get();
      for (const mDoc of matchSnap.docs) {
        const msgs = await mDoc.ref.collection('messages').get();
        msgs.forEach((m) => batch.delete(m.ref));
        batch.delete(mDoc.ref);
      }

      // Subcollecciones del usuario
      for (const sub of ['swipes', 'liked', 'superLiked']) {
        const subSnap = await db.collection('users').doc(userId).collection(sub).get();
        subSnap.forEach((d) => batch.delete(d.ref));
      }

      // Limpiar liked array de Daniel (remover este userId)
      try {
        await db.collection('users').doc(TARGET_UID).update({
          liked: FieldValue.arrayRemove(userId),
        });
      } catch (_) {}

      // Eliminar subcollección liked de Daniel para este userId
      try {
        await db.collection('users').doc(TARGET_UID)
          .collection('liked').doc(userId).delete();
      } catch (_) {}

      batch.delete(db.collection('users').doc(userId));
      await batch.commit();

      // Storage
      try {
        await bucket.deleteFiles({ prefix: `users/${userId}/` });
      } catch (_) {}

      deleted++;
      log(`  🗑️  ${userId}`, 'gray');
    } catch (e) {
      err(`${userId}: ${e.message}`);
    }
  }

  ok(`${deleted}/${idsToDelete.size} perfiles eliminados`);
}

// ─── CREATE MATCHES ──────────────────────────────────────────────────────────

async function createMatchesWithChat() {
  log('\n💬 Creando MATCHES con conversaciones para Daniel...', 'cyan');
  sep();
  info(`${MATCH_PROFILES.length} matches — escenarios variados para test de listeners`);

  // Leer datos de Daniel
  const danielSnap = await db.collection('users').doc(TARGET_UID).get();
  if (!danielSnap.exists) {
    err('Daniel no existe en Firestore! Verifica el UID.');
    process.exit(1);
  }
  const danielData = danielSnap.data();
  const danielUserType = danielData.userType || 'SUGAR_DADDY';
  ok(`Daniel encontrado: ${danielData.name} (${danielUserType})`);

  const createdMatchIds = [];
  let created = 0;

  for (let i = 0; i < MATCH_PROFILES.length; i++) {
    const p = MATCH_PROFILES[i];
    const conversation = CONVERSATIONS[i];
    const email = `listener_test_${Date.now()}_${i}@bstest.dev`;
    const birthDate = new Date(new Date().getFullYear() - p.age, 3 + i, 10 + i);

    try {
      log(`\n  [${i + 1}/${MATCH_PROFILES.length}] ${p.name} (${p.userType})...`, 'cyan');

      // 1. Crear usuario Auth
      const rec = await auth.createUser({
        email,
        password: 'ListenerTest2026!',
        displayName: p.name,
      });
      const userId = rec.uid;

      // 2. Subir fotos (2 por perfil)
      const pictures = [];
      for (let j = 0; j < 2; j++) {
        const idx = (i * 11 + j * 5 + 20) % 99;
        const url = `https://randomuser.me/api/portraits/women/${idx}.jpg`;
        try {
          const buf = await downloadImage(url);
          const fn  = await uploadPictureWithThumb(userId, buf);
          pictures.push(fn);
          process.stdout.write(' 📷');
        } catch (e) {
          warn(`foto ${j + 1}: ${e.message}`);
        }
      }
      console.log();

      // 3. Crear perfil Firestore
      const { lat, lon, geohash } = nearbyGeo(BASE_LAT, BASE_LON, 10);
      const doc = buildUserDoc({
        name: p.name,
        birthDate,
        bio: p.bio,
        male: false,
        orientation: 'men',
        userType: p.userType,
        pictures,
        lat, lon, geohash,
        interests: p.interests,
      });

      // Likes mutuos (bidireccional)
      doc.liked = [TARGET_UID];
      await db.collection('users').doc(userId).set(doc);

      // Subcollección liked bidireccional
      await db.collection('users').doc(userId)
        .collection('liked').doc(TARGET_UID)
        .set({ exists: true, superLike: false });

      await db.collection('users').doc(TARGET_UID).update({
        liked: FieldValue.arrayUnion(userId),
      });
      await db.collection('users').doc(TARGET_UID)
        .collection('liked').doc(userId)
        .set({ exists: true, superLike: false });

      // 4. Crear match document
      const matchId = [TARGET_UID, userId].sort().join('');
      const now = admin.firestore.Timestamp.now();

      const matchDoc = {
        users:               [TARGET_UID, userId],
        usersMatched:        [TARGET_UID, userId],
        timestamp:           now,
        lastMessageTimestamp: now,
        messageCount:        conversation ? conversation.length : 0,
        userTypesAtMatch: {
          [TARGET_UID]: danielUserType,
          [userId]: p.userType,
        },
        isTest:  true,
        testTag: TEST_TAG,
      };

      // Determinar último mensaje y estado de lectura por escenario
      if (conversation && conversation.length > 0) {
        const lastMsg = conversation[conversation.length - 1];
        matchDoc.lastMessage = lastMsg.text;
        matchDoc.lastMessageSenderId = lastMsg.from === 'target' ? TARGET_UID : userId;

        // Escenario de lectura:
        if (i === 1) {
          // Match 2 (Camila): Daniel NO ha leído los últimos mensajes
          // lastSeenTimestamp de Daniel más antiguo que el último mensaje
          const oldTimestamp = admin.firestore.Timestamp.fromDate(
            new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 horas atrás
          );
          matchDoc.lastSeenTimestamps = {
            [TARGET_UID]: oldTimestamp,
            [userId]: now,
          };
          info('  → Escenario: mensajes NO leídos por Daniel');
        } else {
          // Todos leídos
          matchDoc.lastSeenTimestamps = {
            [TARGET_UID]: now,
            [userId]: now,
          };
        }
      } else {
        // Match 3 (Valentina): match nuevo sin mensajes
        matchDoc.lastMessage = '';
        matchDoc.lastMessageSenderId = '';
        matchDoc.lastSeenTimestamps = {
          [TARGET_UID]: now,
          [userId]: now,
        };
        info('  → Escenario: match NUEVO sin mensajes');
      }

      await db.collection('matches').doc(matchId).set(matchDoc);
      createdMatchIds.push(matchId);

      // 5. Crear mensajes del chat
      if (conversation && conversation.length > 0) {
        const msgRef = db.collection('matches').doc(matchId).collection('messages');

        // Mensajes espaciados en el tiempo para simular conversación real
        const baseTime = Date.now();
        for (let m = 0; m < conversation.length; m++) {
          const msg = conversation[m];
          const senderId = msg.from === 'target' ? TARGET_UID : userId;

          // Espaciar mensajes: primeros más antiguos, últimos más recientes
          let msgTime;
          if (i === 0) {
            // Match 1 (Alejandra): mensajes recientes (últimos 30 min)
            msgTime = new Date(baseTime - (conversation.length - m) * 3 * 60_000);
          } else if (i === 1) {
            // Match 2 (Camila): últimos mensajes hace ~1 hora (no leídos)
            msgTime = new Date(baseTime - (conversation.length - m) * 15 * 60_000);
          } else if (i === 3) {
            // Match 4 (Isabella): conversación larga a lo largo de horas
            msgTime = new Date(baseTime - (conversation.length - m) * 30 * 60_000);
          } else {
            // Match 5 (Sofía): mensajes espaciados normalmente
            msgTime = new Date(baseTime - (conversation.length - m) * 10 * 60_000);
          }

          await msgRef.add({
            message:     msg.text,
            senderId,
            timestamp:   admin.firestore.Timestamp.fromDate(msgTime),
            type:        'text',
            isEphemeral: false,
          });
        }
        info(`  → ${conversation.length} mensajes creados`);
      }

      created++;
      ok(`${p.name} → match ${matchId.substring(0, 16)}... (${pictures.length} fotos)`);
    } catch (e) {
      err(`${p.name}: ${e.message}`);
    }
  }

  sep();
  log(`\n  📊 Matches: ${created}/${MATCH_PROFILES.length} creados`, 'green');
  return createdMatchIds;
}

// ─── ADD MESSAGE (para test real-time) ───────────────────────────────────────

async function addMessageToRandomMatch() {
  log('\n📨 Agregando mensaje a un match existente (test real-time)...', 'cyan');
  sep();

  // Buscar matches de Daniel con testTag
  const matchSnap = await db.collection('matches')
    .where('usersMatched', 'array-contains', TARGET_UID)
    .get();

  const testMatches = [];
  for (const mDoc of matchSnap.docs) {
    const data = mDoc.data();
    if (data.testTag === TEST_TAG && data.messageCount > 0) {
      testMatches.push({ id: mDoc.id, data });
    }
  }

  if (testMatches.length === 0) {
    err('No hay matches de test con mensajes. Ejecuta primero sin --add-message');
    process.exit(1);
  }

  // Elegir un match aleatorio
  const match = testMatches[Math.floor(Math.random() * testMatches.length)];
  const otherUserId = match.data.usersMatched.find(uid => uid !== TARGET_UID);

  // Obtener nombre del otro usuario
  const otherSnap = await db.collection('users').doc(otherUserId).get();
  const otherName = otherSnap.exists ? otherSnap.data().name : 'Desconocida';

  const testMessages = [
    '¡Hola! ¿Cómo va tu día? 😊',
    '¿Tienes planes para el fin de semana?',
    'Estaba pensando en ti 💭',
    '¿Viste la foto que subí? 📸',
    'Extraño nuestras conversaciones...',
    '¿Te gustaría salir a cenar? 🍷',
    '¡Buenos días! ☀️',
    'Jajaja, me encanta tu sentido del humor 😂',
  ];

  const randomMsg = testMessages[Math.floor(Math.random() * testMessages.length)];
  const now = admin.firestore.Timestamp.now();

  // Crear mensaje como si lo enviara el otro usuario (para trigger de listener)
  await db.collection('matches').doc(match.id).collection('messages').add({
    message: randomMsg,
    senderId: otherUserId,
    timestamp: now,
    type: 'text',
    isEphemeral: false,
  });

  // Actualizar el match document (esto dispara el listener)
  await db.collection('matches').doc(match.id).update({
    lastMessage: randomMsg,
    lastMessageSenderId: otherUserId,
    lastMessageTimestamp: now,
    messageCount: FieldValue.increment(1),
  });

  ok(`Mensaje agregado en match con ${otherName}`);
  info(`Match ID: ${match.id}`);
  info(`Mensaje: "${randomMsg}"`);
  info(`Enviado por: ${otherName} (${otherUserId.substring(0, 16)}...)`);
  sep();
  log('\n  📱 Abre la app iOS → Match List para ver el update en tiempo real', 'yellow');
}

// ─── VERIFY ──────────────────────────────────────────────────────────────────

async function verifyTestSetup() {
  log('\n🔍 Verificando setup de test...', 'cyan');
  sep();

  // 1. Daniel
  const danielSnap = await db.collection('users').doc(TARGET_UID).get();
  if (danielSnap.exists) {
    const d = danielSnap.data();
    ok(`Daniel: ${d.name}, ${d.pictures?.length || 0} fotos, userType: ${d.userType}`);
  } else {
    err('Daniel NO existe en Firestore');
  }

  // 2. Test profiles
  const testProfiles = await db.collection('users')
    .where('testTag', '==', TEST_TAG)
    .get();
  ok(`Perfiles de test: ${testProfiles.size}`);

  // 3. Matches
  const matches = await db.collection('matches')
    .where('usersMatched', 'array-contains', TARGET_UID)
    .get();

  let testMatchCount = 0;
  let totalMessages = 0;
  let unreadMatches = 0;

  for (const m of matches.docs) {
    const data = m.data();
    if (data.testTag !== TEST_TAG) continue;
    testMatchCount++;

    const msgs = await m.ref.collection('messages').get();
    totalMessages += msgs.size;

    // Check unread
    const danielLastSeen = data.lastSeenTimestamps?.[TARGET_UID];
    const lastMsgTs = data.lastMessageTimestamp;
    if (danielLastSeen && lastMsgTs && lastMsgTs.toMillis() > danielLastSeen.toMillis()) {
      unreadMatches++;
    }
  }

  ok(`Matches de test: ${testMatchCount}`);
  ok(`Mensajes totales: ${totalMessages}`);
  ok(`Matches con no leídos: ${unreadMatches}`);

  sep();
  log('\n📋 RESUMEN DEL CICLO DE PRUEBA:', 'bold');
  log(`  Usuario:     ${TARGET_NAME} (${TARGET_UID.substring(0, 16)}...)`, 'green');
  log(`  Matches:     ${testMatchCount}`, 'green');
  log(`  Mensajes:    ${totalMessages}`, 'green');
  log(`  No leídos:   ${unreadMatches}`, 'green');
  sep();
  log('\n  🧪 Escenarios de test:', 'yellow');
  log('  1. Alejandra — Conversación activa reciente (real-time updates)', 'yellow');
  log('  2. Camila    — Mensajes NO leídos (badge unread)', 'yellow');
  log('  3. Valentina — Match nuevo sin mensajes (empty state)', 'yellow');
  log('  4. Isabella  — Conversación larga (scroll history)', 'yellow');
  log('  5. Sofía     — Último mensaje del match (notification context)', 'yellow');
  sep();
  log('\n  📱 Para test real-time, ejecuta:', 'cyan');
  log('     node scripts/seed-listener-test.js --add-message', 'cyan');
  log('     (Agrega un mensaje aleatorio — verifica que el listener lo detecte)', 'cyan');
  sep();
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const doDelete     = argv.includes('--delete');
  const doClean      = argv.includes('--clean');
  const doAddMessage = argv.includes('--add-message');

  log('\n' + '═'.repeat(72), 'magenta');
  log('🧪  SEED LISTENER TEST — BlackSugar21', 'bold');
  log(`    Usuario: ${TARGET_NAME} (${TARGET_UID})`, 'gray');
  log('═'.repeat(72), 'magenta');

  if (doAddMessage) {
    await addMessageToRandomMatch();
    process.exit(0);
  }

  if (doDelete) {
    await deleteTestData();
    log('\n✅ Datos de test eliminados.\n', 'green');
    process.exit(0);
  }

  if (doClean) {
    await deleteTestData();
  }

  // 1. Crear matches con chat
  await createMatchesWithChat();

  // 2. Verificar setup
  await verifyTestSetup();

  log('\n✅ Ciclo de prueba creado exitosamente.\n', 'green');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Fatal:', e);
  process.exit(1);
});
