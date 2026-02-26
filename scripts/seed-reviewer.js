#!/usr/bin/env node
/**
 * 🍏🤖 SEED REVIEWER ACCOUNT — BlackSugar21
 * =============================================
 * Crea una cuenta de reviewer para Apple App Review y Google Play Review.
 *
 * Teléfono: +1 650-555-0123 (US, rango 555-01XX reservado para ficción — imposible usuario real)
 * Código verificación: 123456 (configurado en Firebase Console > Authentication > Phone > Test)
 *
 * Crea:
 *   1. Usuario Auth con número de teléfono chileno
 *   2. Documento Firestore completo con perfil precargado
 *   3. 8 perfiles de discovery (aparecen en HomeView/swipe)
 *   4. 3 matches con mensajes de chat
 *   5. Fotos con patrón {UUID}.jpg + {UUID}_thumb.jpg (400px) en Storage
 *
 * Los perfiles de discovery están diseñados para SIEMPRE aparecer al reviewer:
 *   - No están en liked/passed/blocked del reviewer
 *   - accountStatus: "active", paused: false
 *   - Dentro del rango de edad y distancia
 *   - Orientación compatible
 *   - Ubicación cercana (Santiago de Chile)
 *
 * Uso:
 *   node scripts/seed-reviewer.js          # Crear todo
 *   node scripts/seed-reviewer.js --clean  # Limpiar y recrear
 *   node scripts/seed-reviewer.js --delete # Solo eliminar datos del reviewer
 *
 * ⚠️  REQUISITO PREVIO:
 *   Agregar +16505550123 como test phone en Firebase Console:
 *   Authentication > Sign-in method > Phone > Phone numbers for testing
 *   Número: +16505550123  |  Código: 123456
 */

'use strict';

const admin   = require('firebase-admin');
const https   = require('https');
const crypto  = require('crypto');
const sharp   = require('sharp');
const geofire = require('geofire-common');

// ─── Firebase Init ──────────────────────────────────────────────────────────
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential:    admin.credential.cert(serviceAccount),
  storageBucket: 'black-sugar21.firebasestorage.app',
});
const db         = admin.firestore();
const auth       = admin.auth();
const bucket     = admin.storage().bucket();
const FieldValue = admin.firestore.FieldValue;

// ─── Constantes ─────────────────────────────────────────────────────────────
const REVIEWER_PHONE = '+16505550123';
const REVIEWER_NAME  = 'Ricardo';
const REVIEWER_BIO   = 'Emprendedor apasionado por la tecnología y los viajes 🌎';
const REVIEWER_MALE  = true;
const REVIEWER_ORIENTATION = 'women';  // lowercase, homologado
const REVIEWER_USER_TYPE   = 'SUGAR_DADDY';
const REVIEWER_AGE   = 35;
const REVIEWER_INTERESTS = ['viajes', 'tecnología', 'gastronomía', 'música', 'deportes'];

// Santiago de Chile — coordenadas base
const BASE_LAT = -33.4489;
const BASE_LON = -70.6693;

// Perfiles de discovery (mujeres para un reviewer masculino que busca mujeres)
const DISCOVERY_PROFILES = [
  { name: 'Valentina Torres',   age: 24, userType: 'SUGAR_BABY',  bio: 'Aventurera y apasionada por los viajes ✈️',              interests: ['viajes', 'fotografía', 'yoga'] },
  { name: 'Isabella Martínez',  age: 28, userType: 'SUGAR_BABY',  bio: 'Amante del arte y la música 🎵',                         interests: ['arte', 'música', 'moda'] },
  { name: 'Camila López',       age: 22, userType: 'SUGAR_BABY',  bio: 'Estudiante de diseño, creativa y espontánea 🎨',          interests: ['diseño', 'moda', 'baile'] },
  { name: 'Sofía Rodríguez',    age: 26, userType: 'SUGAR_BABY',  bio: 'Apasionada del fitness y vida saludable 💪',              interests: ['fitness', 'nutrición', 'hiking'] },
  { name: 'Martina García',     age: 30, userType: 'SUGAR_MOMMY', bio: 'Empresaria exitosa que disfruta la buena vida 🥂',        interests: ['negocios', 'viajes', 'gastronomía'] },
  { name: 'Paula Sánchez',      age: 23, userType: 'SUGAR_BABY',  bio: 'Bailarina profesional, vivo la vida con ritmo 💃',        interests: ['baile', 'música', 'teatro'] },
  { name: 'Lucía Fernández',    age: 27, userType: 'SUGAR_BABY',  bio: 'Fotógrafa freelance, capturo momentos únicos 📸',         interests: ['fotografía', 'arte', 'naturaleza'] },
  { name: 'Emma Pérez',         age: 25, userType: 'SUGAR_BABY',  bio: 'Chef en formación, la cocina es mi pasión 🍳',            interests: ['gastronomía', 'viajes', 'deportes'] },
];

// Perfiles para matches con chat
const MATCH_PROFILES = [
  { name: 'Daniela Núñez',    age: 29, userType: 'SUGAR_BABY',  bio: 'Directora de marketing, amante del jet set ✨',   interests: ['negocios', 'moda', 'viajes'] },
  { name: 'Fernanda Vargas',  age: 21, userType: 'SUGAR_BABY',  bio: 'Universitaria curiosa y llena de energía 🌟',     interests: ['música', 'deportes', 'lectura'] },
  { name: 'Catalina Reyes',   age: 26, userType: 'SUGAR_BABY',  bio: 'Modelo y emprendedora digital 🌸',                interests: ['moda', 'fotografía', 'fitness'] },
];

// Conversaciones de ejemplo (realistas y apropiadas)
const CHAT_CONVERSATIONS = [
  [
    { from: 'match', text: '¡Hola Ricardo! Me alegra mucho que hayamos hecho match 😊' },
    { from: 'reviewer', text: '¡Hola! Igualmente, tu perfil me pareció muy interesante 💕' },
    { from: 'match', text: '¿Qué te gusta hacer en tu tiempo libre?' },
    { from: 'reviewer', text: 'Me encanta viajar y probar restaurantes nuevos. ¿Y a ti?' },
    { from: 'match', text: '¡Qué cool! Yo amo la fotografía, capturar momentos especiales 📸' },
  ],
  [
    { from: 'match', text: '¡Hey! Vi que también te gusta la tecnología 🚀' },
    { from: 'reviewer', text: '¡Sí! Soy emprendedor tech. ¿Tú en qué andas?' },
    { from: 'match', text: 'Estudio ingeniería, me fascina la innovación ✨' },
    { from: 'reviewer', text: 'Genial, deberíamos tomarnos un café y conversar de eso ☕' },
  ],
  [
    { from: 'match', text: 'Hola! Me encantó tu bio, también amo viajar 🌍' },
    { from: 'reviewer', text: '¡Gracias! ¿Cuál ha sido tu viaje favorito?' },
    { from: 'match', text: 'Tailandia, sin duda. La comida y las playas son increíbles 🏖️' },
    { from: 'reviewer', text: '¡Me encantaría ir! Yo amo Japón, la cultura es fascinante 🇯🇵' },
    { from: 'match', text: '¿Vamos juntos en el próximo viaje? 😉' },
    { from: 'reviewer', text: '¡Me parece un excelente plan! 🎉' },
  ],
];

// ─── Logging ────────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m',
};
const log  = (msg, color = 'reset') => console.log(`${c[color]}${msg}${c.reset}`);
const ok   = (msg) => log(`  ✅ ${msg}`, 'green');
const err  = (msg) => log(`  ❌ ${msg}`, 'red');
const info = (msg) => log(`  ℹ️  ${msg}`, 'cyan');
const warn = (msg) => log(`  ⚠️  ${msg}`, 'yellow');
const sep  = () => log('─'.repeat(72), 'gray');

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Genera coordenadas cercanas + geohash */
function nearbyGeo(baseLat = BASE_LAT, baseLon = BASE_LON, radiusKm = 5) {
  const R = 6371;
  const dLat = (Math.random() * 2 - 1) * (radiusKm / R) * (180 / Math.PI);
  const dLon = (Math.random() * 2 - 1) * (radiusKm / R) * (180 / Math.PI) / Math.cos(baseLat * Math.PI / 180);
  const lat = baseLat + dLat;
  const lon = baseLon + dLon;
  return { lat, lon, geohash: geofire.geohashForLocation([lat, lon]) };
}

/** Descarga imagen por HTTPS con soporte de redirect */
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const get = (u, redirects = 0) => {
      https.get(u, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
          return get(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    };
    get(url);
  });
}

/**
 * Sube imagen + thumbnail a Storage con el patrón correcto:
 *   users/{userId}/{UUID}.jpg       — full (max 1920px, ~500KB)
 *   users/{userId}/{UUID}_thumb.jpg — thumbnail (400px, 75% quality)
 *
 * Retorna solo el nombre de archivo "{UUID}.jpg" para el array pictures[]
 */
async function uploadPictureWithThumb(userId, imageBuffer) {
  const uuid      = crypto.randomUUID();
  const fileName  = `${uuid}.jpg`;
  const thumbName = `${uuid}_thumb.jpg`;
  const basePath  = `users/${userId}`;

  // Full: normalizar a JPEG, max 1920px de ancho
  const fullBuffer = await sharp(imageBuffer)
    .resize(1920, null, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();

  // Thumb: 400x400 cover crop
  const thumbBuffer = await sharp(imageBuffer)
    .resize(400, 400, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 75 })
    .toBuffer();

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

/**
 * Construye documento Firestore alineado con FirestoreUser.kt / FirestoreUser.swift
 */
function buildUserDoc({ name, birthDate, bio, male, orientation, userType, pictures, lat, lon, geohash, interests = [] }) {
  const now        = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dailyLimit = 50 + Math.floor(Math.random() * 51); // 50-100

  return {
    name,
    birthDate:   admin.firestore.Timestamp.fromDate(birthDate),
    bio:         bio || null,
    male,
    orientation,                    // "men" | "women" | "both" — SIEMPRE lowercase
    userType,                       // "SUGAR_BABY" | "SUGAR_DADDY" | "SUGAR_MOMMY"
    interests,
    pictures,                       // ["{UUID}.jpg", ...] — solo nombres, no URLs
    minAge:       18,
    maxAge:       99,
    maxDistance:  200,
    latitude:     lat,
    longitude:    lon,
    g:            geohash,          // iOS usa "g"
    geohash,                        // Android usa "geohash"
    accountStatus:     'active',
    paused:            false,
    blocked:           [],
    visibilityReduced: false,
    liked:               [],
    passed:              [],
    dailyLikesRemaining: dailyLimit,
    dailyLikesLimit:     dailyLimit,
    lastLikeResetDate:   admin.firestore.Timestamp.fromDate(todayStart),
    superLiked:              [],
    superLikesRemaining:     5,
    superLikesUsedToday:     0,
    lastSuperLikeResetDate:  admin.firestore.Timestamp.fromDate(todayStart),
    isTest:      true,
    isReviewer:  true,              // Marca especial para identificar datos del reviewer
    createdAt:   FieldValue.serverTimestamp(),
  };
}

// ─── CLEANUP ────────────────────────────────────────────────────────────────

async function deleteReviewerData() {
  log('\n🗑️  Eliminando datos del reviewer...', 'magenta');
  sep();

  // 1. Buscar usuario reviewer por teléfono
  let reviewerUid = null;
  try {
    const userRecord = await auth.getUserByPhoneNumber(REVIEWER_PHONE);
    reviewerUid = userRecord.uid;
    info(`Reviewer encontrado en Auth: ${reviewerUid}`);
  } catch (e) {
    info('Reviewer no existe en Auth (OK)');
  }

  // 2. Buscar todos los perfiles isReviewer + isTest asociados
  const [byReviewer, byTest] = await Promise.all([
    db.collection('users').where('isReviewer', '==', true).get(),
    db.collection('users').where('isTest', '==', true).get(),
  ]);

  const idsToDelete = new Set();
  byReviewer.forEach((d) => idsToDelete.add(d.id));
  byTest.forEach((d) => idsToDelete.add(d.id));
  if (reviewerUid) idsToDelete.add(reviewerUid);

  if (idsToDelete.size === 0) {
    info('No hay datos de reviewer para limpiar.');
    return;
  }

  log(`  📦 ${idsToDelete.size} perfiles a eliminar...`, 'yellow');
  let deleted = 0;

  for (const userId of idsToDelete) {
    try {
      // Auth
      try { await auth.deleteUser(userId); } catch (_) {}

      const batch = db.batch();

      // Matches
      const matchSnap = await db.collection('matches')
        .where('usersMatched', 'array-contains', userId).get();
      for (const mDoc of matchSnap.docs) {
        const msgs = await mDoc.ref.collection('messages').get();
        msgs.forEach((m) => batch.delete(m.ref));
        batch.delete(mDoc.ref);
      }

      // Subcollecciones
      for (const sub of ['swipes', 'liked', 'superLiked']) {
        const subSnap = await db.collection('users').doc(userId).collection(sub).get();
        subSnap.forEach((d) => batch.delete(d.ref));
      }

      batch.delete(db.collection('users').doc(userId));
      await batch.commit();

      // Storage
      await bucket.deleteFiles({ prefix: `users/${userId}/` });

      deleted++;
      log(`  🗑️  ${userId}`, 'gray');
    } catch (e) {
      err(`${userId}: ${e.message}`);
    }
  }

  ok(`${deleted}/${idsToDelete.size} perfiles eliminados`);
}

// ─── CREATE REVIEWER ────────────────────────────────────────────────────────

async function createReviewerAccount() {
  log('\n👤 Creando cuenta del REVIEWER...', 'cyan');
  sep();

  // 1. Crear usuario Auth con número de teléfono
  let reviewerUid;
  try {
    // Intentar obtener existente
    const existing = await auth.getUserByPhoneNumber(REVIEWER_PHONE);
    reviewerUid = existing.uid;
    info(`Reviewer ya existe en Auth: ${reviewerUid}`);
  } catch (_) {
    // Crear nuevo
    const userRecord = await auth.createUser({
      phoneNumber:  REVIEWER_PHONE,
      displayName:  REVIEWER_NAME,
      disabled:     false,
    });
    reviewerUid = userRecord.uid;
    ok(`Reviewer creado en Auth: ${reviewerUid}`);
  }

  // 2. Subir fotos del reviewer (3 fotos de hombre profesional)
  info('Subiendo fotos del reviewer...');
  const reviewerPictures = [];
  const photoIndices = [32, 55, 78]; // Índices para randomuser.me/portraits/men/
  for (let i = 0; i < photoIndices.length; i++) {
    try {
      const url = `https://randomuser.me/api/portraits/men/${photoIndices[i]}.jpg`;
      const buf = await downloadImage(url);
      const fn  = await uploadPictureWithThumb(reviewerUid, buf);
      reviewerPictures.push(fn);
      process.stdout.write(` 📷`);
    } catch (e) {
      err(`Foto reviewer ${i + 1}: ${e.message}`);
    }
  }
  console.log();

  // 3. Crear documento Firestore
  const birthDate = new Date(new Date().getFullYear() - REVIEWER_AGE, 3, 15);
  const { lat, lon, geohash } = nearbyGeo(BASE_LAT, BASE_LON, 1);

  const reviewerDoc = buildUserDoc({
    name:        REVIEWER_NAME,
    birthDate,
    bio:         REVIEWER_BIO,
    male:        REVIEWER_MALE,
    orientation: REVIEWER_ORIENTATION,
    userType:    REVIEWER_USER_TYPE,
    pictures:    reviewerPictures,
    lat, lon, geohash,
    interests:   REVIEWER_INTERESTS,
  });

  // Agregar campos extra del reviewer
  reviewerDoc.timezone       = 'America/Santiago';
  reviewerDoc.timezoneOffset = -3;
  reviewerDoc.deviceLanguage = 'es';

  await db.collection('users').doc(reviewerUid).set(reviewerDoc);

  ok(`Perfil Firestore creado: ${REVIEWER_NAME} (${reviewerPictures.length} fotos + thumbs)`);
  info(`UID: ${reviewerUid}`);
  info(`Teléfono: ${REVIEWER_PHONE}`);

  return reviewerUid;
}

// ─── CREATE DISCOVERY PROFILES ──────────────────────────────────────────────

async function createDiscoveryProfiles(reviewerUid) {
  log('\n🎯 Creando perfiles de DISCOVERY (HomeView/Swipe)...', 'cyan');
  sep();
  info(`${DISCOVERY_PROFILES.length} perfiles — aparecerán al reviewer al hacer swipe`);

  let created = 0;

  for (let i = 0; i < DISCOVERY_PROFILES.length; i++) {
    const p = DISCOVERY_PROFILES[i];
    const email = `reviewer_disc_${Date.now()}_${i}@bstest.dev`;
    const birthDate = new Date(new Date().getFullYear() - p.age, 5 + i, 10 + i);

    try {
      log(`  [${i + 1}/${DISCOVERY_PROFILES.length}] ${p.name} (${p.userType}, ${p.age}a)...`, 'cyan');

      const rec    = await auth.createUser({ email, password: 'ReviewSeed2026!', displayName: p.name });
      const userId = rec.uid;

      // 3 fotos por perfil con thumbs
      const pictures = [];
      for (let j = 0; j < 3; j++) {
        const idx = (i * 7 + j * 3 + 1) % 99;
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

      const { lat, lon, geohash } = nearbyGeo(BASE_LAT, BASE_LON, 5);

      const doc = buildUserDoc({
        name:        p.name,
        birthDate,
        bio:         p.bio,
        male:        false,           // mujeres
        orientation: 'men',           // buscan hombres → compatible con reviewer
        userType:    p.userType,
        pictures,
        lat, lon, geohash,
        interests:   p.interests,
      });

      await db.collection('users').doc(userId).set(doc);

      created++;
      ok(`${p.name} → ${userId} (${pictures.length} fotos + thumbs)`);
    } catch (e) {
      err(`${p.name}: ${e.message}`);
    }
  }

  sep();
  log(`  📊 Discovery: ${created}/${DISCOVERY_PROFILES.length} creados`, 'green');
  info('Estos perfiles aparecerán siempre en HomeView del reviewer.');
}

// ─── CREATE MATCHES WITH CHAT ───────────────────────────────────────────────

async function createMatchesWithChat(reviewerUid) {
  log('\n💬 Creando MATCHES con conversaciones...', 'cyan');
  sep();
  info(`${MATCH_PROFILES.length} matches con mensajes de chat`);

  // Leer datos del reviewer para userTypesAtMatch
  const reviewerSnap = await db.collection('users').doc(reviewerUid).get();
  const reviewerData = reviewerSnap.exists ? reviewerSnap.data() : {};
  const reviewerUserType = reviewerData.userType || REVIEWER_USER_TYPE;

  let created = 0;

  for (let i = 0; i < MATCH_PROFILES.length; i++) {
    const p = MATCH_PROFILES[i];
    const email = `reviewer_chat_${Date.now()}_${i}@bstest.dev`;
    const birthDate = new Date(new Date().getFullYear() - p.age, 8 + i, 20 + i);

    try {
      log(`  [${i + 1}/${MATCH_PROFILES.length}] ${p.name} (${p.userType})...`, 'cyan');

      const rec    = await auth.createUser({ email, password: 'ReviewSeed2026!', displayName: p.name });
      const userId = rec.uid;

      // 2-3 fotos con thumbs
      const numPhotos = 2 + (i % 2);
      const pictures  = [];
      for (let j = 0; j < numPhotos; j++) {
        const idx = (i * 13 + j * 7 + 40) % 99;
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

      const { lat, lon, geohash } = nearbyGeo(BASE_LAT, BASE_LON, 8);

      const doc = buildUserDoc({
        name:        p.name,
        birthDate,
        bio:         p.bio,
        male:        false,
        orientation: 'men',
        userType:    p.userType,
        pictures,
        lat, lon, geohash,
        interests:   p.interests,
      });

      // Likes mutuos
      doc.liked = [reviewerUid];
      await db.collection('users').doc(userId).set(doc);

      // Subcollección liked bidireccional
      await db.collection('users').doc(userId)
        .collection('liked').doc(reviewerUid)
        .set({ exists: true, superLike: false });

      await db.collection('users').doc(reviewerUid).update({
        liked: FieldValue.arrayUnion(userId),
      });
      await db.collection('users').doc(reviewerUid)
        .collection('liked').doc(userId)
        .set({ exists: true, superLike: false });

      // Match document — estructura exacta FirestoreMatch.toData()
      const matchId = [reviewerUid, userId].sort().join('');
      const now     = admin.firestore.Timestamp.now();

      const conversation = CHAT_CONVERSATIONS[i % CHAT_CONVERSATIONS.length];

      await db.collection('matches').doc(matchId).set({
        users:               [reviewerUid, userId],
        usersMatched:        [reviewerUid, userId],
        timestamp:           now,
        lastMessageTimestamp: now,
        lastMessage:         conversation[conversation.length - 1].text,
        lastMessageSenderId: conversation[conversation.length - 1].from === 'reviewer' ? reviewerUid : userId,
        messageCount:        conversation.length,
        lastSeenTimestamps:  {
          [reviewerUid]: now,
          [userId]:      now,
        },
        userTypesAtMatch: {
          [reviewerUid]: reviewerUserType,
          [userId]:      p.userType,
        },
        isTest: true,
      });

      // Mensajes — estructura exacta FirestoreMessageProperties.toData()
      const msgRef = db.collection('matches').doc(matchId).collection('messages');
      for (let m = 0; m < conversation.length; m++) {
        const msg      = conversation[m];
        const senderId = msg.from === 'reviewer' ? reviewerUid : userId;
        const msgTs    = new Date(Date.now() - (conversation.length - m) * 120_000); // 2 min entre msj

        await msgRef.add({
          message:     msg.text,            // ← campo "message" (NO "text")
          senderId,
          timestamp:   admin.firestore.Timestamp.fromDate(msgTs),
          type:        'text',
          isEphemeral: false,
        });
      }

      created++;
      ok(`${p.name} → match ${matchId} (${pictures.length} fotos, ${conversation.length} mensajes)`);
    } catch (e) {
      err(`${p.name}: ${e.message}`);
    }
  }

  sep();
  log(`  📊 Matches: ${created}/${MATCH_PROFILES.length} creados`, 'green');
  info('Aparecen en la lista de Matches con mensajes precargados.');
}

// ─── VERIFY ─────────────────────────────────────────────────────────────────

async function verifyReviewerSetup(reviewerUid) {
  log('\n🔍 Verificando setup del reviewer...', 'cyan');
  sep();

  // 1. Auth
  try {
    const user = await auth.getUser(reviewerUid);
    ok(`Auth: ${user.displayName} (${user.phoneNumber})`);
  } catch (e) {
    err(`Auth: ${e.message}`);
  }

  // 2. Firestore doc
  const snap = await db.collection('users').doc(reviewerUid).get();
  if (snap.exists) {
    const d = snap.data();
    ok(`Firestore: ${d.name}, ${d.pictures?.length || 0} fotos, orientation: ${d.orientation}`);
  } else {
    err('Firestore: documento no existe');
  }

  // 3. Discovery + match profiles (query simple sin composite index)
  const testProfiles = await db.collection('users')
    .where('isTest', '==', true)
    .get();
  let discoveryCount = 0;
  let matchProfileCount = 0;
  for (const d of testProfiles.docs) {
    if (d.id === reviewerUid) continue; // Saltar al propio reviewer
    const data = d.data();
    if (data.liked?.includes(reviewerUid)) {
      matchProfileCount++;
    } else {
      discoveryCount++;
    }
  }

  ok(`Discovery profiles: ${discoveryCount}`);
  ok(`Match profiles: ${matchProfileCount}`);

  // 4. Matches
  const matches = await db.collection('matches')
    .where('usersMatched', 'array-contains', reviewerUid).get();
  ok(`Matches en Firestore: ${matches.size}`);

  let totalMessages = 0;
  for (const m of matches.docs) {
    const msgs = await m.ref.collection('messages').get();
    totalMessages += msgs.size;
  }
  ok(`Mensajes totales en chats: ${totalMessages}`);

  // 5. Storage
  const [files] = await bucket.getFiles({ prefix: `users/${reviewerUid}/` });
  ok(`Fotos reviewer en Storage: ${files.length} archivos (${files.length / 2} fotos + ${files.length / 2} thumbs)`);

  sep();
  log('\n📋 RESUMEN PARA APPLE/GOOGLE REVIEW:', 'bold');
  log(`  Teléfono:  ${REVIEWER_PHONE}`, 'green');
  log(`  Código OTP: 123456`, 'green');
  log(`  País:      US (+1, rango 555 reservado)`, 'green');
  log(`  Nombre:    ${REVIEWER_NAME}`, 'green');
  log(`  UID:       ${reviewerUid}`, 'gray');
  sep();
  log('  ⚠️  REQUISITO: Agregar test phone en Firebase Console:', 'yellow');
  log('     Authentication > Sign-in method > Phone > Phone numbers for testing', 'yellow');
  log(`     Número: ${REVIEWER_PHONE}  |  Código: 123456`, 'yellow');
  sep();
}

// ─── MAIN ───────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const doDelete = argv.includes('--delete');
  const doClean  = argv.includes('--clean');

  log('\n' + '═'.repeat(72), 'magenta');
  log('🍏🤖  SEED REVIEWER ACCOUNT — BlackSugar21', 'bold');
  log(`    Teléfono: ${REVIEWER_PHONE} | Código: 123456`, 'gray');
  log('═'.repeat(72), 'magenta');

  if (doDelete) {
    await deleteReviewerData();
    log('\n✅ Datos del reviewer eliminados.\n', 'green');
    process.exit(0);
  }

  if (doClean) {
    await deleteReviewerData();
  }

  // 1. Crear cuenta reviewer
  const reviewerUid = await createReviewerAccount();

  // 2. Crear perfiles discovery
  await createDiscoveryProfiles(reviewerUid);

  // 3. Crear matches con chat
  await createMatchesWithChat(reviewerUid);

  // 4. Verificar todo
  await verifyReviewerSetup(reviewerUid);

  log('\n✅ Setup de reviewer completado.\n', 'green');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Fatal:', e);
  process.exit(1);
});
