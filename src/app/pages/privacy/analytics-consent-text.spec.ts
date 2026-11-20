import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LANGUAGES, TranslationService } from '../../translation.service';
import { ANALYTICS_CONSENT_TEXT } from './analytics-consent-text';
import { PrivacyComponent } from './privacy.component';

describe('párrafo de analítica de la política de privacidad', () => {
  it('está completo en los 13 idiomas, con el correo de contacto y sin publicidad ni datos personales', () => {
    expect(Object.keys(ANALYTICS_CONSENT_TEXT).sort()).toEqual(LANGUAGES.map((l) => l.code).sort());
    for (const text of Object.values(ANALYTICS_CONSENT_TEXT)) {
      expect(text.length).toBeGreaterThan(100);
      expect(text).toContain('hello@blacksugar21.com');
      expect(text).toContain('Google');
    }
  });
  it('la página muestra el párrafo en el idioma activo (y español si no hay)', async () => {
    await TestBed.configureTestingModule({ imports: [PrivacyComponent], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(PrivacyComponent);
    const tr = TestBed.inject(TranslationService);
    tr.setLanguage('en');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('#analitica')?.textContent).toContain('If you accept');
    expect(fixture.componentInstance.analyticsConsent()).toBe(ANALYTICS_CONSENT_TEXT.en);
    tr.currentLanguage.set('xx' as never);
    expect(fixture.componentInstance.analyticsConsent()).toBe(ANALYTICS_CONSENT_TEXT.es);
  });
});
