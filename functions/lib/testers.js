'use strict';
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

const PROJECT_NUMBER = '706595096331';
const OPT_IN_URL = 'https://play.google.com/apps/testing/com.black.sugar21';
const ADMIN_USER_ID = 'tvmkXqXGSzfriAkQUI4KrQF6sZm2';
const WORKSPACE_GROUP = 'blacksugar21-tester@blacksugar21.com';
const WORKSPACE_ADMIN = 'hello@blacksugar21.com';

/**
 * Add email to Google Workspace Group via Admin Directory API.
 * This automatically makes them a tester in Play Console (group linked to alpha track).
 */
async function addToWorkspaceGroup(email) {
  const { google } = require('googleapis');
  const auth = new google.auth.GoogleAuth({
    scopes: [
      'https://www.googleapis.com/auth/admin.directory.group',
      'https://www.googleapis.com/auth/admin.directory.group.member',
    ],
    clientOptions: { subject: WORKSPACE_ADMIN },
  });
  const authClient = await auth.getClient();
  const dir = google.admin({ version: 'directory_v1', auth: authClient });

  // Check if already member
  try {
    const check = await dir.members.get({ groupKey: WORKSPACE_GROUP, memberKey: email });
    if (check.data) {
      logger.info(`[Testers] ${email} already in Workspace group`);
      return { alreadyMember: true };
    }
  } catch (e) {
    // 404 = not a member, continue to add
    if (e.response?.status !== 404) {
      throw e;
    }
  }

  // Add member
  await dir.members.insert({
    groupKey: WORKSPACE_GROUP,
    requestBody: { email, role: 'MEMBER' },
  });
  logger.info(`[Testers] AUTO-ADDED ${email} to Workspace group ${WORKSPACE_GROUP}`);
  return { added: true };
}

/**
 * Add a tester email via Firebase App Distribution API.
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
  return { added: true };
}

/**
 * Notify admin via push notification when a new tester signs up.
 */
async function notifyAdminNewTester(db, email) {
  await db.collection('adminNotifications').add({
    type: 'new_tester',
    email,
    message: `Nuevo tester: ${email}`,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  try {
    const adminDoc = await db.collection('users').doc(ADMIN_USER_ID).get();
    if (!adminDoc.exists) return;
    const fcmToken = adminDoc.data().fcmToken;
    if (!fcmToken) return;

    await admin.messaging().send({
      token: fcmToken,
      notification: {
        title: '🆕 Nuevo tester registrado',
        body: `${email} fue agregado automáticamente al grupo alpha.`,
      },
      data: { type: 'admin_new_tester', email },
      apns: { payload: { aps: { sound: 'default' } } },
      android: { priority: 'high', notification: { sound: 'default', channelId: 'default_channel' } },
    });
    logger.info(`[Testers] Admin notified about: ${email}`);
  } catch (notifErr) {
    logger.warn(`[Testers] Admin notification failed: ${notifErr.message}`);
  }
}

/**
 * Firestore trigger: When a new tester signup is created,
 * automatically add to Workspace Group (→ Play Console tester) + App Distribution.
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

    const db = admin.firestore();

    // Always notify admin (even duplicates)
    notifyAdminNewTester(db, email).catch(() => {});

    // Check for duplicate signups
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

    // Add to Workspace Group (auto-tester in Play Console) + App Distribution
    let workspaceResult = null;
    let appDistResult = null;

    try {
      workspaceResult = await addToWorkspaceGroup(email);
    } catch (err) {
      logger.error(`[Testers] Workspace group failed for ${email}: ${err.message}`);
    }

    try {
      appDistResult = await addTesterViaAppDistribution(email);
    } catch (err) {
      logger.error(`[Testers] App Distribution failed for ${email}: ${err.message}`);
    }

    const addedToGroup = workspaceResult?.added || workspaceResult?.alreadyMember || false;

    await snapshot.ref.update({
      status: addedToGroup ? 'added' : 'received',
      addedAt: admin.firestore.FieldValue.serverTimestamp(),
      addedToWorkspaceGroup: addedToGroup,
      addedToAppDistribution: !!appDistResult?.added,
      optInUrl: OPT_IN_URL,
      ...(workspaceResult?.alreadyMember ? { note: 'Already in group' } : {}),
    });

    logger.info(`[Testers] ${email}: group=${addedToGroup}, appDist=${!!appDistResult?.added}`);
  },
);
