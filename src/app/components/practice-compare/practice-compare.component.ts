/**
 * Morse Code Studio
 */

import { Component, Input, ViewEncapsulation, computed } from '@angular/core';
import { PracticeFeedback, typedDisplay } from '../../services/practice-scoring';
import { TypedPlacer } from '../../services/typed-placer';
import { PracticeService } from '../../services/practice.service';
import { MorseEncoderService } from '../../services/morse-encoder.service';

/** One character of the challenge and what was typed under it. */
interface CompareCell {
  ref: string;
  typed: string;
  result: PracticeFeedback['result'] | null;
}

/** A word (or group): its cells stay together on a line; `space` says a gap follows it. */
interface CompareWord {
  cells: CompareCell[];
  space: boolean;
}

/**
 * Copy practice in Type-along: the challenge with what the learner typed under each of its characters, for
 * the main screen and the full-screen view. While the sequence plays it shows what has been played so far,
 * blurred like the other practice text where the box around it says so (the typed text never is); after
 * Validate it shows the whole challenge in the feedback colours with the typed text still under it, so the
 * two can be compared. Both wrap together, one row of the challenge over one row of typing.
 *
 * The typing is lined up with the challenge the way the score is (see `alignPractice`): a missed character
 * leaves its place empty, a wrong one stays under the character it was meant for, and extra characters
 * are dropped once the typing is back in step.
 */
@Component({
  selector: 'app-practice-compare',
  standalone: true,
  templateUrl: './practice-compare.component.html',
  styleUrl: './practice-compare.component.css',
  encapsulation: ViewEncapsulation.None,
})
export class PracticeCompareComponent {
  /** Which direction the practice counts as; the blur setting of the box around applies to it. */
  @Input() source: 'rx' | 'tx' = 'rx';
  /** Colour of the challenge text (the box's own when empty). */
  @Input() color: string | null = null;
  /** Colour of the typed text (a default when empty). */
  @Input() typedColor: string | null = null;

  constructor(
    private practice: PracticeService,
    private encoder: MorseEncoderService,
  ) {}

  /** Places the typing under the challenge while it plays (it only moves it when it is sure; see `TypedPlacer`). */
  private readonly placer = new TypedPlacer();
  private placedFor = '';

  /** The score is on show: the challenge is coloured by it. Before that the colours only show while the eye button is held. */
  readonly validated = computed(() => this.practice.feedback().length > 0);

  readonly words = computed<CompareWord[]>(() => {
    const feedback = this.practice.feedback();
    let cells: CompareCell[];
    if (feedback.length) {
      const typed = this.practice.feedbackTyped();
      cells = feedback.map((f, i) => ({ ref: f.ref, typed: typedDisplay(typed[i] ?? '', f.ref), result: f.result }));
    } else {
      const reference = this.practice.referenceText();
      if (reference !== this.placedFor) {
        this.placer.reset();
        this.placedFor = reference;
      }
      const played = this.practice.state() === 'finished' ? reference : reference.slice(0, this.encoder.sentIndex());
      this.placer.update(reference, played.length, this.practice.userInput());
      cells = Array.from(played).map((ref, i) => ({ ref, typed: this.placer.text(i), result: this.placer.result(i) }));
    }
    const words: CompareWord[] = [];
    let current: CompareCell[] = [];
    for (const cell of cells) {
      if (cell.ref === ' ') {
        // A gap that was missed or mistyped keeps what was typed under it
        if (cell.typed) current.push({ ...cell, ref: '\u00A0' });
        words.push({ cells: current, space: true });
        current = [];
      } else {
        current.push(cell);
      }
    }
    if (current.length) words.push({ cells: current, space: false });
    return words;
  });
}
