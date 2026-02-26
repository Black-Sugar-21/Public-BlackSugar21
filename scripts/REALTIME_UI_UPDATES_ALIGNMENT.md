# ✅ Alineación Android/iOS: Actualizaciones UI en Tiempo Real al Recibir Mensajes

**Fecha**: 18 de enero de 2026  
**Problema Original**: MatchListView no se actualizaba en tiempo real cuando llegaban mensajes mientras estabas viendo la lista de conversaciones  
**Solución**: Emitir notificaciones tanto al ENVIAR como al RECIBIR mensajes

---

## 🎯 Problema Identificado

### iOS (Reportado por usuario)
> "cuando estoy en la vista mensajes y me llegan las notificaciones de los mensajes no se actualizan a nivel ui"

**Síntomas:**
- Usuario envía 10 mensajes de prueba a Victoria Castro
- Mensajes se guardan correctamente en Firestore
- Mientras estás en MatchListView viendo la lista de conversaciones
- El match NO se mueve a posición #1 automáticamente
- Necesitas cambiar de tab o refrescar manualmente

**Root Cause:**
ChatViewModel solo emitía "MatchUpdated" cuando el usuario **ENVIABA** mensajes, no cuando **RECIBÍA** mensajes de otros usuarios.

---

## ✅ Solución Implementada

### iOS - ChatViewModel.swift

**Archivo**: `/Users/daniel/AndroidStudioProjects/iOS/black-sugar-21/ui/chat/ChatViewModel.swift`

**Cambios (Líneas 862-881):**

```swift
// ✨ NUEVO: Notificar a MatchListViewModel cuando llegan mensajes de OTRO USUARIO
// para que actualice la lista en tiempo real (solo si hay mensajes del otro usuario)
let messagesFromOtherUser = newMessages.filter { !$0.isCurrentUser }
if !messagesFromOtherUser.isEmpty, let latestMessage = messagesFromOtherUser.last {
    let updateTimestamp = Date().timeIntervalSince1970
    print("🔔 [ChatViewModel] Emitiendo MatchUpdated para mensaje recibido de otro usuario")
    NotificationCenter.default.post(
        name: NSNotification.Name("MatchUpdated"),
        object: nil,
        userInfo: [
            "matchId": matchId,
            "message": latestMessage.message,
            "timestamp": updateTimestamp,
            "success": true
        ]
    )
}
```

**Contexto:**
- Se agregó dentro del listener de mensajes (líneas 839-900)
- Detecta mensajes nuevos que NO son del usuario actual
- Emite la misma notificación "MatchUpdated" que ya se emitía al enviar
- MatchListViewModel recibe la notificación y mueve el match a posición #1

---

### Android - ChatViewModel.kt

**Archivo**: `/Users/daniel/AndroidStudioProjects/BlackSugar212/app/src/main/java/com/black/sugar21/feature/chat/ui/chat/ChatViewModel.kt`

**Cambios (Líneas 355-390):**

```kotlin
fun getMessages(matchId: String) = messageRepository.getMessages(matchId, messagesPageSize).map { messages ->
    // 📝 Trackear IDs de mensajes del listener para evitar duplicados en paginación
    val newIds = mutableListOf<String>()
    messages.forEach { message ->
        if (!loadedMessageIds.contains(message.id)) {
            loadedMessageIds.add(message.id)
            newIds.add(message.id)
        }
    }
    if (newIds.isNotEmpty()) {
        android.util.Log.d("ChatViewModel", "📝 Trackeados ${newIds.size} nuevos IDs del listener (total en caché: ${loadedMessageIds.size})")
        
        // ✨ NUEVO: Notificar a MatchListViewModel cuando llegan mensajes de OTRO USUARIO
        // para que actualice la lista en tiempo real (solo si hay mensajes del otro usuario)
        val currentUserId = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.uid
        if (currentUserId != null) {
            val newMessagesFromOtherUser = messages.filter { message ->
                !message.isFromSender && newIds.contains(message.id)
            }
            
            if (newMessagesFromOtherUser.isNotEmpty()) {
                val latestMessage = newMessagesFromOtherUser.last()
                val updateTimestamp = System.currentTimeMillis()
                
                android.util.Log.d("ChatViewModel", "🔔 Emitiendo MatchUpdated para mensaje recibido de otro usuario")
                
                // Emitir notificación en background para no bloquear el flow
                viewModelScope.launch(Dispatchers.IO) {
                    try {
                        com.black.sugar21.feature.chat.ui.match_list.MatchListUpdateNotifier.notifyMatchUpdated(
                            matchId = matchId,
                            message = latestMessage.text,
                            timestamp = updateTimestamp
                        )
                        android.util.Log.d("ChatViewModel", "✅ Notificación MatchUpdated emitida para mensaje recibido")
                    } catch (e: Exception) {
                        android.util.Log.e("ChatViewModel", "❌ Error emitiendo notificación MatchUpdated", e)
                    }
                }
            }
        }
    }
    messages
}
```

**Contexto:**
- Se agregó dentro del método `getMessages()` que mapea el Flow de mensajes
- Detecta mensajes nuevos que NO son del sender (`!message.isFromSender`)
- Emite notificación a través de `MatchListUpdateNotifier.notifyMatchUpdated()`
- MatchListViewModel recibe la notificación y ejecuta `handleOptimisticMatchUpdate()`

---

## 🔄 Flujo Completo (Homologado)

### Cuando Usuario A envía mensaje (YA FUNCIONABA):

```
Usuario A envía mensaje →
  ChatViewModel.sendMessage() →
    messageRepository.addMessage() →
      ✅ Notificación emitida (iOS: NotificationCenter, Android: SharedFlow) →
        MatchListViewModel recibe →
          Match sube a posición #1 INMEDIATAMENTE
```

### Cuando Usuario B recibe mensaje (NUEVO FIX):

```
Usuario B recibe mensaje de Usuario A →
  Firestore listener detecta cambio →
    ChatViewModel listener procesa nuevos mensajes →
      Filtrar mensajes de OTRO USUARIO →
        ✅ Notificación emitida (iOS: NotificationCenter, Android: SharedFlow) →
          MatchListViewModel recibe →
            Match sube a posición #1 INMEDIATAMENTE
```

---

## 📊 Comparación Técnica

| Aspecto | iOS | Android |
|---------|-----|---------|
| **Mecanismo de Notificación** | `NotificationCenter.post()` | `MatchListUpdateNotifier.notifyMatchUpdated()` |
| **Donde se detectan mensajes** | Firestore listener en ChatViewModel (línea 839) | Flow mapping en `getMessages()` (línea 355) |
| **Filtro de mensajes** | `!$0.isCurrentUser` | `!message.isFromSender` |
| **Data transportada** | `matchId`, `message`, `timestamp`, `success` | `matchId`, `message`, `timestamp` |
| **Thread** | `MainActor` | `Dispatchers.IO` |
| **Receptor** | MatchListViewModel observa "MatchUpdated" | MatchListViewModel collect `matchUpdatedEvent` |
| **Prevención de duplicados** | Verificar `lastUpdateTimestamps` | Verificar `lastUpdateTimestamps` |

---

## ✅ Verificación de Implementación

### iOS
- [x] **Línea 862-881**: Código agregado en listener de mensajes
- [x] **Filtro**: `messagesFromOtherUser = newMessages.filter { !$0.isCurrentUser }`
- [x] **Notificación**: `NotificationCenter.default.post(name: "MatchUpdated", ...)`
- [x] **Logs**: `print("🔔 [ChatViewModel] Emitiendo MatchUpdated para mensaje recibido")`
- [x] **MatchListViewModel**: Ya tenía listener configurado (líneas 78-164)

### Android
- [x] **Línea 355-390**: Código agregado en `getMessages()` map
- [x] **Filtro**: `newMessagesFromOtherUser = messages.filter { !message.isFromSender && newIds.contains(message.id) }`
- [x] **Notificación**: `MatchListUpdateNotifier.notifyMatchUpdated(...)`
- [x] **Logs**: `Log.d("ChatViewModel", "🔔 Emitiendo MatchUpdated para mensaje recibido")`
- [x] **MatchListViewModel**: Ya tenía listener configurado (líneas 76-91)

---

## 🧪 Test Plan

### Escenario 1: Usuario envía mensaje (Debe seguir funcionando)
1. Abrir app en MatchListView
2. Usuario A envía mensaje a Usuario B desde la app
3. **Resultado Esperado**: Match sube a posición #1 inmediatamente

### Escenario 2: Usuario recibe mensaje (NUEVO - debe funcionar ahora)
1. Usuario A tiene app abierta en MatchListView
2. Usuario B envía mensaje a Usuario A (desde test-master.js o otra app)
3. **Resultado Esperado**: Match de Usuario B sube a posición #1 inmediatamente en app de Usuario A

### Escenario 3: Múltiples mensajes recibidos
1. Usuario A en MatchListView
2. test-master.js envía 10 mensajes consecutivos
3. **Resultado Esperado**: 
   - Match se mueve a #1 con el primer mensaje
   - Subsecuentes mensajes mantienen el match en #1
   - lastMessage se actualiza con cada mensaje

### Logs de Debugging

#### iOS - Buscar en Xcode Console:
```
🔔 [ChatViewModel] Emitiendo MatchUpdated para mensaje recibido de otro usuario
📬 [MatchListViewModel] Notificación MatchUpdated recibida para match: sU8xLiwQ...
📝 [MatchListViewModel] Mensaje: "Hola! ¿Cómo estás?..."
✅ [MatchListViewModel] Match movido a posición #1 optimistamente
```

#### Android - Buscar en Logcat:
```
📝 Trackeados 1 nuevos IDs del listener (total en caché: 15)
🔔 Emitiendo MatchUpdated para mensaje recibido de otro usuario
✅ Notificación MatchUpdated emitida para mensaje recibido
📬 Notificación MatchUpdated recibida para match: sU8xLiwQ...
📝 Mensaje: "Hola! ¿Cómo estás?..."
✅ Match movido a posición #1 optimistamente
```

---

## 🚀 Siguiente Paso

**Usuario debe:**
1. Recompilar iOS app en Xcode
2. Recompilar Android app con Gradle
3. Probar escenario 2 del test plan:
   - Abrir app en MatchListView
   - Ejecutar `node test-master.js` para enviar mensajes
   - Verificar que match sube a #1 automáticamente

**Comando de prueba:**
```bash
cd /Users/daniel/IdeaProjects/Public-BlackSugar21/scripts
node test-master.js
# Seleccionar opción "Enviar mensaje de prueba"
```

---

## 📝 Notas Técnicas

### Por qué se necesitaba este cambio:

1. **Sistema de Actualizaciones Optimistas Existente**: Ambas plataformas ya tenían el sistema de notificaciones, pero solo se activaba al ENVIAR mensajes

2. **Problema de Direccionalidad**: El flujo era unidireccional (solo SEND), necesitaba ser bidireccional (SEND + RECEIVE)

3. **Listener Ya Existía**: El Firestore listener ya detectaba mensajes nuevos, solo faltaba emitir la notificación

4. **MatchListViewModel Ya Estaba Listo**: El listener en MatchListViewModel ya existía y funcionaba correctamente, solo esperaba recibir notificaciones de ambos casos

### Arquitectura Homologada:

**iOS:**
```
ChatViewModel (listener) → NotificationCenter → MatchListViewModel → UI Update
```

**Android:**
```
ChatViewModel (flow) → SharedFlow → MatchListViewModel → UI Update
```

Ambos usan el mismo patrón: **Observer Pattern** con prevención de duplicados mediante timestamps.

---

## ✅ Status

- **iOS**: ✅ Fix aplicado (líneas 862-881)
- **Android**: ✅ Fix aplicado (líneas 355-390)
- **Compilación iOS**: ⏳ Pendiente
- **Compilación Android**: ⏳ Pendiente
- **Testing**: ⏳ Pendiente
- **Documentación**: ✅ Completa

---

**Fecha de Implementación**: 18 de enero de 2026  
**Archivos Modificados**:
- iOS: `ChatViewModel.swift` (+17 líneas)
- Android: `ChatViewModel.kt` (+35 líneas)

**Impacto**: **CRÍTICO** - Soluciona problema de UX donde matches no se actualizaban en tiempo real al recibir mensajes
