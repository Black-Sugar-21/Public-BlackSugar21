'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onObjectFinalized } = require('firebase-functions/v2/storage');
const { logger } = require('firebase-functions/v2');
const { getLocalizedError } = require('./shared');
const admin = require('firebase-admin');
const path = require('path');
const os = require('os');
const fs = require('fs');
const sharp = require('sharp');

exports.generateProfileThumbnail = onObjectFinalized(
  {
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 60,
  },
  async (event) => {
    const filePath = event.data.name;        // ej: 'users/abc123/uuid.jpg'
    const contentType = event.data.contentType;
    const bucket = admin.storage().bucket(event.data.bucket);

    // ── REGLA 1: Solo imágenes ────────────────────────────────────────────────
    if (!contentType || !contentType.startsWith('image/')) {
      logger.info(`[thumb] Skipping — not an image: ${filePath}`);
      return;
    }

    // ── REGLA 2: Solo fotos de perfil (users/) ───────────────────────────────
    // Stories van a: stories/{matchId}/ y stories/personal_stories/{userId}/
    // Esos paths NO necesitan thumbnail (se cargan full-size, son temporales 24h)
    if (!filePath.startsWith('users/')) {
      logger.info(`[thumb] Skipping — not a profile picture: ${filePath}`);
      return;
    }

    // ── REGLA 3: No procesar _thumb para evitar bucle ─────────────────────────
    const fileName = path.basename(filePath);
    if (fileName.includes('_thumb')) {
      logger.info(`[thumb] Skipping — already a thumbnail: ${filePath}`);
      return;
    }

    // ── REGLA 4: Solo JPEG (el formato que usan iOS y Android) ───────────────
    const ext = path.extname(fileName).toLowerCase();
    if (ext !== '.jpg' && ext !== '.jpeg') {
      logger.info(`[thumb] Skipping — not JPEG: ${filePath}`);
      return;
    }

    // ── Construir path del thumbnail ──────────────────────────────────────────
    const dir = path.dirname(filePath);
    const nameWithoutExt = path.basename(fileName, ext);
    const thumbFileName = `${nameWithoutExt}_thumb.jpg`;
    const thumbPath = `${dir}/${thumbFileName}`;

    // ── REGLA 5: Idempotente — saltar si thumb ya existe ─────────────────────
    const [thumbExists] = await bucket.file(thumbPath).exists();
    if (thumbExists) {
      logger.info(`[thumb] Skipping — thumbnail already exists: ${thumbPath}`);
      return;
    }

    logger.info(`[thumb] Generating: ${filePath} → ${thumbPath}`);

    const tmpOriginal = path.join(os.tmpdir(), `orig_${fileName}`);
    const tmpThumb = path.join(os.tmpdir(), `th_${thumbFileName}`);

    try {
      // Descargar imagen original a /tmp
      await bucket.file(filePath).download({destination: tmpOriginal});

      // Generar thumbnail 400px max — igual que el cliente iOS/Android
      // fit: 'inside' conserva aspect ratio sin recortar
      // withoutEnlargement: no agranda si ya es ≤ 400px
      await sharp(tmpOriginal)
        .resize(400, 400, {fit: 'inside', withoutEnlargement: true})
        .jpeg({quality: 75, progressive: true})
        .toFile(tmpThumb);

      // Subir thumbnail con metadata explicativa
      await bucket.upload(tmpThumb, {
        destination: thumbPath,
        metadata: {
          contentType: 'image/jpeg',
          metadata: {
            generatedBy: 'generateProfileThumbnail',
            originalFile: filePath,
            generatedAt: new Date().toISOString(),
          },
        },
      });

      logger.info(`[thumb] ✅ Thumbnail generado: ${thumbPath}`);
    } finally {
      // Limpiar /tmp siempre, incluso si hay error
      if (fs.existsSync(tmpOriginal)) fs.unlinkSync(tmpOriginal);
      if (fs.existsSync(tmpThumb)) fs.unlinkSync(tmpThumb);
    }
  },
);

/**
 * Callable Function: Generar thumbnails faltantes de forma retroactiva
 *
 * Útil para imágenes históricas subidas antes de implementar el pipeline
 * progresivo, o imágenes cuyo cliente falló al subir el _thumb.jpg.
 *
 * Parámetros:
 *   - userId (opcional): si se pasa, solo procesa fotos de ese usuario.
 *     Si no se pasa, procesa TODOS los usuarios (operación costosa).
 *
 * Uso desde Firebase Console o script admin:
 *   firebase functions:call generateMissingThumbnails --data '{"userId":"abc123"}'
 */
// ─────────────────────────────────────────────────────────────────────────────
// UNMATCH USER
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Callable: Deshacer match entre dos usuarios.
 * Payload: { matchId, otherUserId, language }
 * Response: { success, messagesDeleted }
 * Homologado: iOS FirestoreRemoteDataSource.unmatchUser / Android MatchFirebaseDataSourceImpl
 */

exports.generateMissingThumbnails = onCall(
  {
    region: 'us-central1',
    memory: '1GiB',
    timeoutSeconds: 540,
  },
  async (request) => {
    const {userId, userLanguage} = request.data || {};
    const lang = (userLanguage || 'en').split('-')[0].toLowerCase();
    if (!request.auth) {
      throw new HttpsError('unauthenticated', getLocalizedError('auth_required', lang));
    }
    const bucket = admin.storage().bucket();
    const prefix = userId ? `users/${userId}/` : 'users/';

    logger.info(`[generateMissingThumbnails] Starting scan: prefix="${prefix}"`);

    const [files] = await bucket.getFiles({prefix});

    let processed = 0;
    let skipped = 0;
    let errors = 0;
    const errorList = [];

    for (const file of files) {
      const filePath = file.name;
      const fileName = path.basename(filePath);

      // Saltar: thumbnails existentes, no-JPEG
      const ext = path.extname(fileName).toLowerCase();
      if (fileName.includes('_thumb') || (ext !== '.jpg' && ext !== '.jpeg')) {
        skipped++;
        continue;
      }

      // Construir path del thumbnail esperado
      const dir = path.dirname(filePath);
      const nameWithoutExt = path.basename(fileName, ext);
      const thumbFileName = `${nameWithoutExt}_thumb.jpg`;
      const thumbPath = `${dir}/${thumbFileName}`;

      // Saltar si thumb ya existe
      const [thumbExists] = await bucket.file(thumbPath).exists();
      if (thumbExists) {
        skipped++;
        continue;
      }

      const tmpOriginal = path.join(os.tmpdir(), `orig_${fileName}`);
      const tmpThumb = path.join(os.tmpdir(), `th_${thumbFileName}`);

      try {
        await bucket.file(filePath).download({destination: tmpOriginal});
        await sharp(tmpOriginal)
          .resize(400, 400, {fit: 'inside', withoutEnlargement: true})
          .jpeg({quality: 75, progressive: true})
          .toFile(tmpThumb);
        await bucket.upload(tmpThumb, {
          destination: thumbPath,
          metadata: {
            contentType: 'image/jpeg',
            metadata: {generatedBy: 'generateMissingThumbnails', originalFile: filePath},
          },
        });
        processed++;
        logger.info(`[generateMissingThumbnails] ✅ ${thumbPath}`);
      } catch (e) {
        errors++;
        errorList.push({file: filePath, error: e.message});
        logger.error(`[generateMissingThumbnails] ❌ ${filePath}: ${e.message}`);
      } finally {
        if (fs.existsSync(tmpOriginal)) fs.unlinkSync(tmpOriginal);
        if (fs.existsSync(tmpThumb)) fs.unlinkSync(tmpThumb);
      }
    }

    const summary = {processed, skipped, errors, total: files.length, errorList};
    logger.info(`[generateMissingThumbnails] Done:`, summary);
    return summary;
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULED FUNCTIONS — Reset de likes/super likes, matches, eliminaciones
// ─────────────────────────────────────────────────────────────────────────────
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {onDocumentUpdated} = require('firebase-functions/v2/firestore');

/**
 * Scheduled: Reset de likes diarios.
 * Corre cada hora. Resetea solo usuarios cuya medianoche local ya pasó (usa timezoneOffset).
 * Siempre 100 — alineado con Remote Config daily_likes_limit.
 * Solo notifica si el usuario usó likes (dailyLikesRemaining < 100).
 */
