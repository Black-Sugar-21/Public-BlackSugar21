import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../translation.service';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-moderation-policy',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './moderation-policy.component.html',
  styleUrls: ['./moderation-policy.component.css']
})
export class ModerationPolicyComponent implements OnInit {
  constructor(public translationService: TranslationService, private seo: SeoService) {}

  ngOnInit(): void {
    this.seo.update({
      title: 'Políticas de Moderación',
      description: 'Políticas de moderación de contenido de Black Sugar 21. IA y revisión humana para una comunidad segura.',
      url: '/moderation-policy'
    });
  }

  t(key: string): string {
    return this.translationService.translate(key);
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
