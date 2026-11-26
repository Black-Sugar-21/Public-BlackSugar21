# Changelog

## 2026-11-26: Android pasa a «Pide acceso»

- `blacksugar21.com`: el botón Android dice «Pide acceso» y abre un correo de solicitud; `/android` ya no ofrece descarga ni lee `latest.json` (13 idiomas). Motivo: los APK de descarga directa publicados no abrían (traían la protección automática de Google Play). Interruptor único `ANDROID_MODE` en `src/app/pages/android/android-mode.ts`: para reactivar la descarga, cambiarlo a `'descarga'`, solo con un APK que abra.

## Sin publicar

- **Web `blacksugar21.com`: «Android (beta)» junto a TestFlight y página `/android`** (13 idiomas, árabe RTL): descarga directa del APK de prueba leyendo `/descargas/android/latest.json` del mismo sitio (8 vistas: cargando, neutral, Google Play gana, otra app → abrir en Chrome, Android viejo, sin conexión, no disponible, lista; iPhone/Mac → TestFlight; computador → QR). Sin APK publicado dice «aún no está lista», nunca un botón roto. Los botones «Android: pide acceso» pasan a «Android (beta)». `latest.json` sin caché y tipo MIME del APK en `firebase.json`.
