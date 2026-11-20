import { Injectable, InjectionToken, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ANALYTICS_MEASUREMENT_ID } from './analytics.config';
import type { Analytics, Params } from './analytics/web-analytics';
import { onFirstInteraction } from './analytics/first-interaction';

/** measurementId efectivo (por defecto el de analytics.config; las pruebas lo sustituyen). */
export const ANALYTICS_ID = new InjectionToken<string>('ANALYTICS_ID', { providedIn: 'root', factory: () => ANALYTICS_MEASUREMENT_ID });

const FIRST_SEGMENTS = ['moderation-policy', 'politicas-moderacion', 'terms', 'privacy', 'data-deletion', 'safety-standards', 'features', 'analytics', 'app', 'coach', 'guia'];

/** Ruta sin query, sin hash y sin tokens: `/opinion/{token}` cuenta como `/opinion`; lo desconocido, como `/`. */
export function pagePath(url: string): string {
  const parts = url.split(/[?#]/)[0].split('/').filter(Boolean);
  if (parts[0] === 'opinion') return '/opinion';
  if (parts[0] === 'guia' && parts[1] && /^[a-z0-9-]+$/.test(parts[1])) return `/guia/${parts[1]}`;
  return parts[0] && FIRST_SEGMENTS.includes(parts[0]) ? `/${parts[0]}` : '/';
}

/**
 * Analítica de blacksugar21.com: GA4 con consentimiento (Consent Mode v2 denegado), gtag.js solo tras «Aceptar» y en
 * inactividad, lista cerrada de eventos (`analytics-events.ts`). NO usa Firebase: no pide el SDK. Sin
 * `ANALYTICS_MEASUREMENT_ID` no carga nada (ni el módulo de analítica: es un chunk aparte, así el JS inicial no crece).
 * En el prerender no hace nada. Las páginas de «segunda opinión» (`/opinion/{token}`, el token es un secreto) quedan
 * fuera: ni aviso ni medición.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly id = inject(ANALYTICS_ID);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private api: Analytics | null = null;
  private started = false;
  private waiting: Array<() => void> = [];
  private prefs: () => void = () => undefined;
  private mount: (() => void) | null = null;
  private interacted = false;

  /** Lo llama la app una vez, con la función que da el idioma actual. Trae el módulo y muestra el aviso si hace falta. */
  start(getLanguage: () => string, privacyHref: string): void {
    if (!this.browser || this.started || !this.id || location.pathname.startsWith('/opinion')) return;
    this.started = true;
    // El aviso aparece en la primera interacción (no al cargar: así no puede pasar a ser el LCP). La escucha se pone ya; el aviso, cuando llega el módulo.
    onFirstInteraction(() => { this.interacted = true; this.mount?.(); });
    void Promise.all([import('./analytics/web-analytics'), import('./analytics/consent-banner'), import('./analytics-events')]).then(([wa, banner, ev]) => {
      const api = wa.createAnalytics({ measurementId: this.id, events: ev.ANALYTICS_EVENTS, getLanguage, pageLocation: () => location.origin + pagePath(location.pathname) });
      this.api = api;
      // El sitio es siempre oscuro: el aviso también.
      const opts = { analytics: api, getLanguage, privacyHref, theme: 'dark' as const };
      // «Preferencias de privacidad» del pie siempre abre el aviso.
      this.prefs = () => { banner.closeBanner(); banner.showBanner(opts); };
      this.mount = () => { banner.mountConsent(opts); };
      if (this.interacted) this.mount();
      api.onConsentChange((c) => { if (c === 'granted') api.pageView(pagePath(location.pathname)); });
      api.trackScroll();
      for (const w of this.waiting.splice(0)) w();
    }).catch(() => { this.waiting = []; });
  }

  openPreferences(): void { this.prefs(); }
  /** ¿Hay analítica? (measurementId puesto y la página la admite). Sirve para mostrar «Preferencias de privacidad». */
  get enabled(): boolean { return this.started; }

  trackPageView(url: string): void { this.run(() => this.api?.pageView(pagePath(url))); }
  trackEvent(name: string, params?: Params): void { this.run(() => { try { this.api?.track(name, params); } catch { /* la analítica nunca rompe la página */ } }); }

  /** Ejecuta ya si el módulo llegó; si no, espera en una cola corta (lo previo al aviso nunca se envía: sin consentimiento). */
  private run(fn: () => void): void {
    if (!this.started) return;
    if (this.api) fn(); else if (this.waiting.length < 50) this.waiting.push(fn);
  }
}
