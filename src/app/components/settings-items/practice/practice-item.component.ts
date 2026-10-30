/**
 * Morse Code Studio
 */

import { Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PracticeContentMode, PracticeFeedbackMode, PracticePipeline } from './practice-item.model';
import { DecoderSource } from '../../../services/settings-common';
import { ItemShellComponent } from '../item-shell/item-shell.component';
import { SETTINGS_SCOPE } from '../settings-scope';

/**
 * Settings item — Copy Practice.
 *
 * Configures copy practice: content mode (random characters, words,
 * or callsigns), group count, character pool, word lengths, feedback
 * mode, pipeline, and input direction/name/color.
 */
@Component({
  selector: 'app-practice-item',
  standalone: true,
  imports: [FormsModule, ItemShellComponent],
  templateUrl: './practice-item.component.html',
  styles: [':host { display: contents; }'],
})
export class PracticeItemComponent {
  /** Card look (Settings) or flat look (wizard step) */
  @Input() mode: 'card' | 'embedded' = 'card';

  /** Classroom practice uses only local audio and vibration. */
  @Input() forceLocalPipeline = false;
  /** Classroom copy practice always receives decoded Morse. */
  @Input() forceReceivedMorse = false;

  readonly scope = inject(SETTINGS_SCOPE);

  /** Current values from the scope */
  readonly s = this.scope.value;

  /** Handle content mode change */
  onContentModeChange(event: Event): void {
    this.scope.update({
      practiceContentMode: (event.target as HTMLSelectElement).value as PracticeContentMode,
    });
  }

  /** Handle group count change */
  onGroupCountChange(event: Event): void {
    this.scope.update({
      practiceGroupCount: +(event.target as HTMLSelectElement).value,
    });
  }

  /** Handle character group size change */
  onCharGroupSizeChange(event: Event): void {
    this.scope.update({
      practiceCharGroupSize: +(event.target as HTMLSelectElement).value,
    });
  }

  /** Handle character pool toggle */
  onPoolToggle(field: 'practiceIncludeLetters' | 'practiceIncludeNumbers' | 'practiceIncludePunctuation', event: Event): void {
    this.scope.update({
      [field]: (event.target as HTMLInputElement).checked,
    });
  }

  /** Handle word length toggle */
  onWordLengthToggle(len: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const current = [...this.s().practiceWordLengths];
    if (checked && !current.includes(len)) {
      current.push(len);
      current.sort();
    } else if (!checked && current.length > 1) {
      const idx = current.indexOf(len);
      if (idx !== -1) current.splice(idx, 1);
    }
    this.scope.update({ practiceWordLengths: current });
  }

  /** Handle feedback mode change */
  onFeedbackModeChange(event: Event): void {
    this.scope.update({
      practiceFeedbackMode: (event.target as HTMLSelectElement).value as PracticeFeedbackMode,
    });
  }

  /** Handle Type-along session round count change */
  onRoundsChange(event: Event): void {
    this.scope.update({
      practiceRounds: +(event.target as HTMLSelectElement).value,
    });
  }

  /** Handle pipeline change */
  onPipelineChange(event: Event): void {
    this.scope.update({
      practicePipeline: (event.target as HTMLSelectElement).value as PracticePipeline,
    });
  }

  /** Handle source (direction) change */
  onSourceChange(event: Event): void {
    this.scope.update({
      practiceSource: (event.target as HTMLSelectElement).value as DecoderSource,
    });
  }

  /** Handle name change */
  onNameChange(event: Event): void {
    this.scope.update({
      practiceName: (event.target as HTMLInputElement).value,
    });
  }

  /** Handle color change */
  onColorChange(event: Event): void {
    this.scope.update({
      practiceColor: (event.target as HTMLInputElement).value,
    });
  }

  /** Clear color to use default */
  clearColor(): void {
    this.scope.update({ practiceColor: '' });
  }

  /** Master switch; turning practice off also leaves practice mode (live Settings only) */
  onEnabledChange(enabled: boolean): void {
    this.scope.update({ practiceEnabled: enabled });
    if (!enabled && this.scope.isLive && this.s().encoderMode === 'practice') {
      this.scope.update({ encoderMode: 'enter' });
    }
  }
}
