---
tags: [web, angular, marketing, i18n]
---

# i18n (13 languages)

#web #angular #marketing

Back to [[_Index]]. See also [[Architecture]], [[Coach Demo Widget]].

`src/app/translation.service.ts` — a single `TranslationService` holding an in-memory dictionary of translation keys, each with values for all 13 languages. Used across [[Landing & Hero]] and [[Legal Pages]]. (The [[Coach Demo Widget]] has its own small `I18N` for chrome labels in es/en/pt, but uses this service for the *selected* language.)

## Supported languages (13)

`Language` type + `LANGUAGES` list (code · native name · flag):

`es` Español · `en` English · `pt` Português · `fr` Français · `de` Deutsch · `it` Italiano · `zh` 中文 · `ja` 日本語 · `ko` 한국어 · `ru` Русский · `ar` العربية · `id` Bahasa · `tr` Türkçe.

These are the same 13 the AI Coach backend responds in (mirrors `COACH_LANGS` in the widget).

## Detection & persistence (`detectBrowserLanguage`)

1. If `localStorage.preferredLanguage` is set and valid → use it.
2. Else scan **all** `navigator.languages`, folding regional variants to base code (`pt-BR`→`pt`, `zh-TW`→`zh`), pick the first supported one.
3. Else default to `en`.

`setLanguage()` persists the choice to `localStorage` and, for logged-in users, syncs to Firebase (`updateLanguagePreference`).

## RTL (Arabic)

`applyLanguage()` keeps the document in sync for a11y/SEO (WCAG 3.1.1/3.1.2):
- `document.documentElement.lang = lang`
- `document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'`

Arabic is the only RTL language; every other language renders LTR.

## Lookups

- `translate(key, params?)` — returns the value for the current language, falling back `en` → `es` → the raw key. Supports `{param}` interpolation (e.g. `{age}`). Logs a console warning on a missing key.
- `t(key)` — deprecated alias for `translate`.
- `setLanguage(lang)` / `toggleLanguage()` (es↔en) for the UI selector.

## Selector UI

`app.ts` exposes `languages` (the `LANGUAGES` list) and `selectLanguage()` for both the toolbar and the age-gate selectors. Selecting a language updates the UI, the [[Coach Demo Widget]]'s reply language, persists, and syncs to Firebase if signed in.

## Key files

- `src/app/translation.service.ts` — service, `LANGUAGES`, dictionary, detection, RTL.
- `src/app/app.ts` — selector wiring.
