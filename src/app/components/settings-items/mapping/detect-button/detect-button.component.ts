/**
 * Morse Code Studio
 */

import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Detect button of the mapping editors: shows what is assigned (or "Detect"),
 * and "Press a key…" while it waits. The editor decides what listening means
 * (keyboard key or MIDI note) and owns the state; this is only the look.
 *
 * `capture` is the wide button showing the current assignment (keyboard);
 * `detect` is the compact button with an icon next to note pickers (MIDI).
 */
@Component({
  selector: 'app-detect-button',
  standalone: true,
  template: `
    <button type="button" [class]="variant === 'capture' ? 'md-capture-btn' : 'md-detect-btn'"
            [class.listening]="listening" [title]="title" (click)="pressed.emit()">
      @if (listening) {
        {{ listeningLabel }}
      } @else {
        @if (variant === 'detect') {
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        }
        {{ label }}
      }
    </button>
  `,
  styles: [':host { display: contents; }'],
})
export class DetectButtonComponent {
  /** True while waiting for the user's key or note */
  @Input() listening = false;

  /** Text when idle (the assigned key for `capture`, "Detect" for `detect`) */
  @Input() label = 'Detect';

  /** Text while listening */
  @Input() listeningLabel = 'Press a key…';

  @Input() variant: 'capture' | 'detect' = 'detect';

  @Input() title = '';

  /** The user clicked the button (start or cancel listening) */
  @Output() pressed = new EventEmitter<void>();
}
