import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FIREBASE_IDLE_TIMEOUT_MS, FirebaseService } from './firebase.service';
import { AnalyticsService } from './analytics.service';
import type { FirebaseState } from './firebase-core';

/** Núcleo falso: registra lo que la fachada le delega, sin tocar el SDK real. */
class FakeCore {
  static instances: FakeCore[] = [];
  signIn = vi.fn(async (email: string, _pw: string) => ({ uid: 'u-' + email }));
  listenMatches = vi.fn((_cb: (m: unknown[]) => void) => this.unsub);
  unsub = vi.fn();
  constructor(public state: FirebaseState) {
    FakeCore.instances.push(this);
    // Cualquier método no declarado se comporta como un espía que devuelve su propio nombre.
    return new Proxy(this, {
      get: (t, p, r) => {
        if (p in t || typeof p !== 'string' || p === 'then') return Reflect.get(t, p, r);
        return ((t as any)[p] = vi.fn(async () => p));
      },
    });
  }
}

class TestableFirebase extends FirebaseService {
  loads = 0;
  failNext = false;
  protected override loadCore(): Promise<any> {
    this.loads++;
    if (this.failNext) { this.failNext = false; return Promise.reject(new Error('offline')); }
    return Promise.resolve({ FirebaseCore: FakeCore });
  }
}

function make(platform: 'browser' | 'server' = 'browser'): TestableFirebase {
  TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: platform }] });
  return TestBed.runInInjectionContext(() => new TestableFirebase());
}

describe('FirebaseService (carga diferida)', () => {
  beforeEach(() => { FakeCore.instances = []; vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); TestBed.resetTestingModule(); });

  it('no carga el SDK al construirse ni al registrar eventos', () => {
    const svc = make();
    svc.logEvent('screen_view', { page_path: '/' });
    expect(svc.loads).toBe(0);
  });

  it('logEvent va a la analítica con consentimiento y NUNCA carga ni usa el SDK de Firebase', async () => {
    const svc = make();
    const spy = vi.spyOn(TestBed.inject(AnalyticsService), 'trackEvent');
    svc.logEvent('a'); svc.logEvent('b', { x: 1 });
    expect(spy.mock.calls).toEqual([['a', undefined], ['b', { x: 1 }]]);
    expect(svc.loads).toBe(0);
    await vi.advanceTimersByTimeAsync(FIREBASE_IDLE_TIMEOUT_MS * 2);
    expect(svc.loads).toBe(0);
  });

  it('ready() es idempotente y comparte el estado de señales con el núcleo', async () => {
    const svc = make();
    const [a, b] = await Promise.all([svc.ready(), svc.ready()]);
    expect(a).toBe(b);
    expect(svc.loads).toBe(1);
    expect((a as unknown as FakeCore).state.currentUser).toBe(svc.currentUser);
    expect((a as unknown as FakeCore).state.profileChecked).toBe(svc.profileChecked);
  });

  it('las funciones delegan al núcleo y lo cargan bajo demanda', async () => {
    const svc = make();
    const user = await svc.signIn('a@b.c', 'pw');
    expect(user).toEqual({ uid: 'u-a@b.c' });
    expect(svc.loads).toBe(1);
  });

  it('tras un fallo de descarga permite reintentar', async () => {
    const svc = make();
    svc.failNext = true;
    await expect(svc.ready()).rejects.toThrow('offline');
    await expect(svc.ready()).resolves.toBeTruthy();
    expect(svc.loads).toBe(2);
  });

  it('en el servidor no carga nada y rechaza las funciones', async () => {
    const svc = make('server');
    svc.logEvent('x');
    svc.whenIdle();
    await expect(svc.ready()).rejects.toThrow('firebase-browser-only');
    expect(svc.loads).toBe(0);
  });

  it('whenIdle carga el SDK tras la ventana de inactividad', async () => {
    const svc = make();
    let done = false;
    svc.whenIdle().then(() => (done = true));
    window.dispatchEvent(new Event('load'));
    await vi.advanceTimersByTimeAsync(FIREBASE_IDLE_TIMEOUT_MS + 10);
    expect(done).toBe(true);
    expect(svc.loads).toBe(1);
  });

  it('la primera interacción adelanta la carga', async () => {
    const svc = make();
    void svc.whenIdle();
    window.dispatchEvent(new Event('pointerdown'));
    await vi.advanceTimersByTimeAsync(0);
    expect(svc.loads).toBe(1);
    // el temporizador pendiente se canceló: no hay segunda carga
    await vi.advanceTimersByTimeAsync(FIREBASE_IDLE_TIMEOUT_MS * 2);
    expect(svc.loads).toBe(1);
  });

  it('si la descarga falla en segundo plano no revienta', async () => {
    const svc = make();
    svc.failNext = true;
    svc.whenIdle();
    window.dispatchEvent(new Event('keydown'));
    await vi.advanceTimersByTimeAsync(0);
    expect(svc.loads).toBe(1);
  });

  it('listen devuelve el cancelador al instante y respeta la cancelación previa a la carga', async () => {
    const svc = make();
    const off = svc.listenMatches(() => {});
    off();
    const core = (await svc.ready()) as unknown as FakeCore;
    await Promise.resolve();
    expect(core.listenMatches).not.toHaveBeenCalled();
  });

  it('listen conecta tras la carga y cancela con el unsub real', async () => {
    const svc = make();
    const off = svc.listenMatches(() => {});
    const core = (await svc.ready()) as unknown as FakeCore;
    await Promise.resolve();
    expect(core.listenMatches).toHaveBeenCalledTimes(1);
    off();
    expect(core.unsub).toHaveBeenCalledTimes(1);
  });

  it('listen tolera que el SDK no se pueda descargar', async () => {
    const svc = make();
    svc.failNext = true;
    expect(() => svc.listenMatches(() => {})).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
  });

  it('helpers puros: redirección, perfil completo y bus del coach', () => {
    const svc = make();
    expect(svc.shouldUseRedirect()).toBe(true);
    expect(svc.isProfileComplete()).toBe(false);
    svc.userProfile.set({ userType: 'x', birthDate: 1 } as any);
    expect(svc.isProfileComplete()).toBe(true);
    svc.requestOpenCoach(); svc.requestOpenCoach();
    expect(svc.coachOpenRequest()).toBe(2);
  });

  it('todos los delegados llaman al método homónimo del núcleo', async () => {
    const own = new Set(['constructor', 'ready', 'loadCore', 'whenIdle', 'scheduleIdleLoad', 'call', 'listen',
      'shouldUseRedirect', 'isProfileComplete', 'logEvent', 'requestOpenCoach']);
    const names = Object.getOwnPropertyNames(FirebaseService.prototype).filter((n) => !own.has(n));
    expect(names.length).toBeGreaterThan(60);
    const svc = make();
    const core = (await svc.ready()) as any;
    for (const n of names) {
      const out = (svc as any)[n]('x', 'y');
      if (n.startsWith('listen')) { expect(typeof out).toBe('function'); await Promise.resolve(); }
      else expect(await out).toEqual(n === 'signIn' ? { uid: 'u-x' } : n); // signIn está declarado en FakeCore
      expect(core[n], n).toHaveBeenCalledWith('x', 'y');
    }
  });

  describe('página aún cargando (readyState != complete)', () => {
    const setState = (v: string) => vi.spyOn(document, 'readyState', 'get').mockReturnValue(v as DocumentReadyState);
    afterEach(() => vi.restoreAllMocks());

    it('arma la ventana de inactividad recién cuando llega el evento load', async () => {
      setState('loading');
      const svc = make();
      void svc.whenIdle();
      await vi.advanceTimersByTimeAsync(FIREBASE_IDLE_TIMEOUT_MS * 2);
      expect(svc.loads).toBe(0);
      window.dispatchEvent(new Event('load'));
      await vi.advanceTimersByTimeAsync(FIREBASE_IDLE_TIMEOUT_MS + 10);
      expect(svc.loads).toBe(1);
    });

    it('una interacción antes de load carga el SDK sin esperar el temporizador', async () => {
      setState('loading');
      const svc = make();
      const idle = svc.whenIdle();
      window.dispatchEvent(new Event('pointerdown'));
      await idle;
      await vi.advanceTimersByTimeAsync(0);
      expect(svc.loads).toBe(1);
    });
  });
});
