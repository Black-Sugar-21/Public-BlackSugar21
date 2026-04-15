const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'black-sugar21'
  });
}

const db = admin.firestore();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function getEmbedding(text) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const result = await model.embedContent({
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: 768
    });
    return result.embedding.values;
  } catch (e) {
    console.error('Embedding error:', e.message);
    return null;
  }
}

async function indexPsychologyChunks() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║ Psychology Knowledge Base Indexing         ║');
  console.log('║ Firestore RAG Integration                  ║');
  console.log('╚════════════════════════════════════════════╝\n');

  // Load all psychology knowledge files
  const knowledgeDir = path.join(__dirname, '../scripts/coach-knowledge');
  const files = [
    'psychology-research.json',
    'psychology-research-es.json',
    'psychology-research-multilang.json'
  ];

  let totalChunks = 0;
  let successCount = 0;
  let failCount = 0;

  for (const file of files) {
    const filePath = path.join(knowledgeDir, file);
    
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${file}`);
      continue;
    }

    console.log(`━━━ Processing ${file} ━━━`);
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    console.log(`   Chunks to index: ${data.length}`);

    for (let i = 0; i < data.length; i++) {
      const chunk = data[i];
      totalChunks++;

      try {
        // Validate chunk structure
        if (!chunk.id || !chunk.category || !chunk.language || !chunk.text) {
          console.log(`   ⚠️  Chunk ${i} missing required fields`);
          failCount++;
          continue;
        }

        // Generate embedding
        process.stdout.write(`   [${i+1}/${data.length}] Embedding ${chunk.id.substring(0, 30)}...`);
        const embedding = await getEmbedding(chunk.text);
        
        if (!embedding) {
          console.log(`\n   ❌ Failed to generate embedding`);
          failCount++;
          continue;
        }

        // Prepare document for Firestore
        const docData = {
          id: chunk.id,
          category: chunk.category,
          language: chunk.language,
          text: chunk.text,
          embedding: embedding,
          createdAt: admin.firestore.Timestamp.now(),
          contentLength: chunk.text.length,
          sourceFile: file
        };

        // Write to Firestore
        await db.collection('coachKnowledge').doc(chunk.id).set(docData, { merge: true });
        
        process.stdout.write('\r');
        console.log(`   ✅ [${i+1}/${data.length}] ${chunk.id.substring(0, 30)}`);
        successCount++;

        // Rate limit - add delay between API calls
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (e) {
        console.log(`\n   ❌ Error: ${e.message}`);
        failCount++;
      }
    }

    console.log(`\n   Result: ${successCount}/${data.length} chunks indexed\n`);
  }

  // Verify indexed chunks
  console.log('━━━ Verifying Indexed Chunks ━━━');
  const snap = await db.collection('coachKnowledge')
    .where('sourceFile', 'in', ['psychology-research.json', 'psychology-research-es.json', 'psychology-research-multilang.json'])
    .get();

  console.log(`✅ Total psychology chunks in Firestore: ${snap.size}`);
  
  // Count by language
  const byLanguage = {};
  snap.docs.forEach(doc => {
    const lang = doc.data().language;
    byLanguage[lang] = (byLanguage[lang] || 0) + 1;
  });

  console.log('\n━━━ Breakdown by Language ━━━');
  Object.entries(byLanguage).sort((a, b) => b[1] - a[1]).forEach(([lang, count]) => {
    console.log(`  ${lang}: ${count} chunks`);
  });

  // Count by category
  const byCategory = {};
  snap.docs.forEach(doc => {
    const cat = doc.data().category;
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  });

  console.log('\n━━━ Breakdown by Category ━━━');
  Object.entries(byCategory).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
    console.log(`  ${cat}: ${count} chunks`);
  });

  console.log('\n╔════════════════════════════════════════════╗');
  console.log(`║ Indexing Complete                          ║`);
  console.log(`║ Total: ${snap.size.toString().padStart(35)} ║`);
  console.log(`║ Success: ${successCount.toString().padStart(33)} ║`);
  console.log(`║ Failed: ${failCount.toString().padStart(34)} ║`);
  console.log('╚════════════════════════════════════════════╝');

  process.exit(failCount > 0 ? 1 : 0);
}

indexPsychologyChunks().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
