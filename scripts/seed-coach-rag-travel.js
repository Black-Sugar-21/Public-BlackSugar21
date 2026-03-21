#!/usr/bin/env node
/**
 * seed-coach-rag-travel.js — Seed coachKnowledge with travel/dating chunks
 * Uses Firebase Admin SDK via GOOGLE_APPLICATION_CREDENTIALS or firebase CLI auth
 *
 * Usage:
 *   node scripts/seed-coach-rag-travel.js          # Seed travel knowledge
 *   node scripts/seed-coach-rag-travel.js --dry-run # Preview without writing
 *   node scripts/seed-coach-rag-travel.js --delete  # Delete travel chunks
 */
'use strict';

const CHUNKS = [
  // ═══════════════════════════════════════════════════════════════
  // TRAVEL DATING — dating in a new/foreign city
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'travel_dating',
    language: 'es',
    text: 'Consejos para citas cuando viajas a otra ciudad: 1) Investiga los barrios populares y seguros antes de llegar — apps como Google Maps y TripAdvisor son tus aliados. 2) Los cafés y bares de barrio son mejores para primeras citas que los lugares turísticos — más auténticos y económicos. 3) Menciona en tu perfil que estás de visita — la honestidad genera confianza. 4) Propón actividades durante el día si no conoces bien la ciudad (parques, museos, mercados). 5) Comparte tu ubicación con un amigo de confianza. 6) Los tours gastronómicos son excelentes primeras citas — caminas, conversas y pruebas la comida local. 7) Aprende frases básicas en el idioma local — el esfuerzo se valora mucho.',
  },
  {
    category: 'travel_dating',
    language: 'en',
    text: 'Dating tips when visiting a new city: 1) Research safe and popular neighborhoods before arriving — Google Maps reviews and local blogs are your friends. 2) Neighborhood cafés and bars make better first date spots than tourist traps — more authentic and affordable. 3) Be upfront in your profile that you\'re visiting — honesty builds trust. 4) Suggest daytime activities if you don\'t know the city well (parks, museums, food markets). 5) Share your live location with a trusted friend. 6) Food tours make excellent first dates — you walk, talk, and sample local cuisine together. 7) Learn a few phrases in the local language — the effort is always appreciated.',
  },
  {
    category: 'travel_dating',
    language: 'pt',
    text: 'Dicas para encontros quando viaja para outra cidade: 1) Pesquise bairros populares e seguros antes de chegar. 2) Cafés e bares de bairro são melhores para primeiro encontro do que pontos turísticos. 3) Seja transparente no perfil que está visitando. 4) Sugira atividades durante o dia se não conhece a cidade (parques, museus, feiras). 5) Compartilhe sua localização com alguém de confiança. 6) Tours gastronômicos são ótimos primeiros encontros. 7) Aprenda frases básicas no idioma local.',
  },

  // ═══════════════════════════════════════════════════════════════
  // LONG DISTANCE — dating someone in another city/country
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'long_distance',
    language: 'es',
    text: 'Consejos para relaciones a distancia y citas entre ciudades: 1) La comunicación constante es clave — define expectativas de frecuencia de mensajes/llamadas. 2) Planifica visitas regulares y alterna quién viaja — demuestra compromiso mutuo. 3) Hagan videollamadas para "citas virtuales" — cocinen juntos, vean una película, jueguen online. 4) Envía sorpresas: flores, cartas, regalos locales de tu ciudad. 5) Hablen del futuro — tener un plan de eventual cercanía reduce la ansiedad. 6) Conozcan la ciudad del otro — visiten los lugares favoritos de cada uno. 7) La confianza es fundamental — celos excesivos destruyen relaciones a distancia. 8) Aprovechen el tiempo juntos al máximo cuando se visiten — planifiquen actividades especiales.',
  },
  {
    category: 'long_distance',
    language: 'en',
    text: 'Long-distance dating and relationship tips: 1) Consistent communication is key — set expectations for message/call frequency. 2) Plan regular visits and alternate who travels — shows mutual commitment. 3) Have video call "virtual dates" — cook together, watch movies, play online games. 4) Send surprises: flowers, letters, local gifts from your city. 5) Talk about the future — having a plan for eventual proximity reduces anxiety. 6) Learn each other\'s cities — visit each other\'s favorite spots. 7) Trust is fundamental — excessive jealousy destroys long-distance relationships. 8) Make the most of in-person time — plan special activities when visiting.',
  },
  {
    category: 'long_distance',
    language: 'pt',
    text: 'Dicas para relacionamentos à distância: 1) Comunicação constante é chave — defina expectativas. 2) Planeje visitas regulares alternando quem viaja. 3) Façam videochamadas para "encontros virtuais". 4) Envie surpresas: flores, cartas, presentes locais. 5) Falem sobre o futuro — ter um plano reduz ansiedade. 6) Conheçam a cidade um do outro. 7) Confiança é fundamental. 8) Aproveitem ao máximo o tempo juntos presencialmente.',
  },

  // ═══════════════════════════════════════════════════════════════
  // SOLO DATING — dating while traveling alone
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'solo_dating',
    language: 'es',
    text: 'Citas cuando viajas solo/a: 1) Apps de dating son tu mejor herramienta — configura la ubicación a tu destino antes de llegar para hacer match anticipadamente. 2) Los hostels y espacios de coworking son excelentes para conocer gente — muchos organizan eventos sociales. 3) Sé claro sobre tu situación — si estás de paso, dilo. Si buscas algo serio, también. 4) Primeras citas en lugares públicos y populares siempre. 5) Free walking tours son perfectos para conocer la ciudad y potenciales matches. 6) Los bares de vinos y cervecerías artesanales suelen tener ambientes acogedores para conversar. 7) Aprende sobre la cultura de citas local — cada país tiene normas diferentes. 8) Si eres nómada digital, los cafés de especialidad y coworkings son donde está tu tribu.',
  },
  {
    category: 'solo_dating',
    language: 'en',
    text: 'Dating while traveling solo: 1) Dating apps are your best tool — set your location to your destination before arriving to match in advance. 2) Hostels and coworking spaces are great for meeting people — many host social events. 3) Be clear about your situation — if you\'re passing through, say so. If looking for something serious, say that too. 4) Always choose public, popular spots for first dates. 5) Free walking tours are perfect for learning the city and meeting potential dates. 6) Wine bars and craft breweries tend to have cozy atmospheres for conversation. 7) Learn about local dating culture — every country has different norms. 8) If you\'re a digital nomad, specialty coffee shops and coworkings are where your tribe hangs out.',
  },

  // ═══════════════════════════════════════════════════════════════
  // FRIEND/FAMILY IN ANOTHER CITY — visiting someone + dating
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'visiting_connections',
    language: 'es',
    text: 'Citas cuando visitas amigos o familia en otra ciudad: 1) Pide recomendaciones a tus amigos/familia locales — conocen los mejores spots que no están en Google. 2) Si un amigo te puede presentar gente, aprovecha — las citas a través de contactos mutuos tienen mayor tasa de éxito. 3) Combina planes: una salida grupal con amigos puede derivar en conocer a alguien interesante. 4) Usa la app para hacer match en la ciudad que visitarás, pero sé honesto sobre cuánto tiempo estarás. 5) Los mercados locales, ferias de fin de semana y eventos culturales son excelentes para conocer gente de forma orgánica. 6) Si tu familia está en esa ciudad, podrías tener una base más cómoda para explorar y tener citas sin la presión del tiempo.',
  },
  {
    category: 'visiting_connections',
    language: 'en',
    text: 'Dating when visiting friends or family in another city: 1) Ask your local friends/family for recommendations — they know the best spots not on Google. 2) If a friend can introduce you to people, take the opportunity — dates through mutual contacts have higher success rates. 3) Combine plans: a group outing with friends can lead to meeting someone interesting. 4) Use the app to match in the city you\'ll visit, but be honest about how long you\'ll be there. 5) Local markets, weekend fairs, and cultural events are great for meeting people organically. 6) Having family in that city gives you a comfortable base to explore and date without time pressure.',
  },

  // ═══════════════════════════════════════════════════════════════
  // MATCH IN ANOTHER CITY — your match lives elsewhere
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'match_other_city',
    language: 'es',
    text: 'Cuando tu match o crush vive en otra ciudad: 1) Empieza con videollamadas antes de planificar un viaje — verifica la conexión antes de invertir tiempo y dinero. 2) Si la química es buena, propón encontrarse en un punto medio o en la ciudad de uno de los dos. 3) Para la primera cita presencial, elige un lugar público y ten plan B (hotel, no quedarte en su casa la primera vez). 4) Comparte tu itinerario con alguien de confianza. 5) Planifica actividades para conocer la ciudad juntos — museos, parques, restaurantes locales. 6) Sé realista sobre la logística a largo plazo — la distancia no es insuperable pero requiere compromiso. 7) Si hay conexión, establezcan un plan de visitas regulares. 8) La primera visita debería ser corta (2-3 días) para no sentir presión.',
  },
  {
    category: 'match_other_city',
    language: 'en',
    text: 'When your match or crush lives in another city: 1) Start with video calls before planning a trip — verify the connection before investing time and money. 2) If chemistry is good, suggest meeting at a midpoint or in one person\'s city. 3) For the first in-person date, choose a public place and have a backup plan (hotel, don\'t stay at their place the first time). 4) Share your itinerary with someone you trust. 5) Plan activities to explore the city together — museums, parks, local restaurants. 6) Be realistic about long-term logistics — distance isn\'t insurmountable but requires commitment. 7) If there\'s a connection, establish a regular visit schedule. 8) Keep the first visit short (2-3 days) to avoid pressure.',
  },

  // ═══════════════════════════════════════════════════════════════
  // CITY EXPLORATION DATING — using places to date
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'city_exploration',
    language: 'es',
    text: 'Citas explorando la ciudad: 1) Los mejores restaurantes para citas no son los más caros — busca ambientes íntimos con buena iluminación y no demasiado ruidosos. 2) Los parques y plazas son ideales para primeras citas casuales — sin presión, puedes caminar y conversar. 3) Museos y galerías dan mucho de qué hablar — el arte genera conversaciones profundas. 4) Mercados y ferias gastronómicas permiten probar muchas cosas y mantener la energía alta. 5) Los rooftop bars son perfectos para citas al atardecer. 6) Las cafeterías de especialidad suelen tener ambiente tranquilo ideal para conocerse. 7) Evita cines para primeras citas — no puedes conversar. 8) Las actividades interactivas (cocina, cerámica, degustación) crean recuerdos compartidos.',
  },
  {
    category: 'city_exploration',
    language: 'en',
    text: 'City exploration dating: 1) The best date restaurants aren\'t the most expensive — look for intimate atmospheres with good lighting and not too noisy. 2) Parks and plazas are ideal for casual first dates — no pressure, you can walk and talk. 3) Museums and galleries give you plenty to discuss — art sparks deep conversations. 4) Food markets and gastronomic fairs let you try many things and keep the energy high. 5) Rooftop bars are perfect for sunset dates. 6) Specialty coffee shops usually have calm atmospheres ideal for getting to know someone. 7) Avoid cinemas for first dates — you can\'t talk. 8) Interactive activities (cooking classes, pottery, tastings) create shared memories.',
  },

  // ═══════════════════════════════════════════════════════════════
  // SAFETY — dating safety in unfamiliar cities
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'travel_safety',
    language: 'es',
    text: 'Seguridad al tener citas en ciudades nuevas o desconocidas: 1) SIEMPRE ten tu primera cita en un lugar público y concurrido. 2) Comparte tu ubicación en tiempo real con un amigo o familiar. 3) No compartas tu dirección de alojamiento en los primeros encuentros. 4) Investiga el barrio donde será la cita — evita zonas aisladas o que no conozcas. 5) Ten siempre batería en tu teléfono y datos móviles activos. 6) Lleva efectivo además de tarjeta — en ciudades desconocidas pueden fallar los pagos electrónicos. 7) No aceptes que tu cita te recoja en tu hotel las primeras veces. 8) Confía en tu instinto — si algo se siente raro, vete. 9) Ten el número de emergencias local guardado. 10) Si bebes alcohol, mantén el control — estás en territorio desconocido.',
  },
  {
    category: 'travel_safety',
    language: 'en',
    text: 'Safety tips for dating in new or unfamiliar cities: 1) ALWAYS have your first date in a public, busy location. 2) Share your real-time location with a friend or family member. 3) Don\'t share your accommodation address on early dates. 4) Research the neighborhood where the date will be — avoid isolated areas you don\'t know. 5) Keep your phone charged and mobile data active at all times. 6) Carry cash in addition to cards — electronic payments can fail in unfamiliar cities. 7) Don\'t let your date pick you up at your hotel the first few times. 8) Trust your instincts — if something feels off, leave. 9) Save the local emergency number. 10) If drinking alcohol, stay in control — you\'re in unfamiliar territory.',
  },

  // ═══════════════════════════════════════════════════════════════
  // CULTURAL AWARENESS — dating across cultures
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'cultural_dating',
    language: 'es',
    text: 'Conciencia cultural al tener citas en otros países: 1) En Latinoamérica, las citas suelen ser más informales y espontáneas — un café puede convertirse en una salida de todo el día. 2) En Europa, puntualidad es muy valorada — especialmente en Alemania, Suiza y países nórdicos. 3) En Japón, las muestras públicas de afecto son menos comunes — respeta el espacio personal. 4) En muchos países árabes, las citas públicas pueden tener restricciones culturales — investiga antes. 5) En Brasil, la cultura es muy física y cálida — los saludos con beso en la mejilla son normales. 6) En Estados Unidos, "splitting the bill" (dividir la cuenta) es común en primeras citas. 7) Aprende sobre tabúes locales — en algunos países, temas como religión o política son sensibles. 8) La comida es universal — invitar a probar platos locales siempre funciona como actividad de cita.',
  },
  {
    category: 'cultural_dating',
    language: 'en',
    text: 'Cultural awareness when dating in other countries: 1) In Latin America, dates tend to be more informal and spontaneous — a coffee can turn into an all-day outing. 2) In Europe, punctuality is highly valued — especially in Germany, Switzerland, and Nordic countries. 3) In Japan, public displays of affection are less common — respect personal space. 4) In many Arab countries, public dating may have cultural restrictions — research beforehand. 5) In Brazil, the culture is very physical and warm — cheek kisses as greetings are normal. 6) In the US, splitting the bill is common on first dates. 7) Learn about local taboos — in some countries, topics like religion or politics are sensitive. 8) Food is universal — inviting someone to try local dishes always works as a date activity.',
  },

  // ═══════════════════════════════════════════════════════════════
  // NIGHTLIFE — bars, clubs, nightlife in different cities
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'nightlife_dating',
    language: 'es',
    text: 'Vida nocturna y citas en diferentes ciudades: 1) Buenos Aires: la noche empieza tarde (después de medianoche) — los bares de Palermo y San Telmo son ideales para citas. 2) Madrid: la movida se concentra en Malasaña, Chueca y La Latina — las terrazas son perfectas en verano. 3) Ciudad de México: Condesa, Roma y Polanco tienen la mejor escena de bares craft y rooftops. 4) Bogotá: la Zona T y Usaquén tienen opciones para todos los gustos. 5) Santiago: Bellavista y Lastarria son los barrios con más vida nocturna para citas. 6) São Paulo: Vila Madalena y Jardins tienen los mejores bares y restaurantes. 7) Lima: Barranco y Miraflores son los barrios bohemios perfectos para primeras citas. 8) Regla universal: los cócteles crean mejor ambiente de cita que las discotecas ruidosas.',
  },
  {
    category: 'nightlife_dating',
    language: 'en',
    text: 'Nightlife and dating in different cities: 1) Buenos Aires: nightlife starts late (after midnight) — bars in Palermo and San Telmo are ideal for dates. 2) Madrid: the scene centers around Malasaña, Chueca, and La Latina — terraces are perfect in summer. 3) Mexico City: Condesa, Roma, and Polanco have the best craft bar and rooftop scenes. 4) Bogotá: Zona T and Usaquén have options for all tastes. 5) Santiago: Bellavista and Lastarria are the neighborhoods with most nightlife for dates. 6) São Paulo: Vila Madalena and Jardins have the best bars and restaurants. 7) Lima: Barranco and Miraflores are the bohemian neighborhoods perfect for first dates. 8) Universal rule: cocktail bars create better date atmospheres than loud nightclubs.',
  },

  // ═══════════════════════════════════════════════════════════════
  // FRENCH TRAVEL DATING
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'travel_dating',
    language: 'fr',
    text: 'Conseils pour les rendez-vous en voyage : 1) Recherchez les quartiers populaires et sûrs avant d\'arriver. 2) Les cafés et bars de quartier sont meilleurs pour un premier rendez-vous que les pièges à touristes. 3) Soyez honnête dans votre profil que vous êtes de passage. 4) Proposez des activités en journée si vous ne connaissez pas la ville. 5) Partagez votre localisation en temps réel avec un ami de confiance. 6) Les visites gastronomiques sont d\'excellents premiers rendez-vous. 7) Apprenez quelques phrases dans la langue locale.',
  },

  // ═══════════════════════════════════════════════════════════════
  // GERMAN TRAVEL DATING
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'travel_dating',
    language: 'de',
    text: 'Dating-Tipps auf Reisen: 1) Recherchieren Sie sichere und beliebte Viertel vor Ihrer Ankunft. 2) Nachbarschaftscafés und Bars sind besser für erste Dates als Touristenfallen. 3) Seien Sie in Ihrem Profil ehrlich, dass Sie auf Besuch sind. 4) Schlagen Sie Tagesaktivitäten vor, wenn Sie die Stadt nicht gut kennen. 5) Teilen Sie Ihren Standort in Echtzeit mit einem vertrauenswürdigen Freund. 6) Food-Touren sind ausgezeichnete erste Dates. 7) Lernen Sie ein paar Sätze in der Landessprache.',
  },

  // ═══════════════════════════════════════════════════════════════
  // JAPANESE TRAVEL DATING
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'travel_dating',
    language: 'ja',
    text: '旅行先でのデートのコツ：1）到着前に安全で人気のある地域を調べましょう。2）観光地よりも地元のカフェやバーの方が初デートに最適です。3）プロフィールで訪問者であることを正直に伝えましょう。4）街をよく知らない場合は日中のアクティビティを提案しましょう。5）信頼できる友人にリアルタイムで位置情報を共有しましょう。6）フードツアーは素晴らしい初デートになります。7）現地の言葉を少し学びましょう。',
  },

  // ═══════════════════════════════════════════════════════════════
  // ARABIC TRAVEL DATING
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'travel_dating',
    language: 'ar',
    text: 'نصائح للمواعدة أثناء السفر: 1) ابحث عن الأحياء الآمنة والشعبية قبل وصولك. 2) المقاهي والبارات المحلية أفضل للموعد الأول من الأماكن السياحية. 3) كن صادقاً في ملفك الشخصي أنك زائر. 4) اقترح أنشطة نهارية إذا كنت لا تعرف المدينة جيداً. 5) شارك موقعك في الوقت الفعلي مع صديق موثوق. 6) جولات الطعام هي مواعيد أولى ممتازة. 7) تعلم بعض العبارات باللغة المحلية.',
  },

  // ═══════════════════════════════════════════════════════════════
  // INDONESIAN TRAVEL DATING
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'travel_dating',
    language: 'id',
    text: 'Tips kencan saat traveling: 1) Riset lingkungan yang aman dan populer sebelum tiba. 2) Kafe dan bar lokal lebih baik untuk kencan pertama daripada tempat wisata. 3) Jujur di profil bahwa kamu sedang berkunjung. 4) Sarankan aktivitas siang hari jika tidak kenal kota. 5) Bagikan lokasi real-time dengan teman terpercaya. 6) Food tour adalah kencan pertama yang bagus. 7) Pelajari beberapa frasa dalam bahasa lokal.',
  },
];

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const isDelete = process.argv.includes('--delete');

  // Initialize Firebase Admin
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({projectId: 'black-sugar21'});
  }
  const db = admin.firestore();

  // Generate embeddings using Gemini
  const {GoogleGenerativeAI} = require('@google/generative-ai');
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

  if (!apiKey && !isDelete) {
    // Try reading from .env or functions config
    try {
      const fs = require('fs');
      const envPath = require('path').join(__dirname, '..', 'functions', '.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const match = envContent.match(/GEMINI_API_KEY=(.+)/);
        if (match) process.env.GEMINI_API_KEY = match[1].trim();
      }
    } catch (e) { /* ignore */ }
  }

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

  if (isDelete) {
    console.log('🗑️  Deleting travel RAG chunks...');
    const categories = [...new Set(CHUNKS.map(c => c.category))];
    let deleted = 0;
    for (const cat of categories) {
      const snap = await db.collection('coachKnowledge').where('category', '==', cat).get();
      if (!snap.empty) {
        const batch = db.batch();
        snap.docs.forEach(d => batch.delete(d.ref));
        if (!isDryRun) await batch.commit();
        deleted += snap.size;
        console.log(`  Deleted ${snap.size} chunks for category "${cat}"`);
      }
    }
    console.log(`✅ Deleted ${deleted} total chunks${isDryRun ? ' (dry run)' : ''}`);
    return;
  }

  if (!geminiKey) {
    console.error('❌ GEMINI_API_KEY not found. Set it as env var or in functions/.env');
    process.exit(1);
  }

  const genai = new GoogleGenerativeAI(geminiKey);
  const embeddingModel = genai.getGenerativeModel({model: 'gemini-embedding-001'});

  console.log(`📚 Seeding ${CHUNKS.length} travel/dating RAG chunks...`);
  if (isDryRun) console.log('   (DRY RUN — no data will be written)\n');

  let success = 0;
  let failed = 0;

  for (let i = 0; i < CHUNKS.length; i++) {
    const chunk = CHUNKS[i];
    const label = `[${i + 1}/${CHUNKS.length}] ${chunk.category} (${chunk.language})`;

    try {
      // Generate embedding
      const embResult = await embeddingModel.embedContent({
        content: {parts: [{text: chunk.text}]},
        taskType: 'RETRIEVAL_DOCUMENT',
        outputDimensionality: 768,
      });
      const embedding = embResult.embedding.values;

      if (!isDryRun) {
        // Write to Firestore
        await db.collection('coachKnowledge').add({
          text: chunk.text,
          category: chunk.category,
          language: chunk.language,
          embedding: embedding,
          source: 'seed-coach-rag-travel',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      console.log(`  ✅ ${label} — ${chunk.text.substring(0, 60)}...`);
      success++;

      // Rate limit: 60 req/min for embeddings API
      if (i < CHUNKS.length - 1) await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`  ❌ ${label} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${success} success, ${failed} failed${isDryRun ? ' (dry run)' : ''}`);

  // Show final stats
  if (!isDryRun) {
    const snap = await db.collection('coachKnowledge').count().get();
    console.log(`📚 Total coachKnowledge chunks: ${snap.data().count}`);
  }
}

main().catch(console.error);
