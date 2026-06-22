import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * ATOM · Input — a single-line text field that works with [(ngModel)] (ControlValueAccessor).
 * Token-only styling, gold focus ring, 16px font (no iOS zoom-on-focus). Cross-device safe.
 */
@Component({
  selector: 'ui-input',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => UiInputComponent), multi: true }],
  template: `
    <input
      #field
      class="ui-input"
      [class.center]="center"
      [type]="type"
      [attr.inputmode]="inputmode || null"
      [attr.autocomplete]="autocomplete || null"
      [attr.maxlength]="maxLength || null"
      [attr.placeholder]="placeholder"
      [attr.aria-label]="ariaLabel || placeholder || null"
      [disabled]="disabled"
      [value]="value"
      (input)="onInput($event)"
      (blur)="onTouched()" />
  `,
  styles: [`
    :host { display: block; }
    .ui-input {
      width: 100%; box-sizing: border-box;
      font-family: 'Outfit', system-ui, sans-serif; font-size: 16px;
      background: var(--bg-card); color: var(--text-primary);
      border: 1px solid var(--border-mid); border-radius: 14px;
      padding: 15px 16px; outline: none;
      transition: border-color .15s ease;
      -webkit-appearance: none; appearance: none;
    }
    .ui-input::placeholder { color: var(--text-muted); }
    .ui-input:focus { border-color: var(--gold); }
    .ui-input:disabled { opacity: .5; }
    .ui-input.center { text-align: center; }
  `],
})
export class UiInputComponent implements ControlValueAccessor {
  @Input() type: 'text' | 'tel' | 'email' | 'number' = 'text';
  @Input() placeholder = '';
  @Input() inputmode = '';
  @Input() autocomplete = '';
  @Input() maxLength: number | null = null;
  @Input() center = false;
  @Input() disabled = false;
  @Input() ariaLabel = '';
  /** Fires once the value reaches maxLength — lets a parent auto-advance focus (e.g. day → month). */
  @Output() complete = new EventEmitter<void>();
  @ViewChild('field') private field?: ElementRef<HTMLInputElement>;

  value = '';
  private onChange: (v: string) => void = () => {};
  onTouched: () => void = () => {};

  writeValue(v: any): void { this.value = v ?? ''; }
  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled = d; }
  onInput(e: Event): void {
    this.value = (e.target as HTMLInputElement).value;
    this.onChange(this.value);
    if (this.maxLength && this.value.length >= this.maxLength) this.complete.emit();
  }
  /** Focus the inner field (used for auto-advance between segmented inputs). */
  focus(): void { this.field?.nativeElement.focus(); }
}
