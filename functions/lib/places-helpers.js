'use strict';
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { AI_MODEL_LITE } = require('./shared');
const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Computes the geographic midpoint between two lat/lng coordinates using spherical math.
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {{latitude: number, longitude: number}}
 */
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
// CRITICAL: Generic types MUST be first in each array.
// With cap=8 pairs (2 queries × 4 types), only the first 4 types are covered.
// Google Places tags venues differently per country — generic types (bar, restaurant)
// have global coverage, while specific types (pub, pizza_restaurant) are region-specific.
const CATEGORY_TO_PLACES_TYPE = {
  cafe: [
    'cafe', 'coffee_shop',
  ],
  restaurant: [
    // Generic first — covers 95% of restaurants in all countries
    'restaurant',
    // Most common specific types (global coverage)
    'italian_restaurant', 'mexican_restaurant', 'japanese_restaurant',
    // Rest (lower priority, region-specific)
    'american_restaurant', 'brazilian_restaurant', 'chinese_restaurant', 'french_restaurant',
    'greek_restaurant', 'indian_restaurant', 'indonesian_restaurant',
    'korean_restaurant', 'latin_american_restaurant',
    'lebanese_restaurant', 'mediterranean_restaurant',
    'middle_eastern_restaurant', 'pizza_restaurant', 'ramen_restaurant',
    'sandwich_shop', 'seafood_restaurant', 'spanish_restaurant', 'steak_house',
    'sushi_restaurant', 'thai_restaurant', 'turkish_restaurant', 'vietnamese_restaurant',
    'hamburger_restaurant', 'brunch_restaurant', 'fast_food_restaurant',
  ],
  bar: [
    // Generic first — Latam/Asia venues often tagged as 'bar' only
    'bar', 'cocktail_bar', 'wine_bar', 'pub',
  ],
  night_club: [
    'night_club',
  ],
  movie_theater: [
    'movie_theater', 'drive_in_movie_theater',
  ],
  park: [
    // Generic first — cubre mayoría de parques en todos los países
    'park', 'tourist_attraction', 'plaza', 'botanical_garden',
    'national_park', 'nature_preserve',
    'hiking_area', 'cultural_landmark', 'scenic_point', 'campground',
  ],
  museum: [
    'museum', 'art_gallery', 'cultural_center', 'history_museum',
    'natural_history_museum', 'science_museum', 'childrens_museum',
  ],
  bowling_alley: [
    'bowling_alley', 'amusement_center', 'arcade_game_center', 'escape_room',
    'amusement_park', 'billiard_hall',
  ],
  art_gallery: [
    'art_gallery', 'art_studio',
  ],
  bakery: [
    // Generic first — bakery covers most cases, ice_cream_shop is very common
    'bakery', 'pastry_shop', 'ice_cream_shop', 'dessert_shop',
    'confectionery', 'candy_store', 'donut_shop',
  ],
  shopping_mall: [
    'shopping_mall', 'department_store', 'shopping_center', 'market',
    'outlet_mall', 'clothing_store',
  ],
  spa: [
    'spa', 'beauty_salon', 'massage_therapist', 'wellness_center',
    'sauna',
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
    queriesWithCategory: 2,
    queriesWithoutCategory: 3,
    useRestriction: true,
    photoMaxHeightPx: 400,
    photosPerPlace: 5,
    travelSpeedKmH: 40,
    maxLoadCount: 20,
    defaultLanguage: 'es',
    defaultCategoryQueryCount: 4,
    categoryQueryMap: null,
    progressiveRadiusSteps: [15000, 60000, 200000],
    minPlacesTarget: 15,
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
 * Default category query map — multilingual + culturally aware search terms.
 * Each category includes local vocabulary per country so Google Places returns
 * venues that match local culture, not just literal translations.
 *
 * Covered cultures:
 * - Latam: AR, BO, BR, CL, CO, CR, CU, EC, GT, MX, PA, PE, PY, UY, VE
 * - English: UK, US, CA, AU, NZ, IE
 * - Europe: ES, FR, DE, IT, PT, NL, PL, RU
 * - Asia: JP, CN, KR, TH, VN, ID, PH, IN
 * - Middle East: SA, AE, EG, TR, LB
 */
const DEFAULT_CATEGORY_QUERY_MAP = {
  cafe: 'café coffee shop cafetería coffeehouse specialty coffee ' +
    // Latam
    'cafetería cafecito café de especialidad ' +
    // English
    'starbucks dunkin tim hortons costa coffee peets blue bottle ' +
    // Europe
    'kaffee caffè caffetteria kaffeehaus koffie bar italiano ' +
    // Asia
    '喫茶店 カフェ 咖啡馆 咖啡厅 카페 quán cafe kopitiam warung kopi ' +
    // Middle East
    'مقهى قهوة çay bahçesi kahveci',
  restaurant: 'restaurant restaurante bistro trattoria steakhouse eatery dining ' +
    // Latam specific
    'restorán picada fonda parrilla parrillada asador churrasquería comedor ' +
    'marisquería cevichería empanadería lomotón sanguchería ' +
    // Chile specific
    'restorán chileno picada chilena cocinería ' +
    // Argentina
    'parrilla argentina bodegón ' +
    // Brazil
    'restaurante churrascaria botequim lanchonete boteco ' +
    // Mexico
    'fonda taquería cantina mexicana torta ' +
    // Peru
    'picantería cevichería anticuchería chifa ' +
    // Spain
    'taberna mesón casa de comidas tasca chiringuito ' +
    // English
    'mcdonalds burger king kfc subway pizza hut dominos wendys taco bell chipotle ' +
    'gastropub diner steakhouse ' +
    // Europe
    'ristorante trattoria osteria pizzeria Restaurant brasserie ' +
    'restoran speisekarte ' +
    // Asia
    'レストラン 食堂 居酒屋 餐厅 餐馆 饭店 식당 음식점 ' +
    'quán ăn nhà hàng rumah makan warung kedai ' +
    // Middle East
    'مطعم مطاعم lokanta restoran',
  bar: 'bar pub cervecería brewery cocktail lounge wine bar taproom gastropub ' +
    // Latam — IMPORTANT: in Chile/Argentina "bar" includes restoranes sociales
    'cantina cervecería artesanal birrería coctelería rooftop bar ' +
    'bar de copas resto-bar restobar speakeasy ' +
    // Chile specific — where people go on weeknights
    'resto pub picada nocturna terraza ' +
    // Argentina
    'boliche bar notable resto-bar ' +
    // Brazil
    'boteco botequim pé-sujo cervejaria ' +
    // Mexico
    'cantina pulquería mezcalería ' +
    // Peru
    'peña chicha bar ' +
    // English
    'sports bar dive bar tiki bar craft beer tap room ' +
    // Europe
    'brasserie bistrot Kneipe Bierstube birreria taberna pivnice ' +
    'irish pub english pub british pub ' +
    // Asia — izakaya is Japanese pub-equivalent
    '居酒屋 バー 酒吧 酒馆 술집 포장마차 ' +
    'quán nhậu quán bia warung bir ' +
    // Middle East — shisha lounges are social evening spots
    'حانة شيشة أرجيلة bar de narguile narghile bar lounge',
  night_club: 'nightclub discoteca discotheque dance club electronic music venue ' +
    // Latam
    'boliche bailable discoteca carrete ' +
    // Chile/Argentina
    'carrete bailable after ' +
    // Brazil
    'balada boate casa noturna ' +
    // Mexico
    'antro bar de copas ' +
    // English
    'dance club DJ night spot live music venue EDM rave ' +
    // Europe
    'boîte de nuit Nachtclub Diskothek tanzclub club notturno discoteca ' +
    // Asia
    'ナイトクラブ クラブ 夜店 夜总会 클럽 ' +
    'klub malam ' +
    // Middle East
    'ملهى ليلي كلوب gece kulübü',
  movie_theater: 'movie theater cinema cine multiplex sala de cine ' +
    // Latam
    'cine multisala cineplex cinepolis cinemark hoyts movistar ' +
    // English
    'imax drive-in cineplex amc regal ' +
    // Europe
    'cinéma Kino Filmtheater cinematografo cineteca ' +
    // Asia
    '映画館 シネマ 电影院 영화관 rạp chiếu phim bioskop ' +
    // Middle East
    'سينما دار عرض sinema',
  park: 'park parque jardín botánico botanical garden plaza mirador viewpoint ' +
    // Latam
    'parque parque nacional plaza paseo alameda mirador laguna cerro ' +
    // Chile — places like Cerro San Cristóbal, Parque Bicentenario
    'cerro parque metropolitano paseo peatonal ' +
    // Argentina — plazas are very social
    'plaza pública parque urbano reserva ecológica ' +
    // Brazil
    'praça parque jardim mirante ' +
    // Mexico
    'zócalo alameda parque ecológico ' +
    // Europe
    'parc jardin Stadtpark öffentlicher Park giardino pubblico ' +
    // Asia
    '公園 公园 국립공원 公园 ' +
    'taman kebun raya công viên ' +
    // Middle East
    'حديقة متنزه park bahçe',
  museum: 'museum museo musée Kunstmuseum museo nazionale muzeum ' +
    // Latam
    'museo histórico museo de arte museo interactivo centro cultural ' +
    'pinacoteca palacio cultural casa museo ' +
    // English
    'national museum history museum art museum science museum ' +
    // Europe
    'Museum Kunsthalle palazzo museo civico ' +
    // Asia
    '博物館 博物馆 미술관 박물관 bảo tàng museum ' +
    // Middle East
    'متحف دار الآثار müze',
  bowling_alley: 'bowling boliche bowling alley arcade billar laser tag escape room ' +
    // Latam
    'bolera billar pool parque de diversiones sala de juegos ' +
    'karaoke mini golf paintball trampolín laser ' +
    // English
    'arcade entertainment center family fun center chuck e cheese dave and busters ' +
    // Europe
    'piste de bowling Bowlingbahn Vergnügungszentrum bocciodromo ' +
    'sala giochi salle de jeux ' +
    // Asia
    'ボウリング 保龄球 볼링장 ゲームセンター 游戏厅 오락실 ' +
    'arena bermain tempat hiburan ' +
    // Middle East
    'بولينج صالة ألعاب bowling salonu oyun salonu',
  art_gallery: 'art gallery galería de arte exhibition contemporary art modern art ' +
    // Latam
    'galería de arte arte contemporáneo sala de exposiciones exposición ' +
    // Europe
    "galerie d'art Kunstgalerie Kunsthalle galleria d'arte pinacoteca " +
    // Asia
    '美術館 画廊 艺术画廊 갤러리 phòng tranh ' +
    // Middle East
    'معرض فني صالة عرض فنية sanat galerisi galeri seni',
  bakery: 'bakery panadería pastelería patisserie confitería repostería ' +
    // Latam
    'panadería pastelería amasandería confitería repostería dulcería ' +
    // Chile — amasandería is very typical
    'amasandería panificadora ' +
    // Argentina
    'panadería confitería facturas ' +
    // Brazil
    'padaria confeitaria doceria ' +
    // Mexico
    'panadería pastelería repostería churrería ' +
    // English
    'krispy kreme cinnabon mister donut dunkin donuts bread shop pastry shop ' +
    // Europe
    'boulangerie pâtisserie Bäckerei Konditorei panificio forno ' +
    // Asia
    'ベーカリー パン屋 和菓子 面包店 烘焙 제과점 tiệm bánh toko roti ' +
    // Middle East
    'مخبز حلويات pastane fırın',
  shopping_mall: 'shopping mall centro comercial outlet department store retail ' +
    // Latam
    'centro comercial mall galería comercial outlet ' +
    // Chile
    'mall plaza costanera ' +
    // Argentina
    'shopping galería ' +
    // Brazil
    'shopping center mercado municipal ' +
    // Europe
    'centre commercial Einkaufszentrum centro commerciale galleria commerciale ' +
    // Asia
    'ショッピングモール 购物中心 百货公司 쇼핑몰 trung tâm thương mại ' +
    'pusat perbelanjaan mall ' +
    // Middle East
    'مركز تسوق مول alışveriş merkezi',
  spa: 'spa wellness massage masajes termas sauna relax wellness center ' +
    // Latam
    'masoterapia masajes relajantes centro de relajación termas ' +
    // Chile — termas are very cultural
    'termas hot springs aguas termales ' +
    // Japan — onsen is essential
    '温泉 銭湯 スパ エステ ' +
    // Asia
    'pijat refleksi reflexology 찜질방 마사지 spa massage ' +
    // Middle East — hammam is essential
    'حمام مغربي حمام بخاري hammam Türk hamamı ' +
    // Europe
    'spa balneario thermes Wellnesszentrum centro benessere terme ' +
    // English
    'day spa thermal spa thai massage aromatherapy ayurveda',
  aquarium: 'aquarium acuario oceanario sea life marine ocean world ' +
    // Latam
    'acuario oceanográfico ' +
    // Europe
    'Aquarium acquario oceanarium aquarium marin ' +
    // Asia
    '水族館 水族馆 아쿠아리움 thủy cung akuarium ' +
    // Middle East
    'أكواريوم akvaryum',
  zoo: 'zoo zoológico safari park wildlife sanctuary bioparque animal park ' +
    // Latam
    'zoológico bioparque parque zoológico reserva de fauna ' +
    // Europe
    'jardin zoologique Tierpark Zoo giardino zoologico parco faunistico ' +
    // Asia
    '動物園 动物园 동물원 vườn thú kebun binatang ' +
    // Middle East
    'حديقة حيوان hayvanat bahçesi',
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
  const clean = handle.replace(/^@/, '').replace(/\.+$/, '').trim();
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
 * Non-profile Instagram paths to ignore when extracting handles.
 */
const IG_BLACKLIST = new Set([
  'p', 'reel', 'reels', 'explore', 'stories', 'tv', 'accounts',
  'about', 'developer', 'legal', 'privacy', 'share', 'direct',
  'tags', 'locations', 'nametag', 'web', 'emails', 'session',
  'challenge', 'static', 'lite', 'api', 'graphql', 'oauth',
]);

/**
 * Check if a candidate handle is a valid Instagram profile (not a reserved path).
 */
function isValidIgCandidate(handle) {
  if (!handle) return false;
  const h = handle.toLowerCase();
  if (IG_BLACKLIST.has(h)) return false;
  if (h.length < 2 || h.length > 30) return false;
  // Must not be all dots/underscores
  if (/^[._]+$/.test(h)) return false;
  return true;
}

/**
 * Extract all Instagram handle candidates from HTML, scored by priority.
 * Returns the best candidate or null.
 * @param {string} html - raw HTML content
 * @param {string} sourceLabel - for logging
 * @returns {string|null}
 */
function extractIgFromHtml(html, sourceLabel) {
  // Collect candidates with priority scores (lower = better)
  const candidates = new Map(); // handle → best priority

  /** Adds an Instagram handle candidate to the priority map if valid. */
  function addCandidate(handle, priority, method) {
    const clean = sanitizeInstagramHandle(handle);
    if (!clean || !isValidIgCandidate(clean)) return;
    const existing = candidates.get(clean);
    if (!existing || priority < existing.priority) {
      candidates.set(clean, {priority, method});
    }
  }

  // P1: <a href="...instagram.com/handle..."> (most reliable — explicit link)
  const hrefPattern = /href\s*=\s*["']https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9._]{2,30})\/?(?:\?[^"']*)?["']/gi;
  for (const m of html.matchAll(hrefPattern)) {
    addCandidate(m[1], 1, 'href');
  }

  // P2: aria-label or title containing "instagram" on links (icon-only social buttons)
  const ariaPattern = /<a[^>]*(?:aria-label|title)\s*=\s*["'][^"']*instagram[^"']*["'][^>]*href\s*=\s*["']([^"']+)["']/gi;
  const ariaPattern2 = /<a[^>]*href\s*=\s*["']([^"']+)["'][^>]*(?:aria-label|title)\s*=\s*["'][^"']*instagram[^"']*["']/gi;
  for (const m of [...html.matchAll(ariaPattern), ...html.matchAll(ariaPattern2)]) {
    const igMatch = m[1].match(/instagram\.com\/([a-zA-Z0-9._]{2,30})/i);
    if (igMatch) addCandidate(igMatch[1], 1, 'aria-link');
  }

  // P3: og:see_also, og:url, or meta tags with Instagram URLs
  const metaPattern = /(?:content|value)\s*=\s*["']https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9._]{2,30})\/?(?:\?[^"']*)?["']/gi;
  for (const m of html.matchAll(metaPattern)) {
    addCandidate(m[1], 2, 'meta');
  }

  // P4: JSON-LD structured data — sameAs as array or string, including @graph
  const scriptPattern = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const sm of html.matchAll(scriptPattern)) {
    try {
      const ld = JSON.parse(sm[1]);
      const objects = Array.isArray(ld) ? ld : ld['@graph'] ? (Array.isArray(ld['@graph']) ? ld['@graph'] : [ld['@graph']]) : [ld];
      for (const obj of objects) {
        const sameAs = obj.sameAs;
        const urls = Array.isArray(sameAs) ? sameAs : (typeof sameAs === 'string' ? [sameAs] : []);
        for (const url of urls) {
          const igMatch = typeof url === 'string' && url.match(/instagram\.com\/([a-zA-Z0-9._]{2,30})/i);
          if (igMatch) addCandidate(igMatch[1], 3, 'json-ld');
        }
      }
    } catch (_) { /* malformed JSON-LD */ }
  }

  // P5: Instagram URLs anywhere in HTML (JS variables, data-href, inline scripts, etc.)
  const urlPattern = /instagram\.com\/([a-zA-Z0-9._]{2,30})\/?(?=[\s"'<?,;)}\]])/gi;
  for (const m of html.matchAll(urlPattern)) {
    addCandidate(m[1], 5, 'url-anywhere');
  }

  // P6: Text patterns like "Follow us @handle on Instagram" or "IG: @handle"
  const textPatterns = [
    /(?:instagram|ig|insta)\s*[:\-–—]?\s*@([a-zA-Z0-9._]{2,30})/gi,
    /@([a-zA-Z0-9._]{2,30})\s+(?:on|en|sur|auf|в)\s+instagram/gi,
    /(?:follow|síguenos|síganosme?|nous suivre|seguir|segui[rn]?|folgen)\s+.*?@([a-zA-Z0-9._]{2,30}).*?instagram/gi,
    /instagram\.com\s*[\/\\]?\s*@?([a-zA-Z0-9._]{2,30})/gi,
  ];
  for (const pat of textPatterns) {
    for (const m of html.matchAll(pat)) {
      addCandidate(m[1], 6, 'text-pattern');
    }
  }

  // P7: data-instagram, data-social-instagram, or similar data attributes
  const dataAttrPattern = /data-[a-z-]*instagram[a-z-]*\s*=\s*["'](?:https?:\/\/(?:www\.)?instagram\.com\/)?@?([a-zA-Z0-9._]{2,30})["']/gi;
  for (const m of html.matchAll(dataAttrPattern)) {
    addCandidate(m[1], 4, 'data-attr');
  }

  if (candidates.size === 0) return null;

  // Pick the candidate with best (lowest) priority; on tie, pick most frequent
  const freq = new Map();
  for (const [handle] of candidates) freq.set(handle, 0);

  // Count all raw occurrences to break ties
  const allMentions = html.match(/instagram\.com\/([a-zA-Z0-9._]{2,30})/gi) || [];
  for (const mention of allMentions) {
    const h = sanitizeInstagramHandle(mention.replace(/.*instagram\.com\//i, ''));
    if (h && candidates.has(h)) freq.set(h, (freq.get(h) || 0) + 1);
  }

  let best = null;
  let bestScore = Infinity;
  for (const [handle, {priority, method}] of candidates) {
    // Score = priority * 100 - frequency (so higher frequency wins ties)
    const score = priority * 100 - (freq.get(handle) || 0);
    if (score < bestScore) {
      bestScore = score;
      best = {handle, method};
    }
  }

  if (best) {
    logger.info(`[Instagram] Found @${best.handle} via ${best.method} from: ${sourceLabel}`);
    return best.handle;
  }
  return null;
}

/**
 * User-Agent pool — rotated to reduce 403 blocks from bot detection.
 */
const UA_POOL = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
];

/**
 * Fetch HTML from a URL with timeout, size limit, and User-Agent rotation.
 * On 403, retries once with a different User-Agent.
 * @param {string} url
 * @param {number} [timeoutMs=5000]
 * @param {number} [maxBytes=153600]
 * @returns {Promise<string|null>} HTML string or null on error
 */
async function fetchHtmlSafe(url, timeoutMs = 5000, maxBytes = 153600) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ua = UA_POOL[(Math.floor(Math.random() * UA_POOL.length) + attempt) % UA_POOL.length];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
          'Accept-Encoding': 'identity',
        },
        redirect: 'follow',
      });
      clearTimeout(timer);
      // Retry with different UA on 403
      if (res.status === 403 && attempt === 0) continue;
      if (!res.ok) return null;

      const reader = res.body?.getReader?.();
      let html = '';
      if (reader) {
        const decoder = new TextDecoder();
        let bytes = 0;
        while (bytes < maxBytes) {
          const {done, value} = await reader.read();
          if (done) break;
          html += decoder.decode(value, {stream: true});
          bytes += value.length;
        }
        // Best-effort cancel of an already-read stream. Failures are not
        // actionable (we've already got what we need); log at debug level.
        reader.cancel().catch(e => logger.debug(`[placeScraper] reader.cancel noop: ${e.message}`));
      } else {
        const full = await res.text();
        html = full.substring(0, maxBytes);
      }
      return html;
    } catch (e) {
      if (attempt === 0) continue; // Retry once on network errors
      logger.warn(`[placeScraper] fetch failed after retry: ${e.message}`);
      return null;
    }
  }
  return null;
}

/**
 * Extract Instagram handle from a venue's website HTML.
 * Fetches the website (and optionally /contact, /about subpages) and searches
 * for Instagram links using 7 extraction strategies.
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

  // Fetch homepage
  const html = await fetchHtmlSafe(websiteUrl);

  // If homepage fetched OK, try extracting
  if (html) {
    const handle = extractIgFromHtml(html, websiteUrl);
    if (handle) return handle;

    // Fallback: try /contact and /about subpages (many venues put social links there)
    try {
      const base = new URL(websiteUrl);
      const subpages = ['/contact', '/about', '/contacto', '/sobre', '/kontakt'];
      for (const sub of subpages) {
        if (base.pathname === sub || base.pathname === sub + '/') continue;
        const subUrl = `${base.origin}${sub}`;
        const subHtml = await fetchHtmlSafe(subUrl, 3000, 102400);
        if (subHtml) {
          const subHandle = extractIgFromHtml(subHtml, subUrl);
          if (subHandle) return subHandle;
        }
      }
    } catch (_) { /* invalid URL */ }
  }

  return null;
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
      reader.cancel().catch(e => logger.debug(`[instaScraper] reader.cancel noop: ${e.message}`));
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
// Firestore-backed geographic cache (persists 24h, shared across all users and CF instances)
// Collection: placesCache/{cacheKey} — auto-expires via TTL policy or manual check
const PLACES_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
// In-memory L1 cache (fast path — avoids Firestore read if same CF instance)
const _placesL1Cache = new Map();
const _PLACES_L1_TTL = 15 * 60 * 1000; // 15 min in-memory
const _PLACES_L1_MAX = 100;

/**
 * Builds a deterministic cache key for a Places text search query.
 * @param {string} textQuery - Search query text
 * @param {{latitude: number, longitude: number}|null} center - Geographic center
 * @param {number} radiusMeters - Search radius in meters
 * @param {string} languageCode - BCP-47 language code
 * @param {string[]|null} includedTypes - Google Places included type filter
 * @returns {string} Cache key string
 */
function _getGeoCacheKey(textQuery, center, radiusMeters, languageCode, includedTypes) {
  const lat = center ? Math.round(center.latitude * 100) / 100 : 0; // ~1km precision
  const lng = center ? Math.round(center.longitude * 100) / 100 : 0;
  const r = Math.round((radiusMeters || 0) / 1000); // Round to km
  const type = includedTypes ? includedTypes[0] : '';
  return `${textQuery}|${lat},${lng}|${r}|${languageCode || 'es'}|${type}`;
}

/**
 * Sanitizes a cache key to be a valid Firestore document ID (replaces slashes/spaces, max 200 chars).
 * @param {string} key - Raw cache key
 * @returns {string} Safe document ID string
 */
function _sanitizeCacheKey(key) {
  return key.replace(/\//g, '_').replace(/\s+/g, '_').substring(0, 200);
}

/**
 * Calls Google Places Text Search API with L1 (in-memory) + L2 (Firestore) caching.
 * @param {string} textQuery - Search query text
 * @param {{latitude: number, longitude: number}|null} center - Search center
 * @param {number} radiusMeters - Search radius in meters
 * @param {string} languageCode - BCP-47 language code
 * @param {string|null} pageToken - Pagination token for next page
 * @param {number} [maxResults=20] - Max results per page
 * @param {boolean} [useRestriction=false] - Use locationRestriction instead of locationBias
 * @param {string[]|null} [includedTypes=null] - Google Places type filter
 * @returns {Promise<{places: Object[], nextPageToken?: string}>}
 * @throws {Error} If GOOGLE_PLACES_API_KEY is not configured or API returns an error
 */
async function placesTextSearch(textQuery, center, radiusMeters, languageCode, pageToken, maxResults = 20, useRestriction = false, includedTypes = null) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not configured');

  // Check cache: L1 in-memory → L2 Firestore (skip if pagination token)
  if (!pageToken && center) {
    const cacheKey = _getGeoCacheKey(textQuery, center, radiusMeters, languageCode, includedTypes);
    const docId = _sanitizeCacheKey(cacheKey);

    // L1: in-memory (fast, same CF instance)
    const l1 = _placesL1Cache.get(docId);
    if (l1 && (Date.now() - l1.time) < _PLACES_L1_TTL) {
      return l1.data;
    }

    // L2: Firestore (persistent, shared across instances)
    try {
      const cacheDoc = await admin.firestore().collection('placesCache').doc(docId).get();
      if (cacheDoc.exists) {
        const cached = cacheDoc.data();
        const cachedTime = cached.timestamp?.toMillis?.() || 0;
        if ((Date.now() - cachedTime) < PLACES_CACHE_TTL_MS) {
          const result = {places: cached.places || [], nextPageToken: null};
          // Warm L1
          _placesL1Cache.set(docId, {data: result, time: Date.now()});
          return result;
        }
      }
    } catch (cacheErr) {
      // Cache miss — proceed to API call
    }
  }

  const body = {
    textQuery,
    languageCode: languageCode || 'es',
    maxResultCount: maxResults,
  };
  // Validate includedType against Google Places API v2 supported types
  // Only set if the type is known-valid to avoid 400 errors
  const VALID_PLACE_TYPES = new Set([
    'restaurant', 'american_restaurant', 'brazilian_restaurant', 'chinese_restaurant',
    'french_restaurant', 'greek_restaurant', 'indian_restaurant', 'indonesian_restaurant',
    'italian_restaurant', 'japanese_restaurant', 'korean_restaurant', 'latin_american_restaurant',
    'lebanese_restaurant', 'mediterranean_restaurant', 'mexican_restaurant',
    'middle_eastern_restaurant', 'pizza_restaurant', 'ramen_restaurant', 'sandwich_shop',
    'seafood_restaurant', 'spanish_restaurant', 'steak_house', 'sushi_restaurant',
    'thai_restaurant', 'turkish_restaurant', 'vietnamese_restaurant', 'hamburger_restaurant',
    'brunch_restaurant', 'fast_food_restaurant', 'vegan_restaurant', 'vegetarian_restaurant',
    'cafe', 'coffee_shop', 'bar', 'wine_bar', 'pub',
    'bakery', 'ice_cream_shop', 'shopping_mall', 'supermarket', 'book_store',
    'clothing_store', 'jewelry_store', 'florist', 'gift_shop', 'pet_store',
    'shoe_store', 'sporting_goods_store', 'liquor_store', 'convenience_store',
    'night_club', 'movie_theater', 'bowling_alley', 'amusement_park', 'amusement_center',
    'park', 'national_park', 'museum', 'art_gallery', 'zoo', 'aquarium',
    'tourist_attraction', 'spa', 'gym', 'stadium', 'casino',
    'hotel', 'campground', 'parking', 'gas_station', 'car_rental',
    'pharmacy', 'hospital', 'dentist', 'doctor', 'beauty_salon', 'barber_shop',
    'bank', 'atm', 'laundry', 'car_wash', 'library',
  ]);
  if (includedTypes && Array.isArray(includedTypes) && includedTypes.length > 0) {
    const validType = includedTypes.find((t) => VALID_PLACE_TYPES.has(t));
    if (validType) body.includedType = validType;
  }
  if (center && center.latitude != null && center.longitude != null) {
    const radius = Math.min(radiusMeters || 50000, 50000); // Google Places max: 50000m
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
  const result = {
    places: data.places || [],
    nextPageToken: data.nextPageToken || null,
  };

  // Write to L1 + L2 cache (skip pagination results)
  if (!pageToken && center && result.places.length > 0) {
    const cacheKey = _getGeoCacheKey(textQuery, center, radiusMeters, languageCode, includedTypes);
    const docId = _sanitizeCacheKey(cacheKey);

    // L1: in-memory
    if (_placesL1Cache.size >= _PLACES_L1_MAX) {
      const oldest = _placesL1Cache.keys().next().value;
      _placesL1Cache.delete(oldest);
    }
    _placesL1Cache.set(docId, {data: result, time: Date.now()});

    // L2: Firestore (fire-and-forget, don't block response)
    admin.firestore().collection('placesCache').doc(docId).set({
      places: result.places.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        formattedAddress: p.formattedAddress,
        location: p.location,
        rating: p.rating || null,
        userRatingCount: p.userRatingCount || null,
        priceLevel: p.priceLevel || null,
        types: (p.types || []).slice(0, 5),
        photos: (p.photos || []).slice(0, 2),
        primaryType: p.primaryType || null,
        primaryTypeDisplayName: p.primaryTypeDisplayName || null,
        regularOpeningHours: p.regularOpeningHours || null,
        websiteUri: p.websiteUri || null,
        googleMapsUri: p.googleMapsUri || null,
      })),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      query: textQuery,
      lat: Math.round(center.latitude * 100) / 100,
      lng: Math.round(center.longitude * 100) / 100,
      radiusKm: Math.round((radiusMeters || 0) / 1000),
      lang: languageCode || 'es',
    }).catch((err) => logger.warn(`[placesCache] Write failed: ${err.message}`));
  }

  return result;
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

/**
 * Transforms a raw Google Places result into a date-suggestion object with distances, scores, and photos.
 * Returns null if the venue is inappropriate.
 * @param {Object} place - Raw Google Places place object
 * @param {{lat: number, lng: number}} currentUser - Current user's location
 * @param {{lat: number, lng: number}} otherUser - Match's location
 * @param {string} apiKey - Google Places API key (for photo URLs)
 * @param {Object} placesConfig - RC places search config
 * @param {Map<string, string>} igCacheMap - Pre-fetched Instagram handle cache
 * @returns {Object|null} Date suggestion object or null if venue is filtered out
 */
function transformPlaceToSuggestion(place, currentUser, otherUser, apiKey, placesConfig, igCacheMap) {
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

  // Use pre-fetched Instagram cache map (batch loaded by caller) or null
  const instagramData = igCacheMap ? igCacheMap.get(place.id) : null;

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
    instagramHandle: instagramData?.instagram || null,
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

/**
 * Build queries + per-query type filters for a category.
 * Strategy:
 * - <=3 types: one query per type (comprehensive, no cross-contamination)
 * - >3 types: generic type + no-filter text query + 2nd type (broad coverage)
 * - No category: random diverse queries without type filter
 *
 * @returns {{ queries: string[], typesPerQuery: (string|null)[] }}
 */
function buildCategoryQueries(category, catQueryMap, config) {
  const allCats = Object.keys(catQueryMap);

  if (category && catQueryMap[category]) {
    const categoryTypes = CATEGORY_TO_PLACES_TYPE[category] || [];
    const textQuery = catQueryMap[category];

    if (categoryTypes.length === 0) {
      return {queries: [textQuery], typesPerQuery: [null]};
    } else if (categoryTypes.length <= 3) {
      return {
        queries: categoryTypes.map(() => textQuery),
        typesPerQuery: [...categoryTypes],
      };
    } else {
      return {
        queries: [textQuery, textQuery, textQuery],
        typesPerQuery: [categoryTypes[0], null, categoryTypes[1]],
      };
    }
  } else {
    const queryCount = config.queriesWithoutCategory || 3;
    const shuffled = [...allCats].sort(() => Math.random() - 0.5);
    const queries = shuffled.slice(0, queryCount).map((k) => catQueryMap[k]);
    return {queries, typesPerQuery: queries.map(() => null)};
  }
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
  extractInstagramFromWebsite,
  findInstagramViaSearch,
  scrapeInstagramMetrics,
  buildCategoryQueries,
};
