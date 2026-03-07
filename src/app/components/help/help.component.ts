/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
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
})
export class HelpComponent implements AfterViewInit, OnDestroy {
  /** Application version for display in the help title. */
  readonly version = APP_VERSION;

  /** Emitted when the user closes the Help modal. */
  @Output() closed = new EventEmitter<void>();

  /** Reference to the scrollable overlay container. */
  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLElement>;

  /** Whether the floating "Help Home" button is visible. */
  showBackToTop = false;

  private scrollListener: (() => void) | null = null;

  ngAfterViewInit(): void {
    const el = this.scrollContainer.nativeElement;
    this.scrollListener = () => {
      this.showBackToTop = el.scrollTop > 300;
    };
    el.addEventListener('scroll', this.scrollListener, { passive: true });
  }

  ngOnDestroy(): void {
    if (this.scrollListener && this.scrollContainer) {
      this.scrollContainer.nativeElement.removeEventListener('scroll', this.scrollListener);
    }
  }

  /** Scroll to a given anchor ID within the document. */
  scrollTo(id: string): void {
    const target = this.scrollContainer.nativeElement.querySelector('#' + id);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /** Scroll back to the top of the document. */
  scrollToTop(): void {
    this.scrollContainer.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
