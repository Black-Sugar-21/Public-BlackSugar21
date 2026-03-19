#!/usr/bin/env node
/**
 * Modularization script for index.original.js → lib/ modules
 * 
 * Reads the monolithic file and creates separate module files.
 * Each module gets proper require headers and exports.
 * 
 * Key design decisions:
 * - places-helpers.js: shared internal helpers used by both coach.js and places.js
 *   (NOT listed in index.js modules — these are NOT Cloud Functions)
 * - logger is included in every module header
 * - shared.js and geo.js already exist and are NOT overwritten
 * 
 * Usage: node scripts/modularize.js
 */

const fs = require('fs');
const pathMod = require('path');

const SRC = pathMod.join(__dirname, '..', 'index.original.js');
const LIB = pathMod.join(__dirname, '..', 'lib');

const allLines = fs.readFileSync(SRC, 'utf-8').split('\n');
const total = allLines.length;
console.log(`\n📄 Read ${total} lines from index.original.js\n`);

function extractLines(startLine, endLine) {
  return allLines.slice(startLine - 1, endLine).join('\n');
}

function writeModule(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf-8');
  const lines = content.split('\n').length;
  console.log(`  ✅ ${pathMod.basename(filePath)} (${lines} lines)`);
}

// ============================================================
// MODULE DEFINITIONS
// ============================================================

console.log('🔧 Creating module files in lib/\n');

// ============================================================
// 1. discovery.js (L161-474)
//    exports: getCompatibleProfileIds, findSimilarProfiles, predictMatchSuccess
// ============================================================
(() => {
  const header = `'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { haversineDistanceKm, encodeGeohash, precisionForRadius, normalizeLongitude, queryBoundsForRadius, calcAge } = require('./geo');

`;
  const code = extractLines(161, 474);
  writeModule(pathMod.join(LIB, 'discovery.js'), header + code + '\n');
})();

// ============================================================
// 2. matches.js (L475-789)
//    exports: onMatchCreated, onMessageCreated, blockUser, unmatchUser
// ============================================================
(() => {
  const header = `'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

`;
  const code = extractLines(475, 789);
  writeModule(pathMod.join(LIB, 'matches.js'), header + code + '\n');
})();

// ============================================================
// 3. notifications.js
//    L790-901: sendTestNotification, updateFCMToken
//    L6236-6304: testSuperLikesResetNotification, testDailyLikesResetNotification
//    L6879-6973: handlePendingNotification
//    L6974-7072: sendTestNotificationToUser
// ============================================================
(() => {
  const header = `'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

`;
  const part1 = extractLines(790, 901);
  const part2 = extractLines(6236, 6304);
  const part3 = extractLines(6879, 6973);
  const part4 = extractLines(6974, 7072);
  writeModule(pathMod.join(LIB, 'notifications.js'),
    header + part1 + '\n\n' + part2 + '\n\n' + part3 + '\n\n' + part4 + '\n');
})();

// ============================================================
// 4. storage.js
//    L902-1014: generateProfileThumbnail
//    L6305-6398: generateMissingThumbnails
// ============================================================
(() => {
  const header = `'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { onObjectFinalized } = require('firebase-functions/v2/storage');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const path = require('path');
const os = require('os');
const fs = require('fs');
const sharp = require('sharp');

`;
  const part1 = extractLines(902, 1014);
  const part2 = extractLines(6305, 6398);
  writeModule(pathMod.join(LIB, 'storage.js'), header + part1 + '\n\n' + part2 + '\n');
})();

// ============================================================
// 5. users.js (L1015-1441)
//    exports: unmatchUser, reportUser, blockUser, deleteUserData, etc.
// ============================================================
(() => {
  const header = `'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { geminiApiKey, AI_MODEL_LITE, getLanguageInstruction, parseGeminiJsonResponse } = require('./shared');

`;
  const code = extractLines(1015, 1441);
  writeModule(pathMod.join(LIB, 'users.js'), header + code + '\n');
})();

// ============================================================
// 6. batch.js (L1442-1690)
//    exports: getBatchCompatibilityScores, getBatchPhotoUrls, getMatchesWithMetadata
// ============================================================
(() => {
  const header = `'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

`;
  const code = extractLines(1442, 1690);
  writeModule(pathMod.join(LIB, 'batch.js'), header + code + '\n');
})();

// ============================================================
// 7. stories.js
//    L1691-1911: createStory, markStoryAsViewed, deleteStory, getBatchStoryStatus, getBatchPersonalStories
//    L7478-7547: cleanupExpiredStories (scheduled)
// ============================================================
(() => {
  const header = `'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

`;
  const part1 = extractLines(1691, 1911);
  const part2 = extractLines(7478, 7547);
  writeModule(pathMod.join(LIB, 'stories.js'), header + part1 + '\n\n' + part2 + '\n');
})();

// ============================================================
// 8. moderation.js
//    L1912-2068: validateProfileImage, moderateProfileImage export bodies
//    L2086-2393: buildProfileImagePrompt, buildStoryImagePrompt, buildBioModerationPrompt, buildMessageModerationPrompt
//    (Skip L2069-2085: getLanguageInstruction — in shared.js)
//    (Skip L2394-2418: normalizeCategory — in shared.js)
//    (Skip L2419-2446: parseGeminiJsonResponse — in shared.js)
//    L2447 is start of ai-services, so moderation exports go up to ~2446
//    Actually: moderateMessage ends, then shared funcs, then ai-services starts
//    Let me re-check: L1912 validateProfileImage ... moderateMessage ... then helpers
//    The moderation EXPORTS (validateProfileImage, moderateProfileImage, moderateMessage)
//    call the helper prompt builders, so we need:
//    Prompt builders FIRST (L2086-2393), then the exports that call them
//    But the exports are at L1912-2068... that's BEFORE the helpers.
//    In the original file the order is: exports L1912-2068, then helper L2069+
//    So the exports CALL functions defined LATER in the file (hoisting for function declarations).
//    In the module we need: prompt builders first, then exports that use them.
//    OR: use function declarations (which are hoisted) — they already ARE function declarations.
//    So the order doesn't matter for `function` keyword declarations.
//    Let's keep original order for safety.
//
//    L3537-3698: getModerationConfig, retrieveModerationKnowledge
//    L7073-7195: autoModerateMessage helpers (getMessageHash, applyQuickFilters, getCachedModerationResult, saveModerationToCache)
//    L7196-7364: autoModerateMessage trigger
// ============================================================
(() => {
  const header = `'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { geminiApiKey, AI_MODEL_NAME, AI_MODEL_LITE, getLanguageInstruction, normalizeCategory, categoryEmojiMap, parseGeminiJsonResponse } = require('./shared');

`;
  // Moderation exports: validateProfileImage, moderateProfileImage, moderateMessage
  const modExports = extractLines(1912, 2068);
  // Skip L2069-2085: getLanguageInstruction (in shared.js)
  // Prompt builder helpers (function declarations — hoisted)
  const modHelpers = extractLines(2086, 2393);
  // Skip L2394-2446: normalizeCategory + parseGeminiJsonResponse (in shared.js)
  
  // Moderation config + RAG: getModerationConfig, retrieveModerationKnowledge
  const modConfig = extractLines(3537, 3698);
  
  // autoModerateMessage helpers
  const autoModHelpers = extractLines(7073, 7195);
  
  // autoModerateMessage trigger
  const autoModTrigger = extractLines(7196, 7364);
  
  writeModule(pathMod.join(LIB, 'moderation.js'),
    header +
    '// --- Moderation config & RAG ---\n' + modConfig + '\n\n' +
    '// --- Prompt builders ---\n' + modHelpers + '\n\n' +
    '// --- Moderation callable functions ---\n' + modExports + '\n\n' +
    '// --- Auto-moderation helpers ---\n' + autoModHelpers + '\n\n' +
    '// --- Auto-moderation trigger ---\n' + autoModTrigger + '\n');
})();

// ============================================================
// 9. ai-services.js (L2447-3078)
//    exports: generateInterestSuggestions, analyzeProfileWithAI, getEnhancedCompatibilityScore,
//             analyzePersonalityCompatibility, generateConversationStarter, generateIcebreakers,
//             generateSmartReply, analyzeConversationChemistry, getDatingAdvice,
//             calculateSafetyScore, detectProfileRedFlags, predictOptimalMessageTime,
//             optimizeProfilePhotos, analyzePhotoBeforeUpload
// ============================================================
(() => {
  const header = `'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { geminiApiKey, AI_MODEL_NAME, AI_MODEL_LITE, getLanguageInstruction, parseGeminiJsonResponse } = require('./shared');
const { calcAge } = require('./geo');

`;
  const code = extractLines(2447, 3078);
  writeModule(pathMod.join(LIB, 'ai-services.js'), header + code + '\n');
})();

// ============================================================
// 10. places-helpers.js (L5482-5924)
//     Internal helper functions used by BOTH coach.js and places.js.
//     NOT a Cloud Function module — not listed in index.js.
//     Exports: calculateMidpoint, haversineKm, estimateTravelMin, getMatchUsersLocations,
//              fuzzyMatchPlace, getPlacesSearchConfig, getCategoryQueryMap,
//              googlePriceLevelToString, isValidCoachInstagramHandle,
//              sanitizeInstagramHandle, sanitizeWebsiteUrl,
//              placesTextSearch, transformPlaceToSuggestion
// ============================================================
(() => {
  const header = `'use strict';
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { geminiApiKey, placesApiKey, AI_MODEL_NAME, normalizeCategory, categoryEmojiMap } = require('./shared');
const { haversineDistanceKm } = require('./geo');

`;
  const code = extractLines(5482, 5924);
  
  // Add explicit exports for the helper functions
  const helperExports = `
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
`;
  writeModule(pathMod.join(LIB, 'places-helpers.js'), header + code + '\n' + helperExports);
})();

// ============================================================
// 11. coach.js
//     L3151-3536: Coach infrastructure (PLACES_CHIP_I18N, caches, patterns, getCoachConfig,
//                 analyzeUserMessage, buildLearningContext, updateCoachLearning)
//     (Skip L3079-3150: reverseGeocode, forwardGeocode, their caches — in geo.js)
//     L3699-3812: retrieveCoachKnowledge (Coach RAG)
//     L3813-5481: dateCoachChat, getCoachHistory, deleteCoachMessage
//     L7548-7696: getRealtimeCoachTips
// ============================================================
(() => {
  const header = `'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { geminiApiKey, placesApiKey, AI_MODEL_NAME, AI_MODEL_LITE, getLanguageInstruction, normalizeCategory, categoryEmojiMap, parseGeminiJsonResponse } = require('./shared');
const { reverseGeocode, forwardGeocode, haversineDistanceKm } = require('./geo');
const {
  calculateMidpoint, haversineKm, estimateTravelMin, getMatchUsersLocations,
  fuzzyMatchPlace, getPlacesSearchConfig, getCategoryQueryMap,
  googlePriceLevelToString, sanitizeInstagramHandle, sanitizeWebsiteUrl,
  placesTextSearch, transformPlaceToSuggestion,
} = require('./places-helpers');

`;
  // Coach infrastructure: PLACES_CHIP_I18N through updateCoachLearning + coach RAG constants
  const coachInfra = extractLines(3151, 3536);
  
  // Coach RAG: retrieveCoachKnowledge
  const coachRAG = extractLines(3699, 3812);
  
  // dateCoachChat + getCoachHistory + deleteCoachMessage
  const coachMain = extractLines(3813, 5481);
  
  // getRealtimeCoachTips (at end of file)
  const coachTips = extractLines(7548, total);
  
  writeModule(pathMod.join(LIB, 'coach.js'),
    header +
    '// --- Coach infrastructure ---\n' + coachInfra + '\n\n' +
    '// --- Coach RAG ---\n' + coachRAG + '\n\n' +
    '// --- Coach main functions ---\n' + coachMain + '\n\n' +
    '// --- Realtime coach tips ---\n' + coachTips + '\n');
})();

// ============================================================
// 12. places.js (L5925-6235)
//     exports: getDateSuggestions, searchPlaces
//     Uses helpers from places-helpers.js
// ============================================================
(() => {
  const header = `'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { geminiApiKey, placesApiKey, AI_MODEL_NAME, getLanguageInstruction, normalizeCategory, categoryEmojiMap, parseGeminiJsonResponse } = require('./shared');
const { haversineDistanceKm } = require('./geo');
const {
  calculateMidpoint, haversineKm, estimateTravelMin, getMatchUsersLocations,
  fuzzyMatchPlace, getPlacesSearchConfig, getCategoryQueryMap,
  googlePriceLevelToString, sanitizeInstagramHandle, sanitizeWebsiteUrl,
  placesTextSearch, transformPlaceToSuggestion,
} = require('./places-helpers');

`;
  const code = extractLines(5925, 6235);
  writeModule(pathMod.join(LIB, 'places.js'), header + code + '\n');
})();

// ============================================================
// 13. scheduled.js (L6399-6878)
//     L6399-6786: resetDailyLikes, resetSuperLikes, resetCoachMessages, checkMutualLikesAndCreateMatch, alias
//     L6793-6878: processScheduledDeletions
//     (Late imports onSchedule/onDocumentUpdated at L6390-6391 — included in header)
// ============================================================
(() => {
  const header = `'use strict';
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

`;
  // resetDailyLikes, resetSuperLikes, resetCoachMessages, checkMutualLikesAndCreateMatch + alias
  const part1 = extractLines(6399, 6786);
  // processScheduledDeletions
  const part2 = extractLines(6793, 6878);
  writeModule(pathMod.join(LIB, 'scheduled.js'), header + part1 + '\n\n' + part2 + '\n');
})();

// ============================================================
// 14. geohash.js (L7365-7477)
//     exports: validateGeohashOnUpdate, updateGeoHashesScheduled, monitorGeohashHealth
// ============================================================
(() => {
  const header = `'use strict';
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { encodeGeohash } = require('./geo');

`;
  const code = extractLines(7365, 7477);
  writeModule(pathMod.join(LIB, 'geohash.js'), header + code + '\n');
})();

console.log('\n✅ All module files created in lib/\n');

// ============================================================
// Create new index.js
// ============================================================
const indexContent = `'use strict';

// Initialize Firebase Admin SDK ONCE before any module imports
const admin = require('firebase-admin');
admin.initializeApp();

// Re-export all Cloud Function modules
// (places-helpers.js is intentionally excluded — it contains internal helpers, not Cloud Functions)
const modules = [
  './lib/discovery',
  './lib/matches',
  './lib/notifications',
  './lib/storage',
  './lib/users',
  './lib/batch',
  './lib/stories',
  './lib/moderation',
  './lib/ai-services',
  './lib/coach',
  './lib/places',
  './lib/scheduled',
  './lib/geohash',
];

modules.forEach(mod => {
  Object.assign(exports, require(mod));
});
`;

const indexPath = pathMod.join(__dirname, '..', 'index.js');
fs.writeFileSync(indexPath, indexContent, 'utf-8');
console.log(`✅ New index.js created (${indexContent.split('\n').length} lines)\n`);

// ============================================================
// Verify: load index.js and count exports
// ============================================================
console.log('🔍 Verifying exports...\n');

// Clear require cache
Object.keys(require.cache).forEach(key => {
  if (key.includes('/functions/')) delete require.cache[key];
});

try {
  const funcs = require(pathMod.join(__dirname, '..'));
  const exportNames = Object.keys(funcs).sort();
  console.log(`Total exports: ${exportNames.length}`);
  console.log('Exports:', exportNames.join(', '));
  
  if (exportNames.length < 50) {
    console.warn('\n⚠️  WARNING: Expected ~58 exports, got', exportNames.length);
    console.warn('Some exports may be missing. Check the module boundaries.');
  } else {
    console.log('\n✅ Export count looks correct!');
  }
} catch (err) {
  console.error('\n❌ Error loading new index.js:', err.message);
  if (err.stack) {
    // Show only the first few lines of the stack
    const stackLines = err.stack.split('\n').slice(0, 8);
    console.error(stackLines.join('\n'));
  }
  process.exit(1);
}

console.log('\n🎉 Modularization complete!\n');
