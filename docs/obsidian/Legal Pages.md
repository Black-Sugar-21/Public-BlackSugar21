---
tags: [web, angular, marketing, legal]
---

# Legal Pages

#web #angular #marketing

Back to [[_Index]]. See also [[Architecture]], [[Analytics & Consent]].

The compliance/legal pages are standalone components reached via `src/app/app.routes.ts`. They render outside the homepage `<main>` (`isHomeRoute()` gates the landing), so each shows only its own content. All content is fully translated via [[i18n (13 languages)]].

## Routes & components

| Route(s) | Component | File | Title |
|---|---|---|---|
| `terms` | `TermsComponent` | `pages/terms/` | Términos de Uso |
| `privacy` | `PrivacyComponent` | `pages/privacy/` | Política de Privacidad |
| `data-deletion` | `DataDeletionComponent` | `pages/data-deletion/` | Eliminación de Datos |
| `safety-standards` | `SafetyStandardsComponent` | `pages/safety-standards/` | Estándares de Seguridad Infantil |
| `moderation-policy`, `politicas-moderacion` | `ModerationPolicyComponent` | `components/moderation-policy/` | Políticas de Moderación |

(`features` and `analytics` are lazy-loaded marketing pages, not legal — see [[Architecture]].)

## Notes

- **Terms** — usage terms; 18+ only; discloses that AI Coach content is processed by AI providers (e.g. Google Gemini), that users are responsible for content submitted and decisions based on AI suggestions, and that anonymous analytics are used (ties to [[Analytics & Consent]]).
- **Privacy** — what data is collected, how it's used, user rights; covers AI-Coach processing and analytics.
- **Data deletion** — describes account deletion as immediate and permanent from the app.
- **Safety standards** — child-safety / CSAE prevention statement (AI-powered safety systems), required for store compliance.
- **Moderation policy** — content moderation rules (two URL aliases: English-style + Spanish slug).

`getPageName()` in `app.ts` maps these paths to GA `screen_view` page titles. The footer in [[Landing & Hero]] links to these pages.

## Key files

- `src/app/app.routes.ts` — route declarations.
- `src/app/pages/{terms,privacy,data-deletion,safety-standards}/`
- `src/app/components/moderation-policy/`
- `src/app/translation.service.ts` — all legal copy (13 languages).
