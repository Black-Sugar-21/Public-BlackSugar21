---
description: "Sistema completo de moderacion de BlackSugar21 — auto-moderacion de mensajes, moderacion de fotos de perfil/stories, AI Safety Shield en chat, RAG de conocimiento (73 chunks, 13 categorias, 10 idiomas), blacklist SHA-256. CFs: autoModerateMessage (trigger), moderateProfileImage, moderateMessage, validateProfileImage, calculateSafetyScore. Usar cuando se trabaje con moderacion de contenido, filtros de seguridad, Safety Shield, analisis de fotos, o reglas de moderacion."
---

# BlackSugar21 — Content Moderation System

## Architecture

La moderacion de contenido opera en 3 capas complementarias:

1. **Client-side (Android/iOS):** `ContentModerationService` comprime imagenes, convierte a base64, y llama CFs. Es un wrapper delgado — toda la IA es server-side.
2. **Server-side CFs (5 funciones):** Moderacion de imagenes (perfil + stories), texto (mensajes + biografias), auto-moderacion de mensajes, validacion de imagenes, y safety score de conversacion.
3. **RAG Knowledge Base:** 93 chunks multilingues en Firestore con vector search para enriquecer prompts de moderacion con reglas y patrones culturales.

Principios de diseno:
- **Fail-open para perfil/texto:** si la moderacion falla, se aprueba (no bloquear usuarios por errores)
- **Fail-closed para stories:** si la moderacion falla, se rechaza (contenido temporal, mas riesgo)
- **Server-side only:** los clientes NUNCA ejecutan modelos Gemini localmente
- **Modelo ligero:** toda la moderacion usa `AI_MODEL_LITE` (`gemini-2.5-flash-lite`) para baja latencia

---

## Cloud Functions (5 moderation CFs)

Todas en `us-central1`. Definidas en `functions/lib/moderation.js` (excepto `calculateSafetyScore` en `functions/lib/ai-services.js`).

### 1. `moderateProfileImage` (Callable)

Modera imagenes de perfil y stories con Gemini AI.

| Campo | Tipo | Descripcion |
|---|---|---|
| **Input** | | |
| `imageBase64` | String (required) | Imagen comprimida en base64 |
| `expectedGender` | Boolean? | `true`=masculino, `false`=femenino, `null`=no validar |
| `userLanguage` | String? | Codigo de idioma (default `"en"`) |
| `isStory` | Boolean? | `true` para stories (prompt mas permisivo, fail-closed) |
| **Output** | | |
| `approved` | Boolean | Si la imagen es aceptable |
| `reason` | String | Explicacion del rechazo (vacia si aprobada) |
| `confidence` | Number | 0.0-1.0 |
| `categories` | String[] | Lista de problemas detectados |
| `category` | String | Categoria principal: `nudity\|violence\|underage\|unclear_face\|screenshot\|low_quality\|offensive\|celebrity\|approved\|error` |

- Memory: 512MiB, Timeout: 60s, Secrets: `GEMINI_API_KEY`
- Prompt bilingue (ES/EN) con instrucciones especificas para perfil vs story
- Perfil: requiere rostro visible, permite lentes/accesorios/multiples personas
- Story: permite TODO contenido seguro (paisajes, comida, objetos, etc.), no requiere rostros
- Gender verification: si `expectedGender` se envio, valida genero visible en la foto

### 2. `moderateMessage` (Callable)

Modera texto (mensajes de chat o biografias) con Gemini AI + RAG.

| Campo | Tipo | Descripcion |
|---|---|---|
| **Input** | | |
| `message` | String (required) | Texto a moderar |
| `language` | String? | Codigo de idioma (default `"en"`) |
| `type` | String? | `"biography"` o `"message"` (default `"message"`) |
| `matchId` | String? | ID del match (contexto) |
| **Output** | | |
| `approved` | Boolean | Si el texto es aceptable |
| `reason` | String | Explicacion del rechazo |
| `category` | String | `sexual\|contact_info\|spam\|hate_speech\|scam\|threats\|harassment\|personal_info\|approved\|error` |
| `confidence` | Number | 0.0-1.0 |

- Memory: 256MiB, Timeout: 30s, Secrets: `GEMINI_API_KEY`
- Pipeline: `getModerationConfig()` -> `retrieveModerationKnowledge()` (RAG) -> prompt builder -> Gemini `AI_MODEL_LITE`
- Contexto: "This is a lifestyle dating app. Flirting and lifestyle discussion is NORMAL and ALLOWED."
- Biografia: rechaza contacto personal, spam, hate speech, amenazas
- Mensaje: rechaza acoso, sexual explicito no solicitado, scams, amenazas

### 3. `autoModerateMessage` (Firestore Trigger)

Trigger automatico que modera TODOS los mensajes de texto al crearse.

- **Trigger:** `onDocumentCreated` en `matches/{matchId}/messages/{messageId}`
- Memory: 256MiB, Timeout: 30s
- Solo modera mensajes con `type: 'text'` (ignora `ephemeral_photo`, `place`, etc.)

**Pipeline multi-capa (6 pasos):**

1. **SHA-256 Cache** — `getMessageHash()` genera hash del mensaje normalizado (lowercase, trimmed). Busca en `moderationCache/{hash}` (TTL 1h, CACHE_VERSION=3). Si existe y es HIGH, marca el mensaje inmediatamente.
2. **Quick Filters** (`applyQuickFilters()`) — Sin IA, reduce ~60% de llamadas a Gemini:
   - Mensajes muy cortos (<=3 chars) -> auto-approve
   - BLACKLIST (~100+ terminos EN/ES/PT/FR/DE con variantes de simbolos)
   - URLs externas (`https://`, `bit.ly`, `t.me/`, `wa.me/`, etc.)
   - Numeros de telefono (regex internacional)
   - Emails
   - Caracteres repetitivos (>4 del mismo char seguido)
3. **RAG Context** — Lee `deviceLanguage` del perfil del sender + `getModerationConfig()` en paralelo. Pasa idioma y config a `retrieveModerationKnowledge()`.
4. **Gemini AI** — `gemini-2.5-flash-lite` con prompt estructurado. Categorias: SAFE, SPAM, SCAM, INAPPROPRIATE, PERSONAL_INFO. Severidad: NONE, LOW, MEDIUM, HIGH.
5. **Auto-Report** — Si severity es `"HIGH"`, genera documento en `reports` con `reporterUserId: 'SYSTEM_AUTO_MODERATE'`, `status: 'pending'`, `autoGenerated: true`.
6. **Audit Trail** — Todo mensaje flaggeado se escribe en `moderatedMessages/{docId}` con matchId, senderId, category, severity, confidence, messageHash.

### 4. `validateProfileImage` (Callable)

Validacion basica de URL de imagen de perfil.

| Campo | Tipo | Descripcion |
|---|---|---|
| **Input** | `{imageUrl}` | URL de la imagen en Firebase Storage |
| **Output** | `{valid, reason, scores}` | `scores: {safe, explicit, violence}` |

- Memory: 256MiB, Timeout: 60s
- Actualmente retorna aprobacion (la moderacion real se hace en `moderateProfileImage`)
- Valida que la URL sea de Firebase Storage o HTTPS

### 5. `calculateSafetyScore` (Callable)

Calcula puntuacion de seguridad de una conversacion para el Safety Shield.

| Campo | Tipo | Descripcion |
|---|---|---|
| **Input** | `{targetUserId, userLanguage}` | Usuario objetivo y idioma |
| **Output** | `{score, details}` | Score 0-100 y detalles de analisis |

- Definida en `functions/lib/ai-services.js`
- Memory: 256MiB, Timeout: 60s, Secrets: `GEMINI_API_KEY`
- Lee ultimos mensajes del chat, analiza con Gemini
- Retorna: `score` (0-100), `flags`, `riskLevel` ("low"/"medium"/"high"), `summary`, `badges`
- Requiere minimo 3 mensajes para analisis

---

## Moderation RAG Knowledge Base

Sistema server-side que enriquece la moderacion con conocimiento curado de reglas y patrones.

### Arquitectura

- **Embedding model:** `gemini-embedding-001` (768 dimensiones)
- **Vector search:** Firestore native `findNearest()` con distancia COSINE
- **Coleccion:** `moderationKnowledge` — 93 chunks multilingues
- **Indice Firestore:** Vector index en `moderationKnowledge.embedding` (768 dims, flat, COSINE)

### Distribucion por idioma

| Idioma | Chunks |
|---|---|
| EN | 31 |
| ES | 17 |
| FR | 4 |
| DE | 3 |
| PT | 3 |
| AR | 3 |
| JA | 3 |
| RU | 3 |
| ZH | 3 |
| ID | 3 |

### Safety Shield — Pet Name False Positive Fix

- Common pet names in dating context no longer trigger moderation flags
- Whitelisted terms: "bb", "amor", "bebe", "cariño", "mi vida", "corazón", "tesoro", "schatz", "chéri(e)", "amore"
- Applied in `autoModerateMessage` quick filters before AI analysis
- Reduces false positives in romantic conversations across 10 languages

### Blacklist Expansion — +60 Terms (AR/JA/RU/ZH/ID)

- **60+ new blacklist terms** added for underserved languages:
  - AR (Arabic): sexual solicitation, scam patterns, contact evasion
  - JA (Japanese): explicit content, compensated dating, scam patterns
  - RU (Russian): explicit content, financial scam patterns
  - ZH (Chinese): explicit content, scam patterns, contact evasion
  - ID (Indonesian): explicit content, scam patterns
- Total MODERATION_BLACKLIST now ~160+ terms across EN/ES/PT/FR/DE/AR/JA/RU/ZH/ID

### 13 Categorias

`harassment`, `sexual`, `spam`, `threats`, `hate_speech`, `scam`, `contact_info`, `personal_info`, `evasion_tactics`, `payment_solicitation`, `context_guidelines`, `bio_moderation`, `classification_guide`

### Pipeline (`retrieveModerationKnowledge`)

1. Valida query (min 3 chars, trunca a 500 chars)
2. Embede texto con `taskType: RETRIEVAL_QUERY`
3. Busca top-K x fetchMultiplier docs en Firestore (vector search)
4. Convierte distancia COSINE a similaridad (1 - distance)
5. Filtra por minScore
6. **Ranking por idioma:** userLang -> EN -> other
7. **Smart dedup por categoria:** siempre incluye `context_guidelines`, `classification_guide`, `bio_moderation`, `evasion_tactics`, `payment_solicitation` (no se deduplican entre idiomas)
8. Selecciona top-K chunks
9. Retorna string con header `"MODERATION KNOWLEDGE BASE — Use these rules..."`

### Configuracion (`moderation_config` Remote Config)

| Campo | Tipo | Default | Rango |
|---|---|---|---|
| `rag.enabled` | Boolean | `true` | Kill switch |
| `rag.topK` | Number | `4` | 1-10 |
| `rag.minScore` | Number | `0.25` | 0-1 |
| `rag.fetchMultiplier` | Number | `3` | 1-5 |
| `rag.collection` | String | `'moderationKnowledge'` | — |

Leido via `getModerationConfig()` con cache en memoria de 5 minutos.

---

## Auto-Moderation Pipeline (autoModerateMessage)

### BLACKLIST

Definida en `functions/lib/notifications.js` como `MODERATION_BLACKLIST` (~100+ terminos):

- **Spam comun:** viagra, cialis, casino, lottery, etc.
- **Scams financieros (EN):** send money, western union, bitcoin wallet, paypal me, cashapp, venmo, zelle
- **Scams financieros (ES):** envia dinero, transferencia bancaria, gana dinero facil
- **Scams financieros (PT):** envie dinheiro, transferencia bancaria, ganhe dinheiro facil
- **Plataformas de pago:** onlyfans, premium snap, venmo.me, cash.app, bizum, ko-fi.com
- **Sexual explicito (EN):** send nudes, dick pic, etc.
- **Sexual explicito (ES):** fotos desnuda, manda nudes, etc.
- **Sexual explicito (PT):** fotos nua, manda nudes, etc.
- **Sexual explicito (FR/DE):** photos nues, nacktfotos, etc.
- **Variaciones con simbolos:** `s3x`, `f*ck`, `p0rn`, `n00ds`, `c0ger`, etc.

`SEXUAL_BLACKLIST_TERMS` (~35 terminos) — subset para categorizar como INAPPROPRIATE vs SPAM.

### SHA-256 Cache (`moderationCache/{hash}`)

```
approved: Boolean
reason: String?
category: String?
confidence: Number? (0.0-1.0)
source: String ("quick_filter" | "ai_moderation")
version: Number (CACHE_VERSION = 3)
createdAt: Timestamp (TTL: 1 hora)
```

Key: SHA-256 hash del mensaje normalizado (lowercase, trimmed) + CACHE_VERSION.

### Audit Trail (`moderatedMessages/{docId}`)

```
matchId: String
messageId: String
senderId: String
message: String (truncado a 500 chars)
result: {approved, category, confidence, reason, severity}
source: String ("quick_filter" | "ai_moderation")
processedAt: Timestamp
```

Solo se escriben entradas para mensajes flaggeados (no aprobados). Si severity es "high", se genera auto-reporte en `reports`.

---

## Image Moderation

### Profile Images (`moderateProfileImage`, `isStory=false`)

**Rechazar si contiene:**
- Desnudez o contenido sexual explicito
- Violencia o contenido grafico
- Simbolos de odio o discriminacion
- Menores de edad
- Rostros poco claros (la persona principal debe ser visible)
- Contenido ofensivo o inapropiado
- Genero no coincide (si `expectedGender` fue enviado)

**Aprobar si:**
- Muestra claramente el rostro de una persona adulta
- Lentes/gafas estan permitidos
- Accesorios (sombreros, gorras, bufandas) permitidos si rostro es visible
- Multiples personas permitidas (fotos con amigos, familia)
- No contiene contenido inapropiado

**Error handling:** Fail-open (aprobar en error)

### Story Images (`moderateProfileImage`, `isStory=true`)

**Rechazar SOLO si contiene:**
- Desnudez/sexual explicito
- Violencia grafica
- Simbolos de odio/racismo
- Propaganda politica
- Spam/publicidad excesiva
- Drogas ilegales
- Armas de fuego (armas blancas decorativas OK)
- Lenguaje de odio visible

**Aprobar TODO lo demas:** paisajes, comida, objetos, animales, arte, selfies, actividades, viajes, etc. No requiere rostros ni personas.

**Error handling:** Fail-closed (rechazar en error)

### Image Categories (CF response)

`nudity`, `violence`, `underage`, `unclear_face`, `screenshot`, `low_quality`, `offensive`, `celebrity`, `approved`, `error`

### iOS Image Moderation Config (`ImageModerationConfig.swift`)

11 checks configurables via Remote Config:

| Check | Default | Descripcion |
|---|---|---|
| `nudity` | `true` | Desnudez/contenido explicito |
| `violence` | `true` | Violencia/contenido perturbador |
| `fakeProfiles` | `true` | Fotos de celebridades, stock photos |
| `underage` | `true` | Menores de edad |
| `multiplePeople` | `true` | Multiples personas |
| `lowQuality` | `false` | Imagenes de baja calidad |
| `helmet` | `false` | Casco (rostro no visible) |
| `faceMask` | `false` | Mascarilla facial |
| `sunglasses` | `false` | Gafas de sol oscuras |
| `backToCamera` | `false` | Espaldas/mirando paisaje |
| `distantFullBody` | `false` | Cuerpo entero muy distante |

**Confidence thresholds:**
- `confidenceThreshold`: 80 (minimo para aprobar)
- `autoRejectThreshold`: 90 (auto-rechazar)
- `genderVerification.enabled`: true
- `genderVerification.confidenceThreshold`: 70

---

## AI Safety Shield

### `calculateSafetyScore` CF

Analiza la seguridad de una conversacion completa con Gemini.

- **Input:** `{targetUserId, userLanguage}`
- **Output:** `{score (0-100), flags, riskLevel ("low"/"medium"/"high"), summary, badges}`
- Lee ultimos mensajes del chat, requiere minimo 3 mensajes
- Analiza patrones de riesgo: scams, solicitudes de dinero, presion, manipulacion
- `badges: ['safe_conversation']` si score >= 80

### Android: `SafetyShieldBanner.kt`

- Ubicacion: `feature/chat/ui/components/SafetyShieldBanner.kt`
- Data class `SafetyWarningItem(type, message, severity)` con severity `"low"/"medium"/"high"`
- Composable colapsable con colores por riesgo:
  - HIGH: rojo (bg 12% alpha, border 30%)
  - MEDIUM: naranja (bg 10%, border 25%)
  - LOW: amarillo (bg 8%, border 20%)
- Invocado desde `ChatView.kt`
- ViewModel expone `coachTips`, `coachChemistryScore`, `isLoadingCoachTips` como StateFlows

### iOS: `SafetyShieldBanner.swift`

- Ubicacion: `ui/chat/SafetyShieldBanner.swift`
- Servicio: `services/AI/SafetyScoreService.swift`
- Invocado desde `ChatView.swift`
- ViewModel expone `@Published safetyScore`, warnings

---

## Android Implementation

### `ContentModerationService.kt`

- **Ubicacion:** `core/moderation/ContentModerationService.kt`
- **Inyeccion:** `@Singleton` via Hilt, inyecta `Context` y `RemoteConfigManager`
- **Region:** `us-central1`

**Metodos publicos:**

| Metodo | CF llamada | Error handling |
|---|---|---|
| `moderateImage(bitmap, expectedGender?)` | `moderateProfileImage` | Approve on error |
| `moderateStoryImage(bitmap)` | `moderateProfileImage` (isStory=true) | Reject on error |
| `moderateText(text, type)` | `moderateMessage` | Approve on error |
| `moderateImages(bitmaps)` | `moderateProfileImage` (batch) | Approve on error |

**Compresion de imagenes (`bitmapToBase64`):**
- `moderation_image_max_dimension` (Remote Config, default 512px)
- `moderation_image_jpeg_quality` (Remote Config, default 50%)
- Usa `BitmapUtils.ensureSoftware()` para bitmaps hardware
- Recicla bitmaps escalados

### ModerationCategory (17 categorias + 2 generales)

**Imagenes (8):** `NUDITY`, `VIOLENCE`, `UNDERAGE`, `UNCLEAR_FACE`, `SCREENSHOT`, `LOW_QUALITY`, `OFFENSIVE`, `CELEBRITY`

**Texto (8):** `SEXUAL_CONTENT`, `CONTACT_INFO`, `SPAM`, `HATE_SPEECH`, `SCAM`, `THREATS`, `HARASSMENT`, `PERSONAL_INFO`

**General (3):** `APPROVED`, `ERROR`, `OTHER`

### ModerationResult

```kotlin
data class ModerationResult(
    val isApproved: Boolean,
    val reason: String,
    val category: ModerationCategory,
    val confidence: Float,  // 0.0-1.0
)
```

### TextModerationType

```kotlin
enum class TextModerationType {
    BIOGRAPHY,
    MESSAGE,
}
```

---

## iOS Implementation

### `ImageModerationConfig.swift`

- **Ubicacion:** `domain/moderation/ImageModerationConfig.swift`
- Struct `Codable` con configuracion completa de moderacion de imagenes
- Parseada desde JSON string de Remote Config via `ImageModerationConfig.from(json:)`
- Default estatico: `ImageModerationConfig.default`

### `ImageAnalysis` (respuesta de IA)

```swift
struct ImageAnalysis: Codable {
    let verdict: String
    let confidence: Int
    let violations: [String]
    let explanation: String
    let severity: String
    let genderMatch: GenderMatchData?  // matches, confidence, detectedGender
}
```

### `SafetyScoreService.swift`

- **Ubicacion:** `services/AI/SafetyScoreService.swift`
- Llama `calculateSafetyScore` CF
- Expone score, warnings, riskLevel al ViewModel

### ContentModerationService (iOS equivalent)

- Mismo patron que Android: wrapper delgado sobre CFs
- Comprime imagenes segun Remote Config
- iOS convierte `moderation_image_jpeg_quality` de porcentaje (50) a CGFloat (0.5)

---

## Moderation Knowledge Base Files

Ubicacion: `scripts/moderation-knowledge/`

### `moderation-rules.json` (295 lineas)

Reglas generales de moderacion, definiciones de categorias, umbrales, y guias de clasificacion. Incluye chunks para todas las 13 categorias en multiples idiomas.

### `sugar-moderation-context.json` (146 lineas)

Contexto especifico de lifestyle dating: que es normal/permitido en la app, patrones de evasion comunes, reglas de moderacion de biografias, y guias de contexto cultural.

### Indexing Script

`scripts/index-moderation-knowledge.js` — Lee los JSONs, genera embeddings con `gemini-embedding-001`, almacena en Firestore con `FieldValue.vector()`. Soporta `--clean` (borrar coleccion primero) y `--dry-run`.

---

## Remote Config

### Claves de moderacion leidas por clientes

| Clave | Tipo | Default | Descripcion |
|---|---|---|---|
| `ai_moderation_confidence_threshold` | Number | `0.80` | Umbral de confianza |
| `moderation_image_max_dimension` | Number | `512` | Max px para compresion (256-1024) |
| `moderation_image_jpeg_quality` | Number | `50` | Calidad JPEG % (20-100). iOS convierte a 0.0-1.0 |

### Claves leidas por Cloud Functions (server-side)

| Clave | Tipo | Default | Descripcion |
|---|---|---|---|
| `moderation_config` | JSON String | `{rag:{enabled:true, topK:4, minScore:0.25, fetchMultiplier:3, collection:'moderationKnowledge'}}` | Config RAG para `moderateMessage` y `autoModerateMessage`. Cache 5min |

---

## Critical Rules

1. **Modelo de IA:** SIEMPRE `AI_MODEL_LITE` (`gemini-2.5-flash-lite`) para TODA la moderacion (autoModerateMessage, moderateMessage, moderateProfileImage). NUNCA usar modelos pesados.
2. **Error handling alineado iOS = Android:**
   - Profile images -> approve on error (fail-open)
   - Story images -> reject on error (fail-closed)
   - Text moderation -> approve on error (fail-open)
3. **Confidence thresholds:**
   - `ai_moderation_confidence_threshold`: 0.80 (Remote Config)
   - `confidenceThreshold` (iOS image): 80
   - `autoRejectThreshold` (iOS image): 90
   - `genderVerification.confidenceThreshold`: 70
4. **Auto-report:** Solo severity HIGH genera auto-reporte en `reports` con `reporterUserId: 'SYSTEM_AUTO_MODERATE'`
5. **Cache:** SHA-256, TTL 1 hora, CACHE_VERSION=3. Versiones antiguas se ignoran.
6. **RAG kill switch:** `moderation_config.rag.enabled=false` deshabilita RAG sin redeploy. La moderacion funciona sin knowledge base.
7. **BLACKLIST en `notifications.js`:** ~100+ terminos multilingues. Si se agregan terminos, mantener las secciones por idioma y las variaciones con simbolos.
8. **Idiomas soportados:** EN, ES, FR, DE, PT, AR, JA, RU, ZH, ID (10 idiomas)
9. **NUNCA ejecutar Gemini client-side.** `ContentModerationService` en ambas plataformas es un wrapper delgado que envia datos al CF y parsea la respuesta.
10. **Stories son mas restrictivas en checks (contenido) pero mas permisivas en aprobacion (no requieren rostros).** Profile images son al reves.

---

## Key File Paths

### Cloud Functions
- `functions/lib/moderation.js` — CFs de moderacion (moderateProfileImage, moderateMessage, autoModerateMessage, validateProfileImage)
- `functions/lib/ai-services.js` — calculateSafetyScore
- `functions/lib/notifications.js` — MODERATION_BLACKLIST, SEXUAL_BLACKLIST_TERMS
- `functions/lib/shared.js` — AI_MODEL_LITE, parseGeminiJsonResponse, getLanguageInstruction

### Android
- `app/src/main/java/com/black/sugar21/core/moderation/ContentModerationService.kt` — Servicio de moderacion
- `app/src/main/java/com/black/sugar21/feature/chat/ui/components/SafetyShieldBanner.kt` — Banner de seguridad en chat

### iOS
- `black-sugar-21/domain/moderation/ImageModerationConfig.swift` — Config de moderacion de imagenes
- `black-sugar-21/services/AI/SafetyScoreService.swift` — Servicio de safety score
- `black-sugar-21/ui/chat/SafetyShieldBanner.swift` — Banner de seguridad en chat

### Knowledge Base
- `scripts/moderation-knowledge/moderation-rules.json` — Reglas generales (295 lineas)
- `scripts/moderation-knowledge/sugar-moderation-context.json` — Contexto lifestyle dating (146 lineas)
- `scripts/index-moderation-knowledge.js` — Script de indexacion

### Firestore Collections
- `moderationKnowledge/{chunkId}` — RAG chunks (93 docs, vector index)
- `moderationCache/{hash}` — Cache de resultados (TTL 1h)
- `moderatedMessages/{docId}` — Audit trail de mensajes flaggeados
- `reports/{docId}` — Auto-reportes de severity HIGH

---

## Updates (Session 2026-03-26)

### isInappropriateVenue Filter (NEW)

**File**: `functions/lib/coach.js`
- Filters adult/inappropriate venues from Coach place suggestions before returning to clients
- Blocks: strip clubs, adult entertainment venues, massage parlors (non-spa), hookah lounges flagged as adult
- **10-language keyword matching**: EN/ES/FR/DE/PT/JA/ZH/RU/AR/ID
- Keywords include: "strip", "adult entertainment", "gentlemen's club", "cabaret adulto", "club de striptease", "adult massage", etc.
- Applied in `fetchCoachPlaces()` pipeline — venues matching any keyword are silently excluded
- Does NOT affect user-initiated `searchPlaces` — only Coach AI suggestions

### Instagram Blocklist Expanded (70+ terms)

- Instagram handle detection expanded to 70+ blocked terms
- Covers: spam accounts, adult content creators, escort services, crypto scam patterns
- Multi-language patterns: EN/ES/PT/FR/DE
- Applied in `instagramHandle` field validation when Coach returns venue data

### Blacklist RC-Configurable

- `MODERATION_BLACKLIST` can now be extended via Remote Config without redeploy
- RC key: `moderation_config.additionalBlacklistTerms` (String, comma-separated)
- Merge pattern: `[...DEFAULT_BLACKLIST, ...rcTerms]` — RC adds but never removes defaults
- Allows rapid response to new spam/scam patterns without CF redeployment

### Moderation RAG — 93 Chunks (was 73)

- **20 new chunks** added covering:
  - Event-related moderation rules (event spam, fake event promotion)
  - Enhanced evasion tactics detection (Unicode homoglyphs, zero-width chars)
  - Cultural context rules for new supported regions
  - Instagram/social media handle evasion patterns
- Updated distribution:

| Idioma | Chunks |
|---|---|
| EN | 39 (was 31) |
| ES | 21 (was 17) |
| FR | 5 (was 4) |
| DE | 4 (was 3) |
| PT | 5 (was 3) |
| AR | 4 (was 3) |
| JA | 4 (was 3) |
| RU | 4 (was 3) |
| ZH | 4 (was 3) |
| ID | 3 |

## Session 2026-03-27 Changes

### CRITICAL FIX: MODERATION_BLACKLIST Import
- `MODERATION_BLACKLIST` was **not imported** in `moderation.js` — all auto-moderation blacklist checking was completely broken
- Blacklist terms defined in `notifications.js` were never reaching `autoModerateMessage` pipeline
- Fixed: proper export from `notifications.js` + import in `moderation.js`
- Impact: ~160+ blacklist terms are now correctly checked in the quick filters step

### RAG Auto-Update Enabled
- `moderation_config.rag.ragAutoUpdate` enabled in Remote Config
- Uses Google Search Grounding to generate new moderation RAG chunks from trending scam/abuse patterns
- Auto-generates chunks weekly via `updateCoachKnowledge` scheduled CF (shared infrastructure)

### Cross-Learning: Moderation ← Coach
- Moderation RAG now reads coach insights (`coachInsights/global` trending topics)
- Reduces false positives on coaching-related terms that appear in normal dating conversations
- Coach also reads moderation insights to provide safety-aware coaching tips

### 5 New Moderation RAG Chunks
- **AI catfish detection**: patterns for AI-generated profile detection, deepfake awareness
- **Pig butchering scams**: romance-to-investment scam escalation patterns
- **Unicode evasion tactics**: homoglyph substitution, zero-width characters, RTL markers
- **Crypto scam patterns**: fake exchange links, "guaranteed returns", wallet address sharing
- **False positive prevention**: expanded whitelist of legitimate dating/arrangement terminology

## Session 2026-03-28 Changes

### resolveDisputesDaily (3:00 AM UTC)
- Scheduled CF that auto-accepts moderation disputes with pattern count >=3
- Generates new RAG chunk from the resolved dispute pattern -> `moderationKnowledge`
- Tracks in `moderationDisputeReviews` collection
- Reduces manual review burden for recurring false positive patterns

### dailyModerationMicroUpdate (4:30 AM UTC)
- Scheduled CF that generates RAG chunks from yesterday's moderation disputes
- Feeds new knowledge into `moderationKnowledge` collection
- Continuous improvement of moderation accuracy without manual intervention

## Session 2026-03-31 Updates
- Moderation system verified stable, no changes needed
- All "sugar" references removed from backend prompts (coach.js, moderation.js) — Elite/Prime rebrand
- `reviewer_uid` moved from hardcoded UID to Remote Config (comma-separated Set)
- Elite/Prime rebranding complete — no "elite/mommy/baby" in user-facing text
- AI Icebreakers: conversation starters generated server-side are NOT moderated (trusted source)
- Android: 35+ operations moved to Dispatchers.IO across 12 ViewModels (no moderation impact)
