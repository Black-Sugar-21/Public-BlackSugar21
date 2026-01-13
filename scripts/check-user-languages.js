const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const danielId = 'sU8xLiwQWNXmbYdR63p1uO6TSm72';
const rositaId = 'DsDSK5xqEZZXAIKxtIKyBGntw8f2';

(async () => {
  console.log('🌍 Verificando configuración de idioma\n');
  
  const [danielDoc, rositaDoc] = await Promise.all([
    admin.firestore().collection('users').doc(danielId).get(),
    admin.firestore().collection('users').doc(rositaId).get(),
  ]);
  
  const danielData = danielDoc.data();
  const rositaData = rositaDoc.data();
  
  console.log('👤 Daniel:');
  console.log('   Idioma (language):', danielData.language || 'no definido');
  console.log('   Locale:', danielData.locale || 'no definido');
  console.log('   Idioma usado:', danielData.language || danielData.locale || 'es (default)');
  console.log('   Notificación:', 
    danielData.language === 'es' ? '💘 ¡Nuevo Match!' : 
    danielData.language === 'en' ? '💘 New Match!' :
    danielData.language === 'pt' ? '💘 Novo Match!' :
    '💘 ¡Nuevo Match! (default)');
  
  console.log('\n👤 Rosita:');
  console.log('   Idioma (language):', rositaData.language || 'no definido');
  console.log('   Locale:', rositaData.locale || 'no definido');
  console.log('   Idioma usado:', rositaData.language || rositaData.locale || 'es (default)');
  console.log('   Notificación:', 
    rositaData.language === 'es' ? '💘 ¡Nuevo Match!' : 
    rositaData.language === 'en' ? '💘 New Match!' :
    rositaData.language === 'pt' ? '💘 Novo Match!' :
    '💘 ¡Nuevo Match! (default)');
  
  console.log('\n📝 Idiomas soportados:');
  console.log('   • es (español): 💘 ¡Nuevo Match!');
  console.log('   • en (inglés): 💘 New Match!');
  console.log('   • pt (portugués): 💘 Novo Match!');
  
  process.exit(0);
})();
