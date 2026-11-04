/**
 * Morse Code Studio
 */

import { Component, Input } from '@angular/core';
import { PracticeService } from '../../services/practice.service';
import { SettingsService } from '../../services/settings.service';
import { KochRecommendation, kochRecommendation } from '../settings-items/practice/practice-ui.utils';

/**
 * Koch method advice under a practice result: with an accuracy above 90 % it
 * recommends the next lesson and offers a button that moves to it. Nothing
 * changes by itself; the lesson only changes when the learner clicks. Shown
 * nowhere for other content types or lower scores.
 */
@Component({
  selector: 'app-practice-next-lesson',
  standalone: true,
  template: `
    @if (recommendation; as rec) {
      <div class="next-lesson" aria-live="polite">
        @if (rec.kind === 'next') {
          <span>Over 90 % — ready for lesson {{ rec.lesson }} (new: {{ rec.newChars }}).</span>
          <button type="button" class="pill-btn pill-primary" (click)="goTo(rec.lesson)">Go to lesson {{ rec.lesson }}</button>
        } @else {
          <span>Over 90 % — you have completed all Koch lessons.</span>
        }
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
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
  `],
})
export class PracticeNextLessonComponent {
  /** The accuracy shown in the result (a round, or the average of a session) */
  @Input() accuracy = 0;

  constructor(
    private settings: SettingsService,
    private practice: PracticeService,
  ) {}

  /** The advice for the current accuracy, or null when there is none */
  get recommendation(): KochRecommendation | null {
    return kochRecommendation(this.settings.settings(), this.accuracy);
  }

  /** Move to the lesson and return to the idle practice state */
  goTo(lesson: number): void {
    this.practice.goToKochLesson(lesson);
  }
}
