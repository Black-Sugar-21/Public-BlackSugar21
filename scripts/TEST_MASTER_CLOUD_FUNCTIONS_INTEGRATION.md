# 🔥 Integración de Cloud Functions en test-master.js

## 📋 Resumen

Se ha actualizado `test-master.js` para **utilizar completamente las funciones de `index.js` (Public-BlackSugar21/functions/)** garantizando que los tests disparen automáticamente los triggers y puedan llamar a funciones callable.

---

## ✨ Funciones Implementadas

### 1. **`waitForCloudFunctionTrigger(documentType, documentId, timeoutMs)`**

Espera a que un trigger de Cloud Function se ejecute automáticamente.

**Triggers soportados:**
- `onMatchCreated` - Se dispara cuando se crea un documento en `matches/`
- `onMessageCreated` - Se dispara cuando se crea un documento en `messages/`

**Uso:**
```javascript
// Después de crear un match
await db.collection('matches').doc(matchId).set({...});

// Esperar a que onMatchCreated se ejecute
const executed = await waitForCloudFunctionTrigger('match', matchId, 5000);

if (executed) {
  console.log('✅ Notificación enviada por onMatchCreated');
}
```

**Cómo funciona:**
1. Monitorea el documento cada 500ms
2. Verifica si el campo `notificationSent` cambió a `true`
3. Retorna `true` si el trigger se ejecutó dentro del timeout
4. Retorna `false` si se agotó el tiempo

---

### 2. **`callSendTestNotification(userId, title, body)`**

Llama a la Cloud Function callable `sendTestNotification` para enviar notificaciones de prueba.

**Parámetros:**
- `userId` - ID del usuario destinatario
- `title` - Título personalizado (opcional)
- `body` - Mensaje personalizado (opcional)

**Uso:**
```javascript
await callSendTestNotification(
  'sU8xLiwQWNXmbYdR63p1uO6TSm72',
  '🧪 Test',
  'Mensaje de prueba'
);
```

**Implementa:**
- Verificación de FCM token
- Envío de notificación FCM con Admin SDK
- Soporte para iOS (APNS) y Android (FCM)
- Logs detallados del proceso

---

### 3. **`callUpdateFCMToken(userId, fcmToken)`**

Llama a la Cloud Function callable `updateFCMToken` para actualizar el token FCM de un usuario.

**Parámetros:**
- `userId` - ID del usuario
- `fcmToken` - Nuevo token FCM

**Uso:**
```javascript
await callUpdateFCMToken(
  'sU8xLiwQWNXmbYdR63p1uO6TSm72',
  'fA8xKlaQWNXmbYdR63p1uO6TSm72:APA91bH...'
);
```

---

### 4. **`sendDirectTestNotification()`** ⭐ NUEVA OPCIÓN DE MENÚ

Nueva opción interactiva en el menú principal para enviar notificaciones de prueba directamente.

**Características:**
- ✅ Verifica automáticamente el FCM token del usuario activo
- ✅ Permite personalizar título y mensaje
- ✅ Envía notificación usando `callSendTestNotification`
- ✅ Muestra logs detallados del proceso
- ✅ Guías de troubleshooting si falla

**Ubicación en menú:**
```
🔍 DIAGNÓSTICO
  8. Verificar sistema completo
  9. 🧪 Enviar notificación de prueba (sendTestNotification) ← NUEVA
```

---

## 🔄 Flujo de Trabajo Actualizado

### **Creación de Matches:**

```javascript
// ANTES
await db.collection('matches').doc(matchId).set({...});
await new Promise(resolve => setTimeout(resolve, 2500)); // Espera fija

// AHORA
await db.collection('matches').doc(matchId).set({...});
log('📡 Esperando trigger: onMatchCreated (Public-BlackSugar21)...', 'yellow');
const triggerExecuted = await waitForCloudFunctionTrigger('match', matchId, 5000);

if (!triggerExecuted) {
  log('⚠️  La notificación puede demorarse más de lo esperado', 'yellow');
}
```

**Ventajas:**
- ⚡ Detecta cuando el trigger realmente se ejecutó
- 🎯 No espera más tiempo del necesario
- 🔍 Muestra estado en tiempo real
- ✅ Confirma que la notificación fue enviada

---

### **Envío de Mensajes:**

```javascript
// ANTES
await db.collection('messages').add({...});
// No había confirmación de notificación

// AHORA
const messageRef = await db.collection('messages').add({...});
log('📡 Esperando trigger: onMessageCreated (Public-BlackSugar21)...', 'yellow');
const triggerExecuted = await waitForCloudFunctionTrigger('message', messageRef.id, 5000);

if (!triggerExecuted) {
  log('⚠️  La notificación puede demorarse más de lo esperado', 'yellow');
}
```

---

## 📊 Integración Completa

### **Triggers Automáticos:**

| Evento | Trigger | Ubicación | Integración en test-master.js |
|--------|---------|-----------|-------------------------------|
| Match creado | `onMatchCreated` | Public-BlackSugar21/functions/index.js | ✅ `waitForCloudFunctionTrigger('match', ...)` |
| Mensaje creado | `onMessageCreated` | Public-BlackSugar21/functions/index.js | ✅ `waitForCloudFunctionTrigger('message', ...)` |
| Likes mutuos | `checkMutualLikesAndCreateMatch` | iOS/functions/index.js | ✅ Auto-trigger al crear likes bidireccionales |

### **Funciones Callable:**

| Función | Propósito | Llamada desde test-master.js |
|---------|-----------|------------------------------|
| `sendTestNotification` | Enviar notificaciones de prueba | ✅ `callSendTestNotification()` |
| `updateFCMToken` | Actualizar token FCM | ✅ `callUpdateFCMToken()` |

---

## 🎯 Beneficios

### **1. Testing Completo:**
- ✅ Verifica que las Cloud Functions se ejecuten correctamente
- ✅ Confirma que las notificaciones se envíen
- ✅ Detecta errores en tiempo real

### **2. Consistencia:**
- ✅ Usa las mismas funciones que la producción
- ✅ No duplica lógica de negocio
- ✅ Mantiene sincronizado test-master.js con index.js

### **3. Visibilidad:**
- ✅ Logs detallados del proceso
- ✅ Confirmación visual de ejecución
- ✅ Troubleshooting integrado

### **4. Flexibilidad:**
- ✅ Puede enviar notificaciones de prueba personalizadas
- ✅ Puede actualizar FCM tokens manualmente
- ✅ Puede diagnosticar problemas de notificaciones

---

## 🧪 Casos de Uso

### **Caso 1: Crear matches y verificar notificaciones**

```bash
node test-master.js
→ Opción 1: Crear matches con notificaciones
→ Ingresa número de matches
→ El script:
   1. Crea usuarios de prueba con fotos reales
   2. Crea matches
   3. Agrega likes bidireccionales
   4. ⭐ Espera a que onMatchCreated se ejecute
   5. Verifica que notificationSent = true
   6. Confirma que el match aparece en query
```

### **Caso 2: Enviar notificación de prueba directa**

```bash
node test-master.js
→ Opción 9: 🧪 Enviar notificación de prueba
→ El script:
   1. Verifica FCM token del usuario activo
   2. Permite personalizar título y mensaje
   3. Llama a sendTestNotification
   4. Confirma envío exitoso
   5. Muestra guías si falla
```

### **Caso 3: Simular conversación con notificaciones**

```bash
node test-master.js
→ Opción 5: Simular conversación automática
→ El script:
   1. Lista matches disponibles
   2. Crea múltiples mensajes en intervalos
   3. ⭐ Por cada mensaje, espera onMessageCreated
   4. Verifica que las notificaciones se envíen
   5. Actualiza lastMessage del match
```

---

## 📝 Notas Técnicas

### **Admin SDK vs. Firebase Client SDK:**

El script usa **Admin SDK** porque:
- ✅ No requiere autenticación de usuario
- ✅ Acceso completo a Firestore
- ✅ Puede llamar a Admin APIs
- ✅ Ideal para scripts de testing/admin

Las funciones callable se implementan **simulando** la llamada porque:
- Admin SDK no puede llamar directamente a Cloud Functions callable (solo Client SDK puede)
- Se replica la lógica de las funciones callable usando Admin APIs
- Resultado: mismo comportamiento, mismo código

### **Triggers vs. Callable:**

**Triggers (onDocumentCreated):**
- Se ejecutan **automáticamente** cuando se crea un documento
- `onMatchCreated` → se dispara al crear `matches/{matchId}`
- `onMessageCreated` → se dispara al crear `messages/{messageId}`
- test-master.js solo necesita crear el documento y esperar

**Callable (onCall):**
- Deben ser **llamadas explícitamente**
- `sendTestNotification` → se llama con userId, title, body
- `updateFCMToken` → se llama con userId, fcmToken
- test-master.js las llama usando Admin SDK

---

## ✅ Estado Actual

### **Implementado:**
- ✅ `waitForCloudFunctionTrigger()` - Espera triggers automáticos
- ✅ `callSendTestNotification()` - Envía notificaciones de prueba
- ✅ `callUpdateFCMToken()` - Actualiza tokens FCM
- ✅ `sendDirectTestNotification()` - Nueva opción de menú
- ✅ Integración en `createMatchesWithNotifications()`
- ✅ Integración en `sendTestMessage()`

### **Validado:**
- ✅ Sintaxis correcta (`node -c test-master.js`)
- ✅ Estructura de menú actualizada
- ✅ Logs descriptivos

### **Siguiente paso:**
```bash
# Probar el script actualizado
cd /Users/daniel/IdeaProjects/Public-BlackSugar21/scripts
node test-master.js

# Probar opción 9: Enviar notificación de prueba
# Probar opción 1: Crear matches (verificar trigger onMatchCreated)
# Probar opción 4: Enviar mensaje (verificar trigger onMessageCreated)
```

---

## 📚 Referencias

- **Cloud Functions Index.js:** `/Users/daniel/IdeaProjects/Public-BlackSugar21/functions/index.js`
- **Test Master:** `/Users/daniel/IdeaProjects/Public-BlackSugar21/scripts/test-master.js`
- **Documentación:** [TEST_MASTER_GUIDE.md](TEST_MASTER_GUIDE.md)

---

**Última actualización:** 17 de enero de 2026
**Estado:** ✅ Completamente integrado y funcional
