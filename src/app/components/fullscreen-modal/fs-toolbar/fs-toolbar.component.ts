/**
 * Morse Code Studio
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
import { PracticeService } from '../../../services/practice.service';
import { LensService } from '../../../services/lens.service';
import { FULLSCREEN_FONTS } from '../../../fullscreen-fonts';

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
  /** Temporary fullscreen input choice. */
  @Input() inputMode: 'key' | 'type' = 'key';

  /** True while Lens mode is on. */
  @Input() lensMode = false;

  /** Emitted when the user switches Lens on or off. */
  @Output() lensToggle = new EventEmitter<void>();

  /** Emitted when the user clicks the close button */
  @Output() closeRequest = new EventEmitter<void>();
  /** Emitted when the user changes the temporary fullscreen input choice. */
  @Output() inputModeChange = new EventEmitter<'key' | 'type'>();

  /** Emitted when the user requests the help dialog */
  @Output() helpRequested = new EventEmitter<void>();

  /** Emitted when the user requests the symbols reference */
  @Output() symbolsRefRequested = new EventEmitter<void>();

  /** Emitted when the user opens Settings from the menu */
  @Output() settingsRequested = new EventEmitter<void>();

  /** Emitted when the user opens the Setup Wizard from the menu */
  @Output() wizardRequested = new EventEmitter<void>();

  /** Fonts offered in the kebab menu. */
  readonly fonts = FULLSCREEN_FONTS;

  // ---- CW level meter state ----
  cwLevel = 0;
  cwLevelMax = 0.01;
  cwThreshold = 0;

  // ---- Menu state ----
  fsKebabOpen = false;

  /** Text styling controls are shown only while expanded; the menu always opens collapsed */
  stylingOpen = false;
  fsKebabMaxHeight: number | null = null;
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
    private practice: PracticeService,
    private lens: LensService,
  ) {}

  /** Close the menu when a press lands outside it, even on controls that stop the click (touch keyers) */
  private readonly outsidePressHandler = (event: PointerEvent): void => {
    if (this.fsKebabOpen && !(event.target as Element | null)?.closest?.('.fs-kebab-wrapper')) {
      this.fsKebabOpen = false;
    }
  };

  ngOnInit(): void {
    document.addEventListener('pointerdown', this.outsidePressHandler, true);
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
    document.removeEventListener('pointerdown', this.outsidePressHandler, true);
    this.subs.forEach(s => s.unsubscribe());
  }

  /** Close kebab and clear menus on any document click (outside stopPropagation wrappers) */
  @HostListener('document:click')
  onDocumentClick(): void {
    this.fsKebabOpen = false;
    this.clearMenuOpen = false;
  }

  toggleFsKebab(): void {
    this.fsKebabOpen = !this.fsKebabOpen;
    if (this.fsKebabOpen) {
      this.stylingOpen = false;
      this.updateKebabMaxHeight();
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (this.fsKebabOpen) this.updateKebabMaxHeight();
  }

  /** Let the open kebab menu use the whole height below its button; it scrolls only when the content is taller */
  private updateKebabMaxHeight(): void {
    const trigger = document.querySelector<HTMLElement>('.fs-kebab-wrapper > .kebab-btn');
    if (!trigger) return;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    // 4px gap under the button plus 8px of breathing room at the bottom
    this.fsKebabMaxHeight = Math.max(120, Math.floor(viewportHeight - trigger.getBoundingClientRect().bottom - 12));
  }

  /** Dismiss the open toolbar menu on Escape without closing fullscreen itself. */
  onToolbarKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;

    const clearTrigger = event.currentTarget instanceof HTMLElement
      ? event.currentTarget.querySelector<HTMLButtonElement>('.fs-clear-btn')
      : null;
    const kebabTrigger = event.currentTarget instanceof HTMLElement
      ? event.currentTarget.querySelector<HTMLButtonElement>('.fs-kebab-wrapper > .kebab-btn')
      : null;
    if (this.clearMenuOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.clearMenuOpen = false;
      clearTrigger?.focus();
    } else if (this.fsKebabOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.fsKebabOpen = false;
      kebabTrigger?.focus();
    }
  }

  /** Toggle between mapped-key keying and text entry without changing settings. */
  toggleInputMode(): void {
    this.inputModeChange.emit(this.inputMode === 'key' ? 'type' : 'key');
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

  /** Reset button next to an RX/TX speed: back to the app default start speed (saved), restarting the adaptive calibration */
  resetDecoderSpeed(source: 'rx' | 'tx'): void {
    const defaults = this.settings.getDefaults();
    if (source === 'rx') {
      this.settings.update({ rxDecoderWpm: defaults.rxDecoderWpm });
      this.decoder.resetRxCalibration();
    } else {
      this.settings.update({ txDecoderWpm: defaults.txDecoderWpm });
      this.decoder.resetTxCalibration();
    }
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
    // When switching away from practice mode, reset practice state
    if (key === 'encoderMode' && this.settings.settings().encoderMode === 'practice' && value !== 'practice') {
      this.practice.reset();
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
    this.saveSettings();
  }

  /** Handle modal display boolean toggle changes */
  onModalBoolChange(key: keyof ModalDisplaySettings, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.updateModalDisplay({ [key]: checked } as Partial<ModalDisplaySettings>);
    this.saveSettings();
  }

  // ---- Clear methods ----

  /** Clear the current mode's conversation buffer */
  clearConversation(): void {
    if (this.settings.settings().encoderMode === 'practice') {
      this.practice.abort();
    }
    this.displayBuffers.fullscreenConversation.clear();
    this.lens.reset();
  }

  /** Clear all four display buffers plus encoder operational state */
  clearAllBuffers(): void {
    if (this.settings.settings().encoderMode === 'practice') {
      this.practice.abort();
    }
    this.displayBuffers.clearAll();
    this.decoder.clearOutput();
    this.encoder.clearBuffer();
    this.lens.reset();
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
