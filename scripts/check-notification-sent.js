#!/usr/bin/env node

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkNotification() {
  try {
    console.log('🔍 Verificando último mensaje enviado...\n');
    
    // Buscar el último mensaje creado
    const messagesSnapshot = await db.collection('messages')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    
    if (messagesSnapshot.empty) {
      console.log('❌ No hay mensajes en la base de datos');
      return;
    }
    
    const messageDoc = messagesSnapshot.docs[0];
    const message = messageDoc.data();
    const messageId = messageDoc.id;
    
    console.log(`📨 Mensaje ID: ${messageId}`);
    console.log(`   Texto: "${message.text}"`);
    console.log(`   Remitente: ${message.senderId}`);
    console.log(`   chatId: ${message.chatId || 'NO TIENE'}`);
    console.log(`   matchId: ${message.matchId || 'NO TIENE'}\n`);
    
    // Verificar si se procesó la notificación
    console.log('🔔 Estado de notificación:');
    console.log(`   notificationSent: ${message.notificationSent || false}`);
    console.log(`   notificationAttemptedAt: ${message.notificationAttemptedAt ? '✅ Sí' : '❌ No'}`);
    
    if (message.notificationSkipReason) {
      console.log(`   ⚠️  Skip Reason: ${message.notificationSkipReason}`);
    }
    
    if (message.notificationError) {
      console.log(`   ❌ Error: ${message.notificationError}`);
    }
    
    // Obtener info del match
    const matchId = message.chatId || message.matchId;
    if (matchId) {
      console.log(`\n🔍 Verificando match ${matchId}...`);
      const matchDoc = await db.collection('matches').doc(matchId).get();
      
      if (matchDoc.exists) {
        const matchData = matchDoc.data();
        const [user1Id, user2Id] = matchData.usersMatched;
        
        console.log(`\n👥 Usuarios del match:`);
        console.log(`   User 1: ${user1Id}`);
        console.log(`   User 2: ${user2Id}`);
        
        // Determinar quién es el receptor
        const receiverId = message.senderId === user1Id ? user2Id : user1Id;
        console.log(`\n📥 Receptor del mensaje: ${receiverId}`);
        
        // Verificar FCM token del receptor
        const receiverDoc = await db.collection('users').doc(receiverId).get();
        if (receiverDoc.exists) {
          const receiverData = receiverDoc.data();
          const hasToken = !!receiverData.fcmToken;
          console.log(`\n🔑 FCM Token del receptor:`);
          console.log(`   Tiene token: ${hasToken ? '✅ SÍ' : '❌ NO'}`);
          if (hasToken) {
            console.log(`   Token: ${receiverData.fcmToken.substring(0, 50)}...`);
          }
        }
        
        // Verificar FCM token de Daniel (remitente)
        const senderDoc = await db.collection('users').doc(message.senderId).get();
        if (senderDoc.exists) {
          const senderData = senderDoc.data();
          const hasToken = !!senderData.fcmToken;
          console.log(`\n🔑 FCM Token de Daniel (remitente):`);
          console.log(`   Tiene token: ${hasToken ? '✅ SÍ' : '❌ NO'}`);
          if (hasToken) {
            console.log(`   Token: ${senderData.fcmToken.substring(0, 50)}...`);
          }
        }
      }
    }
    
    console.log('\n═══════════════════════════════════════════════════════');
    
    if (!message.notificationSent) {
      console.log('\n⚠️  PROBLEMA: La notificación NO fue enviada');
      console.log('\n💡 POSIBLES CAUSAS:');
      console.log('   1. El receptor no tiene FCM token');
      console.log('   2. El trigger onMessageCreated no se ejecutó');
      console.log('   3. Hubo un error en el Cloud Function');
      console.log('\n📋 PRÓXIMOS PASOS:');
      console.log('   1. Ejecutar: firebase functions:log --limit=10');
      console.log('   2. Verificar que el Cloud Function esté desplegado');
      console.log('   3. Agregar FCM token a usuarios de prueba');
    } else {
      console.log('\n✅ La notificación fue enviada correctamente');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
}

checkNotification();
