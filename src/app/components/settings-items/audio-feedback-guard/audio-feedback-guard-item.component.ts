/**
 * Morse Code Studio
 */

import { Component, Input, computed, inject } from '@angular/core';
import { feedbackRiskOutputs } from './audio-feedback-guard-item.model';
import { SETTINGS_SCOPE } from '../settings-scope';

/**
 * Wizard item: explains the loop-back risk of listening with the CW Tone
 * Detector while the speakers play Morse, and offers one button that turns the
 * audio outputs off in the draft. It is a wizard aid only; Settings does not use it.
 */
@Component({
  selector: 'app-audio-feedback-guard-item',
  standalone: true,
  templateUrl: './audio-feedback-guard-item.component.html',
  styles: [`
    :host { display: contents; }
    .guard-warning { margin: .5rem 0; padding: .5rem .75rem; border: 1px solid #c90; border-radius: 6px; background: #3a3220; color: #fc3; font-size: .9rem; }
    .guard-warning p { margin: 0 0 .5rem; }
    .guard-note { margin: .5rem 0; font-size: .85rem; color: #bbb; }
    .guard-btn { padding: .4rem 1rem; border: 0; border-radius: 20px; background: linear-gradient(#506078, #3a4858); color: #fff; font-size: .78rem; font-weight: 700; cursor: pointer; }
    .guard-btn:focus-visible { outline: 2px solid #8cf; outline-offset: 2px; }
  `],
})
export class AudioFeedbackGuardItemComponent {
  /** Accepted for registry consistency; the guard always looks flat */
  @Input() mode: 'card' | 'embedded' = 'embedded';

  readonly scope = inject(SETTINGS_SCOPE);

  /** Audio outputs in the draft that could feed the microphone */
  readonly risky = computed(() => feedbackRiskOutputs(this.scope.value()));

  turnOff(): void {
    this.scope.update({ sidetoneEnabled: false, optoEnabled: false });
  }
}
