import { DestroyRef, Directive, ElementRef, afterNextRender, inject, input } from '@angular/core';

/** The slice of lottie-web's API this directive uses (the light build exposes `window.lottie`). */
interface LottieAnimation {
  totalFrames: number;
  play(): void;
  pause(): void;
  destroy(): void;
  goToAndStop(frame: number, isFrame: boolean): void;
  addEventListener(name: string, cb: () => void): void;
}
interface LottiePlayer { loadAnimation(options: Record<string, unknown>): LottieAnimation; }

/** lottie-web 5.13.0 light build (MIT, SVG renderer only), vendored under public/vendor — see NOTICE. */
export const LOTTIE_LIB_URL = 'vendor/lottie_light-5.13.0.min.js';

let player: Promise<LottiePlayer | null> | null = null;

/** Loads the player once for the whole page; resolves null if it cannot load (the static poster then stays). */
export function loadLottiePlayer(doc: Document = document): Promise<LottiePlayer | null> {
  const win = doc.defaultView as (Window & { lottie?: LottiePlayer }) | null;
  if (win?.lottie) return Promise.resolve(win.lottie);
  player ??= new Promise((resolve) => {
    const script = doc.createElement('script');
    script.src = LOTTIE_LIB_URL;
    script.async = true;
    script.onload = () => resolve(win?.lottie ?? null);
    script.onerror = () => { player = null; resolve(null); };
    doc.head.appendChild(script);
  });
  return player;
}

/** Test seam: forget the cached player. */
export function resetLottiePlayerForTests(): void { player = null; }

/**
 * `<span appLottie="lottie/step-rec.json" [lottieLoop]="true"></span>` — a decorative Lottie that never competes with
 * the first paint: nothing is fetched until the page has loaded and the browser is idle, and then only when the
 * element comes near the viewport. It plays while visible and pauses off-screen or in a hidden tab. With reduced
 * motion it shows the last frame (every animation here ends on a calm, readable frame) and never plays.
 * SSR: nothing runs on the server (afterNextRender is browser-only; the destroy hook is guarded).
 * When the animation is ready the PARENT gets `.lottie-ready`, so a static poster (icon/mark) next to it can fade out.
 */
@Directive({ selector: '[appLottie]', host: { 'aria-hidden': 'true', class: 'lottie' } })
export class LottieDirective {
  readonly src = input.required<string>({ alias: 'appLottie' });
  readonly loop = input(false, { alias: 'lottieLoop' });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private anim: LottieAnimation | null = null;
  private near: IntersectionObserver | null = null;
  private seen: IntersectionObserver | null = null;
  private destroyed = false;
  private visible = false;
  private readonly onVisibility = () => this.sync();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.near?.disconnect();
      this.seen?.disconnect();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);  // SSR-safe
      this.anim?.destroy();
      this.anim = null;
    });
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') return;
      const start = () => {
        if (this.destroyed) return;
        this.near = new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting)) { this.near?.disconnect(); this.near = null; void this.mount(); }
        }, { rootMargin: '150px 0px' });
        this.near.observe(this.host);
      };
      const idle = () => ('requestIdleCallback' in window ? requestIdleCallback(start, { timeout: 2500 }) : setTimeout(start, 1200));
      if (document.readyState === 'complete') idle(); else addEventListener('load', idle, { once: true });
    });
  }

  private async mount(): Promise<void> {
    const lib = await loadLottiePlayer();
    if (!lib || this.destroyed) return;
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const anim = lib.loadAnimation({
      container: this.host, renderer: 'svg', loop: this.loop() && !reduce, autoplay: false, path: this.src(),
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true },
    });
    this.anim = anim;
    anim.addEventListener('DOMLoaded', () => {
      if (this.destroyed) return;
      this.host.parentElement?.classList.add('lottie-ready');
      if (reduce) { anim.goToAndStop(anim.totalFrames - 1, true); return; }
      this.seen = new IntersectionObserver((entries) => { this.visible = entries.some((e) => e.isIntersecting); this.sync(); }, { threshold: 0.2 });
      this.seen.observe(this.host);
      document.addEventListener('visibilitychange', this.onVisibility);
    });
  }

  private sync(): void {
    if (!this.anim) return;
    if (this.visible && !document.hidden) this.anim.play(); else this.anim.pause();
  }
}
