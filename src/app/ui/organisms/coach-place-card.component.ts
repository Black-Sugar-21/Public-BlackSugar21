import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UiBadgeComponent } from '../atoms/ui-badge.component';
import { UiPillComponent } from '../atoms/ui-pill.component';

/** Shape of a coach place suggestion (structurally matches the widget's PlaceCard). */
export interface CoachPlace {
  name: string;
  address: string;
  rating?: number | null;
  mapsUrl?: string;
  why?: string | null;
  perspectives?: string[];
  score?: number | null;
  tip?: string | null;
  website?: string | null;
  instagram?: string | null;
  instagramHandle?: string | null;
  venueOffer?: string | null;
  upcomingEvents?: string[] | null;
}

/**
 * ORGANISM · Coach place card — the "4-psychologist panel" venue card.
 * Composes ui-badge (fit %) + ui-pill (perspectives, Map/Web/Instagram). Markup + styles moved
 * verbatim from the coach widget (zero visual change). Tapping the card (or its Map pill) emits
 * `open`; the Web/Instagram pills are real links that navigate on their own.
 * Inherits the widget's --cw-* CSS vars (custom properties cascade into this child component).
 */
@Component({
  selector: 'coach-place-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, UiBadgeComponent, UiPillComponent],
  template: `
    <div class="cw-place" [class.best]="best" role="link" tabindex="0"
         (click)="open.emit()" (keydown.enter)="open.emit()">
      <div class="cw-place-i"><b>{{ place.name }}</b>
        @if (place.score != null) { <ui-badge>{{ place.score }}% ✦</ui-badge> }
        @else if (place.rating) { <span class="cw-rate">★ {{ place.rating }}</span> }</div>
      <small>{{ place.address }}</small>
      @if (place.why) { <p class="cw-place-why">{{ place.why }}</p> }
      @if (place.perspectives?.length) {
        <div class="cw-place-persp">@for (pp of place.perspectives!; track pp) { <ui-pill tint="purple">{{ pp }}</ui-pill> }</div>
      }
      @if (place.tip) { <p class="cw-place-tip">💡 {{ place.tip }}</p> }
      @if (place.venueOffer) { <p class="cw-place-offer">{{ place.venueOffer }}</p> }
      @if (place.upcomingEvents?.length) {
        <div class="cw-place-events">
          @for (ev of place.upcomingEvents!; track ev) {
            @if (igUrl(); as ig) {
              <a class="cw-event-pill" [href]="ig" target="_blank" rel="noopener">{{ ev }} ›</a>
            } @else {
              <span class="cw-event-pill">{{ ev }}</span>
            }
          }
        </div>
      }
      <div class="cw-place-actions">
        <ui-pill tint="gold">📍 {{ viewMapLabel }}</ui-pill>
        @if (place.website) { <ui-pill tint="neutral" [href]="place.website">🌐 {{ webLabel }}</ui-pill> }
        @if (igUrl(); as ig) {
          <ui-pill [tint]="hasEvents() ? 'gold' : 'instagram'" [href]="ig">
            📷 {{ hasEvents() ? 'Ver eventos →' : 'Instagram' }}
          </ui-pill>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .cw-place { position:relative; display:block; background:var(--cw-card); border:1px solid var(--cw-border); border-radius:16px; padding:14px 15px; text-decoration:none; cursor:pointer; transition:transform .16s ease, border-color .16s ease, box-shadow .16s ease; }
    .cw-place:hover { border-color:var(--cw-gold); transform:translateY(-2px); box-shadow:0 10px 26px rgba(0,0,0,.35); }
    .cw-place-i { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
    .cw-place-i b { color:var(--cw-text); font-size:15px; font-weight:700; line-height:1.25; }
    .cw-rate { flex:none; color:var(--cw-gold); font-size:12px; font-weight:700; white-space:nowrap; }
    .cw-place small { display:block; color:var(--cw-muted); font-size:12px; margin-top:5px; line-height:1.4; }
    .cw-place-why { margin:9px 0 0; color:var(--cw-text); font-size:12.5px; line-height:1.5; opacity:.92; }
    .cw-place-persp { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
    .cw-place-tip { margin:9px 0 0; color:var(--like-green1); font-size:12px; line-height:1.45; background:rgba(108,234,197,.08); border-left:2px solid var(--like-green2); border-radius:0 8px 8px 0; padding:7px 10px; }
    .cw-place-offer { margin:8px 0 0; color:var(--cw-muted); font-size:12px; font-style:italic; line-height:1.45; }
    .cw-place-events { display:flex; flex-wrap:wrap; gap:5px; margin-top:7px; }
    .cw-event-pill { display:inline-block; font-size:11px; font-weight:500; color:var(--gold); background:rgba(212,175,55,.1); border-radius:6px; padding:2px 8px; text-decoration:none; cursor:pointer; transition:background .14s ease; }
    .cw-event-pill:hover { background:rgba(212,175,55,.2); }
    .cw-place-actions { display:flex; flex-wrap:wrap; gap:7px; margin-top:11px; }
    .cw-place.best { border-color:rgba(212,175,55,.5); background:linear-gradient(180deg,rgba(212,175,55,.09),var(--cw-card)); box-shadow:0 6px 20px rgba(212,175,55,.1); }
    .cw-place.best::before { content:'✦'; position:absolute; top:-9px; left:14px; width:22px; height:22px; display:flex; align-items:center; justify-content:center; font-size:12px; color:var(--bg-dark); background:var(--gradient-gold); border-radius:50%; box-shadow:0 2px 6px rgba(212,175,55,.5); }
    @media (prefers-reduced-motion: reduce) { .cw-place { transition:none; } }
  `],
})
export class CoachPlaceCardComponent {
  @Input() place!: CoachPlace;
  @Input() best = false;
  @Input() viewMapLabel = '';
  @Input() webLabel = '';
  @Output() open = new EventEmitter<void>();

  hasEvents(): boolean {
    return (this.place.upcomingEvents?.length ?? 0) > 0;
  }

  /** Normalize an Instagram value (handle or URL) → full profile URL. */
  igUrl(): string | null {
    const raw = (this.place.instagram || this.place.instagramHandle || '').trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    return 'https://instagram.com/' + raw.replace(/^@/, '');
  }
}
