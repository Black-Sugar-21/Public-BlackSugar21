// Aviso de analítica: una frase, dos botones con el mismo peso visual, enlace a la política. Shadow DOM (no choca con el CSS del sitio).
import type { Analytics } from './web-analytics';
import { consentMessages, isRtl } from './consent-messages';

export interface BannerOptions { analytics: Analytics; getLanguage: () => string; privacyHref: string; /** Sitios de un solo tema (p. ej. siempre oscuros). Por defecto sigue al sitio o al sistema. */ theme?: 'light' | 'dark' }

const CSS = `
:host{all:initial;position:fixed;inset:auto 0 0 0;z-index:2147483000;display:block;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --bg:#fff;--fg:#1d1d1f;--mut:#5b5b66;--line:#c9c9d2;--ac:#4b3ad6;--ring:#4b3ad6}
:host([data-theme=dark]){--bg:#1b1b22;--fg:#f2f2f6;--mut:#b4b4c0;--line:#4a4a58;--ac:#a99bff;--ring:#a99bff}
.box{box-sizing:border-box;margin:0 auto 12px;width:min(640px,calc(100% - 24px));padding:14px 16px;background:var(--bg);color:var(--fg);
  border:1px solid var(--line);border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.18);display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;justify-content:space-between}
p{margin:0;flex:1 1 280px;min-width:0}
a{color:var(--ac);text-underline-offset:3px;white-space:nowrap}
.row{display:flex;flex-wrap:wrap;gap:8px;flex:0 0 auto}
button{font:inherit;font-weight:600;min-height:44px;min-width:44px;padding:0 16px;border-radius:10px;border:1.5px solid var(--ac);background:transparent;color:var(--ac);cursor:pointer}
button:hover{background:color-mix(in srgb,var(--ac) 12%,transparent)}
:is(button,a):focus-visible{outline:3px solid var(--ring);outline-offset:2px}
@media (max-width:480px){.row{width:100%}.row button{flex:1 1 0}}
@media (prefers-reduced-motion:no-preference){.box{animation:in .2s ease-out}@keyframes in{from{opacity:0;transform:translateY(8px)}}}
`;

export function resolvedTheme(doc: Document = document, win: Window = window): 'light' | 'dark' {
  const t = doc.documentElement.getAttribute('data-theme');
  if (t === 'dark' || t === 'light') return t;
  return win.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

let host: HTMLElement | null = null;

export function closeBanner(): void { host?.remove(); host = null; }

export function showBanner(o: BannerOptions): void {
  if (host) return;
  const m = consentMessages(o.getLanguage());
  host = document.createElement('div');
  host.setAttribute('data-analytics-banner', '');
  host.setAttribute('data-theme', o.theme ?? resolvedTheme());
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style'); style.textContent = CSS;
  const box = document.createElement('div');
  box.className = 'box'; box.setAttribute('role', 'region'); box.setAttribute('aria-label', m.label);
  box.setAttribute('dir', isRtl(o.getLanguage()) ? 'rtl' : 'ltr');
  const p = document.createElement('p'); p.append(m.text + ' ');
  const a = document.createElement('a'); a.href = o.privacyHref; a.textContent = m.privacy; p.append(a);
  const row = document.createElement('div'); row.className = 'row';
  const choose = (c: 'granted' | 'denied') => { o.analytics.setConsent(c); closeBanner(); };
  const mk = (label: string, c: 'granted' | 'denied') => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', () => choose(c)); return b; };
  row.append(mk(m.necessary, 'denied'), mk(m.accept, 'granted'));
  box.append(p, row); root.append(style, box);
  document.body.appendChild(host);
}

/** Muestra el aviso si hace falta y devuelve `openPreferences` para el enlace del pie. */
export function mountConsent(o: BannerOptions): { openPreferences: () => void; offered: boolean } {
  const offered = o.analytics.enabled;
  if (o.analytics.needsChoice()) showBanner(o);
  return { openPreferences: () => { if (offered) { closeBanner(); showBanner(o); } }, offered };
}
