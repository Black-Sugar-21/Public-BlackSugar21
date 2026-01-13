# Scripts de Testing - BlackSugar21

Sistema unificado de pruebas para gestión completa de datos de prueba en Firebase.

## 🎯 Script Principal

### `test-system-unified.js` - Sistema Maestro Consolidado

Script interactivo todo-en-uno que reemplaza múltiples scripts individuales.

```bash
cd scripts
node test-system-unified.js
```

**Características:**
- ✅ Selector de usuario (Daniel/Rosita)
- ✅ Gestión completa de matches
- ✅ Creación de perfiles de discovery
- ✅ Verificación y diagnóstico
- ✅ Limpieza selectiva o completa
- ✅ Menú interactivo categorizado

📚 **Documentación completa:** Ver [TEST_SYSTEM_UNIFIED_README.md](TEST_SYSTEM_UNIFIED_README.md)

🗺️ **Mapa visual:** Ver [SYSTEM_MAP.md](SYSTEM_MAP.md)

---

## 📋 Requisitos

1. **Node.js** v18 o superior
2. **Firebase Admin SDK** con credenciales de service account
3. **Service Account Key** de Firebase

## ⚙️ Setup

### 1. Instalar dependencias

```bash
cd /Users/daniel/IdeaProjects/Public-BlackSugar21
npm install firebase-admin --save-dev
```

### 2. Obtener Service Account Key

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona el proyecto `black-sugar-21`
3. Ve a **Project Settings** > **Service Accounts**
4. Click en **Generate New Private Key**
5. Guarda el archivo como `scripts/serviceAccountKey.json`

**⚠️ IMPORTANTE**: Este archivo contiene credenciales sensibles. Ya está en `.gitignore`, nunca lo subas a Git.

### 3. Verificar estructura del archivo

El archivo `serviceAccountKey.json` debe tener esta estructura:

```json
{
  "type": "service_account",
  "project_id": "black-sugar-21",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "firebase-adminsdk-...@black-sugar-21.iam.gserviceaccount.com",
  ...
}
```

## 🚀 Uso Rápido

### Ejecutar Sistema Unificado

```bash
cd scripts
node test-system-unified.js
```

Al iniciar verás:
1. Selector de usuario (Daniel o Rosita)
2. Menú con 11 opciones organizadas
3. Feedback visual con colores y emojis

### Flujo Típico de Testing

```bash
# 1. Iniciar el script
node test-system-unified.js

# 2. Seleccionar usuario (1: Daniel, 2: Rosita)

# 3. Verificar estado inicial
Opción 7: Verificar sistema completo

# 4. Crear datos de prueba
Opción 5: Crear 20-30 perfiles de discovery
Opción 4: Generar 5-10 matches con conversaciones

# 5. Probar en la app
Abrir app y verificar HomeView y Matches

# 6. Limpiar después de probar
Opción 8: Limpieza selectiva (o)
Opción 9: Limpieza completa
```

## 📊 Funcionalidades del Sistema Unificado

### 📋 Gestión de Matches
- **Opción 1:** Listar matches actuales con detalles
- **Opción 2:** Crear 1-10 matches de prueba
- **Opción 3:** Enviar mensaje y probar reordenamiento
- **Opción 4:** Generar escenario completo (múltiples matches + mensajes)

### 🎯 Perfiles de Discovery
- **Opción 5:** Crear 5-30 perfiles para HomeView/Swipe
  - 5 fotos por perfil (randomuser.me)
  - Bio personalizada
  - Distribución de géneros y tipos de usuario

### 🔍 Verificación y Diagnóstico
- **Opción 6:** Verificar orden de matches (timestamp + secuencia)
- **Opción 7:** Estadísticas completas del sistema
  - Total de matches activos
  - Perfiles de discovery disponibles
  - Conversaciones activas
  - Usuarios de prueba totales

### 🧹 Limpieza
- **Opción 8:** Limpieza selectiva
  - Solo matches (mantener discovery)
  - Solo discovery (mantener matches)
  - Todo excepto último escenario
- **Opción 9:** Limpieza completa (resetear todo)

### ⚙️ Configuración
- **Opción 10:** Cambiar usuario sin reiniciar
- **Opción 11:** Salir

## 📝 Tipos de Datos Creados

### Usuarios de Matches (`@bstest.com`)
- Email: `test_match_*@bstest.com`, `test_scenario_*@bstest.com`
- Incluye: perfil, match, mensajes iniciales
- Timestamps escalonados para orden natural
- Flag: `isTest: true`

### Perfiles de Discovery (`@bstest-discovery.com`)
- Email: `discovery_*@bstest-discovery.com`
- 5 fotos por perfil
- Bio personalizada
- Flags: `isDiscoveryProfile: true`, `isTest: true`

## 🧪 Scripts Auxiliares

### Gestión de Avatares
- `upload-test-avatars.js` - Subir avatares a Firebase Storage
- `upload-test-avatars-to-storage.js` - Subir y generar URLs
- `update-avatars-only.js` - Actualizar solo avatares de usuarios existentes
- `generate-avatar-urls.js` - Generar URLs de avatares

### Utilidades
- `get-user-email.js` - Obtener email de usuario por UID
- `optimize-matches-and-images.js` - Optimizar matches e imágenes

### Archivos de Configuración
- `serviceAccountKey.json` - Credenciales Firebase (no commiteado)
- `serviceAccountKey.example.json` - Ejemplo de estructura
- `test-avatars-urls.json` - URLs de avatares de prueba

## 📚 Guías Adicionales

- **[TEST_SYSTEM_UNIFIED_README.md](TEST_SYSTEM_UNIFIED_README.md)** - Guía completa del sistema unificado
- **[SYSTEM_MAP.md](SYSTEM_MAP.md)** - Mapa visual con flujos y arquitectura
- **[QUICKSTART.md](QUICKSTART.md)** - Guía de inicio rápido
- **[SCENARIO_GENERATOR_GUIDE.md](SCENARIO_GENERATOR_GUIDE.md)** - Generación de escenarios avanzados
- **[HOME_VIEW_TEST_PLAN.md](HOME_VIEW_TEST_PLAN.md)** - Plan de testing para HomeView

## ⚠️ Advertencias y Buenas Prácticas

### Seguridad
1. **Nunca commitear `serviceAccountKey.json`** - Contiene credenciales sensibles
2. **Solo usar en desarrollo/staging** - No ejecutar en producción
3. **Limpieza regular** - Eliminar datos de prueba después de cada sesión

### Performance
1. **Limitar cantidad de perfiles** - Crear solo los necesarios (20-30 recomendado)
2. **Rate limits de Firebase** - Operaciones masivas pueden tardar varios minutos
3. **Costs de Firebase** - Cada ejecución genera escrituras en Firestore y Auth

### Testing
1. **Verificar antes de crear** - Usar opción 7 para ver estado actual
2. **Limpieza selectiva primero** - Probar opción 8 antes de limpieza completa
3. **Alternar usuarios** - Probar con ambos usuarios (Daniel/Rosita)

## 🔧 Troubleshooting

### "Error: Service account key not found"
```bash
# Verificar que existe el archivo
ls -la scripts/serviceAccountKey.json

# Si no existe, copiar el example y editarlo
cp scripts/serviceAccountKey.example.json scripts/serviceAccountKey.json
```

### "Error: Permission denied"
- Verificar permisos del service account en Firebase Console
- El service account necesita roles: Firebase Admin, Firestore, Storage

### "Script se congela o es muy lento"
- Puede haber muchos datos de prueba existentes
- Ejecutar limpieza completa primero (opción 9)
- Verificar conexión a internet

### "No aparecen perfiles en HomeView"
- Verificar que se crearon perfiles de discovery (opción 5)
- Verificar género y tipo de usuario apropiados
- Revisar reglas de Firestore para collection `profiles`

## 📊 Scripts Legacy (Consolidados)
4. **Service Account**: Las credenciales tienen acceso completo al proyecto

## 🐛 Troubleshooting

### Error: "Cannot find module 'firebase-admin'"
```bash
npm install firebase-admin --save-dev
```

### Error: "Cannot find module './serviceAccountKey.json'"
- Asegúrate de haber descargado el service account key
- Verifica que esté en `scripts/serviceAccountKey.json`

### Error: "Permission denied" en Storage
- Verifica que el service account tenga rol de "Editor" o "Owner"
- Ve a IAM en Firebase Console

### Error: "Quota exceeded"
- Has alcanzado el límite de operaciones gratuitas
- Espera 24 horas o actualiza a plan Blaze

## 📚 Referencias

- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
- [UI Avatars API](https://ui-avatars.com/)
- [Firestore Batch Operations](https://firebase.google.com/docs/firestore/manage-data/transactions)

## 📊 Scripts Legacy (Consolidados)

Los siguientes scripts han sido consolidados en `test-system-unified.js`:

| Script Legacy (Eliminado) | Nueva Opción |
|---------------------------|--------------|
| `check-daniel-matches.js` | Opción 1 |
| `populate-test-matches.js` | Opción 2 |
| `test-match-ordering.js` | Opciones 3, 6 |
| `populate-discovery-profiles.js` | Opción 5 |
| `verify-test-data.js` | Opción 7 |
| `debug-matches-users.js` | Opción 7 (integrado) |
| `cleanup-test-matches.js` | Opciones 8, 9 |

**Ventajas del sistema unificado:**
- ✅ Un solo script en lugar de 7+
- ✅ Menú interactivo más intuitivo
- ✅ Soporte para múltiples usuarios
- ✅ Limpieza granular por tipo
- ✅ Verificación integrada

---

**Última actualización:** 12 de enero de 2026  
**Autor:** GitHub Copilot
