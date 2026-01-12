# 🚀 Guía de Configuración - Agent Skills para BlackSugar21

## 📋 Resumen

Has implementado **Agent Skills** en los tres proyectos de BlackSugar21. Este documento te guía para activarlos y usarlos con GitHub Copilot.

## ✅ Lo que se ha implementado

### 📱 Android (BlackSugar212)
```
.github/skills/blacksugar-android/
├── SKILL.md                        ← Guía principal con YAML frontmatter
├── incident-runbook.md             ← Respuesta a incidentes
└── examples/
    ├── ai-integration-example.kt
    └── firebase-realtime-example.kt
```

### 🍎 iOS
```
.github/skills/blacksugar-ios/
├── SKILL.md                          ← Guía principal con YAML frontmatter
├── incident-runbook.md               ← Respuesta a incidentes
└── examples/
    ├── ai-integration-example.swift
    └── firebase-realtime-example.swift
```

### 🌐 Web (Public-BlackSugar21)
```
.github/skills/
├── blacksugar-public/
│   └── SKILL.md                      ← Sitio público y páginas legales
├── blacksugar-web/
│   ├── SKILL.md                      ← Guía principal con YAML frontmatter
│   ├── incident-runbook.md           ← Respuesta a incidentes
│   └── examples/
│       └── firebase-service-example.ts
└── blacksugar-testing/
    └── SKILL.md                      ← Sistema unificado de testing
```

## 🔧 Configuración en VS Code

### Paso 1: Habilitar Agent Skills

1. Abre VS Code
2. Presiona `⌘+,` (macOS) o `Ctrl+,` (Windows/Linux)
3. Busca: `chat.useAgentSkills`
4. **Activa la casilla** ✅

**O edita settings.json directamente:**
```json
{
  "chat.useAgentSkills": true
}
```

### Paso 2: Verificar GitHub Copilot

Asegúrate de tener:
- GitHub Copilot instalado y activo
- Sesión iniciada con tu cuenta de GitHub
- Acceso a Copilot Chat (ícono de chat en la barra lateral)

### Paso 3: Confirmar ubicación de skills

Los skills deben estar en:
- **Recomendado**: `.github/skills/` (en la raíz del proyecto)
- **Legacy**: `.claude/skills/` (también funciona para compatibilidad)

✅ Tus skills ya están en la ubicación correcta.

## 🎯 Cómo funcionan los Agent Skills

### Sistema de carga progresiva (3 niveles)

#### Nivel 1: Descubrimiento
```yaml
---
name: blacksugar-android-development
description: Comprehensive development guide for BlackSugar21 Android...
---
```
- Copilot **siempre** conoce qué skills existen
- Lee solo `name` y `description` del YAML frontmatter
- Muy ligero, no consume contexto

#### Nivel 2: Instrucciones
Cuando tu pregunta coincide con la descripción:
- Copilot carga el contenido completo de `SKILL.md`
- Las instrucciones detalladas se vuelven disponibles
- Se carga bajo demanda

#### Nivel 3: Recursos
Solo cuando Copilot los necesita:
- Archivos de ejemplo (`.kt`, `.swift`, `.ts`)
- Scripts
- Runbooks
- Otros recursos en el directorio del skill

## 💡 Ejemplos de uso

### Android Development

**Tú preguntas:**
```
¿Cómo integro el AI Wingman en mi ChatViewModel?
```

**Copilot:**
- ✅ Detecta el skill `blacksugar-android-development`
- ✅ Carga el `SKILL.md`
- ✅ Referencia `ai-integration-example.kt`
- ✅ Proporciona código específico con Hilt, Coroutines, Flow

**Resultado:** Código exacto del proyecto, no genérico.

---

### iOS Development

**Tú preguntas:**
```
Necesito escuchar mensajes en tiempo real con Firestore en SwiftUI
```

**Copilot:**
- ✅ Detecta el skill `blacksugar-ios-development`
- ✅ Carga el ejemplo `firebase-realtime-example.swift`
- ✅ Proporciona código con Combine, @Published, async/await

**Resultado:** Patrones específicos del proyecto iOS.

---

### Web Development

**Tú preguntas:**
```
¿Cómo deploy el sitio público a Firebase Hosting?
```

**Copilot:**
- ✅ Detecta el skill `blacksugar-public-repo`
- ✅ Carga la guía de deployment completa
- ✅ Proporciona comandos específicos de `deploy.sh`
- ✅ Explica configuración de `firebase.json`

**Resultado:** Instrucciones precisas de deployment.

---

**Tú preguntas:**
```
¿Cómo funcionan los scripts de testing? Necesito poblar matches de prueba
```

**Copilot:**
- ✅ Detecta el skill `blacksugar-testing-system`
- ✅ Conoce el script unificado `test-system-unified.js`
- ✅ Explica el menú interactivo y opciones
- ✅ Proporciona comandos exactos para crear matches

**Resultado:** Documentación precisa del sistema de testing.

---

### Troubleshooting

**Tú preguntas:**
```
La app Android crashea al inicio, ¿qué reviso?
```

**Copilot:**
- ✅ Carga el `incident-runbook.md` de Android
- ✅ Proporciona checklist específico
- ✅ Comandos de Firebase específicos
- ✅ Soluciones comunes del proyecto

**Resultado:** Guía paso a paso para resolver el problema.

## 🎨 Diferencia con Custom Instructions

### Custom Instructions (`.github/copilot-instructions.md`)
- ✅ Siempre aplicadas
- ✅ Definen estándares de código
- ✅ Guidelines generales
- ❌ Solo instrucciones (no recursos)

### Agent Skills (`.github/skills/`)
- ✅ Carga bajo demanda
- ✅ Tareas especializadas
- ✅ Incluye scripts, ejemplos, runbooks
- ✅ Portabilidad entre agentes
- ✅ Composición de múltiples skills

**Recomendación:** Usa ambos:
- Custom Instructions: Estilo de código, convenciones
- Agent Skills: Workflows específicos, troubleshooting

## 🔍 Verificar que funcionan

### Prueba 1: Pregunta específica de Android
```
@workspace ¿Cómo está estructurado el proyecto Android de BlackSugar21?
```

Si funciona, Copilot debería responder con detalles específicos del SKILL.md.

### Prueba 2: Pedir ejemplo de código
```
Muéstrame cómo integrar AI Wingman en ChatViewModel
```

Si funciona, debería referenciar el ejemplo específico del proyecto.

### Prueba 3: Troubleshooting
```
¿Qué hago si los AI features no funcionan?
```

Si funciona, debería usar el incident-runbook.md.

## 📊 Monitorear uso

En Copilot Chat, busca indicadores de que está usando skills:
- Referencias a archivos específicos del skill
- Código que coincide exactamente con tus ejemplos
- Menciones de procedimientos del runbook

## 🚨 Troubleshooting de Agent Skills

### Los skills no se cargan

**Problema:** Copilot no parece conocer tus skills

**Soluciones:**
1. Verifica que `chat.useAgentSkills` esté habilitado
2. Reinicia VS Code
3. Verifica que los archivos están en `.github/skills/`
4. Revisa que `SKILL.md` tiene el frontmatter YAML correcto

### Frontmatter YAML inválido

**Problema:** Error al parsear SKILL.md

**Solución:**
```yaml
---
name: skill-name-kebab-case  # ✅ Solo minúsculas y guiones
description: Clear description of when to use this skill
---
```

Evita:
- ❌ Espacios en `name`
- ❌ Mayúsculas en `name`
- ❌ Comillas mal cerradas
- ❌ Descripción > 1024 caracteres

### Skill no se activa

**Problema:** Copilot no carga el skill cuando debería

**Solución:**
Mejora la `description` para que sea más específica:

```yaml
# ❌ Muy genérico
description: Android development help

# ✅ Específico y claro
description: Comprehensive development guide for BlackSugar21 Android app. Covers MVVM architecture, Jetpack Compose UI, Firebase integration, AI features with Gemini, Hilt dependency injection, and deployment to Firebase App Distribution. Use when working with Kotlin, Android development, or troubleshooting app issues.
```

## 🔄 Actualizar skills

Para mejorar tus skills:

1. **Edita el SKILL.md**
   ```bash
   code BlackSugar212/.github/skills/blacksugar-android/SKILL.md
   ```

2. **Agrega nuevos ejemplos**
   ```bash
   # Crear nuevo ejemplo
   touch .github/skills/blacksugar-android/examples/new-pattern.kt
   ```

3. **Actualiza el runbook**
   ```bash
   # Agregar nueva sección de troubleshooting
   code .github/skills/blacksugar-android/incident-runbook.md
   ```

4. **No necesitas reiniciar**
   - Copilot detecta cambios automáticamente

## 🌐 Compartir skills

### Con tu equipo
```bash
# Los skills están en git
git add .github/skills/
git commit -m "Add Agent Skills for project"
git push
```

### Skills personales (solo para ti)
```bash
# Crea en tu home directory
mkdir -p ~/.github/skills/
cp -r .github/skills/blacksugar-android ~/.github/skills/
```

## 📚 Recursos adicionales

### Documentación oficial
- [Agent Skills en VS Code](https://code.visualstudio.com/docs/copilot/customization/agent-skills)
- [Especificación del estándar](https://agentskills.io/)

### Repositorios de la comunidad
- [Awesome Copilot Skills](https://github.com/github/awesome-copilot)
- [Anthropic Skills Reference](https://github.com/anthropics/skills)

### Mejores prácticas
- Escribe descripciones específicas y detalladas
- Incluye ejemplos de código reales del proyecto
- Mantén los skills actualizados con cambios del proyecto

---

## 📋 Resumen de Skills Implementados

### BlackSugar21 - Todos los Skills

| Skill | Plataforma | Ubicación | Líneas | Estado |
|-------|-----------|-----------|--------|--------|
| **blacksugar-android-development** | Android | BlackSugar212/.github/skills/ | 1300+ | ✅ |
| **blacksugar-ios-development** | iOS | iOS/.github/skills/ | 2000+ | ✅ |
| **blacksugar-public-repo** | Web Public | Public-BlackSugar21/.github/skills/ | 1000+ | ✅ |
| **blacksugar-web-development** | Web App | Public-BlackSugar21/.github/skills/ | 800+ | ✅ |
| **blacksugar-testing-system** | Testing | Public-BlackSugar21/.github/skills/ | 950+ | ✅ |

**Total**: 5 skills robustos cubriendo todas las plataformas y sistemas del proyecto.

---

**Última actualización**: 12 de enero de 2026  
**Versión**: 2.0 - Comprehensive Edition  
**Estado**: Production Ready ✅

- Mantén los runbooks actualizados
- Documenta comandos con ejemplos
- Usa referencias relativas a archivos: `[script](./example.js)`

## 🎉 ¡Listo!

Tus Agent Skills están configurados y listos para usar. Cada vez que trabajes en los proyectos de BlackSugar21, GitHub Copilot tendrá acceso instantáneo a toda la documentación y ejemplos específicos del proyecto.

---

**Proyecto**: BlackSugar21 (Android + iOS + Web)  
**Última actualización**: Enero 2026  
**Estándar**: Agent Skills (agentskills.io)  
**Compatibilidad**: VS Code, Copilot CLI, Copilot coding agent
