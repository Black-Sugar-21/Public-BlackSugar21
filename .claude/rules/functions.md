---
description: Reglas para Firebase Cloud Functions
---

# Firebase Functions

- Módulos en `functions/lib/` — uno por dominio
- Exportar handlers desde cada módulo e importar en `functions/index.js`
- Manejo de errores con try/catch en todos los handlers
- Validar parámetros de entrada antes de operar
- Usar transacciones de Firestore cuando se modifican múltiples documentos
- No hardcodear IDs ni configuración — usar Firebase config o variables de entorno
