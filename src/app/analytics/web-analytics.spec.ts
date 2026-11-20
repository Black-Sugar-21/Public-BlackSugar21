import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMON_EVENTS, STORAGE_KEY, browserOptOut, createAnalytics, deviceType, readChoice, validateEvent, type EventTable } from './web-analytics';
import { CONSENT_MESSAGES, LANGS, consentMessages, isRtl } from './consent-messages';
import { closeBanner, mountConsent, resolvedTheme, showBanner } from './consent-banner';

const ID = 'G-TEST123456';
const TABLE: EventTable = { ...COMMON_EVENTS, testflight_click: { app: { type: 'enum', values: ['nexus', 'trylab'] } }, flag: { on: { type: 'bool' }, n: { type: 'int', max: 5 } } };
const gtagCalls = () => (window.dataLayer ?? []).map((a) => Array.from(a as ArrayLike<unknown>));
const scripts = () => Array.from(document.querySelectorAll('script')).map((s) => s.src);
const mk = (id = ID) => createAnalytics({ measurementId: id, events: TABLE, getLanguage: () => 'es' });
const flush = () => new Promise((r) => setTimeout(r, 300));

beforeEach(() => { localStorage.clear(); document.head.innerHTML = ''; document.body.innerHTML = ''; delete window.dataLayer; delete window.gtag; document.documentElement.removeAttribute('data-theme'); closeBanner(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('validateEvent', () => {
  it('acepta eventos de la lista', () => {
    expect(validateEvent(TABLE, 'page_view', { page_path: '/a/b' }).ok).toBe(true);
    expect(validateEvent(TABLE, 'testflight_click', { app: 'nexus' }).ok).toBe(true);
    expect(validateEvent(TABLE, 'flag', { on: true, n: 3 }).ok).toBe(true);
    expect(validateEvent(TABLE, 'page_view').ok).toBe(true);
  });
  it('rechaza lo que no está en la lista', () => {
    expect(validateEvent(TABLE, 'purchase').ok).toBe(false);
    expect(validateEvent(TABLE, 'page_view', { extra: 'x' }).ok).toBe(false);
  });
  it('rechaza valores fuera de lista, rutas con query y tipos erróneos', () => {
    expect(validateEvent(TABLE, 'testflight_click', { app: 'otra' }).ok).toBe(false);
    expect(validateEvent(TABLE, 'page_view', { page_path: '/a?x=1' }).ok).toBe(false);
    expect(validateEvent(TABLE, 'page_view', { page_path: 'a' }).ok).toBe(false);
    expect(validateEvent(TABLE, 'flag', { on: 'si' }).ok).toBe(false);
    expect(validateEvent(TABLE, 'flag', { n: 9 }).ok).toBe(false);
    expect(validateEvent(TABLE, 'flag', { n: 1.5 }).ok).toBe(false);
  });
  it('rechaza correos y teléfonos en cualquier parámetro', () => {
    const t: EventTable = { x: { a: { type: 'enum', values: ['a@b.cl', '+56 9 1234 5678'] } } };
    expect(validateEvent(t, 'x', { a: 'a@b.cl' })).toEqual({ ok: false, reason: 'posible dato personal en x.a' });
    expect(validateEvent(t, 'x', { a: '+56 9 1234 5678' }).ok).toBe(false);
  });
});

describe('señales del navegador', () => {
  it('GPC y DNT equivalen a denegado', () => {
    expect(browserOptOut({ globalPrivacyControl: true } as unknown as Navigator, window)).toBe(true);
    expect(browserOptOut({ doNotTrack: '1' } as unknown as Navigator, window)).toBe(true);
    expect(browserOptOut({ msDoNotTrack: '1' } as unknown as Navigator, window)).toBe(true);
    expect(browserOptOut({} as Navigator, { doNotTrack: '1' } as unknown as Window)).toBe(true);
    expect(browserOptOut({ doNotTrack: '0' } as unknown as Navigator, window)).toBe(false);
  });
  it('tipo de dispositivo', () => { expect(deviceType(360)).toBe('mobile'); expect(deviceType(768)).toBe('tablet'); expect(deviceType(1440)).toBe('desktop'); expect(deviceType()).toBeTruthy(); });
});

describe('sin consentimiento no se envía nada', () => {
  it('bandera apagada (measurementId vacío): no hace nada', () => {
    const a = mk('');
    expect(a.enabled).toBe(false);
    a.setConsent('granted');
    expect(a.track('page_view', { page_path: '/' })).toBe(false);
    expect(a.needsChoice()).toBe(false);
    expect(readChoice()).toBeNull();
    expect(scripts()).toEqual([]);
    expect(window.dataLayer).toBeUndefined();
  });
  it('sin elección: ni script ni dataLayer ni eventos', async () => {
    const a = mk();
    expect(a.needsChoice()).toBe(true);
    expect(a.consent()).toBe('denied');
    expect(a.track('page_view', { page_path: '/' })).toBe(false);
    await flush();
    expect(scripts().filter((s) => /google/.test(s))).toEqual([]);
    expect(window.dataLayer).toBeUndefined();
  });
  it('«Solo lo necesario»: tampoco', async () => {
    const a = mk(); a.setConsent('denied');
    expect(a.track('page_view', { page_path: '/' })).toBe(false);
    await flush();
    expect(scripts()).toEqual([]);
    expect(readChoice()).toBe('denied');
  });
  it('GPC anula una aceptación guardada y no pregunta', async () => {
    localStorage.setItem(STORAGE_KEY, 'granted');
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { globalPrivacyControl: true }));
    const a = mk();
    expect(a.needsChoice()).toBe(false);
    expect(a.consent()).toBe('denied');
    await flush();
    expect(scripts()).toEqual([]);
  });
  it('sin localStorage la página funciona (denegado)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('x'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('x'); });
    const a = mk();
    expect(() => a.setConsent('granted')).not.toThrow();
    expect(a.consent()).toBe('denied');
  });
});

describe('con consentimiento', () => {
  it('Consent Mode v2: default denegado, solo analytics_storage pasa a concedido, sin señales de Google', async () => {
    const a = mk(); a.setConsent('granted');
    expect(a.track('testflight_click', { app: 'nexus' })).toBe(true);
    expect(a.track('purchase')).toBe(false);
    await flush();
    const calls = gtagCalls();
    expect(calls[0]).toEqual(['consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }]);
    expect(calls.find((c) => c[0] === 'consent' && c[1] === 'update')?.[2]).toEqual({ analytics_storage: 'granted' });
    const cfg = calls.find((c) => c[0] === 'config') as unknown[];
    expect(cfg[1]).toBe(ID);
    expect(cfg[2]).toMatchObject({ send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, user_properties: { language: 'es' } });
    expect(calls.some((c) => c[0] === 'event' && c[1] === 'testflight_click')).toBe(true);
    expect(scripts()).toEqual([`https://www.googletagmanager.com/gtag/js?id=${ID}`]);
  });
  it('cola eventos hasta cargar y luego envía directo; pageView y scroll', async () => {
    const a = mk(); a.setConsent('granted');
    a.pageView('/inicio');
    await flush();
    a.track('flag', { on: true });
    expect(gtagCalls().filter((c) => c[0] === 'event').map((c) => c[1])).toEqual(['page_view', 'flag']);
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 1000 });
    const off = a.trackScroll();
    document.documentElement.scrollTop = 600; dispatchEvent(new Event('scroll'));
    document.documentElement.scrollTop = 950; dispatchEvent(new Event('scroll'));
    dispatchEvent(new Event('scroll'));
    expect(gtagCalls().filter((c) => c[1] === 'scroll_depth').map((c) => (c[2] as { percent: string }).percent)).toEqual(['50', '90']);
    off();
  });
  it('scroll sin recorrido no envía', () => {
    const a = mk(); a.setConsent('granted');
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 500 });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 500 });
    const off = a.trackScroll(); dispatchEvent(new Event('scroll')); off();
    expect(gtagCalls().filter((c) => c[1] === 'scroll_depth')).toEqual([]);
  });
  it('retirar el permiso apaga el envío', async () => {
    const a = mk(); const seen: string[] = []; a.onConsentChange((c) => seen.push(c));
    a.setConsent('granted'); await flush();
    a.setConsent('denied');
    expect((window as unknown as Record<string, boolean>)[`ga-disable-${ID}`]).toBe(true);
    expect(gtagCalls().filter((c) => c[0] === 'consent' && c[1] === 'update').pop()?.[2]).toMatchObject({ analytics_storage: 'denied', ad_storage: 'denied' });
    expect(a.track('page_view', { page_path: '/' })).toBe(false);
    a.setConsent('granted');
    expect((window as unknown as Record<string, boolean>)[`ga-disable-${ID}`]).toBe(false);
    expect(seen).toEqual(['granted', 'denied', 'granted']);
  });
  it('una elección guardada se aplica al iniciar sin preguntar', async () => {
    localStorage.setItem(STORAGE_KEY, 'granted');
    const a = mk();
    expect(a.needsChoice()).toBe(false);
    await flush();
    expect(scripts().length).toBe(1);
  });
  it('usa setTimeout si no hay requestIdleCallback y sí la usa si existe', async () => {
    const ric = vi.fn((cb: () => void) => { cb(); return 1; });
    vi.stubGlobal('requestIdleCallback', ric);
    const a = mk(); a.setConsent('granted');
    expect(ric).toHaveBeenCalled();
    expect(scripts().length).toBe(1);
  });
});

describe('orden de los comandos de gtag', () => {
  it('ningún evento sale antes de «config» (con Signals ya apagados)', async () => {
    const a = mk(); a.setConsent('granted');
    a.pageView('/inicio'); a.track('flag', { on: true });
    await flush();
    const cmds = gtagCalls().map((c) => c[0]);
    expect(cmds.indexOf('config')).toBeGreaterThan(-1);
    expect(cmds.indexOf('event')).toBeGreaterThan(cmds.indexOf('config'));
  });
});

describe('aviso', () => {
  it('una frase, enlace a privacidad y dos botones iguales', () => {
    const a = mk();
    const { offered } = mountConsent({ analytics: a, getLanguage: () => 'es', privacyHref: '/privacy' });
    expect(offered).toBe(true);
    const host = document.querySelector('[data-analytics-banner]')!;
    const root = host.shadowRoot!;
    const btns = Array.from(root.querySelectorAll('button'));
    expect(btns.map((b) => b.textContent)).toEqual([CONSENT_MESSAGES.es.necessary, CONSENT_MESSAGES.es.accept]);
    expect(btns[0].className).toBe(btns[1].className);
    expect(root.querySelector('a')!.getAttribute('href')).toBe('/privacy');
    expect(root.querySelector('[role=region]')!.getAttribute('dir')).toBe('ltr');
    showBanner({ analytics: a, getLanguage: () => 'es', privacyHref: '/privacy' });
    expect(document.querySelectorAll('[data-analytics-banner]').length).toBe(1);
  });
  it('Aceptar guarda y cierra; Solo lo necesario guarda y cierra', () => {
    for (const [i, expected] of [[1, 'granted'], [0, 'denied']] as const) {
      localStorage.clear(); closeBanner();
      const a = mk(); mountConsent({ analytics: a, getLanguage: () => 'en', privacyHref: '/p' });
      (document.querySelector('[data-analytics-banner]')!.shadowRoot!.querySelectorAll('button')[i] as HTMLButtonElement).click();
      expect(readChoice()).toBe(expected);
      expect(document.querySelector('[data-analytics-banner]')).toBeNull();
    }
  });
  it('árabe va en RTL; el tema sigue al sitio', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    mountConsent({ analytics: mk(), getLanguage: () => 'ar', privacyHref: '/p' });
    const host = document.querySelector('[data-analytics-banner]')!;
    expect(host.shadowRoot!.querySelector('[role=region]')!.getAttribute('dir')).toBe('rtl');
    expect(host.getAttribute('data-theme')).toBe('dark');
  });
  it('tema por preferencia del sistema', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('dark') }));
    expect(resolvedTheme(document, window)).toBe('dark');
    document.documentElement.setAttribute('data-theme', 'light');
    expect(resolvedTheme()).toBe('light');
    document.documentElement.removeAttribute('data-theme');
    expect(resolvedTheme(document, { matchMedia: undefined } as unknown as Window)).toBe('light');
  });
  it('no pregunta si ya hay elección, si hay GPC o si está apagada; las preferencias reabren', () => {
    localStorage.setItem(STORAGE_KEY, 'denied');
    const a = mk();
    const m = mountConsent({ analytics: a, getLanguage: () => 'es', privacyHref: '/p' });
    expect(document.querySelector('[data-analytics-banner]')).toBeNull();
    m.openPreferences();
    expect(document.querySelector('[data-analytics-banner]')).not.toBeNull();
    closeBanner();
    const off = mountConsent({ analytics: mk(''), getLanguage: () => 'es', privacyHref: '/p' });
    off.openPreferences();
    expect(off.offered).toBe(false);
    expect(document.querySelector('[data-analytics-banner]')).toBeNull();
  });
});

describe('textos en 13 idiomas', () => {
  it('todos completos y distintos de vacío', () => {
    expect(LANGS.length).toBe(13);
    for (const l of LANGS) for (const v of Object.values(CONSENT_MESSAGES[l])) expect(v.trim().length).toBeGreaterThan(1);
  });
  it('variantes regionales y desconocidos', () => {
    expect(consentMessages('pt-BR')).toBe(CONSENT_MESSAGES.pt);
    expect(consentMessages('xx')).toBe(CONSENT_MESSAGES.es);
    expect(isRtl('ar-SA')).toBe(true); expect(isRtl('es')).toBe(false);
  });
  it('«Aceptar» y «Solo lo necesario» son distintos en cada idioma', () => { for (const l of LANGS) expect(CONSENT_MESSAGES[l].accept).not.toBe(CONSENT_MESSAGES[l].necessary); });
});

describe('extensiones por sitio (opcionales)', () => {
  it('pageLocation: page_location limpio en config y en cada page_view', async () => {
    const a = createAnalytics({ measurementId: ID, events: TABLE, getLanguage: () => 'es', pageLocation: () => 'https://x.test/r' });
    a.setConsent('granted'); await flush();
    const cfg = gtagCalls().filter((c) => c[0] === 'config').pop() as unknown[];
    expect(cfg[2]).toMatchObject({ page_location: 'https://x.test/r' });
    a.pageView('/r');
    expect(gtagCalls().some((c) => c[0] === 'set' && (c[1] as { page_location: string }).page_location === 'https://x.test/r')).toBe(true);
  });
  it('pageLocation no envía nada sin consentimiento', async () => {
    const a = createAnalytics({ measurementId: ID, events: TABLE, getLanguage: () => 'es', pageLocation: () => 'https://x.test/' });
    a.pageView('/');
    await flush();
    expect(window.dataLayer).toBeUndefined();
  });
  it('theme fijo del sitio manda sobre el del sistema', () => {
    mountConsent({ analytics: mk(), getLanguage: () => 'es', privacyHref: '/p', theme: 'dark' });
    expect(document.querySelector('[data-analytics-banner]')!.getAttribute('data-theme')).toBe('dark');
  });
});

describe('prefs-label (sitio)', () => {
  it('coincide con consent-messages en los 13 idiomas y cae a español', async () => {
    const { prefsLabel } = await import('./prefs-label');
    for (const l of LANGS) expect(prefsLabel(l)).toBe(CONSENT_MESSAGES[l].preferences);
    expect(prefsLabel('pt-BR')).toBe(CONSENT_MESSAGES.pt.preferences);
    expect(prefsLabel('xx')).toBe(CONSENT_MESSAGES.es.preferences);
  });
});
