import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../translation.service';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-features',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './features.component.html',
  styleUrls: ['./features.component.css']
})
export class FeaturesComponent {
  constructor(public translate: TranslationService) {}

  t(key: string): string {
    return this.translate.translate(key);
  }

  changeLanguage(event: Event) {
    const lang = (event.target as HTMLSelectElement).value as any;
    this.translate.setLanguage(lang);
  }
}
