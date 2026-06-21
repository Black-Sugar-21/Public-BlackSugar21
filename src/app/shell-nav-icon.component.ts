import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Bottom-nav / sidebar icons homologated with the iOS tab bar (ContentView MainTabView):
 *  coach → SF "sparkles", discovery → "diamond-icon", chats → "chat-icon", profile → "account-icon".
 * Uses fill="currentColor" so the active/inactive color is driven by the parent (gold when active).
 */
@Component({
  selector: 'app-shell-nav-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`:host{display:inline-flex;align-items:center;justify-content:center;line-height:0;width:100%;height:100%}svg{width:100%;height:100%;display:block}`],
  template: `@switch (name()) {
    @case ('coach') {
      <!-- SF "sparkles": big 4-point sparkle + 2 small (filled, like iOS) -->
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M11 3.4c.5 3 1.5 4 4.5 4.5-3 .5-4 1.5-4.5 4.5-.5-3-1.5-4-4.5-4.5 3-.5 4-1.5 4.5-4.5z"/>
        <path d="M18 12.4c.28 1.6.83 2.15 2.4 2.4-1.57.25-2.12.8-2.4 2.4-.28-1.6-.83-2.15-2.4-2.4 1.57-.25 2.12-.8 2.4-2.4z"/>
        <path d="M7 14.2c.22 1.25.62 1.65 1.9 1.9-1.28.25-1.68.65-1.9 1.9-.22-1.25-.62-1.65-1.9-1.9 1.28-.25 1.68-.65 1.9-1.9z"/>
      </svg>
    }
    @case ('discovery') {
      <!-- Brilliant-cut diamond/gem (outline + facets), homologated to iOS "diamond-icon" -->
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
        <path d="M6 4h12l3 4.4L12 20.5 3 8.4 6 4z"/>
        <path d="M3 8.4h18"/>
        <path d="M9.2 4 7.6 8.4 12 20.5 16.4 8.4 14.8 4"/>
      </svg>
    }
    @case ('chats') {
      <!-- Rounded/oval speech bubble with tail (outline), like iOS "chat" -->
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
        <path d="M4 11.4C4 7.85 7.6 5 12 5s8 2.85 8 6.4-3.6 6.4-8 6.4c-.97 0-1.9-.13-2.77-.38-1 .7-2.3 1.2-3.63 1.4.6-.82 1.02-1.86 1.02-2.77C5.05 15.27 4 13.45 4 11.4z"/>
      </svg>
    }
    @case ('profile') {
      <!-- Person (outline): head + shoulders, like iOS "account" -->
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
        <circle cx="12" cy="8" r="3.7"/>
        <path d="M5.4 19.6c0-3.25 2.95-5.7 6.6-5.7s6.6 2.45 6.6 5.7"/>
      </svg>
    }
  }`,
})
export class ShellNavIconComponent {
  readonly name = input<string>('');
}
