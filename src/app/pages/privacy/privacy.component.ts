import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../translation.service';
import { RouterModule } from '@angular/router';
import { SeoService } from '../../services/seo.service';
import { ANALYTICS_CONSENT_TEXT } from './analytics-consent-text';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './privacy.component.html',
  styleUrls: ['./privacy.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PrivacyComponent implements OnInit {
  constructor(public translate: TranslationService, private seo: SeoService) {}

  ngOnInit(): void {
    this.seo.update({
      title: 'Política de Privacidad',
      description: 'Política de privacidad de Black Sugar 21. Cómo protegemos tus datos personales y tu información.',
      url: '/privacy'
    });
  }

  /** Párrafo de analítica con consentimiento, en el idioma activo. */
  analyticsConsent(): string {
    return ANALYTICS_CONSENT_TEXT[this.translate.currentLanguage()] ?? ANALYTICS_CONSENT_TEXT.es;
  }

  t(key: string): string {
    return this.translate.translate(key);
  }
}
