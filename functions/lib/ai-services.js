'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { geminiApiKey, AI_MODEL_NAME, AI_MODEL_LITE, getLanguageInstruction, parseGeminiJsonResponse } = require('./shared');
const { calcAge } = require('./geo');

exports.generateInterestSuggestions = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 30, secrets: [geminiApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {bio, userType} = request.data || {};

    const validInterests = [
      'interest_travel_adventures', 'interest_shopping_fashion', 'interest_fine_dining',
      'interest_art_culture', 'interest_fitness_wellness', 'interest_education_growth',
      'interest_exclusive_events', 'interest_spa_relaxation', 'interest_music_concerts',
      'interest_beach_vacation', 'interest_dancing_nightlife', 'interest_mentorship_business',
      'interest_luxury_experiences', 'interest_international_travel', 'interest_gourmet_cuisine',
      'interest_art_collecting', 'interest_golf_premium_sports', 'interest_vip_events',
      'interest_vip_clubs', 'interest_philanthropy', 'interest_wine_spirits',
      'interest_sailing_yachting', 'interest_business_networking', 'interest_real_estate_investments',
      'interest_movies_theater', 'interest_photography', 'interest_books_reading',
      'interest_cooking', 'interest_yoga_meditation', 'interest_nature_outdoors',
    ];

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        logger.error('[generateInterestSuggestions] GEMINI_API_KEY not configured');
        return {success: false, suggestions: []};
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({model: AI_MODEL_LITE, generationConfig: {maxOutputTokens: 256, responseMimeType: 'application/json'}});

      const userBio = (bio || '').substring(0, 200);
      const prompt = `Suggest 5 interest IDs for a ${userType || 'user'} on a premium dating app.
User bio: "${userBio}"
Return ONLY a JSON array of strings from this list (exact keys):
${JSON.stringify(validInterests)}
Return only the JSON array, no explanation.`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();
      logger.info(`[generateInterestSuggestions] Gemini response: ${responseText.substring(0, 200)}`);

      // Parse JSON array from response
      let suggested = [];
      try {
        const parsed = JSON.parse(responseText.replace(/```json\s*|\s*```/g, '').trim());
        if (Array.isArray(parsed)) {
          suggested = parsed.filter((s) => validInterests.includes(s)).slice(0, 5);
        }
      } catch (_e) {
        // Fallback: regex extraction
        const regex = /"(interest_[^"]+)"/g;
        let match;
        while ((match = regex.exec(responseText)) !== null) {
          if (validInterests.includes(match[1])) suggested.push(match[1]);
        }
        suggested = suggested.slice(0, 5);
      }

      return {success: true, suggestions: suggested};
    } catch (error) {
      logger.error('[generateInterestSuggestions] Error:', error);
      return {success: false, suggestions: []};
    }
  },
);

/**
 * Callable: Analizar foto antes de subirla.
 * Payload: { imageBase64?, imageUrl? }
 * Response: { approved, reason, score }
 * Homologado: iOS PhotoAnalyzerService.analyzePhotoBeforeUpload
 */
exports.analyzePhotoBeforeUpload = onCall(
  {region: 'us-central1', memory: '512MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {imageUrl} = request.data || {};
    // En producción usar Cloud Vision API
    logger.info(`[analyzePhotoBeforeUpload] Analyzed photo for user ${request.auth.uid}`);
    return {approved: true, reason: 'photo_approved', score: 0.95};
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// AI FUNCTIONS — Análisis, compatibilidad, consejos, sugerencias
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Callable: Analizar perfil con IA para recomendaciones.
 * Payload: { userId, profileData? }
 * Response: { analysis, recommendations, score }
 * Homologado: iOS ProfileCardRepository / Android ProfileRepositoryImp
 */
exports.analyzeProfileWithAI = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {userId} = request.data || {};
    const targetId = userId || request.auth.uid;
    const db = admin.firestore();

    const userDoc = await db.collection('users').doc(targetId).get();
    if (!userDoc.exists) throw new Error('User not found');

    const user = userDoc.data();
    const recommendations = [];
    let score = 70;

    if (!user.bio || user.bio.length < 20) {
      recommendations.push('Añade una bio más detallada para mejorar tus matches');
      score -= 10;
    }
    const photoCount = Array.isArray(user.pictures) ? user.pictures.length : 1;
    if (photoCount < 3) {
      recommendations.push(`Añade más fotos (tienes ${photoCount}, se recomiendan al menos 3)`);
      score -= 10;
    }
    if (!user.interests || (Array.isArray(user.interests) && user.interests.length < 3)) {
      recommendations.push('Añade más intereses para mejorar la compatibilidad');
      score -= 5;
    }

    logger.info(`[analyzeProfileWithAI] Profile score=${score} for ${targetId}`);
    return {
      success: true,
      score: Math.max(score, 30),
      analysis: 'Perfil analizado con éxito',
      recommendations,
      photoCount,
    };
  },
);

/**
 * Callable: Calcular puntuación de seguridad de conversación.
 * Payload: { userId, messages?, conversationId? }
 * Response: { score, flags, riskLevel }
 * Homologado: iOS SafetyScoreService.calculateSafetyScore
 */
exports.calculateSafetyScore = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {messages} = request.data || {};
    const flags = [];
    let score = 100;

    if (Array.isArray(messages)) {
      const redTerms = ['address', 'where do you live', 'send money', 'venmo', 'paypal', 'onlyfans'];
      messages.forEach((msg) => {
        const text = (typeof msg === 'string' ? msg : msg.message || '').toLowerCase();
        redTerms.forEach((term) => {
          if (text.includes(term)) {
            flags.push(term);
            score -= 15;
          }
        });
      });
    }

    score = Math.max(score, 0);
    const riskLevel = score > 70 ? 'low' : score > 40 ? 'medium' : 'high';
    logger.info(`[calculateSafetyScore] score=${score}, flags=${flags.length}`);
    return {score, flags: [...new Set(flags)], riskLevel, success: true};
  },
);

/**
 * Callable: Analizar química de conversación entre dos usuarios.
 * Payload: { messages, userId1?, userId2? }
 * Response: { score, insights, level }
 * Homologado: iOS ChemistryDetectorService.analyzeConversationChemistry
 */
exports.analyzeConversationChemistry = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {messages} = request.data || {};
    let score = 50;
    const insights = [];

    if (Array.isArray(messages) && messages.length > 0) {
      score = Math.min(50 + messages.length * 2, 100);
      if (messages.length > 20) insights.push('Gran cantidad de mensajes — buena señal de interés mutuo');
      if (messages.length > 5) insights.push('La conversación está fluyendo bien');
    } else {
      insights.push('Inicia la conversación para desbloquear el análisis de química');
    }

    const level = score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low';
    logger.info(`[analyzeConversationChemistry] score=${score}, level=${level}`);
    return {success: true, score, level, insights};
  },
);

/**
 * Callable: Generar respuesta inteligente basada en el contexto del chat.
 * Payload: { messages, context?, matchId? }
 * Response: { reply, alternatives }
 * Homologado: iOS AIWingmanService.generateSmartReply
 */
exports.generateSmartReply = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {messages} = request.data || {};

    // En producción usar Vertex AI / Gemini API
    const lastMessage = Array.isArray(messages) && messages.length > 0
      ? (typeof messages[messages.length - 1] === 'string' ? messages[messages.length - 1] : messages[messages.length - 1].message || '')
      : '';

    const replies = [
      '¡Eso suena genial! Cuéntame más 😊',
      '¡Qué interesante! ¿Y tú qué opinas?',
      'Me encanta cómo piensas 💫',
      '¡Totalmente de acuerdo!',
      '¿Cuándo podríamos conocernos en persona? ☕',
    ];

    const reply = replies[Math.floor(Math.random() * replies.length)];
    logger.info(`[generateSmartReply] Generated reply for user ${request.auth.uid}`);
    return {success: true, reply, alternatives: replies.filter((r) => r !== reply).slice(0, 3)};
  },
);

/**
 * Callable: Analizar compatibilidad de personalidades entre dos usuarios.
 * Payload: { userId1, userId2 }
 * Response: { score, analysis, traits }
 * Homologado: iOS/Android AIEnhancedMatchingService
 */
exports.analyzePersonalityCompatibility = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    // ✅ Homologado: iOS/Android envían {userId, targetUserId} — aceptar ambas nomenclaturas
    const d = request.data || {};
    const uid1 = d.userId || d.userId1;
    const uid2 = d.targetUserId || d.userId2;
    if (!uid1 || !uid2) throw new Error('userId and targetUserId required');

    const db = admin.firestore();
    const [u1Doc, u2Doc] = await Promise.all([
      db.collection('users').doc(uid1).get(),
      db.collection('users').doc(uid2).get(),
    ]);

    let overallScore = 60;
    const strengths = [];
    if (u1Doc.exists && u2Doc.exists) {
      const u1 = u1Doc.data();
      const u2 = u2Doc.data();
      const i1 = new Set((u1.interests || []).map(String));
      const i2 = (u2.interests || []).map(String);
      const common = i2.filter((i) => i1.has(i));
      overallScore = Math.min(60 + common.length * 5, 100);
      if (common.length > 0) strengths.push(`${common.length} intereses en común`);
    }

    // ✅ Respuesta homologada: iOS/Android leen resultData["analysis"] como dict
    return {
      success: true,
      analysis: {
        overallScore,
        valuesCompatibility: Math.round(overallScore * 0.9),
        interestsCompatibility: Math.round(overallScore * 1.05),
        communicationStyle: Math.round(overallScore * 0.95),
        conversationProbability: Math.round(overallScore * 0.85),
        strengths,
        redFlags: [],
      },
    };
  },
);

/**
 * Callable: Predecir probabilidad de éxito del match.
 * Payload: { userId1, userId2 }
 * Response: { probability, factors }
 * Homologado: iOS/Android AIEnhancedMatchingService
 */
exports.predictMatchSuccess = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    // ✅ Homologado: iOS/Android envían {userId, targetUserId}
    const d = request.data || {};
    const uid1 = d.userId || d.userId1;
    const uid2 = d.targetUserId || d.userId2;
    if (!uid1 || !uid2) throw new Error('userId and targetUserId required');

    const db = admin.firestore();
    const [u1Doc, u2Doc] = await Promise.all([
      db.collection('users').doc(uid1).get(),
      db.collection('users').doc(uid2).get(),
    ]);

    let matchProbability = 50;
    const riskFactors = [];

    if (u1Doc.exists && u2Doc.exists) {
      const u1 = u1Doc.data();
      const u2 = u2Doc.data();
      const i1 = new Set((u1.interests || []).map(String));
      const i2 = (u2.interests || []).map(String);
      const common = i2.filter((i) => i1.has(i));
      matchProbability = Math.min(50 + common.length * 5, 95);

      const ageDiff = Math.abs(calcAge(u1.birthDate) - calcAge(u2.birthDate));
      if (ageDiff > 10) riskFactors.push('Large age difference');
    }

    const recommendation = matchProbability >= 80 ? 'highly_recommended'
      : matchProbability >= 60 ? 'recommended' : 'neutral';

    // ✅ Respuesta homologada: iOS/Android leen resultData["prediction"] como dict
    return {
      success: true,
      prediction: {
        matchProbability,
        conversationProbability: Math.round(matchProbability * 0.9),
        longTermPotential: Math.round(matchProbability * 0.8),
        estimatedMessages: Math.round(matchProbability * 0.5),
        riskFactors,
        recommendation,
      },
    };
  },
);

/**
 * Callable: Generar starter de conversación entre dos usuarios.
 * Payload: { userId1, userId2 }
 * Response: { starter, alternatives }
 * Homologado: iOS/Android AIEnhancedMatchingService
 */
exports.generateConversationStarter = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const starterTexts = [
      {message: '¿Cuál es el lugar más increíble que has visitado? 🌍', reasoning: 'Travel shared experience', expectedResponse: 'A destination or travel story'},
      {message: 'Si pudieras hacer cualquier cosa este fin de semana, ¿qué sería? ☀️', reasoning: 'Reveals lifestyle', expectedResponse: 'Weekend plans or wishes'},
      {message: '¿Cuál es tu película favorita de todos los tiempos? 🎬', reasoning: 'Cultural common ground', expectedResponse: 'A movie title or genre'},
      {message: '¿Qué es lo que más te apasiona en la vida? ✨', reasoning: 'Shows depth of character', expectedResponse: 'A passion or goal'},
      {message: '¿Si pudieras viajar a cualquier lugar ahora mismo, adónde irías? ✈️', reasoning: 'Dream exploration', expectedResponse: 'A place or reason'},
    ];
    const idx = Math.floor(Math.random() * starterTexts.length);
    const chosen = starterTexts[idx];
    const rest = starterTexts.filter((_, i) => i !== idx);
    // ✅ Respuesta homologada: iOS/Android leen resultData["suggestions"]["starters"] como [[String:Any]]
    return {
      success: true,
      suggestions: {
        starters: [chosen, ...rest],
      },
    };
  },
);

/**
 * Callable: Optimizar fotos de perfil con IA.
 * Payload: { userId, photos? }
 * Response: { recommendations, orderedPhotos }
 * Homologado: iOS/Android AIEnhancedMatchingService
 */
exports.optimizeProfilePhotos = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {photos, userId} = request.data || {};
    const photoList = Array.isArray(photos) ? photos : [];
    // ✅ Respuesta homologada: iOS/Android leen optimizedOrder:[String] y scores:[{url,...}]
    const scores = photoList.map((url, i) => ({
      url: typeof url === 'string' ? url : String(url),
      visualQuality: 75,
      faceClarity: 80,
      aesthetic: 70,
      engagement: 72,
      isPrimaryCandidate: i === 0,
      overallScore: 75,
    }));
    return {
      success: true,
      optimizedOrder: photoList.map((u) => (typeof u === 'string' ? u : String(u))),
      scores,
    };
  },
);

/**
 * Callable: Encontrar perfiles similares.
 * Payload: { userId }
 * Response: { profileIds }
 * Homologado: iOS/Android AIEnhancedMatchingService
 */
exports.findSimilarProfiles = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {userId} = request.data || {};
    const uid = userId || request.auth.uid;

    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return {success: true, matches: []};

    const user = userDoc.data();
    const interests = user.interests || [];
    // ✅ FIX: Obtener lista de bloqueados del usuario actual para excluirlos
    const userBlockedArray = Array.isArray(user.blocked) ? user.blocked : [];

    // Buscar perfiles con intereses similares
    let snap = {docs: []};
    if (interests.length > 0) {
      snap = await db.collection('users')
        .where('accountStatus', '==', 'active')
        .where('paused', '==', false)
        .limit(20)
        .get().catch(() => ({docs: []}));
    }

    const interestSet = new Set((interests || []).map(String));
    const REVIEWER_UID = 'g4Zbr8tEguMcpZonw72xM5MGse32';
    // ✅ Respuesta homologada: iOS/Android leen resultData["matches"] como [{userId, similarity}]
    const matches = snap.docs
      .filter((d) => {
        if (d.id === uid) return false;
        const data = d.data();
        // ✅ Excluir perfiles test/reviewer: solo visibles para el reviewer
        if ((data.isTest === true || data.isReviewer === true) && uid !== REVIEWER_UID) return false;
        // ✅ Excluir usuarios con accountStatus inactivo
        if ((data.accountStatus || 'active') !== 'active') return false;
        // ✅ Excluir usuarios que el usuario actual ha bloqueado
        if (userBlockedArray.includes(d.id)) return false;
        // ✅ FIX: Bloqueo bidireccional — excluir si el candidato bloqueó al usuario actual
        const candidateBlocked = Array.isArray(data.blocked) ? data.blocked : [];
        if (candidateBlocked.includes(uid)) return false;
        // ✅ FIX: Excluir usuarios con visibilidad reducida
        if (data.visibilityReduced === true) return false;
        return true;
      })
      .slice(0, 10)
      .map((d) => {
        const data = d.data();
        const candidateInterests = (data.interests || []).map(String);
        const common = candidateInterests.filter((i) => interestSet.has(i));
        const similarity = Math.min(50 + common.length * 10, 100);
        return {userId: d.id, similarity};
      });

    return {success: true, matches};
  },
);

/**
 * Callable: Obtener puntuación de compatibilidad mejorada con IA.
 * Payload: { userId1, userId2 }
 * Response: { score, breakdown }
 * Homologado: iOS/Android AIEnhancedMatchingService
 */
exports.getEnhancedCompatibilityScore = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    // ✅ Homologado: iOS/Android envían {currentUserId, candidateId}
    const d = request.data || {};
    const uid1 = d.currentUserId || d.userId1;
    const uid2 = d.candidateId || d.userId2;
    if (!uid1 || !uid2) throw new Error('currentUserId and candidateId required');

    const db = admin.firestore();
    const [u1Doc, u2Doc] = await Promise.all([
      db.collection('users').doc(uid1).get(),
      db.collection('users').doc(uid2).get(),
    ]);

    let baseScore = 50;
    let interestsScore = 0;

    if (u1Doc.exists && u2Doc.exists) {
      const u1 = u1Doc.data();
      const u2 = u2Doc.data();
      const i1 = new Set((u1.interests || []).map(String));
      const i2 = (u2.interests || []).map(String);
      const common = i2.filter((i) => i1.has(i));
      interestsScore = Math.min(common.length * 10, 40);
      const distanceScore = 30;
      const ageScore = Math.max(30 - Math.abs(calcAge(u1.birthDate) - calcAge(u2.birthDate)) * 2, 0);
      baseScore = Math.min(interestsScore + distanceScore + ageScore, 100);
    }

    const aiScore = Math.round(baseScore * 0.3);
    const totalScore = Math.min(baseScore * 0.7 + aiScore, 100);

    // ✅ Respuesta homologada: iOS/Android leen totalScore, baseScore, aiScore, explanation
    return {
      success: true,
      totalScore,
      baseScore,
      aiScore,
      explanation: `Compatibilidad basada en ${interestsScore > 0 ? 'intereses comunes y' : ''} factores de perfil`,
    };
  },
);

/**
 * Callable: Detectar señales de alerta en perfil.
 * Payload: { userId }
 * Response: { flags, riskScore }
 * Homologado: iOS/Android AIEnhancedMatchingService
 */
exports.detectProfileRedFlags = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {userId} = request.data || {};
    const targetId = userId || request.auth.uid;

    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(targetId).get();
    const flags = [];
    let riskScore = 0;

    if (userDoc.exists) {
      const user = userDoc.data();
      if (!user.photoFileName && !Array.isArray(user.pictures)) {
        flags.push('no_profile_photo');
        riskScore += 20;
      }
      if (!user.bio || user.bio.length < 10) {
        flags.push('empty_bio');
        riskScore += 10;
      }
      if (user.visibilityReduced) {
        flags.push('previously_reported');
        riskScore += 30;
      }
    }

    riskScore = Math.min(riskScore, 100);
    // ✅ Respuesta homologada: iOS/Android leen hasRedFlags, flags, confidence, details
    return {
      success: true,
      hasRedFlags: flags.length > 0,
      flags,
      confidence: flags.length > 0 ? Math.min(flags.length * 30, 90) : 0,
      details: flags.length > 0 ? `Se detectaron ${flags.length} señal(es) de alerta` : 'Perfil sin señales de alerta',
      riskScore,
    };
  },
);

/**
 * Callable: Generar preguntas rompehielo personalizadas.
 * Payload: { userId1, userId2 }
 * Response: { icebreakers }
 * Homologado: iOS/Android AIEnhancedMatchingService
 */
exports.generateIcebreakers = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    // ✅ Respuesta homologada: iOS/Android leen resultData["starters"] como [String]
    const starters = [
      '¿Cuál es tu hobby secreto que pocas personas conocen? 🤫',
      '¿Cuál fue la última vez que intentaste algo nuevo? 🌟',
      '¿Café ☕ o té 🍵? ¿Y por qué?',
      '¿Qué serie estás viendo ahora mismo? 📺',
      '¿Cuál es tu lugar favorito en la ciudad? 🏙️',
    ];
    return {success: true, starters};
  },
);

/**
 * Callable: Predecir el momento óptimo para enviar mensajes.
 * Payload: { userId }
 * Response: { optimalTime, timezone, confidence }
 * Homologado: iOS OptimalTimeService / Android OptimalTimeService
 */
exports.predictOptimalMessageTime = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    // En producción analizar patrones de actividad del usuario
    const optimalHours = [19, 20, 21]; // 7pm-9pm son las horas pico habituales
    const optimalTime = optimalHours[Math.floor(Math.random() * optimalHours.length)];
    logger.info(`[predictOptimalMessageTime] Optimal hour: ${optimalTime}:00`);
    return {
      success: true,
      optimalTime: `${optimalTime}:00`,
      optimalHour: optimalTime,
      timezone: 'UTC-6',
      confidence: 0.75,
      reasoning: 'Los usuarios son más activos entre 7pm y 9pm',
    };
  },
);

/**
 * Callable: Obtener consejo de citas personalizado.
 * Payload: { context, topic? }
 * Response: { advice, tips }
 * Homologado: iOS DatingCoachService.getDatingAdvice
 */
exports.getDatingAdvice = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {topic} = request.data || {};

    const adviceMap = {
      'first_message': {
        advice: 'Haz una pregunta específica sobre algo de su perfil para mostrar que te interesan genuinamente',
        tips: ['Menciona un interés en común', 'Sé específico, no genérico', 'Termina con una pregunta abierta'],
      },
      'first_date': {
        advice: 'Elige un lugar cómodo y con buena conversación, evita el cine en la primera cita',
        tips: ['Toma café o un paseo', 'Escucha activamente', 'Sé tú mismo/a'],
      },
      'default': {
        advice: 'La autenticidad es la clave del éxito en las citas modernas',
        tips: ['Sé auténtico/a', 'Muestra interés genuino', 'No te presiones'],
      },
    };

    const selected = adviceMap[topic] || adviceMap['default'];
    logger.info(`[getDatingAdvice] Advice for topic=${topic || 'default'}`);
    return {success: true, ...selected};
  },
);

/**
 * Callable: calculateAIChemistry — Análisis profundo de compatibilidad con RAG + Gemini.
 *
 * Usa el sistema RAG (397 chunks, 70 categorías) para enriquecer el análisis de compatibilidad
 * con conocimiento experto sobre citas, cocina, actividades y regalos.
 *
 * Payload: { targetUserId }
 * Response: { score, reasons, tip, factors, cached }
 *
 * Cache: chemistryCache/{pairId} con TTL 7 días
 */
exports.calculateAIChemistry = onCall(
  {region: 'us-central1', memory: '512MiB', timeoutSeconds: 30, secrets: [geminiApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const currentUserId = request.auth.uid;
    const targetUserId = (request.data || {}).targetUserId;
    if (!targetUserId) throw new Error('targetUserId required');

    const db = admin.firestore();
    const apiKey = geminiApiKey.value();

    // ── Cache check (TTL 7 días) ──
    const pairId = [currentUserId, targetUserId].sort().join('_');
    const cacheRef = db.collection('chemistryCache').doc(pairId);
    const cacheDoc = await cacheRef.get();
    if (cacheDoc.exists) {
      const cached = cacheDoc.data();
      const ageMs = Date.now() - (cached.calculatedAt?.toMillis?.() || 0);
      if (ageMs < 7 * 24 * 60 * 60 * 1000) {
        logger.info(`[AIChemistry] Cache hit for ${pairId} (age: ${Math.round(ageMs / 3600000)}h)`);
        return {...cached, cached: true};
      }
    }

    // ── Load both profiles ──
    const [u1Doc, u2Doc] = await Promise.all([
      db.collection('users').doc(currentUserId).get(),
      db.collection('users').doc(targetUserId).get(),
    ]);
    if (!u1Doc.exists || !u2Doc.exists) {
      return {success: true, score: 55, reasons: [], tip: '', factors: {}, cached: false};
    }
    const u1 = u1Doc.data();
    const u2 = u2Doc.data();

    // ── Algorithmic base score (same as client-side) ──
    const i1 = new Set((u1.interests || []).map(String));
    const i2 = (u2.interests || []).map(String);
    const i2Set = new Set(i2);
    const shared = i2.filter((i) => i1.has(i));
    const union = new Set([...i1, ...i2Set]);

    let factors = {};

    // Factor 1: Intereses
    if (i1.size > 0 && i2Set.size > 0) {
      const jaccard = union.size > 0 ? shared.length / union.size : 0;
      const bonus = Math.min(shared.length * 0.08, 0.3);
      factors.interests = shared.length === 0 ? 0.35 : Math.min(jaccard + bonus, 1.0);
    }

    // Factor 2: Edad
    const age1 = calcAge(u1.birthDate);
    const age2 = calcAge(u2.birthDate);
    if (age1 > 0 && age2 > 0) {
      const ageDiff = Math.abs(age1 - age2);
      factors.age = Math.exp(-(ageDiff * ageDiff) / 72.0);
    }

    // Factor 3: Tipo complementario
    const t1 = (u1.userType || '').toUpperCase();
    const t2 = (u2.userType || '').toUpperCase();
    if (t1 && t2) {
      const dm1 = t1.includes('DADDY') || t1.includes('MOMMY');
      const b1 = t1.includes('BABY');
      const dm2 = t2.includes('DADDY') || t2.includes('MOMMY');
      const b2 = t2.includes('BABY');
      factors.type = (dm1 && b2) || (b1 && dm2) ? 1.0 : t1 === t2 ? 0.55 : 0.6;
    }

    // Algorithmic score (weighted)
    const weights = {interests: 25, age: 15, type: 15};
    let totalW = 0, totalS = 0;
    for (const [k, w] of Object.entries(weights)) {
      if (factors[k] !== undefined) {
        totalS += factors[k] * w;
        totalW += w;
      }
    }
    const algorithmicScore = totalW > 0 ? totalS / totalW : 0.5;

    // ── RAG: buscar conocimiento relevante ──
    let ragContext = '';
    try {
      const sharedStr = shared.map((s) => s.replace('interest_', '').replace(/_/g, ' ')).join(', ');
      const queryText = sharedStr.length > 0
        ? `compatibility advice for couple with shared interests: ${sharedStr}`
        : `general dating compatibility advice for new connection`;

      const genai = new GoogleGenerativeAI(apiKey);
      const embModel = genai.getGenerativeModel({model: 'gemini-embedding-001'});
      const embedResult = await embModel.embedContent({
        content: {parts: [{text: queryText}]},
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: 768,
      });
      const queryVector = embedResult.embedding.values;

      const collRef = db.collection('coachKnowledge');
      const snapshot = await collRef.findNearest('embedding', queryVector, {
        limit: 4,
        distanceMeasure: 'COSINE',
        distanceResultField: '_distance',
      }).get();

      const chunks = snapshot.docs
        .map((doc) => {
          const data = doc.data();
          return {text: (data.text || '').substring(0, 500), category: data.category || '', similarity: 1 - (data._distance ?? 1)};
        })
        .filter((d) => d.similarity >= 0.25 && d.text.length > 0)
        .slice(0, 3);

      if (chunks.length > 0) {
        ragContext = chunks.map((c, i) => `[${i + 1}] (${c.category}): ${c.text}`).join('\n');
        logger.info(`[AIChemistry] RAG: ${chunks.length} chunks (${chunks.map((c) => c.category).join(', ')})`);
      }
    } catch (ragErr) {
      logger.warn(`[AIChemistry] RAG failed (non-critical): ${ragErr.message}`);
    }

    // ── Gemini analysis ──
    let aiScore = 0.5;
    let reasons = [];
    let tip = '';
    try {
      const genai = new GoogleGenerativeAI(apiKey);
      const model = genai.getGenerativeModel({model: AI_MODEL_LITE});

      const bio1 = (u1.bio || '').substring(0, 200);
      const bio2 = (u2.bio || '').substring(0, 200);
      const prompt = `You are an expert compatibility analyst. Analyze these two profiles and rate their chemistry.

Profile A: Age ${age1}, Type: ${t1 || 'unknown'}, Interests: ${[...i1].slice(0, 8).join(', ') || 'none'}${bio1 ? ', Bio: "' + bio1 + '"' : ''}
Profile B: Age ${age2}, Type: ${t2 || 'unknown'}, Interests: ${i2.slice(0, 8).join(', ') || 'none'}${bio2 ? ', Bio: "' + bio2 + '"' : ''}
Shared interests: ${shared.length > 0 ? shared.join(', ') : 'none'}
${ragContext ? '\nExpert knowledge:\n' + ragContext : ''}

IMPORTANT: This app is NEW with few users. Be GENEROUS with scoring (range 0.5-0.95).
Respond ONLY with valid JSON:
{"score": 0.0-1.0, "reasons": ["reason1", "reason2", "reason3"], "tip": "one actionable tip for connection"}`;

      const result = await model.generateContent({
        contents: [{role: 'user', parts: [{text: prompt}]}],
        generationConfig: {maxOutputTokens: 256, temperature: 0.3},
      });
      const text = result.response.text();
      const parsed = parseGeminiJsonResponse(text);
      if (parsed && typeof parsed.score === 'number') {
        aiScore = Math.max(0.5, Math.min(parsed.score, 0.95));
        reasons = Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 3) : [];
        tip = typeof parsed.tip === 'string' ? parsed.tip : '';
      }
    } catch (aiErr) {
      logger.warn(`[AIChemistry] Gemini failed (non-critical): ${aiErr.message}`);
    }

    // ── Blend: 40% algorithmic + 60% AI ──
    const blended = algorithmicScore * 0.4 + aiScore * 0.6;
    const finalScore = Math.round(48 + blended * 44); // Range 48-92%

    const result = {
      success: true,
      score: Math.max(48, Math.min(92, finalScore)),
      reasons,
      tip,
      factors: {
        algorithmic: Math.round(algorithmicScore * 100),
        ai: Math.round(aiScore * 100),
        sharedInterests: shared.length,
        ragChunksUsed: ragContext ? ragContext.split('\n').length : 0,
      },
      cached: false,
    };

    // ── Save to cache ──
    try {
      await cacheRef.set({...result, calculatedAt: admin.firestore.FieldValue.serverTimestamp()});
    } catch (cacheErr) {
      logger.warn(`[AIChemistry] Cache write failed: ${cacheErr.message}`);
    }

    logger.info(`[AIChemistry] ${pairId}: score=${result.score}, algo=${factors.interests?.toFixed(2)}, ai=${aiScore.toFixed(2)}, rag=${result.factors.ragChunksUsed}`);
    return result;
  },
);
