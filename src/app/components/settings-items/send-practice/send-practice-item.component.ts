/**
 * Morse Code Studio
 */

import { Component, Input, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { KOCH_DEFAULT_GROUP_SIZE } from '../practice/practice-item.model';
import {
  SEND_KOCH_DEFAULT_COUNT, SendPracticeCheckMode, SendPracticeContentMode, SendPracticeHint, SendPracticePipeline,
} from './send-practice-item.model';
import { sendPracticeInputRows, staleSendPracticeInputs } from './send-practice-inputs';
import { KOCH_LESSON_COUNT, kochLessonLabel } from '../../../data/koch-lessons';
import { kochLessonHint } from '../practice/practice-ui.utils';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { HelpLinkButtonComponent } from '../help-link-button/help-link-button.component';
import { SETTINGS_SCOPE } from '../settings-scope';
import { EbookLoadComponent } from '../ebook-load/ebook-load.component';

/**
 * Settings item — Send Practice.
 *
 * The mirror of Copy Practice: the app shows a target (random characters,
 * words, callsigns or Koch lessons) and the user keys it with a straight key,
 * paddle, MIDI or serial key, or any other key input they pick here. Edits
 * the content, checking, rounds, pipeline, pattern hint and which keys count.
 */
@Component({
  selector: 'app-send-practice-item',
  standalone: true,
  imports: [FormsModule, ItemShellComponent, HelpLinkButtonComponent, EbookLoadComponent],
  templateUrl: './send-practice-item.component.html',
  styles: [':host { display: contents; }'],
})
export class SendPracticeItemComponent {
  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';

  /** A wizard step can show one part of the card; Settings shows all of it. */
  @Input() part: 'all' | 'keys' | 'content' | 'book' | 'checking' | 'hint' | 'pipeline' = 'all';

  /** A guide that keeps send practice on this device hides the pipeline choice. */
  @Input() forceLocalPipeline = false;

  readonly scope = inject(SETTINGS_SCOPE);

  /** Current values from the scope */
  readonly s = this.scope.value;

  /** Koch lesson numbers for the Lesson select */
  readonly kochLessons = Array.from({ length: KOCH_LESSON_COUNT }, (_, i) => i + 1);
  readonly kochLessonLabel = kochLessonLabel;

  /** One row per key the user has set up (greyed when its own switch is off) */
  readonly inputRows = computed(() => sendPracticeInputRows(this.s()));

  /** Selected keys whose mapping no longer exists */
  readonly staleInputs = computed(() => staleSendPracticeInputs(this.s()));

  /** One line on what the chosen lesson plays */
  kochLessonHint(): string {
    return kochLessonHint(this.s().sendPracticeKochLesson);
  }

  /** Whether a key is ticked in the picker */
  isInputSelected(id: string): boolean {
    return this.s().sendPracticeInputs.includes(id);
  }

  /** Tick or untick a key; the list keeps a stable order */
  onInputToggle(id: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const current = this.s().sendPracticeInputs.filter(x => x !== id);
    if (checked) current.push(id);
    const order = new Map(this.inputRows().map((r, i) => [r.id, i]));
    current.sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER));
    this.scope.update({ sendPracticeInputs: current });
  }

  onContentModeChange(event: Event): void {
    const mode = (event.target as HTMLSelectElement).value as SendPracticeContentMode;
    // Choosing Koch method starts at 5 groups of 5 characters; the user can change both
    this.scope.update(mode === 'koch' && this.s().sendPracticeContentMode !== 'koch'
      ? { sendPracticeContentMode: mode, sendPracticeCharGroupSize: KOCH_DEFAULT_GROUP_SIZE, sendPracticeGroupCount: SEND_KOCH_DEFAULT_COUNT }
      : { sendPracticeContentMode: mode });
  }

  onKochLessonChange(event: Event): void {
    this.scope.update({ sendPracticeKochLesson: +(event.target as HTMLSelectElement).value });
  }

  onGroupCountChange(event: Event): void {
    this.scope.update({ sendPracticeGroupCount: +(event.target as HTMLSelectElement).value });
  }

  onCharGroupSizeChange(event: Event): void {
    this.scope.update({ sendPracticeCharGroupSize: +(event.target as HTMLSelectElement).value });
  }

  onPoolToggle(field: 'sendPracticeIncludeLetters' | 'sendPracticeIncludeNumbers' | 'sendPracticeIncludePunctuation', event: Event): void {
    this.scope.update({ [field]: (event.target as HTMLInputElement).checked });
  }

  onWordLengthToggle(len: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const current = [...this.s().sendPracticeWordLengths];
    if (checked && !current.includes(len)) {
      current.push(len);
      current.sort();
    } else if (!checked && current.length > 1) {
      const idx = current.indexOf(len);
      if (idx !== -1) current.splice(idx, 1);
    }
    this.scope.update({ sendPracticeWordLengths: current });
  }

  onCheckModeChange(event: Event): void {
    this.scope.update({ sendPracticeCheckMode: (event.target as HTMLSelectElement).value as SendPracticeCheckMode });
  }

  onRoundsChange(event: Event): void {
    this.scope.update({ sendPracticeRounds: +(event.target as HTMLSelectElement).value });
  }

  onPipelineChange(event: Event): void {
    this.scope.update({ sendPracticePipeline: (event.target as HTMLSelectElement).value as SendPracticePipeline });
  }

  onHintChange(event: Event): void {
    this.scope.update({ sendPracticeHint: (event.target as HTMLSelectElement).value as SendPracticeHint });
  }

  /** Master switch; turning send practice off also leaves send practice mode (live Settings only) */
  onEnabledChange(enabled: boolean): void {
    this.scope.update({ sendPracticeEnabled: enabled });
    if (!enabled && this.scope.isLive && this.s().encoderMode === 'send-practice') {
      this.scope.update({ encoderMode: 'enter' });
    }
  }
}
