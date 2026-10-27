/**
 * Morse Code Studio
 */

import { Component, Input, OnDestroy, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppSettings } from '../../../services/settings.service';
import { FirebaseRtdbService } from '../../../services/firebase-rtdb.service';
import { HelpLinkService } from '../../../services/help-link.service';
import { ConfirmDialogComponent } from '../../confirm-dialog/confirm-dialog.component';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';

/** Text settings that the publisher needs; clearing one switches the output off. */
type RequiredKey = 'rtdbOutputChannelName' | 'rtdbOutputChannelSecret' | 'rtdbOutputName';

/**
 * Settings item — Firebase RTDB Output (publish decoded characters to a channel).
 *
 * Channel name/secret, sender name and colour (with "always use" overrides),
 * forward direction (RX/TX/both) and relay from the RTDB input. The publisher
 * is only started, restarted or stopped in live Settings; a wizard draft only
 * holds the values (and may be switched on before they are filled in, which the
 * review then flags).
 */
@Component({
  selector: 'app-rtdb-output-item',
  standalone: true,
  imports: [FormsModule, ItemShellComponent, ConfirmDialogComponent],
  templateUrl: './rtdb-output-item.component.html',
  styles: [':host { display: contents; } .secret-mask { -webkit-text-security: disc; text-security: disc; }'],
})
export class RtdbOutputItemComponent implements OnDestroy {
  /** Help section targeted by the contextual Help link. */
  readonly helpSection = 'ch10';

  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';

  readonly scope = inject(SETTINGS_SCOPE);

  /** Current values from the scope */
  readonly s = this.scope.value;

  readonly rtdbService = inject(FirebaseRtdbService);
  private readonly help = inject(HelpLinkService);

  /** Message of the "cannot enable yet" dialog; null when closed */
  readonly notice = signal<string | null>(null);

  /** Debounce timer for restarting the output while text is typed */
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * True when the RTDB input and output share the same non-empty channel
   * name and secret: relay must stay off to prevent a feedback loop.
   */
  readonly isSameChannel = computed(() => {
    const s = this.s();
    const inCh = s.rtdbInputChannelName.trim();
    const outCh = s.rtdbOutputChannelName.trim();
    return !!(inCh && outCh && inCh === outCh
      && s.rtdbInputChannelSecret.trim() === s.rtdbOutputChannelSecret.trim());
  });

  ngOnDestroy(): void {
    if (this.restartTimer) clearTimeout(this.restartTimer);
  }

  /** True while the item is off and a required value is still missing (outlines the card). */
  get missingRequired(): boolean {
    const s = this.s();
    return !s.rtdbOutputEnabled
      && (!s.rtdbOutputChannelName.trim() || !s.rtdbOutputChannelSecret.trim() || !s.rtdbOutputName.trim());
  }

  openHelp(event: Event): void {
    event.preventDefault();
    this.help.open(this.helpSection);
  }

  onForwardChange(event: Event): void {
    this.scope.update({ rtdbOutputForward: (event.target as HTMLSelectElement).value as AppSettings['rtdbOutputForward'] });
  }

  onBoolChange(
    key: 'rtdbOutputOverrideName' | 'rtdbOutputOverrideColor' | 'rtdbAllowInputRelay' | 'rtdbRelaySuppressOtherInputs',
    event: Event,
  ): void {
    this.scope.update({ [key]: (event.target as HTMLInputElement).checked } as Partial<AppSettings>);
  }

  /**
   * Master switch. Live Settings refuses to switch on while offline or without
   * the required values (and says why); a wizard draft may be switched on first
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
      if (!navigator.onLine) return refuse('Cannot enable Firebase RTDB output — you are offline.');
      if (!s.rtdbOutputChannelName.trim() || !s.rtdbOutputChannelSecret.trim() || !s.rtdbOutputName.trim()) {
        return refuse('Channel Name, Channel Secret, and Name are required to enable RTDB output. Fill them in first, then switch it on.');
      }
    }
    this.scope.update({ rtdbOutputEnabled: checked });
    if (!this.scope.isLive) return;
    if (checked) this.rtdbService.startOutput();
    else this.rtdbService.stopOutput();
  }

  /** Text typed: store it; in live Settings switch off when a required value is emptied, else reconnect shortly. */
  onTextChange(key: RequiredKey, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.scope.update({ [key]: value } as Partial<AppSettings>);
    if (!this.scope.isLive || !this.s().rtdbOutputEnabled) return;
    if (!value.trim()) {
      this.scope.update({ rtdbOutputEnabled: false });
      this.rtdbService.stopOutput();
      return;
    }
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => this.rtdbService.startOutput(), 600);
  }
}
