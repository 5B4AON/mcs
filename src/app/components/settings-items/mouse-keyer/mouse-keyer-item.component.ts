/**
 * Morse Code Studio
 */

import { Component, Input, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppSettings, MouseButtonAction } from '../../../services/settings.service';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';
import { HelpLinkButtonComponent } from '../help-link-button/help-link-button.component';

/**
 * Settings item — Mouse Keyer.
 *
 * Maps mouse buttons (left, middle, right) to straight key or paddle
 * actions. Includes conflict detection for duplicate button assignments,
 * reverse paddles, and paddle mode selection.
 */
@Component({
  selector: 'app-mouse-keyer-item',
  standalone: true,
  imports: [FormsModule, ItemShellComponent, HelpLinkButtonComponent],
  templateUrl: './mouse-keyer-item.component.html',
  styles: [':host { display: contents; }'],
})
export class MouseKeyerItemComponent {
  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';
  @Input() forceEnabled = false;
  @Input() forceSource: 'rx' | 'tx' | null = null;

  readonly scope = inject(SETTINGS_SCOPE);

  /** Current values from the scope */
  readonly s = this.scope.value;

  /** Conflict: multiple mouse buttons mapped to the same non-none action */
  readonly mouseActionConflict = computed<string | null>(() => {
    const s = this.s();
    const actions: MouseButtonAction[] = [s.mouseLeftAction, s.mouseMiddleAction, s.mouseRightAction];
    const nonNone = actions.filter(a => a !== 'none');
    const unique = new Set(nonNone);
    if (nonNone.length !== unique.size) {
      return 'Multiple mouse buttons are mapped to the same action. Each action should be assigned to only one button.';
    }
    return null;
  });

  /** Handle a string or numeric setting change */
  onSettingChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    let value: string | number = el.value;
    if (el.type === 'number' || el.type === 'range') {
      value = parseFloat(el.value);
    }
    this.scope.update({ [key]: value } as Partial<AppSettings>);
  }

  /** Handle a boolean setting change from a checkbox */
  onBoolChange(key: keyof AppSettings, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.scope.update({ [key]: checked } as Partial<AppSettings>);
  }

  /** Handle mouse button action dropdown changes */
  onMouseActionChange(key: keyof AppSettings, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.scope.update({ [key]: value } as Partial<AppSettings>);
  }
}
