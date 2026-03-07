/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../services/settings.service';
import { AudioDeviceService } from '../../services/audio-device.service';
import { FirebaseRtdbService } from '../../services/firebase-rtdb.service';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { SettingsInputsTabComponent } from './settings-inputs-tab/settings-inputs-tab.component';
import { SettingsOutputsTabComponent } from './settings-outputs-tab/settings-outputs-tab.component';
import { SettingsOtherTabComponent } from './settings-other-tab/settings-other-tab.component';

/**
 * Settings modal component — modal chrome and tab navigation.
 *
 * Orchestrates the three settings tab child components
 * ({@link SettingsInputsTabComponent}, {@link SettingsOutputsTabComponent},
 * {@link SettingsOtherTabComponent}) within a modal overlay. Handles:
 *
 *  - Tab switching with swipe gesture support
 *  - Device scan / refresh (audio device enumeration)
 *  - Reset-to-defaults confirmation dialog
 *  - Save button and validation banner
 *  - Scan results overlay
 *
 * All tab-specific settings cards and their handlers live in the
 * respective tab child components.
 */
@Component({
  selector: 'app-settings-modal',
  standalone: true,
  imports: [
    FormsModule,
    ConfirmDialogComponent,
    SettingsInputsTabComponent,
    SettingsOutputsTabComponent,
    SettingsOtherTabComponent,
  ],
  templateUrl: './settings-modal.component.html',
  styleUrls: ['./settings-modal.component.css'],
})
export class SettingsModalComponent {
  /** Whether audio contexts are running (passed to tab children for test buttons) */
  @Input() audioRunning = false;

  /** Emitted when the user closes the settings modal */
  @Output() closed = new EventEmitter<void>();

  // ---- UI state ----

  /** Currently active settings tab */
  settingsTab: 'inputs' | 'outputs' | 'other' = 'inputs';

  /** Whether the reset confirmation dialog is visible */
  showResetConfirm = false;

  /** Whether the scan results overlay is visible */
  showScanResults = false;

  /** Input devices found during the last scan */
  scanResultInputs: { label: string }[] = [];

  /** Output devices found during the last scan */
  scanResultOutputs: { label: string }[] = [];

  /** Whether the last scan switched to a different device profile */
  scanProfileChanged = false;

  // ---- Swipe gesture state ----
  private touchStartX = 0;
  private touchStartY = 0;

  constructor(
    public settings: SettingsService,
    private devices: AudioDeviceService,
    private rtdbService: FirebaseRtdbService,
  ) {}

  /** Close the settings modal */
  close(): void {
    this.closed.emit();
  }

  /** Show the reset-confirmation dialog */
  confirmReset(): void {
    this.showResetConfirm = true;
  }

  /** Handle the result from the reset confirmation dialog */
  onResetConfirmed(confirmed: boolean): void {
    this.showResetConfirm = false;
    if (confirmed) {
      this.settings.resetToDefaults();

      // Stop any active RTDB connections since defaults have both disabled
      this.rtdbService.stopInput();
      this.rtdbService.stopOutput();
    }
  }

  // ---- Swipe gesture for tab navigation ----

  /** Tab order used for cycling */
  private readonly tabOrder: ('inputs' | 'outputs' | 'other')[] = ['inputs', 'outputs', 'other'];

  /** Record the starting touch position */
  onTabContentTouchStart(event: TouchEvent): void {
    const touch = event.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
  }

  /**
   * Detect a horizontal swipe and switch tabs.
   * Requires a minimum 60 px horizontal distance and the swipe must
   * be more horizontal than vertical to avoid triggering on scrolls.
   */
  onTabContentTouchEnd(event: TouchEvent): void {
    const touch = event.changedTouches[0];
    const dx = touch.clientX - this.touchStartX;
    const dy = touch.clientY - this.touchStartY;

    // Only act if the gesture is predominantly horizontal
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;

    if (dx < 0) {
      this.nextTab();   // swipe left → next tab
    } else {
      this.prevTab();   // swipe right → previous tab
    }
  }

  /** Move to the next tab (Inputs → Outputs → Other → Inputs) */
  private nextTab(): void {
    const idx = this.tabOrder.indexOf(this.settingsTab);
    this.settingsTab = this.tabOrder[(idx + 1) % this.tabOrder.length];
  }

  /** Move to the previous tab (Other → Outputs → Inputs → Other) */
  private prevTab(): void {
    const idx = this.tabOrder.indexOf(this.settingsTab);
    this.settingsTab = this.tabOrder[(idx - 1 + this.tabOrder.length) % this.tabOrder.length];
  }

  // ---- Save ----

  /** Persist current settings to localStorage keyed by audio device fingerprint */
  saveSettings(): void {
    this.settings.save(
      this.devices.inputDevices(),
      this.devices.outputDevices()
    );
  }

  // ---- Device refresh ----

  /**
   * Request microphone permission, enumerate audio devices, and show
   * the scan results overlay. If the device fingerprint changed, the
   * settings profile for the new configuration is loaded automatically.
   */
  async onRefreshDevices(): Promise<void> {
    const previousFp = this.settings.currentFingerprint();
    await this.devices.requestAndEnumerate();
    const fp = this.devices.computeFingerprint();
    if (fp && fp !== previousFp) {
      this.settings.loadForFingerprint(
        fp,
        this.devices.inputDevices(),
        this.devices.outputDevices()
      );
    }
    this.scanResultInputs = this.devices.inputDevices().map(d => ({ label: d.label }));
    this.scanResultOutputs = this.devices.outputDevices().map(d => ({ label: d.label }));
    this.scanProfileChanged = !!(fp && fp !== previousFp);
    this.showScanResults = true;
  }

  /** Dismiss the scan results overlay */
  dismissScanResults(): void {
    this.showScanResults = false;
  }
}
