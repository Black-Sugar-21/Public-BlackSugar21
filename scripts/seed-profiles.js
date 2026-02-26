#!/usr/bin/env node
/**
 * 🌱 SEED DE PERFILES - BlackSugar21
 * ====================================
 * Crea perfiles de ejemplo con la estructura EXACTA del modelo FirestoreUser
 * (Android: FirestoreUser.kt / iOS: FirestoreUser.swift)
 *
 * ✅ Nueva estructura homologada:
 *   - Campos de likes/superlikes (dailyLikesRemaining, superLikesRemaining, etc.)
 *   - Thumbnails reales (_thumb.jpg 400px) en Firebase Storage
 *   - Paths de Storage correctos: users/{userId}/{UUID}.jpg
 *   - Sin campos fuera del modelo: age, firstPictureName, visible, city
 *   - Filtros: accountStatus, visibilityReduced, blocked
 *
 * 🗑️ Limpieza:
 *   - Elimina todos los perfiles de prueba anteriores (isTest, isDiscoveryProfile,
 *     match_test_*, discovery_*) de Auth + Firestore + Storage
 *
 * Uso: node scripts/seed-profiles.js
 */

'use strict';

const admin    = require('firebase-admin');
const https    = require('https');
const crypto   = require('crypto');
const sharp    = require('sharp');
const geofire  = require('geofire-common');
const readline = require('readline');

// ─── Inicialización Firebase ────────────────────────────────────────────────
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential:    admin.credential.cert(serviceAccount),
  storageBucket: 'black-sugar21.firebasestorage.app',
});

const db     = admin.firestore();
const auth   = admin.auth();
const bucket = admin.storage().bucket();
const FieldValue = admin.firestore.FieldValue;

// ─── Usuarios reales (para matches y orientation) ────────────────────────────
const REAL_USERS = {
  DANIEL: {
    email: 'dverdugo85@gmail.com',
    uid:   'sU8xLiwQWNXmbYdR63p1uO6TSm72',
    name:  'Daniel',
  },
  ROSITA: {
    email: 'ro.es4075@gmail.com',
    uid:   'DsDSK5xqEZZXAIKxtIKyBGntw8f2',
    name:  'Rosita',
  },
};

// ─── Colores terminal ────────────────────────────────────────────────────────
const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  gray:    '\x1b[90m',
};
const log  = (msg, color = 'reset') => console.log(`${c[color]}${msg}${c.reset}`);
const logOk  = (msg) => log(`  ✅ ${msg}`, 'green');
const logErr = (msg) => log(`  ❌ ${msg}`, 'red');
const logWarn = (msg) => log(`  ⚠️  ${msg}`, 'yellow');
const logInfo = (msg) => log(`  ℹ️  ${msg}`, 'cyan');
const separator = () => log('─'.repeat(72), 'gray');

// ─── Readline ────────────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise((res) => rl.question(prompt, res));

// ─── Datos de perfiles de ejemplo ────────────────────────────────────────────
const PROFILES_DATA = {
  // Mujeres (Sugar Baby / Sugar Mommy)
  women: [
    { firstName: 'Valentina', lastName: 'Torres',    age: 24, userType: 'SUGAR_BABY',  bio: 'Aventurera y apasionada por los viajes ✈️', interests: ['viajes','fotografía','yoga'] },
    { firstName: 'Isabella',  lastName: 'Martínez',  age: 28, userType: 'SUGAR_BABY',  bio: 'Amante del arte y la música 🎵', interests: ['arte','música','moda'] },
    { firstName: 'Camila',    lastName: 'López',     age: 22, userType: 'SUGAR_BABY',  bio: 'Estudiante de diseño, creativa y espontánea 🎨', interests: ['diseño','moda','baile'] },
    { firstName: 'Sofía',     lastName: 'Rodríguez', age: 26, userType: 'SUGAR_BABY',  bio: 'Apasionada del fitness y vida saludable 💪', interests: ['fitness','nutrición','hiking'] },
    { firstName: 'Martina',   lastName: 'García',    age: 30, userType: 'SUGAR_MOMMY', bio: 'Empresaria exitosa que disfruta la buena vida 🥂', interests: ['negocios','viajes','gastronomía'] },
    { firstName: 'Paula',     lastName: 'Sánchez',   age: 23, userType: 'SUGAR_BABY',  bio: 'Bailarina profesional, vivo la vida con ritmo 💃', interests: ['baile','música','teatro'] },
    { firstName: 'Lucía',     lastName: 'Fernández', age: 27, userType: 'SUGAR_BABY',  bio: 'Fotógrafa freelance, capturo momentos únicos 📸', interests: ['fotografía','arte','naturaleza'] },
    { firstName: 'Emma',      lastName: 'Pérez',     age: 25, userType: 'SUGAR_BABY',  bio: 'Chef en formación, la cocina es mi pasión 🍳', interests: ['gastronomía','viajes','deportes'] },
    { firstName: 'Daniela',   lastName: 'Núñez',     age: 29, userType: 'SUGAR_MOMMY', bio: 'Directora de marketing, amante del jet set ✨', interests: ['negocios','moda','viajes'] },
    { firstName: 'Fernanda',  lastName: 'Vargas',    age: 21, userType: 'SUGAR_BABY',  bio: 'Universitaria curiosa y llena de energía 🌟', interests: ['música','deportes','lectura'] },
  ],
  // Hombres (Sugar Daddy / Sugar Baby)
  men: [
    { firstName: 'Carlos',    lastName: 'Mendoza',   age: 45, userType: 'SUGAR_DADDY', bio: 'Empresario exitoso que disfruta mimarte 🎩', interests: ['negocios','golf','vinos'] },
    { firstName: 'Miguel',    lastName: 'Herrera',   age: 38, userType: 'SUGAR_DADDY', bio: 'CEO apasionado por los viajes y la gastronomía 🌍', interests: ['viajes','gastronomía','deportes'] },
    { firstName: 'Diego',     lastName: 'Castro',    age: 42, userType: 'SUGAR_DADDY', bio: 'Médico especialista, curioso y sofisticado 🥃', interests: ['medicina','viajes','arte'] },
    { firstName: 'Sebastián', lastName: 'Morales',   age: 35, userType: 'SUGAR_DADDY', bio: 'Arquitecto creativo con gusto por el lujo 🏛️', interests: ['arquitectura','arte','música'] },
    { firstName: 'Alejandro', lastName: 'Reyes',     age: 24, userType: 'SUGAR_BABY',  bio: 'Modelo y actor en busca de nuevas experiencias 🎬', interests: ['moda','fotografía','fitness'] },
    { firstName: 'Mateo',     lastName: 'González',  age: 40, userType: 'SUGAR_DADDY', bio: 'Inversor que ama la cultura y el buen gusto 💼', interests: ['inversiones','arte','deportes'] },
    { firstName: 'Lucas',     lastName: 'Ramírez',   age: 48, userType: 'SUGAR_DADDY', bio: 'Abogado exitoso, refinado y comprensivo ⚖️', interests: ['derecho','vinos','golf'] },
    { firstName: 'Santiago',  lastName: 'Torres',    age: 22, userType: 'SUGAR_BABY',  bio: 'Atleta profesional, dinámico y apasionado 🏋️', interests: ['deportes','música','viajes'] },
    { firstName: 'Nicolás',   lastName: 'Flores',    age: 51, userType: 'SUGAR_DADDY', bio: 'Financiero con alma de viajero 🗺️', interests: ['negocios','viajes','vinos'] },
    { firstName: 'Andrés',    lastName: 'Muñoz',     age: 33, userType: 'SUGAR_DADDY', bio: 'Tecnólogo exitoso que valora las conexiones reales 💻', interests: ['tecnología','networking','viajes'] },
  ],
};

// Coordenadas base: Santiago de Chile
const BASE_LAT = -33.4489;
const BASE_LON = -70.6693;

// ─── Generación de geohash con variación geográfica ─────────────────────────
function nearbyGeohash(baseLat = BASE_LAT, baseLon = BASE_LON, radiusKm = 5) {
  const R = 6371;
  const dLat = (Math.random() * 2 - 1) * (radiusKm / R) * (180 / Math.PI);
  const dLon = (Math.random() * 2 - 1) * (radiusKm / R) * (180 / Math.PI) / Math.cos(baseLat * Math.PI / 180);
  const lat = baseLat + dLat;
  const lon = baseLon + dLon;
  return { lat, lon, geohash: geofire.geohashForLocation([lat, lon]) };
}

// ─── Descarga de imagen remota ────────────────────────────────────────────────
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ─── Upload de imagen + thumbnail a Storage ───────────────────────────────────
/**
 * Sube una imagen completa y su thumbnail a Firebase Storage.
 * ✅ Path: users/{userId}/{UUID}.jpg
 * ✅ Thumb: users/{userId}/{UUID}_thumb.jpg (400px, 75% calidad)
 * ✅ Devuelve: solo el nombre de archivo "{UUID}.jpg" para el array pictures
 *
 * @param {string} userId
 * @param {Buffer} imageBuffer  JPEG original descargado
 * @returns {Promise<string>}   Filename "{UUID}.jpg"
 */
async function uploadPictureWithThumb(userId, imageBuffer) {
  const uuid     = crypto.randomUUID();
  const fileName = `${uuid}.jpg`;
  const thumbName = `${uuid}_thumb.jpg`;
  const basePath  = `users/${userId}`;

  // 1. Generar thumbnail 400px con sharp
  const thumbBuffer = await sharp(imageBuffer)
    .resize(400, 400, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 75 })
    .toBuffer();

  // 2. Subir full + thumb en paralelo
  await Promise.all([
    bucket.file(`${basePath}/${fileName}`).save(imageBuffer, {
      metadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000' },
    }),
    bucket.file(`${basePath}/${thumbName}`).save(thumbBuffer, {
      metadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000' },
    }),
  ]);

  return fileName; // Solo el nombre, igual que la app nativa
}

// ─── Construcción del documento Firestore (modelo exacto) ────────────────────
/**
 * Crea el payload EXACTO del modelo FirestoreUser para Firestore.
 * Alineado con:
 *   Android: FirestoreUser.kt
 *   iOS:     FirestoreUser.swift
 *
 * SIN campos extra: age, city, firstPictureName, visible
 */
function buildFirestoreUserDoc({
  name,
  birthDate,
  bio,
  male,
  orientation,
  userType,
  pictures,
  lat,
  lon,
  geohash,
  minAge    = 18,
  maxAge    = 99,
  maxDistance = 200,
  interests = [],
  isTest    = true,
}) {
  const now       = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dailyLimit = 50 + Math.floor(Math.random() * 51); // 50-100

  return {
    // ── Datos personales ───────────────────────────────────────────────────
    name,
    birthDate: admin.firestore.Timestamp.fromDate(birthDate),
    bio:       bio || null,
    male,                     // bool, homologado (no "gender")
    orientation,              // "men" | "women" | "both"
    userType,                 // "SUGAR_BABY" | "SUGAR_DADDY" | "SUGAR_MOMMY"
    interests,

    // ── Fotos ─────────────────────────────────────────────────────────────
    pictures,                 // ["{UUID}.jpg", ...]  solo nombres, no URLs

    // ── Filtros de búsqueda ───────────────────────────────────────────────
    minAge,
    maxAge,
    maxDistance,

    // ── Ubicación ─────────────────────────────────────────────────────────
    latitude:  lat,
    longitude: lon,
    geohash:   geohash,       // campo "g" en iOS CodingKeys, pero "geohash" en Android
    g:         geohash,       // iOS usa "g" como rawValue para geohash

    // ── Estado de la cuenta ───────────────────────────────────────────────
    accountStatus:     'active',
    paused:            false,
    blocked:           false,
    visibilityReduced: false,  // ✅ Homologado Android+iOS

    // ── Likes diarios ─────────────────────────────────────────────────────
    liked:               [],
    passed:              [],
    dailyLikesRemaining: dailyLimit,
    dailyLikesLimit:     dailyLimit,
    lastLikeResetDate:   admin.firestore.Timestamp.fromDate(todayStart),

    // ── Super Likes ───────────────────────────────────────────────────────
    superLiked:               [],
    superLikesRemaining:      5,
    superLikesUsedToday:      0,
    lastSuperLikeResetDate:   admin.firestore.Timestamp.fromDate(todayStart),

    // ── Meta ──────────────────────────────────────────────────────────────
    isTest,
    createdAt: FieldValue.serverTimestamp(),
  };
}

// ─── LIMPIEZA: Eliminar perfiles de prueba ────────────────────────────────────
async function deleteTestProfiles() {
  log('\n🗑️  LIMPIAR PERFILES DE PRUEBA', 'magenta');
  separator();

  // 1. Buscar por isTest == true
  const [byIsTest, byIsDiscovery] = await Promise.all([
    db.collection('users').where('isTest', '==', true).get(),
    db.collection('users').where('isDiscoveryProfile', '==', true).get(),
  ]);

  // Unificar IDs únicos
  const idsToDelete = new Set();
  byIsTest.forEach((d) => idsToDelete.add(d.id));
  byIsDiscovery.forEach((d) => idsToDelete.add(d.id));

  if (idsToDelete.size === 0) {
    logWarn('No se encontraron perfiles de prueba.');
    return;
  }

  log(`\n  📦 ${idsToDelete.size} perfiles de prueba encontrados`, 'yellow');

  let deleted = 0;
  let errors  = 0;

  for (const userId of idsToDelete) {
    try {
      // A. Eliminar de Auth (no crítico si no existe)
      try { await auth.deleteUser(userId); } catch (_) { /* puede no existir */ }

      // B. Eliminar matches que incluyan este userId
      const matchSnap = await db.collection('matches')
        .where('usersMatched', 'array-contains', userId)
        .get();

      const batch = db.batch();
      for (const matchDoc of matchSnap.docs) {
        // Eliminar mensajes de la subcollección
        const messagesSnap = await matchDoc.ref.collection('messages').get();
        messagesSnap.forEach((m) => batch.delete(m.ref));
        batch.delete(matchDoc.ref);
      }

      // C. Eliminar subcollecciones del usuario
      for (const subcol of ['swipes', 'liked', 'superLiked']) {
        const sub = await db.collection('users').doc(userId).collection(subcol).get();
        sub.forEach((d) => batch.delete(d.ref));
      }

      // D. Eliminar doc en 'users' y 'profiles'
      batch.delete(db.collection('users').doc(userId));
      batch.delete(db.collection('profiles').doc(userId));

      await batch.commit();

      // E. Eliminar archivos en Storage: users/{userId}/
      await bucket.deleteFiles({ prefix: `users/${userId}/` });

      // F. Eliminar liked arrays en usuarios reales
      for (const realUser of Object.values(REAL_USERS)) {
        await db.collection('users').doc(realUser.uid).update({
          liked:      FieldValue.arrayRemove(userId),
          passed:     FieldValue.arrayRemove(userId),
          superLiked: FieldValue.arrayRemove(userId),
        }).catch(() => {});
      }

      deleted++;
      log(`  🗑️  ${userId} eliminado`, 'gray');
    } catch (err) {
      errors++;
      logErr(`${userId}: ${err.message}`);
    }
  }

  log(`\n  📊 Eliminados: ${deleted} / ${idsToDelete.size}`, 'green');
  if (errors > 0) logErr(`Errores: ${errors}`);
}

// ─── CREAR: Perfiles de Discovery (swipe / HomeView) ────────────────────────
async function createDiscoveryProfiles(targetUser) {
  log(`\n🎯 CREAR PERFILES DE DISCOVERY para ${targetUser.name}`, 'cyan');
  separator();

  // Leer perfil del usuario activo
  const snap = await db.collection('users').doc(targetUser.uid).get();
  if (!snap.exists) {
    logErr(`Usuario ${targetUser.name} (${targetUser.uid}) no existe en Firestore`);
    return;
  }

  const data          = snap.data();
  const userIsMale    = data.male ?? false;
  const userOrient    = data.orientation ?? 'women';
  const userMinAge    = data.minAge ?? 18;
  const userMaxAge    = data.maxAge ?? 99;
  const userLat       = data.latitude  ?? BASE_LAT;
  const userLon       = data.longitude ?? BASE_LON;

  logInfo(`Usuario: ${userIsMale ? 'HOMBRE' : 'MUJER'}, tipo: ${data.userType}`);
  logInfo(`Busca: ${userOrient === 'men' ? 'HOMBRES' : 'MUJERES'}`);
  logInfo(`Rango de edad: ${userMinAge}-${userMaxAge}`);

  // Los perfiles deben ser del género que busca el usuario
  const profileIsMale   = userOrient === 'men';
  const profileOrient   = userIsMale ? 'men' : 'women'; // buscan de vuelta al usuario
  const profileGender   = profileIsMale ? 'men' : 'women';
  const profileDataList = profileIsMale ? PROFILES_DATA.men : PROFILES_DATA.women;

  const answer = await ask('\n  ¿Cuántos perfiles crear? (1-10, default 5): ');
  const count  = Math.min(10, Math.max(1, parseInt(answer) || 5));

  log(`\n  🔄 Creando ${count} perfiles compatibles con ${targetUser.name}...\n`, 'yellow');

  let created = 0;

  for (let i = 0; i < count; i++) {
    const profile  = profileDataList[i % profileDataList.length];
    const fullName = `${profile.firstName} ${profile.lastName}`;
    const email    = `seed_disc_${Date.now()}_${i}@bstest.dev`;

    // Edad dentro del rango del usuario activo
    const ageRange   = Math.max(1, userMaxAge - userMinAge);
    const age        = userMinAge + (i % ageRange);
    const birthYear  = new Date().getFullYear() - age;
    const birthDate  = new Date(birthYear, 5, 15); // 15 junio para consistencia

    try {
      log(`  [${i + 1}/${count}] ${fullName} (${profile.userType}, ${age}a)...`, 'cyan');

      // Crear en Auth
      const userRecord = await auth.createUser({ email, password: 'Seed1234!', displayName: fullName });
      const userId = userRecord.uid;

      // Subir 3 fotos con thumbnails
      const numPhotos = 3;
      const pictures  = [];
      for (let p = 0; p < numPhotos; p++) {
        const avatarUrl = `https://randomuser.me/api/portraits/${profileGender}/${(i * 7 + p * 3) % 99}.jpg`;
        try {
          const buf      = await downloadImage(avatarUrl);
          const fileName = await uploadPictureWithThumb(userId, buf);
          pictures.push(fileName);
          process.stdout.write('.');
        } catch (_) {
          // Fallback: foto alternativa
          const fallbackUrl = `https://randomuser.me/api/portraits/${profileGender}/${(p + 1) % 99}.jpg`;
          const buf      = await downloadImage(fallbackUrl);
          const fileName = await uploadPictureWithThumb(userId, buf);
          pictures.push(fileName);
          process.stdout.write('·');
        }
      }
      process.stdout.write('\n');

      // Ubicación cercana al usuario activo
      const { lat, lon, geohash } = nearbyGeohash(userLat, userLon, 5);

      // Crear documento Firestore con modelo exacto
      const doc = buildFirestoreUserDoc({
        name:        fullName,
        birthDate,
        bio:         profile.bio,
        male:        profileIsMale,
        orientation: profileOrient,
        userType:    profile.userType,
        pictures,
        lat,
        lon,
        geohash,
        interests:   profile.interests || [],
      });

      await db.collection('users').doc(userId).set(doc);

      created++;
      logOk(`${fullName} → ${userId} (${pictures.length} fotos + thumbs)`);

    } catch (err) {
      logErr(`${fullName}: ${err.message}`);
    }
  }

  separator();
  log(`\n  📊 Discovery: ${created}/${count} perfiles creados`, 'green');
  logInfo('Estos perfiles aparecerán en HomeView (swipe) automáticamente.');
}

// ─── CREAR: Perfiles de Chat (matches con mensajes) ──────────────────────────
async function createChatProfiles(targetUser) {
  log(`\n💬 CREAR PERFILES DE CHAT/MATCHES para ${targetUser.name}`, 'cyan');
  separator();

  const snap = await db.collection('users').doc(targetUser.uid).get();
  if (!snap.exists) {
    logErr(`Usuario ${targetUser.name} no existe en Firestore`);
    return;
  }
  const data      = snap.data();
  const userLat   = data.latitude  ?? BASE_LAT;
  const userLon   = data.longitude ?? BASE_LON;

  // Los matches deben ser del género opuesto de lo que busca el usuario
  // (si Daniel busca mujeres → matches son mujeres)
  const userOrient      = data.orientation ?? 'women';
  const profileIsMale   = userOrient === 'men';
  const profileOrient   = (data.male ?? false) ? 'men' : 'women';
  const profileGender   = profileIsMale ? 'men' : 'women';
  const profileDataList = profileIsMale ? PROFILES_DATA.men : PROFILES_DATA.women;

  const answer = await ask('\n  ¿Cuántos matches crear? (1-5, default 3): ');
  const count  = Math.min(5, Math.max(1, parseInt(answer) || 3));

  log(`\n  🔄 Creando ${count} matches con ${targetUser.name}...\n`, 'yellow');

  const SAMPLE_MESSAGES = [
    ['¡Hola! Me alegra mucho que hayamos hecho match 😊', 'Hola! Igualmente, ya quería escribirte 💕'],
    ['¿Qué planes tienes para este fin de semana? 🌟', 'Todavía no sé, ¿me propones algo? 😉'],
    ['Tu perfil me parece muy interesante ✨', 'Gracias, el tuyo también me llamó la atención 😊'],
  ];

  let created = 0;

  for (let i = 0; i < count; i++) {
    const profile  = profileDataList[i % profileDataList.length];
    const fullName = `${profile.firstName} ${profile.lastName}`;
    const email    = `seed_chat_${Date.now()}_${i}@bstest.dev`;
    const age      = profile.age;
    const birthYear = new Date().getFullYear() - age;
    const birthDate = new Date(birthYear, 5, 15);

    try {
      log(`  [${i + 1}/${count}] ${fullName} (${profile.userType})...`, 'cyan');

      const userRecord = await auth.createUser({ email, password: 'Seed1234!', displayName: fullName });
      const userId     = userRecord.uid;

      // Subir 2-3 fotos con thumbnails
      const numPhotos = 2 + (i % 2);
      const pictures  = [];
      for (let p = 0; p < numPhotos; p++) {
        const avatarUrl = `https://randomuser.me/api/portraits/${profileGender}/${(i * 13 + p * 7 + 30) % 99}.jpg`;
        const buf       = await downloadImage(avatarUrl);
        const fileName  = await uploadPictureWithThumb(userId, buf);
        pictures.push(fileName);
        process.stdout.write('.');
      }
      process.stdout.write('\n');

      const { lat, lon, geohash } = nearbyGeohash(userLat, userLon, 10);

      // Crear usuario con modelo exacto
      const doc = buildFirestoreUserDoc({
        name:        fullName,
        birthDate,
        bio:         profile.bio,
        male:        profileIsMale,
        orientation: profileOrient,
        userType:    profile.userType,
        pictures,
        lat,
        lon,
        geohash,
        interests:   profile.interests || [],
      });

      // Agregar likes mutuos al documento
      doc.liked = [targetUser.uid];

      await db.collection('users').doc(userId).set(doc);

      // Subcollección liked del perfil nuevo → apunta al usuario real
      await db.collection('users').doc(userId)
        .collection('liked').doc(targetUser.uid)
        .set({ exists: true, superLike: false });

      // Actualizar liked del usuario real (atómico)
      await db.collection('users').doc(targetUser.uid).update({
        liked: FieldValue.arrayUnion(userId),
      });
      await db.collection('users').doc(targetUser.uid)
        .collection('liked').doc(userId)
        .set({ exists: true, superLike: false });

      // Crear match con estructura exacta (FirestoreMatchProperties.toData)
      const matchId = [targetUser.uid, userId].sort().join('');
      const now     = admin.firestore.Timestamp.now();

      // Obtener userTypes para el match
      const targetUserType = data.userType ?? null;

      await db.collection('matches').doc(matchId).set({
        users:            [targetUser.uid, userId],
        usersMatched:     [targetUser.uid, userId],   // compatibilidad
        timestamp:        now,
        lastMessageTimestamp: now,
        messageCount:     0,
        lastSeenTimestamps: {
          [targetUser.uid]: now,
          [userId]:         now,
        },
        ...(targetUserType && profile.userType ? {
          userTypesAtMatch: {
            [targetUser.uid]: targetUserType,
            [userId]:         profile.userType,
          },
        } : {}),
        isTest: true,
      });

      // Agregar mensajes de ejemplo
      const pair = SAMPLE_MESSAGES[i % SAMPLE_MESSAGES.length];
      const msgRef = db.collection('matches').doc(matchId).collection('messages');
      let seq = 1;
      for (const text of pair) {
        const senderId = seq % 2 === 1 ? userId : targetUser.uid;
        const msgTs    = new Date(Date.now() - (pair.length - seq) * 60_000);
        await msgRef.add({
          senderId,
          text,
          timestamp: admin.firestore.Timestamp.fromDate(msgTs),
          seq: seq++,
        });
      }

      // Actualizar lastMessage en el match
      const lastText = pair[pair.length - 1];
      await db.collection('matches').doc(matchId).update({
        lastMessage:          lastText,
        lastMessageTimestamp: now,
        messageCount:         pair.length,
      });

      created++;
      logOk(`${fullName} → match ${matchId} (${pictures.length} fotos, ${pair.length} mensajes)`);

    } catch (err) {
      logErr(`${fullName}: ${err.message}`);
    }
  }

  separator();
  log(`\n  📊 Matches: ${created}/${count} creados`, 'green');
  logInfo('Aparecen en ChatView/Matches automáticamente.');
}

// ─── VERIFICAR: Estructura de perfiles existentes ────────────────────────────
async function verifyProfiles() {
  log('\n🔍 VERIFICAR ESTRUCTURA DE PERFILES', 'cyan');
  separator();

  const snap = await db.collection('users').where('isTest', '==', true).get();

  if (snap.empty) {
    logWarn('No hay perfiles de prueba (isTest: true).');
    return;
  }

  const requiredFields = [
    'name', 'birthDate', 'male', 'orientation', 'userType', 'pictures',
    'accountStatus', 'paused', 'blocked', 'visibilityReduced',
    'liked', 'passed', 'dailyLikesRemaining', 'dailyLikesLimit', 'lastLikeResetDate',
    'superLiked', 'superLikesRemaining', 'superLikesUsedToday', 'lastSuperLikeResetDate',
    'latitude', 'longitude', 'g', 'minAge', 'maxAge', 'maxDistance',
  ];

  const forbiddenFields = ['age', 'firstPictureName', 'visible', 'city'];

  let ok = 0, issues = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const name = d.name || doc.id;

    const missing  = requiredFields.filter((f) => d[f] === undefined);
    const extra    = forbiddenFields.filter((f) => d[f] !== undefined);
    const pics     = d.pictures ?? [];
    const hasThumb = pics.length > 0 && !pics[0].startsWith('http');

    if (missing.length === 0 && extra.length === 0) {
      logOk(`${name} — ${pics.length} fotos ${hasThumb ? '(solo nombres ✅)' : '(URLs ❌)'}`);
      ok++;
    } else {
      logErr(`${name}`);
      if (missing.length)  log(`     Faltantes:  ${missing.join(', ')}`, 'red');
      if (extra.length)    log(`     Extra/fuera: ${extra.join(', ')}`, 'yellow');
      issues++;
    }
  }

  separator();
  log(`\n  📊 OK: ${ok} / Con problemas: ${issues} / Total: ${snap.size}`, ok === snap.size ? 'green' : 'yellow');
}

// ─── MENÚ PRINCIPAL ──────────────────────────────────────────────────────────
async function selectUser() {
  log('\n👤 ¿Para qué usuario?', 'yellow');
  log('  1. Daniel (dverdugo85@gmail.com)');
  log('  2. Rosita (ro.es4075@gmail.com)');
  const a = (await ask('  Selecciona (1/2, default 1): ')).trim();
  return a === '2' ? REAL_USERS.ROSITA : REAL_USERS.DANIEL;
}

async function main() {
  log('\n' + '═'.repeat(72), 'magenta');
  log('🌱  SEED DE PERFILES - BlackSugar21', 'bold');
  log('    Estructura homologada Android + iOS', 'gray');
  log('═'.repeat(72), 'magenta');

  let running = true;

  while (running) {
    log('\n📋 MENÚ', 'cyan');
    log('  1. 🎯  Crear perfiles de discovery (HomeView/Swipe)');
    log('  2. 💬  Crear perfiles de chat con match pre-hecho');
    log('  3. 🗑️   Eliminar TODOS los perfiles de prueba');
    log('  4. 🔍  Verificar estructura de perfiles existentes');
    log('  5. 🔄  Crear discovery + chat (flujo completo)');
    log('  0. 🚪  Salir');
    separator();

    const option = (await ask('  Opción: ')).trim();

    switch (option) {
      case '1': {
        const user = await selectUser();
        await createDiscoveryProfiles(user);
        break;
      }
      case '2': {
        const user = await selectUser();
        await createChatProfiles(user);
        break;
      }
      case '3': {
        const confirm = await ask('  ⚠️  ¿Confirmar eliminación? (s/N): ');
        if (confirm.toLowerCase() === 's') {
          await deleteTestProfiles();
        } else {
          logWarn('Cancelado.');
        }
        break;
      }
      case '4': {
        await verifyProfiles();
        break;
      }
      case '5': {
        const user = await selectUser();
        const confirmDel = await ask('  ¿Eliminar perfiles anteriores primero? (s/N): ');
        if (confirmDel.toLowerCase() === 's') await deleteTestProfiles();
        await createDiscoveryProfiles(user);
        await createChatProfiles(user);
        break;
      }
      case '0': {
        running = false;
        break;
      }
      default: {
        logWarn('Opción no válida.');
      }
    }
  }

  rl.close();
  log('\n✅ Listo. Recuerda hacer build de la app para probar los perfiles.\n', 'green');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
