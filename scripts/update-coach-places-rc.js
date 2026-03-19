#!/usr/bin/env node
/**
 * 🎯 UPDATE COACH PLACES REMOTE CONFIG — BlackSugar21
 * =====================================================
 * Updates coach_config with current values for maxActivities, placeSearch
 * (including new dynamic fields: perQueryResults, maxPlacesIntermediate,
 * maxOutputTokensBudget), and syncs maxTokens.
 *
 * Usage:
 *   node scripts/update-coach-places-rc.js          # Apply changes
 *   node scripts/update-coach-places-rc.js --dry-run # Preview without publishing
 */

const admin = require('firebase-admin');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

async function main() {
  const remoteConfig = admin.remoteConfig();

  console.log('📥 Fetching current Remote Config template...');
  const template = await remoteConfig.getTemplate();

  if (!template.parameters['coach_config']) {
    console.error('❌ coach_config key not found in Remote Config');
    process.exit(1);
  }

  const currentValue = template.parameters['coach_config'].defaultValue.value;
  const coachConfig = JSON.parse(currentValue);

  console.log('\n📋 Current coach_config values:');
  console.log(`   maxActivities: ${coachConfig.maxActivities}`);
  console.log(`   maxTokens: ${coachConfig.maxTokens}`);
  console.log(`   placeSearch: ${JSON.stringify(coachConfig.placeSearch || 'NOT SET')}`);

  let changed = false;

  // 1. Update maxActivities: 10 → 30
  if (coachConfig.maxActivities !== 30) {
    console.log(`\n✅ maxActivities: ${coachConfig.maxActivities} → 30`);
    coachConfig.maxActivities = 30;
    changed = true;
  } else {
    console.log('\n⏭️  maxActivities already 30');
  }

  // 2. Ensure maxTokens is 2048
  if (coachConfig.maxTokens !== 2048) {
    console.log(`✅ maxTokens: ${coachConfig.maxTokens} → 2048`);
    coachConfig.maxTokens = 2048;
    changed = true;
  } else {
    console.log('⏭️  maxTokens already 2048');
  }

  // 3. Set placeSearch with all dynamic fields
  const targetPlaceSearch = {
    enableWithoutLocation: true,
    minActivitiesForPlaceSearch: 6,
    defaultRadius: 30000,
    minRadius: 3000,
    maxRadius: 180000,
    radiusSteps: [30000, 45000, 60000, 80000, 100000, 130000, 180000],
    perQueryResults: 20,
    maxPlacesIntermediate: 60,
    maxOutputTokensBudget: 8192,
  };

  const currentPS = coachConfig.placeSearch || {};
  const psChanged = JSON.stringify(currentPS) !== JSON.stringify(targetPlaceSearch);

  if (psChanged) {
    console.log(`✅ placeSearch updated:`);
    if (currentPS.defaultRadius !== targetPlaceSearch.defaultRadius) {
      console.log(`   defaultRadius: ${currentPS.defaultRadius || 'unset'} → ${targetPlaceSearch.defaultRadius}`);
    }
    if (currentPS.maxRadius !== targetPlaceSearch.maxRadius) {
      console.log(`   maxRadius: ${currentPS.maxRadius || 'unset'} → ${targetPlaceSearch.maxRadius}`);
    }
    if (JSON.stringify(currentPS.radiusSteps) !== JSON.stringify(targetPlaceSearch.radiusSteps)) {
      console.log(`   radiusSteps: ${JSON.stringify(currentPS.radiusSteps || [])} → ${JSON.stringify(targetPlaceSearch.radiusSteps)}`);
    }
    if (currentPS.perQueryResults !== targetPlaceSearch.perQueryResults) {
      console.log(`   perQueryResults: ${currentPS.perQueryResults || 'unset'} → ${targetPlaceSearch.perQueryResults}`);
    }
    if (currentPS.maxPlacesIntermediate !== targetPlaceSearch.maxPlacesIntermediate) {
      console.log(`   maxPlacesIntermediate: ${currentPS.maxPlacesIntermediate || 'unset'} → ${targetPlaceSearch.maxPlacesIntermediate}`);
    }
    if (currentPS.maxOutputTokensBudget !== targetPlaceSearch.maxOutputTokensBudget) {
      console.log(`   maxOutputTokensBudget: ${currentPS.maxOutputTokensBudget || 'unset'} → ${targetPlaceSearch.maxOutputTokensBudget}`);
    }
    coachConfig.placeSearch = targetPlaceSearch;
    changed = true;
  } else {
    console.log('⏭️  placeSearch already matches target');
  }

  if (!changed) {
    console.log('\n🎉 No changes needed — coach_config already up to date.');
    return;
  }

  // Write back
  template.parameters['coach_config'].defaultValue.value = JSON.stringify(coachConfig);

  console.log('\n📋 Updated coach_config JSON:');
  console.log(JSON.stringify(coachConfig, null, 2));

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
  const snapshot = {parameters: {}};
  for (const [key, param] of Object.entries(freshTemplate.parameters)) {
    snapshot.parameters[key] = {
      defaultValue: param.defaultValue,
      ...(param.description && {description: param.description}),
      valueType: param.valueType,
    };
  }
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`📄 Local snapshot updated: ${snapshotPath}`);
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
