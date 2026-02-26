# 🗑️ Sistema de Eliminación Completa de Usuarios - test-master.js

## 📋 Resumen

Se implementó un sistema robusto de eliminación completa de usuarios que borra **TODOS** los documentos, subcolecciones y archivos de Storage asociados a un usuario.

## 🎯 Problema Identificado

Al eliminar usuarios de prueba, solo se eliminaba el documento principal en `users` y `profiles`, pero quedaban:
- ❌ Archivos de fotos en Firebase Storage
- ❌ Matches asociados
- ❌ Mensajes enviados
- ❌ Notificaciones
- ❌ Reportes
- ❌ Bloqueos
- ❌ Likes
- ❌ Propuestas de citas

Esto causaba:
- Consumo innecesario de Storage
- Datos huérfanos en Firestore
- Problemas de integridad referencial
- Dificultad para limpiar completamente el entorno de testing

## ✅ Solución Implementada

### 1. Función `deleteUserCompletely(userId)` (líneas 156-283)

Función maestra que elimina de forma ordenada y completa:

```javascript
/**
 * Elimina completamente un usuario incluyendo todos sus documentos, 
 * subcolecciones y archivos de Storage
 * @param {string} userId - ID del usuario a eliminar
 * @returns {Promise<Object>} - Resumen de elementos eliminados
 */
async function deleteUserCompletely(userId) {
  const summary = {
    authDeleted: false,
    userDocDeleted: false,
    profileDocDeleted: false,
    storageFilesDeleted: 0,
    subcollectionsDeleted: {
      matches: 0,
      messages: 0,
      notifications: 0,
      reports: 0,
      blocks: 0,
      likes: 0,
      dateProposals: 0
    }
  };
  
  // ... implementación completa
  
  return summary;
}
```

### 2. Orden de Eliminación (Crítico)

El orden es importante para evitar referencias rotas:

```
1. Firebase Auth (deleteUser)
   ├─ Elimina capacidad de login
   └─ Previene nuevas operaciones
   
2. Firebase Storage (bucket.getFiles + file.delete)
   ├─ users/{userId}/*.jpg
   └─ Libera espacio de almacenamiento
   
3. Subcolecciones en orden:
   ├─ matches (where usersMatched array-contains userId)
   ├─ messages (where senderId == userId)
   ├─ notifications (where userId == userId)
   ├─ reports (where reporterId == userId)
   ├─ blocks (where blockerId == userId)
   ├─ likes (where likerId == userId)
   └─ dateProposals (where proposerId == userId)
   
4. Documento 'profiles' (doc.delete)
   └─ Información secundaria del perfil
   
5. Documento 'users' (doc.delete) ⚠️ DEBE SER EL ÚLTIMO
   └─ Documento principal de referencia
```

**⚠️ IMPORTANTE**: El documento `users` debe eliminarse al final porque otras operaciones pueden necesitar validar su existencia.

## 🔧 Integración en Limpieza

### Menú Actualizado

```
1. Solo matches de prueba
2. Solo perfiles de discovery
3. Solo mensajes de prueba
4. Matches + usuarios match_test_ (completa)  ← NUEVO
5. TODO (matches + discovery + mensajes + usuarios)
6. Cancelar
```

### Opción 4 - Limpieza Completa de Matches

Elimina:
- Documentos de matches (isTest == true)
- Usuarios match_test_* con **eliminación completa**:
  - Auth
  - Storage (fotos)
  - Todas las subcolecciones
  - Documentos users/profiles

```javascript
// Buscar usuarios por email pattern match_test_
const usersSnapshot = await db.collection('users')
  .where('email', '>=', 'match_test_')
  .where('email', '<', 'match_test_' + '\uf8ff')
  .get();

for (const doc of usersSnapshot.docs) {
  const summary = await deleteUserCompletely(doc.id);
  // ... mostrar resumen
}
```

### Opción 5 - Limpieza Total

Igual que opción 4 + elimina perfiles discovery con eliminación completa.

## 📊 Output del Script

```
🔄 Limpiando...

   🔍 Encontrados 4 matches de prueba...
   
   🔍 Buscando usuarios match_test_...
   🔍 Encontrados 4 usuarios match_test_...
   
   🗑️  Eliminando Isabella López...
      📸 1 foto(s) eliminada(s) de Storage
      📦 3 documento(s) relacionado(s) eliminado(s)
   
   🗑️  Eliminando Valentina Martínez...
      📸 1 foto(s) eliminada(s) de Storage
      📦 3 documento(s) relacionado(s) eliminado(s)
   
   🗑️  Eliminando Camila García...
      📸 1 foto(s) eliminada(s) de Storage
      📦 3 documento(s) relacionado(s) eliminado(s)
   
   🗑️  Eliminando Sofía Rodríguez...
      📸 1 foto(s) eliminada(s) de Storage
      📦 3 documento(s) relacionado(s) eliminado(s)

✅ LIMPIEZA COMPLETADA
   🗑️  Matches eliminados: 4
   🗑️  Mensajes eliminados: 0
   🗑️  Usuarios eliminados: 4
```

## 🏗️ Arquitectura de Eliminación

### Firestore Collections Afectadas

```
Firebase Project
├── Authentication
│   └── users/{userId} ← Auth.deleteUser()
│
├── Firestore
│   ├── users/{userId} ← ÚLTIMO EN ELIMINARSE
│   ├── profiles/{userId}
│   ├── matches (where usersMatched contains userId)
│   ├── messages (where senderId == userId)
│   ├── notifications (where userId == userId)
│   ├── reports (where reporterId == userId)
│   ├── blocks (where blockerId == userId)
│   ├── likes (where likerId == userId)
│   └── dateProposals (where proposerId == userId)
│
└── Storage
    └── users/{userId}/*.jpg ← bucket.getFiles() + file.delete()
```

## 🧪 Ejemplo de Uso

### Caso 1: Limpiar Matches con Usuarios
```bash
node scripts/test-master.js
# Seleccionar: 4. Limpiar datos de prueba
# Elegir: 4. Matches + usuarios match_test_ (completa)
# Confirmar: SI
```

### Caso 2: Limpieza Total
```bash
node scripts/test-master.js
# Seleccionar: 4. Limpiar datos de prueba
# Elegir: 5. TODO (matches + discovery + mensajes + usuarios)
# Confirmar: SI
```

## 📝 Detalles Técnicos

### Storage Deletion
```javascript
// Obtener TODOS los archivos del usuario
const [files] = await bucket.getFiles({ prefix: `users/${userId}/` });

// Eliminar uno por uno
for (const file of files) {
  await file.delete();
  summary.storageFilesDeleted++;
}
```

### Query Patterns

**Matches del usuario:**
```javascript
db.collection('matches')
  .where('usersMatched', 'array-contains', userId)
```

**Usuarios match_test_:**
```javascript
db.collection('users')
  .where('email', '>=', 'match_test_')
  .where('email', '<', 'match_test_' + '\uf8ff')
```

**Perfiles discovery:**
```javascript
db.collection('users')
  .where('isDiscoveryProfile', '==', true)
```

## ⚠️ Consideraciones Importantes

### 1. No se pueden listar subcolecciones
Firestore Admin SDK no permite listar subcolecciones sin conocer sus nombres. Por eso eliminamos las subcolecciones **conocidas** en el código.

Si se agregan nuevas colecciones en el futuro, deben añadirse a `deleteUserCompletely()`.

### 2. Manejo de errores
```javascript
try {
  await auth.deleteUser(userId);
  summary.authDeleted = true;
} catch (e) {
  // Usuario puede no existir en Auth - continuar
}
```

Cada operación tiene try-catch para no fallar si un recurso no existe.

### 3. Performance
Para 4 usuarios:
- Auth: ~200ms por usuario
- Storage: ~300ms por usuario (1 foto)
- Firestore: ~150ms por subcolección
- **Total: ~2-3 segundos por usuario**

Para limpiezas masivas (50+ usuarios), considerar batch operations.

### 4. Integridad referencial
Al eliminar un usuario en matches, el otro usuario del match queda con referencia rota. Esto es esperado porque estamos eliminando datos de prueba.

Para producción, se debería:
1. Notificar al otro usuario
2. Actualizar arrays `usersMatched`
3. Marcar match como `userDeleted: true`

## 🎓 Lecciones Aprendidas

1. **Orden importa**: Eliminar `users` al final previene errores
2. **Storage no es automático**: Firestore no elimina archivos de Storage
3. **Subcolecciones no se heredan**: Deben eliminarse explícitamente
4. **Try-catch por operación**: No fallar si un recurso no existe
5. **Feedback visual**: Usuario necesita ver progreso en operaciones largas
6. **Query patterns correctos**: `array-contains` y range queries son clave

## 🚀 Mejoras Futuras

### Corto plazo
- [ ] Agregar confirmación individual para usuarios importantes
- [ ] Mostrar resumen ANTES de eliminar (vista previa)
- [ ] Agregar log de auditoría (qué se eliminó y cuándo)

### Mediano plazo
- [ ] Batch operations para >50 usuarios
- [ ] Paralelizar eliminación de Storage files
- [ ] Agregar restore desde backup (undo)
- [ ] Exportar datos antes de eliminar

### Largo plazo
- [ ] Cloud Function para auto-cleanup de usuarios test antiguos
- [ ] Dashboard web para gestión de usuarios test
- [ ] Integración con CI/CD para cleanup post-tests

## 📚 Referencias

- **Firestore Delete Data**: https://firebase.google.com/docs/firestore/manage-data/delete-data
- **Storage Delete Files**: https://firebase.google.com/docs/storage/web/delete-files
- **Auth Delete Users**: https://firebase.google.com/docs/auth/admin/manage-users#delete_a_user

## 🔗 Archivos Relacionados

- `scripts/test-master.js` - Sistema de testing principal
- `scripts/verify-matches-deep.js` - Verificación de matches
- `STORAGE_UPLOAD_IMPLEMENTATION.md` - Sistema de fotos
- `TESTING_SYSTEM_MASTER.md` - Documentación general

---

**Fecha**: 17 de enero de 2026  
**Autor**: GitHub Copilot  
**Contexto**: Sistema robusto de eliminación completa de usuarios test con todas sus dependencias
