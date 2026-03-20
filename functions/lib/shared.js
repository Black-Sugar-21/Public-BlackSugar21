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
  if (/\bcafe\b|coffee|coffeehouse|tea_house/i.test(c)) return 'cafe';
  if (/\bbar\b|pub\b|lounge|speakeasy|cocktail|jazz|wine_bar|brewery|taproom/i.test(c)) return 'bar';
  if (/night_?club|disco|club_nocturno|dancehall/i.test(c)) return 'night_club';
  if (/movie|cinema|cine\b|theater(?!.*museum)|theatre(?!.*museum)/i.test(c)) return 'movie_theater';
  if (/\bpark\b|garden|trail|beach|playa|hik|nature|viewpoint|picnic|botanical|lake|river|scenic|outdoor/i.test(c)) return 'park';
  if (/museum|exhibit|cultural|historical/i.test(c)) return 'museum';
  if (/bowling/i.test(c)) return 'bowling_alley';
  if (/gallery|art_gallery/i.test(c)) return 'art_gallery';
  if (/bakery|pastry|pastel|panaderia|patisserie/i.test(c)) return 'bakery';
  if (/shopping|mall|store|tienda|market(?!.*super)/i.test(c)) return 'shopping_mall';
  if (/\bspa\b|yoga|wellness|massage|meditation|sauna|pilates|thermal/i.test(c)) return 'spa';
  if (/aquarium|acuario/i.test(c)) return 'aquarium';
  if (/\bzoo\b|zoolog/i.test(c)) return 'zoo';
  if (/restaurant|dining|food|pizza|sushi|bistro|grill|steakhouse|brunch|diner|ramen|taco|burger|seafood|buffet/i.test(c)) return 'restaurant';
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
