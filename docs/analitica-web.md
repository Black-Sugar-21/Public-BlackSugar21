# Analítica web de blacksugar21.com (GA4 con consentimiento)

Sigue el diseño de referencia de Bimbask (`docs/analitica-web.md` del repo `labs`, módulo `web-analytics.ts` de `enterprise-public`).

## Estado
- **Apagada por defecto**: `src/app/analytics.config.ts`. Vacío = no se descarga nada, no se muestra aviso y no sale ni una petición a Google.
- measurementId existente: `G-VBSNDGKVLJ` (proyecto Firebase `black-sugar21`). El dueño lo pone al publicar.
- Ya NO se usa el SDK de Firebase Analytics: gtag.js mínimo, solo tras «Aceptar» y en inactividad. Consent Mode v2 con todo
  denegado por defecto, sin Google Signals ni personalización de anuncios, Do Not Track / Global Privacy Control = no.
- Lista cerrada de eventos: `src/app/analytics-events.ts` (snake_case). Lo que no está en la tabla no se envía; las pruebas rechazan
  parámetros con correo, teléfono, texto libre o identificadores.
- Se eliminaron `visitor_info` (zona horaria, idioma, fuente) y `email_domain`; no se envía tipo de perfil, swipes, matches ni mensajes.
- Firebase sigue diferido: la analítica no lo pide ni lo carga (`FirebaseService.logEvent` ahora delega en `AnalyticsService`).
- `/opinion/{token}` (token secreto): sin aviso ni medición; en el resto, rutas sin tokens.

## Pasos del dueño al publicar
1. Poner el measurementId en `src/app/analytics.config.ts`.
2. GA4 > Administrador > Recopilación de datos: Señales de Google y personalización de anuncios apagadas; retención 2 meses
   (coincide con el texto de privacidad) y filtro de tráfico interno.
3. Probar con `node scripts/analytics-check.mjs --dist <carpeta construida con un ID de prueba> --out capturas`.
4. [ABOGADO] revisar el texto del aviso y el párrafo de la política en los 13 idiomas.
