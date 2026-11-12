/**
 * Morse Code Studio
 */

import { Component } from '@angular/core';
import { KochHelpCell, KochHelpService } from '../../services/koch-help.service';
import { LensGeometry, layoutPattern } from '../fullscreen-modal/fs-lens-view/lens-layout';

/**
 * `app-koch-help-overlay`: a see-through panel over the output area that shows the new
 * characters of the Koch lesson with their dots and dashes, each revealed as its tone sounds
 * (like Lens, but smaller). It fills the positioned box it sits in and takes no clicks.
 */
@Component({
  selector: 'app-koch-help-overlay',
  standalone: true,
  templateUrl: './koch-help-overlay.component.html',
  styleUrls: ['./koch-help-overlay.component.css'],
})
export class KochHelpOverlayComponent {
  constructor(public help: KochHelpService) {}

  /** Symbol positions for a cell, centred as if the whole pattern were shown. */
  geometry(cell: KochHelpCell): LensGeometry {
    return layoutPattern(cell.revealed, cell.morse);
  }

  /** Spoken form for screen readers, for example "New letters: K M" or "Starting in 3" */
  get announcement(): string {
    const chars = this.help.cells().map(cell => cell.char).join(' ');
    return this.help.mode() === 'countdown' ? `Starting in ${chars}` : `New letters: ${chars}`;
  }
}
