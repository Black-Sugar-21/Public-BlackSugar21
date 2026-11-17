import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { FirebaseService } from './firebase.service';

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
});
