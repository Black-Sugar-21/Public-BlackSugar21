// Firebase Configuration
export const firebaseConfig = {
  apiKey: "AIzaSyAczpQQmPhIPygDJEVqw406h_ibn3hRey0",
  // Branded auth domain: Google's account chooser shows this verbatim ("Ir a blacksugar21.com").
  // blacksugar21.com is connected to Firebase Hosting (serves /__/auth/handler, HTTP 200) AND its
  // redirect URI (https://blacksugar21.com/__/auth/handler) + JS origin (https://blacksugar21.com)
  // are now registered in the Google OAuth client — without that registration this throws
  // Error 400 redirect_uri_mismatch (the reason it was previously pinned to the firebaseapp.com domain).
  // If login ever breaks with that 400, revert to "black-sugar21.firebaseapp.com" (always pre-authorized).
  authDomain: "blacksugar21.com",
  databaseURL: "https://black-sugar21-default-rtdb.firebaseio.com",
  projectId: "black-sugar21",
  storageBucket: "black-sugar21.firebasestorage.app",
  messagingSenderId: "706595096331",
  appId: "1:706595096331:web:0f6b128a0d6988bf20c40e",
  measurementId: "G-VBSNDGKVLJ"
};

// reCAPTCHA v3 Site Key para App Check
// Generada desde: https://www.google.com/recaptcha/admin
// Configurada para: black-sugar21.web.app, black-sugar21.firebaseapp.com, blacksugar21.com, localhost
export const recaptchaSiteKey = "6LclACstAAAAAARe8FttbxT6VojKjGboqaskm_LK";

// App Check DISABLED on web: the reCAPTCHA v3 key isn't registered/matching in Firebase App Check,
// so exchangeRecaptchaV3Token returns 400 (noisy console errors). App Check is NOT enforced on any
// API, so the app works without it. Re-enable (set true) ONLY after registering the key pair in
// Firebase Console → App Check for this web app (site key + secret) + reCAPTCHA admin domains.
export const appCheckEnabled = false;
