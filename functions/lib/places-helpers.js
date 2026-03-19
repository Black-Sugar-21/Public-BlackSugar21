'use strict';
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { geminiApiKey, placesApiKey, AI_MODEL_NAME, normalizeCategory, categoryEmojiMap } = require('./shared');
const { haversineDistanceKm } = require('./geo');

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
  if (key && key.length >= 3) {
    for (const rp of allPlaces) {
      const rpName = (rp.name || '').toLowerCase().trim();
      if (rpName.length < 3) continue;
      if (key.includes(rpName) || rpName.includes(key)) return rp;
    }
  }
  return null;
}

/** Mapa de categorías a tipos Google Places API (New) */
const CATEGORY_TO_PLACES_TYPE = {
  cafe: 'cafe',
  restaurant: 'restaurant',
  bar: 'bar',
  night_club: 'night_club',
  movie_theater: 'movie_theater',
  park: 'park',
  museum: 'museum',
  bowling_alley: 'bowling_alley',
  art_gallery: 'art_gallery',
  bakery: 'bakery',
  shopping_mall: 'shopping_mall',
  spa: 'spa',
  aquarium: 'aquarium',
  zoo: 'zoo',
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

/** Default category query map — hardcoded fallback when Remote Config is unavailable. */
const DEFAULT_CATEGORY_QUERY_MAP = {
  cafe: 'café coffee shop cafetería coffeehouse specialty coffee',
  restaurant: 'restaurant restaurante fine dining bistro trattoria steakhouse',
  bar: 'bar pub cervecería brewery cocktail lounge speakeasy taproom wine bar',
  night_club: 'nightclub discoteca club nocturno disco dance club karaoke',
  movie_theater: 'movie theater cinema cine multiplex sala de cine',
  park: 'park parque jardín botánico botanical garden plaza mirador',
  museum: 'museum museo gallery exhibition centro cultural',
  bowling_alley: 'bowling boliche bowling alley arcade billar',
  art_gallery: 'art gallery galería de arte exhibition contemporary art',
  bakery: 'bakery panadería pastelería patisserie confitería repostería',
  shopping_mall: 'shopping mall centro comercial outlet tienda boutique',
  spa: 'spa wellness masajes termas sauna relax centro de bienestar',
  aquarium: 'aquarium acuario oceanario sea life marine',
  zoo: 'zoo zoológico safari park bioparque wildlife sanctuary',
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
  // Reject generic/hallucinated words
  const genericWords = ['instagram', 'insta', 'follow', 'ig', 'like', 'photo', 'pic',
    'foodie', 'love', 'this', 'here', 'comida', 'bar', 'restaurante', 'cafe',
    'restaurant', 'unknown', 'null', 'none', 'na', 'n_a', 'not_available',
    'no_instagram', 'no_ig', 'handle', 'username', 'example'];
  if (genericWords.includes(clean.toLowerCase())) return false;
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
  if (center && center.latitude && center.longitude) {
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
function transformPlaceToSuggestion(place, currentUser, otherUser, apiKey, placesConfig) {
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
  sanitizeWebsiteUrl,
  placesTextSearch,
  transformPlaceToSuggestion,
};
