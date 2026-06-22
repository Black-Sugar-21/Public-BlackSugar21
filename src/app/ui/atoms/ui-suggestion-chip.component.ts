import { Component, ChangeDetectionStrategy, Output, EventEmitter } from '@angular/core';

/**
 * ATOM · Suggestion chip — a full-width, tappable, multi-line card for AI suggestions (Coach
 * icebreakers, smart replies). Gold-tinted, left-aligned text that wraps. Emits (picked) on tap.
 * Project the suggestion text via <ng-content>.
 */
@Component({
  selector: 'ui-suggestion-chip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button type="button" class="sc" (click)="picked.emit()"><ng-content></ng-content></button>`,
  styles: [`
    :host { display: block; }
    .sc {
      width: 100%; display: block; text-align: left;
      padding: 12px 14px; border-radius: 14px;
      border: 1px solid rgba(212,175,55,.30); background: rgba(212,175,55,.07);
      color: var(--text-primary); font-family: 'Outfit', system-ui, sans-serif;
      font-size: 14px; line-height: 1.4; cursor: pointer;
      transition: background .15s ease, border-color .15s ease, transform .12s ease;
      -webkit-tap-highlight-color: transparent;
    }
    .sc:hover { background: rgba(212,175,55,.14); border-color: var(--gold); }
    .sc:active { transform: scale(.99); }
  `],
})
export class UiSuggestionChipComponent {
  @Output() picked = new EventEmitter<void>();
}
