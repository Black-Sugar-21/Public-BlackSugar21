#!/usr/bin/env node

const admin = require('firebase-admin');

// Inicializar Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const MARTINA_MATCH_ID = 'sU8xLiwQWNXmbYdR63p1uO6TSm72_xcnPSJTwQTO3sqI6UVnvug0ToXg2';

async function verifyMessageText() {
  console.log('🔍 Verificando texto de mensajes en ChatView...\n');
  
  try {
    // Obtener todos los mensajes de la subcolección
    const messagesSnapshot = await db.collection('matches')
      .doc(MARTINA_MATCH_ID)
      .collection('messages')
      .orderBy('timestamp', 'asc')
      .get();
    
    console.log(`📊 Total mensajes en subcolección: ${messagesSnapshot.size}\n`);
    
    if (messagesSnapshot.empty) {
      console.log('⚠️  No hay mensajes en la subcolección');
      return;
    }
    
    // Verificar cada mensaje
    messagesSnapshot.forEach((doc, index) => {
      const data = doc.data();
      const timestamp = data.timestamp?.toDate();
      
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📝 Mensaje ${index + 1}/${messagesSnapshot.size}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`🆔 ID: ${doc.id}`);
      console.log(`📅 Timestamp: ${timestamp || 'N/A'}`);
      console.log(`👤 Sender: ${data.senderId}`);
      console.log(`📱 Receiver: ${data.receiverId}`);
      
      // VERIFICAR CAMPO MESSAGE
      if (data.message) {
        console.log(`✅ Campo 'message' EXISTE`);
        console.log(`📝 Contenido: "${data.message}"`);
        console.log(`📏 Longitud: ${data.message.length} caracteres`);
      } else {
        console.log(`❌ Campo 'message' NO EXISTE o está vacío`);
      }
      
      // Verificar otros campos relevantes
      console.log(`\n🔍 Otros campos:`);
      console.log(`   - read: ${data.read}`);
      console.log(`   - type: ${data.type || 'N/A'}`);
      console.log(`   - messageType: ${data.messageType || 'N/A'}`);
      console.log(`   - createdAt: ${data.createdAt?.toDate() || 'N/A'}`);
      
      // Mostrar TODOS los campos del documento
      console.log(`\n📦 Estructura completa:`);
      console.log(JSON.stringify(data, null, 2));
    });
    
    console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ Verificación completada`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

verifyMessageText()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  });
