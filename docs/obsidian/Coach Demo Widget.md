---
tags: [web, angular, marketing, coach]
---

# Coach Demo Widget

#web #angular #marketing

Back to [[_Index]]. See also [[Demo Backend Integration]], [[Landing & Hero]], [[i18n (13 languages)]], [[Analytics & Consent]].

`src/app/coach-widget.component.ts` — a single standalone component (`<app-coach-widget>`, selector `app-coach-widget`) holding template, styles, and logic. It is the public, **anonymous** (no login) demo of the AI Coach. A floating gold FAB opens a centered chat panel (ChatGPT/Claude-style).

## Opening

- Tap the FAB, or
- the landing fires `window` `CustomEvent('open-coach')` from `openCoach()` (see [[Landing & Hero]]); the widget's constructor listens for it.

A per-browser `sessionId` (`bs21_demo_sid`) is generated and stored in `localStorage`, sent on every backend call.

## Languages

- **Chrome language** (`lang()`) — widget labels follow the site toggle but are only authored for `es`/`en`/`pt` (the `I18N` object); other selections fall back to `en`.
- **Coach language** (`coachLang()`) — the language the AI actually replies in. Follows the selected site language if it's one of the 13 the coach supports (`COACH_LANGS = en, es, pt, fr, de, it, zh, ja, ko, ar, id, ru, tr`), else device language, else `en`. See [[i18n (13 languages)]].

## Chat flow

1. User sends text (`send()`), or taps a starter chip / place chip / planner category.
2. Routing by current `simMode()`:
   - normal → `ask()` → POST `coachDemoChat`
   - `situation` → `runSim()` → POST `coachDemoSimulate`
   - `multiverse` → `runMultiverse()` → POST `coachDemoMultiverse`
3. Responses render with a typewriter reveal for plain text, or immediately when structured (places/phrases/sim/mv).
4. Per-reply **feedback** 👍/👎 → POST `coachDemoFeedback`.

Endpoints and exact payload/response shapes are documented in [[Demo Backend Integration]].

## Rich result types (rendered)

- **Place cards** (`PlaceCard`) — name, address, rating, `mapsUrl`, and (R36) a psychology panel: `score` (% fit), `why`, `perspectives[]` tags, `tip`. First card with a score is highlighted as "best". Tapping a card opens Google Maps and POSTs `coachDemoPlaceClick` (analytics, fail-open). Surfaced via the **place chip** and the **Date planner** category row.
- **Suggested phrases** (`phrases[]` + `phraseMeta[]`) — each phrase shows a psychology "lens" (`perspective`) and `why` (the **phrase-debate result**), with a copy button.
- **Situation simulation** (`SimResult`) — a stage + N **approaches** in a swipeable carousel/pager; each approach has tone, phrase, confidence stars, `why`, and `perspectives[]`. Best approach (highest confidence) is starred.
- **Multiverse simulation** (`MvResult`) — overall compatibility score/stars/label + 5 **stages** (emoji, label, narrative, best phrase, score, tip) in a carousel, plus `keyInsights[]`.

## Places / location handling

The place chip and planner categories need a location:
- Permission **granted** → use `getCurrentPosition` coords directly.
- **prompt/unknown** → trigger the native permission request.
- **denied/blocked** → show an inline **city text input** fallback so the user is never dead-ended (sends `{ city }` instead of `{ lat, lng }`).

The widget tracks venues/phrases already shown this session (`shownPlaces`/`shownPhrases`, sent as `exclude`/`excludePhrases`) so re-pressing returns **different** results; the backend `exhausted` flag recycles them.

## Date planner

A row of venue categories (café / restaurant / bar / club). The category matching the **current local hour** is marked "suggested now" (`suggestedCat()`: morning→café, day→restaurant, evening→bar, late-night→club).

## Free-taste / app CTA funnel

`FREE_TASTE = 2`. After 2 replies the widget can show an app-store download CTA + soft counter — but the whole funnel is **gated OFF** by default: `appCtaEnabled` flips only when the backend returns `appCta: true` (Remote Config `coach_demo_app_cta`). Store links: iOS `id6470783901`, Android `com.black.sugar21`.

## Analytics events

`coach_demo_open`, `coach_demo_message`, `coach_demo_simulate`, `coach_demo_multiverse`, `coach_demo_place_chip`, `coach_demo_place_click`, `coach_demo_feedback`, `coach_demo_share`, `coach_demo_download`, `coach_demo_limited`. See [[Analytics & Consent]].

## Key file

- `src/app/coach-widget.component.ts` (~1000 lines: template + styles + logic).
