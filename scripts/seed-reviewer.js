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
const REVIEWER_ORIENTATION = 'both';   // lowercase, homologado — muestra hombres y mujeres para store screenshots
const REVIEWER_USER_TYPE   = 'SUGAR_DADDY';
const REVIEWER_AGE   = 35;
const REVIEWER_INTERESTS = ['viajes', 'tecnología', 'gastronomía', 'música', 'deportes'];

// Santiago de Chile — coordenadas base
const BASE_LAT = -33.4489;
const BASE_LON = -70.6693;

// Perfiles de discovery (hombres y mujeres — diversidad de tipos para store screenshots)
// Distribución realista: 10 mujeres (7 SB + 3 SM) + 10 hombres (4 SD + 3 SB + 3 SM-equivalente)
const DISCOVERY_PROFILES = [
  // ──── Mujeres — Sugar Baby (7) ────
  { name: 'Valentina Torres',     age: 24, male: false, orientation: 'men',  userType: 'SUGAR_BABY',  bio: 'Aventurera y apasionada por los viajes ✈️',                      interests: ['viajes', 'fotografía', 'yoga'],         photoIds: [1, 80, 160] },
  { name: 'Isabella Martínez',    age: 28, male: false, orientation: 'men',  userType: 'SUGAR_BABY',  bio: 'Amante del arte y la buena gastronomía 🎵',                      interests: ['arte', 'música', 'gastronomía'],        photoIds: [2, 81, 161] },
  { name: 'Camila López',         age: 22, male: false, orientation: 'both', userType: 'SUGAR_BABY',  bio: 'Estudiante de diseño, creativa y espontánea 🎨',                 interests: ['diseño', 'moda', 'baile'],              photoIds: [3, 82, 162] },
  { name: 'Paula Sánchez',        age: 23, male: false, orientation: 'men',  userType: 'SUGAR_BABY',  bio: 'Bailarina profesional, vivo la vida con ritmo 💃',               interests: ['baile', 'música', 'teatro'],            photoIds: [4, 83, 163] },
  { name: 'Renata Flores',        age: 25, male: false, orientation: 'men',  userType: 'SUGAR_BABY',  bio: 'Nutricionista y amante del fitness 🏋️‍♀️',                          interests: ['fitness', 'nutrición', 'yoga'],         photoIds: [5, 84, 164] },
  { name: 'Antonella Moreno',     age: 21, male: false, orientation: 'men',  userType: 'SUGAR_BABY',  bio: 'Estudiante de psicología, me encanta conocer personas nuevas 🌸', interests: ['psicología', 'lectura', 'café'],        photoIds: [6, 85, 165] },
  { name: 'Luciana Castro',       age: 26, male: false, orientation: 'men',  userType: 'SUGAR_BABY',  bio: 'Periodista freelance, curiosa por naturaleza 📝',                interests: ['escritura', 'viajes', 'cine'],          photoIds: [7, 86, 166] },
  // ──── Mujeres — Sugar Mommy (3) ────
  { name: 'Martina García',       age: 34, male: false, orientation: 'both', userType: 'SUGAR_MOMMY', bio: 'Empresaria exitosa que disfruta la buena vida 🥂',               interests: ['negocios', 'viajes', 'gastronomía'],   photoIds: [8, 87, 168] },
  { name: 'Sofía Rodríguez',      age: 36, male: false, orientation: 'men',  userType: 'SUGAR_MOMMY', bio: 'CEO y filántropa, apasionada por el arte contemporáneo 💎',      interests: ['arte', 'negocios', 'vinos'],            photoIds: [9, 88, 169] },
  { name: 'Andrea Fuentes',       age: 38, male: false, orientation: 'both', userType: 'SUGAR_MOMMY', bio: 'Inversionista inmobiliaria, amo los viajes de lujo 🏖️',          interests: ['inversiones', 'viajes', 'arquitectura'], photoIds: [10, 89, 170] },
  // ──── Hombres — Sugar Daddy (4) ────
  { name: 'Alejandro Vega',       age: 38, male: true,  orientation: 'both', userType: 'SUGAR_DADDY', bio: 'Inversionista y amante de la aventura 🏔️',                       interests: ['finanzas', 'viajes', 'deportes'],       photoIds: [11, 90, 171] },
  { name: 'Sebastián Morales',    age: 34, male: true,  orientation: 'both', userType: 'SUGAR_DADDY', bio: 'Emprendedor tech, apasionado por la innovación 🚀',              interests: ['tecnología', 'música', 'gastronomía'],  photoIds: [12, 91, 172] },
  { name: 'Diego Contreras',      age: 40, male: true,  orientation: 'both', userType: 'SUGAR_DADDY', bio: 'Abogado corporativo con gusto por los buenos vinos 🍷',          interests: ['derecho', 'vinos', 'golf'],             photoIds: [13, 92, 173] },
  { name: 'Fernando Ríos',        age: 36, male: true,  orientation: 'men',  userType: 'SUGAR_DADDY', bio: 'Médico cirujano, apasionado por la vida sana y el mar ⛵',       interests: ['medicina', 'surf', 'cocina'],           photoIds: [14, 93, 174] },
  // ──── Hombres — Sugar Baby (3) ────
  { name: 'Mateo Herrera',        age: 25, male: true,  orientation: 'both', userType: 'SUGAR_BABY',  bio: 'Modelo y estudiante de artes escénicas 🎭',                      interests: ['arte', 'moda', 'fitness'],              photoIds: [15, 94, 175] },
  { name: 'Lucas Rivera',         age: 27, male: true,  orientation: 'both', userType: 'SUGAR_BABY',  bio: 'Fotógrafo y surfista, vivo el momento 🌊',                       interests: ['fotografía', 'surf', 'viajes'],         photoIds: [16, 95, 176] },
  { name: 'Nicolás Guzmán',       age: 23, male: true,  orientation: 'both', userType: 'SUGAR_BABY',  bio: 'Músico y compositor, el arte es mi pasión 🎸',                   interests: ['música', 'composición', 'conciertos'],  photoIds: [17, 96, 177] },
  // ──── Hombres — Sugar Mommy (3) ────
  { name: 'Tomás Espinoza',       age: 35, male: true,  orientation: 'both', userType: 'SUGAR_MOMMY', bio: 'Chef ejecutivo, la cocina es mi lenguaje universal 👨‍🍳',         interests: ['gastronomía', 'viajes', 'vinos'],       photoIds: [18, 97, 178] },
  { name: 'Joaquín Mendoza',      age: 37, male: true,  orientation: 'both', userType: 'SUGAR_MOMMY', bio: 'Piloto comercial, conozco el mundo desde las alturas ✈️',        interests: ['aviación', 'fotografía', 'deportes'],   photoIds: [19, 98, 179] },
  { name: 'Cristóbal Navarro',    age: 33, male: true,  orientation: 'both', userType: 'SUGAR_MOMMY', bio: 'Diseñador de interiores, creo espacios que inspiran 🏡',         interests: ['diseño', 'arquitectura', 'arte'],       photoIds: [20, 99, 180] },
];

// Perfiles para matches con chat (mix de géneros y tipos — 3 mujeres + 3 hombres)
const MATCH_PROFILES = [
  { name: 'Daniela Núñez',    age: 29, male: false, orientation: 'men',  userType: 'SUGAR_BABY',  bio: 'Directora de marketing, amante del jet set ✨',       interests: ['negocios', 'moda', 'viajes'],       photoIds: [100, 130, 190] },
  { name: 'Fernanda Vargas',  age: 21, male: false, orientation: 'men',  userType: 'SUGAR_BABY',  bio: 'Universitaria curiosa y llena de energía 🌟',         interests: ['música', 'deportes', 'lectura'],    photoIds: [101, 131, 191] },
  { name: 'Catalina Reyes',   age: 30, male: false, orientation: 'men',  userType: 'SUGAR_MOMMY', bio: 'Fundadora de startup, apasionada por la moda 🌸',      interests: ['moda', 'fotografía', 'fitness'],    photoIds: [103, 133, 193] },
  { name: 'Andrés Castillo',  age: 32, male: true,  orientation: 'both', userType: 'SUGAR_DADDY', bio: 'Arquitecto y viajero incansable 🏛️',                  interests: ['arquitectura', 'viajes', 'arte'],   photoIds: [104, 134, 194] },
  { name: 'Javiera Muñoz',    age: 25, male: false, orientation: 'men',  userType: 'SUGAR_BABY',  bio: 'Ingeniera de software, geek con estilo 💻',           interests: ['tecnología', 'gaming', 'café'],     photoIds: [105, 135, 195] },
  { name: 'Felipe Araya',     age: 28, male: true,  orientation: 'both', userType: 'SUGAR_BABY',  bio: 'Actor de teatro, cada día es una nueva escena 🎬',    interests: ['teatro', 'cine', 'literatura'],     photoIds: [106, 136, 196] },
];

// Conversaciones de ejemplo — entretenidas, naturales y variadas para Apple Review
const CHAT_CONVERSATIONS = [
  // Chat 1: Daniela — viajes y foodie, termina con plan concreto
  [
    { from: 'match', text: '¡Hola Ricardo! Me encantó que te gustan los viajes 😊' },
    { from: 'reviewer', text: '¡Hola Daniela! Sí, es mi pasión. ¿Cuál ha sido tu viaje favorito?' },
    { from: 'match', text: 'Tailandia, sin duda 🏖️ La comida callejera de Bangkok me cambió la vida jaja' },
    { from: 'reviewer', text: 'Uff, yo estuve en Tokio y fue increíble. El ramen de Shibuya no se compara con nada 🍜' },
    { from: 'match', text: '¡Japón es mi próximo destino! ¿Es tan lindo como dicen?' },
    { from: 'reviewer', text: 'Mejor. Los templos de Kyoto al amanecer son otra cosa 🌅' },
    { from: 'match', text: 'Okay ya me convenciste, necesito ir. ¿Y acá en Santiago? ¿Algún restaurante que me sorprenda?' },
    { from: 'reviewer', text: 'Hay uno peruano en Lastarria que es espectacular. La causa limeña 🤤' },
    { from: 'match', text: '¡Me encanta la comida peruana! ¿Me llevas? 😏' },
    { from: 'reviewer', text: '¡Hecho! ¿Este sábado te parece?' },
    { from: 'match', text: 'Perfecto 🎉 A las 8 está bien. ¡Qué ganas!' },
  ],
  // Chat 2: Fernanda — tech y emprendimiento, conversación divertida
  [
    { from: 'match', text: '¡Hey! Vi que eres emprendedor tech 🚀 Cuéntame más' },
    { from: 'reviewer', text: '¡Hola! Sí, tengo una startup de IA. ¿Tú en qué andas?' },
    { from: 'match', text: 'Estudio ingeniería en la Chile. Estoy haciendo mi tesis sobre machine learning 🤖' },
    { from: 'reviewer', text: '¡Qué genial! ¿Sobre qué tema específico?' },
    { from: 'match', text: 'Procesamiento de lenguaje natural. Básicamente enseñarle a las máquinas a entender el sarcasmo jaja' },
    { from: 'reviewer', text: 'Jajaja eso es lo más difícil, ni los humanos lo entienden a veces 😂' },
    { from: 'match', text: 'JAJA verdad. Oye y tu startup, ¿de qué se trata?' },
    { from: 'reviewer', text: 'Automatización de procesos con IA. Suena aburrido pero los resultados son impresionantes ✨' },
    { from: 'match', text: 'Para nada aburrido, suena súper interesante. ¿Un café para que me cuentes más? ☕' },
    { from: 'reviewer', text: 'Me encantaría. ¿Conoces el café de especialidad en Providencia?' },
    { from: 'match', text: '¿El que tiene los waffles increíbles? ¡Sí! Vamos ahí 🧇' },
    { from: 'reviewer', text: 'Ese mismo jaja. ¿Mañana después de clases?' },
    { from: 'match', text: '¡Dale! Salgo a las 6. Te escribo cuando esté saliendo 📱' },
  ],
  // Chat 3: Catalina — moda y lifestyle, coqueteo sutil
  [
    { from: 'match', text: 'Hola Ricardo ✨ Tu perfil se ve muy interesante' },
    { from: 'reviewer', text: '¡Hola Catalina! Gracias, el tuyo también. Vi que tienes una startup de moda 👀' },
    { from: 'match', text: 'Sí, diseño ropa sustentable. Creo que la moda puede ser bonita Y responsable 🌿' },
    { from: 'reviewer', text: 'Eso es increíble. Yo intento ser más consciente con lo que compro últimamente' },
    { from: 'match', text: '¡Qué bueno! Cada pequeño cambio cuenta. ¿Y qué tal tu fin de semana?' },
    { from: 'reviewer', text: 'Fui a una exposición de arte en el GAM, estuvo espectacular 🎨' },
    { from: 'match', text: '¿La de arte contemporáneo? ¡Yo quería ir! ¿Valió la pena?' },
    { from: 'reviewer', text: 'Totalmente. Hay una instalación de luz que es hipnótica. Está hasta fin de mes' },
    { from: 'match', text: 'Necesito ir antes de que termine. ¿Me acompañarías de nuevo? 😊' },
    { from: 'reviewer', text: 'Con mucho gusto. La segunda vez siempre descubres detalles nuevos 🎭' },
    { from: 'match', text: 'Me gusta esa filosofía. ¿Viernes en la tarde?' },
    { from: 'reviewer', text: '¡Perfecto! Y después podemos ir por un vino cerca 🍷' },
    { from: 'match', text: 'Trato hecho ✨ Qué buen plan' },
  ],
  // Chat 4: Andrés — deportes y aventura, tono bromista
  [
    { from: 'match', text: '¡Hola! Vi que te gustan los deportes. ¿Cuál es tu favorito?' },
    { from: 'reviewer', text: '¡Hey Andrés! Surf y trekking sobre todo. ¿Y tú?' },
    { from: 'match', text: 'Escalada y mountain bike 🚵 El fin de semana subí el cerro San Cristóbal en bici' },
    { from: 'reviewer', text: '¡Bravo! Yo lo subí caminando y casi muero jaja 😂' },
    { from: 'match', text: 'JAJAJA es que hay que entrenar un poco antes. Te puedo enseñar unas rutas buenas 💪' },
    { from: 'reviewer', text: 'Acepto el reto. ¿Qué tan difícil es la que hiciste?' },
    { from: 'match', text: 'Intermedia, pero la vista desde arriba vale cada gota de sudor 🏔️' },
    { from: 'reviewer', text: 'Me convenciste. ¿Este domingo temprano?' },
    { from: 'match', text: 'A las 7am para que no haga tanto calor. Yo llevo el agua y los snacks 🎒' },
    { from: 'reviewer', text: 'Hecho. Yo llevo café para después ☕ Lo vamos a necesitar jaja' },
  ],
  // Chat 5: Javiera — gaming y café, nerdy y divertida
  [
    { from: 'match', text: '¡Hola! Me encantó que diga emprendedor tech en tu bio. Necesitamos más techies en esta app 🤓' },
    { from: 'reviewer', text: '¡Jaja hola Javiera! Vi que eres ingeniera de software. ¿Backend o frontend?' },
    { from: 'match', text: 'Full stack, pero mi corazón está en el backend. Python y Go 🐍' },
    { from: 'reviewer', text: 'Una mujer de cultura. Yo soy más de Kotlin y Swift últimamente 📱' },
    { from: 'match', text: '¡Mobile! Qué cool. ¿Apps propias o para clientes?' },
    { from: 'reviewer', text: 'Propias. De hecho estoy en una app de citas ahora mismo 😄' },
    { from: 'match', text: 'JAJAJA touché 😂 Oye, ¿juegas algo? Necesito team para el nuevo Zelda' },
    { from: 'reviewer', text: '¡Sí! Zelda, Elden Ring, y últimamente mucho Baldur\'s Gate 🎮' },
    { from: 'match', text: 'Okay oficialmente eres mi persona favorita de esta app. BG3 es OBRA MAESTRA' },
    { from: 'reviewer', text: 'Jaja gracias. ¿Gaming café? Hay uno nuevo en Ñuñoa que tiene PCs increíbles' },
    { from: 'match', text: '¡Sí he querido ir! Dicen que el café de ahí también es bueno ☕' },
    { from: 'reviewer', text: '¿Sábado en la tarde? Gaming + café, la combinación perfecta' },
    { from: 'match', text: 'Es una cita 🎉 ¡Prepárate para perder en Mario Kart!' },
    { from: 'reviewer', text: '¡Eso lo veremos! 😏🏎️' },
  ],
  // Chat 6: Felipe — arte y cultura, conversación profunda
  [
    { from: 'match', text: 'Hola Ricardo 🎭 Vi que te gusta el arte. ¿Qué tipo?' },
    { from: 'reviewer', text: '¡Hola Felipe! De todo un poco. Últimamente mucho arte digital y fotografía' },
    { from: 'match', text: 'Qué interesante. Yo soy actor de teatro, así que vivo rodeado de arte 🎪' },
    { from: 'reviewer', text: '¡Qué genial! ¿En qué obra estás ahora?' },
    { from: 'match', text: 'Un montaje de García Lorca en el Teatro UC. Se llama "Bodas de Sangre" 🌹' },
    { from: 'reviewer', text: 'Me encanta Lorca. "Así que pasen cinco años" es mi favorita' },
    { from: 'match', text: '¡Wow, alguien que conoce esa obra! La mayoría solo conoce La Casa de Bernarda Alba' },
    { from: 'reviewer', text: 'Jaja es que soy un poco nerd literario. ¿Cuándo es la función?' },
    { from: 'match', text: 'Este jueves y viernes a las 8pm. Te puedo dejar entrada si quieres 🎟️' },
    { from: 'reviewer', text: '¡Me encantaría! El jueves me viene mejor' },
    { from: 'match', text: 'Listo, te dejo una en puerta. Y después podemos conversar sobre la obra con un drink 🍸' },
    { from: 'reviewer', text: 'Plan perfecto. Nos vemos el jueves entonces 😊' },
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

  // Full: upscale a 1024x1536 (portrait) con lanczos3 + sharpen para nitidez
  const fullBuffer = await sharp(imageBuffer)
    .resize(1024, 1536, { fit: 'cover', position: 'attention', kernel: 'lanczos3' })
    .sharpen({ sigma: 1.2 })
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer();

  // Thumb: 400x400 cover crop con sharpen
  const thumbBuffer = await sharp(imageBuffer)
    .resize(400, 400, { fit: 'cover', position: 'attention', kernel: 'lanczos3' })
    .sharpen({ sigma: 0.8 })
    .jpeg({ quality: 88, mozjpeg: true })
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
  const photoIndices = [45, 102, 167]; // Índices para uifaces.co/human
  for (let i = 0; i < photoIndices.length; i++) {
    try {
      const url = `https://mockmind-api.uifaces.co/content/human/${photoIndices[i]}.jpg`;
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

      // 3 fotos por perfil con thumbs — uifaces.co AI avatars
      const pictures = [];
      for (let j = 0; j < 3; j++) {
        const idx = p.photoIds ? p.photoIds[j] : ((i * 7 + j * 3 + 1) % 222 + 1);
        const url = `https://mockmind-api.uifaces.co/content/human/${idx}.jpg`;
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
        male:        p.male,
        orientation: p.orientation,
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

      // 2-3 fotos con thumbs — uifaces.co AI avatars
      const numPhotos = p.photoIds ? p.photoIds.length : (2 + (i % 2));
      const pictures  = [];
      for (let j = 0; j < numPhotos; j++) {
        const idx = p.photoIds ? p.photoIds[j] : ((i * 13 + j * 7 + 40) % 222 + 1);
        const url = `https://mockmind-api.uifaces.co/content/human/${idx}.jpg`;
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
        male:        p.male,
        orientation: p.orientation,
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
