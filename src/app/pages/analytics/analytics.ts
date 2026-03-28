import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { getAuth, signInWithPopup, GoogleAuthProvider, User } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { initializeApp, getApps } from 'firebase/app';

const ADMIN_EMAILS = ['dverdugo85@gmail.com'];

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

interface AnalyticsSummary {
  totalCalls: number;
  totalTokens: number;
  totalCostUsd: number;
  totalErrors: number;
  avgLatencyMs: number;
  errorRate: number;
  avgCostPerDay: number;
  days: number;
}

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
  summary = signal<AnalyticsSummary | null>(null);
  daily = signal<DailyAnalytics[]>([]);
  days = signal(7);

  ngOnInit() {
    const auth = getAuth();
    auth.onAuthStateChanged((u) => {
      this.user.set(u);
      this.isAdmin.set(u ? ADMIN_EMAILS.includes(u.email || '') : false);
      if (this.isAdmin()) this.loadData();
      else this.loading.set(false);
    });
  }

  async login() {
    const auth = getAuth();
    await signInWithPopup(auth, new GoogleAuthProvider());
  }

  async loadData() {
    this.loading.set(true);
    this.error.set('');
    try {
      const functions = getFunctions(undefined, 'us-central1');
      const getAnalytics = httpsCallable(functions, 'getAIAnalytics');
      const result: any = await getAnalytics({ days: this.days() });
      this.summary.set(result.data.summary);
      this.daily.set(result.data.daily || []);
    } catch (err: any) {
      this.error.set(err.message);
    }
    this.loading.set(false);
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
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(n || 0);
  }
}
