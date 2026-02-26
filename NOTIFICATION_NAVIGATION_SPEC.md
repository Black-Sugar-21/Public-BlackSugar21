# 📱 Especificación de Notificaciones - Navegación a ChatView

**Última actualización:** 18 de enero de 2026  
**Cloud Function:** `onMessageCreated` (us-central1)  
**Estado:** ✅ Desplegado y activo

---

## 🎯 Objetivo

Cuando un usuario recibe una notificación de mensaje nuevo y la toca, la app debe:
1. Abrir la app (si está cerrada)
2. Navegar a HomeView
3. Seleccionar el tab "Messages" en el TabBar
4. Abrir ChatView con el usuario que envió el mensaje

---

## 📦 Payload de la Notificación

### Estructura completa del `data` payload:

```json
{
  "type": "new_message",
  "action": "open_chat",
  "screen": "ChatView",
  "matchId": "userId1_userId2",
  "chatId": "userId1_userId2",
  "messageId": "abc123...",
  "senderId": "senderUserId",
  "senderName": "Nombre del Remitente",
  "receiverId": "receiverUserId",
  "navigationPath": "home/messages/chat",
  "timestamp": "1768780123456"
}
```

### Descripción de campos:

| Campo | Tipo | Descripción | Uso |
|-------|------|-------------|-----|
| `type` | String | Tipo de notificación: `"new_message"` | Identificar tipo de notificación |
| `action` | String | Acción a realizar: `"open_chat"` | Determinar comportamiento |
| `screen` | String | Pantalla destino: `"ChatView"` | Para deep linking |
| `matchId` | String | ID del match (formato: `userId1_userId2`) | Identificar conversación |
| `chatId` | String | Igual que matchId (redundancia legacy) | Compatibilidad |
| `messageId` | String | ID del mensaje que disparó la notificación | Opcional: marcar como leído |
| `senderId` | String | UID del usuario que envió el mensaje | Identificar remitente |
| `senderName` | String | Nombre completo del remitente | Mostrar en UI sin query |
| `receiverId` | String | UID del usuario que recibe la notificación | Validación |
| `navigationPath` | String | Ruta de navegación: `"home/messages/chat"` | Guía de navegación |
| `timestamp` | String | Timestamp en milisegundos | Ordenamiento |

---

## 📱 Implementación iOS (Swift)

### 1. AppDelegate - Manejo de notificación

```swift
// AppDelegate.swift
import UserNotifications

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        
        UNUserNotificationCenter.current().delegate = self
        return true
    }
    
    // IMPORTANTE: Manejo cuando la app está cerrada
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        
        let userInfo = response.notification.request.content.userInfo
        handleNotification(userInfo: userInfo)
        completionHandler()
    }
    
    // IMPORTANTE: Manejo cuando la app está en foreground
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        
        let userInfo = notification.request.content.userInfo
        
        // Mostrar notificación incluso en foreground
        completionHandler([.banner, .sound, .badge])
    }
    
    private func handleNotification(userInfo: [AnyHashable: Any]) {
        guard let type = userInfo["type"] as? String,
              type == "new_message",
              let action = userInfo["action"] as? String,
              action == "open_chat",
              let matchId = userInfo["matchId"] as? String,
              let senderId = userInfo["senderId"] as? String,
              let senderName = userInfo["senderName"] as? String else {
            return
        }
        
        // Enviar notificación local para que la app navegue
        NotificationCenter.default.post(
            name: NSNotification.Name("NavigateToChat"),
            object: nil,
            userInfo: [
                "matchId": matchId,
                "senderId": senderId,
                "senderName": senderName
            ]
        )
    }
}
```

### 2. ContentView - Navegación

```swift
// ContentView.swift
struct ContentView: View {
    @StateObject private var navigationManager = NavigationManager()
    
    var body: some View {
        HomeView()
            .environmentObject(navigationManager)
            .onReceive(NotificationCenter.default.publisher(for: NSNotification.Name("NavigateToChat"))) { notification in
                guard let userInfo = notification.userInfo,
                      let matchId = userInfo["matchId"] as? String,
                      let senderId = userInfo["senderId"] as? String,
                      let senderName = userInfo["senderName"] as? String else {
                    return
                }
                
                // 1. Navegar a HomeView (ya estamos ahí)
                // 2. Seleccionar tab Messages
                navigationManager.selectedTab = .messages
                
                // 3. Navegar a ChatView
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    navigationManager.navigateToChat(
                        matchId: matchId,
                        userId: senderId,
                        userName: senderName
                    )
                }
            }
    }
}
```

### 3. NavigationManager

```swift
// NavigationManager.swift
class NavigationManager: ObservableObject {
    @Published var selectedTab: TabItem = .home
    @Published var chatNavigation: ChatNavigation?
    
    enum TabItem {
        case home
        case messages
        case likes
        case profile
    }
    
    struct ChatNavigation: Identifiable {
        let id = UUID()
        let matchId: String
        let userId: String
        let userName: String
    }
    
    func navigateToChat(matchId: String, userId: String, userName: String) {
        chatNavigation = ChatNavigation(
            matchId: matchId,
            userId: userId,
            userName: userName
        )
    }
}
```

---

## 🤖 Implementación Android (Kotlin)

### 1. FirebaseMessagingService

```kotlin
// MyFirebaseMessagingService.kt
class MyFirebaseMessagingService : FirebaseMessagingService() {

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        
        val data = remoteMessage.data
        
        if (data["type"] == "new_message" && data["action"] == "open_chat") {
            val matchId = data["matchId"] ?: return
            val senderId = data["senderId"] ?: return
            val senderName = data["senderName"] ?: return
            
            // Crear notificación con PendingIntent
            showNotification(matchId, senderId, senderName)
        }
    }
    
    private fun showNotification(matchId: String, senderId: String, senderName: String) {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("type", "new_message")
            putExtra("action", "open_chat")
            putExtra("matchId", matchId)
            putExtra("senderId", senderId)
            putExtra("senderName", senderName)
        }
        
        val pendingIntent = PendingIntent.getActivity(
            this,
            matchId.hashCode(), // Unique request code per match
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        val notificationBuilder = NotificationCompat.Builder(this, "messages_channel")
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(getString(R.string.notification_new_message_title, senderName))
            .setContentText(getString(R.string.notification_new_message_body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
        
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(matchId.hashCode(), notificationBuilder.build())
    }
}
```

### 2. MainActivity - Manejo de Intent

```kotlin
// MainActivity.kt
class MainActivity : ComponentActivity() {
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        setContent {
            BlackSugar21Theme {
                MainScreen(
                    notificationData = extractNotificationData(intent)
                )
            }
        }
    }
    
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        
        // Manejar notificación cuando la app ya está abierta
        val data = extractNotificationData(intent)
        if (data != null) {
            // Enviar evento para navegación
            EventBus.send(NavigateToChat(data))
        }
    }
    
    private fun extractNotificationData(intent: Intent?): NotificationData? {
        if (intent?.getStringExtra("type") == "new_message" &&
            intent.getStringExtra("action") == "open_chat") {
            
            return NotificationData(
                matchId = intent.getStringExtra("matchId") ?: return null,
                senderId = intent.getStringExtra("senderId") ?: return null,
                senderName = intent.getStringExtra("senderName") ?: return null
            )
        }
        return null
    }
}

data class NotificationData(
    val matchId: String,
    val senderId: String,
    val senderName: String
)
```

### 3. MainScreen - Navegación con Compose

```kotlin
// MainScreen.kt
@Composable
fun MainScreen(notificationData: NotificationData?) {
    val navController = rememberNavController()
    val selectedTab = remember { mutableStateOf(Tab.HOME) }
    
    // Manejar navegación desde notificación
    LaunchedEffect(notificationData) {
        notificationData?.let { data ->
            // 1. Cambiar a tab Messages
            selectedTab.value = Tab.MESSAGES
            
            // 2. Esperar un poco para que el tab se renderice
            delay(300)
            
            // 3. Navegar a ChatView
            navController.navigate(
                "chat/${data.matchId}/${data.senderId}/${data.senderName}"
            )
        }
    }
    
    Scaffold(
        bottomBar = {
            BottomNavigationBar(
                selectedTab = selectedTab.value,
                onTabSelected = { selectedTab.value = it }
            )
        }
    ) { paddingValues ->
        NavHost(
            navController = navController,
            startDestination = when (selectedTab.value) {
                Tab.HOME -> "home"
                Tab.MESSAGES -> "messages"
                Tab.LIKES -> "likes"
                Tab.PROFILE -> "profile"
            },
            modifier = Modifier.padding(paddingValues)
        ) {
            composable("home") { HomeScreen() }
            composable("messages") { MessagesScreen(navController) }
            composable("likes") { LikesScreen() }
            composable("profile") { ProfileScreen() }
            
            composable(
                route = "chat/{matchId}/{senderId}/{senderName}",
                arguments = listOf(
                    navArgument("matchId") { type = NavType.StringType },
                    navArgument("senderId") { type = NavType.StringType },
                    navArgument("senderName") { type = NavType.StringType }
                )
            ) { backStackEntry ->
                ChatView(
                    matchId = backStackEntry.arguments?.getString("matchId") ?: "",
                    otherUserId = backStackEntry.arguments?.getString("senderId") ?: "",
                    otherUserName = backStackEntry.arguments?.getString("senderName") ?: ""
                )
            }
        }
    }
}
```

---

## 🧪 Testing

### Script para enviar mensaje a Daniel

```bash
cd /Users/daniel/IdeaProjects/Public-BlackSugar21/scripts
node send-message-to-daniel.js
```

### Flujo de prueba:

1. **App cerrada:**
   - Ejecutar el script
   - Notificación debe aparecer en 2-3 segundos
   - Tocar notificación → App abre → HomeView → Tab Messages → ChatView

2. **App en background:**
   - Ejecutar el script
   - Notificación debe aparecer
   - Tocar notificación → App regresa al frente → Navega a ChatView

3. **App en foreground:**
   - Ejecutar el script
   - Notificación debe aparecer como banner
   - Tocar notificación → Navega a ChatView

---

## 📊 Payload Completo en Logs

Para debugging, el payload completo se ve así en Firebase Logs:

```json
{
  "notification": {
    "title": "Sofía Rodríguez te ha enviado un mensaje",
    "body": "Tienes un nuevo mensaje"
  },
  "data": {
    "type": "new_message",
    "action": "open_chat",
    "screen": "ChatView",
    "matchId": "5k99GxyXnMTvSChrGaqR31Mc4mJ2_sU8xLiwQWNXmbYdR63p1uO6TSm72",
    "chatId": "5k99GxyXnMTvSChrGaqR31Mc4mJ2_sU8xLiwQWNXmbYdR63p1uO6TSm72",
    "messageId": "WxMdcvtChUaahNUVVokX",
    "senderId": "5k99GxyXnMTvSChrGaqR31Mc4mJ2",
    "senderName": "Sofía Rodríguez",
    "receiverId": "sU8xLiwQWNXmbYdR63p1uO6TSm72",
    "navigationPath": "home/messages/chat",
    "timestamp": "1768781234567"
  }
}
```

---

## ✅ Checklist de Implementación

### iOS:
- [ ] AppDelegate implementa `UNUserNotificationCenterDelegate`
- [ ] `didReceive response` maneja notificaciones cuando app cerrada
- [ ] `willPresent notification` muestra notificaciones en foreground
- [ ] NavigationManager configurado con `selectedTab` y `chatNavigation`
- [ ] ContentView escucha `NotificationCenter` para "NavigateToChat"
- [ ] Navegación funciona: Home → Tab Messages → ChatView
- [ ] Probado con app cerrada, background y foreground

### Android:
- [ ] `MyFirebaseMessagingService` extiende `FirebaseMessagingService`
- [ ] `onMessageReceived` procesa notificaciones de tipo "new_message"
- [ ] PendingIntent configurado con extras (matchId, senderId, senderName)
- [ ] MainActivity maneja `onNewIntent` para app en background
- [ ] MainScreen usa `LaunchedEffect` para navegación automática
- [ ] BottomNavigationBar cambia a tab Messages
- [ ] NavController navega a ChatView con parámetros correctos
- [ ] Probado con app cerrada, background y foreground

---

## 🔧 Troubleshooting

### Notificación no abre ChatView:
1. Verificar que el payload incluye todos los campos requeridos
2. Revisar logs: `firebase functions:log | grep "onMessageCreated"`
3. En iOS: Verificar que AppDelegate está registrado como delegate
4. En Android: Verificar que el Intent tiene los extras correctos

### Navegación incorrecta:
1. Añadir logs en cada paso de navegación
2. Verificar que selectedTab cambia correctamente
3. Verificar que el delay entre cambiar tab y navegar es suficiente (300ms)

### Notificación no llega:
1. Verificar FCM token: `node verify-notification-flow.js`
2. Verificar que el usuario tiene `fcmToken` en Firestore
3. Revisar Cloud Function logs para errores

---

**Última actualización:** 18 de enero de 2026  
**Autor:** Sistema de Notificaciones BlackSugar21  
**Versión Cloud Function:** `onmessagecreated-00007-qal`
