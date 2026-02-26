#!/usr/bin/env node

/**
 * 📊 Verificación de Campos Críticos en test-master.js
 * 
 * Este script analiza el código de test-master.js y muestra
 * visualmente cómo cada función configura los campos críticos.
 */

const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Leer test-master.js
const testMasterPath = path.join(__dirname, 'test-master.js');
const content = fs.readFileSync(testMasterPath, 'utf8');

// Buscar las 3 funciones principales
const functions = [
  {
    name: 'createMatchesWithNotifications',
    description: 'Crear matches con notificaciones automáticas',
    purpose: 'Crear usuarios femeninos (SUGAR_MOMMY/SUGAR_BABY) y emparejarlos con Daniel',
  },
  {
    name: 'createDiscoveryProfiles',
    description: 'Crear perfiles para HomeView/Swipe',
    purpose: 'Crear perfiles variados (hombres/mujeres) para que aparezcan en el feed',
  },
  {
    name: 'fixDiscoveryProfiles',
    description: 'Corregir perfiles de discovery',
    purpose: 'Migrar perfiles existentes a collection "users" con campos correctos',
  }
];

const criticalFields = [
  {
    name: 'accountStatus',
    expected: "'active'",
    icon: '🔥',
    severity: 'CRÍTICO',
    impact: 'iOS ELIMINA el match si no es "active"'
  },
  {
    name: 'paused',
    expected: 'false',
    icon: '⚠️',
    severity: 'IMPORTANTE',
    impact: 'iOS OCULTA el match si es true'
  },
  {
    name: 'blocked',
    expected: 'false',
    icon: '❌',
    severity: 'CRÍTICO',
    impact: 'iOS ELIMINA el match si es true'
  },
  {
    name: 'visible',
    expected: 'true',
    icon: 'ℹ️',
    severity: 'NORMAL',
    impact: 'Control de visibilidad general'
  }
];

log('\n📊 ANÁLISIS DE CAMPOS CRÍTICOS - test-master.js', 'cyan');
log('═'.repeat(80), 'cyan');
log('', 'reset');

functions.forEach((func, idx) => {
  log(`\n${idx + 1}. ${func.name}()`, 'bright');
  log(`   📝 ${func.description}`, 'yellow');
  log(`   🎯 ${func.purpose}`, 'reset');
  log('', 'reset');
  
  // Buscar la función en el contenido
  const funcRegex = new RegExp(`async function ${func.name}\\(.*?\\).*?\\{[\\s\\S]*?await db\\.collection\\('users'\\)\\.doc\\([^)]+\\)\\.set\\([\\s\\S]*?\\}[^}]*?\\);`, 'm');
  const funcMatch = content.match(funcRegex);
  
  if (!funcMatch) {
    log(`   ❌ Función no encontrada`, 'red');
    return;
  }
  
  const funcContent = funcMatch[0];
  
  // Verificar cada campo crítico
  log('   Campos críticos configurados:', 'cyan');
  log('', 'reset');
  
  criticalFields.forEach(field => {
    const fieldRegex = new RegExp(`${field.name}:\\s*${field.expected}`, 'm');
    const hasField = fieldRegex.test(funcContent);
    
    if (hasField) {
      log(`   ${field.icon} ${field.name}: ${field.expected}`, 'green');
      log(`      ✅ ${field.impact}`, 'reset');
    } else {
      log(`   ❌ ${field.name}: NO CONFIGURADO`, 'red');
      log(`      ⚠️  ${field.impact}`, 'yellow');
    }
  });
  
  log('', 'reset');
});

log('\n═'.repeat(80), 'cyan');
log('📊 RESUMEN DE VERIFICACIÓN', 'bright');
log('═'.repeat(80), 'cyan');

// Contar campos correctos
let totalFields = 0;
let correctFields = 0;

functions.forEach(func => {
  const funcRegex = new RegExp(`async function ${func.name}\\(.*?\\).*?\\{[\\s\\S]*?await db\\.collection\\('users'\\)\\.doc\\([^)]+\\)\\.set\\([\\s\\S]*?\\}[^}]*?\\);`, 'm');
  const funcMatch = content.match(funcRegex);
  
  if (funcMatch) {
    const funcContent = funcMatch[0];
    
    criticalFields.forEach(field => {
      totalFields++;
      const fieldRegex = new RegExp(`${field.name}:\\s*${field.expected}`, 'm');
      if (fieldRegex.test(funcContent)) {
        correctFields++;
      }
    });
  }
});

log('', 'reset');
log(`✅ Funciones verificadas: ${functions.length}`, 'green');
log(`✅ Campos críticos correctos: ${correctFields}/${totalFields}`, correctFields === totalFields ? 'green' : 'red');
log('', 'reset');

if (correctFields === totalFields) {
  log('🎉 ¡PERFECTO! Todas las funciones tienen los campos críticos correctamente configurados', 'green');
  log('   Los matches creados con test-master.js aparecerán en iOS sin problemas', 'cyan');
} else {
  log('⚠️  ADVERTENCIA: Algunas funciones no tienen todos los campos críticos', 'yellow');
  log('   Los matches pueden NO aparecer en iOS', 'red');
}

log('', 'reset');
log('═'.repeat(80), 'cyan');
log('💡 REFERENCIAS:', 'cyan');
log('   - Código iOS: FirestoreRemoteDataSource.swift líneas 1373-1430', 'reset');
log('   - Documentación: CAMPOS_CRITICOS_MATCHES.md', 'reset');
log('   - Validación: node validate-test-users.js', 'reset');
log('═'.repeat(80), 'cyan');
log('', 'reset');
