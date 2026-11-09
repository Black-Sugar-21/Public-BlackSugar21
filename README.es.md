# PublicBlackSugar21

El sitio público de Black Sugar 21 (`blacksugar21.com`): Angular 21 (`@angular/core ^21.2`, standalone), Firebase Hosting, las Cloud Functions de `functions/`
(Node 22) y los scripts de administración de `scripts/`. English version: [README.md](README.md).

- **Idiomas:** 13 en `src/app/translation.service.ts` (`es en pt fr de it ja ko zh ar ru id tr`, 344 claves, idénticas en los 13; verificado el 2026-10-11). El estándar del
  dueño usa `hi` (hindi) en lugar de `id`: **aquí todavía no hay hindi** (las apps sí tienen ambos).
- **Workflows:** todos los de `.github/workflows/` son solo `workflow_dispatch` (nada corre solo).
- **Landing de producto y «Prueba la beta»:** los enlaces de prueba y de tienda viven solo en `src/beta-links.json` (`src/app/ui/lottie/beta-links.ts`); un enlace `null` no muestra botón y la
  tarjeta dice «Próximamente». Lottie propio en `public/lottie/` (`scripts/make-site-lottie.py`); fuentes en `NOTICE`.
- **CI y despliegue a mano:** `gh workflow run ci.yml -R Black-Sugar-21/Public-BlackSugar21` (pruebas del sitio y de las funciones con puertas de cobertura al 95 %, seguridad y CodeQL; bimbask-ci v1.3.0; el repo aún no declara umbral). `gh workflow run deploy.yml -R Black-Sugar-21/Public-BlackSugar21 -f confirm=Public-BlackSugar21` (pide escribir el texto de confirmación; solo lo corre el dueño). `e2e-smoke.yml` es la revisión previa a un lanzamiento.
- **Pruebas:** `npm test` (`ng test`); `cd functions && npm test`. Sistema de pruebas con scripts: `cd scripts && node test-master.js` (ver [scripts/UAT_TESTING_PLAN.md](scripts/UAT_TESTING_PLAN.md) y [BACKEND_TESTING_PLAN.md](BACKEND_TESTING_PLAN.md)).
- **Despliegue:** `deploy.sh` y los workflows manuales; el despliegue real solo con el visto bueno del dueño.
