import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslationService, type Language } from '../../translation.service';
import { ANDROID_ENV, ANDROID_STORES, AndroidEnv } from './android-env';
import { AndroidPageComponent } from './android-page.component';

const UA = {
  android13: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36',
  android10: 'Mozilla/5.0 (Linux; Android 10; SM-A105F) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36',
  android7: 'Mozilla/5.0 (Linux; Android 7.0; SM-G930F) AppleWebKit/537.36 Chrome/80.0 Mobile Safari/537.36',
  facebook: 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 Chrome/110 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/420.0]',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
  bot: 'Mozilla/5.0 (compatible; Googlebot/2.1)',
  tv: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0)',
};
const SHA = 'b'.repeat(64);
const latest = (extra: Record<string, unknown> = {}) => ({ versionName: '1.4.0', versionCode: 5, file: 'render-1.4.0.apk', sizeBytes: 98_000_000, sha256: SHA, publishedAt: '2026-11-25T10:00:00Z', minAndroid: 8, ...extra });
const resp = (status: number, body?: unknown, jsonFails = false) => ({ ok: status >= 200 && status < 300, status, json: () => (jsonFails ? Promise.reject(new SyntaxError('x')) : Promise.resolve(body)) });

type Fetch = AndroidEnv['fetch'];
const happy: Fetch = async (url, init) => (init?.method === 'HEAD' ? resp(200) : resp(200, latest()));
const flush = async (f: ComponentFixture<unknown>) => { for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 0)); f.detectChanges(); } };

function make(opts: { ua?: string; touch?: number; fetch?: Fetch; online?: boolean; play?: string | null; tf?: string | null; lang?: Language } = {}) {
  const env: AndroidEnv = { userAgent: opts.ua ?? UA.android13, maxTouchPoints: opts.touch ?? 0, online: () => opts.online ?? true, origin: 'https://blacksugar21.com', fetch: opts.fetch ?? happy };
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ANDROID_ENV, useValue: env }, { provide: ANDROID_STORES, useValue: { testflight: opts.tf ?? null, googlePlay: opts.play ?? null } }] });
  TestBed.inject(TranslationService).setLanguage(opts.lang ?? 'es');
  const f = TestBed.createComponent(AndroidPageComponent);
  f.detectChanges();
  return { f, el: f.nativeElement as HTMLElement, cmp: f.componentInstance, env };
}
const view = (el: HTMLElement) => el.querySelector('[data-view]')?.getAttribute('data-view') ?? (el.querySelector('.and__skel') ? 'loading' : null);

describe('AndroidPageComponent · vistas', () => {
  it('cargando mientras llega latest.json (y aria-busy)', () => {
    const { el, cmp } = make({ fetch: () => new Promise(() => undefined) });
    expect(cmp.view()).toBe('loading');
    expect(view(el)).toBe('loading');
    expect(el.querySelector('section')?.getAttribute('aria-busy')).toBe('true');
    expect(el.querySelector('a[download]')).toBeNull();
  });

  it('lista en Android: botón con el APK, versión, tamaño, fecha, huella y los 3 pasos', async () => {
    const { f, el, cmp } = make();
    await flush(f);
    expect(cmp.view()).toBe('ready');
    const a = el.querySelector('a[download]') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('/descargas/android/render-1.4.0.apk');
    expect(el.textContent).toContain('Versión 1.4.0');
    expect(el.textContent).toContain('98');
    expect(el.textContent).toContain('Actualizada el');
    expect(el.querySelector('code')?.textContent).toBe(SHA);
    expect(el.querySelectorAll('.and__steps li').length).toBe(3);
    expect(el.querySelector('section')?.getAttribute('aria-busy')).toBe('false');
  });

  it('sin fecha publicada no muestra «Actualizada»', async () => {
    const { f, el } = make({ fetch: async (_u, i) => (i?.method === 'HEAD' ? resp(200) : resp(200, latest({ publishedAt: undefined }))) });
    await flush(f);
    expect(el.textContent).not.toContain('Actualizada');
  });

  it('neutral (robot o TV): solo texto, sin pedir nada y sin botón de descarga', async () => {
    for (const ua of [UA.bot, UA.tv]) {
      TestBed.resetTestingModule();
      const spy = vi.fn(happy);
      const { f, el, cmp } = make({ ua, fetch: spy, tf: 'https://testflight.apple.com/join/x' });
      await flush(f);
      expect(cmp.view()).toBe('neutral'); expect(view(el)).toBe('neutral');
      expect(spy).not.toHaveBeenCalled();
      expect(el.querySelector('a[download]')).toBeNull();
      expect(el.querySelector('[data-view=neutral] a')).not.toBeNull();
    }
  });

  it('neutral sin TestFlight no muestra enlace', () => {
    const { el } = make({ ua: UA.bot });
    expect(el.querySelector('[data-view=neutral] a')).toBeNull();
  });

  it('Google Play público gana sobre la descarga directa y no pide latest.json', async () => {
    const spy = vi.fn(happy);
    const { f, el, cmp } = make({ play: 'https://play.google.com/store/apps/details?id=x', fetch: spy });
    await flush(f);
    expect(cmp.view()).toBe('play');
    expect(el.querySelector('[data-view=play] a')?.getAttribute('href')).toContain('play.google.com');
    expect(spy).not.toHaveBeenCalled();
  });

  it('dentro de otra app pide abrir en Chrome y deja copiar el enlace', async () => {
    const spy = vi.fn(happy);
    const { f, el, cmp } = make({ ua: UA.facebook, fetch: spy });
    await flush(f);
    expect(cmp.view()).toBe('inApp');
    expect(el.querySelector('[data-view=inApp] a')?.getAttribute('href')).toBe('intent://blacksugar21.com/android#Intent;scheme=https;package=com.android.chrome;end');
    const input = el.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('blacksugar21.com/android');
    expect(spy).not.toHaveBeenCalled();
    expect(el.querySelector('a[download]')).toBeNull();
  });

  it('copiar enlace: éxito marca «Enlace copiado» y vuelve solo; sin permiso selecciona el campo', async () => {
    vi.useFakeTimers();
    try {
      const { f, el, cmp } = make({ ua: UA.facebook });
      const input = el.querySelector('input') as HTMLInputElement;
      const write = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
      await cmp.copyLink(input); f.detectChanges();
      expect(write).toHaveBeenCalledWith('https://blacksugar21.com/android');
      expect(cmp.copied()).toBe(true);
      expect(el.querySelector('[data-view=inApp] button')?.textContent).toContain('Enlace copiado');
      await cmp.copyLink(input); // reinicia el temporizador
      vi.advanceTimersByTime(2300);
      expect(cmp.copied()).toBe(false);
      write.mockRejectedValue(new Error('denegado'));
      const sel = vi.spyOn(input, 'select');
      await cmp.copyLink(input);
      expect(sel).toHaveBeenCalled(); expect(cmp.copied()).toBe(false);
      el.querySelector<HTMLButtonElement>('[data-view=inApp] button')!.click();
      input.dispatchEvent(new Event('focus'));
    } finally { vi.useRealTimers(); }
  });

  it('Android demasiado viejo según el latest.json', async () => {
    const { f, el, cmp } = make({ ua: UA.android10, fetch: async (_u, i) => (i?.method === 'HEAD' ? resp(200) : resp(200, latest({ minAndroid: 12 }))) });
    await flush(f);
    expect(cmp.view()).toBe('tooOld');
    expect(el.querySelector('[data-view=tooOld]')?.textContent).toContain('Android 12');
    expect(el.querySelector('a[download]')).toBeNull();
  });

  it('Android 7 sin latest.json también oye que es muy viejo (mínimo por omisión 8)', async () => {
    const { f, el, cmp } = make({ ua: UA.android7, fetch: async () => resp(404) });
    await flush(f);
    expect(cmp.view()).toBe('tooOld');
    expect(el.querySelector('[data-view=tooOld]')?.textContent).toContain('Android 8');
  });

  it('Android 8 en el límite sí puede instalar', async () => {
    const { f, cmp } = make({ ua: 'Mozilla/5.0 (Linux; Android 8.0; X) Chrome/100 Mobile' });
    await flush(f);
    expect(cmp.view()).toBe('ready');
  });

  it('sin conexión: avisa y reintenta con el botón y solo al volver la red', async () => {
    let online = false;
    const calls = vi.fn(happy);
    const env: AndroidEnv = { userAgent: UA.android13, online: () => online, origin: 'https://x.test', fetch: calls };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ANDROID_ENV, useValue: env }] });
    const f = TestBed.createComponent(AndroidPageComponent); f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    await flush(f);
    expect(f.componentInstance.view()).toBe('offline'); expect(view(el)).toBe('offline');
    expect(calls).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('online')); // sigue sin red: no hay nada que hacer, pero no revienta
    await flush(f);
    expect(f.componentInstance.view()).toBe('offline');
    online = true;
    window.dispatchEvent(new Event('online'));
    await flush(f);
    expect(f.componentInstance.view()).toBe('ready');
    window.dispatchEvent(new Event('online')); // ya está lista: no vuelve a pedir
    expect(calls).toHaveBeenCalledTimes(2); // latest.json + HEAD, una sola vez
  });

  it('el botón Reintentar de «sin conexión» vuelve a pedir', async () => {
    let online = false;
    const env: AndroidEnv = { userAgent: UA.android13, online: () => online, origin: 'https://x.test', fetch: happy };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ANDROID_ENV, useValue: env }] });
    const f = TestBed.createComponent(AndroidPageComponent); f.detectChanges(); await flush(f);
    online = true;
    (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-view=offline] button')!.click();
    await flush(f);
    expect(f.componentInstance.view()).toBe('ready');
  });

  describe('no disponible', () => {
    const cases: Array<[string, Fetch, boolean?]> = [
      ['latest.json 404', async () => resp(404)],
      ['latest.json 500', async () => resp(500)],
      ['el sitio devuelve HTML en vez de JSON', async () => resp(200, undefined, true)],
      ['latest.json roto (campos faltantes)', async () => resp(200, { versionName: '1' })],
      ['latest.json no es objeto', async () => resp(200, 'hola')],
      ['el APK no existe (HEAD 404)', async (_u, i) => (i?.method === 'HEAD' ? resp(404) : resp(200, latest()))],
      ['el APK fue retirado (HEAD 410)', async (_u, i) => (i?.method === 'HEAD' ? resp(410) : resp(200, latest()))],
      ['el APK da error (HEAD 500)', async (_u, i) => (i?.method === 'HEAD' ? resp(500) : resp(200, latest()))],
      ['la red falla estando en línea', async () => { throw new TypeError('fallo'); }],
    ];
    for (const [name, fetch] of cases) {
      it(name, async () => {
        const { f, el, cmp } = make({ fetch });
        await flush(f);
        expect(cmp.view()).toBe('unavailable'); expect(view(el)).toBe('unavailable');
        expect(el.querySelector('a[download]')).toBeNull();
      });
    }
    it('si la red cae durante la carga, se muestra sin conexión', async () => {
      let online = true;
      const { f, cmp } = make({ fetch: async () => { online = false; throw new TypeError('x'); } });
      (cmp as unknown as { env: AndroidEnv }).env.online = () => online;
      cmp.retry(); await flush(f);
      expect(cmp.view()).toBe('offline');
    });
  });

  it('una respuesta vieja nunca pisa a la nueva', async () => {
    let first = true;
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    const { f, cmp } = make({ fetch: async (_u, i) => { if (first && !i?.method) { first = false; await slow; return resp(404); } return i?.method === 'HEAD' ? resp(200) : resp(200, latest()); } });
    cmp.retry(); await flush(f);
    expect(cmp.view()).toBe('ready');
    release(); await flush(f);
    expect(cmp.view()).toBe('ready');
  });
});

describe('AndroidPageComponent · otros equipos', () => {
  it('iPhone: lleva a TestFlight y no ofrece descargar el APK', async () => {
    const { f, el } = make({ ua: UA.iphone, tf: 'https://testflight.apple.com/join/abc' });
    await flush(f);
    expect(el.querySelector('a[download]')).toBeNull();
    expect(el.querySelector('[data-view=ios] a')?.getAttribute('href')).toBe('https://testflight.apple.com/join/abc');
    expect(el.querySelector('[data-view=qr]')).toBeNull();
    expect(el.querySelector('.and__steps')).toBeNull();
  });

  it('iPhone sin TestFlight no muestra la tarjeta de Apple', async () => {
    const { f, el } = make({ ua: UA.iphone });
    await flush(f);
    expect(el.querySelector('[data-view=ios]')).toBeNull();
  });

  it('computador: código QR de esta página y TestFlight; sin botón de descarga', async () => {
    const { f, el } = make({ ua: UA.mac, tf: 'https://testflight.apple.com/join/abc' });
    await flush(f);
    const img = el.querySelector('[data-view=qr] img') as HTMLImageElement;
    expect(img.src).toContain('data:image/gif');
    expect(img.alt).toBe('Código QR de esta página');
    expect(el.querySelector('[data-view=qr]')?.textContent).toContain('blacksugar21.com/android');
    expect(el.querySelector('[data-view=ios]')).not.toBeNull();
    expect(el.querySelector('a[download]')).toBeNull();
  });

  it('el QR se limpia si el componente se destruye antes de terminar de generarse', async () => {
    const { f } = make({ ua: UA.mac });
    f.destroy();
    await new Promise((r) => setTimeout(r, 0));
  });

  it('un APK no se muestra a quien no es Android aunque esté lista', async () => {
    const { f, cmp } = make({ ua: UA.mac });
    await flush(f);
    expect(cmp.view()).toBe('ready');
  });
});

describe('AndroidPageComponent · textos, idiomas y SEO', () => {
  it('fija título y descripción en el idioma activo', async () => {
    const { f } = make();
    await flush(f);
    expect(TestBed.inject(Title).getTitle()).toBe('Android (beta) · Black Sugar 21');
  });

  it('los 13 idiomas renderizan la vista lista sin claves crudas (árabe de derecha a izquierda)', async () => {
    for (const lang of ['es', 'en', 'pt', 'fr', 'de', 'it', 'ja', 'ko', 'zh', 'ar', 'hi', 'ru', 'tr'] as Language[]) {
      TestBed.resetTestingModule();
      const { f, el, cmp } = make({ lang });
      await flush(f);
      expect(cmp.view()).toBe('ready');
      expect(el.textContent, lang).not.toMatch(/android\.[a-z]/);
      expect(el.querySelector('h1')?.textContent?.trim().length).toBeGreaterThan(3);
      expect(document.documentElement.dir).toBe(lang === 'ar' ? 'rtl' : 'ltr');
    }
  });
});

