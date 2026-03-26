'use strict';
const {logger} = require('firebase-functions/v2');
const admin = require('firebase-admin');
const {defineSecret} = require('firebase-functions/params');

const ticketmasterApiKey = defineSecret('TICKETMASTER_API_KEY');
const eventbriteToken = defineSecret('EVENTBRITE_TOKEN');

// ── Config defaults ──────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  enabled: true,
  cacheHours: 6,
  maxEventsPerQuery: 10,
  radiusKm: 30,
  searchDaysAhead: 14,
  categories: ['music', 'food', 'art', 'sports', 'comedy', 'theater', 'festivals', 'nightlife'],
};

let _eventsConfigCache = null;
let _eventsConfigCacheTime = 0;

async function getEventsConfig() {
  if (_eventsConfigCache && Date.now() - _eventsConfigCacheTime < 5 * 60 * 1000) return _eventsConfigCache;
  try {
    const doc = await admin.firestore().collection('appConfig').doc('events').get();
    _eventsConfigCache = doc.exists ? {...DEFAULT_CONFIG, ...doc.data()} : DEFAULT_CONFIG;
  } catch (e) {
    _eventsConfigCache = DEFAULT_CONFIG;
  }
  _eventsConfigCacheTime = Date.now();
  return _eventsConfigCache;
}

// ── Ticketmaster API ─────────────────────────────────────────────────────────

async function searchTicketmaster(lat, lng, radiusKm, lang, category, maxResults) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) return [];

  try {
    const params = new URLSearchParams({
      apikey: apiKey,
      latlong: `${lat},${lng}`,
      radius: String(Math.min(radiusKm, 200)),
      unit: 'km',
      size: String(maxResults),
      sort: 'date,asc',
      locale: lang === 'es' ? 'es' : lang === 'pt' ? 'pt-br' : lang === 'fr' ? 'fr-fr' : lang === 'de' ? 'de-de' : 'en-us',
    });

    // Map internal categories to Ticketmaster classification
    const tmClassification = {
      music: 'KZFzniwnSyZfZ7v7nJ', // Music
      sports: 'KZFzniwnSyZfZ7v7nE', // Sports
      art: 'KZFzniwnSyZfZ7v7na',    // Arts & Theatre
      theater: 'KZFzniwnSyZfZ7v7na', // Arts & Theatre
      comedy: 'KZFzniwnSyZfZ7v7na',  // Arts & Theatre
      festivals: 'KZFzniwnSyZfZ7v7nJ', // Music (festivals mostly)
    };
    if (category && tmClassification[category]) {
      params.set('classificationId', tmClassification[category]);
    }

    const startDate = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const endDate = new Date(Date.now() + 14 * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    params.set('startDateTime', startDate);
    params.set('endDateTime', endDate);

    const resp = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`, {
      headers: {'Accept': 'application/json'},
    });

    if (!resp.ok) {
      logger.warn(`[Events] Ticketmaster ${resp.status}: ${resp.statusText}`);
      return [];
    }

    const data = await resp.json();
    const events = data._embedded?.events || [];

    return events.slice(0, maxResults).map(e => {
      const venue = e._embedded?.venues?.[0] || {};
      const priceRange = e.priceRanges?.[0];
      const image = e.images?.find(i => i.width >= 300) || e.images?.[0];
      const startLocal = e.dates?.start?.localDate || '';
      const startTime = e.dates?.start?.localTime || '';

      return {
        name: e.name || '',
        date: startLocal,
        time: startTime ? startTime.substring(0, 5) : '',
        venue: venue.name || '',
        address: [venue.address?.line1, venue.city?.name, venue.country?.name].filter(Boolean).join(', '),
        lat: parseFloat(venue.location?.latitude) || null,
        lng: parseFloat(venue.location?.longitude) || null,
        category: mapTmCategory(e.classifications?.[0]),
        ticketUrl: e.url || '',
        imageUrl: image?.url || '',
        source: 'ticketmaster',
        price: priceRange ? `$${priceRange.min}-${priceRange.max}` : null,
        id: e.id,
      };
    });
  } catch (e) {
    logger.warn(`[Events] Ticketmaster error: ${e.message}`);
    return [];
  }
}

function mapTmCategory(classification) {
  if (!classification) return 'other';
  const segment = (classification.segment?.name || '').toLowerCase();
  const genre = (classification.genre?.name || '').toLowerCase();
  if (segment.includes('music') || genre.includes('rock') || genre.includes('pop') || genre.includes('jazz')) return 'music';
  if (segment.includes('sport')) return 'sports';
  if (segment.includes('art') || segment.includes('theatre')) return 'theater';
  if (genre.includes('comedy') || genre.includes('comedia')) return 'comedy';
  if (genre.includes('festival')) return 'festivals';
  return 'other';
}

// ── Eventbrite API ───────────────────────────────────────────────────────────

async function searchEventbrite(lat, lng, radiusKm, lang, category, maxResults) {
  const token = process.env.EVENTBRITE_TOKEN;
  if (!token) return [];

  try {
    const params = new URLSearchParams({
      'location.latitude': String(lat),
      'location.longitude': String(lng),
      'location.within': `${Math.min(radiusKm, 200)}km`,
      'start_date.range_start': new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      'start_date.range_end': new Date(Date.now() + 14 * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      'expand': 'venue',
      'page_size': String(maxResults),
    });

    const ebCategories = {
      music: '103', food: '110', art: '105', sports: '108',
      comedy: '104', theater: '105', festivals: '103', nightlife: '103',
    };
    if (category && ebCategories[category]) {
      params.set('categories', ebCategories[category]);
    }

    const resp = await fetch(`https://www.eventbriteapi.com/v3/events/search/?${params}`, {
      headers: {'Authorization': `Bearer ${token}`, 'Accept': 'application/json'},
    });

    if (!resp.ok) {
      logger.warn(`[Events] Eventbrite ${resp.status}: ${resp.statusText}`);
      return [];
    }

    const data = await resp.json();
    const events = data.events || [];

    return events.slice(0, maxResults).map(e => {
      const venue = e.venue || {};
      const startUtc = e.start?.local || '';

      return {
        name: e.name?.text || '',
        date: startUtc ? startUtc.substring(0, 10) : '',
        time: startUtc ? startUtc.substring(11, 16) : '',
        venue: venue.name || '',
        address: [venue.address?.address_1, venue.address?.city, venue.address?.country].filter(Boolean).join(', '),
        lat: parseFloat(venue.latitude) || null,
        lng: parseFloat(venue.longitude) || null,
        category: category || 'other',
        ticketUrl: e.url || '',
        imageUrl: e.logo?.url || '',
        source: 'eventbrite',
        price: e.is_free ? 'Free' : null,
        id: e.id,
      };
    });
  } catch (e) {
    logger.warn(`[Events] Eventbrite error: ${e.message}`);
    return [];
  }
}

// ── Main: Fetch events from all sources ──────────────────────────────────────

/**
 * Fetch local events from Ticketmaster + Eventbrite.
 * Uses Firestore cache (configurable TTL).
 * @param {number} lat
 * @param {number} lng
 * @param {number} radiusKm
 * @param {string} lang
 * @param {string|null} category
 * @returns {Promise<Array>} events sorted by date
 */
async function fetchLocalEvents(lat, lng, radiusKm, lang, category) {
  const config = await getEventsConfig();
  if (!config.enabled) return [];

  const radius = radiusKm || config.radiusKm || 30;
  const maxResults = config.maxEventsPerQuery || 10;

  // Check cache
  const regionHash = `${Math.round(lat * 10)}_${Math.round(lng * 10)}_${category || 'all'}`;
  const db = admin.firestore();
  try {
    const cacheDoc = await db.collection('eventCache').doc(regionHash).get();
    if (cacheDoc.exists) {
      const cache = cacheDoc.data();
      const age = Date.now() - (cache.fetchedAt?.toMillis?.() || 0);
      if (age < (config.cacheHours || 6) * 3600000 && cache.events?.length > 0) {
        logger.info(`[Events] Cache hit: ${cache.events.length} events (age: ${Math.round(age / 60000)}min)`);
        return cache.events;
      }
    }
  } catch (e) {
    // Cache miss — continue to fetch
  }

  // Fetch from APIs in parallel
  const [tmEvents, ebEvents] = await Promise.all([
    searchTicketmaster(lat, lng, radius, lang, category, maxResults).catch(() => []),
    searchEventbrite(lat, lng, radius, lang, category, maxResults).catch(() => []),
  ]);

  // Merge + dedup by name similarity
  const allEvents = [...tmEvents, ...ebEvents];
  const seen = new Set();
  const unique = allEvents.filter(e => {
    const key = e.name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by date (soonest first)
  unique.sort((a, b) => {
    const dA = `${a.date}T${a.time || '00:00'}`;
    const dB = `${b.date}T${b.time || '00:00'}`;
    return dA.localeCompare(dB);
  });

  const result = unique.slice(0, maxResults);

  // Cache results
  if (result.length > 0) {
    try {
      await db.collection('eventCache').doc(regionHash).set({
        lat, lng, radius, category: category || 'all',
        events: result,
        fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      logger.warn(`[Events] Cache write error: ${e.message}`);
    }
  }

  logger.info(`[Events] Fetched ${result.length} events (TM: ${tmEvents.length}, EB: ${ebEvents.length}) for ${lat.toFixed(2)},${lng.toFixed(2)}`);
  return result;
}

// ── Category emoji map ───────────────────────────────────────────────────────

const EVENT_CATEGORY_EMOJI = {
  music: '🎵', food: '🍔', art: '🎨', sports: '🏃', comedy: '😂',
  theater: '🎭', festivals: '🎪', workshops: '📚', games: '🎲',
  nightlife: '💃', other: '🎉',
};

// ── Callable: searchEvents ────────────────────────────────────────────────────

const {onCall} = require('firebase-functions/v2/https');

/**
 * Callable CF: Search events near a match's midpoint or user's location.
 * Payload: { matchId?, query?, category?, lat?, lng?, radiusKm? }
 * Response: { success, events: [{name, date, time, venue, address, lat, lng, category, ticketUrl, imageUrl, source, price}] }
 */
exports.searchEvents = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 30, secrets: [ticketmasterApiKey, eventbriteToken]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {matchId, query, category, lat, lng, radiusKm} = request.data || {};
    const userId = request.auth.uid;
    const lang = request.data?.userLanguage || 'en';

    try {
      let searchLat = lat;
      let searchLng = lng;

      // If matchId provided, use midpoint of both users
      if (matchId && (!searchLat || !searchLng)) {
        try {
          const {getMatchUsersLocations, calculateMidpoint} = require('./places-helpers');
          const {currentUser, otherUser, midpoint} = await getMatchUsersLocations(matchId, userId);
          searchLat = midpoint.latitude;
          searchLng = midpoint.longitude;
        } catch (e) {
          // Fallback to user's location
          const userDoc = await admin.firestore().collection('users').doc(userId).get();
          if (userDoc.exists) {
            searchLat = userDoc.data().latitude;
            searchLng = userDoc.data().longitude;
          }
        }
      }

      // If still no location, try user doc
      if (!searchLat || !searchLng) {
        const userDoc = await admin.firestore().collection('users').doc(userId).get();
        if (userDoc.exists) {
          searchLat = userDoc.data().latitude;
          searchLng = userDoc.data().longitude;
        }
      }

      if (!searchLat || !searchLng) {
        return {success: false, error: 'no_location', events: []};
      }

      const events = await fetchLocalEvents(searchLat, searchLng, radiusKm || 30, lang, category || null);
      return {success: true, events};
    } catch (err) {
      logger.error(`[searchEvents] Error: ${err.message}`);
      return {success: false, error: err.message, events: []};
    }
  },
);

module.exports = {
  ...module.exports,
  fetchLocalEvents,
  getEventsConfig,
  EVENT_CATEGORY_EMOJI,
  ticketmasterApiKey,
  eventbriteToken,
  searchEvents: exports.searchEvents,
};
