'use strict';

const {defineSecret} = require('firebase-functions/params');
const {GoogleGenerativeAI} = require('@google/generative-ai');

// ─── Secrets ─────────────────────────────────────────────────────────────────
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const placesApiKey = defineSecret('GOOGLE_PLACES_API_KEY');

// ─── AI Model Constants ──────────────────────────────────────────────────────
const AI_MODEL_NAME = 'gemini-2.5-flash';
const AI_MODEL_LITE = 'gemini-2.5-flash-lite';

// ─── Shared Helper Functions ─────────────────────────────────────────────────

function getLanguageInstruction(lang) {
  if (lang.startsWith('zh')) return '重要提示：请用中文回答所有内容。';
  if (lang.startsWith('ar')) return 'مهم: أجب على كل شيء بالعربية.';
  if (lang.startsWith('id') || lang.startsWith('ms')) return 'PENTING: Jawab SEMUA dalam Bahasa Indonesia.';
  if (lang.startsWith('pt')) return 'IMPORTANTE: Responda TUDO em português.';
  if (lang.startsWith('fr')) return 'IMPORTANT: Répondez à TOUT en français.';
  if (lang.startsWith('ja')) return '重要：すべて日本語で回答してください。';
  if (lang.startsWith('ru')) return 'ВАЖНО: Отвечайте на ВСЁ на русском языке.';
  if (lang.startsWith('de')) return 'WICHTIG: Antworten Sie auf ALLES auf Deutsch.';
  if (lang.startsWith('es')) return 'IMPORTANTE: Responde TODO en ESPAÑOL.';
  return 'IMPORTANT: Respond EVERYTHING in ENGLISH.';
}

function normalizeCategory(cat) {
  if (!cat) return 'restaurant';
  const c = cat.toLowerCase();
  // café — EN/ES/PT/FR/DE/IT/ID/KO/ZH/AR
  if (/\bcafe\b|coffee|coffeehouse|tea_house|coffee_shop|cafetería|kaffee|caffè|kopi|카페|카피|kafe\b|kafeterya/.test(c)) return 'cafe';
  // bar — EN/ES/PT/FR/DE/IT/ID/AR + Google subtypes
  if (/\bbar\b|pub\b|lounge|speakeasy|cocktail|jazz|wine_bar|whiskey_bar|sake_bar|beer_garden|beer_hall|tapas_bar|brewery|taproom|cervecería|taberna|birreria|brasserie|kneipe/.test(c)) return 'bar';
  // nightclub — EN/ES/PT/FR/DE/IT/ID/KO/ZH/AR
  if (/night_?club|disco|club_nocturno|dancehall|boate|boîte|nachtclub|malam|나이트/.test(c)) return 'night_club';
  // museum — checked BEFORE movie_theater: eliminates need for negative lookaheads (?!.*museum)
  // history_museum, science_museum, art_museum, etc. all correctly classified here
  if (/museum|exhibit|cultural|historical|history_museum|science_museum|childrens_museum|natural_history|cultural_center|cultural_landmark|museo|museu|musée|muzeum|博物|متحف/.test(c)) return 'museum';
  // art gallery — after museum so "art_museum" stays as museum
  if (/\bart[ _]?gallery|galería[ _]?de[ _]?arte|galerie[ _]?d[ _]?art|kunstgalerie|galleria[ _]?d[ _]?arte|pinacoteca|art_studio|galeri[ _]?seni|美術館|艺术画廊|معرض[ _]?فني/.test(c)) return 'art_gallery';
  // cinema — no lookahead needed: museum/art_gallery already handled above
  if (/movie|cinema|cine\b|theater|theatre|bioscoop|kino|sinema|映画|电影|سينما/.test(c)) return 'movie_theater';
  // park — EN/ES/PT/FR/DE/IT/ID/JA/ZH/AR + Google subtypes
  if (/\bpark\b|garden|trail|beach|playa|hik|nature|viewpoint|picnic|botanical|lake|river|scenic|outdoor|national_park|nature_preserve|scenic_point|hiking_area|plaza|parque|jardim|giardino|taman|jardin|公园|公園|حديقة/.test(c)) return 'park';
  // bowling & entertainment venues
  if (/bowling|boliche|billard|billiard|arcade|amusement|escape_room|laser_tag/.test(c)) return 'bowling_alley';
  // bakery — EN/ES/PT/FR/DE/IT/ID/JA/ZH/AR + Google subtypes
  if (/bakery|pastry|pastel|panaderia|patisserie|confectionery|candy_store|dessert_shop|ice_cream_shop|donut|boulangerie|bäckerei|panificio|panadería|padaria|toko[ _]?roti|ベーカリー|面包|مخبز/.test(c)) return 'bakery';
  // shopping — avoid 'supermarket' false positive without ReDoS lookahead
  if (/shopping|mall|department_store|outlet_mall|clothing_store|tienda|centro[ _]?comercial|einkaufszentrum|centro[ _]?commerciale|pusat[ _]?perbelanjaan|ショッピング|购物|مركز[ _]?تسوق/.test(c) ||
      (c.includes('market') && !c.includes('supermarket') && !c.includes('super_market'))) return 'shopping_mall';
  // spa & wellness — EN/ES/PT/FR/DE/IT/ID/JA/ZH/AR + Google subtypes
  if (/\bspa\b|yoga|wellness|wellness_center|massage|massage_therapist|meditation|sauna|pilates|thermal|hammam|onsen|beauty_salon|nail_salon|termas|balneario|pijat|スパ|水疗|سبا/.test(c)) return 'spa';
  // aquarium — EN/ES/PT/FR/DE/IT/ID/JA/ZH/AR
  if (/aquarium|acuario|oceanarium|aquário|水族|أكواريوم/.test(c)) return 'aquarium';
  // zoo — EN/ES/PT/FR/DE/IT/ID/JA/ZH/AR + Google subtypes
  if (/\bzoo\b|zoolog|wildlife_park|safari|bioparque|kebun[ _]?binatang|jardin[ _]?zoologique|tierpark|giardino[ _]?zoologico|動物園|动物园|حديقة[ _]?حيوان/.test(c)) return 'zoo';
  // restaurant — EN/ES/PT/FR/DE/IT/ID/JA/ZH/AR + all Google restaurant subtypes (default food)
  if (/restaurant|dining|food|pizza|sushi|bistro|grill|steakhouse|brunch|diner|ramen|taco|burger|seafood|buffet|trattoria|ristorante|churrascaria|warung|rumah[ _]?makan|レストラン|餐厅|مطعم/.test(c)) return 'restaurant';
  return 'restaurant';
}

const categoryEmojiMap = {cafe: '☕', restaurant: '🍽️', bar: '🍺', night_club: '💃', movie_theater: '🎬', park: '🌳', museum: '🏛️', bowling_alley: '🎳', art_gallery: '🎨', bakery: '🥐', shopping_mall: '🛍️', spa: '💆', aquarium: '🐠', zoo: '🦁'};

function parseGeminiJsonResponse(responseText) {
  let cleanText = responseText.trim();
  const jsonBlockMatch = cleanText.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    cleanText = jsonBlockMatch[1];
  } else {
    const unclosedMatch = cleanText.match(/```json\s*([\s\S]*)/);
    if (unclosedMatch) {
      cleanText = unclosedMatch[1].trim();
    }
    const startIdx = cleanText.indexOf('{');
    const endIdx = cleanText.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      cleanText = cleanText.substring(startIdx, endIdx + 1);
    }
  }
  return JSON.parse(cleanText);
}

module.exports = {
  geminiApiKey,
  placesApiKey,
  AI_MODEL_NAME,
  AI_MODEL_LITE,
  GoogleGenerativeAI,
  getLanguageInstruction,
  normalizeCategory,
  categoryEmojiMap,
  parseGeminiJsonResponse,
};
