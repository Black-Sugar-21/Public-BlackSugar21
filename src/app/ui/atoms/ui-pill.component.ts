import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

/**
 * ATOM · Pill — a small rounded tag/chip used for perspectives, place actions, filters.
 * Tints mirror the cross-platform language: gold (maps), neutral (web), instagram (pink),
 * purple (perspective). Renders as <a> when href is set (opens in a new tab), else a span/button.
 */
@Component({
  selector: 'ui-pill',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Single element + single <ng-content>: two ng-content slots across @if/@else branches
         dropped the projected label when href was set (Web/Instagram pills rendered empty). -->
    <a class="ui-pill" [class]="'t-' + tint" [class.clickable]="clickable || !!href"
       [attr.href]="href || null" [attr.target]="href ? '_blank' : null" [attr.rel]="href ? 'noopener' : null"
       (click)="onClick($event)"><ng-content></ng-content></a>
  `,
  styles: [`
    :host { display: inline-flex; }
    .ui-pill {
      display: inline-flex; align-items: center; gap: 4px;
      font-family: 'Outfit', system-ui, sans-serif;
      font-size: 11.5px; font-weight: 700; line-height: 1;
      padding: 5px 11px; border-radius: 999px; text-decoration: none;
      border: 1px solid var(--border-mid); white-space: nowrap; box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
    }
    .ui-pill.clickable, a.ui-pill { cursor: pointer; }
    .t-gold { color: var(--gold); background: rgba(212,175,55,.12); border-color: rgba(212,175,55,.34); }
    .t-neutral { color: var(--text-primary); }
    .t-neutral:hover { border-color: var(--gold); color: var(--gold); }
    .t-instagram { color: var(--instagram-pink); border-color: rgba(228,64,95,.4); }
    .t-instagram:hover { background: rgba(228,64,95,.12); }
    .t-purple { color: var(--purple-light); border-color: rgba(156,89,234,.35); border-radius: 6px; font-size: 10px; padding: 1px 7px; }
  `],
})
export class UiPillComponent {
  @Input() tint: 'gold' | 'neutral' | 'instagram' | 'purple' = 'neutral';
  @Input() href = '';
  @Input() clickable = false;
  /** When a link, stop the click from bubbling to a parent card handler. */
  onClick(e: Event) { if (this.href) e.stopPropagation(); }
}
