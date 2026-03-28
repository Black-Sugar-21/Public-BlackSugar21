'use strict';
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { AI_MODEL_LITE } = require('./shared');

function calculateMidpoint(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const lat1R = toRad(lat1);
  const lat2R = toRad(lat2);
  const lng1R = toRad(lng1);
  const bx = Math.cos(lat2R) * Math.cos(dLng);
  const by = Math.cos(lat2R) * Math.sin(dLng);
  const midLat = toDeg(
    Math.atan2(
      Math.sin(lat1R) + Math.sin(lat2R),
      Math.sqrt((Math.cos(lat1R) + bx) ** 2 + by ** 2),
    ),
  );
  const midLng = toDeg(lng1R + Math.atan2(by, Math.cos(lat1R) + bx));
  return {latitude: midLat, longitude: midLng};
}

/** Haversine: distancia en km entre dos puntos. */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Estimación simple de tiempo de viaje en minutos (speedKmH configurable, default 40 km/h ciudad). */
function estimateTravelMin(km, speedKmH = 40) {
  return Math.max(1, Math.round((km / speedKmH) * 60));
}

/**
 * Lee las ubicaciones de los 2 usuarios de un match desde Firestore.
 * Devuelve { user1: {lat,lng}, user2: {lat,lng}, midpoint: {latitude,longitude} }
 */
async function getMatchUsersLocations(matchId, currentUserId) {
  const firestore = admin.firestore();
  const matchDoc = await firestore.collection('matches').doc(matchId).get();
  if (!matchDoc.exists) throw new Error('Match not found');
  const usersMatched = matchDoc.data().usersMatched || [];
  if (usersMatched.length < 2) throw new Error('Invalid match');

  const [u1Snap, u2Snap] = await Promise.all(
    usersMatched.map((uid) => firestore.collection('users').doc(uid).get()),
  );
  const u1 = u1Snap.data() || {};
  const u2 = u2Snap.data() || {};

  const user1 = {lat: u1.latitude || 0, lng: u1.longitude || 0, id: usersMatched[0]};
  const user2 = {lat: u2.latitude || 0, lng: u2.longitude || 0, id: usersMatched[1]};

  // Validar que ambos usuarios tengan ubicaciones reales (no 0,0)
  if (user1.lat === 0 && user1.lng === 0 && user2.lat === 0 && user2.lng === 0) {
    throw new Error('NO_LOCATION_DATA');
  }
  // Si solo un usuario tiene ubicación, usar esa como base
  if (user1.lat === 0 && user1.lng === 0) {
    user1.lat = user2.lat;
    user1.lng = user2.lng;
  } else if (user2.lat === 0 && user2.lng === 0) {
    user2.lat = user1.lat;
    user2.lng = user1.lng;
  }

  // Determinar cuál es current y cuál es other
  let currentUser, otherUser;
  if (currentUserId === user1.id) {
    currentUser = user1;
    otherUser = user2;
  } else {
    currentUser = user2;
    otherUser = user1;
  }

  const midpoint = calculateMidpoint(currentUser.lat, currentUser.lng, otherUser.lat, otherUser.lng);
  return {currentUser, otherUser, midpoint};
}

/**
 * Fuzzy match a Gemini activity title to a real Google Place.
 * Priority: placeId exact → name exact → partial name match (contains or is contained).
 * @param {string} title - Gemini's title
 * @param {string|null} geminiPlaceId - placeId from Gemini
 * @param {Map} byIdLookup - Map<placeId, place>
 * @param {Map} byNameLookup - Map<lowercaseName, place>
 * @param {Array} allPlaces - full array of real places
 * @returns {Object|null} matched place or null
 */
function fuzzyMatchPlace(title, geminiPlaceId, byIdLookup, byNameLookup, allPlaces) {
  // 1. Exact placeId match (most reliable)
  if (geminiPlaceId && byIdLookup.has(geminiPlaceId)) return byIdLookup.get(geminiPlaceId);
  // 2. Exact name match
  const key = (title || '').toLowerCase().trim();
  if (key && byNameLookup.has(key)) return byNameLookup.get(key);
  // 3. Partial name match: title contains place name or vice versa
  let matched = null;
  if (key && key.length >= 3) {
    for (const rp of allPlaces) {
      const rpName = (rp.name || '').toLowerCase().trim();
      if (rpName.length < 3) continue;
      if (key.includes(rpName) || rpName.includes(key)) return rp;
    }
  }
  // 4. Word-level overlap (Jaccard similarity > 0.5)
  if (!matched) {
    const titleWords = new Set(key.split(/\s+/).filter((w) => w.length > 2));
    for (const rp of allPlaces) {
      const rpWords = new Set((rp.name || '').toLowerCase().split(/\s+/).filter((w) => w.length > 2));
      if (titleWords.size === 0 || rpWords.size === 0) continue;
      const intersection = [...titleWords].filter((w) => rpWords.has(w));
      const union = new Set([...titleWords, ...rpWords]);
      const jaccard = intersection.length / union.size;
      if (jaccard > 0.5) {
        matched = rp;
        break;
      }
    }
  }
  // 5. Strip common suffixes and retry containment
  if (!matched) {
    const suffixes = /\b(restaurant|restaurante|café|cafe|coffee|bar|pub|shop|store|tienda|club|lounge|grill|bistro|pizzeria|bakery|panadería)\b/gi;
    const cleanTitle = key.replace(suffixes, '').trim();
    if (cleanTitle.length >= 3) {
      for (const rp of allPlaces) {
        const cleanRp = (rp.name || '').replace(suffixes, '').trim().toLowerCase();
        if (cleanRp.length >= 3 && (cleanTitle.includes(cleanRp) || cleanRp.includes(cleanTitle))) {
          matched = rp;
          break;
        }
      }
    }
  }
  return matched;
}

/**
 * Mapa de categorías iOS → array de tipos Google Places API (New).
 * Primer elemento = tipo canónico; los siguientes amplían cobertura regional/lingüística.
 * Se usan en búsquedas paralelas con deduplicación por place.id.
 * Referencia: https://developers.google.com/maps/documentation/places/web-service/place-types
 */
const CATEGORY_TO_PLACES_TYPE = {
  cafe: [
    'cafe', 'coffee_shop',
  ],
  restaurant: [
    'restaurant',
    'american_restaurant', 'brazilian_restaurant', 'chinese_restaurant', 'french_restaurant',
    'greek_restaurant', 'indian_restaurant', 'indonesian_restaurant', 'italian_restaurant',
    'japanese_restaurant', 'korean_restaurant', 'latin_american_restaurant',
    'lebanese_restaurant', 'mediterranean_restaurant', 'mexican_restaurant',
    'middle_eastern_restaurant', 'pizza_restaurant', 'ramen_restaurant',
    'sandwich_shop', 'seafood_restaurant', 'spanish_restaurant', 'steak_house',
    'sushi_restaurant', 'thai_restaurant', 'turkish_restaurant', 'vietnamese_restaurant',
    'hamburger_restaurant', 'brunch_restaurant', 'fast_food_restaurant',
  ],
  bar: [
    'bar', 'wine_bar', 'cocktail_bar', 'pub',
    'sake_bar', 'whiskey_bar', 'beer_garden', 'beer_hall', 'tapas_bar',
  ],
  night_club: [
    'night_club',
  ],
  movie_theater: [
    'movie_theater', 'drive_in_movie_theater',
  ],
  park: [
    'park', 'national_park', 'botanical_garden', 'nature_preserve',
    'hiking_area', 'tourist_attraction', 'cultural_landmark', 'scenic_point',
    'plaza', 'campground',
  ],
  museum: [
    'museum', 'cultural_center', 'history_museum',
    'natural_history_museum', 'science_museum', 'childrens_museum',
  ],
  bowling_alley: [
    'bowling_alley', 'amusement_center', 'amusement_park',
    'billiard_hall', 'escape_room', 'arcade_game_center',
  ],
  art_gallery: [
    'art_gallery', 'art_studio',
  ],
  bakery: [
    'bakery', 'pastry_shop', 'confectionery', 'candy_store',
    'dessert_shop', 'ice_cream_shop', 'donut_shop',
  ],
  shopping_mall: [
    'shopping_mall', 'shopping_center', 'department_store', 'outlet_mall',
    'market', 'clothing_store',
  ],
  spa: [
    'spa', 'wellness_center', 'beauty_salon',
    'massage_therapist', 'sauna',
  ],
  aquarium: [
    'aquarium',
  ],
  zoo: [
    'zoo', 'wildlife_park',
  ],
};

// In-memory cache for places search config (same pattern as getCoachConfig)
let _placesSearchConfigCache = null;
let _placesSearchConfigCacheTime = 0;
const PLACES_SEARCH_CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Reads places search configuration from Remote Config with fallback defaults.
 * Caches in memory for 5 minutes to avoid repeated Remote Config reads.
 * Key: places_search_config (JSON)
 */
async function getPlacesSearchConfig() {
  if (_placesSearchConfigCache && (Date.now() - _placesSearchConfigCacheTime) < PLACES_SEARCH_CONFIG_CACHE_TTL) {
    return _placesSearchConfigCache;
  }
  const defaults = {
    enabled: true,
    radiusSteps: [100000, 130000, 180000, 250000, 300000],
    perQueryResults: 20,
    maxPlacesIntermediate: 60,
    queriesWithCategory: 3,
    queriesWithoutCategory: 5,
    useRestriction: true,
    photoMaxHeightPx: 400,
    photosPerPlace: 5,
    travelSpeedKmH: 40,
    maxLoadCount: 20,
    defaultLanguage: 'es',
    defaultCategoryQueryCount: 4,
    categoryQueryMap: null,
    progressiveRadiusSteps: [15000, 30000, 60000, 120000, 200000, 300000],
    minPlacesTarget: 30,
    minRadius: 3000,
    maxRadius: 300000,
    loadMoreDefaultBaseRadius: 60000,
    loadMoreExpansionBase: 2,
    loadMoreMaxExpansionStep: 4,
  };
  try {
    const rc = admin.remoteConfig();
    const template = await rc.getTemplate();
    const param = template.parameters['places_search_config'];
    if (param && param.defaultValue && param.defaultValue.value) {
      const rcConfig = JSON.parse(param.defaultValue.value);
      const result = {...defaults, ...rcConfig};
      // Validate categoryQueryMap is a non-empty object with string values
      if (result.categoryQueryMap && (typeof result.categoryQueryMap !== 'object' || Array.isArray(result.categoryQueryMap) || Object.keys(result.categoryQueryMap).length === 0)) {
        result.categoryQueryMap = null;
      }
      // Validate radiusSteps is a non-empty array of numbers
      if (!Array.isArray(result.radiusSteps) || result.radiusSteps.length === 0) {
        result.radiusSteps = defaults.radiusSteps;
      }
      // Validate progressiveRadiusSteps is a non-empty array of numbers
      if (!Array.isArray(result.progressiveRadiusSteps) || result.progressiveRadiusSteps.length === 0) {
        result.progressiveRadiusSteps = defaults.progressiveRadiusSteps;
      }
      _placesSearchConfigCache = result;
      _placesSearchConfigCacheTime = Date.now();
      return result;
    }
  } catch (err) {
    logger.warn(`[getPlacesSearchConfig] Failed to read Remote Config, using defaults: ${err.message}`);
    _placesSearchConfigCache = defaults;
    _placesSearchConfigCacheTime = Date.now();
  }
  return defaults;
}

/**
 * Default category query map — multilingual search terms per iOS category.
 * Includes EN, ES, PT, FR, DE, IT, ID, JA, ZH, AR so Google Places finds
 * venues in their local language regardless of the user's language setting.
 */
const DEFAULT_CATEGORY_QUERY_MAP = {
  cafe: 'café coffee shop cafetería coffeehouse specialty coffee ' +
    'starbucks dunkin tim hortons costa coffee peets ' +
    'koffie kafe kaffee caffè kafeterya 咖啡 カフェ مقهى',
  restaurant: 'restaurant restaurante bistro trattoria steakhouse ' +
    'mcdonalds burger king kfc subway pizza hut dominos wendys taco bell chipotle ' +
    'restaurante bistrô ristorante Restaurant churrascaria ' +
    'レストラン 餐厅 مطعم warung rumah makan',
  bar: 'bar pub cervecería brewery cocktail lounge wine bar taproom ' +
    'brasserie Kneipe birreria taberna pivo bar sake bar ' +
    'バー 酒吧 حانة warung bir',
  night_club: 'nightclub discoteca discotheque dance club electronic music club ' +
    'dance floor DJ night spot live music venue karaoke club nocturno boate ' +
    'boîte de nuit Nachtclub tanzclub malam klub malam ' +
    'ナイトクラブ 夜总会 ملهى ليلي',
  movie_theater: 'movie theater cinema cine multiplex sala de cine ' +
    'cinéma Kino cinematografo bioscoop sinema ' +
    '映画館 电影院 سينما',
  park: 'park parque jardín botánico botanical garden plaza mirador ' +
    'parc jardin Stadtpark giardino taman kebun raya ' +
    '公园 parque nacional 公園 حديقة taman kota',
  museum: 'museum museo musée Kunstmuseum museo nazionale muzeum ' +
    'cultural center centro cultural centro histórico ' +
    '博物館 博物馆 متحف museum sejarah',
  bowling_alley: 'bowling boliche bowling alley arcade billar laser tag ' +
    'piste de bowling Bowlingbahn bocciodromo escape room ' +
    'ボウリング 保龄球 بولينج area bermain',
  art_gallery: 'art gallery galería de arte exhibition contemporary art ' +
    "galerie d'art Kunstgalerie galleria d'arte pinacoteca " +
    '美術館 艺术画廊 معرض فني galeri seni',
  bakery: 'bakery panadería pastelería patisserie confitería repostería ' +
    'krispy kreme cinnabon mister donut dunkin donuts ' +
    'boulangerie Bäckerei panificio toko roti donut pastry shop ' +
    'ベーカリー 面包店 مخبز kue',
  shopping_mall: 'shopping mall centro comercial outlet department store ' +
    'centre commercial Einkaufszentrum centro commerciale ' +
    'pusat perbelanjaan mall plaza boutique ' +
    'ショッピングモール 购物中心 مركز تسوق',
  spa: 'spa wellness masajes termas sauna relax centro de bienestar ' +
    'salon beauté Wellnesszentrum centro benessere pijat ' +
    'onsen bathhouse beauty salon hammam ' +
    'スパ 水疗 سبا pijat refleksi',
  aquarium: 'aquarium acuario oceanario sea life marine ' +
    'aquarium Aquarium acquario oceanarium ' +
    '水族館 水族馆 أكواريوم akuarium',
  zoo: 'zoo zoológico safari park wildlife sanctuary bioparque ' +
    'zoo jardin zoologique Tierpark giardino zoologico ' +
    '動物園 动物园 حديقة حيوان kebun binatang',
};

/**
 * Returns the category query map, preferring Remote Config value over hardcoded default.
 * @param {Object|null} placesConfig - config from getPlacesSearchConfig()
 * @returns {Object} category → search terms map
 */
function getCategoryQueryMap(placesConfig) {
  return (placesConfig && placesConfig.categoryQueryMap) || DEFAULT_CATEGORY_QUERY_MAP;
}

const PLACES_FIELD_MASK = [
  'places.displayName',
  'places.formattedAddress',
  'places.rating',
  'places.userRatingCount',
  'places.location',
  'places.id',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.googleMapsUri',
  'places.currentOpeningHours',
  'places.photos',
  'places.primaryType',
  'places.editorialSummary',
  'places.priceLevel',
  'nextPageToken',
].join(',');

/**
 * Convert Google Places API priceLevel enum to $ string.
 * @param {string|undefined} apiPriceLevel - e.g. "PRICE_LEVEL_MODERATE"
 * @returns {string|null} e.g. "$$" or null if unknown
 */
function googlePriceLevelToString(apiPriceLevel) {
  const map = {
    'PRICE_LEVEL_FREE': '$',
    'PRICE_LEVEL_INEXPENSIVE': '$',
    'PRICE_LEVEL_MODERATE': '$$',
    'PRICE_LEVEL_EXPENSIVE': '$$$',
    'PRICE_LEVEL_VERY_EXPENSIVE': '$$$$',
  };
  return map[apiPriceLevel] || null;
}

/**
 * Validate an Instagram handle format.
 * @param {string} handle - raw handle (without @)
 * @returns {boolean}
 */
function isValidCoachInstagramHandle(handle) {
  if (!handle || typeof handle !== 'string') return false;
  const clean = handle.replace(/^@/, '').trim();
  if (clean.length < 2 || clean.length > 30) return false;
  // Must match Instagram's handle format: letters, numbers, dots, underscores
  if (!/^[a-zA-Z0-9._]+$/.test(clean)) return false;
  // Must contain at least one letter
  if (!/[a-zA-Z]/.test(clean)) return false;
  // Reject generic/hallucinated words (expanded blocklist)
  const genericWords = [
    // English generic
    'instagram', 'insta', 'follow', 'ig', 'like', 'photo', 'pic', 'foodie', 'love',
    'this', 'here', 'official', 'page', 'profile', 'account', 'contact', 'info',
    'website', 'visit', 'menu', 'book', 'reserve', 'order', 'delivery',
    // Place types (Gemini hallucinates these as handles)
    'bar', 'pub', 'cafe', 'coffee', 'restaurant', 'restaurante', 'comida',
    'bistro', 'grill', 'lounge', 'club', 'disco', 'nightclub', 'spa',
    'hotel', 'hostel', 'store', 'shop', 'market', 'mall', 'plaza',
    'bakery', 'pizzeria', 'sushi', 'burger', 'tacos', 'ramen',
    // Null/invalid
    'unknown', 'null', 'none', 'na', 'n_a', 'not_available', 'unavailable',
    'no_instagram', 'no_ig', 'handle', 'username', 'example', 'test',
    'pending', 'coming_soon', 'soon', 'tbd', 'not_found',
    // Spanish generic
    'perfil', 'pagina', 'cuenta', 'oficial', 'contacto', 'reservas',
    // Portuguese
    'perfil', 'pagina', 'conta', 'oficial', 'contato',
    // French
    'profil', 'officiel',
    // More English false positives
    'food', 'drinks', 'happy', 'place', 'best', 'good', 'nice', 'local', 'fresh', 'daily', 'special', 'menu', 'open', 'closed', 'hours', 'today',
  ];
  if (genericWords.includes(clean.toLowerCase())) return false;
  // Reject if handle is just numbers (not a real account)
  if (/^\d+$/.test(clean)) return false;
  // Reject if handle matches common city/country names (Gemini confuses these)
  if (clean.length <= 4 && /^[a-z]+$/i.test(clean)) return false; // Too short and generic
  return true;
}

/**
 * Sanitize Instagram handle: strip URLs, @, validate.
 * @param {*} raw - raw value from Gemini
 * @returns {string|null} clean handle or null
 */
function sanitizeInstagramHandle(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let handle = raw.trim();
  // Extract from URL patterns
  const urlMatch = handle.match(/instagram\.com\/([a-zA-Z0-9._]+)/i);
  if (urlMatch) handle = urlMatch[1];
  // Strip @ prefix and trailing slashes/spaces
  handle = handle.replace(/^@/, '').replace(/[\/\s]+$/, '').trim();
  return isValidCoachInstagramHandle(handle) ? handle : null;
}

/**
 * Extract Instagram handle from a venue's website HTML.
 * Fetches the website and searches for Instagram links.
 * @param {string} websiteUrl - the venue's website URL
 * @returns {Promise<string|null>} Instagram handle or null
 */
async function extractInstagramFromWebsite(websiteUrl) {
  if (!websiteUrl || typeof websiteUrl !== 'string') return null;
  // Skip URLs that are already social media (not a venue website)
  if (/instagram\.com|facebook\.com|tiktok\.com|twitter\.com|x\.com/i.test(websiteUrl)) {
    const directMatch = websiteUrl.match(/instagram\.com\/([a-zA-Z0-9._]{2,30})/i);
    return directMatch ? sanitizeInstagramHandle(directMatch[1]) : null;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(websiteUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'en-US,es;q=0.9',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    // Only read first 100KB to avoid large pages
    const reader = res.body?.getReader?.();
    let html = '';
    if (reader) {
      const decoder = new TextDecoder();
      let bytes = 0;
      while (bytes < 102400) {
        const {done, value} = await reader.read();
        if (done) break;
        html += decoder.decode(value, {stream: true});
        bytes += value.length;
      }
      reader.cancel().catch(() => {});
    } else {
      const full = await res.text();
      html = full.substring(0, 102400);
    }

    // Priority 1: href links to Instagram (most reliable — actual links in HTML)
    const hrefPattern = /href=["']https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9._]{2,30})\/?(?:\?[^"']*)?["']/gi;
    const hrefMatches = [...html.matchAll(hrefPattern)];
    for (const match of hrefMatches) {
      const handle = sanitizeInstagramHandle(match[1]);
      if (handle && handle !== 'p' && handle !== 'reel' && handle !== 'explore' && handle !== 'stories') {
        logger.info(`[Instagram] Found @${handle} via href from: ${websiteUrl}`);
        return handle;
      }
    }

    // Priority 2: Instagram URLs anywhere in HTML (JS variables, data attributes, meta tags)
    const urlPattern = /instagram\.com\/([a-zA-Z0-9._]{2,30})\/?(?:[\s"'<?,;)])/gi;
    const urlMatches = [...html.matchAll(urlPattern)];
    for (const match of urlMatches) {
      const handle = sanitizeInstagramHandle(match[1]);
      if (handle && handle !== 'p' && handle !== 'reel' && handle !== 'explore' && handle !== 'stories') {
        logger.info(`[Instagram] Found @${handle} via URL from: ${websiteUrl}`);
        return handle;
      }
    }

    // Priority 3: og:see_also or meta tags with Instagram
    const metaPattern = /content=["']https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9._]{2,30})\/?["']/gi;
    const metaMatches = [...html.matchAll(metaPattern)];
    for (const match of metaMatches) {
      const handle = sanitizeInstagramHandle(match[1]);
      if (handle && handle !== 'p' && handle !== 'reel' && handle !== 'explore' && handle !== 'stories') {
        logger.info(`[Instagram] Found @${handle} via meta from: ${websiteUrl}`);
        return handle;
      }
    }

    // Priority 4: JSON-LD structured data (schema.org sameAs)
    const jsonLdPattern = /"sameAs"\s*:\s*\[([^\]]*)\]/gi;
    const jsonLdMatches = [...html.matchAll(jsonLdPattern)];
    for (const match of jsonLdMatches) {
      const igInLd = match[1].match(/instagram\.com\/([a-zA-Z0-9._]{2,30})/i);
      if (igInLd) {
        const handle = sanitizeInstagramHandle(igInLd[1]);
        if (handle) {
          logger.info(`[Instagram] Found @${handle} via JSON-LD from: ${websiteUrl}`);
          return handle;
        }
      }
    }

    return null;
  } catch (err) {
    // Timeout or fetch error — silently return null
    return null;
  }
}

/**
 * Find Instagram handle via Gemini Search Grounding.
 * Uses Google Search to find the real Instagram account.
 * @param {string} placeName - name of the place
 * @param {string} placeAddress - address for disambiguation
 * @param {string} apiKey - Gemini API key
 * @returns {Promise<string|null>} Instagram handle or null
 */
async function findInstagramViaSearch(placeName, placeAddress, apiKey) {
  if (!placeName || !apiKey) return null;
  try {
    const {GoogleGenerativeAI} = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: AI_MODEL_LITE,
      generationConfig: {maxOutputTokens: 100, temperature: 0},
      tools: [{googleSearch: {}}],
    });
    const prompt = `What is the exact Instagram handle (username) for "${placeName}" located at "${placeAddress}"? Reply with ONLY the handle without @. If you cannot find it, reply with "null".`;
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().replace(/^@/, '');
    const handle = sanitizeInstagramHandle(text);
    if (handle) {
      logger.info(`[Instagram] Found @${handle} via Search Grounding for: ${placeName}`);
    }
    return handle;
  } catch (err) {
    logger.warn(`[Instagram] Search Grounding error for ${placeName}: ${err.message}`);
    return null;
  }
}

/**
 * Scrape public Instagram profile metrics.
 * Fetches the profile page and extracts followers, posts, last post date.
 * Returns metrics for ranking or null if profile is private/unavailable.
 *
 * @param {string} handle - Instagram handle (without @)
 * @returns {Promise<Object|null>} { followers, posts, lastPostDate, isActive, igScore } or null
 */
async function scrapeInstagramMetrics(handle) {
  if (!handle) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const url = `https://www.instagram.com/${handle}/`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    // Read only first 150KB
    const reader = res.body?.getReader?.();
    let html = '';
    if (reader) {
      const decoder = new TextDecoder();
      let bytes = 0;
      while (bytes < 153600) {
        const {done, value} = await reader.read();
        if (done) break;
        html += decoder.decode(value, {stream: true});
        bytes += value.length;
      }
      reader.cancel().catch(() => {});
    } else {
      const full = await res.text();
      html = full.substring(0, 153600);
    }

    let followers = null;
    let posts = null;
    let description = null;

    // Method 1: meta description tag (most reliable on public profiles)
    // Format: "X Followers, Y Following, Z Posts - See Instagram photos and videos from Name (@handle)"
    const metaDesc = html.match(/<meta\s+(?:name|property)=["']description["']\s+content=["']([^"']+)["']/i);
    if (metaDesc) {
      description = metaDesc[1];
      // Parse followers: "1.2M Followers" or "12K Followers" or "1,234 Followers"
      const followersMatch = description.match(/([\d,.]+[KMB]?)\s*Followers/i);
      if (followersMatch) followers = parseMetricValue(followersMatch[1]);
      // Parse posts: "Z Posts"
      const postsMatch = description.match(/([\d,.]+[KMB]?)\s*Posts/i);
      if (postsMatch) posts = parseMetricValue(postsMatch[1]);
    }

    // Method 2: og:description (fallback)
    if (followers === null) {
      const ogDesc = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
      if (ogDesc) {
        const followersMatch = ogDesc[1].match(/([\d,.]+[KMB]?)\s*Followers/i);
        if (followersMatch) followers = parseMetricValue(followersMatch[1]);
        const postsMatch = ogDesc[1].match(/([\d,.]+[KMB]?)\s*Posts/i);
        if (postsMatch) posts = parseMetricValue(postsMatch[1]);
      }
    }

    // Method 3: JSON-LD structured data
    const jsonLdMatch = html.match(/<script\s+type=["']application\/ld\+json["']>([^<]+)<\/script>/i);
    if (jsonLdMatch) {
      try {
        const ld = JSON.parse(jsonLdMatch[1]);
        if (ld.mainEntityofPage?.interactionStatistic) {
          for (const stat of ld.mainEntityofPage.interactionStatistic) {
            if (stat.interactionType === 'http://schema.org/FollowAction') {
              followers = followers || parseInt(stat.userInteractionCount, 10) || null;
            }
          }
        }
      } catch (ldErr) { /* ignore parse errors */ }
    }

    // Method 4: Look for datetime of recent posts
    let lastPostDate = null;
    const dateMatch = html.match(/<time[^>]*datetime=["']([^"']+)["']/i);
    if (dateMatch) {
      lastPostDate = dateMatch[1];
    }

    // If we couldn't extract anything, profile is likely private or page structure changed
    if (followers === null && posts === null) {
      // Check if it's private
      const isPrivate = html.includes('"is_private":true') || html.includes('This Account is Private');
      if (isPrivate) {
        logger.info(`[Instagram] @${handle} is private`);
        return {followers: null, posts: null, lastPostDate: null, isActive: null, isPrivate: true, igScore: 0};
      }
      return null;
    }

    // Calculate igScore (0-100) for ranking
    const now = Date.now();
    let recencyScore = 50; // default if no date
    if (lastPostDate) {
      const daysSincePost = (now - new Date(lastPostDate).getTime()) / 86400000;
      if (daysSincePost <= 7) recencyScore = 100;
      else if (daysSincePost <= 30) recencyScore = 80;
      else if (daysSincePost <= 90) recencyScore = 50;
      else if (daysSincePost <= 180) recencyScore = 25;
      else recencyScore = 10;
    }

    let followersScore = 30; // default
    if (followers !== null) {
      if (followers >= 100000) followersScore = 100;
      else if (followers >= 10000) followersScore = 80;
      else if (followers >= 1000) followersScore = 60;
      else if (followers >= 500) followersScore = 40;
      else if (followers >= 100) followersScore = 20;
      else followersScore = 10;
    }

    let postsScore = 30;
    if (posts !== null) {
      if (posts >= 500) postsScore = 100;
      else if (posts >= 100) postsScore = 70;
      else if (posts >= 30) postsScore = 50;
      else if (posts >= 10) postsScore = 30;
      else postsScore = 10;
    }

    // Weighted: recency 40%, followers 40%, posts 20%
    const igScore = Math.round(recencyScore * 0.4 + followersScore * 0.4 + postsScore * 0.2);

    const isActive = lastPostDate ? (now - new Date(lastPostDate).getTime()) < 90 * 86400000 : null;

    logger.info(`[Instagram] @${handle}: ${followers || '?'} followers, ${posts || '?'} posts, lastPost: ${lastPostDate || '?'}, igScore: ${igScore}`);

    return {followers, posts, lastPostDate, isActive, isPrivate: false, igScore};
  } catch (err) {
    return null;
  }
}

/**
 * Parse metric values like "1.2K", "3.4M", "1,234" to integers.
 */
function parseMetricValue(str) {
  if (!str) return null;
  const clean = str.replace(/,/g, '').trim();
  const multipliers = {K: 1000, M: 1000000, B: 1000000000};
  const match = clean.match(/^([\d.]+)([KMB])?$/i);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const mult = match[2] ? multipliers[match[2].toUpperCase()] : 1;
  return Math.round(num * mult);
}

/**
 * Resolve Instagram handle using a multi-step pipeline:
 * 1. Cache (Firestore) — if exists and < 30 days, use it
 * 2. Website scraping — extract from venue's websiteUri
 * 3. Gemini Search Grounding — search Google for the handle
 * 4. Gemini guess (existing) — fallback with blocklist validation
 *
 * @param {Object} params
 * @param {string} params.placeId - Google Places ID
 * @param {string} params.placeName - place name
 * @param {string} params.placeAddress - place address
 * @param {string|null} params.websiteUrl - venue website URL
 * @param {string|null} params.geminiGuess - handle guessed by Gemini (from coach)
 * @param {string} params.apiKey - Gemini API key
 * @returns {Promise<{handle: string|null, metrics: Object|null}>} handle + metrics
 */
async function resolveInstagramHandle({placeId, placeName, placeAddress, websiteUrl, geminiGuess, apiKey}) {
  const db = admin.firestore();
  const CACHE_DAYS = 30;

  // Step 1: Check cache (return handle + cached metrics)
  if (placeId) {
    try {
      const cached = await db.collection('placeInstagram').doc(placeId).get();
      if (cached.exists) {
        const data = cached.data();
        const age = Date.now() - (data.verifiedAt?.toMillis?.() || 0);
        if (age < CACHE_DAYS * 86400000) {
          return {
            handle: data.instagram || null,
            metrics: data.igScore != null ? {
              followers: data.followers, posts: data.posts,
              lastPostDate: data.lastPostDate, isActive: data.isActive,
              isPrivate: data.isPrivate, igScore: data.igScore,
            } : null,
          };
        }
      }
    } catch (cacheErr) {
      // Cache read failed, continue to other methods
    }
  }

  let handle = null;
  let source = null;

  // Step 2: Try website scraping
  if (!handle && websiteUrl) {
    handle = await extractInstagramFromWebsite(websiteUrl);
    if (handle) source = 'website';
  }

  // Step 3: Try Gemini Search Grounding
  if (!handle && apiKey) {
    handle = await findInstagramViaSearch(placeName, placeAddress || '', apiKey);
    if (handle) source = 'search';
  }

  // Step 4: Fallback to Gemini guess (already validated by sanitize)
  if (!handle && geminiGuess) {
    handle = sanitizeInstagramHandle(geminiGuess);
    if (handle) source = 'gemini';
  }

  // Scrape Instagram metrics for ranking
  let metrics = null;
  if (handle) {
    metrics = await scrapeInstagramMetrics(handle);
  }

  // Save to cache with metrics
  if (placeId && handle) {
    try {
      await db.collection('placeInstagram').doc(placeId).set({
        placeId,
        placeName: placeName || '',
        instagram: handle,
        source,
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        websiteUrl: websiteUrl || null,
        ...(metrics ? {
          followers: metrics.followers,
          posts: metrics.posts,
          lastPostDate: metrics.lastPostDate || null,
          isActive: metrics.isActive,
          isPrivate: metrics.isPrivate || false,
          igScore: metrics.igScore || 0,
        } : {}),
      });
    } catch (saveErr) {
      logger.warn(`[Instagram] Cache save error: ${saveErr.message}`);
    }
  }

  return {handle, metrics};
}

/**
 * Validate a website URL is well-formed.
 * @param {*} raw - raw value
 * @returns {string|null} valid URL or null
 */
function sanitizeWebsiteUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const url = raw.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) return null;
  // Reject obviously hallucinated URLs
  if (url.includes('example.com') || url.includes('placeholder')) return null;
  try {
    new URL(url);
    return url.substring(0, 200);
  } catch {
    return null;
  }
}

/**
 * Maps well-known franchise/brand names to their Google Places API type.
 * Used to ensure brand searches return correct place types.
 * Case-insensitive matching via lowercase keys.
 */
const BRAND_TYPE_MAP = {
  // ── Coffee & Donuts ──
  'dunkin': 'cafe', 'dunkin donuts': 'cafe', "dunkin'": 'cafe',
  'starbucks': 'cafe', 'costa coffee': 'cafe', 'tim hortons': 'cafe',
  'peet\'s': 'cafe', 'peets': 'cafe', 'blue bottle': 'cafe',
  'intelligentsia': 'cafe', 'lavazza': 'cafe', 'illy': 'cafe',
  'juan valdez': 'cafe', 'café de colombia': 'cafe',
  'doutor': 'cafe', 'tully\'s': 'cafe', 'caribou': 'cafe',
  'krispy kreme': 'bakery', 'mister donut': 'bakery',

  // ── Fast Food ──
  'mcdonalds': 'restaurant', "mcdonald's": 'restaurant', 'mcd': 'restaurant',
  'burger king': 'restaurant', 'bk': 'restaurant',
  'wendy\'s': 'restaurant', 'wendys': 'restaurant',
  'kfc': 'restaurant', 'kentucky': 'restaurant',
  'popeyes': 'restaurant', 'chick-fil-a': 'restaurant', 'chickfila': 'restaurant',
  'taco bell': 'restaurant', 'chipotle': 'restaurant',
  'subway': 'restaurant', 'five guys': 'restaurant',
  'in-n-out': 'restaurant', 'shake shack': 'restaurant',
  'whataburger': 'restaurant', 'jack in the box': 'restaurant',
  'carl\'s jr': 'restaurant', 'carls jr': 'restaurant',
  'hardees': 'restaurant', "hardee's": 'restaurant',
  'sonic': 'restaurant', 'arby\'s': 'restaurant', 'arbys': 'restaurant',
  'panda express': 'restaurant', 'wingstop': 'restaurant',
  'papa johns': 'restaurant', "papa john's": 'restaurant',
  'dominos': 'restaurant', "domino's": 'restaurant', 'pizza hut': 'restaurant',
  'little caesars': 'restaurant', "little caesar's": 'restaurant',

  // ── Latin America chains ──
  'telepizza': 'restaurant', 'mostaza': 'restaurant',
  'presto': 'restaurant', 'el corral': 'restaurant',
  'bembos': 'restaurant', 'jollibee': 'restaurant',
  'church\'s chicken': 'restaurant', 'churchs': 'restaurant',
  'wok': 'restaurant', 'fridays': 'restaurant', 'tgi fridays': 'restaurant',
  'applebees': 'restaurant', "applebee's": 'restaurant',
  'chilis': 'restaurant', "chili's": 'restaurant',
  'outback': 'restaurant', 'dennys': 'restaurant', "denny's": 'restaurant',
  'ihop': 'restaurant', 'hooters': 'restaurant',
  'sushi itto': 'restaurant', 'itamae': 'restaurant',

  // ── Ice Cream & Desserts ──
  'baskin robbins': 'bakery', 'baskin-robbins': 'bakery',
  'cold stone': 'bakery', 'dairy queen': 'restaurant', 'dq': 'restaurant',
  'haagen dazs': 'bakery', 'häagen-dazs': 'bakery',
  'ben & jerry': 'bakery', "ben & jerry's": 'bakery',
  'cinnabon': 'bakery', 'auntie anne': 'bakery', "auntie anne's": 'bakery',

  // ── Asian chains ──
  'yoshinoya': 'restaurant', 'sukiya': 'restaurant',
  'coco': 'cafe', 'coco ichibanya': 'restaurant',
  'mos burger': 'restaurant', 'lotteria': 'restaurant',
  'haidilao': 'restaurant', 'din tai fung': 'restaurant',

  // ── European chains ──
  'nandos': 'restaurant', "nando's": 'restaurant',
  'wagamama': 'restaurant', 'itsu': 'restaurant',
  'paul': 'bakery', 'le pain quotidien': 'bakery',
  'pret a manger': 'cafe', 'pret': 'cafe',
  'greggs': 'bakery', 'nero': 'cafe', 'caffe nero': 'cafe',
};

/**
 * Detects if a search query matches a known brand/franchise and returns the appropriate Places API type.
 * @param {string} query - user search query
 * @returns {{ brandName: string, type: string } | null}
 */
function detectBrandType(query) {
  if (!query) return null;
  const q = query.toLowerCase().trim();
  // Exact match first
  if (BRAND_TYPE_MAP[q]) return { brandName: q, type: BRAND_TYPE_MAP[q] };
  // Partial match: check if query starts with or contains a brand name
  for (const [brand, type] of Object.entries(BRAND_TYPE_MAP)) {
    if (brand.length >= 3 && (q.includes(brand) || brand.includes(q))) {
      return { brandName: brand, type };
    }
  }
  return null;
}

/**
 * Llama a Google Places API (New) Text Search.
 * @param {string} textQuery
 * @param {{latitude:number,longitude:number}} center
 * @param {number} radiusMeters
 * @param {string} languageCode
 * @param {string|null} pageToken
 * @param {number} maxResults
 * @param {boolean} useRestriction - true to use locationRestriction (hard filter) instead of locationBias
 * @returns {Promise<{places:Array, nextPageToken:string|null}>}
 */
async function placesTextSearch(textQuery, center, radiusMeters, languageCode, pageToken, maxResults = 20, useRestriction = false, includedTypes = null) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not configured');

  const body = {
    textQuery,
    languageCode: languageCode || 'es',
    maxResultCount: maxResults,
  };
  if (includedTypes && Array.isArray(includedTypes) && includedTypes.length > 0) {
    body.includedType = includedTypes[0];
  }
  if (center && center.latitude != null && center.longitude != null) {
    const radius = radiusMeters || 100000;
    if (useRestriction) {
      // locationRestriction requires rectangle (low/high), NOT circle
      const deltaLat = radius / 111320;
      const deltaLng = radius / (111320 * Math.cos(center.latitude * Math.PI / 180));
      body.locationRestriction = {
        rectangle: {
          low: {latitude: center.latitude - deltaLat, longitude: center.longitude - deltaLng},
          high: {latitude: center.latitude + deltaLat, longitude: center.longitude + deltaLng},
        },
      };
    } else {
      // locationBias accepts circle (soft preference hint)
      body.locationBias = {
        circle: {
          center: {latitude: center.latitude, longitude: center.longitude},
          radius,
        },
      };
    }
  }
  if (pageToken) body.pageToken = pageToken;

  const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': PLACES_FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    if (resp.status === 429) {
      // Rate limited — wait 1s and retry once
      logger.warn('[placesTextSearch] Rate limited (429), retrying in 1s');
      await new Promise((r) => setTimeout(r, 1000));
      const retryResp = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': PLACES_FIELD_MASK},
        body: JSON.stringify(body),
      });
      if (!retryResp.ok) {
        const retryErr = await retryResp.text();
        logger.error(`[placesTextSearch] API error ${retryResp.status} after retry: ${retryErr}`);
        throw new Error(`Places API error: ${retryResp.status}`);
      }
      const retryData = await retryResp.json();
      return {places: retryData.places || [], nextPageToken: retryData.nextPageToken || null};
    }
    const errText = await resp.text();
    logger.error(`[placesTextSearch] API error ${resp.status}: ${errText}`);
    throw new Error(`Places API error: ${resp.status}`);
  }

  const data = await resp.json();
  return {
    places: data.places || [],
    nextPageToken: data.nextPageToken || null,
  };
}

/**
 * Transforma un lugar de la API de Google Places (New) a nuestro formato PlaceSuggestion.
 * @param {Object} placesConfig - optional config from getPlacesSearchConfig() for photoMaxHeightPx, photosPerPlace, travelSpeedKmH
 */
/**
 * Filter out inappropriate venues (cabarets, strip clubs, adult entertainment).
 * Keeps legitimate nightclubs and discotecas.
 */
function isInappropriateVenue(place) {
  const name = (place.displayName?.text || '').toLowerCase();
  const desc = (place.editorialSummary?.text || '').toLowerCase();
  const types = (place.types || []).map(t => t.toLowerCase());
  const combined = `${name} ${desc}`;

  // Blocklist terms that indicate adult entertainment
  const adultTerms = [
    'strip', 'cabaret', 'gentlemen', 'gentleman', 'adult entertainment',
    'table dance', 'tabledance', 'topless', 'exotic dance', 'lap dance',
    'go-go', 'gogo', 'burlesque', 'showgirl',
    // Spanish
    'cabaretera', 'cabaré', 'table dance', 'baile exótico',
    'entretenimiento adulto', 'desnudista',
    // Portuguese
    'casa noturna adulta', 'dança exótica', 'boate adulta',
    // French
    'cabaret érotique', 'danse exotique',
    // German
    'stripclub', 'tabledance', 'nachtclub für erwachsene', 'erotik',
    // Japanese
    'ストリップ', 'キャバレー', 'キャバクラ', 'セクシーバー',
    // Chinese
    '脱衣舞', '成人夜总会', '色情', '情趣',
    // Russian
    'стриптиз', 'кабаре', 'эротик', 'для взрослых',
    // Arabic
    'تعري', 'ملهى للكبار', 'كباريه',
    // Indonesian
    'striptis', 'klub dewasa', 'hiburan dewasa',
  ];

  for (const term of adultTerms) {
    if (combined.includes(term)) return true;
  }

  // Check Google Places types for adult-only signals
  if (types.includes('adult_entertainment') || types.includes('strip_club')) return true;

  return false;
}

function transformPlaceToSuggestion(place, currentUser, otherUser, apiKey, placesConfig) {
  // Filter out inappropriate venues before transforming
  if (isInappropriateVenue(place)) return null;

  const lat = place.location?.latitude || 0;
  const lng = place.location?.longitude || 0;
  const distUser1 = haversineKm(currentUser.lat, currentUser.lng, lat, lng);
  const distUser2 = haversineKm(otherUser.lat, otherUser.lng, lat, lng);

  // Config-driven photo settings
  const maxPhotos = (placesConfig && placesConfig.photosPerPlace) || 5;
  const photoHeight = (placesConfig && placesConfig.photoMaxHeightPx) || 400;
  const speedKmH = (placesConfig && placesConfig.travelSpeedKmH) || 40;

  // Photos: construir URLs con la Place Photos API
  let photos = null;
  if (place.photos && place.photos.length > 0) {
    photos = place.photos.slice(0, maxPhotos).map((p) => ({
      url: `https://places.googleapis.com/v1/${p.name}/media?maxHeightPx=${photoHeight}&key=${apiKey}`,
      width: p.widthPx || 400,
      height: p.heightPx || 300,
    }));
  }

  return {
    name: place.displayName?.text || '',
    address: place.formattedAddress || '',
    rating: place.rating || 0,
    distanceUser1: Math.round(distUser1 * 10) / 10,
    distanceUser2: Math.round(distUser2 * 10) / 10,
    travelTimeUser1: estimateTravelMin(distUser1, speedKmH),
    travelTimeUser2: estimateTravelMin(distUser2, speedKmH),
    latitude: lat,
    longitude: lng,
    placeId: place.id || '',
    score: Math.round((1 / (1 + (distUser1 + distUser2) / 2)) * 100) / 100,
    website: place.websiteUri || null,
    phoneNumber: place.nationalPhoneNumber || null,
    googleMapsUrl: place.googleMapsUri || null,
    isOpenNow: place.currentOpeningHours?.openNow ?? null,
    tiktok: null,
    instagram: null,
    instagramHandle: null,
    category: place.primaryType || null,
    photos: photos,
    description: place.editorialSummary?.text || null,
  };
}

/**
 * Callable: Obtener sugerencias de lugares para una cita.
 * Payload: { matchId, userLanguage, category?, pageToken? }
 * Response: { success, suggestions: [PlaceSuggestion], nextPageToken? }
 * Homologado: iOS ChatView.getDateSuggestions + Android ChatViewModel.requestDateSuggestions
 *
 * Calcula el punto medio entre los 2 usuarios del match y busca lugares cercanos.
 * Usa patrón multi-query paralelo (como Coach IA) para obtener más resultados variados.
 */

/**
 * Combined ranking score for a place using Google Places + Instagram metrics.
 * Higher = better. Returns 0-100.
 *
 * Weights: Google rating 30%, review count 25%, igScore 30%, IG freshness 15%
 *
 * @param {Object} params
 * @param {number|null} params.rating - Google Places rating (0-5)
 * @param {number|null} params.reviewCount - Google Places total reviews
 * @param {Object|null} params.igMetrics - from scrapeInstagramMetrics()
 * @returns {number} 0-100
 */
function calculatePlaceScore({rating = null, reviewCount = null, igMetrics = null}) {
  // Google rating (0-5 → 0-100)
  const gRating = rating != null ? (rating / 5) * 100 : 0;

  // Google reviews (log-scaled, penalize <5 as unreliable/potentially old)
  let gReviews = 0;
  if (reviewCount != null && reviewCount > 0) {
    gReviews = Math.min(100, (Math.log10(reviewCount) / 3) * 100);
    if (reviewCount < 5) gReviews *= 0.5;
  }

  // Instagram igScore (0-100, already computed by scrapeInstagramMetrics)
  const igScore = igMetrics?.igScore || 0;

  // Instagram freshness: last post date → activity signal
  let freshness = 0;
  if (igMetrics && igMetrics.igScore > 0) {
    freshness = 50; // bonus for having IG at all
    if (igMetrics.lastPostDate) {
      const days = (Date.now() - new Date(igMetrics.lastPostDate).getTime()) / 86400000;
      if (days <= 30) freshness = 100;
      else if (days <= 90) freshness = 75;
      else if (days <= 180) freshness = 50;
      else freshness = 25;
    }
  }

  return Math.round(gRating * 0.30 + gReviews * 0.25 + igScore * 0.30 + freshness * 0.15);
}

// --- Exported helpers (used by coach.js and places.js) ---
module.exports = {
  calculateMidpoint,
  haversineKm,
  estimateTravelMin,
  getMatchUsersLocations,
  fuzzyMatchPlace,
  getPlacesSearchConfig,
  getCategoryQueryMap,
  googlePriceLevelToString,
  isValidCoachInstagramHandle,
  sanitizeInstagramHandle,
  resolveInstagramHandle,
  calculatePlaceScore,
  sanitizeWebsiteUrl,
  placesTextSearch,
  transformPlaceToSuggestion,
  CATEGORY_TO_PLACES_TYPE,
  detectBrandType,
};
