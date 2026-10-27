/**
 * Morse Code Studio
 */

import { Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProsignAction, ProsignActionEntry } from '../../../services/settings.service';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';

/**
 * Settings item — Prosign Actions.
 *
 * Assigns behaviour (newLine, newParagraph, clearLastWord, etc.) to
 * decoded/encoded prosigns. Each prosign entry can be individually
 * enabled or disabled.
 */
@Component({
  selector: 'app-prosign-actions-item',
  standalone: true,
  imports: [FormsModule, ItemShellComponent],
  templateUrl: './prosign-actions-item.component.html',
  styles: [':host { display: contents; }'],
})
export class ProsignActionsItemComponent {
  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';

  readonly scope = inject(SETTINGS_SCOPE);

  /** Current values from the scope */
  readonly s = this.scope.value;

  /** Ordered list of prosign keys for the Prosign Actions card */
  readonly prosignKeys = ['<AR>', '<BK>', '<BT>', '<HH>'];

  /** Available action choices for prosign action dropdowns */
  readonly prosignActionOptions: { value: ProsignAction; label: string }[] = [
    { value: 'newLine', label: 'New Line' },
    { value: 'newParagraph', label: 'New Paragraph' },
    { value: 'clearLastWord', label: 'Clear Last Word' },
    { value: 'clearLine', label: 'Clear Line' },
    { value: 'clearScreen', label: 'Clear Screen' },
  ];

  /** Safely get the entry for a prosign key, falling back to a default */
  getEntry(key: string): ProsignActionEntry {
    return this.s().prosignActions[key]
        ?? { enabled: false, action: 'newLine' };
  }

  /** Toggle an individual prosign entry on/off */
  onProsignEntryEnabledChange(key: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const actions = { ...this.s().prosignActions };
    const existing = actions[key] ?? { enabled: false, action: 'newLine' as ProsignAction };
    actions[key] = { ...existing, enabled: checked };
    this.scope.update({ prosignActions: actions });
  }

  /** Change the action assigned to a prosign key */
  onProsignEntryActionChange(key: string, event: Event): void {
    const value = (event.target as HTMLSelectElement).value as ProsignAction;
    const actions = { ...this.s().prosignActions };
    const existing = actions[key] ?? { enabled: false, action: 'newLine' as ProsignAction };
    actions[key] = { ...existing, action: value };
    this.scope.update({ prosignActions: actions });
  }

  /** Master switch */
  onEnabledChange(enabled: boolean): void {
    this.scope.update({ prosignActionsEnabled: enabled });
  }
}
