import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../translation.service';
import { RouterModule } from '@angular/router';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-data-deletion',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './data-deletion.component.html',
  styleUrls: ['./data-deletion.component.css']
})
export class DataDeletionComponent implements OnInit {
  constructor(public translate: TranslationService, private seo: SeoService) {}

  ngOnInit(): void {
    this.seo.update({
      title: 'Eliminación de Datos',
      description: 'Solicita la eliminación de tus datos personales de Black Sugar 21. Cumplimiento GDPR y derecho al olvido.',
      url: '/data-deletion'
    });
  }

  t(key: string): string {
    return this.translate.translate(key);
  }
}
