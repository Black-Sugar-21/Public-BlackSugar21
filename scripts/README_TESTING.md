# 🎯 Sistema de Testing Centralizado - BlackSugar21

## 📦 Resumen

Se ha creado **test-master.js**, un script unificado que centraliza TODAS las funcionalidades de testing en un único menú interactivo.

---

## 🚀 Ejecución Rápida

### Opción 1: Ejecución directa
```bash
cd /Users/daniel/IdeaProjects/Public-BlackSugar21/scripts
node test-master.js
```

### Opción 2: Con launcher (desde cualquier directorio)
```bash
/Users/daniel/IdeaProjects/Public-BlackSugar21/scripts/test.sh
```

---

## 📋 Menú Principal

```
🎯 SISTEMA MAESTRO DE PRUEBAS - BlackSugar21
══════════════════════════════════════════════════════════════════════
Usuario: Daniel (dverdugo85@gmail.com)
══════════════════════════════════════════════════════════════════════

📱 GESTIÓN DE MATCHES
  1. Crear matches con notificaciones
  2. Verificar matches y notificaciones
  3. Listar matches actuales

💬 PRUEBAS DE MENSAJERÍA
  4. Enviar mensaje de prueba
  5. Simular conversación automática

🎯 PERFILES DE DISCOVERY
  6. Crear perfiles para HomeView/Swipe
  7. Corregir perfiles de discovery

🔍 DIAGNÓSTICO
  8. Verificar sistema completo

🧹 LIMPIEZA
  9. Limpiar datos de prueba

⚙️  VALIDACIÓN
  Ejecutar: node validate-test-users.js (verifica campos críticos)

👥 SELECCIÓN DE USUARIO
  Al inicio: Elegir entre Daniel o Rosita
  Durante sesión: Opción 10 para cambiar usuario
  Ver detalles: USER_SELECTION.md

```

---

## 🔥 CAMPOS CRÍTICOS PARA iOS

**IMPORTANTE:** Todos los usuarios creados por test-master.js incluyen automáticamente estos campos:

| Campo | Valor | Comportamiento iOS |
|-------|-------|-------------------|
| `accountStatus` | `'active'` | 🔥 **CRÍTICO**: Si no es "active" o no existe → iOS **ELIMINA** el match |
| `paused` | `false` | ⚠️ Si es `true` → iOS **OCULTA** el match temporalmente |
| `blocked` | `false` | ❌ Si es `true` → iOS **ELIMINA** el match permanentemente |
| `visible` | `true` | ℹ️ Control de visibilidad general |

**¿Por qué son importantes?**

iOS filtra automáticamente los matches en `FirestoreRemoteDataSource.swift` (líneas 1373-1430). Si algún campo tiene un valor incorrecto, el match NO aparecerá en la lista.

**Validación:**
```bash
cd scripts
node validate-test-users.js  # Verifica todos los usuarios de prueba
```

**Ver detalles completos:** [CAMPOS_CRITICOS_MATCHES.md](CAMPOS_CRITICOS_MATCHES.md)

⚙️  OTRAS OPCIONES
  10. Refrescar pantalla
  11. Salir
```

---

## 🎮 Funcionalidades Integradas

### ✅ Scripts Legacy Reemplazados

| Script Anterior | Funcionalidad | Opción en test-master.js |
|----------------|---------------|--------------------------|
| `create-match-with-notification.js` | Crear matches | Opción 1 |
| `verify-matches-and-notifications.js` | Verificar estado | Opción 2 |
| `test-messages.js` | Pruebas de mensajería | Opciones 4, 5 |
| `fix-discovery-profiles.js` | Corregir perfiles | Opción 7 |
| `verify-orientations.js` | Integrado en creación | Automático |

### 🆕 Funcionalidades Nuevas

1. **Menú interactivo** - Navegación intuitiva con colores
2. **Diagnóstico completo** - Opción 8: Estado del sistema
3. **Limpieza selectiva** - Opción 9: 5 niveles de limpieza
4. **Creación masiva de perfiles** - Opción 6: Hasta 30 perfiles
5. **Estadísticas en tiempo real** - Contadores y resúmenes

---

## 📚 Casos de Uso

### 🔥 Caso 1: Setup Inicial (Primera Vez)

```bash
# 1. Ejecutar script
./test.sh

# 2. Crear perfiles de discovery
→ Opción 6
→ Ingresar: 20  (crear 20 perfiles)

# 3. Verificar que se crearon correctamente
→ Opción 8  (diagnóstico)

# 4. Si algunos no aparecen en HomeView
→ Opción 7  (corregir perfiles)

# 5. Crear matches con notificaciones
→ Opción 1
→ Ingresar: 5  (crear 5 matches)

# 6. Verificar notificaciones
→ Opción 2
→ Revisar estadísticas

# 7. Abrir app y verificar
→ Debería ver 5 matches nuevos
→ Debería haber recibido notificaciones
```

### 💬 Caso 2: Testing de Mensajería

```bash
# 1. Listar matches disponibles
→ Opción 3

# 2. Enviar mensaje manual
→ Opción 4
→ Seleccionar match (ej: 1)
→ Escribir mensaje personalizado
→ Verificar que el match sube a posición #1 en app

# 3. Simular conversación automática
→ Opción 5
→ Seleccionar otro match (ej: 2)
→ Ingresar: 10  (10 mensajes)
→ Esperar 20 segundos (2s entre mensajes)
→ Verificar reordenamiento en app
```

### 📲 Caso 3: Testing de Notificaciones

```bash
# 1. Verificar FCM token
→ Opción 8
→ Revisar sección "FCM Token de Daniel"
→ Si no hay token: Abrir app → Aceptar permisos

# 2. Crear 1 match de prueba
→ Opción 1
→ Ingresar: 1

# 3. Esperar 2-3 segundos
→ Debería llegar notificación push

# 4. Verificar estado
→ Opción 2
→ Buscar el nuevo match
→ Verificar ✅ "Notificación enviada"

# 5. Si no llegó notificación
→ Ver logs de Cloud Functions:
cd /Users/daniel/AndroidStudioProjects/iOS/functions
firebase functions:log --only onMatchCreated
```

### 🧹 Caso 4: Limpieza y Reset

```bash
# 1. Limpiar datos de prueba
→ Opción 9

# 2. Elegir nivel de limpieza:
→ 4 = Matches + mensajes (mantener discovery)
→ Escribir: SI

# 3. Verificar limpieza
→ Opción 8
→ Revisar estadísticas

# 4. Crear nuevos matches para seguir testeando
→ Opción 1
→ Los perfiles de discovery se mantienen
```

### 🎯 Caso 5: Testing de Discovery/Swipe

```bash
# 1. Crear muchos perfiles
→ Opción 6
→ Ingresar: 30

# 2. Corregir si no aparecen
→ Opción 7

# 3. Verificar en diagnóstico
→ Opción 8
→ Ver "Perfiles de Discovery"
→ Debe mostrar ~30 perfiles

# 4. Abrir app
→ Ir a HomeView (swipe)
→ Debería ver los perfiles para dar like/pass

# 5. Si aparecen pocos perfiles:
→ Cloud Function getCompatibleProfileIds tiene filtros:
  - Edad compatible bidireccional
  - Orientación compatible bidireccional
  - Geohash (distancia)
  - Usuarios bloqueados
  - Matches existentes
  - Swipes recientes (cooldown 14 días)
```

---

## 🔧 Troubleshooting

### ❌ Error: "Cannot find module"
```bash
# Solución: Verificar que estás en el directorio correcto
cd /Users/daniel/IdeaProjects/Public-BlackSugar21/scripts
pwd  # Debe mostrar: /Users/daniel/IdeaProjects/Public-BlackSugar21/scripts
ls test-master.js  # Debe existir
node test-master.js
```

### ❌ "No hay matches en la app"
1. ✅ Crear matches (Opción 1)
2. ✅ Esperar 2-3 segundos
3. ✅ Cerrar y reabrir la app
4. ✅ Verificar Firestore listeners activos en logs
5. ✅ Verificar en Firebase Console

### ❌ "No llegan notificaciones"
1. ✅ Opción 8: Verificar FCM token
2. ✅ Si no hay token: Abrir app → Permisos
3. ✅ Crear nuevo match de prueba
4. ✅ Verificar logs Cloud Functions
5. ✅ Verificar en dispositivo: Configuración → Notificaciones → BlackSugar21

### ❌ "Perfiles no aparecen en HomeView"
1. ✅ Opción 8: Ver diagnóstico
2. ✅ Si hay perfiles sin migrar: Opción 7
3. ✅ Verificar orientación compatible
4. ✅ Verificar edad compatible
5. ✅ Verificar geohash (Chile: 66m, 66q, 66k)

### ❌ "Mensajes no reordenan"
1. ✅ Verificar `lastMessageTimestamp` actualizado
2. ✅ Verificar orden en Firestore Console
3. ✅ Cerrar y reabrir app
4. ✅ Revisar logs de listeners en app

---

## 📊 Datos Técnicos

### Usuario de Prueba
```javascript
{
  email: 'dverdugo85@gmail.com',
  uid: 'sU8xLiwQWNXmbYdR63p1uO6TSm72',
  name: 'Daniel',
  male: true,
  orientation: 'women',
  userType: 'SUGAR_DADDY'
}
```

### Perfiles Generados (Matches)
- **Mujeres**: Isabella López, Valentina Martínez, Camila García, etc.
- **Tipos**: SUGAR_BABY (70%), SUGAR_MOMMY (30%)
- **Edades**: 22-27 años
- **Orientación**: "men" (compatible con Daniel)
- **Ciudad**: Santiago
- **Geohash**: Chile (66m, 66q, 66k)

### Perfiles Generados (Discovery)
- **Mix**: 50% hombres, 50% mujeres
- **Tipos**: Mix de todos los tipos
- **Edades**: 22-40 años
- **Ciudades**: Santiago, Valparaíso, Concepción
- **Orientación**: Variada (men, women, both)

---

## 🎨 Convenciones

### Colores en Terminal
- 🔵 **Cyan**: Títulos y categorías
- 🟢 **Green**: Éxito
- 🟡 **Yellow**: Advertencias
- 🔴 **Red**: Errores
- ⚪ **Bright**: Destacados

### Iconos
- ✅ = Completado/OK
- ⚠️ = Advertencia
- ❌ = Error
- 🔄 = Procesando
- 📊 = Estadísticas
- 💡 = Sugerencia
- 🎯 = Objetivo/Match
- 💬 = Mensaje
- 🧪 = Prueba/Test
- 🧹 = Limpieza

---

## 📞 Información

- **Archivo principal**: `/Users/daniel/IdeaProjects/Public-BlackSugar21/scripts/test-master.js`
- **Launcher**: `/Users/daniel/IdeaProjects/Public-BlackSugar21/scripts/test.sh`
- **Documentación**: `TEST_MASTER_GUIDE.md`
- **Autor**: GitHub Copilot
- **Versión**: 1.0.0
- **Fecha**: 16 de enero de 2026

---

## 🎯 Ventajas del Sistema Centralizado

| Antes (Scripts Separados) | Ahora (test-master.js) |
|---------------------------|------------------------|
| 5+ scripts diferentes | 1 solo script |
| Recordar nombres de archivos | Menú interactivo |
| Ejecutar comandos manualmente | Seleccionar opción |
| Sin diagnóstico integrado | Diagnóstico completo (Opción 8) |
| Limpieza manual compleja | 5 niveles de limpieza |
| Sin estadísticas | Estadísticas en tiempo real |
| Sin colores | Interface coloreada |
| Sin validaciones | Validaciones integradas |

---

## 🚀 Próximos Pasos

1. ✅ **Ejecutar**: `node test-master.js`
2. ✅ **Explorar**: Probar cada opción del menú
3. ✅ **Crear**: Perfiles + Matches + Mensajes
4. ✅ **Verificar**: En la app que todo funciona
5. ✅ **Limpiar**: Cuando termines las pruebas

**¡Sistema completo de testing en un solo lugar! 🎉**

---

## 📝 Changelog

### v1.0.0 (16 enero 2026)
- ✅ Lanzamiento inicial
- ✅ Integración de 5 scripts legacy
- ✅ Menú interactivo completo
- ✅ Sistema de diagnóstico
- ✅ Limpieza selectiva
- ✅ Documentación completa
