# PublicBlackSugar21

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.0.0.

## 🎯 Testing System

BlackSugar21 includes a **comprehensive testing system** centralized in a single interactive script.

### Quick Start
```bash
cd scripts
node test-master.js
```

### Features
- 📱 **Matches**: Create matches with automatic notifications
- 💬 **Messaging**: Send test messages and simulate conversations
- 🎯 **Discovery**: Create and fix discovery profiles for HomeView/Swipe
- 🔍 **Diagnostics**: Complete system verification
- 🧹 **Cleanup**: Selective cleanup with 5 levels

📚 **Full Documentation**: [scripts/README_TESTING.md](scripts/README_TESTING.md)

---

## Landing de producto y «Prueba la beta» (2026-10)

- Los enlaces de prueba y de tienda viven **solo** en `src/beta-links.json` (`src/app/ui/lottie/beta-links.ts`). Un
  enlace `null` no muestra botón: la tarjeta dice «Próximamente». Al 2026-10-10: TestFlight público
  `https://testflight.apple.com/join/gSquX4CT` (verificado con la API de App Store Connect); App Store y Google Play
  **no tienen ficha pública** (las insignias anteriores llevaban a páginas 404), así que se ocultan; Android sigue con la
  solicitud por correo (modal de tester).
- Lottie: `src/app/ui/lottie/lottie.directive.ts` con lottie-web light vendorizado (MIT), carga diferida y solo en el
  navegador; animaciones propias en `public/lottie/` (`scripts/make-site-lottie.py`). Fuentes en `NOTICE`.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
