/**
 * Morse Code Studio
 */

import { Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProsignAction, ProsignActionEntry } from './prosign-actions-item.model';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { HelpLinkButtonComponent } from '../help-link-button/help-link-button.component';
import { SETTINGS_SCOPE } from '../settings-scope';
import { ConfirmService } from '../../../services/confirm.service';
import { ProsignActionSettings, joinPhrases, newErasingProsigns } from '../../../services/prosign-erase';
import { cwDecoderOn } from '../../../services/cw-decoder-state';

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
  imports: [FormsModule, ItemShellComponent, HelpLinkButtonComponent],
  templateUrl: './prosign-actions-item.component.html',
  styles: [':host { display: contents; }'],
})
export class ProsignActionsItemComponent {
  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';

  readonly scope = inject(SETTINGS_SCOPE);
  private readonly confirm = inject(ConfirmService);

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

  /**
   * Prosign actions take effect at once in live Settings. While the CW detector is on, a change that
   * makes a prosign erase decoded text is confirmed first (it can be kept anyway); a refused change
   * is not applied. Returns whether the change was applied.
   */
  private async applyChange(patch: Partial<ProsignActionSettings>): Promise<boolean> {
    const before = this.s();
    if (this.scope.isLive && cwDecoderOn(before)) {
      const added = newErasingProsigns(before, { ...before, ...patch });
      if (added.length) {
        const keep = await this.confirm.ask({
          title: 'Prosigns can erase decoded text',
          message: `The CW detector is on, so with this change ${joinPhrases(added)} whenever that prosign is received, `
            + 'including one misheard in noise, and the text is also removed from what Save keeps. Keep this setting?',
          confirmLabel: 'Keep this setting',
          cancelLabel: 'Undo the change',
          danger: true,
        });
        if (!keep) return false;
      }
    }
    this.scope.update(patch);
    return true;
  }

  /** Toggle an individual prosign entry on/off */
  async onProsignEntryEnabledChange(key: string, event: Event): Promise<void> {
    const box = event.target as HTMLInputElement;
    const checked = box.checked;
    const actions = { ...this.s().prosignActions };
    const existing = actions[key] ?? { enabled: false, action: 'newLine' as ProsignAction };
    actions[key] = { ...existing, enabled: checked };
    // A refused change puts the box back to what the setting says
    if (!(await this.applyChange({ prosignActions: actions }))) box.checked = existing.enabled;
  }

  /** Change the action assigned to a prosign key */
  async onProsignEntryActionChange(key: string, event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const value = select.value as ProsignAction;
    const actions = { ...this.s().prosignActions };
    const existing = actions[key] ?? { enabled: false, action: 'newLine' as ProsignAction };
    actions[key] = { ...existing, action: value };
    if (!(await this.applyChange({ prosignActions: actions }))) select.value = existing.action;
  }

  /** Master switch (the card puts it back when the change is refused) */
  async onEnabledChange(enabled: boolean): Promise<void> {
    await this.applyChange({ prosignActionsEnabled: enabled });
  }
}
