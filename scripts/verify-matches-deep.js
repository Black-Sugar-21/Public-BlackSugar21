#!/usr/bin/env node

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const DANIEL = {
  uid: 'sU8xLiwQWNXmbYdR63p1uO6TSm72',
  name: 'Daniel'
};

function log(msg, color = 'reset') {
  const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
  };
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function verifyMatchesDeep() {
  log('\n🔍 VERIFICACIÓN PROFUNDA DE MATCHES', 'cyan');
  log('═'.repeat(70), 'cyan');
  
  log(`\n🔎 Buscando matches de ${DANIEL.name}...`, 'yellow');
  
  const matchesSnapshot = await db.collection('matches')
    .where('usersMatched', 'array-contains', DANIEL.uid)
    .get();
  
  if (matchesSnapshot.empty) {
    log('\n⚠️  No se encontraron matches', 'yellow');
    return;
  }
  
  log(`\n✅ Encontrados ${matchesSnapshot.size} matches en Firestore\n`, 'green');
  
  const matches = [];
  let totalIssues = 0;
  
  for (const doc of matchesSnapshot.docs) {
    const data = doc.data();
    const matchId = doc.id;
    const issues = [];
    
    const otherUserId = data.usersMatched?.find(uid => uid !== DANIEL.uid);
    
    if (!otherUserId) {
      issues.push('❌ No se pudo identificar otro usuario');
      matches.push({ matchId, issues, otherUserName: 'ERROR' });
      continue;
    }
    
    let otherUserData = null;
    let otherUserName = 'Usuario desconocido';
    
    try {
      const userDoc = await db.collection('users').doc(otherUserId).get();
      if (userDoc.exists) {
        otherUserData = userDoc.data();
        otherUserName = otherUserData.name || otherUserName;
      } else {
        issues.push('❌ Usuario no existe en Firestore');
      }
    } catch (e) {
      issues.push(`❌ Error obteniendo usuario: ${e.message}`);
    }
    
    // VALIDACIONES CRÍTICAS
    if (!data.usersMatched || data.usersMatched.length !== 2) {
      issues.push('❌ Campo usersMatched inválido');
    } else {
      if (!data.usersMatched.includes(DANIEL.uid)) {
        issues.push(`❌ usersMatched no incluye a ${DANIEL.name}`);
      }
      if (!data.usersMatched.includes(otherUserId)) {
        issues.push(`❌ usersMatched no incluye al otro usuario`);
      }
    }
    
    if (otherUserData) {
      if (otherUserData.accountStatus !== 'active') {
        issues.push(`⚠️ accountStatus='${otherUserData.accountStatus}' (iOS/Android lo filtrarán)`);
      }
      if (otherUserData.paused === true) {
        issues.push('⚠️ Usuario pausado (iOS/Android lo ocultarán)');
      }
      if (otherUserData.blocked === true) {
        issues.push('⚠️ Usuario bloqueado (iOS/Android lo eliminarán)');
      }
      if (otherUserData.visible === false) {
        issues.push('⚠️ Usuario no visible');
      }
    }
    
    // Likes bidireccionales
    if (otherUserData) {
      const currentUserDoc = await db.collection('users').doc(DANIEL.uid).get();
      const currentUserLikes = currentUserDoc.data()?.liked || [];
      const otherUserLikes = otherUserData.liked || [];
      
      if (!currentUserLikes.includes(otherUserId)) {
        issues.push(`⚠️ ${DANIEL.name} no tiene like de ${otherUserName}`);
      }
      if (!otherUserLikes.includes(DANIEL.uid)) {
        issues.push(`⚠️ ${otherUserName} no tiene like de ${DANIEL.name}`);
      }
    }
    
    // 🔥 VALIDACIÓN CRÍTICA: Fotos (iOS filtra usuarios sin fotos)
    if (otherUserData) {
      if (!otherUserData.pictures || otherUserData.pictures.length === 0) {
        issues.push('❌ Usuario SIN FOTOS (iOS/Android lo filtrarán)');
      }
      if (!otherUserData.firstPictureName) {
        issues.push('⚠️ firstPictureName no definido');
      }
    }
    
    totalIssues += issues.length;
    
    matches.push({
      matchId: matchId.substring(0, 16) + '...',
      otherUserName: otherUserName,
      otherUserId: otherUserId.substring(0, 8) + '...',
      lastMessage: data.lastMessage || '(sin mensajes)',
      timestamp: data.timestamp?.toDate(),
      notificationSent: data.notificationSent || false,
      isTest: data.isTest || false,
      accountStatus: otherUserData?.accountStatus || 'unknown',
      paused: otherUserData?.paused || false,
      blocked: otherUserData?.blocked || false,
      hasPhotos: otherUserData?.pictures?.length > 0 || false,
      photoCount: otherUserData?.pictures?.length || 0,
      issues: issues
    });
  }
  
  // Mostrar matches
  matches.forEach((match, idx) => {
    const statusIcon = match.issues.length === 0 ? '✅' : '⚠️';
    log(`${idx + 1}. ${statusIcon} ${match.otherUserName}`, match.issues.length === 0 ? 'green' : 'yellow');
    console.log(`   Match ID: ${match.matchId}`);
    console.log(`   User ID: ${match.otherUserId}`);
    console.log(`   Estado: accountStatus='${match.accountStatus}' paused=${match.paused} blocked=${match.blocked}`);
    console.log(`   Fotos: ${match.hasPhotos ? `✅ ${match.photoCount} fotos` : '❌ SIN FOTOS'}`);
    console.log(`   Mensaje: "${match.lastMessage}"`);
    log(`   ${match.notificationSent ? '✅' : '⚠️'} Notificación ${match.notificationSent ? 'enviada' : 'pendiente'}`, 
        match.notificationSent ? 'green' : 'yellow');
    if (match.isTest) log(`   🧪 Match de prueba`, 'cyan');
    
    if (match.issues.length > 0) {
      log(`   🔧 PROBLEMAS DETECTADOS:`, 'red');
      match.issues.forEach(issue => log(`      ${issue}`, 'red'));
    }
    console.log('');
  });
  
  // Resumen
  log('═'.repeat(70), 'cyan');
  log('📊 RESUMEN EJECUTIVO:', 'cyan');
  log('═'.repeat(70), 'cyan');
  
  const withNotif = matches.filter(m => m.notificationSent).length;
  const withIssues = matches.filter(m => m.issues.length > 0).length;
  const healthy = matches.length - withIssues;
  
  console.log(`   Total matches: ${matches.length}`);
  log(`   ✅ Matches saludables: ${healthy}`, healthy > 0 ? 'green' : 'red');
  log(`   ⚠️  Con problemas: ${withIssues}`, withIssues > 0 ? 'yellow' : 'green');
  console.log(`   📲 Con notificación: ${withNotif}`);
  console.log(`   🧪 De prueba: ${matches.filter(m => m.isTest).length}`);
  
  if (withIssues === 0) {
    log(`\n✅ TODOS LOS MATCHES ESTÁN PERFECTOS`, 'green');
    log(`💡 Deberían aparecer correctamente en iOS y Android`, 'cyan');
  } else {
    log(`\n⚠️  ${withIssues} matches tienen problemas que pueden evitar que aparezcan en las apps`, 'yellow');
    log(`💡 Revisa los detalles arriba para entender qué está fallando`, 'cyan');
  }
}

verifyMatchesDeep()
  .then(() => {
    log('\n✅ Verificación completada\n', 'green');
    process.exit(0);
  })
  .catch(error => {
    log(`\n❌ Error: ${error.message}\n`, 'red');
    process.exit(1);
  });
