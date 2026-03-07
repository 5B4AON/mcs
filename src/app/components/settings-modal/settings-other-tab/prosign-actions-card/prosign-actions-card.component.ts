/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService, ProsignAction, ProsignActionEntry } from '../../../../services/settings.service';

/**
 * Settings card — Prosign Actions.
 *
 * Assigns behaviour (newLine, newParagraph, clearLastWord, etc.) to
 * decoded/encoded prosigns. Each prosign entry can be individually
 * enabled or disabled.
 */
@Component({
  selector: 'app-prosign-actions-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './prosign-actions-card.component.html',
  styles: [':host { display: contents; }'],
})
export class ProsignActionsCardComponent {
  /** Whether this card's body is expanded */
  expanded = false;

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

  constructor(public settings: SettingsService) {}

  /** Safely get the entry for a prosign key, falling back to a default */
  getEntry(key: string): ProsignActionEntry {
    return this.settings.settings().prosignActions[key]
        ?? { enabled: false, action: 'newLine' };
  }

  /** Toggle the master prosign-actions enabled switch */
  onProsignActionsEnabledChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ prosignActionsEnabled: checked });
  }

  /** Toggle an individual prosign entry on/off */
  onProsignEntryEnabledChange(key: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const actions = { ...this.settings.settings().prosignActions };
    const existing = actions[key] ?? { enabled: false, action: 'newLine' as ProsignAction };
    actions[key] = { ...existing, enabled: checked };
    this.settings.update({ prosignActions: actions });
  }

  /** Change the action assigned to a prosign key */
  onProsignEntryActionChange(key: string, event: Event): void {
    const value = (event.target as HTMLSelectElement).value as ProsignAction;
    const actions = { ...this.settings.settings().prosignActions };
    const existing = actions[key] ?? { enabled: false, action: 'newLine' as ProsignAction };
    actions[key] = { ...existing, action: value };
    this.settings.update({ prosignActions: actions });
  }
}
