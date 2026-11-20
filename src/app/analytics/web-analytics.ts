// @bimbask/web-analytics — analítica GA4 con consentimiento. Archivo único, sin dependencias, copiable a cualquier sitio.
// Reglas: (1) sin measurementId no se carga ni se muestra nada; (2) por defecto TODO denegado (Consent Mode v2);
// (3) gtag.js se descarga SOLO tras «Aceptar» (sin consentimiento no hay ni una petición a Google);
// (4) solo eventos de la tabla cerrada y sin datos personales; (5) sin publicidad ni señales de Google.

export type ParamSpec =
  | { type: 'enum'; values: readonly string[] }
  | { type: 'path' }
  | { type: 'bool' }
  | { type: 'int'; max: number };
export type EventTable = Readonly<Record<string, Readonly<Record<string, ParamSpec>>>>;
export type Choice = 'granted' | 'denied';
export type Params = Record<string, string | number | boolean>;

export const STORAGE_KEY = 'bb_analytics_consent';
export const RETENTION_NOTE_MONTHS = 2;

/** Eventos comunes a todos los sitios. Cada sitio añade los suyos en su tabla `analytics-events`. */
export const COMMON_EVENTS = {
  page_view: { page_path: { type: 'path' } },
  language_change: { language: { type: 'enum', values: ['es', 'en', 'pt', 'fr', 'de', 'it', 'ja', 'ko', 'zh', 'ar', 'hi', 'ru', 'tr'] } },
  scroll_depth: { percent: { type: 'enum', values: ['50', '90'] } },
} as const satisfies EventTable;

const PII = /@|(?:\+?\d[\s().-]?){7,}/;

export function validateEvent(table: EventTable, name: string, params: Params = {}): { ok: true } | { ok: false; reason: string } {
  const spec = table[name];
  if (!spec) return { ok: false, reason: `evento fuera de la lista: ${name}` };
  for (const [k, v] of Object.entries(params)) {
    const p = spec[k];
    if (!p) return { ok: false, reason: `parámetro fuera de la lista: ${name}.${k}` };
    if (typeof v === 'string' && PII.test(v)) return { ok: false, reason: `posible dato personal en ${name}.${k}` };
    if (p.type === 'enum' && !(typeof v === 'string' && p.values.includes(v))) return { ok: false, reason: `valor no permitido en ${name}.${k}` };
    if (p.type === 'path' && !(typeof v === 'string' && /^\/[A-Za-z0-9\-_./]{0,79}$/.test(v))) return { ok: false, reason: `ruta inválida en ${name}.${k}` };
    if (p.type === 'bool' && typeof v !== 'boolean') return { ok: false, reason: `se esperaba booleano en ${name}.${k}` };
    if (p.type === 'int' && !(typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= p.max)) return { ok: false, reason: `entero fuera de rango en ${name}.${k}` };
  }
  return { ok: true };
}

/** Señales del navegador que equivalen a «no»: Do Not Track y Global Privacy Control. */
export function browserOptOut(nav: Navigator = navigator, win: Window = window): boolean {
  const n = nav as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  const w = win as Window & { doNotTrack?: string };
  return n.globalPrivacyControl === true || n.doNotTrack === '1' || n.msDoNotTrack === '1' || w.doNotTrack === '1';
}

export function readChoice(): Choice | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch { return null; }
}
function writeChoice(c: Choice): void { try { localStorage.setItem(STORAGE_KEY, c); } catch { /* la página funciona sin almacenamiento */ } }

export function deviceType(width: number = window.innerWidth): 'mobile' | 'tablet' | 'desktop' {
  return width < 600 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop';
}

export interface AnalyticsConfig {
  /** G-XXXXXXXXXX. Vacío = no hace nada (bandera apagada). */
  measurementId: string;
  events: EventTable;
  /** Idioma actual del sitio (se lee al enviar, no al iniciar). */
  getLanguage: () => string;
  /** Opcional: URL «limpia» (sin ids, tokens ni query) que se envía como `page_location`. Sin esto, GA toma la URL real. */
  pageLocation?: () => string;
}

declare global { interface Window { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void } }

export interface Analytics {
  readonly enabled: boolean;
  /** Estado efectivo: solo 'granted' si la persona aceptó y el navegador no pidió lo contrario. */
  consent(): Choice;
  /** ¿Hay que preguntar? (activado, sin elección guardada y sin señal DNT/GPC). */
  needsChoice(): boolean;
  setConsent(c: Choice): void;
  track(name: string, params?: Params): boolean;
  pageView(path: string): void;
  /** Escucha de scroll para scroll_depth 50/90. Devuelve la función que la quita. */
  trackScroll(): () => void;
  onConsentChange(cb: (c: Choice) => void): void;
}

const GTAG_SRC = 'https://www.googletagmanager.com/gtag/js?id=';

export function createAnalytics(cfg: AnalyticsConfig): Analytics {
  const enabled = /^G-[A-Z0-9]{6,}$/.test(cfg.measurementId);
  const listeners: Array<(c: Choice) => void> = [];
  let loaded = false;
  let ready = false; // gtag.js ya pedido y 'config' ya enviado: antes de eso los eventos esperan en cola (con Signals apagados desde el primero)
  let state: Choice = 'denied';
  let pending: Array<[string, Params]> = [];
  const sent = new Set<string>();

  const effective = (): Choice => (!enabled || browserOptOut() ? 'denied' : readChoice() ?? 'denied');

  function ensureGtag(): void {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { (window.dataLayer as unknown[]).push(arguments); };
    // Consent Mode v2: todo denegado por defecto.
    window.gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  }

  function load(): void {
    if (loaded) return;
    loaded = true;
    ensureGtag();
    const run = () => {
      const s = document.createElement('script');
      s.async = true;
      s.src = GTAG_SRC + encodeURIComponent(cfg.measurementId);
      document.head.appendChild(s);
      window.gtag!('js', new Date());
      window.gtag!('consent', 'update', { analytics_storage: 'granted' }); // ad_* siguen denegados
      window.gtag!('config', cfg.measurementId, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        user_properties: { language: cfg.getLanguage(), device_type: deviceType() },
        ...(cfg.pageLocation ? { page_location: cfg.pageLocation() } : {}),
      });
      ready = true;
      for (const [n, p] of pending.splice(0)) window.gtag!('event', n, p);
    };
    // Diferido: tras el primer pintado, cuando el navegador está libre.
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(run, { timeout: 2000 }); else setTimeout(run, 200);
  }

  function apply(): void {
    const next = effective();
    if (next === 'granted') {
      if (loaded) window.gtag!('consent', 'update', { analytics_storage: 'granted' });
      load();
    } else if (loaded) {
      window.gtag!('consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
      (window as unknown as Record<string, boolean>)[`ga-disable-${cfg.measurementId}`] = true;
    }
    if (loaded && next === 'granted') (window as unknown as Record<string, boolean>)[`ga-disable-${cfg.measurementId}`] = false;
    if (next !== state) { state = next; listeners.forEach((l) => l(next)); }
  }

  const api: Analytics = {
    enabled,
    consent: () => (state = effective()),
    needsChoice: () => enabled && !browserOptOut() && readChoice() === null,
    setConsent(c) {
      if (!enabled) return;
      writeChoice(c);
      apply();
    },
    track(name, params = {}) {
      if (!enabled || effective() !== 'granted') return false;
      if (!validateEvent(cfg.events, name, params).ok) return false;
      if (ready) window.gtag!('event', name, params);
      else pending.push([name, params]);
      return true;
    },
    pageView(path) {
      if (cfg.pageLocation && enabled && effective() === 'granted' && window.gtag) window.gtag('set', { page_location: cfg.pageLocation() });
      api.track('page_view', { page_path: path });
    },
    trackScroll() {
      const onScroll = () => {
        const h = document.documentElement;
        const max = h.scrollHeight - h.clientHeight;
        if (max <= 0) return;
        const pct = (h.scrollTop / max) * 100;
        for (const mark of [50, 90]) if (pct >= mark && !sent.has(String(mark))) { sent.add(String(mark)); api.track('scroll_depth', { percent: String(mark) }); }
        if (sent.size === 2) removeEventListener('scroll', onScroll);
      };
      addEventListener('scroll', onScroll, { passive: true });
      return () => removeEventListener('scroll', onScroll);
    },
    onConsentChange(cb) { listeners.push(cb); },
  };
  state = effective();
  if (state === 'granted') load();
  return api;
}
