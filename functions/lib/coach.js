'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { geminiApiKey, placesApiKey, AI_MODEL_NAME, AI_MODEL_LITE, getLanguageInstruction, normalizeCategory, categoryEmojiMap, parseGeminiJsonResponse, getCachedEmbedding, trackAICall } = require('./shared');
const { reverseGeocode, forwardGeocode, haversineDistanceKm } = require('./geo');
const {
  calculateMidpoint, haversineKm, estimateTravelMin, getMatchUsersLocations,
  fuzzyMatchPlace, getPlacesSearchConfig, getCategoryQueryMap,
  googlePriceLevelToString, sanitizeInstagramHandle, resolveInstagramHandle, calculatePlaceScore, sanitizeWebsiteUrl,
  placesTextSearch, transformPlaceToSuggestion, CATEGORY_TO_PLACES_TYPE,
} = require('./places-helpers');
const { fetchLocalEvents, getUserEventPreferences, EVENT_CATEGORY_EMOJI } = require('./events');

// --- Coach infrastructure ---
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
  '|buy(ing)?|shop(ping)?\\s*for|purchase|gift\\s*(for|idea)|present\\s*for|pick\\s*up\\s*(some|a|the)|gift\\s*ideas?|what\\s*to\\s*(buy|get|give)|best\\s*gift' +
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
  '|vino(s)?|wine(s)?|vin(ho)?|Wein|ワイン|葡萄酒|[红紅]酒|نبيذ|anggur|champagn?[ea]?|champ[aá][ñn]|espumante|シャンパン|香[槟檳]|شمبانيا'
  + '|whisky|whiskey|bourbon|scotch|ウイスキー|威士忌|виски|ويسكي'
  + '|vodka|ウォッカ|伏特加|водка|فودكا'
  + '|gin|ginebra|ジン|金酒|джин|جن'
  + '|ron|rum|rhum|ラム|朗姆酒|ром|روم'
  + '|tequila|テキーラ|龙舌兰|текила|تكيلا'
  + '|pisco|ピスコ|皮斯科|писко'
  + '|mezcal|mescal|メスカル|梅斯卡尔|мескаль'
  + '|cognac|co[ñn]ac|コニャック|干邑|коньяк|كونياك'
  + '|brandy|aguardiente|ブランデー|白兰地|бренди'
  + '|grappa|граппа|グラッパ'
  + '|sake|saké|日本酒|清酒|саке|ساكي'
  + '|licor(es)?|liqueur|lik[öo]r|リキュール|利口酒|ликёр|مشروب(ات)?\\s*روحية'
  + '|cerveza(s)?\\s*artesanal(es)?|craft\\s*beer|Craft-?Bier|クラフトビール|精酿啤酒|крафтовое\\s*пиво|بيرة\\s*حرفية|bir\\s*craft'
  + '|galleta(s)?|cookie(s)?|biscuit(s)?|Kekse?|Pl[aä]tzchen|クッキー|ビスケット|[饼餅]干|печенье|بسكويت|kue\\s*kering|sablé(s)?|shortbread' +
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
    dailyCredits: 3,
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
      stalled: '', // Prompt is built dynamically with daysSinceLastMsg in dateCoachChat
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
    coachTips: {
      cacheTtlMs: 300000, // 5 min
      geminiCallThreshold: 10, // new messages before calling Gemini again
      scoreDeltaThreshold: 15, // score change to force Gemini
      maxOutputTokens: 1024,
      messageWindow: 20,
      tipsLimit: 3,
      algorithmicWeights: {
        reciprocity: 25,
        volume: 20,
        messageLength: 15,
        questions: 15,
        emojis: 10,
        specialMessages: 15,
      },
      baseScore: 35,
      scoreMin: 40,
      scoreMax: 95,
      engagementHigh: 70,
      engagementMedium: 50,
      trendRisingFactor: 1.2,
      trendFallingFactor: 0.7,
      scoringGuidelines: {
        minimumActive: 45,
        minimumWithHumor: 60,
        absoluteMinimum: 35,
      },
    },
    safetyScore: {
      temperature: 0.1,
      maxOutputTokens: 512,
      fallbackScore: 85,
      riskThresholdLow: 70,
      riskThresholdMedium: 40,
      quickFlagPenalty: 25,
      minScore: 0,
      maxScore: 100,
    },
    placeSearch: {
      enableWithoutLocation: true,
      minActivitiesForPlaceSearch: 6,
      defaultRadius: 50000,
      minRadius: 3000,
      maxRadius: 50000,
      radiusSteps: [50000],
      progressiveRadiusSteps: [15000, 30000, 50000],
      minPlacesTarget: 30,
      loadMoreDefaultBaseRadius: 30000,
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
    confidence: /confidence|nervous|shy|anxious|afraid|scared|miedo|nervios|insecure|insegur|self.?esteem|autoestima|worthy|digno|not good enough|no soy suficiente|doubt|duda|overthink|pensar demasiado|worry|preocup|embarrass|vergüenza|assertive|seguridad|brave|valiente|fear|temo|intimid|imposter|fake it|pretend|fingir|insuficiente|not enough|no merezco|feo|ugly|hässlich|feio|laid|醜い|丑|некрасив/,
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
    lifestyle_dynamics: /expectation|lifestyle|estilo de vida|luxury|lujo|lavish|generous|generos[oa]|mentor|pamper|mimar|treat|tratar bien|age.?gap|diferencia de edad|travel.*together|viajar juntos|experience.*together|experiencia|fine dining|upscale|exclusiv/,
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
 * Detect the user's communication style from their coach chat messages.
 * Returns verbosity, emoji usage, question frequency, and energy level.
 */
function detectCommunicationStyle(userMessages) {
  if (!userMessages || userMessages.length < 3) return null;
  const texts = userMessages.map((m) => m.message || '').filter(Boolean);
  if (texts.length < 3) return null;

  const avgLength = texts.reduce((s, t) => s + t.length, 0) / texts.length;
  const emojiCount = texts.join('').match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu)?.length || 0;
  const questionCount = texts.filter((t) => t.includes('?')).length;
  const exclamationCount = texts.filter((t) => t.includes('!')).length;

  return {
    verbosity: avgLength > 120 ? 'detailed' : avgLength > 40 ? 'moderate' : 'concise',
    emojiStyle: emojiCount > texts.length * 1.5 ? 'heavy' : emojiCount > 0 ? 'light' : 'none',
    questionFreq: questionCount / texts.length > 0.3 ? 'inquisitive' : 'assertive',
    energy: exclamationCount / texts.length > 0.3 ? 'high' : 'calm',
  };
}

/**
 * Get cultural context guidance for a given language code.
 */
function getCulturalContext(lang) {
  const cultures = {
    ja: 'Indirect, respectful. Use polite suggestions, not direct commands. Avoid overly casual language.',
    ko: 'Respectful hierarchy-aware. Use polite forms. Be encouraging but not pushy.',
    zh: 'Practical, relationship-focused. Give concrete advice. Respect face/dignity.',
    ar: 'Formal initially, warm once comfortable. Respect cultural boundaries around dating.',
    de: 'Direct, factual, efficient. Skip small talk, get to actionable advice.',
    fr: 'Elegant, witty. Appreciate nuance and charm in dating advice.',
    pt: 'Warm, emotional, expressive. Emphasize connection and feelings.',
    es: 'Warm, enthusiastic, emotionally supportive. Use humor freely.',
    ru: 'Direct but thoughtful. Practical advice with emotional depth.',
    id: 'Polite, community-oriented. Consider family/social context in dating advice.',
    en: 'Balanced — adapt to user\'s detected style.',
  };
  return cultures[lang] || cultures['en'];
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

  // Feedback-driven adjustments
  const lowTopics = learningProfile.lowQualityTopics || [];
  if (lowTopics.length > 0) {
    parts.push(`⚠️ User marked these topics as unhelpful before: ${lowTopics.join(', ')}. Try a DIFFERENT approach for these — be more specific, give concrete examples, or ask clarifying questions.`);
  }
  const satRate = learningProfile.satisfactionRate;
  if (typeof satRate === 'number' && satRate < (learningProfile._lowSatThreshold || 70) && (learningProfile.feedbackCount || 0) >= 3) {
    parts.push(`NOTE: User satisfaction is ${satRate}%. Vary your approach — ask if they want more detail, give actionable steps, and avoid generic advice.`);
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
const RAG_DEFAULT_TOP_K = 5;
const RAG_MIN_SCORE = 0.25; // minimum cosine similarity to include results
const RAG_MAX_QUERY_LENGTH = 500;
const RAG_FETCH_MULTIPLIER = 3;
const RAG_MAX_CHUNK_LENGTH = 1500;

// ─── Moderation RAG: Retrieve moderation rules from moderationKnowledge ──────

// --- Coach RAG ---
async function retrieveCoachKnowledge(query, apiKey, ragConfig = {}, lang = 'en') {
  if (!apiKey || ragConfig.enabled === false) return '';

  // Config from RC with fallback to hardcoded defaults
  const topK = Math.min(Math.max(ragConfig.topK || RAG_DEFAULT_TOP_K, 1), 10);
  const baseMinScore = Math.min(Math.max(ragConfig.minScore ?? RAG_MIN_SCORE, 0), 1);
  // Dynamic threshold: adjust based on query type
  const lower = query.toLowerCase();
  const isPlaceQuery = /place|restaurant|bar|cafe|where|venue|location|lugar|restaurante|café|dónde|donde/.test(lower);
  const isSafetyQuery = /danger|unsafe|harass|stalk|block|report|abuse|scam|peligr|acoso|estafa|segur/.test(lower);
  const minScore = isSafetyQuery ? Math.min(0.5, baseMinScore + 0.2) : isPlaceQuery ? Math.max(0.15, baseMinScore - 0.15) : baseMinScore;
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

    // 1. Embed the user query (shared cache avoids duplicate Gemini calls)
    const queryVector = await getCachedEmbedding(trimmedQuery, apiKey, {
      model: embeddingModelName,
      dimensions,
    });

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

    // 4. Language-aware ranking: prefer user lang, then multi/en, then any
    // "multi" = universal knowledge (works for all languages) — treat as high priority
    const langNorm = (lang || 'en').substring(0, 2).toLowerCase();
    const userLangDocs = docs.filter((d) => d.language === langNorm);
    const multiDocs = docs.filter((d) => d.language === 'multi' && d.language !== langNorm);
    const enDocs = docs.filter((d) => d.language === 'en' && d.language !== langNorm && d.language !== 'multi');
    const otherDocs = docs.filter((d) => d.language !== langNorm && d.language !== 'en' && d.language !== 'multi');

    // Merge maintaining similarity order within each language group
    const ranked = [...userLangDocs, ...multiDocs, ...enDocs, ...otherDocs];
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

// --- Coach main functions ---
exports.dateCoachChat = onCall(
  {region: 'us-central1', memory: '512MiB', timeoutSeconds: 60, secrets: [geminiApiKey, placesApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const userId = request.auth.uid;
    const {message, matchId, userLanguage, loadMoreActivities, category: _rawCategory, excludePlaceIds: rawExcludePlaceIds, loadCount: rawLoadCount} = request.data || {};
    // Normalize category early: handles multilingual display names sent from older app versions
    // (e.g. "Cafetería" → "cafe", "Restaurante" → "restaurant", "Bar/Pub" → "bar")
    const requestCategory = _rawCategory ? normalizeCategory(_rawCategory) : _rawCategory;
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
        ? creditData.coachMessagesRemaining : (config.dailyCredits || 3);

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
        let lmLat = lmUserData.latitude;
        let lmLng = lmUserData.longitude;
        let lmHasLocation = !!(lmLat && lmLng);

        // Temporal context (lightweight)
        const lmOffset = typeof lmUserData.timezoneOffset === 'number' ? lmUserData.timezoneOffset : 0;
        const lmLocalTime = new Date(Date.now() + lmOffset * 3600000);
        const lmHour = lmLocalTime.getUTCHours();
        const lmTimeOfDay = lmHour < 6 ? 'late night' : lmHour < 12 ? 'morning' : lmHour < 17 ? 'afternoon' : lmHour < 21 ? 'evening' : 'night';

        // Track initial search radius for progressive loadMore expansion
        const lmPsDefaults = config.placeSearch || {};
        let lmBaseRadius = lmPsDefaults.loadMoreDefaultBaseRadius || 60000; // RC-configurable fallback if cache has no lastRadiusUsed
        let lmLocationOverridden = false;

        // Always read cache metadata (location override + radius) — even on category switch (loadCount=0).
        // Bug fix: previously the entire cache block was skipped on loadCount=0, so overrideLat/overrideLng
        // (e.g. user mentioned "Concepción") were never loaded → fresh Places fetch used wrong GPS coords.
        let _lmCacheData = null;
        try {
          const cacheDoc = await db.collection('coachChats').doc(userId).collection('placesCache').doc('latest').get();
          if (cacheDoc.exists) {
            _lmCacheData = cacheDoc.data();
            // Read initial search radius for progressive expansion in loadMore
            if (typeof _lmCacheData.lastRadiusUsed === 'number' && _lmCacheData.lastRadiusUsed > 0) lmBaseRadius = _lmCacheData.lastRadiusUsed;
            // Inherit location override from initial search (e.g. user mentioned "Concepción")
            if (typeof _lmCacheData.overrideLat === 'number' && typeof _lmCacheData.overrideLng === 'number') {
              lmLat = _lmCacheData.overrideLat; lmLng = _lmCacheData.overrideLng; lmHasLocation = true; lmLocationOverridden = true;
              logger.info(`[dateCoachChat] loadMore: using cached override location (${lmLat.toFixed(2)}, ${lmLng.toFixed(2)})`);
            }
          }
        } catch (cacheReadErr) {
          logger.warn(`[dateCoachChat] Cache metadata read failed (continuing with fresh fetch): ${cacheReadErr.message}`);
        }

        // Serve from cached places only when NOT a category switch (loadCount>0).
        // Category switch (loadCount=0) always triggers a fresh Places fetch for that category.
        if (safeLoadCount > 0 && _lmCacheData) try {
          const cacheExpiry = _lmCacheData.expiresAt instanceof Date ? _lmCacheData.expiresAt.getTime()
            : (_lmCacheData.expiresAt && typeof _lmCacheData.expiresAt.toDate === 'function') ? _lmCacheData.expiresAt.toDate().getTime()
            : 0;
          if (cacheExpiry > Date.now() && Array.isArray(_lmCacheData.places) && _lmCacheData.places.length > 0) {
            // Cache is still valid — serve from cache
            const excludeSet = new Set([
              ...(Array.isArray(rawExcludePlaceIds) ? rawExcludePlaceIds.filter((id) => typeof id === 'string') : []),
              ...(Array.isArray(_lmCacheData.returnedPlaceIds) ? _lmCacheData.returnedPlaceIds : []),
            ]);
            const cachedCategoryFilter = requestCategory || null;
            const available = _lmCacheData.places.filter((rp) =>
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
              const newReturned = [...(_lmCacheData.returnedPlaceIds || []), ...batch.filter((rp) => rp.placeId).map((rp) => rp.placeId)];
              db.collection('coachChats').doc(userId).collection('placesCache').doc('latest').update({returnedPlaceIds: newReturned}).catch(() => {});
              logger.info(`[dateCoachChat] loadMore served ${cachedActivities.length} from cache (${available.length - batch.length} remaining)`);
              return {
                success: true,
                activitySuggestions: cachedActivities,
                coachMessagesRemaining,
                ...(_lmCacheData.dominantCategory ? {dominantCategory: _lmCacheData.dominantCategory} : {}),
              };
            }
          }
        } catch (cacheServeErr) {
          logger.warn(`[dateCoachChat] Cache serve failed (continuing with fresh fetch): ${cacheServeErr.message}`);
        } // end cache serve block

        // Fetch Google Places with progressive radius expansion
        // For category searches, progressively expand radius until minTarget results found
        let lmPlaces = [];
        let lmLastRadius = 0;
        const lmPsConfig = config.placeSearch || {};
        const placesKey = process.env.GOOGLE_PLACES_API_KEY;
        if (placesKey) {
          try {
            const lmMaxR = lmPsConfig.maxRadius || 300000;
            const lmExpBase = lmPsConfig.loadMoreExpansionBase || 2;
            const lmMaxStep = lmPsConfig.loadMoreMaxExpansionStep || 4;
            const lmMinTarget = lmPsConfig.minPlacesTarget || 30;
            const lmMaxIntermediate = lmPsConfig.maxPlacesIntermediate || 60;
            const center = lmHasLocation ? {latitude: lmLat, longitude: lmLng} : null;
            const lmCat = requestCategory && categoryQueryMap[requestCategory] ? requestCategory : null;
            // Use type filter from validated lmCat, or directly from CATEGORY_TO_PLACES_TYPE if
            // requestCategory is known but missing from categoryQueryMap (e.g. Remote Config override)
            const lmTypeKey = lmCat || (requestCategory && CATEGORY_TO_PLACES_TYPE[requestCategory] ? requestCategory : null);
            // CATEGORY_TO_PLACES_TYPE now stores an array — use all types for parallel searches
            const rawTypeEntry = lmTypeKey ? CATEGORY_TO_PLACES_TYPE[lmTypeKey] : null;
            const lmAllTypes = rawTypeEntry ? (Array.isArray(rawTypeEntry) ? rawTypeEntry : [rawTypeEntry]) : null;
            // Keep single-type ref for logging/fallback compatibility
            const lmIncludedType = lmAllTypes ? [lmAllTypes[0]] : null;
            // Retrieve cached cuisineType from initial search (if any)
            const cachedCuisine = (_lmCacheData && _lmCacheData.intent && _lmCacheData.intent.cuisineType) || null;
            let lmQueries;
            if (lmCat) {
              const canonicalQ = categoryQueryMap[lmCat];
              const terms = canonicalQ.split(' ').filter((t) => t.length > 2);
              const subQ = terms.length > 3
                ? [terms.slice(0, 3).join(' '), terms.slice(3).join(' ')]
                : [terms.join(' ')];
              lmQueries = [canonicalQ, ...subQ].slice(0, 3);
              // Add cuisine-specific query from cache for better coverage on category switches
              if (cachedCuisine && lmCat === 'restaurant') {
                const cuisineQ = `${cachedCuisine} restaurant`;
                if (!lmQueries.some((q) => q.toLowerCase().includes(cachedCuisine.toLowerCase()))) {
                  lmQueries.push(cuisineQ);
                }
              }
            } else if (requestCategory) {
              // Category not in queryMap (e.g. Remote Config missing key) — build basic query
              lmQueries = [requestCategory.replace(/_/g, ' ')];
            } else {
              lmQueries = Object.keys(categoryQueryMap).sort(() => Math.random() - 0.5).slice(0, 4).map((k) => categoryQueryMap[k]);
            }
            const perQ = lmPsConfig.perQueryResults || 20;
            const lmUseRestriction = lmHasLocation && center && !lmLocationOverridden;

            // Build progressive radius steps based on context
            const progressiveSteps = Array.isArray(lmPsConfig.progressiveRadiusSteps) && lmPsConfig.progressiveRadiusSteps.length > 0
              ? lmPsConfig.progressiveRadiusSteps : [15000, 30000, 60000, 120000, 200000, 300000];
            let effectiveSteps;
            if (!lmHasLocation) {
              // No location: single query without geographic filter
              effectiveSteps = [null];
            } else if (safeLoadCount === 0) {
              // Category switch (loadCount=0): start fresh from smallest radius for best local results
              effectiveSteps = progressiveSteps.map((s) => Math.min(lmMaxR, s));
            } else {
              // Progressive loadMore (loadCount>0): start from expanded base radius
              const startRadius = Math.min(lmMaxR, lmBaseRadius * Math.pow(lmExpBase, Math.min(safeLoadCount, lmMaxStep) + 1));
              const stepsFromStart = progressiveSteps.filter((s) => s >= startRadius).map((s) => Math.min(lmMaxR, s));
              effectiveSteps = stepsFromStart.length > 0 ? stepsFromStart : [Math.min(lmMaxR, startRadius)];
              // Add one extra expanded step for sparse categories (zoo, aquarium, bowling)
              const maxStepVal = Math.max(...effectiveSteps);
              if (maxStepVal < lmMaxR) effectiveSteps.push(Math.min(lmMaxR, maxStepVal * 2));
            }

            // Pre-populate unique IDs with excluded places to avoid counting them toward target
            const excludeSet = Array.isArray(rawExcludePlaceIds) ? new Set(rawExcludePlaceIds.filter((id) => typeof id === 'string')) : new Set();
            const allUniqueIds = new Set(excludeSet);
            let allRawPlaces = [];
            let stepsUsed = 0;

            logger.info(`[dateCoachChat] loadMore progressive: ${lmQueries.length} queries, ${effectiveSteps.length} steps, types=${lmAllTypes ? lmAllTypes.join('|') : 'any'}, cat=${lmCat || 'any'}, target=${lmMinTarget}`);

            for (const stepRadius of effectiveSteps) {
              stepsUsed++;
              lmLastRadius = stepRadius || 0;
              const radiusMeters = stepRadius ? Math.min(lmMaxR, stepRadius) : null;
              // Build all (query × type) combinations for parallel fetch; cap at 12 to avoid API quota bursts
              const searchPairs = lmAllTypes
                ? lmQueries.flatMap((q) => lmAllTypes.map((t) => ({q, t: [t]}))).slice(0, 12)
                : lmQueries.map((q) => ({q, t: null}));
              const res = await Promise.all(
                searchPairs.map(({q, t}) => placesTextSearch(q, center, radiusMeters, lang, null, perQ, lmUseRestriction, t).catch(() => ({places: []}))),
              );
              const newPlaces = res.flatMap((r) => r.places).filter((p) => {
                if (!p.id || allUniqueIds.has(p.id)) return false;
                allUniqueIds.add(p.id);
                return true;
              });
              allRawPlaces = [...allRawPlaces, ...newPlaces];
              logger.info(`[dateCoachChat] loadMore step ${stepsUsed}/${effectiveSteps.length}: ${radiusMeters || 'no-radius'}m → +${newPlaces.length} new (total: ${allRawPlaces.length}/${lmMinTarget})`);
              if (allRawPlaces.length >= lmMinTarget) break;
            }

            logger.info(`[dateCoachChat] loadMore progressive done: ${allRawPlaces.length} places in ${stepsUsed}/${effectiveSteps.length} steps, cat=${lmCat || 'any'}`);

            // Fallback: if type filter yielded 0 results (sparse/rare categories like zoo, aquarium,
            // spa, bowling_alley or regional differences in Google Places type tagging),
            // retry once at max radius without includedType — text queries are specific enough.
            if (allRawPlaces.length === 0 && lmIncludedType !== null) {
              logger.info(`[dateCoachChat] loadMore 0 results with includedType=${lmIncludedType[0]}, retrying without type filter`);
              const fallbackRadius = lmHasLocation ? Math.min(lmMaxR, Math.max(...progressiveSteps)) : null;
              const fallbackRes = await Promise.all(
                lmQueries.map((q) => placesTextSearch(q, center, fallbackRadius, lang, null, perQ, lmUseRestriction, null)
                  .catch(() => ({places: []}))),
              );
              const fallbackPlaces = fallbackRes.flatMap((r) => r.places).filter((p) => {
                if (!p.id || allUniqueIds.has(p.id)) return false;
                allUniqueIds.add(p.id);
                return true;
              });
              if (fallbackPlaces.length > 0) {
                allRawPlaces = fallbackPlaces;
                logger.info(`[dateCoachChat] loadMore no-type fallback: found ${allRawPlaces.length} places`);
              }
            }

            lmPlaces = allRawPlaces.slice(0, lmMaxIntermediate).map((p) => {
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
          (requestCategory ? `\nCategory focus: ${requestCategory}. ALL activities MUST use category: "${requestCategory}".` : '\nIMPORTANT: Maximize category diversity — use at least 4-5 DIFFERENT categories (cafe, restaurant, bar, park, museum, art_gallery, bakery, shopping_mall, spa, night_club, bowling_alley).') +
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
          model: AI_MODEL_LITE,
          generationConfig: {temperature: 0.5, maxOutputTokens: Math.min(Math.max(config.maxTokens, lmTokenBudget), 4096), responseMimeType: 'application/json'},
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

        // Cache the fresh fetch results so loadCount=1 can serve from cache instead of re-fetching
        if (lmPlaces.length > 0) {
          db.collection('coachChats').doc(userId).collection('placesCache').doc('latest').set({
            places: lmPlaces,
            returnedPlaceIds: [],
            dominantCategory: requestCategory || null,
            cacheCategory: requestCategory || null,
            lastRadiusUsed: lmLastRadius || 0,
            ...(lmLocationOverridden ? {overrideLat: lmLat, overrideLng: lmLng} : {}),
            ...(typeof lmLat === 'number' ? {centerLat: lmLat, centerLng: lmLng} : {}),
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          }).catch((e) => logger.warn(`[dateCoachChat] loadMore cache write failed (non-critical): ${e.message}`));
        }

        let lmActivities;
        // Guard: parseGeminiJsonResponse requires a non-null string; skip if Gemini failed
        if (!lmText) {
          logger.warn('[dateCoachChat] loadMore Gemini returned null text — using Places fallback directly');
        }
        try {
          const parsed = lmText ? parseGeminiJsonResponse(lmText) : null;
          if (!parsed) throw new Error('no_text');
          const acts = parsed.activitySuggestions || parsed.activity_suggestions || parsed.activities || parsed.places;
          if (Array.isArray(acts)) {
            const lmLookupById = new Map();
            const lmLookupByName = new Map();
            for (const rp of lmPlaces) {
              if (rp.placeId) lmLookupById.set(rp.placeId, rp);
              if (rp.name) lmLookupByName.set(rp.name.toLowerCase().trim(), rp);
            }
            const rawActivities = acts.slice(0, config.maxActivities).map((a) => {
              const title = (a.title || a.name || '').substring(0, 50);
              const geminiPlaceId = a.placeId || a.place_id || null;
              const matched = fuzzyMatchPlace(title, geminiPlaceId, lmLookupById, lmLookupByName, lmPlaces);
              const rawDesc = (a.description || '').substring(0, 120);
              const cleanDesc = rawDesc.replace(/\$+/g, '').trim();
              const resolvedPriceLevel = (matched && matched.priceLevel) || a.priceLevel || a.price_level || null;
              const validatedWebsite = (matched && matched.website) || sanitizeWebsiteUrl(a.website) || null;
              const validatedInstagram = sanitizeInstagramHandle(a.instagram || a.instagramHandle || null);
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

            // Async: resolve Instagram handles via pipeline (cache → website → search → gemini)
            lmActivities = await Promise.all(rawActivities.map(async (activity) => {
              if (activity.instagram) return activity;
              try {
                const resolved = await resolveInstagramHandle({
                  placeId: activity.placeId || null,
                  placeName: activity.title || '',
                  placeAddress: activity.address || '',
                  websiteUrl: activity.website || null,
                  geminiGuess: null,
                  apiKey,
                });
                if (resolved && resolved.handle) {
                  return {...activity, instagram: resolved.handle, _igMetrics: resolved.metrics || null};
                }
              } catch (igErr) { /* continue without Instagram */ }
              return activity;
            }));
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

        // Sort by combined score: Google Places (rating + reviews) + Instagram (followers + freshness)
        if (lmActivities && lmActivities.length > 1) {
          lmActivities.sort((a, b) =>
            calculatePlaceScore({rating: b.rating, reviewCount: b.reviewCount, igMetrics: b._igMetrics}) -
            calculatePlaceScore({rating: a.rating, reviewCount: a.reviewCount, igMetrics: a._igMetrics}),
          );
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
          activitySuggestions: (lmActivities || []).map(({_igMetrics, ...rest}) => rest),
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
      let daysSinceLastMsg = 0;
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

              // Check if conversation is stalled (7+ days since last message)
              if (matchData.lastMessageTimestamp) {
                const lastMsgTime = matchData.lastMessageTimestamp.toMillis
                  ? matchData.lastMessageTimestamp.toMillis() : (matchData.lastMessageTimestamp.toDate
                    ? matchData.lastMessageTimestamp.toDate().getTime() : Date.now());
                daysSinceLastMsg = (Date.now() - lastMsgTime) / (1000 * 60 * 60 * 24);
                if (daysSinceLastMsg >= 7) {
                  relationshipStage = 'stalled';
                }
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
      const placeTypePattern = /\b(florerr?[ií]a|florist|flower\s*shop|flor(es|ist)|joyerr?[ií]a|jewel(ry|er)|chocolater[ií]a|chocolate\s*shop|bomboner[ií]a|pastel(er[ií]a|shop)|baker[yi]|panader[ií]a|dulcer[ií]a|candy|helade?r[ií]a|ice\s*cream|gelater[ií]a|perfumer[ií]a|perfume\s*shop|regal(os?|er[ií]a)|gift\s*shop|tienda de regalos|restaurante?s?|café|cafeter[ií]a|coffee\s*shop|bar(es)?|pub|lounge|cocktail|coctel(er[ií]a)?|wine\s*bar|vinoteca|cervece?r[ií]a|brewery|brunch|bistro|trattoria|pizzer[ií]a|sushi|cena|dinner|comida|food|taquería|taco|burger|hamburgues(a|er[ií]a)|bbq|parrilla|asador|marisquer[ií]a|seafood|spa|masaje|massage|wellness|yoga|gym|gimnasio|sal[oó]n de belleza|beauty\s*salon|peluquer[ií]a|barber|hair\s*salon|mall|centro comercial|shopping|boutique|tienda de ropa|clothing|museo|museum|galer[ií]a de arte|art\s*gallery|teatro|theater|theatre|cine|cinema|movie|pel[ií]cul|bowling|boliche|karaoke|escape\s*room|arcade|mini\s*golf|parque|park|jardín|garden|bot[aá]nic|plaza|mirador|viewpoint|rooftop|terraza|playa|beach|club|discoteca|nightclub|disco|pista de baile|dance|lago|lake|monta[ñn]a|mountain|sendero|trail|hiking|camping|picnic|zoo(l[oó]gico)?|acuario|aquarium|planetario|planetarium|librer[ií]a|bookstore|book\s*shop|antique|antig[üu]edad|tattoo|tatuaje|pier(cing)?|fotograf[ií]a|photo\s*(studio|booth)|cooking\s*class|clase de cocina|potter[yi]|cer[aá]mica|art\s*class|mezcaler[ií]a|tequiler[ií]a|licorerr?[ií]a|liquor|wine\s*shop|deli|market|mercado|feria|fair|concert|concierto|m[uú]sica en vivo|live\s*music|jazz|show|espect[aá]culo|hotel|motel|hostal|hostel|airbnb|cabin|caba[ñn]a|resort|country\s*club|golf|tenis|tennis|ski|surf|d[oó]nde (comprar|llevar|ir|encontrar|buscar)|where\s*(to\s*)?(buy|find|go|get|take)|dance\s*class|clase de baile|adventure\s*park|parque de aventura|go-?karts?|karting|farmer'?s?\s*market|mercado org[aá]nico|food\s*truck|couple\s*photoshoot|sesi[oó]n de fotos|speakeasy|wine\s*tasting|cata de vinos?|cooking\s*experience|experiencia gastron[oó]mica|zip\s*line|tirolesa|paintball|laser\s*tag|trampoline|camas el[aá]sticas|boat\s*(ride|tour)|paseo en bote|futbol|football|soccer|basketball|tennis|cancha|estadio|sports\s*bar|gimnasio|gym|comida\s*(árabe|arabe|china|italiana|mexicana|japonesa|tailandesa|india|peruana|coreana|francesa|griega|turca|vietnamita|brasile[ñn]a|cubana|espa[ñn]ola|colombiana|venezolana|chilena|argentina|alemana|americana|hawaiana|etiope|marroqu[ií]|libanesa|mediterr[aá]nea|asi[aá]tica|latina|fusi[oó]n|vegana|vegetariana|org[aá]nica|saludable|r[aá]pida|gourmet|casera|criolla|noikkei|tex-?mex)|cocina\s*(árabe|arabe|china|italiana|mexicana|japonesa|tailandesa|india|peruana|coreana|francesa|griega|turca|vietnamita|brasile[ñn]a|mediterr[aá]nea|asi[aá]tica|latina|fusi[oó]n|vegana|vegetariana|gourmet|criolla|nikkei|tex-?mex)|arab(ic|ian)?\s*(food|restaurant|cuisine)|chinese\s*(food|restaurant|cuisine)|italian\s*(food|restaurant|cuisine)|mexican\s*(food|restaurant|cuisine)|japanese\s*(food|restaurant|cuisine)|thai\s*(food|restaurant|cuisine)|indian\s*(food|restaurant|cuisine)|peruvian\s*(food|restaurant|cuisine)|korean\s*(food|restaurant|cuisine)|french\s*(food|restaurant|cuisine)|greek\s*(food|restaurant|cuisine)|turkish\s*(food|restaurant|cuisine)|vietnamese\s*(food|restaurant|cuisine)|brazilian\s*(food|restaurant|cuisine)|mediterranean\s*(food|restaurant|cuisine)|asian\s*(food|restaurant|cuisine)|vegan\s*(food|restaurant|cuisine)|vegetarian\s*(food|restaurant|cuisine)|fusion\s*(food|restaurant|cuisine)|soul\s*food|comfort\s*food|street\s*food|fine\s*dining|dim\s*sum|hot\s*pot|pho|pad\s*thai|curry|tandoori|naan|hummus|shawarma|falafel|d[oö]ner|kebab|gyros?|bibimbap|ramen\s*(shop|bar|house)|udon|tempura|wok|stir\s*fry|noodle\s*(house|shop|bar)|dumpling|bao|poke\s*bowl|acai\s*bowl|smoothie|juice\s*bar|tea\s*house|t[eé]\s*house|cuisine\s*(arabe|chinoise|italienne|mexicaine|japonaise|tha[ïi]landaise|indienne|p[eé]ruvienne|cor[eé]enne|fran[cç]aise|grecque|turque|vietnamienne|br[eé]silienne|m[eé]diterran[eé]enne|asiatique|v[eé]g[eé]talienne|v[eé]g[eé]tarienne)|arabisches?\s*Essen|chinesisches?\s*Essen|italienisches?\s*Essen|mexikanisches?\s*Essen|japanisches?\s*Essen|thai\s*Essen|indisches?\s*Essen|griechisches?\s*Essen|t[uü]rkisches?\s*Essen|comida\s*(árabe|chinesa|italiana|mexicana|japonesa|tailandesa|indiana|peruana|coreana|francesa|grega|turca|vietnamita|brasileira|mediterr[aâ]nea|asi[aá]tica|vegana|vegetariana)|アラブ料理|中華料理|中国料理|イタリア(ン|料理)|メキシコ料理|タイ料理|インド料理|韓国料理|フランス料理|ベトナム料理|ペルー料理|ギリシャ料理|トルコ料理|和食|洋食|阿拉伯[菜餐]|中[餐菜]|意大利[菜餐]|墨西哥[菜餐]|日本[菜料]理|泰[国國][菜餐]|印度[菜餐]|韩[国國][菜餐]|法[国國][菜餐]|越南[菜餐]|地中海[菜餐]|арабская\s*кухня|китайская\s*кухня|итальянская\s*кухня|мексиканская\s*кухня|японская\s*кухня|тайская\s*кухня|индийская\s*кухня|корейская\s*кухня|французская\s*кухня|средиземноморская\s*кухня|مطعم\s*(عربي|صيني|إيطالي|مكسيكي|ياباني|تايلاندي|هندي|كوري|فرنسي|تركي|لبناني|يوناني)|أكل\s*(عربي|صيني|إيطالي|مكسيكي|ياباني|هندي|تركي|لبناني)|makanan\s*(arab|cina|italia|meksiko|jepang|thailand|india|korea|perancis|turki|vietnam|laut)|masakan\s*(arab|cina|italia|jepang|korea|india|padang|sunda|jawa))\b/i;
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
            // Intent extraction config — RC-configurable via coach_config.intentExtraction
            const ieConfig = config.intentExtraction || {};
            const intentModel = intentAI.getGenerativeModel({
              model: AI_MODEL_LITE,
              generationConfig: {temperature: ieConfig.temperature || 0.1, maxOutputTokens: ieConfig.maxTokens || 512, responseMimeType: 'application/json'},
            });
            const intentPrompt = `Extract search intent from this message. User language: "${lang}".
Message: "${message.substring(0, 300)}"

Return JSON with these fields:
- "placeType": short venue type (e.g. pub, café, spa, park, flower shop, pizzeria, arabic restaurant, chinese restaurant, sushi bar, chocolatería, florería, joyería)
- "placeQueries": 2-3 short search queries in user's language for Google Places. CRITICAL mappings:
  * BUYING/SHOPPING intent (comprar, buy, regalar, gift, llevar, para llevar, takeaway, to go, emporter, mitnehmen, テイクアウト, 外卖, на вынос, للأخذ, bawa pulang):
    - chocolates/bombones → ["chocolatería", "tienda de chocolates", "bombonería"] (NOT restaurant)
    - flores/flowers/Blumen/fleurs/花/цветы/ورد/bunga → ["florería", "floristería", "flower shop"] (NOT restaurant, use user's language)
    - joyas/jewelry → ["joyería", "tienda de joyas", "jewelry store"] (NOT restaurant)
    - perfume → ["perfumería", "tienda de perfumes", "perfume store"] (NOT restaurant)
    - regalos/gifts/cadeaux/Geschenke/プレゼント/礼物/подарки/هدايا → ["tienda de regalos", "gift shop", "boutique"] (NOT restaurant)
    - vinos/wine/champagne/espumante/シャンパン/香槟 → ["vinoteca", "wine shop", "licorería", "wine store"] (NOT restaurant)
    - licor/whisky/vodka/rum/tequila/spirits/bebidas alcohólicas → ["licorería", "liquor store", "tienda de licores"] (NOT bar)
    - cerveza artesanal/craft beer → ["tienda de cervezas", "craft beer shop", "beer store"]
    - ropa/clothing → ["tienda de ropa", "boutique"] (NOT restaurant)
    - pasteles/cakes/galletas/cookies/macarons → ["pastelería", "repostería", "bakery"]
    - helados/ice cream → ["heladería", "ice cream shop"]
    - sushi para llevar/takeaway sushi → ["sushi delivery", "sushi takeaway", "sushi para llevar"] (NOT sit-down restaurant)
    - comida china para llevar → ["comida china delivery", "chinese takeaway", "chinese food to go"]
    - comida para llevar/takeout/takeaway (any cuisine) → add "delivery" or "para llevar" to cuisine query
    - galletas/cookies/biscuits/Kekse/ビスケット/饼干/печенье/بسكويت/kue kering → ["bakery", "pastelería", "cookie shop"]
  * Cuisine types → "restaurante [cuisine]" (e.g. "comida árabe"→"restaurante árabe")
  * Specific dishes → restaurant type (sushi→sushi restaurant, shawarma→arabic restaurant)
  * Generic food → restaurant (comer, cenar, almorzar→restaurante)
  * BRAND/FRANCHISE NAMES: When user mentions a specific brand or franchise name (e.g., "Dunkin", "Starbucks", "McDonald's", "KFC", "Pizza Hut", "Subway", "Krispy Kreme", "Tim Hortons", "Baskin Robbins", "Chili's", "Outback"), ALWAYS:
    1. Keep the EXACT brand name as the first placeQuery (e.g., "Dunkin Donuts", "Starbucks Coffee")
    2. Add the full official name variant as second query (e.g., "Dunkin" → ["Dunkin Donuts", "Dunkin' Donuts"])
    3. Set googleCategory to the appropriate type:
       - Coffee/donut chains (Dunkin, Starbucks, Tim Hortons, Costa) → "cafe"
       - Donut/pastry chains (Krispy Kreme, Cinnabon, Mister Donut) → "bakery"
       - Fast food/casual dining (McDonald's, KFC, Burger King, Subway, etc.) → "restaurant"
       - Ice cream chains (Baskin Robbins, Cold Stone, Häagen-Dazs) → "bakery"
    4. NEVER return null googleCategory for recognized brand names
  * GIFT intent (regalar, para mi cita, for my date, as a gift): when the user wants to BUY food/drinks AS A GIFT, use shop/store queries NOT restaurant. Example: "comprar sushi para regalar" → sushi delivery/takeaway, "champagne para mi cita" → vinoteca/wine shop
  * SPORTS intent:
    - "ver futbol/watch the game/ver un partido" → ["sports bar", "bar deportivo", "pub with screens"] + googleCategory: "bar"
    - "jugar futbol/play soccer/hacer deporte" → ["cancha de futbol", "soccer field", "sports complex", "polideportivo"] + googleCategory: "park"
    - "ver NBA/watch basketball/ver béisbol" → ["sports bar", "bar with TV"] + googleCategory: "bar"
  * LUXURY/IMPRESS intent: When user says "impresionar"/"impress"/"fancy"/"elegante"/"upscale"/"lujo"/"premium"/"especial"/"exclusive", set mood to "upscale luxury" and prefer high-rated (4.5+) venues with priceLevel "expensive" or "very_expensive"
  * NOTE: In some Latin American countries, "cabaret" means nightclub/discoteca (not adult entertainment). If user says "ir a un cabaret", map to ["discoteca", "nightclub", "dance club"] — the venue filter will handle blocking actual adult venues.
- "locationMention": city/area/country mentioned or null. Extract the location even from indirect references:
  * Travel: "voy a Buenos Aires", "going to Paris", "viajo a Madrid"
  * Friends/family: "mi amigo vive en Lima", "my sister is in London", "tengo familia en Bogotá"
  * Partner/date: "mi pareja está en Santiago", "my match lives in Tokyo", "ella es de Medellín"
  * Curiosity: "qué hay en New York", "how is nightlife in Berlin", "cómo es la vida en Roma"
  * Future plans: "me mudo a Barcelona", "moving to Dubai", "pensando en ir a Bali"
  * Any mention of a city/country name = extract it
- "mood": desired vibe in 2-3 words or null
- "cuisineType": specific cuisine if mentioned (arabic, chinese, italian, mexican, japanese, thai, indian, peruvian, korean, french, greek, turkish, vietnamese, brazilian, mediterranean, asian, vegan, vegetarian, fusion) or null
- "searchType": one of "eat" (food/cuisine/dining), "buy" (shopping/gifts/products), "visit" (activities/places) or null. This helps determine whether to show restaurants, shops, or venues
- "googleCategory": closest from: cafe, restaurant, bar, night_club, movie_theater, park, museum, bowling_alley, art_gallery, bakery, shopping_mall, spa, aquarium, zoo, florist, liquor_store. IMPORTANT category rules:
  * Cuisine searches (comida árabe, sushi, etc.) → "restaurant"
  * Chocolate/candy/sweets/pasteles/cookies/galletas/helados → "bakery"
  * Flowers/roses/bouquet/florería/fleuriste/Blumen/花/цветы/ورد/bunga → "florist"
  * Wine/champagne/whisky/vodka/gin/rum/tequila/pisco/licor/spirits/sake/mezcal/aguardiente/grappa/cognac/brandy → "liquor_store"
  * Gifts/jewelry/perfume/clothing → "shopping_mall"
  * Coffee/tea → "cafe"
  * Drinks/cocktails/beer (to DRINK at a venue) → "bar"
  * Buy beer/craft beer (to TAKE HOME) → "liquor_store"
  * Massage/wellness/beauty → "spa"
  * NEVER use "restaurant" for buying products — use "bakery", "florist", "liquor_store", or "shopping_mall" instead
  * NEVER use "bar" for buying alcohol to take home — use "liquor_store" instead
  * When the query is a short brand name (1-2 words), add " near me" or the equivalent in user's language to placeQueries for better Google Places results`;
            const intentResult = await intentModel.generateContent(intentPrompt);
            const intentText = intentResult.response.text();
            extractedIntent = parseGeminiJsonResponse(intentText);
            logger.info(`[dateCoachChat] Intent extracted: placeType=${extractedIntent.placeType}, location=${extractedIntent.locationMention}, category=${extractedIntent.googleCategory}`);
          }
        } catch (intentErr) {
          logger.warn(`[dateCoachChat] Intent extraction failed (non-critical): ${intentErr.message}`);
        }

        // Fallback: if Gemini intent extraction failed or returned no locationMention,
        // try regex-based city detection for common travel patterns in 10 languages.
        // City name capture: uppercase letter start + up to 3 additional words (handles
        // "Buenos Aires", "New York", "São Paulo", "Kuala Lumpur", "Rio de Janeiro")
        if (!extractedIntent || !extractedIntent.locationMention) {
          // Unicode-aware city name: starts with uppercase, allows accents, hyphens, apostrophes
          const cityCapture = '([A-ZÀ-ÜÆÅÇÐÑÖØÞŠŽĐĆŁŚŹŻÁÉÍÓÚÝÀÈÌÒÙÂÊÎÔÛÄËÏÖÜĀĒĪŌŪŸÃÕÃŅĶĢĻŅŖŢ][a-zà-üæåçðñöøþšžđćłśźżáéíóúýàèìòùâêîôûäëïöüāēīōūÿãõñ]+(?:[\\s\\-\'][A-ZÀ-Üa-zà-ü][a-zà-ü]*){0,4})';
          const travelPatterns = [
            // ═══════════════════════════════════════════════════════════════
            // ESPAÑOL (ES) — 8 patrones
            // ═══════════════════════════════════════════════════════════════
            // ES-1: Verbos de movimiento + preposición + Ciudad
            // "voy a Buenos Aires", "viajo a Madrid", "vuelo a Lima", "me mudo a Barcelona"
            // "nos vamos a Cancún", "escapada a Punta del Este", "vacaciones en Cartagena"
            // "llego a Santiago mañana", "parto hacia Montevideo", "regreso a Bogotá"
            new RegExp('(?:voy|viajo|viajamos|iré|iremos|viajar|me voy|nos vamos|salgo|salimos|visitar|visitaré|visitaremos|conocer|conoceré|ir|estaré|estaremos|estoy|vuelo|volamos|mudándome|mudándonos|regreso|vuelvo|llego|llegamos|parto|partimos|escapada|escaparme|escaparnos|vacacion(?:es|ar)|finde? en|weekend en|fui|fuimos|anduve|pasé por|paso por|vivo en|viví en|nací en|crecí en|me crié en|trabajo en|estudio en|tengo que ir|quiero ir|necesito ir|planeo ir|pienso ir|quisiera ir|me gustaría ir|ojalá pueda ir|sueño con ir)\\s+(?:a|hacia|para|en|al?|por)\\s+' + cityCapture, 'i'),
            // ES-2: Preguntas directas — "dónde puedo ir en X", "qué hacer en X"
            // "dónde puedo comer en Valparaíso", "qué visitar en Cusco"
            new RegExp('(?:dond[eé]|qu[eé]|cómo|cuál(?:es)?)\\s+(?:puedo|podemos|hay|se puede|debo|debemos|debería|podría|podríamos|me recomiendas|nos recomiendas|sugier(?:es|en))\\s+(?:ir|hacer|visitar|ver|comer|tomar|salir|pasear|recorrer|explorar|conocer|comprar|encontrar|buscar|probar)\\s+(?:en|por|de|cerca de)\\s+' + cityCapture, 'i'),
            // ES-3: Sustantivos de recomendación — "recomendaciones en X", "planes en X"
            // "bares en Mendoza", "restaurantes en Quito", "vida nocturna en Medellín"
            new RegExp('(?:recomendaciones|sugerencias|opciones|ideas|planes|actividades|sitios|bares|restaurantes|cafés?|cafeterías|discotecas|museos|parques|tiendas|hoteles|hostales|alojamiento|hospedaje|lugares|cosas que hacer|lo mejor de|imperdibles|favoritos|populares|top|mejores|vida nocturna|gastronomía|cultura|turismo|atracciones)\\s+(?:en|para|de|cerca de|por)\\s+' + cityCapture, 'i'),
            // ES-4: Expresiones coloquiales latam
            // "qué onda en Guadalajara", "qué pedo en CDMX", "la movida en Barranquilla"
            // "pasarla bien en Viña", "carretear en Santiago", "rumbear en Cali"
            new RegExp('(?:qué onda|qué pedo|la movida|pasarla bien|carretear|rumbear|parrandear|janguear|farrear|salir de fiesta|salir de juerga|ir de copas|ir de cañas|salir de rumba|salir de parranda|la noche|el ambiente|el rollo|chambear|currar)\\s+(?:en|por|de)\\s+' + cityCapture, 'i'),
            // ES-5: Contexto indirecto — "cuando esté en X", "si voy a X", "algún día en X"
            // "cuando llegue a Montevideo", "si viajo a Córdoba", "algún día visitaré Tokio"
            new RegExp('(?:cuando\\s+(?:esté|llegue|vaya|viaje|vuelva|pase por)|si\\s+(?:voy|viajo|vamos|fuera|fuese|pudiera ir)|algún día\\s+(?:en|visitaré|iré|conoceré)|antes de ir|después de llegar|al llegar|de camino|de paso por|escala en|conexión en)\\s+(?:a|en|por)?\\s*' + cityCapture, 'i'),

            // ═══════════════════════════════════════════════════════════════
            // ENGLISH (EN) — 7 patrones
            // ═══════════════════════════════════════════════════════════════
            // EN-1: Movement verbs — "going to NYC", "flying to Dubai", "relocating to Austin"
            new RegExp('(?:going|traveling|travelling|visiting|trip|heading|fly|flying|moving|relocating|arriving|landing|vacation|vacationing|weekend|holiday|honeymoon|getaway|stopover|layover|backpacking|touring|exploring|drove|driving|sailed|cruising|road trip|emigrating|immigrating|deployed|stationed|transferred|posted|assigned|sent|commuting)\\s+(?:to|in|at|through|around)\\s+' + cityCapture, 'i'),
            // EN-2: Questions — "what to do in London", "best spots in LA"
            new RegExp('(?:what|where|things|best|top|cool|nice|fun|good|great|romantic|cheap|hidden|local|popular|famous|must[- ]?see|must[- ]?visit|bucket[- ]?list|off[- ]?the[- ]?beaten)\\s+(?:to do|to go|to see|to eat|to drink|to visit|to explore|places|spots|bars|restaurants|cafes|clubs|pubs|activities|attractions|landmarks|neighborhoods|areas|districts|gems)\\s+(?:in|around|near|at|across|throughout)\\s+' + cityCapture, 'i'),
            // EN-3: Requests — "recommend bars in X", "show me X", "find restaurants near X"
            new RegExp('(?:recommend|suggest|find|discover|show me|look for|search for|help me find|know any|any good|any nice|point me to)\\s+(?:places|spots|bars|restaurants|cafes|activities|things|clubs|pubs|shops|stores|hotels|hostels|food|eats|drinks)\\s+(?:in|around|near|at)\\s+' + cityCapture, 'i'),
            // EN-4: Life context — "I live in X", "I'm based in X", "I work in X"
            // "I used to live in X", "I grew up in X", "I was born in X", "I'm originally from X"
            new RegExp('(?:I\\s+(?:live|work|study|am based|reside|stay|grew up|was born|am from|am originally from|used to live|spent time)|I\'m\\s+(?:based|living|working|studying|staying|from|originally from|currently in)|I\'ve\\s+(?:been to|visited|lived in|worked in)|been\\s+(?:living|working|staying|based))\\s+(?:in|at|from)\\s+' + cityCapture, 'i'),
            // EN-5: Informal/slang — "hitting up X", "checking out X", "tryna go to X"
            new RegExp('(?:hitting up|checking out|tryna go|wanna go|gonna go|bout to go|finna go|planning on|thinking about|considering|dreaming of|dying to go|can\'t wait to go|excited about|pumped for|stoked about)\\s+(?:to|in)?\\s*' + cityCapture, 'i'),

            // ═══════════════════════════════════════════════════════════════
            // PORTUGUÊS (PT) — 4 patrones
            // ═══════════════════════════════════════════════════════════════
            // PT-1: Verbos — "vou para São Paulo", "mudo para Porto"
            new RegExp('(?:vou|viajo|viajamos|visitar|visitarei|conhecer|irei|iremos|estou|estarei|estaremos|férias|feriado|escapada|mudo|mudando|volto|chego|passo|moro|morei|nasci|cresci|trabalho|estudo|fui|fomos|andei)\\s+(?:para|a|em|ao|à|pro|pra|no|na)\\s+' + cityCapture, 'i'),
            // PT-2: Perguntas — "o que fazer em X", "onde comer no X"
            new RegExp('(?:o que|onde|coisas para|melhor(?:es)?|dicas de|sugestões de|opções em|recomendações de|rolê em|balada em|noite em|gastronomia em|turismo em)\\s+(?:fazer|ir|visitar|comer|ver|conhecer|explorar|beber|curtir)?\\s*(?:em|no|na|por|de)?\\s*' + cityCapture, 'i'),
            // PT-3: Coloquial BR — "rolê em X", "bora pra X", "trampo em X"
            new RegExp('(?:rolê|bora|bora pra|vamo(?:s)? (?:pra|para)|trampo|role|curtir|zoar|da hora|sinistro|irado|maneiro|show de bola)\\s+(?:em|pra|para|no|na|de)\\s+' + cityCapture, 'i'),

            // ═══════════════════════════════════════════════════════════════
            // FRANÇAIS (FR) — 4 patrones
            // ═══════════════════════════════════════════════════════════════
            // FR-1: Verbes — "je vais à Lyon", "on part à Nice", "lune de miel à Bora Bora"
            new RegExp('(?:je vais|je voyage|je pars|j\'irai|on va|nous allons|on part|vacances|séjour|escapade|week-?end|lune de miel|je vis|j\'habite|je travaille|j\'étudie|je suis|je rentre|j\'arrive|je déménage|je m\'installe)\\s+(?:à|en|au|aux|vers|pour|dans|sur)\\s+' + cityCapture, 'i'),
            // FR-2: Questions — "que faire à X", "où sortir à X", "les meilleurs bars de X"
            new RegExp('(?:que|quoi|où|comment|quel(?:s|les?)?|les meilleurs?|les meilleures?|bons plans?|bonnes adresses|endroits?|restos?|bars?|boîtes?|sorties?|activités?|vie nocturne|gastronomie)\\s+(?:faire|aller|visiter|voir|manger|boire|sortir|découvrir|explorer)?\\s*(?:à|en|au|aux|de|du|dans|sur)?\\s*' + cityCapture, 'i'),
            // FR-3: Argot — "kiffer X", "c'est cool à X", "la teuf à X"
            new RegExp('(?:kiffer|c\'est (?:cool|bien|génial|top|ouf)|la teuf|faire la fête|sortir|traîner|se balader|flâner)\\s+(?:à|en|au|dans)\\s+' + cityCapture, 'i'),

            // ═══════════════════════════════════════════════════════════════
            // DEUTSCH (DE) — 4 patrones
            // ═══════════════════════════════════════════════════════════════
            // DE-1: Verben — "reise nach Berlin", "fliege nach Wien", "umziehen nach Zürich"
            new RegExp('(?:reise|fahre|fliege|ziehe|gehe|umziehen|pendeln|urlaub|wochenende|ausflug|kurztrip|städtereise|flitterwochen|bin|wohne|lebe|arbeite|studiere|war|komme aus|stamme aus)\\s+(?:nach|in|auf|an|aus|von)\\s+' + cityCapture, 'i'),
            // DE-2: Fragen — "was kann man in X machen", "beste Bars in X"
            new RegExp('(?:was|wo|wie|welche|beste[rns]?|gute[rns]?|coole?|tolle?|schöne?|empfehlung(?:en)?|tipps?|geheimtipps?|ausgehtipps?|kneipen|restaurants?|bars?|clubs?|nachtleben|sehenswürdigkeiten|aktivitäten)\\s+(?:kann|soll|gibt|machen|unternehmen|besuchen|sehen|essen|trinken|erleben)?\\s*(?:man|es|ich|wir)?\\s*(?:in|auf|bei|an|für|von|aus)?\\s*' + cityCapture, 'i'),

            // ═══════════════════════════════════════════════════════════════
            // ITALIANO (IT) — 4 patrones
            // ═══════════════════════════════════════════════════════════════
            // IT-1: Verbi — "vado a Roma", "viaggio a Firenze", "mi trasferisco a Milano"
            new RegExp('(?:vado|viaggio|visito|andrò|andiamo|vacanza|viaggerò|weekend|gita|mi trasferisco|abito|vivo|lavoro|studio|torno|arrivo|parto|sono stato|sono di|vengo da)\\s+(?:a|in|per|verso|ad|da|di)\\s+' + cityCapture, 'i'),
            // IT-2: Domande — "cosa fare a X", "dove mangiare a X", "migliori bar di X"
            new RegExp('(?:cosa|dove|come|qual[ie]?|i migliori|le migliori|bei|bel|bei posti|locali|ristoranti|bar|discoteche|pub|pizzerie|gelaterie|attrazioni|movida|vita notturna|divertimento|consigli per)\\s+(?:fare|andare|visitare|vedere|mangiare|bere|uscire|scoprire|esplorare)?\\s*(?:a|in|ad|di|da|per|nel|nella)?\\s*' + cityCapture, 'i'),

            // ═══════════════════════════════════════════════════════════════
            // 日本語 (JA) — city in latin chars + Japanese particles
            // ═══════════════════════════════════════════════════════════════
            // "Tokyo に行く", "Osaka のおすすめ", "Kyoto で食べる"
            new RegExp(cityCapture + '\\s*(?:に行く|に行きたい|に行こう|へ行く|に旅行|を訪問|で遊ぶ|のおすすめ|で食べる|で飲む|の観光|のナイトライフ|のバー|のレストラン|に住んでる|に住んでいる|出身)', 'i'),

            // ═══════════════════════════════════════════════════════════════
            // 中文 (ZH) — city in latin chars + Chinese verbs
            // ═══════════════════════════════════════════════════════════════
            // "去 Beijing", "到 Shanghai 旅游", "在 Shenzhen 吃什么"
            new RegExp('(?:去|到|在|飞往|前往|搬到|住在|来自|工作在|想去|准备去|计划去|打算去)\\s*' + cityCapture, 'i'),
            new RegExp(cityCapture + '\\s*(?:好玩吗|怎么样|有什么|推荐|攻略|美食|酒吧|夜生活|景点)', 'i'),

            // ═══════════════════════════════════════════════════════════════
            // РУССКИЙ (RU) — city in latin chars + Russian verbs
            // ═══════════════════════════════════════════════════════════════
            // "еду в Moscow", "лечу в Istanbul", "живу в Prague"
            new RegExp('(?:еду|лечу|путешеств|поеду|летим|отпуск|живу|работаю|учусь|родился|вырос|хочу поехать|планирую поехать|собираюсь|мечтаю поехать|перееду|переезжаю|был|была|бывал)\\s+(?:в|на|до|из)\\s+' + cityCapture, 'i'),
            // "что делать в X", "лучшие бары X", "ночная жизнь X"
            new RegExp('(?:что делать|куда пойти|где поесть|где выпить|лучшие|топ|популярные|интересные|бары|рестораны|клубы|ночная жизнь|достопримечательности|советы|рекомендации)\\s+(?:в|на|для|по)\\s+' + cityCapture, 'i'),

            // ═══════════════════════════════════════════════════════════════
            // العربية (AR) — city in latin chars + Arabic verbs
            // ═══════════════════════════════════════════════════════════════
            new RegExp('(?:سأسافر|أذهب|سأذهب|رحلة|أعيش|أعمل|أدرس|ولدت|أسكن|أريد أن أذهب|أخطط|أحلم بالذهاب|انتقلت|سأنتقل)\\s+(?:إلى|الى|ل|في|من)\\s+' + cityCapture, 'i'),
            // "ماذا أفعل في X", "أفضل مطاعم X"
            new RegExp('(?:ماذا|أين|كيف|أفضل|أحسن|أجمل|مطاعم|بارات|مقاهي|أماكن|معالم|حياة ليلية|نصائح|توصيات)\\s+(?:أفعل|أذهب|آكل|أشرب|أزور)?\\s*(?:في|ب|من)\\s+' + cityCapture, 'i'),

            // ═══════════════════════════════════════════════════════════════
            // BAHASA INDONESIA (ID)
            // ═══════════════════════════════════════════════════════════════
            // "pergi ke Bali", "jalan-jalan ke Jakarta", "tinggal di Bandung"
            new RegExp('(?:pergi|jalan[- ]?jalan|liburan|berkunjung|terbang|pindah|wisata|tinggal|kerja|kuliah|lahir|besar|mau ke|pengen ke|rencana ke|impian ke|pulang ke|balik ke|pernah ke)\\s+(?:ke|di|menuju|dari)\\s+' + cityCapture, 'i'),
            // "apa yang bisa dilakukan di X", "rekomendasi bar di X"
            new RegExp('(?:apa yang|dimana|mana|rekomendasi|saran|tempat|bar|restoran|kafe|klub|kehidupan malam|wisata|atraksi|tips)\\s+(?:bisa|harus|sebaiknya)?\\s*(?:dilakukan|dikunjungi|dimakan|diminum)?\\s*(?:di|ke|untuk|dekat)\\s+' + cityCapture, 'i'),

            // ═══════════════════════════════════════════════════════════════
            // 한국어 (KO) — city in latin chars + Korean particles
            // ═══════════════════════════════════════════════════════════════
            new RegExp(cityCapture + '\\s*(?:에\\s*(?:가|갈|갑니다|여행|살|살고|일하|공부)|로\\s*(?:가|여행|이사)|을\\s*(?:방문|여행)|의\\s*(?:맛집|바|클럽|관광|추천)|에서\\s*(?:뭐|어디|먹을|마실))', 'i'),

            // ═══════════════════════════════════════════════════════════════
            // TÜRKÇE (TR) — bonus: common dating app language
            // ═══════════════════════════════════════════════════════════════
            new RegExp('(?:gidiyorum|gideceğim|seyahat|tatil|geziyorum|yaşıyorum|çalışıyorum|taşınıyorum|uçuyorum|ziyaret)\\s+(?:için)?\\s*' + cityCapture + '(?:\'[ydn]a|\'[ydn]e|\'[td]a|\'[td]e)?', 'i'),

            // ═══════════════════════════════════════════════════════════════
            // CROSS-LANGUAGE GENERIC PATTERNS
            // ═══════════════════════════════════════════════════════════════
            // Generic venue search — "bars in Rome", "restaurantes en Lima", "café à Paris"
            new RegExp('(?:lugares|places|lieux|orte|tempat|locali|posti|spots|bars?|restaurants?|restaurantes?|cafés?|cafeterías?|nightlife|nightclub|clubs?|discotecas?|pubs?|scene|vida nocturna|movida|gastronomía|gastronomie|gastronomy|food scene|drinks?|cocktails?|rooftop|terrazas?|brunch)\\s+(?:en|in|à|di|at|around|near|a|em|por|cerca de|no|na|dans|nei|von|bei)\\s+' + cityCapture, 'i'),

            // Catch-all reverse — "en [City] dónde/qué/what/where"
            new RegExp('(?:en|in|à|em|di|auf|на|في|di)\\s+' + cityCapture + '\\s+(?:donde|dónde|qué|que|what|where|où|que faire|was|wo|cosa|dove|o que|onde|apa|어디|何|哪|где|أين)', 'i'),

            // ═══════════════════════════════════════════════════════════════
            // RELATIONSHIP / SOCIAL CONTEXT (someone in another city)
            // ═══════════════════════════════════════════════════════════════
            // ES — "mi amigo vive en X", "mi novia está en X", "ella es de X"
            // "tengo un match en X", "conocí a alguien de X", "mi ex es de X"
            new RegExp('(?:mi\\s+(?:amig[oa]|novi[oa]|pareja|esposa?|match|cita|familia|hermana?|prima?|tí[oa]|ex|crush|ligue|rollo|pretendiente|interés)|ella|él|conocí a (?:alguien|una persona)|salgo con alguien|hablo con alguien|chatea? con alguien|tengo un match|me gusta alguien)\\s+(?:vive|está|es de|trabaja|estudia|nació|creció|se mudó|queda|reside)\\s+(?:en|de)\\s+' + cityCapture, 'i'),
            // EN — "my friend lives in X", "she's from X", "dating someone in X"
            // "my match is in X", "talking to someone from X", "long distance with someone in X"
            new RegExp('(?:my\\s+(?:friend|girlfriend|boyfriend|partner|wife|husband|match|date|family|sister|brother|cousin|ex|crush|fling|situationship)|she|he|someone I(?:\'m| am)\\s+(?:talking|chatting|dating)|met someone|dating someone|seeing someone|talking to someone|matched with someone|long[- ]?distance)\\s+(?:lives?|is (?:from|in|based)|works?|studies|was born|stays?|resides?|moved to|located|based)\\s+(?:in|from|at|near)\\s+' + cityCapture, 'i'),
            // PT — "meu amigo mora em X", "ela é de X", "meu match é de X"
            new RegExp('(?:meu\\s+(?:amig[oa]|namorad[oa]|parceiro|marido|esposa|match|crush|ex|ficante)|ela|ele|minha família|minha\\s+(?:amiga|namorada|esposa)|conheci alguém)\\s+(?:mora|está|é de|trabalha|vive|nasceu|cresceu|se mudou)\\s+(?:em|de|no|na|pra|para)\\s+' + cityCapture, 'i'),
            // FR — "mon ami habite à X", "elle est de X"
            new RegExp('(?:mon\\s+(?:ami|copain|copine|partenaire|mari|femme|match|crush|ex|pote)|ma\\s+(?:copine|amie|femme)|elle|il|quelqu\'un)\\s+(?:habite|vit|est de|travaille|étudie|est basé|se trouve)\\s+(?:à|en|au|de|du)\\s+' + cityCapture, 'i'),
            // DE — "mein Freund wohnt in X", "sie kommt aus X"
            new RegExp('(?:mein(?:e)?\\s+(?:Freund(?:in)?|Partner(?:in)?|Frau|Mann|Match|Crush|Ex|Kumpel)|sie|er|jemand)\\s+(?:wohnt|lebt|ist aus|arbeitet|studiert|kommt aus|ist in|wurde geboren)\\s+(?:in|aus|von|bei|nach)\\s+' + cityCapture, 'i'),
            // IT — "il mio amico vive a X", "lei è di X"
            new RegExp('(?:il mio|la mia|mio|mia)\\s+(?:amic[oa]|ragazza?|partner|marit[oa]|moglie|match|crush|ex)\\s+(?:vive|abita|è di|lavora|studia|è nato)\\s+(?:a|in|di|da|ad)\\s+' + cityCapture, 'i'),

            // ═══════════════════════════════════════════════════════════════
            // CURIOSITY / GENERAL INTEREST
            // ═══════════════════════════════════════════════════════════════
            // ES — "cómo es X", "háblame de X", "vale la pena X", "es seguro X"
            new RegExp('(?:cómo es|qué tal es|me interesa|háblame de|cuéntame de|qué hay en|qué onda en|es bonit[oa]|vale la pena|es segur[oa]|es car[oa]|es barat[oa]|merece la pena|quiero saber de|info sobre|información sobre|datos de|es peligros[oa])\\s+' + cityCapture, 'i'),
            // EN — "how is X", "tell me about X", "is X safe", "is X expensive"
            new RegExp('(?:how is|tell me about|what(?:\'?s| is)\\s+.{0,15}\\s*like|is .{0,8} (?:nice|safe|expensive|cheap|worth|dangerous|fun|boring|overrated)|worth visiting|heard about|curious about|interested in|thinking about|dreaming about|info about|facts about)\\s+' + cityCapture, 'i'),
            // PT — "como é X", "me fala de X", "X é legal?"
            new RegExp('(?:como é|me fala de|conta sobre|o que acha de|vale a pena|é legal|é segur[oa]|é car[oa]|é barat[oa]|é perigoso)\\s+' + cityCapture, 'i'),
            // FR — "c'est comment X", "parle-moi de X"
            new RegExp('(?:c\'est comment|parle[- ]moi de|raconte[- ]moi|ça vaut le coup|c\'est cher|c\'est dangereux|c\'est beau|j\'ai entendu parler de)\\s+' + cityCapture, 'i'),

            // ═══════════════════════════════════════════════════════════════
            // SOLO / SINGLE TRAVELER
            // ═══════════════════════════════════════════════════════════════
            // ES — "viajar solo a X", "mochilero en X", "aventura en X"
            new RegExp('(?:viajar\\s+sol[oa]|irme\\s+sol[oa]|aventura|recorrer|explorar\\s+sol[oa]|mochile(?:ar|ro)|nómada digital|freelancer|trabajo remoto|digital nomad)\\s+(?:a|en|por|hacia|desde)\\s+' + cityCapture, 'i'),
            // EN — "solo trip to X", "digital nomad in X", "gap year in X"
            new RegExp('(?:solo\\s+trip|travel\\s+alone|backpack(?:ing)?|explore\\s+alone|wander|solo\\s+travel|digital\\s+nomad|remote\\s+work|gap\\s+year|sabbatical|study\\s+abroad|work\\s+abroad|expat\\s+life|nomading)\\s+(?:to|in|around|through|across)\\s+' + cityCapture, 'i'),
          ];

          // Extended skip words: common words in all 10 languages that could be false positive city names
          const skipWords = new Set([
            // ES
            'que', 'una', 'uno', 'unas', 'unos', 'las', 'los', 'mis', 'tus', 'sus', 'con', 'para', 'por',
            'como', 'donde', 'esta', 'este', 'esa', 'ese', 'algo', 'todo', 'otra', 'otro', 'cual', 'bien',
            'mal', 'mas', 'muy', 'sin', 'hay', 'ser', 'ver', 'dar', 'vez', 'dia', 'hoy', 'ayer',
            // EN
            'the', 'when', 'where', 'what', 'how', 'who', 'why', 'this', 'that', 'some', 'any', 'all',
            'can', 'will', 'would', 'could', 'should', 'may', 'might', 'much', 'many', 'few', 'more',
            'most', 'very', 'just', 'also', 'here', 'there', 'now', 'then', 'out', 'them',
            // PT
            'isso', 'isto', 'essa', 'esse', 'aqui', 'ali', 'mais', 'bem', 'mal', 'sim', 'nao',
            // FR
            'les', 'des', 'mes', 'tes', 'ses', 'une', 'ces', 'aux', 'qui', 'quoi', 'ici', 'bien',
            // DE
            'das', 'die', 'der', 'den', 'dem', 'ein', 'eine', 'hier', 'dort', 'dann', 'noch', 'auch',
            // IT
            'che', 'chi', 'per', 'con', 'dal', 'del', 'nel', 'sul', 'qui', 'poi', 'ora',
            // Generic
            'app', 'date', 'cita', 'match', 'chat', 'coach', 'sugar', 'black',
          ]);

          for (const pattern of travelPatterns) {
            const match = message.match(pattern);
            if (match && match[1] && match[1].trim().length >= 3) {
              const cityCandidate = match[1].trim();
              if (!skipWords.has(cityCandidate.toLowerCase())) {
                if (!extractedIntent) extractedIntent = {};
                extractedIntent.locationMention = cityCandidate;
                logger.info(`[dateCoachChat] Fallback location extraction: "${cityCandidate}" from message`);
                break;
              }
            }
          }
        }
      }

      let placesLastRadiusUsed = 0;
      let placesCenter = null;
      let placesLocationOverridden = false;
      let cachedSupplementaryPlaces = [];

      // Cross-message cache reuse: if user searched recently in the same area,
      // reuse cached places as supplementary results to avoid redundant API calls
      if (isUserPlaceSearch && !loadMoreActivities) {
        try {
          const cacheDoc = await db.collection('coachChats').doc(userId).collection('placesCache').doc('latest').get();
          if (cacheDoc.exists) {
            const cache = cacheDoc.data();
            const cacheTs = cache.timestamp?.toMillis ? cache.timestamp.toMillis()
              : (cache.timestamp?.toDate ? cache.timestamp.toDate().getTime() : 0);
            const cacheAge = Date.now() - cacheTs;
            const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
            if (cacheAge < CACHE_TTL && Array.isArray(cache.places) && cache.places.length > 0) {
              // Check if same area (within ~1km)
              const cachedLat = cache.centerLat || 0;
              const cachedLng = cache.centerLng || 0;
              const searchLat = effectiveLat || 0;
              const searchLng = effectiveLng || 0;
              const dist = Math.sqrt(Math.pow(searchLat - cachedLat, 2) + Math.pow(searchLng - cachedLng, 2));
              if (dist < 0.01) { // ~1km in lat/lng degrees
                logger.info(`[dateCoachChat] Reusing cached places (${cache.places.length} places, age=${Math.round(cacheAge / 1000)}s, cachedCat=${cache.cacheCategory || 'none'})`);
                cachedSupplementaryPlaces = cache.places;
              }
            }
          }
        } catch (cacheReuseErr) {
          logger.warn(`[dateCoachChat] Cross-message cache reuse check failed (non-critical): ${cacheReuseErr.message}`);
        }
      }

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
                placesCenter = mentionedCoords;
                placesLocationOverridden = true;
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
          // Determine the Google Places includedType(s) for category-specific searches.
          // CATEGORY_TO_PLACES_TYPE now stores arrays — use all types for parallel coverage.
          let searchAllTypes = null; // array of type strings, or null = no filter
          if (effectiveCategory && CATEGORY_TO_PLACES_TYPE[effectiveCategory]) {
            const entry = CATEGORY_TO_PLACES_TYPE[effectiveCategory];
            searchAllTypes = Array.isArray(entry) ? entry : [entry];
          } else if (isUserPlaceSearch && extractedIntent && extractedIntent.googleCategory) {
            const intentCat = normalizeCategory(extractedIntent.googleCategory);
            // For generic city searches (e.g. "places in Concepcion"), use multi-category search
            // to maximize category diversity. Only lock to a single category when the user
            // explicitly asked for a specific type (e.g. "restaurants in Temuco").
            const isGenericCitySearch = locationOverridden && extractedIntent.placeQueries &&
              extractedIntent.placeQueries.some((q) => typeof q === 'string' &&
                /lugar|place|spot|venue|sitio|endroit|lieu|sortir|ort|ausgehen|platz|local|sair|atividade|passeio|opcion|activit|cita|date|rendez|salir|hacer|tempat|kencan|jalan|pergi|donde\s*ir|que\s*hacer|things?\s*to\s*do|where\s*to/i.test(q));
            if (!isGenericCitySearch && intentCat && CATEGORY_TO_PLACES_TYPE[intentCat]) {
              const entry = CATEGORY_TO_PLACES_TYPE[intentCat];
              searchAllTypes = Array.isArray(entry) ? entry : [entry];
            }
            // For generic searches, searchAllTypes stays null → Google returns diverse types naturally
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
            // City mentioned — use intent-aware queries for relevant results
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
              // For generic city searches, add diverse category queries to maximize variety
              if (!searchAllTypes) {
                const allCats = Object.keys(categoryQueryMap);
                const shuffled = [...allCats].sort(() => Math.random() - 0.5);
                const diverseQueries = shuffled.slice(0, 6).map((k) => categoryQueryMap[k])
                  .filter((q) => !queries.includes(q));
                queries = [...queries, ...diverseQueries].slice(0, 8);
              }
            } else {
              // No specific intent queries — diverse categories as fallback
              const allCats = Object.keys(categoryQueryMap);
              const shuffled = [...allCats].sort(() => Math.random() - 0.5);
              queries = shuffled.slice(0, 8).map((k) => categoryQueryMap[k]);
            }
          } else if (isUserPlaceSearch && extractedIntent) {
            // Intent-aware search: use Gemini-extracted queries in user's language
            const intentQueries = Array.isArray(extractedIntent.placeQueries) && extractedIntent.placeQueries.length > 0
              ? extractedIntent.placeQueries.filter((q) => typeof q === 'string' && q.length > 0).slice(0, 3)
              : [];
            if (intentQueries.length > 0) {
              queries = intentQueries;
              const isBuySearch = extractedIntent.searchType === 'buy';
              if (isBuySearch) {
                // Shopping/buying intent — add specialty store queries, NOT restaurants
                // RC-configurable via coach_config.placeSearch.shopFallbacks
                const DEFAULT_SHOP_FALLBACKS = {
                  bakery: ['chocolatería', 'pastelería', 'bakery', 'candy shop', 'cookie shop', 'galletas artesanales'],
                  florist: ['florería', 'floristería', 'flower shop', 'fleuriste', 'Blumenladen', 'floricultura', '花屋', '花店', 'цветочный магазин', 'محل زهور', 'toko bunga'],
                  liquor_store: ['licorería', 'vinoteca', 'liquor store', 'wine shop', 'cave à vin', 'Weinhandlung', '酒屋', '酒类专卖', 'винный магазин', 'متجر مشروبات', 'toko minuman'],
                  shopping_mall: ['gift shop', 'tienda de regalos', 'joyería', 'boutique', 'perfumería'],
                };
                const shopFallbacks = (ps.shopFallbacks && typeof ps.shopFallbacks === 'object')
                  ? {...DEFAULT_SHOP_FALLBACKS, ...ps.shopFallbacks}
                  : DEFAULT_SHOP_FALLBACKS;
                const catKey = extractedIntent.googleCategory ? normalizeCategory(extractedIntent.googleCategory) : null;
                const fallbacks = shopFallbacks[catKey] || shopFallbacks.shopping_mall;
                const missingFallback = fallbacks.find((fb) => !queries.some((q) => q.toLowerCase().includes(fb.toLowerCase().split(' ')[0])));
                if (missingFallback) queries.push(missingFallback);
              } else if (extractedIntent.cuisineType && typeof extractedIntent.cuisineType === 'string') {
                // Cuisine search — add cuisine-specific query + fallback alternatives
                const ct = extractedIntent.cuisineType.toLowerCase();
                const cuisineQuery = `${extractedIntent.cuisineType} restaurant`;
                if (!queries.some((q) => q.toLowerCase().includes(ct))) {
                  queries.push(cuisineQuery);
                }
                // Cuisine fallback queries — RC-configurable via coach_config.placeSearch.cuisineFallbackQueries
                const DEFAULT_CUISINE_FALLBACK = {arabic:'mediterranean restaurant',chinese:'asian restaurant',italian:'mediterranean restaurant',mexican:'latin restaurant',japanese:'asian restaurant',thai:'asian restaurant',indian:'curry restaurant',peruvian:'ceviche restaurant',korean:'asian restaurant',french:'bistro',greek:'mediterranean restaurant',turkish:'kebab restaurant',vietnamese:'pho restaurant',brazilian:'steakhouse',vegan:'vegetarian restaurant',vegetarian:'healthy restaurant'};
                const altMap = (ps.cuisineFallbackQueries && typeof ps.cuisineFallbackQueries === 'object')
                  ? {...DEFAULT_CUISINE_FALLBACK, ...ps.cuisineFallbackQueries}
                  : DEFAULT_CUISINE_FALLBACK;
                const altQuery = altMap[ct];
                if (altQuery && !queries.some((q) => q.toLowerCase().includes(altQuery.split(' ')[0]))) {
                  queries.push(altQuery);
                }
              }
              // Add canonical category query if we have one for extra coverage
              if (searchAllTypes && extractedIntent.googleCategory) {
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
            // Place search detected but intent extraction failed — use raw message + diverse categories
            const allCats = Object.keys(categoryQueryMap);
            const shuffled = [...allCats].sort(() => Math.random() - 0.5);
            const diverseFallback = shuffled.slice(0, 5).map((k) => categoryQueryMap[k]);
            queries = [message.substring(0, 100), ...diverseFallback].slice(0, 6);
          } else {
            // General conversation — use diverse category queries for variety
            const allCats = Object.keys(categoryQueryMap);
            const shuffled = [...allCats].sort(() => Math.random() - 0.5);
            queries = shuffled.slice(0, 6).map((k) => categoryQueryMap[k]);
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
          let totalApiCalls = 0;
          let radiusIterations = 0;
          const MAX_RADIUS_ITERATIONS = 2;

          for (const stepRadius of effectiveSteps) {
            if (radiusIterations >= MAX_RADIUS_ITERATIONS) break;
            radiusIterations++;
            const radiusMeters = stepRadius ? Math.min(maxR, stepRadius) : null;
            lastRadius = stepRadius || 0;

            // Build (query × type) pairs; cap queries to 4 max, then cap pairs at 12
            const cappedQueries = queries.slice(0, 4); // Max 4 parallel queries
            const mainPairs = searchAllTypes
              ? cappedQueries.flatMap((q) => searchAllTypes.map((t) => ({q, t: [t]}))).slice(0, 12)
              : cappedQueries.map((q) => ({q, t: null}));
            totalApiCalls += mainPairs.length;
            const results = await Promise.all(
              mainPairs.map(({q, t}) => placesTextSearch(q, center, radiusMeters, lang, null, perQuery, useRestriction, t).catch(() => ({places: []}))),
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

          logger.info(`[dateCoachChat] Places API calls made: ${totalApiCalls} (${radiusIterations} radius iterations)`);
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

      // 4. Read coach history + fetch real places + events + RAG knowledge in parallel
      const ragConfig = config.rag || {};
      const eventPrefsPromise = getUserEventPreferences(userId).catch(() => null);
      const eventsPromise = (isUserPlaceSearch && hasLocation)
        ? eventPrefsPromise.then(prefs => fetchLocalEvents(searchLat || userLat, searchLng || userLng, searchRadius / 1000, lang, null, prefs)).catch(() => [])
        : Promise.resolve([]);
      const [historySnap, fetchedPlaces, ragKnowledge, localEvents] = await Promise.all([
        db.collection('coachChats').doc(userId)
          .collection('messages').orderBy('timestamp', 'desc').limit(config.historyLimit).get(),
        fetchCoachPlaces(),
        retrieveCoachKnowledge(message, process.env.GEMINI_API_KEY, ragConfig, lang),
        eventsPromise,
      ]);

      // Merge fetched places with cached supplementary places (deduplicate by placeId)
      let realPlaces = fetchedPlaces;
      if (cachedSupplementaryPlaces.length > 0 && fetchedPlaces.length > 0) {
        const fetchedIds = new Set(fetchedPlaces.filter((p) => p.placeId).map((p) => p.placeId));
        const supplementary = cachedSupplementaryPlaces.filter((p) => p.placeId && !fetchedIds.has(p.placeId));
        if (supplementary.length > 0) {
          realPlaces = [...fetchedPlaces, ...supplementary];
          logger.info(`[dateCoachChat] Merged ${supplementary.length} cached supplementary places (total=${realPlaces.length})`);
        }
      } else if (cachedSupplementaryPlaces.length > 0 && fetchedPlaces.length === 0) {
        // Fresh fetch returned nothing — use cached places as fallback
        realPlaces = cachedSupplementaryPlaces;
        logger.info(`[dateCoachChat] Using ${realPlaces.length} cached places as fallback (fresh fetch empty)`);
      }

      if (isUserPlaceSearch) {
        logger.info(`[dateCoachChat] Place search: hasLocation=${hasLocation}, realPlaces=${realPlaces.length}, isUserPlaceSearch=${isUserPlaceSearch}`);
      }
      const history = historySnap.empty ? '' : historySnap.docs.reverse().map((d) => {
        const m = d.data();
        return `${m.sender === 'user' ? 'User' : 'Coach'}: ${(m.message || '').substring(0, 300)}`;
      }).join('\n');

      // Detect user's communication style from coach chat history
      const coachUserMessages = historySnap.docs.reverse().map((d) => d.data()).filter((m) => m.sender === 'user');
      const commStyle = detectCommunicationStyle(coachUserMessages);
      const culturalCtx = getCulturalContext(lang);

      let adaptivePrompt = '';
      if (commStyle) {
        adaptivePrompt = `\n\nADAPT YOUR RESPONSE STYLE to mirror the user:
- Length: ${commStyle.verbosity} (${commStyle.verbosity === 'concise' ? 'keep replies short, max 2 paragraphs' : commStyle.verbosity === 'detailed' ? 'give thorough explanations' : 'moderate length, 2-3 paragraphs'})
- Emoji: ${commStyle.emojiStyle} (${commStyle.emojiStyle === 'heavy' ? 'use emojis freely' : commStyle.emojiStyle === 'none' ? 'avoid emojis' : 'occasional emojis'})
- Interaction: ${commStyle.questionFreq} (${commStyle.questionFreq === 'inquisitive' ? 'ask questions back' : 'give direct advice'})
- Energy: ${commStyle.energy} (${commStyle.energy === 'high' ? 'match their enthusiasm!' : 'calm, thoughtful tone'})`;
      }
      adaptivePrompt += `\n\nCULTURAL CONTEXT (user language: ${lang}): ${culturalCtx}`;

      // Build real places context for Gemini
      let realPlacesContext = '';
      if (realPlaces.length > 0) {
        realPlacesContext = '\n\nREAL PLACES FROM GOOGLE MAPS (you MUST select from these for activity suggestions):\n' +
          realPlaces.map((p, i) =>
            `${i + 1}. "${p.name}" [placeId:${p.placeId}] — ${p.address}${p.rating ? `, ★${p.rating}` : ''}${p.reviewCount ? ` (${p.reviewCount} reviews)` : ''}${p.priceLevel ? ` ${p.priceLevel}` : ''}${p.category ? ` [${p.category}]` : ''}${p.website ? ` | ${p.website}` : ''}${p.description ? `\n   ${p.description}` : ''}`,
          ).join('\n');
      }

      // Build local events context for Gemini
      let eventsContext = '';
      if (localEvents && localEvents.length > 0) {
        eventsContext = '\n\nLOCAL EVENTS HAPPENING SOON (suggest these as date ideas when relevant):\n' +
          localEvents.map((e, i) =>
            `📅 ${i + 1}. "${e.name}" at ${e.venue} — ${e.date}${e.time ? ' ' + e.time : ''}${e.category ? ` [${e.category}]` : ''}${e.price ? ` ${e.price}` : ' Free'}${e.address ? ` | ${e.address}` : ''}`,
          ).join('\n') +
          '\n\nWhen suggesting events, add "isEvent": true to the activity suggestion. Events are GREAT first date ideas because they provide built-in conversation topics!';
        logger.info(`[dateCoachChat] Injecting ${localEvents.length} local events into prompt`);
      }

      // Inject event preferences context if user has interacted with events before
      const eventPrefs = await eventPrefsPromise;
      if (eventPrefs && eventPrefs._totalInteractions >= 3) {
        const topCategories = Object.entries(eventPrefs)
          .filter(([k]) => !k.startsWith('_'))
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([cat, score]) => `${cat} (score: ${score})`);
        if (topCategories.length > 0) {
          eventsContext += `\n\nUSER EVENT PREFERENCES (from past interactions): Prefers ${topCategories.join(', ')}. Prioritize these event categories when suggesting.`;
        }
      }

      // 5. Build system prompt with content guardrails + activity suggestions
      const langInstruction = getLanguageInstruction(lang);
      const hasMatchContext = !!matchId && matchContext.length > 0;

      const blockedTopicsStr = (config.blockedTopics || []).join(', ');
      const offTopicMsg = (config.offTopicMessages || {})[lang] || (config.offTopicMessages || {}).en ||
        "I'm your Date Coach — I'm best at helping with dating, relationships, and connections!";

      // When user is explicitly searching for places, force activitySuggestions inclusion
      const minPlaceResults = (config.placeSearch || {}).minActivitiesForPlaceSearch || 6;
      // If the user mentioned a different city (e.g. "Buenos Aires") and we overrode the search location,
      // tell Gemini that the REAL PLACES are from THAT city, not the user's GPS location
      const locationOverrideInstruction = placesLocationOverridden && extractedIntent && extractedIntent.locationMention
        ? `\n\nIMPORTANT — LOCATION OVERRIDE: The user mentioned "${extractedIntent.locationMention}" in their message. The REAL PLACES listed below are from "${extractedIntent.locationMention}", NOT the user's current GPS location. Your reply MUST reference "${extractedIntent.locationMention}" as the location for these suggestions. Do NOT say your recommendations are limited to the user's current city — these places ARE in "${extractedIntent.locationMention}".`
        : '';
      // Cuisine-specific instruction for Gemini when a specific cuisine type is detected
      // Handles 3 scenarios: many results, few results, zero results
      const cuisineType = extractedIntent && extractedIntent.cuisineType;
      // Cuisine alternatives — RC-configurable via coach_config.placeSearch.cuisineAlternatives
      const DEFAULT_CUISINE_ALTERNATIVES = {
        arabic: 'turkish, lebanese, mediterranean, middle eastern',
        chinese: 'asian, japanese, korean, vietnamese, thai',
        italian: 'mediterranean, french, spanish, pizza',
        mexican: 'latin american, tex-mex, peruvian, colombian',
        japanese: 'asian, korean, chinese, sushi',
        thai: 'asian, vietnamese, chinese, indian',
        indian: 'thai, middle eastern, pakistani, nepalese',
        peruvian: 'latin american, mexican, japanese-peruvian (nikkei), ceviche',
        korean: 'asian, japanese, chinese, bbq',
        french: 'mediterranean, italian, european, bistro',
        greek: 'mediterranean, turkish, lebanese',
        turkish: 'arabic, lebanese, mediterranean, middle eastern',
        vietnamese: 'asian, thai, chinese, pho',
        brazilian: 'latin american, steakhouse, churrasco',
        mediterranean: 'greek, italian, turkish, lebanese',
        asian: 'chinese, japanese, thai, korean, vietnamese',
        vegan: 'vegetarian, organic, healthy, plant-based',
        vegetarian: 'vegan, organic, healthy, salad',
        fusion: 'contemporary, creative, international, eclectic',
      };
      const cuisineAlternatives = (ps.cuisineAlternatives && typeof ps.cuisineAlternatives === 'object')
        ? {...DEFAULT_CUISINE_ALTERNATIVES, ...ps.cuisineAlternatives}
        : DEFAULT_CUISINE_ALTERNATIVES;
      const altCuisines = cuisineType ? (cuisineAlternatives[cuisineType.toLowerCase()] || 'international, fusion, contemporary') : '';
      const cuisineInstruction = cuisineType
        ? `\n7. CUISINE FOCUS — "${cuisineType}" cuisine:
   a) BEST CASE (${cuisineType} places found in REAL PLACES list): Prioritize them at the top of activitySuggestions. In your "reply", mention a popular ${cuisineType} dish perfect for a date and any dining etiquette tip.
   b) FEW RESULTS (1-2 ${cuisineType} places): Include them first, then fill with similar cuisines (${altCuisines}). In your "reply", acknowledge the limited options and explain why the alternatives are great choices too.
   c) ZERO ${cuisineType.toUpperCase()} RESULTS: You MUST still generate activitySuggestions — DO NOT return an empty array or apologize without suggestions. Instead:
      - Select the closest cuisine alternatives from REAL PLACES: ${altCuisines}
      - In your "reply", say something like: "I couldn't find ${cuisineType} restaurants nearby, but here are some amazing alternatives with similar flavors that would be perfect for a date"
      - Include a brief ${cuisineType} cuisine tip anyway (dishes, etiquette) so the user feels their question was valued
      - NEVER say "sorry I can't help" — ALWAYS provide alternatives with enthusiasm`
        : '';
      const placeSearchInstruction = isUserPlaceSearch
        ? `\n\nCRITICAL — USER IS SEARCHING FOR PLACES OR PRODUCTS:
The user is explicitly asking about places, venues, locations, shops, or products to buy (gifts, food, drinks, etc.).
1. You MUST include an "activitySuggestions" array in your JSON response with at least ${minPlaceResults} places/shops.
2. Keep your "reply" text SHORT (2-3 sentences max) — just briefly introduce the suggestions. The MAIN content is the activitySuggestions array.
3. Select places from the REAL PLACES list provided. Use their EXACT names.
4. This is NOT optional — if you omit activitySuggestions, the response is INVALID.
5. NEVER respond with only text. The activitySuggestions array is the PRIORITY.
6. For PRODUCT/SHOPPING searches (chocolates, flowers, wine, gifts, jewelry, perfume, cake, etc.):
   - Suggest SPECIALTY SHOPS and STORES, NOT restaurants
   - Use categories "bakery" for sweets/chocolates/pasteles, "shopping_mall" for gifts/flowers/jewelry/perfume/clothing
   - In your "reply", include a brief romantic tip about the product (e.g., "dark chocolate pairs beautifully with a handwritten note", "red roses are classic, but sunflowers show creativity")
   - Prioritize: specialty stores > department stores > generic venues
   - If no specialty stores found, suggest bakeries for sweets or malls/boutiques for gifts${cuisineInstruction}${locationOverrideInstruction}`
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
- IMPORTANT: Maximize category diversity — include places from at least 4-5 DIFFERENT categories (cafe, restaurant, bar, night_club, park, museum, art_gallery, bakery, shopping_mall, spa, bowling_alley, movie_theater, aquarium, zoo). Do NOT concentrate on a single category.
- Include a mix of price levels and moods (first date, romantic, fun, adventurous, relaxed, special occasion)

${activityFormatSpec}

Only include activitySuggestions when contextually relevant (user discusses dates, asks for ideas, mentions going out, etc.). Do NOT include them for generic profile advice or conversation tips.${realPlacesContext}${eventsContext}`
          : `\nIf the user asks about places to go, things to do, or recommendations, include an "activitySuggestions" array with 8-${targetActivities} great places.

You MUST select places from the REAL PLACES list provided below (from Google Maps). Do NOT invent or hallucinate venue names. Pick the most interesting ones for the user based on their interests (${userInterests || 'none specified'}).
Focus on: MAXIMUM category diversity — select from at least 4-5 DIFFERENT categories (cafe, restaurant, bar, park, museum, art_gallery, bakery, shopping_mall, spa, night_club, bowling_alley, movie_theater). Do NOT concentrate results in a single category.

${activityFormatSpec}

Include activitySuggestions when the user asks about places, things to do, going out, or recommendations.${realPlacesContext}${eventsContext}`)
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
Focus on: MAXIMUM category diversity — include at least 4-5 DIFFERENT categories (cafe, restaurant, bar, park, museum, art_gallery, bakery, shopping_mall, spa, night_club, bowling_alley, movie_theater). Places worth visiting regardless of dating.
IMPORTANT: Suggest REAL, well-known, highly-rated venues — not generic ideas.

${activityFormatSpec}

Include activitySuggestions when the user asks about places, things to do, going out, or recommendations.`);

      // Build user-type specialization from config
      const userTypeSpec = (config.coachingSpecializations || {})[userType] || '';
      let stagePrompt = relationshipStage ? ((config.stagePrompts || {})[relationshipStage] || '') : '';
      // Dynamic stalled stage prompt — needs daysSinceLastMsg which is only available at runtime
      if (relationshipStage === 'stalled') {
        stagePrompt = `The conversation has been INACTIVE for ${Math.floor(daysSinceLastMsg)} days. The user needs help RE-ENGAGING this match. Focus on: casual re-openers, referencing shared interests, suggesting a low-pressure activity. Do NOT guilt-trip about the silence.`;
      }
      const responseStyleConfig = config.responseStyle || {};

      const contentGuardrails = `
CONTENT GUARDRAILS — STRICTLY ENFORCE:
You are EXCLUSIVELY a dating/relationship/connection coach. Stay within your domain. WHEN IN DOUBT, ANSWER — if even remotely related to dating, relationships, attraction, social skills, self-improvement for dating, or places/gifts, it IS on-topic.

ALLOWED TOPICS (answer ALL enthusiastically):
- Conversation & communication: tips, openers, icebreakers, texting etiquette, flirting, banter, active listening, handling silences, double texting, response timing, expressing interest, serious topics (exclusivity/boundaries), voice/video calls, transitioning app-to-real-life
- Dating & dates: first/second/creative date planning, venue recommendations, date logistics (timing/who pays/transport), memorable experiences, themed/budget/luxury/group/double/seasonal/virtual/long-distance dates, reading the vibe, post-date etiquette
- Places & venues (ALWAYS on-topic): any place/business/store/restaurant/bar/cafe/park search, gift shops, florists, bakeries, chocolatiers, wine shops, romantic venues, rooftops, entertainment (bowling/karaoke/escape rooms/movies), wellness (spas/yoga/gyms), museums/galleries/concerts, hotels/resorts, outdoor activities, shopping areas
- Romantic gestures & gifts: gift ideas for any occasion, surprises, love letters/playlists, special occasions, appreciation, love languages, anniversary ideas, meaningful apologies
- Profile & self-presentation: bio writing, photo tips, profile review, discovery settings, app strategy (swiping/super likes)
- Confidence & self-improvement: overcoming shyness/anxiety/rejection, body language, grooming/fashion, dating burnout, building an interesting life, introvert vs extrovert strategies, authenticity
- Relationships: attraction/chemistry/compatibility, red/green flags, reading interest signals, DTR/exclusivity, trust/intimacy/vulnerability, jealousy/insecurity, conflict resolution, long-distance, cultural/age-gap dynamics, attachment styles, boundaries, mixed signals, physical chemistry (tasteful), meeting family, independence vs togetherness, polyamory (non-judgmental)
- Dealing with difficulty: rejection, ghosting, breakups, unrequited feelings, dating after divorce, left on read, catfishing, toxic patterns, heartbreak, comparison syndrome, letting go vs fighting, uncommitted partners
- Safety: meeting precautions, recognizing manipulation/gaslighting/love bombing, consent, alcohol safety, online safety, trusting instincts, harassment resources

BLOCKED TOPICS (politely redirect):
${blockedTopicsStr}, topics with ZERO dating/relationship connection, personal data/contact requests, medical/legal/financial advice, homework/coding/math/trivia, political/religious debates, explicit sexual content, manipulation/revenge/stalking tactics, anything illegal/harmful

SAFETY PROTOCOL:
- Unsafe/harassment/abuse mentions: empathy FIRST, validate feelings, suggest emergency services or professional counselor. Don't be a therapist but make them feel heard
- Minors (age<18): age-appropriate advice only, no adult topics
- Never encourage unsafe meeting locations or premature personal info sharing
- Premature contact exchange: advise caution with safety tips
- Dangerous situations: prioritize safety over dating advice

PLACE SEARCHES ARE NEVER OFF-TOPIC — any place/business/store query is dating-relevant (gifts, venues, outings, self-improvement). Respond with activitySuggestions + explain how it enhances their dating life.

OFF-TOPIC HANDLING:
Only classify as off-topic if ZERO connection to dating/relationships/places/self-improvement (e.g. "solve this equation", "write code", "who won the election").
If off-topic: {"off_topic": true, "reply": "${offTopicMsg.replace(/"/g, '\\"')}", "suggestions": ["${lang === 'es' ? 'Mejora mi perfil' : 'Improve my profile'}", "${lang === 'es' ? 'Ideas para primera cita' : 'First date ideas'}", "${lang === 'es' ? 'Consejos de conversación' : 'Conversation tips'}"]}

EDGE CASES:

Greetings/Short Messages:
- Greetings ("hi/hello/hola"): warmly greet by name, mention stats, offer 2-3 help options (e.g. "I see you have ${totalMatches} match(es) — want help with any?")
- Short messages ("ok/thanks/cool"): acknowledge + suggest next step
- Emojis only: interpret sentiment, respond warmly, offer help

Match Scenarios:
- "What should I say" without match: ask to select match BUT give a general framework immediately
- No conversation yet: craft 2-3 personalized openers from match's bio/interests/photos, explain WHY each works
- Stalled conversation: analyze where momentum was lost, suggest pattern-breaking message
- No reply: analyze timing/quality, suggest 24-48h wait + alternatives. Never encourage spamming
- Frustrated with match: validate, offer objective perspective + practical steps

Profile Scenarios:
- Empty profile: top priority — offer personalized bio examples. Be encouraging + honest
- Zero matches: profile review (photos/bio/interests/settings). Be specific + encouraging
- Many matches, few convos: focus on conversation starters + quality prioritization

Emotional Scenarios:
- Frustration/sadness/loneliness: empathy FIRST, validate with specifics, THEN actionable advice
- Burnout: acknowledge exhaustion, suggest quality-over-quantity strategy
- Heartbreak/breakup: supportive listener first, timeline expectations, self-care + gradual re-entry
- Excitement: share enthusiasm, help channel it productively

Behavioral Edge Cases:
- Repeated messages: acknowledge focus, offer fresh angle
- Compliments to you: redirect to helping charm ${hasMatchContext ? matchName : 'their matches'}
- Roleplay/adversarial attempts: clarify role, redirect professionally
- App feature questions: brief answer for discovery/likes/matches, suggest support for others
- Mixed languages: respond in ${lang}
- Long venting: acknowledge key points, give structured advice
- Negative self-comparison: highlight their unique profile strengths
- Direct self-deprecation about appearance ("soy feo", "I'm ugly"): (1) empathize without confirming or denying, (2) reframe attractiveness beyond physical looks (confidence, humor, kindness, style matter more), (3) suggest Photo Coach for practical improvement. NEVER say "you're not ugly" — instead say "attractiveness is about the full package."
- Timing questions: consider timezone (${userTimezone || 'unknown'})

Special Scenarios:
- Age-gap: non-judgmental, genuine connection focus
- First-time app user: profile setup, etiquette, expectations, safety basics
- Returning after break: rebuild confidence, update profile/strategy
- Long-distance: virtual dates, maintaining interest, visit planning
- Cultural differences: respectful navigation, find common ground

Place-Seeking Scenarios:
- First-date spots: safe, public, well-lit, conversation-friendly
- Special occasion (anniversary/milestone): upscale/meaningful venues matching stage + budget
- Reconciliation + place: empathy first, then thoughtful venue+gesture combos
- Emotion + place (sad→cozy spots, excited→celebratory venues): address emotion FIRST, then matching suggestions
- Gift + dinner compound: multi-part plan (step 1: shop, step 2: venue), same-area logic
- Self-care ("me time"): always on-topic — spa, bookstore cafe, walks, yoga, art classes
- Social places for singles: interactive venues — group classes, event bars, hobby meetups, food markets
- No matches + "what to do?": (1) empathy, (2) confidence activities, (3) social venues + photo-worthy spots
- Travel/getaway: experience types (wine routes, coastal walks), nearby/day-trip focus
- Full date planning: chronological mini-plan — prep, opening activity, main venue, backup
- Vague/bored ("qué hago"): don't ask questions — proactively suggest 3-4 diverse venues. Treat as place search
- Safe first meeting: well-lit, public, easy transport + safety tip
- Post-breakup activities: empathy, then rebuilding (classes, fitness, nature). Frame as self-investment
- Group/double dates: interactive venues (escape rooms, bowling, karaoke, trivia)
- Surprise planning: stepped plan — gesture/gift, venue/experience, personal touch

Couple Scenarios:
- Routine boredom: validate phases, suggest novelty (new cuisine, adventure dates, recreate first date). Include places
- Cohabitation: expectations, individual activities, shared rituals, date nights
- Meeting family: prep topics, gift suggestions, managing anxiety, pre-dinner drink venue
- Trust rebuilding: empathy, I-statements framework, gesture+place combo. Never take sides
- Communication issues: check-ins, gratitude practice, NVC basics + conversation-encouraging activities
- Anniversary planning: tiered suggestions (intimate→grand), venue types + gifts by interests
- Jealousy/insecurity: validate without encouraging control, trust-building through quality time
- Long-distance phases: virtual dates, care packages, visit venue suggestions
- Love languages: identify both, suggest matching actions (gift shops, quality-time restaurants, activity venues)
- Different expectations: neutral frameworks for pace/exclusivity/future conversations
- Reigniting passion: treat each other like new dates — dress up, new venue, love notes
- Shared goals/future: frame as exciting joint projects (travel fairs, cooking together)
- Couple travel: experience types matched to interests + logistics
- In-law/external pressure: coping strategies, boundary language, stress-relief activities as a team
- Surprise for partner: reconnaissance → purchase → execution, personalized by interests

Single Scenarios:
- Starting over (divorce/long relationship): empathy, rediscovery, profile update for who they are NOW, self-care venues
- Social anxiety: normalize, suggest low-pressure formats (walking dates, activity-based). Offer conversation scripts
- Online vs offline: balance both — profile optimization + social venues/hobby classes
- Multiple matches: organization without manipulation, honesty, quality over quantity
- Self-focus vs dating: self-investment IS dating prep — gym, classes, hobbies
- Post-toxic recovery: recognize patterns, rebuild trust in instincts, set boundaries early
- App fatigue: strategic pauses, profile refresh, rediscover fun in dating
- First-time app user: basics without overwhelm — profile, safety, etiquette, first-date logistics
- Returning after break: confidence rebuilding, modern dating culture, easy first dates
- Dating as parent: timing, when to mention kids, family-friendly vs adult-only venues
- Ex dynamics (co-parenting/mutual friends): healthy boundaries, avoid comparison, focus forward
- Second-chance romance: evaluate worth, tasteful outreach, reunion venue planning
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

${adaptivePrompt}

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
      // Search Grounding: Gemini busca en Google cuando NO es place search
      const enableSearchGrounding = config.enableSearchGrounding !== false && !isUserPlaceSearch && !hasRealPlaces;
      const modelConfig = {
        model: AI_MODEL_NAME,
        generationConfig: {
          temperature: config.temperature,
          maxOutputTokens: outputTokens,
          responseMimeType: 'application/json',
        },
      };
      if (enableSearchGrounding) {
        modelConfig.tools = [{googleSearch: {}}];
        logger.info('[dateCoachChat] Search Grounding enabled — Gemini will access Google');
      }
      const model = genAI.getGenerativeModel(modelConfig);

      const conversationPrompt = history
        ? `${systemPrompt}\n\nConversation history:\n${history}\n\nUser: ${message.substring(0, config.maxMessageLength)}`
        : `${systemPrompt}\n\nUser: ${message.substring(0, config.maxMessageLength)}`;

      // Retry with exponential backoff for rate limits
      const result = await (async () => {
        let geminiResult = null;
        const MAX_RETRIES = 3;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            geminiResult = await model.generateContent(conversationPrompt);
            return geminiResult;
          } catch (geminiErr) {
            const isRetryable = geminiErr.status === 429 || geminiErr.status === 503 ||
                          geminiErr.message?.includes('429') || geminiErr.message?.includes('503') ||
                          geminiErr.message?.includes('RESOURCE_EXHAUSTED');
            if (!isRetryable || attempt === MAX_RETRIES) {
              throw geminiErr;
            }
            const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
            logger.warn(`[dateCoachChat] Gemini ${geminiErr.status || 'error'}, retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`);
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      })();
      const responseText = result.response.text();
      trackAICall({functionName: 'dateCoachChat', model: AI_MODEL_NAME, operation: 'chat', usage: result.response.usageMetadata, latencyMs: Date.now() - (result._startTime || Date.now()), userId});

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

              const resolvedWebsite = matched?.website || sanitizeWebsiteUrl(a.website) || null;
              const validInstagram = sanitizeInstagramHandle(a.instagram || a.instagramHandle || null);

              if (matched) {
                // Enrich with real Google Maps data (use conditional spread to avoid undefined — Firestore rejects undefined values)
                const enriched = {
                  ...base,
                  ...(matched.rating != null ? {rating: matched.rating} : (a.rating ? {rating: Math.min(5, Math.max(0, parseFloat(a.rating) || 0))} : {})),
                  ...(matched.reviewCount ? {reviewCount: matched.reviewCount} : {}),
                  ...(resolvedWebsite ? {website: resolvedWebsite} : {}),
                  ...(validInstagram ? {instagram: validInstagram} : {}),
                  ...(matched.googleMapsUrl ? {googleMapsUrl: matched.googleMapsUrl} : {}),
                  ...(matched.address ? {address: matched.address} : {}),
                  ...(matched.latitude != null ? {latitude: matched.latitude} : {}),
                  ...(matched.longitude != null ? {longitude: matched.longitude} : {}),
                  ...(matched.placeId ? {placeId: matched.placeId} : {}),
                  ...(matched.photos && matched.photos.length > 0 ? {photos: matched.photos} : {}),
                  ...(matched.isOpenNow != null ? {isOpenNow: matched.isOpenNow} : {}),
                };
                // Calculate distance from user if coordinates available
                if (userLat && userLng && matched.latitude != null && matched.longitude != null) {
                  enriched.distanceKm = Math.round(haversineKm(userLat, userLng, matched.latitude, matched.longitude) * 10) / 10;
                }
                return enriched;
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

            // Async: resolve Instagram handles via pipeline (cache → website → search)
            activitySuggestions = await Promise.all(activitySuggestions.map(async (activity) => {
              if (activity.instagram) return activity;
              try {
                const resolved = await resolveInstagramHandle({
                  placeId: activity.placeId || null,
                  placeName: activity.title || '',
                  placeAddress: activity.address || '',
                  websiteUrl: activity.website || null,
                  geminiGuess: null,
                  apiKey,
                });
                if (resolved && resolved.handle) {
                  return {...activity, instagram: resolved.handle, _igMetrics: resolved.metrics || null};
                }
              } catch (igErr) { /* continue without Instagram */ }
              return activity;
            }));
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
        activitySuggestions = realPlaces.slice(0, config.maxActivities).map((rp) => {
          const activity = {
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
            ...(rp.isOpenNow != null ? {isOpenNow: rp.isOpenNow} : {}),
          };
          if (userLat && userLng && rp.latitude != null && rp.longitude != null) {
            activity.distanceKm = Math.round(haversineKm(userLat, userLng, rp.latitude, rp.longitude) * 10) / 10;
          }
          return activity;
        });
      }

      // Supplement: add remaining Google Places to reach 30 total activities
      const MAX_INITIAL_ACTIVITIES = 30;
      if (realPlaces.length > 0 && activitySuggestions && activitySuggestions.length > 0 && activitySuggestions.length < MAX_INITIAL_ACTIVITIES) {
        const usedPlaceIds = new Set(activitySuggestions.filter((a) => a.placeId).map((a) => a.placeId));
        const unusedPlaces = realPlaces.filter((rp) => rp.placeId && !usedPlaceIds.has(rp.placeId));
        const supplementNeeded = MAX_INITIAL_ACTIVITIES - activitySuggestions.length;
        const supplementActivities = unusedPlaces.slice(0, supplementNeeded).map((rp) => {
          const activity = {
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
            ...(rp.isOpenNow != null ? {isOpenNow: rp.isOpenNow} : {}),
          };
          if (userLat && userLng && rp.latitude != null && rp.longitude != null) {
            activity.distanceKm = Math.round(haversineKm(userLat, userLng, rp.latitude, rp.longitude) * 10) / 10;
          }
          return activity;
        });
        if (supplementActivities.length > 0) {
          activitySuggestions = [...activitySuggestions, ...supplementActivities];
          logger.info(`[dateCoachChat] Supplemented with ${supplementActivities.length} direct Google Places (total: ${activitySuggestions.length})`);
        }
      }

      // Sort by combined score: Google Places (rating + reviews) + Instagram (followers + freshness)
      if (activitySuggestions && activitySuggestions.length > 1) {
        activitySuggestions.sort((a, b) =>
          calculatePlaceScore({rating: b.rating, reviewCount: b.reviewCount, igMetrics: b._igMetrics}) -
          calculatePlaceScore({rating: a.rating, reviewCount: a.reviewCount, igMetrics: a._igMetrics}),
        );
      }

      // Strip internal ranking fields before output
      if (activitySuggestions) {
        activitySuggestions = activitySuggestions.map(({_igMetrics, ...rest}) => rest);
      }

      // Self-Evaluation Loop: evaluate response quality before returning
      let selfEvalData = null;
      const evalConfig = config.selfEvaluation || {};
      if (evalConfig.enabled && reply && !isOffTopic) {
        const shouldEval = Math.random() < (evalConfig.sampleRate || 0.3);
        if (shouldEval) {
          try {
            const evalModel = genAI.getGenerativeModel({
              model: AI_MODEL_LITE,
              generationConfig: {maxOutputTokens: 256, temperature: 0.1, responseMimeType: 'application/json'},
            });
            const evalPrompt = `Rate this dating coach response 1-10.

USER: "${message.substring(0, 200)}"
COACH: "${reply.substring(0, 600)}"

Score on: specificity (references user situation?), actionability (concrete steps?), empathy (acknowledges emotions?), safety (no harmful advice?).
Return JSON: {"score":N,"issues":["issue1"]}`;

            const evalResult = await evalModel.generateContent(evalPrompt);
            const evalParsed = parseGeminiJsonResponse(evalResult.response.text());
            selfEvalData = {score: evalParsed.score || 5, issues: evalParsed.issues || []};
            logger.info(`[Self-eval] score: ${selfEvalData.score}, issues: ${(selfEvalData.issues || []).join(', ')}`);
          } catch (evalErr) {
            logger.warn(`[Self-eval] failed (non-critical): ${evalErr.message}`);
          }
        }
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
          // Use overridden city name if user mentioned a different city (e.g. "Buenos Aires")
          // Otherwise, reverse geocode the user's GPS coordinates
          let cityName;
          if (placesLocationOverridden && extractedIntent && extractedIntent.locationMention) {
            cityName = extractedIntent.locationMention;
          } else if (placesLocationOverridden && placesCenter) {
            cityName = await reverseGeocode(placesCenter.latitude, placesCenter.longitude, userId);
          } else {
            cityName = await reverseGeocode(effectiveLat, effectiveLng, userId);
          }
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
          const cacheSearchLat = placesLocationOverridden && placesCenter ? placesCenter.latitude : effectiveLat;
          const cacheSearchLng = placesLocationOverridden && placesCenter ? placesCenter.longitude : effectiveLng;
          await db.collection('coachChats').doc(userId).collection('placesCache').doc('latest').set({
            query: message.substring(0, 200),
            places: realPlaces,
            returnedPlaceIds,
            dominantCategory,
            cacheCategory: requestCategory || dominantCategory || null,
            lastRadiusUsed: placesLastRadiusUsed,
            ...(typeof cacheSearchLat === 'number' ? {centerLat: cacheSearchLat, centerLng: cacheSearchLng} : {}),
            ...(extractedIntent ? {intent: {placeType: extractedIntent.placeType || null, googleCategory: extractedIntent.googleCategory || null, locationMention: extractedIntent.locationMention || null, cuisineType: extractedIntent.cuisineType || null, searchType: extractedIntent.searchType || null}} : {}),
            ...(placesLocationOverridden && placesCenter ? {overrideLat: placesCenter.latitude, overrideLng: placesCenter.longitude} : {}),
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
          ...(selfEvalData ? {selfEvalScore: selfEvalData.score} : {}),
        });

        // 8. Decrement coach messages remaining (atomic increment avoids TOCTOU race)
        newRemaining = Math.max(0, coachMessagesRemaining - 1);
        batch.update(userRefForCredits, {
          coachMessagesRemaining: admin.firestore.FieldValue.increment(-1),
        });

        await batch.commit();

        // 8b. Log evaluation metrics (non-blocking)
        if (selfEvalData && config.ragEffectivenessTracking?.enabled !== false) {
          db.collection('coachEvaluations').add({
            userId, messageId: coachMsgRef.id,
            selfEvalScore: selfEvalData.score,
            selfEvalIssues: selfEvalData.issues || [],
            topics: geminiTopics,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          }).catch(() => {});
        }

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
      const dailyCreditsDefault = config.dailyCredits || 3;
      const currentCredits = userDocForCredits.exists
        ? (typeof userDocForCredits.data().coachMessagesRemaining === 'number'
          ? userDocForCredits.data().coachMessagesRemaining : dailyCreditsDefault)
        : dailyCreditsDefault;

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

// --- Realtime coach tips ---
/**
 * Algorithmic chemistry score calculator — no AI, instant, free.
 * Uses message patterns to compute a baseline score.
 */
function calculateAlgorithmicChemistry(messages, userId, weightsConfig = {}) {
  if (!messages || messages.length === 0) return {score: 55, trend: 'stable', engagement: 'low'};

  const w = {
    reciprocity: weightsConfig.reciprocity || 25,
    volume: weightsConfig.volume || 20,
    messageLength: weightsConfig.messageLength || 15,
    questions: weightsConfig.questions || 15,
    emojis: weightsConfig.emojis || 10,
    specialMessages: weightsConfig.specialMessages || 15,
  };
  const baseScore = weightsConfig.baseScore || 35;
  const scoreMin = weightsConfig.scoreMin || 40;
  const scoreMax = weightsConfig.scoreMax || 95;

  const textMsgs = messages.filter((m) => m.type === 'text' || !m.type);
  const userMsgs = textMsgs.filter((m) => m.sender === 'user');
  const matchMsgs = textMsgs.filter((m) => m.sender === 'match');
  const totalText = textMsgs.length;

  const ratio = totalText > 0 ? Math.min(userMsgs.length, matchMsgs.length) / Math.max(userMsgs.length, matchMsgs.length, 1) : 0;
  const reciprocityScore = Math.round(ratio * w.reciprocity);

  const volumeScore = Math.min(w.volume, Math.round(totalText * 1.5));

  const avgLength = textMsgs.reduce((sum, m) => sum + (m.text || '').length, 0) / Math.max(textMsgs.length, 1);
  const lengthScore = Math.min(w.messageLength, Math.round(avgLength / 10));

  const questionCount = textMsgs.filter((m) => (m.text || '').includes('?')).length;
  const questionScore = Math.min(w.questions, questionCount * 3);

  const emojiPattern = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  const emojiCount = textMsgs.filter((m) => emojiPattern.test(m.text || '')).length;
  const emojiScore = Math.min(w.emojis, emojiCount * 2);

  const specialMsgs = messages.filter((m) => m.type === 'place' || m.type === 'date_blueprint').length;
  const specialScore = Math.min(w.specialMessages, specialMsgs * 8);

  const rawScore = baseScore + reciprocityScore + volumeScore + lengthScore + questionScore + emojiScore + specialScore;
  const score = Math.min(scoreMax, Math.max(scoreMin, rawScore));

  // Trend: compare first half vs second half engagement
  const half = Math.floor(textMsgs.length / 2);
  const firstHalf = textMsgs.slice(0, half);
  const secondHalf = textMsgs.slice(half);
  const firstAvg = firstHalf.reduce((s, m) => s + (m.text || '').length, 0) / Math.max(firstHalf.length, 1);
  const secondAvg = secondHalf.reduce((s, m) => s + (m.text || '').length, 0) / Math.max(secondHalf.length, 1);
  const risingFactor = weightsConfig.trendRisingFactor || 1.2;
  const fallingFactor = weightsConfig.trendFallingFactor || 0.7;
  const trend = secondAvg > firstAvg * risingFactor ? 'rising' : secondAvg < firstAvg * fallingFactor ? 'falling' : 'stable';

  const engHigh = weightsConfig.engagementHigh || 70;
  const engMed = weightsConfig.engagementMedium || 50;
  const engagement = score >= engHigh ? 'high' : score >= engMed ? 'medium' : 'low';

  return {score, trend, engagement};
}

/**
 * Analyze conversation patterns between user and match.
 * Returns behavioral metrics (effort ratio, response times, initiative balance, engagement trend).
 */
function analyzeConversationPatterns(messages, currentUserId) {
  if (!messages || messages.length < 4) return null;

  const sorted = [...messages].sort((a, b) => {
    const tA = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
    const tB = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
    return tA - tB;
  });

  const userMsgs = sorted.filter((m) => m.senderId === currentUserId);
  const matchMsgs = sorted.filter((m) => m.senderId !== currentUserId);

  if (userMsgs.length === 0 || matchMsgs.length === 0) return null;

  // 1. Effort ratio (avg word count)
  const userAvgWords = userMsgs.reduce((s, m) => s + (m.message || '').split(/\s+/).length, 0) / userMsgs.length;
  const matchAvgWords = matchMsgs.reduce((s, m) => s + (m.message || '').split(/\s+/).length, 0) / matchMsgs.length;
  const effortRatio = matchAvgWords > 0 ? Math.round((userAvgWords / matchAvgWords) * 10) / 10 : 99;

  // 2. Response time asymmetry (avg minutes between consecutive msgs from different senders)
  const userResponseTimes = [];
  const matchResponseTimes = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (prev.senderId === curr.senderId) continue; // same sender, skip
    const prevT = prev.timestamp?.toMillis ? prev.timestamp.toMillis() : 0;
    const currT = curr.timestamp?.toMillis ? curr.timestamp.toMillis() : 0;
    const diffMin = (currT - prevT) / 60000;
    if (diffMin > 1440) continue; // skip gaps > 24h (different conversation sessions)
    if (curr.senderId === currentUserId) {
      userResponseTimes.push(diffMin);
    } else {
      matchResponseTimes.push(diffMin);
    }
  }
  const userAvgResponse = userResponseTimes.length > 0 ? Math.round(userResponseTimes.reduce((a, b) => a + b, 0) / userResponseTimes.length) : 0;
  const matchAvgResponse = matchResponseTimes.length > 0 ? Math.round(matchResponseTimes.reduce((a, b) => a + b, 0) / matchResponseTimes.length) : 0;

  // 3. Initiative balance (who sends first message after 4h+ gap)
  let userInitiatives = 0;
  let matchInitiatives = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevT = prev.timestamp?.toMillis ? prev.timestamp.toMillis() : 0;
    const currT = curr.timestamp?.toMillis ? curr.timestamp.toMillis() : 0;
    if ((currT - prevT) > 4 * 3600000) { // 4h gap = new conversation
      if (curr.senderId === currentUserId) userInitiatives++;
      else matchInitiatives++;
    }
  }
  const totalInitiatives = userInitiatives + matchInitiatives;
  const initiativeBalance = totalInitiatives > 0 ? Math.round((userInitiatives / totalInitiatives) * 100) : 50;

  // 4. Engagement trend (compare first half vs second half message frequency)
  const midpoint = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, midpoint);
  const secondHalf = sorted.slice(midpoint);
  const firstHalfDays = firstHalf.length > 1 ? ((firstHalf[firstHalf.length - 1].timestamp?.toMillis?.() || 0) - (firstHalf[0].timestamp?.toMillis?.() || 0)) / 86400000 : 1;
  const secondHalfDays = secondHalf.length > 1 ? ((secondHalf[secondHalf.length - 1].timestamp?.toMillis?.() || 0) - (secondHalf[0].timestamp?.toMillis?.() || 0)) / 86400000 : 1;
  const firstRate = firstHalf.length / Math.max(firstHalfDays, 0.5);
  const secondRate = secondHalf.length / Math.max(secondHalfDays, 0.5);
  let engagementTrend = 'stable';
  if (secondRate > firstRate * 1.3) engagementTrend = 'rising';
  else if (secondRate < firstRate * 0.5) engagementTrend = 'ghosting';
  else if (secondRate < firstRate * 0.7) engagementTrend = 'declining';

  // 5. Detect flags
  const flags = [];
  if (effortRatio > 3) flags.push('one_sided_effort');
  if (engagementTrend === 'ghosting') flags.push('ghosting_risk');
  if (initiativeBalance > 80) flags.push('user_always_initiates');
  if (matchAvgResponse > 0 && userAvgResponse > 0 && matchAvgResponse > userAvgResponse * 5) flags.push('slow_responder');

  return {
    initiativeBalance,
    userAvgResponseMin: userAvgResponse,
    matchAvgResponseMin: matchAvgResponse,
    userAvgWords: Math.round(userAvgWords),
    matchAvgWords: Math.round(matchAvgWords),
    effortRatio,
    engagementTrend,
    flags,
    messageCount: sorted.length,
    userMsgCount: userMsgs.length,
    matchMsgCount: matchMsgs.length,
  };
}

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
      // 0. Read RC config for tuning
      const config = await getCoachConfig();
      const tipsConfig = config.coachTips || {};
      const cacheTtl = tipsConfig.cacheTtlMs || 300000;
      const geminiThreshold = tipsConfig.geminiCallThreshold || 5;
      const deltaThreshold = tipsConfig.scoreDeltaThreshold || 10;

      // 1. Check cache first (avoid Gemini calls)
      const cacheRef = db.collection('coachTipsCache').doc(matchId);
      const cacheDoc = await cacheRef.get();
      if (cacheDoc.exists) {
        const cached = cacheDoc.data();
        const cacheAge = Date.now() - (cached.updatedAt?.toMillis?.() || 0);
        const msgCount = cached.messageCount || 0;

        // Use cache if within TTL
        if (cacheAge < cacheTtl) {
          logger.info(`[getRealtimeCoachTips] Cache hit (${Math.round(cacheAge / 1000)}s old) for ${matchId}`);
          return {
            success: true,
            chemistryScore: cached.chemistryScore || 55,
            chemistryTrend: cached.chemistryTrend || 'stable',
            engagementLevel: cached.engagementLevel || 'medium',
            tips: cached.tips || [],
            preDateDetected: cached.preDateDetected || false,
            suggestedAction: cached.suggestedAction || null,
          };
        }
      }

      // 2. Read match and verify participant
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

      // Extract raw messages for behavioral pattern analysis
      const messagesRaw = messagesSnap.docs.map((d) => d.data());

      const messages = messagesSnap.docs.map((d) => {
        const m = d.data();
        return {
          sender: m.senderId === userId ? 'user' : 'match',
          text: (m.message || '').substring(0, 200),
          type: m.type || 'text',
        };
      }).reverse();

      // Behavioral pattern analysis
      const patterns = analyzeConversationPatterns(messagesRaw, userId);
      let behavioralContext = '';
      if (patterns) {
        behavioralContext = `\n\nBEHAVIORAL ANALYSIS (factual, from message data):
- Messages: ${patterns.userMsgCount} from user, ${patterns.matchMsgCount} from match
- Effort: User avg ${patterns.userAvgWords} words/msg, match avg ${patterns.matchAvgWords} words/msg (ratio: ${patterns.effortRatio}x)
- Response times: User avg ${patterns.userAvgResponseMin}min, match avg ${patterns.matchAvgResponseMin}min
- Initiative: User starts ${patterns.initiativeBalance}% of conversations
- Engagement trend: ${patterns.engagementTrend}
${patterns.flags.length > 0 ? `- ⚠️ Flags: ${patterns.flags.join(', ')}` : '- No concerning patterns detected'}

Use this behavioral data to generate SPECIFIC, DATA-DRIVEN tips. If flags exist, address them honestly but constructively.`;
      }

      // 3. If too few messages, return basic response
      if (messages.length < 3) {
        return {
          success: true,
          chemistryScore: 55,
          chemistryTrend: 'rising',
          engagementLevel: 'medium',
          tips: [],
          preDateDetected: false,
          suggestedAction: null,
        };
      }

      // 4. Calculate algorithmic score (instant, free, always available)
      const algoWeights = {...(tipsConfig.algorithmicWeights || {}), baseScore: tipsConfig.baseScore, scoreMin: tipsConfig.scoreMin, scoreMax: tipsConfig.scoreMax, trendRisingFactor: tipsConfig.trendRisingFactor, trendFallingFactor: tipsConfig.trendFallingFactor, engagementHigh: tipsConfig.engagementHigh, engagementMedium: tipsConfig.engagementMedium};
      const algoResult = calculateAlgorithmicChemistry(messages, userId, algoWeights);
      logger.info(`[getRealtimeCoachTips] Algorithmic score: ${algoResult.score}, trend: ${algoResult.trend}`);

      // 5. Decide whether to call Gemini AI or use algorithmic score only
      // Call Gemini only every 3rd invocation or when score changed significantly
      const prevCache = cacheDoc.exists ? cacheDoc.data() : null;
      const prevMsgCount = prevCache?.messageCount || 0;
      const newMsgsSinceLast = messages.length - prevMsgCount;
      const prevScore = prevCache?.chemistryScore || 55;
      const scoreDelta = Math.abs(algoResult.score - prevScore);

      // Gemini conditions: first time, every N new messages, significant score change, or cache too old
      const cacheAgeMs = prevCache?.updatedAt?.toMillis ? (Date.now() - prevCache.updatedAt.toMillis()) : Infinity;
      const maxCacheAgeMs = (tipsConfig.maxCacheAgeMinutes || 30) * 60 * 1000;
      const shouldCallGemini = !prevCache || newMsgsSinceLast >= geminiThreshold || scoreDelta > deltaThreshold || cacheAgeMs > maxCacheAgeMs;

      if (!shouldCallGemini) {
        // Use algorithmic score + cached tips (saves Gemini cost)
        const cached = prevCache || {};
        const result = {
          success: true,
          chemistryScore: algoResult.score,
          chemistryTrend: algoResult.trend,
          engagementLevel: algoResult.engagement,
          tips: cached.tips || [],
          preDateDetected: cached.preDateDetected || false,
          suggestedAction: cached.suggestedAction || null,
        };

        // Update cache with new algorithmic score
        await cacheRef.set({
          ...result,
          messageCount: messages.length,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          source: 'algorithmic',
        }, {merge: true});

        logger.info(`[getRealtimeCoachTips] ALGORITHMIC ONLY (saved Gemini call): matchId=${matchId}, score=${algoResult.score}`);
        return result;
      }

      // 5b. Lightweight RAG for tips (topK=2 to keep it fast)
      let ragContext = '';
      try {
        const ragConfig = config.rag || {};
        const lastMessages = messages.slice(-3);
        const ragQuery = lastMessages.map((m) => m.text || m.message || '').join(' ');
        const ragPromise = retrieveCoachKnowledge(
          ragQuery,
          process.env.GEMINI_API_KEY,
          {...ragConfig, topK: 2}, // Override topK to 2 for speed
          lang,
        );
        const ragTimeout = new Promise((resolve) => setTimeout(() => resolve(''), 3000));
        ragContext = await Promise.race([ragPromise, ragTimeout]);
      } catch (ragErr) {
        logger.warn(`[getRealtimeCoachTips] RAG non-critical: ${ragErr.message}`);
      }

      // 6. Build conversation transcript (only when calling Gemini)
      const transcript = messages
        .map((m) => {
          if (m.type === 'place') return `${m.sender === 'user' ? userName : matchName}: [shared a place suggestion 📍]`;
          if (m.type === 'date_blueprint') return `${m.sender === 'user' ? userName : matchName}: [shared a date plan ✨]`;
          if (m.type === 'text' || !m.type) return `${m.sender === 'user' ? userName : matchName}: ${m.text}`;
          return null;
        })
        .filter(Boolean)
        .join('\n');

      // 5. Build Gemini prompt
      const langInstruction = getLanguageInstruction(lang);
      const systemPrompt = `You are a real-time dating coach AI analyzing a live chat conversation.
Analyze the following conversation between ${userName} and ${matchName} and provide actionable coaching insights.

User profile: ${userData.userType || 'unknown'}, interests: ${userInterests || 'none'}
Match profile: ${otherData.userType || 'unknown'}, interests: ${matchInterests || 'none'}

Recent conversation:
${transcript}
${ragContext ? `\nEXPERT KNOWLEDGE:\n${ragContext}\n` : ''}
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

IMPORTANT SCORING GUIDELINES:
- chemistryScore MUST be GENEROUS and ENCOURAGING — this is a dating app, we want to motivate users
- Score ranges:
  * 70-100: Great chemistry — conversation flows naturally, both engaged, humor/flirting present
  * 55-69: Good chemistry — decent back-and-forth, some connection signals
  * 40-54: Developing — conversation just started or is warming up (DEFAULT for active chats)
  * 25-39: Needs work — one-sided or awkward (ONLY if clearly struggling)
  * 0-24: NEVER use unless conversation is hostile or dead
- If both people are actively messaging, the MINIMUM score should be 45
- If there's ANY humor, flirting, or personal questions, score should be 60+
- Consider that early conversations naturally have lower depth — don't penalize for that
- Place shares, date planning, and questions about meeting count as HIGH engagement

Rules:
- Give 1-3 tips maximum, each specific to THIS conversation (not generic)
- The suggestedAction text should be a concrete message the user could copy and send
- chemistryScore should be encouraging — err on the HIGHER side when in doubt
- Set preDateDetected=true ONLY if there are clear signals of planning to meet
- Tips should reference specific things said in the conversation
- Be optimistic and supportive — focus on positives and growth opportunities
- NEVER give a score below 35 for an active conversation with mutual replies${behavioralContext}`;

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

      // Blend: use MAX of algorithmic and Gemini score (generous)
      const geminiScore = Math.max(35, Math.min(100, parseInt(parsed.chemistryScore) || 55));
      const blendedScore = Math.max(geminiScore, algoResult.score);

      const coachResult = {
        success: true,
        chemistryScore: blendedScore,
        chemistryTrend: ['rising', 'falling', 'stable'].includes(parsed.chemistryTrend) ? parsed.chemistryTrend : algoResult.trend,
        engagementLevel: ['high', 'medium', 'low'].includes(parsed.engagementLevel) ? parsed.engagementLevel : algoResult.engagement,
        tips,
        preDateDetected: !!parsed.preDateDetected,
        suggestedAction,
      };

      // Cache the Gemini result for future requests
      await cacheRef.set({
        ...coachResult,
        messageCount: messages.length,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'gemini',
        algoScore: algoResult.score,
        geminiScore,
      });

      logger.info(`[getRealtimeCoachTips] GEMINI: matchId=${matchId}, algo=${algoResult.score}, gemini=${geminiScore}, blended=${blendedScore}, tips=${tips.length}`);
      return coachResult;
    } catch (error) {
      // On Gemini failure, fallback to algorithmic score
      logger.warn(`[getRealtimeCoachTips] Gemini failed (${error.message}), using algorithmic fallback`);
      const fallbackMessages = [];
      try {
        const snap = await db.collection('matches').doc(matchId).collection('messages')
          .orderBy('timestamp', 'desc').limit(20).get();
        snap.docs.forEach((d) => {
          const m = d.data();
          fallbackMessages.push({sender: m.senderId === userId ? 'user' : 'match', text: m.message || '', type: m.type || 'text'});
        });
      } catch (_) { /* ignore */ }
      const algoFallback = calculateAlgorithmicChemistry(fallbackMessages.reverse(), userId);
      return {
        success: true,
        chemistryScore: algoFallback.score,
        chemistryTrend: algoFallback.trend,
        engagementLevel: algoFallback.engagement,
        tips: [],
        preDateDetected: false,
        suggestedAction: null,
      };
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════
// DATE DEBRIEF — Post-date proactive coaching
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Firestore trigger: When a blueprint message is created, schedule a debrief.
 * Writes to pendingDebriefs collection for later processing.
 */
exports.onBlueprintShared = onDocumentCreated(
  {document: 'matches/{matchId}/messages/{messageId}', region: 'us-central1'},
  async (event) => {
    const data = event.data?.data();
    if (!data || data.type !== 'date_blueprint') return;

    const matchId = event.params.matchId;
    const messageId = event.params.messageId;
    const db = admin.firestore();

    try {
      const matchDoc = await db.collection('matches').doc(matchId).get();
      if (!matchDoc.exists) return;
      const usersMatched = matchDoc.data().usersMatched || [];

      await db.collection('pendingDebriefs').add({
        matchId,
        messageId,
        usersMatched,
        blueprintTimestamp: data.timestamp || admin.firestore.FieldValue.serverTimestamp(),
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info(`[DateDebrief] Scheduled debrief for match ${matchId}`);
    } catch (e) {
      logger.warn(`[DateDebrief] onBlueprintShared error: ${e.message}`);
    }
  },
);

/**
 * Scheduled: Process pending debriefs 24-48h after blueprint was shared.
 * Sends a proactive coach message asking how the date went.
 */
exports.triggerDateDebriefs = onSchedule(
  {schedule: 'every 6 hours', region: 'us-central1', memory: '512MiB', timeoutSeconds: 120, secrets: [geminiApiKey]},
  async () => {
    const db = admin.firestore();
    const now = Date.now();
    const MS_24H = 24 * 3600000;
    const MS_48H = 48 * 3600000;

    try {
      const pending = await db.collection('pendingDebriefs')
        .where('status', '==', 'pending')
        .limit(50)
        .get();

      if (pending.empty) {
        logger.info('[DateDebrief] No pending debriefs');
        return;
      }

      let triggered = 0;
      const batch = db.batch();

      for (const doc of pending.docs) {
        const data = doc.data();
        const bpTs = data.blueprintTimestamp?.toDate?.()?.getTime() || data.createdAt?.toDate?.()?.getTime() || 0;
        const hoursSince = (now - bpTs) / 3600000;

        // Only trigger between 24-48h
        if (hoursSince < 24 || hoursSince > 48) continue;

        const usersMatched = data.usersMatched || [];
        const matchId = data.matchId;

        // Get match name for each user
        for (const userId of usersMatched) {
          const otherUserId = usersMatched.find(u => u !== userId);
          let matchName = 'tu match';
          let lang = 'es';
          try {
            const [userDoc, otherDoc] = await Promise.all([
              db.collection('users').doc(userId).get(),
              otherUserId ? db.collection('users').doc(otherUserId).get() : Promise.resolve({exists: false, data: () => ({})}),
            ]);
            if (otherDoc.exists) matchName = otherDoc.data().name || matchName;
            if (userDoc.exists) lang = (userDoc.data().deviceLanguage || 'es').split('-')[0].split('_')[0].toLowerCase();
          } catch (_) {}

          // Generate personalized debrief prompt
          const debriefMessages = {
            es: `¡Hey! Ayer tenías un plan con ${matchName}. ¿Cómo te fue? Cuéntame todo 💫`,
            en: `Hey! You had a date plan with ${matchName} yesterday. How did it go? Tell me everything 💫`,
            fr: `Hey ! Tu avais un plan avec ${matchName} hier. Comment ça s'est passé ? Raconte-moi 💫`,
            de: `Hey! Du hattest gestern ein Date mit ${matchName}. Wie war es? Erzähl mir alles 💫`,
            pt: `Hey! Ontem você tinha um plano com ${matchName}. Como foi? Me conta tudo 💫`,
          };
          const debriefText = debriefMessages[lang] || debriefMessages.en;

          // Write proactive coach message
          const coachMsgRef = db.collection('coachChats').doc(userId).collection('messages').doc();
          batch.set(coachMsgRef, {
            message: debriefText,
            sender: 'coach',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            matchId: matchId,
            type: 'debrief_prompt',
            blueprintMessageId: data.messageId,
          });

          // Track debrief
          const debriefRef = db.collection('coachChats').doc(userId).collection('debriefs').doc(matchId);
          batch.set(debriefRef, {
            blueprintMessageId: data.messageId,
            triggeredAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'pending',
            matchName,
          });

          triggered++;
        }

        // Mark as triggered
        batch.update(doc.ref, {status: 'triggered', triggeredAt: admin.firestore.FieldValue.serverTimestamp()});
      }

      if (triggered > 0) await batch.commit();
      logger.info(`[DateDebrief] Triggered ${triggered} debrief messages from ${pending.size} pending`);
    } catch (e) {
      logger.warn(`[DateDebrief] Error: ${e.message}`);
    }
  },
);

/**
 * Callable: User manually requests a date debrief for a specific match.
 * Finds the most recent blueprint and inserts a debrief prompt.
 */
exports.requestDateDebrief = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 30},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const userId = request.auth.uid;
    const {matchId} = request.data || {};
    if (!matchId) throw new Error('matchId is required');

    const db = admin.firestore();

    // Find most recent blueprint in this match
    const bpSnap = await db.collection('matches').doc(matchId).collection('messages')
      .where('type', '==', 'date_blueprint')
      .orderBy('timestamp', 'desc').limit(1).get();

    // Get match name
    const matchDoc = await db.collection('matches').doc(matchId).get();
    const usersMatched = matchDoc.data()?.usersMatched || [];
    const otherUserId = usersMatched.find(u => u !== userId);
    let matchName = 'tu match';
    if (otherUserId) {
      const otherDoc = await db.collection('users').doc(otherUserId).get();
      if (otherDoc.exists) matchName = otherDoc.data().name || matchName;
    }

    const userDoc = await db.collection('users').doc(userId).get();
    const lang = ((userDoc.data()?.deviceLanguage || 'en').split('-')[0]).toLowerCase();

    const hasBp = !bpSnap.empty;
    const messages = {
      es: hasBp
        ? `¿Cómo te fue en tu cita con ${matchName}? Cuéntame los detalles 💫`
        : `¿Tuviste alguna cita con ${matchName} últimamente? Cuéntame cómo fue 💬`,
      en: hasBp
        ? `How did your date with ${matchName} go? Tell me the details 💫`
        : `Did you go on a date with ${matchName} recently? Tell me how it went 💬`,
    };

    const debriefText = messages[lang] || messages.en;
    const msgRef = await db.collection('coachChats').doc(userId).collection('messages').add({
      message: debriefText,
      sender: 'coach',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      matchId,
      type: 'debrief_prompt',
      blueprintMessageId: hasBp ? bpSnap.docs[0].id : null,
    });

    return {success: true, messageId: msgRef.id, message: debriefText};
  },
);

// ── Coach Self-Improvement System ────────────────────────────────────────────

/**
 * Callable: Rate a coach response as helpful or not helpful.
 * Feeds into the learning system for self-improvement.
 */
exports.rateCoachResponse = onCall(
  {region: 'us-central1', memory: '128MiB', timeoutSeconds: 10},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {messageId, rating, reason} = request.data || {};
    if (!messageId || !['helpful', 'not_helpful'].includes(rating)) {
      return {success: false, error: 'invalid_params'};
    }

    const userId = request.auth.uid;
    const db = admin.firestore();

    try {
      const config = await getCoachConfig();
      // 0. Rate limiting — configurable via coach_config.feedbackRateLimitMs (default 5s)
      const profileRef = db.collection('coachChats').doc(userId);
      const profileDoc = await profileRef.get();
      const profile = profileDoc.exists ? profileDoc.data() : {};
      const lp = profile.learningProfile || {};
      const lastFbTime = lp.lastFeedback?.toMillis ? lp.lastFeedback.toMillis() : 0;
      const rateLimitMs = config.feedbackRateLimitMs || 5000;
      if (Date.now() - lastFbTime < rateLimitMs) {
        return {success: false, error: 'too_fast'};
      }

      // 1. Save feedback on the message + find original user question
      const msgRef = db.collection('coachChats').doc(userId).collection('messages').doc(messageId);
      const msgDoc = await msgRef.get();
      if (!msgDoc.exists) return {success: false, error: 'message_not_found'};

      // Find the user's question that triggered this coach response
      let userQuestion = '';
      try {
        const prevMsgs = await db.collection('coachChats').doc(userId)
          .collection('messages')
          .where('sender', '==', 'user')
          .orderBy('timestamp', 'desc')
          .limit(5)
          .get();
        // Find the user message closest BEFORE this coach message
        const coachTimestamp = msgDoc.data().timestamp?.toMillis?.() || Date.now();
        for (const pm of prevMsgs.docs) {
          const pmTime = pm.data().timestamp?.toMillis?.() || 0;
          if (pmTime < coachTimestamp) {
            userQuestion = (pm.data().message || '').substring(0, 300);
            break;
          }
        }
      } catch (_) { /* non-critical */ }

      await msgRef.update({
        feedback: {
          rating,
          reason: reason || null,
          userQuestion,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        },
      });

      // 2. Update learning profile satisfaction

      const feedbackCount = (lp.feedbackCount || 0) + 1;
      const positiveCount = (lp.positiveFeedbackCount || 0) + (rating === 'helpful' ? 1 : 0);
      const satisfactionRate = Math.round((positiveCount / feedbackCount) * 100);

      // Track low quality topics
      let lowQualityTopics = lp.lowQualityTopics || [];
      if (rating === 'not_helpful' && msgDoc.data().topic) {
        if (!lowQualityTopics.includes(msgDoc.data().topic)) {
          lowQualityTopics.push(msgDoc.data().topic);
          if (lowQualityTopics.length > 10) lowQualityTopics = lowQualityTopics.slice(-10);
        }
      }

      await profileRef.set({
        learningProfile: {
          ...lp,
          feedbackCount,
          positiveFeedbackCount: positiveCount,
          satisfactionRate,
          lowQualityTopics,
          lastFeedback: admin.firestore.FieldValue.serverTimestamp(),
        },
      }, {merge: true});

      logger.info(`[rateCoachResponse] ${userId.substring(0, 8)}: ${rating} on ${messageId} (satisfaction: ${satisfactionRate}%)`);
      return {success: true, satisfactionRate};
    } catch (err) {
      logger.error(`[rateCoachResponse] Error: ${err.message}`);
      return {success: false, error: err.message};
    }
  },
);

/**
 * Scheduled: Daily coach quality analysis.
 * Aggregates feedback from the previous day and stores metrics.
 */
exports.analyzeCoachQuality = onSchedule(
  {schedule: 'every day 02:00', region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async () => {
    const db = admin.firestore();
    const yesterday = new Date(Date.now() - 86400000);
    const yesterdayStr = yesterday.toISOString().substring(0, 10);
    const startMs = new Date(yesterday).setHours(0, 0, 0, 0);
    const endMs = new Date(yesterday).setHours(23, 59, 59, 999);

    try {
      // Query recent messages and filter feedback by date in code (avoids composite index on nested field)
      const allChats = await db.collection('coachChats').limit(500).get();
      let positive = 0;
      let negative = 0;
      const topicIssues = {};
      const negativeQuestions = [];

      for (const chatDoc of allChats.docs) {
        const msgs = await chatDoc.ref.collection('messages')
          .orderBy('timestamp', 'desc')
          .limit(50)
          .get();

        for (const msg of msgs.docs) {
          const data = msg.data();
          const fb = data.feedback;
          if (!fb || !fb.timestamp) continue;
          const fbTime = fb.timestamp.toMillis ? fb.timestamp.toMillis() : 0;
          if (fbTime < startMs || fbTime > endMs) continue;

          if (fb.rating === 'helpful') positive++;
          else {
            negative++;
            const topic = data.topic || 'unknown';
            topicIssues[topic] = (topicIssues[topic] || 0) + 1;
            if (fb.userQuestion) negativeQuestions.push(fb.userQuestion.substring(0, 100));
          }
        }
      }

      const total = positive + negative;
      if (total === 0) {
        logger.info('[analyzeCoachQuality] No feedback yesterday');
        return;
      }

      const satisfactionRate = Math.round((positive / total) * 100);
      const lowQualityTopics = Object.entries(topicIssues)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([topic, count]) => ({topic, negativeCount: count}));

      await db.collection('coachInsights').doc('daily').collection(yesterdayStr).doc('summary').set({
        date: yesterdayStr,
        totalFeedback: total,
        positive,
        negative,
        satisfactionRate,
        lowQualityTopics,
        sampleNegativeQuestions: negativeQuestions.slice(0, 10),
        analyzedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const config = await getCoachConfig();
      const lowSatisfactionThreshold = config.qualityAnalysis?.lowSatisfactionThreshold || 60;
      if (satisfactionRate < lowSatisfactionThreshold) {
        logger.warn(`[analyzeCoachQuality] LOW satisfaction: ${satisfactionRate}% (${positive}/${total}). Top issues: ${lowQualityTopics.map((t) => t.topic).join(', ')}`);
      } else {
        logger.info(`[analyzeCoachQuality] Satisfaction: ${satisfactionRate}% (${positive}/${total})`);
      }
    } catch (err) {
      logger.error(`[analyzeCoachQuality] Error: ${err.message}`);
    }
  },
);

/**
 * Scheduled: Weekly RAG knowledge base auto-update.
 * Analyzes feedback gaps and generates new knowledge chunks.
 */
exports.updateCoachKnowledge = onSchedule(
  {schedule: 'every sunday 03:00', region: 'us-central1', memory: '1GiB', timeoutSeconds: 300, secrets: [geminiApiKey]},
  async () => {
    const db = admin.firestore();
    const config = await getCoachConfig();
    if (!config.ragAutoUpdate?.enabled) {
      logger.info('[updateCoachKnowledge] Disabled via config');
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.warn('[updateCoachKnowledge] Missing GEMINI_API_KEY');
      return;
    }

    try {
      // 1. Read messages with negative feedback from the last 7 days
      const weekAgo = new Date(Date.now() - 7 * 86400000);
      const allChats = await db.collection('coachChats').limit(200).get();

      const negativeExamples = [];
      const positiveExamples = [];

      const weekAgoMs = weekAgo.getTime();
      for (const chatDoc of allChats.docs) {
        const msgs = await chatDoc.ref.collection('messages')
          .orderBy('timestamp', 'desc')
          .limit(30)
          .get();

        for (const msg of msgs.docs) {
          const data = msg.data();
          if (!data.feedback || !data.feedback.timestamp) continue;
          const fbTime = data.feedback.timestamp.toMillis ? data.feedback.timestamp.toMillis() : 0;
          if (fbTime < weekAgoMs) continue;

          const example = {
            question: data.feedback?.userQuestion || data.userMessage || '(no question recorded)',
            response: (data.message || '').substring(0, 300),
            topic: data.topic || 'general',
            rating: data.feedback.rating,
            reason: data.feedback.reason || '',
          };
          if (data.feedback.rating === 'not_helpful') negativeExamples.push(example);
          else positiveExamples.push(example);
        }
      }

      const minNegativeFeedback = config.ragAutoUpdate?.minNegativeFeedback || 3;
      if (negativeExamples.length < minNegativeFeedback) {
        logger.info(`[updateCoachKnowledge] Not enough negative feedback (${negativeExamples.length}/${minNegativeFeedback}) — skipping`);
        return;
      }

      // 2. Read latest quality insights to guide knowledge generation
      const latestInsights = {};
      try {
        const yesterday = new Date(Date.now() - 86400000).toISOString().substring(0, 10);
        const insightDoc = await db.collection('coachInsights').doc('daily').collection(yesterday).doc('summary').get();
        if (insightDoc.exists) {
          const data = insightDoc.data();
          latestInsights.satisfactionRate = data.satisfactionRate || 0;
          latestInsights.lowQualityTopics = data.lowQualityTopics || [];
          latestInsights.sampleQuestions = data.sampleNegativeQuestions || [];
        }
      } catch (insErr) {
        logger.warn(`[updateCoachKnowledge] Could not read insights: ${insErr.message}`);
      }

      // 3. Cross-learning: read moderation insights to understand what users get flagged for
      const moderationContext = [];
      try {
        const modInsight = await db.collection('moderationInsights').doc('ragUpdates').get();
        if (modInsight.exists) {
          moderationContext.push(`Moderation stats: ${modInsight.data().totalFalsePositiveDisputes || 0} false positives, ${modInsight.data().totalMissedThreatDisputes || 0} missed threats last week`);
        }
        const recentDisputes = await db.collection('moderationDisputes')
          .where('disputeType', '==', 'false_positive')
          .orderBy('createdAt', 'desc')
          .limit(5)
          .get();
        for (const d of recentDisputes.docs) {
          const dd = d.data();
          if (dd.originalCategory) moderationContext.push(`Users get falsely flagged for: ${dd.originalCategory} — "${(dd.messageText || '').substring(0, 80)}"`);
        }
      } catch (modErr) {
        logger.warn(`[updateCoachKnowledge] Could not read moderation context: ${modErr.message}`);
      }

      // 4. Use Gemini WITH Search Grounding to generate knowledge chunks
      const genAI = new GoogleGenerativeAI(apiKey);
      const enableSearch = config.ragAutoUpdate?.enableSearchGrounding !== false;
      const modelConfig = {
        model: AI_MODEL_LITE,
        generationConfig: {maxOutputTokens: 4096, temperature: 0.3, responseMimeType: 'application/json'},
      };
      if (enableSearch) {
        modelConfig.tools = [{googleSearch: {}}];
        logger.info('[updateCoachKnowledge] Search Grounding enabled — accessing latest dating advice & psychology');
      }
      const model = genAI.getGenerativeModel(modelConfig);

      let gapPrompt = `You are a dating coach knowledge base curator for a dating app (users).

UNHELPFUL RESPONSES — users marked these as not helpful:
${negativeExamples.slice(0, 10).map((e, i) => `${i + 1}. Topic: ${e.topic} | Q: "${e.question}" | Reason: "${e.reason}"`).join('\n')}
`;

      if (positiveExamples.length > 0) {
        gapPrompt += `\nHELPFUL RESPONSES — users liked these (reinforce these patterns):
${positiveExamples.slice(0, 5).map((e, i) => `${i + 1}. Topic: ${e.topic} | Q: "${e.question}"`).join('\n')}
`;
      }

      if (latestInsights.lowQualityTopics?.length > 0) {
        gapPrompt += `\nWEAKEST TOPICS (from daily analytics): ${latestInsights.lowQualityTopics.map((t) => t.topic).join(', ')}
Overall satisfaction: ${latestInsights.satisfactionRate}%
`;
      }

      if (moderationContext.length > 0) {
        gapPrompt += `\nMODERATION CROSS-LEARNING (teach users to communicate safely):
${moderationContext.slice(0, 5).join('\n')}
`;
      }

      gapPrompt += `
Search the internet for the LATEST dating advice trends, relationship psychology research, and communication techniques from 2025-2026.

Generate 3-7 NEW knowledge chunks. Focus on:
1. FILL GAPS — address the unhelpful response topics with expert, actionable advice
2. REINFORCE SUCCESS — expand on what users found helpful
3. LATEST TRENDS — new dating psychology, attachment theory applications, communication frameworks
4. SUGAR DATING CONTEXT — boundary setting, first meeting safety, expectations management
5. SAFE COMMUNICATION — help users express themselves without triggering content moderation filters
6. CULTURAL SENSITIVITY — advice that works across cultures (app has users in 10+ languages)

Each chunk should be actionable, specific, and immediately useful (not generic platitudes).

Return JSON:
{
  "chunks": [
    {
      "category": "conversation_starters|first_dates|boundaries|safety|communication|psychology|cultural_context|confidence|conflict_resolution",
      "language": "en",
      "title": "short title",
      "content": "detailed expert advice (200-400 words)"
    }
  ]
}`;

      const result = await model.generateContent(gapPrompt);
      const parsed = parseGeminiJsonResponse(result.response.text());

      if (!parsed || !parsed.chunks || parsed.chunks.length === 0) {
        logger.warn('[updateCoachKnowledge] Gemini returned no chunks');
        return;
      }

      // 3. Embed and store each new chunk
      const maxChunks = config.ragAutoUpdate?.maxNewChunksPerWeek || 10;
      const chunks = parsed.chunks.slice(0, maxChunks);
      let added = 0;

      for (const chunk of chunks) {
        try {
          const embeddingModel = genAI.getGenerativeModel({model: 'gemini-embedding-001'});
          const embResult = await embeddingModel.embedContent({
            content: {parts: [{text: chunk.content}]},
            taskType: 'RETRIEVAL_DOCUMENT',
          });
          const embedding = embResult.embedding.values;

          const docId = `auto_${Date.now()}_${added}`;
          await db.collection('coachKnowledge').doc(docId).set({
            category: chunk.category || 'general',
            language: chunk.language || 'en',
            title: chunk.title || '',
            content: chunk.content,
            embedding,
            autoGenerated: true,
            searchGrounded: enableSearch,
            generatedAt: admin.firestore.FieldValue.serverTimestamp(),
            sourceNegativeFeedbackCount: negativeExamples.length,
            sourcePositiveFeedbackCount: positiveExamples.length,
            satisfactionRateAtGeneration: latestInsights.satisfactionRate || null,
          });
          added++;
        } catch (embErr) {
          logger.warn(`[updateCoachKnowledge] Failed to embed chunk: ${embErr.message}`);
        }
      }

      // 5. Log the update with rich metrics
      await db.collection('coachInsights').doc('ragUpdates').set({
        lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
        chunksAdded: added,
        totalNegativeFeedback: negativeExamples.length,
        totalPositiveFeedback: positiveExamples.length,
        searchGroundingUsed: enableSearch,
        crossLearningFromModeration: moderationContext.length > 0,
        satisfactionRateAtUpdate: latestInsights.satisfactionRate || null,
        weakestTopics: latestInsights.lowQualityTopics?.map((t) => t.topic) || [],
      }, {merge: true});

      logger.info(`[updateCoachKnowledge] Added ${added} chunks (search: ${enableSearch}, modContext: ${moderationContext.length}, satisfaction: ${latestInsights.satisfactionRate || '?'}%)`);
    } catch (err) {
      logger.error(`[updateCoachKnowledge] Error: ${err.message}`);
    }
  },
);

/**
 * Scheduled: Daily coach micro-update.
 * Lightweight version of weekly update — reads only yesterday's feedback,
 * generates 1-3 focused chunks with Flash-Lite (no Search Grounding).
 * Also curates exemplars from helpful responses.
 */
exports.dailyCoachMicroUpdate = onSchedule(
  {schedule: 'every day 04:00', region: 'us-central1', memory: '512MiB', timeoutSeconds: 120, secrets: [geminiApiKey]},
  async () => {
    const db = admin.firestore();
    const config = await getCoachConfig();
    const microConfig = config.dailyMicroUpdate || {};
    if (!microConfig.enabled) {
      logger.info('[dailyCoachMicroUpdate] Disabled via config');
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return;

    try {
      // 1. Read yesterday's quality summary
      const yesterday = new Date(Date.now() - 86400000);
      const yesterdayStr = yesterday.toISOString().substring(0, 10);
      const summary = await db.collection('coachInsights').doc('daily').collection(yesterdayStr).doc('summary').get();

      if (!summary.exists) {
        logger.info('[dailyCoachMicroUpdate] No quality summary for yesterday');
        return;
      }

      const data = summary.data();
      const minFeedback = microConfig.minFeedback || 5;
      if ((data.negative || 0) < minFeedback && data.satisfactionRate > 80) {
        logger.info(`[dailyCoachMicroUpdate] Satisfaction ${data.satisfactionRate}% OK, only ${data.negative || 0} negative (need ${minFeedback})`);
        return;
      }

      // 2. Generate focused chunks from yesterday's weak topics
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: AI_MODEL_LITE,
        generationConfig: {maxOutputTokens: 1024, temperature: 0.3},
      });

      const weakTopics = (data.lowQualityTopics || []).map((t) => t.topic).join(', ');
      const sampleQuestions = (data.sampleNegativeQuestions || []).slice(0, 5).join('\n');

      const prompt = `You are a dating coach knowledge curator. Yesterday's coach had ${data.satisfactionRate}% satisfaction.

WEAK TOPICS: ${weakTopics || 'general'}
SAMPLE FAILED QUESTIONS:
${sampleQuestions || 'No samples available'}

Generate 1-3 focused knowledge chunks (200-300 words each) that would directly help answer these types of questions better. Be specific and actionable.

Return as plain text, separating chunks with "---".`;

      const result = await model.generateContent(prompt);
      const chunks = result.response.text().split('---').map((c) => c.trim()).filter((c) => c.length > 50);

      const maxChunks = microConfig.maxChunksPerDay || 3;
      let added = 0;

      for (const chunk of chunks.slice(0, maxChunks)) {
        try {
          const embModel = genAI.getGenerativeModel({model: 'gemini-embedding-001'});
          const embResult = await embModel.embedContent({content: {parts: [{text: chunk}]}, taskType: 'RETRIEVAL_DOCUMENT'});

          await db.collection('coachKnowledge').doc(`daily_micro_${Date.now()}_${added}`).set({
            category: weakTopics.split(',')[0]?.trim() || 'general',
            language: 'en',
            title: `Daily micro: ${yesterdayStr}`,
            content: chunk,
            embedding: embResult.embedding.values,
            autoGenerated: true,
            source: 'daily_micro',
            generatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          added++;
        } catch (embErr) {
          logger.warn(`[dailyCoachMicroUpdate] Embed error: ${embErr.message}`);
        }
      }

      // 3. Curate exemplars from yesterday's helpful responses
      let exemplarsCurated = 0;
      try {
        const allChats = await db.collection('coachChats').limit(100).get();
        const startMs = new Date(yesterday).setHours(0, 0, 0, 0);
        const endMs = new Date(yesterday).setHours(23, 59, 59, 999);

        for (const chatDoc of allChats.docs) {
          const msgs = await chatDoc.ref.collection('messages')
            .orderBy('timestamp', 'desc')
            .limit(20)
            .get();

          for (const msg of msgs.docs) {
            const msgData = msg.data();
            if (!msgData.feedback || msgData.feedback.rating !== 'helpful') continue;
            const fbTime = msgData.feedback.timestamp?.toMillis?.() || 0;
            if (fbTime < startMs || fbTime > endMs) continue;
            if (!msgData.message || msgData.sender !== 'coach') continue;

            // Found a helpful coach response from yesterday — curate as exemplar
            const embModel = genAI.getGenerativeModel({model: 'gemini-embedding-001'});
            const embResult = await embModel.embedContent({
              content: {parts: [{text: msgData.message}]},
              taskType: 'RETRIEVAL_DOCUMENT',
            });

            await db.collection('coachExemplars').add({
              category: msgData.topic || 'general',
              userQuery: msgData.feedback.userQuestion || '',
              coachResponse: msgData.message.substring(0, 500),
              language: 'es',
              score: msgData.selfEvalScore || 7,
              source: 'auto_curated',
              embedding: embResult.embedding.values,
              active: true,
              usageCount: 0,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            exemplarsCurated++;
            if (exemplarsCurated >= 3) break;
          }
          if (exemplarsCurated >= 3) break;
        }
      } catch (exemErr) {
        logger.warn(`[dailyCoachMicroUpdate] Exemplar curation error: ${exemErr.message}`);
      }

      logger.info(`[dailyCoachMicroUpdate] Added ${added} chunks + ${exemplarsCurated} exemplars (satisfaction: ${data.satisfactionRate}%)`);
    } catch (err) {
      logger.error(`[dailyCoachMicroUpdate] Error: ${err.message}`);
    }
  },
);

