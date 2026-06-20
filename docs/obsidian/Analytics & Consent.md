---
tags: [web, angular, marketing, analytics]
---

# Analytics & Consent

#web #angular #marketing

Back to [[_Index]]. See also [[Architecture]], [[Legal Pages]], [[Coach Demo Widget]].

Analytics go through **Firebase Analytics (GA4)** via the raw Firebase JS SDK, wrapped by `FirebaseService.logEvent()` (`src/app/firebase.service.ts`). It is **anonymous** and **cookie-free** — explicitly noted in code ("anonymous usage analytics, disclosed in Terms & Privacy. No cookies") and disclosed in [[Legal Pages]] (Terms + Privacy). Geography and user counts come automatically from GA4, so the app sends no PII.

```ts
// firebase.service.ts
logEvent(eventName, params?) { firebaseLogEvent(this.analytics, eventName, params); } // fail-safe
```

## Landing events (`app.ts`)

- `visitor_info` — traffic source (UTM params / referrer classification: google/facebook/instagram/tiktok/direct), `utm_*`, platform (iOS/Android/Desktop), `is_mobile`, browser language, timezone, landing page, screen size.
- `screen_view` — on initial load and every `NavigationEnd` (`page_path` + mapped `page_title`).
- `age_verified`, `tester_signup`, `click_try_coach`, `click_store_badge`.

## Coach demo events (`coach-widget.component.ts`)

All carry `source: 'coach_demo'`:
`coach_demo_open`, `coach_demo_message`, `coach_demo_simulate`, `coach_demo_multiverse`, `coach_demo_sim_open`, `coach_demo_mv_open`, `coach_demo_place_chip`, `coach_demo_place_click`, `coach_demo_feedback`, `coach_demo_share`, `coach_demo_download`, `coach_demo_limited`. See [[Coach Demo Widget]] and [[Demo Backend Integration]].

## Related Firebase services (same `FirebaseService`)

- **Remote Config** — `minimum_age_by_country` (age gate), `store_url_ios` / `store_url_android` (store badges); 1h min fetch interval.
- **App Check** — reCAPTCHA v3 (`recaptchaSiteKey`); debug mode on localhost.
- **Auth + Firestore** — email/Google sign-in and `users` profiles (language pref, age verification). Most visitors stay anonymous; the marketing site is usable without login.

## Privacy posture

- No cookies; analytics are anonymous and aggregate.
- Demo coach calls send only a random `sessionId` + the user's text, never account identity (the demo requires no login).
- Disclosed to users in Terms and Privacy — see [[Legal Pages]].

## Key file

- `src/app/firebase.service.ts`
