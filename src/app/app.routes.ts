import { Routes } from '@angular/router';
import { ModerationPolicyComponent } from './components/moderation-policy/moderation-policy.component';
import { TermsComponent } from './pages/terms/terms.component';
import { PrivacyComponent } from './pages/privacy/privacy.component';
import { DataDeletionComponent } from './pages/data-deletion/data-deletion.component';
import { SafetyStandardsComponent } from './pages/safety-standards/safety-standards.component';

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
    title: 'AI Analytics - Black Sugar 21'
  },
  {
    path: 'app',
    loadComponent: () => import('./app-shell.component').then(m => m.AppShellComponent),
    title: 'Black Sugar 21'
  },
  {
    path: 'coach',
    loadComponent: () => import('./coach-page.component').then(m => m.CoachPageComponent),
    title: 'Coach IA · Black Sugar 21'
  }
];
