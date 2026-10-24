/**
 * Morse Code Studio
 */

import { NgTemplateOutlet } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';
import { MAIN_GOALS, MORE_GOALS, SetupGoal, WizardGoalId } from './setup-goals';

export type { GoalTab, GoalTarget, GoalLanding, WizardGoalId } from './setup-goals';

/**
 * Goal list of the Setup Wizard modal.
 *
 * Main goals are always visible; "More goals" expands and collapses. It is
 * navigation only: it has no access to settings or devices and never enables,
 * connects or sends anything.
 */
@Component({
  selector: 'app-goal-navigator',
  standalone: true,
  imports: [NgTemplateOutlet],
  templateUrl: './goal-navigator.component.html',
  styleUrls: ['./goal-navigator.component.css'],
})
export class GoalNavigatorComponent {
  /** Emitted with the landing key of a goal that has no guided setup. */
  @Output() readonly goalSelected = new EventEmitter<string>();

  /** Emitted when the user asks for the guided setup of a goal. */
  @Output() readonly wizardRequested = new EventEmitter<WizardGoalId>();

  readonly mainGoals: SetupGoal[] = MAIN_GOALS;

  readonly moreGoals: SetupGoal[] = MORE_GOALS;

  /** Whether the More goals group is expanded */
  moreOpen = false;

  toggleMore(): void {
    this.moreOpen = !this.moreOpen;
  }

  /** Start the guided setup for a goal, or open its settings card. */
  choose(goal: SetupGoal): void {
    if (goal.wizard) this.wizardRequested.emit(goal.wizard);
    else this.goalSelected.emit(goal.landing);
  }
}
