# Guía: Solución de Carga de Imágenes en Matches

## Problema
Las imágenes de los matches no se cargan en el listado porque:
1. Firebase Storage bucket no existe (`black-sugar21.appspot.com`)
2. Las apps pueden estar bloqueando conexiones HTTP externas (RandomUser.me)

## Solución 1: Configurar Apps para Cargar URLs Externas

### iOS - Info.plist

Agrega el siguiente código en `black-sugar-21/Info.plist`:

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
    <!-- O de forma más segura, solo para randomuser.me -->
    <key>NSExceptionDomains</key>
    <dict>
        <key>randomuser.me</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
            <key>NSIncludesSubdomains</key>
            <true/>
        </dict>
    </dict>
</dict>
```

### Android - AndroidManifest.xml

Verifica que esté presente en `app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<application
    ...
    android:usesCleartextTraffic="true"
    >
```

## Solución 2: Verificar Código de Carga de Imágenes

### iOS - MatchItemView.swift o similar

```swift
import SDWebImageSwiftUI

struct MatchItemView: View {
    let match: Match
    let otherUser: User
    
    var body: some View {
        HStack {
            // Cargar imagen desde avatarUrl
            WebImage(url: URL(string: otherUser.avatarUrl ?? ""))
                .resizable()
                .indicator(.activity)
                .transition(.fade(duration: 0.5))
                .scaledToFill()
                .frame(width: 60, height: 60)
                .clipShape(Circle())
            
            // O con AsyncImage nativo
            AsyncImage(url: URL(string: otherUser.avatarUrl ?? "")) { phase in
                switch phase {
                case .success(let image):
                    image.resizable()
                        .scaledToFill()
                        .frame(width: 60, height: 60)
                        .clipShape(Circle())
                case .failure:
                    Image(systemName: "person.circle.fill")
                        .resizable()
                        .frame(width: 60, height: 60)
                        .foregroundColor(.gray)
                case .empty:
                    ProgressView()
                        .frame(width: 60, height: 60)
                @unknown default:
                    EmptyView()
                }
            }
            
            VStack(alignment: .leading) {
                Text(otherUser.name)
                    .font(.headline)
                if let lastMessage = match.lastMessage {
                    Text(lastMessage)
                        .font(.subheadline)
                        .foregroundColor(.gray)
                        .lineLimit(1)
                }
            }
            
            Spacer()
        }
    }
}
```

### Android - MatchItem Composable

```kotlin
import coil.compose.AsyncImage
import coil.request.ImageRequest

@Composable
fun MatchItem(
    match: Match,
    otherUser: User,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.fillMaxWidth().padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Cargar imagen desde avatarUrl
        AsyncImage(
            model = ImageRequest.Builder(LocalContext.current)
                .data(otherUser.avatarUrl)
                .crossfade(true)
                .build(),
            contentDescription = "Avatar de ${otherUser.name}",
            modifier = Modifier
                .size(60.dp)
                .clip(CircleShape),
            contentScale = ContentScale.Crop,
            placeholder = painterResource(id = R.drawable.placeholder_avatar),
            error = painterResource(id = R.drawable.placeholder_avatar)
        )
        
        Spacer(modifier = Modifier.width(12.dp))
        
        Column {
            Text(
                text = otherUser.name,
                style = MaterialTheme.typography.titleMedium
            )
            
            match.lastMessage?.let { message ->
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}
```

## Solución 3: Verificar Model de Usuario

Asegúrate de que el modelo `User` incluya el campo `avatarUrl`:

### iOS - User.swift
```swift
struct User: Codable, Identifiable {
    var id: String { userId }
    let userId: String
    let name: String
    let email: String?
    let avatarUrl: String?  // ✅ Campo para URL del avatar
    let pictureUrls: [String]?  // Para múltiples fotos
    // ... otros campos
}
```

### Android - User.kt
```kotlin
data class User(
    val userId: String = "",
    val name: String = "",
    val email: String? = null,
    val avatarUrl: String? = null,  // ✅ Campo para URL del avatar
    val pictureUrls: List<String>? = null,  // Para múltiples fotos
    // ... otros campos
)
```

## Verificación en Firestore

Los usuarios de prueba tienen esta estructura:

```json
{
  "userId": "QSHOqXQk...",
  "name": "TEST - Sofia Martinez",
  "email": "test1@bstest.com",
  "avatarUrl": "https://randomuser.me/api/portraits/men/2.jpg",
  "male": true,
  "userType": "SUGAR_BABY",
  "isTestUser": true,
  ...
}
```

## Testing

1. **Verificar en Firebase Console**:
   - Ve a Firestore Database
   - Colección `users`
   - Busca usuarios con `isTestUser = true`
   - Verifica que tengan campo `avatarUrl` con URL de RandomUser.me

2. **Test en apps**:
   - Login con: dverdugo85@gmail.com
   - Ve a Matches
   - Deberías ver 20 matches con avatares

3. **Debug**:
   - iOS: Ver console en Xcode para errores de red
   - Android: `adb logcat | grep -i "coil\|image\|url"`
   - Verificar que las URLs sean accesibles en navegador

## URLs de Avatares Actuales

Los usuarios de prueba usan estas URLs:
- Hombres: `https://randomuser.me/api/portraits/men/[2-42].jpg`
- Mujeres: `https://randomuser.me/api/portraits/women/[1-37].jpg`

Puedes probar en navegador: https://randomuser.me/api/portraits/men/2.jpg

## Comandos Útiles

```bash
# Verificar datos en Firebase
cd ~/IdeaProjects/Public-BlackSugar21/scripts
node check-user-matches.js sU8xLiwQWNXmbYdR63p1uO6TSm72

# Recrear datos de prueba
echo "y" | node cleanup-test-matches.js
node populate-test-matches.js

# Ver logs en Android
adb logcat | grep -E "Coil|AsyncImage|Match"

# Ver logs en iOS simulator
xcrun simctl spawn booted log stream --level debug | grep -i image
```

## Solución Alternativa: Firebase Storage

Si prefieres usar Firebase Storage (recomendado para producción):

1. **Activar Firebase Storage**:
   - Ve a Firebase Console
   - Storage > Get Started
   - Selecciona región y crea bucket

2. **Actualizar script**: El script ya tiene el código preparado, solo necesitas que exista el bucket

3. **Ejecutar**: `node populate-test-matches.js`

---

**Fecha**: 9 de enero de 2026
**Usuario Principal**: sU8xLiwQWNXmbYdR63p1uO6TSm72 (dverdugo85@gmail.com)
**Matches Creados**: 20
