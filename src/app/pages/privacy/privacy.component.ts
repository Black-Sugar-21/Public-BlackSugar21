import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../translation.service';
import { RouterModule } from '@angular/router';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './privacy.component.html',
  styleUrls: ['./privacy.component.css']
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

  t(key: string): string {
    return this.translate.translate(key);
  }
}
