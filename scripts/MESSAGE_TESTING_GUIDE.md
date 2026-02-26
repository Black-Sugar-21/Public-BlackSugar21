# 💬 Guía de Pruebas de Mensajes - BlackSugar21

## 📋 Resumen

Este documento describe cómo realizar pruebas completas del sistema de mensajería en BlackSugar21, incluyendo:
- Creación de perfiles de prueba
- Gestión de matches
- Envío de mensajes
- Verificación de orden de reordenamiento
- Diagnóstico de problemas comunes

## 🛠️ Scripts Disponibles

### 1. **test-system-unified.js** - Sistema Maestro
**Ubicación**: `/scripts/test-system-unified.js`

Sistema completo para gestión de datos de prueba.

**Funcionalidades**:
- ✅ Crear matches de prueba (1-10)
- ✅ Enviar mensajes a matches
- ✅ Crear perfiles de discovery para HomeView
- ✅ Verificar sistema completo
- ✅ Limpieza selectiva de datos

**Uso**:
```bash
cd scripts
node test-system-unified.js
```

**Menú Principal**:
```
1. Listar matches actuales
2. Crear matches de prueba (1-10)
3. Enviar mensaje a un match
4. Generar escenario completo (3-10)
5. Crear perfiles para HomeView/Swipe (5-30)
6. Verificar orden de matches
7. Verificar sistema completo
8. Limpieza selectiva (por tipo)
9. Limpieza completa (todo)
10. Cambiar usuario de prueba
```

---

### 2. **test-messages.js** - Pruebas de Mensajería (NUEVO)
**Ubicación**: `/scripts/test-messages.js`

Sistema especializado en pruebas de mensajería y reordenamiento de matches.

**Funcionalidades**:
- 💬 Listar matches con detalles de mensajes
- 📤 Enviar mensajes de prueba individuales
- 🤖 Simular conversaciones automáticas
- 🔍 Verificar orden de matches

**Uso**:
```bash
cd scripts
node test-messages.js
```

**Menú Principal**:
```
1. Listar matches actuales
2. Enviar mensaje de prueba
3. Simular conversación automática
4. Verificar orden de matches
5. Refrescar (limpiar pantalla)
6. Salir
```

**Casos de Uso**:

#### Enviar un mensaje simple:
1. Ejecutar script
2. Opción 1: Ver matches disponibles
3. Opción 2: Enviar mensaje
4. Seleccionar match
5. Escribir mensaje o presionar Enter para mensaje automático
6. Verificar en la app que el match se mueve a posición #1

#### Simular conversación:
1. Opción 3: Simular conversación
2. Seleccionar match
3. Indicar número de mensajes (1-10)
4. El script enviará mensajes automáticamente cada 2 segundos
5. Verificar en la app la conversación completa

#### Verificar orden:
1. Opción 4: Verificar orden de matches
2. El script analizará si los matches están ordenados correctamente por timestamp
3. Reportará cualquier inconsistencia

---

### 3. **fix-discovery-profiles.js** - Corrección de Perfiles
**Ubicación**: `/scripts/fix-discovery-profiles.js`

Diagnóstico y corrección de perfiles de discovery que no aparecen en HomeView.

**Problema que resuelve**:
- Los perfiles de discovery se creaban en colección `profiles`
- La Cloud Function `getCompatibleProfileIds` busca en colección `users`
- Faltan campos requeridos: `male`, `birthDate`, `orientation`, `paused`, `g` (geohash)

**Uso**:
```bash
cd scripts
node fix-discovery-profiles.js
```

**Qué hace**:
1. ✅ Verifica perfil de Daniel
2. ✅ Diagnostica perfiles en ambas colecciones
3. ✅ Migra perfiles de `profiles` a `users`
4. ✅ Completa campos faltantes
5. ✅ Genera geohash para localización

---

### 4. **verify-orientations.js** - Verificación de Orientaciones
**Ubicación**: `/scripts/verify-orientations.js`

Verifica que las orientaciones sexuales de los perfiles sean compatibles.

**Uso**:
```bash
cd scripts
node verify-orientations.js
```

**Qué hace**:
1. ✅ Verifica perfil de Daniel
2. ✅ Ajusta orientaciones de perfiles femeninos
3. ✅ Confirma compatibilidad bidireccional
4. ✅ Lista perfiles compatibles

---

## 📊 Flujo Completo de Pruebas

### Escenario 1: Probar HomeView (Swipe)

```bash
# 1. Crear perfiles de discovery
node test-system-unified.js
# Opción 5: Crear perfiles para HomeView (5-30)
# Cantidad: 10

# 2. Corregir perfiles si no aparecen
node fix-discovery-profiles.js

# 3. Verificar orientaciones
node verify-orientations.js

# 4. Abrir app
# - Ir a HomeView
# - Pull to refresh
# - Deberías ver los perfiles creados
```

### Escenario 2: Probar Sistema de Matches y Mensajes

```bash
# 1. Crear matches
node test-system-unified.js
# Opción 2: Crear matches de prueba (1-10)
# Cantidad: 5

# 2. Verificar en app
# - Abrir app
# - Ir a Matches
# - Deberías ver 5 matches nuevos

# 3. Probar reordenamiento con mensajes
node test-messages.js
# Opción 2: Enviar mensaje de prueba
# Seleccionar match #3
# Escribir mensaje
# Verificar que pase a posición #1
```

### Escenario 3: Simular Conversación Realista

```bash
# 1. Listar matches
node test-messages.js
# Opción 1: Listar matches actuales

# 2. Simular conversación
# Opción 3: Simular conversación automática
# Seleccionar match
# Cantidad de mensajes: 8

# 3. Verificar en app
# - Abrir chat del match
# - Deberías ver 8 mensajes
# - El match debería estar en posición #1
```

### Escenario 4: Verificar Orden de Matches

```bash
# 1. Enviar mensajes a diferentes matches
node test-messages.js
# Opción 2: Enviar mensaje a match #5
# Opción 2: Enviar mensaje a match #2
# Opción 2: Enviar mensaje a match #7

# 2. Verificar orden
# Opción 4: Verificar orden de matches
# Debería mostrar:
# - Match #5 en posición #1
# - Match #2 en posición #2
# - Match #7 en posición #3

# 3. Confirmar en app
# El orden en la app debe coincidir
```

---

## 🔍 Diagnóstico de Problemas Comunes

### Problema: Perfiles no aparecen en HomeView

**Síntomas**:
- Se crearon perfiles de discovery
- No aparecen en la app al hacer swipe

**Diagnóstico**:
```bash
node fix-discovery-profiles.js
```

**Causas comunes**:
1. ❌ Perfiles solo en colección `profiles`, no en `users`
2. ❌ Faltan campos requeridos (`male`, `birthDate`, `orientation`)
3. ❌ Orientación incompatible (hombre buscando hombres, pero perfiles son mujeres buscando mujeres)
4. ❌ Sin geohash (filtro geográfico)

**Solución**:
El script `fix-discovery-profiles.js` automáticamente:
- ✅ Migra perfiles a colección `users`
- ✅ Completa campos faltantes
- ✅ Genera geohash
- ✅ Configura orientaciones compatibles

---

### Problema: Matches no se reordenan al enviar mensaje

**Síntomas**:
- Se envía un mensaje
- El match no se mueve a la posición #1
- El orden parece aleatorio

**Diagnóstico**:
```bash
node test-messages.js
# Opción 4: Verificar orden de matches
```

**Causas comunes**:
1. ❌ Campo `lastMessageTimestamp` no se actualiza
2. ❌ Campo `lastMessageSeq` no incrementa
3. ❌ La app ordena por campo incorrecto

**Verificación**:
```bash
# Ver logs de Cloud Function
# Firebase Console > Functions > Logs
# Buscar: "getCompatibleProfileIds"
```

**Campos críticos en match**:
```javascript
{
  lastMessage: "Texto del último mensaje",
  lastMessageSeq: 5,  // Debe incrementar
  lastMessageTimestamp: Timestamp,  // Debe actualizarse
  timestamp: Timestamp  // También debe actualizarse
}
```

---

### Problema: Cloud Function no encuentra perfiles

**Síntomas**:
- La app muestra pantalla vacía
- Logs de Cloud Function muestran "0 candidatos"

**Diagnóstico**:
1. Verificar logs en Firebase Console
2. Buscar línea: `[getCompatibleProfileIds]`
3. Ver estadísticas de exclusión

**Verificación de filtros**:
```bash
node verify-orientations.js
```

**Filtros aplicados por Cloud Function**:
```
1. ✅ Usuario actual (excluido)
2. ✅ Usuarios bloqueados
3. ✅ Matches existentes
4. ✅ Swipes recientes (cooldown 14 días)
5. ✅ Orientación sexual (bidireccional)
6. ✅ Rango de edad (bidireccional)
7. ✅ Usuarios pausados
8. ✅ Usuarios bloqueados por moderación
9. ✅ Geohash (proximidad geográfica)
```

---

## 📱 Verificación en Apps

### iOS (Swift)
**Ubicación de logs**:
```swift
// Xcode Console
// Buscar: "[ProfileCardRepository]" o "[Cloud Function]"
```

**Flujo de carga**:
1. `HomeView` llama `ProfileCardRepository.getProfiles()`
2. Repositorio llama Cloud Function `getCompatibleProfileIds`
3. Cloud Function retorna lista de IDs
4. Repositorio obtiene datos completos con bulk query
5. Perfiles se muestran en swipe

### Android (Kotlin)
**Ubicación de logs**:
```kotlin
// Logcat en Android Studio
// Buscar: "ProfileRepository" o "UserService"
```

**Flujo de carga**:
1. `HomeViewModel.fetchProfiles()`
2. `ProfileRepository.getProfiles()`
3. Llama Cloud Function `getCompatibleProfileIds`
4. Obtiene perfiles completos
5. Actualiza UI

---

## 🧹 Limpieza de Datos de Prueba

### Limpieza Selectiva
```bash
node test-system-unified.js
# Opción 8: Limpieza selectiva

# Opciones disponibles:
# 1. Solo matches
# 2. Solo mensajes
# 3. Solo perfiles de discovery
# 4. Matches + mensajes (mantener discovery)
```

### Limpieza Completa
```bash
node test-system-unified.js
# Opción 9: Limpieza completa

# ⚠️ CUIDADO: Esto eliminará:
# - Todos los matches de prueba
# - Todos los mensajes
# - Todos los perfiles de discovery
# - Usuarios de Auth creados para pruebas
```

---

## 📊 Estructura de Datos

### Match Document
```javascript
{
  userId1: "sU8xLiwQWNXmbYdR63p1uO6TSm72",  // Daniel
  userId2: "otherUserId123",
  usersMatched: ["userId1", "userId2"],
  lastMessage: "Hola! ¿Cómo estás?",
  lastMessageSeq: 5,
  lastMessageTimestamp: Timestamp,
  timestamp: Timestamp,
  createdAt: Timestamp,
  isTest: true
}
```

### Message Document
```javascript
{
  matchId: "matchId123",
  senderId: "sU8xLiwQWNXmbYdR63p1uO6TSm72",
  text: "Hola! ¿Cómo estás?",
  timestamp: Timestamp,
  createdAt: Timestamp
}
```

### User/Profile Document (para Discovery)
```javascript
{
  name: "Isabella Lopez",
  male: false,
  birthDate: Timestamp,
  orientation: "men",
  userType: "SUGAR_BABY",
  age: 23,
  city: "Santiago",
  bio: "Amante del buen vino...",
  pictures: ["url1", "url2", ...],
  g: "66k",  // geohash
  latitude: -33.4489,
  longitude: -70.6693,
  paused: false,
  visible: true,
  blocked: false,
  minAge: 18,
  maxAge: 99,
  maxDistance: 200,
  isDiscoveryProfile: true,
  isTest: true
}
```

---

## 🔗 Referencias

### Documentación Relacionada
- `TEST_SYSTEM_UNIFIED_README.md` - Guía completa del sistema maestro
- `QUICKSTART.md` - Inicio rápido
- `SYSTEM_MAP.md` - Mapa visual del sistema
- `CLOUD_FUNCTION_GET_COMPATIBLE_PROFILES.md` - Documentación de Cloud Function

### Cloud Functions
- `getCompatibleProfileIds` - Obtener perfiles compatibles
- `getBatchCompatibilityScores` - Scores de compatibilidad
- `unmatchUser` - Deshacer match
- `deleteUserData` - Eliminar datos de usuario

---

## 💡 Tips y Mejores Prácticas

### 1. Crear Datos Realistas
```bash
# Usar el sistema maestro para escenarios completos
node test-system-unified.js
# Opción 4: Generar escenario completo (3-10)
# Esto crea matches con mensajes escalonados y timestamps realistas
```

### 2. Verificar Siempre Después de Cambios
```bash
# Después de crear/modificar datos
node test-messages.js
# Opción 4: Verificar orden de matches
```

### 3. Limpiar Entre Pruebas
```bash
# Antes de empezar nueva sesión de testing
node test-system-unified.js
# Opción 8: Limpieza selectiva
# Mantener solo lo necesario
```

### 4. Monitorear Cloud Functions
```bash
# Firebase Console > Functions > Logs
# Filtrar por: getCompatibleProfileIds
# Ver estadísticas de filtrado
```

### 5. Probar en Ambas Plataformas
```bash
# Crear datos
node test-system-unified.js

# Verificar en iOS
# Verificar en Android
# Confirmar consistencia
```

---

## 🎯 Checklist de Pruebas Completas

### HomeView / Swipe
- [ ] Crear 10 perfiles de discovery
- [ ] Verificar que aparecen en la app
- [ ] Hacer swipe left a 3 perfiles
- [ ] Hacer swipe right a 2 perfiles
- [ ] Verificar cooldown (no deberían reaparecer)
- [ ] Verificar super likes prioritarios

### Sistema de Matches
- [ ] Crear 5 matches de prueba
- [ ] Verificar que aparecen en orden correcto
- [ ] Enviar mensaje a match #3
- [ ] Verificar que pasa a posición #1
- [ ] Enviar mensaje a match #5
- [ ] Verificar nuevo orden

### Sistema de Mensajes
- [ ] Simular conversación de 5 mensajes
- [ ] Verificar que todos aparecen en la app
- [ ] Verificar timestamps correctos
- [ ] Verificar orden de mensajes
- [ ] Verificar que lastMessage se actualiza

### Limpieza
- [ ] Ejecutar limpieza selectiva
- [ ] Verificar que solo se eliminó lo solicitado
- [ ] Confirmar en Firebase Console
- [ ] Confirmar en la app

---

## 📞 Soporte

Si encuentras problemas:

1. **Revisar logs de Cloud Functions**
   - Firebase Console > Functions > Logs
   - Buscar errores específicos

2. **Ejecutar diagnóstico**
   ```bash
   node fix-discovery-profiles.js
   node verify-orientations.js
   ```

3. **Verificar estructura de datos**
   - Firebase Console > Firestore
   - Revisar colecciones: `users`, `matches`, `messages`

4. **Consultar documentación**
   - `TEST_SYSTEM_UNIFIED_README.md`
   - `CLOUD_FUNCTION_GET_COMPATIBLE_PROFILES.md`

---

**Última actualización**: 16 de enero de 2026  
**Autor**: GitHub Copilot  
**Versión**: 1.0.0
