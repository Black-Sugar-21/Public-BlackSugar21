# 🎬 Nueva Funcionalidad: Generar Escenario Completo

## ✨ ¿Qué hace?

Crea múltiples matches (3-10) con conversaciones activas para probar el ordenamiento en condiciones reales.

## 🚀 Cómo usarlo

```bash
cd /Users/daniel/IdeaProjects/Public-BlackSugar21/scripts
node test-system-unified.js

# Selecciona opción: 5
```

## 📋 Lo que genera

### Para cada match:
- ✅ Usuario de prueba en Firebase Auth
- ✅ Perfil completo (nombre, edad, tipo)
- ✅ Match con Daniel
- ✅ 2-3 mensajes por conversación
- ✅ `lastMessageSeq` incrementado (1, 2, 3)
- ✅ Timestamps escalonados naturalmente

### Ejemplo con 5 matches:

```
1. Rosita:
   - "Hola Daniel!" (Seq: 1)
   - "¿Cómo estás?" (Seq: 2)
   - "Me gustaría conocerte" (Seq: 3)

2. María:
   - "Hey!" (Seq: 1)
   - "Vi tu perfil" (Seq: 2)
   - "Me pareces interesante" (Seq: 3)

3. Carla:
   - "Hola guapo" (Seq: 1)
   - "¿Qué tal tu día?" (Seq: 2)

4. Ana:
   - "Hi Daniel!" (Seq: 1)
   - "Nice to match with you" (Seq: 2)

5. Laura:
   - "Hola!" (Seq: 1)
   - "Me encanta tu perfil" (Seq: 2)
```

## 🎯 Orden esperado en la app

Los matches se ordenan por **último mensaje más reciente**:

```
Posición #1: Laura (último en recibir mensaje)
Posición #2: Ana
Posición #3: Carla
Posición #4: María
Posición #5: Rosita
```

## ✅ Qué valida

1. **Ordenamiento multi-match**: Verifica que el sistema ordena correctamente múltiples conversaciones
2. **lastMessageSeq correcto**: Cada match tiene secuencia incrementada
3. **Timestamps realistas**: Los mensajes tienen timestamps escalonados (no todos al mismo tiempo)
4. **Consistencia**: El orden en Firebase = Orden en app iOS/Android

## 📱 Cómo probar

1. **Ejecuta opción 5**: Genera el escenario (ej: 5 matches)
2. **Abre la app iOS/Android** de Daniel
3. **Ve a pantalla de Matches**
4. **Verifica el orden**:
   - ✅ El match con mensaje más reciente está en posición #1
   - ✅ No hay saltos ni desorden
   - ✅ Al actualizar (pull-to-refresh) el orden se mantiene

5. **Prueba reordenamiento**:
   - Envía mensaje a match en posición #5 (opción 3 del menú)
   - Debería subir instantáneamente a posición #1
   - El resto se mueve hacia abajo

## 🔍 Escenarios a probar

### Escenario 1: Orden básico
- Crea 5 matches (opción 5)
- Verifica que están ordenados del más reciente al más antiguo
- ✅ PASS: Orden correcto en app

### Escenario 2: Reordenamiento
- Después de crear escenario
- Envía mensaje a match en posición #4 (opción 3)
- ✅ PASS: Match sube a #1 instantáneamente

### Escenario 3: Múltiples reordenamientos
- Envía mensajes a diferentes matches alternadamente
- Verifica que cada uno sube a #1 cuando recibe mensaje
- ✅ PASS: Orden se actualiza correctamente cada vez

### Escenario 4: Persistencia
- Crea escenario
- Cierra la app completamente
- Vuelve a abrir
- ✅ PASS: Orden se mantiene después de reiniciar

## 🧹 Limpieza

Después de probar, usa **opción 6** para limpiar todos los datos de prueba:

```
Selecciona opción: 6
¿Estás seguro? (s/n): s

✅ 5 usuarios eliminados
✅ 5 matches eliminados
✅ 13 mensajes eliminados
```

## 💡 Tips

- **Usa 5 matches** para pruebas rápidas (equilibrio entre completitud y velocidad)
- **Usa 10 matches** para pruebas exhaustivas
- **Verifica logs de la app** (Xcode/Logcat) para ver el flujo completo
- **Compara con WhatsApp** para validar que el comportamiento es idéntico

## 🐛 Troubleshooting

### Problema: "Matches no aparecen en app"
**Causa**: Listener de Firestore no está activo
**Solución**: Reinicia la app, asegúrate de estar en la pantalla de Matches

### Problema: "Orden incorrecto"
**Causa**: Cache desactualizado
**Solución**: Pull-to-refresh en la app o reinicia

### Problema: "Algunos matches tienen secuencia 0"
**Causa**: Script no completó correctamente
**Solución**: Limpia datos (opción 6) y vuelve a generar (opción 5)

---

**Fecha:** 10 de enero de 2026  
**Versión:** 2.0 (con escenario completo)
