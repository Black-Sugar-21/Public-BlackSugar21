# Plan de Pruebas - HomeView (Discovery/Swipe)

## 📋 Objetivo
Validar el funcionamiento completo del HomeView donde los usuarios ven perfiles para hacer swipe y conectar.

## 🎯 Alcance
- Carga y visualización de perfiles
- Múltiples fotos por perfil
- Información del perfil (nombre, edad, bio, ubicación)
- Acciones de swipe (like, dislike, superlike)
- Transiciones y animaciones
- Performance con múltiples imágenes
- Estados de carga y error

## 👥 Datos de Prueba

### Perfiles Creados
- **Cantidad:** 30 perfiles de discovery
- **Fotos por perfil:** 5 imágenes únicas
- **Total de imágenes:** 150 fotos
- **Fuente:** RandomUser.me API (URLs públicas)

### Distribución
- 50% perfiles masculinos / 50% femeninos
- Edades: 21-45 años
- User Types variados: Sugar Baby, Sugar Daddy, Sugar Mommy
- Ubicaciones: Diferentes áreas de CDMX
- Bios únicas y realistas
- 50% con verificación
- 30% con membresía premium

### Credenciales
- **Usuario principal:** Rosita (DsDSK5xqEZZXAIKxtIKyBGntw8f2)
- **Perfiles discovery:** discovery1@bstest-discovery.com hasta discovery30@bstest-discovery.com
- **Password:** Test123!

## 🧪 Casos de Prueba

### 1. Carga Inicial de Perfiles

#### TC-HV-001: Primera carga del HomeView
- **Precondición:** Usuario autenticado, primera vez en HomeView
- **Pasos:**
  1. Abrir app y hacer login
  2. Navegar a HomeView (pantalla principal)
  3. Observar carga inicial
- **Resultado esperado:**
  - Muestra loading indicator
  - Carga perfiles en menos de 3 segundos
  - Muestra primer perfil con foto principal
  - UI responsive y fluida

#### TC-HV-002: Recarga de perfiles
- **Precondición:** HomeView ya cargado previamente
- **Pasos:**
  1. Pull to refresh o recargar perfiles
  2. Observar recarga
- **Resultado esperado:**
  - Muestra loading indicator
  - Actualiza lista de perfiles
  - Mantiene posición si no hay nuevos perfiles

### 2. Visualización de Fotos Múltiples

#### TC-HV-003: Navegación entre fotos del perfil
- **Precondición:** Perfil cargado con 5 fotos
- **Pasos:**
  1. Ver perfil actual
  2. Tap en lado derecho de la imagen
  3. Repetir para ver todas las fotos
  4. Tap en lado izquierdo para retroceder
- **Resultado esperado:**
  - Transición suave entre fotos
  - Indicador de foto actual (1/5, 2/5, etc.)
  - Todas las 5 fotos se cargan correctamente
  - No hay delays perceptibles
  - Botón back funciona correctamente

#### TC-HV-004: Carga lazy de imágenes
- **Precondición:** Ver primer perfil
- **Pasos:**
  1. Observar carga de foto principal
  2. Navegar a siguiente foto
  3. Verificar tiempo de carga
- **Resultado esperado:**
  - Foto principal carga inmediatamente (desde caché si existe)
  - Fotos secundarias precargan en background
  - Transición sin blancos o loading
  - Indicador de carga solo si es necesario

### 3. Información del Perfil

#### TC-HV-005: Datos básicos del perfil
- **Precondición:** Ver cualquier perfil
- **Pasos:**
  1. Observar información mostrada
  2. Verificar todos los campos
- **Resultado esperado:**
  - Nombre visible y legible
  - Edad mostrada correctamente
  - Distancia en km (calculada desde ubicación actual)
  - Bio visible (si existe)
  - Ubicación (área de CDMX)

#### TC-HV-006: Badge de verificación y premium
- **Precondición:** Ver perfiles verificados y premium
- **Pasos:**
  1. Identificar perfiles con badge de verificación
  2. Identificar perfiles con indicador premium
- **Resultado esperado:**
  - Badge de verificado visible (checkmark azul)
  - Indicador premium visible (corona/diamante)
  - Badges no interfieren con información del perfil

#### TC-HV-007: Expandir información del perfil
- **Precondición:** Ver perfil con bio larga
- **Pasos:**
  1. Tap en área de información
  2. Ver detalles completos
  3. Scroll en detalles
- **Resultado esperado:**
  - Modal/sheet con información completa
  - Intereses mostrados
  - Ocupación visible
  - Educación mostrada
  - Altura visible
  - Scroll funciona correctamente

### 4. Acciones de Swipe

#### TC-HV-008: Swipe Left (Dislike)
- **Precondición:** Ver perfil actual
- **Pasos:**
  1. Swipe hacia la izquierda
  2. Observar animación
  3. Ver siguiente perfil
- **Resultado esperado:**
  - Animación de rechazo (X roja)
  - Perfil se descarta
  - Siguiente perfil aparece inmediatamente
  - No se crea match

#### TC-HV-009: Swipe Right (Like)
- **Precondición:** Ver perfil actual
- **Pasos:**
  1. Swipe hacia la derecha
  2. Observar animación
  3. Ver siguiente perfil
- **Resultado esperado:**
  - Animación de like (corazón verde)
  - Perfil se guarda como liked
  - Siguiente perfil aparece
  - Si hay match mutuo, muestra modal de match

#### TC-HV-010: Swipe Up (Superlike)
- **Precondición:** Usuario tiene superlikes disponibles
- **Pasos:**
  1. Swipe hacia arriba
  2. Observar animación
  3. Ver confirmación
- **Resultado esperado:**
  - Animación especial (estrella azul)
  - Consume 1 superlike
  - Actualiza contador de superlikes
  - Notifica al otro usuario

#### TC-HV-011: Botones de acción
- **Precondición:** Ver perfil actual
- **Pasos:**
  1. Tap en botón X (dislike)
  2. Tap en botón corazón (like)
  3. Tap en botón estrella (superlike)
- **Resultado esperado:**
  - Misma funcionalidad que swipes
  - Animaciones consistentes
  - Feedback visual claro

### 5. Matches y Notificaciones

#### TC-HV-012: Match mutuo
- **Precondición:** Hacer like a perfil que ya te dio like
- **Pasos:**
  1. Swipe right en perfil compatible
  2. Observar pantalla de match
  3. Interactuar con modal
- **Resultado esperado:**
  - Modal de "It's a Match!" aparece
  - Muestra ambas fotos
  - Botón "Enviar mensaje"
  - Botón "Seguir viendo"
  - Animación celebratoria

#### TC-HV-013: Límite de likes diarios
- **Precondición:** Alcanzar límite de likes (free user)
- **Pasos:**
  1. Hacer 50 likes (límite free)
  2. Intentar hacer un like más
- **Resultado esperado:**
  - Modal explicando límite alcanzado
  - Opción de upgrade a premium
  - Timer mostrando tiempo restante
  - No permite más likes hasta reset

### 6. Performance y Optimización

#### TC-HV-014: Scroll/Swipe fluido con múltiples perfiles
- **Precondición:** 30 perfiles cargados
- **Pasos:**
  1. Hacer swipe rápido por 10 perfiles consecutivos
  2. Observar fluidez
  3. Monitorear memoria
- **Resultado esperado:**
  - 60 FPS mantenido
  - Sin stuttering o lag
  - Memoria estable (no leaks)
  - Imágenes liberadas de memoria al descartar perfil

#### TC-HV-015: Carga de imágenes en red lenta
- **Precondición:** Simular red 3G lenta
- **Pasos:**
  1. Activar throttling de red
  2. Cargar perfiles
  3. Navegar entre fotos
- **Resultado esperado:**
  - Placeholder mientras carga
  - No bloquea UI
  - Error graceful si falla carga
  - Retry automático

#### TC-HV-016: Modo offline
- **Precondición:** Perfiles precargados en caché
- **Pasos:**
  1. Desactivar conexión
  2. Intentar ver perfiles
  3. Intentar hacer swipe
- **Resultado esperado:**
  - Muestra perfiles cacheados
  - Indica modo offline
  - Queue de acciones para cuando vuelva conexión
  - No crashea la app

### 7. Casos Extremos

#### TC-HV-017: Sin más perfiles disponibles
- **Precondición:** Ver todos los perfiles disponibles
- **Pasos:**
  1. Swipe en último perfil
  2. Observar estado vacío
- **Resultado esperado:**
  - Mensaje "No hay más perfiles por ahora"
  - Ilustración o empty state
  - Botón para ajustar filtros
  - Botón para recargar

#### TC-HV-018: Perfil sin fotos
- **Precondición:** Perfil con array de fotos vacío
- **Pasos:**
  1. Intentar ver perfil
- **Resultado esperado:**
  - Muestra placeholder o icono por defecto
  - Información del perfil aún visible
  - Permite hacer swipe normalmente

#### TC-HV-019: Error al cargar foto
- **Precondición:** URL de foto inválida o server error
- **Pasos:**
  1. Ver perfil con foto que falla
  2. Intentar navegar a siguiente foto
- **Resultado esperado:**
  - Muestra icono de error
  - Permite retry
  - No crashea la app
  - Puede continuar con otras fotos

#### TC-HV-020: Perfil reportado/bloqueado
- **Precondición:** Usuario bloquea un perfil
- **Pasos:**
  1. Bloquear perfil actual
  2. Observar siguiente perfil
- **Resultado esperado:**
  - Perfil bloqueado no vuelve a aparecer
  - Analytics registra el bloqueo
  - Siguiente perfil carga normalmente

### 8. Integración con Filtros

#### TC-HV-021: Aplicar filtros de distancia
- **Precondición:** Múltiples perfiles a diferentes distancias
- **Pasos:**
  1. Abrir filtros
  2. Ajustar distancia máxima a 10km
  3. Aplicar
- **Resultado esperado:**
  - Solo muestra perfiles dentro de 10km
  - Recalcula matches disponibles
  - Actualiza contador de perfiles

#### TC-HV-022: Filtros de edad
- **Precondición:** Perfiles con rangos de edad variados
- **Pasos:**
  1. Configurar filtro edad 25-35
  2. Aplicar
  3. Ver perfiles
- **Resultado esperado:**
  - Solo perfiles en rango de edad
  - Filtro persiste entre sesiones

#### TC-HV-023: Filtro de user type
- **Precondición:** Mix de Sugar Baby/Daddy/Mommy
- **Pasos:**
  1. Filtrar solo "Sugar Baby"
  2. Aplicar
- **Resultado esperado:**
  - Solo muestra Sugar Babies
  - Badge/indicador de tipo visible

### 9. Analytics y Tracking

#### TC-HV-024: Eventos de Analytics
- **Precondición:** Firebase Analytics configurado
- **Pasos:**
  1. Ver perfil (profile_view)
  2. Hacer swipe right (profile_like)
  3. Hacer swipe left (profile_pass)
  4. Ver foto 2+ (profile_photo_viewed)
  5. Expandir info (profile_details_viewed)
- **Resultado esperado:**
  - Todos los eventos logueados
  - Parámetros correctos (userId, profileId, etc.)
  - Visible en Firebase Console

## 📱 Plataformas a Probar

### iOS
- iPhone 12 Pro (iOS 16+)
- iPhone 14 Pro Max (iOS 17+)
- iPad Air (para UI adaptativo)

### Android
- Samsung Galaxy S21 (Android 12)
- Google Pixel 6 (Android 13)
- Tablet Android (para UI adaptativo)

## 🔧 Configuración Previa

### 1. Preparar Datos
```bash
cd scripts
node populate-discovery-profiles.js
```

### 2. Verificar en Firebase Console
- Firestore > users collection
- Buscar: `isDiscoveryProfile == true`
- Verificar 30 documentos creados
- Verificar campo `pictureUrls` con 5 URLs

### 3. Compilar Apps
```bash
# iOS
cd iOS && xcodebuild -scheme BlackSugar21 ...

# Android  
cd BlackSugar212 && ./gradlew assembleDebug
```

## 📊 Métricas de Éxito

### Performance
- ✅ Carga inicial < 3 segundos
- ✅ FPS constante ≥ 55
- ✅ Transiciones de foto < 300ms
- ✅ Consumo de memoria estable
- ✅ Tamaño de caché < 100MB

### Funcionalidad
- ✅ 100% de fotos cargan correctamente
- ✅ 0 crashes durante pruebas
- ✅ Todos los swipes registrados en backend
- ✅ Matches funcionan bidireccional
- ✅ Analytics captura todos los eventos

### UX
- ✅ Animaciones suaves y naturales
- ✅ Feedback visual claro en cada acción
- ✅ Estados de carga no bloquean interacción
- ✅ Errores mostrados de forma amigable
- ✅ UI responsive en diferentes tamaños

## 🐛 Bugs Conocidos y Workarounds

### Issue #1: Imágenes tardan en cargar
- **Workaround:** Implementar precarga de próximos 3 perfiles
- **Fix planeado:** Caché más agresivo con Kingfisher

### Issue #2: Animación de swipe laggy en Android
- **Workaround:** Reducir complejidad de animación en devices viejos
- **Fix planeado:** Optimizar renderizado con hardware acceleration

## 📝 Notas

- Los perfiles de discovery NO crean matches automáticamente con el usuario principal
- Para simular matches, usar el script `create-test-matches.js` después
- Las fotos son públicas desde RandomUser.me, no requieren autenticación
- Límite de likes diarios: 50 para free, ilimitado para premium

## 🧹 Cleanup

```bash
# Limpiar perfiles de discovery
node scripts/cleanup-discovery-profiles.js

# Limpiar matches de prueba
node scripts/cleanup-test-matches.js
```

## ✅ Checklist de Prueba

- [ ] TC-HV-001 a TC-HV-007: Carga y visualización
- [ ] TC-HV-008 a TC-HV-011: Swipe actions
- [ ] TC-HV-012 a TC-HV-013: Matches
- [ ] TC-HV-014 a TC-HV-016: Performance
- [ ] TC-HV-017 a TC-HV-020: Edge cases
- [ ] TC-HV-021 a TC-HV-023: Filtros
- [ ] TC-HV-024: Analytics

---

**Última actualización:** 9 de enero de 2026
**Versión del plan:** 1.0
**Responsable QA:** [Asignar]
