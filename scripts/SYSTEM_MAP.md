# 🗺️ Mapa del Sistema Unificado de Pruebas

## 📊 Estructura del Menú

```
🧪 SISTEMA UNIFICADO DE PRUEBAS - BlackSugar21
════════════════════════════════════════════════════════════════════

👤 Usuario Actual: [Daniel/Rosita]

📋 GESTIÓN DE MATCHES
├─ 1. 📋 Listar matches actuales
├─ 2. 🏗️  Crear matches de prueba (1-10)
├─ 3. 📤 Enviar mensaje a un match
└─ 4. 🎬 Generar escenario completo (3-10)

🎯 PERFILES DE DISCOVERY
└─ 5. 🌟 Crear perfiles para HomeView/Swipe (5-30)

🔍 VERIFICACIÓN Y DIAGNÓSTICO
├─ 6. 🔍 Verificar orden de matches
└─ 7. 📊 Verificar sistema completo

🧹 LIMPIEZA
├─ 8. 🗑️  Limpieza selectiva
│   ├─ Solo matches
│   ├─ Solo discovery
│   ├─ Todo excepto último escenario
│   └─ Limpieza completa
└─ 9. 🧹 Limpieza completa

⚙️  CONFIGURACIÓN
├─ 10. 🔄 Cambiar usuario de prueba
└─ 11. 🚪 Salir
```

## 🔄 Flujos de Trabajo Optimizados

### Flujo 1: Setup Inicial Completo
```
Inicio
  ↓
Seleccionar Usuario (Daniel/Rosita)
  ↓
7. Verificar sistema → Ver estado inicial
  ↓
5. Crear perfiles discovery (20-30) → HomeView
  ↓
4. Generar escenario (5-10 matches) → Matches con conversaciones
  ↓
7. Verificar sistema → Confirmar todo OK
  ↓
Abrir app y probar
```

### Flujo 2: Prueba de Reordenamiento
```
1. Listar matches → Ver orden actual
  ↓
3. Enviar mensaje → Match sube a #1
  ↓
6. Verificar orden → Confirmar reordenamiento
  ↓
1. Listar matches → Ver nuevo orden
```

### Flujo 3: Prueba con Múltiples Usuarios
```
Usuario: Daniel
  ↓
2. Crear matches (5)
  ↓
5. Crear discovery (15)
  ↓
10. Cambiar a Rosita
  ↓
2. Crear matches (5)
  ↓
5. Crear discovery (15)
  ↓
Probar ambas apps simultáneamente
```

### Flujo 4: Limpieza Selectiva
```
8. Limpieza selectiva
  ↓
┌─────────┬──────────┬─────────────┬──────────────┐
│ Opción 1│ Opción 2 │  Opción 3   │  Opción 4    │
│ Matches │Discovery │Keep Scenario│Complete Clean│
└─────────┴──────────┴─────────────┴──────────────┘
  ↓         ↓          ↓             ↓
Mantener  Mantener   Mantener      Eliminar
Discovery Matches    Último        TODO
                     Escenario
```

## 📦 Tipos de Datos

### Usuarios de Matches
```javascript
{
  email: "test_match_*@bstest.com" | "test_scenario_*@bstest.com",
  profile: {
    name: string,
    gender: "male" | "female",
    userType: "SUGAR_BABY" | "SUGAR_DADDY" | "SUGAR_MOMMY",
    age: number,
    city: string,
    isTest: true
  },
  match: {
    userId1: CURRENT_USER.uid,
    userId2: createdUserId,
    timestamp: Timestamp,
    lastMessage: string,
    lastMessageSeq: number,
    isTest: true
  }
}
```

### Perfiles de Discovery
```javascript
{
  email: "discovery_*@bstest-discovery.com",
  profile: {
    name: string,
    gender: "male" | "female",
    userType: "SUGAR_BABY" | "SUGAR_DADDY" | "SUGAR_MOMMY",
    age: number (22-40),
    city: string,
    bio: string,
    pictureUrls: string[] (5 fotos),
    isDiscoveryProfile: true,
    isTest: true
  }
}
```

## 🎯 Mapeo de Funcionalidades

### Scripts Legacy → Opciones Unificadas

| Script Legacy | Opción | Funcionalidad |
|--------------|--------|---------------|
| `check-daniel-matches.js` | 1 | Listar matches |
| `populate-test-matches.js` | 2 | Crear matches |
| `test-match-ordering.js` | 3, 6 | Enviar mensajes y verificar orden |
| `verify-test-data.js` | 7 | Verificar sistema |
| `populate-discovery-profiles.js` | 5 | Crear perfiles discovery |
| `debug-matches-users.js` | 7 | Incluido en verificación |
| `cleanup-test-matches.js` | 8, 9 | Limpieza selectiva/completa |

## 🔧 Operaciones Internas

### Query Optimization
```
Matches Query (sin índices compuestos):
  ┌─────────────────────────────────┐
  │ Query 1: userId1 == CURRENT_USER │
  │ Query 2: userId2 == CURRENT_USER │
  └──────────┬──────────────────────┘
             ↓
  Combinar resultados en memoria
             ↓
  Ordenar: timestamp DESC → lastMessageSeq DESC
```

### Batch Operations
```
Crear N matches:
  ┌────────────────────────────────────┐
  │ 1. Crear usuario en Auth           │
  │ 2. Batch.set() perfil              │
  │ 3. Batch.set() match               │
  │ 4. Batch.set() mensaje inicial     │
  └────────────────┬───────────────────┘
                   ↓
            Batch.commit()
         (1 operación de red)
```

## 📊 Métricas y Monitoreo

### Output de Verificación (Opción 7)
```
📊 RESUMEN DEL SISTEMA
════════════════════════════════════════════
👤 Usuario actual: Daniel
💬 Matches activos: 8
🎯 Perfiles de discovery: 25
📸 Perfiles con fotos: 25
💬 Conversaciones activas: 6
🧪 Usuarios de prueba totales: 33
════════════════════════════════════════════

Estado: ✅ Sistema completo y listo
```

### Output de Limpieza
```
✅ LIMPIEZA COMPLETADA
════════════════════════════════════════════
📊 Resumen:
   👥 Usuarios eliminados: 33
   💬 Matches eliminados: 8
   📝 Mensajes eliminados: 24
   🎭 Perfiles eliminados: 33
════════════════════════════════════════════
```

## 🎨 Convenciones Visuales

### Colores
- 🔵 **Cyan** → Información general, títulos
- 🟢 **Verde** → Éxito, confirmaciones
- 🟡 **Amarillo** → Advertencias, esperas
- 🔴 **Rojo** → Errores críticos
- ⚪ **Bright** → Encabezados importantes

### Emojis
- 📋 Listar/Ver
- 🏗️ Crear/Construir
- 📤 Enviar
- 🎬 Generar escenario
- 🌟 Discovery
- 🔍 Verificar/Buscar
- 📊 Estadísticas
- 🧹 Limpiar
- 🔄 Cambiar
- 🚪 Salir
- ✅ Éxito
- ❌ Error
- ⚠️ Advertencia
- 💡 Sugerencia

## 🚀 Performance Tips

1. **Crear en lotes** → Usar opción 4 (escenario) en lugar de múltiples ejecuciones de opción 2
2. **Verificar antes de crear** → Opción 7 para evitar duplicados
3. **Limpieza selectiva** → Opción 8 mantiene datos útiles
4. **Discovery separado** → Crear discovery solo una vez, reutilizar para múltiples tests
5. **Alternar usuarios** → Opción 10 sin reiniciar el script

## 📱 Testing Checklist

- [ ] Seleccionar usuario de prueba
- [ ] Verificar estado inicial del sistema
- [ ] Crear 20-30 perfiles de discovery
- [ ] Crear 5-10 matches con conversaciones
- [ ] Verificar HomeView en app
- [ ] Verificar lista de matches en app
- [ ] Probar envío de mensaje y reordenamiento
- [ ] Verificar orden después de cambios
- [ ] Probar con segundo usuario (opcional)
- [ ] Limpieza selectiva o completa al finalizar

---

**Sistema optimizado para pruebas rápidas y eficientes** 🚀
