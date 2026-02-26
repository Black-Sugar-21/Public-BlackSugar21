/**
 * Ejecutor directo del seed sin menú interactivo.
 * Uso: node scripts/seed-run.js [opciones]
 *
 * FLAGS:
 *   --clean              Eliminar perfiles de prueba anteriores
 *   --discovery [N]      Crear N perfiles de discovery (default 5)
 *   --chat [N]           Crear N perfiles de chat/match (default 3)
 *   --user daniel|rosita Usuario objetivo (default daniel)
 *   --all                Equivale a --clean --discovery 5 --chat 3
 *
 * Ejemplos:
 *   node scripts/seed-run.js --all
 *   node scripts/seed-run.js --clean
 *   node scripts/seed-run.js --clean --discovery 8 --chat 3 --user daniel
 */

'use strict';

const admin    = require('firebase-admin');
const https    = require('https');
const crypto   = require('crypto');
const sharp    = require('sharp');
const geofire  = require('geofire-common');

// ─── Init Firebase ────────────────────────────────────────────────────────────
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential:    admin.credential.cert(serviceAccount),
  storageBucket: 'black-sugar21.firebasestorage.app',
});
const db         = admin.firestore();
const auth       = admin.auth();
const bucket     = admin.storage().bucket();
const FieldValue = admin.firestore.FieldValue;

// ─── Usuarios reales ──────────────────────────────────────────────────────────
const REAL_USERS = {
  daniel: { uid: 'sU8xLiwQWNXmbYdR63p1uO6TSm72', name: 'Daniel', email: 'dverdugo85@gmail.com' },
  rosita: { uid: 'DsDSK5xqEZZXAIKxtIKyBGntw8f2', name: 'Rosita', email: 'ro.es4075@gmail.com' },
};

// ─── Datos de perfiles ─────────────────────────────────────────────────────────
const PROFILES_DATA = {
  women: [
    { firstName: 'Valentina', lastName: 'Torres',    age: 24, userType: 'SUGAR_BABY',  bio: 'Aventurera y apasionada por los viajes ✈️',            interests: ['viajes','fotografía','yoga'] },
    { firstName: 'Isabella',  lastName: 'Martínez',  age: 28, userType: 'SUGAR_BABY',  bio: 'Amante del arte y la música 🎵',                         interests: ['arte','música','moda'] },
    { firstName: 'Camila',    lastName: 'López',     age: 22, userType: 'SUGAR_BABY',  bio: 'Estudiante de diseño, creativa y espontánea 🎨',          interests: ['diseño','moda','baile'] },
    { firstName: 'Sofía',     lastName: 'Rodríguez', age: 26, userType: 'SUGAR_BABY',  bio: 'Apasionada del fitness y vida saludable 💪',              interests: ['fitness','nutrición','hiking'] },
    { firstName: 'Martina',   lastName: 'García',    age: 30, userType: 'SUGAR_MOMMY', bio: 'Empresaria exitosa que disfruta la buena vida 🥂',        interests: ['negocios','viajes','gastronomía'] },
    { firstName: 'Paula',     lastName: 'Sánchez',   age: 23, userType: 'SUGAR_BABY',  bio: 'Bailarina profesional, vivo la vida con ritmo 💃',        interests: ['baile','música','teatro'] },
    { firstName: 'Lucía',     lastName: 'Fernández', age: 27, userType: 'SUGAR_BABY',  bio: 'Fotógrafa freelance, capturo momentos únicos 📸',         interests: ['fotografía','arte','naturaleza'] },
    { firstName: 'Emma',      lastName: 'Pérez',     age: 25, userType: 'SUGAR_BABY',  bio: 'Chef en formación, la cocina es mi pasión 🍳',            interests: ['gastronomía','viajes','deportes'] },
  ],
  men: [
    { firstName: 'Carlos',    lastName: 'Mendoza',   age: 45, userType: 'SUGAR_DADDY', bio: 'Empresario exitoso que disfruta el arte de vivir 🎩',    interests: ['negocios','golf','vinos'] },
    { firstName: 'Miguel',    lastName: 'Herrera',   age: 38, userType: 'SUGAR_DADDY', bio: 'CEO apasionado por los viajes y la gastronomía 🌍',      interests: ['viajes','gastronomía','deportes'] },
    { firstName: 'Diego',     lastName: 'Castro',    age: 42, userType: 'SUGAR_DADDY', bio: 'Médico especialista, curioso y sofisticado 🥃',           interests: ['medicina','viajes','arte'] },
    { firstName: 'Sebastián', lastName: 'Morales',   age: 35, userType: 'SUGAR_DADDY', bio: 'Arquitecto creativo con gusto por el lujo 🏛️',           interests: ['arquitectura','arte','música'] },
    { firstName: 'Alejandro', lastName: 'Reyes',     age: 24, userType: 'SUGAR_BABY',  bio: 'Modelo y actor en busca de nuevas experiencias 🎬',      interests: ['moda','fotografía','fitness'] },
    { firstName: 'Mateo',     lastName: 'González',  age: 40, userType: 'SUGAR_DADDY', bio: 'Inversor que ama la cultura y el buen gusto 💼',          interests: ['inversiones','arte','deportes'] },
    { firstName: 'Lucas',     lastName: 'Ramírez',   age: 48, userType: 'SUGAR_DADDY', bio: 'Abogado exitoso, refinado y comprensivo ⚖️',             interests: ['derecho','vinos','golf'] },
    { firstName: 'Santiago',  lastName: 'Torres',    age: 22, userType: 'SUGAR_BABY',  bio: 'Atleta profesional, dinámico y apasionado 🏋️',           interests: ['deportes','música','viajes'] },
  ],
};

const BASE_LAT = -33.4489;
const BASE_LON = -70.6693;

// ─── Helpers ───────────────────────────────────────────────────────────────────
const log = (msg) => console.log(msg);
const ok  = (msg) => log(`  ✅ ${msg}`);
const err = (msg) => log(`  ❌ ${msg}`);
const inf = (msg) => log(`  ℹ️  ${msg}`);

function nearbyGeo(baseLat, baseLon, radiusKm = 5) {
  const R = 6371;
  const dLat = (Math.random() * 2 - 1) * (radiusKm / R) * (180 / Math.PI);
  const dLon = (Math.random() * 2 - 1) * (radiusKm / R) * (180 / Math.PI) / Math.cos(baseLat * Math.PI / 180);
  const lat = baseLat + dLat;
  const lon = baseLon + dLon;
  return { lat, lon, geohash: geofire.geohashForLocation([lat, lon]) };
}

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const get = (u, redirects = 0) => {
      https.get(u, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
          return get(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
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

  // Normalizar a JPEG antes de procesar con sharp
  const fullBuffer = await sharp(imageBuffer).jpeg({ quality: 90 }).toBuffer();

  const thumbBuffer = await sharp(fullBuffer)
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

function buildUserDoc({ name, birthDate, bio, male, orientation, userType, pictures, lat, lon, geohash, interests = [] }) {
  const now        = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dailyLimit = 50 + Math.floor(Math.random() * 51);

  return {
    name,
    birthDate:   admin.firestore.Timestamp.fromDate(birthDate),
    bio:         bio || null,
    male,
    orientation,
    userType,
    interests,
    pictures,             // solo nombres de archivo: ["{UUID}.jpg"]
    minAge:       18,
    maxAge:       99,
    maxDistance:  200,
    latitude:     lat,
    longitude:    lon,
    geohash,              // Android usa "geohash"
    g:            geohash, // iOS usa "g"
    accountStatus:     'active',
    paused:            false,
    blocked:           false,
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
    createdAt:   FieldValue.serverTimestamp(),
  };
}

// ─── LIMPIEZA ──────────────────────────────────────────────────────────────────
async function cleanTestProfiles() {
  log('\n🗑️  Limpiando perfiles de prueba anteriores...');

  const [byTest, byDisc] = await Promise.all([
    db.collection('users').where('isTest',              '==', true).get(),
    db.collection('users').where('isDiscoveryProfile',  '==', true).get(),
  ]);

  const ids = new Set();
  byTest.forEach((d) => ids.add(d.id));
  byDisc.forEach((d) => ids.add(d.id));

  if (ids.size === 0) {
    log('  ℹ️  No había perfiles de prueba.');
    return;
  }

  log(`  📦 ${ids.size} perfiles encontrados...`);
  let deleted = 0;

  for (const userId of ids) {
    try {
      // Auth
      try { await auth.deleteUser(userId); } catch (_) {}

      const batch = db.batch();

      // Matches que incluyan este userId
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

      batch.delete(db.collection('users').doc(userId));
      batch.delete(db.collection('profiles').doc(userId));

      await batch.commit();

      // Storage
      await bucket.deleteFiles({ prefix: `users/${userId}/` });

      // Limpiar arrays en Daniel y Rosita
      for (const u of Object.values(REAL_USERS)) {
        await db.collection('users').doc(u.uid).update({
          liked:      FieldValue.arrayRemove(userId),
          passed:     FieldValue.arrayRemove(userId),
          superLiked: FieldValue.arrayRemove(userId),
        }).catch(() => {});
      }

      deleted++;
      log(`  🗑️  ${userId}`);
    } catch (e) {
      err(`${userId}: ${e.message}`);
    }
  }

  ok(`${deleted}/${ids.size} perfiles eliminados`);
}

// ─── DISCOVERY ─────────────────────────────────────────────────────────────────
async function createDiscovery(targetUser, count = 5) {
  log(`\n🎯 Creando ${count} perfiles de discovery para ${targetUser.name}...`);

  const snap = await db.collection('users').doc(targetUser.uid).get();
  if (!snap.exists) { err(`Usuario ${targetUser.name} no existe en Firestore`); return; }

  const data         = snap.data();
  const userOrient   = data.orientation ?? 'women';
  const userLat      = data.latitude  ?? BASE_LAT;
  const userLon      = data.longitude ?? BASE_LON;
  const profileIsMale = userOrient === 'men';
  const profileOrient = (data.male ?? false) ? 'men' : 'women';
  const genderStr     = profileIsMale ? 'men' : 'women';
  const dataList      = profileIsMale ? PROFILES_DATA.men : PROFILES_DATA.women;

  inf(`${targetUser.name} busca: ${genderStr}`);

  let created = 0;
  for (let i = 0; i < count; i++) {
    const p       = dataList[i % dataList.length];
    const name    = `${p.firstName} ${p.lastName}`;
    const email   = `seed_disc_${Date.now()}_${i}@bstest.dev`;
    const birthDate = new Date(new Date().getFullYear() - p.age, 5, 15);

    log(`\n  [${i + 1}/${count}] ${name} (${p.userType})...`);
    try {
      const rec     = await auth.createUser({ email, password: 'Seed1234!', displayName: name });
      const userId  = rec.uid;

      const pictures = [];
      for (let j = 0; j < 3; j++) {
        const idx = (i * 7 + j * 3) % 98 + 1;
        const url = `https://randomuser.me/api/portraits/${genderStr}/${idx}.jpg`;
        try {
          const buf = await downloadImage(url);
          const fn  = await uploadPictureWithThumb(userId, buf);
          pictures.push(fn);
          process.stdout.write(' 📷');
        } catch (e2) {
          err(`foto ${j + 1}: ${e2.message}`);
        }
      }
      console.log();

      const { lat, lon, geohash } = nearbyGeo(userLat, userLon, 5);
      const doc = buildUserDoc({ name, birthDate, bio: p.bio, male: profileIsMale,
        orientation: profileOrient, userType: p.userType, pictures, lat, lon, geohash,
        interests: p.interests });

      await db.collection('users').doc(userId).set(doc);
      created++;
      ok(`${name} → ${userId} (${pictures.length} fotos + thumbs)`);
    } catch (e) {
      err(`${name}: ${e.message}`);
    }
  }

  log(`\n  📊 Discovery: ${created}/${count} creados`);
}

// ─── CHAT / MATCHES ────────────────────────────────────────────────────────────
async function createChats(targetUser, count = 3) {
  log(`\n💬 Creando ${count} matches/chats para ${targetUser.name}...`);

  const snap = await db.collection('users').doc(targetUser.uid).get();
  if (!snap.exists) { err(`Usuario ${targetUser.name} no existe en Firestore`); return; }

  const data         = snap.data();
  const userOrient   = data.orientation ?? 'women';
  const userLat      = data.latitude  ?? BASE_LAT;
  const userLon      = data.longitude ?? BASE_LON;
  const profileIsMale = userOrient === 'men';
  const profileOrient = (data.male ?? false) ? 'men' : 'women';
  const genderStr     = profileIsMale ? 'men' : 'women';
  const dataList      = profileIsMale ? PROFILES_DATA.men : PROFILES_DATA.women;

  const MSGS_PAIRS = [
    ['Hola! Me alegra que hayamos hecho match 😊',       'Hola! Igualmente, ya quería escribirte 💕'],
    ['¿Qué planes tienes para este fin de semana? 🌟',   'Todavía no sé, ¿me propones algo? 😉'],
    ['Tu perfil me parece muy interesante ✨',            'Gracias, el tuyo también me llamó la atención 😊'],
  ];

  let created = 0;
  for (let i = 0; i < count; i++) {
    const p        = dataList[i % dataList.length];
    const name     = `${p.firstName} ${p.lastName}`;
    const email    = `seed_chat_${Date.now()}_${i}@bstest.dev`;
    const birthDate = new Date(new Date().getFullYear() - p.age, 5, 15);

    log(`\n  [${i + 1}/${count}] ${name} (${p.userType})...`);
    try {
      const rec    = await auth.createUser({ email, password: 'Seed1234!', displayName: name });
      const userId = rec.uid;

      const pictures = [];
      for (let j = 0; j < 2; j++) {
        const idx = (i * 13 + j * 7 + 30) % 98 + 1;
        const url = `https://randomuser.me/api/portraits/${genderStr}/${idx}.jpg`;
        try {
          const buf = await downloadImage(url);
          const fn  = await uploadPictureWithThumb(userId, buf);
          pictures.push(fn);
          process.stdout.write(' 📷');
        } catch (e2) {
          err(`foto ${j + 1}: ${e2.message}`);
        }
      }
      console.log();

      const { lat, lon, geohash } = nearbyGeo(userLat, userLon, 8);
      const doc = buildUserDoc({ name, birthDate, bio: p.bio, male: profileIsMale,
        orientation: profileOrient, userType: p.userType, pictures, lat, lon, geohash,
        interests: p.interests });

      doc.liked = [targetUser.uid];
      await db.collection('users').doc(userId).set(doc);

      // Subcol liked recíproca
      await db.collection('users').doc(userId)
        .collection('liked').doc(targetUser.uid)
        .set({ exists: true, superLike: false });

      await db.collection('users').doc(targetUser.uid).update({
        liked: FieldValue.arrayUnion(userId),
      });
      await db.collection('users').doc(targetUser.uid)
        .collection('liked').doc(userId)
        .set({ exists: true, superLike: false });

      // Match document
      const matchId = [targetUser.uid, userId].sort().join('');
      const now     = admin.firestore.Timestamp.now();
      const pair    = MSGS_PAIRS[i % MSGS_PAIRS.length];

      await db.collection('matches').doc(matchId).set({
        users:               [targetUser.uid, userId],
        usersMatched:        [targetUser.uid, userId],
        timestamp:           now,
        lastMessageTimestamp: now,
        lastMessage:         pair[pair.length - 1],
        messageCount:        pair.length,
        lastSeenTimestamps:  { [targetUser.uid]: now, [userId]: now },
        isTest:              true,
      });

      // Mensajes
      const msgRef = db.collection('matches').doc(matchId).collection('messages');
      for (let m = 0; m < pair.length; m++) {
        const senderUid = m % 2 === 0 ? userId : targetUser.uid;
        await msgRef.add({
          senderId:  senderUid,
          text:      pair[m],
          timestamp: admin.firestore.Timestamp.fromDate(new Date(Date.now() - (pair.length - m) * 60_000)),
        });
      }

      created++;
      ok(`${name} → matchId: ${matchId} (${pictures.length} fotos, ${pair.length} msj)`);
    } catch (e) {
      err(`${name}: ${e.message}`);
    }
  }

  log(`\n  📊 Matches: ${created}/${count} creados`);
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  const flag = (f) => argv.includes(f);
  const flagVal = (f, def) => {
    const i = argv.indexOf(f);
    return i !== -1 && argv[i + 1] ? parseInt(argv[i + 1]) || def : def;
  };

  const userKey    = flag('--user') ? (argv[argv.indexOf('--user') + 1] || 'daniel').toLowerCase() : 'daniel';
  const targetUser = REAL_USERS[userKey] || REAL_USERS.daniel;

  const doAll      = flag('--all');
  const doClean    = flag('--clean') || doAll;
  const doDisc     = flag('--discovery') || doAll;
  const doChat     = flag('--chat') || doAll;
  const discCount  = doAll ? 5 : flagVal('--discovery', 5);
  const chatCount  = doAll ? 3 : flagVal('--chat', 3);

  if (!doClean && !doDisc && !doChat) {
    log('Uso: node scripts/seed-run.js --all');
    log('     node scripts/seed-run.js --clean --discovery 5 --chat 3 --user daniel');
    log('     node scripts/seed-run.js --clean');
    process.exit(0);
  }

  log('\n════════════════════════════════════════════════════════════════════════');
  log('🌱  SEED DIRECTO - BlackSugar21');
  log(`    Usuario: ${targetUser.name} (${targetUser.uid})`);
  log('════════════════════════════════════════════════════════════════════════');

  if (doClean)  await cleanTestProfiles();
  if (doDisc)   await createDiscovery(targetUser, discCount);
  if (doChat)   await createChats(targetUser, chatCount);

  log('\n✅ Seed completado.\n');
  process.exit(0);
}

main().catch((e) => { console.error('❌ Fatal:', e); process.exit(1); });
