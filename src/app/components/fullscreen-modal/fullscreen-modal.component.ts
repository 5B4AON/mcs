/**
 * Morse Code Studio
 */

import {
  AfterViewInit, Component, ElementRef, EventEmitter, Input, Output, OnInit, OnDestroy,
  ViewChild, effect, signal, untracked
} from '@angular/core';
import { AppSettings, SettingsService } from '../../services/settings.service';
import { cwDecoderOn } from '../../services/cw-decoder-state';
import { MorseEncoderService } from '../../services/morse-encoder.service';
import { KeyerService } from '../../services/keyer.service';
import { FsToolbarComponent } from './fs-toolbar/fs-toolbar.component';
import { LensService } from '../../services/lens.service';
import { AudioDeviceService } from '../../services/audio-device.service';
import { ViewportService } from '../../services/viewport.service';
import { EbookService } from '../../services/ebook.service';
import { SendPracticeService } from '../../services/send-practice.service';
import { PracticeService } from '../../services/practice.service';
import { CwInputService } from '../../services/cw-input.service';
import { AudioFileService } from '../../services/audio-file.service';
import { ConfirmService } from '../../services/confirm.service';
import { ModalBackService } from '../../services/modal-back.service';
import { LoopDetectionService } from '../../services/loop-detection.service';
import { fullscreenFontStack, isRegularOnlyFont } from '../../fullscreen-fonts';
import { FsConversationViewComponent } from './fs-conversation-view/fs-conversation-view.component';
import { SendPromptComponent } from '../send-prompt/send-prompt.component';
import { CwScopeComponent } from '../cw-scope/cw-scope.component';
import { VINTAGE_CONFIRM, VINTAGE_DISPLAY, VINTAGE_FONT } from './vintage-look';
import { focusDialog, getFocusableElements, restoreDialogFocus } from '../modal-accessibility';

/**
 * Fullscreen modal component (parent shell).
 *
 * Provides the modal overlay and orchestrates child components:
 * - **FsToolbarComponent** — top bar with WPM controls, level meter, menus
 * - **FsConversationViewComponent** — combined conversation with keying and typing
 *
 * The overlay follows the visual viewport published by `ViewportService`, so
 * on mobile devices the modal shrinks above the on-screen keyboard, keeping
 * all content visible even in landscape where only one or two lines fit.
 */
@Component({
  selector: 'app-fullscreen-modal',
  standalone: true,
  imports: [FsToolbarComponent, FsConversationViewComponent, SendPromptComponent, CwScopeComponent],
  templateUrl: './fullscreen-modal.component.html',
  styleUrls: ['./fullscreen-modal.component.css'],
})
export class FullscreenModalComponent implements OnInit, OnDestroy, AfterViewInit {
  /** Visible trigger to focus if the menu item that opened fullscreen is hidden */
  @Input() focusReturnFallback: HTMLElement | null = null;

  /** Emitted when the user closes the modal */
  @Output() closed = new EventEmitter<void>();

  /** Emitted when the user requests the help dialog */
  @Output() helpRequested = new EventEmitter<void>();

  /** Emitted when the user requests the symbols reference */
  @Output() symbolsRefRequested = new EventEmitter<void>();

  /** Emitted when the user requests Settings (opened above this modal) */
  @Output() settingsRequested = new EventEmitter<void>();

  /** Emitted when the user requests the Setup Wizard (opened above this modal) */
  @Output() wizardRequested = new EventEmitter<void>();

  /** Emitted when the user requests Presets (opened above this modal) */
  @Output() presetsRequested = new EventEmitter<void>();
  /** The Book button was pressed: the app opens the Book dialog above this modal */
  @Output() bookRequested = new EventEmitter<void>();
  /** Asks the app to replay a line through the encoder (it asks for confirmation when outputs are external). */
  @Output() replayRequested = new EventEmitter<string>();

  /**
   * Key or Type, remembered between sessions (saved with the settings and presets).
   * Copy practice is typed and Send practice is keyed, so each locks the view to its own
   * mode without changing the remembered choice.
   */
  get inputMode(): 'key' | 'type' {
    const s = this.settings.settings();
    if (s.encoderMode === 'send-practice') return 'key';
    if (s.encoderMode === 'practice') return 'type';
    return s.fullscreenInputMode;
  }

  /** Lens mode (latest character shown large); remembered like the input mode. */
  get lensMode(): boolean {
    return this.settings.settings().fullscreenLensEnabled;
  }

  /** Slider value that means "exactly the auto-fit size" (the slider's default and minimum). */
  readonly fontSizeBase = 24;

  /** True while the touch keys cover the bottom of the conversation (Key mode with the touch keyer on). */
  get touchKeysShown(): boolean {
    return this.inputMode === 'key' && this.settings.settings().touchKeyerEnabled;
  }

  /** Send practice in Key mode pins its prompt box above the output area. */
  get sendPromptShown(): boolean {
    return this.inputMode === 'key' && this.settings.settings().encoderMode === 'send-practice'
      && (!this.ebook.active() || this.sendPractice.ebookAssist());
  }

  /** The CW scope sits where the Send practice prompt would, while the CW detector is on (not in practice modes). */
  get cwScopeShown(): boolean {
    const s = this.settings.settings();
    return !this.vintage() && (cwDecoderOn(s) || this.cwInput.fileActive())
      && s.encoderMode !== 'practice' && s.encoderMode !== 'send-practice';
  }

  /** The font in use: the one chosen in the fullscreen menu, or Special Elite while Vintage Look is on. */
  private get fontId(): string {
    return this.vintage() ? VINTAGE_FONT : this.settings.settings().fullscreenFont;
  }

  /** Font stack in use. */
  get fontStack(): string {
    return fullscreenFontStack(this.fontId);
  }

  /** Bold is requested only for fonts that have a bold weight. */
  get fontWeight(): string {
    return this.settings.settings().fullscreenFontBold && !isRegularOnlyFont(this.fontId) ? 'bold' : 'normal';
  }

  /** Regular-weight-only font in use: nothing in the view may ask for a heavier weight. */
  get regularOnlyFont(): boolean {
    return isRegularOnlyFont(this.fontId);
  }

  /**
   * Vintage Look: dark ink on aged paper in Special Elite, with the toolbar and every button hidden. The
   * touch keyer stays in place and keeps working, but cannot be seen. Never saved; Esc or Back leaves it.
   */
  readonly vintage = signal(false);
  private releaseVintageBack: (() => void) | null = null;

  /** Practice modes and the e-book need their buttons, so Vintage Look is not offered there. */
  get vintageAllowed(): boolean {
    const s = this.settings.settings();
    return s.encoderMode !== 'practice' && s.encoderMode !== 'send-practice' && !this.ebook.active();
  }

  @ViewChild(FsConversationViewComponent) private conversationView?: FsConversationViewComponent;
  @ViewChild('fullscreenDialog') private fullscreenDialog?: ElementRef<HTMLElement>;
  private readonly focusReturnTarget =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  constructor(
    public settings: SettingsService,
    private encoder: MorseEncoderService,
    private keyer: KeyerService,
    private lens: LensService,
    private devices: AudioDeviceService,
    public viewport: ViewportService,
    private ebook: EbookService,
    private sendPractice: SendPracticeService,
    private practice: PracticeService,
    private cwInput: CwInputService,
    public audioFile: AudioFileService,
    public loopDetection: LoopDetectionService,
    private confirm: ConfirmService,
    private modalBack: ModalBackService,
  ) {
    // A practice mode or a book starting under Vintage Look would leave the user without its buttons
    effect(() => {
      if (this.vintage() && !this.vintageAllowed) untracked(() => this.exitVintage());
    });
    // The effective input mode can change under us (a practice mode locks it): mapped keys follow it
    effect(() => {
      this.keyer.setKeyboardMappingsEnabled(this.inputMode === 'key');
    });
    // Lens must record whenever its view is shown, also when a setting change from outside the toolbar
    // (a guide's Apply, a preset, Revert) turns it on while the full screen is already open
    effect(() => {
      const on = this.settings.settings().fullscreenLensEnabled;
      untracked(() => this.lens.setEnabled(on));
    });
  }

  ngOnInit(): void {
    // Restore the remembered choices: mapped keys only act in Key mode, and Lens starts recording.
    this.keyer.setKeyboardMappingsEnabled(this.inputMode === 'key');
    this.lens.setEnabled(this.lensMode);
  }

  ngAfterViewInit(): void {
    if (this.fullscreenDialog) {
      // A book needs no typing, so the on-screen keyboard must not come up
      focusDialog(this.fullscreenDialog.nativeElement, this.inputMode === 'type' && (!this.ebook.active() || this.practice.feedbackMode() === 'typealong') ? '.fs-type-input' : '.fs-conversation');
    }
  }

  ngOnDestroy(): void {
    this.settings.modalDisplayOverride.set(null);
    this.releaseVintageBack?.();
    this.releaseVintageBack = null;
    this.lens.setEnabled(false);
    // Closing by any route (Back, Escape) must give mapped keys back to the main screen
    this.keyer.setKeyboardMappingsEnabled(true);
    restoreDialogFocus(
      this.focusReturnTarget,
      this.focusReturnFallback ?? document.querySelector<HTMLElement>('.expand-btn'),
    );
  }

  /** Keep focus in fullscreen and stop an active encoder before closing it; Esc also leaves Vintage Look. */
  onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.encoder.isSending()) {
      event.preventDefault();
      event.stopPropagation();
      this.encoder.stopTx();
      return;
    }
    if (event.key === 'Escape' && this.vintage()) {
      event.preventDefault();
      event.stopPropagation();
      this.exitVintage();
      return;
    }
    if (this.fullscreenDialog) {
      this.handleTab(event, this.fullscreenDialog.nativeElement);
    }
  }

  /** Tab order: main window, practice/transmit and touch buttons, then the toolbar, then back. */
  private handleTab(event: KeyboardEvent, dialog: HTMLElement): void {
    if (event.key !== 'Tab' || event.defaultPrevented) return;
    const all = getFocusableElements(dialog);
    const body = dialog.querySelector('.fs-body');
    const order = [
      ...all.filter(el => body?.contains(el)),
      ...all.filter(el => !body?.contains(el) && el !== dialog),
    ];
    if (order.length === 0) return;
    event.preventDefault();
    const index = order.indexOf(document.activeElement as HTMLElement);
    const step = event.shiftKey ? -1 : 1;
    const next = index < 0
      ? (event.shiftKey ? order.length - 1 : 0)
      : (index + step + order.length) % order.length;
    order[next].focus();
  }

  /** Close the modal and notify the parent */
  close(): void {
    this.keyer.setKeyboardMappingsEnabled(true);
    this.closed.emit();
  }

  /** Ask, then switch to Vintage Look (the toolbar button). Back and Esc leave it. */
  async startVintage(): Promise<void> {
    if (this.vintage() || !this.vintageAllowed) return;
    if (!await this.confirm.ask(VINTAGE_CONFIRM) || this.vintage() || !this.vintageAllowed) return;
    this.settings.modalDisplayOverride.set(VINTAGE_DISPLAY);
    this.vintage.set(true);
    this.releaseVintageBack = this.modalBack.open(() => {
      this.releaseVintageBack = null;
      this.endVintage();
    });
    this.refocus();
  }

  /** Leave Vintage Look (Esc, or a practice mode or book starting). */
  private exitVintage(): void {
    this.releaseVintageBack?.();
    this.releaseVintageBack = null;
    this.endVintage();
  }

  /** The menu colours and font come back; nothing was ever saved. */
  private endVintage(): void {
    this.settings.modalDisplayOverride.set(null);
    this.vintage.set(false);
    this.refocus();
  }

  /** The element that had focus (a menu button) may be gone: keep focus inside the dialog so Esc keeps working. */
  private refocus(): void {
    setTimeout(() => {
      if (this.inputMode === 'type') this.conversationView?.focusTypeInput();
      else this.conversationView?.focusMain();
    });
  }

  /** Switch between Key and Type and remember the choice. */
  setInputMode(mode: 'key' | 'type'): void {
    this.remember({ fullscreenInputMode: mode });
    this.keyer.setKeyboardMappingsEnabled(mode === 'key');
    if (mode === 'type') this.conversationView?.focusTypeInput();
    else this.conversationView?.focusMain();
  }

  /** Switch Lens on or off and remember the choice; the input mode is unchanged. */
  toggleLens(): void {
    this.remember({ fullscreenLensEnabled: !this.lensMode });
    this.lens.setEnabled(this.lensMode);
    // Keep the on-screen keyboard up in Type mode (same synchronous focus as the Key/Type toggle)
    if (this.inputMode === 'type') this.conversationView?.focusTypeInput();
    else this.conversationView?.focusMain();
  }

  /** Update a fullscreen setting and save it to the current device profile, like the toolbar does. */
  private remember(patch: Partial<AppSettings>): void {
    this.settings.update(patch);
    this.settings.save(this.devices.inputDevices(), this.devices.outputDevices());
  }

  /** Open the help dialog (delegates to parent via output event) */
  requestHelp(): void {
    this.helpRequested.emit();
  }

  /** Open the symbols reference (delegates to parent via output event) */
  requestSymbolsRef(): void {
    this.symbolsRefRequested.emit();
  }
}
