import { Component, Input, HostBinding, ChangeDetectionStrategy } from '@angular/core';
import { NgClass } from '@angular/common';

/**
 * ATOM · Option — a selectable toggle button (interest chips, segmented selectors).
 * `selected` → gold state. shape: pill (chips) · rect (segmented). block → flex:1.
 * Click bubbles to the host; the parent owns the selection model. Token-only, touch-safe.
 */
@Component({
  selector: 'ui-option',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass],
  template: `<button class="ui-opt" [ngClass]="cls" [disabled]="disabled" type="button"><ng-content></ng-content></button>`,
  styles: [`
    :host { display: inline-block; }
    :host(.grow) { flex: 1 1 0; }
    .ui-opt {
      -webkit-appearance: none; appearance: none; font-family: 'Outfit', system-ui, sans-serif;
      width: 100%; box-sizing: border-box; cursor: pointer;
      color: var(--text-secondary); background: var(--bg-card);
      border: 1px solid rgba(255,255,255,.16); font-size: 13.5px; font-weight: 500;
      transition: border-color .15s, background .15s, color .15s, opacity .15s;
      -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    }
    .shape-pill { border-radius: 999px; padding: 9px 14px; }
    .shape-rect { border-radius: 12px; padding: 13px 8px; border-width: 1.5px; }
    .ui-opt.on { color: var(--gold); border-color: var(--gold); background: rgba(212,175,55,.12); font-weight: 700; }
    .ui-opt:disabled { opacity: .38; cursor: default; }
    @media (prefers-reduced-motion: reduce) { .ui-opt { transition: none; } }
  `],
})
export class UiOptionComponent {
  @Input() selected = false;
  @Input() shape: 'pill' | 'rect' = 'pill';
  @Input() disabled = false;
  @Input() block = false;

  @HostBinding('class.grow') get hostGrow() { return this.block; }

  get cls() { return { on: this.selected, ['shape-' + this.shape]: true }; }
}
