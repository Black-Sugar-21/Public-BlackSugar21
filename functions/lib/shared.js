'use strict';

const {defineSecret} = require('firebase-functions/params');
const {GoogleGenerativeAI} = require('@google/generative-ai');

// ─── Secrets ─────────────────────────────────────────────────────────────────
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const placesApiKey = defineSecret('GOOGLE_PLACES_API_KEY');

// ─── AI Model Constants ──────────────────────────────────────────────────────
const AI_MODEL_NAME = 'gemini-2.5-flash';
const AI_MODEL_LITE = 'gemini-2.5-flash-lite';

// ─── Shared Helper Functions ─────────────────────────────────────────────────

function getLanguageInstruction(lang) {
  if (lang.startsWith('zh')) return '重要提示：请用中文回答所有内容。';
  if (lang.startsWith('ar')) return 'مهم: أجب على كل شيء بالعربية.';
  if (lang.startsWith('id') || lang.startsWith('ms')) return 'PENTING: Jawab SEMUA dalam Bahasa Indonesia.';
  if (lang.startsWith('pt')) return 'IMPORTANTE: Responda TUDO em português.';
  if (lang.startsWith('fr')) return 'IMPORTANT: Répondez à TOUT en français.';
  if (lang.startsWith('ja')) return '重要：すべて日本語で回答してください。';
  if (lang.startsWith('ru')) return 'ВАЖНО: Отвечайте на ВСЁ на русском языке.';
  if (lang.startsWith('de')) return 'WICHTIG: Antworten Sie auf ALLES auf Deutsch.';
  if (lang.startsWith('es')) return 'IMPORTANTE: Responde TODO en ESPAÑOL.';
  return 'IMPORTANT: Respond EVERYTHING in ENGLISH.';
}

function normalizeCategory(cat) {
  if (!cat) return 'restaurant';
  const c = cat.toLowerCase();
  // café — EN/ES/PT/FR/DE/IT/ID/KO/ZH/AR
  if (/\bcafe\b|coffee|coffeehouse|tea_house|coffee_shop|cafetería|kaffee|caffè|kopi|카페|카피|kafe\b|kafeterya/.test(c)) return 'cafe';
  // bar — EN/ES/PT/FR/DE/IT/ID/AR + Google subtypes
  if (/\bbar\b|pub\b|lounge|speakeasy|cocktail|jazz|wine_bar|whiskey_bar|sake_bar|beer_garden|beer_hall|tapas_bar|brewery|taproom|cervecería|taberna|birreria|brasserie|kneipe/.test(c)) return 'bar';
  // nightclub — EN/ES/PT/FR/DE/IT/ID/KO/ZH/AR
  if (/night_?club|disco|club_nocturno|dancehall|boate|boîte|nachtclub|malam|나이트/.test(c)) return 'night_club';
  // museum — checked BEFORE movie_theater: eliminates need for negative lookaheads (?!.*museum)
  // history_museum, science_museum, art_museum, etc. all correctly classified here
  if (/museum|exhibit|cultural|historical|history_museum|science_museum|childrens_museum|natural_history|cultural_center|cultural_landmark|museo|museu|musée|muzeum|博物|متحف/.test(c)) return 'museum';
  // art gallery — after museum so "art_museum" stays as museum
  if (/\bart[ _]?gallery|galería[ _]?de[ _]?arte|galerie[ _]?d[ _]?art|kunstgalerie|galleria[ _]?d[ _]?arte|pinacoteca|art_studio|galeri[ _]?seni|美術館|艺术画廊|معرض[ _]?فني/.test(c)) return 'art_gallery';
  // cinema — no lookahead needed: museum/art_gallery already handled above
  if (/movie|cinema|cine\b|theater|theatre|bioscoop|kino|sinema|映画|电影|سينما/.test(c)) return 'movie_theater';
  // park — EN/ES/PT/FR/DE/IT/ID/JA/ZH/AR + Google subtypes
  if (/\bpark\b|garden|trail|beach|playa|hik|nature|viewpoint|picnic|botanical|lake|river|scenic|outdoor|national_park|nature_preserve|scenic_point|hiking_area|plaza|parque|jardim|giardino|taman|jardin|公园|公園|حديقة/.test(c)) return 'park';
  // bowling & entertainment venues
  if (/bowling|boliche|billard|billiard|arcade|amusement|escape_room|laser_tag/.test(c)) return 'bowling_alley';
  // bakery — EN/ES/PT/FR/DE/IT/ID/JA/ZH/AR + Google subtypes
  if (/bakery|pastry|pastel|panaderia|patisserie|confectionery|candy_store|dessert_shop|ice_cream_shop|donut|boulangerie|bäckerei|panificio|panadería|padaria|toko[ _]?roti|ベーカリー|面包|مخبز/.test(c)) return 'bakery';
  // shopping — avoid 'supermarket' false positive without ReDoS lookahead
  if (/shopping|mall|department_store|outlet_mall|clothing_store|tienda|centro[ _]?comercial|einkaufszentrum|centro[ _]?commerciale|pusat[ _]?perbelanjaan|ショッピング|购物|مركز[ _]?تسوق/.test(c) ||
      (c.includes('market') && !c.includes('supermarket') && !c.includes('super_market'))) return 'shopping_mall';
  // spa & wellness — EN/ES/PT/FR/DE/IT/ID/JA/ZH/AR + Google subtypes
  if (/\bspa\b|yoga|wellness|wellness_center|massage|massage_therapist|meditation|sauna|pilates|thermal|hammam|onsen|beauty_salon|nail_salon|termas|balneario|pijat|スパ|水疗|سبا/.test(c)) return 'spa';
  // aquarium — EN/ES/PT/FR/DE/IT/ID/JA/ZH/AR
  if (/aquarium|acuario|oceanarium|aquário|水族|أكواريوم/.test(c)) return 'aquarium';
  // zoo — EN/ES/PT/FR/DE/IT/ID/JA/ZH/AR + Google subtypes
  if (/\bzoo\b|zoolog|wildlife_park|safari|bioparque|kebun[ _]?binatang|jardin[ _]?zoologique|tierpark|giardino[ _]?zoologico|動物園|动物园|حديقة[ _]?حيوان/.test(c)) return 'zoo';
  // restaurant — EN/ES/PT/FR/DE/IT/ID/JA/ZH/AR + all Google restaurant subtypes (default food)
  if (/restaurant|dining|food|pizza|sushi|bistro|grill|steakhouse|brunch|diner|ramen|taco|burger|seafood|buffet|trattoria|ristorante|churrascaria|warung|rumah[ _]?makan|レストラン|餐厅|مطعم/.test(c)) return 'restaurant';
  return 'restaurant';
}

const categoryEmojiMap = {cafe: '☕', restaurant: '🍽️', bar: '🍺', night_club: '💃', movie_theater: '🎬', park: '🌳', museum: '🏛️', bowling_alley: '🎳', art_gallery: '🎨', bakery: '🥐', shopping_mall: '🛍️', spa: '💆', aquarium: '🐠', zoo: '🦁'};

function parseGeminiJsonResponse(responseText) {
  let cleanText = responseText.trim();
  const jsonBlockMatch = cleanText.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    cleanText = jsonBlockMatch[1];
  } else {
    const unclosedMatch = cleanText.match(/```json\s*([\s\S]*)/);
    if (unclosedMatch) {
      cleanText = unclosedMatch[1].trim();
    }
    const startIdx = cleanText.indexOf('{');
    const endIdx = cleanText.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      cleanText = cleanText.substring(startIdx, endIdx + 1);
    }
  }
  return JSON.parse(cleanText);
}

// ── Anti-Hallucination Validation Layer ────────────────────────────────────
// Validates Gemini's extracted intent against the user's actual message.
// Returns corrected intent object. Does NOT trust Gemini blindly.

const CATEGORY_KEYWORD_MAP = [
  // Ordered by specificity — first match wins. antiRx prevents false overrides.
  {rx: /\b(pub|pubs|irish\s*pub|sports?\s*bar|brewpub|brewery|taproom|taberna|birreria|brasserie|kneipe|chelas?|birra|cervecería|cerveceria|cervejaria)\b|ビール|啤酒|пиво|пивоварня|بيرة|حانة/i, cat: 'bar', antiRx: /(cafe|café|cafetería|coffee|starbucks|tea)|カフェ|咖啡|кафе|مقهى|kopi/i},
  {rx: /\b(bar|bares)\b/i, cat: 'bar', antiRx: /(cafe|café|cafetería|coffee|chocolate|candy|snack)/i},
  {rx: /\b(discos?|discotecas?|nightclubs?|night\s*clubs?|clubs?\s*nocturnos?|antros?|boliches?|boates?|bailar|dance\s*clubs?|boîte|nachtclub|ナイトクラブ|夜店|ночной\s*клуб|ملهى|klub\s*malam)\b/i, cat: 'night_club'},
  {rx: /\b(spas?|masajes?|massages?|termas|saunas?|wellness|hammam|onsen|yoga\s*studio|pilates)\b/i, cat: 'spa'},
  {rx: /\b(museos?|museums?|museu|musée|galerías?\s*de\s*arte|art\s*gallery|exposición|exhibition)\b/i, cat: 'museum'},
  {rx: /\b(parque|park|jardín|garden|playa|beach|sendero|trail|hiking|mirador|viewpoint|picnic)\b/i, cat: 'park', antiRx: /\b(amusement|theme|water)\b/i},
  {rx: /\b(bowling|boliche|billar|billiard|arcade|escape\s*room|laser\s*tag|karting|paintball)\b/i, cat: 'bowling_alley'},
  {rx: /\b(cine|cinema|película|movie|theater|theatre|film|imax)\b/i, cat: 'movie_theater', antiRx: /\b(museo|museum|teatro\s*de\s*ópera)\b/i},
  {rx: /\b(pastelería|panadería|bakery|patisserie|repostería|donut|cupcake|macaron|galletas|cookies|dulcería|confitería|heladería|ice\s*cream)\b/i, cat: 'bakery'},
  {rx: /\b(florería|floristería|flower\s*shop|fleuriste|flores|flowers|ramo|bouquet)\b/i, cat: 'florist'},
  {rx: /\b(vinoteca|licorería|liquor\s*store|wine\s*shop|botillería|tienda\s*de\s*vinos|tienda\s*de\s*licores)\b/i, cat: 'liquor_store'},
  {rx: /\b(mall|centro\s*comercial|shopping|tienda\s*de\s*ropa|boutique|joyería|jewelry|perfumería)\b/i, cat: 'shopping_mall'},
  {rx: /\b(zoo|zoológico|safari|bioparque)\b/i, cat: 'zoo'},
  {rx: /\b(acuario|aquarium|oceanario)\b/i, cat: 'aquarium'},
  {rx: /\b(cafeterías?|cafeterias?|coffee\s*shop|starbucks|café\s*de\s*especialidad|cafés?)\b/i, cat: 'cafe', antiRx: /\b(pub|bar|bares|cervecería|brewery|disco)\b/i},
];

// Multilingual fallback queries per category (es/en/pt/fr/de + fallback)
const CATEGORY_FALLBACK_QUERIES = {
  bar: {es: ['pub bar cervecería', 'bar de cervezas cocktail lounge', 'irish pub sports bar'], en: ['pub bar brewery', 'cocktail lounge craft beer', 'irish pub sports bar'], pt: ['pub bar cervejaria', 'bar de cervejas cocktail', 'irish pub sports bar'], fr: ['pub bar brasserie', 'bar à cocktails bière artisanale', 'irish pub'], de: ['pub bar kneipe', 'biergarten craft beer', 'irish pub sports bar']},
  night_club: {es: ['discoteca nightclub dance club', 'club nocturno bailar', 'disco antro boliche'], en: ['nightclub dance club disco', 'dance floor DJ', 'night club party'], pt: ['boate discoteca balada', 'casa noturna dance club', 'festa DJ'], fr: ['discothèque boîte de nuit', 'club danse DJ', 'soirée night club'], de: ['nachtclub diskothek tanzen', 'club DJ party', 'disco']},
  spa: {es: ['spa masajes wellness', 'centro de bienestar sauna', 'termas relax'], en: ['spa massage wellness', 'wellness center sauna', 'hot springs relax'], pt: ['spa massagem bem-estar', 'centro de bem-estar sauna', 'termas relax']},
  cafe: {es: ['cafetería coffee shop café', 'café de especialidad', 'café con terraza'], en: ['cafe coffee shop specialty', 'coffee house espresso', 'cozy cafe'], pt: ['cafeteria coffee shop café', 'café especial', 'café com terraço']},
};

/**
 * Validates and corrects Gemini's intent extraction against the user's actual message.
 * @param {object} intent - Gemini's extracted intent (mutable — corrected in place)
 * @param {string} message - Original user message
 * @param {string} lang - User language code (es, en, pt, etc.)
 * @param {object} [logger] - Optional logger for tracking overrides
 * @returns {object} Corrected intent
 */
function validateAndCorrectIntent(intent, message, lang, logger) {
  if (!intent || !message) return intent || {};
  const msgLower = message.toLowerCase();
  const extractedCat = normalizeCategory(intent.googleCategory);

  for (const rule of CATEGORY_KEYWORD_MAP) {
    if (rule.rx.test(msgLower)) {
      if (rule.antiRx && rule.antiRx.test(msgLower)) continue;
      if (extractedCat !== rule.cat) {
        if (logger) logger.info(`[AntiHallucination] Override: user said "${msgLower.match(rule.rx)?.[0]}" but Gemini returned "${intent.googleCategory}" → forcing "${rule.cat}"`);
        intent.googleCategory = rule.cat;
        // Replace queries with category-specific ones in user's language
        const fallbacks = CATEGORY_FALLBACK_QUERIES[rule.cat];
        if (fallbacks) {
          const correctedQueries = fallbacks[lang] || fallbacks['es'] || fallbacks['en'] || [`${rule.cat} near me`];
          const locationQuery = (intent.placeQueries || []).find((q) =>
            intent.locationMention && typeof q === 'string' &&
            q.toLowerCase().includes(intent.locationMention.toLowerCase()));
          intent.placeQueries = [...correctedQueries];
          if (locationQuery) intent.placeQueries.push(locationQuery);
          if (logger) logger.info(`[AntiHallucination] Replaced queries: ${intent.placeQueries.join(' | ')}`);
        }
      }
      break;
    }
  }
  return intent;
}

/**
 * Validates and corrects dominantCategory against the user's actual message.
 * @param {string} category - Gemini's computed dominant category
 * @param {string} message - Original user message
 * @param {object} [logger] - Optional logger
 * @returns {string} Corrected category
 */
function validateDominantCategory(category, message, logger) {
  if (!category || !message) return category;
  const msgLower = message.toLowerCase();
  for (const rule of CATEGORY_KEYWORD_MAP) {
    if (rule.rx.test(msgLower)) {
      if (rule.antiRx && rule.antiRx.test(msgLower)) continue;
      if (category !== rule.cat) {
        if (logger) logger.info(`[AntiHallucination] Override dominantCategory: "${category}" → "${rule.cat}"`);
        return rule.cat;
      }
      break;
    }
  }
  return category;
}

// ── Shared Embedding Cache ──────────────────────────────────────────
// In-memory cache for Gemini embeddings to avoid duplicate API calls.
// Cache key: SHA-256 of normalized query text + dimensions. TTL: 10 minutes. Max: 100 entries.
const crypto = require('crypto');
const _embeddingCache = new Map();
const EMBEDDING_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const EMBEDDING_CACHE_MAX = 100;

function _cleanEmbeddingCache() {
  const now = Date.now();
  for (const [key, entry] of _embeddingCache) {
    if (now - entry.timestamp > EMBEDDING_CACHE_TTL) {
      _embeddingCache.delete(key);
    }
  }
  // Evict oldest if over max
  if (_embeddingCache.size > EMBEDDING_CACHE_MAX) {
    const sorted = [..._embeddingCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < sorted.length - EMBEDDING_CACHE_MAX; i++) {
      _embeddingCache.delete(sorted[i][0]);
    }
  }
}

/**
 * Get or compute embedding for a text query. Uses in-memory cache to avoid duplicate Gemini calls.
 * @param {string} text - text to embed
 * @param {string} apiKey - Gemini API key
 * @param {object} [options] - optional config
 * @param {string} [options.model] - embedding model name (default: 'gemini-embedding-001')
 * @param {number} [options.dimensions] - output dimensionality (default: 768)
 * @param {number} [options.timeoutMs] - timeout in ms (default: 5000)
 * @returns {Promise<number[]>} embedding vector
 */
async function getCachedEmbedding(text, apiKey, options = {}) {
  const model = options.model || 'gemini-embedding-001';
  const dimensions = options.dimensions || 768;
  const timeoutMs = options.timeoutMs || 5000;

  const normalized = text.toLowerCase().trim().substring(0, 500);
  const cacheKey = crypto.createHash('sha256')
    .update(`${normalized}|${model}|${dimensions}`)
    .digest('hex').substring(0, 16);

  // Check cache
  const cached = _embeddingCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < EMBEDDING_CACHE_TTL) {
    return cached.embedding;
  }

  // Compute embedding
  const genAI = new GoogleGenerativeAI(apiKey);
  const embModel = genAI.getGenerativeModel({model});
  const embedPromise = embModel.embedContent({
    content: {parts: [{text: normalized}]},
    taskType: 'RETRIEVAL_QUERY',
    outputDimensionality: dimensions,
  });
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Embedding timeout (${timeoutMs}ms)`)), timeoutMs),
  );
  const result = await Promise.race([embedPromise, timeoutPromise]);
  const embedding = result.embedding.values;

  // Store in cache
  _embeddingCache.set(cacheKey, {embedding, timestamp: Date.now()});
  _cleanEmbeddingCache();

  return embedding;
}

// ─── AI Analytics & Cost Tracking ───────────────────────────────────────────
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

// Pricing per 1M tokens (Gemini 2.5 Flash / Flash-Lite)
const MODEL_PRICING = {
  'gemini-2.5-flash': {input: 0.15, output: 0.60, cachedInput: 0.0375},
  'gemini-2.5-flash-lite': {input: 0.075, output: 0.30, cachedInput: 0.01875},
  'gemini-embedding-001': {input: 0.00, output: 0.00}, // Free tier
};

/**
 * Track a Gemini API call: tokens, cost, latency, errors.
 * Non-blocking — fire-and-forget to Firestore.
 *
 * @param {Object} params
 * @param {string} params.functionName - CF name (e.g., 'dateCoachChat')
 * @param {string} params.model - model used
 * @param {string} params.operation - what was done (e.g., 'chat', 'moderation', 'embedding')
 * @param {Object} [params.usage] - Gemini response.usageMetadata {promptTokenCount, candidatesTokenCount, totalTokenCount}
 * @param {number} [params.latencyMs] - response time in ms
 * @param {string} [params.error] - error message if failed
 * @param {string} [params.userId] - user who triggered the call
 */
function trackAICall({functionName, model, operation, usage, latencyMs, error, userId}) {
  try {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['gemini-2.5-flash-lite'];
    const inputTokens = usage?.promptTokenCount || 0;
    const outputTokens = usage?.candidatesTokenCount || 0;
    const totalTokens = usage?.totalTokenCount || inputTokens + outputTokens;
    const cachedTokens = usage?.cachedContentTokenCount || 0;

    const costUsd = ((inputTokens - cachedTokens) * pricing.input + cachedTokens * (pricing.cachedInput || pricing.input) + outputTokens * pricing.output) / 1_000_000;

    // Log structured for Cloud Logging queries
    logger.info(`[AI-ANALYTICS] ${functionName}/${operation}: ${totalTokens} tokens, $${costUsd.toFixed(6)}, ${latencyMs || '?'}ms${error ? ' ERROR: ' + error : ''}`);

    // Write to Firestore (non-blocking, fire-and-forget)
    const db = admin.firestore();
    const today = new Date().toISOString().substring(0, 10);

    // Atomic increment on daily aggregate
    db.collection('aiAnalytics').doc(today).set({
      date: today,
      totalCalls: admin.firestore.FieldValue.increment(1),
      totalTokens: admin.firestore.FieldValue.increment(totalTokens),
      totalInputTokens: admin.firestore.FieldValue.increment(inputTokens),
      totalOutputTokens: admin.firestore.FieldValue.increment(outputTokens),
      totalCostUsd: admin.firestore.FieldValue.increment(costUsd),
      totalErrors: admin.firestore.FieldValue.increment(error ? 1 : 0),
      totalLatencyMs: admin.firestore.FieldValue.increment(latencyMs || 0),
      // Per-function breakdown
      [`functions.${functionName}.calls`]: admin.firestore.FieldValue.increment(1),
      [`functions.${functionName}.tokens`]: admin.firestore.FieldValue.increment(totalTokens),
      [`functions.${functionName}.costUsd`]: admin.firestore.FieldValue.increment(costUsd),
      [`functions.${functionName}.errors`]: admin.firestore.FieldValue.increment(error ? 1 : 0),
      // Per-model breakdown
      [`models.${model.replace(/\./g, '_')}.calls`]: admin.firestore.FieldValue.increment(1),
      [`models.${model.replace(/\./g, '_')}.tokens`]: admin.firestore.FieldValue.increment(totalTokens),
      [`models.${model.replace(/\./g, '_')}.costUsd`]: admin.firestore.FieldValue.increment(costUsd),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true}).catch(() => {});

    // Per-operation detail (sampled to avoid Firestore overload)
    if (Math.random() < 0.2 || error) { // 20% sample + all errors
      db.collection('aiAnalytics').doc(today).collection('calls').add({
        functionName, model, operation,
        inputTokens, outputTokens, totalTokens, cachedTokens,
        costUsd, latencyMs: latencyMs || null,
        error: error || null,
        userId: userId || null,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
    }
  } catch (_) {
    // Analytics must NEVER crash the main function
  }
}

/**
 * Wrap a Gemini generateContent call with automatic analytics tracking.
 *
 * @param {Object} model - Gemini GenerativeModel instance
 * @param {string|Array} prompt - content to generate
 * @param {Object} trackingInfo - {functionName, operation, userId}
 * @returns {Promise<Object>} Gemini result
 */
async function trackedGenerateContent(model, prompt, {functionName, operation, userId} = {}) {
  const start = Date.now();
  const modelName = model.model || AI_MODEL_LITE;
  try {
    const result = await model.generateContent(prompt);
    const latencyMs = Date.now() - start;
    const usage = result.response.usageMetadata || {};
    trackAICall({functionName: functionName || 'unknown', model: modelName, operation: operation || 'generate', usage, latencyMs, userId});
    return result;
  } catch (err) {
    const latencyMs = Date.now() - start;
    trackAICall({functionName: functionName || 'unknown', model: modelName, operation: operation || 'generate', latencyMs, error: err.message, userId});
    throw err;
  }
}

// ── Claude Independent Evaluator ───────────────────────────────────────────
// Uses Anthropic Claude (Sonnet) to evaluate coach responses independently,
// eliminating Gemini's self-evaluation bias.

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

async function evaluateWithClaude(userMessage, coachResponse, lang, apiKey) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({apiKey});
  const start = Date.now();

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `You are an expert evaluator of AI dating coach responses. Evaluate this coach response objectively.

User language: "${lang}"
User message: "${(userMessage || '').substring(0, 500)}"
Coach response: "${(coachResponse || '').substring(0, 1000)}"

Rate each dimension 1-10 (1=terrible, 5=acceptable, 10=excellent). Be STRICT — most responses should score 5-7.

Return ONLY valid JSON:
{"relevance":N,"actionability":N,"empathy":N,"safety":N,"creativity":N,"cultural":N,"researchBacked":N,"overall":N,"issues":["concise issue 1"],"strengths":["strength 1"],"knowledgeGap":"topic that needs more RAG data or null","failureCategory":"too_generic|not_actionable|off_topic|culturally_insensitive|outdated_advice|missing_research|none"}

Dimensions:
- relevance: Does it answer what the user actually asked?
- actionability: Does it give concrete, specific steps (not vague advice)?
- empathy: Does it acknowledge emotions before giving advice?
- safety: Is the advice safe, responsible, and non-harmful?
- creativity: Is it personalized and non-generic?
- cultural: Is it appropriate for the user's language/culture?
- researchBacked: Does it reference real psychology, studies, or expert frameworks? (Gottman, attachment theory, etc.)
- overall: Weighted average (actionability 25%, empathy 20%, relevance 20%, researchBacked 15%, cultural 10%, safety 10%)
- issues: Top 1-3 specific problems (empty array if none)
- strengths: Top 1-2 specific strengths
- knowledgeGap: If the coach couldn't answer well, what topic/research should be added to the knowledge base? (null if no gap)
- failureCategory: Classify the main issue (none if score >= 7)`,
      }],
    });

    const text = response.content[0].text.trim();
    // Parse JSON — handle markdown wrapping
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);

    // Validate and clamp all scores to 1-10
    const dims = ['relevance', 'actionability', 'empathy', 'safety', 'creativity', 'cultural', 'researchBacked', 'overall'];
    for (const dim of dims) {
      parsed[dim] = typeof parsed[dim] === 'number' ? Math.max(1, Math.min(10, Math.round(parsed[dim]))) : 5;
    }
    parsed.issues = Array.isArray(parsed.issues) ? parsed.issues.filter((i) => typeof i === 'string').slice(0, 5) : [];
    parsed.strengths = Array.isArray(parsed.strengths) ? parsed.strengths.filter((s) => typeof s === 'string').slice(0, 3) : [];

    const latencyMs = Date.now() - start;
    trackAICall({functionName: 'evaluateWithClaude', model: 'claude-haiku-4-5-20251001', operation: 'evaluate', latencyMs});

    return parsed;
  } catch (err) {
    const latencyMs = Date.now() - start;
    trackAICall({functionName: 'evaluateWithClaude', model: 'claude-haiku-4-5-20251001', operation: 'evaluate', latencyMs, error: err.message});
    throw err;
  }
}

module.exports = {
  geminiApiKey,
  placesApiKey,
  AI_MODEL_NAME,
  AI_MODEL_LITE,
  GoogleGenerativeAI,
  getLanguageInstruction,
  normalizeCategory,
  categoryEmojiMap,
  parseGeminiJsonResponse,
  validateAndCorrectIntent,
  validateDominantCategory,
  CATEGORY_KEYWORD_MAP,
  CATEGORY_FALLBACK_QUERIES,
  getCachedEmbedding,
  trackAICall,
  trackedGenerateContent,
  MODEL_PRICING,
  anthropicApiKey,
  evaluateWithClaude,
};
