import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../translation.service';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-data-deletion',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './data-deletion.component.html',
  styleUrls: ['./data-deletion.component.css']
})
export class DataDeletionComponent {
  constructor(public translate: TranslationService) {}

  t(key: string): string {
    return this.translate.translate(key);
  }
}
