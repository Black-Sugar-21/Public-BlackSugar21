import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

/**
 * ATOM · Badge — the gold "fit %" capsule ("94% ✦") shared with iOS/Android (.cw-fit parity).
 */
@Component({
  selector: 'ui-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="ui-badge"><ng-content></ng-content></span>`,
  styles: [`
    :host { display: inline-flex; }
    .ui-badge {
      display: inline-flex; align-items: center; gap: 3px;
      font-family: 'Outfit', system-ui, sans-serif;
      color: var(--gold); font-size: 11px; font-weight: 800; line-height: 1; white-space: nowrap;
      background: rgba(212,175,55,.14); border: 1px solid rgba(212,175,55,.34);
      border-radius: 999px; padding: 3px 9px; box-sizing: border-box;
    }
  `],
})
export class UiBadgeComponent {}
