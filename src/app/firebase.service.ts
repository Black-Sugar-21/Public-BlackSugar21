import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { User } from 'firebase/auth';
import type { FirebaseCore, FirebaseState, UserProfile } from './firebase-core';

export type { UserProfile } from './firebase-core';

/** Tiempo máximo tras la carga de la página para traer Firebase aunque nadie interactúe (restaura la sesión). */
export const FIREBASE_IDLE_TIMEOUT_MS = 2500;
/** Tope de eventos de analítica en espera antes de que Firebase esté cargado. */
export const MAX_QUEUED_EVENTS = 50;

/**
 * Fachada de Firebase con carga diferida.
 *
 * Mantiene la misma API pública que antes, pero el SDK (unos 400 kB) vive en `firebase-core.ts` y se trae con
 * `import()` dinámico: nunca en la ruta crítica de la portada. Se carga cuando (a) una función lo necesita
 * (formularios, /app, /analytics, el coach), (b) el usuario interactúa por primera vez, o (c) pasa la ventana
 * de inactividad tras la carga (para restaurar la sesión). Los eventos de analítica se encolan hasta entonces.
 */
@Injectable({ providedIn: 'root' })
export class FirebaseService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private corePromise: Promise<FirebaseCore> | null = null;
  private core_: FirebaseCore | null = null;
  private queued: Array<[string, Record<string, unknown> | undefined]> = [];
  private idleScheduled = false;
  private idleResolve!: () => void;
  private readonly idle = new Promise<void>((r) => (this.idleResolve = r));

  readonly currentUser = signal<User | null>(null);
  readonly userProfile = signal<UserProfile | null>(null);
  /** False until the signed-in user's profile has been loaded/checked at least once — lets the UI
   *  gate onboarding WITHOUT flashing it for existing users during the async profile load. */
  readonly profileChecked = signal(false);
  /** True when the last sign-in hit a soft-deleted account (blocked re-login → show a notice). */
  readonly accountDeleted = signal(false);
  /** Open-coach request bus (signal-based, reliable cross-component): increments each time something
   *  (e.g. the landing hero CTA) asks to open the Coach widget. */
  readonly coachOpenRequest = signal(0);
  requestOpenCoach(): void { this.coachOpenRequest.update((n) => n + 1); }

  /** Trae Firebase ya (idempotente). Lo usan los guards de /app y /analytics antes de leer la sesión. */
  ready(): Promise<FirebaseCore> {
    if (!this.isBrowser) return Promise.reject(new Error('firebase-browser-only'));
    if (!this.corePromise) {
      const state: FirebaseState = {
        currentUser: this.currentUser,
        userProfile: this.userProfile,
        profileChecked: this.profileChecked,
        accountDeleted: this.accountDeleted,
      };
      this.corePromise = this.loadCore().then(({ FirebaseCore: Core }) => {
        const core = new Core(state);
        this.core_ = core;
        const pending = this.queued;
        this.queued = [];
        for (const [name, params] of pending) core.logEvent(name, params);
        return core;
      });
      // Si falla la descarga, permitir un reintento en la próxima llamada.
      this.corePromise.catch(() => { this.corePromise = null; });
    }
    return this.corePromise;
  }

  /** Punto de extensión (y de prueba) para el import dinámico. */
  protected loadCore(): Promise<{ FirebaseCore: new (s: FirebaseState) => FirebaseCore }> {
    return import('./firebase-core');
  }

  /**
   * Se resuelve cuando la página ya pintó y conviene traer Firebase: tras `load` + inactividad, o en la primera
   * interacción. Quien lo espere inicia la carga. Usar para trabajo de arranque que no es crítico para el LCP.
   */
  whenIdle(): Promise<void> {
    this.scheduleIdleLoad();
    return this.idle;
  }

  private scheduleIdleLoad(): void {
    if (this.idleScheduled || !this.isBrowser) return;
    this.idleScheduled = true;
    const fire = () => {
      cleanup();
      this.idleResolve();
      this.ready().catch(() => { /* sin red: se reintenta con la próxima llamada */ });
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      events.forEach((e) => window.removeEventListener(e, fire));
      if (timer !== undefined) clearTimeout(timer);
    };
    events.forEach((e) => window.addEventListener(e, fire, { passive: true, once: true }));
    const arm = () => { timer = setTimeout(fire, FIREBASE_IDLE_TIMEOUT_MS); };
    if (document.readyState === 'complete') arm();
    else window.addEventListener('load', arm, { once: true });
  }

  private async call<T>(fn: (c: FirebaseCore) => Promise<T>): Promise<T> {
    return fn(await this.ready());
  }

  /** Para los `listen*`: devuelve el cancelador de inmediato aunque el SDK aún se esté cargando. */
  private listen(start: (c: FirebaseCore) => () => void): () => void {
    let off: (() => void) | null = null;
    let cancelled = false;
    this.ready()
      .then((c) => { if (!cancelled) off = start(c); })
      .catch(() => { /* sin SDK no hay datos en vivo */ });
    return () => { cancelled = true; off?.(); off = null; };
  }

  /** Popups hang on iOS Safari (ITP) → redirect en todos los navegadores (el dominio de auth es el de la marca). */
  shouldUseRedirect(): boolean { return true; }

  /** A profile is "complete" (discovery-eligible) once it has a userType + birthDate, like the apps. */
  isProfileComplete(): boolean {
    const p: any = this.userProfile();
    return !!(p && p.userType && p.birthDate);
  }

  /** Analítica anónima (GA4). No fuerza la carga de Firebase: se encola y sale cuando el SDK llega. */
  logEvent(eventName: string, params?: Record<string, unknown>): void {
    if (!this.isBrowser) return;
    if (this.core_) { this.core_.logEvent(eventName, params); return; }
    if (this.queued.length < MAX_QUEUED_EVENTS) this.queued.push([eventName, params]);
    this.scheduleIdleLoad();
  }

  // --- Delegados: misma firma que FirebaseCore, cargan el SDK bajo demanda ---
  signIn(...a: Parameters<FirebaseCore['signIn']>) { return this.call((c) => c.signIn(...a)); }
  signUp(...a: Parameters<FirebaseCore['signUp']>) { return this.call((c) => c.signUp(...a)); }
  signInWithGoogle(...a: Parameters<FirebaseCore['signInWithGoogle']>) { return this.call((c) => c.signInWithGoogle(...a)); }
  signInWithApple(...a: Parameters<FirebaseCore['signInWithApple']>) { return this.call((c) => c.signInWithApple(...a)); }
  signInWithAppleRedirect(...a: Parameters<FirebaseCore['signInWithAppleRedirect']>) { return this.call((c) => c.signInWithAppleRedirect(...a)); }
  signInWithGoogleRedirect(...a: Parameters<FirebaseCore['signInWithGoogleRedirect']>) { return this.call((c) => c.signInWithGoogleRedirect(...a)); }
  startPhoneSignIn(...a: Parameters<FirebaseCore['startPhoneSignIn']>) { return this.call((c) => c.startPhoneSignIn(...a)); }
  confirmPhoneCode(...a: Parameters<FirebaseCore['confirmPhoneCode']>) { return this.call((c) => c.confirmPhoneCode(...a)); }
  signOutUser(...a: Parameters<FirebaseCore['signOutUser']>) { return this.call((c) => c.signOutUser(...a)); }
  pauseAccount(...a: Parameters<FirebaseCore['pauseAccount']>) { return this.call((c) => c.pauseAccount(...a)); }
  reactivateAccount(...a: Parameters<FirebaseCore['reactivateAccount']>) { return this.call((c) => c.reactivateAccount(...a)); }
  deleteAccount(...a: Parameters<FirebaseCore['deleteAccount']>) { return this.call((c) => c.deleteAccount(...a)); }
  updateUserProfile(...a: Parameters<FirebaseCore['updateUserProfile']>) { return this.call((c) => c.updateUserProfile(...a)); }
  deleteUserProfile(...a: Parameters<FirebaseCore['deleteUserProfile']>) { return this.call((c) => c.deleteUserProfile(...a)); }
  saveAgeVerification(...a: Parameters<FirebaseCore['saveAgeVerification']>) { return this.call((c) => c.saveAgeVerification(...a)); }
  updateLanguagePreference(...a: Parameters<FirebaseCore['updateLanguagePreference']>) { return this.call((c) => c.updateLanguagePreference(...a)); }
  getLanguagePreference(...a: Parameters<FirebaseCore['getLanguagePreference']>) { return this.call((c) => c.getLanguagePreference(...a)); }
  isWardrobeEnabled(...a: Parameters<FirebaseCore['isWardrobeEnabled']>) { return this.call((c) => c.isWardrobeEnabled(...a)); }
  isDiscoveryTabEnabled(...a: Parameters<FirebaseCore['isDiscoveryTabEnabled']>) { return this.call((c) => c.isDiscoveryTabEnabled(...a)); }
  getMinimumAgeByCountry(...a: Parameters<FirebaseCore['getMinimumAgeByCountry']>) { return this.call((c) => c.getMinimumAgeByCountry(...a)); }
  coachChat(...a: Parameters<FirebaseCore['coachChat']>) { return this.call((c) => c.coachChat(...a)); }
  trackCoachSuggestionAction(...a: Parameters<FirebaseCore['trackCoachSuggestionAction']>) { return this.call((c) => c.trackCoachSuggestionAction(...a)); }
  moderateProfileImage(...a: Parameters<FirebaseCore['moderateProfileImage']>) { return this.call((c) => c.moderateProfileImage(...a)); }
  loadCoachSessions(...a: Parameters<FirebaseCore['loadCoachSessions']>) { return this.call((c) => c.loadCoachSessions(...a)); }
  upsertCoachSession(...a: Parameters<FirebaseCore['upsertCoachSession']>) { return this.call((c) => c.upsertCoachSession(...a)); }
  deleteCoachSession(...a: Parameters<FirebaseCore['deleteCoachSession']>) { return this.call((c) => c.deleteCoachSession(...a)); }
  appendCoachMessage(...a: Parameters<FirebaseCore['appendCoachMessage']>) { return this.call((c) => c.appendCoachMessage(...a)); }
  loadCoachMessages(...a: Parameters<FirebaseCore['loadCoachMessages']>) { return this.call((c) => c.loadCoachMessages(...a)); }
  refreshProfile(...a: Parameters<FirebaseCore['refreshProfile']>) { return this.call((c) => c.refreshProfile(...a)); }
  uploadProfilePhoto(...a: Parameters<FirebaseCore['uploadProfilePhoto']>) { return this.call((c) => c.uploadProfilePhoto(...a)); }
  deleteProfilePhotos(...a: Parameters<FirebaseCore['deleteProfilePhotos']>) { return this.call((c) => c.deleteProfilePhotos(...a)); }
  getOwnPhotoUrls(...a: Parameters<FirebaseCore['getOwnPhotoUrls']>) { return this.call((c) => c.getOwnPhotoUrls(...a)); }
  saveOnboarding(...a: Parameters<FirebaseCore['saveOnboarding']>) { return this.call((c) => c.saveOnboarding(...a)); }
  updateProfile(...a: Parameters<FirebaseCore['updateProfile']>) { return this.call((c) => c.updateProfile(...a)); }
  updateLocation(...a: Parameters<FirebaseCore['updateLocation']>) { return this.call((c) => c.updateLocation(...a)); }
  setReadyToMeet(...a: Parameters<FirebaseCore['setReadyToMeet']>) { return this.call((c) => c.setReadyToMeet(...a)); }
  getBioCoaching(...a: Parameters<FirebaseCore['getBioCoaching']>) { return this.call((c) => c.getBioCoaching(...a)); }
  generateIcebreakers(...a: Parameters<FirebaseCore['generateIcebreakers']>) { return this.call((c) => c.generateIcebreakers(...a)); }
  generateSmartReply(...a: Parameters<FirebaseCore['generateSmartReply']>) { return this.call((c) => c.generateSmartReply(...a)); }
  getRealtimeCoachTips(...a: Parameters<FirebaseCore['getRealtimeCoachTips']>) { return this.call((c) => c.getRealtimeCoachTips(...a)); }
  getDatingJourney(...a: Parameters<FirebaseCore['getDatingJourney']>) { return this.call((c) => c.getDatingJourney(...a)); }
  getPhotoCoachAnalysis(...a: Parameters<FirebaseCore['getPhotoCoachAnalysis']>) { return this.call((c) => c.getPhotoCoachAnalysis(...a)); }
  getDiscoveryFeed(...a: Parameters<FirebaseCore['getDiscoveryFeed']>) { return this.call((c) => c.getDiscoveryFeed(...a)); }
  recordSwipe(...a: Parameters<FirebaseCore['recordSwipe']>) { return this.call((c) => c.recordSwipe(...a)); }
  wardrobeCatalog(...a: Parameters<FirebaseCore['wardrobeCatalog']>) { return this.call((c) => c.wardrobeCatalog(...a)); }
  wardrobeSuggest(...a: Parameters<FirebaseCore['wardrobeSuggest']>) { return this.call((c) => c.wardrobeSuggest(...a)); }
  createSecondOpinionLink(...a: Parameters<FirebaseCore['createSecondOpinionLink']>) { return this.call((c) => c.createSecondOpinionLink(...a)); }
  getDailyPicks(...a: Parameters<FirebaseCore['getDailyPicks']>) { return this.call((c) => c.getDailyPicks(...a)); }
  getPublicProfile(...a: Parameters<FirebaseCore['getPublicProfile']>) { return this.call((c) => c.getPublicProfile(...a)); }
  getMyGender(...a: Parameters<FirebaseCore['getMyGender']>) { return this.call((c) => c.getMyGender(...a)); }
  wardrobePreview(...a: Parameters<FirebaseCore['wardrobePreview']>) { return this.call((c) => c.wardrobePreview(...a)); }
  wardrobeDelete(...a: Parameters<FirebaseCore['wardrobeDelete']>) { return this.call((c) => c.wardrobeDelete(...a)); }
  markMatchRead(...a: Parameters<FirebaseCore['markMatchRead']>) { return this.call((c) => c.markMatchRead(...a)); }
  setActiveChat(...a: Parameters<FirebaseCore['setActiveChat']>) { return this.call((c) => c.setActiveChat(...a)); }
  getUserBasic(...a: Parameters<FirebaseCore['getUserBasic']>) { return this.call((c) => c.getUserBasic(...a)); }
  loadOlderMessages(...a: Parameters<FirebaseCore['loadOlderMessages']>) { return this.call((c) => c.loadOlderMessages(...a)); }
  getDateSuggestions(...a: Parameters<FirebaseCore['getDateSuggestions']>) { return this.call((c) => c.getDateSuggestions(...a)); }
  getDailyQuestion(...a: Parameters<FirebaseCore['getDailyQuestion']>) { return this.call((c) => c.getDailyQuestion(...a)); }
  answerDailyQuestion(...a: Parameters<FirebaseCore['answerDailyQuestion']>) { return this.call((c) => c.answerDailyQuestion(...a)); }
  generateDateBlueprint(...a: Parameters<FirebaseCore['generateDateBlueprint']>) { return this.call((c) => c.generateDateBlueprint(...a)); }
  sendBlueprintMessage(...a: Parameters<FirebaseCore['sendBlueprintMessage']>) { return this.call((c) => c.sendBlueprintMessage(...a)); }
  sendPlaceMessage(...a: Parameters<FirebaseCore['sendPlaceMessage']>) { return this.call((c) => c.sendPlaceMessage(...a)); }
  sendMessage(...a: Parameters<FirebaseCore['sendMessage']>) { return this.call((c) => c.sendMessage(...a)); }
  getCoachPlannerConfig(...a: Parameters<FirebaseCore['getCoachPlannerConfig']>) { return this.call((c) => c.getCoachPlannerConfig(...a)); }
  getProfileLimits(...a: Parameters<FirebaseCore['getProfileLimits']>) { return this.call((c) => c.getProfileLimits(...a)); }
  getStoreLinks(...a: Parameters<FirebaseCore['getStoreLinks']>) { return this.call((c) => c.getStoreLinks(...a)); }

  // --- Escuchas en vivo ---
  listenWardrobe(...a: Parameters<FirebaseCore['listenWardrobe']>) { return this.listen((c) => c.listenWardrobe(...a)); }
  listenSecondOpinions(...a: Parameters<FirebaseCore['listenSecondOpinions']>) { return this.listen((c) => c.listenSecondOpinions(...a)); }
  listenMatches(...a: Parameters<FirebaseCore['listenMatches']>) { return this.listen((c) => c.listenMatches(...a)); }
  listenMessages(...a: Parameters<FirebaseCore['listenMessages']>) { return this.listen((c) => c.listenMessages(...a)); }
}
