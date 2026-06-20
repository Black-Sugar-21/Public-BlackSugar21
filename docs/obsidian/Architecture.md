---
tags: [web, angular, marketing, architecture]
---

# Architecture

#web #angular #marketing

Back to [[_Index]].

## Stack

- **Angular 21**, **standalone components** only (no NgModules). Root is `App` in `src/app/app.ts` with `imports: [CommonModule, RouterModule, CoachWidgetComponent]` and template `app.html`.
- Modern control flow (`@if` / `@for`) and **signals** throughout (`signal`, `computed`).
- **GSAP + ScrollTrigger** for hero/scroll animations (registered only in the browser; respects `prefers-reduced-motion`). See [[Landing & Hero]].
- **Raw Firebase JS SDK** (not AngularFire) wrapped in `FirebaseService` — see [[Analytics & Consent]].

## Routing

`src/app/app.routes.ts` defines a small route table. The homepage is the root `App` landing (rendered via `*ngIf="isHomeRoute()"` on `<main>` so legal/feature routes show their own component instead of stacking under the landing).

| Path | Component | Loading |
|---|---|---|
| `/` | `App` landing (`app.html`) | eager |
| `moderation-policy`, `politicas-moderacion` | `ModerationPolicyComponent` | eager |
| `terms` | `TermsComponent` | eager |
| `privacy` | `PrivacyComponent` | eager |
| `data-deletion` | `DataDeletionComponent` | eager |
| `safety-standards` | `SafetyStandardsComponent` | eager |
| `features` | `FeaturesComponent` | **lazy** (`loadComponent`) |
| `analytics` | `AnalyticsComponent` | **lazy** (`loadComponent`) |

Legal routes are detailed in [[Legal Pages]]. Each route sets a `title`.

## Firebase Hosting & deploy

- `firebase.json` → `hosting.site: "black-sugar21"`, `public: "dist/Public-BlackSugar21/browser"`, SPA rewrite `**` → `/index.html`.
- **Security headers** set in hosting config: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(self)` (geolocation `self` is needed by the [[Coach Demo Widget]] place suggestions).
- Long-cache immutable headers for images/fonts.
- Deploy via `deploy.sh` / Firebase CLI. Live at **black-sugar21.web.app** / **blacksugar21.com**.

## Cross-cutting services

- `FirebaseService` (`firebase.service.ts`) — App init, Auth (email + Google), Firestore user profiles, **Remote Config** (`minimum_age_by_country`, `store_url_ios`, `store_url_android`), **App Check** (reCAPTCHA v3), **Analytics** (`logEvent`). See [[Analytics & Consent]].
- `TranslationService` (`translation.service.ts`) — 13-language i18n, RTL. See [[i18n (13 languages)]].
- `SeoService` (`services/seo.service.ts`) — sets `<title>`, meta description, OpenGraph/Twitter tags, canonical link.

## i18n & analytics summary

- **13 languages** auto-detected from the device, persisted in `localStorage`, RTL for Arabic — [[i18n (13 languages)]].
- **GA4** anonymous analytics, no cookies — [[Analytics & Consent]].

## Related

- [[Coach Demo Widget]] · [[Demo Backend Integration]] · [[Landing & Hero]]
