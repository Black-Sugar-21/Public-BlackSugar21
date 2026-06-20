---
tags: [web, angular, marketing, moc]
---

# Black Sugar 21 — Public Marketing Site

> **Open as an Obsidian vault**: in Obsidian → *Open folder as vault* → select `docs/obsidian/`. Use the **graph view** to navigate the architecture via the `[[wikilinks]]` below.

#web #angular #marketing

## Overview

The public marketing site for **Black Sugar 21**, an "AI Emotional Intelligence Coach for dating" product. It is a single-page **Angular 21 standalone** app, statically built and served on **Firebase Hosting** at **black-sugar21.web.app** / **blacksugar21.com**.

The site's centerpiece is a **live demo of the AI Coach** (a floating chat widget) that talks to public Cloud Functions, plus a marketing landing (hero + carousel + sections) and a set of legally-required pages (terms, privacy, data deletion, child-safety, moderation).

- **Framework**: Angular 21 standalone components (no NgModules), signals, control-flow (`@if`/`@for`).
- **Hosting**: Firebase Hosting, site id `black-sugar21`, SPA rewrite all → `/index.html`.
- **Build output**: `dist/Public-BlackSugar21/browser`.
- **i18n**: 13 languages, auto-detected, RTL for Arabic. See [[i18n (13 languages)]].
- **Analytics**: Firebase Analytics (GA4), anonymous, no cookies. See [[Analytics & Consent]].
- **App entry**: `src/app/app.ts` + `src/app/app.html`.

## Map of Content

- [[Architecture]] — stack, routing, hosting, build, cross-cutting services.
- [[Landing & Hero]] — hero, carousel, marketing sections, age gate.
- [[Coach Demo Widget]] — the live demo chat (the site's hero feature).
- [[Demo Backend Integration]] — the `coachDemo*` Cloud Function endpoints + response shapes.
- [[i18n (13 languages)]] — `TranslationService`, supported languages, RTL.
- [[Legal Pages]] — terms / privacy / data-deletion / safety / moderation routes.
- [[Analytics & Consent]] — GA4 events, anonymous analytics, consent disclosure.

## Key files

- `src/app/app.ts` / `src/app/app.html` — root component (landing).
- `src/app/app.routes.ts` — route table.
- `src/app/coach-widget.component.ts` — demo chat widget.
- `src/app/translation.service.ts` — 13-language i18n.
- `src/app/firebase.service.ts` — Auth, Firestore, Analytics, Remote Config, App Check.
- `src/app/services/seo.service.ts` — title/meta/canonical.
- `firebase.json` — Hosting + security headers.
