import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { UiSkeletonComponent } from '../atoms/ui-skeleton.component';

/**
 * MOLECULE · Skeleton row — a session-history loading row (icon dot + title + subtitle bars).
 * Composes the Skeleton atom. Homologated with the iOS/Android session-history skeletons.
 */
@Component({
  selector: 'ui-skeleton-row',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiSkeletonComponent],
  template: `
    <div class="row" aria-hidden="true">
      <ui-skeleton width="16px" height="16px" [circle]="true"></ui-skeleton>
      <div class="lines">
        <ui-skeleton width="70%" height="12px"></ui-skeleton>
        <ui-skeleton width="45%" height="10px"></ui-skeleton>
      </div>
    </div>
  `,
  styles: [`
    .row { display: flex; align-items: center; gap: 10px; padding: 10px 4px; }
    .lines { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  `],
})
export class UiSkeletonRowComponent {}
