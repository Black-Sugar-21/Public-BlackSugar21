import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

/**
 * ATOM · Skeleton — a single shimmer placeholder bar. The building block for all loading
 * states (session-history rows, the card-preview skeleton) — homologated with iOS/Android.
 * Respects prefers-reduced-motion (no animation). Width/height/radius are inputs.
 */
@Component({
  selector: 'ui-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="ui-skel" [class.circle]="circle"
    [style.width]="width" [style.height]="height" [style.borderRadius]="circle ? '50%' : radius"
    aria-hidden="true"></span>`,
  styles: [`
    :host { display: block; }
    .ui-skel {
      display: block;
      background: linear-gradient(90deg, var(--skeleton-base) 25%, var(--skeleton-sheen) 37%, var(--skeleton-base) 63%);
      background-size: 400% 100%;
      animation: uiSkelShimmer 1.4s ease infinite;
    }
    @keyframes uiSkelShimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
    @media (prefers-reduced-motion: reduce) { .ui-skel { animation: none; } }
  `],
})
export class UiSkeletonComponent {
  @Input() width = '100%';
  @Input() height = '12px';
  @Input() radius = '6px';
  @Input() circle = false;
}
