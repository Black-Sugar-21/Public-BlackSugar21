// Firebase Configuration
export const firebaseConfig = {
  apiKey: "AIzaSyAczpQQmPhIPygDJEVqw406h_ibn3hRey0",
  // Use Firebase's default auth domain — its OAuth redirect handler
  // (https://black-sugar21.firebaseapp.com/__/auth/handler) is pre-authorized in the Google
  // OAuth client. The custom domain "blacksugar21.com" caused Error 400 redirect_uri_mismatch
  // because its /__/auth/handler URI was never registered in the OAuth client.
  authDomain: "black-sugar21.firebaseapp.com",
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
