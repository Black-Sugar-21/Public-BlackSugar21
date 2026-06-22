import { Component, Input, HostBinding, ChangeDetectionStrategy } from '@angular/core';
import { NgClass } from '@angular/common';

/**
 * ATOM · Option — a selectable toggle button (interest chips, segmented selectors).
 * `selected` → gold state.
 *  shape: pill (chips) · rect (segmented)
 *  size:  md (compact) · lg (roomy onboarding cards)
 *  tone:  gold (selected text gold) · white (selected text stays white)
 *  align: center · start (left-aligned segmented cards)
 *  block → flex:1 (segmented rows).
 * Parent owns the selection model (click bubbles to the host). Token-only, touch-safe.
 */
@Component({
  selector: 'ui-option',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass],
  template: `
    <button class="ui-opt" [ngClass]="cls" [disabled]="disabled" type="button">
      @if (desc) {
        <b class="opt-title">{{ title }}</b>
        <span class="opt-desc">{{ desc }}</span>
      } @else {
        <ng-content></ng-content>
      }
    </button>
  `,
  styles: [`
    :host { display: inline-block; }
    :host(.grow) { flex: 1 1 0; }
    .ui-opt {
      -webkit-appearance: none; appearance: none; font-family: 'Outfit', system-ui, sans-serif;
      width: 100%; box-sizing: border-box; cursor: pointer; text-align: center;
      color: var(--text-secondary); background: var(--bg-card);
      border: 1px solid rgba(255,255,255,.16); font-size: 13.5px; font-weight: 500;
      transition: border-color .15s, background .15s, color .15s, opacity .15s;
      -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    }
    .shape-pill { border-radius: 999px; padding: 9px 14px; }
    .shape-rect { border-radius: 12px; padding: 13px 8px; border-width: 1.5px; font-size: 14px; }
    .size-lg { border-radius: 14px; padding: 16px; border-width: 1px; font-size: 15px; font-weight: 600; }
    .align-start { text-align: left; }
    .stacked { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; text-align: left; }
    .stacked .opt-desc { font-size: 13px; font-weight: 400; color: var(--text-muted); }
    .ui-opt.on { border-color: var(--gold); background: rgba(212,175,55,.12); }
    .tone-gold.on { color: var(--gold); font-weight: 600; }
    .tone-white.on { color: var(--text-primary); font-weight: 700; }
    .tone-gold.on .opt-desc { color: var(--gold); opacity: .85; }
    .ui-opt:disabled { opacity: .38; cursor: default; }
    @media (prefers-reduced-motion: reduce) { .ui-opt { transition: none; } }
  `],
})
export class UiOptionComponent {
  @Input() selected = false;
  @Input() shape: 'pill' | 'rect' = 'pill';
  @Input() size: 'md' | 'lg' = 'md';
  @Input() tone: 'gold' | 'white' = 'gold';
  @Input() align: 'center' | 'start' = 'center';
  @Input() disabled = false;
  @Input() block = false;
  /** When `desc` is set the option renders a stacked title + description (onboarding type cards). */
  @Input() title = '';
  @Input() desc = '';

  @HostBinding('class.grow') get hostGrow() { return this.block; }

  get cls() {
    return {
      on: this.selected,
      ['shape-' + this.shape]: true,
      ['size-' + this.size]: this.size === 'lg',
      ['tone-' + this.tone]: true,
      ['align-' + this.align]: this.align === 'start',
      stacked: !!this.desc,
    };
  }
}
