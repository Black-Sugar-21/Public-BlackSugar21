import { RenderMode, ServerRoute } from '@angular/ssr';

// Static Site Generation: prerender every route to static HTML at build time so
// search engines and AI crawlers (that don't execute JS) get full, indexable content.
export const serverRoutes: ServerRoute[] = [
  // R161: parameterized private links can't be prerendered (unknown tokens at build
  // time) — client-render them; the hosting rewrite serves index.csr.html.
  { path: 'opinion/:token', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Prerender },
];
