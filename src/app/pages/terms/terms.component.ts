import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../translation.service';
import { RouterModule } from '@angular/router';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './terms.component.html',
  styleUrls: ['./terms.component.css']
})
export class TermsComponent implements OnInit {
  constructor(public translate: TranslationService, private seo: SeoService) {}

  ngOnInit(): void {
    this.seo.update({
      title: 'Términos de Uso',
      description: 'Términos y condiciones de uso de Black Sugar 21. Lee nuestras políticas antes de usar la app.',
      url: '/terms'
    });
  }

  t(key: string): string {
    return this.translate.translate(key);
  }
}
