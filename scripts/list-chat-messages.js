#!/usr/bin/env node

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function listMessages() {
  const chatId = '5k99GxyXnMTvSChrGaqR31Mc4mJ2_sU8xLiwQWNXmbYdR63p1uO6TSm72';
  
  console.log(`📨 Mensajes en el chat ${chatId}:\n`);
  
  const messagesSnapshot = await db.collection('messages')
    .where('chatId', '==', chatId)
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get();
  
  console.log(`Total: ${messagesSnapshot.size} mensajes\n`);
  
  messagesSnapshot.forEach((doc, index) => {
    const m = doc.data();
    console.log(`${index + 1}. "${m.text.substring(0, 60)}"`);
    console.log(`   ID: ${doc.id}`);
    console.log(`   chatId: ${m.chatId || 'NO TIENE'}`);
    console.log(`   matchId: ${m.matchId || 'NO TIENE'}`);
    console.log(`   senderId: ${m.senderId}`);
    console.log(`   notificationSent: ${m.notificationSent || false}\n`);
  });
  
  process.exit(0);
}

listMessages();
