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
  { path: '**', redirectTo: '/' }
];
