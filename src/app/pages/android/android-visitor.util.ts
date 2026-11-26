/** Quién visita la página, leído del `userAgent`: decide qué se le muestra (descarga, TestFlight, QR o solo texto). */
export type VisitorPlatform = 'android' | 'ios' | 'mac' | 'computer' | 'bot' | 'other';

export interface VisitorInput {
  readonly userAgent: string;
  readonly maxTouchPoints?: number;
}

export interface Visitor {
  readonly platform: VisitorPlatform;
  /** Versión mayor de Android (`Android 13` → 13); `null` si no se sabe. */
  readonly androidVersion: number | null;
  /** Navegador incrustado de otra app (Facebook, Instagram, TikTok, …): ahí las descargas suelen fallar. */
  readonly inAppBrowser: boolean;
}

const BOT_RE = /bot|crawl|spider|slurp|lighthouse|facebookexternalhit|preview|headless|pingdom|curl\/|wget/i;
const OTHER_RE = /smart-?tv|hbbtv|tizen|web0s|webos|appletv|crkey|kaios|playstation|xbox|nintendo|roku|aftb|bravia/i;
const IN_APP_RE = /FBAN|FBAV|FB_IAB|Instagram|Line\/|musical_ly|BytedanceWebview|TikTok|Snapchat|Twitter|LinkedInApp|MicroMessenger|Messenger|GSA\/|Pinterest|\bwv\b/i;

export function readVisitor(input: VisitorInput): Visitor {
  const ua = input.userAgent ?? '';
  const none = { androidVersion: null, inAppBrowser: false };
  if (!ua || BOT_RE.test(ua)) return { platform: 'bot', ...none };
  if (OTHER_RE.test(ua)) return { platform: 'other', ...none };
  if (/Android/i.test(ua)) {
    const v = /Android[ /](\d+)/i.exec(ua);
    return { platform: 'android', androidVersion: v ? Number(v[1]) : null, inAppBrowser: IN_APP_RE.test(ua) };
  }
  if (/iPhone|iPad|iPod/i.test(ua)) return { platform: 'ios', ...none };
  // iPadOS se presenta como Mac: lo delata la pantalla táctil.
  if (/Macintosh/i.test(ua)) return { platform: (input.maxTouchPoints ?? 0) > 1 ? 'ios' : 'mac', ...none };
  if (/Windows|Linux|CrOS|X11/i.test(ua)) return { platform: 'computer', ...none };
  return { platform: 'other', ...none };
}

/** Computadores: la página ofrece el QR para seguir en el teléfono. */
export function isComputer(p: VisitorPlatform): boolean {
  return p === 'mac' || p === 'computer';
}

/** `true` solo con una versión conocida menor al mínimo (sin dato no se bloquea a nadie). */
export function androidTooOld(version: number | null, min: number): boolean {
  return version !== null && version < min;
}

/** Enlace que abre esta misma página en Chrome (intent de Android). `null` si la URL no es https. */
export function chromeIntentUrl(pageUrl: string): string | null {
  try {
    const u = new URL(pageUrl);
    if (u.protocol !== 'https:') return null;
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;end`;
  } catch {
    return null;
  }
}
