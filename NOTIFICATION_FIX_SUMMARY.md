# 🔧 Corrección de Navegación de Notificaciones

## 📝 Problema Identificado

La notificación de nuevo mensaje (`new_message`) **NO estaba navegando correctamente** a ChatView al tocar la notificación.

### Causa Raíz

**Incompatibilidad de tipos entre Cloud Function y Apps:**

- ✅ **Cloud Function** enviaba: `type: "new_message"`
- ❌ **iOS** buscaba: `type == "chat_message"`  
- ❌ **Android** buscaba: `type == "chat_message"`

**Resultado:** Las apps no reconocían las notificaciones y no ejecutaban la navegación.

---

## ✅ Solución Implementada

### 1. iOS - black_sugar_21App.swift

#### Cambio en `didReceive response` (Notificación tocada - App cerrada/background)

**Antes:**
```swift
if type == "chat_message",
   let matchId = userInfo["matchId"] as? String,
```

**Después:**
```swift
if type == "new_message" || type == "chat_message",
   let matchId = userInfo["matchId"] as? String ?? userInfo["chatId"] as? String,
```

**Mejoras:**
- ✅ Acepta tanto `new_message` como `chat_message`
- ✅ Soporta `chatId` como alternativa a `matchId`
- ✅ Agrega logs detallados del payload (action, screen, navigationPath)

#### Cambio en `willPresent` (Notificación en foreground)

**Antes:**
```swift
if let type = userInfo["type"] as? String, type == "chat_message",
   let matchId = userInfo["matchId"] as? String {
```

**Después:**
```swift
if let type = userInfo["type"] as? String, 
   (type == "new_message" || type == "chat_message"),
   let matchId = userInfo["matchId"] as? String ?? userInfo["chatId"] as? String {
```

**Mejoras:**
- ✅ Acepta ambos tipos de notificación
- ✅ Soporta `chatId` como alternativa a `matchId`

---

### 2. Android - MyFirebaseMessagingService.kt

#### Cambio en `onMessageReceived`

**Antes:**
```kotlin
if (type == "chat_message") {
    Log.d("FCM", "✅ Procesando: chat_message")
    
    Log.d("FCM", "🔔 Notificación de mensaje para match: ${matchId?.take(8)}...")
```

**Después:**
```kotlin
if (type == "new_message" || type == "chat_message") {
    Log.d("FCM", "✅ Procesando: $type (mensaje de chat)")
    
    // Soportar tanto matchId como chatId
    val chatId = matchId ?: data["chatId"]
    Log.d("FCM", "🔔 Notificación de mensaje para chat: ${chatId?.take(8)}...")
    Log.d("FCM", "🔔 Action: ${data["action"]}")
    Log.d("FCM", "🔔 Screen: ${data["screen"]}")
    Log.d("FCM", "🔔 NavigationPath: ${data["navigationPath"]}")
```

**Mejoras:**
- ✅ Acepta tanto `new_message` como `chat_message`
- ✅ Usa `chatId` como nombre principal, `matchId` como fallback
- ✅ Agrega logs de campos de navegación del payload

#### Actualización de referencias a `matchId` → `chatId`

**3 lugares actualizados:**

1. **Verificación de chat activo:**
```kotlin
if (chatId != null && activeChatManager.isActiveChatForMatch(chatId)) {
    messageService.markAsRead(chatId, currentUserId)
    activeChatManager.notifyNewMessage(chatId)
```

2. **Llamada a showChatMessageNotification:**
```kotlin
showChatMessageNotification(
    senderName = senderName,
    message = message,
    matchId = chatId, // Usa chatId en lugar de matchId
    senderId = senderId
)
```

---

## 🎯 Resultado Esperado

### Flujo de Navegación (iOS y Android)

1. **Usuario recibe notificación** con payload:
   ```json
   {
     "type": "new_message",
     "action": "open_chat",
     "screen": "ChatView",
     "matchId": "userId1_userId2",
     "chatId": "userId1_userId2",
     "senderId": "userId_sender",
     "senderName": "Sender Name",
     "receiverId": "userId_receiver",
     "navigationPath": "home/messages/chat"
   }
   ```

2. **App reconoce la notificación** (ahora acepta `new_message`)

3. **Usuario toca la notificación:**
   - ✅ App abre en **Home**
   - ✅ Selecciona tab **Messages**
   - ✅ Abre **ChatView** con el match específico

---

## 🧪 Pruebas Recomendadas

### Test con Option 22 (test-master.js)

```bash
cd /Users/daniel/IdeaProjects/Public-BlackSugar21/scripts
node test-master.js
# Seleccionar Daniel o Rosita
# Opción 22: Recibir mensaje de prueba
```

### Escenarios a Verificar

#### 1. App Cerrada (Cold Start)
- ✅ Cerrar app completamente
- ✅ Ejecutar opción 22
- ✅ Notificación aparece en 2-3 segundos
- ✅ Tocar notificación → App abre directamente en ChatView

#### 2. App en Background
- ✅ Minimizar app
- ✅ Ejecutar opción 22
- ✅ Notificación aparece
- ✅ Tocar notificación → App vuelve al frente y navega a ChatView

#### 3. App en Foreground
- ✅ Mantener app abierta (en otra pantalla, no en ChatView)
- ✅ Ejecutar opción 22
- ✅ Banner de notificación aparece
- ✅ Tocar banner → Navega a ChatView

---

## 📋 Archivos Modificados

### iOS
- `/Users/daniel/AndroidStudioProjects/iOS/black-sugar-21/ui/app/black_sugar_21App.swift`
  - `func userNotificationCenter(didReceive response:)` - Línea ~558
  - `func userNotificationCenter(willPresent notification:)` - Línea ~428

### Android
- `/Users/daniel/AndroidStudioProjects/BlackSugar212/app/src/main/java/com/black/sugar21/core/firebase/MyFirebaseMessagingService.kt`
  - `override fun onMessageReceived()` - Línea ~106
  - Verificaciones de chat activo - Línea ~121
  - Llamada a showChatMessageNotification - Línea ~146

---

## 🔍 Logs de Debugging

### iOS (Xcode Console)
Buscar estos logs al tocar la notificación:
```
[🔔 Notification Tap] Es notificación de mensaje (new_message)
[🔔 Notification Tap] Action: open_chat
[🔔 Notification Tap] Screen: ChatView
[🔔 Notification Tap] NavigationPath: home/messages/chat
[🔔 Navigation] ✅ Match verificado, abriendo chat
```

### Android (Logcat con filtro FCM)
```
✅ Procesando: new_message (mensaje de chat)
🔔 Action: open_chat
🔔 Screen: ChatView
🔔 NavigationPath: home/messages/chat
📱 Llamando a showChatMessageNotification()
```

---

## ✅ Checklist de Validación

- [x] Cloud Function envía `type: "new_message"`
- [x] iOS acepta `new_message` y `chat_message`
- [x] Android acepta `new_message` y `chat_message`
- [x] iOS soporta `chatId` como alternativa a `matchId`
- [x] Android usa `chatId` como principal
- [x] Código compila sin errores
- [ ] **PENDING:** Prueba real en dispositivo iOS
- [ ] **PENDING:** Prueba real en dispositivo Android
- [ ] **PENDING:** Validar navegación completa Home → Messages → ChatView

---

## 🚀 Próximos Pasos

1. **Compilar y desplegar apps:**
   - iOS: Compilar con Xcode y probar en simulador/device
   - Android: `./gradlew assembleDebug` y instalar APK

2. **Ejecutar test-master.js opción 22:**
   - Con app cerrada
   - Con app en background
   - Con app en foreground

3. **Verificar logs en consola:**
   - iOS: Xcode Console
   - Android: Logcat (filtro: FCM)

4. **Validar navegación:**
   - Notificación debe abrir ChatView directamente
   - No debe quedarse solo en tab Messages
   - Debe mostrar el chat con el remitente correcto

---

## 📚 Referencias

- [NOTIFICATION_NAVIGATION_SPEC.md](NOTIFICATION_NAVIGATION_SPEC.md) - Especificación completa de navegación
- [NUEVA_OPCION_22.js](scripts/NUEVA_OPCION_22.js) - Guía de uso de opción 22
- [functions/index.js](functions/index.js) - Cloud Function onMessageCreated (líneas 150-280)
