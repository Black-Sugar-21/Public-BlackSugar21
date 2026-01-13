# Sistema de Notificaciones Multiidioma

## 🌍 Idiomas Soportados

El sistema de notificaciones ahora soporta **3 idiomas**:
- **Español (es)** - Idioma por defecto
- **Inglés (en)**
- **Portugués (pt)**

## 📱 Configuración en Apps

### Campo en Firestore (Collection: `users`)

Las apps móviles deben guardar el idioma del usuario en uno de estos campos:
```javascript
{
  userId: "...",
  name: "...",
  fcmToken: "...",
  language: "es", // ← Preferido
  locale: "en",   // ← Alternativo (si language no existe)
  // ... otros campos
}
```

### Valores Permitidos

- `"es"` → Notificaciones en español
- `"en"` → Notificaciones en inglés  
- `"pt"` → Notificaciones en portugués

Si no hay campo `language` ni `locale`, se usa **español por defecto**.

## 💬 Textos de Notificaciones

### 1. Notificaciones de Match

| Idioma | Título | Cuerpo |
|--------|--------|--------|
| Español | 💘 ¡Nuevo Match! | Tienes un match con {nombre} |
| Inglés | 💘 New Match! | You have a match with {nombre} |
| Portugués | 💘 Novo Match! | Você tem um match com {nombre} |

### 2. Notificaciones de Mensajes

| Idioma | Título | Cuerpo |
|--------|--------|--------|
| Todos | {nombre del remitente} | {texto del mensaje} |

**Nota**: Los mensajes se muestran en el idioma original del remitente, solo cambia el formato de la notificación.

## 🔧 Implementación Técnica

### Cloud Functions (`functions/index.js`)

#### Función: `getLocalizedTexts(language, type, params)`

```javascript
const localizedText = getLocalizedTexts('en', 'match', {
  otherUserName: 'María'
});
// → { title: '💘 New Match!', body: 'You have a match with María' }
```

**Parámetros:**
- `language`: Código del idioma (`"es"`, `"en"`, `"pt"`)
- `type`: Tipo de notificación (`"match"` o `"message"`)
- `params`: Objeto con variables para interpolar
  - Para match: `{otherUserName: string}`
  - Para mensaje: `{senderName: string, messagePreview: string}`

#### onMatchCreated - Flujo

1. Se crea un nuevo match en Firestore
2. Cloud Function obtiene datos de ambos usuarios
3. Lee el campo `language` o `locale` de cada usuario
4. Genera notificación localizada para cada uno según su idioma
5. Envía 2 notificaciones FCM (una por usuario, cada una en su idioma)

```javascript
// Usuario 1: español
Notificación → "💘 ¡Nuevo Match!" con "Tienes un match con John"

// Usuario 2: inglés  
Notificación → "💘 New Match!" con "You have a match with María"
```

#### onMessageCreated - Flujo

1. Se crea un nuevo mensaje en Firestore
2. Cloud Function identifica el receptor
3. Lee el `language` o `locale` del receptor
4. Genera notificación con el nombre del remitente y preview del mensaje
5. Envía 1 notificación FCM al receptor

## 📲 Integración en Apps Móviles

### Android (Kotlin)

```kotlin
// Al iniciar sesión o cambiar idioma
val userLanguage = when (Locale.getDefault().language) {
    "es" -> "es"
    "en" -> "en"
    "pt" -> "pt"
    else -> "es"
}

firestore.collection("users").document(userId)
    .update("language", userLanguage)
```

### iOS (Swift)

```swift
// Al iniciar sesión o cambiar idioma
let userLanguage = Locale.current.languageCode ?? "es"
let validLanguage = ["es", "en", "pt"].contains(userLanguage) ? userLanguage : "es"

db.collection("users").document(userId)
    .updateData(["language": validLanguage])
```

### Web (TypeScript/Angular)

```typescript
// Al iniciar sesión o cambiar idioma
const userLanguage = navigator.language.split('-')[0]; // 'en-US' → 'en'
const validLanguage = ['es', 'en', 'pt'].includes(userLanguage) ? userLanguage : 'es';

await this.firestore.collection('users').doc(userId).update({
  language: validLanguage
});
```

## ✅ Testing

### Script de Prueba

```bash
cd /Users/daniel/IdeaProjects/Public-BlackSugar21/scripts
node check-user-languages.js  # Ver idiomas configurados
node test-notification-complete.js  # Enviar notificación de prueba
```

### Cambiar Idioma de Usuario (Pruebas)

```javascript
// En Firebase Console o script
await admin.firestore().collection('users').doc(userId).update({
  language: 'en'  // o 'pt'
});
```

## 🚀 Deployment

Las Cloud Functions con soporte multiidioma ya están desplegadas:

```bash
firebase deploy --only functions:onMatchCreated,functions:onMessageCreated
```

**Estado actual:** ✅ Desplegado y funcionando

## 📊 Monitoreo

### Verificar Logs

```bash
# Ver notificaciones enviadas
gcloud logging read \
  'resource.labels.service_name=onmatchcreated AND severity>=INFO' \
  --limit=20 --project=black-sugar21

# Ver errores
gcloud logging read \
  'resource.labels.service_name=onmatchcreated AND severity>=ERROR' \
  --limit=20 --project=black-sugar21
```

### Campos de Tracking en Firestore

Cada documento de `matches` tiene:
```javascript
{
  notificationSent: true,
  notificationSentAt: Timestamp,
  notificationAttemptedAt: Timestamp, // Si hubo error
  notificationSkipReason: string      // Razón si se saltó
}
```

## 🔄 Agregar Nuevos Idiomas

1. Editar `functions/index.js`
2. Agregar traducciones en `getLocalizedTexts`:

```javascript
const translations = {
  match: {
    // ... idiomas existentes
    fr: {  // Francés
      title: '💘 Nouveau Match!',
      body: `Vous avez un match avec ${params.otherUserName}`,
    },
  },
  message: {
    // ... igual para mensajes
  },
};
```

3. Actualizar validación de idiomas:
```javascript
const lang = ['es', 'en', 'pt', 'fr'].includes(language) ? language : 'es';
```

4. Redesplegar:
```bash
firebase deploy --only functions
```

## 📝 Notas Importantes

- ✅ El sistema usa el idioma **del receptor**, no del remitente
- ✅ Cada usuario recibe notificaciones en su propio idioma
- ✅ Si no hay idioma configurado, se usa español por defecto
- ✅ Los emojis (💘) funcionan en todos los idiomas
- ✅ El sistema es retrocompatible (usuarios sin `language` usan español)

## 🐛 Troubleshooting

### Problema: Notificaciones llegan en español cuando deberían estar en otro idioma

**Solución:**
1. Verificar que el usuario tenga el campo `language` o `locale` en Firestore
2. Ejecutar: `node check-user-languages.js` para ver la configuración actual
3. Actualizar el campo manualmente si es necesario

### Problema: Apps no guardan el idioma

**Causa:** Las apps móviles no están actualizando el campo `language` en Firestore

**Solución:** Implementar la lógica de detección de idioma mostrada arriba en cada plataforma

---

**Última actualización:** 13 de enero de 2026
**Version:** 2.0 con soporte multiidioma
