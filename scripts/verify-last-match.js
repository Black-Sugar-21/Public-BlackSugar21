const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const DANIEL_UID = 'sU8xLiwQWNXmbYdR63p1uO6TSm72';

(async () => {
  console.log('🔍 VERIFICANDO ÚLTIMO MATCH CREADO\n');
  
  const matchesSnapshot = await db.collection('matches')
    .where('usersMatched', 'array-contains', DANIEL_UID)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  
  if (matchesSnapshot.empty) {
    console.log('❌ NO SE ENCONTRÓ NINGÚN MATCH');
    process.exit(1);
  }
  
  const doc = matchesSnapshot.docs[0];
  const data = doc.data();
  
  console.log('✅ MATCH MÁS RECIENTE:\n');
  console.log(`Match ID: ${doc.id}`);
  console.log(`userId1: ${data.userId1}`);
  console.log(`userId2: ${data.userId2}`);
  console.log(`usersMatched: [${data.usersMatched ? data.usersMatched.join(', ') : 'NO EXISTE'}]`);
  console.log(`timestamp: ${data.timestamp?.toDate().toISOString()}`);
  console.log(`createdAt: ${data.createdAt?.toDate().toISOString()}`);
  console.log(`lastMessage: "${data.lastMessage}"`);
  console.log(`lastMessageTimestamp: ${data.lastMessageTimestamp?.toDate().toISOString()}`);
  console.log(`lastMessageSeq: ${data.lastMessageSeq || 0}`);
  console.log(`notificationSent: ${data.notificationSent || false}`);
  console.log('');
  
  // Verificar si Daniel está en usersMatched
  if (data.usersMatched && data.usersMatched.includes(DANIEL_UID)) {
    console.log(`✅ Daniel (${DANIEL_UID}) SÍ está en usersMatched`);
  } else {
    console.log(`❌ Daniel (${DANIEL_UID}) NO está en usersMatched`);
    console.log('⚠️  Este es el problema: la app no detectará este match');
  }
  
  // Verificar todos los matches
  console.log('\n📊 TOTAL DE MATCHES:\n');
  const allMatches = await db.collection('matches')
    .where('usersMatched', 'array-contains', DANIEL_UID)
    .get();
  
  console.log(`Total: ${allMatches.size} matches\n`);
  
  process.exit(0);
})();
