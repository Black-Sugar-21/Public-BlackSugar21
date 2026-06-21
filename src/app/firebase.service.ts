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
  getDownloadURL,
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
      minimum_age_by_country: JSON.stringify({ "default": 18 })
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
    } else {
      console.warn('⚠️ App Check no configurado - falta recaptchaSiteKey en firebase.config.ts');
    }

    // Listen to auth state changes
    onAuthStateChanged(this.auth, async (user) => {
      this.currentUser.set(user);
      if (user) {
        await this.loadUserProfile(user.uid);
      } else {
        this.userProfile.set(null);
      }
    });
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
  async signInWithApple(): Promise<User> {
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    const userCredential = await signInWithPopup(this.auth, provider);
    const user = userCredential.user;

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

    return user;
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

  // Firestore Methods
  private async createUserProfile(profile: UserProfile): Promise<void> {
    const userRef = doc(this.db, 'users', profile.uid);
    await setDoc(userRef, {
      ...profile,
      createdAt: Timestamp.fromDate(profile.createdAt),
      lastLogin: Timestamp.fromDate(profile.lastLogin)
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
  async uploadProfilePhoto(file: File): Promise<string> {
    const u = this.currentUser();
    if (!u) throw new Error('not-authenticated');
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const fileName = `web_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await uploadBytes(storageRef(this.storage, `users/${u.uid}/${fileName}`), file, { contentType: file.type || 'image/jpeg' });
    return fileName;
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
  /** Persist onboarding — writes the exact discovery-valid schema the apps read. */
  async saveOnboarding(d: { name: string; birthDate: Date; male: boolean; userType: string; orientation: string; bio?: string; latitude?: number; longitude?: number; interests?: string[]; pictures?: string[] }): Promise<void> {
    const u = this.currentUser();
    if (!u) return;
    const data: Record<string, unknown> = {
      name: d.name,
      birthDate: Timestamp.fromDate(d.birthDate),
      male: d.male,
      userType: d.userType,           // SUGAR_DADDY | SUGAR_MOMMY | SUGAR_BABY
      orientation: d.orientation,     // men | women | both
      onboardingCompleted: true,
      accountStatus: 'active',
    };
    if (d.bio) data['bio'] = d.bio;
    if (Array.isArray(d.interests)) data['interests'] = d.interests;
    if (Array.isArray(d.pictures) && d.pictures.length) data['pictures'] = d.pictures;
    if (typeof d.latitude === 'number' && typeof d.longitude === 'number') {
      data['latitude'] = d.latitude; data['longitude'] = d.longitude;
    }
    await updateDoc(doc(this.db, 'users', u.uid), data);
    await this.refreshProfile();
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
    if (isSuper) upd['superLiked'] = arrayUnion(targetUid);
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
        return { id: d.id, otherUid: other, lastMessage: data.lastMessage || '', lastMessageTime: data.lastMessageTime?.toMillis?.() || 0, ...data };
      }).sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
      cb(rows);
    }, () => cb([]));
  }
  /** Basic profile (name) for a match row — photos need signed URLs, so we use initials in the UI. */
  async getUserBasic(uid: string): Promise<{ name: string } | null> {
    try { const s = await getDoc(doc(this.db, 'users', uid)); return s.exists() ? { name: (s.data() as any).name || '' } : null; }
    catch { return null; }
  }
  /** Live messages for a match, oldest→newest. Returns unsub fn. */
  listenMessages(matchId: string, cb: (msgs: any[]) => void): () => void {
    const q = query(collection(this.db, 'matches', matchId, 'messages'), orderBy('timestamp', 'asc'), fbLimit(200));
    return onSnapshot(q, (snap) => {
      cb(snap.docs.map((d) => { const m: any = d.data(); return { id: d.id, ...m, ts: m.timestamp?.toMillis?.() || 0 }; }));
    }, () => cb([]));
  }
  /** Send a text message — same shape as the apps; rules enforce sender/membership/first-message gate. */
  async sendMessage(matchId: string, text: string): Promise<void> {
    const u = this.currentUser();
    const body = (text || '').trim();
    if (!u || !matchId || !body) return;
    await addDoc(collection(this.db, 'matches', matchId, 'messages'), {
      message: body.slice(0, 4000), senderId: u.uid, timestamp: serverTimestamp(), type: 'text', isEphemeral: false,
    });
    try { await updateDoc(doc(this.db, 'matches', matchId), { lastMessage: body.slice(0, 120), lastMessageTime: serverTimestamp() }); } catch { /* lastMessage is best-effort */ }
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
