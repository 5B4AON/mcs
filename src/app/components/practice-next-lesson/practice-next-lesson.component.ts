/**
 * Morse Code Studio
 */

import { Component, Input } from '@angular/core';
import { PracticeService } from '../../services/practice.service';
import { SendPracticeService } from '../../services/send-practice.service';
import { SettingsService } from '../../services/settings.service';
import { KOCH_LESSON_COUNT } from '../../data/koch-lessons';
import { KochRecommendation, kochRecommendation, sendKochRecommendation } from '../settings-items/practice/practice-ui.utils';

/**
 * Koch method advice under a practice result: with an accuracy above 90 % it
 * recommends the next lesson and offers a button that moves to it. Nothing
 * changes by itself; the lesson only changes when the learner clicks. Shown
 * nowhere for other content types or lower scores. After the last lesson it
 * congratulates the learner (the fireworks are drawn by the output area itself,
 * see `PracticeService.kochFinished`).
 */
@Component({
  selector: 'app-practice-next-lesson',
  standalone: true,
  template: `
    @if (recommendation; as rec) {
      <div class="next-lesson" aria-live="polite">
        @if (rec.kind === 'next') {
          <span class="next-lesson-text">
            <span>Over 90 % — ready for lesson {{ rec.lesson }}.</span>
            <span>New character: {{ rec.newChars }}</span>
          </span>
          <button type="button" class="pill-btn pill-primary" (click)="goTo(rec.lesson)">Go to lesson {{ rec.lesson }}</button>
        } @else {
          <div class="finale">
            <strong class="finale-title">Congratulations!</strong>
            <span>You scored over 90 % in the last lesson and have completed all {{ lessonCount }} Koch lessons.</span>
            <span>Brilliant work!</span>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
      /* The output area breaks anywhere; these messages wrap whole words */
      word-break: normal;
      overflow-wrap: break-word;
    }
    .next-lesson {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: .5rem .75rem;
      margin-top: .75rem;
      font-family: system-ui, sans-serif;
      font-size: .85rem;
      color: inherit;
    }
    .next-lesson-text {
      display: flex;
      flex-direction: column;
    }
    .next-lesson:has(.finale) {
      justify-content: center;
    }
    .finale {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: .2rem;
      width: 100%;
      text-align: center;
      line-height: 1.3;
    }
    .finale-title {
      font-size: 1.15rem;
    }
  `],
})
export class PracticeNextLessonComponent {
  /** The accuracy shown in the result (a round, or the average of a session) */
  @Input() accuracy = 0;

  /** Whose Koch lesson the advice is about: Copy practice (default) or Send practice */
  @Input() kind: 'copy' | 'send' = 'copy';

  readonly lessonCount = KOCH_LESSON_COUNT;

  constructor(
    private settings: SettingsService,
    private practice: PracticeService,
    private sendPractice: SendPracticeService,
  ) {}

  /** The advice for the current accuracy, or null when there is none */
  get recommendation(): KochRecommendation | null {
    return this.kind === 'send'
      ? sendKochRecommendation(this.settings.settings(), this.accuracy)
      : kochRecommendation(this.settings.settings(), this.accuracy);
  }

  /** Move to the lesson and return to the idle practice state */
  goTo(lesson: number): void {
    if (this.kind === 'send') this.sendPractice.goToKochLesson(lesson);
    else this.practice.goToKochLesson(lesson);
  }
}
