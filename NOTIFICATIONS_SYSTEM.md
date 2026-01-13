# 🔔 Sistema de Notificaciones Push - BlackSugar21

## Componentes Implementados

### 1. Cloud Functions (`/functions/index.js`)

#### `onMatchCreated`
- **Trigger**: Firestore onCreate en `matches/{matchId}`
- **Funcionalidad**:
  - Detecta nuevos matches automáticamente
  - Obtiene FCM tokens de ambos usuarios
  - Envía notificación push a ambos
  - Actualiza match con flag `notificationSent`

#### `onMessageCreated`
- **Trigger**: Firestore onCreate en `messages/{messageId}`
- **Funcionalidad**:
  - Detecta nuevos mensajes en tiempo real
  - Identifica el receptor (el otro usuario del match)
  - Envía notificación con preview del mensaje
  - Marca mensaje como notificado

#### `sendTestNotification` (Callable)
- **Uso**: Testing de notificaciones
- **Parámetros**: `{userId, title, body}`
- **Funcionalidad**:
  - Envía notificación de prueba a un usuario específico
  - Útil para debugging

#### `updateFCMToken` (Callable)
- **Uso**: Actualizar token FCM desde la app
- **Parámetros**: `{userId, fcmToken}`
- **Funcionalidad**:
  - Guarda/actualiza el token FCM del usuario en Firestore
  - Debe llamarse al iniciar sesión en la app

---

## Instalación y Deployment

### 1. Instalar Dependencias

```bash
cd /Users/daniel/IdeaProjects/Public-BlackSugar21/functions
npm install
```

### 2. Desplegar Cloud Functions

```bash
# Desde el root del proyecto
cd /Users/daniel/IdeaProjects/Public-BlackSugar21

# Desplegar solo funciones
firebase deploy --only functions

# O desplegar todo
firebase deploy
```

### 3. Verificar Deployment

```bash
firebase functions:list

# Deberías ver:
# - onMatchCreated
# - onMessageCreated
# - sendTestNotification
# - updateFCMToken
```

---

## Configuración en las Apps

### Android (Kotlin)

#### 1. Obtener y guardar FCM Token

```kotlin
// En tu AuthViewModel o MainViewModel
class AuthViewModel @Inject constructor(
    private val firebaseFunctions: FirebaseFunctions
) : ViewModel() {

    fun updateFCMToken() {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (!task.isSuccessful) {
                Log.w(TAG, "Fetching FCM token failed", task.exception)
                return@addOnCompleteListener
            }

            val token = task.result
            val userId = FirebaseAuth.getInstance().currentUser?.uid ?: return@addOnCompleteListener

            // Guardar en Firestore via Cloud Function
            val data = hashMapOf(
                "userId" to userId,
                "fcmToken" to token
            )

            firebaseFunctions
                .getHttpsCallable("updateFCMToken")
                .call(data)
                .addOnSuccessListener {
                    Log.d(TAG, "FCM token updated successfully")
                }
                .addOnFailureListener { e ->
                    Log.e(TAG, "Error updating FCM token", e)
                }
        }
    }
}
```

#### 2. Llamar al iniciar sesión

```kotlin
// En tu LoginScreen o después de login exitoso
LaunchedEffect(Unit) {
    if (FirebaseAuth.getInstance().currentUser != null) {
        authViewModel.updateFCMToken()
    }
}
```

#### 3. Manejar notificaciones recibidas

```kotlin
// MyFirebaseMessagingService.kt
class MyFirebaseMessagingService : FirebaseMessagingService() {

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        Log.d(TAG, "From: ${remoteMessage.from}")

        remoteMessage.notification?.let {
            showNotification(it.title, it.body)
        }

        remoteMessage.data.let { data ->
            when (data["type"]) {
                "new_match" -> {
                    val matchId = data["matchId"]
                    // Navegar a pantalla de matches o actualizar lista
                }
                "new_message" -> {
                    val matchId = data["matchId"]
                    val messageId = data["messageId"]
                    // Actualizar chat si está abierto
                }
            }
        }
    }

    override fun onNewToken(token: String) {
        Log.d(TAG, "New FCM token: $token")
        // Actualizar token en Firestore
        // Llamar a updateFCMToken()
    }

    private fun showNotification(title: String?, body: String?) {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val notification = NotificationCompat.Builder(this, "matches")
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(R.drawable.ic_notification)
            .setAutoCancel(true)
            .build()

        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }
}
```

---

### iOS (Swift)

#### 1. Configurar FCM

```swift
// AppDelegate.swift o BlackSugar21App.swift
import Firebase
import FirebaseMessaging

@main
struct BlackSugar21App: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate
    
    init() {
        FirebaseApp.configure()
    }
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .onAppear {
                    registerForPushNotifications()
                }
        }
    }
    
    func registerForPushNotifications() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            guard granted else { return }
            
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }
}

class AppDelegate: NSObject, UIApplicationDelegate, MessagingDelegate {
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
    }
    
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {
        Messaging.messaging().delegate = self
        return true
    }
    
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken,
              let userId = Auth.auth().currentUser?.uid else { return }
        
        // Actualizar token en Firestore
        let functions = Functions.functions()
        functions.httpsCallable("updateFCMToken").call([
            "userId": userId,
            "fcmToken": token
        ]) { result, error in
            if let error = error {
                print("Error updating FCM token: \(error)")
            } else {
                print("FCM token updated successfully")
            }
        }
    }
}
```

#### 2. Manejar notificaciones

```swift
// NotificationHandler.swift
class NotificationHandler: NSObject, UNUserNotificationCenterDelegate {
    
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        // Mostrar notificación aunque la app esté en foreground
        completionHandler([.banner, .sound, .badge])
    }
    
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let userInfo = response.notification.request.content.userInfo
        
        if let type = userInfo["type"] as? String {
            switch type {
            case "new_match":
                if let matchId = userInfo["matchId"] as? String {
                    // Navegar a pantalla de matches
                    NotificationCenter.default.post(name: .navigateToMatches, object: matchId)
                }
            case "new_message":
                if let matchId = userInfo["matchId"] as? String {
                    // Navegar al chat
                    NotificationCenter.default.post(name: .navigateToChat, object: matchId)
                }
            default:
                break
            }
        }
        
        completionHandler()
    }
}
```

---

## Scripts de Testing

### 1. Enviar Notificación de Prueba

```bash
cd /Users/daniel/IdeaProjects/Public-BlackSugar21/scripts
node send-test-notification.js
```

**Pasos**:
1. Selecciona usuario (Daniel o Rosita)
2. Ingresa título y mensaje personalizados
3. La notificación se envía inmediatamente

### 2. Verificar Matches

```bash
node verify-matches.js
```

Muestra todos los matches actuales y verifica que estén correctamente creados.

---

## Troubleshooting

### No llegan notificaciones

1. **Verificar FCM token**:
```bash
# En Firestore Console
# Collection: profiles
# Document: {userId}
# Campo: fcmToken (debe existir)
```

2. **Verificar que las funciones estén deployadas**:
```bash
firebase functions:list
```

3. **Ver logs de Cloud Functions**:
```bash
firebase functions:log --only onMatchCreated
firebase functions:log --only onMessageCreated
```

4. **Probar notificación manual**:
```bash
node send-test-notification.js
```

### Token inválido o expirado

**Síntoma**: Error `messaging/invalid-registration-token`

**Solución**:
1. Cierra la app completamente
2. Abre la app de nuevo
3. Inicia sesión
4. El token se actualizará automáticamente

### Notificaciones no aparecen en foreground (iOS)

**Solución**: Implementar `willPresent` delegate:
```swift
completionHandler([.banner, .sound, .badge])
```

---

## Próximos Pasos

1. ✅ **Desplegar Cloud Functions**:
   ```bash
   firebase deploy --only functions
   ```

2. ✅ **Actualizar Apps** (Android/iOS):
   - Integrar código de FCM token
   - Llamar `updateFCMToken()` al login

3. ✅ **Testing**:
   - Crear matches de prueba
   - Verificar que lleguen notificaciones
   - Probar con `send-test-notification.js`

4. ⏳ **Producción**:
   - Configurar canales de notificación (Android)
   - Configurar badges (iOS)
   - Añadir deep linking para abrir directamente el match/chat

---

**Documentación creada**: 12 de enero de 2026  
**Estado**: Implementado ✅  
**Requiere**: Deployment de Cloud Functions + integración en apps
