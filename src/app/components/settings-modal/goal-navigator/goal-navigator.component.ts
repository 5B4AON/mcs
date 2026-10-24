/**
 * Morse Code Studio
 */

import { NgTemplateOutlet } from '@angular/common';
import { ConfirmDialogComponent } from '../../confirm-dialog/confirm-dialog.component';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { GoalTab, GoalLanding, GoalTarget, LANDINGS, MAIN_GOALS, MORE_GOALS, SetupGoal, WizardGoalId } from './setup-goals';

export type { GoalTab, GoalTarget, GoalLanding, WizardGoalId } from './setup-goals';

/**
 * "Setup Wizard" panel for the Settings dialog.
 *
 * Maps a few plain-language goals to one existing settings card each and asks
 * the settings modal to open it. It is navigation only: it has no access to
 * settings or devices and never enables, connects or sends anything.
 */
@Component({
  selector: 'app-goal-navigator',
  standalone: true,
  imports: [NgTemplateOutlet, ConfirmDialogComponent],
  templateUrl: './goal-navigator.component.html',
  styleUrls: ['./goal-navigator.component.css'],
})
export class GoalNavigatorComponent implements OnInit {
  /** Tab currently shown; the guidance only applies while it matches. */
  @Input() currentTab: GoalTab = 'inputs';

  /** Open the goal list immediately, as when Settings is reached from "Setup Wizard". */
  @Input() startOpen = false;

  /** Emitted when the user picks a goal or a follow-up link. */
  @Output() readonly goalSelected = new EventEmitter<GoalTarget>();

  /** Emitted when the user asks for the guided setup of a goal. */
  @Output() readonly wizardRequested = new EventEmitter<WizardGoalId>();

  readonly mainGoals: SetupGoal[] = MAIN_GOALS;

  readonly moreGoals: SetupGoal[] = MORE_GOALS;

  /** Whether the goal list is expanded */
  panelOpen = false;

  /** Whether the More goals group is expanded */
  moreOpen = false;

  /** Landing the user last opened */
  opened: GoalLanding | null = null;

  /** Whether the hint dialog for the opened landing is showing */
  hintOpen = false;

  /** Label of the goal last opened, shown as the hint dialog title */
  get openedLabel(): string {
    return [...MAIN_GOALS, ...MORE_GOALS].find(goal => LANDINGS[goal.landing] === this.opened)?.label ?? 'Setup Wizard';
  }

  get hintMessage(): string {
    return this.opened?.hint ?? '';
  }

  /** Close the hint dialog; the confirm button follows the "Next" link when there is one. */
  onHintAnswer(confirmed: boolean): void {
    this.hintOpen = false;
    if (confirmed) this.followNext();
  }

  /** Guidance for the opened card, only while its tab is showing. */
  get activeLanding(): GoalLanding | null {
    return this.opened && this.opened.tab === this.currentTab ? this.opened : null;
  }

  /** Whether the given goal is the one last opened. */
  isOpened(key: string): boolean {
    return this.opened === LANDINGS[key];
  }

  ngOnInit(): void {
    this.panelOpen = this.startOpen;
  }

  /** Start the guided setup for a goal. */
  guide(goal: SetupGoal): void {
    if (goal.wizard) this.wizardRequested.emit(goal.wizard);
  }

  togglePanel(): void {
    this.panelOpen = !this.panelOpen;
  }

  toggleMore(): void {
    this.moreOpen = !this.moreOpen;
  }

  /** Open the card for a goal and collapse the panel. */
  select(key: string): void {
    const landing = LANDINGS[key];
    this.opened = landing;
    this.panelOpen = false;
    this.hintOpen = !!(landing.hint || landing.next);
    this.goalSelected.emit({ tab: landing.tab, cardId: landing.cardId });
  }

  /** Follow the opened landing's "Next" link. */
  followNext(): void {
    const next = this.opened?.next;
    if (next) this.select(next.landing);
  }
}
