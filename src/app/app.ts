import { Component, signal, OnInit, OnDestroy, AfterViewInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { TranslationService } from './translation.service';
import { FirebaseService } from './firebase.service';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy, AfterViewInit {
  private isBrowser: boolean;
  private gsapCtx: gsap.Context | null = null;
  protected readonly title = signal('Black Sugar 21');
  protected readonly ageVerified = signal(false);
  protected readonly storeLinks = signal({ ios: '#', android: '#' });
  protected readonly mobileMenuOpen = signal(false);
  protected readonly legalAge = signal(18);

  // Hero carousel (signals for reliable change detection)
  currentSlide = signal(0);
  private carouselInterval: any;
  private readonly totalSlides = 6;

  showTesterModal = signal(false);
  testerEmail = signal('');
  testerStatus = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  testerJoinedGroup = signal(false);

  constructor(
    public translate: TranslationService,
    public firebase: FirebaseService,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
    if (this.isBrowser) {
      gsap.registerPlugin(ScrollTrigger);
    }
  }

  private initGsapAnimations() {
    if (this.gsapCtx) return; // Already initialized
    // Check if hero section exists in DOM
    if (!document.querySelector('.hero-section')) return;

    this.gsapCtx = gsap.context(() => {
      // 1. Hero Timeline — coordinated entrance
      const heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      heroTl
        .from('.logo-container', { scale: 0, opacity: 0, duration: 0.8, ease: 'back.out(1.7)' })
        .from('.hero-section h1', { y: 40, opacity: 0, duration: 0.7 }, '-=0.3')
        .from('.tagline', { y: 30, opacity: 0, duration: 0.6 }, '-=0.3')
        .from('.sub-tagline', { y: 30, opacity: 0, duration: 0.6 }, '-=0.4')
        .from('.download-buttons', { y: 20, opacity: 0, scale: 0.95, duration: 0.6 }, '-=0.3')
        .from('.hero-carousel', { y: 30, opacity: 0, duration: 0.8 }, '-=0.3');

      // 2. ScrollTrigger — Coach section reveal
      gsap.from('.coach-section-inner', {
        scrollTrigger: {
          trigger: '.coach-section',
          start: 'top 80%',
          toggleActions: 'play none none none',
        },
        y: 60,
        opacity: 0,
        duration: 1,
        ease: 'power2.out',
      });

      // Coach phones — enter from sides
      gsap.from('.coach-phone-mockup', {
        scrollTrigger: {
          trigger: '.coach-section',
          start: 'top 75%',
        },
        x: -80,
        opacity: 0,
        duration: 1,
        ease: 'power2.out',
      });

      gsap.from('.chat-phone', {
        scrollTrigger: {
          trigger: '.coach-section',
          start: 'top 75%',
        },
        x: 80,
        opacity: 0,
        duration: 1,
        delay: 0.2,
        ease: 'power2.out',
      });

      // Coach features list — stagger
      gsap.from('.coach-feature-item', {
        scrollTrigger: {
          trigger: '.coach-features-list',
          start: 'top 85%',
        },
        y: 25,
        opacity: 0,
        duration: 0.5,
        stagger: 0.15,
        ease: 'power2.out',
      });

      // 3. ScrollTrigger — Features cards stagger
      gsap.from('.feature-card', {
        scrollTrigger: {
          trigger: '.features-grid',
          start: 'top 80%',
        },
        y: 50,
        opacity: 0,
        scale: 0.95,
        duration: 0.7,
        stagger: 0.2,
        ease: 'power2.out',
      });

      // 4. Parallax — Hero section subtle
      gsap.to('.hero-section', {
        scrollTrigger: {
          trigger: '.hero-section',
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
        backgroundPositionY: '30%',
        ease: 'none',
      });

      // 5. Footer reveal
      gsap.from('.footer-content', {
        scrollTrigger: {
          trigger: 'footer',
          start: 'top 90%',
        },
        y: 30,
        opacity: 0,
        duration: 0.8,
        ease: 'power2.out',
      });
    });

    // 6. Carousel auto-play when visible
    this.setupCarouselObserver();
  }

  ngAfterViewInit() {
    if (!this.isBrowser) return;
    // Try init immediately if age already verified, otherwise wait
    setTimeout(() => this.initGsapAnimations(), 100);
  }

  ngOnDestroy() {
    this.gsapCtx?.revert();
    this.stopCarousel();
  }

  private dotTween: gsap.core.Tween | null = null;
  private carouselObserver: IntersectionObserver | null = null;
  private carouselVisible = false;

  private setupCarouselObserver() {
    const el = document.querySelector('.hero-carousel');
    if (!el) return;

    this.carouselObserver = new IntersectionObserver(
      (entries) => {
        const isVisible = entries[0]?.isIntersecting ?? false;
        if (isVisible && !this.carouselVisible) {
          this.carouselVisible = true;
          this.animateDot();
        } else if (!isVisible && this.carouselVisible) {
          this.carouselVisible = false;
          this.pauseCarousel();
        }
      },
      { threshold: 0.3 }
    );
    this.carouselObserver.observe(el);
  }

  private animateDot() {
    this.pauseCarousel();
    const fills = document.querySelectorAll('.carousel-dot-fill');
    gsap.set(fills, { width: '0%' });
    const currentFill = fills[this.currentSlide()];
    if (!currentFill) return;

    this.dotTween = gsap.to(currentFill, {
      width: '100%',
      duration: 5,
      ease: 'none',
      onComplete: () => {
        if (!this.carouselVisible) return;
        this.currentSlide.set((this.currentSlide() + 1) % this.totalSlides);
        this.animateDot();
      }
    });
  }

  private pauseCarousel() {
    if (this.dotTween) {
      this.dotTween.kill();
      this.dotTween = null;
    }
  }

  private stopCarousel() {
    this.pauseCarousel();
    if (this.carouselObserver) {
      this.carouselObserver.disconnect();
      this.carouselObserver = null;
    }
  }

  goToSlide(index: number) {
    this.currentSlide.set(index);
    if (this.carouselVisible) {
      this.animateDot();
    }
  }

  ngOnInit() {
    // Carousel starts when visible (IntersectionObserver in initGsapAnimations)

    // Detect legal age from Remote Config + timezone
    this.detectAndSetLegalAge();

    // Check localStorage for age verification
    if (typeof localStorage !== 'undefined') {
      const verified = localStorage.getItem('ageVerified');
      if (verified === 'true') {
        this.ageVerified.set(true);
        // Init GSAP after DOM renders
        setTimeout(() => this.initGsapAnimations(), 300);
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
    // Init GSAP after DOM renders the main content
    setTimeout(() => this.initGsapAnimations(), 300);
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
