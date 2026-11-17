import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

const authMock = vi.hoisted(() => ({ user: null as unknown }));
vi.mock('firebase/auth', () => ({
  getAuth: () => ({}),
  onAuthStateChanged: (_a: unknown, cb: (u: unknown) => void) => { cb(authMock.user); return () => {}; },
}));

import { FirebaseService } from './firebase.service';
import { authStateOnce, authGuard, analyticsAuthGuard } from './app.routes';

describe('guards de sesión (Firebase bajo demanda)', () => {
  const tree = { redirect: true };
  let ready: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    ready = vi.fn(async () => ({}));
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { createUrlTree: () => tree } },
        { provide: FirebaseService, useValue: { ready } },
      ],
    });
  });

  it('trae Firebase antes de leer la sesión y deja pasar a un usuario', async () => {
    authMock.user = { uid: 'u1' };
    const r = await TestBed.runInInjectionContext(() => authStateOnce());
    expect(ready).toHaveBeenCalledTimes(1);
    expect(r).toBe(true);
  });

  it('sin sesión redirige a la portada', async () => {
    authMock.user = null;
    expect(await TestBed.runInInjectionContext(() => authGuard())).toBe(tree);
    expect(await TestBed.runInInjectionContext(() => analyticsAuthGuard())).toBe(tree);
  });

  it('si Firebase no se puede cargar, redirige a la portada', async () => {
    ready.mockRejectedValueOnce(new Error('offline'));
    expect(await TestBed.runInInjectionContext(() => authStateOnce())).toBe(tree);
  });
});
