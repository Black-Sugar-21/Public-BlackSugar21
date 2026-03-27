'use strict';
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

/**
 * Firestore trigger: When a new tester signup is created,
 * mark it as received and log for admin review.
 *
 * Admin adds testers to Play Console manually from Firestore Console
 * or via: node scripts/export-testers.js
 *
 * Google Groups API requires Google Workspace (not available with free @googlegroups.com).
 * Play Console tester list can be managed directly.
 */
exports.onTesterSignup = onDocumentCreated(
  { document: 'testerSignups/{signupId}', region: 'us-central1' },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const data = snapshot.data();
    const email = data.email;

    if (!email || !email.includes('@') || !email.includes('.')) {
      await snapshot.ref.update({ status: 'error', error: 'Invalid email' });
      return;
    }

    // Check for duplicate signups
    const db = admin.firestore();
    const existing = await db.collection('testerSignups')
      .where('email', '==', email)
      .where('status', '==', 'received')
      .limit(1)
      .get();

    if (!existing.empty) {
      await snapshot.ref.update({
        status: 'received',
        note: 'Duplicate signup — already registered',
      });
      logger.info(`[Testers] Duplicate signup: ${email}`);
      return;
    }

    // Mark as received — admin will add to Play Console
    await snapshot.ref.update({
      status: 'received',
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Count total pending testers
    const pendingCount = await db.collection('testerSignups')
      .where('status', '==', 'received')
      .count()
      .get();

    logger.info(`[Testers] New signup: ${email} (total pending: ${pendingCount.data().count})`);
  }
);
