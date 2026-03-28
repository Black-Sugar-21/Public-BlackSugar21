import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { getAuth, signInWithPopup, GoogleAuthProvider, User, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

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

const ADMIN_EMAILS = ['dverdugo85@gmail.com'];

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './analytics.html',
  styleUrl: './analytics.css',
})
export class AnalyticsComponent implements OnInit {
  user = signal<User | null>(null);
  isAdmin = signal(false);
  loading = signal(true);
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

  ngOnInit() {
    const auth = getAuth();
    onAuthStateChanged(auth, (u) => {
      this.user.set(u);
      this.isAdmin.set(u ? ADMIN_EMAILS.includes(u.email || '') : false);
      if (this.isAdmin()) {
        this.loadData();
      } else {
        this.loading.set(false);
      }
    });
  }

  async login() {
    try {
      const auth = getAuth();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      this.error.set(err.message || 'Login failed');
    }
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

  setDays(d: number) {
    this.days.set(d);
    this.loadData();
  }

  getFunctionNames(): string[] {
    const latest = this.daily()[0];
    if (!latest?.functions) return [];
    return Object.keys(latest.functions).sort();
  }

  getFunctionData(name: string) {
    const latest = this.daily()[0];
    return latest?.functions?.[name] || { calls: 0, tokens: 0, costUsd: 0, errors: 0 };
  }

  getModelNames(): string[] {
    const latest = this.daily()[0];
    if (!latest?.models) return [];
    return Object.keys(latest.models).sort();
  }

  getModelData(name: string) {
    const latest = this.daily()[0];
    return latest?.models?.[name] || { calls: 0, tokens: 0, costUsd: 0 };
  }

  getAlerts(): string[] {
    return this.daily().flatMap(d => d.healthCheck?.alerts || []);
  }

  formatCost(usd: number): string {
    return '$' + (usd || 0).toFixed(4);
  }

  formatTokens(n: number): string {
    if (!n) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(n);
  }

  calcLatency(day: DailyAnalytics): number {
    return day.totalCalls > 0 ? Math.round(day.totalLatencyMs / day.totalCalls) : 0;
  }

  async logout() {
    const auth = getAuth();
    await auth.signOut();
  }
}
