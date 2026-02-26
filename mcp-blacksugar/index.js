#!/usr/bin/env node
/**
 * MCP Server — BlackSugar21 Firebase Agent Skills
 * Herramientas ejecutables para auditoría y gestión de Firebase en iOS + Android
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execSync, exec } from "child_process";
import { readFileSync, existsSync } from "fs";
import { promisify } from "util";

const execAsync = promisify(exec);

// ─── Rutas del proyecto ────────────────────────────────────────────────────
const PATHS = {
  ios: "/Users/daniel/AndroidStudioProjects/iOS/black-sugar-21",
  android: "/Users/daniel/AndroidStudioProjects/BlackSugar212/app/src/main/java/com/black/sugar21",
  functions: "/Users/daniel/IdeaProjects/Public-BlackSugar21/functions/index.js",
  firestoreRules: "/Users/daniel/IdeaProjects/Public-BlackSugar21/firestore.rules",
  storageRules: "/Users/daniel/IdeaProjects/Public-BlackSugar21/storage.rules",
  projectRoot: "/Users/daniel/IdeaProjects/Public-BlackSugar21",
};

// ─── Helpers ──────────────────────────────────────────────────────────────
function run(cmd, cwd = PATHS.projectRoot) {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (e) {
    return e.stdout || e.stderr || e.message;
  }
}

function grepIOS(pattern, flags = "") {
  return run(
    `grep -rn ${flags} "${pattern}" "${PATHS.ios}" --include="*.swift" | grep -v "//.*${pattern}" | head -50`
  );
}

function grepAndroid(pattern, flags = "") {
  return run(
    `grep -rn ${flags} "${pattern}" "${PATHS.android}" --include="*.kt" | grep -v "//.*${pattern}" | head -50`
  );
}

function extractEvents(output) {
  const matches = output.match(/"([a-z_]+)"/g) || [];
  return [...new Set(matches.map((m) => m.replace(/"/g, "")))].sort();
}

// ─── MCP Server ───────────────────────────────────────────────────────────
const server = new McpServer({
  name: "mcp-blacksugar-firebase",
  version: "1.0.0",
});

// ══════════════════════════════════════════════════════════════════════════
// TOOL 1: audit_cf_alignment
// Compara las Cloud Functions llamadas por iOS vs Android
// ══════════════════════════════════════════════════════════════════════════
server.tool(
  "audit_cf_alignment",
  "Compara las Cloud Functions (httpsCallable) llamadas por iOS Swift vs Android Kotlin. Detecta funciones que existen en una plataforma pero no en la otra.",
  {},
  async () => {
    const iosRaw = run(
      `grep -rn "httpsCallable" "${PATHS.ios}" --include="*.swift" | grep '"[a-zA-Z]' | sed 's/.*"\\([a-zA-Z][a-zA-Z]*\\)".*/\\1/' | sort -u`
    );
    const androidRaw = run(
      `grep -rn 'getHttpsCallable\\|httpsCallable' "${PATHS.android}" --include="*.kt" | grep '"[a-zA-Z]' | sed 's/.*"\\([a-zA-Z][a-zA-Z]*\\)".*/\\1/' | sort -u`
    );

    const iosCFs = iosRaw.split("\n").map((s) => s.trim()).filter(Boolean);
    const androidCFs = androidRaw.split("\n").map((s) => s.trim()).filter(Boolean);

    const onlyInIOS = iosCFs.filter((cf) => !androidCFs.includes(cf));
    const onlyInAndroid = androidCFs.filter((cf) => !iosCFs.includes(cf));
    const inBoth = iosCFs.filter((cf) => androidCFs.includes(cf));

    const lines = [
      `## Auditoría Cloud Functions — ${new Date().toLocaleDateString("es-MX")}`,
      "",
      `✅ En ambas plataformas (${inBoth.length}):`,
      ...inBoth.map((cf) => `  - ${cf}`),
      "",
      onlyInIOS.length
        ? `⚠️  Solo en iOS (${onlyInIOS.length}):\n${onlyInIOS.map((cf) => `  - ${cf}`).join("\n")}`
        : "✅ Sin funciones exclusivas de iOS",
      "",
      onlyInAndroid.length
        ? `⚠️  Solo en Android (${onlyInAndroid.length}):\n${onlyInAndroid.map((cf) => `  - ${cf}`).join("\n")}`
        : "✅ Sin funciones exclusivas de Android",
    ];

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ══════════════════════════════════════════════════════════════════════════
// TOOL 2: audit_analytics_alignment
// Compara eventos Analytics entre iOS y Android
// ══════════════════════════════════════════════════════════════════════════
server.tool(
  "audit_analytics_alignment",
  "Compara los eventos de Firebase Analytics entre iOS Swift y Android Kotlin. Detecta eventos faltantes en cada plataforma.",
  {},
  async () => {
    const iosRaw = run(
      `grep -rn 'logEvent' "${PATHS.ios}" --include="*.swift" | grep '"[a-z_]*"' | sed 's/.*"\\([a-z_][a-z_]*\\)".*/\\1/' | sort -u`
    );
    const androidRaw = run(
      `grep -rn 'logEvent\\|analytics.logEvent' "${PATHS.android}" --include="*.kt" | grep '"[a-z_]*"' | sed 's/.*"\\([a-z_][a-z_]*\\)".*/\\1/' | sort -u`
    );

    const iosEvents = iosRaw.split("\n").map((s) => s.trim()).filter(Boolean);
    const androidEvents = androidRaw.split("\n").map((s) => s.trim()).filter(Boolean);

    const onlyInIOS = iosEvents.filter((e) => !androidEvents.includes(e));
    const onlyInAndroid = androidEvents.filter((e) => !iosEvents.includes(e));
    const inBoth = iosEvents.filter((e) => androidEvents.includes(e));

    const lines = [
      `## Auditoría Analytics Events — ${new Date().toLocaleDateString("es-MX")}`,
      "",
      `✅ En ambas plataformas (${inBoth.length}):`,
      ...inBoth.map((e) => `  - ${e}`),
      "",
      onlyInIOS.length
        ? `⚠️  Solo en iOS (${onlyInIOS.length}):\n${onlyInIOS.map((e) => `  - ${e}`).join("\n")}`
        : "✅ Sin eventos exclusivos de iOS",
      "",
      onlyInAndroid.length
        ? `⚠️  Solo en Android (${onlyInAndroid.length}):\n${onlyInAndroid.map((e) => `  - ${e}`).join("\n")}`
        : "✅ Sin eventos exclusivos de Android",
    ];

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ══════════════════════════════════════════════════════════════════════════
// TOOL 3: search_code
// Busca un patrón en iOS Swift y/o Android Kotlin
// ══════════════════════════════════════════════════════════════════════════
server.tool(
  "search_code",
  "Busca un patrón de texto (grep) en el código iOS Swift y/o Android Kotlin del proyecto BlackSugar21.",
  {
    pattern: z.string().describe("Patrón de búsqueda (texto o regex)"),
    platform: z
      .enum(["ios", "android", "both"])
      .default("both")
      .describe("Plataforma donde buscar"),
    isRegex: z.boolean().default(false).describe("Si el patrón es regex"),
  },
  async ({ pattern, platform, isRegex }) => {
    const flags = isRegex ? "-E" : "";
    const results = [];

    if (platform === "ios" || platform === "both") {
      const out = run(
        `grep -rn ${flags} "${pattern}" "${PATHS.ios}" --include="*.swift" | grep -v "^\\.git" | head -40`
      );
      results.push(`### iOS Swift\n\`\`\`\n${out || "(sin resultados)"}\n\`\`\``);
    }

    if (platform === "android" || platform === "both") {
      const out = run(
        `grep -rn ${flags} "${pattern}" "${PATHS.android}" --include="*.kt" | grep -v "^\\.git" | head -40`
      );
      results.push(`### Android Kotlin\n\`\`\`\n${out || "(sin resultados)"}\n\`\`\``);
    }

    return { content: [{ type: "text", text: results.join("\n\n") }] };
  }
);

// ══════════════════════════════════════════════════════════════════════════
// TOOL 4: check_firestore_field
// Verifica si un campo Firestore se escribe correctamente en ambas plataformas
// ══════════════════════════════════════════════════════════════════════════
server.tool(
  "check_firestore_field",
  "Verifica si un campo Firestore específico (ej: 'fcmToken', 'orientation', 'isEphemeral') se escribe correctamente en iOS y Android.",
  {
    fieldName: z.string().describe("Nombre exacto del campo Firestore a verificar"),
  },
  async ({ fieldName }) => {
    const iosOut = run(
      `grep -rn '"${fieldName}"' "${PATHS.ios}" --include="*.swift" | grep -v "//\|print\|Log" | head -20`
    );
    const androidOut = run(
      `grep -rn '"${fieldName}"' "${PATHS.android}" --include="*.kt" | grep -v "//\|Log\\.\\|android\\.util" | head -20`
    );

    const lines = [
      `## Campo Firestore: \`${fieldName}\``,
      "",
      "### iOS Swift",
      `\`\`\`\n${iosOut || "(no encontrado)"}\n\`\`\``,
      "",
      "### Android Kotlin",
      `\`\`\`\n${androidOut || "(no encontrado)"}\n\`\`\``,
    ];

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ══════════════════════════════════════════════════════════════════════════
// TOOL 5: read_cloud_function
// Lee la implementación de una Cloud Function específica
// ══════════════════════════════════════════════════════════════════════════
server.tool(
  "read_cloud_function",
  "Lee el código fuente de una Cloud Function específica del archivo index.js.",
  {
    functionName: z.string().describe("Nombre exacto de la Cloud Function (ej: swipeUser, sendPlaceMessage)"),
  },
  async ({ functionName }) => {
    const cfSource = existsSync(PATHS.functions)
      ? readFileSync(PATHS.functions, "utf8")
      : null;

    if (!cfSource) {
      return { content: [{ type: "text", text: "❌ No se encontró functions/index.js" }] };
    }

    // Buscar el inicio de la función
    const startPattern = new RegExp(
      `exports\\.${functionName}\\s*=|const ${functionName}\\s*=`,
      "m"
    );
    const startMatch = cfSource.search(startPattern);

    if (startMatch === -1) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Función \`${functionName}\` no encontrada en index.js\n\nBusca manualmente con:\n\`grep -n "${functionName}" ${PATHS.functions}\``,
          },
        ],
      };
    }

    // Extraer ~80 líneas a partir del match
    const snippet = cfSource.slice(startMatch, startMatch + 3000).split("\n").slice(0, 80).join("\n");

    return {
      content: [
        {
          type: "text",
          text: `## Cloud Function: \`${functionName}\`\n\n\`\`\`javascript\n${snippet}\n\`\`\``,
        },
      ],
    };
  }
);

// ══════════════════════════════════════════════════════════════════════════
// TOOL 6: deploy_firebase
// Despliega funciones o reglas a Firebase
// ══════════════════════════════════════════════════════════════════════════
server.tool(
  "deploy_firebase",
  "Despliega Cloud Functions, reglas Firestore o reglas Storage a Firebase (proyecto black-sugar21).",
  {
    target: z
      .enum(["functions", "firestore:rules", "storage", "all"])
      .describe("Qué desplegar a Firebase"),
    force: z.boolean().default(true).describe("Usar --force para omitir confirmaciones"),
  },
  async ({ target, force }) => {
    const forceFlag = force ? "--force" : "";
    const onlyFlag = target === "all" ? "" : `--only ${target}`;
    const cmd = `firebase deploy ${onlyFlag} ${forceFlag} 2>&1 | tail -20`;

    const output = run(cmd, PATHS.projectRoot);

    return {
      content: [
        {
          type: "text",
          text: `## Deploy Firebase: ${target}\n\n\`\`\`\n${output}\n\`\`\``,
        },
      ],
    };
  }
);

// ══════════════════════════════════════════════════════════════════════════
// TOOL 7: read_firestore_rules
// Lee las reglas Firestore actuales
// ══════════════════════════════════════════════════════════════════════════
server.tool(
  "read_firestore_rules",
  "Lee el contenido actual del archivo firestore.rules para auditar la seguridad.",
  {},
  async () => {
    const rules = existsSync(PATHS.firestoreRules)
      ? readFileSync(PATHS.firestoreRules, "utf8")
      : "❌ No se encontró firestore.rules";

    return {
      content: [{ type: "text", text: `## firestore.rules\n\n\`\`\`\n${rules}\n\`\`\`` }],
    };
  }
);

// ══════════════════════════════════════════════════════════════════════════
// TOOL 8: full_audit
// Auditoría completa de alineación iOS ↔ Android
// ══════════════════════════════════════════════════════════════════════════
server.tool(
  "full_audit",
  "Ejecuta una auditoría completa de alineación iOS ↔ Android: Cloud Functions, Analytics, campos críticos Firestore, y rutas Storage.",
  {},
  async () => {
    const results = [];

    // ── 1. Cloud Functions ──────────────────────────────────────────────
    const iosCFRaw = run(
      `grep -rn "httpsCallable" "${PATHS.ios}" --include="*.swift" | grep '"[a-zA-Z]' | sed 's/.*"\\([a-zA-Z][a-zA-Z]*\\)".*/\\1/' | sort -u`
    );
    const androidCFRaw = run(
      `grep -rn 'getHttpsCallable\\|httpsCallable' "${PATHS.android}" --include="*.kt" | grep '"[a-zA-Z]' | sed 's/.*"\\([a-zA-Z][a-zA-Z]*\\)".*/\\1/' | sort -u`
    );
    const iosCFs = iosCFRaw.split("\n").map((s) => s.trim()).filter(Boolean);
    const androidCFs = androidCFRaw.split("\n").map((s) => s.trim()).filter(Boolean);
    const cfOnlyIOS = iosCFs.filter((cf) => !androidCFs.includes(cf));
    const cfOnlyAndroid = androidCFs.filter((cf) => !iosCFs.includes(cf));

    results.push("## 1. Cloud Functions");
    results.push(cfOnlyIOS.length === 0 && cfOnlyAndroid.length === 0
      ? `✅ IDÉNTICAS (${iosCFs.length} CFs en ambas plataformas)`
      : `⚠️  Solo iOS: ${cfOnlyIOS.join(", ") || "ninguna"}\n⚠️  Solo Android: ${cfOnlyAndroid.join(", ") || "ninguna"}`
    );

    // ── 2. Analytics Events ─────────────────────────────────────────────
    const iosAnaRaw = run(
      `grep -rn 'logEvent' "${PATHS.ios}" --include="*.swift" | grep '"[a-z_]*"' | sed 's/.*"\\([a-z_][a-z_]*\\)".*/\\1/' | sort -u`
    );
    const androidAnaRaw = run(
      `grep -rn 'logEvent' "${PATHS.android}" --include="*.kt" | grep '"[a-z_]*"' | sed 's/.*"\\([a-z_][a-z_]*\\)".*/\\1/' | sort -u`
    );
    const iosAna = iosAnaRaw.split("\n").map((s) => s.trim()).filter(Boolean);
    const androidAna = androidAnaRaw.split("\n").map((s) => s.trim()).filter(Boolean);
    const anaOnlyIOS = iosAna.filter((e) => !androidAna.includes(e));
    const anaOnlyAndroid = androidAna.filter((e) => !iosAna.includes(e));

    results.push("\n## 2. Analytics Events");
    results.push(anaOnlyIOS.length === 0 && anaOnlyAndroid.length === 0
      ? `✅  IDÉNTICOS (${iosAna.length} eventos en ambas plataformas)`
      : `⚠️  Solo iOS: ${anaOnlyIOS.join(", ") || "ninguno"}\n⚠️  Solo Android: ${anaOnlyAndroid.join(", ") || "ninguno"}`
    );

    // ── 3. Campos críticos Firestore ────────────────────────────────────
    const criticalFields = [
      { field: "fcmToken", desc: "FCM token (camelCase)" },
      { field: '"g"', desc: "Geohash campo 'g'" },
      { field: "isEphemeral", desc: "isEphemeral en mensajes" },
      { field: "timezoneOffset", desc: "Timezone offset numérico" },
      { field: "activeChat", desc: "activeChat field" },
      { field: "createdAt", desc: "pendingNotifications.createdAt" },
    ];

    results.push("\n## 3. Campos Firestore Críticos");
    for (const { field, desc } of criticalFields) {
      const iosHas = run(`grep -rn '${field}' "${PATHS.ios}" --include="*.swift" | grep -v "//\|print" | wc -l`).trim();
      const androidHas = run(`grep -rn '${field}' "${PATHS.android}" --include="*.kt" | grep -v "//\|Log\\." | wc -l`).trim();
      const iosCount = parseInt(iosHas) || 0;
      const androidCount = parseInt(androidHas) || 0;
      const ok = iosCount > 0 && androidCount > 0;
      results.push(`${ok ? "✅" : "⚠️ "} ${desc}: iOS(${iosCount}) Android(${androidCount})`);
    }

    // ── 4. Remote Config ────────────────────────────────────────────────
    results.push("\n## 4. Remote Config");
    const iosRCRaw = run(`grep -rn "forKey\\|configValue\\.stringValue\\|boolValue\\|numberValue" "${PATHS.ios}" --include="*.swift" | wc -l`).trim();
    const androidRCRaw = run(`grep -rn 'getString\\|getBoolean\\|getLong\\|getDouble' "${PATHS.android}/core/config" --include="*.kt" | wc -l`).trim();
    results.push(`iOS usa Remote Config: ${parseInt(iosRCRaw) > 0 ? "✅" : "❌"} | Android: ${parseInt(androidRCRaw) > 0 ? "✅" : "❌"}`);

    // ── Resumen ─────────────────────────────────────────────────────────
    results.push(`\n---\n⏱️  Auditoría completada: ${new Date().toLocaleString("es-MX")}`);

    return { content: [{ type: "text", text: results.join("\n") }] };
  }
);

// ══════════════════════════════════════════════════════════════════════════
// TOOL 9: check_orientation_values
// Verifica que los valores de orientation sean siempre lowercase
// ══════════════════════════════════════════════════════════════════════════
server.tool(
  "check_orientation_values",
  "Verifica que el campo 'orientation' se escriba siempre en lowercase ('men', 'women', 'both') en iOS y Android.",
  {},
  async () => {
    const iosOut = run(
      `grep -rn '"men"\\|"women"\\|"both"\\|orientation' "${PATHS.ios}" --include="*.swift" | grep -v "//\|print\|import" | grep "orientation\\|men\\|women\\|both" | head -20`
    );
    const androidOut = run(
      `grep -rn '"men"\\|"women"\\|"both"\\|orientation' "${PATHS.android}" --include="*.kt" | grep -v "//\|Log\\.\\.\\|import" | head -20`
    );

    return {
      content: [
        {
          type: "text",
          text: [
            "## Verificación campo `orientation`",
            "",
            "**Regla:** SIEMPRE lowercase `\"men\"` | `\"women\"` | `\"both\"`",
            "",
            "### iOS Swift",
            `\`\`\`\n${iosOut || "(no encontrado)"}\n\`\`\``,
            "",
            "### Android Kotlin",
            `\`\`\`\n${androidOut || "(no encontrado)"}\n\`\`\``,
          ].join("\n"),
        },
      ],
    };
  }
);

// ══════════════════════════════════════════════════════════════════════════
// TOOL 10: list_project_info
// Información del proyecto Firebase
// ══════════════════════════════════════════════════════════════════════════
server.tool(
  "list_project_info",
  "Muestra la información del proyecto BlackSugar21: Firebase project, rutas, CFs activas.",
  {},
  async () => {
    const cfCount = run(
      `grep -c "exports\\." "${PATHS.functions}" 2>/dev/null || echo "0"`
    ).trim();
    const iosFiles = run(
      `find "${PATHS.ios}" -name "*.swift" | wc -l`
    ).trim();
    const androidFiles = run(
      `find "${PATHS.android}" -name "*.kt" | wc -l`
    ).trim();

    const info = [
      "## BlackSugar21 — Información del Proyecto",
      "",
      "| Item | Valor |",
      "|---|---|",
      "| Firebase Project | `black-sugar21` |",
      "| CF Región | `us-central1` |",
      "| iOS Bundle ID | `com.blacksugar21.app` |",
      "| Android Package | `com.black.sugar21` |",
      `| Cloud Functions | ~${cfCount.trim()} exportadas |`,
      `| Archivos Swift (iOS) | ${iosFiles.trim()} |`,
      `| Archivos Kotlin (Android) | ${androidFiles.trim()} |`,
      "",
      "## Rutas clave",
      `- iOS: \`${PATHS.ios}\``,
      `- Android: \`${PATHS.android}\``,
      `- Cloud Functions: \`${PATHS.functions}\``,
      `- Firestore Rules: \`${PATHS.firestoreRules}\``,
    ];

    return { content: [{ type: "text", text: info.join("\n") }] };
  }
);

// ─── Iniciar el servidor ──────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
