/**
 * Morse Code Studio
 */

import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * A slider with a round minus button on the left and a plus button on the
 * right, the same control as the Morse speeds. It works on plain numbers; the
 * host decides what they mean (WPM, percent, a multiplier) and shows the value
 * and its explanation above. Buttons stop at the limits.
 */
@Component({
  selector: 'app-stepper',
  standalone: true,
  templateUrl: './stepper.component.html',
  styleUrl: './stepper.component.css',
})
export class StepperComponent {
  @Input() value = 0;
  @Input() min = 0;
  @Input() max = 100;
  /** Size of one click on a button and of one slider notch */
  @Input() step = 1;
  /** Accessible name of the slider; the buttons say "Decrease"/"Increase" before it */
  @Input() label = '';

  @Output() valueChange = new EventEmitter<number>();

  nudge(direction: -1 | 1): void {
    this.valueChange.emit(Math.max(this.min, Math.min(this.max, this.value + direction * this.step)));
  }

  onInput(event: Event): void {
    this.valueChange.emit(+(event.target as HTMLInputElement).value);
  }
}
