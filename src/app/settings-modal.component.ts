/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Component, EventEmitter, Input, OnInit, OnDestroy, Output, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { SettingsService, AppSettings, MouseButtonAction } from './services/settings.service';
import { AudioDeviceService } from './services/audio-device.service';
import { AudioInputService } from './services/audio-input.service';
import { AudioOutputService } from './services/audio-output.service';
import { CwInputService, CwLevelEvent } from './services/cw-input.service';
import { SerialKeyOutputService } from './services/serial-key-output.service';
import { WinkeyerOutputService } from './services/winkeyer-output.service';
import { FirebaseRtdbService } from './services/firebase-rtdb.service';
import { ConfirmDialogComponent } from './confirm-dialog.component';

/**
 * Settings modal component.
 *
 * Provides the full settings UI in a modal overlay with Inputs/Outputs tabs,
 * collapsible card sections with toggle switches, calibration controls,
 * and device management.
 */
@Component({
  selector: 'app-settings-modal',
  standalone: true,
  imports: [FormsModule, ConfirmDialogComponent],
  templateUrl: './settings-modal.component.html',
  styleUrls: ['./settings-modal.component.css'],
})
export class SettingsModalComponent implements OnInit, OnDestroy {
  /** Whether audio contexts are running (controls test/calibration buttons) */
  @Input() audioRunning = false;

  /** Emitted when the user closes the settings modal */
  @Output() closed = new EventEmitter<void>();

  // ---- UI state ----
  settingsTab: 'inputs' | 'outputs' = 'inputs';
  expandedSections: Record<string, boolean> = {};
  showResetConfirm = false;

  /** Whether the browser supports the Web Serial API */
  readonly webSerialSupported = 'serial' in navigator;

  /** Whether the device is running Android (serial API exists but USB-serial typically fails) */
  readonly isAndroid = /android/i.test(navigator.userAgent);

  // ---- Calibration state ----
  calibrating: 'open' | 'closed' | null = null;
  calibOpenRms: number | null = null;
  calibClosedRms: number | null = null;

  // ---- CW level tracking (for auto-threshold display) ----
  cwNoiseFloor = 0;
  cwSignalPeak = 0;
  cwThreshold = 0;

  private subs: Subscription[] = [];

  /** Debounce timer for RTDB input restart on text field changes */
  private rtdbInputDebounce: ReturnType<typeof setTimeout> | null = null;
  /** Debounce timer for RTDB output restart on text field changes */
  private rtdbOutputDebounce: ReturnType<typeof setTimeout> | null = null;

  /**
   * Conflict: CW audio input uses the same mic device as pilot tone detection.
   */
  readonly cwInputConflict = computed<string | null>(() => {
    const s = this.settings.settings();
    if (!s.micInputEnabled) return null;
    const norm = (id: string) => id || 'default';
    if (norm(s.cwInputDeviceId) === norm(s.inputDeviceId)) {
      return 'CW audio input and Pilot tone detection both use the same mic device. Use a different device for CW input, or disable one.';
    }
    return null;
  });

  /**
   * Conflict: multiple mouse buttons mapped to the same non-none action.
   */
  readonly mouseActionConflict = computed<string | null>(() => {
    const s = this.settings.settings();
    const actions: MouseButtonAction[] = [s.mouseLeftAction, s.mouseMiddleAction, s.mouseRightAction];
    const nonNone = actions.filter(a => a !== 'none');
    const unique = new Set(nonNone);
    if (nonNone.length !== unique.size) {
      return 'Multiple mouse buttons are mapped to the same action. Each action should be assigned to only one button.';
    }
    return null;
  });

  constructor(
    public settings: SettingsService,
    public devices: AudioDeviceService,
    public audioInput: AudioInputService,
    public audioOutput: AudioOutputService,
    public cwInput: CwInputService,
    public serialOutput: SerialKeyOutputService,
    public winkeyerOutput: WinkeyerOutputService,
    public rtdbService: FirebaseRtdbService,
  ) {}

  ngOnInit(): void {
    // CW level tracking for settings display
    this.subs.push(
      this.cwInput.level$.subscribe((lvl: CwLevelEvent) => {
        this.cwNoiseFloor = lvl.noiseFloor;
        this.cwSignalPeak = lvl.signalPeak;
        this.cwThreshold = lvl.threshold;
      })
    );

    // Calibration results
    this.subs.push(
      this.audioInput.calibration$.subscribe(result => {
        if (result.state === 'open') {
          this.calibOpenRms = result.rms;
        } else if (result.state === 'closed') {
          this.calibClosedRms = result.rms;
        }
        this.calibrating = null;
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    if (this.rtdbInputDebounce) clearTimeout(this.rtdbInputDebounce);
    if (this.rtdbOutputDebounce) clearTimeout(this.rtdbOutputDebounce);
  }

  close(): void {
    this.expandedSections = {};
    this.closed.emit();
  }

  /** Show and handle the custom reset-confirmation dialog */
  confirmReset(): void {
    this.showResetConfirm = true;
  }

  onResetConfirmed(confirmed: boolean): void {
    this.showResetConfirm = false;
    if (confirmed) {
      this.settings.resetToDefaults();

      // Stop any active RTDB connections since defaults have both disabled
      this.rtdbService.stopInput();
      this.rtdbService.stopOutput();
    }
  }

  // ---- Section expand/collapse ----

  toggleSection(key: string): void {
    this.expandedSections[key] = !this.expandedSections[key];
  }

  isSectionExpanded(key: string): boolean {
    return !!this.expandedSections[key];
  }

  // ---- Settings change handlers ----

  onSettingChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    let value: string | number = el.value;
    if (el.type === 'number' || el.type === 'range') {
      value = parseFloat(el.value);
    }
    this.settings.update({ [key]: value } as Partial<AppSettings>);
  }

  onBoolChange(key: keyof AppSettings, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ [key]: checked } as Partial<AppSettings>);
  }

  onInputParamChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    const value = parseFloat(el.value);
    this.settings.update({ [key]: value } as Partial<AppSettings>);
    this.audioInput.updateParams();
  }

  onInputInvertChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ inputInvert: checked });
    this.audioInput.updateParams();
  }

  onCwParamChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    let value: any;
    if (el.type === 'checkbox') {
      value = (el as any).checked;
    } else if (el.tagName === 'SELECT' || isNaN(parseFloat(el.value))) {
      value = el.value;
    } else {
      value = parseFloat(el.value);
    }
    this.settings.update({ [key]: value } as Partial<AppSettings>);
    this.cwInput.updateParams();
  }

  async onMicEnabledChange(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ micInputEnabled: checked });
    if (this.audioRunning) {
      if (checked) {
        await this.audioInput.start();
        await this.audioOutput.startPilot();
      } else {
        await this.audioInput.stop();
        await this.audioOutput.stopPilot();
      }
    }
  }

  async onCwEnabledChange(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ cwInputEnabled: checked });
    if (this.audioRunning) {
      if (checked) {
        await this.cwInput.start();
      } else {
        await this.cwInput.stop();
      }
    }
  }

  async onSerialPortChange(event: Event): Promise<void> {
    const idx = parseInt((event.target as HTMLSelectElement).value, 10);
    this.settings.update({ serialPortIndex: idx });
    await this.serialOutput.close();
    if (idx >= 0) {
      await this.serialOutput.open(idx);
    }
  }

  async onSerialEnabledChange(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked && (!this.webSerialSupported || this.isAndroid)) {
      (event.target as HTMLInputElement).checked = false;
      return;
    }
    this.settings.update({ serialEnabled: checked });
    if (checked) {
      const idx = this.settings.settings().serialPortIndex;
      if (idx >= 0 && !this.serialOutput.connected()) {
        await this.serialOutput.open(idx);
      }
    } else {
      await this.serialOutput.close();
    }
  }

  // ---- WinKeyer handlers ----

  async onWinkeyerPortChange(event: Event): Promise<void> {
    const idx = parseInt((event.target as HTMLSelectElement).value, 10);
    this.settings.update({ winkeyerPortIndex: idx });
    await this.winkeyerOutput.close();
    if (idx >= 0) {
      await this.winkeyerOutput.open(idx);
    }
  }

  async onWinkeyerEnabledChange(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked && (!this.webSerialSupported || this.isAndroid)) {
      (event.target as HTMLInputElement).checked = false;
      return;
    }
    this.settings.update({ winkeyerEnabled: checked });
    if (checked) {
      const idx = this.settings.settings().winkeyerPortIndex;
      if (idx >= 0 && !this.winkeyerOutput.connected()) {
        await this.winkeyerOutput.open(idx);
      }
    } else {
      await this.winkeyerOutput.close();
    }
  }

  async onWinkeyerWpmChange(event: Event): Promise<void> {
    const wpm = parseInt((event.target as HTMLInputElement).value, 10);
    if (isNaN(wpm)) return;
    this.settings.update({ winkeyerWpm: wpm });
    if (this.winkeyerOutput.connected()) {
      await this.winkeyerOutput.setSpeed(wpm);
    }
  }

  // ---- Calibration ----

  calibrateOpen(): void {
    this.calibrating = 'open';
    this.audioInput.calibrate('open');
  }

  calibrateClosed(): void {
    this.calibrating = 'closed';
    this.audioInput.calibrate('closed');
  }

  applyCalibration(): void {
    if (this.calibOpenRms !== null && this.calibClosedRms !== null) {
      const threshold = (this.calibOpenRms + this.calibClosedRms) / 2;
      this.settings.update({ inputThreshold: Math.round(threshold * 10000) / 10000 });
      this.audioInput.updateParams();
    }
  }

  // ---- Key capture ----

  onCaptureKeyDown(event: KeyboardEvent, settingKey: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.settings.update({ [settingKey]: event.code } as Partial<AppSettings>);
    (event.target as HTMLElement).blur();
  }

  // ---- Mouse action change ----

  onMouseActionChange(key: keyof AppSettings, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.settings.update({ [key]: value } as Partial<AppSettings>);
  }

  onTextSettingChange(key: keyof AppSettings, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.settings.update({ [key]: value } as Partial<AppSettings>);

    // If an RTDB-related field changed while the feature is enabled,
    // automatically restart the connection with the new values.
    // Debounce to avoid rapid reconnections while the user is typing.
    const rtdbInputKeys: (keyof AppSettings)[] = ['rtdbInputChannelName', 'rtdbInputChannelSecret'];
    const rtdbOutputKeys: (keyof AppSettings)[] = ['rtdbOutputChannelName', 'rtdbOutputChannelSecret', 'rtdbOutputUserName'];
    if (rtdbInputKeys.includes(key) && this.settings.settings().rtdbInputEnabled) {
      if (this.rtdbInputDebounce) clearTimeout(this.rtdbInputDebounce);
      this.rtdbInputDebounce = setTimeout(() => this.rtdbService.startInput(), 600);
    }
    if (rtdbOutputKeys.includes(key) && this.settings.settings().rtdbOutputEnabled) {
      if (this.rtdbOutputDebounce) clearTimeout(this.rtdbOutputDebounce);
      this.rtdbOutputDebounce = setTimeout(() => this.rtdbService.startOutput(), 600);
    }
  }

  // ---- Firebase RTDB handlers ----

  onRtdbInputEnabledChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked && !navigator.onLine) {
      (event.target as HTMLInputElement).checked = false;
      this.rtdbService.lastError.set('Cannot enable Firebase RTDB input — you are offline.');
      return;
    }
    this.settings.update({ rtdbInputEnabled: checked });
    if (checked) {
      this.rtdbService.startInput();
    } else {
      this.rtdbService.stopInput();
    }
  }

  onRtdbOutputEnabledChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked && !navigator.onLine) {
      (event.target as HTMLInputElement).checked = false;
      this.rtdbService.lastError.set('Cannot enable Firebase RTDB output — you are offline.');
      return;
    }
    this.settings.update({ rtdbOutputEnabled: checked });
    if (checked) {
      this.rtdbService.startOutput();
    } else {
      this.rtdbService.stopOutput();
    }
  }

  // ---- WPM adjustments ----

  adjustWpm(key: 'keyerWpm' | 'rxDecoderWpm' | 'txDecoderWpm', delta: number): void {
    const v = Math.max(5, Math.min(50, (this.settings.settings() as any)[key] + delta));
    this.settings.update({ [key]: v } as Partial<AppSettings>);
    this.saveSettings();
  }

  // ---- Device refresh ----

  async onRefreshDevices(): Promise<void> {
    await this.devices.requestAndEnumerate();
    const fp = this.devices.computeFingerprint();
    if (fp && fp !== this.settings.currentFingerprint()) {
      this.settings.loadForFingerprint(
        fp,
        this.devices.inputDevices(),
        this.devices.outputDevices()
      );
    }
  }

  // ---- Save ----

  saveSettings(): void {
    this.settings.save(
      this.devices.inputDevices(),
      this.devices.outputDevices()
    );
  }
}
