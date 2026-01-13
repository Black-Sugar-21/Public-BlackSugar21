# Testing Scripts - Instrucciones de Setup Rápido

## Setup en 3 Pasos

### 1. Instalar Firebase Admin SDK
```bash
cd /Users/daniel/IdeaProjects/Public-BlackSugar21
npm install firebase-admin --save-dev
```

### 2. Obtener Service Account Key

1. Ir a: https://console.firebase.google.com/project/black-sugar-21/settings/serviceaccounts/adminsdk
2. Click en **"Generate New Private Key"**
3. Guardar como: `scripts/serviceAccountKey.json`

### 3. Ejecutar Scripts

**Poblar 20 matches de prueba:**
```bash
npm run populate-test-data
```

**Limpiar datos de prueba:**
```bash
npm run cleanup-test-data
```

## Credenciales de Usuarios de Prueba

- **Emails**: `test1@bstest.com` hasta `test20@bstest.com`
- **Password**: `Test123!`

## Más Información

Ver [scripts/README.md](./README.md) para documentación completa.
