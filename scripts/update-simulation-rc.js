#!/usr/bin/env node
/**
 * 🎯 UPDATE SIMULATION REMOTE CONFIG — BlackSugar21
 * ==================================================
 * Adds simulation_config and multiverse_config keys to Remote Config.
 * - simulation_config: Hang the DJ relationship simulator settings
 * - multiverse_config: Multi-universe 5-stage compatibility tester settings
 *
 * Key parameter:
 * - betaMode: false (enables for ALL users, not just 3 test UIDs)
 * - maxPerDay: 3 (rate limit per user per day)
 *
 * Usage:
 *   node scripts/update-simulation-rc.js          # Apply changes
 *   node scripts/update-simulation-rc.js --dry-run # Preview without publishing
 */

const admin = require('firebase-admin');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

// Initialize Firebase Admin
const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});

async function main() {
  const remoteConfig = admin.remoteConfig();

  console.log('📥 Fetching current Remote Config template...');
  const template = await remoteConfig.getTemplate();

  let changed = false;

  // 1. Add simulation_config (Hang the DJ)
  if (!template.parameters['simulation_config']) {
    template.parameters['simulation_config'] = {
      defaultValue: {
        value: JSON.stringify({
          enabled: true,
          betaMode: false,
          allowedUserIds: '',
          simulationCount: 10,
          roundsPerSim: 6,
          maxPerDay: 3,
          maxTurnTokens: 120,
          turnTemperature: 0.88
        })
      },
      description: 'Dynamic configuration for Relationship Simulation Engine (Hang the DJ). Controls multi-universe compatibility testing. betaMode=false enables for all users; betaMode=true restricts to allowedUserIds (comma-separated UIDs). maxPerDay: rate limit per user per day. Cache TTL: 5 minutes.',
      valueType: 'JSON'
    };
    console.log('✅ Added simulation_config (betaMode=false → ALL USERS ENABLED)');
    changed = true;
  } else {
    const currentConfig = JSON.parse(template.parameters['simulation_config'].defaultValue.value);
    if (currentConfig.betaMode !== false) {
      console.log(`⚠️  simulation_config.betaMode is ${currentConfig.betaMode}, changing to false...`);
      currentConfig.betaMode = false;
      template.parameters['simulation_config'].defaultValue.value = JSON.stringify(currentConfig);
      changed = true;
      console.log('✅ Updated simulation_config.betaMode = false');
    } else {
      console.log('⏭️  simulation_config already exists with betaMode=false, skipping');
    }
  }

  // 2. Add multiverse_config (5-stage multi-universe)
  if (!template.parameters['multiverse_config']) {
    template.parameters['multiverse_config'] = {
      defaultValue: {
        value: JSON.stringify({
          enabled: true,
          maxPerDay: 3,
          cacheMinutes: 262080 // 6 months in minutes
        })
      },
      description: 'Dynamic configuration for Multi-Universe Relationship Simulator (5-stage compatibility testing). enabled: global kill switch. maxPerDay: 3 simulations per user per day (rate limit). cacheMinutes: 262080 = 6 months cache duration. Cache TTL: 5 minutes.',
      valueType: 'JSON'
    };
    console.log('✅ Added multiverse_config (maxPerDay=3, cache=6 months)');
    changed = true;
  } else {
    console.log('⏭️  multiverse_config already exists, skipping');
  }

  if (!changed) {
    console.log('\n🎉 No changes needed — all keys already exist with correct values.');
    return;
  }

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN — changes NOT published. Remove --dry-run to apply.');
    console.log('\n📋 Would publish:');
    console.log(JSON.stringify({
      simulation_config: template.parameters['simulation_config'],
      multiverse_config: template.parameters['multiverse_config']
    }, null, 2));
    return;
  }

  console.log('\n📤 Publishing updated template...');
  await remoteConfig.publishTemplate(template);
  console.log('🎉 Remote Config updated successfully!');

  // Update local snapshot
  const fs = require('fs');
  const snapshotPath = path.join(__dirname, '..', 'current-remote-config.json');
  const freshTemplate = await remoteConfig.getTemplate();
  const snapshot = { parameters: {} };
  for (const [key, param] of Object.entries(freshTemplate.parameters)) {
    snapshot.parameters[key] = {
      defaultValue: param.defaultValue,
      ...(param.description && { description: param.description }),
      valueType: param.valueType
    };
  }
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + '\n');
  console.log('📋 Updated current-remote-config.json');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
