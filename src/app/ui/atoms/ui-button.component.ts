import { Component, Input, HostBinding, ChangeDetectionStrategy } from '@angular/core';
import { NgClass } from '@angular/common';

/**
 * ATOM · Button — single source of truth for tappable actions.
 * variant: primary (gold gradient) · outline (gold border) · ghost (gold text) · secondary (neutral border).
 * shape:   pill (default) · rect (radius 10).  size: sm · md.  block → flex:1/full width.
 * Renders an <a target=_blank> when `href` is set (external link), else a <button>.
 * Tokens only, ≥44px touch (md), reduced-motion safe — cross-device/browser.
 */
@Component({
  selector: 'ui-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass],
  template: `
    @if (href) {
      <a class="ui-btn" [ngClass]="cls" [href]="href"
         [attr.target]="external ? '_blank' : null" [attr.rel]="external ? 'noopener' : null"
         [attr.aria-label]="ariaLabel || null"><ng-content></ng-content></a>
    } @else {
      <button class="ui-btn" [ngClass]="cls" [attr.type]="type" [disabled]="disabled"
              [attr.aria-label]="ariaLabel || null"><ng-content></ng-content></button>
    }
  `,
  styles: [`
    :host { display: inline-block; }
    :host(.block) { display: block; flex: 1 1 0; width: 100%; }
    .ui-btn {
      -webkit-appearance: none; appearance: none;
      font-family: 'Outfit', system-ui, sans-serif;
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      width: 100%;
      min-height: 44px; padding: 0 18px; border-radius: 999px;
      font-size: 14px; font-weight: 600; line-height: 1; cursor: pointer; text-decoration: none;
      border: 1px solid transparent; box-sizing: border-box;
      transition: transform .16s ease, filter .16s ease, background .16s ease, border-color .16s ease;
      -webkit-tap-highlight-color: transparent; touch-action: manipulation; user-select: none;
    }
    :host(:not(.block)) .ui-btn { width: auto; }
    .ui-btn:active { transform: scale(0.98); }
    .ui-btn:disabled { opacity: .5; cursor: not-allowed; }
    .s-sm { min-height: 34px; padding: 0 12px; font-size: 12.5px; }
    .shape-rect { border-radius: 10px; }
    .v-primary { background: var(--gradient-gold); color: #1A1206; font-weight: 700; }
    .v-primary:hover:not(:disabled) { filter: brightness(1.05); }
    .v-outline { background: transparent; color: var(--gold); border-color: rgba(212,175,55,.5); }
    .v-outline:hover:not(:disabled) { border-color: var(--gold); background: rgba(212,175,55,.08); }
    .v-ghost { background: transparent; color: var(--gold); }
    .v-ghost:hover:not(:disabled) { background: rgba(212,175,55,.08); }
    .v-secondary { background: rgba(255,255,255,.04); color: var(--text-primary); border-color: rgba(255,255,255,.14); }
    .v-secondary:hover:not(:disabled) { border-color: var(--gold); }
    @media (prefers-reduced-motion: reduce) { .ui-btn { transition: none; } .ui-btn:active { transform: none; } }
  `],
})
export class UiButtonComponent {
  @Input() variant: 'primary' | 'outline' | 'ghost' | 'secondary' = 'primary';
  @Input() size: 'sm' | 'md' = 'md';
  @Input() shape: 'pill' | 'rect' = 'pill';
  @Input() type: 'button' | 'submit' = 'button';
  @Input() href = '';
  @Input() external = true;
  @Input() disabled = false;
  @Input() block = false;
  @Input() ariaLabel = '';

  @HostBinding('class.block') get hostBlock() { return this.block; }

  get cls() {
    return {
      ['v-' + this.variant]: true,
      ['s-' + this.size]: true,
      ['shape-' + this.shape]: true,
    };
  }
}
