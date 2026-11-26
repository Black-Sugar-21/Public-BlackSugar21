import { TestBed } from '@angular/core/testing';
import { ANDROID_ENV, ANDROID_STORES } from './android-env';

describe('ANDROID_ENV (valores reales del navegador)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lee navigator y location', () => {
    const env = TestBed.inject(ANDROID_ENV);
    expect(env.userAgent).toBe(navigator.userAgent);
    expect(env.maxTouchPoints).toBe(navigator.maxTouchPoints);
    expect(env.online()).toBe(navigator.onLine);
    expect(env.origin).toBe(location.origin);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
    void env.fetch('/x', { method: 'HEAD' });
    expect(fetch).toHaveBeenCalledWith('/x', { method: 'HEAD' });
  });

  it('sin navegador (servidor) no falla: robot, en línea y sin origen', () => {
    vi.stubGlobal('navigator', undefined);
    vi.stubGlobal('location', undefined);
    TestBed.resetTestingModule();
    const env = TestBed.inject(ANDROID_ENV);
    expect(env.userAgent).toBe('');
    expect(env.maxTouchPoints).toBe(0);
    expect(env.online()).toBe(true);
    expect(env.origin).toBe('');
  });

  it('los enlaces de tienda salen de beta-links.json: TestFlight https, Google Play sin ficha todavía', () => {
    const stores = TestBed.inject(ANDROID_STORES);
    expect(stores.testflight === null || stores.testflight.startsWith('https://testflight.apple.com/')).toBe(true);
    expect(stores.googlePlay).toBeNull();
  });
});
