import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationService } from '../../translation.service';
import { SeoService } from '../../services/seo.service';
import { ANDROID_ENV, ANDROID_STORES } from './android-env';
import {
  AndroidRelease, DEFAULT_DOWNLOADS_PATH, DEFAULT_MIN_ANDROID, androidApkUrl, androidLatestUrl, formatApkSize, formatPublished, parseAndroidRelease,
} from './android-release.util';
import { androidTooOld, chromeIntentUrl, isComputer, readVisitor } from './android-visitor.util';

type ReleaseState =
  | { readonly status: 'idle' | 'loading' | 'missing' | 'error' | 'offline' }
  | { readonly status: 'ready'; readonly release: AndroidRelease };

/**
 * Lo que muestra la página:
 * - `neutral`: robots, TV, KaiOS… solo texto y enlaces, nunca un botón de descarga;
 * - `play`: Google Play ya es público y gana sobre la descarga directa;
 * - `inApp`: Android dentro de otra app (las descargas suelen fallar) → abrir en Chrome;
 * - `tooOld`: Android menor al mínimo de la app;
 * - `offline` / `unavailable`: sin conexión, o `latest.json`/el APK faltan o no se leen;
 * - `ready`: hay versión publicada y su APK existe.
 */
export type AndroidPageView = 'loading' | 'neutral' | 'play' | 'inApp' | 'tooOld' | 'offline' | 'unavailable' | 'ready';

const COPIED_MS = 2200;

/** `/android` — descarga directa del APK de prueba que sirve este mismo sitio desde `/descargas/android/`. */
@Component({
  selector: 'app-android-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './android-page.component.html',
  styleUrl: './android-page.component.css',
})
export class AndroidPageComponent {
  private readonly env = inject(ANDROID_ENV);
  private readonly translate = inject(TranslationService);
  private readonly seo = inject(SeoService);

  readonly downloadsPath = DEFAULT_DOWNLOADS_PATH;
  readonly pagePath = '/android';
  /** Enlaces públicos de las tiendas, solo si existen de verdad (`src/beta-links.json`). */
  private readonly stores = inject(ANDROID_STORES);
  readonly testflightUrl = this.stores.testflight;
  readonly playUrl = this.stores.googlePlay;

  readonly visitor = readVisitor(this.env);
  readonly platform = this.visitor.platform;
  readonly onAndroid = this.platform === 'android';
  readonly onComputer = isComputer(this.platform);

  readonly releaseState = signal<ReleaseState>({ status: 'idle' });
  readonly copied = signal(false);
  readonly qrSrc = signal<string | null>(null);
  readonly steps = ['download', 'allow', 'install'] as const;

  private readonly neutral = this.platform === 'bot' || this.platform === 'other';

  readonly view = computed<AndroidPageView>(() => {
    if (this.neutral) return 'neutral';
    if (this.playUrl) return 'play';
    if (this.onAndroid && this.visitor.inAppBrowser) return 'inApp';
    const state = this.releaseState();
    const tooOld = (min: number | null) => this.onAndroid && androidTooOld(this.visitor.androidVersion, min ?? DEFAULT_MIN_ANDROID);
    if (state.status === 'ready') return tooOld(state.release.minAndroid) ? 'tooOld' : 'ready';
    if (state.status === 'idle' || state.status === 'loading') return 'loading';
    // Sin manifiesto, un teléfono viejo igual oye por qué no puede instalar.
    if (tooOld(null)) return 'tooOld';
    return state.status === 'offline' ? 'offline' : 'unavailable';
  });

  readonly release = computed(() => {
    const s = this.releaseState();
    return s.status === 'ready' ? s.release : null;
  });
  readonly apkHref = computed(() => {
    const r = this.release();
    return r ? androidApkUrl(r, this.downloadsPath) : null;
  });
  readonly dateText = computed(() => formatPublished(this.release()?.publishedAt ?? null, this.translate.currentLanguage()));
  readonly pageUrl = `${this.env.origin}${this.pagePath}`;
  readonly pageUrlText = this.pageUrl.replace(/^https?:\/\//i, '');
  readonly chromeIntent = chromeIntentUrl(this.pageUrl);
  /** En computador: QR para seguir en el teléfono. */
  readonly showShare = this.onComputer && !this.neutral;
  /** iPhone, iPad y computadores: el enlace de TestFlight, si existe. */
  readonly showTestflight = !!this.testflightUrl && !this.onAndroid && !this.neutral;

  private copiedTimer: ReturnType<typeof setTimeout> | undefined;
  private loadId = 0;

  constructor() {
    effect(() => {
      this.translate.currentLanguage();
      this.seo.update({ title: this.t('android.seoT'), description: this.t('android.seoD'), url: this.pagePath });
    });
    effect(() => {
      const wants = !this.neutral && !this.playUrl && !(this.onAndroid && this.visitor.inAppBrowser);
      if (wants && untracked(this.releaseState).status === 'idle') void this.loadRelease();
    });
    if (this.showShare) {
      let stale = false;
      void import('./android-qr.util').then((m) => {
        if (!stale) this.qrSrc.set(m.qrDataUrl(this.pageUrl));
      });
      inject(DestroyRef).onDestroy(() => (stale = true));
    }
    // Vuelve la red: reintenta solo.
    const onOnline = () => {
      if (this.releaseState().status === 'offline') void this.loadRelease();
    };
    window.addEventListener('online', onOnline);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', onOnline);
      clearTimeout(this.copiedTimer);
      this.loadId++;
    });
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.translate.translate(key, params);
  }

  versionText(): string {
    const r = this.release();
    return r ? this.t('android.version', { version: r.versionName, size: formatApkSize(r.sizeBytes, this.translate.currentLanguage()) }) : '';
  }

  minText(): string {
    return this.t('android.old.b', { min: this.release()?.minAndroid ?? DEFAULT_MIN_ANDROID });
  }

  /** Lee `latest.json` y comprueba (HEAD) que su APK exista: un manifiesto viejo nunca se vuelve un botón roto. Nunca lanza. */
  async loadRelease(): Promise<void> {
    const id = ++this.loadId;
    this.releaseState.set({ status: 'loading' });
    const next = await this.fetchRelease();
    if (id === this.loadId) this.releaseState.set(next);
  }

  private async fetchRelease(): Promise<ReleaseState> {
    if (!this.env.online()) return { status: 'offline' };
    try {
      const res = await this.env.fetch(androidLatestUrl(this.downloadsPath), { cache: 'no-store' });
      if (res.status === 404) return { status: 'missing' };
      if (!res.ok) return { status: 'error' };
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return { status: 'missing' }; // el sitio devolvió su página de inicio: no hay latest.json
      }
      const release = parseAndroidRelease(body);
      if (!release) return { status: 'error' };
      const head = await this.env.fetch(androidApkUrl(release, this.downloadsPath), { method: 'HEAD', cache: 'no-store' });
      if (head.status === 404 || head.status === 410) return { status: 'missing' };
      return head.ok ? { status: 'ready', release } : { status: 'error' };
    } catch {
      return { status: this.env.online() ? 'error' : 'offline' };
    }
  }

  retry(): void {
    void this.loadRelease();
  }

  /** Copia el enlace de la página; sin permiso, deja el campo seleccionado para copiar a mano. */
  async copyLink(field: HTMLInputElement): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.pageUrl);
      this.copied.set(true);
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(false), COPIED_MS);
    } catch {
      field.focus();
      field.select();
    }
  }
}
