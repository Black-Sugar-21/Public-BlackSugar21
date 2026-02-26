# 🤖 Agent Skills - BlackSugar21 Web

## ¿Qué son los Agent Skills?

Los **Agent Skills** son un estándar abierto creado por Anthropic que permite a los agentes de IA (como GitHub Copilot) acceder a instrucciones, scripts y recursos especializados para realizar tareas específicas del proyecto.

## 🎯 Beneficios

- **Especialización**: Copilot conoce el contexto específico del proyecto Web/Angular
- **Reducción de repetición**: No necesitas explicar la arquitectura Angular cada vez
- **Carga eficiente**: Solo se carga el contenido relevante cuando es necesario
- **Portabilidad**: Funciona en VS Code, GitHub Copilot CLI, y Copilot coding agent

## 📂 Estructura

```
.github/skills/
├── blacksugar-public/
│   └── SKILL.md                        # Repositorio público y sitio web
├── blacksugar-web/
│   ├── SKILL.md                        # Guía principal Angular/Web
│   ├── incident-runbook.md             # Manual de respuesta a incidentes
│   └── examples/
│       └── firebase-service-example.ts # Patrones de Firebase en Angular
├── blacksugar-testing/
│   └── SKILL.md                        # Sistema unificado de testing
├── blacksugar-ios/
│   └── SKILL.md                        # App iOS Swift/SwiftUI – Firebase, Analytics, CF
└── blacksugar-android/
    └── SKILL.md                        # App Android Kotlin/Compose – Firebase, Analytics, CF
```

## 🎯 Skills Disponibles

### blacksugar-public-repo
**Descripción**: Repositorio público de BlackSugar21  
**Usar cuando**: Sitio web público, páginas legales, deployment a Firebase Hosting, documentación corporativa  
**Incluye**:
- Landing pages y políticas legales (Términos, Privacidad, Data Deletion, Safety)
- Configuración Angular 21 standalone components
- Sistema de internacionalización (es/en/pt)
- Deployment a Firebase Hosting
- Scripts de administración y testing

### blacksugar-web-development
**Descripción**: Desarrollo de aplicación web Angular 21  
**Usar cuando**: Trabajo con frontend, Firebase web, deployment, o debugging web  
**Incluye**:
- Arquitectura Angular standalone components
- Patrones RxJS y Firebase
- Configuración de deployment
- Resolución de incidentes

### blacksugar-testing-system
**Descripción**: Sistema maestro consolidado de pruebas  
**Usar cuando**: Testing, población de datos, limpieza, debugging de matches  
**Incluye**:
- Script unificado test-system-unified.js
- Gestión de matches y discovery profiles
- Verificación y diagnóstico
- Limpieza selectiva y soporte multi-usuario

### blacksugar-ios
**Descripción**: App iOS de BlackSugar21 (Swift/SwiftUI)  
**Usar cuando**: Código Swift, Firestore iOS, Analytics iOS, Cloud Functions desde iOS, SwipeView, PhoneAuth Swift, Remote Config iOS o auditoría iOS ↔ Android  
**Incluye**:
- Bundle ID `com.blacksugar21.app`, archivos clave Swift
- Todos los campos escritos en `createUserProfile()` y `updateProfile()`
- Estructura de mensajes text/place/ephemeral (FirestoreRemoteDataSource)
- 23 eventos Analytics con código Swift
- 10 claves Remote Config con defaults
- 33 Cloud Functions con payloads
- Reglas críticas de alineación iOS ↔ Android
- Comandos de búsqueda rápida para Swift

### blacksugar-android
**Descripción**: App Android de BlackSugar21 (Kotlin/Jetpack Compose)  
**Usar cuando**: Código Kotlin, Firestore Android, Analytics Android, Cloud Functions desde Android, HomeViewModel, PhoneAuthViewModel, SwipeUploadWorker, ActiveChatManager o auditoría iOS ↔ Android  
**Incluye**:
- Package `com.black.sugar21`, archivos clave Kotlin
- Todos los campos escritos en `createUser()` y `updateProfile()`
- `toData()` y `toPlaceData()` de FirestoreMessage
- `pendingNotifications` en PushNotificationService
- `activeChat` via ActiveChatManager
- WorkManager retry (SwipeUploadWorker)
- 23 eventos Analytics con métodos AnalyticsService
- 10 claves Remote Config con defaults
- 33 Cloud Functions
- Reglas críticas de alineación iOS ↔ Android
- Comandos de búsqueda rápida para Kotlin

## 🔄 Cómo funciona

### Nivel 1: Descubrimiento
Copilot siempre conoce qué skills están disponibles leyendo el `name` y `description` del frontmatter YAML.

### Nivel 2: Carga de instrucciones
Cuando tu solicitud coincide con la descripción del skill, Copilot carga el contenido completo de `SKILL.md`.

### Nivel 3: Acceso a recursos
Copilot puede acceder a archivos adicionales (ejemplos, scripts) solo cuando los necesita.

## 🚀 Cómo usar

### Activación automática
No necesitas hacer nada especial. Cuando trabajas en el proyecto web y haces preguntas a Copilot, automáticamente detectará y usará este skill cuando sea relevante.

### Ejemplos de uso

**Pregunta**: "¿Cómo creo un servicio de Firebase en Angular?"
- Copilot detecta que es relevante para el proyecto web
- Carga el skill de web
- Usa el ejemplo `firebase-service-example.ts`
- Proporciona código con RxJS y Firebase modular SDK

**Pregunta**: "El deployment a Firebase falla, ¿qué reviso?"
- Copilot carga el `incident-runbook.md`
- Proporciona pasos de debugging específicos
- Sugiere comandos de Firebase CLI

**Pregunta**: "¿Cómo uso los scripts de admin?"
- Copilot conoce los scripts en `/scripts`
- Explica populate-test-matches.js, cleanup, etc.
- Proporciona ejemplos de uso

## 📝 SKILL.md - Formato

Cada `SKILL.md` tiene esta estructura:

```markdown
---
name: skill-name               # Identificador único (kebab-case)
description: Descripción...     # Cuándo usar este skill (max 1024 chars)
---

# Título del Skill

Contenido con instrucciones, ejemplos, y referencias...
```

## 🛠️ Personalización

Puedes modificar los archivos para:
- Agregar nuevos ejemplos de componentes Angular
- Actualizar procedimientos de deployment
- Añadir nuevos scripts de administración
- Incluir patrones de RxJS específicos

## 🔐 Configuración requerida

Para habilitar Agent Skills en VS Code:
1. Abre configuración (⌘+,)
2. Busca: `chat.useAgentSkills`
3. Activa la opción

## 🌐 Características específicas de Web

Este skill cubre:
- **Angular 21**: Standalone components, signals, modern patterns
- **RxJS**: Observables, operators, state management
- **Firebase**: Firestore modular SDK, Hosting, Functions
- **TypeScript**: Tipos avanzados, interfaces, generics
- **Admin Scripts**: Node.js utilities para gestión de datos
- **Deployment**: Firebase Hosting, build optimization

## 📚 Scripts disponibles

El skill documenta todos los scripts en `/scripts`:
- `populate-test-matches.js` - Crear datos de prueba
- `cleanup-test-matches.js` - Limpiar datos de prueba
- `check-matches.js` - Verificar integridad de matches
- `clean-orphan-matches.js` - Eliminar matches huérfanos
- `debug-matches-users.js` - Debug de usuarios y matches
- `get-user-email.js` - Obtener email por user ID

## 📚 Recursos adicionales

- [Documentación oficial de Agent Skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills)
- [Especificación del estándar](https://agentskills.io/)
- [Repositorio de skills comunitarios](https://github.com/github/awesome-copilot)
- [Skills de referencia](https://github.com/anthropics/skills)

## 🤝 Contribuir

Para mejorar estos skills:
1. Edita los archivos relevantes
2. Prueba con Copilot en código TypeScript/Angular
3. Documenta los cambios
4. Comparte mejoras con el equipo

---

**Proyecto**: BlackSugar21 Web  
**Última actualización**: Enero 2026  
**Versión**: 1.0
