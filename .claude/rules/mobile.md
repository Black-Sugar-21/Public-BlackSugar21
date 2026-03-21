---
description: Contexto compartido Android (BlackSugar212) e iOS — misma app, dos plataformas
---

# Mobile — Android + iOS (BlackSugar21)

Ambas apps son la misma aplicación de dating en dos plataformas distintas.
Comparten el mismo backend Firebase y deben mantener paridad de features y modelos.

## Rutas
- Android: `/Users/daniel/AndroidStudioProjects/BlackSugar212`
- iOS: `/Users/daniel/AndroidStudioProjects/iOS`

---

## Arquitectura (idéntica en ambas)

```
data/
  datasource/     ← Firebase (Firestore, Auth, Storage)
  repository/     ← implementación de repositorios
  model/          ← modelos de Firestore (deben ser iguales en ambas)

domain/
  profile/        ← modelos de dominio (User, Profile, Picture)
  match/          ← Match, MatchingScore
  message/        ← Message
  story/          ← Story
  analytics/      ← eventos de interacción

ui/               ← pantallas y componentes (SwiftUI / Jetpack Compose)
services/         ← AI, analytics, moderation, remote config
core/             ← cache, performance, utils compartidos
```

---

## Modelos Firestore compartidos (deben estar sincronizados)

| Colección       | Android model                          | iOS model                          |
|-----------------|----------------------------------------|------------------------------------|
| `users`         | `core/firebase/model/`                 | `data/datasource/model/FirestoreUser.swift` |
| `matches`       | `core/match/model/`                    | `data/datasource/model/FirestoreMatch.swift` |
| `messages`      | `core/message/model/`                  | `data/datasource/model/FirestoreMessage.swift` |
| `stories`       | `ui/story/`                            | `domain/story/StoryModel.swift`    |
| `profiles`      | `profile/model/`                       | `domain/profile/ProfileCardModel.swift` |

**Regla crítica**: Si se modifica un campo en un modelo de Firestore, debe actualizarse en AMBAS plataformas.

---

## Features por módulo (paridad esperada)

| Feature        | Android                                     | iOS                                         |
|----------------|---------------------------------------------|---------------------------------------------|
| Auth           | `feature/onboarding/` + `auth/`             | `data/datasource/AuthRemoteDataSource.swift` |
| Matching/Swipe | `feature/matching/` + `core/matching/`      | `data/repository/ProfileCardRepository.swift` + `domain/matching/` |
| Chat           | `feature/chat/`                             | `ui/chat/` + `domain/chat/`                 |
| Stories        | `ui/story/`                                 | `domain/story/` + UI de stories             |
| Perfil/Edit    | `feature/editprofile/` + `editprofile/`     | `data/repository/ProfileRepository.swift`   |
| Coach IA       | `feature/coach/`                            | `services/AI/DatingCoachService.swift`      |
| Moderación     | `core/moderation/`                          | `services/ContentModerationService.swift`   |
| Analytics      | `core/analytics/`                           | `domain/analytics/` + `services/AnalyticsService.swift` |
| Geo/Distancia  | `core/firebase/util/` (geohash)             | `domain/utils/GeoHashUtils.swift`           |
| Remote Config  | `core/config/`                              | `services/RemoteConfigService.swift`        |
| Cache fotos    | `core/picture/` + `core/cache/`             | `core/cache/` + `data/cache/`               |

---

## Reglas de sincronización

1. **Cambio en Firestore** → actualizar modelo en Android Y iOS
2. **Nueva Cloud Function** → actualizar el cliente que la llama en ambas plataformas
3. **Nuevo campo en perfil de usuario** → reflejarlo en `editprofile` de ambas apps
4. **Cambio en lógica de matching** → verificar paridad en `MatchingScoreCalculator` (iOS) y `core/matching/` (Android)
5. **Push notifications** → `core/fcm/` (Android) debe recibir el mismo payload que el handler de iOS

---

## Stack por plataforma

### Android
- Kotlin + Jetpack Compose
- Hilt para DI (`di/` packages)
- WorkManager para tareas en background (`core/worker/`)
- Room para persistencia local (`core/database/`)
- Firebase SDK: Auth, Firestore, Storage, FCM, Remote Config, Performance

### iOS
- Swift + SwiftUI
- Firebase SDK: Auth, Firestore, Storage, Messaging, Remote Config
- CoreData para persistencia local (`data/cache/CoreDataManager.swift`)
- Servicios AI: DatingCoach, PhotoAnalyzer, SafetyScore, OptimalTime
