# 📱 Sistema de Notificaciones Gen2 - Estado Actual

## ✅ **Funciones Desplegadas Correctamente (Gen2)**

| Función | Versión | Trigger | Estado |
|---------|---------|---------|--------|
| onMatchCreated | v2 (Gen2) | `google.cloud.firestore.document.v1.created` | ✅ ACTIVE |
| onMessageCreated | v2 (Gen2) | `google.cloud.firestore.document.v1.created` | ✅ ACTIVE |
| sendTestNotification | v2 (Gen2) | `callable` | ✅ ACTIVE |
| updateFCMToken | v2 (Gen2) | `callable` | ✅ ACTIVE |

## ⚠️ **Problema Detectado: Triggers No Se Ejecutan**

### 🔍 **Investigación**

#### 1. **EventTrigger Configurado Correctamente**
```bash
$ gcloud functions describe onMatchCreated --region=us-central1 --gen2

eventTrigger:
  eventFilters:
  - attribute: namespace
    value: (default)
  - attribute: document
    operator: match-path-pattern
    value: matches/{matchId}
  - attribute: database
    value: (default)
  eventType: google.cloud.firestore.document.v1.created
  pubsubTopic: projects/black-sugar21/topics/eventarc-nam5-onmatchcreated-667047-648
```
✅ **Trigger configurado correctamente**
✅ **Pub/Sub topic creado**
✅ **Filtros de documento correctos**

#### 2. **EventArc Triggers**
```bash
$ gcloud eventarc triggers list --location=us-central1
Listed 0 items.
```
⚠️ **No hay triggers en EventArc** (pero puede ser normal para Gen2 Firestore)

#### 3. **Permisos**
```bash
$ gcloud projects get-iam-policy black-sugar21
```
✅ `service-706595096331@gcp-sa-pubsub.iam.gserviceaccount.com` tiene rol `roles/iam.serviceAccountTokenCreator`
✅ `706595096331-compute@developer.gserviceaccount.com` tiene rol `roles/eventarc.eventReceiver`

### 🧪 **Pruebas Realizadas**

1. ✅ **Deployment de funciones Gen2** - Exitoso
2. ✅ **Creación de matches en Firestore** - Exitoso (4 matches de prueba)
3. ❌ **Ejecución automática de Cloud Functions** - No se ejecuta
4. ❌ **Actualización de campos `notificationSent`** - No ocurre

### 💡 **Posibles Causas**

#### A. **Propagación de EventArc**
Los triggers Gen2 de Firestore pueden tardar **hasta 10-15 minutos** después del primer deployment para activarse completamente.

**Solución:** Esperar y probar nuevamente

#### B. **Región del Trigger**
Firestore está en región multi-regional `nam5` (North America), pero las funciones están en `us-central1`.

**Verificar:**
```bash
gcloud firestore databases describe --database="(default)"
```

#### C. **Service Account de Firestore**
Puede necesitar permisos adicionales para publicar eventos a Pub/Sub.

**Solución:**
```bash
gcloud projects add-iam-policy-binding black-sugar21 \
  --member=serviceAccount:service-706595096331@gcp-sa-firestore.iam.gserviceaccount.com \
  --role=roles/pubsub.publisher
```

#### D. **Firestore Triggers Gen2 en Beta**
Gen2 Firestore triggers pueden estar en estado beta/preview y requerir flags adicionales.

**Alternativa:** Usar Pub/Sub + Firestore extensions

---

## 🎯 **Próximos Pasos**

### Opción 1: Esperar Propagación (Recomendado)
```bash
# Esperar 10-15 minutos después del deployment
# Crear match de prueba
node scripts/test-notification-trigger.js

# Verificar logs
firebase functions:log --only onMatchCreated
```

### Opción 2: Agregar Permisos de Pub/Sub
```bash
gcloud projects add-iam-policy-binding black-sugar21 \
  --member=serviceAccount:service-706595096331@gcp-sa-firestore.iam.gserviceaccount.com \
  --role=roles/pubsub.publisher
```

### Opción 3: Usar Extension de Firebase
```bash
firebase ext:install firebase/firestore-send-email
# Modificar para notificaciones push
```

### Opción 4: Implementar Webhook Manual
Crear función HTTP que se llame desde cliente cuando se crea match:
```javascript
// En cliente (Android/iOS)
await createMatch(matchData);
await fetch('https://us-central1-black-sugar21.cloudfunctions.net/notifyMatch', {
  method: 'POST',
  body: JSON.stringify({matchId: newMatchId})
});
```

---

## 📊 **Verificación Actual**

```bash
# Estado de funciones
firebase functions:list

# Triggers Gen2
gcloud functions list --gen2 --region=us-central1

# Logs (cuando se ejecuten)
gcloud logging read "resource.labels.function_name=onMatchCreated" \
  --limit=10 --project=black-sugar21
```

---

## 🔧 **Comandos de Debugging**

### Ver eventos de Pub/Sub
```bash
gcloud pubsub topics list --project=black-sugar21 | grep eventarc
```

### Ver suscripciones
```bash
gcloud pubsub subscriptions list --project=black-sugar21
```

### Testear Pub/Sub manualmente
```bash
gcloud pubsub topics publish \
  eventarc-nam5-onmatchcreated-667047-648 \
  --message='{"test": "data"}'
```

---

## 📝 **Estado Final**

| Componente | Estado | Notas |
|------------|--------|-------|
| Código de funciones | ✅ Correcto | Gen2 v2 API |
| Deployment | ✅ Exitoso | 4/4 funciones |
| Configuración de triggers | ✅ Correcta | EventType y filtros OK |
| Pub/Sub topics | ✅ Creados | Topics de eventarc existen |
| Permisos IAM | ✅ Configurados | TokenCreator + EventReceiver |
| **Ejecución automática** | ❌ **NO FUNCIONA** | Requiere investigación adicional |

---

## ⏱️ **Timeline**

- **17:00** - Actualizado a Gen2 (firebase-functions 5.1.1)
- **17:05** - Desplegadas funciones Gen2 exitosamente
- **17:10** - Verificados triggers y permisos
- **17:15** - Probado con 4 matches - ninguno ejecutó función
- **17:20** - Estado actual documentado

**Siguiente acción:** Esperar 10-15 minutos para propagación de EventArc
