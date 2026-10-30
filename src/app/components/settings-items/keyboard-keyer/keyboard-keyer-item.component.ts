/**
 * Morse Code Studio
 */

import { Component, Input, computed, inject } from '@angular/core';
import { KeyboardInputMapping } from './keyboard-keyer-item.model';
import { DecoderSource, PaddleMode } from '../../../services/settings-common';
import { KeyboardInputEditModalComponent, KeyboardInputEditSaveEvent } from '../../settings-modal/keyboard-input-edit-modal/keyboard-input-edit-modal.component';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';
import { MappingListComponent } from '../mapping/mapping-list/mapping-list.component';

/**
 * Settings item — Keyboard Keyer.
 *
 * Displays a table of keyboard input mappings (straight key / paddle),
 * with add/edit/delete support via the keyboard input edit modal.
 * Each mapping has its own key code(s), source, mode, paddle mode,
 * and optional name/colour — modelled after the MIDI input card.
 * In a wizard step only the master switch and an intro are shown: the
 * mappings are edited on their own pages (repeat step) instead of in the popup.
 */
@Component({
  selector: 'app-keyboard-keyer-item',
  standalone: true,
  imports: [ItemShellComponent, MappingListComponent, KeyboardInputEditModalComponent],
  templateUrl: './keyboard-keyer-item.component.html',
  styles: [':host { display: contents; }'],
})
export class KeyboardKeyerItemComponent {
  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';

  readonly scope = inject(SETTINGS_SCOPE);

  /** Current values from the scope */
  readonly s = this.scope.value;

  /** Index of the mapping currently being edited, or -1 for new */
  editIndex = -1;

  /** Scratch copy of the mapping passed to the edit modal */
  editMapping: KeyboardInputMapping = {
    enabled: true, mode: 'straightKey', keyCode: '', dahKeyCode: '',
    source: 'tx', reversePaddles: false, paddleMode: 'iambic-b',
    name: '', color: '',
  };

  /** Whether the edit modal is visible */
  showEditModal = false;

  /** Unique source badges from all enabled mappings */
  readonly sourceBadges = computed(() => {
    const mappings = this.s().keyboardInputMappings;
    const sources = new Set<DecoderSource>();
    for (const m of mappings) {
      if (m.enabled) sources.add(m.source);
    }
    return [...sources];
  });

  /** Master switch */
  onEnabledChange(enabled: boolean): void {
    this.scope.update({ keyboardKeyerEnabled: enabled });
  }

  /** Toggle an individual mapping on/off */
  onMappingEnabledChange(index: number, checked: boolean): void {
    const mappings = this.s().keyboardInputMappings.map((m, i) =>
      i === index ? { ...m, enabled: checked } : m
    );
    this.scope.update({ keyboardInputMappings: mappings });
  }

  /** Open the edit modal for an existing mapping */
  startEdit(index: number): void {
    const m = this.s().keyboardInputMappings[index];
    this.editIndex = index;
    this.editMapping = { ...m };
    this.showEditModal = true;
  }

  /** Open the edit modal for a new mapping */
  addMapping(): void {
    this.editIndex = -1;
    this.editMapping = {
      enabled: true, mode: 'straightKey', keyCode: '', dahKeyCode: '',
      source: 'tx', reversePaddles: false, paddleMode: 'iambic-b',
      name: '', color: '',
    };
    this.showEditModal = true;
  }

  /** Handle save from the edit modal */
  onEditSaved(event: KeyboardInputEditSaveEvent): void {
    const mappings = [...this.s().keyboardInputMappings];
    if (this.editIndex >= 0) {
      mappings[this.editIndex] = {
        ...mappings[this.editIndex],
        mode: event.mode,
        keyCode: event.keyCode,
        dahKeyCode: event.dahKeyCode,
        source: event.source,
        reversePaddles: event.reversePaddles,
        paddleMode: event.paddleMode,
        name: event.name,
        color: event.color,
      };
    } else {
      mappings.push({
        enabled: true,
        mode: event.mode,
        keyCode: event.keyCode,
        dahKeyCode: event.dahKeyCode,
        source: event.source,
        reversePaddles: event.reversePaddles,
        paddleMode: event.paddleMode,
        name: event.name,
        color: event.color,
      });
    }
    this.scope.update({ keyboardInputMappings: mappings });
    this.showEditModal = false;
  }

  /** Handle cancel from the edit modal */
  onEditCancelled(): void {
    this.showEditModal = false;
  }

  /** Handle delete from the edit modal */
  onEditDeleted(): void {
    if (this.editIndex >= 0) {
      const mappings = this.s().keyboardInputMappings.filter((_, i) => i !== this.editIndex);
      this.scope.update({ keyboardInputMappings: mappings });
    }
    this.showEditModal = false;
  }

  /** Get a short key summary for a mapping row */
  keySummary(m: KeyboardInputMapping): string {
    const fmt = (code: string) => code
      .replace(/^Key/, '')
      .replace(/^Digit/, '')
      .replace(/^Numpad/, 'Num')
      .replace(/^Arrow/, '↕')
      .replace(/Bracket(Left|Right)/, (_, side) => side === 'Left' ? '[' : ']')
      .replace(/^Semicolon$/, ';')
      .replace(/^Quote$/, "'")
      .replace(/^Backquote$/, '`')
      .replace(/^Backslash$/, '\\')
      .replace(/^Slash$/, '/')
      .replace(/^Period$/, '.')
      .replace(/^Comma$/, ',')
      .replace(/^Minus$/, '-')
      .replace(/^Equal$/, '=') || '?';
    if (m.mode === 'straightKey') {
      return fmt(m.keyCode);
    }
    return `${fmt(m.keyCode)} / ${fmt(m.dahKeyCode)}`;
  }

  /** Get the display color for a mapping's name label */
  nameColor(m: KeyboardInputMapping): string {
    if (m.color) return m.color;
    return m.source === 'rx' ? '#8cf' : '#fc8';
  }

  /** Get a human-readable paddle mode label */
  paddleModeLabel(mode: PaddleMode): string {
    switch (mode) {
      case 'iambic-b': return 'Iambic B';
      case 'iambic-a': return 'Iambic A';
      case 'ultimatic': return 'Ultimatic';
      case 'single-lever': return 'Single';
      default: return mode;
    }
  }
}
