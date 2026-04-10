import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../translation.service';
import { RouterModule } from '@angular/router';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-features',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './features.component.html',
  styleUrls: ['./features.component.css']
})
export class FeaturesComponent implements OnInit {
  constructor(public translate: TranslationService, private seo: SeoService) {}

  ngOnInit() {
    this.seo.update({
      title: 'AI Features - Black Sugar 21',
      description: 'Descubre las funciones de inteligencia artificial de Black Sugar 21: Coach personal IA, sugerencias de citas, icebreakers inteligentes y moderación automática.',
      url: '/features',
    });
  }

  t(key: string): string {
    return this.translate.translate(key);
  }

  changeLanguage(event: Event) {
    const lang = (event.target as HTMLSelectElement).value as any;
    this.translate.setLanguage(lang);
  }
}
