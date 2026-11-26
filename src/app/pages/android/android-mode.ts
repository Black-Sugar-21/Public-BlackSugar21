import { InjectionToken } from '@angular/core';

/** `solicitud` = sin descarga pública: el botón Android y `/android` dicen «Pide acceso». `descarga` = APK directo desde este sitio. */
export type AndroidMode = 'solicitud' | 'descarga';

/**
 * ÚNICO INTERRUPTOR de Android del sitio. Para reactivar la descarga directa, cambia esta línea a `'descarga'`
 * (solo con un APK que abra: sin la protección automática de Google Play).
 */
export const ANDROID_MODE: AndroidMode = 'solicitud';

/** Camino de solicitud: correo con asunto. */
export const ANDROID_REQUEST_EMAIL = 'hello@blacksugar21.com';
export const ANDROID_REQUEST_URL = `mailto:${ANDROID_REQUEST_EMAIL}?subject=Acceso%20Black%20Sugar%2021%20%28Android%29`;

/** El interruptor, inyectable para probar los dos estados. */
export const ANDROID_SITE_MODE = new InjectionToken<AndroidMode>('ANDROID_SITE_MODE', { providedIn: 'root', factory: () => ANDROID_MODE });
