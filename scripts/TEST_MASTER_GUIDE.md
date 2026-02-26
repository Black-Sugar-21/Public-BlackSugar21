# 🎯 Sistema Maestro de Pruebas - Guía Completa

## 📋 Descripción

**test-master.js** es el script centralizado que integra TODAS las funcionalidades de testing de BlackSugar21 en un único menú interactivo.

## 🚀 Uso

```bash
cd scripts
node test-master.js
```

## 🎮 Funcionalidades

### 📱 1. GESTIÓN DE MATCHES

#### 1.1 Crear Matches con Notificaciones
- **Función**: Crea matches completos con notificaciones automáticas
- **Proceso**:
  1. Crea usuarios en Firebase Auth
  2. Crea documentos en `users` y `profiles` collections
  3. Crea documento de match
  4. Espera trigger de Cloud Function
  5. Verifica notificación enviada
- **Resultado**: Matches aparecen en la app + notificaciones push

#### 1.2 Verificar Matches y Notificaciones
- **Función**: Lista todos los matches de Daniel con estado de notificaciones
- **Muestra**:
  - Nombre del match
  - Último mensaje
  - Estado de notificación (✅/⚠️)
  - Si es match de prueba
  - Estadísticas generales

#### 1.3 Listar Matches Actuales
- **Función**: Lista matches ordenados por último mensaje
- **Muestra**: Nombre, mensaje, secuencia

---

### 💬 2. PRUEBAS DE MENSAJERÍA

#### 2.1 Enviar Mensaje de Prueba
- **Función**: Envía un mensaje individual a un match
- **Opciones**:
  - Mensaje manual (escribes tú)
  - Mensaje automático (generado)
- **Resultado**: 
  - Mensaje creado
  - Match reordenado a posición #1
  - Secuencia incrementada

#### 2.2 Simular Conversación Automática
- **Función**: Envía múltiples mensajes automáticos (1-10)
- **Proceso**:
  - Intervalo de 2 segundos entre mensajes
  - Mensajes predefinidos variados
  - Secuencia incrementada automáticamente
- **Uso**: Probar reordenamiento y sistema de chat

---

### 🎯 3. PERFILES DE DISCOVERY

#### 3.1 Crear Perfiles para HomeView/Swipe
- **Función**: Crea perfiles compatibles que aparezcan en el swipe
- **Cantidad**: 5-30 perfiles
- **Datos creados**:
  - Usuarios en Auth
  - Documentos en `users` (con campos requeridos)
  - Documentos en `profiles`
  - Campos críticos: `male`, `birthDate`, `orientation`, `paused`, `g` (geohash)
- **Resultado**: Perfiles disponibles para swipe en HomeView

#### 3.2 Corregir Perfiles de Discovery
- **Función**: Migra perfiles de `profiles` a `users` collection
- **Cuándo usar**:
  - Perfiles creados pero no aparecen en HomeView
  - Error "no hay perfiles compatibles"
- **Proceso**:
  - Busca perfiles con `isDiscoveryProfile: true`
  - Agrega campos faltantes
  - Crea/actualiza en `users` collection

---

### 🔍 4. DIAGNÓSTICO

#### 4.1 Verificar Sistema Completo
- **Función**: Diagnóstico general del sistema
- **Verifica**:
  1. **FCM Token de Daniel**
     - ✅ Token registrado → Notificaciones OK
     - ⚠️ Sin token → Abrir app y aceptar permisos
  
  2. **Matches**
     - Total de matches
     - Matches de prueba vs reales
     - Matches con/sin notificación
  
  3. **Perfiles de Discovery**
     - Total en `users` collection
     - Total en `profiles` collection
     - Detecta perfiles sin migrar

---

### 🧹 5. LIMPIEZA

#### 5.1 Opciones de Limpieza
1. **Solo matches de prueba**
   - Elimina matches con `isTest: true`
   
2. **Solo perfiles de discovery**
   - Elimina usuarios con `isDiscoveryProfile: true`
   - Limpia Auth, users, profiles
   
3. **Solo mensajes de prueba**
   - Elimina mensajes de matches de prueba
   
4. **Matches + mensajes (mantener discovery)**
   - Limpia matches y mensajes
   - Mantiene perfiles para nuevas pruebas
   
5. **TODO**
   - Limpieza completa
   - Vuelve al estado inicial

**⚠️ IMPORTANTE**: Requiere confirmación escribiendo "SI"

---

## 🔄 Flujo de Trabajo Típico

### Escenario 1: Testing Inicial
```bash
1. Opción 6: Crear perfiles de discovery (20-30 perfiles)
2. Opción 7: Corregir perfiles (si no aparecen)
3. Opción 1: Crear matches (5-10 matches)
4. Opción 8: Verificar sistema
5. Opción 4: Enviar mensajes de prueba
```

### Escenario 2: Testing de Mensajería
```bash
1. Opción 3: Listar matches actuales
2. Opción 5: Simular conversación (10 mensajes)
3. Verificar reordenamiento en app
4. Opción 4: Enviar mensaje a otro match
5. Verificar nuevo reordenamiento
```

### Escenario 3: Testing de Notificaciones
```bash
1. Opción 8: Verificar FCM token
2. Opción 1: Crear match (1 match)
3. Esperar 2 segundos
4. Verificar notificación en dispositivo
5. Opción 2: Confirmar estado de notificación
```

### Escenario 4: Limpieza y Reset
```bash
1. Opción 9: Limpiar datos de prueba
2. Elegir opción 4 (matches + mensajes)
3. Mantener perfiles para nuevas pruebas
4. Opción 8: Verificar estado limpio
```

---

## 📊 Datos Generados

### Usuarios de Prueba (Matches)
- **Nombres**: Isabella López, Valentina Martínez, Camila García, etc.
- **Tipos**: SUGAR_BABY, SUGAR_MOMMY
- **Edades**: 22-27 años
- **Ciudad**: Santiago
- **Orientación**: "men" (compatibles con Daniel)

### Perfiles de Discovery
- **Hombres**: Carlos, Miguel, Alejandro, Diego, etc.
- **Mujeres**: Sofia, Isabella, Valentina, etc.
- **Tipos**: Mix de SUGAR_DADDY, SUGAR_MOMMY, SUGAR_BABY
- **Ciudades**: Santiago, Valparaíso, Concepción
- **Geohash**: Zona Chile (66m, 66q, 66k)

---

## 🔧 Troubleshooting

### ❌ "No aparecen matches en la app"
**Solución**:
1. Verificar Firestore listeners activos
2. Cerrar y reabrir app
3. Verificar en Firebase Console que existen los matches
4. Revisar logs de app

### ❌ "No llegan notificaciones"
**Solución**:
1. Opción 8: Verificar FCM token de Daniel
2. Si no hay token: Abrir app → Aceptar permisos
3. Crear nuevo match de prueba
4. Verificar Cloud Function logs en Firebase Console

### ❌ "Perfiles no aparecen en HomeView"
**Solución**:
1. Opción 8: Verificar diagnóstico
2. Si hay perfiles sin migrar: Opción 7
3. Verificar que tengan campos: `male`, `orientation`, `g`, `paused`
4. Verificar orientación bidireccional compatible

### ❌ "Mensajes no reordenan matches"
**Solución**:
1. Verificar campo `lastMessageTimestamp` actualizado
2. Verificar que app ordene por `lastMessageTimestamp` DESC
3. Revisar logs de Firestore en app
4. Probar con múltiples mensajes (opción 5)

---

## 📝 Campos Críticos

### Match Document
```javascript
{
  userId1: string,
  userId2: string,
  usersMatched: [string, string],
  timestamp: Timestamp,
  lastMessage: string,
  lastMessageSeq: number,
  lastMessageTimestamp: Timestamp,
  notificationSent: boolean,  // Agregado por Cloud Function
  isTest: boolean
}
```

### User Document (Discovery)
```javascript
{
  name: string,
  male: boolean,              // CRÍTICO para filtrado
  birthDate: Timestamp,       // CRÍTICO para edad
  orientation: string,        // CRÍTICO para compatibilidad
  userType: string,
  city: string,
  g: string,                  // CRÍTICO para geohash
  latitude: number,
  longitude: number,
  minAge: number,
  maxAge: number,
  maxDistance: number,
  paused: boolean,            // CRÍTICO para filtrado
  visible: boolean,
  blocked: boolean,
  isDiscoveryProfile: boolean,
  isTest: boolean
}
```

---

## 🎯 Comandos Rápidos

```bash
# Ejecutar script maestro
node test-master.js

# Ver logs en tiempo real (en otra terminal)
cd /Users/daniel/AndroidStudioProjects/iOS/functions
firebase functions:log --only onMatchCreated,onMessageCreated

# Verificar matches en Firebase Console
# https://console.firebase.google.com/u/0/project/blacksugar-a40e6/firestore/data/~2Fmatches

# Verificar notificaciones pendientes
# https://console.firebase.google.com/u/0/project/blacksugar-a40e6/firestore/data/~2FpendingNotifications
```

---

## 📚 Scripts Legacy Reemplazados

Este script maestro **REEMPLAZA** los siguientes scripts individuales:

✅ `create-match-with-notification.js`
✅ `verify-matches-and-notifications.js`
✅ `test-messages.js`
✅ `fix-discovery-profiles.js`
✅ `verify-orientations.js`

**Ventaja**: Todo centralizado en un menú interactivo con mejor UX.

---

## 🎨 Código de Colores

- 🔵 **Cyan**: Títulos y categorías
- 🟢 **Green**: Operaciones exitosas
- 🟡 **Yellow**: Advertencias y procesos
- 🔴 **Red**: Errores
- ⚪ **Bright**: Datos importantes
- ⚫ **Reset**: Texto normal

---

## 📞 Soporte

- **Autor**: GitHub Copilot
- **Versión**: 1.0.0
- **Fecha**: 16 de enero de 2026

---

## 🚀 Próximos Pasos

1. **Ejecutar** el script: `node test-master.js`
2. **Crear perfiles** de discovery (opción 6)
3. **Crear matches** con notificaciones (opción 1)
4. **Verificar** en la app que todo funciona
5. **Probar mensajería** (opciones 4 y 5)
6. **Diagnosticar** si hay problemas (opción 8)
7. **Limpiar** cuando termines (opción 9)

**¡Sistema completo de testing en un solo script! 🎉**
