/**
 * Morse Code Studio
 */

/**
 * Help / Documentation component.
 *
 * Displays a fullscreen modal with structured, scrollable documentation
 * covering all features, settings, wiring options and configuration of
 * Morse Code Studio.  The document layout uses:
 *
 *  - A clickable Table of Contents at the top
 *  - Numbered chapters and sections with anchor IDs
 *  - A floating "↑ Help Home" button for quick navigation back to the top
 *
 * Content is written for amateur radio operators who may not be software
 * developers.
 */
import {
  Component,
  EventEmitter,
  Output,
  Input,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';
import { HelpChIntroComponent } from './help-ch-intro.component';
import { HelpChDecoderComponent } from './help-ch-decoder.component';
import { HelpChEncoderComponent } from './help-ch-encoder.component';
import { HelpChKeyersComponent } from './help-ch-keyers.component';
import { HelpChCalibrationComponent } from './help-ch-calibration.component';
import { HelpChInputsComponent } from './help-ch-inputs.component';
import { HelpChOutputsComponent } from './help-ch-outputs.component';
import { HelpChConfigComponent } from './help-ch-config.component';
import { HelpChReferenceComponent } from './help-ch-reference.component';
import { HelpChPwaComponent } from './help-ch-pwa.component';
import { HelpChFirebaseComponent } from './help-ch-firebase.component';
import { APP_VERSION } from '../../version';
import { focusDialog, restoreDialogFocus, trapDialogTabKey } from '../modal-accessibility';

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [
    HelpChIntroComponent,
    HelpChDecoderComponent,
    HelpChEncoderComponent,
    HelpChKeyersComponent,
    HelpChCalibrationComponent,
    HelpChInputsComponent,
    HelpChOutputsComponent,
    HelpChConfigComponent,
    HelpChReferenceComponent,
    HelpChPwaComponent,
    HelpChFirebaseComponent,
  ],
  templateUrl: './help.component.html',
  styleUrls: ['./help.component.css'],
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'help-dialog-title',
    tabindex: '-1',
    '(keydown)': 'onDialogKeydown($event)',
  },
})
export class HelpComponent implements AfterViewInit, OnDestroy {
  /** Application version for display in the help title. */
  readonly version = APP_VERSION;

  /** Optional chapter to open when Help is launched from a contextual link. */
  @Input() initialSection: string | null = null;

  /** Visible trigger to focus if Help was opened from a menu that is now hidden. */
  @Input() focusReturnFallback: HTMLElement | null = null;

  /** Emitted when the user closes the Help modal. */
  @Output() closed = new EventEmitter<void>();

  /** Reference to the scrollable overlay container. */
  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLElement>;

  /** Whether the floating "Help Home" button is visible. */
  showBackToTop = false;

  private scrollListener: (() => void) | null = null;
  private readonly focusReturnTarget =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  constructor(private host: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    focusDialog(this.host.nativeElement, '.help-close-btn');
    const el = this.scrollContainer.nativeElement;
    this.scrollListener = () => {
      this.showBackToTop = el.scrollTop > 300;
    };
    el.addEventListener('scroll', this.scrollListener, { passive: true });
    if (this.initialSection) {
      const section = this.initialSection;
      requestAnimationFrame(() => this.scrollTo(section, 'auto'));
    }
  }

  ngOnDestroy(): void {
    if (this.scrollListener && this.scrollContainer) {
      this.scrollContainer.nativeElement.removeEventListener('scroll', this.scrollListener);
    }
    restoreDialogFocus(
      this.focusReturnTarget,
      this.focusReturnFallback ?? document.querySelector<HTMLElement>('.kebab-btn'),
    );
  }

  /** Keep keyboard focus within Help while preserving existing close behavior. */
  onDialogKeydown(event: KeyboardEvent): void {
    trapDialogTabKey(event, this.host.nativeElement);
  }

  /** Scroll to a given anchor ID within the document. */
  scrollTo(id: string, behavior: ScrollBehavior = 'smooth'): void {
    const target = this.scrollContainer.nativeElement.querySelector('#' + id);
    if (target) {
      target.scrollIntoView({ behavior, block: 'start' });
    }
  }

  /** Scroll back to the top of the document. */
  scrollToTop(): void {
    this.scrollContainer.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
