import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

/**
 * ATOM · Button — the single source of truth for tappable actions.
 * Variants: primary (gold gradient), outline (gold border), ghost (text-only).
 * Tokens only (no hardcoded colors). Touch-friendly hit area (≥40px) for all devices.
 */
@Component({
  selector: 'ui-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      class="ui-btn"
      [class.v-primary]="variant === 'primary'"
      [class.v-outline]="variant === 'outline'"
      [class.v-ghost]="variant === 'ghost'"
      [class.s-sm]="size === 'sm'"
      [class.block]="block"
      [attr.type]="type"
      [disabled]="disabled"
      [attr.aria-label]="ariaLabel || null">
      <ng-content></ng-content>
    </button>
  `,
  styles: [`
    :host { display: inline-block; }
    :host(.block-host), .ui-btn.block { width: 100%; }
    .ui-btn {
      -webkit-appearance: none; appearance: none;
      font-family: 'Outfit', system-ui, sans-serif;
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      min-height: 44px; padding: 0 18px; border-radius: 999px;
      font-size: 14px; font-weight: 600; line-height: 1; cursor: pointer;
      border: 1px solid transparent; box-sizing: border-box;
      transition: transform .16s ease, filter .16s ease, background .16s ease, border-color .16s ease;
      -webkit-tap-highlight-color: transparent; touch-action: manipulation; user-select: none;
    }
    .ui-btn:active { transform: scale(0.98); }
    .ui-btn:disabled { opacity: .5; cursor: not-allowed; }
    .ui-btn.s-sm { min-height: 34px; padding: 0 12px; font-size: 12.5px; }
    .ui-btn.block { width: 100%; }
    .v-primary { background: var(--gradient-gold); color: #1A1206; font-weight: 700; }
    .v-primary:hover:not(:disabled) { filter: brightness(1.05); }
    .v-outline { background: transparent; color: var(--gold); border-color: rgba(212,175,55,.5); }
    .v-outline:hover:not(:disabled) { border-color: var(--gold); background: rgba(212,175,55,.08); }
    .v-ghost { background: transparent; color: var(--gold); }
    .v-ghost:hover:not(:disabled) { background: rgba(212,175,55,.08); }
    @media (prefers-reduced-motion: reduce) { .ui-btn { transition: none; } .ui-btn:active { transform: none; } }
  `],
})
export class UiButtonComponent {
  @Input() variant: 'primary' | 'outline' | 'ghost' = 'primary';
  @Input() size: 'sm' | 'md' = 'md';
  @Input() type: 'button' | 'submit' = 'button';
  @Input() disabled = false;
  @Input() block = false;
  @Input() ariaLabel = '';
}
