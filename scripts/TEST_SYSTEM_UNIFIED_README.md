# 🧪 Sistema Unificado de Pruebas - BlackSugar21

Sistema maestro consolidado para gestión completa de datos de prueba en BlackSugar21.

## 📋 Descripción

`test-system-unified.js` es el **script maestro** que consolida todas las funcionalidades de prueba en una sola herramienta interactiva. Reemplaza múltiples scripts individuales con un sistema organizado y optimizado.

## ✨ Funcionalidades Principales

### 👥 Selector de Usuario
- **Daniel** (dverdugo85@gmail.com - ID: sU8xLiwQWNXmbYdR63p1uO6TSm72)
- **Rosita** (ID: DsDSK5xqEZZXAIKxtIKyBGntw8f2)
- Cambio de usuario sin reiniciar el script

### 📋 Gestión de Matches
1. **Listar matches actuales** - Ver todos los matches con detalles completos
2. **Crear matches de prueba** - Generar 1-10 matches con timestamps escalonados
3. **Enviar mensaje** - Probar reordenamiento en tiempo real
4. **Generar escenario completo** - Crear múltiples matches con conversaciones activas

### 🎯 Perfiles de Discovery
5. **Crear perfiles para HomeView** - Generar 5-30 perfiles con fotos para swipe
   - Alternar género automáticamente
   - 5 fotos por perfil (randomuser.me)
   - Bio personalizada
   - Tipo de usuario apropiado según el usuario de prueba

### 🔍 Verificación y Diagnóstico
6. **Verificar orden de matches** - Validar ordenamiento por timestamp/secuencia
7. **Verificar sistema completo** - Estadísticas detalladas:
   - Total de matches activos
   - Perfiles de discovery
   - Conversaciones activas
   - Usuarios de prueba totales
   - Estado general del sistema

### 🧹 Limpieza
8. **Limpieza selectiva** - Opciones granulares:
   - Solo matches (mantener discovery)
   - Solo discovery (mantener matches)
   - Todo excepto último escenario
   - Limpieza completa
9. **Limpieza completa** - Eliminar todos los datos de prueba

### ⚙️ Configuración
10. **Cambiar usuario** - Alternar entre Daniel y Rosita
11. **Salir** - Cerrar el script

## 🚀 Uso

```bash
cd scripts
node test-system-unified.js
```

## 📊 Flujo de Trabajo Recomendado

### Configuración Inicial
1. Ejecutar el script
2. Seleccionar usuario de prueba (Daniel o Rosita)
3. Verificar sistema (opción 7) para ver estado inicial

### Crear Datos de Prueba
4. Crear perfiles de discovery (opción 5) - Recomendado: 20-30 perfiles
5. Crear matches (opción 2 o 4) - Recomendado: 5-10 matches

### Pruebas
6. Listar matches (opción 1) para ver orden actual
7. Enviar mensajes (opción 3) para probar reordenamiento
8. Verificar orden (opción 6) después de cada cambio

### Limpieza
9. Limpieza selectiva (opción 8) para mantener algunos datos
10. Limpieza completa (opción 9) para resetear todo

## 🎯 Casos de Uso Específicos

### Probar HomeView (Swipe/Discovery)
```
1. Seleccionar usuario (Daniel o Rosita)
2. Opción 5: Crear 20-30 perfiles de discovery
3. Abrir app y verificar pantalla de HomeView
4. Los perfiles deberían aparecer con 5 fotos cada uno
```

### Probar Matches y Chat
```
1. Seleccionar usuario
2. Opción 4: Generar escenario completo (5-10 matches)
3. Opción 1: Listar matches para ver orden
4. Opción 3: Enviar mensaje y ver reordenamiento en tiempo real
5. Opción 6: Verificar orden de matches
```

### Probar con Ambos Usuarios
```
1. Crear datos para Daniel (opción 2 o 4)
2. Opción 10: Cambiar a Rosita
3. Crear datos para Rosita (opción 2 o 4)
4. Verificar en ambas apps
5. Opción 10: Alternar entre usuarios según necesidad
```

## 📝 Tipos de Datos Creados

### Matches (`@bstest.com`)
- Email pattern: `test_match_`, `test_scenario_`
- Incluye perfil, match y mensajes iniciales
- Timestamps escalonados para orden natural
- Campo `isTest: true` para identificación

### Discovery (`@bstest-discovery.com`)
- Email pattern: `discovery_`
- Perfiles completos con 5 fotos
- Bio personalizada
- Campo `isDiscoveryProfile: true`
- Campo `isTest: true`

## 🔧 Scripts Consolidados

Este script unificado reemplaza:
- ✅ `check-daniel-matches.js` → Opción 1
- ✅ `populate-test-matches.js` → Opción 2
- ✅ `populate-discovery-profiles.js` → Opción 5
- ✅ `test-match-ordering.js` → Opciones 3, 6
- ✅ `verify-test-data.js` → Opción 7
- ✅ `debug-matches-users.js` → Incluido en verificación
- ✅ `cleanup-test-matches.js` → Opciones 8, 9

## 🎨 Características Técnicas

### Colores en Consola
- 🔵 Cyan: Títulos e información general
- 🟢 Verde: Operaciones exitosas
- 🟡 Amarillo: Advertencias y esperas
- 🔴 Rojo: Errores
- ⚪ Bright: Encabezados importantes

### Seguridad
- Confirmación requerida para eliminaciones
- Validación de entradas
- Manejo de errores robusto
- Verificación de usuarios antes de operaciones

### Optimizaciones
- Queries eficientes sin índices compuestos
- Batch operations cuando es posible
- Timestamps escalonados automáticos
- Reutilización de conexiones Firebase

## 🐛 Troubleshooting

### "No hay matches para verificar"
- Ejecutar opción 2 o 4 para crear matches primero

### "No hay perfiles de discovery"
- Ejecutar opción 5 para crear perfiles de discovery

### "Usuario no encontrado en Firebase"
- Verificar que el UID es correcto en la configuración
- El script intentará usar el email de Firebase si difiere

### Problemas con fotos
- Las URLs de randomuser.me pueden cambiar
- El script maneja automáticamente índices rotatorios (1-99)

## 📚 Documentación Adicional

- Ver `QUICKSTART.md` para inicio rápido
- Ver `SCENARIO_GENERATOR_GUIDE.md` para escenarios avanzados
- Ver `TEST_SYSTEM_README.md` para overview general
- Ver carpeta `scripts/` para scripts individuales legacy

## 🔄 Actualizaciones

**v2.0 (12 enero 2026)**
- ✨ Consolidación completa de scripts
- ✨ Selector de usuario (Daniel/Rosita)
- ✨ Menú categorizado y organizado
- ✨ Limpieza selectiva por tipo
- ✨ Verificación completa del sistema
- ✨ Creación de perfiles de discovery
- ✨ Mejoras en UX y feedback visual

**v1.0 (10 enero 2026)**
- 🎉 Versión inicial con funcionalidades básicas

---

**Autor:** GitHub Copilot  
**Fecha:** 12 de enero de 2026  
**Proyecto:** BlackSugar21 Web Application
