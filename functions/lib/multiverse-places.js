'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { placesApiKey } = require('./shared');
const {
  haversineKm, estimateTravelMin, getCategoryQueryMap, getPlacesSearchConfig,
  placesTextSearch, transformPlaceToSuggestion, extractInstagramFromWebsite,
  scrapeInstagramMetrics, findInstagramViaSearch,
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
    const {userLocation, category, userLanguage, radius, loadCount, excludePlaceIds} = request.data || {};

    if (!userLocation || userLocation.latitude == null || userLocation.longitude == null) {
      throw new Error('userLocation with latitude and longitude is required');
    }

    try {
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

      // Build queries based on category
      let queries;
      if (category && catQueryMap[category]) {
        // Specific category: primary + supplementary queries
        const supplementaryCount = Math.max(0, config.queriesWithCategory - 1);
        const allCats = Object.keys(catQueryMap).filter((c) => c !== category);
        const shuffledCats = [...allCats].sort(() => Math.random() - 0.5);
        queries = [catQueryMap[category], ...shuffledCats.slice(0, supplementaryCount).map((k) => catQueryMap[k])];
        logger.info(`[getMultiUniversePlaces] Category '${category}' found. Using ${queries.length} queries`);
      } else {
        // No category: random diverse queries
        const queryCount = config.queriesWithoutCategory;
        const allCats = Object.keys(catQueryMap);
        const shuffled = [...allCats].sort(() => Math.random() - 0.5);
        queries = shuffled.slice(0, queryCount).map((k) => catQueryMap[k]);
        logger.info(`[getMultiUniversePlaces] Category '${category}' NOT found. Using ${queries.length} random queries`);
      }

      // Simple search at user's location with single radius (no progressive expansion for multi-universe)
      const radiusM = Math.min(maxR, userRadius);
      logger.info(`[getMultiUniversePlaces] Searching at radius=${radiusM / 1000}km from user location`);

      const results = await Promise.all(
        queries.map((q) => placesTextSearch(q, userLocation, radiusM, lang, null, maxResults, config.useRestriction).catch((err) => {
          logger.warn(`[getMultiUniversePlaces] Query failed: ${err.message}`);
          return {places: []};
        })),
      );

      const totalBeforeDedup = results.reduce((sum, r) => sum + (r.places?.length || 0), 0);
      const seen = new Set();
      const unique = results.flatMap((r) => r.places).filter((p) => {
        if (!p.id || seen.has(p.id) || excludeSet.has(p.id)) return false;
        seen.add(p.id);
        return true;
      }).slice(0, maxPlaces);

      logger.info(`[getMultiUniversePlaces] Results: ${unique.length}/${totalBeforeDedup} unique places (category='${category || 'all'}')`);

      // Transform to suggestions (user location is both currentUser and otherUser for scoring purposes)
      const userAsCurrentUser = {lat: userLocation.latitude, lng: userLocation.longitude, id: request.auth.uid};
      const userAsOtherUser = {lat: userLocation.latitude, lng: userLocation.longitude, id: request.auth.uid};

      // Validate user coordinates are real (not 0,0 or null)
      if (userAsCurrentUser.lat === 0 && userAsCurrentUser.lng === 0) {
        logger.warn(`[getMultiUniversePlaces] User location is (0,0) — invalid coordinates`);
        return {success: false, error: 'Invalid user location', suggestions: []};
      }

      const filtered = await Promise.all(unique.map((p) => transformPlaceToSuggestion(p, userAsCurrentUser, userAsOtherUser, apiKey, config)));
      const suggestions = filtered.filter(Boolean);
      const blockedByFilter = filtered.length - suggestions.length;
      if (blockedByFilter > 0) {
        logger.warn(`[getMultiUniversePlaces] ${blockedByFilter} places filtered by isInappropriateVenue`);
      }

      // Extract and scrape Instagram handles for places (in parallel, non-blocking)
      const db = admin.firestore();
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
