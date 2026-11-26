# Changelog

## Sin publicar

- **Web `blacksugar21.com`: «Android (beta)» junto a TestFlight y página `/android`** (13 idiomas, árabe RTL): descarga directa del APK de prueba leyendo `/descargas/android/latest.json` del mismo sitio (8 vistas: cargando, neutral, Google Play gana, otra app → abrir en Chrome, Android viejo, sin conexión, no disponible, lista; iPhone/Mac → TestFlight; computador → QR). Sin APK publicado dice «aún no está lista», nunca un botón roto. Los botones «Android: pide acceso» pasan a «Android (beta)». `latest.json` sin caché y tipo MIME del APK en `firebase.json`.
