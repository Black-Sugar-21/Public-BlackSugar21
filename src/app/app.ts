import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { TranslationService } from './translation.service';
import { FirebaseService } from './firebase.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  protected readonly title = signal('Black Sugar 21');
  protected readonly ageVerified = signal(false);
  protected readonly storeLinks = signal({ ios: '#', android: '#' });
  protected readonly mobileMenuOpen = signal(false);
  protected readonly legalAge = signal(18);

  showTesterModal = signal(false);
  testerEmail = signal('');
  testerStatus = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  testerJoinedGroup = signal(false);

  constructor(
    public translate: TranslationService,
    public firebase: FirebaseService,
    private router: Router
  ) {}

  ngOnInit() {
    // Detect legal age from Remote Config + timezone
    this.detectAndSetLegalAge();

    // Check localStorage for age verification
    if (typeof localStorage !== 'undefined') {
      const verified = localStorage.getItem('ageVerified');
      if (verified === 'true') {
        this.ageVerified.set(true);
      }
    }

    // Fetch store links
    this.firebase.getStoreLinks().then(links => {
      if (links) {
        this.storeLinks.set(links);
      }
    });

    // Sync language preference from Firebase if user is logged in
    if (this.firebase.currentUser()) {
      this.syncLanguageFromFirebase();
    }

    // Track page views with Firebase Analytics
    this.trackPageViews();

    // Track traffic source, device, and landing info
    this.trackVisitorInfo();
  }

  private trackVisitorInfo(): void {
    // Traffic source (UTM params or referrer)
    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get('utm_source') || '';
    const utmMedium = params.get('utm_medium') || '';
    const utmCampaign = params.get('utm_campaign') || '';
    const referrer = document.referrer || 'direct';

    // Device info
    const ua = navigator.userAgent;
    const isMobile = /iPhone|iPad|Android|Mobile/i.test(ua);
    const isIOS = /iPhone|iPad/i.test(ua);
    const isAndroid = /Android/i.test(ua);
    const platform = isIOS ? 'iOS' : isAndroid ? 'Android' : 'Desktop';

    // Browser language
    const browserLang = navigator.language || 'unknown';

    // Country from timezone
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';

    this.firebase.logEvent('visitor_info', {
      traffic_source: utmSource || (referrer.includes('google') ? 'google' : referrer.includes('facebook') ? 'facebook' : referrer.includes('instagram') ? 'instagram' : referrer.includes('tiktok') ? 'tiktok' : referrer === 'direct' ? 'direct' : 'other'),
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      referrer: referrer.substring(0, 100),
      platform,
      is_mobile: isMobile,
      browser_language: browserLang,
      timezone,
      landing_page: window.location.pathname,
      screen_width: window.screen.width,
      screen_height: window.screen.height,
    });
  }

  async verifyAge() {
    this.ageVerified.set(true);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ageVerified', 'true');
    }
    this.firebase.logEvent('age_verified', {});

    // Save to Firebase if user is logged in
    const user = this.firebase.currentUser();
    if (user) {
      try {
        await this.firebase.saveAgeVerification(user.uid, true);
      } catch (error) {
        console.error('Error saving age verification to Firebase:', error);
      }
    }
  }

  t(key: string): string {
    return this.translate.translate(key);
  }

  translateWithParams(key: string, params: Record<string, string | number>): string {
    return this.translate.translate(key, params);
  }

  async toggleLanguage(): Promise<void> {
    this.translate.toggleLanguage();

    // Sync to Firebase if user is logged in
    const user = this.firebase.currentUser();
    if (user) {
      try {
        await this.firebase.updateLanguagePreference(user.uid, this.translate.currentLanguage());
      } catch (error) {
        console.error('Error syncing language to Firebase:', error);
      }
    }
  }

  getCurrentLanguage(): string {
    return this.translate.currentLanguage();
  }

  private async syncLanguageFromFirebase(): Promise<void> {
    const user = this.firebase.currentUser();
    if (user) {
      try {
        const savedLang = await this.firebase.getLanguagePreference(user.uid);
        if (savedLang) {
          this.translate.setLanguage(savedLang as 'es' | 'en');
        }
      } catch (error) {
        console.error('Error loading language from Firebase:', error);
      }
    }
  }

  // Permitir acceder a páginas legales sin pasar por el age gate
  isLegalRoute(): boolean {
    try {
      const url = this.router.url || '';
      return url.startsWith('/terms') || url.startsWith('/privacy');
    } catch (e) {
      return false;
    }
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.set(!this.mobileMenuOpen());
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  private trackPageViews(): void {
    // Log initial page view (landing page)
    const initialPage = this.router.url || '/';
    this.firebase.logEvent('screen_view', {
      page_path: initialPage,
      page_title: this.getPageName(initialPage)
    });

    // Log subsequent navigations
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.firebase.logEvent('screen_view', {
          page_path: event.urlAfterRedirects,
          page_title: this.getPageName(event.urlAfterRedirects)
        });
      });
  }

  private getPageName(url: string): string {
    const pageNames: Record<string, string> = {
      '/': 'Home',
      '/terms': 'Terms',
      '/privacy': 'Privacy',
      '/data-deletion': 'Data Deletion',
      '/moderation-policy': 'Moderation Policy',
      '/politicas-moderacion': 'Moderation Policy',
      '/safety-standards': 'Safety Standards'
    };
    return pageNames[url] ?? url;
  }

  /**
   * Detect the user's country from timezone and fetch the legal age
   * from Firebase Remote Config (minimum_age_by_country).
   */
  async requestBetaAccess() {
    const email = this.testerEmail().trim().toLowerCase();
    // Validate email format: user@domain.ext
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!email || !emailRegex.test(email)) {
      this.testerStatus.set('error');
      return;
    }

    this.testerStatus.set('loading');

    try {
      // 1. Save to Firestore
      const { getFirestore, collection, addDoc, serverTimestamp } = await import('firebase/firestore');
      const db = getFirestore();
      await addDoc(collection(db, 'testerSignups'), {
        email,
        platform: 'android',
        status: 'pending',
        createdAt: serverTimestamp(),
        language: this.translate.currentLanguage(),
      });

      // 2. Track event + show success (admin gets push notification via CF)
      this.firebase.logEvent('tester_signup', { email_domain: email.split('@')[1] });
      this.testerStatus.set('success');
    } catch (err) {
      console.error('Tester signup error:', err);
      this.testerStatus.set('error');
    }
  }

  private async detectAndSetLegalAge(): Promise<void> {
    const country = this.detectCountryFromTimezone();

    try {
      const ageMap = await this.firebase.getMinimumAgeByCountry();
      const age = ageMap[country] ?? ageMap['default'] ?? 18;
      this.legalAge.set(age);
    } catch (_) {
      this.legalAge.set(18);
    }
  }

  /**
   * Map the user's IANA timezone to a country code.
   * Uses Intl API (no external calls needed).
   */
  private detectCountryFromTimezone(): string {
    const timezoneCountry: Record<string, string> = {
      // United States
      'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
      'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US',
      'Pacific/Honolulu': 'US', 'America/Detroit': 'US', 'America/Indiana/Indianapolis': 'US',
      'America/Boise': 'US', 'America/Juneau': 'US', 'America/Adak': 'US',
      // Latin America
      'America/Mexico_City': 'MX', 'America/Cancun': 'MX', 'America/Monterrey': 'MX',
      'America/Bogota': 'CO', 'America/Lima': 'PE',
      'America/Santiago': 'CL', 'America/Buenos_Aires': 'AR', 'America/Argentina/Buenos_Aires': 'AR',
      'America/Sao_Paulo': 'BR', 'America/Recife': 'BR', 'America/Manaus': 'BR',
      'America/Puerto_Rico': 'PR',
      // Asia
      'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Bangkok': 'TH',
      'Asia/Jakarta': 'ID', 'Asia/Makassar': 'ID', 'Asia/Jayapura': 'ID',
      'Asia/Singapore': 'SG', 'Asia/Kolkata': 'IN', 'Asia/Shanghai': 'CN',
      'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA',
      // Europe
      'Europe/London': 'GB', 'Europe/Berlin': 'DE', 'Europe/Paris': 'FR',
      'Europe/Madrid': 'ES', 'Europe/Rome': 'IT', 'Europe/Lisbon': 'PT',
      'Europe/Moscow': 'RU',
      // Oceania
      'Pacific/Auckland': 'NZ', 'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU',
      'Australia/Perth': 'AU',
      // Canada
      'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA',
    };

    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return timezoneCountry[tz] ?? 'default';
    } catch (_) {
      return 'default';
    }
  }
}
