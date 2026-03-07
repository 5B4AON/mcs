/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import {
  Component, EventEmitter, Input, Output, OnInit, OnDestroy,
  HostListener
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { SettingsService, AppSettings, ModalDisplaySettings } from '../../../services/settings.service';
import { AudioDeviceService } from '../../../services/audio-device.service';
import { CwInputService, CwLevelEvent } from '../../../services/cw-input.service';
import { MorseDecoderService } from '../../../services/morse-decoder.service';
import { MorseEncoderService } from '../../../services/morse-encoder.service';
import { DisplayBufferService } from '../../../services/display-buffer.service';
import { FirebaseRtdbService } from '../../../services/firebase-rtdb.service';

/**
 * Fullscreen modal toolbar component.
 *
 * Renders the top bar of the fullscreen modal with:
 * - Close button
 * - CW level meter (when CW input is enabled)
 * - WPM indicator pills (read-only, hidden on narrow screens)
 * - Firebase RTDB connection status icon
 * - Clear conversation context menu
 * - Kebab menu with interactive WPM controls, display customisation
 *   (font size, line spacing, colours), and navigation buttons
 *
 * Services are injected directly — no @Input pass-through from parent
 * needed for settings state, decoder/encoder WPM values, or RTDB status.
 */
@Component({
  selector: 'app-fs-toolbar',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './fs-toolbar.component.html',
  styleUrls: ['./fs-toolbar.component.css'],
})
export class FsToolbarComponent implements OnInit, OnDestroy {
  /** Which modal mode is active — controls which WPM pills and kebab items are shown */
  @Input() mode: 'decoder' | 'encoder' = 'decoder';

  /** Emitted when the user clicks the close button */
  @Output() closeRequest = new EventEmitter<void>();

  /** Emitted when the user requests the help dialog */
  @Output() helpRequested = new EventEmitter<void>();

  /** Emitted when the user requests the symbols reference */
  @Output() symbolsRefRequested = new EventEmitter<void>();

  // ---- CW level meter state ----
  cwLevel = 0;
  cwLevelMax = 0.01;
  cwThreshold = 0;

  // ---- Menu state ----
  fsKebabOpen = false;
  clearMenuOpen = false;

  private subs: Subscription[] = [];

  constructor(
    public settings: SettingsService,
    public decoder: MorseDecoderService,
    public encoder: MorseEncoderService,
    public rtdb: FirebaseRtdbService,
    private devices: AudioDeviceService,
    private cwInput: CwInputService,
    private displayBuffers: DisplayBufferService,
  ) {}

  ngOnInit(): void {
    // Subscribe to CW detector level for the inline level meter
    this.subs.push(
      this.cwInput.level$.subscribe((lvl: CwLevelEvent) => {
        this.cwLevel = lvl.magnitude;
        this.cwThreshold = lvl.threshold;
        if (lvl.magnitude > this.cwLevelMax) {
          this.cwLevelMax = lvl.magnitude * 1.5;
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  /** Close kebab and clear menus on any document click (outside stopPropagation wrappers) */
  @HostListener('document:click')
  onDocumentClick(): void {
    this.fsKebabOpen = false;
    this.clearMenuOpen = false;
  }

  // ---- WPM adjustment methods ----

  /**
   * Adjust a decoder/keyer WPM setting by delta.
   * Clamps to 5–50 range. Resets calibration when changing decoder WPM
   * so the adaptive algorithm restarts from the new baseline.
   */
  adjustWpm(key: 'keyerWpm' | 'rxDecoderWpm' | 'txDecoderWpm', delta: number): void {
    const v = Math.max(5, Math.min(50, (this.settings.settings() as any)[key] + delta));
    this.settings.update({ [key]: v } as Partial<AppSettings>);
    if (key === 'rxDecoderWpm') this.decoder.resetRxCalibration();
    if (key === 'txDecoderWpm') this.decoder.resetTxCalibration();
    this.saveSettings();
  }

  /** Adjust encoder WPM (clamped to 5–50) */
  adjustEncoderWpm(delta: number): void {
    const v = Math.max(5, Math.min(50, this.settings.settings().encoderWpm + delta));
    this.settings.update({ encoderWpm: v });
    this.saveSettings();
  }

  // ---- Settings change handlers ----

  /** Handle generic setting changes from select/input elements */
  onSettingChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    let value: string | number = el.value;
    if (el.type === 'number' || el.type === 'range') {
      value = parseFloat(el.value);
    }
    this.settings.update({ [key]: value } as Partial<AppSettings>);
    this.saveSettings();
  }

  /** Handle modal display setting changes (font size, spacing, colours) */
  onModalDisplayChange(key: keyof ModalDisplaySettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    let value: string | number = el.value;
    if (el.type === 'number' || el.type === 'range') {
      value = parseFloat(el.value);
    }
    this.settings.updateModalDisplay({ [key]: value } as Partial<ModalDisplaySettings>);
  }

  /** Handle modal display boolean toggle changes */
  onModalBoolChange(key: keyof ModalDisplaySettings, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.updateModalDisplay({ [key]: checked } as Partial<ModalDisplaySettings>);
  }

  // ---- Clear methods ----

  /** Clear the current mode's conversation buffer */
  clearConversation(): void {
    const buf = this.mode === 'decoder'
      ? this.displayBuffers.fullscreenDecoder
      : this.displayBuffers.fullscreenEncoder;
    buf.clear();
  }

  /** Clear all four display buffers plus encoder operational state */
  clearAllBuffers(): void {
    this.displayBuffers.clearAll();
    this.decoder.clearOutput();
    this.encoder.clearBuffer();
  }

  /** Toggle the clear context menu */
  toggleClearMenu(): void {
    this.clearMenuOpen = !this.clearMenuOpen;
  }

  /** Close the clear context menu */
  closeClearMenu(): void {
    this.clearMenuOpen = false;
  }

  /** Persist settings to localStorage */
  private saveSettings(): void {
    this.settings.save(
      this.devices.inputDevices(),
      this.devices.outputDevices()
    );
  }
}
