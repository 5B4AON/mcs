/**
 * Morse Code Studio
 */

import {
  AfterViewInit, Component, ElementRef, EventEmitter, Input, Output, OnInit, OnDestroy,
  NgZone, ViewChild
} from '@angular/core';
import { AppSettings, SettingsService } from '../../services/settings.service';
import { MorseEncoderService } from '../../services/morse-encoder.service';
import { KeyerService } from '../../services/keyer.service';
import { FsToolbarComponent } from './fs-toolbar/fs-toolbar.component';
import { PracticeService } from '../../services/practice.service';
import { LensService } from '../../services/lens.service';
import { AudioDeviceService } from '../../services/audio-device.service';
import { fullscreenFontStack } from '../../fullscreen-fonts';
import { FsConversationViewComponent } from './fs-conversation-view/fs-conversation-view.component';
import { focusDialog, getFocusableElements, restoreDialogFocus } from '../modal-accessibility';

/**
 * Fullscreen modal component (parent shell).
 *
 * Provides the modal overlay, visual viewport management for mobile
 * on-screen keyboards, and orchestrates child components:
 * - **FsToolbarComponent** — top bar with WPM controls, level meter, menus
 * - **FsConversationViewComponent** — combined conversation with keying and typing
 *
 * The overlay tracks the VisualViewport API so that on mobile devices
 * the modal shrinks above the on-screen keyboard, keeping all content
 * visible even in landscape where only one or two lines fit.
 */
@Component({
  selector: 'app-fullscreen-modal',
  standalone: true,
  imports: [FsToolbarComponent, FsConversationViewComponent],
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

  /** True when the on-screen keyboard is likely open (viewport significantly shorter than window) */
  viewportKeyboardOpen = false;

  /** Key or Type, remembered between sessions (saved with the settings and presets). */
  get inputMode(): 'key' | 'type' {
    return this.settings.settings().fullscreenInputMode;
  }

  /** Lens mode (latest character shown large); remembered like the input mode. */
  get lensMode(): boolean {
    return this.settings.settings().fullscreenLensEnabled;
  }

  /** Font stack chosen in the fullscreen menu. */
  get fontStack(): string {
    return fullscreenFontStack(this.settings.settings().fullscreenFont);
  }

  /** Controls overlay height so it stays above the on-screen keyboard */
  overlayHeight: string | null = null;
  /** Controls overlay top offset to track the visual viewport on iOS */
  overlayTop: string | null = null;

  /** VisualViewport event handler (for cleanup) */
  private vvHandler: (() => void) | null = null;
  @ViewChild(FsConversationViewComponent) private conversationView?: FsConversationViewComponent;
  @ViewChild('fullscreenDialog') private fullscreenDialog?: ElementRef<HTMLElement>;
  private readonly focusReturnTarget =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  constructor(
    public settings: SettingsService,
    private encoder: MorseEncoderService,
    private keyer: KeyerService,
    private practice: PracticeService,
    private lens: LensService,
    private devices: AudioDeviceService,
    private zone: NgZone,
  ) {}

  ngOnInit(): void {
    // Subscribe to VisualViewport changes so the overlay shrinks when
    // the on-screen keyboard appears on mobile devices.
    this.setupVisualViewport();
    // Restore the remembered choices: mapped keys only act in Key mode, and Lens starts recording.
    this.keyer.setKeyboardMappingsEnabled(this.inputMode === 'key');
    this.lens.setEnabled(this.lensMode);
  }

  ngAfterViewInit(): void {
    if (this.fullscreenDialog) {
      focusDialog(this.fullscreenDialog.nativeElement, this.inputMode === 'type' ? '.fs-type-input' : '.fs-conversation');
    }
  }

  ngOnDestroy(): void {
    this.lens.setEnabled(false);
    // Closing by any route (Back, Escape) must give mapped keys back to the main screen
    this.keyer.setKeyboardMappingsEnabled(true);
    // Clean up VisualViewport listeners
    if (window.visualViewport && this.vvHandler) {
      window.visualViewport.removeEventListener('resize', this.vvHandler);
      window.visualViewport.removeEventListener('scroll', this.vvHandler);
    }
    restoreDialogFocus(
      this.focusReturnTarget,
      this.focusReturnFallback ?? document.querySelector<HTMLElement>('.expand-btn'),
    );
  }

  /** Keep focus in fullscreen and stop an active encoder before closing it. */
  onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.encoder.isSending()) {
      event.preventDefault();
      event.stopPropagation();
      this.encoder.stopTx();
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

  /** Switch between Key and Type and remember the choice. */
  setInputMode(mode: 'key' | 'type'): void {
    this.remember({ fullscreenInputMode: mode });
    this.keyer.setKeyboardMappingsEnabled(mode === 'key');
    if (mode === 'key' && this.settings.settings().encoderMode === 'practice') this.practice.abort();
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

  // ---- VisualViewport: keep overlay above the on-screen keyboard ----

  /**
   * Subscribe to VisualViewport resize/scroll events.
   *
   * On mobile devices the on-screen keyboard reduces the visual viewport
   * height but does NOT resize `position: fixed` elements (which span
   * the full layout viewport).  Explicitly setting the overlay height
   * to the visual viewport height keeps the entire modal — toolbar,
   * conversation area, and encoder buffer — above the keyboard so the
   * user can always see what they are typing or receiving, even in
   * landscape where only one or two text lines are visible.
   */
  private setupVisualViewport(): void {
    if (!window.visualViewport) return;
    this.vvHandler = () => this.zone.run(() => this.onVisualViewportChange());
    window.visualViewport.addEventListener('resize', this.vvHandler);
    window.visualViewport.addEventListener('scroll', this.vvHandler);
  }

  private onVisualViewportChange(): void {
    const vv = window.visualViewport;
    if (!vv) return;
    this.overlayHeight = `${vv.height}px`;
    this.overlayTop = `${vv.offsetTop}px`;
    // Detect whether the on-screen keyboard is likely open:
    // the visual viewport is significantly shorter than the layout viewport.
    this.viewportKeyboardOpen = vv.height < window.innerHeight * 0.75;
  }
}
