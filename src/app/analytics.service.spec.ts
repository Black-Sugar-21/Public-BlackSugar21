import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ANALYTICS_ID, AnalyticsService, pagePath } from './analytics.service';
import { closeBanner } from './analytics/consent-banner';

const gtag = () => (window.dataLayer ?? []).map((a) => Array.from(a as ArrayLike<unknown>));
const scripts = () => Array.from(document.querySelectorAll('script')).map((s) => s.src).filter((s) => /google/.test(s));
const flush = () => new Promise((r) => setTimeout(r, 400));
const make = (id: string, platform = 'browser') => {
  TestBed.configureTestingModule({ providers: [{ provide: ANALYTICS_ID, useValue: id }, { provide: PLATFORM_ID, useValue: platform }] });
  return TestBed.inject(AnalyticsService);
};

beforeEach(() => { localStorage.clear(); document.head.innerHTML = ''; document.body.innerHTML = ''; delete window.dataLayer; delete window.gtag; closeBanner(); history.replaceState(null, '', '/'); });
afterEach(() => { TestBed.resetTestingModule(); history.replaceState(null, '', '/'); });

describe('pagePath', () => {
  it('sin query, hash ni tokens', () => {
    expect(pagePath('/')).toBe('/');
    expect(pagePath('/privacy?x=1#a')).toBe('/privacy');
    expect(pagePath('/opinion/SECRETO123')).toBe('/opinion');
    expect(pagePath('/guia/primera-cita')).toBe('/guia/primera-cita');
    expect(pagePath('/guia/../x')).toBe('/guia');
    expect(pagePath('/app/profile')).toBe('/app');
    expect(pagePath('/otra-cosa')).toBe('/');
    expect(pagePath('')).toBe('/');
  });
});

describe('AnalyticsService apagada (sin measurementId)', () => {
  it('no hace nada: ni aviso, ni script, ni eventos, ni botón de preferencias', async () => {
    const s = make('');
    s.start(() => 'es', '/privacy');
    s.trackPageView('/'); s.trackEvent('age_verified'); s.openPreferences();
    await flush();
    expect(s.enabled).toBe(false);
    expect(document.querySelector('[data-analytics-banner]')).toBeNull();
    expect(window.dataLayer).toBeUndefined();
    expect(scripts()).toEqual([]);
  });
  it('en el servidor tampoco', () => {
    const s = make('G-TEST123456', 'server');
    s.start(() => 'es', '/privacy');
    expect(s.enabled).toBe(false);
    expect(() => s.openPreferences()).not.toThrow();
  });
});

describe('AnalyticsService encendida', () => {
  it('pregunta primero, sin Google; «Aceptar» pide gtag y manda page_view limpio; solo eventos de la lista', async () => {
    const s = make('G-TEST123456');
    s.start(() => 'es', '/privacy');
    expect(s.enabled).toBe(true);
    s.trackPageView('/'); s.trackEvent('age_verified'); // antes de que llegue el módulo: esperan en la cola
    await flush();
    const banner = document.querySelector('[data-analytics-banner]')!;
    expect(banner.getAttribute('data-theme')).toBe('dark');
    expect(window.dataLayer).toBeUndefined();
    (banner.shadowRoot!.querySelectorAll('button')[1] as HTMLButtonElement).click();
    s.trackPageView('/opinion/SECRETO?x=1');
    s.trackEvent('tester_signup', { email_domain: 'gmail.com' });
    s.trackEvent('visitor_info', { timezone: 'x' });
    s.trackEvent('age_verified');
    await flush();
    const ev = gtag().filter((c) => c[0] === 'event');
    expect(ev.map((c) => c[1])).toEqual(['page_view', 'page_view', 'age_verified']);
    expect(ev[1][2]).toEqual({ page_path: '/opinion' });
    expect(scripts()).toEqual(['https://www.googletagmanager.com/gtag/js?id=G-TEST123456']);
    expect(gtag().find((c) => c[0] === 'config')![2]).toMatchObject({ page_location: location.origin + '/', allow_google_signals: false });
    s.openPreferences();
    expect(document.querySelector('[data-analytics-banner]')).not.toBeNull();
  });
  it('un fallo dentro de gtag no rompe la página', async () => {
    const s = make('G-TEST123456');
    s.start(() => 'es', '/privacy');
    await flush();
    (document.querySelector('[data-analytics-banner]')!.shadowRoot!.querySelectorAll('button')[1] as HTMLButtonElement).click();
    await flush();
    window.gtag = () => { throw new Error('boom'); };
    expect(() => s.trackEvent('age_verified')).not.toThrow();
  });
  it('«Solo lo necesario»: nunca pide gtag', async () => {
    const s = make('G-TEST123456');
    s.start(() => 'en', '/privacy');
    await flush();
    (document.querySelector('[data-analytics-banner]')!.shadowRoot!.querySelectorAll('button')[0] as HTMLButtonElement).click();
    s.trackEvent('age_verified');
    await flush();
    expect(scripts()).toEqual([]);
    expect(window.dataLayer).toBeUndefined();
  });
  it('/opinion/{token}: ni aviso ni medición', async () => {
    history.replaceState(null, '', '/opinion/SECRETO');
    const s = make('G-TEST123456');
    s.start(() => 'es', '/privacy');
    await flush();
    expect(s.enabled).toBe(false);
    expect(document.querySelector('[data-analytics-banner]')).toBeNull();
  });
  it('start es idempotente y una aceptación guardada manda la vista de página', async () => {
    localStorage.setItem('bb_analytics_consent', 'granted');
    const s = make('G-TEST123456');
    s.start(() => 'es', '/privacy'); s.start(() => 'es', '/privacy');
    s.trackPageView('/privacy');
    await flush();
    expect(scripts().length).toBe(1);
    expect(gtag().filter((c) => c[0] === 'event').map((c) => c[1])).toEqual(['page_view']);
    expect(document.querySelector('[data-analytics-banner]')).toBeNull();
  });
  it('la cola de espera tiene tope y si el módulo no llega no rompe nada', async () => {
    const s = make('G-TEST123456');
    s.start(() => 'es', '/privacy');
    for (let i = 0; i < 80; i++) s.trackEvent('age_verified');
    expect((s as unknown as { waiting: unknown[] }).waiting.length).toBe(50);
    await flush();
    expect((s as unknown as { waiting: unknown[] }).waiting.length).toBe(0);
  });
});
