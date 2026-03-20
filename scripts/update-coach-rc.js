#!/usr/bin/env node
/**
 * 🎯 UPDATE COACH REMOTE CONFIG — BlackSugar21
 * ==============================================
 * Adds coach_max_input_length and coach_daily_credits keys to Remote Config,
 * and adds dailyCredits field to coach_config JSON.
 *
 * Usage:
 *   node scripts/update-coach-rc.js          # Apply changes
 *   node scripts/update-coach-rc.js --dry-run # Preview changes without publishing
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

  // 1. Add coach_max_input_length
  if (!template.parameters['coach_max_input_length']) {
    template.parameters['coach_max_input_length'] = {
      defaultValue: { value: '2000' },
      description: 'Max input length for Coach Chat (range 100-10000). Read by Android RemoteConfigManager + iOS RemoteConfigService.',
      valueType: 'NUMBER'
    };
    console.log('✅ Added coach_max_input_length = 2000');
    changed = true;
  } else {
    console.log('⏭️  coach_max_input_length already exists, skipping');
  }

  // 2. Add coach_daily_credits
  if (!template.parameters['coach_daily_credits']) {
    template.parameters['coach_daily_credits'] = {
      defaultValue: { value: '5' },
      description: 'Daily coach credits (range 1-100). CF resetCoachMessages reads from coach_config.dailyCredits. This key is for client-side UI threshold.',
      valueType: 'NUMBER'
    };
    console.log('✅ Added coach_daily_credits = 5');
    changed = true;
  } else {
    console.log('⏭️  coach_daily_credits already exists, skipping');
  }

  // 3. Add dailyCredits to coach_config JSON
  if (template.parameters['coach_config']) {
    const currentValue = template.parameters['coach_config'].defaultValue.value;
    const coachConfig = JSON.parse(currentValue);

    if (coachConfig.dailyCredits === undefined) {
      coachConfig.dailyCredits = 5;
      template.parameters['coach_config'].defaultValue.value = JSON.stringify(coachConfig);
      console.log('✅ Added dailyCredits: 5 to coach_config JSON');
      changed = true;
    } else {
      console.log(`⏭️  coach_config.dailyCredits already exists (${coachConfig.dailyCredits}), skipping`);
    }
  } else {
    console.log('⚠️  coach_config key not found in Remote Config');
  }

  if (!changed) {
    console.log('\n🎉 No changes needed — all keys already exist.');
    return;
  }

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN — changes NOT published. Remove --dry-run to apply.');
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
