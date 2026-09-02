// Emergency hosting deploy via Firebase Hosting REST API using the backend service
// account — used while the CLI user account (da.evg789@gmail.com) lacks project IAM
// on black-sugar21 (symptom: `firebase deploy --only hosting` fails with "Failed to
// get Firebase project... make sure the project exists and your account has
// permission"). Preserves the exact hosting config (rewrites + headers) from
// firebase.json. Functionally equivalent to `firebase deploy --only hosting`.
//
// USO:
//   cd Public-BlackSugar21 && npm run build
//   NODE_PATH=/Users/daniel/IdeaProjects/CoachFish/node_modules node scripts/deploy-hosting-sa.js
//
// Requiere: CoachFish/workspace-sa-key.json (service account con rol de Hosting Admin
// o superior en el proyecto black-sugar21 — verificado con acceso a
// firebasehosting.googleapis.com/v1beta1/projects/black-sugar21/sites).
//
// Preferir siempre `firebase deploy --only hosting` cuando el CLI tenga permisos —
// este script es el respaldo cuando esa vía está bloqueada por IAM.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const {GoogleAuth} = require('google-auth-library');

const REPO = __dirname.replace(/\/scripts$/, '');
const SITE = 'black-sugar21';
const KEY = '/Users/daniel/IdeaProjects/CoachFish/workspace-sa-key.json';

(async () => {
  const fbjson = JSON.parse(fs.readFileSync(path.join(REPO, 'firebase.json'), 'utf8'));
  const hosting = Array.isArray(fbjson.hosting) ? fbjson.hosting[0] : fbjson.hosting;
  const pubDir = path.join(REPO, hosting.public);

  // Hosting API version config: rewrites (glob→path) + headers (glob→{k:v})
  const config = {
    rewrites: (hosting.rewrites || []).map((r) => ({glob: r.source, path: r.destination})),
    headers: (hosting.headers || []).map((h) => ({
      glob: h.source,
      headers: Object.fromEntries((h.headers || []).map((x) => [x.key, x.value])),
    })),
  };

  // Collect files → gzip → sha256(gzipped)
  const files = {};
  const gzByHash = {};
  const walk = (dir, base) => {
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, e.name);
      const rel = base + '/' + e.name;
      if (e.isDirectory()) walk(full, rel);
      else {
        const gz = zlib.gzipSync(fs.readFileSync(full), {level: 9});
        const hash = crypto.createHash('sha256').update(gz).digest('hex');
        files[rel] = hash;
        gzByHash[hash] = gz;
      }
    }
  };
  walk(pubDir, '');
  console.log(`files: ${Object.keys(files).length}, rewrites: ${config.rewrites.length}, header rules: ${config.headers.length}`);

  const auth = new GoogleAuth({keyFile: KEY, scopes: ['https://www.googleapis.com/auth/cloud-platform']});
  const client = await auth.getClient();
  const api = 'https://firebasehosting.googleapis.com/v1beta1';

  // 1. create version (with config)
  let r = await client.request({url: `${api}/sites/${SITE}/versions`, method: 'POST', data: {config}});
  const versionName = r.data.name;
  console.log('version:', versionName);

  // 2. populate files
  r = await client.request({url: `${api}/${versionName}:populateFiles`, method: 'POST', data: {files}});
  const {uploadRequiredHashes = [], uploadUrl} = r.data;
  console.log(`to upload: ${uploadRequiredHashes.length}/${Object.keys(files).length}`);

  // 3. upload required blobs (parallel batches of 8)
  const token = (await client.getAccessToken()).token;
  let done = 0;
  for (let i = 0; i < uploadRequiredHashes.length; i += 8) {
    await Promise.all(uploadRequiredHashes.slice(i, i + 8).map(async (hash) => {
      const resp = await fetch(`${uploadUrl}/${hash}`, {
        method: 'POST',
        headers: {'Authorization': `Bearer ${token}`, 'Content-Type': 'application/octet-stream'},
        body: gzByHash[hash],
      });
      if (!resp.ok) throw new Error(`upload ${hash.substring(0, 8)}: HTTP ${resp.status} ${await resp.text()}`);
      done++;
    }));
    if (done % 40 === 0 || done === uploadRequiredHashes.length) console.log(`uploaded ${done}/${uploadRequiredHashes.length}`);
  }

  // 4. finalize
  r = await client.request({url: `${api}/${versionName}?update_mask=status`, method: 'PATCH', data: {status: 'FINALIZED'}});
  console.log('finalized:', r.data.status);

  // 5. release
  r = await client.request({url: `${api}/sites/${SITE}/releases?versionName=${versionName}`, method: 'POST', data: {}});
  console.log('RELEASED:', r.data.name, '| type:', r.data.type);
  process.exit(0);
})().catch((e) => { console.error('DEPLOY FAILED:', e.response?.data ? JSON.stringify(e.response.data).substring(0, 400) : e.message); process.exit(1); });
