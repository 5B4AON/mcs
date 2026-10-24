/**
 * Morse Code Studio
 */

import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Settings tab that hosts a goal's target card. */
export type GoalTab = 'inputs' | 'outputs' | 'other';

/** Where a goal lands: an existing settings card, with the guidance shown while it is open. */
export interface GoalLanding {
  /** Tab that hosts the card */
  tab: GoalTab;
  /** DOM id of the existing card (`settings-card-<name>-card`) */
  cardId: string;
  /** One-sentence guidance for this goal */
  hint?: string;
  /** Optional follow-up link to another landing */
  next?: { label: string; landing: string };
}

/** Target of a navigation request emitted to the settings modal. */
export interface GoalTarget {
  tab: GoalTab;
  cardId: string;
}

interface Goal {
  label: string;
  landing: string;
}

const LANDINGS: Record<string, GoalLanding> = {
  'keyboard-keyer': {
    tab: 'inputs', cardId: 'settings-card-keyboard-keyer-card',
    hint: 'Mouse and touch keyers are further down this tab.',
  },
  'encoder': {
    tab: 'inputs', cardId: 'settings-card-encoder-card',
  },
  'practice': {
    tab: 'other', cardId: 'settings-card-practice-card',
  },
  'midi-input': {
    tab: 'inputs', cardId: 'settings-card-midi-input-card',
    hint: 'To send Morse on to a radio or other device, see \u201cConnect a radio or other hardware\u201d under More goals.',
  },
  'rtdb-input': {
    tab: 'inputs', cardId: 'settings-card-rtdb-input-card',
    hint: 'To talk, use the same channel name and secret on both the input and the output.',
    next: { label: 'Next: Firebase RTDB output', landing: 'rtdb-output' },
  },
  'rtdb-output': {
    tab: 'outputs', cardId: 'settings-card-rtdb-output-card',
    hint: 'Use the same channel name and secret as your Firebase RTDB input. Anything you send goes to that channel.',
  },
  'midi-output': {
    tab: 'outputs', cardId: 'settings-card-midi-output-card',
    hint: 'Radio keyed by a serial port or WinKeyer? Those cards are further down this tab. Using a serial key or paddle as an input? See Serial Input on the Inputs tab.',
  },
  'cw-detector': {
    tab: 'inputs', cardId: 'settings-card-cw-detector-card',
    hint: 'Works best with clean, strong tones. For reliable results use a key or paddle input.',
  },
};

/**
 * "Set up by goal" panel for the Settings dialog.
 *
 * Maps a few plain-language goals to one existing settings card each and asks
 * the settings modal to open it. It is navigation only: it has no access to
 * settings or devices and never enables, connects or sends anything.
 */
@Component({
  selector: 'app-goal-navigator',
  standalone: true,
  templateUrl: './goal-navigator.component.html',
  styleUrls: ['./goal-navigator.component.css'],
})
export class GoalNavigatorComponent {
  /** Tab currently shown; the guidance only applies while it matches. */
  @Input() currentTab: GoalTab = 'inputs';

  /** Emitted when the user picks a goal or a follow-up link. */
  @Output() readonly goalSelected = new EventEmitter<GoalTarget>();

  readonly mainGoals: Goal[] = [
    { label: 'Practice sending Morse with keyboard, mouse or touch', landing: 'keyboard-keyer' },
    { label: 'Type text and hear or send it as Morse', landing: 'encoder' },
    { label: 'Practice receiving (copy practice)', landing: 'practice' },
    { label: 'Use my paddle or key through MIDI', landing: 'midi-input' },
    { label: 'Talk to other people over the internet', landing: 'rtdb-input' },
  ];

  readonly moreGoals: Goal[] = [
    { label: 'Connect a radio or other hardware', landing: 'midi-output' },
    { label: 'Decode audio from a radio (advanced)', landing: 'cw-detector' },
  ];

  /** Whether the goal list is expanded */
  panelOpen = false;

  /** Whether the More goals group is expanded */
  moreOpen = false;

  /** Landing the user last opened */
  opened: GoalLanding | null = null;

  /** Guidance for the opened card, only while its tab is showing. */
  get activeLanding(): GoalLanding | null {
    return this.opened && this.opened.tab === this.currentTab ? this.opened : null;
  }

  /** Whether the given goal is the one last opened. */
  isOpened(key: string): boolean {
    return this.opened === LANDINGS[key];
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
    this.goalSelected.emit({ tab: landing.tab, cardId: landing.cardId });
  }

  /** Follow the opened landing's "Next" link. */
  followNext(): void {
    const next = this.activeLanding?.next;
    if (next) this.select(next.landing);
  }
}
