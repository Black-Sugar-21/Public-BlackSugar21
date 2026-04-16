# BlackSugar21 — Modern Features Quick Reference

Guía rápida de features modernos para incorporar en los skills.

## 1. Multi-Universe Simulator (Hang the DJ)

**¿Qué es?** Simulador de 5 etapas de relaciones inspirado en Black Mirror "Hang the DJ"

**Ubicación en código:**
- Android: `CoachChatScreen.kt` → `runMultiUniverseSimulation()`
- iOS: `CoachChatView.swift` → `runMultiUniverseSimulation()`

**Etapas (5-stage carousel):**
1. 🌟 Primer contacto — La chispa inicial
2. 💬 Conocerse — Conversaciones reales
3. 💕 Conexión profunda — Vulnerabilidad y confianza
4. ⚡ El desafío — Prueba de la relación
5. 🚀 El siguiente paso — Hacia el futuro

**Cloud Function:** `runMultiUniverseSimulation(matchId, matchName)`
**Response:** 5-stage array con compatibility scores por enfoque
**UI:** Carousel horizontal con detail bottom sheets
**Localization:** 10 idiomas (all stage labels + insights)

**Integration points:**
- Coach Chat situation card
- Auto-enable cuando hay match seleccionado o situación 5+ chars
- Explanation modal antes de generar (context sobre concepto)
- Unified credit system (comparte 3 créditos diarios con Coach)

---

## 2. Discovery V2 (Nuevas Queries)

**¿Qué cambió?** Reemplazo de V0 con 9 filtros mejorados

**Filtros V2:**
1. `accountStatus !== 'active'` — in-memory, no en query
2. `paused !== true` — in-memory, no en query
3. `visibilityReduced !== true` — in-memory filter
4. Orientation matching (`men`/`women`/`both` — all lowercase!)
5. Age range filtering
6. Distance radius (geohash + fallback in-memory)
7. Gender filtering (user preference)
8. Bidirectional blocking (ambos lados)
9. User type filtering (ELITE/PRIME)

**Código:**
- Android: `HomeViewModel.fetchProfiles()` → calls `getDiscoveryFeed` CF
- iOS: `ProfileCardRepository.getProfilesV2()`

**Key changes:**
- V0: `accountStatus` in Firestore query → **V2: Filter in-memory**
- V0: `geohash` hard filter → **V2: Try exact, fallback to wider radius**
- V0: `paused` in query → **V2: Filter after fetch**
- New: `visibilityReduced` explicit check
- New: Reviewer mode bypasses exclusion set (swipes/matches/blocked)

**Response structure:**
```json
{
  "profiles": [...],
  "totalCount": N,
  "lastDocId": "...",
  "pageToken": "..."
}
```

---

## 3. Coach IA + RAG Knowledge Base

**¿Qué es?** Coach IA usa RAG embeddings para respuestas contextualizadas

**Colecciones Firestore:**
- `coachKnowledge` — 537+ docs, 70+ categorías, 10 idiomas
- `moderationKnowledge` — 73 docs, 13 categorías, 10 idiomas

**Embedding model:** `gemini-embedding-001` (768-dim vectors)
**Retrieval:** Top-K similarity search con threshold configurable

**Categorías principales (Coach):**
- Dating advice (45 cats) — icebreakers, confidence, date blueprints
- Approach suggestions (16 cats) — venues, apologies, cultural etiquette
- Sugar dating advanced (20 cats) — luxury, discretion, gifts

**Remote Config claves RAG:**
- `appConfig/ai.rag.minSimilarityScore` (default 0.25)
- `appConfig/ai.rag.topK` (default 5)
- `appConfig/ai.rag.fetchMultiplier` (default 3)

**Uso en Cloud Functions:**
```javascript
// En coach.js, dateCoachChat:
const ragChunks = await retrieveCoachKnowledge(userQuery, userLanguage);
const systemPrompt = `... ${ragChunks.join('\n')} ...`;
const response = await callGemini(systemPrompt, userQuery);
```

**Actualización semanal automática:**
- `updateCoachKnowledge` CF (domingo 03:00 UTC)
- Analiza feedback bajo satisfaction
- Genera nuevos chunks con Gemini + Search Grounding
- Auto-guardado en Firestore (si quality score ≥ 7/10)

---

## 4. Psychology Foundations (Session 2026-04-15)

**Base teórica integrada en Coach:**
- Bowlby attachment theory (4 estilos)
- Gottman compatibility scoring (4 horsemen de la crítica)
- Helen Fisher types (explorer/builder/director/negotiator)
- Esther Perel on desire (distance/tension/novelty)
- Brené Brown vulnerability framework

**Implementación:** 50+ chunks en RAG, 5 frameworks, 10 idiomas
**Acceso:** Coach IA integra automáticamente en respuestas
**Testing:** Internal tests validan stage transitions + psychology alignment

---

## 5. Multi-Language Support (10 idiomas)

**Idiomas soportados:**
1. `en` — English (default)
2. `es` — Español (Latin America)
3. `pt` — Português (Brazil)
4. `fr` — Français
5. `de` — Deutsch
6. `ja` — 日本語
7. `zh` — 中文 (Simplified)
8. `ru` — Русский
9. `ar` — العربية
10. `id` — Bahasa Indonesia

**Implementación:**
- Android: `RemoteConfigManager.getString("coach_strings_${lang}")`
- iOS: `NSLocalizedString("key", value: default, comment: nil)`
- Backend CFs: `const lang = req.body.userLanguage || 'en'`

**Fallback chain:** User lang → "multi" → "en"

---

## 6. Screenshot Protection (Dark Mode + SafetyCheckIn)

**Screen Protection:**
- Remote Config: `enable_screen_protection` (default true)
- Android: Disables screenshot + screen recording
- iOS: Disables screenshot via SwiftUI modifiers
- Reviewer bypass: Via `reviewer_uid` RC key

**Safety Check-In:**
- Remote Config: `enable_safety_checkin` (default false)
- Feature: Escalating check-in before/during dates
- Location sharing optional
- Trusted contacts notification
- Geo-fencing radius customizable

---

## 7. Unified Credit System

**Coach IA Credits:**
- Daily allotment: 3 credits (configurable via RC)
- Resets daily at user's timezone
- Cost per operation:
  - Standard question: 1 credit
  - Multi-universe simulation: 1 credit
  - Smart reply generation: 1 credit

**Reset logic:**
- `resetCoachMessages` CF (daily, per user timezone)
- `remoteConfigManager.getCoachDailyCredits()` — actual value
- Frontend enforces limit, backend validates

**Storage:**
- `users/{userId}/coachChats/meta/dailyCreditsRemaining`
- `users/{userId}/coachChats/meta/lastCreditResetDate`

---

## 8. Rate Limiting & Config

**Key Remote Config values:**
```
appConfig/ai:
  - temperature: 0.9 (Gemini creativity)
  - maxOutputTokens: 2048 (Coach response length)
  - rateLimitPerHour: 30 (user messages)

appConfig/outfit:
  - maxPerHour: 10 (Photo Coach requests)

coach_config:
  - dailyCredits: 3
  - maxMessageLength: 2000
  - maxSuggestions: 12
  - clarificationEnabled: true
```

**Firestore Rules:**
- Composite indexes for discovery V2
- Vector search indexes for RAG
- Batch operation limits (50 docs/write)

---

## Checklist para actualizar Skills

**Para cada skill, validar:**

### blacksugar-android
- [ ] Menciona `getDiscoveryFeed` V2 (no V0)
- [ ] Documenta `runMultiUniverseSimulation` CF
- [ ] Referencias a Coach IA + RAG
- [ ] Remote Config claves actualizadas
- [ ] 10 idiomas mencionados
- [ ] Physics-based ordering confirmado

### blacksugar-ios
- [ ] Menciona `getProfilesV2()` (no V0)
- [ ] Documenta `runMultiUniverseSimulation` CF
- [ ] References a Coach IA + RAG
- [ ] Remote Config claves actualizadas
- [ ] 10 idiomas mencionados
- [ ] ISO timestamp parsing (`.withFractionalSeconds`)

### blacksugar-web-development
- [ ] Testing system usa `test-system-unified.js`
- [ ] Scripts para crear profiles (discovery)
- [ ] Firebase deployment documented
- [ ] Angular patterns modernos (standalone components)

### blacksugar-testing
- [ ] Create discovery profiles (5-30)
- [ ] Mentions match ordering + reordering
- [ ] Multi-user support (Daniel/Rosita)
- [ ] Selective cleanup documented

---

## Links a Documentación Original

- **Hang the DJ feature**: Session 2026-04-15, project_hang_the_dj_feature.md
- **Discovery V2**: Session 2026-04-09, project_session_20260409.md
- **Psychology RAG**: Session 2026-04-15, project_psychology_foundations.md
- **Localization**: Session 2026-04-15, project_localization_audit_complete_20260415.md

---

**Last Updated:** 2026-04-16  
**Next Review:** 2026-05-01 (después de Fase 3)
