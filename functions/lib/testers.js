'use strict';
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

const PROJECT_NUMBER = '706595096331';
const OPT_IN_URL = 'https://play.google.com/apps/testing/com.black.sugar21';
const ADMIN_USER_ID = 'tvmkXqXGSzfriAkQUI4KrQF6sZm2'; // dverdugo85@gmail.com

/**
 * Notify admin (dverdugo85@gmail.com) via push notification when a new tester signs up.
 * Also saves to adminNotifications collection for dashboard visibility.
 */
async function notifyAdminNewTester(db, testerEmail) {
  // 1. Save to adminNotifications collection
  await db.collection('adminNotifications').add({
    type: 'new_tester',
    email: testerEmail,
    message: `Nuevo tester registrado: ${testerEmail}. Agrégalo al Google Group para que pueda descargar la app.`,
    googleGroupUrl: 'https://groups.google.com/g/blacksugar21-testers-pro/members',
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // 2. Send push notification to admin device
  try {
    const adminDoc = await db.collection('users').doc(ADMIN_USER_ID).get();
    if (!adminDoc.exists) return;
    const fcmToken = adminDoc.data().fcmToken;
    if (!fcmToken) return;

    await admin.messaging().send({
      token: fcmToken,
      notification: {
        title: '🆕 Nuevo tester registrado',
        body: `${testerEmail} quiere probar Black Sugar 21. Agrégalo al Google Group.`,
      },
      data: {
        type: 'admin_new_tester',
        email: testerEmail,
        googleGroupUrl: 'https://groups.google.com/g/blacksugar21-testers-pro/members',
      },
      apns: {payload: {aps: {sound: 'default', badge: 1}}},
      android: {priority: 'high', notification: {sound: 'default', channelId: 'default_channel'}},
    });
    logger.info(`[Testers] Admin notified about new tester: ${testerEmail}`);
  } catch (notifErr) {
    logger.warn(`[Testers] Admin notification failed: ${notifErr.message}`);
  }
}

/**
 * Add a tester email via Firebase App Distribution API.
 * This is FREE and works without Google Workspace.
 */
async function addTesterViaAppDistribution(email) {
  const { GoogleAuth } = require('google-auth-library');
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const accessToken = (await client.getAccessToken()).token;

  const url = `https://firebaseappdistribution.googleapis.com/v1/projects/${PROJECT_NUMBER}/testers:batchAdd`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ emails: [email] }),
  });

  if (!res.ok) {
    const errData = await res.text();
    throw new Error(`App Distribution API error (${res.status}): ${errData}`);
  }

  const data = await res.json();
  return { added: true, testers: data.testers?.length || 0 };
}

/**
 * Firestore trigger: When a new tester signup is created,
 * automatically add to Firebase App Distribution + provide Play Console opt-in link.
 *
 * The Google Group (blacksugar21-testers-pro@googlegroups.com) is linked to
 * Play Console closed testing. Users join the group to become Play Console testers.
 * Firebase App Distribution handles the tester registry.
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
      .where('status', 'in', ['received', 'added'])
      .limit(1)
      .get();

    if (!existing.empty) {
      await snapshot.ref.update({
        status: 'added',
        note: 'Duplicate signup — already registered',
        optInUrl: OPT_IN_URL,
      });
      logger.info(`[Testers] Duplicate signup: ${email}`);
      return;
    }

    // Add to Firebase App Distribution automatically
    try {
      const result = await addTesterViaAppDistribution(email);

      await snapshot.ref.update({
        status: 'added',
        addedAt: admin.firestore.FieldValue.serverTimestamp(),
        addedAutomatically: true,
        optInUrl: OPT_IN_URL,
      });

      logger.info(`[Testers] AUTO-ADDED ${email} via App Distribution`);

      // Notify admin via push notification
      notifyAdminNewTester(db, email).catch(() => {});
    } catch (err) {
      logger.error(`[Testers] Failed to auto-add ${email}: ${err.message}`);
      await snapshot.ref.update({
        status: 'received',
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
        autoAddError: err.message,
        optInUrl: OPT_IN_URL,
      });
    }
  }
);
