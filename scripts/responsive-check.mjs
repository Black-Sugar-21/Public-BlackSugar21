#!/usr/bin/env node
/**
 * Prueba responsive automática (Playwright).
 *
 * Recorre una matriz de tamaños de pantalla (320 px hasta 2560 px, teléfono horizontal, zoom 200 % y reflujo a 320 px)
 * por las rutas principales (incluidos árabe RTL y alemán) y FALLA si encuentra:
 *   1. desborde horizontal de la página (scrollWidth > innerWidth);
 *   2. elementos interactivos fuera de pantalla (también los recortados por overflow: así se perdía el botón de menú);
 *   3. objetivos táctiles menores de 44 px en pantallas de teléfono (los enlaces dentro de un párrafo están exentos);
 *   4. controles imposibles de alcanzar porque una barra o un botón flotante los tapa aunque se desplacen al centro;
 *   5. menús desplegables o selectores que se salen de la pantalla (lista `menus` de la configuración);
 *   6. imágenes y medios más anchos que la pantalla;
 *   7. en pantallas enormes (≥ 1920 px): contenido sin ancho máximo legible o descentrado.
 *
 * Uso:
 *   node scripts/responsive-check.mjs                    # sirve `dist` en local y recorre todo
 *   node scripts/responsive-check.mjs --url https://sitio # contra un sitio ya publicado
 *   node scripts/responsive-check.mjs --quick            # 5 anchos clave, para ciclos rápidos
 *   node scripts/responsive-check.mjs --vp 320x256      # un solo tamaño de la matriz
 *   node scripts/responsive-check.mjs --shots out        # además guarda capturas en la carpeta `out`
 * Requisitos: `npm i -D playwright` (el navegador: `npx playwright install chromium`, o Chrome instalado).
 * La configuración (rutas, carpeta, menús, exclusiones) está en scripts/responsive.config.json.
 */
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const cfg = JSON.parse(readFileSync(join(here, 'responsive.config.json'), 'utf8'));

// Tamaños: [ancho, alto, etiqueta, táctil]
const FULL = [
  [320, 640, 'iPhone SE / móvil chico', true], [360, 740, 'Android común', true], [390, 844, 'iPhone 14', true],
  [430, 932, 'iPhone Pro Max', true], [844, 390, 'teléfono horizontal', true], [768, 1024, 'tableta', true],
  [1024, 768, 'tableta horizontal', false], [1280, 720, 'portátil', false], [1440, 900, 'escritorio', false],
  [1920, 1080, 'Full HD', false], [2560, 1440, 'pantalla enorme', false],
  [640, 360, 'zoom 200 % en 1280', false], [320, 256, 'reflujo WCAG a 320 px (zoom 400 %)', true]
];
const QUICK = FULL.filter(([w, h]) => [[320, 640], [390, 844], [844, 390], [768, 1024], [1440, 900], [2560, 1440]].some(([a, b]) => a === w && b === h));
const VIEWPORTS = opt('vp') ? FULL.filter(([w, h]) => `${w}x${h}` === opt('vp')) : flag('quick') ? QUICK : FULL;

let playwright;
try { playwright = await import('playwright'); }
catch { console.error('Falta Playwright: ejecuta `npm i -D playwright` y `npx playwright install chromium`.'); process.exit(2); }

// ── servidor estático local con respaldo SPA ───────────────────────────────────────────────
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml', '.mp4': 'video/mp4' };
function serve(dir, fallback) {
  const base = resolve(root, dir);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const cands = [path, join(path, 'index.html'), `${path}.html`];
    for (const c of cands) {
      const f = normalize(join(base, c));
      if (f.startsWith(base) && existsSync(f) && statSync(f).isFile()) {
        res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
        return res.end(readFileSync(f));
      }
    }
    const fb = join(base, fallback);
    if (existsSync(fb)) { res.writeHead(200, { 'content-type': MIME['.html'] }); return res.end(readFileSync(fb)); }
    res.writeHead(404); res.end('no encontrado');
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

// ── sondas dentro de la página ──────────────────────────────────────────────────────────────
const probe = ({ touch, ignore, menus }) => {
  const vw = innerWidth, vh = innerHeight, fails = [];
  const ignoreRe = ignore ? new RegExp(ignore) : null;
  const sel = (e) => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '')).slice(0, 70);
  const label = (e) => `${sel(e)} «${(e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24)}»`;
  const visible = (e) => {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    for (let p = e; p; p = p.parentElement) { if (p.hidden || p.inert || p.getAttribute('aria-hidden') === 'true') return false; if (getComputedStyle(p).display === 'none') return false; }
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const inScroller = (e) => { for (let p = e.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
  const fixedAncestor = (e) => { for (let p = e; p && p !== document.body; p = p.parentElement) if (getComputedStyle(p).position === 'fixed') return true; return false; };
  const add = (type, e, extra = '') => { const t = label(e); if (!(ignoreRe && ignoreRe.test(t))) fails.push({ type, what: t + (extra ? ' ' + extra : '') }); };

  // 1. desborde de la página
  const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  if (sw > vw + 1) fails.push({ type: 'desborde-página', what: `scrollWidth ${sw} > ancho ${vw}` });

  const INTERACTIVE = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=menuitem], [tabindex]:not([tabindex="-1"])';
  const items = [...document.querySelectorAll(INTERACTIVE)].filter(visible);
  for (const e of items) {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    // 2. fuera de pantalla (inicio-fin lógico: vale para RTL)
    if (!inScroller(e) && (r.right > vw + 1 || r.left < -1) && !(/skip/.test(e.className) || /^#(main|content)/.test(e.getAttribute('href') || ''))) add('fuera-de-pantalla', e, `[${Math.round(r.left)}→${Math.round(r.right)}] de ${vw}`);
    // 3. objetivo táctil
    if (touch && vw <= 900 && !inScroller(e)) {
      const inline = e.tagName === 'A' && cs.display === 'inline';
      const minSide = e.tagName === 'INPUT' && /checkbox|radio/.test(e.type) ? 24 : 44;
      if (!inline && (r.height < minSide - 0.5 || r.width < minSide - 0.5) && !e.closest('[data-tap-exempt]') && !/skip/.test(e.className)) {
        // Controles diminutos (puntos de carrusel): vale si el área real de toque (p. ej. un pseudo-elemento invisible) mide ≥ 24×44.
        e.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        const r2 = e.getBoundingClientRect();
        const cx = r2.left + r2.width / 2, cy = r2.top + r2.height / 2;
        const hit = (x, y) => { const t = document.elementFromPoint(x, y); return t && (t === e || e.contains(t)); };
        const big = hit(cx, cy - 21) && hit(cx, cy + 21) && hit(cx - 11, cy) && hit(cx + 11, cy);
        if (!big) add('táctil-chico', e, `${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
  }
  scrollTo(0, 0);
  // 6. medios
  for (const m of document.querySelectorAll('img, video, canvas, iframe, svg, table, pre')) {
    if (!visible(m) || inScroller(m) || m.closest('svg') && m.tagName !== 'svg') continue;
    const r = m.getBoundingClientRect();
    if (r.right > vw + 1 && !fixedAncestor(m)) {
      let clipped = false; for (let p = m.parentElement; p && p !== document.body; p = p.parentElement) if (/(hidden|clip)/.test(getComputedStyle(p).overflowX)) { clipped = true; break; }
      if (!clipped) add('medio-desborda', m, `[${Math.round(r.left)}→${Math.round(r.right)}]`);
    }
  }
  // 2b. texto/bloques que salen del ancho sin estar recortados (bloques sueltos)
  const seen = new Set();
  for (const e of document.querySelectorAll('body *')) {
    if (!visible(e) || fixedAncestor(e) || inScroller(e) || /skip/.test(e.className)) continue;
    const r = e.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) {
      let clipped = false; for (let p = e.parentElement; p && p !== document.documentElement; p = p.parentElement) { const cs = getComputedStyle(p); if (/(hidden|clip)/.test(cs.overflowX)) { clipped = true; break; } }
      const parentOut = e.parentElement && (() => { const pr = e.parentElement.getBoundingClientRect(); return pr.right > vw + 1 || pr.left < -1; })();
      if (!clipped && !parentOut && !seen.has(sel(e))) { seen.add(sel(e)); add('bloque-desborda', e, `[${Math.round(r.left)}→${Math.round(r.right)}]`); }
    }
  }
  // 5. menús: se abren desde la sonda en el paso siguiente (ver `menus`)
  return { fails, sw, vw, vh, nItems: items.length };
};

// Alcanzable: cada control debe poder desplazarse a un lugar donde nada fijo lo tape (todo dentro de la página: rápido).
const reachable = async (page, ignore) => {
  const found = await page.evaluate(() => {
    const out = new Set();
    const items = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button]')];
    const isFixed = (el) => { for (let p = el; p && p !== document.body; p = p.parentElement) if (getComputedStyle(p).position === 'fixed') return true; return false; };
    for (const e of items) {
      const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      let hid = false; for (let p = e; p; p = p.parentElement) if (p.hidden || p.inert || p.getAttribute('aria-hidden') === 'true') { hid = true; break; }
      if (hid || isFixed(e)) continue;
      let r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
      e.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      r = e.getBoundingClientRect();
      if (r.right > innerWidth + 1 || r.left < -1 || r.height > innerHeight * 0.9) continue;
      // Se prueban varias posiciones de desplazamiento: basta con que exista una donde nada fijo lo tape.
      let coveredBy = null;
      for (const off of [0, -50, 50, -100, 100, -160, 160]) {
        scrollBy(0, off);
        r = e.getBoundingClientRect();
        if (r.top < 0 || r.bottom > innerHeight) { scrollBy(0, -off); continue; }
        coveredBy = null;
        for (const [x, y] of [[.5, .5], [.1, .1], [.9, .1], [.1, .9], [.9, .9]]) {
          const t = document.elementFromPoint(r.left + r.width * x, r.top + r.height * y);
          if (!t || t === e || e.contains(t) || t.contains(e)) continue;
          const host = t.getRootNode() instanceof ShadowRoot ? t.getRootNode().host : null;
          if (host || isFixed(t) || getComputedStyle(t).position === 'sticky') { coveredBy = host || t; break; }
        }
        scrollBy(0, -off);
        if (!coveredBy) break;
      }
      if (coveredBy) out.add(`${(e.getAttribute('aria-label') || e.textContent || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 24)} tapado por ${coveredBy.tagName.toLowerCase()}${typeof coveredBy.className === 'string' && coveredBy.className ? '.' + coveredBy.className.split(' ')[0] : ''}`);
    }
    scrollTo(0, 0);
    return [...out];
  });
  const re = ignore ? new RegExp(ignore) : null;
  return found.filter((t) => !(re && re.test(t))).slice(0, 6);
};

const wideLayout = async (page, vw) => page.evaluate((vw) => {
  // texto visible: ancho total que ocupa y centrado
  let minL = Infinity, maxR = -Infinity, maxLine = 0;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!n.textContent.trim()) continue; const e = n.parentElement; const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || e.closest('[aria-hidden=true]')) continue;
    let fixed = false; for (let p = e; p && p !== document.body; p = p.parentElement) if (getComputedStyle(p).position === 'fixed') fixed = true;
    if (fixed) continue;
    const rg = document.createRange(); rg.selectNodeContents(n); const r = rg.getBoundingClientRect(); if (!r.width || r.right < 0 || r.left > vw || e.closest('[class*=skip]')) continue;
    minL = Math.min(minL, r.left); maxR = Math.max(maxR, r.right);
    if (/^(P|LI|H1|H2|H3|DD|BLOCKQUOTE)$/.test(e.tagName)) maxLine = Math.max(maxLine, r.width);
  }
  return { span: Math.round(maxR - minL), left: Math.round(minL), right: Math.round(vw - maxR), maxLine: Math.round(maxLine) };
}, vw);

// ── ejecución ───────────────────────────────────────────────────────────────────────────────
let srv = null, base = opt('url');
if (!base) {
  if (!existsSync(resolve(root, cfg.dir))) { console.error(`No existe ${cfg.dir}: compila primero (${cfg.build || 'npm run build'}).`); process.exit(2); }
  srv = await serve(cfg.dir, cfg.fallback || 'index.html'); base = srv.url;
}
base = base.replace(/\/$/, '');
let browser;
try { browser = await playwright.chromium.launch(); } catch { browser = await playwright.chromium.launch({ channel: 'chrome' }); }
const shots = opt('shots'); if (shots) mkdirSync(shots, { recursive: true });
const report = [];
let checked = 0;
for (const [w, h, name, touch] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: false, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  for (const route of cfg.routes) {
    const page = await ctx.newPage();
    const issues = [];
    try {
      if (route.storage) await page.addInitScript((kv) => { try { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } }, route.storage);
      await page.goto(base + (route.path || route), { waitUntil: 'networkidle', timeout: 45000 }).catch(() => page.goto(base + (route.path || route), { waitUntil: 'load', timeout: 45000 }));
      if (cfg.waitFor) await page.waitForSelector(cfg.waitFor, { timeout: 8000 }).catch(() => {});
      for (let y = 0; y < 30000; y += 700) { const end = await page.evaluate((y) => { scrollTo(0, y); return y >= document.documentElement.scrollHeight; }, y); await page.waitForTimeout(40); if (end) break; }
      await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(500);
      const r = await page.evaluate(probe, { touch, ignore: cfg.ignore, menus: cfg.menus });
      issues.push(...r.fails);
      // A 256 px de alto (zoom 400 %) cualquier botón flotante ocupa ~20 % de la pantalla: la prueba de «tapado» no aplica ahí.
      if (h >= 300) issues.push(...(await reachable(page, cfg.ignoreReach)).map((what) => ({ type: 'tapado', what })));
      // al fondo de la página nada interactivo debe quedar bajo un flotante
      for (const m of cfg.menus || []) {
        const opener = page.locator(m.open).first();
        if (!(await opener.count()) || !(await opener.isVisible())) continue;
        await opener.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(350);
        const box = await page.evaluate((s) => { const e = [...document.querySelectorAll(s)].find((x) => { const r = x.getBoundingClientRect(); return r.width && r.height; }); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, vw: innerWidth, vh: innerHeight }; }, m.panel);
        if (!box && !m.optional) issues.push({ type: 'menú-sin-abrir', what: `${m.open} → ${m.panel}` });
        else if (box && (box.l < -1 || box.r > box.vw + 1 || box.t < -1)) issues.push({ type: 'menú-fuera', what: `${m.panel} [${Math.round(box.l)}→${Math.round(box.r)}] de ${box.vw}` });
        else if (box && box.b > box.vh + 1 && !m.scrolls) issues.push({ type: 'menú-corta-abajo', what: `${m.panel} termina en ${Math.round(box.b)} de ${box.vh}` });
        if (shots && [320, 844].includes(w)) await page.screenshot({ path: join(shots, `menu-${route.id}-${w}x${h}.png`) });
        await page.keyboard.press('Escape'); await page.mouse.click(2, h - 2).catch(() => {}); await page.waitForTimeout(150);
      }
      if (w >= 1920) {
        const L = await wideLayout(page, w);
        if (L.span > 1800) issues.push({ type: 'sin-ancho-máximo', what: `el contenido ocupa ${L.span}px de ${w}` });
        if (Math.abs(L.left - L.right) > w * 0.12) issues.push({ type: 'descentrado', what: `margen izquierdo ${L.left}px, derecho ${L.right}px` });
        if (L.maxLine > 1100) issues.push({ type: 'línea-demasiado-larga', what: `un párrafo mide ${L.maxLine}px` });
      }
      if (shots) await page.screenshot({ path: join(shots, `${route.id}-${w}x${h}.png`) });
    } catch (e) { issues.push({ type: 'error-de-carga', what: String(e).slice(0, 120) }); }
    checked += 1;
    report.push({ viewport: `${w}×${h}`, name, route: route.id || route.path, issues });
    await page.close();
  }
  await ctx.close();
}
await browser.close(); srv?.server.close();

let total = 0;
for (const r of report) {
  if (!r.issues.length) continue;
  const grouped = {};
  for (const i of r.issues) (grouped[i.type] ||= []).push(i.what);
  for (const [t, ws] of Object.entries(grouped)) { total += ws.length; console.log(`✗ ${r.viewport} ${r.route} · ${t} (${ws.length}): ${[...new Set(ws)].slice(0, 4).join(' | ')}`); }
}
console.log(`\n${checked} combinaciones (${VIEWPORTS.length} tamaños × ${cfg.routes.length} rutas) · ${total} problemas`);
if (opt('json')) (await import('node:fs')).writeFileSync(opt('json'), JSON.stringify(report, null, 1));
process.exit(total ? 1 : 0);
