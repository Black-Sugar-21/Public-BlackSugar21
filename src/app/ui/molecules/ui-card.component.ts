import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

/**
 * MOLECULE · Card — an elegant bordered surface (place cards, sheets). Mirrors the
 * cross-platform .cw-place: subtle border by default; `highlighted` (selected/best) glows gold;
 * `best` adds the ✦ corner badge. Composes atoms inside via <ng-content>.
 */
@Component({
  selector: 'ui-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ui-card" [class.hl]="highlighted || best" [class.best]="best">
      <ng-content></ng-content>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .ui-card {
      position: relative; display: block; box-sizing: border-box;
      background: var(--card-bg);
      border: 1px solid var(--border-subtle); border-radius: 16px; padding: 14px 15px;
      transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease;
    }
    .ui-card.hl {
      border-color: rgba(212,175,55,.5);
      background: linear-gradient(180deg, rgba(212,175,55,.09), var(--card-bg));
      box-shadow: 0 6px 20px rgba(212,175,55,.10);
    }
    .ui-card.best::before {
      content: '✦'; position: absolute; top: -9px; left: 14px;
      width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
      font-size: 12px; color: var(--bg-dark); background: var(--gradient-gold);
      border-radius: 50%; box-shadow: 0 2px 6px rgba(212,175,55,.5);
    }
    @media (prefers-reduced-motion: reduce) { .ui-card { transition: none; } }
  `],
})
export class UiCardComponent {
  @Input() highlighted = false;
  @Input() best = false;
}
