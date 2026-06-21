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
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2.6l1.7 4.6 4.6 1.7-4.6 1.7L12 15.2l-1.7-4.6L5.7 8.9l4.6-1.7L12 2.6z"/>
        <path d="M18.5 13.2l.85 2.25 2.25.85-2.25.85-.85 2.25-.85-2.25L15.4 16.3l2.25-.85.85-2.25z"/>
        <path d="M5.7 14.4l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6L3.5 17.2l1.6-.6.6-1.6z"/>
      </svg>
    }
    @case ('discovery') {
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2.4L21.6 12 12 21.6 2.4 12 12 2.4z"/>
      </svg>
    }
    @case ('chats') {
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M5 4h14a2.5 2.5 0 0 1 2.5 2.5v8A2.5 2.5 0 0 1 19 17H9.8L5 20.8a.6.6 0 0 1-1-.47V6.5A2.5 2.5 0 0 1 5 4z"/>
      </svg>
    }
    @case ('profile') {
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 12.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2z"/>
        <path d="M12 14c-4.5 0-8.1 2.5-8.1 5.6V21h16.2v-1.4c0-3.1-3.6-5.6-8.1-5.6z"/>
      </svg>
    }
  }`,
})
export class ShellNavIconComponent {
  readonly name = input<string>('');
}
