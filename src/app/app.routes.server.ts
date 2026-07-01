import { RenderMode, ServerRoute } from '@angular/ssr';

// Static Site Generation: prerender every route to static HTML at build time so
// search engines and AI crawlers (that don't execute JS) get full, indexable content.
export const serverRoutes: ServerRoute[] = [
  { path: '**', renderMode: RenderMode.Prerender },
];
