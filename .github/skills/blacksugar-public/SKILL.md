---
name: blacksugar-public-repo
description: Repositorio público de BlackSugar21 - landing pages, políticas legales, sitio web informativo con Angular 21, Firebase Hosting, documentación corporativa multi-idioma (es/en/pt), scripts de administración y testing unificado. Usar cuando se trabaje con el sitio público, páginas legales, deployment a Firebase Hosting, o gestión de documentación corporativa.
---

# BlackSugar21 - Public Repository Skill

## Información del Proyecto

**Nombre**: Public-BlackSugar21  
**Tipo**: Sitio web público informativo  
**Framework**: Angular 21 (standalone components)  
**Hosting**: Firebase Hosting  
**URL Producción**: https://black-sugar21.web.app  
**Idiomas**: Español (es), English (en), Português (pt)  
**Estado**: Production Ready ✅

## Propósito y Alcance

Este repositorio contiene el sitio web público de BlackSugar21, enfocado en:
- **Páginas legales y corporativas**: Términos, Privacidad, Eliminación de datos, Seguridad infantil
- **Políticas de moderación**: Transparencia sobre moderación de contenido
- **Landing pages**: Información sobre la app para usuarios potenciales
- **Cumplimiento legal**: Requisitos de Google Play y App Store
- **Scripts de administración**: Herramientas de testing y gestión de datos

### Diferencias con otros repositorios
- **Public-BlackSugar21**: Sitio web público (este repo)
- **BlackSugar212**: App Android (Kotlin/Jetpack Compose)
- **iOS**: App iOS (Swift/SwiftUI)

## Arquitectura del Proyecto

### Estructura de Directorios

```
Public-BlackSugar21/
├── .github/
│   ├── skills/                       # Agent Skills
│   │   ├── blacksugar-web/          # Desarrollo web Angular
│   │   ├── blacksugar-testing/      # Sistema de testing
│   │   └── blacksugar-public/       # Este skill
│   └── workflows/                    # GitHub Actions
│
├── src/
│   ├── app/
│   │   ├── pages/                   # Páginas públicas
│   │   │   ├── terms/              # Términos de uso
│   │   │   ├── privacy/            # Política de privacidad
│   │   │   ├── data-deletion/      # Eliminación de datos
│   │   │   └── safety-standards/   # Seguridad infantil
│   │   ├── components/              # Componentes reutilizables
│   │   │   └── moderation-policy/  # Política de moderación
│   │   ├── app.routes.ts           # Configuración de rutas
│   │   ├── app.config.ts           # Configuración de app
│   │   ├── firebase.config.ts      # Configuración Firebase
│   │   ├── firebase.service.ts     # Servicio Firebase
│   │   └── translation.service.ts  # Servicio i18n
│   ├── index.html                   # HTML principal
│   └── styles.css                   # Estilos globales
│
├── scripts/                          # Scripts de administración
│   ├── test-system-unified.js       # Sistema unificado de testing
│   ├── generate-avatar-urls.js      # Generación de URLs de avatares
│   ├── optimize-matches-and-images.js # Optimización de datos
│   ├── upload-test-avatars.js       # Subida de avatares de prueba
│   ├── get-user-email.js           # Consulta de emails de usuarios
│   └── serviceAccountKey.json       # Service account de Firebase
│
├── public/                          # Assets estáticos
│   ├── favicon.ico
│   ├── browserconfig.xml
│   └── site.webmanifest
│
├── firebase.json                    # Configuración Firebase
├── firestore.rules                  # Reglas de Firestore
├── firestore.indexes.json          # Índices de Firestore
├── angular.json                     # Configuración Angular
├── package.json                     # Dependencias npm
├── tsconfig.json                    # Configuración TypeScript
│
└── Documentation/
    ├── DEPLOYMENT.md                # Guía de deployment
    ├── FIREBASE_SETUP.md           # Setup de Firebase
    ├── APP_CHECK_WEB_SETUP.md      # Configuración App Check
    ├── DOCUMENTATION_INDEX.md       # Índice de documentación
    └── README.md                    # Documentación principal
```

## Stack Tecnológico

### Frontend
- **Angular 21**: Framework principal con standalone components
- **TypeScript 5.9**: Lenguaje de desarrollo
- **RxJS 7.8**: Programación reactiva
- **CSS**: Estilos personalizados

### Backend/Infraestructura
- **Firebase Hosting**: Hosting de aplicación web
- **Firebase Firestore**: Base de datos (solo lectura desde web)
- **Firebase Storage**: Almacenamiento de imágenes
- **Firebase Admin SDK**: Scripts de administración

### Herramientas de Desarrollo
- **Angular CLI 21**: Scaffolding y build
- **Node.js**: Scripts de administración
- **Firebase CLI**: Deployment
- **Vitest**: Testing
- **Prettier**: Formateo de código

## Configuración del Proyecto

### package.json - Scripts Disponibles

```json
{
  "scripts": {
    "ng": "ng",
    "start": "ng serve",                          // Dev server en localhost:4200
    "build": "ng build",                          // Build de desarrollo
    "build:prod": "ng build --configuration production", // Build de producción
    "watch": "ng build --watch --configuration development",
    "test": "ng test",                            // Unit tests
    "deploy": "npm run build:prod && firebase deploy", // Deploy completo
    "deploy:hosting": "npm run build:prod && firebase deploy --only hosting",
    "populate-test-data": "node scripts/populate-test-matches.js",
    "cleanup-test-data": "node scripts/cleanup-test-matches.js"
  }
}
```

### Firebase Configuration

```json
// firebase.json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "hosting": {
    "site": "black-sugar21",
    "public": "dist/Public-BlackSugar21/browser",
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"  // SPA routing
      }
    ],
    "headers": [
      {
        "source": "**/*.@(jpg|jpeg|gif|png|svg|webp|ico)",
        "headers": [{"key": "Cache-Control", "value": "max-age=31536000"}]
      },
      {
        "source": "**/*.@(js|css)",
        "headers": [{"key": "Cache-Control", "value": "max-age=31536000"}]
      }
    ]
  }
}
```

## Páginas Públicas

### 1. Terms of Service (Términos de Uso)
**Ruta**: `/terms`  
**Componente**: `TermsComponent`  
**Contenido**:
- Aceptación de términos
- Uso de la aplicación
- Cuentas de usuario
- Contenido y conducta prohibida
- Propiedad intelectual
- Cancelación de cuenta
- Limitación de responsabilidad
- Jurisdicción

**Implementación**:
```typescript
// src/app/pages/terms/terms.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../translation.service';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './terms.component.html',
  styleUrls: ['./terms.component.css']
})
export class TermsComponent {
  currentLang$ = this.translationService.currentLang$;

  constructor(private translationService: TranslationService) {}

  changeLanguage(lang: string) {
    this.translationService.setLanguage(lang);
  }
}
```

### 2. Privacy Policy (Política de Privacidad)
**Ruta**: `/privacy`  
**Componente**: `PrivacyComponent`  
**Contenido**:
- Información recopilada (nombre, email, fotos, ubicación)
- Uso de datos (matching, comunicación, análisis)
- Compartición de datos (solo con matches autorizados)
- Seguridad de datos (Firebase Authentication, cifrado)
- Derechos del usuario (acceso, rectificación, eliminación)
- Cumplimiento GDPR/CCPA

### 3. Data Deletion (Eliminación de Datos)
**Ruta**: `/data-deletion`  
**Componente**: `DataDeletionComponent`  
**Propósito**: Requisito de Meta/Facebook para apps sociales  
**Contenido**:
- Instrucciones paso a paso para eliminar cuenta
- Qué datos se eliminan (perfil, fotos, mensajes, matches)
- Qué datos se conservan (logs de seguridad por 90 días)
- Proceso de verificación y confirmación
- Tiempo de procesamiento (24-48 horas)

**Implementación**:
```typescript
// src/app/pages/data-deletion/data-deletion.component.ts
export class DataDeletionComponent {
  steps = [
    {
      number: 1,
      title: 'Abrir la app BlackSugar21',
      description: 'Inicia sesión en tu cuenta'
    },
    {
      number: 2,
      title: 'Ir a Configuración',
      description: 'Toca el ícono de perfil y selecciona "Configuración"'
    },
    {
      number: 3,
      title: 'Eliminar cuenta',
      description: 'Selecciona "Eliminar mi cuenta" y confirma'
    }
  ];

  dataDeleted = [
    'Perfil de usuario completo',
    'Todas las fotos subidas',
    'Mensajes y conversaciones',
    'Matches y conexiones',
    'Preferencias y configuración'
  ];

  dataRetained = [
    'Logs de seguridad (90 días)',
    'Reportes de abuso (cumplimiento legal)',
    'Datos agregados y anonimizados (analytics)'
  ];
}
```

### 4. Safety Standards (Estándares de Seguridad)
**Ruta**: `/safety-standards`  
**Componente**: `SafetyStandardsComponent`  
**Propósito**: Cumplimiento de políticas de protección infantil de Google Play/App Store  
**Contenido**:
- Edad mínima: 18+ años estricto
- Verificación de edad al registro
- Moderación proactiva de contenido
- Sistema de reportes y bloqueo
- Protección contra grooming y explotación
- Colaboración con autoridades

### 5. Moderation Policy (Política de Moderación)
**Ruta**: `/moderation-policy` o `/politicas-moderacion`  
**Componente**: `ModerationPolicyComponent`  
**Contenido**:
- Contenido prohibido (violencia, spam, desnudos no consensuados)
- Sistema de reportes
- Proceso de revisión
- Sanciones (warnings, suspensión, ban permanente)
- Apelaciones

## Internacionalización (i18n)

### TranslationService

```typescript
// src/app/translation.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  private currentLangSubject = new BehaviorSubject<string>(
    this.detectLanguage()
  );
  currentLang$ = this.currentLangSubject.asObservable();

  private translations: Record<string, any> = {
    es: {
      nav: {
        terms: 'Términos',
        privacy: 'Privacidad',
        dataDeletion: 'Eliminación de Datos',
        safety: 'Seguridad'
      },
      common: {
        lastUpdated: 'Última actualización',
        contact: 'Contacto'
      }
    },
    en: {
      nav: {
        terms: 'Terms',
        privacy: 'Privacy',
        dataDeletion: 'Data Deletion',
        safety: 'Safety'
      },
      common: {
        lastUpdated: 'Last updated',
        contact: 'Contact'
      }
    },
    pt: {
      nav: {
        terms: 'Termos',
        privacy: 'Privacidade',
        dataDeletion: 'Exclusão de Dados',
        safety: 'Segurança'
      },
      common: {
        lastUpdated: 'Última atualização',
        contact: 'Contato'
      }
    }
  };

  private detectLanguage(): string {
    const browserLang = navigator.language.toLowerCase();
    if (browserLang.startsWith('es')) return 'es';
    if (browserLang.startsWith('pt')) return 'pt';
    return 'en';
  }

  setLanguage(lang: string) {
    this.currentLangSubject.next(lang);
    localStorage.setItem('preferredLanguage', lang);
  }

  getCurrentLanguage(): string {
    return this.currentLangSubject.value;
  }

  translate(key: string): string {
    const lang = this.getCurrentLanguage();
    const keys = key.split('.');
    let value = this.translations[lang];
    
    for (const k of keys) {
      value = value?.[k];
    }
    
    return value || key;
  }
}
```

### Uso en componentes

```typescript
// En template
<h1>{{ currentLang$ | async === 'es' ? 'Términos de Uso' : 
         currentLang$ | async === 'en' ? 'Terms of Service' : 
         'Termos de Uso' }}</h1>

// En TypeScript
this.title = this.translationService.translate('nav.terms');
```

## Routing Configuration

```typescript
// src/app/app.routes.ts
import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'moderation-policy',
    component: ModerationPolicyComponent,
    title: 'Políticas de Moderación - Black Sugar 21'
  },
  {
    path: 'politicas-moderacion',
    component: ModerationPolicyComponent,
    title: 'Políticas de Moderación - Black Sugar 21'
  },
  {
    path: 'terms',
    component: TermsComponent,
    title: 'Términos de Uso - Black Sugar 21'
  },
  {
    path: 'privacy',
    component: PrivacyComponent,
    title: 'Política de Privacidad - Black Sugar 21'
  },
  {
    path: 'data-deletion',
    component: DataDeletionComponent,
    title: 'Eliminación de Datos - Black Sugar 21'
  },
  {
    path: 'safety-standards',
    component: SafetyStandardsComponent,
    title: 'Estándares de Seguridad Infantil - Black Sugar 21'
  },
  {
    path: '',
    redirectTo: '/terms',
    pathMatch: 'full'
  },
  {
    path: '**',
    redirectTo: '/terms'
  }
];
```

## Scripts de Administración

### Sistema Unificado de Testing

El repositorio público contiene el sistema maestro de testing que gestiona datos de prueba para todas las plataformas (Web, Android, iOS).

**Script**: `scripts/test-system-unified.js`  
**Documentación**: `scripts/TEST_SYSTEM_UNIFIED_README.md`

#### Características principales:
- **Multi-usuario**: Selector de usuario de prueba (Daniel/Rosita)
- **Gestión completa**: Matches, discovery profiles, mensajes, verificación
- **Limpieza selectiva**: 4 opciones de cleanup
- **Integración Firebase**: Admin SDK con queries optimizados

#### Menú interactivo:

```
=== BLACKSUGAR21 TEST SYSTEM ===

Usuario activo: Daniel (sU8xLiwQWNXmbYdR63p1uO6TSm72)

📊 GESTIÓN DE MATCHES
1. Ver matches existentes
2. Crear matches de prueba
3. Enviar mensajes de prueba

🔍 DISCOVERY Y PERFILES
4. Crear perfiles de discovery
5. Ver perfiles de discovery

✅ VERIFICACIÓN
6. Verificar sistema completo
7. Verificar datos de Daniel

🧹 LIMPIEZA
8. Limpieza completa
9. Limpiar solo matches
10. Limpiar solo discovery
11. Mantener solo escenario específico

⚙️  CONFIGURACIÓN
0. Cambiar usuario de prueba
x. Salir
```

#### Uso:

```bash
# Desde el directorio scripts/
cd /Users/daniel/IdeaProjects/Public-BlackSugar21/scripts

# Ejecutar el sistema
node test-system-unified.js

# Opciones populares:
# - Opción 1: Ver matches existentes de Daniel
# - Opción 2: Crear matches de prueba (10 matches con imágenes reales)
# - Opción 6: Verificar que todo funciona correctamente
# - Opción 8: Limpiar todo y empezar de cero
```

### Otros Scripts Útiles

#### 1. generate-avatar-urls.js
Genera URLs de avatares aleatorios de Unsplash para pruebas.

```bash
node scripts/generate-avatar-urls.js
# Crea test-avatars-urls.json con 100+ URLs
```

#### 2. upload-test-avatars.js
Sube avatares de prueba a Firebase Storage.

```bash
node scripts/upload-test-avatars.js
# Descarga imágenes de Unsplash y las sube a Storage
```

#### 3. optimize-matches-and-images.js
Optimiza matches existentes asegurando imágenes reales.

```bash
node scripts/optimize-matches-and-images.js
# Actualiza matches con imágenes de Storage en lugar de Unsplash
```

#### 4. get-user-email.js
Consulta el email de un usuario por su UID.

```bash
node scripts/get-user-email.js sU8xLiwQWNXmbYdR63p1uO6TSm72
# Devuelve: danielhidalgosiglo21@gmail.com
```

## Deployment a Firebase Hosting

### Opción 1: Script Automatizado (Recomendado)

```bash
./deploy.sh
```

Este script automáticamente:
1. ✅ Verifica Firebase CLI instalado
2. ✅ Verifica autenticación
3. ✅ Construye la app para producción
4. ✅ Despliega en Firebase Hosting

### Opción 2: Comandos npm

```bash
# Deployment completo (Hosting + Firestore rules)
npm run deploy

# Solo Hosting (más rápido)
npm run deploy:hosting
```

### Opción 3: Manual paso a paso

```bash
# 1. Instalar Firebase CLI (primera vez)
npm install -g firebase-tools

# 2. Autenticarse (primera vez)
firebase login

# 3. Construir para producción
npm run build:prod

# 4. Desplegar
firebase deploy --only hosting
```

### Verificación post-deployment

```bash
# Abrir el sitio en producción
open https://black-sugar21.web.app

# Ver logs de hosting
firebase hosting:channel:list

# Rollback si es necesario
firebase hosting:clone SOURCE_SITE_ID:SOURCE_CHANNEL_ID TARGET_SITE_ID:live
```

## Firebase Configuration

### Environment Setup

```typescript
// src/app/firebase.config.ts
export const firebaseConfig = {
  apiKey: "AIzaSyBFqRsCwZkPXC7rARbxq-CfyLXW0fH1234",
  authDomain: "blacksugar21.firebaseapp.com",
  projectId: "blacksugar21",
  storageBucket: "blacksugar21.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};
```

### Firestore Rules

```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection - read own profile, update own profile
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Matches - read if participant
    match /matches/{matchId} {
      allow read: if request.auth != null && 
        (resource.data.userId1 == request.auth.uid || 
         resource.data.userId2 == request.auth.uid);
      allow write: if request.auth != null && 
        (resource.data.userId1 == request.auth.uid || 
         resource.data.userId2 == request.auth.uid);
    }
    
    // Messages - read if match participant
    match /messages/{messageId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && 
        request.resource.data.senderId == request.auth.uid;
    }
    
    // Public profiles - read only
    match /publicProfiles/{userId} {
      allow read: if request.auth != null;
      allow write: if false;
    }
  }
}
```

### Firestore Indexes

```json
// firestore.indexes.json
{
  "indexes": [
    {
      "collectionGroup": "matches",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "userId1", "order": "ASCENDING"},
        {"fieldPath": "timestamp", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "matches",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "userId2", "order": "ASCENDING"},
        {"fieldPath": "timestamp", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "messages",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "matchId", "order": "ASCENDING"},
        {"fieldPath": "timestamp", "order": "DESCENDING"}
      ]
    }
  ]
}
```

## Patrones de Desarrollo Angular

### Standalone Components (Angular 21)

```typescript
// Componente moderno sin NgModule
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-navigation',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <nav>
      <a routerLink="/terms">{{ 'nav.terms' | translate }}</a>
      <a routerLink="/privacy">{{ 'nav.privacy' | translate }}</a>
      <a routerLink="/data-deletion">{{ 'nav.dataDeletion' | translate }}</a>
    </nav>
  `
})
export class NavigationComponent {}
```

### Service Pattern con RxJS

```typescript
// src/app/firebase.service.ts
import { Injectable } from '@angular/core';
import { 
  Firestore, 
  collection, 
  query, 
  where, 
  getDocs 
} from 'firebase/firestore';
import { Observable, from, map } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {
  constructor(private firestore: Firestore) {}

  getMatches(userId: string): Observable<Match[]> {
    const matchesRef = collection(this.firestore, 'matches');
    
    // Query ambas direcciones
    const q1 = query(matchesRef, where('userId1', '==', userId));
    const q2 = query(matchesRef, where('userId2', '==', userId));

    return from(
      Promise.all([getDocs(q1), getDocs(q2)])
    ).pipe(
      map(([snapshot1, snapshot2]) => {
        const matches: Match[] = [];
        snapshot1.forEach(doc => matches.push(doc.data() as Match));
        snapshot2.forEach(doc => matches.push(doc.data() as Match));
        return matches;
      })
    );
  }
}
```

### Signals (Angular 21+)

```typescript
import { Component, signal, computed } from '@angular/core';

@Component({
  selector: 'app-user-profile',
  template: `
    <div>
      <p>Nombre: {{ fullName() }}</p>
      <p>Edad: {{ age() }}</p>
      <button (click)="incrementAge()">Cumpleaños</button>
    </div>
  `
})
export class UserProfileComponent {
  firstName = signal('Daniel');
  lastName = signal('Hidalgo');
  age = signal(30);
  
  // Computed signal
  fullName = computed(() => 
    `${this.firstName()} ${this.lastName()}`
  );
  
  incrementAge() {
    this.age.update(current => current + 1);
  }
}
```

## Testing

### Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'node_modules/',
        'src/test-setup.ts',
      ]
    }
  }
});
```

### Unit Test Example

```typescript
// src/app/translation.service.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { TranslationService } from './translation.service';

describe('TranslationService', () => {
  let service: TranslationService;

  beforeEach(() => {
    service = new TranslationService();
  });

  it('should detect browser language', () => {
    expect(['es', 'en', 'pt']).toContain(
      service.getCurrentLanguage()
    );
  });

  it('should change language', () => {
    service.setLanguage('pt');
    expect(service.getCurrentLanguage()).toBe('pt');
  });

  it('should translate keys correctly', () => {
    service.setLanguage('es');
    expect(service.translate('nav.terms')).toBe('Términos');
    
    service.setLanguage('en');
    expect(service.translate('nav.terms')).toBe('Terms');
  });
});
```

### Component Testing

```typescript
// src/app/pages/terms/terms.component.spec.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/angular';
import { TermsComponent } from './terms.component';

describe('TermsComponent', () => {
  it('should render terms title', async () => {
    await render(TermsComponent);
    
    expect(
      screen.getByText(/términos de uso/i)
    ).toBeDefined();
  });

  it('should display all sections', async () => {
    const { container } = await render(TermsComponent);
    
    const sections = container.querySelectorAll('section');
    expect(sections.length).toBeGreaterThan(5);
  });
});
```

## Performance Optimization

### Lazy Loading Routes

```typescript
// app.routes.ts
export const routes: Routes = [
  {
    path: 'terms',
    loadComponent: () => 
      import('./pages/terms/terms.component').then(m => m.TermsComponent)
  },
  {
    path: 'privacy',
    loadComponent: () => 
      import('./pages/privacy/privacy.component').then(m => m.PrivacyComponent)
  }
];
```

### OnPush Change Detection

```typescript
import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-terms',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `...`
})
export class TermsComponent {}
```

### Bundle Optimization

```bash
# Analizar bundle size
npm run build:prod -- --stats-json
npx webpack-bundle-analyzer dist/Public-BlackSugar21/browser/stats.json

# Resultados esperados:
# - main.js: ~200KB (gzipped ~60KB)
# - polyfills.js: ~35KB (gzipped ~12KB)
# - styles.css: ~5KB (gzipped ~2KB)
```

## Troubleshooting

### Error: Firebase not initialized

```typescript
// Verificar en app.config.ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideFirestore(() => getFirestore())
  ]
};
```

### Error: Cannot find module 'firebase/app'

```bash
# Reinstalar dependencias
rm -rf node_modules package-lock.json
npm install
```

### Error: 404 on refresh in production

Esto es normal en SPA. Firebase Hosting ya está configurado con rewrites:

```json
"rewrites": [
  {
    "source": "**",
    "destination": "/index.html"
  }
]
```

### Error: CORS en Firebase Storage

```bash
# Crear cors.json
echo '[
  {
    "origin": ["https://black-sugar21.web.app"],
    "method": ["GET"],
    "maxAgeSeconds": 3600
  }
]' > cors.json

# Aplicar configuración
gsutil cors set cors.json gs://blacksugar21.firebasestorage.app
```

### Build lento en producción

```bash
# Verificar caché de Angular
ng cache clean

# Reconstruir
npm run build:prod

# Si persiste, aumentar memoria de Node.js
NODE_OPTIONS=--max_old_space_size=4096 npm run build:prod
```

## CI/CD con GitHub Actions

### Workflow de Deployment Automático

```yaml
# .github/workflows/deploy.yml
name: Deploy to Firebase Hosting

on:
  push:
    branches:
      - main
  pull_request:

jobs:
  build_and_deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build:prod
      
      - name: Deploy to Firebase
        if: github.ref == 'refs/heads/main'
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'
          channelId: live
          projectId: blacksugar21
```

## Security Best Practices

### Content Security Policy

```html
<!-- src/index.html -->
<head>
  <meta http-equiv="Content-Security-Policy" 
        content="default-src 'self'; 
                 script-src 'self' 'unsafe-inline' https://apis.google.com;
                 style-src 'self' 'unsafe-inline';
                 img-src 'self' data: https:;
                 connect-src 'self' https://*.firebaseio.com https://*.googleapis.com;">
</head>
```

### Environment Variables

```typescript
// Nunca commitear credenciales reales
// Usar variables de entorno en producción

// .env (gitignored)
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_PROJECT_ID=blacksugar21

// Acceder en código
import.meta.env.VITE_FIREBASE_API_KEY
```

### Firebase App Check (Web)

```typescript
// app.config.ts
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFirebaseApp(() => {
      const app = initializeApp(firebaseConfig);
      
      // App Check para proteger APIs
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider('your-recaptcha-site-key'),
        isTokenAutoRefreshEnabled: true
      });
      
      return app;
    })
  ]
};
```

## Documentación Relacionada

### Documentos en el proyecto:
- `DEPLOYMENT.md` - Guía completa de deployment
- `FIREBASE_SETUP.md` - Configuración inicial de Firebase
- `APP_CHECK_WEB_SETUP.md` - Setup de App Check
- `DOCUMENTATION_INDEX.md` - Índice de toda la documentación
- `scripts/TEST_SYSTEM_UNIFIED_README.md` - Sistema de testing
- `scripts/SYSTEM_MAP.md` - Mapa del sistema de scripts

### Skills relacionados:
- **blacksugar-web-development** - Desarrollo Angular avanzado
- **blacksugar-testing-system** - Sistema unificado de testing
- **blacksugar-android-development** - App Android
- **blacksugar-ios-development** - App iOS

## Comandos de Referencia Rápida

```bash
# Desarrollo
npm start                          # Dev server localhost:4200
npm run watch                      # Build continuo

# Testing
npm test                           # Unit tests
node scripts/test-system-unified.js # Testing de datos

# Build
npm run build                      # Development build
npm run build:prod                 # Production build

# Deployment
./deploy.sh                        # Deployment automático
npm run deploy                     # Deploy completo
npm run deploy:hosting             # Solo hosting

# Firebase
firebase login                     # Autenticarse
firebase projects:list             # Ver proyectos
firebase hosting:channel:list      # Ver canales
firebase open hosting:site         # Abrir sitio

# Utilidades
ng generate component name         # Crear componente
ng generate service name           # Crear servicio
ng cache clean                     # Limpiar caché de Angular
```

## Support & Resources

- **Firebase Console**: https://console.firebase.google.com/project/blacksugar21
- **Sitio en producción**: https://black-sugar21.web.app
- **Angular Documentation**: https://angular.dev/
- **Firebase Web SDK**: https://firebase.google.com/docs/web/setup
- **RxJS**: https://rxjs.dev/
- **TypeScript**: https://www.typescriptlang.org/

---

**Version**: 1.0 - Comprehensive Public Repository Edition  
**Last Updated**: 12 de enero de 2026  
**Project**: Public-BlackSugar21  
**Status**: Production Ready ✅
