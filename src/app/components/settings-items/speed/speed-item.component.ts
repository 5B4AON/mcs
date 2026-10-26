/**
 * Morse Code Studio
 */

import { Component, Input, inject, signal } from '@angular/core';
import { AppSettings } from '../../../services/settings.service';
import { MorseDecoderService } from '../../../services/morse-decoder.service';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';
import { SPEED_INFO, SPEED_RANGE, SpeedKind } from './speed-item.model';

/**
 * Settings item — Morse speeds (the same four values as the main toolbar).
 *
 * - Encoder: how fast the app sends text for you (typing, practice, relay).
 * - Keyer: the speed of the paddle keyer; sets the dot and dash length it makes.
 * - RX / TX decoder: the speed the decoder assumes at first. It then adapts
 *   to the timing it hears (RX) or you key (TX); the toolbar shows the
 *   current estimate. Changing a start speed (or its reset button) throws
 *   the learned timing away and starts again from that value.
 *
 * Each speed is its own collapsible sub-item (slider plus + and - buttons).
 * `show` picks which appear: all four in Settings, one or more in a wizard
 * step, where they are flat and always open.
 */
@Component({
  selector: 'app-speed-item',
  standalone: true,
  imports: [ItemShellComponent],
  templateUrl: './speed-item.component.html',
  styleUrl: './speed-item.component.css',
})
export class SpeedItemComponent {
  @Input() mode: 'card' | 'embedded' = 'card';

  /** Speeds to show */
  @Input() show: SpeedKind[] = ['encoder', 'keyer', 'rx', 'tx'];

  readonly scope = inject(SETTINGS_SCOPE);
  private decoder = inject(MorseDecoderService);

  readonly s = this.scope.value;
  readonly range = SPEED_RANGE;
  readonly info = SPEED_INFO;
  readonly kinds: SpeedKind[] = ['encoder', 'keyer', 'rx', 'tx'];

  /** Sub-items opened in the card (the wizard shows them all open) */
  readonly open = signal<ReadonlySet<SpeedKind>>(new Set());

  toggle(kind: SpeedKind): void {
    const next = new Set(this.open());
    if (!next.delete(kind)) next.add(kind);
    this.open.set(next);
  }

  /** The + and - buttons; keeps the value inside the toolbar's range. */
  step(kind: SpeedKind, delta: number): void {
    const value = Math.max(SPEED_RANGE.min, Math.min(SPEED_RANGE.max, this.s()[SPEED_INFO[kind].key] + delta));
    this.setSpeed(kind, value);
  }

  onSpeed(kind: SpeedKind, event: Event): void {
    this.setSpeed(kind, +(event.target as HTMLInputElement).value);
  }

  private setSpeed(kind: SpeedKind, value: number): void {
    this.scope.update({ [SPEED_INFO[kind].key]: value } as Partial<AppSettings>);
    // Same as the toolbar: a new start speed drops the learned timing (live only).
    if (this.scope.isLive) this.resetCalibration(kind);
  }

  /** Forget the learned timing of a decoder and start again from its start speed. */
  resetCalibration(kind: SpeedKind): void {
    if (kind === 'rx') this.decoder.resetRxCalibration();
    if (kind === 'tx') this.decoder.resetTxCalibration();
  }
}
