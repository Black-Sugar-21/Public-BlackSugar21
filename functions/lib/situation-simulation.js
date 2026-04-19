'use strict';

/**
 * Situation Simulation — "Rehearse the moment before you live it"
 *
 * Given a user-described situation (e.g. "cómo le digo que la amo"),
 * generate 4 distinct approaches (different tones), simulate how the
 * specific match would react to each (using their persona profile),
 * score the reactions, and return a ranked report with coach tip and
 * psychology insights.
 *
 * Reuses from ./simulation:
 *   - buildPersonaProfile
 *   - buildAgentSystemPrompt
 *   - generateAgentTurn
 *   - queryPsychologyRAG
 *   - BEHAVIOR_ARCHETYPES
 *   - getSimulationConfig / isSimulationAllowed (RC gate)
 */

const crypto = require('crypto');
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {logger} = require('firebase-functions/v2');
const admin = require('firebase-admin');

const {
  geminiApiKey,
  AI_MODEL_NAME,
  AI_MODEL_LITE,
  GoogleGenerativeAI,
  getLanguageInstruction,
  parseGeminiJsonResponse,
  trackAICall,
  getLocalizedError,
  checkGeminiSafety,
} = require('./shared');

const {
  buildPersonaProfile,
  buildAgentSystemPrompt,
  generateAgentTurn,
  queryPsychologyRAG,
  getSimulationConfig,
  isSimulationAllowed,
} = require('./simulation');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SITUATION_TYPES = [
  'confession', 'conflict_repair', 'escalation', 'boundary',
  'planning', 'apology', 'checkin', 'other',
];

const FIXED_TONES = ['direct', 'playful', 'romantic_vulnerable', 'grounded_honest'];

/**
 * Extracts the first ~90 chars of a situation text (at a word boundary) for use in fallback phrases.
 * @param {string} situation - User's situation description
 * @returns {string} Shortened snippet, or '' if blank
 */
function extractSituationSnippet(situation) {
  if (!situation || typeof situation !== 'string') return '';
  const cleaned = situation
    .replace(/\s+/g, ' ')
    .replace(/[.!?;]+$/g, '')
    .trim();
  if (cleaned.length <= 90) return cleaned;
  // Try to cut at a word boundary
  const cut = cleaned.slice(0, 90);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 60 ? cut.slice(0, lastSpace) : cut) + '…';
}

/**
 * Generates 4 localized static fallback approach phrases for when the Gemini API fails.
 * Embeds a situation snippet when available so phrases don't feel generic.
 * @param {string} [userLang='en'] - BCP-47 language code
 * @param {string} [situation=''] - User's situation text for snippet extraction
 * @returns {Object[]} Array of 4 approach objects {tone, phrase, citedResearch}
 */
function generateApproachesFallback(userLang = 'en', situation = '') {
  const snippet = extractSituationSnippet(situation);
  const hasSnippet = snippet.length > 0;
  // Template per language with {s} = user situation snippet
  const TEMPLATES = {
    en: [
      hasSnippet ? `Hey — about what I mentioned (${snippet}), I'd love to talk it through with you. What do you think?` : 'I wanted to talk with you about this. Can we chat?',
      hasSnippet ? `So… ${snippet} 😅 Didn't want to leave you in the dark. Got a sec?` : 'Hey, got a few minutes? There\'s something on my mind.',
      hasSnippet ? `I've been thinking about you, and I want to be open about this: ${snippet}. I hope that's okay to share.` : 'I\'ve been thinking about you, and I want to be honest about how I feel.',
      hasSnippet ? `Just being real with you: ${snippet}. No pressure — I just wanted you to know where I'm at.` : 'I think we should talk about this. I care about us and want to understand each other better.',
    ],
    es: [
      hasSnippet ? `Oye, sobre lo que te comentaba (${snippet}), me gustaría conversarlo contigo. ¿Qué opinas?` : 'Quería hablar contigo sobre esto. ¿Podemos conversar?',
      hasSnippet ? `Te cuento: ${snippet} 😅 No quería dejarte sin saber. ¿Un momento?` : 'Oye, ¿tienes un momento? Hay algo que me ronda la cabeza.',
      hasSnippet ? `He estado pensando en ti y quiero ser sincero/a contigo sobre esto: ${snippet}. Espero esté bien compartirlo.` : 'He estado pensando en ti y quiero ser honesto/a sobre cómo me siento.',
      hasSnippet ? `Siendo honesto/a contigo: ${snippet}. Sin presión — solo quería que lo supieras.` : 'Creo que deberíamos hablar de esto. Me importa lo nuestro y quiero entendernos mejor.',
    ],
    pt: [
      hasSnippet ? `Oi, sobre o que te contei (${snippet}), queria conversar contigo. O que achas?` : 'Queria falar contigo sobre isso. Podemos conversar?',
      hasSnippet ? `Te conto: ${snippet} 😅 Não queria te deixar sem saber. Tens um minuto?` : 'Ei, tens um minuto? Há algo que quero dizer.',
      hasSnippet ? `Tenho pensado em ti e quero ser sincero/a sobre isto: ${snippet}. Espero que esteja tudo bem partilhar.` : 'Tenho pensado em ti e quero ser honesto/a sobre o que sinto.',
      hasSnippet ? `Sendo honesto/a contigo: ${snippet}. Sem pressão — só queria que soubesses.` : 'Acho que deveríamos falar sobre isso. Importo-me connosco e quero compreender-nos melhor.',
    ],
    fr: [
      hasSnippet ? `Salut, à propos de ce que je te disais (${snippet}), j'aimerais qu'on en parle. Qu'en penses-tu ?` : 'Je voulais te parler de quelque chose. On peut discuter ?',
      hasSnippet ? `Je t'explique : ${snippet} 😅 Je ne voulais pas te laisser dans le flou. Tu as un moment ?` : 'Hé, tu as un moment ? Il y a quelque chose qui me préoccupe.',
      hasSnippet ? `Je pense à toi et je veux être sincère avec toi sur ceci : ${snippet}. J'espère que ça va de partager.` : 'Je pense à toi et je veux être honnête sur ce que je ressens.',
      hasSnippet ? `Pour être honnête avec toi : ${snippet}. Pas de pression — je voulais juste que tu saches.` : 'Je pense qu\'on devrait parler de ça. Je tiens à nous et je veux qu\'on se comprenne mieux.',
    ],
    de: [
      hasSnippet ? `Hey, wegen dem, was ich erwähnt habe (${snippet}) — ich würde gern mit dir darüber reden. Was meinst du?` : 'Ich wollte mit dir darüber reden. Können wir kurz reden?',
      hasSnippet ? `Also… ${snippet} 😅 Wollte dich nicht im Dunkeln lassen. Hast du kurz Zeit?` : 'Hey, hast du kurz Zeit? Da ist etwas, was mir durch den Kopf geht.',
      hasSnippet ? `Ich habe an dich gedacht und möchte dir gegenüber ehrlich sein: ${snippet}. Ich hoffe, das ist okay.` : 'Ich habe an dich gedacht, und ich möchte ehrlich sagen, wie ich fühle.',
      hasSnippet ? `Ganz ehrlich: ${snippet}. Kein Druck — ich wollte nur, dass du Bescheid weißt.` : 'Ich denke, wir sollten darüber reden. Mir liegt an uns, und ich möchte uns besser verstehen.',
    ],
    it: [
      hasSnippet ? `Ehi, riguardo a ciò che ti dicevo (${snippet}), mi piacerebbe parlarne con te. Che ne pensi?` : 'Volevo parlarti di una cosa. Possiamo chiacchierare?',
      hasSnippet ? `Ti dico: ${snippet} 😅 Non volevo lasciarti nel buio. Hai un minuto?` : 'Ehi, hai un minuto? C\'è qualcosa che ho in mente.',
      hasSnippet ? `Ho pensato a te e voglio essere sincero/a con te su questo: ${snippet}. Spero vada bene condividerlo.` : 'Ho pensato a te e voglio essere onesto/a su ciò che provo.',
      hasSnippet ? `Per essere onesto/a con te: ${snippet}. Nessuna pressione — volevo solo che lo sapessi.` : 'Penso che dovremmo parlarne. Tengo a noi e voglio capirci meglio.',
    ],
    ja: [
      hasSnippet ? `ねえ、さっき話したこと（${snippet}）について、君と話したいな。どう思う？` : '少し話したいことがあるんだ。時間ある？',
      hasSnippet ? `実はね… ${snippet} 😅 伝えておきたくて。少しいい？` : 'ねえ、ちょっといい？話したいことがあって。',
      hasSnippet ? `君のことを考えていて、正直に伝えたいんだ：${snippet}。話してもいいかな？` : '君のことを考えていて、自分の気持ちを正直に伝えたいんだ。',
      hasSnippet ? `正直に言うと：${snippet}。プレッシャーはかけたくないけど、知っておいてほしくて。` : 'これについて話すべきだと思う。私たちのことが大切で、もっと分かり合いたいから。',
    ],
    zh: [
      hasSnippet ? `嘿，关于我之前说的（${snippet}），想跟你好好聊聊，你觉得呢？` : '我想和你聊聊这件事，可以吗？',
      hasSnippet ? `跟你说：${snippet} 😅 不想让你不知道。有空吗？` : '嘿，有空吗？我有话想说。',
      hasSnippet ? `我一直在想你，想坦诚地告诉你：${snippet}。希望我可以跟你分享。` : '我一直在想你，我想诚实地表达我的感受。',
      hasSnippet ? `跟你说实话：${snippet}。没有压力——只是想让你知道。` : '我觉得我们应该谈谈这件事。我在乎我们，想更好地理解彼此。',
    ],
    ru: [
      hasSnippet ? `Привет, по поводу того, что я говорил/а (${snippet}), хотел/а бы обсудить с тобой. Что думаешь?` : 'Я хотел/а поговорить с тобой об этом. Можем пообщаться?',
      hasSnippet ? `Расскажу: ${snippet} 😅 Не хотел/а оставлять тебя в неведении. Есть минутка?` : 'Эй, есть минутка? У меня кое-что на уме.',
      hasSnippet ? `Я думал/а о тебе и хочу быть откровенным/ой: ${snippet}. Надеюсь, это нормально поделиться.` : 'Я думал/а о тебе и хочу честно сказать, что я чувствую.',
      hasSnippet ? `Если честно: ${snippet}. Без давления — просто хотел/а, чтобы ты знал/а.` : 'Думаю, нам стоит об этом поговорить. Мне важны наши отношения, хочу лучше понимать друг друга.',
    ],
    ar: [
      hasSnippet ? `مرحباً، بخصوص ما ذكرته (${snippet})، أود أن نتحدث عن ذلك. ما رأيك؟` : 'أردت أن أتحدث معك عن هذا. هل يمكننا التحدث؟',
      hasSnippet ? `لأقول لك: ${snippet} 😅 لم أرد أن أتركك دون علم. هل لديك لحظة؟` : 'مرحباً، هل لديك لحظة؟ هناك شيء يشغل بالي.',
      hasSnippet ? `كنت أفكر فيك وأريد أن أكون صريحاً/صريحة معك بشأن هذا: ${snippet}. آمل أن يكون من المقبول مشاركته.` : 'كنت أفكر فيك، وأريد أن أكون صريحاً بشأن مشاعري.',
      hasSnippet ? `بصراحة معك: ${snippet}. بدون ضغط — فقط أردتك أن تعرف.` : 'أعتقد أنه يجب أن نتحدث عن هذا. أنا أهتم بنا وأريد أن نفهم بعضنا أفضل.',
    ],
    id: [
      hasSnippet ? `Hei, soal yang tadi kubilang (${snippet}), aku ingin mengobrolkannya denganmu. Bagaimana menurutmu?` : 'Aku ingin bicara denganmu tentang ini. Bisa kita ngobrol?',
      hasSnippet ? `Aku cerita ya: ${snippet} 😅 Tidak mau meninggalkanmu tanpa tahu. Ada waktu sebentar?` : 'Hei, ada waktu sebentar? Ada yang mau aku sampaikan.',
      hasSnippet ? `Aku memikirkanmu dan ingin jujur padamu soal ini: ${snippet}. Semoga tidak masalah membaginya.` : 'Aku memikirkanmu, dan aku ingin jujur tentang perasaanku.',
      hasSnippet ? `Jujur denganmu: ${snippet}. Tanpa tekanan — hanya ingin kamu tahu.` : 'Menurutku kita harus bicara soal ini. Aku peduli pada kita dan ingin saling memahami lebih baik.',
    ],
  };
  const phrases = TEMPLATES[userLang] || TEMPLATES.en;
  const tones = ['direct', 'playful', 'romantic_vulnerable', 'grounded_honest'];
  // Per-tone follow-up tip, localized — last-resort guidance so detail sheet isn't empty
  const FOLLOWUP_TIPS = {
    en: {
      direct: 'If they answer yes, get to the point. If they seem hesitant, give them space and ask what feels right for them.',
      playful: 'Match their energy — if they tease back, keep it light; if they get serious, switch gears and be sincere.',
      romantic_vulnerable: 'If they respond warmly, stay present and let them share too. If they deflect, respect it and don\'t push.',
      grounded_honest: 'Let them process. A short silence is okay. Ask what they think — then actually listen.',
    },
    es: {
      direct: 'Si responden que sí, ve al grano. Si dudan, dales espacio y pregúntales qué les haría sentirse cómodos.',
      playful: 'Sigue su energía — si bromean, mantenlo liviano; si se ponen serios, cambia el tono y sé sincero/a.',
      romantic_vulnerable: 'Si responden con calidez, quédate presente y deja que ellos también compartan. Si evaden, respétalo y no presiones.',
      grounded_honest: 'Deja que lo procesen. Un silencio corto está bien. Pregunta qué piensan — y escucha de verdad.',
    },
    pt: {
      direct: 'Se responderem que sim, vai direto ao ponto. Se hesitarem, dê espaço e pergunte o que os deixaria confortáveis.',
      playful: 'Siga a energia — se brincarem, mantenha leve; se ficarem sérios, mude o tom e seja sincero/a.',
      romantic_vulnerable: 'Se responderem com carinho, esteja presente e deixe-os partilhar também. Se evitarem, respeite e não pressione.',
      grounded_honest: 'Deixe-os processar. Um silêncio curto está bem. Pergunte o que pensam — e escute de verdade.',
    },
    fr: {
      direct: 'S\'ils disent oui, va droit au but. S\'ils hésitent, laisse-leur de l\'espace et demande ce qui leur semble juste.',
      playful: 'Suis leur énergie — s\'ils te taquinent, reste léger ; s\'ils deviennent sérieux, change de ton et sois sincère.',
      romantic_vulnerable: 'S\'ils répondent chaleureusement, reste présent et laisse-les partager. S\'ils esquivent, respecte-le sans insister.',
      grounded_honest: 'Laisse-les prendre leur temps. Un court silence est normal. Demande ce qu\'ils en pensent — et écoute vraiment.',
    },
    de: {
      direct: 'Wenn sie zustimmen, komm zur Sache. Wenn sie zögern, gib ihnen Raum und frag, was sich für sie richtig anfühlt.',
      playful: 'Nimm ihre Energie auf — wenn sie zurückfrotzeln, bleib locker; werden sie ernst, wechsle den Ton und sei aufrichtig.',
      romantic_vulnerable: 'Wenn sie herzlich reagieren, bleib präsent und lass sie auch teilen. Weichen sie aus, respektiere das und dräng nicht.',
      grounded_honest: 'Lass ihnen Zeit. Eine kurze Stille ist okay. Frag, was sie denken — und höre wirklich zu.',
    },
    ja: {
      direct: '相手がイエスなら要点を伝えて。ためらっているなら余白を残して、何が心地よいか聞いてあげて。',
      playful: '相手のノリに合わせて。冗談で返ってきたら軽く、真剣になったらこちらも真剣に。',
      romantic_vulnerable: '温かく返ってきたら、ちゃんと向き合ってあげて。かわされたら、押さずに尊重しよう。',
      grounded_honest: '少し考える時間を与えよう。短い沈黙は大丈夫。相手の考えを聞いて、ちゃんと聴こう。',
    },
    zh: {
      direct: '如果对方同意，直接进入正题。如果对方犹豫，给他们空间，问他们怎样会觉得舒服。',
      playful: '跟上对方的节奏——如果对方开玩笑，保持轻松；如果变严肃，就换个语气认真回应。',
      romantic_vulnerable: '如果对方热情回应，保持在场，让他们也分享。如果对方回避，尊重他们，不要推进。',
      grounded_honest: '让他们消化一下。短暂的沉默没关系。问问他们怎么想——然后真正去听。',
    },
    ru: {
      direct: 'Если они согласны — переходи к делу. Если колеблются — дай пространство и спроси, что им удобно.',
      playful: 'Подстройся под их энергию — если шутят в ответ, держи легкий тон; если серьёзно — отвечай искренне.',
      romantic_vulnerable: 'Если откликаются тепло — будь рядом и дай им поделиться. Если уходят в сторону — уважай это, не дави.',
      grounded_honest: 'Дай им осмыслить. Короткое молчание — это нормально. Спроси, что они думают — и действительно слушай.',
    },
    ar: {
      direct: 'إذا وافقوا، ادخل في صلب الموضوع. إذا ترددوا، امنحهم مساحة واسألهم عمّا يشعرهم بالراحة.',
      playful: 'سايِر طاقتهم — إن ردّوا بمزاح، ابقَ خفيفاً؛ وإن جدّوا، غيّر نبرتك وكن صادقاً.',
      romantic_vulnerable: 'إذا ردّوا بدفء، ابقَ حاضراً ودعهم يشاركوا أيضاً. إذا تهرّبوا، احترم ذلك ولا تضغط.',
      grounded_honest: 'دعهم يستوعبون. الصمت القصير لا بأس به. اسألهم عن رأيهم — ثم استمع حقاً.',
    },
    id: {
      direct: 'Jika mereka setuju, langsung ke intinya. Jika ragu, beri ruang dan tanya apa yang membuat mereka nyaman.',
      playful: 'Ikuti energi mereka — kalau mereka bercanda, tetap ringan; kalau mereka serius, ubah nada dan tulus.',
      romantic_vulnerable: 'Jika mereka merespons hangat, tetap hadir dan biarkan mereka juga berbagi. Jika menghindar, hormati dan jangan mendesak.',
      grounded_honest: 'Biarkan mereka memproses. Diam sejenak tidak apa-apa. Tanya pendapat mereka — dan benar-benar dengarkan.',
    },
  };
  const tips = FOLLOWUP_TIPS[userLang] || FOLLOWUP_TIPS.en;
  return phrases.map((phrase, i) => ({
    id: String(i + 1),
    tone: tones[i],
    phrase,
    alternativePhrases: [],
    followUpTips: tips[tones[i]] || '',
  }));
}

// Safety guardrail patterns — when any of these match the user's situation,
// we return an ethical block WITHOUT consuming rate limit or calling Gemini.
const COERCIVE_PATTERNS = [
  /manipul/i,
  /force|forz/i,
  /trick|engañ/i,
  /mentir|lie to/i,
  /make (her|him|them) say yes/i,
  /convencerl/i,
  /sin consentim/i,
  /seducir sin/i,
];

// Localized ethical block message (10 languages)
const ETHICAL_BLOCK_MSG = {
  en: "Real connection can't be built on manipulation. Want me to help you reframe this from a more genuine place?",
  es: 'Las relaciones auténticas no se construyen con manipulación. ¿Quieres que reformulemos tu intención desde un lugar más genuino?',
  pt: 'Conexões reais não se constroem com manipulação. Quer que eu te ajude a reformular isso de um lugar mais genuíno?',
  fr: "Une vraie connexion ne se construit pas sur la manipulation. Veux-tu qu'on reformule ton intention de manière plus authentique ?",
  de: 'Echte Verbindung entsteht nicht durch Manipulation. Sollen wir deine Absicht aus einer authentischeren Haltung neu formulieren?',
  ja: '本当のつながりは操作では築けません。もっと誠実な視点から言い直すお手伝いをしましょうか？',
  zh: '真正的连结无法靠操控建立。要不要一起从更真诚的角度重新表达？',
  ru: 'Настоящая связь не строится на манипуляции. Хочешь, переформулируем твоё намерение более искренне?',
  ar: 'العلاقات الحقيقية لا تُبنى على التلاعب. هل تريد أن نعيد صياغة نيتك من مكان أكثر صدقاً؟',
  id: 'Koneksi sejati tidak bisa dibangun dengan manipulasi. Mau aku bantu merumuskan ulang dari niat yang lebih tulus?',
};

// Rate limit default for situation simulation (more generous than relationship sim)
const SITUATION_MAX_PER_DAY = 10;

// Cache TTL for situation simulations (6 hours)
const SITUATION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// Remote Config defaults for Situation Simulation
const SITUATION_SIM_CONFIG_DEFAULTS = {
  enabled: true,
  maxPerDay: 10,
  maxCharsMinimum: 5,
  maxCharsMaximum: 500,
  temperature: 0.85,
  maxOutputTokens: 1200,
  cacheMinutes: 360,
  fallbackApproachesEnabled: true,
};

// Remote Config cache for situation_simulation_config
let _situationSimConfigCache = null;
let _situationSimConfigCacheTime = 0;
const SITUATION_SIM_CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 min

/**
 * Fetches situation simulation config from Remote Config with 5-min in-memory cache.
 * @returns {Promise<Object>} Config merged with SITUATION_SIM_CONFIG_DEFAULTS
 */
async function getSituationSimulationConfig() {
  // Return cached config if fresh
  if (_situationSimConfigCache && (Date.now() - _situationSimConfigCacheTime) < SITUATION_SIM_CONFIG_CACHE_TTL) {
    return _situationSimConfigCache;
  }

  try {
    const rc = admin.remoteConfig();
    const template = await rc.getTemplate();
    const param = template.parameters['situation_simulation_config'];
    if (param?.defaultValue?.value) {
      const rcConfig = JSON.parse(param.defaultValue.value);
      _situationSimConfigCache = {...SITUATION_SIM_CONFIG_DEFAULTS, ...rcConfig};
      _situationSimConfigCacheTime = Date.now();
      return _situationSimConfigCache;
    }
  } catch (err) {
    logger.warn(`[getSituationSimulationConfig] RC read failed, using defaults: ${err.message}`);
  }

  // Fallback to defaults if RC read fails
  _situationSimConfigCache = SITUATION_SIM_CONFIG_DEFAULTS;
  _situationSimConfigCacheTime = Date.now();
  return _situationSimConfigCache;
}

// ---------------------------------------------------------------------------
// Reaction scoring — multilingual positive/negative signals
// Adapted from detectRebellion() signals but focused on 1-on-1 reactions.
// ---------------------------------------------------------------------------
const POSITIVE_SIGNALS = [
  // EN
  'yes', 'love', 'want', 'me too', 'same', 'agree', 'amazing', 'beautiful',
  'thank you', 'happy', 'excited', 'of course', 'always', 'forever',
  "i'd love", 'perfect', 'wonderful', 'i like', 'i feel', "i'm in",
  // ES
  'sí', 'también', 'claro', 'amo', 'quiero', 'gracias', 'me encanta',
  'perfecto', 'feliz', 'por supuesto', 'yo también', 'siempre',
  // PT
  'sim', 'também', 'adoro', 'quero', 'obrigad', 'claro', 'perfeito',
  'amo', 'feliz', 'eu também', 'sempre',
  // FR
  'oui', 'moi aussi', "j'aime", 'bien sûr', 'merci', 'parfait', 'toujours',
  // DE
  'ja', 'ich auch', 'liebe', 'natürlich', 'danke', 'perfekt', 'immer',
  // JA
  'はい', '私も', '好き', 'ありがとう', 'うれしい', 'もちろん', '素敵',
  // ZH
  '是', '我也', '喜欢', '爱', '谢谢', '当然', '好的', '开心',
  // RU
  'да', 'я тоже', 'люблю', 'конечно', 'спасибо', 'всегда',
  // AR
  'نعم', 'أنا أيضاً', 'أحبك', 'شكراً', 'بالطبع', 'دائماً',
  // ID
  'iya', 'aku juga', 'cinta', 'suka', 'terima kasih', 'tentu', 'selalu',
  // Emoji
  '❤️', '😍', '🥰', '😊', '💕', '💖',
];

const NEGATIVE_SIGNALS = [
  // EN
  'no', 'not ready', "i don't", 'sorry', 'maybe later', 'bye', 'leave',
  "can't", 'too much', 'slow down', 'awkward', 'uncomfortable', 'weird',
  // ES
  'no ', 'no estoy', 'lo siento', 'despacio', 'raro', 'incómod',
  'tal vez después', 'adiós', 'me voy',
  // PT
  'não', 'desculpa', 'devagar', 'estranho', 'mais tarde', 'tchau',
  // FR
  'non', 'désolé', "je ne", 'pas prêt', 'bizarre', 'au revoir',
  // DE
  'nein', 'tut mir leid', 'nicht bereit', 'komisch', 'auf wiedersehen',
  // JA
  'いいえ', 'ごめん', 'まだ', '無理', 'さようなら',
  // ZH
  '不', '对不起', '不行', '再见', '还没',
  // RU
  'нет', 'прости', 'не готов', 'до свидания',
  // AR
  'لا', 'آسف', 'لست مستعد', 'مع السلامة',
  // ID
  'tidak', 'maaf', 'belum siap', 'sampai jumpa',
];

/**
 * Score a match reaction 0-10 based on positive/negative signals.
 * Returns both the score and the detected signal list.
 */
function scoreReaction(text) {
  const t = (text || '').toLowerCase();
  if (!t) return {score: 3, signals: []};

  const posHits = POSITIVE_SIGNALS.filter(s => t.includes(s));
  const negHits = NEGATIVE_SIGNALS.filter(s => t.includes(s));

  // Base 5, +1 per positive (max +5), -1 per negative (max -5)
  let score = 5 + Math.min(posHits.length, 5) - Math.min(negHits.length, 5);
  score = Math.max(0, Math.min(10, score));

  const signals = [];
  if (posHits.length >= 2) signals.push('reciprocation');
  if (posHits.some(s => /love|amor|ama|aime|liebe|好き|爱|люблю|أحب|cinta|❤️|🥰/.test(s))) signals.push('warmth');
  if (posHits.some(s => /yes|sí|sim|oui|ja|はい|是|да|نعم|iya/.test(s))) signals.push('agreement');
  if (negHits.length >= 2) signals.push('deflection');
  if (negHits.some(s => /not ready|no estoy|pas prêt|nicht bereit|まだ|还没|не готов|لست مستعد|belum siap/.test(s))) signals.push('coldness');
  if (!posHits.length && !negHits.length) signals.push('neutral');

  return {score, signals};
}

// ---------------------------------------------------------------------------
// Classification + approach generation
// ---------------------------------------------------------------------------
/**
 * Classifies a dating situation into one of the predefined SITUATION_TYPES using Gemini Lite.
 * @param {import('@google/generative-ai').GoogleGenerativeAI} genAI - Gemini client
 * @param {string} situation - User's situation description
 * @param {string} lang - BCP-47 language code
 * @returns {Promise<string>} Situation type from SITUATION_TYPES, or 'other' on failure
 */
async function classifySituation(genAI, situation, lang) {
  try {
    const model = genAI.getGenerativeModel({
      model: AI_MODEL_LITE,
      generationConfig: {maxOutputTokens: 60, temperature: 0.2, responseMimeType: 'application/json'},
    });
    const prompt = `Classify this dating situation into exactly ONE of these categories:
${SITUATION_TYPES.join(', ')}

Situation: "${situation}"

Respond with JSON: {"type": "<category>"}`;
    const result = await model.generateContent(prompt);
    const text = result?.response?.text() || '';
    const parsed = parseGeminiJsonResponse(text);
    const type = parsed?.type;
    if (type && SITUATION_TYPES.includes(type)) return type;
    return 'other';
  } catch (e) {
    logger.warn('[situationSim] classify failed:', e.message);
    return 'other';
  }
}

/**
 * Generates 4 tonal communication approaches for a dating situation using Gemini.
 * @param {import('@google/generative-ai').GoogleGenerativeAI} genAI - Gemini client
 * @param {string} situation - User's situation description
 * @param {Object|null} matchPersona - Optional match persona context
 * @param {string} userLang - BCP-47 language code
 * @returns {Promise<Object[]>} Array of approach objects {tone, phrase, matchReaction, score, signals}
 * @throws {Error} Rethrows on failure for parent catch to handle
 */
async function generateApproaches(genAI, situation, matchPersona, userLang) {
  try {
    const langInstr = getLanguageInstruction(userLang);
    const languageName = {
      'es': 'Spanish (español)', 'pt': 'Portuguese (português)', 'fr': 'French (français)',
      'de': 'German (Deutsch)', 'it': 'Italian (italiano)', 'ja': 'Japanese (日本語)',
      'zh': 'Chinese (中文)', 'ru': 'Russian (Русский)', 'ar': 'Arabic (العربية)',
      'id': 'Indonesian (Bahasa Indonesia)', 'en': 'English',
    }[userLang] || 'English';
    const model = genAI.getGenerativeModel({
      model: AI_MODEL_NAME,
      generationConfig: {maxOutputTokens: 2800, temperature: 0.85, responseMimeType: 'application/json'},
    });

    const prompt = `${langInstr}

🌍 OUTPUT LANGUAGE: ${languageName} — code "${userLang}".
EVERY "phrase" value in the JSON MUST be written in ${languageName}. Do NOT output English phrases when the user's language is not English.

You are a dating coach helping a user rehearse how to say something SPECIFIC to their match.

The user's situation (verbatim — treat every noun, verb and detail as load-bearing):
"""
${situation}
"""

Match profile (so you tailor tone hints):
- Name: ${matchPersona.name}
- Bio: ${matchPersona.bio || 'n/a'}
- Interests: ${(matchPersona.interests || []).slice(0, 6).join(', ')}
- Attachment style: ${matchPersona.attachmentStyle}
- Communication style: ${matchPersona.commStyle}

🎯 CORE RULE — each approach MUST directly address the concrete content of the situation above.
If the user talks about going out with a friend, mention the friend and the plan.
If the user wants to confess feelings, state the feeling.
If the user wants to apologize for cancelling a date, name the cancellation.
Generic openers like "quería hablar contigo", "tenemos que hablar", "hay algo que quiero decirte", "we need to talk",
"I've been thinking", "hay algo que me ronda la cabeza" — on their own — are FORBIDDEN. A message that could be
sent for literally any situation has failed. Read the user's situation again and make each phrase unmistakably
about THAT topic.

Generate EXACTLY 4 distinct approaches. Each approach uses one of these FIXED tones, in this exact order:
  1. direct — clear, confident, unambiguous; names the situation in the first sentence
  2. playful — warm, light, a little humor; still references the specific topic (e.g. the friend, the plan, the feeling)
  3. romantic_vulnerable — soft, honest about feelings tied to THIS situation
  4. grounded_honest — calm, real, low-pressure; states what's happening and what they want

For EACH approach produce this richer structure (not just one phrase):
- "phrase": the main message (2-3 sentences, first-person, IN ${languageName}) — this is the copy-paste-and-send version
- "alternativePhrases": an array of exactly 3 more variations in the SAME tone, same situation, different wording. Each 1-3 sentences. They should be genuinely different (different hook, different framing) — not paraphrases of each other. The user will pick the one that feels most natural.
- "followUpTips": 1-2 sentences telling the user what to do AFTER the match replies. Should help them handle both positive and hesitant reactions. Actionable, specific to the tone (e.g. for "playful" suggest keeping it light; for "direct" suggest pausing before pressing).

Every "phrase" and every entry in "alternativePhrases" MUST reference at least one concrete detail from the user's situation (a name, place, plan, feeling, or event they mentioned). No generic openers.

Quick self-check before returning: "Could any of these messages have been written by someone with a totally
different problem?" If yes, rewrite until the answer is no.

${langInstr}

⚠️ FINAL CHECKS:
1. Every "phrase" / "alternativePhrases[i]" / "followUpTips" is in ${languageName}, not English (unless target is English).
2. "alternativePhrases" has EXACTLY 3 entries.
3. Every phrase references specific content from the user's situation.
4. No two phrases (main or alternative, within an approach or across approaches) sound interchangeable.

Respond ONLY with JSON in this shape (all text in ${languageName}):
{"approaches":[
  {"id":"1","tone":"direct","phrase":"...","alternativePhrases":["...","...","..."],"followUpTips":"..."},
  {"id":"2","tone":"playful","phrase":"...","alternativePhrases":["...","...","..."],"followUpTips":"..."},
  {"id":"3","tone":"romantic_vulnerable","phrase":"...","alternativePhrases":["...","...","..."],"followUpTips":"..."},
  {"id":"4","tone":"grounded_honest","phrase":"...","alternativePhrases":["...","...","..."],"followUpTips":"..."}
]}`;

    // Try up to 2 times — a single Gemini hiccup shouldn't collapse to generic fallbacks
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await model.generateContent(prompt);

        // Guard: if Gemini blocked for safety or truncated, don't parse garbage.
        const safety = checkGeminiSafety(result, 'generateApproaches');
        if (!safety.ok) {
          logger.warn(`[generateApproaches] attempt ${attempt}: Gemini safety/finish check failed — ${safety.reason}: ${safety.detail}`);
          lastError = new Error(`gemini_${safety.reason}`);
          continue;
        }

        const text = result?.response?.text();

        if (!text || typeof text !== 'string' || text.trim().length === 0) {
          logger.warn(`[generateApproaches] attempt ${attempt}: Gemini returned empty response`);
          lastError = new Error('empty_response');
          continue;
        }

        const parsed = parseGeminiJsonResponse(text);
        if (!parsed || !Array.isArray(parsed?.approaches) || parsed.approaches.length === 0) {
          logger.warn(`[generateApproaches] attempt ${attempt}: failed to parse valid approaches`);
          lastError = new Error('parse_failed');
          continue;
        }

        const approaches = parsed.approaches;
        // Normalize — guarantee 4 approaches in fixed order, preserve rich fields
        const byTone = new Map();
        for (const a of approaches) {
          if (a && typeof a.phrase === 'string' && a.tone) {
            byTone.set(a.tone, {
              phrase: (a.phrase || '').trim(),
              alternativePhrases: Array.isArray(a.alternativePhrases)
                ? a.alternativePhrases
                    .filter(p => typeof p === 'string' && p.trim().length > 0)
                    .map(p => p.trim())
                    .slice(0, 3)
                : [],
              followUpTips: typeof a.followUpTips === 'string' ? a.followUpTips.trim() : '',
            });
          }
        }
        const normalized = FIXED_TONES.map((tone, i) => {
          const entry = byTone.get(tone) || {};
          const rawApproach = approaches[i] || {};
          return {
            id: String(i + 1),
            tone,
            phrase: entry.phrase || (rawApproach.phrase || '').trim() || '',
            alternativePhrases: entry.alternativePhrases && entry.alternativePhrases.length
              ? entry.alternativePhrases
              : (Array.isArray(rawApproach.alternativePhrases)
                  ? rawApproach.alternativePhrases.filter(p => typeof p === 'string').slice(0, 3)
                  : []),
            followUpTips: entry.followUpTips || (typeof rawApproach.followUpTips === 'string' ? rawApproach.followUpTips.trim() : ''),
          };
        });
        // Reject this attempt if any phrase is empty — try again rather than ship blanks
        if (normalized.some(a => !a.phrase)) {
          logger.warn(`[generateApproaches] attempt ${attempt}: one or more phrases empty after normalize`);
          lastError = new Error('empty_phrase');
          continue;
        }
        return normalized;
      } catch (innerErr) {
        logger.warn(`[generateApproaches] attempt ${attempt} threw: ${innerErr.message}`);
        lastError = innerErr;
      }
    }

    logger.error(`[generateApproaches] all attempts failed (${lastError?.message}), using situation-aware fallback`);
    return generateApproachesFallback(userLang, situation);
  } catch (e) {
    logger.error('[situationSim] generateApproaches failed:', e.message);
    throw e; // Re-throw so parent catches and returns proper error message
  }
}

/**
 * Generates a final personalized coach tip based on the winning approach and RAG knowledge.
 * @param {import('@google/generative-ai').GoogleGenerativeAI} genAI - Gemini client
 * @param {string} situation - User's situation description
 * @param {Object} winningApproach - The highest-scored approach object
 * @param {Object|null} matchPersona - Optional match persona context
 * @param {string[]} ragChunks - RAG knowledge snippets (up to 3 used)
 * @param {string} userLang - BCP-47 language code
 * @returns {Promise<string>} Localized coach tip string
 */
async function buildFinalCoachTip(genAI, situation, winningApproach, matchPersona, ragChunks, userLang) {
  try {
    const langInstr = getLanguageInstruction(userLang);
    const model = genAI.getGenerativeModel({
      model: AI_MODEL_LITE,
      generationConfig: {maxOutputTokens: 220, temperature: 0.6, responseMimeType: 'application/json'},
    });
    const rag = (ragChunks || []).slice(0, 3).map((c, i) => `[${i + 1}] ${c}`).join('\n');
    const prompt = `You are an empathetic dating coach. Given:

SITUATION: "${situation}"
MATCH: ${matchPersona.name} (${matchPersona.attachmentStyle}, ${matchPersona.commStyle})
WINNING APPROACH (${winningApproach.tone}): "${winningApproach.phrase}"
MATCH REACTION: "${winningApproach.matchReaction || ''}"

PSYCHOLOGY CHUNKS:
${rag || '(none)'}

Write:
1. "coachTip": 1-2 sentences explaining why this approach works with this match
2. "psychInsights": 1 sentence grounding the advice in a psychology reference (author optional, brief)

${langInstr}

Respond ONLY with JSON: {"coachTip":"...","psychInsights":"..."}`;

    const result = await model.generateContent(prompt);
    const text = result?.response?.text() || '';
    const parsed = parseGeminiJsonResponse(text) || {};
    return {
      coachTip: typeof parsed.coachTip === 'string' ? parsed.coachTip : '',
      psychInsights: typeof parsed.psychInsights === 'string' ? parsed.psychInsights : '',
    };
  } catch (e) {
    logger.warn('[situationSim] coachTip failed:', e.message);
    return {coachTip: '', psychInsights: ''};
  }
}

// ---------------------------------------------------------------------------
// Cloud Function
// ---------------------------------------------------------------------------
/**
 * CF: Simulates 4 communication approaches for a dating situation and returns the best one with coach tip.
 * @param {Object} request.data - {situation: string, matchId?: string, userLanguage?: string, neutralFrame?: boolean, stageId?: string}
 * @returns {Promise<{approaches: Object[], winner: Object, coachTip: string, situationType: string}>}
 * @throws {HttpsError} unauthenticated | resource-exhausted | internal
 */
exports.simulateSituation = onCall(
  {
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 60,
    secrets: [geminiApiKey],
  },
  async (request) => {
    let userId = null;
    let matchId = null;
    // Extract lang before auth check so the localized auth_required message
    // matches the caller's language even on unauthenticated failures.
    // Inside the try block, a validated `lang` (clamped to SUPPORTED_LANGS)
    // shadows this one — this outer copy is only used for the pre-auth error.
    const authLang = ((request.data?.userLanguage) || 'en').split('-')[0].toLowerCase();
    try {
      if (!request.auth) throw new HttpsError('unauthenticated', getLocalizedError('auth_required', authLang));

    userId = request.auth.uid;
    const {situation, userLanguage} = request.data || {};
    matchId = (request.data?.matchId) || null;

    // ── Language validation ──────────────────────────────────────────────
    const SUPPORTED_LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it', 'ja', 'zh', 'ru', 'ar', 'id'];
    const requestedLang = (userLanguage || 'en').toLowerCase();
    const lang = SUPPORTED_LANGS.includes(requestedLang) ? requestedLang : 'en';
    if (requestedLang !== 'en' && !SUPPORTED_LANGS.includes(requestedLang)) {
      logger.warn(`[simulateSituation] Unsupported language "${requestedLang}" for user ${userId.substring(0, 8)}, defaulting to English`);
    }

    // ── Input validation ────────────────────────────────────────────────
    if (!situation || typeof situation !== 'string') {
      throw new HttpsError('invalid-argument', getLocalizedError('invalid_argument', lang));
    }
    const trimmed = situation.trim();
    if (trimmed.length < 5 || trimmed.length > 500) {
      throw new HttpsError('invalid-argument', getLocalizedError('invalid_argument', lang));
    }
    // matchId is optional — allows simulation without a specific match (generic persona)
    const hasMatch = !!(matchId && typeof matchId === 'string' && matchId.trim().length > 0);
    if (hasMatch && (matchId.includes('/') || matchId.length > 200)) {
      throw new HttpsError('invalid-argument', getLocalizedError('invalid_argument', lang));
    }

    const db = admin.firestore();
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new HttpsError('internal', getLocalizedError('internal', lang));

    // ── Load Remote Config for Situation Simulation ──────────────────────
    const config = await getSituationSimulationConfig();
    if (!config.enabled) {
      throw new HttpsError('unavailable', getLocalizedError('internal', lang));
    }

    // ── Safety guardrail FIRST (before rate limit, before cache) ───────
    if (COERCIVE_PATTERNS.some(p => p.test(trimmed))) {
      logger.info(`[simulateSituation] Ethical block for user ${userId.substring(0, 8)}`);
      return {
        success: true,
        situation: trimmed,
        situationType: 'other',
        matchName: '',
        approaches: [],
        bestApproachId: null,
        coachTip: ETHICAL_BLOCK_MSG[lang] || ETHICAL_BLOCK_MSG.en,
        psychInsights: '',
        ethicalBlock: true,
        fromCache: false,
      };
    }

    // ── Feature is available to all users (no Remote Config gate) ────────
    // Situation Simulation is a public feature, unlike Relationship Simulation
    // which uses Remote Config for beta testing

    // ── Cache check BEFORE rate limit ───────────────────────────────────
    const situationHash = crypto.createHash('sha256')
      .update(`${lang}:${trimmed.toLowerCase()}`)
      .digest('hex')
      .substring(0, 32);
    const cacheRef = hasMatch
      ? db.collection('matches').doc(matchId).collection('situationSimulations').doc(situationHash)
      : db.collection('users').doc(userId).collection('situationSimulations').doc(situationHash);
    try {
      const cacheDoc = await cacheRef.get();
      if (cacheDoc.exists) {
        const cached = cacheDoc.data();
        const ageMs = Date.now() - (cached.generatedAt?.toMillis?.() || 0);
        if (ageMs < SITUATION_CACHE_TTL_MS) {
          const cacheSource = hasMatch ? `match ${matchId.substring(0, 8)}` : 'user';
          logger.info(`[simulateSituation] Cache hit for ${cacheSource} hash ${situationHash.substring(0, 8)}`);
          return {...cached, success: true, fromCache: true};
        }
      }
    } catch (e) {
      logger.warn('[simulateSituation] cache read failed (non-fatal):', e.message);
    }

    // ── Atomic rate limit (configurable via Remote Config) ───────────────
    const today = new Date().toISOString().substring(0, 10);
    const usageRef = db.collection('users').doc(userId)
      .collection('situationSimulationUsage').doc(today);
    const maxPerDay = config.maxPerDay;

    let rateLimitPassed = false;
    try {
      await db.runTransaction(async (tx) => {
        const usageDoc = await tx.get(usageRef);
        const todayCount = usageDoc.exists ? (usageDoc.data().count || 0) : 0;
        if (todayCount >= maxPerDay) {
          const limitMsg = {
            en: `Maximum ${maxPerDay} situation rehearsals per day. Try again tomorrow!`,
            es: `Máximo ${maxPerDay} ensayos de situación por día. ¡Vuelve mañana!`,
            pt: `Máximo ${maxPerDay} ensaios por dia. Tente amanhã!`,
            fr: `Maximum ${maxPerDay} répétitions par jour. Réessayez demain!`,
            de: `Maximal ${maxPerDay} Proben pro Tag. Versuche es morgen!`,
            ja: `1日最大${maxPerDay}回です。明日またお試しください！`,
            zh: `每天最多${maxPerDay}次。明天再试！`,
            ru: `Максимум ${maxPerDay} репетиций в день. Попробуйте завтра!`,
            ar: `الحد الأقصى ${maxPerDay} تدريبات في اليوم.`,
            id: `Maksimal ${maxPerDay} latihan per hari. Coba lagi besok!`,
          };
          throw new HttpsError('resource-exhausted', limitMsg[lang] || limitMsg.en);
        }
        tx.set(usageRef, {count: todayCount + 1, lastUsed: new Date().toISOString()}, {merge: true});
        rateLimitPassed = true;
      });
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      logger.error('[simulateSituation] Rate limit tx error:', e.message);
      rateLimitPassed = true;
    }
    if (!rateLimitPassed) throw new HttpsError('resource-exhausted', getLocalizedError('rate_limit', lang));

    // ── Match permission + data fetch ───────────────────────────────────
    let userPersona, matchPersona;

    if (hasMatch) {
      // Flujo con match específico (existente)
      const matchDoc = await db.collection('matches').doc(matchId).get();
      if (!matchDoc.exists) throw new HttpsError('not-found', getLocalizedError('match_not_found', lang));

      const matchData = matchDoc.data();
      const usersMatched = matchData.usersMatched || [];
      if (!usersMatched.includes(userId)) {
        throw new HttpsError('permission-denied', getLocalizedError('internal', lang));
      }
      const otherUserId = usersMatched.find(id => id !== userId);
      if (!otherUserId) throw new HttpsError('not-found', getLocalizedError('internal', lang));

      const [userDoc, otherDoc, messagesSnap] = await Promise.all([
        db.collection('users').doc(userId).get(),
        db.collection('users').doc(otherUserId).get(),
        db.collection('matches').doc(matchId).collection('messages')
          .orderBy('timestamp', 'desc').limit(30).get(),
      ]);

      if (!userDoc.exists || !otherDoc.exists) {
        throw new HttpsError('not-found', getLocalizedError('profile_not_found', lang));
      }

      [userPersona, matchPersona] = await Promise.all([
        buildPersonaProfile(db, userDoc.data(), 'A', messagesSnap, userId),
        buildPersonaProfile(db, otherDoc.data(), 'B', messagesSnap, otherUserId),
      ]);
    } else {
      // Sin match: usar personas genéricos sin llamar a buildPersonaProfile
      // (que intenta buscar en coachChats y puede fallar)
      logger.info(`[simulateSituation] Using generic personas for user ${userId.substring(0, 8)} (no match)`);
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) throw new HttpsError('not-found', getLocalizedError('profile_not_found', lang));
      const userData = userDoc.data();
      if (!userData) throw new HttpsError('not-found', getLocalizedError('profile_not_found', lang));

      // Build user persona manually without async calls
      const interests = (userData.interests || []).map(i =>
        i.replace(/^interest_/, '').replace(/_/g, ' ')
      );
      userPersona = {
        role: 'A',
        name: userData.name || 'You',
        age: userData.birthDate
          ? Math.floor((Date.now() - userData.birthDate.toDate().getTime()) / (1000 * 60 * 60 * 24 * 365))
          : null,
        userType: userData.userType || 'PRIME',
        bio: (userData.bio || '').substring(0, 400),
        interests,
        attachmentStyle: 'secure',  // Safe default
        commStyle: 'direct',         // Safe default
        archetype: {},               // Will be resolved in buildAgentSystemPrompt
        realMessages: [],
        similarMessages: [],
        avgMessageLength: 60,
      };
      logger.info(`[simulateSituation] User persona built manually: ${userPersona.name}`);

      // Generic persona for the other party in unmatched simulation
      matchPersona = {
        name: 'them',
        bio: '',
        interests: [],
        attachmentStyle: 'secure',
        commStyle: 'direct',
        realMessages: [],
        similarMessages: [],
        avgMessageLength: 60,
      };
    }

    logger.info(`[simulateSituation] Personas built: user=${userPersona.name} match=${matchPersona.name}(${matchPersona.attachmentStyle}/${matchPersona.commStyle})`);

    const genAI = new GoogleGenerativeAI(apiKey);

    // ── Step 1: Classify situation (LITE) ───────────────────────────────
    const situationType = await classifySituation(genAI, trimmed, lang);

    // ── Step 2: Generate 4 approaches (NAME, one call) ──────────────────
    logger.info(`[simulateSituation] Generating approaches for ${matchPersona.name}...`);
    const approaches = await generateApproaches(genAI, trimmed, matchPersona, lang);
    logger.info(`[simulateSituation] Generated ${approaches.length} approaches`);
    const validApproaches = approaches.filter(a => a.phrase && a.phrase.length > 0);
    logger.info(`[simulateSituation] Valid approaches: ${validApproaches.length}`);
    if (validApproaches.length === 0) {
      throw new HttpsError('internal', getLocalizedError('generation_failed', lang));
    }

    // ── Step 3: Simulate match reaction for each approach in PARALLEL ──
    const reactionModel = genAI.getGenerativeModel({
      model: AI_MODEL_LITE,
      generationConfig: {maxOutputTokens: 120, temperature: 0.85},
    });

    const situationContext =
      `The user just told you: "${trimmed}" (situation type: ${situationType}). ` +
      `They are going to send you one specific phrase below. React authentically, in 1-2 sentences, ` +
      `as ${matchPersona.name} would — based on your attachment style, communication style, and personality.`;

    const reactionResults = await Promise.all(validApproaches.map(async (approach) => {
      try {
        const systemPrompt = buildAgentSystemPrompt(matchPersona, userPersona, situationContext, lang);
        const langInstr = getLanguageInstruction(lang);
        const fullPrompt = `${systemPrompt}\n\n${userPersona.name} just said: "${approach.phrase}"\n\nRespond as ${matchPersona.name}, in 1-2 sentences, first person only.\n\n${langInstr}`;
        const reactionText = await generateAgentTurn(reactionModel, fullPrompt, 10000);
        return {approach, reactionText: (reactionText || '').trim()};
      } catch (e) {
        logger.warn(`[simulateSituation] reaction failed for ${approach.tone}:`, e.message);
        return {approach, reactionText: ''};
      }
    }));

    // ── Validate reaction quality ────────────────────────────────────────
    const failedReactions = reactionResults.filter(
      r => !r.reactionText || r.reactionText.trim().length === 0
    ).length;
    if (failedReactions > 2) {
      const failureMsg = {
        en: '🔮 Unable to generate realistic reactions right now. Try again in a moment.',
        es: '🔮 No puedo generar reacciones realistas en este momento. Intenta de nuevo.',
        pt: '🔮 Não consigo gerar reações realistas agora. Tente novamente.',
        fr: '🔮 Impossible de générer des réactions réalistes maintenant. Réessayez.',
        de: '🔮 Kann im Moment keine realistischen Reaktionen generieren. Bitte versuchen Sie es erneut.',
        ja: '🔮 現在、現実的な反応を生成できません。もう一度お試しください。',
        zh: '🔮 现在无法生成真实的反应。请重试。',
        ru: '🔮 Не могу сгенерировать реалистичные реакции. Повторите попытку.',
        ar: '🔮 لا يمكنني إنشاء ردود حقيقية الآن. حاول مرة أخرى.',
        id: '🔮 Tidak dapat menghasilkan reaksi realistis sekarang. Coba lagi.',
      };
      throw new HttpsError('internal', failureMsg[lang] || failureMsg.en);
    }

    // ── Step 4: Score each reaction ─────────────────────────────────────
    const scored = reactionResults.map(({approach, reactionText}) => {
      const {score, signals} = scoreReaction(reactionText);
      return {
        id: String(approach.id || ''),
        tone: String(approach.tone || ''),
        phrase: String(approach.phrase || ''),
        alternativePhrases: Array.isArray(approach.alternativePhrases)
          ? approach.alternativePhrases.filter(p => typeof p === 'string' && p.length > 0)
          : [],
        followUpTips: typeof approach.followUpTips === 'string' ? approach.followUpTips : '',
        matchReaction: reactionText || '',
        successScore: Number.isFinite(score) ? score : 5,
        signals: Array.isArray(signals) ? signals.filter(s => typeof s === 'string') : [],
        recommendedFor: null,
      };
    });

    // Pick winner
    scored.sort((a, b) => b.successScore - a.successScore);
    const bestApproachId = scored[0]?.id || null;
    // Restore original id-order for response
    const approachesOrdered = [...scored].sort((a, b) =>
      (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0)
    );

    // ── Step 5: Psychology RAG ──────────────────────────────────────────
    const ragChunks = await queryPsychologyRAG(
      db, genAI, apiKey,
      matchPersona.attachmentStyle || 'secure',
      userPersona.attachmentStyle || 'secure',
      situationType,
    );

    // ── Step 6: Final coach tip + psych insights ────────────────────────
    const winner = scored[0] || {tone: 'direct', phrase: '', matchReaction: ''};
    const {coachTip, psychInsights} = await buildFinalCoachTip(
      genAI, trimmed, winner, matchPersona, ragChunks, lang
    );

    // ── Assemble final report with defensive defaults ───────────────────
    const safeApproaches = approachesOrdered.map(a => ({
      id: a.id || '',
      tone: a.tone || '',
      phrase: a.phrase || '',
      alternativePhrases: Array.isArray(a.alternativePhrases)
        ? a.alternativePhrases.filter(p => typeof p === 'string' && p.length > 0).slice(0, 3)
        : [],
      followUpTips: typeof a.followUpTips === 'string' ? a.followUpTips : '',
      matchReaction: a.matchReaction || '',
      successScore: Number.isFinite(a.successScore) ? a.successScore : 5,
      signals: Array.isArray(a.signals)
        ? a.signals.filter(s => typeof s === 'string' && s.length > 0)
        : [],
      recommendedFor: typeof a.recommendedFor === 'string' ? a.recommendedFor : null,
    }));

    // ── Decrement unified coach credits (shared with multi-universe) ──
    // Fail-open: log ERROR (not warn) with full context so ops can monitor.
    // We don't throw because: result already generated + Gemini tokens already spent.
    try {
      await db.collection('users').doc(userId).update({
        coachMessagesRemaining: admin.firestore.FieldValue.increment(-1),
      });
    } catch (e) {
      logger.error('[simulateSituation] CRITICAL: credit decrement failed — user may bypass limit', {
        userId: userId.substring(0, 8),
        matchId: matchId ? matchId.substring(0, 8) : 'solo',
        error: e.message,
        errorCode: e.code || 'unknown',
      });
    }

    const finalReport = {
      success: true,
      situation: trimmed,
      situationType: situationType || 'other',
      matchName: matchPersona.name || '',
      approaches: safeApproaches,
      bestApproachId: bestApproachId || (safeApproaches[0]?.id || null),
      coachTip: coachTip || '',
      psychInsights: psychInsights || '',
      ethicalBlock: false,
      fromCache: false,
      matchId,
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Defensive scalar defaults (Firestore rejects undefined)
    const scalarDefaults = {
      situation: '',
      situationType: 'other',
      matchName: '',
      coachTip: '',
      psychInsights: '',
      bestApproachId: null,
    };
    for (const [key, def] of Object.entries(scalarDefaults)) {
      if (finalReport[key] === undefined) finalReport[key] = def;
    }

    // Defensive array scrub
    if (!Array.isArray(finalReport.approaches)) finalReport.approaches = [];

    // ── Save to cache ───────────────────────────────────────────────────
    try {
      await cacheRef.set(finalReport);
    } catch (e) {
      logger.warn('[simulateSituation] cache write failed (non-fatal):', e.message);
    }

    trackAICall({
      functionName: 'simulateSituation',
      model: AI_MODEL_LITE,
      operation: 'situation_rehearsal',
      usage: {totalTokenCount: 400 + (safeApproaches.length * 120) + 220},
      userId,
    });

    const matchIdDebug = (matchId && typeof matchId === 'string' ? matchId.substring(0, 8) : 'generic');
    logger.info(`[simulateSituation] Complete for user ${userId.substring(0, 8)} match=${matchIdDebug} type=${situationType} best=${bestApproachId}`);

    // Return without the server timestamp sentinel (Firestore-internal),
    // and include fromCache=false so clients can distinguish.
    return {
      ...finalReport,
      generatedAt: Date.now(),
    };
    } catch (error) {
      const userIdDebug = (userId && typeof userId === 'string' ? userId.substring(0, 8) : 'unknown');
      const matchIdDebug = (matchId && typeof matchId === 'string' ? matchId.substring(0, 8) : 'none');

      logger.error(`[simulateSituation] Error for user=${userIdDebug} match=${matchIdDebug}: ${error.message}`, {
        code: error.code,
        message: error.message,
        stack: error.stack
      });

      // If it's already an HttpsError, re-throw it. Firebase v2 HttpsError
      // uses plain codes ('unauthenticated', 'invalid-argument', 'not-found',
      // etc.) — NOT the legacy `functions/*` prefix. Use instanceof for the
      // reliable check; the legacy string test is kept as a defensive fallback.
      if (error instanceof HttpsError || (error.code && error.code.startsWith('functions/'))) {
        throw error;
      }

      // Otherwise, wrap in internal error (localized for the user; details logged above)
      throw new HttpsError('internal', getLocalizedError('internal', authLang));
    }
  },
);
