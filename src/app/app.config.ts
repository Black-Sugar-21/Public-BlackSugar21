import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Hydrate the prerendered (SSG) HTML instead of re-rendering from scratch,
    // and replay user events that happen before hydration completes.
    provideClientHydration(withEventReplay())
  ]
};
