import { Component, Inject, OnDestroy, PLATFORM_ID, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser, Location } from '@angular/common';
import { Router } from '@angular/router';
import { CoachWidgetComponent } from './coach-widget.component';

/**
 * Dedicated FULLSCREEN coach view for mobile — the `/coach` route. Reuses the existing coach widget
 * in `embedded` mode (the widget is NOT modified). Being a real page means:
 *   • nothing renders behind it → no page peeking under the keyboard,
 *   • the OS back gesture / button closes it (history.back) and returns to the previous view.
 * The page sizes itself to the EXACT visible viewport (visualViewport) so the embedded widget's
 * composer always sits above the on-screen keyboard.
 */
@Component({
  selector: 'app-coach-page',
  standalone: true,
  imports: [CommonModule, CoachWidgetComponent],
  templateUrl: './coach-page.component.html',
  styleUrls: ['./coach-page.component.scss'],
})
export class CoachPageComponent implements OnDestroy {
  readonly isBrowser: boolean;
  /** Visible-viewport rectangle (top = offsetTop, height) — keeps the composer above the keyboard. */
  readonly rect = signal<{ top: number; height: number } | null>(null);
  private vvHandler = () => {
    const vv: any = (window as any).visualViewport;
    if (vv) this.rect.set({ top: Math.round(vv.offsetTop), height: Math.round(vv.height) });
  };
  /** This fullscreen page is MOBILE-ONLY — on desktop the coach is the floating widget card, so send
   *  desktop (or a resize-to-desktop) back to '/' where the widget renders. */
  private guardDesktop = () => { if (this.isBrowser && window.innerWidth > 600) this.router.navigate(['/']); };

  constructor(@Inject(PLATFORM_ID) platformId: object, private location: Location, private router: Router) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser) {
      this.guardDesktop();
      window.addEventListener('resize', this.guardDesktop);
      const vv: any = (window as any).visualViewport;
      if (vv) { vv.addEventListener('resize', this.vvHandler); vv.addEventListener('scroll', this.vvHandler); this.vvHandler(); }
    }
  }

  back() { this.location.back(); }

  ngOnDestroy() {
    const vv: any = this.isBrowser ? (window as any).visualViewport : null;
    if (vv) { vv.removeEventListener('resize', this.vvHandler); vv.removeEventListener('scroll', this.vvHandler); }
    if (this.isBrowser) window.removeEventListener('resize', this.guardDesktop);
  }
}
