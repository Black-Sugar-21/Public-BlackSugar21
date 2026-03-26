'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const { placesApiKey } = require('./shared');
const { forwardGeocode } = require('./geo');
const {
  calculateMidpoint, haversineKm, estimateTravelMin, getMatchUsersLocations,
  fuzzyMatchPlace, getPlacesSearchConfig, getCategoryQueryMap,
  googlePriceLevelToString, sanitizeInstagramHandle, sanitizeWebsiteUrl,
  placesTextSearch, transformPlaceToSuggestion, detectBrandType,
} = require('./places-helpers');

exports.getDateSuggestions = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60, secrets: [placesApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {matchId, userLanguage, category, pageToken, loadCount, excludePlaceIds} = request.data || {};
    if (!matchId) throw new Error('matchId is required');

    const currentUserId = request.auth.uid;

    try {
      // Read dynamic config from Remote Config
      const config = await getPlacesSearchConfig();
      const catQueryMap = getCategoryQueryMap(config);
      const step = Math.min(Math.max(0, loadCount || 0), config.maxLoadCount || 20);
      logger.info(`[getDateSuggestions] matchId=${matchId} category=${category || 'all'} page=${!!pageToken} loadCount=${step}`);

      const {currentUser, otherUser, midpoint} = await getMatchUsersLocations(matchId, currentUserId);
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      const lang = userLanguage || config.defaultLanguage || 'es';
      if (!config.enabled) {
        return {success: false, error: 'Place suggestions are currently disabled', suggestions: []};
      }

      // Progressive radius from config
      const radiusSteps = config.radiusSteps;
      const stepIndex = Math.min(step, radiusSteps.length - 1);
      const radiusMeters = radiusSteps[stepIndex];
      const maxResults = config.perQueryResults;
      const maxPlaces = config.maxPlacesIntermediate;

      // Set of placeIds to exclude (for "load more" dedup)
      const excludeSet = new Set(Array.isArray(excludePlaceIds) ? excludePlaceIds : []);

      // Pagination path: single query with pageToken (backward compatible)
      if (pageToken) {
        const catQuery = (category && catQueryMap[category]) ? catQueryMap[category] : 'restaurant café bar';
        const {places, nextPageToken: npt} = await placesTextSearch(
          catQuery, midpoint, radiusMeters, lang, pageToken, maxResults,
        );
        const suggestions = places.map((p) => transformPlaceToSuggestion(p, currentUser, otherUser, apiKey, config)).filter(Boolean);
        suggestions.sort((a, b) => b.score - a.score);
        const result = {success: true, suggestions, hasMore: !!npt || stepIndex < radiusSteps.length - 1};
        if (npt) result.nextPageToken = npt;
        return result;
      }

      // Multi-query parallel search (dynamic query counts from config)
      let queries;
      if (category && catQueryMap[category]) {
        // Specific category: primary + supplementary (queriesWithCategory - 1)
        const supplementaryCount = Math.max(0, config.queriesWithCategory - 1);
        const allCats = Object.keys(catQueryMap).filter((c) => c !== category);
        const shuffledCats = [...allCats].sort(() => Math.random() - 0.5);
        queries = [catQueryMap[category], ...shuffledCats.slice(0, supplementaryCount).map((k) => catQueryMap[k])];
      } else {
        // No category: random diverse category queries
        const queryCount = config.queriesWithoutCategory;
        const allCats = Object.keys(catQueryMap);
        const shuffled = [...allCats].sort(() => Math.random() - 0.5);
        queries = shuffled.slice(0, queryCount).map((k) => catQueryMap[k]);
      }

      // Progressive radius strategy (same as Coach IA — configurable via RC places_search_config):
      // Initial (step=0): start small (15km), expand progressively until minTarget results
      // LoadMore (step>0): exponential expansion from base radius, no repeated placeIds
      const progressiveSteps = Array.isArray(config.progressiveRadiusSteps) && config.progressiveRadiusSteps.length > 0
        ? config.progressiveRadiusSteps : [15000, 30000, 60000, 120000, 200000, 300000];
      const minTarget = config.minPlacesTarget || 30;
      const maxR = config.maxRadius || 300000;
      const pMinR = config.minRadius || 3000;
      // Minimum radius to cover both users of the match
      const userDistKm = haversineKm(currentUser.lat, currentUser.lng, otherUser.lat, otherUser.lng);
      const computedMinR = userDistKm / 2 * 1000 + pMinR;

      let unique;
      let lastRadiusUsed = 0;

      if (step === 0) {
        // Initial load: progressive radius loop — start small, expand until minTarget results
        const effectiveSteps = progressiveSteps.filter((s) => s >= computedMinR).length > 0
          ? progressiveSteps.filter((s) => s >= computedMinR)
          : [Math.min(maxR, Math.max(...progressiveSteps))];

        const allUniqueIds = new Set([...excludeSet]);
        let allRawPlaces = [];

        for (const stepRadius of effectiveSteps) {
          const radiusM = Math.min(maxR, stepRadius);
          lastRadiusUsed = radiusM;
          const results = await Promise.all(
            queries.map((q) => placesTextSearch(q, midpoint, radiusM, lang, null, maxResults, config.useRestriction).catch(() => ({places: []}))),
          );
          const newPlaces = results.flatMap((r) => r.places).filter((p) => {
            if (!p.id || allUniqueIds.has(p.id)) return false;
            allUniqueIds.add(p.id);
            return true;
          });
          allRawPlaces = [...allRawPlaces, ...newPlaces];
          logger.info(`[getDateSuggestions] Progressive: ${radiusM}m → ${newPlaces.length} new (total: ${allRawPlaces.length}, target: ${minTarget})`);
          if (allRawPlaces.length >= minTarget) break;
        }
        unique = allRawPlaces.slice(0, maxPlaces);
      } else {
        // LoadMore: exponential expansion (configurable via RC)
        const lmBase = config.loadMoreDefaultBaseRadius || 60000;
        const lmExpBase = config.loadMoreExpansionBase || 2;
        const lmMaxStep = config.loadMoreMaxExpansionStep || 4;
        const lmRadius = Math.min(maxR, Math.max(computedMinR, lmBase) * Math.pow(lmExpBase, Math.min(step, lmMaxStep) + 1));
        lastRadiusUsed = lmRadius;

        const results = await Promise.all(
          queries.map((q) => placesTextSearch(q, midpoint, lmRadius, lang, null, maxResults, config.useRestriction).catch(() => ({places: []}))),
        );
        const seen = new Set();
        unique = results.flatMap((r) => r.places).filter((p) => {
          if (!p.id || seen.has(p.id) || excludeSet.has(p.id)) return false;
          seen.add(p.id);
          return true;
        }).slice(0, maxPlaces);
      }

      const suggestions = unique.map((p) => transformPlaceToSuggestion(p, currentUser, otherUser, apiKey, config)).filter(Boolean);
      suggestions.sort((a, b) => b.score - a.score);

      const hasMore = lastRadiusUsed < maxR;
      logger.info(`[getDateSuggestions] Found ${suggestions.length} places (radius=${lastRadiusUsed / 1000}km, step=${step}, hasMore=${hasMore})`);
      return {success: true, suggestions, hasMore};
    } catch (err) {
      logger.error(`[getDateSuggestions] Error: ${err.message}`);
      return {success: false, error: err.message, suggestions: []};
    }
  },
);

/**
 * Callable: Buscar lugares por texto para una cita.
 * Payload: { matchId, query, userLanguage, pageToken? }
 * Response: { success, places: [PlaceSuggestion], nextPageToken? }
 * Homologado: iOS ChatView.searchPlaces + Android ChatViewModel.searchPlaces
 *
 * Busca lugares usando Google Places API Text Search con patrón multi-query paralelo.
 * Usa locationRestriction (hard) para resultados geográficamente relevantes.
 */
exports.searchPlaces = onCall(
  {region: 'us-central1', memory: '256MiB', timeoutSeconds: 60, secrets: [placesApiKey]},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');
    const {matchId, query, userLanguage, pageToken, loadCount, excludePlaceIds} = request.data || {};
    if (!matchId) throw new Error('matchId is required');
    if (!query && !pageToken) throw new Error('query is required');

    const currentUserId = request.auth.uid;

    try {
      // Read dynamic config from Remote Config
      const config = await getPlacesSearchConfig();
      const catQueryMap = getCategoryQueryMap(config);
      const step = Math.min(Math.max(0, loadCount || 0), config.maxLoadCount || 20);
      logger.info(`[searchPlaces] matchId=${matchId} query="${query}" page=${!!pageToken} loadCount=${step}`);

      const {currentUser, otherUser, midpoint} = await getMatchUsersLocations(matchId, currentUserId);
      if (!config.enabled) {
        return {success: false, error: 'Place search is currently disabled', places: []};
      }

      // Try to detect city mention in query for location override
      let searchCenter = midpoint;
      let searchLocationOverridden = false;
      const cityExtract = (query || '').match(/(?:\b(?:en|in|at|near|à|em|dans|в|で|在|di)\b\s+)(.{2,50})$/i);
      if (cityExtract) {
        const geocoded = await forwardGeocode(cityExtract[1].trim());
        if (geocoded) {
          searchCenter = geocoded;
          searchLocationOverridden = true;
          logger.info(`[searchPlaces] City mention "${cityExtract[1].trim()}" → override center (${geocoded.latitude.toFixed(2)}, ${geocoded.longitude.toFixed(2)})`);
        }
      }

      // Progressive radius from config
      const radiusSteps = config.radiusSteps;
      const stepIndex = Math.min(step, radiusSteps.length - 1);
      const radiusMeters = radiusSteps[stepIndex];
      const maxResults = config.perQueryResults;
      const maxPlaces = config.maxPlacesIntermediate;
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      const lang = userLanguage || config.defaultLanguage || 'es';

      // Set of placeIds to exclude (for "load more" dedup)
      const excludeSet = new Set(Array.isArray(excludePlaceIds) ? excludePlaceIds : []);

      // Use soft locationBias when center was overridden by city mention
      const effectiveUseRestriction = searchLocationOverridden ? false : config.useRestriction;

      // Pagination path: single query with pageToken (backward compatible)
      if (pageToken) {
        const {places, nextPageToken: npt} = await placesTextSearch(
          query || '', searchCenter, radiusMeters, lang, pageToken, maxResults, effectiveUseRestriction,
        );
        const suggestions = places.map((p) => transformPlaceToSuggestion(p, currentUser, otherUser, apiKey, config)).filter(Boolean);
        suggestions.sort((a, b) => b.score - a.score);
        const result = {success: true, places: suggestions, hasMore: !!npt || stepIndex < radiusSteps.length - 1};
        if (npt) result.nextPageToken = npt;
        return result;
      }

      // Brand/franchise detection: prioritize correct place type for known brands
      const brandMatch = detectBrandType(query);
      let brandIncludedType = null;
      if (brandMatch) {
        brandIncludedType = brandMatch.type;
        logger.info(`[searchPlaces] Brand detected: "${query}" → type="${brandIncludedType}"`);
      }

      // Multi-query search: user query + related category + supplementary queries
      const queries = [query];

      // Detect matching category from user's query to add canonical terms
      const queryLower = (query || '').toLowerCase();
      const matchedCategories = [];
      for (const [cat, catQuery] of Object.entries(catQueryMap)) {
        const keywords = catQuery.toLowerCase().split(/\s+/);
        if (keywords.some((kw) => kw.length >= 3 && (queryLower.includes(kw) || kw.includes(queryLower)))) {
          matchedCategories.push(cat);
        }
      }

      // Add matched category's full query for richer terms
      if (matchedCategories.length > 0) {
        const primaryCatQuery = catQueryMap[matchedCategories[0]];
        if (primaryCatQuery.toLowerCase() !== queryLower) {
          queries.push(primaryCatQuery);
        }
      }

      // Add 1-2 random different categories for variety — but NOT when searching for a specific brand
      if (!brandMatch) {
        const usedCats = new Set(matchedCategories);
        const availableCats = Object.keys(catQueryMap).filter((c) => !usedCats.has(c));
        const shuffled = [...availableCats].sort(() => Math.random() - 0.5);
        const extraCount = matchedCategories.length > 0 ? 1 : 2;
        queries.push(...shuffled.slice(0, extraCount).map((k) => catQueryMap[k]));
      }

      // Progressive radius strategy (same as Coach IA — configurable via RC places_search_config):
      const progressiveSteps = Array.isArray(config.progressiveRadiusSteps) && config.progressiveRadiusSteps.length > 0
        ? config.progressiveRadiusSteps : [15000, 30000, 60000, 120000, 200000, 300000];
      const minTarget = config.minPlacesTarget || 30;
      const maxR = config.maxRadius || 300000;
      const pMinR = config.minRadius || 3000;
      const userDistKm = haversineKm(currentUser.lat, currentUser.lng, otherUser.lat, otherUser.lng);
      const computedMinR = userDistKm / 2 * 1000 + pMinR;

      let unique;
      let lastRadiusUsed = 0;

      if (step === 0) {
        // Initial load: progressive radius loop
        const effectiveSteps = progressiveSteps.filter((s) => s >= computedMinR).length > 0
          ? progressiveSteps.filter((s) => s >= computedMinR)
          : [Math.min(maxR, Math.max(...progressiveSteps))];

        const allUniqueIds = new Set([...excludeSet]);
        let allRawPlaces = [];

        for (const stepRadius of effectiveSteps) {
          const radiusM = Math.min(maxR, stepRadius);
          lastRadiusUsed = radiusM;
          const results = await Promise.all(
            queries.map((q) => placesTextSearch(
              q, searchCenter, radiusM, lang, null, maxResults, effectiveUseRestriction,
              q === query && brandIncludedType ? [brandIncludedType] : null,
            ).catch(() => ({places: []}))),
          );
          const newPlaces = results.flatMap((r) => r.places).filter((p) => {
            if (!p.id || allUniqueIds.has(p.id)) return false;
            allUniqueIds.add(p.id);
            return true;
          });
          allRawPlaces = [...allRawPlaces, ...newPlaces];
          logger.info(`[searchPlaces] Progressive: ${radiusM}m → ${newPlaces.length} new (total: ${allRawPlaces.length}, target: ${minTarget})`);
          if (allRawPlaces.length >= minTarget) break;
        }
        unique = allRawPlaces.slice(0, maxPlaces);
      } else {
        // LoadMore: exponential expansion (configurable via RC)
        const lmBase = config.loadMoreDefaultBaseRadius || 60000;
        const lmExpBase = config.loadMoreExpansionBase || 2;
        const lmMaxStep = config.loadMoreMaxExpansionStep || 4;
        const lmRadius = Math.min(maxR, Math.max(computedMinR, lmBase) * Math.pow(lmExpBase, Math.min(step, lmMaxStep) + 1));
        lastRadiusUsed = lmRadius;

        const results = await Promise.all(
          queries.map((q) => placesTextSearch(
            q, searchCenter, lmRadius, lang, null, maxResults, effectiveUseRestriction,
            q === query && brandIncludedType ? [brandIncludedType] : null,
          ).catch(() => ({places: []}))),
        );
        const seen = new Set();
        unique = results.flatMap((r) => r.places).filter((p) => {
          if (!p.id || seen.has(p.id) || excludeSet.has(p.id)) return false;
          seen.add(p.id);
          return true;
        }).slice(0, maxPlaces);
      }

      const suggestions = unique.map((p) => transformPlaceToSuggestion(p, currentUser, otherUser, apiKey, config)).filter(Boolean);
      suggestions.sort((a, b) => b.score - a.score);

      const hasMore = lastRadiusUsed < maxR;
      logger.info(`[searchPlaces] Found ${suggestions.length} places for "${query}" (radius=${lastRadiusUsed / 1000}km, step=${step}, overridden=${searchLocationOverridden})`);
      return {success: true, places: suggestions, hasMore};
    } catch (err) {
      logger.error(`[searchPlaces] Error: ${err.message}`);
      return {success: false, error: err.message, places: []};
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// TEST NOTIFICATIONS (preservadas — testSuperLikesResetNotification, testDailyLikesResetNotification)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Callable: Probar notificación de reset de super likes.
 * Payload: { userId }
 * Homologado: Android NotificationTestHelper
 */
