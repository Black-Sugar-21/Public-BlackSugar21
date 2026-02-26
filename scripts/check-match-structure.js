#!/usr/bin/env node

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkMatch() {
  const matchId = '5k99GxyXnMTvSChrGaqR31Mc4mJ2_sU8xLiwQWNXmbYdR63p1uO6TSm72';
  
  const matchDoc = await db.collection('matches').doc(matchId).get();
  
  if (!matchDoc.exists) {
    console.log('Match no existe');
    return;
  }
  
  const matchData = matchDoc.data();
  
  console.log('📋 Estructura del match:');
  console.log(JSON.stringify(matchData, null, 2));
  
  process.exit(0);
}

checkMatch();
