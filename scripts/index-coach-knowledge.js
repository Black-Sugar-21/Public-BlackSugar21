#!/usr/bin/env node
/**
 * RAG Indexing Script for AI Date Coach Knowledge Base
 *
 * Reads curated dating advice from JSON, generates embeddings with gemini-embedding-001,
 * and stores them in Firestore with FieldValue.vector() for native vector search.
 *
 * Adapted from Genkit RAG pattern (DenisVCode gist) but uses existing SDKs only:
 * - @google/generative-ai → embedContent()
 * - firebase-admin → FieldValue.vector() + Firestore native vector search
 *
 * Usage:
 *   node scripts/index-coach-knowledge.js                 # Index all knowledge
 *   node scripts/index-coach-knowledge.js --clean         # Delete existing + reindex
 *   node scripts/index-coach-knowledge.js --dry-run       # Preview without writing
 *
 * Prerequisites:
 *   - GEMINI_API_KEY environment variable OR .env file in project root
 *   - Firebase service account key at scripts/serviceAccountKey.json
 *   - Firestore vector index created (see command at bottom of this file)
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const {FieldValue} = require('firebase-admin/firestore');
// Resolve @google/generative-ai from functions/node_modules (not installed at project root)
const {GoogleGenerativeAI} = require(path.join(__dirname, '..', 'functions', 'node_modules', '@google', 'generative-ai'));

// ─── Config ──────────────────────────────────────────────────────────────────
const COLLECTION = 'coachKnowledge';
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 768;
const BATCH_SIZE = 10; // Firestore batch write limit per commit
const EMBEDDING_DELAY_MS = 6500; // Rate limit between embedding API calls (100 req/min = 6s per batch of 10)

// ─── Init Firebase Admin ─────────────────────────────────────────────────────
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Missing scripts/serviceAccountKey.json — needed for Firestore access');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath)),
  projectId: 'black-sugar21',
});
const db = admin.firestore();

// ─── Init Gemini Embedding ───────────────────────────────────────────────────
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('❌ Missing GEMINI_API_KEY environment variable');
  console.error('   Set it: export GEMINI_API_KEY=your_key_here');
  process.exit(1);
}
const genai = new GoogleGenerativeAI(apiKey);
const embeddingModel = genai.getGenerativeModel({model: EMBEDDING_MODEL});

// ─── Load Knowledge Base ─────────────────────────────────────────────────────
function loadKnowledgeBase() {
  const knowledgeDir = path.join(__dirname, 'coach-knowledge');
  if (!fs.existsSync(knowledgeDir)) {
    console.error(`❌ Knowledge directory not found: ${knowledgeDir}`);
    process.exit(1);
  }

  const allChunks = [];
  const files = fs.readdirSync(knowledgeDir).filter((f) => f.endsWith('.json'));

  for (const file of files) {
    const filePath = path.join(knowledgeDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    if (Array.isArray(data)) {
      for (const item of data) {
        if (!item.text || !item.category) {
          console.warn(`⚠️  Skipping item with missing text/category in ${file}`);
          continue;
        }
        allChunks.push({
          id: item.id || `${file}-${allChunks.length}`,
          text: item.text,
          category: item.category,
          language: item.language || 'en',
          source: file,
        });
      }
    }
  }

  return allChunks;
}

// ─── Generate Embedding ──────────────────────────────────────────────────────
async function generateEmbedding(text) {
  const result = await embeddingModel.embedContent({
    content: {parts: [{text}]},
    taskType: 'RETRIEVAL_DOCUMENT',
    outputDimensionality: EMBEDDING_DIMENSIONS,
  });
  return result.embedding.values;
}

// ─── Delete Existing Documents ───────────────────────────────────────────────
async function deleteExistingDocs() {
  console.log(`🗑️  Deleting existing documents in ${COLLECTION}...`);
  const batchSize = 100;
  let totalDeleted = 0;

  let snapshot = await db.collection(COLLECTION).limit(batchSize).get();
  while (snapshot.size > 0) {
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    totalDeleted += snapshot.size;
    console.log(`   Deleted ${totalDeleted} documents...`);
    snapshot = await db.collection(COLLECTION).limit(batchSize).get();
  }

  console.log(`✅ Deleted ${totalDeleted} existing documents`);
  return totalDeleted;
}

// ─── Index to Firestore ──────────────────────────────────────────────────────
async function indexToFirestore(chunks, dryRun = false) {
  console.log(`\n📊 Indexing ${chunks.length} knowledge chunks...`);
  let indexed = 0;
  let failed = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const batchPromises = [];

    for (const chunk of batch) {
      batchPromises.push(
        (async () => {
          try {
            const embedding = await generateEmbedding(chunk.text);

            if (dryRun) {
              console.log(`   [DRY RUN] Would index: "${chunk.id}" (${chunk.category}/${chunk.language}) — ${embedding.length} dims`);
              indexed++;
              return;
            }

            await db.collection(COLLECTION).doc(chunk.id).set({
              text: chunk.text,
              embedding: FieldValue.vector(embedding),
              category: chunk.category,
              language: chunk.language,
              source: chunk.source,
              indexedAt: FieldValue.serverTimestamp(),
            });

            indexed++;
            console.log(`   ✅ [${indexed}/${chunks.length}] ${chunk.id} (${chunk.category}/${chunk.language})`);
          } catch (err) {
            failed++;
            console.error(`   ❌ Failed: ${chunk.id} — ${err.message}`);
          }
        })(),
      );
    }

    await Promise.all(batchPromises);

    // Rate limit between batches
    if (i + BATCH_SIZE < chunks.length) {
      await new Promise((r) => setTimeout(r, EMBEDDING_DELAY_MS));
    }
  }

  return {indexed, failed};
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const clean = args.includes('--clean');
  const dryRun = args.includes('--dry-run');

  console.log('🧠 AI Date Coach — RAG Knowledge Base Indexer');
  console.log(`   Collection: ${COLLECTION}`);
  console.log(`   Embedding: ${EMBEDDING_MODEL} (${EMBEDDING_DIMENSIONS} dims)`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN' : clean ? 'CLEAN + INDEX' : 'INDEX'}`);
  console.log('');

  // Load knowledge
  const chunks = loadKnowledgeBase();
  console.log(`📚 Loaded ${chunks.length} knowledge chunks`);

  // Show stats
  const categories = {};
  const languages = {};
  for (const c of chunks) {
    categories[c.category] = (categories[c.category] || 0) + 1;
    languages[c.language] = (languages[c.language] || 0) + 1;
  }
  console.log(`   Categories: ${Object.entries(categories).map(([k, v]) => `${k}(${v})`).join(', ')}`);
  console.log(`   Languages: ${Object.entries(languages).map(([k, v]) => `${k}(${v})`).join(', ')}`);

  // Clean if requested
  if (clean && !dryRun) {
    await deleteExistingDocs();
  }

  // Index
  const start = Date.now();
  const result = await indexToFirestore(chunks, dryRun);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ Indexing complete in ${elapsed}s`);
  console.log(`   Indexed: ${result.indexed}`);
  console.log(`   Failed: ${result.failed}`);
  console.log(`   Total: ${chunks.length}`);

  if (!dryRun) {
    console.log(`\n💡 Next steps:`);
    console.log(`   1. Create Firestore vector index (if not done):`);
    console.log(`      gcloud firestore indexes composite create \\`);
    console.log(`        --project=black-sugar21 \\`);
    console.log(`        --collection-group=${COLLECTION} \\`);
    console.log(`        --query-scope=COLLECTION \\`);
    console.log(`        --field-config='vector-config={"dimension":"${EMBEDDING_DIMENSIONS}","flat":"{}"},field-path=embedding'`);
    console.log(`   2. Deploy functions: firebase deploy --only functions:dateCoachChat --force`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});

/*
 * ─── Firestore Vector Index Creation Command ─────────────────────────────────
 *
 * Run this ONCE after first indexing:
 *
 * gcloud firestore indexes composite create \
 *   --project=black-sugar21 \
 *   --collection-group=coachKnowledge \
 *   --query-scope=COLLECTION \
 *   --field-config='vector-config={"dimension":"768","flat":"{}"},field-path=embedding'
 *
 * This creates a Firestore-native vector index for COSINE similarity search.
 * The index may take a few minutes to build after creation.
 */
