/**
 * Morse Code Studio
 */

import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

/**
 * Name and colour pair used by every input that identifies a person in the
 * conversation views. The colour is always chosen with a picker (never typed
 * as a hex code) and can be cleared. Markup and classes match the original
 * cards, so Settings looks the same.
 */
@Component({
  selector: 'app-identity-field',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './identity-field.component.html',
  styles: [':host { display: contents; }'],
})
export class IdentityFieldComponent {
  /** Current name */
  @Input() name = '';

  /** Current colour as `#rrggbb`, or empty for none */
  @Input() color = '';

  /** Text for the name hint line; empty hides it */
  @Input() hint = 'Triggers a line break in conversation views when a different name appears.';

  /** Placeholder of the name box */
  @Input() placeholder = 'e.g. callsign (optional)';

  @Output() nameChange = new EventEmitter<string>();
  @Output() colorChange = new EventEmitter<string>();

  onName(event: Event): void {
    this.nameChange.emit((event.target as HTMLInputElement).value);
  }
}
