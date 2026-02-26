# 👥 Selección de Usuario - test-master.js

## ✅ Implementación Completada

El script maestro ahora soporta seleccionar entre **Daniel** o **Rosita** para ejecutar las pruebas.

---

## 🎯 Características

### Selección al Inicio
Al ejecutar `node test-master.js`, el script muestra:

```
🚀 Iniciando Sistema Maestro de Pruebas...

👥 SELECCIONAR USUARIO
══════════════════════════════════════════════════════════════════════

1. 👨 Daniel (dverdugo85@gmail.com)
   🆔 UID: sU8xLiwQWNXmbYdR63p1uO6TSm72

2. 👩 Rosita (ro.es4075@gmail.com)
   🆔 UID: DsDSK5xqEZZXAIKxtIKyBGntw8f2

👉 Selecciona usuario (1-2):
```

### Usuario Activo en el Menú
El menú principal muestra el usuario activo con su icono:

```
🎯 SISTEMA MAESTRO DE PRUEBAS - BlackSugar21
══════════════════════════════════════════════════════════════════════
Usuario activo: 👨 Daniel (dverdugo85@gmail.com)
══════════════════════════════════════════════════════════════════════
```

### Cambiar Usuario Durante la Sesión
Nueva opción en el menú:

```
⚙️  OTRAS OPCIONES
  10. 👥 Cambiar usuario (Daniel/Rosita)
  11. 🔄 Refrescar pantalla
  12. 🚪 Salir
```

---

## 🔄 Funciones Actualizadas

Todas las funciones ahora usan `CURRENT_USER` en lugar de `DANIEL`:

### 1. `createMatchesWithNotifications()`
- ✅ Crea matches con el usuario seleccionado
- ✅ Verifica FCM token del usuario activo
- ✅ Los matches aparecen en la app del usuario seleccionado

### 2. `verifyMatchesAndNotifications()`
- ✅ Verifica matches del usuario activo
- ✅ Muestra notificaciones enviadas al usuario seleccionado

### 3. `listMatches()`
- ✅ Lista matches del usuario activo
- ✅ Muestra con quién tiene matches

### 4. `sendTestMessage()`
- ✅ Envía mensajes desde el usuario activo
- ✅ El remitente es el usuario seleccionado

### 5. `simulateConversation()`
- ✅ Simula conversaciones desde el usuario activo
- ✅ Los mensajes se envían como el usuario seleccionado

### 6. `verifySystem()`
- ✅ Verifica FCM token del usuario activo
- ✅ Cuenta matches del usuario seleccionado

---

## 👥 Usuarios Disponibles

### 👨 Daniel
```javascript
{
  email: 'dverdugo85@gmail.com',
  uid: 'sU8xLiwQWNXmbYdR63p1uO6TSm72',
  name: 'Daniel',
  icon: '👨'
}
```

**Perfil:**
- Género: Masculino
- Tipo: SUGAR_DADDY
- Orientación: Mujeres

### 👩 Rosita
```javascript
{
  email: 'ro.es4075@gmail.com',
  uid: 'DsDSK5xqEZZXAIKxtIKyBGntw8f2',
  name: 'Rosita',
  icon: '👩'
}
```

**Perfil:**
- Género: Femenino
- Tipo: SUGAR_BABY
- Orientación: Hombres

---

## 💡 Casos de Uso

### Caso 1: Probar Notificaciones de Daniel
```bash
node test-master.js
# Seleccionar: 1 (Daniel)
# Opción: 1 (Crear matches)
# → Crea matches para Daniel
# → Daniel recibe notificaciones en su dispositivo
```

### Caso 2: Probar Notificaciones de Rosita
```bash
node test-master.js
# Seleccionar: 2 (Rosita)
# Opción: 1 (Crear matches)
# → Crea matches para Rosita
# → Rosita recibe notificaciones en su dispositivo
```

### Caso 3: Simular Conversación desde Rosita
```bash
node test-master.js
# Seleccionar: 2 (Rosita)
# Opción: 5 (Simular conversación)
# → Rosita envía mensajes automáticos
# → El otro usuario recibe mensajes de Rosita
```

### Caso 4: Cambiar de Usuario Durante la Sesión
```bash
node test-master.js
# Seleccionar: 1 (Daniel)
# ... hacer pruebas con Daniel ...
# Opción: 10 (Cambiar usuario)
# Seleccionar: 2 (Rosita)
# ... ahora las pruebas usan Rosita ...
```

---

## 🔍 Validación

### Verificar Usuario Activo
El usuario activo se muestra en:
1. **Menú principal**: Parte superior con icono
2. **Mensajes de log**: "Verificando FCM token de [nombre]..."
3. **Creación de matches**: Match se crea con el UID del usuario activo

### Verificar Cambio de Usuario
```bash
# Antes del cambio
Usuario activo: 👨 Daniel (dverdugo85@gmail.com)

# Después de seleccionar opción 10 y elegir Rosita
Usuario activo: 👩 Rosita (ro.es4075@gmail.com)
```

---

## 📊 Impacto en las Pruebas

### Antes (Solo Daniel)
```javascript
// Usuario fijo
const DANIEL = {
  email: 'dverdugo85@gmail.com',
  uid: 'sU8xLiwQWNXmbYdR63p1uO6TSm72',
  name: 'Daniel'
};

// Todas las funciones usaban DANIEL.uid
await db.collection('matches')
  .where('usersMatched', 'array-contains', DANIEL.uid)
```

### Después (Daniel o Rosita)
```javascript
// Usuarios disponibles
const USERS = {
  DANIEL: { ... },
  ROSITA: { ... }
};

// Usuario activo (configurable)
let CURRENT_USER = USERS.DANIEL; // o USERS.ROSITA

// Todas las funciones usan CURRENT_USER
await db.collection('matches')
  .where('usersMatched', 'array-contains', CURRENT_USER.uid)
```

---

## 🎯 Beneficios

1. **Flexibilidad**: Probar desde diferentes usuarios sin cambiar código
2. **Cobertura**: Validar comportamiento para ambos géneros y tipos de usuario
3. **Notificaciones**: Probar FCM en dispositivos de Daniel y Rosita
4. **Mensajería**: Simular conversaciones desde cualquier usuario
5. **Matches**: Crear matches para cualquier usuario
6. **Debugging**: Ver cómo aparecen los datos en diferentes perfiles

---

## 🚨 Consideraciones

### FCM Tokens
- Asegurar que ambos usuarios tienen FCM token registrado
- Verificar con opción 8 (Verificar sistema completo)

### Matches Existentes
- Los matches se crean con el usuario activo
- Cambiar de usuario no afecta matches ya creados
- Para ver matches de un usuario específico, seleccionarlo primero

### Limpieza de Datos
- La limpieza (opción 9) afecta a TODOS los usuarios de prueba
- No discrimina por usuario activo
- Elimina matches con `isTest: true` de cualquier usuario

---

## 📚 Referencias

**Código:**
- [test-master.js](test-master.js) - Script maestro con selección de usuario
- Línea 49-66: Definición de usuarios (USERS.DANIEL y USERS.ROSITA)
- Línea 107-138: Función selectUser()
- Línea 857: Usuario activo en menú

**Scripts Similares:**
- [send-test-notification.js](send-test-notification.js) - Implementación original de selección
- [test-real-notification.js](test-real-notification.js) - Match entre Daniel y Rosita

**Documentación:**
- [README_TESTING.md](README_TESTING.md) - Guía general del sistema de testing
- [TEST_MASTER_GUIDE.md](TEST_MASTER_GUIDE.md) - Guía técnica completa
