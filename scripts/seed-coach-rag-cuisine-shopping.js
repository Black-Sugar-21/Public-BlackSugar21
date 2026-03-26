const admin = require('firebase-admin');
try { admin.initializeApp(); } catch(e) {}
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = admin.firestore();

const COLLECTION = 'coachKnowledge';
const EMBEDDING_MODEL = 'gemini-embedding-001';
const DIMENSIONS = 768;

// New RAG chunks to add — cuisine, shopping, activities, date types
const chunks = [
  // ═══ CUISINE DATE ADVICE ═══
  {category: 'cuisine_arabic', language: 'multi', text: 'Arabic cuisine date tips: Share mezze platters (hummus, falafel, baba ganoush, tabbouleh) for a communal, intimate experience. Shawarma and kebabs are great casual options. Mint tea or Turkish coffee are perfect after-dinner drinks. Many Arabic restaurants have beautiful decor with lanterns and cushions — perfect for romance. Tip: eating with hands from shared plates builds connection. Ask your date to try something new together.'},
  {category: 'cuisine_chinese', language: 'multi', text: 'Chinese cuisine date tips: Dim sum is perfect for brunch dates — ordering many small dishes creates conversation. Hot pot is incredibly interactive and fun for couples. Peking duck is impressive for special occasions. Bubble tea shops are great for casual first dates. Chopstick etiquette: never stick them upright in rice. Chinese restaurants with lazy susans make sharing easy and playful. Try ordering a mix of familiar and adventurous dishes.'},
  {category: 'cuisine_italian', language: 'multi', text: 'Italian cuisine date tips: Trattorias are more intimate than formal ristoranti. Share an antipasti board to start. Pasta is universally loved — safe choice for first dates. Wine pairing adds sophistication. Tiramisu or panna cotta to share for dessert is romantic. Italian restaurants often have warm lighting and rustic charm. Tip: Italians eat slowly and savor — don\'t rush the meal, it\'s about the conversation.'},
  {category: 'cuisine_japanese', language: 'multi', text: 'Japanese cuisine date tips: Omakase (chef\'s choice) sushi is a special occasion experience. Ramen shops are perfect for casual dates — slurping is acceptable and even polite. Izakayas (Japanese pubs) are great for sharing small plates and sake. Tempura and yakitori are interactive. Japanese restaurants often have beautiful minimalist aesthetics. Tip: say "itadakimasu" before eating to impress. Matcha desserts are a sweet ending.'},
  {category: 'cuisine_mexican', language: 'multi', text: 'Mexican cuisine date tips: Tacos al pastor are a must-try street food date. Mole dishes show culinary sophistication. Margaritas and mezcal cocktails set a fun mood. Guacamole made tableside is interactive and impressive. Mexican cantinas have vibrant, festive atmospheres. Churros and hot chocolate for dessert is romantic. Tip: spice tolerance varies — ask your date\'s preference before ordering habanero.'},
  {category: 'cuisine_thai', language: 'multi', text: 'Thai cuisine date tips: Pad Thai is a safe crowd-pleaser. Green curry and Tom Yum soup are flavorful conversation starters. Thai restaurants often have beautiful orchid decorations. Mango sticky rice is the perfect shared dessert. Thai iced tea is Instagram-worthy. Street food tours in Thai neighborhoods make adventurous dates. Tip: spice levels matter — order mild to start and add heat gradually.'},
  {category: 'cuisine_indian', language: 'multi', text: 'Indian cuisine date tips: Tandoori dishes are visually impressive and delicious. Naan bread for sharing creates intimacy. Butter chicken is universally loved — safe first date choice. Indian restaurants often have warm, aromatic atmospheres. Chai after dinner is a nice tradition. Biryani is a complete meal that shows culinary culture. Tip: many Indian dishes are naturally vegetarian/vegan — great for dietary accommodations.'},
  {category: 'cuisine_korean', language: 'multi', text: 'Korean cuisine date tips: Korean BBQ is the ultimate interactive date — grilling meat together is bonding. Bibimbap is colorful and customizable. Soju and makgeolli add fun to the evening. Korean fried chicken and beer (chimaek) is casual and trendy. Karaoke after dinner is a classic Korean date combo. Tip: banchan (side dishes) are free refills — great conversation starters as you try each one.'},
  {category: 'cuisine_french', language: 'multi', text: 'French cuisine date tips: Bistros are romantic without being stuffy. A cheese and charcuterie board with wine is classically intimate. Crêpes make charming casual dates. French onion soup is comfort food with elegance. Crème brûlée is the quintessential shared dessert. Tip: the French take dining seriously — dress a bit nicer, enjoy each course, and never rush. A good sommelier can make wine selection effortless.'},
  {category: 'cuisine_peruvian', language: 'multi', text: 'Peruvian cuisine date tips: Ceviche is fresh and impressive — perfect for lunch dates. Lomo saltado blends cultures (Chinese-Peruvian). Pisco sour cocktails set a festive mood. Anticuchos are great for adventurous eaters. Peruvian-Japanese fusion (Nikkei) is trendy and unique. Tip: Peru has incredible food diversity — from coast to mountains to jungle. A pisco tasting flight makes for a fun date activity.'},
  {category: 'cuisine_mediterranean', language: 'multi', text: 'Mediterranean cuisine date tips: Mezze sharing plates create an intimate, relaxed atmosphere. Grilled fish with olive oil and herbs is light and healthy. Greek salad with feta is a classic starter. Baklava or kunafa for dessert is sweet and memorable. Mediterranean restaurants often have terrace seating — perfect for warm evenings. Tip: the Mediterranean diet is known for longevity — joke that you\'re planning for a long future together.'},
  {category: 'cuisine_vegan', language: 'multi', text: 'Vegan/vegetarian date tips: Modern vegan restaurants are creative and impressive even for non-vegans. Buddha bowls and acai bowls are Instagram-worthy. Plant-based burger joints are casual and fun. Raw food restaurants offer unique experiences. Smoothie and juice bars work for health-conscious first dates. Tip: choosing a vegan spot shows you care about your date\'s values. Many cities now have vegan fine dining — perfect for special occasions.'},
  {category: 'cuisine_fusion', language: 'multi', text: 'Fusion cuisine date tips: Fusion restaurants show culinary creativity — great conversation starters. Peruvian-Japanese (Nikkei), Korean-Mexican, and Asian-Latin fusion are trending. These spots often have modern, trendy atmospheres. Tasting menus let you experience many flavors together. Fusion cocktails pair well with adventurous food. Tip: fusion restaurants signal you\'re open-minded and culturally curious — attractive qualities on a date.'},

  // ═══ SHOPPING/GIFT ADVICE ═══
  {category: 'gift_chocolate', language: 'multi', text: 'Chocolate gift guide for dating: Dark chocolate (70%+) is sophisticated and shows taste. Belgian and Swiss chocolates are premium choices. Artisanal bean-to-bar chocolates show you went the extra mile. A box of assorted truffles is safe and luxurious. Hot chocolate kits make cozy date-at-home gifts. Pair with wine (red with dark, white with milk chocolate). Tip: avoid generic grocery store brands — find a local chocolatier for maximum impression. Personalized boxes with their favorites show you listen.'},
  {category: 'gift_flowers', language: 'multi', text: 'Flower gift guide for dating: Red roses = classic romance but can be intense for early dating. Sunflowers = cheerful and creative. Peonies = elegance and charm. Tulips = simple and sweet. A mixed bouquet shows thoughtfulness without being too intense. Succulents or potted plants last longer and show you think long-term. For first dates: a single flower is charming without overwhelming. Tip: know their favorite color and choose complementary flowers. Avoid lilies if they have cats.'},
  {category: 'gift_jewelry', language: 'multi', text: 'Jewelry gift guide for dating: Earrings are a safe choice — less intimate than a necklace. Bracelets are casual and thoughtful. Avoid rings early in dating (too much pressure). Personalized pieces (initials, birthstone) show effort. Sterling silver is affordable yet elegant. Gold vermeil offers luxury at moderate cost. Tip: pay attention to what they already wear — gold vs silver, minimalist vs statement. A jewelry box with a handwritten note elevates any piece.'},
  {category: 'gift_perfume', language: 'multi', text: 'Perfume gift guide for dating: Perfume is intimate — best for established relationships. Sample sets let them choose. Unisex fragrances are modern and safe. Candles with their favorite scent are a softer alternative. Diffusers for their home show you think about their space. Tip: take note of what they already wear and find complementary scents. A perfume shopping date (testing scents together) is itself a great date idea. Avoid overpowering scents.'},
  {category: 'gift_wine', language: 'multi', text: 'Wine gift guide for dating: A nice bottle of wine shows sophistication. Champagne/prosecco signals celebration. A wine tasting kit or course makes a date experience gift. Local wines from their heritage region shows cultural awareness. Wine accessories (opener, aerator, glasses) are practical and lasting. Tip: pair the wine with an occasion — "I picked this because it\'s from the region your family is from." Avoid cheap wine — mid-range ($15-30) is perfect.'},
  {category: 'gift_general', language: 'multi', text: 'General gift ideas for dating: Experience gifts (cooking class, wine tasting, escape room) create memories together. Books by their favorite author show you listen. Spotify playlist with songs that remind you of them — free but incredibly thoughtful. Personalized items (engraved, monogrammed) show effort. Subscription boxes (coffee, tea, snacks) keep you in their mind monthly. Handwritten letters never go out of style. Tip: the best gifts reference a conversation you had — "Remember when you said you wanted to try..."'},

  // ═══ ACTIVITY DATE TYPES ═══
  {category: 'date_cafe', language: 'multi', text: 'Cafe date tips: Perfect for first dates — casual, public, easy to extend or end. Specialty coffee shops show taste. Try latte art workshops as an activity. Tea houses offer a calmer alternative. Brunch cafes are great for daytime dates. Tip: sit side by side or at an angle rather than across — it feels more intimate. Avoid peak hours for better conversation. A "coffee crawl" visiting multiple cafes makes an adventurous date.'},
  {category: 'date_bar', language: 'multi', text: 'Bar date tips: Cocktail bars are ideal for evening chemistry. Speakeasies have mysterious, romantic vibes. Wine bars are sophisticated and intimate. Breweries/taprooms are casual and fun for craft beer lovers. Rooftop bars add stunning views. Tip: arrive first and get a good spot. Two drinks is the sweet spot — enough to relax, not too much. Ask the bartender for recommendations together — it\'s a bonding moment. Avoid loud sports bars for first dates.'},
  {category: 'date_outdoor', language: 'multi', text: 'Outdoor date tips: Picnics in the park are romantic and show effort. Hiking together builds trust and conversation. Beach walks at sunset are universally romantic. Botanical gardens combine beauty with walking conversation. Farmers markets are fun for weekend mornings. Bike rides through the city create shared adventure. Tip: bring a blanket, snacks, and a bluetooth speaker for park dates. Check weather the night before. Have a backup indoor plan.'},
  {category: 'date_cultural', language: 'multi', text: 'Cultural date tips: Museums spark deep conversations about art and history. Art gallery openings often have free wine. Theater/plays are impressive date experiences. Live music creates emotional connection. Comedy shows share laughter — the best bonding. Film festivals for movie lovers. Tip: discuss what you saw afterward over drinks — the real date happens in the conversation after the event. Choose interactive exhibits over passive viewing.'},
  {category: 'date_adventure', language: 'multi', text: 'Adventure date tips: Escape rooms test teamwork and communication. Go-karts and mini golf are playful and competitive. Rock climbing builds trust literally. Cooking classes are collaborative and result in a shared meal. Pottery/art classes are creative and tactile. Zip-lining and amusement parks create adrenaline bonding. Tip: shared adrenaline experiences create stronger emotional bonds (misattribution of arousal). Choose activities where you face each other, not screens.'},
  {category: 'date_spa', language: 'multi', text: 'Spa date tips: Couples massages are intimate and relaxing. Hot springs/thermal baths are romantic in cooler weather. Facial treatments together are fun and gender-neutral. Sauna sessions followed by cold plunge are bonding. Hammam/Turkish bath experiences are culturally interesting. Tip: spa dates work best after several dates — nudity/vulnerability requires trust. Book in advance and check dress code. Post-spa, continue with tea or a light meal.'},
  {category: 'date_nightlife', language: 'multi', text: 'Nightlife date tips: Start at a quiet cocktail bar before moving to a livelier venue. Dance clubs work if you both enjoy dancing — test the waters first. Karaoke is hilarious and vulnerable — great for bonding. Jazz clubs are sophisticated with great ambiance. Comedy clubs guarantee laughter. Late-night food after the club is a romantic tradition. Tip: the progression from calm to energetic is key — don\'t start at peak intensity.'},

  // ═══ SEASONAL/OCCASION ADVICE ═══
  {category: 'date_seasonal', language: 'multi', text: 'Seasonal date ideas: Spring — cherry blossom viewing, outdoor markets, garden picnics. Summer — beach days, rooftop bars, ice cream crawls, outdoor concerts. Fall — apple picking, pumpkin patches, cozy cafe dates, wine harvests. Winter — Christmas markets, ice skating, hot chocolate tours, fireside dinners. Rainy days — museums, cooking together, board game cafes, movie marathons. Tip: seasonal dates feel special because they\'re limited-time — creates urgency and memories.'},
  {category: 'date_special_occasion', language: 'multi', text: 'Special occasion date ideas: Anniversary — recreate your first date with upgrades. Birthday — surprise dinner at their dream restaurant + meaningful gift. Valentine\'s — avoid cliché restaurants, cook together or find a hidden gem. Proposal — their favorite place with personal meaning beats any generic fancy spot. Celebration — champagne toast at a rooftop with city views. Tip: the best special occasion dates reference your shared history — "Remember when we..."'},
  {category: 'date_budget', language: 'multi', text: 'Budget-friendly date ideas: Sunset watching with homemade snacks — free and romantic. Museum free days exist in most cities. Cooking dinner together costs less than eating out and is more intimate. Park picnics with simple food are charming. Free live music and street performances. Library or bookstore browsing followed by coffee. Star gazing away from city lights. Tip: creativity matters more than money — a $5 date with thought beats a $100 date without it.'},
];

async function embedAndStore() {
  const apiKey = process.env.GEMINI_API_KEY || (await admin.secretManager?.accessSecretVersion?.('GEMINI_API_KEY'))?.payload?.data?.toString();
  
  // Try to get API key from Firebase secrets
  let key = apiKey;
  if (!key) {
    const secretDoc = await db.collection('_config').doc('secrets').get();
    key = secretDoc.exists ? secretDoc.data().geminiApiKey : null;
  }
  if (!key) {
    // Get from Firebase Functions config
    const rc = admin.remoteConfig();
    const template = await rc.getTemplate();
    const config = JSON.parse(template.parameters.coach_config.defaultValue.value);
    // Can't get secret from RC, use environment
    console.log('⚠️ No API key found in env. Set GEMINI_API_KEY environment variable.');
    console.log('Running with placeholder embeddings for testing...');
    key = null;
  }

  const genai = key ? new GoogleGenerativeAI(key) : null;
  const embModel = genai ? genai.getGenerativeModel({model: EMBEDDING_MODEL}) : null;

  let added = 0, skipped = 0, errors = 0;

  for (const chunk of chunks) {
    try {
      // Check if already exists
      const existing = await db.collection(COLLECTION)
        .where('category', '==', chunk.category)
        .where('text', '==', chunk.text.substring(0, 100))
        .limit(1).get();
      
      if (!existing.empty) {
        skipped++;
        continue;
      }

      let embedding;
      if (embModel) {
        const result = await embModel.embedContent({
          content: {parts: [{text: chunk.text}]},
          taskType: 'RETRIEVAL_DOCUMENT',
          outputDimensionality: DIMENSIONS,
        });
        embedding = result.embedding.values;
      } else {
        // Placeholder embedding for testing
        embedding = Array.from({length: DIMENSIONS}, () => Math.random() * 2 - 1);
      }

      await db.collection(COLLECTION).add({
        text: chunk.text,
        category: chunk.category,
        language: chunk.language,
        embedding: embedding,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      added++;
      process.stdout.write('✅ ' + chunk.category + '\n');
      
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
