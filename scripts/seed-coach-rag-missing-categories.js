const admin = require('firebase-admin');
try { admin.initializeApp(); } catch(e) {}
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = admin.firestore();

const COLLECTION = 'coachKnowledge';
const EMBEDDING_MODEL = 'gemini-embedding-001';
const DIMENSIONS = 768;

// Missing RAG chunks — cuisines not covered + activity categories not covered
const chunks = [
  // ═══ MISSING CUISINE CATEGORIES (6) ═══
  {category: 'cuisine_greek', language: 'multi', text: 'Greek cuisine date tips: Souvlaki and gyros are perfect for casual street food dates. A full meze spread (tzatziki, dolma, spanakopita, feta, olives) encourages sharing and conversation. Moussaka is a hearty, comforting choice. Greek salad is fresh and light for summer dates. Ouzo or tsipouro with appetizers is a traditional pairing. Seafood tavernas by the water are incredibly romantic. Baklava or loukoumades (honey doughnuts) for dessert. Tip: Greeks eat late — dinner at 9-10pm is normal. The relaxed pace is perfect for long, meaningful conversations.'},
  {category: 'cuisine_turkish', language: 'multi', text: 'Turkish cuisine date tips: Turkish breakfast (kahvaltı) is a spectacular brunch date — dozens of small dishes spread across the table. Kebabs come in many regional varieties — ask the server for recommendations together. Lahmacun (Turkish pizza) is fun to eat with hands. Turkish coffee with fortune reading from the cup grounds is a romantic tradition. Pide (Turkish flatbread) is great for sharing. Baklava with Turkish tea is the classic dessert pairing. Tip: many Turkish restaurants have beautiful mosaic decor and warm hospitality that makes every meal feel special.'},
  {category: 'cuisine_vietnamese', language: 'multi', text: 'Vietnamese cuisine date tips: Pho is a comforting, soulful soup perfect for any occasion. Bánh mì sandwiches make great casual lunch dates. Spring rolls (fresh or fried) are fun to share. Vietnamese iced coffee (cà phê sữa đá) is strong and sweet — ideal for an afternoon date. Bún chả and bún bò Huế are flavorful noodle options. Vietnamese restaurants are often affordable, making them great for frequent dates. Tip: Vietnamese food is naturally balanced (herbs, spice, sweetness, umami) — a great metaphor for a balanced relationship.'},
  {category: 'cuisine_brazilian', language: 'multi', text: 'Brazilian cuisine date tips: Churrascaria (Brazilian steakhouse) is an impressive all-you-can-eat experience — the rodízio service with skewered meats is theatrical and fun. Açaí bowls are trendy and healthy for casual dates. Coxinhas and pão de queijo are beloved snacks to share. Feijoada (black bean stew) is a hearty Saturday tradition. Caipirinhas are the quintessential Brazilian cocktail. Brigadeiros for dessert are irresistible chocolate truffles. Tip: Brazilian dining culture is warm and social — meals are meant to be long, loud, and joyful.'},
  {category: 'cuisine_asian', language: 'multi', text: 'Asian fusion and general Asian cuisine date tips: Asian food courts and hawker centers offer incredible variety — perfect for indecisive couples. Ramen bars are cozy and intimate. Bao buns and dumplings are trendy shareable items. Poke bowls are fresh and customizable. Bubble tea shops make fun, casual first date spots. Pan-Asian restaurants let you sample multiple cuisines in one meal. Wok-fried dishes are fast and flavorful. Tip: if you are not sure what Asian cuisine your date prefers, a pan-Asian restaurant is a safe, crowd-pleasing choice with something for everyone.'},
  {category: 'cuisine_vegetarian', language: 'multi', text: 'Vegetarian date tips: Vegetarian restaurants have become incredibly creative with plant-based dishes that impress even meat lovers. Farm-to-table restaurants often have outstanding vegetarian options. Indian cuisine is naturally rich in vegetarian dishes — a safe bet. Mediterranean mezze is mostly vegetarian. Pizza is universally loved and easy to customize. Pasta with seasonal vegetables is elegant and simple. Tip: choosing a vegetarian restaurant shows respect for your date\'s dietary choices and environmental values. Many vegetarian spots have hip, trendy atmospheres that make great date venues.'},

  // ═══ MISSING ACTIVITY/DATE CATEGORIES (5) ═══
  {category: 'date_restaurant', language: 'multi', text: 'Restaurant date tips: For first dates, choose mid-range restaurants — too fancy feels like pressure, too casual feels low-effort. Make reservations to show planning. Sit at a booth for more privacy. Ask for a quiet table away from the kitchen. Share appetizers to create intimacy. Let your date order first. Try the restaurant beforehand if possible so you can recommend dishes confidently. Tip: the best restaurant dates are about 2 hours — long enough to connect, short enough to leave wanting more. Always offer to pay, but be gracious if they want to split.'},
  {category: 'date_movie', language: 'multi', text: 'Movie theater date tips: Movies are better for second or third dates — hard to talk during a first date. Choose a genre you both enjoy; avoid horror unless they love it. Arrive early for good seats. Share popcorn (classic bonding). Premium formats (IMAX, recliner seats) feel special. Independent/art house cinemas have more intimate atmospheres. Dinner before the movie gives you conversation time; drinks after gives you something to talk about. Tip: the real date is the conversation afterward — pick a film that sparks discussion, not just entertainment.'},
  {category: 'date_bowling', language: 'multi', text: 'Bowling and game date tips: Bowling is fun even if you are terrible — bad bowling is actually more entertaining and breaks the ice. Mini golf is playful and competitive without being intense. Arcade bars combine games with drinks. Pool/billiards requires getting close to teach shots. Board game cafes are cozy and reveal personality. Escape rooms test teamwork. Tip: competitive activities reveal character — be a gracious winner and a good sport loser. Playful trash talk builds chemistry. Let your date win sometimes. The goal is fun, not victory.'},
  {category: 'date_aquarium_zoo', language: 'multi', text: 'Aquarium and zoo date tips: Walking side by side through exhibits creates natural conversation. Aquariums have calming, romantic blue lighting. Penguin and otter exhibits are adorable and mood-lifting. Zoos are great for daytime dates with lots of walking. Feeding experiences or behind-the-scenes tours make it special. Botanical gardens within zoos add variety. Tip: these venues work at any relationship stage — casual enough for first dates, special enough for anniversaries. Check for evening events — many aquariums and zoos host adults-only nights with drinks.'},
  {category: 'date_shopping', language: 'multi', text: 'Shopping date tips: Window shopping together reveals tastes and personality. Bookstores are intimate and spark conversations about interests. Vintage/thrift shopping is adventurous and affordable. Farmers markets combine food, walking, and discovery. Flea markets and craft fairs feel like treasure hunts together. Shopping for each other (pick an outfit, choose a book) is a fun challenge. Tip: avoid luxury shopping early in dating — it creates uncomfortable dynamics. Keep it casual and playful. The best shopping dates end at a cafe with your finds.'},
];

async function embedAndStore() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('Set GEMINI_API_KEY environment variable.');
    process.exit(1);
  }

  const genai = new GoogleGenerativeAI(apiKey);
  const embModel = genai.getGenerativeModel({model: EMBEDDING_MODEL});

  let added = 0, skipped = 0, errors = 0;

  for (const chunk of chunks) {
    try {
      // Check if category already exists
      const existing = await db.collection(COLLECTION)
        .where('category', '==', chunk.category)
        .limit(1).get();

      if (!existing.empty) {
        console.log('⏭️  ' + chunk.category + ' (already exists)');
        skipped++;
        continue;
      }

      const result = await embModel.embedContent({
        content: {parts: [{text: chunk.text}]},
        taskType: 'RETRIEVAL_DOCUMENT',
        outputDimensionality: DIMENSIONS,
      });
      const embedding = result.embedding.values;

      await db.collection(COLLECTION).add({
        text: chunk.text,
        category: chunk.category,
        language: chunk.language,
        embedding: embedding,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      added++;
      console.log('✅ ' + chunk.category);

      // Rate limit
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      errors++;
      console.log('❌ ' + chunk.category + ': ' + e.message);
    }
  }

  console.log('\n=== DONE ===');
  console.log('Added:', added);
  console.log('Skipped (existing):', skipped);
  console.log('Errors:', errors);
  console.log('Total chunks now:', (await db.collection(COLLECTION).count().get()).data().count);
}

embedAndStore().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
