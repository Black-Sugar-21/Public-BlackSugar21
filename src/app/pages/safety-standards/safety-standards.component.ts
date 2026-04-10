import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../translation.service';
import { RouterModule } from '@angular/router';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-safety-standards',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './safety-standards.component.html',
  styleUrls: ['./safety-standards.component.css']
})
export class SafetyStandardsComponent implements OnInit {
  constructor(public translate: TranslationService, private seo: SeoService) {}

  ngOnInit(): void {
    this.seo.update({
      title: 'Estándares de Seguridad',
      description: 'Estándares de seguridad infantil y protección de menores de Black Sugar 21. Compromiso con la seguridad.',
      url: '/safety-standards'
    });
  }

  t(key: string): string {
    return this.translate.translate(key);
  }
}
