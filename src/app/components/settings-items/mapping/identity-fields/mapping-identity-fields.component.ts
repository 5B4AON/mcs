/**
 * Morse Code Studio
 */

import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

/**
 * Name and colour fields shared by the mapping editors. The name triggers a
 * line break in conversation views when a different name appears; the colour
 * overrides the default RX/TX colour there. Both are optional.
 */
@Component({
  selector: 'app-mapping-identity-fields',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="md-field">
      <label class="md-label" [for]="idPrefix + 'Name'">Name</label>
      <input [id]="idPrefix + 'Name'" type="text" class="md-input" maxlength="20"
             [ngModel]="name" (ngModelChange)="nameChange.emit($event)"
             placeholder="e.g. callsign (optional)">
      <span class="md-hint">Triggers a line break in conversation views when a different name appears.</span>
    </div>

    <div class="md-field">
      <label class="md-label">Color</label>
      <div class="md-color-row">
        <input type="color" class="md-color-picker"
               [ngModel]="color || '#ffffff'" (ngModelChange)="colorChange.emit($event)">
        @if (color) {
          <button type="button" class="md-color-clear" (click)="colorChange.emit('')" title="Clear color">✕</button>
        }
        <span class="md-color-preview" [style.color]="color || 'inherit'">Sample</span>
      </div>
      <span class="md-hint">{{ colorHint }}</span>
    </div>
  `,
  styles: [':host { display: contents; }'],
})
export class MappingIdentityFieldsComponent {
  /** Prefix that keeps element ids unique when several editors exist */
  @Input() idPrefix = 'mapping';

  @Input() name = '';
  @Input() color = '';

  @Input() colorHint = 'Optional. Overrides the default RX/TX colour in fullscreen views.';

  @Output() nameChange = new EventEmitter<string>();
  @Output() colorChange = new EventEmitter<string>();
}
