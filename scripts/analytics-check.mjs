#!/usr/bin/env node
/**
 * Prueba de red y capturas de la analítica (Playwright + Chrome instalado). Copiable a cualquier sitio de Bimbask.
 * Sirve una carpeta construida CON un measurementId de prueba y verifica, con la red del navegador:
 *   - sin elección, con «Solo lo necesario» y con Global Privacy Control: 0 peticiones a googletagmanager/google-analytics;
 *   - con «Aceptar»: se pide gtag.js (las peticiones a Google se cortan: no sale nada a Internet).
 * Uso: node scripts/analytics-check.mjs --dist dist-analytics-test --out capturas [--dark "localStorage.setItem('k','dark')"]
 *        [--rtl-path /ar] [--path /]
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const dist = resolve(opt('dist', 'dist'));
const out = opt('out');
const dark = opt('dark'); const rtl = opt('rtl'); const rtlPath = opt('rtl-path'); const path = opt('path', '/');
const T = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let f = join(dist, p);
  if (!existsSync(f) || statSync(f).isDirectory()) f = existsSync(join(f, 'index.html')) && statSync(f).isDirectory() ? join(f, 'index.html') : join(dist, existsSync(join(dist, 'index.csr.html')) ? 'index.csr.html' : 'index.html');
  res.setHeader('content-type', T[extname(f)] ?? 'application/octet-stream'); res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome' });
const GOOGLE = /googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net/;
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALLA'} ${msg}`); if (!ok) failed++; };

async function scenario(name, { gpc = false, click = null, init = null, vp = { width: 1280, height: 800 } } = {}) {
  const ctx = await browser.newContext({ viewport: vp, extraHTTPHeaders: gpc ? { 'Sec-GPC': '1' } : {} });
  if (gpc) await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }));
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const google = [];
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (GOOGLE.test(u)) { google.push(u); return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }); }
    if (!u.startsWith(base) && !u.startsWith('data:')) return route.abort();
    return route.continue();
  });
  await page.goto(base + path, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  if (click !== null) {
    await page.locator('[data-analytics-banner] >> role=button').nth(click).click();
    await page.mouse.wheel(0, 800); await page.waitForTimeout(1500);
  } else { await page.mouse.wheel(0, 800); await page.waitForTimeout(800); }
  return { page, ctx, google, name };
}

let r = await scenario('sin elección');
check(r.google.length === 0, `sin elección: ${r.google.length} peticiones a Google (debe ser 0)`);
check((await r.page.locator('[data-analytics-banner]').count()) === 1, 'sin elección: el aviso se muestra');
await r.ctx.close();
r = await scenario('solo lo necesario', { click: 0 });
check(r.google.length === 0, `«Solo lo necesario»: ${r.google.length} peticiones a Google (debe ser 0)`);
await r.page.reload(); await r.page.waitForTimeout(1000);
check(r.google.length === 0 && (await r.page.locator('[data-analytics-banner]').count()) === 0, 'tras recargar no vuelve a preguntar y sigue sin enviar');
await r.ctx.close();
r = await scenario('GPC', { gpc: true });
check(r.google.length === 0 && (await r.page.locator('[data-analytics-banner]').count()) === 0, `GPC activo: sin aviso y ${r.google.length} peticiones (debe ser 0)`);
await r.ctx.close();
r = await scenario('aceptar', { click: 1 });
check(r.google.some((u) => /googletagmanager\.com\/gtag\/js\?id=G-/.test(u)), `«Aceptar»: se pide gtag.js (${r.google.length} peticiones a Google)`);
await r.ctx.close();

if (out) {
  mkdirSync(out, { recursive: true });
  const sizes = [[360, 740, '360', 1], [390, 844, '390', 1], [768, 1024, '768', 1], [1440, 900, '1440', 1], [720, 450, 'zoom200', 2]];
  for (const [w, h, label, dpr] of sizes) for (const mode of ['claro', 'oscuro', ...(rtl || rtlPath ? ['arabe'] : [])]) {
    const init = mode === 'oscuro' && dark ? dark : mode === 'arabe' ? rtl : null;
    const url = base + (mode === 'arabe' && rtlPath ? rtlPath : path);
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, colorScheme: mode === 'oscuro' ? 'dark' : 'light' });
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage();
    await page.route('**/*', (rt) => (rt.request().url().startsWith(base) ? rt.continue() : rt.abort()));
    await page.goto(url, { waitUntil: 'load' }); await page.waitForTimeout(1500);
    await page.screenshot({ path: join(out, `aviso-${label}-${mode}.png`) });
    await ctx.close();
  }
  console.log(`capturas en ${out}`);
}
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
