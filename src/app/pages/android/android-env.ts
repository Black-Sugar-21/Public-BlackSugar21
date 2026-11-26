import { InjectionToken } from '@angular/core';
import { betaCards } from '../../ui/lottie/beta-links';
import { VisitorInput } from './android-visitor.util';

/** Lo que la página lee del navegador, inyectable para probar cada vista sin tocar `navigator`. */
export interface AndroidEnv extends VisitorInput {
  online(): boolean;
  origin: string;
  fetch: (url: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;
}

export const ANDROID_ENV = new InjectionToken<AndroidEnv>('ANDROID_ENV', {
  providedIn: 'root',
  factory: () => ({
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    maxTouchPoints: typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints,
    online: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
    origin: typeof location === 'undefined' ? '' : location.origin,
    fetch: (url, init) => fetch(url, init),
  }),
});

/** Enlaces públicos de las tiendas (solo los que existen de verdad en `src/beta-links.json`); inyectable para probar cada vista. */
export interface AndroidStores {
  testflight: string | null;
  googlePlay: string | null;
}

export const ANDROID_STORES = new InjectionToken<AndroidStores>('ANDROID_STORES', {
  providedIn: 'root',
  factory: () => {
    const cards = betaCards();
    return { testflight: cards.find((c) => c.key === 'testflight')?.href ?? null, googlePlay: cards.find((c) => c.key === 'googlePlay')?.href ?? null };
  },
});
