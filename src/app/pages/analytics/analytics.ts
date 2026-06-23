import { Component, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

// Admin UIDs allowed to access analytics
const ADMIN_UIDS = ['tvmkXqXGSzfriAkQUI4KrQF6sZm2'];

interface DailyAnalytics {
  date: string;
  totalCalls: number;
  totalTokens: number;
  totalCostUsd: number;
  totalErrors: number;
  totalLatencyMs: number;
  functions?: Record<string, { calls: number; tokens: number; costUsd: number; errors: number }>;
  models?: Record<string, { calls: number; tokens: number; costUsd: number }>;
  healthCheck?: { errorRate: number; avgLatencyMs: number; alerts: string[] };
}

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './analytics.html',
  styleUrl: './analytics.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsComponent implements OnInit {
  authenticated = signal(false);
  loading = signal(false);
  error = signal('');
  daily = signal<DailyAnalytics[]>([]);
  days = signal(7);

  totalCalls = signal(0);
  totalTokens = signal(0);
  totalCostUsd = signal(0);
  totalErrors = signal(0);
  avgLatencyMs = signal(0);
  errorRate = signal(0);
  avgCostPerDay = signal(0);

  // SECURITY: Access is gated behind Firebase Authentication.
  // The user must be signed in to view analytics. The previous hardcoded password
  // ('bs21-admin-2026') was exposed in the JS bundle and has been removed.
  // TODO: Upgrade to admin custom-claim check once the admin role is provisioned:
  //   const idTokenResult = await user.getIdTokenResult();
  //   if (!idTokenResult.claims['isAdmin']) { this.error.set('Acceso denegado'); return; }
  // To set admin claims, use the Firebase Admin SDK:
  //   admin.auth().setCustomUserClaims(uid, { isAdmin: true, role: 'admin' })

  ngOnInit() {
    const auth = getAuth();
    onAuthStateChanged(auth, (user) => {
      if (user && ADMIN_UIDS.includes(user.uid)) {
        // User is signed in AND is an allowed admin UID — grant access.
        // TODO: replace with admin claim check (see comment above).
        this.authenticated.set(true);
        this.loadData();
      } else if (user) {
        // Authenticated but not an admin UID.
        this.authenticated.set(false);
        this.error.set('Acceso denegado: no tienes permisos para ver esta página.');
      } else {
        this.authenticated.set(false);
        this.error.set('Debes iniciar sesión para ver el panel de analytics.');
      }
    });
  }

  async loadData() {
    this.loading.set(true);
    this.error.set('');
    try {
      const db = getFirestore();
      const results: DailyAnalytics[] = [];
      for (let i = 0; i < this.days(); i++) {
        const date = new Date(Date.now() - i * 86400000).toISOString().substring(0, 10);
        const snap = await getDoc(doc(db, 'aiAnalytics', date));
        if (snap.exists()) {
          results.push({ date, ...snap.data() } as DailyAnalytics);
        }
      }
      this.daily.set(results);
      this.computeSummary(results);
    } catch (err: any) {
      this.error.set(err.message);
    }
    this.loading.set(false);
  }

  computeSummary(results: DailyAnalytics[]) {
    let calls = 0, tokens = 0, cost = 0, errors = 0, latency = 0;
    for (const d of results) {
      calls += d.totalCalls || 0;
      tokens += d.totalTokens || 0;
      cost += d.totalCostUsd || 0;
      errors += d.totalErrors || 0;
      latency += d.totalLatencyMs || 0;
    }
    this.totalCalls.set(calls);
    this.totalTokens.set(tokens);
    this.totalCostUsd.set(cost);
    this.totalErrors.set(errors);
    this.avgLatencyMs.set(calls > 0 ? Math.round(latency / calls) : 0);
    this.errorRate.set(calls > 0 ? Math.round((errors / calls) * 10000) / 100 : 0);
    this.avgCostPerDay.set(results.length > 0 ? cost / results.length : 0);
  }

  setDays(d: number) { this.days.set(d); this.loadData(); }

  getFunctionNames(): string[] {
    const latest = this.daily()[0];
    return latest?.functions ? Object.keys(latest.functions).sort() : [];
  }

  getFunctionData(name: string) {
    return this.daily()[0]?.functions?.[name] || { calls: 0, tokens: 0, costUsd: 0, errors: 0 };
  }

  getModelNames(): string[] {
    const latest = this.daily()[0];
    return latest?.models ? Object.keys(latest.models).sort() : [];
  }

  getModelData(name: string) {
    return this.daily()[0]?.models?.[name] || { calls: 0, tokens: 0, costUsd: 0 };
  }

  getAlerts(): string[] {
    return this.daily().flatMap(d => d.healthCheck?.alerts || []);
  }

  formatCost(usd: number): string { return '$' + (usd || 0).toFixed(4); }

  formatTokens(n: number): string {
    if (!n) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(n);
  }

  calcLatency(day: DailyAnalytics): number {
    return day.totalCalls > 0 ? Math.round(day.totalLatencyMs / day.totalCalls) : 0;
  }

  logout() {
    const auth = getAuth();
    auth.signOut().catch(() => { /* noop */ });
    this.authenticated.set(false);
  }
}
