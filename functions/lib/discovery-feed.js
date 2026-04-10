'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { haversineDistanceKm, queryBoundsForRadius, calcAge } = require('./geo');

/**
 * getDiscoveryFeed — Single CF that returns complete discovery data.
 * Combines: getCompatibleProfileIds + user data + photo URLs + personal stories
 * All in ONE server-side call with parallel execution.
 *
 * This is a NEW function — does NOT replace existing functions.
 * Existing clients continue using the old multi-call flow.
 */
exports.getDiscoveryFeed = onCall(
  {region: 'us-central1', memory: '1GiB', timeoutSeconds: 90},
  async (request) => {
    if (!request.auth) throw new Error('Authentication required');

    const startTime = Date.now();
    const rawLimit = request.data?.limit;
    const limit = typeof rawLimit === 'number' && rawLimit > 0 && rawLimit <= 100 ? rawLimit : 50;
    const currentUserId = request.auth.uid;

    if (!currentUserId || typeof currentUserId !== 'string') {
      return {success: false, error: 'invalid_user', profiles: []};
    }

    const db = admin.firestore();
    const bucket = admin.storage().bucket();

    try {
      // ── 1. Read current user ──
      const userDoc = await db.collection('users').doc(currentUserId).get();
      if (!userDoc.exists) {
        return {success: true, profiles: [], totalExcluded: 0};
      }

      const currentUser = userDoc.data();
      const currentUserMale = currentUser.male === true;
      const currentUserOrientation = (currentUser.orientation || 'both').toLowerCase();
      const currentUserType = (currentUser.userType || '').toUpperCase();
      const currentUserAge = calcAge(currentUser.birthDate);
      const userMinAge = currentUser.minAge || 18;
      const userMaxAge = currentUser.maxAge || 99;
      const userLat = currentUser.latitude;
      const userLon = currentUser.longitude;
      const maxDistanceKm = currentUser.maxDistance || 200;

      // ── 2. Read cooldown from Remote Config ──
      let cooldownDays = 14;
      let reviewerUids = new Set();
      try {
        const rc = admin.remoteConfig();
        const template = await rc.getTemplate();
        const cooldownParam = template.parameters['profile_reappear_cooldown_days'];
        if (cooldownParam?.defaultValue?.value) {
          const parsed = parseInt(cooldownParam.defaultValue.value, 10);
          if (!isNaN(parsed) && parsed > 0) cooldownDays = parsed;
        }
        const reviewerParam = template.parameters['reviewer_uid'];
        if (reviewerParam?.defaultValue?.value) {
          reviewerUids = new Set(reviewerParam.defaultValue.value.split(',').map((s) => s.trim()).filter(Boolean));
        }
      } catch (rcErr) {
        logger.warn(`[getDiscoveryFeed] Remote Config read failed: ${rcErr.message}`);
      }

      const cutoffTime = new Date(Date.now() - cooldownDays * 86400000);

      // ── 3. Build exclusion set (parallel) ──
      const excludedIds = new Set([currentUserId]);

      const [swipesSnap, matchesSnap, blockedSnap] = await Promise.all([
        db.collection('users').doc(currentUserId).collection('swipes')
          .where('timestamp', '>=', cutoffTime).get().catch((e) => {
            logger.warn(`[getDiscoveryFeed] Swipes query error: ${e.message}`);
            return {docs: []};
          }),
        db.collection('matches')
          .where('usersMatched', 'array-contains', currentUserId).get().catch((e) => {
            logger.warn(`[getDiscoveryFeed] Matches query error: ${e.message}`);
            return {docs: []};
          }),
        db.collection('users').doc(currentUserId).collection('blocked')
          .get().catch((e) => {
            logger.warn(`[getDiscoveryFeed] Blocked query error: ${e.message}`);
            return {docs: []};
          }),
      ]);

      swipesSnap.docs.forEach((d) => excludedIds.add(d.id));
      matchesSnap.docs.forEach((d) => {
        (d.data().usersMatched || []).forEach((uid) => { if (uid !== currentUserId) excludedIds.add(uid); });
      });
      blockedSnap.docs.forEach((d) => excludedIds.add(d.id));

      // ── 4. Discovery queries ──
      const isReviewerUser = reviewerUids.has(currentUserId);
      const seenIds = new Set();
      const candidateUsers = [];

      // 4a. Reviewer user? Fetch ALL test/reviewer profiles directly (no geohash dependency)
      if (isReviewerUser) {
        try {
          const testSnap = await db.collection('users')
            .where('isTest', '==', true)
            .limit(limit)
            .get();
          for (const doc of testSnap.docs) {
            const uid = doc.id;
            if (uid === currentUserId) continue;
            if (seenIds.has(uid)) continue;
            seenIds.add(uid);
            const data = doc.data();
            if (data.accountStatus !== 'active') continue;
            candidateUsers.push({uid, data});
          }
          logger.info(`[getDiscoveryFeed] Reviewer mode: ${candidateUsers.length} test profiles found`);
        } catch (e) {
          logger.error(`[getDiscoveryFeed] Reviewer query error: ${e.message}`);
        }
      }

      // 4b. Geohash-based discovery (normal users, or reviewer wanting more profiles)
      if (candidateUsers.length < limit && userLat && userLon) {
        const bounds = queryBoundsForRadius(userLat, userLon, maxDistanceKm * 1000);
        const queryPromises = bounds.map((bound) =>
          db.collection('users')
            .where('geohash', '>=', bound.start || bound[0])
            .where('geohash', '<=', bound.end || bound[1])
            .limit(limit * 2)
            .get()
            .catch((e) => {
              logger.warn(`[getDiscoveryFeed] Geohash query error: ${e.message}`);
              return {docs: []};
            }),
        );

        const snapshots = await Promise.all(queryPromises);

        for (const snap of snapshots) {
          for (const doc of snap.docs) {
            const uid = doc.id;
            if (uid === currentUserId) continue;
            if (seenIds.has(uid)) continue;
            seenIds.add(uid);

            const data = doc.data();

            // Account status + paused filter (always applies)
            if (data.accountStatus !== 'active') continue;
            if (data.paused === true) continue;

            const isReviewerProfile = data.isTest === true || data.isReviewer === true;
            const skipContentFilters = isReviewerUser && isReviewerProfile;

            // Hide reviewer/test profiles from normal users
            if (isReviewerProfile && !isReviewerUser) continue;

            // Exclusion check (reviewer bypasses for test profiles)
            if (excludedIds.has(uid) && !skipContentFilters) continue;

            // Safety filters — ALWAYS apply, even for reviewer (match V1 behavior)
            if (Array.isArray(data.blocked) && data.blocked.includes(currentUserId)) continue;
            if (data.visibilityReduced === true) continue;

            if (!skipContentFilters) {
              // userType filter (SUGAR_DADDY/MOMMY can't see same type)
              const candidateUserType = (data.userType || '').toUpperCase();
              if (
                (currentUserType === 'SUGAR_DADDY' || currentUserType === 'SUGAR_MOMMY') &&
                candidateUserType === currentUserType
              ) continue;

              // Orientation/gender filter (Firestore values: 'men'/'women'/'both')
              const candidateMale = data.male === true;
              const candidateOrientation = (data.orientation || 'both').toLowerCase();
              if (currentUserOrientation === 'both') {
                if (candidateOrientation !== 'both') continue;
              } else if (currentUserOrientation === 'men') {
                if (!candidateMale) continue;
                if (currentUserMale && candidateOrientation === 'women') continue;
                if (!currentUserMale && candidateOrientation === 'men') continue;
              } else if (currentUserOrientation === 'women') {
                if (candidateMale) continue;
                if (currentUserMale && candidateOrientation === 'women') continue;
                if (!currentUserMale && candidateOrientation === 'men') continue;
              }

              // Age filter (bidirectional)
              const targetAge = calcAge(data.birthDate);
              if (targetAge < userMinAge || targetAge > userMaxAge) continue;
              if (currentUserAge < (data.minAge || 18) || currentUserAge > (data.maxAge || 99)) continue;

              // Distance filter
              if (data.latitude && data.longitude) {
                const dist = haversineDistanceKm(userLat, userLon, data.latitude, data.longitude);
                if (dist > maxDistanceKm) continue;
              }
            }

            candidateUsers.push({uid, data});
            if (candidateUsers.length >= limit) break;
          }
          if (candidateUsers.length >= limit) break;
        }
      }

      // No location and not reviewer
      if (!userLat && !userLon && !isReviewerUser) {
        return {success: true, profiles: [], totalExcluded: excludedIds.size};
      }

      if (candidateUsers.length === 0) {
        logger.info(`[getDiscoveryFeed] No profiles found for ${currentUserId} (${Date.now() - startTime}ms)`);
        return {success: true, profiles: [], totalExcluded: excludedIds.size};
      }

      // ── 5. Build photo URLs + stories IN PARALLEL (server-side, safe) ──
      const SIGNED_URL_EXPIRES = Date.now() + 7 * 86400000;
      const now = admin.firestore.Timestamp.now();
      const profileIds = candidateUsers.map((c) => c.uid);

      // Parallel: photo URLs + stories
      const [photoUrlsMap, storiesMap] = await Promise.all([
        // Photo URLs
        (async () => {
          const urls = {};
          await Promise.allSettled(
            candidateUsers.map(async ({uid, data}) => {
              const pics = data.pictures || data.pictureNames || [];
              if (pics.length === 0) return;
              const entries = [];
              await Promise.allSettled(
                pics.map(async (fileName) => {
                  try {
                    const file = bucket.file(`users/${uid}/${fileName}`);
                    const [exists] = await file.exists();
                    if (!exists) return;
                    const [signedUrl] = await file.getSignedUrl({action: 'read', expires: SIGNED_URL_EXPIRES});
                    // Thumb
                    let thumbUrl = null;
                    const ext = fileName.includes('.') ? `.${fileName.split('.').pop()}` : '.jpg';
                    const nameNoExt = fileName.replace(/\.[^.]+$/, '');
                    const thumbFile = bucket.file(`users/${uid}/${nameNoExt}_thumb${ext}`);
                    const [thumbExists] = await thumbFile.exists();
                    if (thumbExists) {
                      const [tUrl] = await thumbFile.getSignedUrl({action: 'read', expires: SIGNED_URL_EXPIRES});
                      thumbUrl = tUrl;
                    }
                    entries.push({url: signedUrl, thumbUrl, fileName});
                  } catch (photoErr) {
                    logger.warn(`[getDiscoveryFeed] Photo URL error for ${uid}/${fileName}: ${photoErr.message}`);
                  }
                }),
              );
              if (entries.length > 0) urls[uid] = entries;
            }),
          );
          return urls;
        })(),

        // Personal stories (batch query, not N individual calls)
        (async () => {
          const stories = {};
          profileIds.forEach((uid) => { stories[uid] = []; });
          const chunkSize = 10;
          for (let i = 0; i < profileIds.length; i += chunkSize) {
            const chunk = profileIds.slice(i, i + chunkSize);
            try {
              const snap = await db.collection('stories')
                .where('isPersonal', '==', true)
                .where('senderId', 'in', chunk)
                .where('expiresAt', '>', now)
                .orderBy('expiresAt', 'asc')
                .get();
              snap.docs.forEach((doc) => {
                const d = doc.data();
                if (d.isReviewer === true && !isReviewerUser) return;
                const uid = d.senderId;
                if (stories[uid]) {
                  stories[uid].push({
                    id: doc.id,
                    imageUrl: d.imageUrl,
                    timestamp: d.timestamp?.toDate?.() ? d.timestamp.toDate().toISOString() : null,
                    expiresAt: d.expiresAt?.toDate?.() ? d.expiresAt.toDate().toISOString() : null,
                  });
                }
              });
            } catch (storyErr) {
              logger.warn(`[getDiscoveryFeed] Stories query error (chunk ${i}): ${storyErr.message}`);
            }
          }
          return stories;
        })(),
      ]);

      // ── 6. Build response ──
      const profiles = candidateUsers.map(({uid, data}) => {
        const pictures = (photoUrlsMap[uid] || []).map((p) => ({url: p.url, thumbUrl: p.thumbUrl || null}));
        const personalStories = storiesMap[uid] || [];
        return {
          userId: uid,
          name: data.name || '',
          age: calcAge(data.birthDate),
          gender: data.male ? 'male' : 'female',
          userType: data.userType || '',
          bio: data.bio || '',
          interests: data.interests || [],
          latitude: data.latitude || 0,
          longitude: data.longitude || 0,
          pictureNames: data.pictures || data.pictureNames || [],
          pictures,
          personalStories,
          hasActiveStories: personalStories.length > 0,
          hasSuperLike: Array.isArray(data.superLiked) && data.superLiked.includes(currentUserId),
        };
      });

      const totalTime = Date.now() - startTime;
      const withStories = profiles.filter((p) => p.hasActiveStories).length;
      const withPhotos = profiles.filter((p) => p.pictures.length > 0).length;
      logger.info(`[getDiscoveryFeed] ${profiles.length} profiles (${withPhotos} w/photos, ${withStories} w/stories) for ${currentUserId} in ${totalTime}ms | reviewer=${isReviewerUser} excluded=${excludedIds.size}`);

      return {
        success: true,
        profiles,
        totalExcluded: excludedIds.size,
        cooldownDays,
        executionTimeMs: totalTime,
      };
    } catch (err) {
      logger.error(`[getDiscoveryFeed] Error: ${err.message}`);
      return {success: false, error: err.message, profiles: []};
    }
  },
);
