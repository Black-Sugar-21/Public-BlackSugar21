/**
 * geo.js — Geographic utilities: haversine, geohash, geocoding
 * Extracted from index.js during modularization
 */
'use strict';

const {logger} = require('firebase-functions/v2');

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDADES GEOGRÁFICAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcula la distancia en km entre dos coordenadas (fórmula Haversine).
 * Homologado con GeoHashUtils.distance() en Android e iOS.
 */
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Codifica coordenadas a geohash base32.
 * Algoritmo idéntico a GeoHashUtils.encode() de iOS y Android.
 * @param {number} latitude
 * @param {number} longitude
 * @param {number} precision - Caracteres del geohash (default 9 ≈ 4.77m×4.77m)
 * @return {string} geohash
 */
const GEOHASH_BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
function encodeGeohash(latitude, longitude, precision = 9) {
  let lat = [latitude, -90.0, 90.0];
  let lon = [longitude, -180.0, 180.0];
  let geohash = '';
  let isEven = true;
  let bit = 0;
  let ch = 0;

  while (geohash.length < precision) {
    if (isEven) {
      const mid = (lon[1] + lon[2]) / 2;
      if (lon[0] > mid) {
        ch |= (1 << (4 - bit));
        lon[1] = mid;
      } else {
        lon[2] = mid;
      }
    } else {
      const mid = (lat[1] + lat[2]) / 2;
      if (lat[0] > mid) {
        ch |= (1 << (4 - bit));
        lat[1] = mid;
      } else {
        lat[2] = mid;
      }
    }
    isEven = !isEven;
    if (bit < 4) {
      bit++;
    } else {
      geohash += GEOHASH_BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return geohash;
}

/**
 * Calcula la precisión óptima del geohash basada en el radio de búsqueda.
 * Homologado con GeoHashUtils.precisionForRadius() de iOS y Android.
 */
function precisionForRadius(radiusInKm) {
  if (radiusInKm > 630) return 2;
  if (radiusInKm > 78) return 3;
  if (radiusInKm > 20) return 4;
  if (radiusInKm > 2.4) return 5;
  if (radiusInKm > 0.61) return 6;
  if (radiusInKm > 0.076) return 7;
  if (radiusInKm > 0.019) return 8;
  return 9;
}

/**
 * Normaliza longitud al rango [-180, 180].
 * Homologado con GeoHashUtils.normalizeLongitude() de iOS y Android.
 */
function normalizeLongitude(lon) {
  let normalized = lon % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized < -180) normalized += 360;
  return normalized;
}

/**
 * Genera rangos de geohash para consulta geográfica.
 * Calcula el centro + 8 puntos cardinales/intercardinales en el borde del radio.
 * Homologado con GeoHashUtils.queryBounds() de iOS y Android (hasta 9 rangos únicos).
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {number} radiusInKm
 * @return {Array<{start: string, end: string}>}
 */
function queryBoundsForRadius(latitude, longitude, radiusInKm) {
  const precision = precisionForRadius(radiusInKm);

  // Geohash del centro
  const hashes = new Set();
  hashes.add(encodeGeohash(latitude, longitude, precision));

  // Offsets para N, NE, E, SE, S, SW, W, NW
  const offsets = [
    [1, 0], [1, 1], [0, 1], [-1, 1],
    [-1, 0], [-1, -1], [0, -1], [1, -1],
  ];

  // km → grados
  const latDelta = radiusInKm / 110.574;
  const cosLat = Math.cos(latitude * Math.PI / 180);
  const lonDelta = cosLat > 0.001 ? radiusInKm / (111.320 * cosLat) : radiusInKm / 111.320;

  for (const [dLat, dLon] of offsets) {
    const edgeLat = Math.min(90, Math.max(-90, latitude + dLat * latDelta));
    const edgeLon = normalizeLongitude(longitude + dLon * lonDelta);
    hashes.add(encodeGeohash(edgeLat, edgeLon, precision));
  }

  // Convertir cada hash único a un rango de query
  return Array.from(hashes).sort().map((h) => ({start: h, end: h + '~'}));
}

/**
 * Calcula la edad en años a partir de un Firestore Timestamp o Date.
 */
function calcAge(birthDate) {
  if (!birthDate) return 0;
  const birth = birthDate.toDate ? birthDate.toDate() : new Date(birthDate);
  const ageDiff = Date.now() - birth.getTime();
  return Math.floor(ageDiff / (365.25 * 24 * 60 * 60 * 1000));
}

// ─────────────────────────────────────────────────────────────────────────────
// GEOCODING (reverse + forward) — cached per userId / cityName
// ─────────────────────────────────────────────────────────────────────────────

// In-memory cache for reverse geocoded city names (per userId, TTL 30min)
const _cityCache = {};
const CITY_CACHE_TTL = 30 * 60 * 1000;

// In-memory cache for forward geocoded city → coordinates (keyed by normalized city name, TTL 30min)
const _forwardGeoCache = {};

/**
 * Reverse geocode lat/lng to city name using Google Geocoding API.
 * Returns cached value if available and fresh.
 * @param {number} lat
 * @param {number} lng
 * @param {string} userId - for caching
 * @return {Promise<string|null>} city name or null
 */
async function reverseGeocode(lat, lng, userId) {
  const cached = _cityCache[userId];
  if (cached && (Date.now() - cached.ts) < CITY_CACHE_TTL) return cached.city;
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&result_type=locality&language=en`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const result = data.results && data.results[0];
    const city = result ? (result.address_components || []).find((c) => (c.types || []).includes('locality'))?.long_name || null : null;
    _cityCache[userId] = {city, ts: Date.now()};
    return city;
  } catch (e) {
    logger.warn(`[reverseGeocode] Failed: ${e.message}`);
    return null;
  }
}

/**
 * Forward geocode a city/location name to coordinates using Google Geocoding API.
 * Returns cached value if available and fresh.
 * @param {string} cityName - city or area name to geocode
 * @return {Promise<{latitude: number, longitude: number}|null>} coordinates or null
 */
async function forwardGeocode(cityName) {
  if (!cityName || typeof cityName !== 'string' || cityName.trim().length < 2) return null;
  const normalized = cityName.trim().toLowerCase();
  const cached = _forwardGeoCache[normalized];
  if (cached && (Date.now() - cached.ts) < CITY_CACHE_TTL) return cached.coords;
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;
  try {
    const encoded = encodeURIComponent(cityName.trim());
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const result = data.results && data.results[0];
    if (!result || !result.geometry || !result.geometry.location) return null;
    const coords = {latitude: result.geometry.location.lat, longitude: result.geometry.location.lng};
    _forwardGeoCache[normalized] = {coords, ts: Date.now()};
    logger.info(`[forwardGeocode] "${cityName}" → ${coords.latitude},${coords.longitude}`);
    return coords;
  } catch (e) {
    logger.warn(`[forwardGeocode] Failed for "${cityName}": ${e.message}`);
    return null;
  }
}

module.exports = {
  haversineDistanceKm,
  GEOHASH_BASE32,
  encodeGeohash,
  precisionForRadius,
  normalizeLongitude,
  queryBoundsForRadius,
  calcAge,
  reverseGeocode,
  forwardGeocode,
};
