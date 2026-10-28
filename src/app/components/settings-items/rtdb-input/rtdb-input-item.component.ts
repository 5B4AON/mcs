/**
 * Morse Code Studio
 */

import { Component, Input, OnDestroy, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppSettings } from '../../../services/settings.service';
import { FirebaseRtdbService } from '../../../services/firebase-rtdb.service';
import { HelpLinkService } from '../../../services/help-link.service';
import { ConfirmDialogComponent } from '../../confirm-dialog/confirm-dialog.component';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';

/**
 * Settings item — Firebase RTDB Input.
 *
 * Subscribes to a Firebase Realtime Database channel to receive morse
 * characters from remote stations: channel name/secret, RX/TX use, WPM
 * override, name and colour overrides, and connection status. The
 * connection is only started, restarted or stopped in live Settings; a
 * wizard draft only holds the values (and may be switched on before the
 * channel is filled in, which the review then flags).
 */
@Component({
  selector: 'app-rtdb-input-item',
  standalone: true,
  imports: [FormsModule, ItemShellComponent, ConfirmDialogComponent],
  templateUrl: './rtdb-input-item.component.html',
  styles: [':host { display: contents; } .secret-mask { -webkit-text-security: disc; text-security: disc; }'],
})
export class RtdbInputItemComponent implements OnDestroy {
  /** Help section targeted by the contextual Help link. */
  readonly helpSection = 'ch10';

  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';

  /** The containing flow makes receiving part of the selected goal. */
  @Input() forceEnabled = false;
  @Input() forceSource: AppSettings['rtdbInputSource'] | null = null;

  readonly scope = inject(SETTINGS_SCOPE);

  /** Current values from the scope */
  readonly s = this.scope.value;

  readonly rtdbService = inject(FirebaseRtdbService);
  private readonly help = inject(HelpLinkService);

  /** Message of the "cannot enable yet" dialog; null when closed */
  readonly notice = signal<string | null>(null);

  /** Debounce timer for restarting the input while the channel is typed */
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnDestroy(): void {
    if (this.restartTimer) clearTimeout(this.restartTimer);
  }

  /** True while the item is off and a required value is still missing (outlines the card). */
  get missingRequired(): boolean {
    const s = this.s();
    return !s.rtdbInputEnabled && (!s.rtdbInputChannelName.trim() || !s.rtdbInputChannelSecret.trim());
  }

  openHelp(event: Event): void {
    event.preventDefault();
    this.help.open(this.helpSection);
  }

  onSourceChange(event: Event): void {
    this.scope.update({ rtdbInputSource: (event.target as HTMLSelectElement).value as AppSettings['rtdbInputSource'] });
  }

  onBoolChange(key: 'rtdbInputOverrideWpm', event: Event): void {
    this.scope.update({ [key]: (event.target as HTMLInputElement).checked } as Partial<AppSettings>);
  }

  onOverrideNameChange(event: Event): void {
    this.scope.update({ rtdbInputName: (event.target as HTMLInputElement).value });
  }

  /**
   * Master switch. Live Settings refuses to switch on while offline or without
   * channel values (and says why); a wizard draft may be switched on first
   * and filled in afterwards.
   */
  onEnabledChange(checked: boolean, target?: HTMLInputElement): void {
    if (checked && this.scope.isLive) {
      const s = this.s();
      const refuse = (message: string) => {
        if (target) target.checked = false;
        this.rtdbService.lastError.set(message);
        this.notice.set(message);
      };
      if (!navigator.onLine) return refuse('Cannot enable Firebase RTDB input — you are offline.');
      if (!s.rtdbInputChannelName.trim() || !s.rtdbInputChannelSecret.trim()) {
        return refuse('Channel Name and Channel Secret are required to enable RTDB input. Fill them in first, then switch it on.');
      }
    }
    this.scope.update({ rtdbInputEnabled: checked });
    if (!this.scope.isLive) return;
    if (checked) this.rtdbService.startInput();
    else this.rtdbService.stopInput();
  }

  /** Channel name or secret typed: store it; in live Settings switch off when emptied, else reconnect shortly. */
  onChannelChange(key: 'rtdbInputChannelName' | 'rtdbInputChannelSecret', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.scope.update({ [key]: value } as Partial<AppSettings>);
    if (!this.scope.isLive || !this.s().rtdbInputEnabled) return;
    if (!value.trim()) {
      this.scope.update({ rtdbInputEnabled: false });
      this.rtdbService.stopInput();
      return;
    }
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => this.rtdbService.startInput(), 600);
  }
}
