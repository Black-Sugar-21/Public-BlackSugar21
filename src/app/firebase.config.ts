// Firebase Configuration
export const firebaseConfig = {
  apiKey: "AIzaSyAczpQQmPhIPygDJEVqw406h_ibn3hRey0",
  // Same-origin (eTLD+1) auth domain. The Web OAuth client now authorizes
  // https://blacksugar21.com/__/auth/handler (redirect URI) + https://blacksugar21.com (JS origin),
  // and the domain is connected to Firebase Hosting (serves /__/auth/handler, HTTP 200). Using the
  // brand domain instead of *.firebaseapp.com: (1) brands Google's chooser ("Ir a blacksugar21.com"),
  // (2) FIXES mobile/iOS Safari sign-in — the handler shares the app's registrable domain, so it's no
  // longer third-party storage (which made signInWithRedirect return empty under storage partitioning),
  // (3) avoids the bounce-tracking "intermediate site" warning. If Error 400 redirect_uri_mismatch ever
  // reappears, revert to "black-sugar21.firebaseapp.com" (always pre-authorized).
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
// API, so the app works without it.
// TODO: Register reCAPTCHA v3 key at https://www.google.com/recaptcha/admin and set appCheckEnabled=true
//   Steps:
//   1. Go to https://console.firebase.google.com/ → App Check → Register your web app
//   2. Choose reCAPTCHA v3 and enter the site key above (6LclACstAAAAAARe8FttbxT6VojKjGboqaskm_LK)
//   3. Also verify the key at https://www.google.com/recaptcha/admin (must have the site domains)
//   4. Then set appCheckEnabled = true below — DO NOT enable without completing these steps
//   DO NOT enable App Check (set true) until steps 1-3 are complete — it will break the app.
export const appCheckEnabled = false;
