'use strict';

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
