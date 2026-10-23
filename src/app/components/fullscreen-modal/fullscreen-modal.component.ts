/**
 * Morse Code Studio
 */

import {
  AfterViewInit, Component, ElementRef, EventEmitter, Input, Output, OnInit, OnDestroy,
  NgZone, ViewChild
} from '@angular/core';
import { SettingsService } from '../../services/settings.service';
import { MorseEncoderService } from '../../services/morse-encoder.service';
import { FsToolbarComponent } from './fs-toolbar/fs-toolbar.component';
import { FsDecoderViewComponent } from './fs-decoder-view/fs-decoder-view.component';
import { FsEncoderViewComponent } from './fs-encoder-view/fs-encoder-view.component';
import { focusDialog, restoreDialogFocus, trapDialogTabKey } from '../modal-accessibility';

/**
 * Fullscreen modal component (parent shell).
 *
 * Provides the modal overlay, visual viewport management for mobile
 * on-screen keyboards, and orchestrates child components:
 * - **FsToolbarComponent** — top bar with WPM controls, level meter, menus
 * - **FsDecoderViewComponent** — decoded conversation with touch keyer
 * - **FsEncoderViewComponent** — encoder conversation with virtual keyboard
 *
 * The overlay tracks the VisualViewport API so that on mobile devices
 * the modal shrinks above the on-screen keyboard, keeping all content
 * visible even in landscape where only one or two lines fit.
 */
@Component({
  selector: 'app-fullscreen-modal',
  standalone: true,
  imports: [FsToolbarComponent, FsDecoderViewComponent, FsEncoderViewComponent],
  templateUrl: './fullscreen-modal.component.html',
  styleUrls: ['./fullscreen-modal.component.css'],
})
export class FullscreenModalComponent implements OnInit, OnDestroy, AfterViewInit {
  /** Which modal mode: 'decoder' (conversation) or 'encoder' (QSO) */
  @Input() mode: 'decoder' | 'encoder' = 'decoder';

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

  /** Controls overlay height so it stays above the on-screen keyboard */
  overlayHeight: string | null = null;
  /** Controls overlay top offset to track the visual viewport on iOS */
  overlayTop: string | null = null;

  /** VisualViewport event handler (for cleanup) */
  private vvHandler: (() => void) | null = null;
  @ViewChild('fullscreenDialog') private fullscreenDialog?: ElementRef<HTMLElement>;
  private readonly focusReturnTarget =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  constructor(
    public settings: SettingsService,
    private encoder: MorseEncoderService,
    private zone: NgZone,
  ) {}

  ngOnInit(): void {
    // Subscribe to VisualViewport changes so the overlay shrinks when
    // the on-screen keyboard appears on mobile devices.
    this.setupVisualViewport();
  }

  ngAfterViewInit(): void {
    if (this.fullscreenDialog) {
      focusDialog(this.fullscreenDialog.nativeElement, '.fs-close-btn');
    }
  }

  ngOnDestroy(): void {
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
    if (event.key === 'Escape' && this.mode === 'encoder' && this.encoder.isSending()) {
      event.preventDefault();
      event.stopPropagation();
      this.encoder.stopTx();
      return;
    }
    if (this.fullscreenDialog) {
      trapDialogTabKey(event, this.fullscreenDialog.nativeElement);
    }
  }

  /** Close the modal and notify the parent */
  close(): void {
    this.closed.emit();
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
