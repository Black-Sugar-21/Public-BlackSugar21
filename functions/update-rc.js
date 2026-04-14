const admin = require('firebase-admin');

// Use Application Default Credentials (works with firebase CLI auth)
admin.initializeApp({
  projectId: 'black-sugar21'
});

async function updateRemoteConfig() {
  try {
    const rc = admin.remoteConfig();
    const template = await rc.getTemplate();
    
    console.log('Current Remote Config version:', template.version?.versionNumber);
    
    // Add/update situation_simulation_config parameter
    template.parameters['situation_simulation_config'] = {
      defaultValue: {
        value: JSON.stringify({
          enabled: true,
          maxPerDay: 10,
          maxCharsMinimum: 5,
          maxCharsMaximum: 500,
          temperature: 0.85,
          maxOutputTokens: 1200,
          cacheMinutes: 360,
          fallbackApproachesEnabled: true
        })
      },
      description: 'Situation Simulation feature config — adjustable without redeploy. v1.2.0+'
    };
    
    // Publish updated template
    const newTemplate = await rc.publishTemplate(template);
    console.log('✅ Remote Config updated successfully!');
    console.log('New version:', newTemplate.version?.versionNumber);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating Remote Config:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

updateRemoteConfig();
