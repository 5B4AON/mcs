/**
 * Morse Code Studio
 */

import { Component } from '@angular/core';
import { SendPracticeService } from '../../services/send-practice.service';
import { SettingsService } from '../../services/settings.service';
import { EbookService } from '../../services/ebook.service';
import { PromptTickerDirective } from '../prompt-ticker.directive';

/**
 * The Send Practice prompt box, shared by the main screen (where it takes the place of
 * the typing box) and the full-screen view (pinned above the output area).
 *
 * It shows the text to key on one line that slides like an RSS ticker so that the
 * character to key next stays in the middle; that character is bigger and blue, and
 * with "As you go" the characters already keyed are green or red. Under it, centred,
 * are the dots and dashes of the character to key next when the pattern hint is on.
 * Before a round it says how to start one instead.
 */
@Component({
  selector: 'app-send-prompt',
  standalone: true,
  imports: [PromptTickerDirective],
  templateUrl: './send-prompt.component.html',
  styleUrls: ['./send-prompt.component.css'],
})
export class SendPromptComponent {
  constructor(
    public sendPractice: SendPracticeService,
    public settings: SettingsService,
    public ebook: EbookService,
  ) {}

  /** Changes whenever the book's reading position moves, so the ticker slides to the next character */
  get ebookTickerKey(): string {
    const pos = this.ebook.position();
    return `${pos.block}:${pos.at}:${this.ebook.revision()}`;
  }

  /** What the box says while there is no prompt to key */
  get note(): string {
    if (this.sendPractice.state() === 'idle' && !this.sendPractice.inputsReady()) {
      return 'No key input is active. Pick keys in Settings → Other → Send Practice.';
    }
    return this.sendPractice.isMultiRound()
      ? `Press the button or key: ${this.sendPractice.actionLabel()}.`
      : 'Press the button or key to see the challenge text.';
  }
}
