import {
  Component, ChangeDetectionStrategy, Input, Output, EventEmitter,
  signal, computed, effect, ElementRef, HostListener, Inject, PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { getCountries, getCountryCallingCode, AsYouType, isValidPhoneNumber, type CountryCode } from 'libphonenumber-js';

interface CountryItem { iso: CountryCode; name: string; code: string; flag: string; }

/**
 * Atomic phone input with a searchable country selector — web parity with the iOS country picker.
 * • Auto-detects the country from the browser locale (navigator.languages region).
 * • Flag + dial code button → searchable/filterable dropdown (easy for the user).
 * • Live formats as you type (AsYouType) and validates per-country with libphonenumber-js.
 * Emits { e164, valid } via (valueChange) so the parent can gate "Send code" + send a clean E.164.
 * Pure signal/computed/effect; OnPush.
 */
@Component({
  selector: 'ui-phone-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pi" [class.open]="open()">
      <div class="pi-row">
        <button type="button" class="pi-country" (click)="toggle()" [attr.aria-expanded]="open()" aria-haspopup="listbox">
          <span class="pi-flag">{{ current()?.flag }}</span>
          <span class="pi-code">+{{ dialCode() }}</span>
          <span class="pi-caret" [class.up]="open()">▾</span>
        </button>
        <input class="pi-num" type="tel" inputmode="tel" autocomplete="tel-national"
               [(ngModel)]="national" (ngModelChange)="onInput()" [placeholder]="numberPlaceholder" [attr.aria-label]="'Phone number'" />
      </div>

      @if (open()) {
        <div class="pi-pop" role="listbox">
          <input #q class="pi-search" [(ngModel)]="queryModel" (ngModelChange)="query.set($event)"
                 [placeholder]="searchPlaceholder" autocomplete="off" autocapitalize="off" spellcheck="false" />
          <div class="pi-list">
            @for (c of filtered(); track c.iso) {
              <button type="button" class="pi-item" [class.sel]="c.iso === country()" (click)="select(c.iso)" role="option" [attr.aria-selected]="c.iso === country()">
                <span class="pi-flag">{{ c.flag }}</span>
                <span class="pi-name">{{ c.name }}</span>
                <span class="pi-icode">+{{ c.code }}</span>
              </button>
            } @empty {
              <div class="pi-empty">—</div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .pi { position:relative; width:100%; }
    .pi-row { display:flex; gap:8px; }
    /* Country selector button */
    .pi-country { flex:none; display:flex; align-items:center; gap:5px; padding:0 10px 0 12px; height:50px; border-radius:14px;
      border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.05); color:var(--text-primary,#fff); font-family:inherit; font-size:15px; cursor:pointer;
      -webkit-tap-highlight-color:transparent; touch-action:manipulation; transition:border-color .16s ease, background .16s ease; }
    .pi-country:hover { border-color:color-mix(in srgb, var(--gold) 40%, transparent); background:rgba(255,255,255,.08); }
    .pi-flag { font-size:19px; line-height:1; }
    .pi-code { font-weight:600; font-size:15px; }
    .pi-caret { font-size:10px; color:var(--text-muted,#B0B0B0); transition:transform .2s ease; margin-left:2px; }
    .pi-caret.up { transform:rotate(180deg); }
    /* Phone number input */
    .pi-num { flex:1; min-width:0; height:50px; padding:0 16px; border-radius:14px;
      border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.05);
      color:var(--text-primary,#fff); font-family:inherit; font-size:16px; outline:none;
      transition:border-color .16s ease; }
    .pi-num:focus { border-color:color-mix(in srgb, var(--gold) 50%, transparent); }
    .pi-num::placeholder { color:var(--text-muted,#707070); }
    /* Dropdown panel */
    .pi-pop { position:absolute; z-index:30; top:calc(100% + 8px); left:0; right:0; max-height:300px; display:flex; flex-direction:column;
      background:#1C1C1E; border:1px solid rgba(255,255,255,.1); border-radius:16px; overflow:hidden;
      box-shadow:0 16px 48px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.04);
      animation:piIn .18s cubic-bezier(.4,0,.2,1); }
    @keyframes piIn { from { opacity:0; transform:translateY(-6px) scale(.98); } to { opacity:1; transform:none; } }
    /* Search input inside dropdown */
    .pi-search { display:block; box-sizing:border-box; width:calc(100% - 20px); margin:10px 10px 4px; height:40px;
      padding:0 14px; border-radius:10px; border:1.5px solid rgba(255,255,255,.1);
      background:rgba(255,255,255,.07); color:var(--text-primary,#fff); font-family:inherit; font-size:15px; outline:none;
      transition:border-color .16s ease; }
    .pi-search:focus { border-color:color-mix(in srgb, var(--gold) 40%, transparent); }
    .pi-search::placeholder { color:var(--text-muted,#666); }
    /* Country list */
    .pi-list { overflow-y:auto; -webkit-overflow-scrolling:touch; padding:2px 0 8px; }
    .pi-list::-webkit-scrollbar { width:3px; }
    .pi-list::-webkit-scrollbar-track { background:transparent; }
    .pi-list::-webkit-scrollbar-thumb { background:color-mix(in srgb, var(--gold) 25%, transparent); border-radius:2px; }
    .pi-item { width:100%; box-sizing:border-box; display:flex; align-items:center; gap:10px; padding:10px 14px; border:none; background:none; cursor:pointer;
      color:var(--text-primary,#fff); font-family:inherit; font-size:14px; text-align:left;
      -webkit-tap-highlight-color:transparent; transition:background .12s ease; }
    .pi-item:hover { background:rgba(255,255,255,.06); }
    .pi-item.sel { background:color-mix(in srgb, var(--gold) 10%, transparent); }
    .pi-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .pi-icode { color:var(--text-muted,#888); font-variant-numeric:tabular-nums; font-size:13px; }
    .pi-empty { padding:16px; text-align:center; color:var(--text-muted,#B0B0B0); font-size:14px; }
    @media (prefers-reduced-motion: reduce) { .pi-pop { animation:none; } }
  `],
})
export class UiPhoneInputComponent {
  @Input() set lang(v: string) { this._lang.set((v || 'en').split('-')[0]); }
  @Input() searchPlaceholder = 'Search country';
  @Input() numberPlaceholder = 'Phone number';
  /** Emits the assembled E.164 number and whether it's a valid number for the selected country. */
  @Output() valueChange = new EventEmitter<{ e164: string; valid: boolean }>();

  private readonly _lang = signal('en');
  readonly open = signal(false);
  readonly query = signal('');
  queryModel = '';
  readonly country = signal<CountryCode>('US');
  national = '';
  private readonly nationalSig = signal('');

  private flagOf(iso: string): string {
    try { return iso.replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0))); } catch { return ''; }
  }

  /** Locale list for country names: the BROWSER's preferred languages first (navigator.languages),
   *  then the app language, then English — so names render in the user's browser language. */
  private nameLocales(): string[] {
    const out: string[] = [];
    try { for (const l of (navigator.languages || [navigator.language] || [])) if (l) out.push(l); } catch { /* SSR */ }
    out.push(this._lang(), 'en');
    return out.filter(Boolean);
  }
  readonly countries = computed<CountryItem[]>(() => {
    const locales = this.nameLocales();
    let dn: Intl.DisplayNames | null = null;
    try { dn = new Intl.DisplayNames(locales, { type: 'region' }); } catch { try { dn = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { dn = null; } }
    const sortLocale = locales[0] || 'en';
    return getCountries()
      .map((iso) => ({ iso, code: getCountryCallingCode(iso), name: (dn && dn.of(iso)) || iso, flag: this.flagOf(iso) }))
      .sort((a, b) => a.name.localeCompare(b.name, sortLocale));
  });

  readonly filtered = computed<CountryItem[]>(() => {
    const q = this.query().trim().toLowerCase();
    const list = this.countries();
    if (!q) return list;
    return list.filter((c) => c.name.toLowerCase().includes(q) || ('+' + c.code).includes(q) || c.iso.toLowerCase().includes(q));
  });

  readonly current = computed<CountryItem | undefined>(() => {
    const iso = this.country();
    return this.countries().find((c) => c.iso === iso);
  });
  readonly dialCode = computed(() => { try { return getCountryCallingCode(this.country()); } catch { return ''; } });

  readonly e164 = computed(() => {
    const digits = this.nationalSig().replace(/\D/g, '');
    if (!digits) return '';
    return '+' + this.dialCode() + digits;
  });
  readonly isValid = computed(() => {
    const e = this.e164();
    try { return !!e && isValidPhoneNumber(e); } catch { return false; }
  });

  constructor(@Inject(PLATFORM_ID) platformId: object, private hostRef: ElementRef) {
    if (isPlatformBrowser(platformId)) {
      try {
        const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]) || [];
        const valid = getCountries() as string[];
        for (const l of langs) {
          const m = /[-_]([A-Za-z]{2})(?:[-_]|$)/.exec(l || '');
          if (m && valid.includes(m[1].toUpperCase())) { this.country.set(m[1].toUpperCase() as CountryCode); break; }
        }
      } catch { /* keep default US */ }
    }
    // Emit whenever the assembled number or its validity changes (signal-driven).
    effect(() => { this.valueChange.emit({ e164: this.e164(), valid: this.isValid() }); });
  }

  onInput() {
    // Live-format the national part for the selected country; keep the formatted text in the field.
    try { this.national = new AsYouType(this.country()).input(this.national); } catch { /* leave as typed */ }
    this.nationalSig.set(this.national);
  }
  select(iso: CountryCode) {
    this.country.set(iso);
    this.open.set(false);
    this.query.set(''); this.queryModel = '';
    if (this.national) this.onInput(); // re-format for the new country
  }
  toggle() { this.open.update((o) => !o); if (!this.open()) { this.query.set(''); this.queryModel = ''; } }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent) {
    if (this.open() && this.hostRef?.nativeElement && !this.hostRef.nativeElement.contains(e.target as Node)) this.open.set(false);
  }
}
