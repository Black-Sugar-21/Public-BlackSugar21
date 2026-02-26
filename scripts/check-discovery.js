const admin = require('firebase-admin');

const serviceAccount = require('../firebase-service-account.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
const DANIEL_UID = 'sU8xLiwQWNXmbYdR63p1uO6TSm72';

async function checkDiscovery() {
  console.log('\n🔍 DIAGNÓSTICO DE PERFILES DISCOVERY\n');
  
  // 1. Perfil de Daniel
  const danielDoc = await db.collection('users').doc(DANIEL_UID).get();
  const daniel = danielDoc.data();
  const danielAge = calculateAge(daniel.birthDate.toDate());
  
  console.log('👤 DANIEL:');
  console.log(`   Gender: ${daniel.male ? 'MALE' : 'FEMALE'}`);
  console.log(`   UserType: ${daniel.userType}`);
  console.log(`   Orientation: ${daniel.orientation}`);
  console.log(`   Age: ${danielAge}`);
  console.log(`   Geohash: ${daniel.g}`);
  console.log(`   Location: ${daniel.latitude}, ${daniel.longitude}`);
  console.log(`   AgeRange: ${daniel.minAge}-${daniel.maxAge}\n`);
  
  // 2. Contar todos los perfiles discovery
  const allDiscovery = await db.collection('users')
    .where('isDiscoveryProfile', '==', true)
    .get();
  
  console.log(`📊 Total perfiles discovery: ${allDiscovery.size}\n`);
  
  // 3. Agrupar por geohash
  const byPrefix = {};
  allDiscovery.forEach(doc => {
    const prefix = doc.data().g.substring(0, 3);
    byPrefix[prefix] = (byPrefix[prefix] || 0) + 1;
  });
  
  console.log('📍 Distribución por ubicación:');
  Object.entries(byPrefix).forEach(([prefix, count]) => {
    const loc = prefix === '66j' ? 'Santiago' : prefix === '63k' ? 'Concepción' : prefix;
    console.log(`   ${prefix} (${loc}): ${count} perfiles`);
  });
  
  // 4. Buscar con el geohash de Daniel
  const danielPrefix = daniel.g.substring(0, 3);
  console.log(`\n🔍 Buscando con prefix de Daniel: ${danielPrefix}\n`);
  
  const compatibleSnapshot = await db.collection('users')
    .where('g', '>=', danielPrefix)
    .where('g', '<', danielPrefix + '~')
    .where('isDiscoveryProfile', '==', true)
    .limit(3)
    .get();
  
  if (compatibleSnapshot.empty) {
    console.log('❌ NO HAY PERFILES DISCOVERY EN CONCEPCIÓN');
    console.log('   Los 30 perfiles creados ayer NO tienen el geohash correcto\n');
  } else {
    console.log(`✅ Encontrados ${compatibleSnapshot.size} perfiles:\n`);
    compatibleSnapshot.forEach((doc, i) => {
      const p = doc.data();
      console.log(`${i+1}. ${p.name}`);
      console.log(`   Geohash: ${p.g}`);
      console.log(`   Type: ${p.userType}, Orientation: ${p.orientation}`);
      console.log(`   Gender: ${p.male ? 'MALE' : 'FEMALE'}\n`);
    });
  }
  
  process.exit(0);
}

function calculateAge(birthDate) {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}

checkDiscovery().catch(err => { console.error(err); process.exit(1); });
