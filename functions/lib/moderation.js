'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { geminiApiKey, AI_MODEL_NAME, AI_MODEL_LITE, getLanguageInstruction, parseGeminiJsonResponse, getCachedEmbedding, trackAICall } = require('./shared');
const { MODERATION_BLACKLIST, SEXUAL_BLACKLIST_TERMS } = require('./notifications');

/** Safely extract text from Gemini result */
function safeResponseText(result) {
  try { return result?.response?.text() || ''; }
  catch (e) { logger.warn(`[safeResponseText] Failed: ${e.message}`); return ''; }
}

// --- Moderation config & RAG ---
const MOD_RAG_COLLECTION = 'moderationKnowledge';
const MOD_RAG_TOP_K = 4;
const MOD_RAG_MIN_SCORE = 0.25;
const MOD_RAG_FETCH_MULTIPLIER = 3;
const RAG_EMBEDDING_MODEL = 'gemini-embedding-001';
const RAG_DIMENSIONS = 768;
const RAG_MAX_QUERY_LENGTH = 500;
const RAG_MAX_CHUNK_LENGTH = 1500;

// In-memory cache for moderation config
let _moderationConfigCache = null;
let _moderationConfigCacheTime = 0;
const MODERATION_CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Reads moderation RAG configuration from Remote Config with fallback defaults.
 * Caches in memory for 5 minutes. Key: moderation_config (JSON).
 * @return {Promise<object>} moderation config with rag sub-object
 */
async function getModerationConfig() {
  if (_moderationConfigCache && (Date.now() - _moderationConfigCacheTime) < MODERATION_CONFIG_CACHE_TTL) {
    return _moderationConfigCache;
  }
  const defaults = {
    rag: {
      enabled: true,
      topK: MOD_RAG_TOP_K,
      minScore: MOD_RAG_MIN_SCORE,
      fetchMultiplier: MOD_RAG_FETCH_MULTIPLIER,
      collection: MOD_RAG_COLLECTION,
    },
  };
  try {
    const rc = admin.remoteConfig();
    const template = await rc.getTemplate();
    const param = template.parameters['moderation_config'];
    if (param && param.defaultValue && param.defaultValue.value) {
      const parsed = JSON.parse(param.defaultValue.value);
      const config = {...defaults, ...parsed};
      if (parsed.rag) config.rag = {...defaults.rag, ...parsed.rag};
      _moderationConfigCache = config;
      _moderationConfigCacheTime = Date.now();
      return config;
    }
  } catch (err) {
    logger.warn('[getModerationConfig] Falling back to defaults:', err.message);
  }
  _moderationConfigCache = defaults;
  _moderationConfigCacheTime = Date.now();
  return defaults;
}

/**
 * Retrieve relevant moderation knowledge chunks via Firestore native vector search.
 * Reuses the same embedding model as coach RAG but targets moderationKnowledge collection.
 * Language-aware: prefers user language → English → any.
 * @param {string} textToModerate - the text being moderated (used as query)
 * @param {string} apiKey - Gemini API key
 * @param {string} lang - user language code
 * @param {string} moderationType - "message" or "biography"
 * @return {Promise<string>} retrieved moderation context or empty string
 */
async function retrieveModerationKnowledge(textToModerate, apiKey, lang = 'en', moderationType = 'message', ragConfig = {}) {
  const isEnabled = ragConfig.enabled !== undefined ? ragConfig.enabled : true;
  if (!isEnabled || !apiKey) return '';

  const topK = Math.min(Math.max(ragConfig.topK || MOD_RAG_TOP_K, 1), 10);
  const minScore = Math.min(Math.max(ragConfig.minScore || MOD_RAG_MIN_SCORE, 0), 1);
  const fetchMultiplier = Math.min(Math.max(ragConfig.fetchMultiplier || MOD_RAG_FETCH_MULTIPLIER, 1), 5);
  const collection = ragConfig.collection || MOD_RAG_COLLECTION;

  try {
    if (!textToModerate || typeof textToModerate !== 'string' || textToModerate.trim().length < 3) return '';
    const trimmedQuery = textToModerate.trim().substring(0, RAG_MAX_QUERY_LENGTH);

    // 1. Embed the text being moderated (shared cache avoids duplicate Gemini calls)
    const queryVector = await getCachedEmbedding(trimmedQuery, apiKey, {
      model: RAG_EMBEDDING_MODEL,
      dimensions: RAG_DIMENSIONS,
    });

    if (!queryVector || queryVector.length !== RAG_DIMENSIONS) return '';

    // 2. Firestore vector search
    const db = admin.firestore();
    const collRef = db.collection(collection);
    const fetchLimit = topK * fetchMultiplier;
    const vectorQuery = collRef.findNearest('embedding', queryVector, {
      limit: fetchLimit,
      distanceMeasure: 'COSINE',
      distanceResultField: '_distance',
    });

    const snapshot = await vectorQuery.get();
    if (snapshot.empty) return '';

    // 3. Parse, filter by minScore, language-aware ranking
    const langNorm = (lang || 'en').substring(0, 2).toLowerCase();
    const docs = snapshot.docs.map((doc) => {
      const data = doc.data();
      const distance = data._distance ?? 1;
      return {
        text: (data.text || '').substring(0, RAG_MAX_CHUNK_LENGTH),
        category: data.category || 'general',
        language: data.language || 'en',
        similarity: 1 - distance,
      };
    }).filter((d) => d.similarity >= minScore && d.text.length > 0);

    if (docs.length === 0) return '';

    // Language priority: user lang → English → other
    const userLangDocs = docs.filter((d) => d.language === langNorm);
    const enDocs = docs.filter((d) => d.language === 'en' && d.language !== langNorm);
    const otherDocs = docs.filter((d) => d.language !== langNorm && d.language !== 'en');
    const ranked = [...userLangDocs, ...enDocs, ...otherDocs];

    // For moderation, include context_guidelines and classification_guide always
    // but deduplicate violation-type categories
    const seenCategories = new Set();
    const deduped = ranked.filter((d) => {
      // Always include guidelines/context (don't dedup these)
      if (['context_guidelines', 'classification_guide', 'bio_moderation', 'evasion_tactics', 'payment_solicitation'].includes(d.category)) {
        const guideKey = `${d.category}_${d.language}`;
        if (seenCategories.has(guideKey)) return false;
        seenCategories.add(guideKey);
        return true;
      }
      if (seenCategories.has(d.category)) return false;
      seenCategories.add(d.category);
      return true;
    });

    const selected = deduped.slice(0, topK);
    if (selected.length === 0) return '';

    logger.info(`[ModerationRAG] Retrieved ${selected.length}/${snapshot.size} chunks for ${moderationType} (lang=${langNorm}, categories: ${selected.map((d) => d.category).join(', ')})`);

    return '\n\nMODERATION KNOWLEDGE BASE — Use these rules and cultural patterns to improve your analysis:\n' +
      selected.map((d, i) => `[${i + 1}] ${d.text}`).join('\n\n');
  } catch (err) {
    logger.warn(`[ModerationRAG] Retrieval failed (non-critical): ${err.message}`);
    return '';
  }
}

/**
 * Retrieve relevant dating knowledge chunks via Firestore native vector search.
 * Embeds the user query with gemini-embedding-001, then uses findNearest() for COSINE similarity.
 * Returns concatenated text of top-k relevant chunks, or empty string on failure.
 * All parameters are configurable via coach_config.rag in Remote Config.
 * @param {string} query - user message to embed
 * @param {string} apiKey - Gemini API key
 * @param {object} ragConfig - optional config from coach_config.rag
 * @param {string} lang - user language for filtering
 * @return {Promise<string>} retrieved knowledge context or empty string
 */

// --- Prompt builders ---
function buildProfileImagePrompt(lang, isSpanish, expectedGender) {
  const languageInstruction = getLanguageInstruction(lang);

  let genderInstruction = '';
  if (expectedGender !== null && expectedGender !== undefined) {
    if (isSpanish) {
      genderInstruction = expectedGender
        ? '\n- OBLIGATORIO: Si la persona principal en la foto es MUJER, RECHAZAR con category "gender_mismatch" (se esperaba MASCULINO). Verificar rasgos faciales.'
        : '\n- OBLIGATORIO: Si la persona principal en la foto es HOMBRE, RECHAZAR con category "gender_mismatch" (se esperaba FEMENINO). Verificar rasgos faciales.';
    } else {
      genderInstruction = expectedGender
        ? '\n- MANDATORY: If the main person in the photo is FEMALE, REJECT with category "gender_mismatch" (expected MALE). Check facial features.'
        : '\n- MANDATORY: If the main person in the photo is MALE, REJECT with category "gender_mismatch" (expected FEMALE). Check facial features.';
    }
  }

  let genderApproval = '';
  if (expectedGender !== null && expectedGender !== undefined) {
    genderApproval = isSpanish
      ? '\n- El género de la persona corresponde al esperado'
      : '\n- The person\'s gender matches the expected one';
  }

  if (isSpanish) {
    return `Analiza esta imagen para una app de citas (estilo Tinder) y determina si es apropiada.

RECHAZAR si contiene:
- Desnudez o contenido sexual explícito
- Violencia o contenido gráfico
- Símbolos de odio o discriminación
- Menores de edad
- Rostros poco claros (la persona principal debe ser claramente visible)
- Contenido ofensivo o inapropiado${genderInstruction}

APROBAR si:
- Muestra claramente el rostro de una persona adulta
- Es una foto apropiada para perfil de citas
- Los LENTES/GAFAS están permitidos
- Accesorios (sombreros, gorras, bufandas ligeras) están permitidos siempre que el rostro sea visible
- MÚLTIPLES PERSONAS están permitidas (fotos con amigos, familia, etc. son aceptables)
- No contiene contenido inapropiado${genderApproval}

${languageInstruction}

Responde SOLO en formato JSON:
{
    "approved": true/false,
    "reason": "explicación breve en español si se rechaza",
    "confidence": 0.0-1.0,
    "categories": ["lista", "de", "problemas", "en", "español"],
    "category": "nudity|violence|underage|unclear_face|screenshot|low_quality|offensive|celebrity|gender_mismatch|approved"
}`;
  }

  return `Analyze this image for a dating app (Tinder style) and determine if it's appropriate.

REJECT if it contains:
- Nudity or explicit sexual content
- Violence or graphic content
- Hate symbols or discrimination
- Minors
- Unclear faces (the main person's face must be clearly visible)
- Offensive or inappropriate content${genderInstruction}

APPROVE if:
- Clearly shows the face of an adult person
- Is an appropriate photo for a dating profile
- GLASSES/EYEWEAR are allowed
- Accessories (hats, caps, light scarves) are allowed as long as the face is visible
- MULTIPLE PEOPLE are allowed (photos with friends, family, etc. are acceptable)
- Does not contain inappropriate content${genderApproval}

${languageInstruction}

Respond ONLY in JSON format:
{
    "approved": true/false,
    "reason": "brief explanation if rejected",
    "confidence": 0.0-1.0,
    "categories": ["list", "of", "issues"],
    "category": "nudity|violence|underage|unclear_face|screenshot|low_quality|offensive|celebrity|gender_mismatch|approved"
}`;
}

/**
 * Construye prompt permisivo para stories/historias.
 * Homologado con ContentModerationService.kt moderateStoryImage()
 */
function buildStoryImagePrompt(lang, isSpanish) {
  const languageInstruction = getLanguageInstruction(lang);

  if (isSpanish) {
    return `Analiza esta imagen para una HISTORIA/STORY de app de citas y determina si es apropiada.

RECHAZAR SOLO si contiene:
- Desnudez o contenido sexual explícito
- Violencia gráfica o contenido perturbador
- Símbolos de odio, racismo o discriminación
- Propaganda política o contenido divisivo
- Spam o publicidad comercial excesiva
- Drogas ilegales o consumo de sustancias
- Armas de fuego (armas blancas decorativas están permitidas)
- Contenido ofensivo o lenguaje de odio visible

APROBAR TODO lo demás, incluyendo:
- Paisajes, naturaleza, lugares
- Comida, bebidas, restaurantes
- Objetos, productos (sin publicidad excesiva)
- Animales, mascotas
- Arte, pinturas, esculturas
- Selfies, fotos con amigos/familia
- Fotos SIN personas o SIN rostros visibles
- Pantallas de computadora, escritorios
- Vehículos, autos, motos
- Actividades deportivas, gym, ejercicio
- Eventos sociales, fiestas (sin contenido inapropiado)
- Viajes, turismo, aventuras

IMPORTANTE: Las historias son contenido temporal y casual.
NO se requiere que muestre rostros o personas.
Se permite TODO contenido apropiado y seguro.

${languageInstruction}

Responde SOLO en formato JSON:
{
    "approved": true/false,
    "reason": "explicación breve si se rechaza",
    "confidence": 0.0-1.0,
    "categories": ["lista", "de", "problemas"],
    "category": "nudity|violence|hate|drugs|spam|offensive|approved"
}`;
  }

  return `Analyze this image for a dating app STORY/HISTORIA and determine if it's appropriate.

REJECT ONLY if it contains:
- Nudity or explicit sexual content
- Graphic violence or disturbing content
- Hate symbols, racism, or discrimination
- Political propaganda or divisive content
- Spam or excessive commercial advertising
- Illegal drugs or substance abuse
- Firearms (decorative bladed weapons are allowed)
- Offensive content or visible hate speech

APPROVE everything else, including:
- Landscapes, nature, places
- Food, drinks, restaurants
- Objects, products (without excessive advertising)
- Animals, pets
- Art, paintings, sculptures
- Selfies, photos with friends/family
- Photos WITHOUT people or WITHOUT visible faces
- Computer screens, desks
- Vehicles, cars, motorcycles
- Sports activities, gym, exercise
- Social events, parties (without inappropriate content)
- Travel, tourism, adventures

IMPORTANT: Stories are temporary and casual content.
Faces or people are NOT required.
ALL appropriate and safe content is allowed.

${languageInstruction}

Respond ONLY in JSON format:
{
    "approved": true/false,
    "reason": "brief explanation if rejected",
    "confidence": 0.0-1.0,
    "categories": ["list", "of", "issues"],
    "category": "nudity|violence|hate|drugs|spam|offensive|approved"
}`;
}

/**
 * Construye prompt para moderación de biografías.
 * Homologado con ContentModerationService.kt moderateText(BIOGRAPHY)
 */
function buildBioModerationPrompt(text, lang, isSpanish, ragContext = '') {
  const languageInstruction = getLanguageInstruction(lang);

  if (isSpanish) {
    return `Analiza esta biografía de perfil de aplicación de citas y determina si es apropiada.

Texto: "${text}"

RECHAZA si contiene:
- Contenido sexual explícito o lenguaje vulgar
- Información de contacto (teléfono, email, redes sociales)
- Spam o publicidad
- Lenguaje de odio o discriminación
- Solicitudes de dinero o estafas
- Amenazas o intimidación
- Información personal sensible (dirección, DNI, etc.)

APRUEBA si:
- Es una descripción personal apropiada
- No contiene nada de lo anterior
${ragContext}
${languageInstruction}

Responde SOLO con JSON:
{
  "approved": true/false,
  "reason": "Motivo del rechazo en español o 'approved'",
  "category": "sexual|contact_info|spam|hate_speech|scam|threats|personal_info|approved",
  "confidence": 0.0-1.0
}`;
  }

  return `Analyze this dating app profile biography and determine if it's appropriate.

Text: "${text}"

REJECT if it contains:
- Explicit sexual content or vulgar language
- Contact information (phone, email, social media)
- Spam or advertising
- Hate speech or discrimination
- Money requests or scams
- Threats or intimidation
- Sensitive personal information (address, ID, etc.)

APPROVE if:
- It's an appropriate personal description
- Doesn't contain any of the above
${ragContext}
${languageInstruction}

Respond ONLY with JSON:
{
  "approved": true/false,
  "reason": "Rejection reason or 'approved'",
  "category": "sexual|contact_info|spam|hate_speech|scam|threats|personal_info|approved",
  "confidence": 0.0-1.0
}`;
}

/**
 * Construye prompt para moderación de mensajes de chat.
 * Homologado con ContentModerationService.kt moderateText(MESSAGE)
 */
function buildMessageModerationPrompt(text, lang, isSpanish, ragContext = '') {
  const languageInstruction = getLanguageInstruction(lang);

  if (isSpanish) {
    return `Analiza este mensaje de chat en una app de citas y determina si es apropiado.

Mensaje: "${text}"

CONTEXTO: Esta es una app de citas (Black Sugar 21). El coqueteo, discutir expectativas de relación y estilo de vida es NORMAL y PERMITIDO.

RECHAZA si contiene:
- Acoso o lenguaje abusivo
- Contenido sexual explícito no solicitado
- Spam o enlaces sospechosos
- Amenazas o intimidación
- Lenguaje de odio o discriminación
- Solicitudes directas de dinero con links de pago

APRUEBA si es un mensaje normal de conversación, coqueteo, o discusión de expectativas de relación.
${ragContext}
${languageInstruction}

Responde SOLO con JSON:
{
  "approved": true/false,
  "reason": "Motivo del rechazo en español o 'approved'",
  "category": "harassment|sexual|spam|threats|hate_speech|scam|approved",
  "confidence": 0.0-1.0
}`;
  }

  return `Analyze this chat message in a dating app and determine if it's appropriate.

Message: "${text}"

CONTEXT: This is a dating app (Black Sugar 21). Flirting, discussing relationship expectations, and lifestyle is NORMAL and ALLOWED.

REJECT if it contains:
- Harassment or abusive language
- Unsolicited explicit sexual content
- Spam or suspicious links
- Threats or intimidation
- Hate speech or discrimination
- Direct money requests with payment links

APPROVE if it's a normal conversation message, flirting, or relationship expectations discussion.
${ragContext}
${languageInstruction}

Respond ONLY with JSON:
{
  "approved": true/false,
  "reason": "Rejection reason or 'approved'",
  "category": "harassment|sexual|spam|threats|hate_speech|scam|approved",
  "confidence": 0.0-1.0
}`;
}

/**
 * Normalizes any category string to one of the 14 canonical Google Places
 * categories used by iOS/Android coach & chat UI filters: cafe, restaurant,
 * bar, night_club, movie_theater, park, museum, bowling_alley, art_gallery,
 * bakery, shopping_mall, spa, aquarium, zoo.
 */

// --- Moderation callable functions ---
exports.validateProfileImage = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {imageUrl} = request.data || {};
    if (!imageUrl) throw new Error('imageUrl is required');

    // Validación básica de URL de Storage de Firebase
    const isFirebaseStorage = imageUrl.includes('firebasestorage.googleapis.com') ||
                               imageUrl.includes('storage.googleapis.com');
    if (!isFirebaseStorage && !imageUrl.startsWith('https://')) {
      return {valid: false, reason: 'invalid_url', scores: {}};
    }

    // En producción se conectaría a Cloud Vision API / Vertex AI
    // Por ahora retornamos aprobación (la moderación real se hace en moderateProfileImage)
    logger.info(`[validateProfileImage] Validated: ${imageUrl}`);
    return {
      valid: true,
      reason: 'approved',
      scores: {safe: 0.99, explicit: 0.01, violence: 0.01},
    };
  },
);

/**
 * Callable: Moderar imagen de perfil o story con Gemini AI.
 * Payload: { imageBase64, expectedGender?, userLanguage?, isStory? }
 * Response: { approved, reason, confidence, categories, category }
 * Homologado: iOS ContentModerationService / Android ContentModerationService
 */
exports.moderateProfileImage = onCall(
  {region: 'us-central1', memory: '512MiB', timeoutSeconds: 60, secrets: [geminiApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {imageBase64, expectedGender, userLanguage, isStory} = request.data || {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      throw new Error('imageBase64 is required');
    }

    const language = (userLanguage || 'en').toLowerCase();
    const isSpanish = language.startsWith('es');

    logger.info(`[moderateProfileImage] isStory=${!!isStory}, lang=${language}, gender=${expectedGender}`);

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        logger.error('[moderateProfileImage] GEMINI_API_KEY not configured');
        // Fail-open for profile, fail-closed for story
        return isStory
          ? {approved: false, reason: 'AI moderation unavailable', confidence: 0, categories: [], category: 'error'}
          : {approved: true, reason: 'AI moderation unavailable', confidence: 0, categories: [], category: 'error'};
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({model: AI_MODEL_LITE, generationConfig: {maxOutputTokens: 512, responseMimeType: 'application/json'}});

      const prompt = isStory
        ? buildStoryImagePrompt(language, isSpanish)
        : buildProfileImagePrompt(language, isSpanish, expectedGender);

      const result = await model.generateContent([
        prompt,
        {inlineData: {data: imageBase64, mimeType: 'image/jpeg'}},
      ]);

      const responseText = safeResponseText(result);
      logger.info(`[moderateProfileImage] Gemini response: ${responseText.substring(0, 200)}`);

      const parsed = parseGeminiJsonResponse(responseText);
      const approved = !!parsed.approved;
      const reason = typeof parsed.reason === 'string' ? parsed.reason.substring(0, 500) : '';
      // Anti-hallucination: clamp confidence, validate categories
      const confidence = typeof parsed.confidence === 'number' && !isNaN(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence)) : (approved ? 1.0 : 0.9);
      const categories = Array.isArray(parsed.categories) ? parsed.categories.filter((c) => typeof c === 'string') : [];
      const category = parsed.category || (categories.length > 0 ? categories[0] : (approved ? 'approved' : 'other'));

      // Server-side enforcement: gender_mismatch MUST reject even if Gemini approved
      if (expectedGender !== null && expectedGender !== undefined) {
        if (category === 'gender_mismatch' || categories.includes('gender_mismatch')) {
          logger.info(`[moderateProfileImage] Gender mismatch enforced (expected=${expectedGender ? 'male' : 'female'})`);
          return {approved: false, reason: reason || 'gender_mismatch', confidence, categories: [...categories, 'gender_mismatch'], category: 'gender_mismatch'};
        }
      }

      return {approved, reason, confidence, categories, category};
    } catch (error) {
      logger.error('[moderateProfileImage] Error:', error);
      // Fail-open for profile photos, fail-closed for stories
      if (isStory) {
        return {approved: false, reason: 'moderation_error', confidence: 0, categories: [], category: 'error'};
      }
      return {approved: true, reason: 'moderation_error', confidence: 0, categories: [], category: 'error'};
    }
  },
);

/**
 * Callable: Moderar texto (mensaje de chat o biografía) con Gemini AI.
 * Payload: { message, language?, type?, matchId? }
 *   type: "biography" | "message" (default: "message" for backward compat)
 * Response: { approved, reason, category, confidence }
 * Homologado: iOS ContentModerationService / Android ContentModerationService / ChatViewModel
 */
exports.moderateMessage = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 30, secrets: [geminiApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {message, language, type, matchId} = request.data || {};
    if (!message || typeof message !== 'string') {
      return {approved: true, reason: 'empty_message', category: 'approved', confidence: 1.0};
    }

    const lang = (language || 'en').toLowerCase();
    const isSpanish = lang.startsWith('es');
    const moderationType = (type || 'message').toLowerCase();

    logger.info(`[moderateMessage] type=${moderationType}, lang=${lang}, len=${message.length}`);

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        logger.error('[moderateMessage] GEMINI_API_KEY not configured');
        return {approved: true, reason: 'AI moderation unavailable', category: 'error', confidence: 0};
      }

      // Retrieve moderation knowledge via RAG (config cached 5min)
      const modConfig = await getModerationConfig();
      const ragContext = await retrieveModerationKnowledge(message, apiKey, lang, moderationType, modConfig.rag || {});

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({model: AI_MODEL_LITE, generationConfig: {maxOutputTokens: 256, responseMimeType: 'application/json'}});

      const prompt = moderationType === 'biography'
        ? buildBioModerationPrompt(message, lang, isSpanish, ragContext)
        : buildMessageModerationPrompt(message, lang, isSpanish, ragContext);

      const result = await model.generateContent(prompt);
      const responseText = safeResponseText(result);
      logger.info(`[moderateMessage] Gemini response: ${responseText.substring(0, 200)}`);

      const parsed = parseGeminiJsonResponse(responseText);
      const approved = !!parsed.approved;
      // Support both "allowed" (iOS CF compat) and "approved" fields
      const isAllowed = parsed.allowed !== undefined ? !!parsed.allowed : approved;
      const reason = typeof parsed.reason === 'string' ? parsed.reason.substring(0, 500) : '';
      const category = (parsed.category || (isAllowed ? 'approved' : 'other')).toLowerCase();
      // Anti-hallucination: clamp confidence to valid range
      const confidence = typeof parsed.confidence === 'number' && !isNaN(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence)) : (isAllowed ? 1.0 : 0.9);

      return {approved: isAllowed, reason, category, confidence};
    } catch (error) {
      logger.error('[moderateMessage] Error:', error);
      // Fail-open: approve on error (aligned with client behavior)
      return {approved: true, reason: 'moderation_error', category: 'error', confidence: 0};
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// MODERATION HELPERS — Prompts y parsing para moderación con Gemini
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Obtiene la instrucción de idioma para el prompt de Gemini.
 */

// --- Auto-moderation helpers ---
function getMessageHash(message) {
  return crypto.createHash('sha256')
    .update(message.toLowerCase().trim())
    .digest('hex');
}

/**
 * Filtros rápidos sin IA para mensajes obviamente seguros o prohibidos.
 * Reduce ~60% de llamadas a Gemini.
 */
function applyQuickFilters(message, modConfig = {}) {
  const messageLower = message.toLowerCase().trim();

  // 1. Mensajes muy cortos → generalmente seguros (emoji, "hola", "ok")
  const safeLenThreshold = modConfig.safeLengthThreshold || 3;
  if (message.length <= safeLenThreshold) {
    return {isSafe: true, category: 'SAFE', reason: 'Message too short to be harmful'};
  }

  // 2. Blacklist de palabras/frases (base + RC-configurable additions)
  const additionalTerms = Array.isArray(modConfig.additionalBlacklistTerms) ? modConfig.additionalBlacklistTerms : [];
  const fullBlacklist = additionalTerms.length > 0 ? [...MODERATION_BLACKLIST, ...additionalTerms] : MODERATION_BLACKLIST;
  for (const term of fullBlacklist) {
    if (messageLower.includes(term)) {
      let category = 'SPAM';
      let severity = 'HIGH';
      if (SEXUAL_BLACKLIST_TERMS.some((st) => term.includes(st))) {
        category = 'INAPPROPRIATE';
      } else if (/money|dinero|dinheiro|bitcoin|paypal|bank|cuenta|transferen/.test(term)) {
        category = 'SCAM';
      }
      return {
        isSafe: false, allowed: false, category, severity,
        reason: `Detected blacklisted term: "${term}"`, confidence: 95,
      };
    }
  }

  // 3. URLs sospechosas (whitelisted: Google Maps, Maps app, Yelp, TripAdvisor)
  const SAFE_URL_DOMAINS = /google\.com\/maps|maps\.google|maps\.app\.goo\.gl|goo\.gl\/maps|yelp\.com|tripadvisor|booking\.com|airbnb\.com/i;
  if (/(https?:\/\/|www\.|bit\.ly|tinyurl|shorturl|t\.me\/|wa\.me\/)/i.test(message)) {
    if (!SAFE_URL_DOMAINS.test(message)) {
      return {
        isSafe: false, allowed: false, category: 'SCAM', severity: 'MEDIUM',
        reason: 'Suspicious external URL detected', confidence: 85,
      };
    }
    // Safe URL (Maps, venues) — pass to AI for context check
  }

  // 4. Shortened/redirect URLs (always suspicious, no whitelist)
  if (/\b(bit\.ly|tinyurl|shorturl|t\.me\/|wa\.me\/|is\.gd|ow\.ly|buff\.ly)\b/i.test(message)) {
    return {
      isSafe: false, allowed: false, category: 'SCAM', severity: 'MEDIUM',
      reason: 'Shortened/redirect URL detected', confidence: 90,
    };
  }

  // 5. Phone numbers and emails — ONLY flag in bios, NOT in chat between matched users
  // autoModerateMessage runs on chat messages where sharing contact info is normal
  // The 'type' context is checked by the caller; here we let AI handle it
  // (phone/email detection moved to AI analysis with proper context)

  // 6. Caracteres repetitivos (spam) — threshold 8+ (dating chat uses "heyyyy", "jajaja")
  if (/(.)\1{7,}/.test(message)) {
    return {
      isSafe: false, allowed: false, category: 'SPAM', severity: 'LOW',
      reason: 'Repetitive characters detected', confidence: 80,
    };
  }

  // No conclusivo → necesita análisis IA
  return {isSafe: false, needsAI: true};
}

/**
 * Busca resultado en caché Firestore. TTL: 1 hora. Versión: 3.
 */
async function getCachedModerationResult(messageHash, db) {
  try {
    const CACHE_VERSION = 3;
    const oneHourAgo = new Date(Date.now() - 3600000);
    const doc = await db.collection('moderationCache').doc(messageHash).get();
    if (doc.exists) {
      const cached = doc.data();
      const cacheTime = cached.timestamp?.toDate() || new Date(0);
      if ((cached.version || 1) < CACHE_VERSION) return null; // versión antigua
      if (cacheTime > oneHourAgo) {
        return {
          allowed: cached.allowed, category: cached.category,
          severity: cached.severity, reason: cached.reason,
          confidence: cached.confidence, fromCache: true,
        };
      }
    }
  } catch (err) {
    logger.warn('[Cache Read] Error:', err.message);
  }
  return null;
}

/**
 * Guarda resultado de moderación en caché Firestore.
 */
async function saveModerationToCache(messageHash, result, db) {
  try {
    const CACHE_VERSION = 3;
    await db.collection('moderationCache').doc(messageHash).set({
      allowed: result.allowed, category: result.category,
      severity: result.severity, reason: result.reason,
      confidence: result.confidence, version: CACHE_VERSION,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});
  } catch (err) {
    logger.warn('[Cache Write] Error:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-MODERATION TRIGGER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Trigger: Auto-moderar mensajes al crearse en un match.
 * Pipeline: caché → quick filters → RAG + Gemini AI.
 * Complementa a moderateMessage CF callable (invocada explícitamente por la app).
 */

// --- Auto-moderation trigger ---
exports.autoModerateMessage = onDocumentCreated(
  {document: 'matches/{matchId}/messages/{messageId}', region: 'us-central1', memory: '256MiB', timeoutSeconds: 30},
  async (event) => {
    const db = admin.firestore();
    const snapshot = event.data;
    if (!snapshot) return;
    const data = snapshot.data();
    const messageId = event.params.messageId;
    const matchId = event.params.matchId;

    // Solo moderar mensajes de texto
    if (!data.message || data.type !== 'text') return;

    const message = data.message;
    const senderId = data.senderId;

    try {
      // ── 1. Cache check ──
      const messageHash = getMessageHash(message);
      const cachedResult = await getCachedModerationResult(messageHash, db);
      if (cachedResult) {
        if (!cachedResult.allowed && cachedResult.severity === 'HIGH') {
          await snapshot.ref.update({
            moderated: true, moderationResult: cachedResult,
            moderatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          logger.warn(`[autoModerate] Cached HIGH flagged ${messageId}`);
        }
        return;
      }

      // ── 2. Quick filters (sin IA) — with RC-configurable blacklist additions ──
      const modConfig = await getModerationConfig();
      const quickCheck = applyQuickFilters(message, modConfig);

      if (quickCheck.isSafe) {
        await saveModerationToCache(messageHash, {allowed: true, category: 'SAFE', severity: 'NONE', confidence: 100}, db);
        return;
      }

      if (quickCheck.allowed === false) {
        await saveModerationToCache(messageHash, quickCheck, db);
        await snapshot.ref.update({
          moderated: true, moderationResult: quickCheck,
          moderatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Auto-reporte para HIGH severity
        if (quickCheck.severity === 'HIGH') {
          await db.collection('reports').add({
            reportedUserId: senderId, reporterUserId: 'SYSTEM_AUTO_MODERATE',
            matchId, messageId, reason: `Auto-detected: ${quickCheck.category}`,
            category: quickCheck.category, severity: quickCheck.severity,
            autoGenerated: true, message: message.substring(0, 500),
            timestamp: admin.firestore.FieldValue.serverTimestamp(), status: 'pending',
          });
        }

        // Audit trail
        await db.collection('moderatedMessages').add({
          matchId, messageId, senderId, message: message.substring(0, 500),
          category: quickCheck.category, severity: quickCheck.severity,
          reason: quickCheck.reason, confidence: quickCheck.confidence,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          filteredBy: 'auto-moderate-quick-filter', messageHash: messageHash.substring(0, 16),
        });
        logger.warn(`[autoModerate] Quick-filter flagged ${messageId}: ${quickCheck.category}`);
        return;
      }

      // ── 3. IA analysis (requiere Gemini) ──
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        logger.warn('[autoModerate] GEMINI_API_KEY not configured, allowing message');
        return;
      }

      // RAG: obtener contexto de moderación + idioma del sender + config en paralelo
      let ragContext = '';
      try {
        const senderDoc = await db.collection('users').doc(senderId).get();
        // modConfig already loaded before quick filters (reuse cached instance)
        const senderLang = senderDoc.exists ? (senderDoc.data().deviceLanguage || 'en') : 'en';
        ragContext = await retrieveModerationKnowledge(message, apiKey, senderLang, 'message', modConfig.rag || {});
      } catch (ragErr) {
        logger.warn('[autoModerate] RAG fallback:', ragErr.message);
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({model: AI_MODEL_LITE});

      const ragSection = ragContext ? `\n\nMODERATION KNOWLEDGE BASE:\n${ragContext}\n` : '';
      const prompt = `You are a content moderation system for Black Sugar 21, a dating app. Analyze the following chat message and classify it.
${ragSection}
Message: "${message.substring(0, 1000)}"

Categories:
- SAFE: Normal conversation, greetings, innocent questions, flirting appropriate for a dating app
- SPAM: Repetitive messages, promotional content, advertising
- SCAM: Scams, phishing, money requests, false promises, payment platform links
- INAPPROPRIATE: Unsolicited explicit sexual content, harassment, insults, violence, threats
- PERSONAL_INFO: Phone numbers, addresses, social media handles, emails shared unsolicited

IMPORTANT CONTEXT: This is a dating app. Compliments about appearance, casual flirting, discussing lifestyle expectations, and mentioning dates/dinners are NORMAL and should be classified as SAFE. Only flag genuinely harmful, explicit, or predatory content.

Severity (only if NOT SAFE):
- LOW: Mild, warning sufficient
- MEDIUM: Moderate, needs review
- HIGH: Severe, immediate block and report

Respond ONLY with valid JSON (no markdown):
{"category":"SAFE|SPAM|SCAM|INAPPROPRIATE|PERSONAL_INFO","severity":"NONE|LOW|MEDIUM|HIGH","confidence":0-100,"reason":"brief explanation"}`;

      const modStart = Date.now();
      const result = await model.generateContent(prompt);
      trackAICall({functionName: 'autoModerateMessage', model: AI_MODEL_LITE, operation: 'classify', usage: result.response.usageMetadata, latencyMs: Date.now() - modStart});
      const responseText = safeResponseText(result).trim();
      const cleanText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const rawAnalysis = JSON.parse(cleanText);

      // ── Anti-Hallucination Validation Layer ──────────────────────────
      // Gemini can return invalid categories, out-of-range confidence, or missing fields.
      // Validate and clamp all outputs to prevent hallucinated blocks.
      const VALID_CATEGORIES = ['SAFE', 'SPAM', 'SCAM', 'INAPPROPRIATE', 'PERSONAL_INFO'];
      const VALID_SEVERITIES = ['NONE', 'LOW', 'MEDIUM', 'HIGH'];
      const analysis = {
        category: VALID_CATEGORIES.includes(String(rawAnalysis.category || '').toUpperCase())
          ? String(rawAnalysis.category).toUpperCase() : 'SAFE',
        severity: VALID_SEVERITIES.includes(String(rawAnalysis.severity || '').toUpperCase())
          ? String(rawAnalysis.severity).toUpperCase() : 'NONE',
        confidence: typeof rawAnalysis.confidence === 'number' && !isNaN(rawAnalysis.confidence)
          ? Math.max(0, Math.min(100, Math.round(rawAnalysis.confidence))) : 50,
        reason: typeof rawAnalysis.reason === 'string' ? rawAnalysis.reason.substring(0, 500) : '',
      };
      // Log if Gemini hallucinated an invalid category
      if (rawAnalysis.category && !VALID_CATEGORIES.includes(String(rawAnalysis.category).toUpperCase())) {
        logger.warn(`[autoModerate] Gemini hallucinated category "${rawAnalysis.category}" → defaulting to SAFE`);
      }

      // Adaptive confidence: if a category has high false positive rate, require higher confidence
      const baseConfidenceThreshold = modConfig.confidenceThreshold || 50;
      let effectiveThreshold = baseConfidenceThreshold;
      try {
        const today = new Date().toISOString().substring(0, 10);
        const yesterdayInsight = await db.collection('moderationInsights').doc('daily')
          .collection(today).doc('summary').get();
        if (yesterdayInsight.exists) {
          const catDisputes = yesterdayInsight.data().categoryDisputes || {};
          const catCounts = yesterdayInsight.data().categoryCounts || {};
          const cat = analysis.category || 'SAFE';
          const disputes = catDisputes[cat] || 0;
          const total = catCounts[cat] || 0;
          if (total > 5 && disputes > 0) {
            const catFpRate = disputes / total;
            if (catFpRate > 0.3) effectiveThreshold = Math.min(90, baseConfidenceThreshold + 20);
            else if (catFpRate > 0.15) effectiveThreshold = Math.min(85, baseConfidenceThreshold + 10);
          }
        }
      } catch (fpErr) { logger.warn(`[autoModerateMessage] FP rate lookup error: ${fpErr.message}`); }

      const isAllowed = analysis.category === 'SAFE' || (analysis.confidence || 0) < effectiveThreshold;
      const moderationResult = {
        allowed: isAllowed,
        category: analysis.category || 'SAFE',
        severity: isAllowed ? 'NONE' : (analysis.severity || 'NONE'),
        reason: analysis.reason || '',
        confidence: analysis.confidence || 0,
        analyzedBy: 'gemini-ai',
        confidenceThreshold: effectiveThreshold,
      };

      await saveModerationToCache(messageHash, moderationResult, db);

      if (!moderationResult.allowed) {
        await snapshot.ref.update({
          moderated: true, moderationResult,
          moderatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        if (moderationResult.severity === 'HIGH') {
          await db.collection('reports').add({
            reportedUserId: senderId, reporterUserId: 'SYSTEM_AUTO_MODERATE',
            matchId, messageId, reason: `Auto-detected by AI: ${moderationResult.category}`,
            category: moderationResult.category, severity: moderationResult.severity,
            autoGenerated: true, message: message.substring(0, 500),
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            status: 'pending', aiConfidence: moderationResult.confidence,
          });
        }

        await db.collection('moderatedMessages').add({
          matchId, messageId, senderId, message: message.substring(0, 500),
          category: moderationResult.category, severity: moderationResult.severity,
          reason: moderationResult.reason, confidence: moderationResult.confidence,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          filteredBy: 'auto-moderate-gemini-ai', messageHash: messageHash.substring(0, 16),
        });

        logger.warn(`[autoModerate] AI flagged ${messageId}: ${moderationResult.category} (conf:${moderationResult.confidence})`);
      }
    } catch (error) {
      // Fail-open: no bloquear mensajes si hay error
      logger.error(`[autoModerate] Error processing ${messageId}:`, error);
    }
  },
);

// ── Moderation Self-Improvement System ───────────────────────────────────────

/**
 * Callable: Dispute a moderation decision (false positive / too harsh / missed threat).
 */
exports.disputeModeration = onCall(
  {region: 'us-central1', memory: '128MiB', timeoutSeconds: 10},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {messageId, matchId, disputeType, explanation} = request.data || {};
    if (!messageId || !matchId || !['false_positive', 'too_harsh', 'missed_threat'].includes(disputeType)) {
      return {success: false, error: 'invalid_params'};
    }

    const userId = request.auth.uid;
    const db = admin.firestore();
    const config = await getModerationConfig();

    // Rate limiting
    const rateLimitMs = config.disputeRateLimitMs || 10000;
    const recentDisputes = await db.collection('moderationDisputes')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    if (!recentDisputes.empty) {
      const lastTime = recentDisputes.docs[0].data().createdAt?.toMillis?.() || 0;
      if (Date.now() - lastTime < rateLimitMs) {
        return {success: false, error: 'too_fast'};
      }
    }

    try {
      // Get the original moderation result
      const msgRef = db.collection('matches').doc(matchId).collection('messages').doc(messageId);
      const msgDoc = await msgRef.get();
      const msgData = msgDoc.exists ? msgDoc.data() : {};
      const modResult = msgData.moderationResult || {};

      await db.collection('moderationDisputes').add({
        userId,
        matchId,
        messageId,
        originalCategory: modResult.category || 'unknown',
        originalSeverity: modResult.severity || 'unknown',
        originalConfidence: modResult.confidence || 0,
        disputeType,
        explanation: (explanation || '').substring(0, 300),
        messageText: (msgData.message || '').substring(0, 200),
        language: msgData.deviceLanguage || 'unknown',
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Check if this pattern has multiple disputes
      const minForPattern = config.qualityAnalysis?.minDisputesForPattern || 3;
      if (modResult.category) {
        const similarDisputes = await db.collection('moderationDisputes')
          .where('originalCategory', '==', modResult.category)
          .where('disputeType', '==', disputeType)
          .where('status', '==', 'pending')
          .limit(minForPattern + 1)
          .get();
        if (similarDisputes.size >= minForPattern) {
          logger.warn(`[disputeModeration] Pattern alert: ${similarDisputes.size} disputes for ${modResult.category}/${disputeType}`);
        }
      }

      logger.info(`[disputeModeration] ${userId.substring(0, 8)}: ${disputeType} on ${messageId} (was: ${modResult.category}/${modResult.severity})`);
      return {success: true};
    } catch (err) {
      logger.error(`[disputeModeration] Error: ${err.message}`);
      return {success: false, error: err.message};
    }
  },
);

/**
 * Scheduled: Daily moderation quality analysis (2:30 AM).
 */
exports.analyzeModerationQuality = onSchedule(
  {schedule: 'every day 02:30', region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async () => {
    const db = admin.firestore();
    const yesterday = new Date(Date.now() - 86400000);
    const yesterdayStr = yesterday.toISOString().substring(0, 10);
    const startMs = new Date(yesterday).setHours(0, 0, 0, 0);
    const endMs = new Date(yesterday).setHours(23, 59, 59, 999);

    try {
      // Count flagged messages from yesterday
      const flagged = await db.collection('moderatedMessages')
        .orderBy('timestamp', 'desc')
        .limit(500)
        .get();

      const categoryCounts = {};
      let totalFlagged = 0;

      for (const doc of flagged.docs) {
        const data = doc.data();
        const ts = data.timestamp?.toMillis?.() || 0;
        if (ts < startMs || ts > endMs) continue;
        totalFlagged++;
        const cat = data.category || 'unknown';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      }

      // Count disputes from yesterday
      const disputes = await db.collection('moderationDisputes')
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get();

      const categoryDisputes = {};
      let totalDisputes = 0;

      for (const doc of disputes.docs) {
        const data = doc.data();
        const ts = data.createdAt?.toMillis?.() || 0;
        if (ts < startMs || ts > endMs) continue;
        totalDisputes++;
        const cat = data.originalCategory || 'unknown';
        categoryDisputes[cat] = (categoryDisputes[cat] || 0) + 1;
      }

      const falsePositiveRate = totalFlagged > 0 ? Math.round((totalDisputes / totalFlagged) * 100) : 0;

      await db.collection('moderationInsights').doc('daily').collection(yesterdayStr).doc('summary').set({
        date: yesterdayStr,
        totalFlagged,
        totalDisputes,
        falsePositiveRate,
        categoryCounts,
        categoryDisputes,
        analyzedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const config = await getModerationConfig();
      const threshold = config.qualityAnalysis?.falsePositiveWarningThreshold || 20;
      if (falsePositiveRate > threshold) {
        logger.warn(`[analyzeModerationQuality] HIGH false positive rate: ${falsePositiveRate}% (${totalDisputes}/${totalFlagged})`);
      } else if (totalFlagged > 0) {
        logger.info(`[analyzeModerationQuality] FP rate: ${falsePositiveRate}% (${totalDisputes}/${totalFlagged})`);
      } else {
        logger.info('[analyzeModerationQuality] No flagged messages yesterday');
      }
    } catch (err) {
      logger.error(`[analyzeModerationQuality] Error: ${err.message}`);
    }
  },
);

/**
 * Scheduled: Weekly moderation RAG auto-update (Sunday 3:30 AM).
 */
exports.updateModerationKnowledge = onSchedule(
  {schedule: 'every sunday 03:30', region: 'us-central1', memory: '1GiB', timeoutSeconds: 300, secrets: [geminiApiKey]},
  async () => {
    const db = admin.firestore();
    const config = await getModerationConfig();
    if (!config.ragAutoUpdate?.enabled) {
      logger.info('[updateModerationKnowledge] Disabled via config');
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.warn('[updateModerationKnowledge] Missing GEMINI_API_KEY');
      return;
    }

    try {
      // 1. Read accepted disputes from last 7 days (confirmed false positives)
      const weekAgo = new Date(Date.now() - 7 * 86400000);
      const disputes = await db.collection('moderationDisputes')
        .where('status', 'in', ['accepted', 'pending'])
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

      const falsePositives = [];
      const missedThreats = [];

      for (const doc of disputes.docs) {
        const data = doc.data();
        const ts = data.createdAt?.toMillis?.() || 0;
        if (ts < weekAgo.getTime()) continue;
        if (data.disputeType === 'false_positive' || data.disputeType === 'too_harsh') {
          falsePositives.push({
            message: data.messageText || '',
            category: data.originalCategory || '',
            explanation: data.explanation || '',
            language: data.language || 'en',
          });
        } else if (data.disputeType === 'missed_threat') {
          missedThreats.push({
            message: data.messageText || '',
            explanation: data.explanation || '',
            language: data.language || 'en',
          });
        }
      }

      const minDisputes = config.ragAutoUpdate?.minAcceptedDisputes || 3;
      if (falsePositives.length < minDisputes && missedThreats.length < minDisputes) {
        logger.info(`[updateModerationKnowledge] Not enough disputes (FP: ${falsePositives.length}, MT: ${missedThreats.length}) — skipping`);
        return;
      }

      // 2. Read user reports (confirmed threats that users flagged manually)
      const recentReports = await db.collection('reports')
        .where('autoGenerated', '==', false)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();

      const userReportedPatterns = [];
      for (const doc of recentReports.docs) {
        const data = doc.data();
        const ts = data.createdAt?.toMillis?.() || 0;
        if (ts < weekAgo.getTime()) continue;
        userReportedPatterns.push({
          reason: data.reason || '',
          category: data.category || 'unknown',
        });
      }

      // 3. Cross-learning: read coach insights to understand normal communication patterns
      const coachContext = [];
      try {
        const coachUpdates = await db.collection('coachInsights').doc('ragUpdates').get();
        if (coachUpdates.exists) {
          const cd = coachUpdates.data();
          if (cd.weakestTopics?.length > 0) coachContext.push(`Coach weak topics: ${cd.weakestTopics.join(', ')}`);
          if (cd.satisfactionRateAtUpdate) coachContext.push(`Coach satisfaction: ${cd.satisfactionRateAtUpdate}%`);
        }
        // Read what topics users discuss most (to calibrate what's "normal")
        const recentCoachMsgs = await db.collectionGroup('messages')
          .orderBy('timestamp', 'desc')
          .limit(30)
          .get();
        const topicCounts = {};
        for (const m of recentCoachMsgs.docs) {
          const topic = m.data().topic;
          if (topic) topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        }
        const topTopics = Object.entries(topicCounts).sort(([, a], [, b]) => b - a).slice(0, 5);
        if (topTopics.length > 0) coachContext.push(`Most discussed coach topics: ${topTopics.map(([t, c]) => `${t}(${c})`).join(', ')}`);
      } catch (cErr) {
        logger.warn(`[updateModerationKnowledge] Could not read coach context: ${cErr.message}`);
      }

      // 4. Generate new RAG chunks with Search Grounding for latest scam patterns
      const {GoogleGenerativeAI} = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);

      // Use Search Grounding to access latest online scam/fraud patterns
      const enableSearch = config.ragAutoUpdate?.enableSearchGrounding !== false;
      const modelConfig = {
        model: AI_MODEL_LITE,
        generationConfig: {maxOutputTokens: 4096, temperature: 0.3, responseMimeType: 'application/json'},
      };
      if (enableSearch) {
        modelConfig.tools = [{googleSearch: {}}];
        logger.info('[updateModerationKnowledge] Search Grounding enabled — accessing latest scam patterns');
      }
      const model = genAI.getGenerativeModel(modelConfig);

      let prompt = 'You are a content moderation knowledge base curator for a dating app.\n\n';

      // Include user-reported patterns
      if (userReportedPatterns.length > 0) {
        prompt += `REAL USER REPORTS from this week (confirmed threats users flagged):\n`;
        prompt += userReportedPatterns.slice(0, 10).map((r, i) =>
          `${i + 1}. Category: ${r.category} | Reason: "${r.reason}"`
        ).join('\n');
        prompt += '\n\nUse these real reports to identify EMERGING threat patterns.\n\n';
      }

      if (falsePositives.length > 0) {
        prompt += `These messages were INCORRECTLY flagged as violations (users disputed them):\n`;
        prompt += falsePositives.slice(0, 10).map((fp, i) =>
          `${i + 1}. [${fp.category}] "${fp.message}" — User said: "${fp.explanation}"`
        ).join('\n');
        prompt += '\n\n';
      }

      if (missedThreats.length > 0) {
        prompt += `These messages were MISSED by moderation (users reported them as threats):\n`;
        prompt += missedThreats.slice(0, 10).map((mt, i) =>
          `${i + 1}. "${mt.message}" — User said: "${mt.explanation}"`
        ).join('\n');
        prompt += '\n\n';
      }

      if (coachContext.length > 0) {
        prompt += `COACH CROSS-LEARNING (understand what normal conversations look like):
${coachContext.join('\n')}
These topics are NORMAL in dating — do NOT flag them as violations.\n\n`;
      }

      prompt += `Based on all the above data (disputes, user reports, coach context, and your knowledge of current online dating scam trends), generate 3-7 new moderation knowledge chunks.

Focus on:
1. REDUCE FALSE POSITIVES — rules that prevent flagging normal dating conversation
2. CATCH NEW THREATS — emerging scam patterns, crypto fraud, AI-generated catfish, pig butchering
3. CULTURAL CONTEXT — dating norms that vary by region/language that cause false flags
4. EVASION TACTICS — new ways bad actors bypass moderation (Unicode tricks, code-switching, homoglyphs)

Search the internet for the latest dating app scam reports and fraud patterns from 2025-2026.

Return JSON:
{
  "chunks": [
    {
      "category": "context_guidelines|evasion_tactics|classification_guide|false_positive_prevention|scam_patterns|cultural_context",
      "language": "en",
      "title": "short title",
      "content": "detailed moderation rule (100-300 words)"
    }
  ]
}`;

      const result = await model.generateContent(prompt);
      const parsed = parseGeminiJsonResponse(safeResponseText(result));

      if (!parsed || !parsed.chunks || parsed.chunks.length === 0) {
        logger.warn('[updateModerationKnowledge] Gemini returned no chunks');
        return;
      }

      // 3. Embed and store
      const maxChunks = config.ragAutoUpdate?.maxNewChunksPerWeek || 5;
      const chunks = parsed.chunks.slice(0, maxChunks);
      let added = 0;

      for (const chunk of chunks) {
        try {
          const embModel = genAI.getGenerativeModel({model: 'gemini-embedding-001'});
          const embResult = await embModel.embedContent({
            content: {parts: [{text: chunk.content}]},
            taskType: 'RETRIEVAL_DOCUMENT',
          });

          await db.collection('moderationKnowledge').doc(`auto_mod_${Date.now()}_${added}`).set({
            category: chunk.category || 'context_guidelines',
            language: chunk.language || 'en',
            title: chunk.title || '',
            content: chunk.content,
            embedding: embResult.embedding.values,
            autoGenerated: true,
            generatedAt: admin.firestore.FieldValue.serverTimestamp(),
            sourceFalsePositives: falsePositives.length,
            sourceMissedThreats: missedThreats.length,
          });
          added++;
        } catch (embErr) {
          logger.warn(`[updateModerationKnowledge] Embed error: ${embErr.message}`);
        }
      }

      await db.collection('moderationInsights').doc('ragUpdates').set({
        lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
        chunksAdded: added,
        totalFalsePositiveDisputes: falsePositives.length,
        totalMissedThreatDisputes: missedThreats.length,
        totalUserReports: userReportedPatterns.length,
        searchGroundingUsed: enableSearch,
        crossLearningFromCoach: coachContext.length > 0,
      }, {merge: true});

      logger.info(`[updateModerationKnowledge] Added ${added} chunks (FP: ${falsePositives.length}, MT: ${missedThreats.length}, reports: ${userReportedPatterns.length}, search: ${enableSearch}, coachCtx: ${coachContext.length})`);
    } catch (err) {
      logger.error(`[updateModerationKnowledge] Error: ${err.message}`);
    }
  },
);

/**
 * Scheduled: Daily auto-resolution of moderation disputes.
 * Auto-accepts disputes when clear pattern exists (≥3 same category + high FP rate).
 * Generates immediate RAG chunk for the resolved pattern.
 */
exports.resolveDisputesDaily = onSchedule(
  {schedule: 'every day 03:00', region: 'us-central1', memory: '512MiB', timeoutSeconds: 120, secrets: [geminiApiKey]},
  async () => {
    const db = admin.firestore();
    const config = await getModerationConfig();
    const autoResolve = config.autoDisputeResolution || {};
    if (!autoResolve.enabled) {
      logger.info('[resolveDisputesDaily] Disabled via config');
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const minDisputes = autoResolve.minDisputes || 3;
    const maxFpRate = autoResolve.maxFpRate || 0.25;

    try {
      // 1. Read all pending disputes
      const pending = await db.collection('moderationDisputes')
        .where('status', '==', 'pending')
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();

      if (pending.empty) {
        logger.info('[resolveDisputesDaily] No pending disputes');
        return;
      }

      // 2. Group by category + disputeType
      const groups = {};
      for (const doc of pending.docs) {
        const d = doc.data();
        const key = `${d.originalCategory}_${d.disputeType}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push({id: doc.id, ref: doc.ref, data: d});
      }

      let totalResolved = 0;
      let chunksGenerated = 0;

      // 3. Auto-resolve groups that meet threshold
      for (const [key, disputes] of Object.entries(groups)) {
        if (disputes.length < minDisputes) continue;

        const category = disputes[0].data.originalCategory;
        const disputeType = disputes[0].data.disputeType;

        // Check category FP rate from yesterday's insights
        const yesterday = new Date(Date.now() - 86400000).toISOString().substring(0, 10);
        let categoryFpRate = 0;
        try {
          const insight = await db.collection('moderationInsights').doc('daily').collection(yesterday).doc('summary').get();
          if (insight.exists) {
            const cd = insight.data().categoryDisputes || {};
            const cc = insight.data().categoryCounts || {};
            categoryFpRate = cc[category] > 0 ? (cd[category] || 0) / cc[category] : 0;
          }
        } catch (fpErr) { logger.warn(`[resolveDisputesDaily] FP rate lookup error: ${fpErr.message}`); }

        if (disputeType === 'false_positive' && categoryFpRate < maxFpRate && disputes.length < minDisputes * 2) {
          continue; // Not enough evidence
        }

        // Auto-accept all disputes in this group
        const batch = db.batch();
        for (const d of disputes) {
          batch.update(d.ref, {status: 'auto_accepted', resolvedAt: admin.firestore.FieldValue.serverTimestamp()});
        }
        await batch.commit();
        totalResolved += disputes.length;

        // Log audit trail
        await db.collection('moderationDisputeReviews').add({
          category, disputeType,
          resolution: 'auto_accepted',
          disputeCount: disputes.length,
          categoryFpRate,
          resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Generate RAG chunk for this pattern (if API key available)
        if (apiKey && autoResolve.autoUpdateRag !== false) {
          try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
              model: AI_MODEL_LITE,
              generationConfig: {maxOutputTokens: 512, temperature: 0.2},
            });
            const examples = disputes.slice(0, 5).map((d) => `"${d.data.messageText}" (${d.data.explanation || 'no explanation'})`).join('\n');
            const chunkPrompt = `Create a concise moderation rule (100-200 words) for a dating app.

These ${disputes.length} messages were ${disputeType === 'false_positive' ? 'INCORRECTLY flagged as ' + category : 'MISSED by moderation'}:
${examples}

Write a clear rule that ${disputeType === 'false_positive' ? 'prevents this type of false positive' : 'catches this type of violation'}.`;

            const chunkResult = await model.generateContent(chunkPrompt);
            const chunkText = safeResponseText(chunkResult);

            const embModel = genAI.getGenerativeModel({model: 'gemini-embedding-001'});
            const embResult = await embModel.embedContent({content: {parts: [{text: chunkText}]}, taskType: 'RETRIEVAL_DOCUMENT'});

            await db.collection('moderationKnowledge').doc(`auto_resolve_${Date.now()}`).set({
              category: disputeType === 'false_positive' ? 'false_positive_prevention' : 'classification_guide',
              language: 'en', title: `Auto-resolved: ${category} ${disputeType}`,
              content: chunkText, embedding: embResult.embedding.values,
              autoGenerated: true, generatedAt: admin.firestore.FieldValue.serverTimestamp(),
              sourceDisputeCount: disputes.length,
            });
            chunksGenerated++;
          } catch (ragErr) {
            logger.warn(`[resolveDisputesDaily] RAG chunk generation failed: ${ragErr.message}`);
          }
        }

        logger.info(`[resolveDisputesDaily] Auto-resolved ${disputes.length} ${disputeType} disputes for ${category} (FP rate: ${(categoryFpRate * 100).toFixed(1)}%)`);
      }

      logger.info(`[resolveDisputesDaily] Total: ${totalResolved} resolved, ${chunksGenerated} RAG chunks generated`);
    } catch (err) {
      logger.error(`[resolveDisputesDaily] Error: ${err.message}`);
    }
  },
);

/**
 * Scheduled: Daily micro-update for moderation RAG.
 * Lightweight version of weekly update — processes yesterday's disputes only.
 */
exports.dailyModerationMicroUpdate = onSchedule(
  {schedule: 'every day 04:30', region: 'us-central1', memory: '512MiB', timeoutSeconds: 120, secrets: [geminiApiKey]},
  async () => {
    const db = admin.firestore();
    const config = await getModerationConfig();
    const microConfig = config.dailyMicroUpdate || {};
    if (!microConfig.enabled) {
      logger.info('[dailyModerationMicroUpdate] Disabled via config');
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return;

    try {
      const yesterday = new Date(Date.now() - 86400000);
      const startMs = new Date(yesterday).setHours(0, 0, 0, 0);
      const endMs = new Date(yesterday).setHours(23, 59, 59, 999);

      // Read yesterday's disputes only
      const disputes = await db.collection('moderationDisputes')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

      const yesterdayDisputes = disputes.docs.filter((d) => {
        const ts = d.data().createdAt?.toMillis?.() || 0;
        return ts >= startMs && ts <= endMs;
      });

      const minDisputes = microConfig.minDisputes || 3;
      if (yesterdayDisputes.length < minDisputes) {
        logger.info(`[dailyModerationMicroUpdate] Only ${yesterdayDisputes.length} disputes yesterday (need ${minDisputes})`);
        return;
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: AI_MODEL_LITE,
        generationConfig: {maxOutputTokens: 1024, temperature: 0.3},
      });

      const disputeSummary = yesterdayDisputes.slice(0, 10).map((d) => {
        const data = d.data();
        return `[${data.disputeType}] Category: ${data.originalCategory} | "${data.messageText}" | Explanation: "${data.explanation || 'none'}"`;
      }).join('\n');

      const prompt = `Based on yesterday's moderation disputes in a dating app, generate 1-2 targeted moderation rules.

DISPUTES:
${disputeSummary}

Generate concise rules (100-200 words each) as plain text. Focus on reducing false positives for normal dating conversation.`;

      const result = await model.generateContent(prompt);
      const text = safeResponseText(result);

      // Simple: store the entire output as one chunk
      const embModel = genAI.getGenerativeModel({model: 'gemini-embedding-001'});
      const embResult = await embModel.embedContent({content: {parts: [{text}]}, taskType: 'RETRIEVAL_DOCUMENT'});

      await db.collection('moderationKnowledge').doc(`daily_micro_${Date.now()}`).set({
        category: 'false_positive_prevention',
        language: 'en',
        title: `Daily micro-update ${yesterday.toISOString().substring(0, 10)}`,
        content: text,
        embedding: embResult.embedding.values,
        autoGenerated: true,
        generatedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'daily_micro',
      });

      logger.info(`[dailyModerationMicroUpdate] Added 1 chunk from ${yesterdayDisputes.length} disputes`);
    } catch (err) {
      logger.error(`[dailyModerationMicroUpdate] Error: ${err.message}`);
    }
  },
);

/**
 * Trigger: Validar y auto-reparar geohash cuando se actualiza la ubicación del usuario.
 * Si el usuario tiene lat/lng pero no campo "g" (geohash), lo calcula y escribe automáticamente.
 * Algoritmo encodeGeohash() idéntico al de iOS y Android.
 */
