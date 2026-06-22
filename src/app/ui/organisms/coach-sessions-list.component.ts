import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UiSkeletonRowComponent } from '../molecules/ui-skeleton-row.component';

export interface CoachSessionItem { id: string; title: string; updatedAt: number; active: boolean; }

/**
 * ORGANISM · Coach sessions list — the inner content of the chat-history picker
 * ("New conversation" + rows + skeleton + empty). Composes ui-skeleton-row. Markup + .cw-hist-*
 * styles moved verbatim from the coach widget (inherits its --cw-* vars → identical look).
 * The dialog chrome (backdrop / close / title) stays in the widget.
 */
@Component({
  selector: 'coach-sessions-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, UiSkeletonRowComponent],
  template: `
    <button class="cw-hist-new" (click)="newChat.emit()">＋ {{ newLabel }}</button>
    @if (loading) {
      @for (s of [0,1,2,3,4]; track s) { <ui-skeleton-row /> }
    } @else {
      @for (c of sessions; track c.id) {
        <button class="cw-hist-row" [class.active]="c.active" (click)="select.emit(c.id)">
          <span class="cw-hist-title">{{ c.title }}</span>
          <span class="cw-hist-time">{{ relTime(c.updatedAt) }}</span>
          <span class="cw-hist-del" (click)="onDelete(c.id, $event)" role="button" [attr.aria-label]="deleteAria">🗑</span>
        </button>
      }
      @if (sessions.length === 0) { <p class="cw-hist-empty">{{ emptyLabel }}</p> }
    }
  `,
  styles: [`
    .cw-hist-new { width:100%; text-align:left; background:rgba(212,175,55,.10); border:1px solid rgba(212,175,55,.3); color:var(--cw-gold); font-size:13px; font-weight:600; border-radius:12px; padding:11px 12px; cursor:pointer; margin:6px 0 12px; }
    .cw-hist-new:hover { background:rgba(212,175,55,.18); }
    .cw-hist-row { display:flex; align-items:center; gap:8px; width:100%; text-align:left; background:none; border:none; border-radius:12px; padding:11px 10px; cursor:pointer; color:var(--cw-text); }
    .cw-hist-row:hover { background:rgba(255,255,255,.05); }
    .cw-hist-row.active { background:rgba(156,89,234,.12); }
    .cw-hist-title { flex:1; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .cw-hist-time { font-size:11px; color:var(--cw-muted); flex:none; }
    .cw-hist-del { font-size:12px; opacity:.5; flex:none; padding:0 2px; }
    .cw-hist-del:hover { opacity:1; }
    .cw-hist-empty { color:var(--cw-muted); font-size:12.5px; text-align:center; padding:14px 0; }
  `],
})
export class CoachSessionsListComponent {
  @Input() sessions: CoachSessionItem[] = [];
  @Input() loading = false;
  @Input() lang = 'en';
  @Input() newLabel = '';
  @Input() emptyLabel = '';
  @Input() deleteAria = '';
  @Output() select = new EventEmitter<string>();
  @Output() remove = new EventEmitter<string>();
  @Output() newChat = new EventEmitter<void>();

  onDelete(id: string, ev: Event): void { ev.stopPropagation(); this.remove.emit(id); }

  /** Relative time label (compact, locale-light) — moved verbatim from the widget's convoTime. */
  relTime(ts: number): string {
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) return this.lang === 'es' ? 'ahora' : (this.lang === 'pt' ? 'agora' : 'now');
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
  }
}
