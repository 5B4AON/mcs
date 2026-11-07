/**
 * Morse Code Studio
 */

import { Component, Input } from '@angular/core';

/**
 * `app-morse-pattern`: the dots and dashes keyed so far, drawn as small round dots and
 * short bars on one centred line (like the Send practice hint and Lens) instead of the
 * characters "." and "-". Sizes are in `em`, so the symbols follow the text size around
 * them, and they take the colour of the surrounding text.
 */
@Component({
  selector: 'app-morse-pattern',
  standalone: true,
  template: `@for (el of elements; track $index) {<span [class.mp-dot]="el === '.'" [class.mp-dash]="el !== '.'"></span>}`,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      gap: .22em;
      vertical-align: middle;
      min-height: 1em;
    }
    .mp-dot,
    .mp-dash {
      display: inline-block;
      height: .24em;
      background: currentColor;
    }
    .mp-dot { width: .24em; border-radius: 50%; }
    .mp-dash { width: .75em; border-radius: .12em; }
  `],
  host: { 'aria-hidden': 'true' },
})
export class MorsePatternComponent {
  /** Dots and dashes as "." and "-" (anything else counts as a dash) */
  @Input() pattern = '';

  get elements(): string[] {
    return this.pattern.split('');
  }
}
