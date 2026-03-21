#!/usr/bin/env node
/**
 * seed-coach-rag-travel-v3.js — Cultural dating norms per region/country + missing language coverage
 * Adds: detailed cultural norms for 25+ countries/regions, all missing language chunks for
 * expat/business/study/language_barrier/festival/digital_nomad/budget/relocation/first_time_abroad
 *
 * Usage:
 *   cd functions && NODE_PATH=./node_modules GEMINI_API_KEY=xxx node ../scripts/seed-coach-rag-travel-v3.js
 */
'use strict';

const CHUNKS = [
  // ═══════════════════════════════════════════════════════════════════════
  // CULTURAL DATING NORMS BY REGION — detailed per-country guidance
  // ═══════════════════════════════════════════════════════════════════════

  // --- LATIN AMERICA ---
  {
    category: 'cultural_dating_latam',
    language: 'es',
    text: 'Cultura de citas en Latinoamérica por país: ARGENTINA: La cena es sagrada — invitar a cenar es señal de interés serio. Los porteños son directos y apasionados. El mate compartido es íntimo. Palermo, San Telmo, Recoleta son barrios para citas. CHILE: Más reservados que otros latinos. "Carretear" (salir de fiesta) es social, no necesariamente romántico. El "once" (té de la tarde) es una cita clásica. COLOMBIA: Muy cálidos y expresivos. Bailar salsa/bachata es parte esencial de las citas. La familia se involucra temprano. Cali, Medellín, Bogotá tienen escenas distintas. MÉXICO: El "galanteo" es valorado — detalles como flores, abrir la puerta. Las cenas son largas y conversacionales. CDMX es cosmopolita; provincia más tradicional. PERÚ: La comida es central en la cultura — invitar a comer ceviche es la cita perfecta. Lima es más liberal; ciudades pequeñas más conservadoras. BRASIL: Extremadamente físicos y cariñosos. Besos en la primera cita son normales. "Ficar" (estar) es más casual que namorar (noviazgo). La playa es un contexto social importante.',
  },
  {
    category: 'cultural_dating_latam',
    language: 'en',
    text: 'Dating culture in Latin America by country: ARGENTINA: Dinner is sacred — inviting to dinner signals serious interest. Porteños are direct and passionate. Sharing mate is intimate. Palermo, San Telmo, Recoleta are date neighborhoods. CHILE: More reserved than other Latinos. "Carretear" (partying) is social, not necessarily romantic. "Once" (afternoon tea) is a classic date. COLOMBIA: Very warm and expressive. Dancing salsa/bachata is an essential part of dating. Family gets involved early. Cali, Medellín, Bogotá have distinct scenes. MEXICO: "Galanteo" (chivalry) is valued — details like flowers, opening doors. Dinners are long and conversational. CDMX is cosmopolitan; provinces more traditional. PERU: Food is central — inviting for ceviche is the perfect date. Lima is more liberal; small cities more conservative. BRAZIL: Extremely physical and affectionate. Kissing on the first date is normal. "Ficar" is more casual than "namorar" (dating). The beach is an important social context.',
  },

  // --- EUROPE ---
  {
    category: 'cultural_dating_europe',
    language: 'es',
    text: 'Cultura de citas en Europa por país: ESPAÑA: Las citas comienzan tarde (cena a las 21-22h). Las tapas compartidas son la cita perfecta. "Ir de cañas" (bares con cerveza) es la forma más común de primera cita. La vida social es en la calle. FRANCIA: Los franceses no tienen "citas" formales — simplemente pasan tiempo juntos. No hay la "charla" de exclusividad; se asume. El café es la primera cita clásica. Besos en las mejillas como saludo (1-4 según región). ITALIA: La comida es sagrada — nunca pongas kétchup en la pasta. "La passeggiata" (paseo nocturno) es romántica. Mamá es importante — ser aprobado por la familia es crucial. El espresso después de cenar es tradición. ALEMANIA: Puntualidad es fundamental — llegar tarde es una señal de falta de respeto. Las citas son directas y honestas. Dividir la cuenta es normal. Los alemanes valoran el espacio personal. REINO UNIDO: Los pubs son el centro de la vida social. El humor sarcástico es una forma de flirteo. Las rondas de bebidas son tradición — ofrécete a comprar la siguiente. El "dating" formal es más americanizado en las ciudades grandes.',
  },
  {
    category: 'cultural_dating_europe',
    language: 'en',
    text: 'Dating culture in Europe by country: SPAIN: Dates start late (dinner at 9-10 PM). Shared tapas are the perfect date. "Going for cañas" (beers at bars) is the most common first date. Social life happens on the street. FRANCE: The French don\'t have formal "dates" — they just spend time together. There\'s no exclusivity "talk"; it\'s assumed. Coffee is the classic first date. Cheek kisses as greeting (1-4 depending on region). ITALY: Food is sacred — never put ketchup on pasta. "La passeggiata" (evening stroll) is romantic. Mama is important — getting family approval is crucial. Espresso after dinner is tradition. GERMANY: Punctuality is fundamental — being late is disrespectful. Dates are direct and honest. Splitting the bill is normal. Germans value personal space. UK: Pubs are the center of social life. Sarcastic humor is a form of flirting. Buying rounds is tradition — offer to get the next one. Formal "dating" is more Americanized in big cities.',
  },
  {
    category: 'cultural_dating_europe',
    language: 'fr',
    text: 'Culture des rendez-vous en Europe : FRANCE : Les Français n\'ont pas de "rendez-vous" formels — ils passent simplement du temps ensemble. Il n\'y a pas de discussion sur l\'exclusivité ; c\'est implicite. Le café est le premier rendez-vous classique. La bise en guise de salut (1 à 4 selon la région). ESPAGNE : Les rendez-vous commencent tard (dîner à 21-22h). Les tapas partagées sont parfaites. ITALIE : La nourriture est sacrée. "La passeggiata" est romantique. L\'approbation de la mamma est cruciale. ALLEMAGNE : La ponctualité est fondamentale. Partager l\'addition est normal. ROYAUME-UNI : Les pubs sont le centre de la vie sociale. L\'humour sarcastique est une forme de drague.',
  },
  {
    category: 'cultural_dating_europe',
    language: 'de',
    text: 'Dating-Kultur in Europa: DEUTSCHLAND: Pünktlichkeit ist fundamental — Verspätung ist respektlos. Dates sind direkt und ehrlich. Rechnung teilen ist normal. Deutsche schätzen persönlichen Raum. Biergärten sind perfekt für Dates. ÖSTERREICH: Ähnlich wie Deutschland, aber etwas formeller. Kaffeehauskultur ist ideal für Dates. SCHWEIZ: Sehr pünktlich und ordentlich. Fondue-Abend ist ein klassisches Date. SPANIEN: Dates beginnen spät (Abendessen um 21-22 Uhr). Tapas teilen ist perfekt. FRANKREICH: Kein formelles "Dating" — man verbringt einfach Zeit zusammen. ITALIEN: Essen ist heilig. "La passeggiata" ist romantisch. UK: Pubs sind das Zentrum des sozialen Lebens.',
  },

  // --- ASIA ---
  {
    category: 'cultural_dating_asia',
    language: 'es',
    text: 'Cultura de citas en Asia por país/región: JAPÓN: Las muestras públicas de afecto son poco comunes. "Kokuhaku" (confesión de sentimientos) es un paso formal importante antes de ser pareja. Las citas grupales ("goukon") son populares para conocer gente. Los Love Hotels existen pero son para parejas establecidas. La puntualidad es crucial. COREA DEL SUR: Las parejas celebran aniversarios cada 100 días. Los matching outfits son populares. Las apps de dating tienen verificación estricta. Los karaoke (noraebang) son citas populares. CHINA: Las familias se involucran mucho. Los padres pueden hacer "blind dates" para sus hijos. Los regalos son importantes (nunca regales relojes — simboliza muerte). WeChat es esencial. INDIA: Las citas están evolucionando rápidamente en ciudades grandes pero siguen siendo conservadoras en áreas rurales. Muchas familias todavía prefieren matrimonios arreglados. Las cafeterías son los spots más seguros para citas. TAILANDIA: La cultura es muy amable y respetuosa. El "wai" (saludo con las manos juntas) es importante. Las muestras de afecto público son discretas. Los templos no son lugares de citas. SUDESTE ASIÁTICO: En general más conservador que Occidente. Respeta las normas religiosas locales (Islam en Malasia/Indonesia, Budismo en Myanmar/Camboya).',
  },
  {
    category: 'cultural_dating_asia',
    language: 'en',
    text: 'Dating culture in Asia by country/region: JAPAN: Public displays of affection are uncommon. "Kokuhaku" (confession of feelings) is a formal step before becoming a couple. Group dates ("goukon") are popular. Love Hotels exist but are for established couples. Punctuality is crucial. SOUTH KOREA: Couples celebrate every 100-day anniversary. Matching outfits are popular. Dating apps have strict verification. Karaoke (noraebang) is a popular date. CHINA: Families are very involved. Parents may arrange "blind dates" for their children. Gifts matter (never give clocks — symbolizes death). WeChat is essential. INDIA: Dating is evolving fast in big cities but remains conservative in rural areas. Many families still prefer arranged marriages. Cafés are the safest date spots. THAILAND: Culture is very kind and respectful. The "wai" (greeting with joined hands) is important. Public affection is discreet. Temples are not date spots. SOUTHEAST ASIA: Generally more conservative than the West. Respect local religious norms (Islam in Malaysia/Indonesia, Buddhism in Myanmar/Cambodia).',
  },
  {
    category: 'cultural_dating_asia',
    language: 'ja',
    text: 'アジアのデート文化：日本：公共の場での愛情表現は一般的ではありません。「告白」は正式なステップです。合コンは人気の出会い方。ラブホテルはカップル向け。時間厳守が重要。韓国：カップルは100日ごとに記念日を祝います。ペアルックが人気。カラオケ（ノレバン）はデートの定番。中国：家族が深く関わります。親が見合いを設定することも。プレゼントが重要（時計は死を象徴するので贈らない）。WeChatは必須。インド：大都市では急速に変化中だが地方は保守的。カフェが安全なデートスポット。タイ：文化はとても親切で敬意に満ちています。ワイ（合掌の挨拶）が重要。',
  },
  {
    category: 'cultural_dating_asia',
    language: 'zh',
    text: '亚洲约会文化：日本：公共场合亲密行为不常见。"告白"是成为情侣前的正式步骤。联谊（合コン）是流行的认识方式。准时至关重要。韩国：情侣每100天庆祝纪念日。情侣装很流行。KTV是热门约会方式。中国：家庭参与度很高。父母可能为孩子安排相亲。礼物很重要（不要送钟——象征死亡）。微信是必备的。印度：大城市变化很快但农村仍保守。咖啡馆是最安全的约会地点。泰国：文化非常友善和尊重。合十礼（wai）很重要。公共场合的亲密行为要低调。',
  },
  {
    category: 'cultural_dating_asia',
    language: 'ko',
    text: '아시아 데이트 문화: 일본: 공공장소에서의 애정 표현은 흔하지 않습니다. "고백"은 커플이 되기 전 중요한 단계. 합콘(단체 미팅)이 인기. 시간 엄수가 중요. 한국: 커플은 100일마다 기념일을 축하합니다. 커플룩이 인기. 노래방이 인기 데이트. 데이팅 앱은 엄격한 인증. 중국: 가족이 매우 관여. 부모가 맞선을 주선할 수 있음. 선물이 중요 (시계는 죽음을 상징하므로 선물하지 말 것). 위챗 필수. 인도: 대도시에서 빠르게 변화 중이지만 시골은 보수적. 카페가 가장 안전한 데이트 장소. 태국: 문화가 매우 친절하고 예의 바름. 와이(합장 인사)가 중요.',
  },

  // --- MIDDLE EAST & NORTH AFRICA ---
  {
    category: 'cultural_dating_mena',
    language: 'es',
    text: 'Cultura de citas en Medio Oriente y Norte de África: EMIRATOS ÁRABES (Dubai/Abu Dhabi): Dubai es más liberal que otros países del Golfo. Restaurantes y cafés de hoteles son los mejores spots para citas. El Ramadán cambia la dinámica social — respeta los horarios de ayuno. No hay muestras de afecto público. TURQUÍA: Mezcla única de cultura europea y asiática. Estambul es cosmopolita; las ciudades pequeñas más tradicionales. El té turco es la invitación social por excelencia. La familia es central. MARRUECOS: Marrakech y Casablanca son más abiertas. Los riads (casas tradicionales) y restaurantes locales son perfectos para citas. Respeta las normas durante el Ramadán. LÍBANO: Beirut tiene una vida nocturna vibrante comparable a ciudades europeas. Los libaneses son muy sociables y hospitalarios. La comida libanesa compartida es una experiencia de cita excelente. EGYPT: Cairo tiene una escena de citas creciente. Los cafés del Nilo son románticos. Respeta las diferencias religiosas y culturales.',
  },
  {
    category: 'cultural_dating_mena',
    language: 'en',
    text: 'Dating culture in the Middle East & North Africa: UAE (Dubai/Abu Dhabi): Dubai is more liberal than other Gulf countries. Hotel restaurants and cafés are the best date spots. Ramadan changes social dynamics — respect fasting hours. No public displays of affection. TURKEY: Unique blend of European and Asian culture. Istanbul is cosmopolitan; smaller cities more traditional. Turkish tea is the quintessential social invitation. Family is central. MOROCCO: Marrakech and Casablanca are more open. Riads (traditional houses) and local restaurants are perfect for dates. Respect norms during Ramadan. LEBANON: Beirut has vibrant nightlife comparable to European cities. Lebanese people are very sociable and hospitable. Shared Lebanese food is an excellent date experience. EGYPT: Cairo has a growing dating scene. Nile cafés are romantic. Respect religious and cultural differences.',
  },
  {
    category: 'cultural_dating_mena',
    language: 'ar',
    text: 'ثقافة المواعدة في الشرق الأوسط وشمال أفريقيا: الإمارات (دبي/أبوظبي): دبي أكثر انفتاحاً من دول الخليج الأخرى. مطاعم ومقاهي الفنادق أفضل أماكن المواعدة. رمضان يغير الديناميكية الاجتماعية. لا عروض عاطفة علنية. تركيا: مزيج فريد من الثقافة الأوروبية والآسيوية. إسطنبول عالمية؛ المدن الصغيرة تقليدية أكثر. الشاي التركي هو الدعوة الاجتماعية المثالية. الأسرة محورية. المغرب: مراكش والدار البيضاء أكثر انفتاحاً. الرياض والمطاعم المحلية مثالية للمواعيد. لبنان: بيروت لديها حياة ليلية نابضة. المشاركة في الطعام اللبناني تجربة ممتازة. مصر: القاهرة لديها مشهد مواعدة متنامٍ. مقاهي النيل رومانسية.',
  },

  // --- OCEANIA & AFRICA ---
  {
    category: 'cultural_dating_other',
    language: 'es',
    text: 'Cultura de citas en Oceanía y África: AUSTRALIA: Muy casual y relajado. BBQs y playas son citas populares. "Shouting" (invitar rondas) es parte de la cultura. Los australianos son directos — si les gustas, te lo dicen. NUEVA ZELANDA: Outdoor culture — senderismo, kayak, camping son actividades de cita comunes. Los maoríes tienen tradiciones únicas de hospitalidad. SUDÁFRICA: Diversa culturalmente. Johannesburgo y Ciudad del Cabo son cosmopolitas. Los braais (asados) son sociales. KENIA/TANZANIA: Las grandes ciudades tienen escenas de citas modernas. Los safaris pueden ser citas espectaculares. NIGERIA: Lagos tiene una vida nocturna intensa. La cultura es cálida y familiar. La comida compartida (jollof rice) es social. GHANA: Accra es cada vez más cosmopolita. La hospitalidad es un valor central.',
  },
  {
    category: 'cultural_dating_other',
    language: 'en',
    text: 'Dating culture in Oceania & Africa: AUSTRALIA: Very casual and relaxed. BBQs and beaches are popular dates. "Shouting" (buying rounds) is part of the culture. Australians are direct — if they like you, they\'ll tell you. NEW ZEALAND: Outdoor culture — hiking, kayaking, camping are common date activities. Māori have unique traditions of hospitality. SOUTH AFRICA: Culturally diverse. Johannesburg and Cape Town are cosmopolitan. Braais (barbecues) are social. KENYA/TANZANIA: Big cities have modern dating scenes. Safaris can be spectacular dates. NIGERIA: Lagos has intense nightlife. Culture is warm and family-oriented. Shared food (jollof rice) is social. GHANA: Accra is increasingly cosmopolitan. Hospitality is a core value.',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // MISSING LANGUAGE CHUNKS — fill gaps for all edge case categories
  // ═══════════════════════════════════════════════════════════════════════

  // --- EXPAT in more languages ---
  {
    category: 'expat_dating',
    language: 'pt',
    text: 'Namoro como expatriado: 1) Grupos de expats (Facebook, Meetup, InterNations) são ótimos para conhecer gente na mesma situação. 2) Não se limite a outros expats — conhecer locais ajuda na integração. 3) Seja honesto sobre seus planos — temporário ou permanente? 4) Aprenda o idioma local o máximo possível. 5) Diferenças culturais podem ser grandes — pesquise normas locais. 6) Mercados locais e eventos culturais são perfeitos para conhecer gente autêntica. 7) Se namorar alguém local, respeite a cultura e família deles.',
  },
  {
    category: 'expat_dating',
    language: 'fr',
    text: 'Rencontres en tant qu\'expatrié : 1) Les groupes d\'expats (Facebook, Meetup, InterNations) sont excellents. 2) Ne vous limitez pas aux autres expats — rencontrer des locaux aide à s\'intégrer. 3) Soyez honnête sur vos plans — temporaire ou permanent ? 4) Apprenez la langue locale. 5) Les différences culturelles peuvent être significatives. 6) Marchés locaux et événements culturels sont parfaits. 7) Si vous sortez avec un(e) local(e), respectez sa culture et sa famille.',
  },
  {
    category: 'expat_dating',
    language: 'de',
    text: 'Dating als Expat: 1) Expat-Gruppen (Facebook, Meetup, InterNations) sind ausgezeichnet zum Kennenlernen. 2) Beschränken Sie sich nicht auf andere Expats — Einheimische kennenlernen hilft bei der Integration. 3) Seien Sie ehrlich über Ihre Pläne. 4) Lernen Sie die Landessprache. 5) Kulturelle Unterschiede können groß sein — recherchieren Sie lokale Normen. 6) Lokale Märkte und kulturelle Events sind perfekt. 7) Wenn Sie mit einem/einer Einheimischen ausgehen, respektieren Sie deren Kultur und Familie.',
  },
  {
    category: 'expat_dating',
    language: 'ru',
    text: 'Свидания будучи экспатом: 1) Группы экспатов (Facebook, Meetup, InterNations) отлично подходят. 2) Не ограничивайтесь другими экспатами — знакомство с местными помогает интегрироваться. 3) Будьте честны о своих планах. 4) Учите местный язык. 5) Культурные различия могут быть значительными. 6) Местные рынки и культурные мероприятия идеальны. 7) Если встречаетесь с местным жителем, уважайте их культуру.',
  },
  {
    category: 'expat_dating',
    language: 'zh',
    text: '作为外籍人士的约会建议：1）外籍人士群组（Facebook、Meetup、InterNations）是认识同类人的好途径。2）不要只和外国人交往——认识当地人有助于融入。3）对自己的计划保持诚实——临时还是长期？4）尽可能学习当地语言。5）文化差异可能很大——研究当地规范。6）当地市场和文化活动是认识真实人群的好地方。7）如果和当地人约会，尊重他们的文化和家庭。',
  },

  // --- LANGUAGE BARRIER in more languages ---
  {
    category: 'language_barrier',
    language: 'pt',
    text: 'Namoro com barreira linguística: 1) Google Translate é seu aliado — mas aprenda frases básicas. 2) Linguagem corporal é universal — sorria, mantenha contato visual. 3) Atividades visuais funcionam melhor que conversacionais — cozinhar juntos, caminhar, arte. 4) Use fotos e vídeos para comunicar. 5) Aprenda a dar elogios no idioma deles. 6) Paciência é fundamental — mal-entendidos são normais. 7) O humor transcende idiomas.',
  },
  {
    category: 'language_barrier',
    language: 'fr',
    text: 'Rendez-vous avec une barrière linguistique : 1) Google Translate est votre allié — mais apprenez des phrases de base. 2) Le langage corporel est universel — souriez, maintenez le contact visuel. 3) Les activités visuelles fonctionnent mieux — cuisiner ensemble, marcher, art. 4) Utilisez photos et vidéos pour communiquer. 5) Apprenez à faire des compliments dans leur langue. 6) La patience est clé. 7) L\'humour transcende les langues.',
  },
  {
    category: 'language_barrier',
    language: 'de',
    text: 'Dating mit Sprachbarriere: 1) Google Translate ist Ihr Verbündeter — aber lernen Sie Grundphrasen. 2) Körpersprache ist universell — lächeln, Blickkontakt halten. 3) Visuelle Aktivitäten funktionieren besser als Gespräche — zusammen kochen, spazieren, Kunst. 4) Nutzen Sie Fotos und Videos zur Kommunikation. 5) Lernen Sie Komplimente in ihrer Sprache. 6) Geduld ist der Schlüssel. 7) Humor überwindet Sprachen.',
  },
  {
    category: 'language_barrier',
    language: 'ja',
    text: '言語の壁がある中でのデート：1）Google翻訳は味方ですが、基本的なフレーズを学びましょう。2）ボディランゲージは世界共通——笑顔、アイコンタクト、ジェスチャー。3）会話より視覚的なアクティビティの方が効果的——一緒に料理、散歩、アート。4）写真や動画でコミュニケーション。5）相手の言語で褒め言葉を言えるようになりましょう。6）忍耐が大切——誤解は普通のこと。7）ユーモアは言語を超えます。',
  },
  {
    category: 'language_barrier',
    language: 'zh',
    text: '跨越语言障碍的约会：1）谷歌翻译是你的盟友——但要学基本短语。2）肢体语言是通用的——微笑、保持眼神接触、使用手势。3）视觉活动比对话更有效——一起做饭、散步、看艺术。4）用照片和视频沟通。5）学会用对方的语言说赞美的话。6）耐心是关键——误解是正常的。7）幽默超越语言。',
  },
  {
    category: 'language_barrier',
    language: 'ko',
    text: '언어 장벽이 있는 데이트: 1) 구글 번역은 당신의 동맹이지만 기본 표현을 배우세요. 2) 바디 랭귀지는 보편적입니다 — 미소, 눈 맞춤, 제스처. 3) 대화보다 시각적 활동이 더 효과적 — 함께 요리, 산책, 미술. 4) 사진과 동영상으로 소통하세요. 5) 상대 언어로 칭찬하는 법을 배우세요. 6) 인내가 핵심 — 오해는 정상입니다. 7) 유머는 언어를 초월합니다.',
  },
  {
    category: 'language_barrier',
    language: 'ar',
    text: 'المواعدة مع حاجز لغوي: 1) ترجمة جوجل حليفك — لكن تعلم عبارات أساسية. 2) لغة الجسد عالمية — ابتسم، حافظ على التواصل البصري. 3) الأنشطة البصرية أفضل من المحادثات — الطبخ معاً، المشي، الفن. 4) استخدم الصور والفيديو للتواصل. 5) تعلم المجاملات بلغتهم. 6) الصبر أساسي. 7) الفكاهة تتجاوز اللغات.',
  },

  // --- DIGITAL NOMAD in more languages ---
  {
    category: 'digital_nomad',
    language: 'pt',
    text: 'Namoro como nômade digital: 1) Coworkings são o Tinder do mundo nômade. 2) Cafés especiais com WiFi são seu escritório e ponto de encontro. 3) Seja honesto: "não sei quanto tempo vou ficar". 4) Cidades populares: Bali, Lisboa, Medellín, CDMX, Chiang Mai, Buenos Aires. 5) Coliving spaces combinam moradia e vida social. 6) Estabeleça rotinas locais. 7) Comunidades de nômades organizam meetups regulares. 8) A vulnerabilidade de uma vida em movimento cria conexões profundas.',
  },
  {
    category: 'digital_nomad',
    language: 'fr',
    text: 'Rencontres en tant que nomade digital : 1) Les espaces de coworking sont le Tinder du monde nomade. 2) Les cafés spécialisés avec WiFi sont votre bureau et point de rencontre. 3) Soyez honnête : "je ne sais pas combien de temps je resterai". 4) Villes populaires : Bali, Lisbonne, Medellín, Mexico, Chiang Mai, Buenos Aires, Tenerife. 5) Les espaces de coliving combinent logement et vie sociale. 6) Établissez des routines locales. 7) Les communautés nomades organisent des meetups réguliers.',
  },

  // --- FESTIVAL in more languages ---
  {
    category: 'festival_dating',
    language: 'pt',
    text: 'Namoro em festivais e eventos: 1) Festivais de música são ótimos para conhecer gente. 2) Feiras gastronômicas permitem experimentar coisas novas juntos. 3) No Carnaval (Rio, Salvador, Olinda) a energia é contagiante — mas mantenha a segurança. 4) Convenções (comic-con, tech, gaming) conectam pessoas com interesses específicos. 5) Mercados de Natal na Europa são românticos. 6) Festas locais oferecem experiências únicas. 7) Festivais de cerveja/vinho são perfeitos para encontros casuais.',
  },
  {
    category: 'festival_dating',
    language: 'fr',
    text: 'Rendez-vous lors de festivals : 1) Les festivals de musique sont parfaits pour rencontrer des gens. 2) Les foires gastronomiques permettent de découvrir ensemble. 3) Pendant le Carnaval, l\'énergie est contagieuse — mais restez en sécurité. 4) Les conventions connectent des gens avec des intérêts spécifiques. 5) Les marchés de Noël en Europe sont très romantiques — Vienne, Prague, Strasbourg. 6) Les fêtes locales offrent des expériences uniques (Fête des Lumières à Lyon, Oktoberfest). 7) Les festivals de bière/vin sont parfaits pour des dates décontractées.',
  },

  // --- STUDY ABROAD in more languages ---
  {
    category: 'study_abroad_dating',
    language: 'pt',
    text: 'Namoro como estudante de intercâmbio: 1) Universidades são o melhor lugar para conhecer gente. 2) Apps funcionam bem em cidades universitárias. 3) Seja claro sobre quanto tempo ficará. 4) Festas Erasmus e eventos de integração são perfeitos. 5) Aproveite o orçamento estudantil — piquenique no parque é um encontro perfeito. 6) Grupos de troca de idiomas combinam aprendizado e socialização. 7) Moradia universitária facilita encontros. 8) Estudar juntos pode ser surpreendentemente romântico.',
  },
  {
    category: 'study_abroad_dating',
    language: 'fr',
    text: 'Rencontres en échange universitaire : 1) Les universités sont le meilleur endroit pour rencontrer des gens. 2) Les apps fonctionnent bien dans les villes étudiantes. 3) Soyez clair sur la durée de votre séjour. 4) Les soirées Erasmus sont parfaites. 5) Budget étudiant — pique-nique au parc est un date parfait. 6) Les groupes d\'échange linguistique combinent apprentissage et socialisation. 7) Les résidences universitaires facilitent les rencontres. 8) Étudier ensemble peut être étonnamment romantique.',
  },
  {
    category: 'study_abroad_dating',
    language: 'de',
    text: 'Dating als Austauschstudent: 1) Universitäten sind der beste Ort zum Kennenlernen. 2) Dating-Apps funktionieren gut in Studentenstädten. 3) Seien Sie klar, wie lange Sie bleiben. 4) Erasmus-Partys sind perfekt. 5) Studentenbudget nutzen — Picknick im Park ist ein perfektes Date. 6) Sprachtandem-Gruppen kombinieren Lernen und Kennenlernen. 7) Studentenwohnheime erleichtern Treffen. 8) Zusammen lernen kann überraschend romantisch sein.',
  },

  // --- BUDGET in more languages ---
  {
    category: 'budget_dating',
    language: 'pt',
    text: 'Encontros com orçamento de viagem: 1) Hostels organizam pub crawls e jantares comunitários. 2) Melhores encontros grátis: caminhar pela cidade, parques, praças, pôr do sol. 3) Mercados locais e street food são mais baratos e autênticos. 4) Cozinhar juntos no hostel é romântico e barato. 5) Free walking tours — só deixe gorjeta. 6) Praias, trilhas e mirantes são gratuitos e românticos. 7) Happy hours oferecem ambiente acessível. 8) Experiências simples criam memórias mais genuínas.',
  },
  {
    category: 'budget_dating',
    language: 'fr',
    text: 'Rendez-vous avec un budget voyage : 1) Les auberges organisent des pub crawls et dîners communautaires. 2) Meilleurs dates gratuits : marcher dans la ville, parcs, couchers de soleil. 3) Marchés locaux et street food sont moins chers et plus authentiques. 4) Cuisiner ensemble dans l\'auberge est romantique et économique. 5) Free walking tours — laissez juste un pourboire. 6) Plages, sentiers et belvédères sont gratuits et romantiques. 7) Les happy hours offrent une ambiance accessible.',
  },

  // --- RELOCATION in more languages ---
  {
    category: 'relocation_dating',
    language: 'pt',
    text: 'Namoro depois de se mudar para uma nova cidade: 1) Os primeiros 3 meses são os mais difíceis — seja paciente. 2) Participe de atividades em grupo: yoga, clubes de corrida, voluntariado. 3) Apps de namoro ajudam a expandir a rede social rapidamente. 4) Não compare com sua cidade anterior. 5) Explore seu novo bairro a pé. 6) Colegas de trabalho podem apresentar gente local. 7) Diga sim a todos os convites sociais nos primeiros meses. 8) Não tenha pressa para encontrar um parceiro.',
  },
  {
    category: 'relocation_dating',
    language: 'fr',
    text: 'Rencontres après avoir déménagé : 1) Les 3 premiers mois sont les plus difficiles — soyez patient. 2) Rejoignez des activités de groupe : yoga, clubs de course, bénévolat, cuisine. 3) Les apps de rencontre aident à élargir votre réseau social rapidement. 4) Ne comparez pas avec votre ancienne ville. 5) Explorez votre nouveau quartier à pied. 6) Les collègues peuvent vous présenter des gens. 7) Dites oui à toutes les invitations sociales les premiers mois. 8) Ne vous pressez pas de trouver un partenaire.',
  },
  {
    category: 'relocation_dating',
    language: 'de',
    text: 'Dating nach dem Umzug in eine neue Stadt: 1) Die ersten 3 Monate sind am schwierigsten — seien Sie geduldig. 2) Nehmen Sie an Gruppenaktivitäten teil: Yoga, Laufgruppen, Ehrenamt. 3) Dating-Apps helfen, das soziale Netzwerk schnell zu erweitern. 4) Vergleichen Sie nicht mit Ihrer vorherigen Stadt. 5) Erkunden Sie Ihr neues Viertel zu Fuß. 6) Kollegen können Sie mit Einheimischen bekannt machen. 7) Sagen Sie ja zu allen sozialen Einladungen. 8) Überstürzen Sie nichts bei der Partnersuche.',
  },
];

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const isDelete = process.argv.includes('--delete');

  const admin = require('firebase-admin');
  if (!admin.apps.length) admin.initializeApp({projectId: 'black-sugar21'});
  const db = admin.firestore();
  const {GoogleGenerativeAI} = require('@google/generative-ai');
  const geminiKey = process.env.GEMINI_API_KEY;

  if (isDelete) {
    console.log('🗑️  Deleting v3 travel RAG chunks...');
    const snap = await db.collection('coachKnowledge').where('source', '==', 'seed-coach-rag-travel-v3').get();
    if (!snap.empty) {
      // Batch delete in groups of 450
      for (let i = 0; i < snap.docs.length; i += 450) {
        const batch = db.batch();
        snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        if (!isDryRun) await batch.commit();
      }
    }
    console.log(`✅ Deleted ${snap.size} chunks${isDryRun ? ' (dry run)' : ''}`);
    return;
  }

  if (!geminiKey) { console.error('❌ GEMINI_API_KEY not found'); process.exit(1); }
  const genai = new GoogleGenerativeAI(geminiKey);
  const embeddingModel = genai.getGenerativeModel({model: 'gemini-embedding-001'});

  console.log(`📚 Seeding ${CHUNKS.length} cultural/extended RAG chunks (v3)...`);
  if (isDryRun) console.log('   (DRY RUN)\n');

  let success = 0, failed = 0;
  for (let i = 0; i < CHUNKS.length; i++) {
    const chunk = CHUNKS[i];
    const label = `[${i + 1}/${CHUNKS.length}] ${chunk.category} (${chunk.language})`;
    try {
      const embResult = await embeddingModel.embedContent({
        content: {parts: [{text: chunk.text}]},
        taskType: 'RETRIEVAL_DOCUMENT',
        outputDimensionality: 768,
      });
      if (!isDryRun) {
        await db.collection('coachKnowledge').add({
          text: chunk.text, category: chunk.category, language: chunk.language,
          embedding: embResult.embedding.values,
          source: 'seed-coach-rag-travel-v3',
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
