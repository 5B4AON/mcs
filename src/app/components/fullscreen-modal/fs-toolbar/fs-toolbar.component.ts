/**
 * Morse Code Studio
 */

import {
  Component, EventEmitter, Input, Output, OnInit, OnDestroy,
  HostListener
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CollapseDirective } from '../../collapse.directive';
import { MorseSpeedsComponent } from '../../morse-speeds/morse-speeds.component';
import { Subscription } from 'rxjs';
import { SettingsService, AppSettings, ModalDisplaySettings } from '../../../services/settings.service';
import { AudioDeviceService } from '../../../services/audio-device.service';
import { MorseDecoderService } from '../../../services/morse-decoder.service';
import { MorseEncoderService } from '../../../services/morse-encoder.service';
import { DisplayBufferService } from '../../../services/display-buffer.service';
import { FirebaseRtdbService } from '../../../services/firebase-rtdb.service';
import { PracticeService } from '../../../services/practice.service';
import { LensService } from '../../../services/lens.service';
import { ViewportService } from '../../../services/viewport.service';
import { ModalBackService } from '../../../services/modal-back.service';
import { ClearService } from '../../../services/clear.service';
import { EbookService } from '../../../services/ebook.service';
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
  imports: [FormsModule, CollapseDirective, MorseSpeedsComponent],
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

  /** Emitted when the user opens Presets from the menu */
  @Output() presetsRequested = new EventEmitter<void>();

  /** Fonts offered in the kebab menu. */
  readonly fonts = FULLSCREEN_FONTS;

  // ---- Menu state ----
  private kebabOpen = false;
  private releaseKebabBack: (() => void) | null = null;
  private stylingResetTimer: ReturnType<typeof setTimeout> | null = null;

  get fsKebabOpen(): boolean {
    return this.kebabOpen;
  }

  /**
   * Closing the menu collapses Styling again, one tick later, when the menu is already hidden,
   * so the section never visibly slides shut. The menu always opens with Styling collapsed.
   */
  set fsKebabOpen(open: boolean) {
    if (open !== this.kebabOpen) {
      // While the menu is open, the browser Back button closes it
      if (open) {
        this.releaseKebabBack = this.modalBack.open(() => {
          this.kebabOpen = false;
          this.releaseKebabBack = null;
          this.scheduleStylingReset();
        });
      } else {
        this.releaseKebabBack?.();
        this.releaseKebabBack = null;
      }
    }
    this.kebabOpen = open;
    this.scheduleStylingReset();
  }

  private scheduleStylingReset(): void {
    const open = this.kebabOpen;
    if (this.stylingResetTimer) {
      clearTimeout(this.stylingResetTimer);
      this.stylingResetTimer = null;
    }
    if (!open && (this.stylingOpen || this.speedsOpen)) {
      this.stylingResetTimer = setTimeout(() => {
        this.stylingOpen = false;
        this.speedsOpen = false;
        this.stylingResetTimer = null;
      }, 0);
    }
  }

  /** Text styling controls and Morse Speeds are shown only while expanded, one at a time; the menu always opens with both collapsed */
  stylingOpen = false;
  speedsOpen = false;

  toggleStyling(): void {
    this.stylingOpen = !this.stylingOpen;
    if (this.stylingOpen) this.speedsOpen = false;
  }

  toggleSpeeds(): void {
    this.speedsOpen = !this.speedsOpen;
    if (this.speedsOpen) this.stylingOpen = false;
  }
  fsKebabMaxHeight: number | null = null;
  clearMenuOpen = false;

  private subs: Subscription[] = [];

  constructor(
    public settings: SettingsService,
    public decoder: MorseDecoderService,
    public encoder: MorseEncoderService,
    public rtdb: FirebaseRtdbService,
    private devices: AudioDeviceService,
    private displayBuffers: DisplayBufferService,
    private practice: PracticeService,
    private lens: LensService,
    private viewport: ViewportService,
    private modalBack: ModalBackService,
    public clear: ClearService,
    private ebook: EbookService,
  ) {}

  /** Close the menu when a press lands outside it, even on controls that stop the click (touch keyers) */
  private readonly outsidePressHandler = (event: PointerEvent): void => {
    if (this.fsKebabOpen && !(event.target as Element | null)?.closest?.('.fs-kebab-wrapper')) {
      this.fsKebabOpen = false;
    }
  };

  ngOnInit(): void {
    document.addEventListener('pointerdown', this.outsidePressHandler, true);
  }

  ngOnDestroy(): void {
    if (this.fontHoldTimer !== null) clearTimeout(this.fontHoldTimer);
    this.releaseKebabBack?.();
    this.releaseKebabBack = null;
    if (this.stylingResetTimer) clearTimeout(this.stylingResetTimer);
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
    const viewportHeight = this.viewport.height();
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

  /** Copy practice is typed and Send practice is keyed, so the Key/Type toggle is locked while either is the mode. */
  get inputLocked(): boolean {
    const mode = this.settings.settings().encoderMode;
    return mode === 'send-practice' || mode === 'practice';
  }

  /** Why the toggle is locked, for its tooltip and accessible name. */
  get inputLockedReason(): string {
    if (this.ebook.active()) return 'The e-book is read in its own view, so Key and Type do not apply';
    return this.settings.settings().encoderMode === 'send-practice'
      ? 'Send practice is keyed, so the view stays in Key mode'
      : 'Copy practice is typed, so the view stays in Type mode';
  }

  /** Toggle between mapped-key keying and text entry without changing settings. */
  toggleInputMode(): void {
    if (this.inputLocked) return;
    this.inputModeChange.emit(this.inputMode === 'key' ? 'type' : 'key');
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

  readonly FONT_MULT_MIN = 1;
  readonly FONT_MULT_MAX = 10;
  readonly ROW_MULT_MIN = 1;
  readonly ROW_MULT_MAX = 10;

  /** Row spacing (em) at level ×1 and the step between whole levels; ×10 is the widest the setting allows (0.5) */
  private static readonly ROW_SPACING_AT_MIN = -0.04;
  private static readonly ROW_SPACING_PER_LEVEL = 0.06;

  /** Font size as the ×1.0–×10.0 multiplier of the fitted size (stored as 24 units per ×1) */
  get fontSizeMultiplier(): number {
    return this.fontTenths() / 10;
  }

  /** Row spacing as a whole level from ×1 to ×10, whatever the stored value is */
  get rowSpacingMultiplier(): number {
    const level = Math.round((this.settings.modalDisplay().lineSpacing - FsToolbarComponent.ROW_SPACING_AT_MIN)
      / FsToolbarComponent.ROW_SPACING_PER_LEVEL) + 1;
    return Math.min(this.ROW_MULT_MAX, Math.max(this.ROW_MULT_MIN, level));
  }

  nudgeRowSpacing(direction: -1 | 1): void {
    const level = Math.min(this.ROW_MULT_MAX, Math.max(this.ROW_MULT_MIN, this.rowSpacingMultiplier + direction));
    const spacing = FsToolbarComponent.ROW_SPACING_AT_MIN + (level - 1) * FsToolbarComponent.ROW_SPACING_PER_LEVEL;
    this.settings.updateModalDisplay({ lineSpacing: Math.round(spacing * 100) / 100 });
    this.saveSettings();
  }

  // ---- Font size: press and hold repeats ----

  private fontHoldTimer: ReturnType<typeof setTimeout> | null = null;

  private fontTenths(): number {
    return Math.round(this.settings.modalDisplay().fontSize / 2.4);
  }

  /** Move the font size by `tenths` tenths of a multiplier, stopping at ×1.0 and ×10.0 */
  private stepFontSize(direction: -1 | 1, tenths: number): void {
    const next = Math.min(this.FONT_MULT_MAX * 10, Math.max(this.FONT_MULT_MIN * 10, this.fontTenths() + direction * tenths));
    this.settings.updateModalDisplay({ fontSize: Math.round(next * 2.4) });
  }

  /**
   * One step at once, then after a short pause the size keeps moving while the button is held,
   * faster the longer it is held (the delay shrinks and the step grows), so the whole ×1–×10
   * range takes about two seconds. The setting is saved once, on release.
   */
  startFontHold(direction: -1 | 1, event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    this.stopFontHold();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    this.stepFontSize(direction, 1);
    let delay = 150;
    let ticks = 0;
    const tick = () => {
      ticks++;
      this.stepFontSize(direction, ticks > 20 ? 5 : ticks > 8 ? 2 : 1);
      const atLimit = direction < 0 ? this.fontTenths() <= this.FONT_MULT_MIN * 10 : this.fontTenths() >= this.FONT_MULT_MAX * 10;
      if (atLimit) {
        this.stopFontHold();
        return;
      }
      delay = Math.max(40, delay * 0.85);
      this.fontHoldTimer = setTimeout(tick, delay);
    };
    this.fontHoldTimer = setTimeout(tick, 400);
  }

  stopFontHold(): void {
    if (this.fontHoldTimer === null) return;
    clearTimeout(this.fontHoldTimer);
    this.fontHoldTimer = null;
    this.saveSettings();
  }

  /** Pointer presses are handled on press; a click with no pointer (keyboard Enter/Space) steps once */
  onFontClick(direction: -1 | 1, event: MouseEvent): void {
    if (event.detail !== 0) return;
    this.stepFontSize(direction, 1);
    this.saveSettings();
  }

  /** Handle modal display boolean toggle changes */
  onModalBoolChange(key: keyof ModalDisplaySettings, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.updateModalDisplay({ [key]: checked } as Partial<ModalDisplaySettings>);
    this.saveSettings();
  }

  // ---- Clear methods ----

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
