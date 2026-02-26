# 🔥 Campos Críticos para Matches - iOS

## ⚠️ IMPORTANTE: Filtros de iOS

iOS filtra automáticamente los matches según el estado del usuario. Si alguno de estos campos tiene un valor incorrecto, **el match NO aparecerá** en la lista de matches.

### Código iOS (FirestoreRemoteDataSource.swift, líneas 1373-1430)

```swift
// VALIDACIÓN CRÍTICA: Verificar estado del usuario
if let paused = user.paused, paused == true {
    return nil // Ocultar temporalmente
}

if let blocked = user.blocked, blocked == true {
    // Eliminar match permanentemente
    try await self.db.collection("matches").document(match.id).delete()
    return nil
}

if let accountStatus = user.accountStatus, accountStatus != "active" {
    // Eliminar match permanentemente
    try await self.db.collection("matches").document(match.id).delete()
    return nil
}
```

---

## 📋 Campos Críticos (OBLIGATORIOS)

### 1. `accountStatus: 'active'` 🔥 CRÍTICO

**Comportamiento iOS:**
- ✅ Si `accountStatus === "active"` → Match se muestra normalmente
- ❌ Si `accountStatus !== "active"` → iOS **ELIMINA** el match permanentemente
- ❌ Si `accountStatus === undefined` → iOS **ELIMINA** el match permanentemente

**Uso en test-master.js:**
```javascript
await db.collection('users').doc(userId).set({
  // ... otros campos
  accountStatus: 'active', // 🔥 CRÍTICO para iOS: debe ser "active"
});
```

**Ubicaciones en test-master.js:**
- ✅ Línea 181: `createMatchesWithNotifications()`
- ✅ Línea 554: `createDiscoveryProfiles()`
- ✅ Línea 637: `fixDiscoveryProfiles()`

---

### 2. `paused: false` ⚠️ OCULTA TEMPORALMENTE

**Comportamiento iOS:**
- ✅ Si `paused === false` → Match se muestra normalmente
- ⚠️ Si `paused === true` → iOS **OCULTA** el match (NO lo elimina)
- ⚠️ Si `paused === undefined` → Puede causar problemas

**Uso en test-master.js:**
```javascript
await db.collection('users').doc(userId).set({
  // ... otros campos
  paused: false,
});
```

**Caso de uso:**
- Usuario pausó temporalmente su cuenta
- Match no se muestra, pero se puede recuperar si el usuario reactiva su cuenta

---

### 3. `blocked: false` ❌ ELIMINA PERMANENTEMENTE

**Comportamiento iOS:**
- ✅ Si `blocked === false` → Match se muestra normalmente
- ❌ Si `blocked === true` → iOS **ELIMINA** el match permanentemente
- ⚠️ Si `blocked === undefined` → Puede causar problemas

**Uso en test-master.js:**
```javascript
await db.collection('users').doc(userId).set({
  // ... otros campos
  blocked: false,
});
```

**Caso de uso:**
- Usuario bloqueado por violación de términos
- Match se elimina automáticamente y no se puede recuperar

---

### 4. `visible: true` ℹ️ VISIBILIDAD GENERAL

**Comportamiento:**
- ✅ Si `visible === true` → Usuario visible en la app
- ⚠️ Si `visible === false` → Usuario oculto en la app

**Uso en test-master.js:**
```javascript
await db.collection('users').doc(userId).set({
  // ... otros campos
  visible: true,
});
```

---

## 🎯 Implementación en test-master.js

### Función 1: `createMatchesWithNotifications()` (líneas 140-240)

**Propósito:** Crear matches con notificaciones automáticas

**Campos configurados:**
```javascript
await db.collection('users').doc(userId).set({
  name: fullName,
  email: email,
  male: false,
  birthDate: admin.firestore.Timestamp.fromDate(birthDate),
  orientation: 'men',
  userType: user.type,
  city: 'Santiago',
  g: generateChileGeohash(),
  latitude: -33.4489,
  longitude: -70.6693,
  minAge: 18,
  maxAge: 99,
  maxDistance: 200,
  paused: false,           // ✅ Usuario activo
  visible: true,           // ✅ Usuario visible
  blocked: false,          // ✅ Usuario NO bloqueado
  accountStatus: 'active', // 🔥 CRÍTICO para iOS
  isTest: true,
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
});
```

---

### Función 2: `createDiscoveryProfiles()` (líneas 490-580)

**Propósito:** Crear perfiles para HomeView/Swipe

**Campos configurados:**
```javascript
await db.collection('users').doc(userId).set({
  name: fullName,
  male: isMale,
  birthDate: admin.firestore.Timestamp.fromDate(birthDate),
  orientation: isMale ? 'women' : 'men',
  userType: userType,
  age: age,
  city: ['Santiago', 'Valparaíso', 'Concepción'][i % 3],
  g: generateChileGeohash(),
  latitude: -33.4489,
  longitude: -70.6693,
  minAge: 18,
  maxAge: 99,
  maxDistance: 200,
  paused: false,           // ✅ Usuario activo
  visible: true,           // ✅ Usuario visible
  blocked: false,          // ✅ Usuario NO bloqueado
  accountStatus: 'active', // 🔥 CRÍTICO para iOS
  isDiscoveryProfile: true,
  isTest: true,
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
});
```

---

### Función 3: `fixDiscoveryProfiles()` (líneas 583-660)

**Propósito:** Corregir perfiles existentes (migrar a collection users)

**Campos configurados:**
```javascript
await db.collection('users').doc(userId).set({
  name: profileData.name || 'Sin nombre',
  male: profileData.gender === 'male',
  birthDate: admin.firestore.Timestamp.fromDate(birthDate),
  orientation: orientation,
  userType: profileData.userType || 'SUGAR_BABY',
  city: profileData.city || 'Santiago',
  g: generateChileGeohash(),
  latitude: -33.4489,
  longitude: -70.6693,
  minAge: 18,
  maxAge: 99,
  maxDistance: 200,
  paused: false,           // ✅ Usuario activo
  visible: true,           // ✅ Usuario visible
  blocked: false,          // ✅ Usuario NO bloqueado
  accountStatus: 'active', // 🔥 CRÍTICO para iOS
  isDiscoveryProfile: true,
  isTest: true,
  createdAt: profileData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
}, { merge: true });
```

---

## ✅ Validación Automática

### Script: `validate-test-users.js`

**Propósito:** Verificar que todos los usuarios de prueba tengan los campos correctos

**Uso:**
```bash
cd scripts
node validate-test-users.js
```

**Funcionalidades:**
1. ✅ Encuentra todos los usuarios de prueba (`isTest: true`)
2. 🔍 Verifica campos críticos: `accountStatus`, `paused`, `blocked`, `visible`
3. 📊 Muestra usuarios con problemas
4. 🔧 Ofrece corrección automática
5. ✅ Aplica valores correctos si el usuario confirma

**Output:**
```
✅ VALIDACIÓN DE USUARIOS DE PRUEBA
══════════════════════════════════════════════════════════════════════

🔍 Buscando usuarios de prueba...

📦 Encontrados 31 usuarios de prueba

📊 RESULTADOS DE VALIDACIÓN:

✅ 31 usuarios OK (todos los campos correctos)

🎉 ¡Todos los usuarios tienen los campos correctos!
   Los matches deberían aparecer en iOS sin problemas
```

---

## 🔧 Corrección de Usuarios Existentes

### Script: `fix-account-status.js`

**Propósito:** Agregar `accountStatus: 'active'` a usuarios existentes que no lo tienen

**Uso:**
```bash
cd scripts
node fix-account-status.js
```

**Resultado:**
```
✅ Usuarios actualizados: 31
⏭️  Usuarios ya tenían el campo: 0
📱 Total procesados: 31
💡 Ahora cierra y reabre la app iOS para ver los matches
```

---

## 🚨 Troubleshooting

### Problema: Matches no aparecen en iOS

**Diagnóstico:**
1. Verificar campos del usuario:
   ```bash
   cd scripts
   node check-user-fields.js
   ```

2. Verificar matches en Firestore:
   ```bash
   cd scripts
   node diagnose-ios-matches.js
   ```

3. Validar todos los usuarios de prueba:
   ```bash
   cd scripts
   node validate-test-users.js
   ```

**Soluciones:**

| Problema | Causa | Solución |
|----------|-------|----------|
| `accountStatus: undefined` | Usuario creado sin el campo | Ejecutar `fix-account-status.js` |
| `paused: true` | Usuario pausado | Cambiar a `paused: false` |
| `blocked: true` | Usuario bloqueado | Cambiar a `blocked: false` |
| `accountStatus !== "active"` | Valor incorrecto | Cambiar a `accountStatus: "active"` |

---

## 📊 Estado Actual

**Fecha:** 16 de enero de 2026

**test-master.js:** ✅ TODAS las funciones configuradas correctamente
- ✅ `createMatchesWithNotifications()` - Línea 181
- ✅ `createDiscoveryProfiles()` - Línea 554
- ✅ `fixDiscoveryProfiles()` - Línea 637

**Usuarios de prueba:** ✅ 31/31 usuarios con campos correctos

**Scripts legacy:** 🔄 En proceso de actualización
- ✅ `create-match-with-notification.js` - Actualizado con comentarios explicativos

---

## 💡 Recomendaciones

### Para Desarrollo
1. **SIEMPRE** incluir estos 4 campos al crear usuarios:
   ```javascript
   paused: false,
   visible: true,
   blocked: false,
   accountStatus: 'active', // 🔥 CRÍTICO
   ```

2. **NUNCA** crear usuarios sin `accountStatus`

3. **SIEMPRE** validar con `validate-test-users.js` después de crear usuarios

### Para Testing
1. Ejecutar `node test-master.js` para crear usuarios de prueba
2. Validar con `node validate-test-users.js`
3. Cerrar y reabrir la app iOS para ver los cambios
4. Verificar que los matches aparecen correctamente

### Para Producción
1. Asegurar que todos los usuarios reales tengan `accountStatus: 'active'`
2. Implementar validación en Cloud Functions al crear usuarios
3. Monitorear usuarios sin este campo en Firestore

---

## 📚 Referencias

**Código iOS:**
- `FirestoreRemoteDataSource.swift` líneas 1373-1430: Filtros de validación

**Scripts:**
- `test-master.js`: Script maestro con todas las funciones
- `validate-test-users.js`: Validación automática
- `fix-account-status.js`: Corrección de usuarios existentes
- `diagnose-ios-matches.js`: Diagnóstico de matches
- `check-user-fields.js`: Verificación de campos específicos

**Documentación:**
- `TEST_MASTER_GUIDE.md`: Guía técnica completa
- `README_TESTING.md`: Documentación de casos de uso
- `TROUBLESHOOT_MATCHES_NOT_SHOWING.md`: Guía de troubleshooting
