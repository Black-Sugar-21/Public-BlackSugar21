# 🎯 Guía Completa: Pruebas de Matches con Notificaciones

## 📋 Resumen

Sistema completo para crear matches de prueba que:
1. ✅ Crea usuarios completos en Firebase Auth y Firestore
2. ✅ Genera matches automáticamente
3. ✅ Dispara notificaciones push via Cloud Functions
4. ✅ Actualiza la lista de matches en la app en tiempo real

---

## 🚀 Scripts Disponibles

### 1. `create-match-with-notification.js` - Crear Matches

**Propósito**: Crear matches de prueba con notificaciones automáticas

**Uso**:
```bash
cd /Users/daniel/IdeaProjects/Public-BlackSugar21/scripts
node create-match-with-notification.js
```

**Qué hace**:
1. Solicita cuántos matches crear (1-10)
2. Verifica FCM token de Daniel
3. Para cada match:
   - Crea usuario en Firebase Auth
   - Crea documento en collection `users` (con todos los campos requeridos)
   - Crea documento en collection `profiles` (para compatibilidad)
   - Crea match en Firestore
   - **Dispara automáticamente Cloud Function `onMatchCreated`**
   - Cloud Function envía notificación push
   - Verifica que la notificación se envió

**Salida**:
```
✅ Matches creados: 5/5
📲 Notificaciones enviadas: 4/5

1. Isabella López
   Match ID: 5186GBn7BZSyXkdGPZDrzcANV9F3_sU8xLiwQWNXmbYdR63p1uO6TSm72
   Email: match_test_1768616184929_0@blacksugar.test
   Notificación: ✅ Enviada
```

---

### 2. `verify-matches-and-notifications.js` - Verificar Estado

**Propósito**: Verificar el estado de matches y notificaciones existentes

**Uso**:
```bash
cd /Users/daniel/IdeaProjects/Public-BlackSugar21/scripts
node verify-matches-and-notifications.js
```

**Qué hace**:
1. Lista todos los matches de Daniel
2. Muestra información detallada de cada match
3. Verifica estado de notificaciones
4. Muestra estadísticas
5. Verifica FCM token de Daniel
6. Identifica matches sin notificación y explica por qué

**Salida**:
```
📊 LISTA DE MATCHES:

1. Martina Fernández
   Match ID: cXusupnXnNd3HSok1i2VURWwocz1_sU8xLiwQWNXmbYdR63p1uO6TSm72
   Último mensaje: "¡Hola! Tenemos un match 💕"
   📲 Notificación: ✅ Enviada
   🧪 Match de prueba

📊 ESTADÍSTICAS:
✅ Total de matches: 6
📲 Con notificación enviada: 5
```

---

### 3. `test-messages.js` - Pruebas de Mensajería

**Propósito**: Enviar mensajes y probar reordenamiento de matches

**Uso**:
```bash
cd /Users/daniel/IdeaProjects/Public-BlackSugar21/scripts
node test-messages.js
```

**Funcionalidades**:
- Listar matches actuales
- Enviar mensaje de prueba
- Simular conversación automática
- Verificar orden de matches

Ver [MESSAGE_TESTING_GUIDE.md](MESSAGE_TESTING_GUIDE.md) para más detalles.

---

## 🔄 Flujo Completo de Pruebas

### Escenario: Crear Matches y Recibir Notificaciones

```bash
# 1. Crear 3 matches de prueba
node create-match-with-notification.js
# Cuando pregunte, escribir: 3

# Resultado esperado:
# ✅ 3 usuarios creados
# ✅ 3 matches creados
# ✅ 2-3 notificaciones enviadas

# 2. Verificar en el dispositivo
# - Deberías recibir notificaciones push
# - Notificaciones muestran: "Isabella López" (sin contenido del mensaje)
# - Al tocar la notificación, abre la app en la lista de Matches

# 3. Verificar en la app
# - Abre BlackSugar21
# - Ve a pestaña "Matches"
# - Deberías ver 3 matches nuevos
# - Cada uno muestra: "¡Hola! Tenemos un match 💕"
# - Lista se actualiza automáticamente (Firestore listeners)

# 4. Verificar estado con script
node verify-matches-and-notifications.js

# Resultado esperado:
# ✅ Total de matches: 3
# 📲 Con notificación enviada: 3
```

---

## 📱 Cómo Funciona la Actualización en la App

### Flujo de Datos

```
Script crea match
       ↓
1. Documento en Firestore 'matches' collection
       ↓
2. Cloud Function 'onMatchCreated' detecta nuevo documento
       ↓
3. Cloud Function envía notificación push (FCM)
       ↓
4. Dispositivo recibe notificación
       ↓
5. Usuario ve notificación: "Isabella López"
       ↓
6. App tiene listener en Firestore 'matches' collection
       ↓
7. Listener detecta nuevo match automáticamente
       ↓
8. UI se actualiza en tiempo real
```

### Código en las Apps

#### Android - MatchRepository
```kotlin
// Listener en tiempo real
db.collection("matches")
    .where("usersMatched", "array-contains", currentUserId)
    .orderBy("lastMessageTimestamp", Query.Direction.DESCENDING)
    .addSnapshotListener { snapshot, error ->
        if (snapshot != null) {
            val matches = snapshot.documents.map { /* procesar */ }
            // UI se actualiza automáticamente
        }
    }
```

#### iOS - MatchRepository
```swift
// Listener en tiempo real
db.collection("matches")
    .whereField("usersMatched", arrayContains: userId)
    .order(by: "lastMessageTimestamp", descending: true)
    .addSnapshotListener { snapshot, error in
        guard let documents = snapshot?.documents else { return }
        let matches = documents.compactMap { /* procesar */ }
        // UI se actualiza automáticamente
    }
```

---

## 🔔 Sistema de Notificaciones

### Notificación de Nuevo Match

**Título**: `"Isabella López"`  
**Body**: `"Tienes un nuevo match"` (localizado)

**Características**:
- ✅ **NO muestra contenido del mensaje** (privacidad)
- ✅ Solo avisa que hay un match nuevo
- ✅ Al tocar, abre app en lista de Matches
- ✅ Multiidioma (10 idiomas soportados)

### Campos en Firestore después de enviar notificación

```javascript
{
  // ... campos del match ...
  notificationSent: true,
  notificationSentAt: Timestamp,
  // Si no se envió:
  notificationSkipReason: "no_fcm_token" // o null
}
```

---

## 🧪 Casos de Prueba

### Caso 1: Match con Notificación Exitosa

```bash
# 1. Ejecutar script
node create-match-with-notification.js
# Cantidad: 1

# 2. Verificar en dispositivo
# - Recibe notificación push ✅
# - Notificación muestra nombre del match ✅
# - No muestra contenido del mensaje ✅

# 3. Verificar en app
# - Match aparece en la lista ✅
# - Mensaje inicial visible: "¡Hola! Tenemos un match 💕" ✅

# 4. Verificar en Firestore
node verify-matches-and-notifications.js
# - notificationSent: true ✅
# - notificationSentAt: timestamp ✅
```

### Caso 2: Múltiples Matches Consecutivos

```bash
# 1. Crear 5 matches
node create-match-with-notification.js
# Cantidad: 5

# 2. Observar en dispositivo
# - Recibes 5 notificaciones ✅
# - Notificaciones agrupadas por app ✅

# 3. Verificar orden en app
# - Abre app → Matches
# - Los 5 matches aparecen ✅
# - Ordenados por timestamp (más reciente primero) ✅

# 4. Enviar mensaje a uno
node test-messages.js
# Opción 2: Enviar mensaje
# Seleccionar match #3

# 5. Verificar reordenamiento
# - Match #3 se mueve a posición #1 ✅
# - Resto mantiene orden relativo ✅
```

### Caso 3: Sin FCM Token

```bash
# 1. Verificar estado de FCM
node verify-matches-and-notifications.js

# Si muestra: "⚠️ Daniel NO tiene FCM token registrado"

# 2. Crear match
node create-match-with-notification.js
# Cantidad: 1

# 3. Resultado esperado:
# - Match se crea correctamente ✅
# - Pero notificación NO se envía ❌
# - Razón: "no_fcm_token"

# 4. Solución:
# - Abre app en dispositivo
# - Acepta permisos de notificaciones
# - App registra FCM token automáticamente
# - Siguiente match SÍ enviará notificación ✅
```

---

## 🔍 Debugging

### Problema: Matches no aparecen en la app

**Posibles causas**:
1. ❌ App no está ejecutándose
2. ❌ Listener de Firestore no está activo
3. ❌ Error en la consulta de Firestore

**Solución**:
```bash
# 1. Verificar que los matches existen
node verify-matches-and-notifications.js

# 2. Si existen en Firestore pero no en la app:
# - Cierra y reabre la app
# - Pull to refresh en la lista de Matches
# - Revisa logs en Logcat (Android) o Xcode Console (iOS)

# 3. Buscar en logs:
# Android: "MatchRepository" o "Firestore listener"
# iOS: "[MatchRepository]" o "[Firestore]"
```

### Problema: Notificaciones no llegan

**Verificar**:
```bash
# 1. Verificar FCM token
node verify-matches-and-notifications.js
# Debe mostrar: "✅ Daniel tiene FCM token registrado"

# 2. Si no tiene token:
# - Abre app en dispositivo
# - Acepta permisos de notificaciones
# - Espera 5 segundos
# - Cierra y reabre app

# 3. Verificar permisos en dispositivo
# Android: Settings > Apps > BlackSugar21 > Notifications > Enabled
# iOS: Settings > Notifications > BlackSugar21 > Allow Notifications

# 4. Revisar Cloud Functions logs
# Firebase Console > Functions > Logs
# Buscar: "onMatchCreated"
# Verificar errores
```

### Problema: Match creado pero notificationSent = false

**Causas comunes**:
1. Cloud Function no ejecutada
2. Usuario sin FCM token
3. Error en Cloud Function

**Verificar**:
```bash
# 1. Ver estado del match
node verify-matches-and-notifications.js
# Buscar: "notificationSkipReason"

# 2. Revisar Firebase Console
# Functions > Logs
# Buscar errores en "onMatchCreated"

# 3. Si dice "no_fcm_token":
# - Usuario necesita abrir app y aceptar permisos
# - Después crear nuevo match para probar
```

---

## 📊 Estructura de Datos

### Usuario en `users` Collection

```javascript
{
  // Identificación
  name: "Isabella López",
  email: "match_test_xxx@blacksugar.test",
  
  // Género y orientación
  male: false,
  birthDate: Timestamp,
  orientation: "men", // "men", "women", "both"
  userType: "SUGAR_BABY",
  
  // Ubicación
  city: "Santiago",
  g: "66k", // geohash
  latitude: -33.4489,
  longitude: -70.6693,
  
  // Preferencias
  minAge: 18,
  maxAge: 99,
  maxDistance: 200,
  
  // Estado
  paused: false,
  visible: true,
  blocked: false,
  
  // Notificaciones
  fcmToken: "cv52FvozJktnuY...",
  
  // Metadatos
  isTest: true,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### Match en `matches` Collection

```javascript
{
  // Usuarios
  userId1: "sU8xLiwQWNXmbYdR63p1uO6TSm72", // Daniel
  userId2: "5186GBn7BZSyXkdGPZDrzcANV9F3", // Isabella
  usersMatched: ["sU8xLiwQWNXmbYdR63p1uO6TSm72", "5186GBn7BZSyXkdGPZDrzcANV9F3"],
  
  // Timestamps
  timestamp: Timestamp,
  createdAt: Timestamp,
  
  // Último mensaje
  lastMessage: "¡Hola! Tenemos un match 💕",
  lastMessageSeq: 1,
  lastMessageTimestamp: Timestamp,
  
  // Notificación
  notificationSent: true,
  notificationSentAt: Timestamp,
  notificationSkipReason: null, // o "no_fcm_token"
  
  // Metadatos
  isTest: true
}
```

---

## 🎯 Checklist de Verificación

### Antes de Crear Matches
- [ ] Firebase Admin SDK configurado
- [ ] `serviceAccountKey.json` en `/scripts`
- [ ] Cloud Functions desplegadas
- [ ] App instalada en dispositivo de Daniel
- [ ] Permisos de notificaciones aceptados
- [ ] FCM token registrado (verificar con script)

### Después de Crear Matches
- [ ] Matches creados en Firestore
- [ ] Notificaciones enviadas (verificar logs)
- [ ] Notificaciones recibidas en dispositivo
- [ ] Matches aparecen en lista de la app
- [ ] Último mensaje visible en cada match
- [ ] Orden correcto (más reciente primero)

### Pruebas de Mensajería
- [ ] Enviar mensaje a un match
- [ ] Match se reordena a posición #1
- [ ] Notificación de mensaje recibida
- [ ] Notificación NO muestra contenido (solo "Tienes un nuevo mensaje")
- [ ] Abrir app → ver mensaje completo en chat

---

## 🔗 Referencias

### Documentación Relacionada
- [MESSAGE_TESTING_GUIDE.md](MESSAGE_TESTING_GUIDE.md) - Guía completa de pruebas de mensajes
- [PRIVACY_NOTIFICATIONS_FIX.md](PRIVACY_NOTIFICATIONS_FIX.md) - Sistema de privacidad en notificaciones
- [NOTIFICATIONS_NATIVE_LOCALIZATION.md](NOTIFICATIONS_NATIVE_LOCALIZATION.md) - Localización de notificaciones

### Cloud Functions
- `onMatchCreated` - Envía notificaciones cuando se crea un match
- `onMessageCreated` - Envía notificaciones cuando llega un mensaje
- `handlePendingNotification` - Procesa notificaciones pendientes

### Firebase Console
- **Firestore**: https://console.firebase.google.com/project/black-sugar21/firestore
- **Functions**: https://console.firebase.google.com/project/black-sugar21/functions
- **Authentication**: https://console.firebase.google.com/project/black-sugar21/authentication

---

**Última actualización**: 16 de enero de 2026  
**Autor**: GitHub Copilot  
**Versión**: 1.0.0
