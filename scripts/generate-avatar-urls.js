#!/usr/bin/env node

/**
 * Script simplificado para generar URLs de avatares de prueba
 * Usa imágenes de RandomUser.me API - servicio gratuito
 */

const fs = require('fs');
const path = require('path');

// Generar 10 avatares por género con números fijos para consistencia
const generateAvatarUrls = () => {
  const avatars = {
    women: [],
    men: []
  };
  
  // Usar índices específicos para tener siempre las mismas caras
  const womenIndices = [1, 5, 9, 12, 16, 19, 23, 28, 32, 37];
  const menIndices = [2, 7, 11, 15, 20, 24, 29, 33, 38, 42];
  
  womenIndices.forEach(i => {
    avatars.women.push(`https://randomuser.me/api/portraits/women/${i}.jpg`);
  });
  
  menIndices.forEach(i => {
    avatars.men.push(`https://randomuser.me/api/portraits/men/${i}.jpg`);
  });
  
  return avatars;
};

// Generar y guardar URLs
const avatarUrls = generateAvatarUrls();
const outputPath = path.join(__dirname, 'test-avatars-urls.json');
fs.writeFileSync(outputPath, JSON.stringify(avatarUrls, null, 2));

console.log('✅ Archivo de configuración de avatares creado\n');
console.log('📊 Avatares configurados:');
console.log(`   - Mujeres: ${avatarUrls.women.length}`);
console.log(`   - Hombres: ${avatarUrls.men.length}`);
console.log(`   - Total: ${avatarUrls.women.length + avatarUrls.men.length}\n`);
console.log(`💾 Guardado en: ${outputPath}\n`);
console.log('ℹ️  Nota: Estas imágenes se sirven desde RandomUser.me');
console.log('   Son públicas y funcionarán para pruebas.\n');

