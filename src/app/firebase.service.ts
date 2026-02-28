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
  signInWithPopup
} from 'firebase/auth';
import {
  getFirestore,
  Firestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
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
import { firebaseConfig, recaptchaSiteKey } from './firebase.config';
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

  currentUser = signal<User | null>(null);
  userProfile = signal<UserProfile | null>(null);

  constructor() {
    this.app = initializeApp(firebaseConfig);
    this.auth = getAuth(this.app);
    this.db = getFirestore(this.app);
    this.remoteConfig = getRemoteConfig(this.app);

    // Configurar intervalo de actualización (en desarrollo puede ser bajo)
    this.remoteConfig.settings.minimumFetchIntervalMillis = 3600000; // 1 hora

    // Configurar valores por defecto para Remote Config
    this.remoteConfig.defaultConfig = {
      store_url_ios: 'https://appdistribution.firebase.dev/i/9653bbc47bcaabe2',
      store_url_android: 'https://appdistribution.firebase.dev/i/9653bbc47bcaabe2',
      minimum_age_by_country: JSON.stringify({ "default": 18 })
    };

    // Inicializar App Check con reCAPTCHA v3
    if (recaptchaSiteKey) {
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
}
