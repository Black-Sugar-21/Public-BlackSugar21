---
tags: [web, angular, marketing, landing]
---

# Landing & Hero

#web #angular #marketing

Back to [[_Index]]. See also [[Architecture]], [[Coach Demo Widget]].

The landing is the root `App` component: `src/app/app.ts` + template `src/app/app.html`. The homepage `<main>` only renders on the home route (`*ngIf="isHomeRoute()"`), so legal/feature routes show their own component cleanly.

## Sections (in `app.html`)

- **Age gate** — an opaque overlay (kept separate from `<main>` so crawlers still see the page). Age verified flag stored in `localStorage` (`ageVerified`). Minimum legal age is resolved from Remote Config `minimum_age_by_country` keyed by country detected from the IANA timezone (`detectCountryFromTimezone`), default 18.
- **Hero** (`section#inicio.hero-section`) — logo, headline/taglines, store badges (iOS App Store link; Android opens a tester-signup modal), and a **"Talk to the Coach" CTA** (`hero-cta-coach`) that calls `openCoach()`.
- **Hero carousel** (`.hero-carousel`) — 8 slides (`totalSlides = 8`), signal-driven `currentSlide()`, auto-advance via a GSAP tween on `.carousel-dot-fill` (5s per slide) that runs only while visible (IntersectionObserver) and is suppressed under `prefers-reduced-motion`. Manual dot navigation via `goToSlide()`.
- **Trust band**, **Philosophy / "why we're different"**, **Coach section** (with phone mockups + a second "Talk to the Coach" CTA), **Features grid**, **What's New** — all revealed via GSAP `ScrollTrigger`.
- **Footer** — links to [[Legal Pages]].
- `<app-coach-widget />` — the floating [[Coach Demo Widget]], mounted once at the end.

## Opening the Coach demo

The hero/coach CTAs call `openCoach()` in `app.ts`, which logs GA event `click_try_coach` and dispatches a `window` `CustomEvent('open-coach')`. The [[Coach Demo Widget]] listens for that event and opens itself. This event bridge keeps the widget decoupled from the landing.

## Animations (GSAP)

`initGsapAnimations()` builds the hero entrance timeline plus ScrollTrigger reveals for coach section, phone mockups, chat-bubble cascade, feature cards, what's-new and philosophy grids, hero parallax, and footer. **All GSAP is guarded**: only runs in the browser and bails out entirely under `prefers-reduced-motion` (WCAG 2.3.3).

## Other landing behavior

- **Language selector** (toolbar + age-gate variants) — 13 languages, see [[i18n (13 languages)]].
- **Tester signup** modal (`requestBetaAccess`) writes to Firestore `testerSignups` and logs `tester_signup`.
- **Visitor analytics** — `trackVisitorInfo()` logs traffic source (UTM/referrer), device/platform, browser language, timezone, landing page; `trackPageViews()` logs `screen_view` per navigation. See [[Analytics & Consent]].

## Key files

- `src/app/app.ts` — root component logic (carousel, age gate, language, analytics, openCoach).
- `src/app/app.html` — landing markup.
- `src/app/app.css` — landing styles.
