#!/usr/bin/env node
/**
 * seed-coach-rag-travel-v2.js — Extended RAG chunks for travel/dating edge cases
 * Adds: missing languages (RU, ZH, KO, TR), expat dating, business trips,
 * study abroad, language barriers, seasonal/festival, digital nomad,
 * relocation, first time abroad, budget travel, luxury travel, group trips
 *
 * Usage:
 *   NODE_PATH=./node_modules GEMINI_API_KEY=xxx node ../scripts/seed-coach-rag-travel-v2.js
 *   NODE_PATH=./node_modules GEMINI_API_KEY=xxx node ../scripts/seed-coach-rag-travel-v2.js --dry-run
 *   NODE_PATH=./node_modules GEMINI_API_KEY=xxx node ../scripts/seed-coach-rag-travel-v2.js --delete
 */
'use strict';

const CHUNKS = [
  // ═══════════════════════════════════════════════════════════════
  // MISSING LANGUAGES — travel_dating core in RU, ZH, KO, TR, IT
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'travel_dating',
    language: 'ru',
    text: 'Советы по свиданиям в путешествии: 1) Изучите безопасные и популярные районы заранее — Google Maps и отзывы помогут. 2) Местные кафе и бары лучше для первого свидания, чем туристические места — они более аутентичны. 3) Будьте честны в профиле, что вы гость — честность вызывает доверие. 4) Предлагайте дневные активности, если не знаете город (парки, музеи, рынки). 5) Делитесь геолокацией с другом. 6) Гастрономические туры — отличные первые свидания. 7) Выучите несколько фраз на местном языке. 8) Используйте приложение для знакомств заранее — поставьте локацию на город назначения.',
  },
  {
    category: 'travel_dating',
    language: 'zh',
    text: '旅行约会建议：1）提前研究安全且受欢迎的社区。2）当地咖啡馆和酒吧比旅游景点更适合第一次约会。3）在个人资料中诚实说明你是访客。4）如果不熟悉城市，建议白天活动（公园、博物馆、市场）。5）与信任的朋友分享实时位置。6）美食之旅是很棒的第一次约会。7）学几句当地语言。8）提前设置约会应用的位置到目的地城市。9）尊重当地文化和约会习惯。10）在公共场所见面，保持手机电量充足。',
  },
  {
    category: 'travel_dating',
    language: 'ko',
    text: '여행 중 데이트 팁: 1) 도착 전에 안전하고 인기 있는 동네를 조사하세요. 2) 관광지보다 동네 카페나 바가 첫 데이트에 더 좋습니다. 3) 프로필에 방문자임을 솔직히 밝히세요. 4) 도시를 잘 모르면 낮 활동을 제안하세요 (공원, 박물관, 시장). 5) 신뢰할 수 있는 친구에게 실시간 위치를 공유하세요. 6) 푸드 투어는 훌륭한 첫 데이트입니다. 7) 현지 언어를 몇 마디 배우세요. 8) 데이팅 앱에서 미리 목적지 위치를 설정하세요.',
  },
  {
    category: 'travel_dating',
    language: 'tr',
    text: 'Seyahatte flört ipuçları: 1) Varmadan önce güvenli ve popüler mahalleleri araştırın. 2) Turistik yerler yerine mahalle kafelerı ve barları ilk buluşma için daha iyidir. 3) Profilinizde ziyaretçi olduğunuzu dürüstçe belirtin. 4) Şehri iyi tanımıyorsanız gündüz aktiviteleri önerin (parklar, müzeler, pazarlar). 5) Güvendiğiniz bir arkadaşınızla gerçek zamanlı konum paylaşın. 6) Yemek turları harika ilk buluşmalardır. 7) Yerel dilde birkaç cümle öğrenin.',
  },
  {
    category: 'travel_dating',
    language: 'it',
    text: 'Consigli per appuntamenti in viaggio: 1) Ricerca i quartieri sicuri e popolari prima di arrivare. 2) I caffè e bar di quartiere sono migliori per il primo appuntamento rispetto alle trappole per turisti. 3) Sii onesto nel profilo che sei in visita. 4) Suggerisci attività diurne se non conosci la città (parchi, musei, mercati). 5) Condividi la tua posizione in tempo reale con un amico fidato. 6) I food tour sono ottimi primi appuntamenti. 7) Impara qualche frase nella lingua locale.',
  },

  // ═══════════════════════════════════════════════════════════════
  // LONG DISTANCE — missing languages
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'long_distance',
    language: 'fr',
    text: 'Conseils pour les relations à distance : 1) La communication régulière est essentielle — définissez la fréquence des messages/appels. 2) Planifiez des visites régulières en alternant qui voyage. 3) Faites des "rendez-vous virtuels" en visio — cuisinez ensemble, regardez un film. 4) Envoyez des surprises : fleurs, lettres, cadeaux locaux. 5) Parlez de l\'avenir — avoir un plan réduit l\'anxiété. 6) Découvrez la ville de l\'autre — visitez leurs endroits préférés. 7) La confiance est fondamentale. 8) Gardez la première visite courte (2-3 jours).',
  },
  {
    category: 'long_distance',
    language: 'de',
    text: 'Tipps für Fernbeziehungen: 1) Regelmäßige Kommunikation ist der Schlüssel — legen Sie Erwartungen für Nachrichten/Anrufe fest. 2) Planen Sie regelmäßige Besuche und wechseln Sie ab, wer reist. 3) Machen Sie Video-"virtuelle Dates" — kochen Sie zusammen, schauen Sie Filme. 4) Senden Sie Überraschungen: Blumen, Briefe, lokale Geschenke. 5) Sprechen Sie über die Zukunft — ein Plan reduziert Ängste. 6) Lernen Sie die Stadt des anderen kennen. 7) Vertrauen ist fundamental. 8) Halten Sie den ersten Besuch kurz (2-3 Tage).',
  },
  {
    category: 'long_distance',
    language: 'it',
    text: 'Consigli per relazioni a distanza: 1) La comunicazione costante è fondamentale — definite le aspettative. 2) Pianificate visite regolari alternando chi viaggia. 3) Fate "appuntamenti virtuali" in videochiamata. 4) Inviate sorprese: fiori, lettere, regali locali. 5) Parlate del futuro — avere un piano riduce l\'ansia. 6) Conoscete la città dell\'altro. 7) La fiducia è essenziale. 8) Mantenete la prima visita breve (2-3 giorni).',
  },
  {
    category: 'long_distance',
    language: 'ru',
    text: 'Советы для отношений на расстоянии: 1) Регулярное общение — ключ. Определите частоту сообщений/звонков. 2) Планируйте регулярные визиты, чередуя кто приезжает. 3) Устраивайте "виртуальные свидания" по видео — готовьте вместе, смотрите фильмы. 4) Отправляйте сюрпризы: цветы, письма, местные подарки. 5) Говорите о будущем — план снижает тревогу. 6) Узнайте город друг друга. 7) Доверие — фундамент. 8) Первый визит — короткий (2-3 дня).',
  },
  {
    category: 'long_distance',
    language: 'zh',
    text: '异地恋建议：1）保持定期沟通——确定消息/通话频率。2）计划定期探访，轮流出行。3）进行视频"虚拟约会"——一起做饭、看电影。4）发送惊喜：花、信、当地礼物。5）谈论未来——有计划能减少焦虑。6）了解彼此的城市。7）信任是基础。8）第一次见面保持短期（2-3天）。',
  },
  {
    category: 'long_distance',
    language: 'ko',
    text: '장거리 연애 팁: 1) 꾸준한 소통이 핵심 — 메시지/통화 빈도를 정하세요. 2) 정기적인 방문을 계획하고 번갈아 여행하세요. 3) 영상통화로 "가상 데이트"를 하세요. 4) 서프라이즈를 보내세요: 꽃, 편지, 지역 선물. 5) 미래에 대해 이야기하세요. 6) 서로의 도시를 알아가세요. 7) 신뢰가 기본입니다. 8) 첫 방문은 짧게 (2-3일).',
  },
  {
    category: 'long_distance',
    language: 'ja',
    text: '遠距離恋愛のアドバイス：1）定期的なコミュニケーションが鍵 — メッセージ/通話の頻度を決めましょう。2）定期的な訪問を計画し、交互に旅行しましょう。3）ビデオ通話で「バーチャルデート」をしましょう。4）サプライズを送りましょう：花、手紙、地元のプレゼント。5）将来について話しましょう。6）お互いの街を知りましょう。7）信頼が基本です。8）最初の訪問は短めに（2-3日）。',
  },
  {
    category: 'long_distance',
    language: 'ar',
    text: 'نصائح للعلاقات عن بعد: 1) التواصل المنتظم هو المفتاح — حددا توقعات الرسائل/المكالمات. 2) خططا لزيارات منتظمة وتناوبا في السفر. 3) أجريا "مواعيد افتراضية" عبر الفيديو. 4) أرسلا المفاجآت: زهور، رسائل، هدايا محلية. 5) تحدثا عن المستقبل. 6) تعرفا على مدينة بعضكما. 7) الثقة أساسية. 8) اجعلا الزيارة الأولى قصيرة (2-3 أيام).',
  },
  {
    category: 'long_distance',
    language: 'id',
    text: 'Tips hubungan jarak jauh: 1) Komunikasi rutin adalah kunci — tentukan frekuensi pesan/telepon. 2) Rencanakan kunjungan rutin dan bergantian siapa yang traveling. 3) Lakukan "kencan virtual" lewat video call. 4) Kirim kejutan: bunga, surat, oleh-oleh lokal. 5) Bicarakan masa depan — punya rencana mengurangi kecemasan. 6) Kenali kota masing-masing. 7) Kepercayaan itu fundamental. 8) Kunjungan pertama sebaiknya singkat (2-3 hari).',
  },

  // ═══════════════════════════════════════════════════════════════
  // EXPAT DATING — living abroad permanently/long-term
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'expat_dating',
    language: 'es',
    text: 'Citas siendo expatriado: 1) Los grupos de expatriados (Facebook, Meetup, InterNations) son excelentes para conocer gente en tu situación. 2) No te limites solo a otros expatriados — conocer locales te ayuda a integrarte y aprender la cultura. 3) Sé honesto sobre tus planes — ¿te quedas permanentemente o es temporal? Esto es crucial para la otra persona. 4) Aprende el idioma local lo más posible — aunque hables inglés, el esfuerzo se valora enormemente. 5) Las diferencias culturales en citas pueden ser grandes — investiga las normas locales (quién paga, cómo se saluda, ritmo de la relación). 6) Los mercados locales, clases de cocina y eventos culturales son perfectos para conocer gente auténtica. 7) La nostalgia puede afectar tus relaciones — mantén conexión con tu cultura pero abraza la nueva. 8) Si sales con alguien local, respeta su cultura y familia — en muchos países, la familia tiene un rol central en las relaciones.',
  },
  {
    category: 'expat_dating',
    language: 'en',
    text: 'Dating as an expat: 1) Expat groups (Facebook, Meetup, InterNations) are excellent for meeting people in your situation. 2) Don\'t limit yourself to other expats — meeting locals helps you integrate and learn the culture. 3) Be honest about your plans — are you staying permanently or temporarily? This is crucial for the other person. 4) Learn the local language as much as possible — even if you speak English, the effort is hugely appreciated. 5) Cultural differences in dating can be significant — research local norms (who pays, greetings, relationship pace). 6) Local markets, cooking classes, and cultural events are perfect for meeting authentic people. 7) Homesickness can affect your relationships — maintain your cultural connections but embrace the new. 8) If dating a local, respect their culture and family — in many countries, family plays a central role in relationships.',
  },

  // ═══════════════════════════════════════════════════════════════
  // BUSINESS TRIP DATING — limited time, professional context
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'business_trip_dating',
    language: 'es',
    text: 'Citas en viajes de negocios: 1) Sé transparente sobre tu disponibilidad limitada — "estoy aquí por trabajo hasta el viernes" es perfecto. 2) Los bares de hotel son convenientes pero impersonales — mejor busca bares locales cerca de tu zona. 3) Sugiere cenas o cócteles después del horario laboral — las comidas de 1 hora funcionan bien para primeras citas rápidas. 4) Si viajas frecuentemente al mismo destino, menciona que visitarás de nuevo — esto abre la puerta a algo más. 5) Mantén separados lo profesional y lo personal — no uses LinkedIn para citas. 6) Los restaurantes del centro financiero suelen cerrar temprano — busca opciones en barrios residenciales. 7) El jet lag es real — no planees citas la primera noche si vuelas lejos.',
  },
  {
    category: 'business_trip_dating',
    language: 'en',
    text: 'Dating on business trips: 1) Be transparent about your limited availability — "I\'m here for work until Friday" is perfect. 2) Hotel bars are convenient but impersonal — find local bars near your area instead. 3) Suggest dinners or cocktails after work hours — one-hour meals work well for quick first dates. 4) If you travel frequently to the same destination, mention you\'ll visit again — this opens the door to something more. 5) Keep professional and personal separate — don\'t use LinkedIn for dating. 6) Financial district restaurants often close early — look for options in residential neighborhoods. 7) Jet lag is real — don\'t plan dates your first night if flying far.',
  },

  // ═══════════════════════════════════════════════════════════════
  // STUDY ABROAD — university/exchange student dating
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'study_abroad_dating',
    language: 'es',
    text: 'Citas como estudiante de intercambio: 1) Las universidades son el mejor lugar para conocer gente — clubs, fiestas, bibliotecas, comedores. 2) Las apps funcionan bien en ciudades universitarias — muchos otros estudiantes las usan. 3) Sé claro sobre cuánto tiempo te quedarás — un semestre o un año cambia las expectativas. 4) Los erasmus parties y eventos de integración son perfectos para conocer gente de todo el mundo. 5) Aprovecha el presupuesto estudiantil — un picnic en el parque o café en la universidad son citas perfectas. 6) Los grupos de idiomas (language exchange/tandem) combinan aprendizaje con socialización. 7) La residencia universitaria facilita encontrarse — pero respeta los límites. 8) Estudiar juntos puede ser sorprendentemente romántico.',
  },
  {
    category: 'study_abroad_dating',
    language: 'en',
    text: 'Dating as a study abroad student: 1) Universities are the best place to meet people — clubs, parties, libraries, dining halls. 2) Dating apps work well in college towns — many other students use them. 3) Be clear about how long you\'re staying — a semester vs a year changes expectations. 4) Erasmus parties and integration events are perfect for meeting people from around the world. 5) Embrace the student budget — a picnic in the park or campus coffee are perfect dates. 6) Language exchange groups combine learning with socializing. 7) University housing makes it easy to meet — but respect boundaries. 8) Studying together can be surprisingly romantic.',
  },

  // ═══════════════════════════════════════════════════════════════
  // LANGUAGE BARRIER — dating when you don't speak the same language
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'language_barrier',
    language: 'es',
    text: 'Citas con barrera idiomática: 1) Google Translate es tu aliado — pero no dependas 100% de él. Aprende frases básicas: "me gustas", "eres hermosa/o", "¿quieres salir?". 2) El lenguaje corporal es universal — sonríe, mantén contacto visual, gesticula. 3) Las actividades visuales funcionan mejor que las conversacionales — cocinar juntos, caminar, arte, deportes. 4) Usa fotos y videos para comunicar — mostrar lugares, comida, experiencias. 5) Aprende a decir cumplidos en su idioma — el esfuerzo vale más que la perfección. 6) La paciencia es fundamental — las malinterpretaciones son normales y pueden ser divertidas. 7) Apps de traducción con cámara pueden leer menús y señales. 8) El humor trasciende idiomas — no temas reírte de los malentendidos.',
  },
  {
    category: 'language_barrier',
    language: 'en',
    text: 'Dating with a language barrier: 1) Google Translate is your ally — but don\'t depend 100% on it. Learn basic phrases: "I like you", "you\'re beautiful", "want to go out?". 2) Body language is universal — smile, maintain eye contact, use gestures. 3) Visual activities work better than conversational ones — cooking together, walking, art, sports. 4) Use photos and videos to communicate — show places, food, experiences. 5) Learn to give compliments in their language — effort matters more than perfection. 6) Patience is key — misunderstandings are normal and can be funny. 7) Translation apps with cameras can read menus and signs. 8) Humor transcends languages — don\'t be afraid to laugh at misunderstandings.',
  },

  // ═══════════════════════════════════════════════════════════════
  // FESTIVAL / EVENT DATING — concerts, festivals, conventions
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'festival_dating',
    language: 'es',
    text: 'Citas en festivales y eventos: 1) Los festivales de música son excelentes para conocer gente — la música compartida genera conexión instantánea. 2) Las ferias gastronómicas permiten probar cosas nuevas juntos — excelente actividad de cita. 3) En Carnaval (Río, Barranquilla, Oruro), la energía es contagiosa — pero mantén la seguridad. 4) Las convenciones (comic-con, tech, gaming) conectan personas con intereses específicos. 5) Los mercados navideños en Europa son muy románticos — Viena, Praga, Estrasburgo. 6) Las fiestas locales (Fallas en Valencia, Oktoberfest en Múnich, Día de Muertos en México) ofrecen experiencias únicas. 7) Los festivales de cerveza/vino son perfectos para citas casuales. 8) Si vas a un festival grande, acuerden un punto de encuentro — la señal de celular puede fallar.',
  },
  {
    category: 'festival_dating',
    language: 'en',
    text: 'Dating at festivals and events: 1) Music festivals are great for meeting people — shared music creates instant connection. 2) Food fairs let you try new things together — excellent date activity. 3) During Carnival (Rio, Barranquilla, Venice), energy is contagious — but stay safe. 4) Conventions (comic-con, tech, gaming) connect people with specific interests. 5) Christmas markets in Europe are very romantic — Vienna, Prague, Strasbourg. 6) Local celebrations (Fallas in Valencia, Oktoberfest in Munich, Day of the Dead in Mexico) offer unique experiences. 7) Beer/wine festivals are perfect for casual dates. 8) At large festivals, agree on a meeting point — cell signal can fail.',
  },

  // ═══════════════════════════════════════════════════════════════
  // DIGITAL NOMAD — remote work + dating lifestyle
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'digital_nomad',
    language: 'es',
    text: 'Citas como nómada digital: 1) Coworkings son el Tinder del mundo nómada — conoces gente con estilo de vida similar. 2) Cafés de especialidad con WiFi son tu oficina y punto de encuentro. 3) Sé honesto: "no sé cuánto tiempo me quedaré" — muchos nómadas entienden esto. 4) Ciudades populares para nómadas: Bali (Canggu/Ubud), Lisboa, Medellín, CDMX, Chiang Mai, Tbilisi, Buenos Aires, Tenerife. 5) Los coliving spaces combinan vivienda y vida social — ideales para conocer gente. 6) Establece rutinas locales: café matutino, gym, mercado — la regularidad ayuda a crear conexiones. 7) Las comunidades de nómadas (Nomad List, Facebook groups) organizan meetups regulares. 8) La vulnerabilidad de una vida en movimiento puede crear conexiones profundas y rápidas.',
  },
  {
    category: 'digital_nomad',
    language: 'en',
    text: 'Dating as a digital nomad: 1) Coworking spaces are the Tinder of the nomad world — you meet people with similar lifestyles. 2) Specialty coffee shops with WiFi are your office and meeting point. 3) Be honest: "I don\'t know how long I\'ll stay" — many nomads understand this. 4) Popular nomad cities: Bali (Canggu/Ubud), Lisbon, Medellín, Mexico City, Chiang Mai, Tbilisi, Buenos Aires, Tenerife. 5) Coliving spaces combine housing and social life — ideal for meeting people. 6) Establish local routines: morning coffee, gym, market — regularity helps build connections. 7) Nomad communities (Nomad List, Facebook groups) organize regular meetups. 8) The vulnerability of a mobile life can create deep, fast connections.',
  },

  // ═══════════════════════════════════════════════════════════════
  // BUDGET TRAVEL DATING — backpacker, hostel, low cost
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'budget_dating',
    language: 'es',
    text: 'Citas con presupuesto bajo de viaje: 1) Los hostels organizan pub crawls y cenas comunitarias — perfectos para conocer gente. 2) Las mejores citas gratis: caminar por la ciudad, parques, plazas, atardeceres, street art tours. 3) Los mercados locales y puestos de comida callejera son más económicos y auténticos que restaurantes turísticos. 4) Cocinar juntos en la cocina del hostel es romántico y barato. 5) Free walking tours en muchas ciudades — solo dejas propina. 6) Las playas, senderos y miradores son gratis y románticos. 7) Los bares de happy hour ofrecen ambiente de cita a precio accesible. 8) Compartir experiencias simples (un helado en la plaza, ver músicos callejeros) crea recuerdos más genuinos que un restaurante caro.',
  },
  {
    category: 'budget_dating',
    language: 'en',
    text: 'Dating on a travel budget: 1) Hostels organize pub crawls and communal dinners — perfect for meeting people. 2) Best free dates: walking the city, parks, plazas, sunsets, street art tours. 3) Local markets and street food stalls are cheaper and more authentic than tourist restaurants. 4) Cooking together in the hostel kitchen is romantic and cheap. 5) Free walking tours in many cities — you just leave a tip. 6) Beaches, trails, and viewpoints are free and romantic. 7) Happy hour bars offer date atmosphere at accessible prices. 8) Sharing simple experiences (ice cream in the plaza, watching street musicians) creates more genuine memories than an expensive restaurant.',
  },

  // ═══════════════════════════════════════════════════════════════
  // SAFETY — missing languages
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'travel_safety',
    language: 'pt',
    text: 'Segurança em encontros em cidades desconhecidas: 1) SEMPRE tenha o primeiro encontro em um lugar público e movimentado. 2) Compartilhe sua localização em tempo real com um amigo. 3) Não compartilhe o endereço do seu hotel nos primeiros encontros. 4) Pesquise o bairro onde será o encontro. 5) Mantenha o celular carregado e com dados móveis. 6) Leve dinheiro além de cartão. 7) Não deixe seu date buscar você no hotel. 8) Confie no seu instinto — se algo parecer estranho, vá embora. 9) Salve o número de emergência local. 10) Se beber álcool, mantenha o controle.',
  },
  {
    category: 'travel_safety',
    language: 'fr',
    text: 'Sécurité pour les rendez-vous dans des villes inconnues : 1) TOUJOURS avoir le premier rendez-vous dans un lieu public et fréquenté. 2) Partagez votre localisation en temps réel avec un ami. 3) Ne partagez pas l\'adresse de votre hôtel lors des premiers rendez-vous. 4) Renseignez-vous sur le quartier du rendez-vous. 5) Gardez votre téléphone chargé avec des données mobiles. 6) Ayez du cash en plus de votre carte. 7) Ne laissez pas votre date vous chercher à l\'hôtel. 8) Faites confiance à votre instinct. 9) Enregistrez le numéro d\'urgence local. 10) Si vous buvez de l\'alcool, gardez le contrôle.',
  },
  {
    category: 'travel_safety',
    language: 'de',
    text: 'Sicherheit beim Dating in unbekannten Städten: 1) IMMER das erste Date an einem öffentlichen, belebten Ort. 2) Teilen Sie Ihren Standort in Echtzeit mit einem Freund. 3) Teilen Sie Ihre Hoteladresse nicht bei den ersten Dates. 4) Recherchieren Sie das Viertel des Dates. 5) Halten Sie Ihr Handy geladen mit mobilen Daten. 6) Haben Sie Bargeld dabei, nicht nur Karte. 7) Lassen Sie sich nicht am Hotel abholen. 8) Vertrauen Sie Ihrem Bauchgefühl. 9) Speichern Sie die lokale Notrufnummer. 10) Wenn Sie Alkohol trinken, behalten Sie die Kontrolle.',
  },
  {
    category: 'travel_safety',
    language: 'ru',
    text: 'Безопасность на свиданиях в незнакомых городах: 1) ВСЕГДА встречайтесь в общественном, людном месте. 2) Делитесь геолокацией в реальном времени с другом. 3) Не сообщайте адрес отеля на первых встречах. 4) Изучите район встречи. 5) Держите телефон заряженным с мобильным интернетом. 6) Имейте наличные кроме карты. 7) Не позволяйте забирать вас из отеля. 8) Доверяйте интуиции. 9) Сохраните номер экстренной помощи. 10) Контролируйте употребление алкоголя.',
  },
  {
    category: 'travel_safety',
    language: 'zh',
    text: '在陌生城市约会的安全提示：1）第一次约会必须在公共繁忙的场所。2）与朋友分享实时位置。3）前几次约会不要透露住宿地址。4）提前了解约会地点的社区。5）保持手机充电和数据开启。6）除了卡还要带现金。7）不要让约会对象到酒店接你。8）相信直觉——如果感觉不对就离开。9）保存当地急救电话。10）饮酒要适度控制。',
  },
  {
    category: 'travel_safety',
    language: 'ja',
    text: '知らない街でのデートの安全対策：1）初デートは必ず公共の賑やかな場所で。2）信頼できる友人にリアルタイムで位置情報を共有。3）最初のデートでは宿泊先の住所を教えない。4）デート場所の地域を事前に調べる。5）スマホの充電とモバイルデータを常にオン。6）カードに加えて現金も持つ。7）ホテルへの迎えは断る。8）直感を信じる——違和感があれば帰る。9）現地の緊急電話番号を保存。10）お酒は自制する。',
  },
  {
    category: 'travel_safety',
    language: 'ko',
    text: '낯선 도시에서 데이트할 때 안전 수칙: 1) 첫 데이트는 반드시 붐비는 공공장소에서. 2) 믿을 수 있는 친구에게 실시간 위치 공유. 3) 처음 몇 번의 데이트에서는 숙소 주소를 알려주지 마세요. 4) 데이트 장소의 동네를 미리 조사. 5) 핸드폰 충전과 데이터를 항상 유지. 6) 카드 외에 현금도 소지. 7) 호텔 픽업은 거절. 8) 직감을 믿으세요. 9) 현지 긴급전화 저장. 10) 음주는 적당히.',
  },
  {
    category: 'travel_safety',
    language: 'ar',
    text: 'السلامة في المواعدة بمدن غير مألوفة: 1) دائماً اجعل أول موعد في مكان عام ومزدحم. 2) شارك موقعك في الوقت الفعلي مع صديق. 3) لا تشارك عنوان فندقك في المواعيد الأولى. 4) ابحث عن الحي الذي سيكون فيه الموعد. 5) حافظ على شحن هاتفك وبيانات الجوال. 6) احمل نقوداً بالإضافة للبطاقة. 7) لا تسمح لموعدك باصطحابك من الفندق. 8) ثق بحدسك. 9) احفظ رقم الطوارئ المحلي. 10) إذا شربت الكحول، حافظ على السيطرة.',
  },
  {
    category: 'travel_safety',
    language: 'id',
    text: 'Keamanan kencan di kota asing: 1) SELALU adakan kencan pertama di tempat umum yang ramai. 2) Bagikan lokasi real-time dengan teman. 3) Jangan bagikan alamat hotel di kencan pertama. 4) Riset lingkungan tempat kencan. 5) Jaga HP tetap terisi dan data aktif. 6) Bawa uang tunai selain kartu. 7) Jangan biarkan pasangan kencan menjemput di hotel. 8) Percaya insting — jika ada yang aneh, pergi. 9) Simpan nomor darurat lokal. 10) Jika minum alkohol, jaga kendali.',
  },
  {
    category: 'travel_safety',
    language: 'tr',
    text: 'Yabancı şehirlerde buluşma güvenliği: 1) İlk buluşmayı HER ZAMAN halka açık, kalabalık bir yerde yapın. 2) Gerçek zamanlı konumunuzu bir arkadaşınızla paylaşın. 3) İlk buluşmalarda otel adresinizi paylaşmayın. 4) Buluşma yerinin mahallesini araştırın. 5) Telefonunuzu şarjlı ve mobil veri açık tutun. 6) Kartın yanı sıra nakit taşıyın. 7) Otelden aldırmayın. 8) İçgüdülerinize güvenin. 9) Yerel acil numarasını kaydedin. 10) Alkol içiyorsanız kontrolü elden bırakmayın.',
  },

  // ═══════════════════════════════════════════════════════════════
  // CULTURAL DATING — missing languages
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'cultural_dating',
    language: 'pt',
    text: 'Consciência cultural em encontros internacionais: 1) Na América Latina, encontros são informais e espontâneos. 2) Na Europa, pontualidade é muito valorizada. 3) No Japão, demonstrações públicas de afeto são menos comuns. 4) No Brasil, a cultura é muito calorosa — beijo na bochecha é normal. 5) Nos EUA, dividir a conta é comum no primeiro encontro. 6) Aprenda sobre tabus locais — religião e política podem ser sensíveis. 7) A comida é universal — convidar para experimentar pratos locais sempre funciona.',
  },
  {
    category: 'cultural_dating',
    language: 'fr',
    text: 'Conscience culturelle dans les rendez-vous internationaux : 1) En Amérique latine, les rendez-vous sont informels et spontanés. 2) En Europe, la ponctualité est très valorisée. 3) Au Japon, les démonstrations publiques d\'affection sont moins courantes. 4) Au Brésil, la culture est très chaleureuse — la bise est normale. 5) Aux États-Unis, partager l\'addition est courant au premier rendez-vous. 6) Apprenez les tabous locaux. 7) La nourriture est universelle — inviter à goûter des plats locaux fonctionne toujours.',
  },
  {
    category: 'cultural_dating',
    language: 'de',
    text: 'Kulturelles Bewusstsein beim internationalen Dating: 1) In Lateinamerika sind Dates informell und spontan. 2) In Europa wird Pünktlichkeit sehr geschätzt — besonders in Deutschland. 3) In Japan sind öffentliche Zärtlichkeiten weniger üblich. 4) In Brasilien ist die Kultur sehr warm — Wangenküsse sind normal. 5) In den USA ist Rechnung teilen beim ersten Date üblich. 6) Lernen Sie lokale Tabus kennen. 7) Essen ist universell — zum Probieren lokaler Gerichte einladen funktioniert immer.',
  },

  // ═══════════════════════════════════════════════════════════════
  // NIGHTLIFE — missing languages
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'nightlife_dating',
    language: 'pt',
    text: 'Vida noturna e encontros em diferentes cidades: 1) Buenos Aires: a noite começa tarde (depois da meia-noite) — bares em Palermo e San Telmo são ideais. 2) Lisboa: Bairro Alto e Cais do Sodré têm a melhor vida noturna. 3) São Paulo: Vila Madalena e Jardins têm os melhores bares. 4) Rio de Janeiro: Lapa e Botafogo são boêmios. 5) Madrid: Malasaña e Chueca — terraços no verão. 6) Cidade do México: Condesa e Roma têm os melhores rooftops. 7) Bogotá: Zona T e Usaquén. 8) Regra universal: bares de coquetéis criam melhor ambiente para encontros do que discotecas barulhentas.',
  },
  {
    category: 'nightlife_dating',
    language: 'fr',
    text: 'Vie nocturne et rendez-vous dans différentes villes : 1) Paris : Le Marais, Oberkampf, Saint-Germain — bars à cocktails et terrasses. 2) Barcelone : El Born, Gràcia — tapas bars parfaits pour un date. 3) Berlin : Kreuzberg, Friedrichshain — scène alternative unique. 4) Lisbonne : Bairro Alto, Cais do Sodré — ambiance bohème. 5) Montréal : Le Plateau, Mile End — bars artisanaux. 6) Bruxelles : Saint-Géry, Ixelles. 7) Lyon : Vieux Lyon, Presqu\'île. 8) Règle universelle : les bars à cocktails créent une meilleure ambiance que les discothèques bruyantes.',
  },

  // ═══════════════════════════════════════════════════════════════
  // RELOCATION DATING — recently moved to a new city
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'relocation_dating',
    language: 'es',
    text: 'Citas después de mudarte a una nueva ciudad: 1) Los primeros 3 meses son los más difíciles — sé paciente contigo mismo. 2) Únete a actividades grupales: clases de yoga, running clubs, voluntariado, clases de cocina. 3) Las apps de dating ayudan a expandir tu red social rápidamente. 4) No compares con tu ciudad anterior — abraza lo nuevo. 5) Explora tu nuevo barrio a pie — descubrirás cafés, tiendas y plazas que serán tus nuevos spots de citas. 6) Los compañeros de trabajo pueden presentarte gente local. 7) Di que sí a todas las invitaciones sociales los primeros meses — aunque te cueste. 8) No tengas prisa por encontrar pareja — primero conoce la ciudad y a ti mismo en ella.',
  },
  {
    category: 'relocation_dating',
    language: 'en',
    text: 'Dating after moving to a new city: 1) The first 3 months are the hardest — be patient with yourself. 2) Join group activities: yoga classes, running clubs, volunteering, cooking classes. 3) Dating apps help expand your social network quickly. 4) Don\'t compare with your previous city — embrace the new. 5) Explore your new neighborhood on foot — you\'ll discover cafés, shops, and plazas that become your new date spots. 6) Coworkers can introduce you to local people. 7) Say yes to all social invitations the first few months — even if it\'s hard. 8) Don\'t rush to find a partner — first get to know the city and yourself in it.',
  },

  // ═══════════════════════════════════════════════════════════════
  // FIRST TIME ABROAD — never traveled internationally before
  // ═══════════════════════════════════════════════════════════════
  {
    category: 'first_time_abroad',
    language: 'es',
    text: 'Primera vez en el extranjero y citas: 1) No te agobies — es normal sentir shock cultural los primeros días. 2) Descarga mapas offline y apps de traducción antes de viajar. 3) Lleva una copia de tu pasaporte (foto en el celular). 4) Infórmate sobre el tipo de enchufes, moneda local y propinas. 5) Las apps de dating internacionales (Tinder, Bumble) funcionan en casi todas las ciudades. 6) Prueba la comida local — es la mejor forma de conectar con la cultura. 7) No lleves objetos de valor innecesarios a las citas. 8) Aprende a decir "hola", "gracias", "por favor" y "me gustas" en el idioma local — cambia completamente la interacción. 9) El transporte público es más seguro que taxis no oficiales.',
  },
  {
    category: 'first_time_abroad',
    language: 'en',
    text: 'First time abroad and dating: 1) Don\'t overwhelm yourself — culture shock is normal the first few days. 2) Download offline maps and translation apps before traveling. 3) Carry a copy of your passport (photo on your phone). 4) Research plug types, local currency, and tipping customs. 5) International dating apps (Tinder, Bumble) work in almost every city. 6) Try local food — it\'s the best way to connect with the culture. 7) Don\'t bring unnecessary valuables to dates. 8) Learn to say "hello", "thank you", "please" and "I like you" in the local language — it completely changes the interaction. 9) Public transportation is safer than unofficial taxis.',
  },
];

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const isDelete = process.argv.includes('--delete');

  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({projectId: 'black-sugar21'});
  }
  const db = admin.firestore();

  const {GoogleGenerativeAI} = require('@google/generative-ai');
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

  if (isDelete) {
    console.log('🗑️  Deleting v2 travel RAG chunks...');
    const categories = [...new Set(CHUNKS.map(c => c.category))];
    let deleted = 0;
    for (const cat of categories) {
      const snap = await db.collection('coachKnowledge').where('category', '==', cat).where('source', '==', 'seed-coach-rag-travel-v2').get();
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
    console.error('❌ GEMINI_API_KEY not found');
    process.exit(1);
  }

  const genai = new GoogleGenerativeAI(geminiKey);
  const embeddingModel = genai.getGenerativeModel({model: 'gemini-embedding-001'});

  console.log(`📚 Seeding ${CHUNKS.length} extended travel/dating RAG chunks (v2)...`);
  if (isDryRun) console.log('   (DRY RUN)\n');

  let success = 0;
  let failed = 0;

  for (let i = 0; i < CHUNKS.length; i++) {
    const chunk = CHUNKS[i];
    const label = `[${i + 1}/${CHUNKS.length}] ${chunk.category} (${chunk.language})`;
    try {
      const embResult = await embeddingModel.embedContent({
        content: {parts: [{text: chunk.text}]},
        taskType: 'RETRIEVAL_DOCUMENT',
        outputDimensionality: 768,
      });
      const embedding = embResult.embedding.values;
      if (!isDryRun) {
        await db.collection('coachKnowledge').add({
          text: chunk.text,
          category: chunk.category,
          language: chunk.language,
          embedding: embedding,
          source: 'seed-coach-rag-travel-v2',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      console.log(`  ✅ ${label} — ${chunk.text.substring(0, 50)}...`);
      success++;
      if (i < CHUNKS.length - 1) await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`  ❌ ${label} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${success} success, ${failed} failed${isDryRun ? ' (dry run)' : ''}`);
  if (!isDryRun) {
    const snap = await db.collection('coachKnowledge').count().get();
    console.log(`📚 Total coachKnowledge chunks: ${snap.data().count}`);
  }
}

main().catch(console.error);
