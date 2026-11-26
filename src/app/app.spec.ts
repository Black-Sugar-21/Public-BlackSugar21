import { ANDROID_REQUEST_URL, ANDROID_SITE_MODE } from './pages/android/android-mode';
import { TranslationService } from './translation.service';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { FirebaseService } from './firebase.service';
import { ANALYTICS_ID, AnalyticsService } from './analytics.service';
import { closeBanner } from './analytics/consent-banner';

/** Sin red: la descarga del SDK nunca termina, así la prueba no inicializa Firebase de verdad. */
class OfflineFirebase extends FirebaseService {
  protected override loadCore(): Promise<never> { return new Promise<never>(() => {}); }
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: any) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: FirebaseService, useClass: OfflineFirebase }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Your Personal AI Coach.');
  });

  it('la tarjeta de la beta lleva el logo a la izquierda y el texto en dos líneas (plataforma y canal) en cada botón', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const btns = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.tfcard a.tfcard-cta'));
    expect(btns.length).toBeGreaterThan(0);
    for (const b of btns) {
      expect(b.firstElementChild?.tagName.toLowerCase()).toBe('svg');
      expect(b.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
      expect(b.querySelector('.tfcard-cta__txt strong')?.textContent?.trim()).toBeTruthy();
      expect(b.querySelector('.tfcard-cta__txt small')?.textContent?.trim()).toBeTruthy();
      expect(b.textContent).not.toMatch(/beta\.btn_/);
    }
  });

  it('Android por defecto («solicitud»): los tres botones dicen «Pide acceso», escriben por correo y no hay /android ni .apk', async () => {
    TestBed.inject(TranslationService).setLanguage('es');
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const btns = Array.from(el.querySelectorAll<HTMLAnchorElement>('a[data-test="beta-android"]'));
    expect(btns.length).toBe(3);
    for (const b of btns) {
      expect(b.getAttribute('href')).toBe(ANDROID_REQUEST_URL);
      expect(b.querySelector('strong')?.textContent?.trim()).toBe('Android');
      expect(b.querySelector('small')?.textContent?.trim()).toBe('Pide acceso');
    }
    expect(el.querySelector('a[href="/android"], a[href*=".apk"]')).toBeNull();
    expect(el.textContent).not.toContain('descarga directa');
  });

  it('Android con «descarga»: los tres botones vuelven a /android', async () => {
    TestBed.overrideProvider(ANDROID_SITE_MODE, { useValue: 'descarga' });
    TestBed.inject(TranslationService).setLanguage('es');
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('a[href="/android"]').length).toBe(3);
    expect(el.querySelector(`a[href="${ANDROID_REQUEST_URL}"]`)).toBeNull();
    expect(el.querySelector('.tfcard a[href="/android"] small')?.textContent?.trim()).toBe('Descarga directa');
  });

  it('subpáginas: no dibujan la portada ni su h1 (un solo h1 por página)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('h1').length).toBe(1);
    (fixture.componentInstance as any).currentUrl.set('/terms');
    fixture.detectChanges();
    expect(root.querySelectorAll('h1').length).toBe(0);
    expect(fixture.componentInstance.isHomeRoute()).toBe(false);
  });

  it('en /android el botón flotante del Coach no se dibuja (no tapa la descarga)', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as any;
    app.currentUrl.set('/terms');
    expect(app.showCoachWidget()).toBe(true);
    app.currentUrl.set('/android');
    expect(app.showCoachWidget()).toBe(false);
  });

  it('detecta la edad legal solo cuando Firebase está en reposo (diferido)', async () => {
    const fb = TestBed.inject(FirebaseService) as OfflineFirebase;
    let release!: () => void;
    vi.spyOn(fb, 'whenIdle').mockReturnValue(new Promise<void>((r) => (release = r)));
    const fixture = TestBed.createComponent(App);
    const spy = vi.spyOn(fixture.componentInstance as any, 'detectAndSetLegalAge').mockResolvedValue(undefined);
    fixture.componentInstance.ngOnInit();
    expect(spy).not.toHaveBeenCalled();
    release();
    await Promise.resolve();
    await Promise.resolve();
    expect(spy).toHaveBeenCalled();
  });
});

describe('App con la analítica encendida', () => {
  beforeEach(async () => {
    // Escuchas de otras pruebas que nunca vieron una interacción: se vacían antes de empezar (el aviso espera a la primera interacción).
    dispatchEvent(new Event('pointerdown'));
    await new Promise((r) => setTimeout(r, 150)); // los avisos que esas escuchas arman son asíncronos: se esperan antes de limpiar
    localStorage.clear(); document.body.querySelectorAll('[data-analytics-banner]').forEach((n) => n.remove()); closeBanner();
    delete (window as any).dataLayer;
    (window as any).IntersectionObserver ??= class { observe() {} unobserve() {} disconnect() {} };
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: FirebaseService, useClass: OfflineFirebase }, { provide: ANALYTICS_ID, useValue: 'G-TEST123456' }],
    }).compileComponents();
  });
  afterEach(() => { closeBanner(); localStorage.clear(); });

  it('muestra el aviso (oscuro), el enlace «Preferencias de privacidad» del pie en el idioma activo y no manda nada sin aceptar', async () => {
    await Promise.all([import('./analytics/web-analytics'), import('./analytics/consent-banner'), import('./analytics-events')]);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelector('[data-analytics-banner]')).toBeNull(); // no se pinta al cargar: espera a la primera interacción
    dispatchEvent(new Event('pointerdown'));
    await vi.waitFor(() => expect(document.querySelector('[data-analytics-banner]')).not.toBeNull(), { timeout: 3000 });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const btn = el.querySelector('.footer-prefs') as HTMLButtonElement;
    expect(btn.textContent).toContain((fixture.componentInstance as any).prefsLabel());
    closeBanner(); document.querySelectorAll('[data-analytics-banner]').forEach((n) => n.remove());
    btn.click();
    expect(document.querySelector('[data-analytics-banner]')).not.toBeNull();
    expect((window as any).dataLayer).toBeUndefined();
  }, 20000);

  it('cambiar de idioma se cuenta como language_change (solo el código del idioma)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const spy = vi.spyOn(TestBed.inject(AnalyticsService), 'trackEvent');
    await (fixture.componentInstance as any).selectLanguage('en');
    expect(spy).toHaveBeenCalledWith('language_change', { language: 'en' });
  });
});
