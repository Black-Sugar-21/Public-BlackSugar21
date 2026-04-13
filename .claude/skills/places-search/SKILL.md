---
name: places-search
description: Sistema de busqueda de lugares de BlackSugar21 — algoritmo de radio progresivo, loadMore exponencial, fuzzyMatchPlace 3 niveles, Google Places API. Usado por getDateSuggestions, searchPlaces y dateCoachChat (fetchCoachPlaces). Usar cuando se trabaje con busqueda de lugares, radio progresivo, Google Places API o paginacion de venues.
globs:
  - "functions/lib/places.js"
  - "functions/lib/places-helpers.js"
  - "functions/lib/coach.js"
---

# Places Search — BlackSugar21

## Archivos clave

| Archivo | Proposito |
|---|---|
| `functions/lib/places.js` | CFs `getDateSuggestions` (L13) y `searchPlaces` (L156) |
| `functions/lib/places-helpers.js` | Helpers internos: `haversineKm` (L26), `fuzzyMatchPlace` (L99), `placesTextSearch` (L413), `transformPlaceToSuggestion`, `estimateTravelMin` |
| `functions/lib/coach.js` | `fetchCoachPlaces()` — usa la misma estrategia de radio progresivo |

## Algoritmo de radio progresivo

### Formula computedMinR

```
computedMinR = haversineKm(user1, user2) / 2 * 1000 + minRadius
```

Donde:
- `haversineKm(user1, user2)` = distancia en km entre ambos usuarios del match
- Se divide por 2 para obtener el radio minimo que cubra el punto medio
- Se multiplica por 1000 para convertir a metros
- `minRadius` = buffer minimo (default `3000` metros, configurable via RC `places_search_config.minRadius`)

### Busqueda inicial (step=0)

1. Calcular `computedMinR` entre ambos usuarios
2. Filtrar `progressiveRadiusSteps` para quedarse solo con steps >= `computedMinR`
3. Si ningun step es >= `computedMinR`, usar `[computedMinR]` como unico step
4. Iterar por los steps filtrados en orden ascendente
5. En cada step, ejecutar queries paralelas a Google Places API
6. Si se alcanza `minPlacesTarget` (default 30), detener expansion
7. Registrar `lastRadiusUsed` para uso en loadMore

### Configuracion progressiveRadiusSteps

```javascript
// Default (configurable via RC places_search_config)
progressiveRadiusSteps: [15000, 30000, 60000, 120000, 200000, 300000]
// En metros: 15km, 30km, 60km, 120km, 200km, 300km
```

### loadMore — Expansion exponencial

Para `loadCount > 0` (paginacion):

```
lmRadius = min(maxR, max(computedMinR, lmBase) * expansionBase^(min(step, maxStep) + 1))
```

Donde:
- `lmBase` = `loadMoreDefaultBaseRadius` (default `60000` = 60km) — fallback cuando no hay cache del radio inicial
- `expansionBase` = `loadMoreExpansionBase` (default `2`)
- `step` = `loadCount` (numero de veces que el usuario ha pedido "cargar mas")
- `maxStep` = `loadMoreMaxExpansionStep` (default `4`) — cap del exponente

**Ejemplo con defaults** (lmBase=60km, expansionBase=2):
- step 1: max(computedMinR, 60km) * 2^2 = 240km
- step 2: max(computedMinR, 60km) * 2^3 = 480km -> capped a 300km (maxRadius)
- step 3: max(computedMinR, 60km) * 2^4 = 960km -> capped a 300km
- step 4: cap de maxStep, mismo radio

`hasMore = lastRadiusUsed < maxRadius` (300km)

## categoryQueryMap

14 categorias bilingues (configurable via RC o fallback a `DEFAULT_CATEGORY_QUERY_MAP`):

```javascript
{
  "cafe": ["cafe", "coffee shop", "cafeteria"],
  "restaurant": ["restaurant", "restaurante"],
  "bar": ["bar", "cocktail bar", "pub"],
  "night_club": ["night club", "discoteca", "club nocturno"],
  "movie_theater": ["movie theater", "cine"],
  "park": ["park", "parque", "jardin"],
  "museum": ["museum", "museo", "galeria"],
  "bowling_alley": ["bowling", "boliche"],
  "art_gallery": ["art gallery", "galeria de arte"],
  "bakery": ["bakery", "panaderia", "pasteleria"],
  "shopping_mall": ["shopping mall", "centro comercial"],
  "spa": ["spa", "wellness", "masajes"],
  "aquarium": ["aquarium", "acuario"],
  "zoo": ["zoo", "zoologico"]
}
```

## locationRestriction — SOLO rectangle

Google Places API v2 NO soporta `circle` como `locationRestriction`. Siempre usar **bounding box rectangle**:

```javascript
locationRestriction: {
  rectangle: {
    low: { latitude: centerLat - delta, longitude: centerLng - delta },
    high: { latitude: centerLat + delta, longitude: centerLng + delta }
  }
}
```

Si se usa `circle`, retorna error HTTP 400.

## fuzzyMatchPlace — Merge de 3 niveles

Archivo: `places-helpers.js:L99`

Cuando Gemini rankea/filtra places, retorna IDs y nombres que pueden no coincidir exactamente con los resultados de Google Places API. `fuzzyMatchPlace` resuelve esto con 3 niveles de matching:

1. **Nivel 1 — ID exacto**: busca `geminiPlaceId` en `byIdLookup` (Map de placeId -> place)
2. **Nivel 2 — Nombre exacto**: busca `title` (normalizado a lowercase) en `byNameLookup` (Map de displayName -> place)
3. **Nivel 3 — Substring fuzzy**: busca coincidencia parcial entre `title` y los `displayName` de `allPlaces`, comparando substrings normalizados

Si los 3 niveles fallan, retorna `null` (no matched).

## Queries paralelas

| Escenario | Queries | Config key |
|---|---|---|
| Con categoria seleccionada | 3 queries paralelas | `queriesWithCategory` (default 3) |
| Sin categoria (random) | 5 queries paralelas | `queriesWithoutCategory` (default 5) |
| Default por categoria | 4 queries | `defaultCategoryQueryCount` (default 4) |

Cada query retorna hasta `perQueryResults` (default 20) resultados.
Cap intermedio: `maxPlacesIntermediate` (default 60) places unicos antes de scoring.

## placesTextSearch

Archivo: `places-helpers.js:L413`

Wrapper de Google Places API v2 (`searchText`):
- Envia `textQuery`, `locationRestriction` (rectangle), `languageCode`
- Soporta `pageToken` para paginacion nativa de Google
- `maxResults` default 20
- `useRestriction` (default true) = hard geo filter; false = soft `locationBias`
- Soporta `includedTypes` para filtrar tipos de lugar

## Fotos de lugares

- `photoMaxHeightPx` (default 400): altura maxima en px
- `photosPerPlace` (default 5): maximo de fotos por lugar
- Fotos se obtienen de Google Places API y se incluyen en `photos: [{url, width, height}]`

## Calculo de distancia y tiempo de viaje

```javascript
distUser1 = haversineKm(currentUser.lat, currentUser.lng, place.lat, place.lng)
distUser2 = haversineKm(otherUser.lat, otherUser.lng, place.lat, place.lng)
travelTimeUser1 = estimateTravelMin(distUser1, travelSpeedKmH)  // default 40 km/h
travelTimeUser2 = estimateTravelMin(distUser2, travelSpeedKmH)
```

## Mención de ciudad / forwardGeocode

Cuando el usuario menciona otra ciudad (ej. "quiero ir a Buenos Aires"), el flujo es:

1. **Intent extraction** (Gemini) intenta detectar `mentionedCity` en el mensaje (`maxOutputTokens: 512`)
2. **Regex fallback** — si Gemini falla o no detecta, regex con **55 patrones en 12 idiomas** (ES/EN/PT/FR/DE/IT/JA/ZH/RU/AR/ID/KO/TR) cubriendo 9 casos de uso:
   - **Viaje:** `"voy a Buenos Aires"`, `"going to Paris"`, `"vou para SP"`
   - **Preguntas:** `"qué hacer en Madrid"`, `"things to do in London"`
   - **Recomendaciones:** `"bares en Medellín"`, `"restaurants in Tokyo"`
   - **Coloquial:** `"qué onda en CDMX"`, `"hitting up NYC"`, `"rolê em SP"`
   - **Condicional:** `"si voy a Córdoba"`, `"when I get to Berlin"`
   - **Relaciones:** `"mi novia vive en Lima"`, `"my match is in Tokyo"`
   - **Curiosidad:** `"cómo es Roma"`, `"tell me about Barcelona"`
   - **Solo travel:** `"mochilero en Perú"`, `"digital nomad in Bali"`
   - **Contexto de vida:** `"I live in Prague"`, `"trabajo en Miami"`
   - Filtro anti-falsos-positivos con `skipWords` set (evita match con palabras comunes)
3. **`forwardGeocode(city)`** en `lib/geo.js` — convierte nombre de ciudad a coordenadas (lat/lng) via Google Geocoding API
4. **Override de coordenadas** — Places search usa las coordenadas de la ciudad mencionada en vez del GPS del usuario
5. **Cache propagation** — `overrideLat`/`overrideLng` se almacenan en `placesCache`. El path de `loadMore` lee estas coordenadas del caché para mantener búsqueda en la ciudad mencionada sin re-geocodificar.
6. **`locationOverrideInstruction`** — instrucción inyectada al prompt de Gemini indicando que los REAL PLACES provienen de la ciudad mencionada, NO del GPS del usuario
7. **Suggestion chip corregido** — `"📍 Lugares en X"` ahora usa la **ciudad mencionada** (no el GPS del usuario) cuando hay location override activo

## Configuracion RC (`places_search_config`)

21 campos configurables. Ver skill `remote-config` para detalle completo.
Cache de configuracion: 5 minutos via `getPlacesSearchConfig()`.

## Client-side race condition (infinite scroll) — 2026-04-12

**Bug histórico**: Al cambiar categoría mientras `loadMore` estaba en vuelo, los resultados aparecían/desaparecían.

**Fix en clientes** (no en CFs):
- Request versioning (`placesRequestVersion`) en iOS `ChatView.swift` y Android `ChatViewModel.kt`
- Job cancellation (`categoryLoadJob`, `loadMoreJob`) en Android
- Task capture + stale-response guard en iOS
- Dedupe defensiva por `placeId` en UI (`PlaceSuggestionsSheet.kt`, `PlaceSuggestionsView.swift`)
- `_dateSuggestions.value = emptyList()` inmediato al cambiar categoría (no al recibir respuesta)

**Las CFs no necesitan cambios** — el bug era 100% client-side.
