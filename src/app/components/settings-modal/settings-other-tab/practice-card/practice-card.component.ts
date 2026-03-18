/**
 * Morse Code Studio
 */

import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService, PracticeContentMode, PracticeFeedbackMode, PracticePipeline, DecoderSource } from '../../../../services/settings.service';

/**
 * Settings card — Copy Practice.
 *
 * Configures copy practice: content mode (random characters, words,
 * or callsigns), group count, character pool, word lengths, feedback
 * mode, pipeline, and input direction/name/color.
 */
@Component({
  selector: 'app-practice-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './practice-card.component.html',
  styles: [':host { display: contents; }'],
})
export class PracticeCardComponent {
  /** Whether this card's body is expanded */
  expanded = false;

  constructor(public settings: SettingsService) {}

  /** Handle master toggle change */
  onEnabledChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ practiceEnabled: checked });
    // If disabling and currently in practice mode, revert to 'enter'
    if (!checked && this.settings.settings().encoderMode === 'practice') {
      this.settings.update({ encoderMode: 'enter' });
    }
  }

  /** Handle content mode change */
  onContentModeChange(event: Event): void {
    this.settings.update({
      practiceContentMode: (event.target as HTMLSelectElement).value as PracticeContentMode,
    });
  }

  /** Handle group count change */
  onGroupCountChange(event: Event): void {
    this.settings.update({
      practiceGroupCount: +(event.target as HTMLSelectElement).value,
    });
  }

  /** Handle character group size change */
  onCharGroupSizeChange(event: Event): void {
    this.settings.update({
      practiceCharGroupSize: +(event.target as HTMLSelectElement).value,
    });
  }

  /** Handle character pool toggle */
  onPoolToggle(field: 'practiceIncludeLetters' | 'practiceIncludeNumbers' | 'practiceIncludePunctuation', event: Event): void {
    this.settings.update({
      [field]: (event.target as HTMLInputElement).checked,
    });
  }

  /** Handle word length toggle */
  onWordLengthToggle(len: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const current = [...this.settings.settings().practiceWordLengths];
    if (checked && !current.includes(len)) {
      current.push(len);
      current.sort();
    } else if (!checked && current.length > 1) {
      const idx = current.indexOf(len);
      if (idx !== -1) current.splice(idx, 1);
    }
    this.settings.update({ practiceWordLengths: current });
  }

  /** Handle feedback mode change */
  onFeedbackModeChange(event: Event): void {
    this.settings.update({
      practiceFeedbackMode: (event.target as HTMLSelectElement).value as PracticeFeedbackMode,
    });
  }

  /** Handle pipeline change */
  onPipelineChange(event: Event): void {
    this.settings.update({
      practicePipeline: (event.target as HTMLSelectElement).value as PracticePipeline,
    });
  }

  /** Handle source (direction) change */
  onSourceChange(event: Event): void {
    this.settings.update({
      practiceSource: (event.target as HTMLSelectElement).value as DecoderSource,
    });
  }

  /** Handle name change */
  onNameChange(event: Event): void {
    this.settings.update({
      practiceName: (event.target as HTMLInputElement).value,
    });
  }

  /** Handle color change */
  onColorChange(event: Event): void {
    this.settings.update({
      practiceColor: (event.target as HTMLInputElement).value,
    });
  }

  /** Clear color to use default */
  clearColor(): void {
    this.settings.update({ practiceColor: '' });
  }
}
