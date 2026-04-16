'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { placesApiKey } = require('./shared');
const {
  haversineKm, estimateTravelMin, getCategoryQueryMap, getPlacesSearchConfig,
  placesTextSearch, transformPlaceToSuggestion, extractInstagramFromWebsite,
  scrapeInstagramMetrics, findInstagramViaSearch, CATEGORY_TO_PLACES_TYPE,
} = require('./places-helpers');

/**
 * Callable: Get place suggestions for multi-universe simulation (activity-based, single user location)
 * Payload: { userLocation: {latitude, longitude}, category, userLanguage?, radius?, loadCount? }
 * Response: { success, suggestions: [PlaceSuggestion], hasMore? }
 *
 * Different from getDateSuggestions:
 * - Single user location (current user) instead of midpoint between two users
 * - Uses configurable radius instead of progressive radius between users
 * - Ideal for multi-universe simulation where you're exploring an activity, not a match
 * - No matchId required
 */
exports.getMultiUniversePlaces = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60, secrets: [placesApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {category, userLanguage, radius, loadCount, excludePlaceIds, matchId, searchQuery} = request.data || {};

    try {
      // Fetch current user's location from Firestore (server-side, no need to send from client)
      const currentUserDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
      const currentUserData = currentUserDoc.data() || {};
      const userLocation = {
        latitude: currentUserData.latitude || 0,
        longitude: currentUserData.longitude || 0,
      };

      if (userLocation.latitude === 0 && userLocation.longitude === 0) {
        return {success: false, error: 'User location not available. Please enable location services.', suggestions: []};
      }

      // Read dynamic config from Remote Config
      const config = await getPlacesSearchConfig();
      const catQueryMap = getCategoryQueryMap(config);
      const step = Math.min(Math.max(0, loadCount || 0), config.maxLoadCount || 20);

      logger.info(`[getMultiUniversePlaces] category=${category || 'all'} location=(${userLocation.latitude.toFixed(2)},${userLocation.longitude.toFixed(2)}) step=${step}`);

      if (!config.enabled) {
        return {success: false, error: 'Place search is currently disabled', suggestions: []};
      }

      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      const lang = userLanguage || config.defaultLanguage || 'es';

      // For multi-universe: use provided radius or default to 100km
      const defaultRadius = 100000; // 100km for single-user exploration (larger radius to ensure results)
      const userRadius = radius || defaultRadius;
      const maxResults = config.perQueryResults;
      const maxPlaces = config.maxPlacesIntermediate;
      const maxR = config.maxRadius || 300000;

      // Set of placeIds to exclude (for "load more" dedup)
      const excludeSet = new Set(Array.isArray(excludePlaceIds) ? excludePlaceIds : []);

      // Build queries based on searchQuery (free text) or category (predefined)
      let queries;
      let includedTypes = null;
      const trimmedSearch = (searchQuery || '').trim();

      if (trimmedSearch.length >= 2) {
        // Free text search: user typed a place name (e.g., "baque", "starbucks")
        queries = [trimmedSearch];
        logger.info(`[getMultiUniversePlaces] Text search: '${trimmedSearch}'`);
      } else if (category && catQueryMap[category]) {
        // One query per place type for comprehensive results
        // Google Places includedType only accepts ONE type, so we send parallel queries
        const categoryTypes = CATEGORY_TO_PLACES_TYPE[category] || [];
        const textQuery = catQueryMap[category];
        if (categoryTypes.length > 0) {
          // Send one query per type (e.g., cafe → "cafe query" + "coffee_shop query")
          queries = categoryTypes.slice(0, 3).map(() => textQuery);
          includedTypes = categoryTypes.slice(0, 3); // Will be used per-query below
        } else {
          queries = [textQuery];
        }
        logger.info(`[getMultiUniversePlaces] Category '${category}' → ${categoryTypes.slice(0, 3).join(',')} (${queries.length} queries)`);
      } else {
        // No category: random diverse queries
        const queryCount = config.queriesWithoutCategory;
        const allCats = Object.keys(catQueryMap);
        const shuffled = [...allCats].sort(() => Math.random() - 0.5);
        queries = shuffled.slice(0, queryCount).map((k) => catQueryMap[k]);
        logger.info(`[getMultiUniversePlaces] No category/search. Using ${queries.length} random queries`);
      }

      // Simple search at user's location with single radius
      const radiusM = Math.min(maxR, userRadius);
      logger.info(`[getMultiUniversePlaces] Searching at radius=${radiusM / 1000}km from user location, types=${includedTypes ? includedTypes.join(',') : 'none'}`);

      const results = await Promise.all(
        queries.map((q, i) => {
          // Per-query type filter: each query gets its own type from the array
          const typeForQuery = Array.isArray(includedTypes) ? [includedTypes[i]] : includedTypes;
          return placesTextSearch(q, userLocation, radiusM, lang, null, maxResults, config.useRestriction, typeForQuery).catch((err) => {
            logger.warn(`[getMultiUniversePlaces] Query failed: ${err.message}`);
            return {places: []};
          });
        }),
      );

      const totalBeforeDedup = results.reduce((sum, r) => sum + (r.places?.length || 0), 0);
      const seen = new Set();
      const unique = results.flatMap((r) => r.places).filter((p) => {
        if (!p.id || seen.has(p.id) || excludeSet.has(p.id)) return false;
        seen.add(p.id);
        return true;
      }).slice(0, maxPlaces);

      logger.info(`[getMultiUniversePlaces] Results: ${unique.length}/${totalBeforeDedup} unique places (category='${category || 'all'}')`);

      // Transform to suggestions — both locations fetched from Firestore (server-side)
      const userAsCurrentUser = {lat: userLocation.latitude, lng: userLocation.longitude, id: request.auth.uid};

      // If matchId provided, fetch partner's location from match document
      let userAsOtherUser = userAsCurrentUser; // Default: solo mode (same location)
      if (matchId) {
        try {
          const matchDoc = await admin.firestore().collection('matches').doc(matchId).get();
          if (matchDoc.exists) {
            const usersMatched = matchDoc.data().usersMatched || [];
            const otherUserId = usersMatched.find((uid) => uid !== request.auth.uid);
            if (otherUserId) {
              const otherUserDoc = await admin.firestore().collection('users').doc(otherUserId).get();
              const otherData = otherUserDoc.data() || {};
              if (otherData.latitude && otherData.longitude) {
                userAsOtherUser = {lat: otherData.latitude, lng: otherData.longitude, id: otherUserId};
                logger.info(`[getMultiUniversePlaces] Match mode: partner at (${otherData.latitude.toFixed(2)},${otherData.longitude.toFixed(2)})`);
              }
            }
          }
        } catch (err) {
          logger.warn(`[getMultiUniversePlaces] Failed to fetch match location: ${err.message}`);
        }
      }

      // Batch-fetch cached Instagram data (avoid N+1 Firestore reads)
      const db = admin.firestore();
      const placeIds = unique.map((p) => p.id).filter(Boolean);
      const igCacheMap = new Map();
      if (placeIds.length > 0) {
        const batches = [];
        for (let i = 0; i < placeIds.length; i += 30) {
          batches.push(placeIds.slice(i, i + 30));
        }
        const batchResults = await Promise.all(
          batches.map((batch) =>
            db.collection('placeInstagram').where('placeId', 'in', batch).get().catch(() => ({docs: []})),
          ),
        );
        for (const snap of batchResults) {
          for (const doc of snap.docs) {
            igCacheMap.set(doc.id, doc.data());
          }
        }
        logger.info(`[getMultiUniversePlaces] Pre-fetched ${igCacheMap.size} cached Instagram entries`);
      }

      const filtered = await Promise.all(unique.map((p) => transformPlaceToSuggestion(p, userAsCurrentUser, userAsOtherUser, apiKey, config, igCacheMap)));
      const suggestions = filtered.filter(Boolean);
      const blockedByFilter = filtered.length - suggestions.length;
      if (blockedByFilter > 0) {
        logger.warn(`[getMultiUniversePlaces] ${blockedByFilter} places filtered by isInappropriateVenue`);
      }

      // Extract and scrape Instagram handles for places (in parallel, non-blocking)
      const instagramTasks = suggestions.map(async (suggestion) => {
        try {
          if (!suggestion.id) return;

          let handle = null;
          let source = null;

          // Step 1: Try extracting from website HTML
          if (suggestion.website) {
            handle = await extractInstagramFromWebsite(suggestion.website);
            if (handle) source = 'website';
          }

          // Step 2: Fallback to Google Search Grounding if not found
          if (!handle && suggestion.address) {
            handle = await findInstagramViaSearch(suggestion.name, suggestion.address, apiKey);
            if (handle) source = 'search';
          }

          if (handle) {
            // Scrape Instagram metrics in background
            const metrics = await scrapeInstagramMetrics(handle);

            // Cache results in Firestore (non-blocking)
            await db.collection('placeInstagram').doc(suggestion.id).set({
              placeId: suggestion.id,
              placeName: suggestion.name || '',
              instagram: handle,
              source: source || 'unknown',
              verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
              websiteUrl: suggestion.website || null,
              ...(metrics ? {
                followers: metrics.followers,
                posts: metrics.posts,
                lastPostDate: metrics.lastPostDate || null,
                isActive: metrics.isActive,
                isPrivate: metrics.isPrivate || false,
                igScore: metrics.igScore || 0,
              } : {}),
            }).catch((err) => {
              logger.warn(`[getMultiUniversePlaces] Failed to cache Instagram for place ${suggestion.id}: ${err.message}`);
            });
          }
        } catch (err) {
          logger.warn(`[getMultiUniversePlaces] Instagram scraping failed for place ${suggestion.id}: ${err.message}`);
        }
      });

      // Fire off Instagram scraping tasks in background (don't wait for completion)
      Promise.allSettled(instagramTasks).catch((err) => {
        logger.warn(`[getMultiUniversePlaces] Background Instagram scraping error: ${err.message}`);
      });

      suggestions.sort((a, b) => b.score - a.score);

      const hasMore = radiusM < maxR; // Simple: can expand radius if needed
      logger.info(`[getMultiUniversePlaces] SUCCESS: ${suggestions.length} suggestions (radius=${radiusM / 1000}km, category='${category || 'all'}')`);

      return {success: true, suggestions, hasMore};
    } catch (err) {
      logger.error(`[getMultiUniversePlaces] Error: ${err.message}`);
      return {success: false, error: err.message, suggestions: []};
    }
  },
);
