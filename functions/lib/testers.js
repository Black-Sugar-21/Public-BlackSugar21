'use strict';
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { redactEmail } = require('./shared');

const PROJECT_NUMBER = '706595096331';
const OPT_IN_URL = 'https://play.google.com/apps/testing/com.black.sugar21';
const ADMIN_USER_ID = 'tvmkXqXGSzfriAkQUI4KrQF6sZm2';
const WORKSPACE_GROUP = 'alpha-testers@blacksugar21.com';
const PLAY_CONSOLE_GROUP = 'blacksugar21-tester@googlegroups.com'; // Linked to Play Console Alpha track
const WORKSPACE_ADMIN = 'hello@blacksugar21.com';

/**
 * Add email to Google Workspace Group via Admin Directory API.
 * This automatically makes them a tester in Play Console (group linked to alpha track).
 */
async function addToWorkspaceGroup(email) {
  const { GoogleAuth } = require('google-auth-library');
  const saKey = require('../workspace-sa-key.json');

  const auth = new GoogleAuth({
    credentials: saKey,
    scopes: ['https://www.googleapis.com/auth/cloud-identity'],
    clientOptions: { subject: WORKSPACE_ADMIN },
  });
  const client = await auth.getClient();
  const accessToken = (await client.getAccessToken()).token;

  // Lookup group
  const lookupRes = await fetch(
    `https://cloudidentity.googleapis.com/v1/groups:lookup?groupKey.id=${encodeURIComponent(WORKSPACE_GROUP)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!lookupRes.ok) throw new Error(`Group lookup failed (${lookupRes.status}): ${await lookupRes.text()}`);
  const groupName = (await lookupRes.json()).name;

  // Add member
  const addRes = await fetch(`https://cloudidentity.googleapis.com/v1/${groupName}/memberships`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ preferredMemberKey: { id: email }, roles: [{ name: 'MEMBER' }] }),
  });

  if (addRes.ok) {
    logger.info(`[Testers] AUTO-ADDED ${redactEmail(email)} to ${WORKSPACE_GROUP}`);
    return { added: true };
  }
  const errBody = await addRes.text();
  if (addRes.status === 409 || errBody.includes('ALREADY_EXISTS')) {
    logger.info(`[Testers] ${redactEmail(email)} already in group`);
    return { alreadyMember: true };
  }
  throw new Error(`Add member failed (${addRes.status}): ${errBody}`);
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
    message: `Nuevo tester: ${redactEmail(email)}`,
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
        title: '🆕 Nuevo tester',
        body: `${redactEmail(email)} agregado al grupo Workspace. Agrégalo también al Google Group desde: groups.google.com/g/blacksugar21-testers-pro/members`,
      },
      data: { type: 'admin_new_tester', email, action: 'https://groups.google.com/g/blacksugar21-testers-pro/members' },
      apns: { payload: { aps: { sound: 'default' } } },
      android: { priority: 'high', notification: { sound: 'default', channelId: 'default_channel' } },
    });
    logger.info(`[Testers] Admin notified about: ${redactEmail(email)}`);
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

    // Always notify admin (even duplicates) — fail-open with logging
    notifyAdminNewTester(db, email).catch((e) => {
      logger.warn(`[Testers] notifyAdminNewTester failed for ${redactEmail(email)}: ${e.message}`);
    });

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
      logger.info(`[Testers] Duplicate signup: ${redactEmail(email)}`);
      return;
    }

    // Add to Workspace Group (auto-tester in Play Console) + App Distribution
    let workspaceResult = null;
    let appDistResult = null;

    try {
      workspaceResult = await addToWorkspaceGroup(email);
    } catch (err) {
      logger.error(`[Testers] Workspace group failed for ${redactEmail(email)}: ${err.message}`);
    }

    try {
      appDistResult = await addTesterViaAppDistribution(email);
    } catch (err) {
      logger.error(`[Testers] App Distribution failed for ${redactEmail(email)}: ${err.message}`);
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

    logger.info(`[Testers] ${redactEmail(email)}: group=${addedToGroup}, appDist=${!!appDistResult?.added}`);
  },
);
