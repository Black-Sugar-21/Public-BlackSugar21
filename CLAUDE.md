# BlackSugar21 — Workspace Principal

## Proyectos incluidos
- **Backend principal (CoachFish)**: `/Users/daniel/IdeaProjects/CoachFish` (Firebase Functions Node.js — Cloud Functions actuales)
- **Web/Angular + backend legacy**: `/Users/daniel/IdeaProjects/Public-BlackSugar21` (sitio público + Firestore/Storage rules — fuente de verdad → copiar a CoachFish al cambiar)
- **Android**: `/Users/daniel/AndroidStudioProjects/BlackSugar212` (Kotlin + Firebase)
- **iOS**: `/Users/daniel/AndroidStudioProjects/iOS` (Swift + Firebase)

## Backend canónico: CoachFish
Functions vive en `/Users/daniel/IdeaProjects/CoachFish/` (no en `Public-BlackSugar21/functions/`). Deploy: `firebase deploy --only functions --project black-sugar21` desde **CoachFish**.

Módulos clave en `/Users/daniel/IdeaProjects/CoachFish/lib/`:
- AI Coach: `coach.js`, `coach-nudge-agent.js`
- Simulación: `multi-universe-simulation.js`, `situation-simulation.js`, `simulation.js`
- Debate stack: `debate-psychology.js`, `debate-agents.js`, `debate-synthesizer.js`, `debate-orchestrator.js`, `debate-json-salvage.js`, `debate-principles-refresher.js`
- Otros: `ai-services.js`, `discovery.js`, `discovery-feed.js`, `moderation.js`, `notifications.js`, `places.js`, `places-helpers.js`, `multiverse-places.js`, `safety.js`, `scheduled.js`, `shared.js`, `storage.js`, `stories.js`, `users.js`, `wingperson.js`

## Estado de tests (post R32-R35, 2026-05-12)

- **14 suites, 3189/3189 asserts** (0 failures). Detalle en [docs/agents/internal-tests.md](docs/agents/internal-tests.md) (en CoachFish).
- **Live lang probe**: 120/120 (10 CFs × 12 langs). Correr post-deploy: `node test-live-lang-probe.js`.
- **E2E smoke**: 6/6 (Firestore + RC + RAG + cache schema). Correr: `node test-e2e-smoke.js`.
- **CACHE_SCHEMA_VERSION = 21** (3-way aligned: backend = Android `CoachMessage.kt:50` = iOS `CoachChatViewModel.swift:149`).
- **Refresher CF `refreshDebatePrinciples`**: Mon 03:00 UTC, `maxInstances: 1`. Writes principles to `debatePrinciples` + embeddings 768-dim to `coachKnowledge` (`type: 'auto_debate'`).

## Estructura del proyecto web (legacy)
- `src/` — Angular frontend
- `functions/` — Firebase Cloud Functions (Node.js — **legacy**, prefer CoachFish)
- `firestore.rules` / `storage.rules` — fuente de verdad (copiar a CoachFish al editar)

## Comandos principales

### Web/Angular
```bash
npm start              # Dev server
npm run build          # Build producción
npm test               # Tests
```

### Firebase Functions
```bash
cd functions
npm run build          # Compilar TypeScript
firebase deploy --only functions   # Deploy funciones
firebase deploy        # Deploy completo
```

### Android
```bash
cd /Users/daniel/AndroidStudioProjects/BlackSugar212
./gradlew assembleDebug    # Build debug
./gradlew assembleRelease  # Build release
./deploy-android.sh        # Deploy
```

### iOS
```bash
cd /Users/daniel/AndroidStudioProjects/iOS
./build-local.sh       # Build local
./deploy-appstore.sh   # Deploy App Store
./deploy-to-firebase.sh # Deploy Firebase Distribution
```

## Convenciones de código

### Functions (Node.js)
- Módulos separados en `functions/lib/`
- Cada módulo exporta sus handlers
- Manejo de errores consistente con try/catch
- Logs con `console.log` estructurado

### Angular
- Componentes en `src/app/`
- Servicios para lógica de negocio
- Observables con RxJS

### iOS (Swift)
- SwiftUI para UI
- Firebase SDK para auth/firestore/storage
- Arquitectura MVVM

## Iniciar workspace completo
```bash
claude --add-dir /Users/daniel/AndroidStudioProjects/BlackSugar212 \
       --add-dir /Users/daniel/AndroidStudioProjects/iOS
```

O usar el script de lanzamiento:
```bash
./start-workspace.sh
```

## Coach IA demo widget (2026-06)

Public, anonymous "taste" of the AI Emotional Intelligence Coach — the public-site embodiment of the Apple 4.3(b) positioning (NOT a dating app; intentionally marked as a DEMO).

**Commits**: este repo (Public-BlackSugar21) @ `6fdce7e` (session R28); backend CoachFish @ `f01d73f`.

### Frontend
- **NEW component**: `src/app/coach-widget.component.ts` (standalone). Imported in `src/app/app.ts`, rendered in `src/app/app.html` después de `ageVerified()`.
- FAB dorado flotante **"Coach IA"** → panel de chat.
- Features: typewriter estilo ChatGPT; badge "**Versión de prueba**" + footer "Generado por IA · versión de prueba"; chips sugeridos; **PLACE cards reales** cercanas (pide geolocalización vía `navigator.geolocation` O input de ciudad → backend geocodifica); listas de **frases de apertura copiables**; **CTA viral tras 2 respuestas** ("Descargar app" detecta iOS/Android + "Compartir" vía `navigator.share`/clipboard con el último consejo). i18n **es/en**, lee idioma de `TranslationService.currentLanguage()` (signal).
- Geolocalización requiere HTTPS + permiso; el input de ciudad cubre la denegación.

### Backend endpoint — `coachDemoChat`
- **PÚBLICO** `onRequest` HTTP (sin auth): `https://us-central1-black-sugar21.cloudfunctions.net/coachDemoChat`. Source: `lib/coach-demo.js` en CoachFish.
- **CORS** restringido a `blacksugar21.com` / `www` / `black-sugar21.web.app` / `firebaseapp.com` / `localhost`.
- **Rate limit por IP**: 12/h (colección `demoRateLimits`).
- Sin perfil, sin créditos, anónimo. Grounded en RAG `coachKnowledge` + persona del coach, **Gemini-lite**.
- Gated por RC flag **`coachDemo`** (default ON, v98).
- **Intent**: PLACE (→ pide ubicación, luego Google Places real vía `placesTextSearch` + `forwardGeocode`), PHRASE (→ lista JSON de openers de Gemini), else texto general.
- **Retorna**: `{reply, demo:true, places?, phrases?, needLocation?, limited?}`.
