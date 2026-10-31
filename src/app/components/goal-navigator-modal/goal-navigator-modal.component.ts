/**
 * Morse Code Studio
 */

import { AfterViewInit, Component, ElementRef, EventEmitter, Output, ViewChild } from '@angular/core';
import { GoalNavigatorComponent } from '../settings-modal/goal-navigator/goal-navigator.component';
import { WizardGoalId } from '../settings-modal/goal-navigator/setup-goals';
import { focusDialog, trapDialogTabKey } from '../modal-accessibility';
import { BackdropClickDirective } from '../backdrop-click.directive';

/**
 * Setup Wizard modal: the plain-language goal list, in its own dialog of the
 * same size as Settings. It only navigates; the app opens the guided setup,
 * Settings or Presets in response to its outputs.
 */
@Component({
  selector: 'app-goal-navigator-modal',
  standalone: true,
  imports: [GoalNavigatorComponent, BackdropClickDirective],
  templateUrl: './goal-navigator-modal.component.html',
  styleUrls: ['./goal-navigator-modal.component.css'],
})
export class GoalNavigatorModalComponent implements AfterViewInit {
  @Output() readonly closed = new EventEmitter<void>();

  /** Open the named presets on top of this dialog. */
  @Output() readonly presetsRequested = new EventEmitter<void>();

  /** A goal without a guided setup was chosen; carries its landing key. */
  @Output() readonly goalSelected = new EventEmitter<string>();

  @Output() readonly wizardRequested = new EventEmitter<WizardGoalId>();

  @ViewChild('dialog') private dialog?: ElementRef<HTMLElement>;

  ngAfterViewInit(): void {
    if (this.dialog) focusDialog(this.dialog.nativeElement, '.settings-close-btn');
  }

  /** Keep Tab inside the dialog and let Escape close it while focus is here. */
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closed.emit();
      return;
    }
    if (this.dialog) trapDialogTabKey(event, this.dialog.nativeElement);
  }
}
