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

// reCAPTCHA Enterprise Site Key para App Check
// Registrada en: https://console.cloud.google.com/security/recaptcha
// Configurada para: blacksugar21.com, black-sugar21.web.app, black-sugar21.firebaseapp.com, localhost
export const recaptchaSiteKey = "6LfmliYsAAAAAACksuUY5dv6DTP5K3XONNUeStH-";

// App Check enabled with reCAPTCHA Enterprise (registered 2026-06-23).
export const appCheckEnabled = true;
