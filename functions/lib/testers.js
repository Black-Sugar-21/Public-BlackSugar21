'use strict';
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { google } = require('googleapis');

const GOOGLE_GROUP_EMAIL = 'blacksugar21-testers@googlegroups.com';

/**
 * Firestore trigger: When a new tester signup is created,
 * automatically add them to the Google Group (which is linked to Play Console alpha track).
 */
exports.onTesterSignup = onDocumentCreated(
  { document: 'testerSignups/{signupId}', region: 'us-central1' },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const data = snapshot.data();
    const email = data.email;
    const signupId = event.params.signupId;

    if (!email || !email.includes('@')) {
      await snapshot.ref.update({ status: 'error', error: 'Invalid email' });
      return;
    }

    try {
      // Use the default service account credentials
      const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/admin.directory.group.member'],
      });
      const authClient = await auth.getClient();

      const directory = google.admin({ version: 'directory_v1', auth: authClient });

      // Add user to Google Group
      await directory.members.insert({
        groupKey: GOOGLE_GROUP_EMAIL,
        requestBody: {
          email: email,
          role: 'MEMBER',
        },
      });

      await snapshot.ref.update({
        status: 'added',
        addedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info(`[Testers] Added ${email} to ${GOOGLE_GROUP_EMAIL}`);
    } catch (err) {
      // Handle duplicate (user already in group)
      if (err.code === 409 || err.message?.includes('Member already exists')) {
        await snapshot.ref.update({
          status: 'added',
          addedAt: admin.firestore.FieldValue.serverTimestamp(),
          note: 'Already a member',
        });
        logger.info(`[Testers] ${email} already in group`);
        return;
      }

      await snapshot.ref.update({
        status: 'error',
        error: err.message || 'Unknown error',
      });
      logger.error(`[Testers] Error adding ${email}: ${err.message}`);
    }
  }
);
