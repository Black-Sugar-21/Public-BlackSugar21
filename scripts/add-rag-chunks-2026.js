const admin = require('firebase-admin');
const s = require('./serviceAccountKey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(s) });
const db = admin.firestore();

async function addChunks() {
  const batch = db.batch();

  // Moderation chunks
  const modChunks = [
    {
      category: 'ai_deepfake_scams',
      title: 'AI-Generated Deepfake Profile Detection',
      content: 'Red flags for AI-generated profiles: unnaturally perfect skin, inconsistent backgrounds, identical expressions in every photo, no candid shots. If match looks different in video call than photos, strong catfish indicator. Advise: always video call before meeting.',
      language: 'en',
      tags: ['safety', 'scam', 'deepfake', 'ai', 'catfish'],
    },
    {
      category: 'crypto_romance_scams',
      title: 'Crypto Romance Scam (Pig Butchering) Detection',
      content: 'Pattern: Match builds emotional connection then mentions cryptocurrency investment. They share fake profit screenshots, guide user to fraudulent platforms. Red flags: mentions crypto/bitcoin early, shares investment tips, asks to move to WhatsApp/Telegram, reluctant to video call. Flag investment advice + romantic context as HIGH RISK.',
      language: 'en',
      tags: ['safety', 'scam', 'crypto', 'pig_butchering'],
    },
    {
      category: 'voice_cloning_scams',
      title: 'Voice Cloning Scams',
      content: 'Scammers use AI voice cloning to impersonate matches. Red flags: voice messages sound slightly robotic, reluctance to do live calls, inconsistencies between written and spoken style. Advise: prefer live video calls over voice-only, ask spontaneous questions.',
      language: 'en',
      tags: ['safety', 'scam', 'voice_cloning', 'ai'],
    },
    {
      category: 'social_engineering_2026',
      title: 'Advanced Social Engineering',
      content: 'Modern scam patterns: 1) Sextortion - build intimacy then threaten. 2) Employment scams - fake jobs to collect data. 3) Gift card scams - claim emergency. 4) QR code scams - phishing via fake restaurant QR codes. Flag urgency + financial requests.',
      language: 'en',
      tags: ['safety', 'scam', 'social_engineering'],
    },
  ];

  // Coach chunks
  const coachChunks = [
    {
      category: 'anxiety_management',
      title: 'Dating Anxiety Management',
      content: 'When users express anxiety: 1) Validate feelings. 2) Suggest small steps: text, voice message, video call, coffee date. 3) Reframe anxiety as excitement. 4) Breathing: 4-7-8 method before dates. 5) Remind them the other person is probably nervous too. Never suggest alcohol as solution.',
      language: 'en',
      tags: ['coaching', 'anxiety', 'confidence'],
    },
    {
      category: 'dating_burnout',
      title: 'Dating App Burnout Recovery',
      content: 'Signs: swiping without looking, dreading messages, comparing to ex. Recovery: 1) Pause 1-2 weeks. 2) Reflect on what you want. 3) Quality over quantity. 4) Set boundaries. 5) Its a tool, not an obligation. Suggest pausing account.',
      language: 'en',
      tags: ['coaching', 'burnout', 'self_care'],
    },
    {
      category: 'ghosting_recovery',
      title: 'Dealing with Ghosting',
      content: 'When ghosted: 1) Normalize it. 2) Max 1 check-in after 3 days. 3) Analyze patterns. 4) Move on - swipe 3 new profiles. 5) Prevention: meet in person within 7-10 days. For recurring ghosting: review profile and conversation patterns.',
      language: 'en',
      tags: ['coaching', 'ghosting', 'rejection'],
    },
    {
      category: 'low_self_esteem',
      title: 'Building Self-Worth in Dating',
      content: 'When users say nobody likes me: 1) NEVER agree or disagree. 2) Redirect to improvements. 3) Highlight strengths from profile data. 4) Suggest Photo Coach. 5) Celebrate small wins. 6) Compatibility > attractiveness. Not therapy - refer to professional if patterns suggest depression.',
      language: 'en',
      tags: ['coaching', 'self_esteem', 'confidence'],
    },
    {
      category: 'post_breakup_dating',
      title: 'Returning After Breakup',
      content: 'After breakup: 1) If <1 month, suggest more time. 2) Help avoid profile about ex. 3) Redirect comparisons to new discoveries. 4) First dates: low-pressure (coffee, walk). 5) Start with casual conversations to rebuild confidence.',
      language: 'en',
      tags: ['coaching', 'breakup', 'recovery'],
    },
  ];

  for (const chunk of modChunks) {
    batch.set(db.collection('moderationKnowledge').doc(), {
      ...chunk,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'manual_2026_update',
    });
  }

  for (const chunk of coachChunks) {
    batch.set(db.collection('coachKnowledge').doc(), {
      ...chunk,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'manual_2026_update',
    });
  }

  await batch.commit();

  const modCount = (await db.collection('moderationKnowledge').get()).size;
  const coachCount = (await db.collection('coachKnowledge').get()).size;

  console.log('RAG chunks added:');
  console.log('  Moderation: +4 (total: ' + modCount + ')');
  console.log('  Coach: +5 (total: ' + coachCount + ')');
  console.log('  New mod topics: deepfakes, crypto scams, voice cloning, social engineering');
  console.log('  New coach topics: anxiety, burnout, ghosting, self-esteem, post-breakup');
}

addChunks().catch(console.error);
