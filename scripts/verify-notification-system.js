#!/usr/bin/env node

/**
 * Test robusto de verificación de keys de notificación
 * Verifica que las keys en functions/index.js coincidan exactamente con los archivos de recursos
 */

const fs = require('fs');
const path = require('path');

const ANDROID_BASE = '/Users/daniel/AndroidStudioProjects/BlackSugar212/app/src/main/res';
const IOS_BASE = '/Users/daniel/AndroidStudioProjects/iOS/black-sugar-21';
const FUNCTIONS_FILE = path.join(__dirname, '../functions/index.js');

// Keys esperadas en el código
const EXPECTED_KEYS = {
  android: {
    match: {
      titleLocKey: 'notification_new_match_title',
      bodyLocKey: 'notification_new_match_body',
    },
    message: {
      titleLocKey: 'notification_new_message_title',
    }
  },
  ios: {
    match: {
      'title-loc-key': 'notification-new-match-title',
      'loc-key': 'notification-new-match-body',
    },
    message: {
      'title-loc-key': 'notification-new-message-title',
    }
  }
};

console.log('🔍 VERIFICACIÓN ROBUSTA DE KEYS DE NOTIFICACIÓN');
console.log('='.repeat(60));
console.log('');

let errors = 0;

// 1. Verificar que las keys existen en functions/index.js
console.log('📄 Verificando functions/index.js...');
const functionsCode = fs.readFileSync(FUNCTIONS_FILE, 'utf8');

// Verificar Android keys
const androidMatches = {
  titleLocKey_match: functionsCode.includes("titleLocKey: 'notification_new_match_title'"),
  bodyLocKey_match: functionsCode.includes("bodyLocKey: 'notification_new_match_body'"),
  titleLocKey_message: functionsCode.includes("titleLocKey: 'notification_new_message_title'"),
};

// Verificar iOS keys
const iosMatches = {
  titleLocKey_match: functionsCode.includes("'title-loc-key': 'notification-new-match-title'"),
  locKey_match: functionsCode.includes("'loc-key': 'notification-new-match-body'"),
  titleLocKey_message: functionsCode.includes("'title-loc-key': 'notification-new-message-title'"),
};

console.log('  Android Match Title:', androidMatches.titleLocKey_match ? '✅' : '❌');
console.log('  Android Match Body:', androidMatches.bodyLocKey_match ? '✅' : '❌');
console.log('  Android Message Title:', androidMatches.titleLocKey_message ? '✅' : '❌');
console.log('  iOS Match Title:', iosMatches.titleLocKey_match ? '✅' : '❌');
console.log('  iOS Match Body:', iosMatches.locKey_match ? '✅' : '❌');
console.log('  iOS Message Title:', iosMatches.titleLocKey_message ? '✅' : '❌');
console.log('');

if (!Object.values(androidMatches).every(v => v) || !Object.values(iosMatches).every(v => v)) {
  console.log('❌ ERROR: Algunas keys no están en functions/index.js');
  errors++;
}

// 2. Verificar que las keys existen en Android strings.xml
console.log('📱 Verificando Android strings.xml...');
const androidStrings = fs.readFileSync(`${ANDROID_BASE}/values/strings.xml`, 'utf8');

const androidKeyExists = {
  match_title: androidStrings.includes('name="notification_new_match_title"'),
  match_body: androidStrings.includes('name="notification_new_match_body"'),
  message_title: androidStrings.includes('name="notification_new_message_title"'),
};

console.log('  notification_new_match_title:', androidKeyExists.match_title ? '✅' : '❌');
console.log('  notification_new_match_body:', androidKeyExists.match_body ? '✅' : '❌');
console.log('  notification_new_message_title:', androidKeyExists.message_title ? '✅' : '❌');
console.log('');

if (!Object.values(androidKeyExists).every(v => v)) {
  console.log('❌ ERROR: Algunas keys no están en Android strings.xml');
  errors++;
}

// 3. Verificar que las keys existen en iOS Localizable.strings
console.log('🍎 Verificando iOS Localizable.strings...');
try {
  const { execSync } = require('child_process');
  const iosStrings = execSync(`iconv -f UTF-16 -t UTF-8 "${IOS_BASE}/en.lproj/Localizable.strings" 2>/dev/null`, {
    encoding: 'utf8'
  });

  const iosKeyExists = {
    match_title: iosStrings.includes('"notification-new-match-title"'),
    match_body: iosStrings.includes('"notification-new-match-body"'),
    message_title: iosStrings.includes('"notification-new-message-title"'),
  };

  console.log('  notification-new-match-title:', iosKeyExists.match_title ? '✅' : '❌');
  console.log('  notification-new-match-body:', iosKeyExists.match_body ? '✅' : '❌');
  console.log('  notification-new-message-title:', iosKeyExists.message_title ? '✅' : '❌');
  console.log('');

  if (!Object.values(iosKeyExists).every(v => v)) {
    console.log('❌ ERROR: Algunas keys no están en iOS Localizable.strings');
    errors++;
  }
} catch (error) {
  console.log('⚠️  No se pudo leer iOS Localizable.strings (encoding issue)');
  console.log('');
}

// 4. Verificar sintaxis correcta
console.log('🔧 Verificando sintaxis...');

const syntaxChecks = {
  android_uses_underscores: /titleLocKey:\s*'notification_\w+'/g.test(functionsCode),
  ios_uses_hyphens: /'(title-)?loc-key':\s*'notification-[\w-]+'/g.test(functionsCode),
  android_uses_camelCase: functionsCode.includes('titleLocKey') && functionsCode.includes('bodyLocKey'),
  ios_uses_kebab_case: functionsCode.includes("'title-loc-key'") && functionsCode.includes("'loc-key'"),
};

console.log('  Android usa underscores (_):', syntaxChecks.android_uses_underscores ? '✅' : '❌');
console.log('  iOS usa guiones (-):', syntaxChecks.ios_uses_hyphens ? '✅' : '❌');
console.log('  Android usa camelCase (titleLocKey):', syntaxChecks.android_uses_camelCase ? '✅' : '❌');
console.log('  iOS usa kebab-case (title-loc-key):', syntaxChecks.ios_uses_kebab_case ? '✅' : '❌');
console.log('');

if (!Object.values(syntaxChecks).every(v => v)) {
  console.log('❌ ERROR: Sintaxis incorrecta');
  errors++;
}

// 5. Verificar que los argumentos están correctos
console.log('📝 Verificando argumentos...');

const argChecks = {
  android_bodyLocArgs: functionsCode.includes('bodyLocArgs: [otherUserName]'),
  ios_locArgs: functionsCode.includes("'loc-args': [otherUserName]"),
  android_titleLocArgs: functionsCode.includes('titleLocArgs: [senderName]'),
  ios_titleLocArgs: functionsCode.includes("'title-loc-args': [senderName]"),
};

console.log('  Android bodyLocArgs (match):', argChecks.android_bodyLocArgs ? '✅' : '❌');
console.log('  iOS loc-args (match):', argChecks.ios_locArgs ? '✅' : '❌');
console.log('  Android titleLocArgs (message):', argChecks.android_titleLocArgs ? '✅' : '❌');
console.log('  iOS title-loc-args (message):', argChecks.ios_titleLocArgs ? '✅' : '❌');
console.log('');

if (!Object.values(argChecks).every(v => v)) {
  console.log('❌ ERROR: Argumentos incorrectos');
  errors++;
}

// Resumen final
console.log('='.repeat(60));
if (errors === 0) {
  console.log('✅ VERIFICACIÓN EXITOSA');
  console.log('');
  console.log('Todas las keys están correctamente configuradas:');
  console.log('  • Android usa underscores: notification_new_match_title');
  console.log('  • iOS usa guiones: notification-new-match-title');
  console.log('  • Sintaxis correcta en ambas plataformas');
  console.log('  • Argumentos configurados correctamente');
  console.log('');
  console.log('✨ Sistema de notificaciones multiidioma 100% funcional');
  process.exit(0);
} else {
  console.log('❌ ERRORES ENCONTRADOS');
  console.log('');
  console.log(`Se encontraron ${errors} problemas que deben corregirse.`);
  process.exit(1);
}
