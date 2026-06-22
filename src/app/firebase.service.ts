import { Injectable } from '@angular/core';
import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  Auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult
} from 'firebase/auth';
import {
  getFirestore,
  Firestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  arrayUnion,
  serverTimestamp,
  increment,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit as fbLimit,
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
import {
  getRemoteConfig,
  fetchAndActivate,
  getString,
  getNumber,
  RemoteConfig
} from 'firebase/remote-config';
import {
  initializeAppCheck,
  ReCaptchaV3Provider
} from 'firebase/app-check';
import {
  getAnalytics,
  logEvent as firebaseLogEvent,
  Analytics
} from 'firebase/analytics';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import {
  getFunctions,
  httpsCallable,
  Functions
} from 'firebase/functions';
import { firebaseConfig, recaptchaSiteKey, appCheckEnabled } from './firebase.config';
import { signal } from '@angular/core';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  age?: number;
  preferences?: {
    language: string;
  };
  createdAt: Date;
  lastLogin: Date;
}

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {
  private app: FirebaseApp;
  private auth: Auth;
  private db: Firestore;
  private remoteConfig: RemoteConfig;
  private analytics: Analytics;
  private functions: Functions;
  private storage!: ReturnType<typeof getStorage>;

  currentUser = signal<User | null>(null);
  userProfile = signal<UserProfile | null>(null);
  /** False until the signed-in user's profile has been loaded/checked at least once — lets the UI
   *  gate onboarding WITHOUT flashing it for existing users during the async profile load. */
  profileChecked = signal(false);

  constructor() {
    this.app = initializeApp(firebaseConfig);
    this.auth = getAuth(this.app);
    this.db = getFirestore(this.app);
    this.remoteConfig = getRemoteConfig(this.app);
    this.analytics = getAnalytics(this.app);
    this.functions = getFunctions(this.app, 'us-central1');
    this.storage = getStorage(this.app);

    // Configurar intervalo de actualización (en desarrollo puede ser bajo)
    this.remoteConfig.settings.minimumFetchIntervalMillis = 3600000; // 1 hora

    // Configurar valores por defecto para Remote Config
    this.remoteConfig.defaultConfig = {
      store_url_ios: 'https://appdistribution.firebase.dev/i/9653bbc47bcaabe2',
      store_url_android: 'https://appdistribution.firebase.dev/i/9653bbc47bcaabe2',
      minimum_age_by_country: JSON.stringify({ "default": 18 }),
      // Homologado con iOS/Android RemoteConfigService (daily_likes_limit / coach_daily_credits).
      daily_likes_limit: 100,
      coach_daily_credits: 4,
      daily_super_likes_limit: 5
    };

    // Inicializar App Check con reCAPTCHA v3 (desactivado por defecto — ver appCheckEnabled).
    if (appCheckEnabled && recaptchaSiteKey) {
      try {
        // En desarrollo, usar modo debug para evitar errores 403
        const isLocalhost = window.location.hostname === 'localhost' ||
                           window.location.hostname === '127.0.0.1';

        if (isLocalhost) {
          // Modo debug para desarrollo local
          // Esto generará un token de debug que debe ser registrado en Firebase Console
          (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
          console.log('🔧 App Check en modo DEBUG para desarrollo local');
          console.log('📝 Si ves errores 403, copia el debug token de la consola y añádelo en:');
          console.log('   Firebase Console > App Check > Apps > Manage debug tokens');
        }

        initializeAppCheck(this.app, {
          provider: new ReCaptchaV3Provider(recaptchaSiteKey),
          isTokenAutoRefreshEnabled: true
        });

        console.log('✅ Firebase App Check inicializado con reCAPTCHA v3');
      } catch (error) {
        // En desarrollo, no bloquear la aplicación por errores de App Check
        console.warn('⚠️ Error al inicializar App Check (ignorado en desarrollo):', error);
      }
    }
    // (App Check intentionally disabled via appCheckEnabled — no warning; not enforced on any API.)

    // Listen to auth state changes
    onAuthStateChanged(this.auth, async (user) => {
      this.currentUser.set(user);
      this.profileChecked.set(false);
      if (user) {
        try { await this.loadUserProfile(user.uid); } finally { this.profileChecked.set(true); }
      } else {
        this.userProfile.set(null);
        this.profileChecked.set(true);
      }
    });
    // Complete any pending Apple redirect sign-in (popup-blocked fallback).
    this.handleRedirectResult();
  }

  // Authentication Methods
  async signIn(email: string, password: string): Promise<User> {
    const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
    await this.updateLastLogin(userCredential.user.uid);
    return userCredential.user;
  }

  async signUp(email: string, password: string, displayName?: string): Promise<User> {
    const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
    const user = userCredential.user;

    // Create user profile in Firestore
    await this.createUserProfile({
      uid: user.uid,
      email: user.email!,
      displayName: displayName || user.email!.split('@')[0],
      createdAt: new Date(),
      lastLogin: new Date(),
      preferences: {
        language: 'es'
      }
    });

    return user;
  }

  async signInWithGoogle(): Promise<User> {
    const provider = new GoogleAuthProvider();
    const userCredential = await signInWithPopup(this.auth, provider);
    const user = userCredential.user;

    // Check if user profile exists, if not create one
    const profileExists = await this.checkUserProfileExists(user.uid);
    if (!profileExists) {
      await this.createUserProfile({
        uid: user.uid,
        email: user.email!,
        displayName: user.displayName || user.email!.split('@')[0],
        photoURL: user.photoURL || undefined,
        createdAt: new Date(),
        lastLogin: new Date(),
        preferences: {
          language: 'es'
        }
      });
    } else {
      await this.updateLastLogin(user.uid);
    }

    return user;
  }

  // R64: Sign in with Apple (web). Shown only on Apple devices in the UI. Requires the Apple
  // provider enabled in Firebase Auth console (Services ID + return URL for black-sugar21.web.app).
  private appleProvider(): OAuthProvider {
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    return provider;
  }
  /** Ensure the Firestore profile exists for an OAuth (Apple) user — shared by popup + redirect paths. */
  private async ensureAppleProfile(user: User): Promise<void> {
    const profileExists = await this.checkUserProfileExists(user.uid);
    if (!profileExists) {
      await this.createUserProfile({
        uid: user.uid,
        email: user.email || `${user.uid}@privaterelay.appleid.com`,
        displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'Usuario'),
        photoURL: user.photoURL || undefined,
        createdAt: new Date(),
        lastLogin: new Date(),
        preferences: { language: 'es' }
      });
    } else {
      await this.updateLastLogin(user.uid);
    }
  }
  async signInWithApple(): Promise<User> {
    const userCredential = await signInWithPopup(this.auth, this.appleProvider());
    await this.ensureAppleProfile(userCredential.user);
    return userCredential.user;
  }
  /** Full-page redirect fallback (popups blocked / Safari). Completed by handleRedirectResult() on load. */
  async signInWithAppleRedirect(): Promise<void> {
    await signInWithRedirect(this.auth, this.appleProvider());
  }
  /** Process a pending Apple redirect sign-in on app load (creates the profile for new users). */
  private async handleRedirectResult(): Promise<void> {
    try {
      const res = await getRedirectResult(this.auth);
      if (res?.user) await this.ensureAppleProfile(res.user);
    } catch (e) { console.warn('redirect sign-in result error:', e); }
  }

  // R64: Phone sign-in (web) — invisible reCAPTCHA + SMS OTP, 2 steps.
  private phoneConfirmation: ConfirmationResult | null = null;
  private recaptchaVerifier: RecaptchaVerifier | null = null;

  async startPhoneSignIn(phoneE164: string, recaptchaContainerId: string): Promise<void> {
    if (!this.recaptchaVerifier) {
      this.recaptchaVerifier = new RecaptchaVerifier(this.auth, recaptchaContainerId, { size: 'invisible' });
    }
    this.phoneConfirmation = await signInWithPhoneNumber(this.auth, phoneE164, this.recaptchaVerifier);
  }

  async confirmPhoneCode(code: string): Promise<User> {
    if (!this.phoneConfirmation) throw new Error('no_confirmation');
    const cred = await this.phoneConfirmation.confirm(code);
    const user = cred.user;
    const profileExists = await this.checkUserProfileExists(user.uid);
    if (!profileExists) {
      await this.createUserProfile({
        uid: user.uid,
        email: user.email || `${user.uid}@phone.blacksugar21`,
        displayName: user.displayName || user.phoneNumber || 'Usuario',
        createdAt: new Date(),
        lastLogin: new Date(),
        preferences: { language: 'es' }
      });
    } else {
      await this.updateLastLogin(user.uid);
    }
    this.phoneConfirmation = null;
    return user;
  }

  async signOutUser(): Promise<void> {
    await signOut(this.auth);
  }

  /** Pause the account (soft, reversible) — hides the profile. Parity with iOS/Android pauseAccount(). */
  async pauseAccount(): Promise<void> {
    const u = this.currentUser();
    if (!u) return;
    await updateDoc(doc(this.db, 'users', u.uid), { paused: true, visible: false, pausedAt: serverTimestamp() });
  }

  /** Delete the account — calls the SAME callable as the apps (now a server-side SOFT delete:
   *  hides immediately + schedules the irreversible purge after a grace period). */
  async deleteAccount(): Promise<void> {
    const u = this.currentUser();
    if (!u) return;
    const fn = httpsCallable(this.functions, 'deleteUserData');
    await fn({ userId: u.uid, userLanguage: this.deviceLang() });
  }

  // Locale / timezone helpers (parity with iOS/Android signup fields; used by coach lang + nudges).
  private deviceLang(): string { try { return (navigator.language || 'en').split('-')[0].toLowerCase(); } catch { return 'en'; } }
  private tz(): string { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } }
  private tzOffsetMinutes(): number { try { return -new Date().getTimezoneOffset(); } catch { return 0; } }
  private tzOffsetHours(): number { try { return -new Date().getTimezoneOffset() / 60; } catch { return 0; } }

  // Firestore Methods
  private async createUserProfile(profile: UserProfile): Promise<void> {
    const userRef = doc(this.db, 'users', profile.uid);
    // Seed the server-managed counters AT CREATE — the users UPDATE rule blocks accountStatus /
    // coachMessagesRemaining, so they can ONLY be set here (parity with iOS/Android signup payload).
    let limits = { dailyLikesLimit: 100, coachDailyCredits: 4, superLikesLimit: 5 };
    try { limits = await this.getProfileLimits(); } catch { /* keep defaults */ }
    await setDoc(userRef, {
      ...profile,
      createdAt: Timestamp.fromDate(profile.createdAt),
      lastLogin: Timestamp.fromDate(profile.lastLogin),
      accountStatus: 'active',
      // CRITICAL cross-platform: Android discovery queries whereEqualTo('paused', false), which
      // EXCLUDES docs missing the field → a web profile without `paused` is invisible on Android.
      // Seed it (+ visibilityReduced) at create, exactly like iOS/Android signup.
      paused: false,
      visibilityReduced: false,
      dailyLikesRemaining: limits.dailyLikesLimit,
      dailyLikesLimit: limits.dailyLikesLimit,
      superLikesRemaining: limits.superLikesLimit,
      superLikesUsedToday: 0,
      coachMessagesRemaining: limits.coachDailyCredits,
      lastLikeResetDate: serverTimestamp(),
      lastSuperLikeResetDate: serverTimestamp(),
      lastCoachResetDate: serverTimestamp(),
      // Locale/timezone for coach language + scheduled nudges (parity with iOS/Android signup).
      deviceLanguage: this.deviceLang(),
      timezone: this.tz(),
      timezoneOffset: this.tzOffsetHours(),
      timezoneOffsetMinutes: this.tzOffsetMinutes(),
    });
    this.userProfile.set(profile);
  }

  private async loadUserProfile(uid: string): Promise<void> {
    const userRef = doc(this.db, 'users', uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const data = userSnap.data();
      this.userProfile.set({
        ...data,
        createdAt: data['createdAt']?.toDate(),
        lastLogin: data['lastLogin']?.toDate()
      } as UserProfile);
    }
  }

  private async checkUserProfileExists(uid: string): Promise<boolean> {
    const userRef = doc(this.db, 'users', uid);
    const userSnap = await getDoc(userRef);
    return userSnap.exists();
  }

  private async updateLastLogin(uid: string): Promise<void> {
    const userRef = doc(this.db, 'users', uid);
    await updateDoc(userRef, {
      lastLogin: Timestamp.fromDate(new Date())
    });
  }

  async updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
    const userRef = doc(this.db, 'users', uid);
    await updateDoc(userRef, data as any);
    await this.loadUserProfile(uid);
  }

  async deleteUserProfile(uid: string): Promise<void> {
    const userRef = doc(this.db, 'users', uid);
    await deleteDoc(userRef);
  }

  // Age Verification Storage
  async saveAgeVerification(uid: string, verified: boolean): Promise<void> {
    const userRef = doc(this.db, 'users', uid);
    await updateDoc(userRef, {
      ageVerified: verified,
      ageVerifiedAt: Timestamp.fromDate(new Date())
    });
  }

  // Language Preference Sync
  async updateLanguagePreference(uid: string, language: string): Promise<void> {
    const userRef = doc(this.db, 'users', uid);
    await updateDoc(userRef, {
      'preferences.language': language
    });
  }

  // Get user's language preference
  async getLanguagePreference(uid: string): Promise<string | null> {
    const profile = this.userProfile();
    return profile?.preferences?.language || null;
  }

  // Minimum Age by Country (from Remote Config)
  async getMinimumAgeByCountry(): Promise<Record<string, number>> {
    try {
      await fetchAndActivate(this.remoteConfig);
      const raw = getString(this.remoteConfig, 'minimum_age_by_country');
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (error) {
      console.error('Error fetching minimum_age_by_country:', error);
    }
    return { default: 18 };
  }

  // R64: authenticated coach chat for logged-in web users — calls the SAME dateCoachChat callable
  // as the apps (auth + App Check attached automatically), so the web conversation persists to the
  // user's profile + coach memory + personal agent. Anonymous visitors keep the demo endpoints.
  async coachChat(data: Record<string, unknown>): Promise<any> {
    const fn = httpsCallable(this.functions, 'dateCoachChat');
    const res = await fn(data);
    return res.data;
  }

  /**
   * AI image moderation (Gemini Vision) — same CF the iOS/Android apps call before accepting a
   * profile photo. Returns {approved, reason}. Fail-OPEN on error (server-side R17 trigger is the
   * hard gate) — matches the apps' profile-photo behavior.
   */
  async moderateProfileImage(imageBase64: string, expectedGender?: boolean | null, lang?: string): Promise<{ approved: boolean; reason: string; category?: string }> {
    try {
      const fn = httpsCallable(this.functions, 'moderateProfileImage');
      const data: Record<string, unknown> = {
        imageBase64,
        userLanguage: lang || (typeof navigator !== 'undefined' ? navigator.language : 'en'),
        isStory: false,
      };
      if (expectedGender != null) data['expectedGender'] = expectedGender;
      const res: any = (await fn(data)).data;
      return { approved: res?.approved !== false, reason: res?.reason || '', category: res?.category };
    } catch {
      return { approved: true, reason: '' }; // fail-open (server trigger enforces)
    }
  }

  // ── Coach chat SESSIONS (logged-in web → Firestore, shared with iOS/Android) ──
  // Sessions index = users/{uid}/coachSessions/{id}; messages = users/{uid}/coachChat
  // tagged with sessionId (same schema the apps use). Anonymous visitors stay on
  // localStorage (handled in the widget). Returns [] when signed out.
  /** List the user's coach sessions (newest first). */
  async loadCoachSessions(): Promise<Array<{ id: string; title: string; createdAt: number; updatedAt: number; lastMessage: string }>> {
    const u = this.currentUser(); if (!u) return [];
    try {
      const snap = await getDocs(query(collection(this.db, 'users', u.uid, 'coachSessions'), orderBy('updatedAt', 'desc')));
      return snap.docs.map((d) => {
        const x: any = d.data();
        return {
          id: d.id,
          title: x.title || '',
          createdAt: x.createdAt?.toMillis ? x.createdAt.toMillis() : 0,
          updatedAt: x.updatedAt?.toMillis ? x.updatedAt.toMillis() : 0,
          lastMessage: x.lastMessage || '',
        };
      });
    } catch { return []; }
  }
  /** Create/update a session doc (title + lastMessage + timestamps). */
  async upsertCoachSession(id: string, title: string, lastMessage: string, createdAtMs?: number): Promise<void> {
    const u = this.currentUser(); if (!u) return;
    const data: Record<string, unknown> = {
      title: (title || '').slice(0, 200),
      lastMessage: (lastMessage || '').slice(0, 120),
      updatedAt: serverTimestamp(),
    };
    if (createdAtMs) data['createdAt'] = Timestamp.fromMillis(createdAtMs);
    await setDoc(doc(this.db, 'users', u.uid, 'coachSessions', id), data, { merge: true });
  }
  /** Delete a session doc + all its messages. */
  async deleteCoachSession(id: string): Promise<void> {
    const u = this.currentUser(); if (!u) return;
    await deleteDoc(doc(this.db, 'users', u.uid, 'coachSessions', id));
    try {
      const snap = await getDocs(query(collection(this.db, 'users', u.uid, 'coachChat'), where('sessionId', '==', id)));
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    } catch { /* best-effort */ }
  }
  /** Append one chat message to coachChat (sender/message/timestamp/sessionId + rich web payload). */
  async appendCoachMessage(sessionId: string, role: 'user' | 'coach', text: string, web?: unknown): Promise<void> {
    const u = this.currentUser(); if (!u) return;
    const data: Record<string, unknown> = {
      sender: role === 'user' ? 'user' : 'coach',
      message: (text || '').slice(0, 8000),
      timestamp: serverTimestamp(),
      sessionId,
    };
    if (web) { try { data['web'] = JSON.stringify(web).slice(0, 7000); } catch { /* skip rich payload */ } }
    await addDoc(collection(this.db, 'users', u.uid, 'coachChat'), data);
  }
  /** Load a session's messages (sorted client-side by timestamp; no composite index needed). */
  async loadCoachMessages(sessionId: string): Promise<Array<Record<string, unknown>>> {
    const u = this.currentUser(); if (!u) return [];
    try {
      const snap = await getDocs(query(collection(this.db, 'users', u.uid, 'coachChat'), where('sessionId', '==', sessionId)));
      const rows = snap.docs.map((d) => {
        const x: any = d.data();
        const ts = x.timestamp?.toMillis ? x.timestamp.toMillis() : 0;
        if (x.web) { try { return { __ts: ts, ...JSON.parse(x.web) }; } catch { /* fallthrough */ } }
        return { __ts: ts, role: x.sender === 'user' ? 'user' : 'coach', text: x.message || '' };
      });
      return rows.sort((a: any, b: any) => a.__ts - b.__ts).map((r: any) => { delete r.__ts; return r; });
    } catch { return []; }
  }

  // ── Profile / onboarding (web) — same users/{uid} schema as iOS/Android ──────
  /** Re-read the current user's profile doc into the userProfile signal. */
  async refreshProfile(): Promise<void> { const u = this.currentUser(); if (u) await this.loadUserProfile(u.uid); }
  /** A profile is "complete" (discovery-eligible) once it has a userType + birthDate, like the apps. */
  isProfileComplete(): boolean {
    const p: any = this.userProfile();
    return !!(p && p.userType && p.birthDate);
  }
  /** Upload one profile photo to Storage (users/{uid}/{file}) — returns the stored filename. The
   *  discovery feed signs these names server-side, same as photos uploaded from the apps. */
  async uploadProfilePhoto(file: File, onProgress?: (pct: number) => void): Promise<string> {
    const u = this.currentUser();
    if (!u) throw new Error('not-authenticated');
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const fileName = `web_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const ref = storageRef(this.storage, `users/${u.uid}/${fileName}`);
    // Resumable upload so we can report progress (0-100%) to the user, with a timeout guard so a
    // flaky/blocked network never hangs the onboarding overlay indefinitely.
    await new Promise<void>((resolve, reject) => {
      const task = uploadBytesResumable(ref, file, { contentType: file.type || 'image/jpeg' });
      const timer = setTimeout(() => { try { task.cancel(); } catch { /* noop */ } reject(new Error('upload-timeout')); }, 60000);
      task.on('state_changed',
        (snap) => { if (onProgress && snap.totalBytes) onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)); },
        (err) => { clearTimeout(timer); reject(err); },
        () => { clearTimeout(timer); resolve(); });
    });
    return fileName;
  }
  /** Delete uploaded profile photos from Storage (used when a gender change invalidates them —
   *  parity with Android pictureRepository.deletePictures). Best-effort; ignores missing files. */
  async deleteProfilePhotos(names: string[]): Promise<void> {
    const u = this.currentUser();
    if (!u || !Array.isArray(names)) return;
    await Promise.all(names.map(async (n) => {
      try { await deleteObject(storageRef(this.storage, `users/${u.uid}/${n}`)); } catch { /* already gone */ }
    }));
  }
  /** Resolve the current user's own photo filenames to displayable URLs (for the profile view). */
  async getOwnPhotoUrls(names: string[]): Promise<string[]> {
    const u = this.currentUser();
    if (!u || !Array.isArray(names)) return [];
    const out = await Promise.all(names.slice(0, 6).map(async (n) => {
      try { return await getDownloadURL(storageRef(this.storage, `users/${u.uid}/${n}`)); } catch { return ''; }
    }));
    return out.filter(Boolean);
  }
  /** Standard base32 geohash encoder — produces the `g` field the discovery feed range-queries on
   *  (homologado con GeoHashUtils.encode en iOS/Android). Precision 9 ≈ ~4.8 m. */
  private encodeGeohash(lat: number, lng: number, precision = 9): string {
    const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
    let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
    let hash = '', bit = 0, ch = 0, even = true;
    while (hash.length < precision) {
      if (even) {
        const mid = (lngMin + lngMax) / 2;
        if (lng >= mid) { ch = (ch << 1) + 1; lngMin = mid; } else { ch = ch << 1; lngMax = mid; }
      } else {
        const mid = (latMin + latMax) / 2;
        if (lat >= mid) { ch = (ch << 1) + 1; latMin = mid; } else { ch = ch << 1; latMax = mid; }
      }
      even = !even;
      if (++bit === 5) { hash += BASE32[ch]; bit = 0; ch = 0; }
    }
    return hash;
  }

  /** Persist onboarding — writes the exact discovery-valid schema the apps read. */
  async saveOnboarding(d: { name: string; birthDate: Date; male: boolean; userType: string; orientation: string; bio?: string; latitude?: number; longitude?: number; interests?: string[]; pictures?: string[]; minAge?: number; maxAge?: number; maxDistance?: number }): Promise<void> {
    const u = this.currentUser();
    if (!u) return;
    // NOTE: accountStatus is intentionally NOT written here — it is blocked on UPDATE by the
    // users rule and is seeded at CREATE in createUserProfile(). Including it would reject the
    // whole onboarding write (audited 2026-06-21).
    const data: Record<string, unknown> = {
      name: d.name,
      birthDate: Timestamp.fromDate(d.birthDate),
      male: d.male,
      userType: d.userType,           // SUGAR_DADDY | SUGAR_MOMMY | SUGAR_BABY
      orientation: d.orientation,     // men | women | both
      onboardingCompleted: true,
      // discovery search prefs (apps write these; used as the caller's feed filters)
      minAge: d.minAge ?? 18,
      maxAge: d.maxAge ?? 99,
      maxDistance: d.maxDistance ?? 100,
    };
    if (d.bio) data['bio'] = d.bio;
    if (Array.isArray(d.interests)) data['interests'] = d.interests;
    if (Array.isArray(d.pictures) && d.pictures.length) data['pictures'] = d.pictures;
    if (typeof d.latitude === 'number' && typeof d.longitude === 'number') {
      data['latitude'] = d.latitude; data['longitude'] = d.longitude;
      // getDiscoveryFeed range-queries on `g` — without it web users never appear in the feed.
      const gh = this.encodeGeohash(d.latitude, d.longitude);
      data['g'] = gh; data['geohash'] = gh;
    }
    data['timezone'] = this.tz();
    data['timezoneOffset'] = this.tzOffsetHours();
    data['timezoneOffsetMinutes'] = this.tzOffsetMinutes();
    data['deviceLanguage'] = this.deviceLang();
    await updateDoc(doc(this.db, 'users', u.uid), data);
    await this.refreshProfile();
  }

  /** In-web profile edit (iOS EditProfileView parity) — writes ONLY update-legal fields
   *  (none are in the users-update blocklist; userType is constrained to the valid enum by the rule). */
  async updateProfile(fields: { name: string; bio: string; male: boolean; userType: string; orientation: string; interests: string[]; pictures: string[]; minAge: number; maxAge: number; maxDistance: number; latitude?: number; longitude?: number }): Promise<void> {
    const u = this.currentUser();
    if (!u) return;
    const data: Record<string, unknown> = {
      name: fields.name,
      bio: fields.bio,
      male: fields.male,
      userType: fields.userType,
      orientation: fields.orientation,
      interests: fields.interests,
      pictures: fields.pictures,
      minAge: Math.max(18, Math.min(99, Math.round(fields.minAge))),
      maxAge: Math.max(18, Math.min(99, Math.round(fields.maxAge))),
      maxDistance: Math.max(1, Math.min(500, Math.round(fields.maxDistance))),
    };
    // Location edit — write lat/lng + recompute the `g`/geohash the discovery feed range-queries on.
    if (typeof fields.latitude === 'number' && typeof fields.longitude === 'number') {
      data['latitude'] = fields.latitude; data['longitude'] = fields.longitude;
      const gh = this.encodeGeohash(fields.latitude, fields.longitude);
      data['g'] = gh; data['geohash'] = gh;
    }
    await updateDoc(doc(this.db, 'users', u.uid), data);
    await this.refreshProfile();
  }

  /** Location-only update (Discovery "enable location" flow) — writes lat/lng + the `g`/geohash the
   *  feed range-queries on. Parity with iOS updateUserLocation. */
  async updateLocation(lat: number, lng: number): Promise<void> {
    const u = this.currentUser();
    if (!u) return;
    const gh = this.encodeGeohash(lat, lng);
    await updateDoc(doc(this.db, 'users', u.uid), { latitude: lat, longitude: lng, g: gh, geohash: gh });
    await this.refreshProfile();
  }

  /** Bio coaching — SAME getBioCoaching callable iOS uses (rewrites the bio into ready options).
   *  Returns [] on error so the caller can fall back to static examples (parity with iOS). */
  async getBioCoaching(bio: string, lang: string): Promise<string[]> {
    try {
      const fn = httpsCallable(this.functions, 'getBioCoaching');
      const res: any = await fn({ userLanguage: lang || 'en', bio: (bio || '').slice(0, 1200) });
      const rewrites = res?.data?.rewrites;
      if (Array.isArray(rewrites)) return rewrites.map((r: any) => r?.text).filter((t: any) => typeof t === 'string' && t.trim());
    } catch { /* caller falls back to static examples */ }
    return [];
  }

  /** Photo Coach — SAME getPhotoCoachAnalysis callable iOS uses. Analyzes the user's SAVED photos
   *  (server reads pictureNames from the doc) and returns an overall score + top recommendations. */
  async getPhotoCoachAnalysis(lang: string): Promise<{ overallScore: number; recommendations: string[] } | null> {
    try {
      const fn = httpsCallable(this.functions, 'getPhotoCoachAnalysis');
      const res: any = await fn({ userLanguage: lang || 'en' });
      const d = res?.data || {};
      if (d.success === false) return null;
      return {
        overallScore: Number(d.overallScore) || 0,
        recommendations: Array.isArray(d.recommendations) ? d.recommendations.filter((x: any) => typeof x === 'string') : [],
      };
    } catch { return null; }
  }

  // Discovery feed (web) — SAME getDiscoveryFeed callable the apps use (V2 ranking, signed photo URLs).
  async getDiscoveryFeed(limit = 20): Promise<any[]> {
    const fn = httpsCallable(this.functions, 'getDiscoveryFeed');
    const res: any = await fn({ limit });
    return (res?.data?.profiles) || [];
  }

  // Record a swipe — faithfully mirrors iOS/Android `swipeUser`/`superLikeUser`:
  //  1) liked|passed arrayUnion + dailyLikesRemaining decrement (on like)
  //  2) swipes/{target} = {timestamp, isLike, isSuperLike} (feed exclusion)
  //  3) liked/{target} subcollection = {exists, superLike} (on like)
  //  4) if the other user already liked me back → create the match (same shape + matchId as the apps)
  // Returns the matchId when a mutual match was created, else ''.
  async recordSwipe(targetUid: string, action: 'like' | 'pass' | 'superlike'): Promise<string> {
    const u = this.currentUser();
    if (!u || !targetUid) return '';
    const isLike = action === 'like' || action === 'superlike';
    const isSuper = action === 'superlike';
    const userRef = doc(this.db, 'users', u.uid);

    const upd: Record<string, unknown> = { [isLike ? 'liked' : 'passed']: arrayUnion(targetUid) };
    if (isLike) upd['dailyLikesRemaining'] = increment(-1);
    if (isSuper) {
      upd['superLiked'] = arrayUnion(targetUid);
      // Debit the super-like quota like the apps (guard >0 so the rule's `>= 0` constraint holds).
      const sr = (this.userProfile() as any)?.superLikesRemaining;
      if (typeof sr === 'number' && sr > 0) {
        upd['superLikesRemaining'] = increment(-1);
        upd['superLikesUsedToday'] = increment(1);
      }
    }
    await updateDoc(userRef, upd);
    await setDoc(doc(this.db, 'users', u.uid, 'swipes', targetUid), { timestamp: serverTimestamp(), isLike, isSuperLike: isSuper });
    if (isLike) await setDoc(doc(this.db, 'users', u.uid, 'liked', targetUid), { exists: true, superLike: isSuper });

    if (!isLike) return '';
    // Mutual-like check → create the match instantly (same as the apps; cron is the fallback).
    try {
      const otherSnap = await getDoc(doc(this.db, 'users', targetUid));
      const other: any = otherSnap.data() || {};
      const likedBack = Array.isArray(other.liked) && other.liked.includes(u.uid);
      if (!likedBack) return '';
      const matchId = u.uid > targetUid ? u.uid + targetUid : targetUid + u.uid;
      const myType = (this.userProfile() as any)?.userType || (await getDoc(userRef)).data()?.['userType'];
      const otherType = other.userType;
      const data: Record<string, unknown> = {
        users: [u.uid, targetUid],
        usersMatched: [u.uid, targetUid],
        timestamp: serverTimestamp(),
        lastMessageTimestamp: serverTimestamp(),
        messageCount: 0,
        lastSeenTimestamps: { [u.uid]: serverTimestamp(), [targetUid]: serverTimestamp() },
      };
      if (myType && otherType) data['userTypesAtMatch'] = { [u.uid]: myType, [targetUid]: otherType };
      await setDoc(doc(this.db, 'matches', matchId), data);
      return matchId;
    } catch { return ''; }
  }

  // ── Matches + chat (web) — same Firestore schema the apps use ────────────────
  /** Live matches for the current user (matches where usersMatched contains me). Returns unsub fn. */
  listenMatches(cb: (matches: any[]) => void): () => void {
    const u = this.currentUser();
    if (!u) { cb([]); return () => {}; }
    const q = query(collection(this.db, 'matches'), where('usersMatched', 'array-contains', u.uid));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => {
        const data: any = d.data();
        const other = (data.usersMatched || []).find((x: string) => x !== u.uid) || '';
        // computed fields AFTER the spread so they win (raw Timestamp objects must not overwrite millis).
        return { ...data, id: d.id, otherUid: other, lastMessage: data.lastMessage || '', lastMessageTime: (data.lastMessageTimestamp?.toMillis?.() || data.lastMessageTime?.toMillis?.() || 0) };
      }).sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
      cb(rows);
    }, () => cb([]));
  }
  /** Mark a match as read (iOS markMessagesAsRead parity) — sets lastSeenTimestamps.{uid}=now so the
   *  unread badge clears and the other user sees it as read. */
  async markMatchRead(matchId: string): Promise<void> {
    const u = this.currentUser();
    if (!u || !matchId) return;
    try { await updateDoc(doc(this.db, 'matches', matchId), { [`lastSeenTimestamps.${u.uid}`]: serverTimestamp() }); } catch { /* best-effort */ }
  }
  /** Set/clear the user's active chat (iOS activeChat parity) — the new-message push is suppressed
   *  server-side while the recipient is actively viewing that match. */
  async setActiveChat(matchId: string | null): Promise<void> {
    const u = this.currentUser();
    if (!u) return;
    try { await updateDoc(doc(this.db, 'users', u.uid), { activeChat: matchId || '' }); } catch { /* best-effort */ }
  }

  /** Basic profile (name) for a match row — photos need signed URLs, so we use initials in the UI. */
  async getUserBasic(uid: string): Promise<{ name: string } | null> {
    try { const s = await getDoc(doc(this.db, 'users', uid)); return s.exists() ? { name: (s.data() as any).name || '' } : null; }
    catch { return null; }
  }
  /** Live messages for a match (iOS pagination parity): listens to the latest `limit` messages
   *  (desc+limit, reversed to oldest→newest). "Load older" grows `limit` and re-subscribes.
   *  cb(msgs, hasMore) — hasMore is true when the window is full (older messages may exist). */
  listenMessages(matchId: string, limit: number, cb: (msgs: any[], hasMore: boolean) => void): () => void {
    const q = query(collection(this.db, 'matches', matchId, 'messages'), orderBy('timestamp', 'desc'), fbLimit(limit));
    return onSnapshot(q, (snap) => {
      const msgs = snap.docs.map((d) => { const m: any = d.data(); return { id: d.id, ...m, ts: m.timestamp?.toMillis?.() || 0 }; }).reverse();
      cb(msgs, snap.size >= limit);
    }, () => cb([], false));
  }
  /** Fetch one older page of messages before `beforeMs` (iOS loadOlderMessages cursor parity).
   *  One-time get, oldest→newest. */
  async loadOlderMessages(matchId: string, beforeMs: number, pageSize: number): Promise<any[]> {
    const cursor = Timestamp.fromMillis(beforeMs);
    const q = query(
      collection(this.db, 'matches', matchId, 'messages'),
      where('timestamp', '<', cursor),
      orderBy('timestamp', 'desc'),
      fbLimit(pageSize),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => { const m: any = d.data(); return { id: d.id, ...m, ts: m.timestamp?.toMillis?.() || 0 }; }).reverse();
  }

  /** Send a text message — same shape as the apps; rules enforce sender/membership/first-message gate. */
  async sendMessage(matchId: string, text: string): Promise<void> {
    const u = this.currentUser();
    const body = (text || '').trim();
    if (!u || !matchId || !body) return;
    await addDoc(collection(this.db, 'matches', matchId, 'messages'), {
      message: body.slice(0, 4000), senderId: u.uid, timestamp: serverTimestamp(), type: 'text', isEphemeral: false,
    });
    // messageCount increment is REQUIRED: the first-message gate (firestore.rules R141) unlocks the
    // SUGAR_BABY reply only when messageCount>0. lastMessageTimestamp/timestamp = app match-list ordering.
    try {
      await updateDoc(doc(this.db, 'matches', matchId), {
        lastMessage: body.slice(0, 120),
        lastMessageTime: serverTimestamp(),
        lastMessageTimestamp: serverTimestamp(),
        timestamp: serverTimestamp(),
        lastMessageSenderId: u.uid,           // app parity (match-list sender preview)
        lastMessageSeq: increment(1),          // app parity (iOS deterministic message ordering)
        messageCount: increment(1),
      });
    } catch { /* match-doc update is best-effort */ }
  }

  // R62: date-planner config (coach_planner_config) — single source shared with iOS/Android.
  async getCoachPlannerConfig(): Promise<any | null> {
    try {
      await fetchAndActivate(this.remoteConfig);
      const raw = getString(this.remoteConfig, 'coach_planner_config');
      if (raw) {
        const cfg = JSON.parse(raw);
        return cfg && cfg.enabled === false ? null : cfg;
      }
    } catch (error) {
      console.warn('Error fetching coach_planner_config:', error);
    }
    return null;
  }

  // Profile-tab limits (daily likes + coach credits) — single source shared with iOS/Android RC.
  async getProfileLimits(): Promise<{ dailyLikesLimit: number; coachDailyCredits: number; superLikesLimit: number }> {
    try {
      await fetchAndActivate(this.remoteConfig);
      const likes = getNumber(this.remoteConfig, 'daily_likes_limit');
      const coach = getNumber(this.remoteConfig, 'coach_daily_credits');
      const supers = getNumber(this.remoteConfig, 'daily_super_likes_limit');
      return {
        dailyLikesLimit: likes > 0 ? likes : 100,
        coachDailyCredits: coach > 0 ? coach : 4,
        superLikesLimit: supers > 0 ? supers : 5
      };
    } catch (error) {
      console.warn('Error fetching profile limits from Remote Config:', error);
      return { dailyLikesLimit: 100, coachDailyCredits: 4, superLikesLimit: 5 };
    }
  }

  // Store Links
  async getStoreLinks(): Promise<{ ios: string; android: string }> {
    try {
      await fetchAndActivate(this.remoteConfig);
      const ios = getString(this.remoteConfig, 'store_url_ios');
      const android = getString(this.remoteConfig, 'store_url_android');

      return {
        ios: ios || '#',
        android: android || '#'
      };
    } catch (error) {
      console.error('Error fetching store links from Remote Config:', error);
      return { ios: '#', android: '#' };
    }
  }

  // Analytics — anonymous usage analytics (disclosed in Terms & Privacy). No cookies.
  logEvent(eventName: string, params?: Record<string, unknown>): void {
    try {
      firebaseLogEvent(this.analytics, eventName, params);
    } catch (error) {
      console.warn('Error logging analytics event:', error);
    }
  }
}
