import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../translation.service';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-safety-standards',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './safety-standards.component.html',
  styleUrls: ['./safety-standards.component.css']
})
export class SafetyStandardsComponent {
  constructor(public translate: TranslationService) {}

  t(key: string): string {
    return this.translate.translate(key);
  }
}
