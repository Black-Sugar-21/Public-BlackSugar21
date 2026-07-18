import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { Observable } from 'rxjs';
import { ModerationPolicyComponent } from './components/moderation-policy/moderation-policy.component';
import { TermsComponent } from './pages/terms/terms.component';
import { PrivacyComponent } from './pages/privacy/privacy.component';
import { DataDeletionComponent } from './pages/data-deletion/data-deletion.component';
import { SafetyStandardsComponent } from './pages/safety-standards/safety-standards.component';

/** Resolves once with the current Firebase auth state (null = not signed in). */
function authStateOnce(): Observable<boolean | import('@angular/router').UrlTree> {
  const router = inject(Router);
  return new Observable(subscriber => {
    const unsubscribe = onAuthStateChanged(getAuth(), user => {
      subscriber.next(user ? true : router.createUrlTree(['/']));
      subscriber.complete();
      unsubscribe();
    });
  });
}

/**
 * Analytics route guard — requires Firebase Auth sign-in.
 * analyticsAuthGuard: checks Firebase Auth sign-in. Admin UID check is done in the component.
 * TODO: Once admin custom claims are provisioned, upgrade to:
 *   const idTokenResult = await getAuth().currentUser?.getIdTokenResult();
 *   return idTokenResult?.claims?.['isAdmin'] === true;
 */
export const analyticsAuthGuard = () => authStateOnce();

/** Auth guard for /app — redirects unauthenticated users to the landing page. */
export const authGuard = () => authStateOnce();

export const routes: Routes = [
  {
    path: 'moderation-policy',
    component: ModerationPolicyComponent,
    title: 'Políticas de Moderación - Black Sugar 21'
  },
  {
    path: 'politicas-moderacion',
    component: ModerationPolicyComponent,
    title: 'Políticas de Moderación - Black Sugar 21'
  },
  {
    path: 'terms',
    component: TermsComponent,
    title: 'Términos de Uso - Black Sugar 21'
  },
  {
    path: 'privacy',
    component: PrivacyComponent,
    title: 'Política de Privacidad - Black Sugar 21'
  },
  {
    path: 'data-deletion',
    component: DataDeletionComponent,
    title: 'Eliminación de Datos - Black Sugar 21'
  },
  {
    path: 'safety-standards',
    component: SafetyStandardsComponent,
    title: 'Estándares de Seguridad Infantil - Black Sugar 21'
  },
  {
    path: 'features',
    loadComponent: () => import('./pages/features/features.component').then(m => m.FeaturesComponent),
    title: 'AI Features - Black Sugar 21'
  },
  {
    path: 'analytics',
    loadComponent: () => import('./pages/analytics/analytics').then(m => m.AnalyticsComponent),
    title: 'AI Analytics - Black Sugar 21',
    canActivate: [analyticsAuthGuard],
  },
  {
    path: 'app',
    loadComponent: () => import('./app-shell.component').then(m => m.AppShellComponent),
    title: 'Black Sugar 21',
    canActivate: [authGuard],
  },
  {
    path: 'coach',
    loadComponent: () => import('./coach-page.component').then(m => m.CoachPageComponent),
    title: 'Coach IA · Black Sugar 21'
  },
  {
    path: 'guia/swipe-fatigue',
    loadComponent: () => import('./pages/guias/swipe-fatigue.component').then(m => m.SwipeFatigueGuideComponent),
    title: 'Swipe fatigue: qué es y cómo superarla · Black Sugar 21'
  },
  {
    path: 'guia/como-empezar-conversacion',
    loadComponent: () => import('./pages/guias/conversacion.component').then(m => m.ConversacionGuideComponent),
    title: 'Cómo empezar una conversación en apps de citas · Black Sugar 21'
  },
  {
    path: 'guia/primera-cita',
    loadComponent: () => import('./pages/guias/primera-cita.component').then(m => m.PrimeraCitaGuideComponent),
    title: 'Consejos para la primera cita · Black Sugar 21'
  },
  {
    path: 'guia/psicologia-apego-citas',
    loadComponent: () => import('./pages/guias/apego.component').then(m => m.ApegoGuideComponent),
    title: 'Psicología del apego en las citas · Black Sugar 21'
  },
  {
    path: 'guia/apps-citas-ia',
    loadComponent: () => import('./pages/guias/ia-dating.component').then(m => m.IaDatingGuideComponent),
    title: 'Apps de citas con inteligencia artificial: guía 2026 · Black Sugar 21'
  },
  {
    path: 'guia/ghosting-que-hacer',
    loadComponent: () => import('./pages/guias/ghosting.component').then(m => m.GhostingGuideComponent),
    title: 'Ghosting: qué hacer cuando te ignoran en apps de citas · Black Sugar 21'
  },
  {
    path: 'guia/red-flags-apps-citas',
    loadComponent: () => import('./pages/guias/red-flags.component').then(m => m.RedFlagsGuideComponent),
    title: '12 red flags en apps de citas · Black Sugar 21'
  },
  {
    path: 'guia/como-pasar-chat-a-cita',
    loadComponent: () => import('./pages/guias/chat-a-cita.component').then(m => m.ChatACitaGuideComponent),
    title: 'Cómo pasar del chat a la cita · Black Sugar 21'
  },
  {
    path: 'guia/mensajes-para-retomar-conversacion',
    loadComponent: () => import('./pages/guias/mensajes-retomar.component').then(m => m.MensajesRetomarGuideComponent),
    title: 'Cómo retomar una conversación fría en apps de citas · Black Sugar 21'
  },
  {
    path: 'guia/mejor-app-citas-ia-2026',
    loadComponent: () => import('./pages/guias/mejor-app-ia.component').then(m => m.MejorAppIaGuideComponent),
    title: 'Mejor app de citas con IA en 2026 · Black Sugar 21'
  },
  { path: '**', redirectTo: '/' }
];
