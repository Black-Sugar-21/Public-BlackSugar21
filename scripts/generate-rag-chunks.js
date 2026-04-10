#!/usr/bin/env node
'use strict';

/**
 * generate-rag-chunks.js — High-quality RAG chunk generator for BlackSugar21 Coach IA
 *
 * Replicates NotebookLM-style knowledge extraction using Gemini with Search Grounding.
 * Generates multi-language chunks with embeddings and uploads to Firestore.
 *
 * Usage:
 *   node scripts/generate-rag-chunks.js                          # Full run (all categories, 5 langs)
 *   node scripts/generate-rag-chunks.js --dry-run                # Preview without uploading
 *   node scripts/generate-rag-chunks.js --category=communication # Single category
 *   node scripts/generate-rag-chunks.js --language=es            # Single language
 *   node scripts/generate-rag-chunks.js --clean-old              # Remove old high-quality chunks first
 */

// Resolve modules from functions/node_modules
const path = require('path');
const functionsDir = path.join(__dirname, '..', 'functions');
const admin = require(path.join(functionsDir, 'node_modules', 'firebase-admin'));
const { GoogleGenerativeAI } = require(path.join(functionsDir, 'node_modules', '@google/generative-ai'));

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ── Config ──
const EMBEDDING_MODEL = 'gemini-embedding-001';
const GENERATION_MODEL = 'gemini-2.5-flash';
const EMBEDDING_DIMS = 768;
const LANGUAGES = ['en', 'es', 'pt', 'fr', 'de', 'ja', 'zh', 'ru', 'ar', 'id'];
const BATCH_DELAY_MS = 2000; // Rate limit between Gemini calls

// ── Categories with research-grounded prompts ──
const CATEGORIES = {
  first_date: {
    title: 'First Date Advice',
    searchQuery: 'best first date advice dating psychology research tips',
    prompt: `Generate 8 expert dating advice chunks about FIRST DATES. Use research from:
- John Gottman's "thin-slicing" research on first impressions
- Helen Fisher's brain chemistry of attraction (dopamine, norepinephrine)
- Social psychology of reciprocal disclosure

Each chunk should be a SPECIFIC, ACTIONABLE tip with the research backing.
Examples of good chunks:
- "Ask open-ended questions about passions, not jobs. Gottman's research shows couples who share dreams early build stronger foundations."
- "Mirror their body language subtly. Studies show mirroring increases rapport by 30% in first meetings."`,
  },
  communication: {
    title: 'Communication in Relationships',
    searchQuery: 'Gottman four horsemen relationship communication research',
    prompt: `Generate 8 expert chunks about COMMUNICATION in dating/relationships. Use research from:
- Gottman's Four Horsemen (criticism, contempt, defensiveness, stonewalling)
- Gottman's "Magic Ratio" (5:1 positive to negative interactions)
- Active listening techniques backed by counseling psychology
- "I" statements vs "You" statements research

Each chunk must reference SPECIFIC research and give ACTIONABLE advice.`,
  },
  conflict_resolution: {
    title: 'Conflict Resolution',
    searchQuery: 'Gottman repair attempts conflict resolution couples therapy research',
    prompt: `Generate 8 expert chunks about CONFLICT RESOLUTION in relationships. Use:
- Gottman's Repair Attempts (the #1 predictor of relationship success)
- De-escalation techniques from couples therapy
- "Soft startup" vs "harsh startup" research
- The difference between solvable and perpetual problems (69% of conflicts are perpetual)

Each chunk should help someone navigate disagreements with a date or partner.`,
  },
  attraction: {
    title: 'Science of Attraction',
    searchQuery: 'Helen Fisher brain chemistry love attraction dopamine serotonin research',
    prompt: `Generate 8 expert chunks about the SCIENCE OF ATTRACTION. Use:
- Helen Fisher's 4 personality types (Explorer, Builder, Director, Negotiator)
- Dopamine and novelty-seeking in early attraction
- The role of vulnerability in building connection (Brené Brown)
- Physical attraction vs emotional attraction research
- The "36 Questions" study by Arthur Aron

Each chunk should give PRACTICAL advice grounded in neuroscience.`,
  },
  long_term: {
    title: 'Long-term Relationship Success',
    searchQuery: 'Esther Perel desire long-term relationship maintaining passion research',
    prompt: `Generate 8 expert chunks about MAINTAINING DESIRE in long-term relationships. Use:
- Esther Perel's paradox of desire vs security
- Gottman's Sound Relationship House theory
- The importance of maintaining independence within togetherness
- "Love Maps" — knowing your partner's inner world
- Date nights and novelty research (keeping dopamine alive)

Practical advice for people in dating apps who want something lasting.`,
  },
  attachment: {
    title: 'Attachment Styles',
    searchQuery: 'attachment theory dating anxious avoidant secure Amir Levine research',
    prompt: `Generate 8 expert chunks about ATTACHMENT STYLES in dating. Use:
- Amir Levine & Rachel Heller "Attached" (anxious, avoidant, secure)
- How to identify your own attachment style
- How to date someone with a different attachment style
- "Protest behaviors" of anxious attachment
- The "phantom ex" phenomenon in avoidant attachment
- How to become more securely attached (earned security)

Practical advice for navigating attachment dynamics on dating apps.`,
  },
  cultural_norms: {
    title: 'Cultural Dating Norms',
    searchQuery: 'cultural dating norms Latin America Europe Asia etiquette differences',
    prompt: `Generate 10 expert chunks about CULTURAL DATING NORMS. Cover:
- Latin America: warmth, family involvement, pace of relationships
- Europe: directness (Germany), romance (France/Italy), independence (Nordic)
- Asia: family expectations, indirect communication, gift-giving
- Middle East: conservative norms, family approval
- North America: casual dating culture, "the talk", exclusivity

Each chunk should help someone navigate cross-cultural dating with respect and awareness.`,
  },
  sugar_dating: {
    title: 'Sugar Dating Etiquette',
    searchQuery: 'sugar dating etiquette expectations communication boundaries respect',
    prompt: `Generate 6 expert chunks about SUGAR DATING ETIQUETTE. Cover:
- Setting clear expectations and boundaries from the start
- Communication about arrangements without awkwardness
- Maintaining respect and genuine connection
- Safety tips specific to sugar dating
- How to transition from arrangement to genuine chemistry
- Red flags to watch for

Each chunk should be respectful, practical, and specific to the sugar dating dynamic.`,
  },
};

// ── Helpers ──
async function generateChunksForCategory(genAI, category, config, language, apiKey) {
  const model = genAI.getGenerativeModel({
    model: GENERATION_MODEL,
    tools: [{googleSearch: {}}], // Search Grounding — like NotebookLM
    generationConfig: {
      maxOutputTokens: 4096,
      temperature: 0.7,
      // Note: responseMimeType:'application/json' is incompatible with Search Grounding
    },
  });

  const langNames = {en: 'English', es: 'Spanish', pt: 'Portuguese', fr: 'French', de: 'German', ja: 'Japanese', zh: 'Chinese (Simplified)', ru: 'Russian', ar: 'Arabic', id: 'Indonesian'};
  const langName = langNames[language] || 'English';

  const prompt = `${config.prompt}

IMPORTANT RULES:
- Write ALL chunks in ${langName}
- Each chunk should be 150-300 words
- Each chunk must be self-contained (works without the others)
- Include specific research citations when possible
- Format: practical advice a dating coach would give
- NO generic platitudes — every sentence must add value

Return a JSON array:
[
  {
    "title": "short descriptive title in ${langName}",
    "text": "the full chunk text in ${langName}",
    "subcategory": "specific subcategory like first_impressions, body_language, etc."
  }
]`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  let parsed;
  try {
    const clean = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    parsed = JSON.parse(clean);
  } catch (e) {
    console.error(`  ⚠️ JSON parse failed for ${category}/${language}: ${e.message}`);
    return [];
  }

  if (!Array.isArray(parsed)) return [];
  return parsed.filter(c => c.text && c.text.length > 50);
}

async function generateEmbedding(genAI, text) {
  const model = genAI.getGenerativeModel({model: EMBEDDING_MODEL});
  const result = await model.embedContent({
    content: {parts: [{text: text.substring(0, 500)}]},
    taskType: 'RETRIEVAL_DOCUMENT',
    outputDimensionality: EMBEDDING_DIMS, // 768 — must match existing chunks + Firestore max 2048
  });
  return result.embedding.values;
}

// ── Main ──
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const cleanOld = args.includes('--clean-old');
  const categoryFilter = args.find(a => a.startsWith('--category='))?.split('=')[1];
  const langFilter = args.find(a => a.startsWith('--language='))?.split('=')[1];

  // Get API key
  let apiKey;
  try {
    const {execSync} = require('child_process');
    apiKey = execSync('npx firebase functions:secrets:access GEMINI_API_KEY 2>/dev/null', {cwd: functionsDir}).toString().trim();
  } catch (e) {
    apiKey = process.env.GEMINI_API_KEY;
  }
  if (!apiKey) {
    console.error('❌ No GEMINI_API_KEY found');
    process.exit(1);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const categories = categoryFilter ? {[categoryFilter]: CATEGORIES[categoryFilter]} : CATEGORIES;
  const languages = langFilter ? [langFilter] : LANGUAGES;

  if (!categoryFilter || !CATEGORIES[categoryFilter]) {
    if (categoryFilter) {
      console.error(`❌ Unknown category: ${categoryFilter}`);
      console.log('Available:', Object.keys(CATEGORIES).join(', '));
      process.exit(1);
    }
  }

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  RAG Chunk Generator — High Quality with Grounding     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Categories: ${Object.keys(categories).join(', ')}`);
  console.log(`  Languages:  ${languages.join(', ')}`);
  console.log(`  Dry run:    ${dryRun}`);
  console.log('');

  if (cleanOld && !dryRun) {
    console.log('🧹 Cleaning old high-quality chunks...');
    const oldSnap = await db.collection('coachKnowledge').where('quality', '==', 'high').get();
    const batch = db.batch();
    oldSnap.docs.forEach(d => batch.delete(d.ref));
    if (oldSnap.docs.length > 0) {
      await batch.commit();
      console.log(`  Deleted ${oldSnap.docs.length} old high-quality chunks`);
    }
  }

  let totalGenerated = 0;
  let totalUploaded = 0;

  for (const [catKey, catConfig] of Object.entries(categories)) {
    for (const lang of languages) {
      console.log(`\n📚 ${catConfig.title} [${lang}]`);

      try {
        const chunks = await generateChunksForCategory(genAI, catKey, catConfig, lang, apiKey);
        console.log(`  Generated ${chunks.length} chunks`);
        totalGenerated += chunks.length;

        for (const chunk of chunks) {
          if (dryRun) {
            console.log(`  📝 [${chunk.subcategory || catKey}] ${chunk.title}`);
            console.log(`     ${chunk.text.substring(0, 100)}...`);
            continue;
          }

          // Generate embedding
          const embedding = await generateEmbedding(genAI, chunk.text);

          const docId = `hq_${catKey}_${lang}_${Date.now()}_${totalUploaded}`;
          await db.collection('coachKnowledge').doc(docId).set({
            text: chunk.text,
            content: chunk.text, // Backwards compat
            title: chunk.title || '',
            category: chunk.subcategory || catKey,
            language: lang,
            source: `generate-rag-chunks/${catKey}`,
            quality: 'high',
            embedding: admin.firestore.FieldValue.vector(embedding),
            indexedAt: admin.firestore.FieldValue.serverTimestamp(),
            autoGenerated: false,
            searchGrounded: true,
          });

          totalUploaded++;
          console.log(`  ✅ [${totalUploaded}] ${chunk.title} (${embedding.length}d)`);

          // Rate limit
          await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
      } catch (e) {
        console.error(`  ❌ Error: ${e.message}`);
      }
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║  Done: ${totalGenerated} generated, ${totalUploaded} uploaded${dryRun ? ' (DRY RUN)' : ''}            ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
}

main().then(() => process.exit(0)).catch(e => { console.error('FATAL:', e.message); process.exit(1); });
