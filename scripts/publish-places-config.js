const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

(async () => {
  const rc = admin.remoteConfig();
  const template = await rc.getTemplate();
  
  // 1. Update places_search_config (ChatView)
  template.parameters['places_search_config'] = {
    defaultValue: {
      value: JSON.stringify({
        enabled: true,
        radiusSteps: [100000, 130000, 180000, 250000, 300000],
        perQueryResults: 20,
        maxPlacesIntermediate: 60,
        queriesWithCategory: 3,
        queriesWithoutCategory: 5,
        useRestriction: true,
        photoMaxHeightPx: 400,
        photosPerPlace: 5,
        travelSpeedKmH: 40,
        maxLoadCount: 20,
        defaultLanguage: 'es',
        defaultCategoryQueryCount: 4
      })
    },
    description: 'Config dinamica busqueda lugares ChatView. radiusSteps, perQueryResults, maxPlacesIntermediate, queries count, useRestriction, photos, travel, limits. Server-side only.',
    valueType: 'JSON'
  };

  // 2. Update coach_config.placeSearch radiusSteps to match (Coach)
  const coachParam = template.parameters['coach_config'];
  if (coachParam && coachParam.defaultValue && coachParam.defaultValue.value) {
    const coachConfig = JSON.parse(coachParam.defaultValue.value);
    if (!coachConfig.placeSearch) coachConfig.placeSearch = {};
    coachConfig.placeSearch.radiusSteps = [100000, 130000, 180000, 250000, 300000];
    coachConfig.placeSearch.defaultRadius = 100000;
    coachConfig.placeSearch.maxRadius = 300000;
    coachParam.defaultValue.value = JSON.stringify(coachConfig);
    console.log('Updated coach_config.placeSearch:', coachConfig.placeSearch);
  }
  
  await rc.publishTemplate(template);
  console.log('Remote Config published successfully');
  
  // Verify
  const t2 = await rc.getTemplate();
  const psc = t2.parameters['places_search_config'];
  console.log('places_search_config:', psc ? JSON.parse(psc.defaultValue.value) : 'NOT FOUND');
  const cc = t2.parameters['coach_config'];
  if (cc) {
    const ccVal = JSON.parse(cc.defaultValue.value);
    console.log('coach_config.placeSearch:', ccVal.placeSearch);
  }
})().catch(e => console.error('Error:', e.message));
