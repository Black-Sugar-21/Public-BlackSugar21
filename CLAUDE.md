# BlackSugar21 — Workspace Principal

## Proyectos incluidos
- **Web/Backend**: `/Users/daniel/IdeaProjects/Public-BlackSugar21` (Angular + Firebase Functions)
- **Android**: `/Users/daniel/AndroidStudioProjects/BlackSugar212` (Kotlin + Firebase)
- **iOS**: `/Users/daniel/AndroidStudioProjects/iOS` (Swift + Firebase)

## Estructura del proyecto web
- `src/` — Angular frontend
- `functions/` — Firebase Cloud Functions (Node.js/TypeScript)
- `functions/lib/` — Módulos: ai-services, coach, discovery, geo, matches, moderation, notifications, places, scheduled, shared, storage, stories, users

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
