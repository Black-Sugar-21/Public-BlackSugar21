# Sistema de Notificaciones con Localización Nativa FCM

## 🌍 Implementación Completada

El sistema ahora usa **localización nativa de Firebase Cloud Messaging**, lo que significa que:

- ✅ Las Cloud Functions solo envían **keys** de strings (no texto hardcodeado)
- ✅ Las apps móviles (iOS/Android) muestran el texto según el idioma del dispositivo
- ✅ Soporte automático para **10+ idiomas** (es, en, pt, fr, de, ru, ja, zh, ar, id)
- ✅ No requiere lógica de idiomas en el backend
- ✅ Mejor rendimiento (payload más pequeño)

## 📱 Keys de Strings Utilizadas

### Notificaciones de Match

#### Android (`strings.xml`)
```xml
<string name="notification_new_match_title">New Match!</string>
<string name="notification_new_match_body">You matched with %1$s! 💕</string>
```

#### iOS (`Localizable.strings`)
```swift
"notification-new-match-title" = "It's a match!";
"notification-new-match-body" = "You and %@ liked each other! 💕";
```

### Notificaciones de Mensajes

#### Android (`strings.xml`)
```xml
<string name="notification_new_message_title">New message from %1$s 💬</string>
```

#### iOS (`Localizable.strings`)
```swift
"notification-new-message-title" = "New message from %@";
```

## 🔧 Estructura del Payload FCM

### Match Notification

```javascript
{
  data: {
    type: 'new_match',
    matchId: '...',
    timestamp: '...'
  },
  apns: {
    payload: {
      aps: {
        sound: 'default',
        badge: 1,
        alert: {
          'title-loc-key': 'notification-new-match-title',
          'loc-key': 'notification-new-match-body',
          'loc-args': ['John'] // Nombre del otro usuario
        }
      }
    }
  },
  android: {
    notification: {
      titleLocKey: 'notification_new_match_title',
      bodyLocKey: 'notification_new_match_body',
      bodyLocArgs: ['John'], // Nombre del otro usuario
      sound: 'default',
      channelId: 'matches',
      priority: 'high'
    }
  }
}
```

### Message Notification

```javascript
{
  data: {
    type: 'new_message',
    matchId: '...',
    messageId: '...',
    senderId: '...',
    timestamp: '...',
    messagePreview: 'Hola! Cómo estás?'
  },
  apns: {
    payload: {
      aps: {
        sound: 'default',
        badge: 1,
        alert: {
          'title-loc-key': 'notification-new-message-title',
          'title-loc-args': ['María'], // Nombre del remitente
          body: 'Hola! Cómo estás?' // Texto del mensaje
        }
      }
    }
  },
  android: {
    notification: {
      titleLocKey: 'notification_new_message_title',
      titleLocArgs: ['María'], // Nombre del remitente
      body: 'Hola! Cómo estás?', // Texto del mensaje
      sound: 'default',
      channelId: 'messages',
      priority: 'high'
    }
  }
}
```

## 📂 Archivos de Recursos

### Android - Ubicaciones

```
app/src/main/res/
├── values/strings.xml           (Inglés - default)
├── values-es/strings.xml        (Español)
├── values-pt/strings.xml        (Portugués)
├── values-fr/strings.xml        (Francés)
├── values-de/strings.xml        (Alemán)
├── values-ru/strings.xml        (Ruso)
├── values-ja/strings.xml        (Japonés)
├── values-zh/strings.xml        (Chino)
├── values-ar/strings.xml        (Árabe)
└── values-in/strings.xml        (Indonesio)
```

### iOS - Ubicaciones

```
black-sugar-21/
├── en.lproj/Localizable.strings       (Inglés)
├── es.lproj/Localizable.strings       (Español)
├── pt.lproj/Localizable.strings       (Portugués)
├── fr.lproj/Localizable.strings       (Francés)
├── de.lproj/Localizable.strings       (Alemán)
├── ru.lproj/Localizable.strings       (Ruso)
├── ja.lproj/Localizable.strings       (Japonés)
├── zh-Hans.lproj/Localizable.strings  (Chino Simplificado)
├── ar.lproj/Localizable.strings       (Árabe)
└── id.lproj/Localizable.strings       (Indonesio)
```

## 🎯 Ventajas de Este Sistema

### 1. **Sin Lógica de Idiomas en el Backend**
Las Cloud Functions no necesitan saber el idioma del usuario. El dispositivo muestra automáticamente el texto correcto.

### 2. **Payload Más Pequeño**
En lugar de enviar:
```json
{
  "title": "¡Nuevo Match!",
  "body": "Tienes un match con John"
}
```

Ahora enviamos:
```json
{
  "titleLocKey": "notification_new_match_title",
  "bodyLocKey": "notification_new_match_body",
  "bodyLocArgs": ["John"]
}
```

### 3. **Fácil de Actualizar Textos**
Para cambiar el texto de una notificación, solo se edita el archivo `strings.xml` o `Localizable.strings`. No requiere redespliegue de Cloud Functions.

### 4. **Soporte Automático de Nuevos Idiomas**
Si en el futuro se agrega soporte para italiano:
1. Agregar `values-it/strings.xml` en Android
2. Agregar `it.lproj/Localizable.strings` en iOS
3. ✅ ¡Las notificaciones ya funcionarán en italiano!

### 5. **Consistencia con el Resto de la App**
Las notificaciones usan exactamente los mismos strings que el resto de la app.

## 📖 Documentación de Referencia

**Firebase Documentation:**  
https://firebase.google.com/docs/cloud-messaging/customize-messages/localize-messages

### Diferencias de Sintaxis

#### iOS (APNS)
- Usa **guiones** en las keys: `notification-new-match-title`
- Usa `title-loc-key` y `loc-key`
- Argumentos: `loc-args` y `title-loc-args`
- Formato de placeholder: `%@` o `%1$@`, `%2$@`

#### Android (FCM)
- Usa **underscores** en las keys: `notification_new_match_title`
- Usa `titleLocKey` y `bodyLocKey`
- Argumentos: `titleLocArgs` y `bodyLocArgs`
- Formato de placeholder: `%1$s`, `%2$s`

## ✅ Estado del Sistema

**Última actualización:** 13 de enero de 2026

### Cloud Functions Desplegadas
- ✅ `onMatchCreated` - Envía notificaciones de match con loc_key
- ✅ `onMessageCreated` - Envía notificaciones de mensaje con loc_key

### Testing Confirmado
```bash
Match notifications sent: 2/2
Notification sent successfully: projects/black-sugar21/messages/...
```

### Ejemplos de Notificaciones por Idioma

| Idioma | Título | Cuerpo (con John) |
|--------|--------|-------------------|
| 🇪🇸 Español | ¡Nuevo Match! | ¡Hiciste match con John! 💕 |
| 🇺🇸 Inglés | New Match! | You matched with John! 💕 |
| 🇧🇷 Portugués | Novo Match! | Você e John gostaram um do outro! 💕 |
| 🇫🇷 Francés | C'est un match ! | Vous et John vous êtes plu mutuellement ! 💕 |
| 🇩🇪 Alemán | Es ist ein Match! | Du und John habt euch gegenseitig gemocht! 💕 |

## 🔍 Debugging

### Ver Payload Completo en Logs

```bash
gcloud logging read \
  'resource.labels.service_name=onmatchcreated AND severity>=INFO' \
  --limit=10 --project=black-sugar21
```

### Verificar Strings en Apps

**Android:**
```bash
grep "notification_new_match" app/src/main/res/values-es/strings.xml
```

**iOS:**
```bash
grep "notification-new-match" black-sugar-21/es.lproj/Localizable.strings
```

## 🚨 Troubleshooting

### Problema: Notificación muestra la key en lugar del texto

**Causa:** La key no existe en el archivo de strings de ese idioma

**Solución:**
1. Verificar que la key exista en `strings.xml` o `Localizable.strings`
2. Verificar que el nombre coincida exactamente (Android: underscores, iOS: guiones)
3. Reinstalar la app para que cargue los nuevos strings

### Problema: Placeholder %@ o %1$s se muestra literal

**Causa:** Los argumentos no están llegando correctamente

**Solución:**
1. Verificar que `loc-args` o `bodyLocArgs` contenga el array correcto
2. En iOS usar `%@`, en Android usar `%1$s`

## 📝 Agregar Nuevo Tipo de Notificación

1. **Agregar strings en Android** (`values/strings.xml` y todas las traducciones):
```xml
<string name="notification_new_type_title">New Title</string>
<string name="notification_new_type_body">Body with %1$s</string>
```

2. **Agregar strings en iOS** (`en.lproj/Localizable.strings` y todas las traducciones):
```swift
"notification-new-type-title" = "New Title";
"notification-new-type-body" = "Body with %@";
```

3. **Actualizar Cloud Function**:
```javascript
apns: {
  payload: {
    aps: {
      alert: {
        'title-loc-key': 'notification-new-type-title',
        'loc-key': 'notification-new-type-body',
        'loc-args': [param1]
      }
    }
  }
},
android: {
  notification: {
    titleLocKey: 'notification_new_type_title',
    bodyLocKey: 'notification_new_type_body',
    bodyLocArgs: [param1]
  }
}
```

4. **Desplegar**:
```bash
firebase deploy --only functions
```

---

**Implementado por:** Sistema de localización nativa FCM  
**Ventajas:** Sin lógica de idiomas en backend, soporte automático 10+ idiomas, payload optimizado
