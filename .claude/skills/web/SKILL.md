---
name: web
description: BlackSugar21 public web app — Angular 21 standalone, Firebase Hosting, multi-language legal pages (es/en/pt), CSP headers, color system aligned with iOS. Use when working with the website, legal pages, deployment to Firebase Hosting, CSS styles, or internationalization.
globs:
  - "src/**/*.ts"
  - "src/**/*.html"
  - "src/**/*.css"
  - "angular.json"
  - "firebase.json"
  - "package.json"
---

# BlackSugar21 — Web (Angular + Firebase Hosting)

## Proyecto

- **Framework**: Angular 21 (standalone components) + TypeScript 5.9.2
- **Firebase Hosting site**: `black-sugar21`
- **URL**: https://black-sugar21.web.app / https://blacksugar21.com
- **Firebase SDK**: 12.6.0 (web)
- **Ruta**: `/Users/daniel/IdeaProjects/Public-BlackSugar21`
- **Build output**: `dist/Public-BlackSugar21/browser/`

## Landing Page — Hero Carousel (GSAP + IntersectionObserver)

6 slides con auto-rotate controlado por GSAP + visibilidad por IntersectionObserver:

| # | Slide | EN image | ES image |
|---|-------|----------|----------|
| 1 | Discovery AI | `discovery-en.png` | `discovery-es.png` |
| 2 | AI Photo Coach | `coachIA-photo-en.jpeg` | `coachIA-photo-es.jpeg` |
| 3 | AI Icebreakers | `break-ice-en.png` | `break-ice-es.png` |
| 4 | AI Date Planning | `planning-en.jpg` | `planning-es.png` |
| 5 | Places Coach | `places-coach-en.png` | `places-coach-es.png` |
| 6 | AI Conversational Coach | `coachIA-conversation-en.jpeg` | `coachIA-conversation-es.png` |

### Arquitectura del carrusel
- **`currentSlide`**: `signal(0)` — Angular detecta cambios automáticamente
- **`IntersectionObserver`** (threshold 0.3): detecta visibilidad del carrusel
  - Visible → `animateDot()` empieza
  - No visible → `pauseCarousel()` (ahorra CPU)
- **`animateDot()`**: GSAP tween anima `.carousel-dot-fill` width 0%→100% en 5s
  - `onComplete` → avanza slide → llama `animateDot()` recursivamente
- **`goToSlide(i)`**: mata tween + cambia slide + reinicia animación
- **NO usa `setInterval` ni CSS animations** — GSAP controla todo el ciclo
- **Shimmer**: `.img-shimmer` gradient púrpura animado mientras imágenes cargan

### GSAP Animations (integradas en `app.ts`)
- Hero Timeline: logo bounce → título → tagline → buttons → carousel
- ScrollTrigger Coach: phones entran desde lados + features stagger
- ScrollTrigger Features: cards stagger desde abajo
- Parallax Hero: backgroundPositionY scrub
- Footer: fade-in reveal
- `gsap.context()` para cleanup en `ngOnDestroy()`
- `isPlatformBrowser` guard para SSR safety
- `initGsapAnimations()` se ejecuta después de age gate verification

### Responsive
- **Desktop**: max-width 420px
- **Tablet** (768px): 90vw, dots 6px/28px
- **Phone** (480px): 95vw, border-radius 14px
- Viewport meta: `width=device-width, initial-scale=1`

### Dependencias
- `gsap: ^3.14.2` con `ScrollTrigger` plugin
- Bundle budget: 1.5MB (con GSAP)

## Rutas publicas

| Ruta | Componente | Directorio |
|---|---|---|
| `/terms` | `TermsComponent` | `src/app/pages/terms/` |
| `/privacy` | `PrivacyComponent` | `src/app/pages/privacy/` |
| `/data-deletion` | `DataDeletionComponent` | `src/app/pages/data-deletion/` |
| `/safety-standards` | `SafetyStandardsComponent` | `src/app/pages/safety-standards/` |
| `/moderation-policy` | `ModerationPolicyComponent` | `src/app/components/moderation-policy/` |
| `/politicas-moderacion` | `ModerationPolicyComponent` | Alias espanol |
| `/**` | redirect -> `/terms` | |

## Archivos clave

| Archivo | Proposito |
|---|---|
| `src/app/app.ts` | Componente raiz (standalone) |
| `src/app/app.routes.ts` | Definicion de rutas (6 rutas) |
| `src/app/app.config.ts` | Configuracion de providers + Firebase + App Check |
| `src/app/firebase.config.ts` | Firebase config + reCAPTCHA App Check |
| `src/app/firebase.service.ts` | Servicio Firebase (inicializacion) |
| `src/app/translation.service.ts` | i18n ES/EN/PT (~689 lineas, BehaviorSubject) |
| `src/styles.css` | Estilos globales + CSS variables |
| `src/app/app.css` | Estilos del componente raiz |

## Internacionalizacion (i18n)

- **Servicio**: `TranslationService` (inyectable, standalone)
- **Idiomas**: `es` (default), `en`, `pt`
- **Deteccion**: automatica por `navigator.language`
- **Observable**: `currentLang$` (BehaviorSubject)
- **Uso en templates**: `{{ t.translate('key') }}`

```typescript
// Ejemplo
this.translationService.setLanguage('pt');
this.translationService.translate('nav.terms'); // -> "Termos"
```

## Patron Angular 21 — Standalone Components

```typescript
@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './privacy.component.html',
  styleUrl: './privacy.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PrivacyComponent {
  t = inject(TranslationService);
}

// Lazy loading en rutas
{
  path: 'terms',
  loadComponent: () => import('./pages/terms/terms.component').then(m => m.TermsComponent)
}
```

## Angular Signals (patron Angular 21)

```typescript
import { Component, signal, computed } from '@angular/core';

@Component({ selector: 'app-example', standalone: true, template: `
  <p>{{ fullName() }}</p>
` })
export class ExampleComponent {
  firstName = signal('Daniel');
  fullName = computed(() => this.firstName());
}
```

## Sistema de colores CSS (fuente de verdad: iOS)

**REGLA CRITICA**: NUNCA usar colores hardcodeados en CSS de componentes. Siempre usar CSS variables de `src/styles.css`.

Los colores estan alineados 1:1 con iOS (`ColorTheme.swift` + `AppColor.swift`).

```css
:root {
  /* Backgrounds — iOS ColorTheme.swift */
  --bg-dark: #0A0A0A;             /* iOS: primaryDark */
  --bg-card: #1A1A1A;             /* iOS: surfaceDark */
  --bg-overlay: #2D2D2D;          /* iOS: textSecondaryLight */
  --card-bg: #1E1E1E;             /* iOS: cardBgDark */

  /* Gold — iOS AppColor.swift */
  --gold-dark: #B8860B;           /* accentDark / darkGoldenrod */
  --gold: #D4AF37;                /* accentVariantDark / metallicGold */
  --gold-variant: #C5A028;        /* goldVariant */
  --gold-star: #FFD700;           /* ratingStarGold */

  /* Purple */
  --purple: #4A004F;              /* secondaryAccentDark */
  --purple-vivid: #831bfc;        /* purpleColors[0] */
  --purple-light: #9c59ea;        /* purpleColors[1] */

  /* Reactions */
  --dislike-red1: #FF6560; --dislike-red2: #F83770;
  --like-green1: #6CEAC5;  --like-green2: #16DBA1;
  --app-red: #FF4457;

  /* Brand */
  --facebook-blue: #1877F2;  --instagram-pink: #E4405F;

  /* Text */
  --text-primary: #FFFFFF;   --text-secondary: #E0E0E0;   --text-muted: #B0B0B0;

  /* Gradients */
  --gradient-gold: linear-gradient(135deg, var(--gold-dark), var(--gold));
  --gradient-purple: linear-gradient(135deg, #2a002e, var(--purple));
  --gradient-premium: linear-gradient(135deg, var(--bg-card), #252525);
  --gradient-main: linear-gradient(to bottom, #0A0A14, #140B28, #1C0E38);
}
```

**Tipografia**: Body `'Outfit', sans-serif` | Headers `'Playfair Display', serif`

## Content Security Policy

```html
<!-- src/index.html -->
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self';
               script-src 'self' 'unsafe-inline' https://apis.google.com;
               style-src 'self' 'unsafe-inline';
               img-src 'self' data: https:;
               connect-src 'self' https://*.firebaseio.com https://*.googleapis.com;">
```

## Firebase App Check Web

```typescript
// app.config.ts
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

provideFirebaseApp(() => {
  const app = initializeApp(firebaseConfig);
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('your-recaptcha-site-key'),
    isTokenAutoRefreshEnabled: true
  });
  return app;
})
```

## Cache Headers (firebase.json)

```json
"headers": [
  { "source": "**/*.@(jpg|jpeg|gif|png|svg|webp|ico)",
    "headers": [{"key": "Cache-Control", "value": "public, max-age=31536000, immutable"}] },
  { "source": "**/*.@(js|css)",
    "headers": [{"key": "Cache-Control", "value": "public, max-age=31536000, immutable"}] }
]
```

SPA rewrite: todas las rutas -> `/index.html`

## Comandos

```bash
cd /Users/daniel/IdeaProjects/Public-BlackSugar21

# Desarrollo
npm start                          # Dev server localhost:4200
npm run watch                      # Build con watch mode

# Build
npm run build                      # Development build
npm run build:prod                 # Production build

# Deploy (recomendado)
./deploy.sh                        # Script automatizado
npm run deploy                     # build:prod + firebase deploy
npm run deploy:hosting             # build:prod + deploy solo hosting
firebase deploy --only hosting     # Solo hosting

# Reglas
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only storage

# Tests
npm test                           # Vitest unit tests

# Verificar
open https://black-sugar21.web.app
firebase hosting:channel:list
```

## CI/CD GitHub Actions

Deploy automatico en push a `main`:
```yaml
# .github/workflows/deploy.yml
on: push (branches: [main])
steps: setup-node (20) -> npm ci + build:prod -> FirebaseExtended/action-hosting-deploy@v0
```

## Scripts de administracion (`scripts/`)

| Script | Proposito |
|---|---|
| `seed-reviewer.js --clean` | Crear/recrear data del reviewer |
| `seed-profiles.js` | Crear perfiles de prueba |
| `index-coach-knowledge.js` | Indexar Coach RAG (256 chunks). `--clean`, `--dry-run` |
| `index-moderation-knowledge.js` | Indexar Moderation RAG (73 chunks). `--clean`, `--dry-run` |
| `test-system-unified.js` | Sistema maestro de testing |
| `get-user-email.js <uid>` | Lookup email por UID |

**Service Account**: `scripts/serviceAccountKey.json` (gitignored)

## Dependencias principales

| Paquete | Version |
|---|---|
| `@angular/core` | `^21.0.0` |
| `firebase` | `^12.6.0` |
| `firebase-admin` | `^13.6.0` (scripts) |
| `typescript` | `~5.9.2` |

## Troubleshooting

| Error | Fix |
|---|---|
| 404 en refresh produccion | Ya configurado: rewrites `**` -> `/index.html` |
| Build lento | `ng cache clean` o `NODE_OPTIONS=--max_old_space_size=4096 npm run build:prod` |
| CORS Firebase Storage | `gsutil cors set cors.json gs://blacksugar21.firebasestorage.app` |
| Module not found | `rm -rf node_modules package-lock.json && npm install` |
| Deploy fails | `firebase use black-sugar21` + verificar `dist/Public-BlackSugar21/browser/` |
