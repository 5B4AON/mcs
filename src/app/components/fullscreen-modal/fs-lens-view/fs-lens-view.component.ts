/**
 * Morse Code Studio
 */

import { Component, Input } from '@angular/core';
import { SettingsService } from '../../../services/settings.service';
import { LensService, LensFrame } from '../../../services/lens.service';
import { LensGeometry, layoutPattern, patternWords } from './lens-layout';

/**
 * Lens view — the latest character shown large with its Morse symbols below.
 *
 * Fills the fullscreen conversation area and sizes everything from its own
 * box with CSS container units, so it follows the window, the on-screen
 * keyboard (the modal already shrinks above it) and the touch keyer inset
 * without measuring anything. RX and TX colours apply; text size settings
 * do not.
 */
@Component({
  selector: 'app-fs-lens-view',
  standalone: true,
  templateUrl: './fs-lens-view.component.html',
  styleUrls: ['./fs-lens-view.component.css'],
})
export class FsLensViewComponent {
  /** Active text blur mode; it hides the big character only. */
  @Input() blurMode: 'rx' | 'tx' | 'both' | null = null;
  /** True while the hold-to-reveal button is pressed. */
  @Input() revealing = false;

  constructor(
    public settings: SettingsService,
    public lens: LensService,
  ) {}

  /** The one-item list lets the template restart the pop animation per character. */
  get frames(): LensFrame[] {
    const frame = this.lens.frame();
    return frame ? [frame] : [];
  }

  /** Foreground: the input's own colour, else the RX/TX colour. */
  colorOf(frame: LensFrame): string {
    const d = this.settings.modalDisplay();
    return frame.color || (frame.source === 'rx' ? d.rxForeground : d.txForeground);
  }

  /** The stale character keeps the colour of the input it came from; null leaves the frame colour. */
  staleColorOf(frame: LensFrame): string | null {
    if (!frame.stale || !frame.charSource) return null;
    const d = this.settings.modalDisplay();
    return frame.charColor || (frame.charSource === 'rx' ? d.rxForeground : d.txForeground);
  }

  /** Prosigns are shown without the angle brackets and with an overline. */
  isProsign(frame: LensFrame): boolean {
    return !!frame.char && frame.char.length > 1;
  }

  /** A keyed character is not decoded yet: a hidden blank keeps the letter's space so the symbols do not move later. */
  displayChar(frame: LensFrame): string {
    return frame.char ? frame.char.replace(/^<|>$/g, '') : '\u00a0';
  }

  /** Number of letters to fit across the width (prosigns such as SOS are wider). */
  charCount(frame: LensFrame): number {
    return Math.max(1, this.displayChar(frame).length);
  }

  isBlurred(frame: LensFrame): boolean {
    if (!this.blurMode || this.revealing) return false;
    return this.blurMode === 'both' || this.blurMode === frame.source;
  }

  geometry(frame: LensFrame): LensGeometry {
    return layoutPattern(frame.pattern, frame.planned);
  }

  /** Announced once, when the character is known; skipped while blurred or while it is the previous character. */
  announcement(frame: LensFrame | null): string {
    if (!frame || !frame.char || frame.stale || this.isBlurred(frame)) return '';
    const spoken = this.displayChar(frame);
    return frame.pattern ? `${spoken}, ${patternWords(frame.pattern)}` : spoken;
  }
}
