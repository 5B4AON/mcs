/**
 * Morse Code Studio
 */

import { AppSettings } from '../../../services/settings.service';
import { WizardGoalId } from '../../settings-modal/goal-navigator/setup-goals';

/*
 * Declarative wizard flows
 * ------------------------
 * A flow is plain data: an ordered list of steps. Each step has guidance text,
 * optional wizard-only questions, and the settings items to show. The engine
 * (`wizard-engine.ts`) interprets it; the wizard shell draws it. To add a
 * wizard, write a flow file in `../flows/` and register it - no engine or
 * template code changes.
 *
 * Review and Done are not part of a flow: the shell appends them to every flow.
 */

/** How much help a user wants: decides which steps a goal shows (see `levels.ts`). */
export type WizardLevel = 'novice' | 'intermediate' | 'expert';

/** Wizard-only answers (not settings), keyed by question id. */
export type WizardAnswers = Readonly<Record<string, unknown>>;

/** What a condition can look at: the draft settings and the answers so far. */
export interface ConditionContext {
  settings: AppSettings;
  answers: WizardAnswers;
  /** The level chosen on the goal's first step (Novice when the goal has no level step) */
  level: WizardLevel;
}

/** Pure yes/no question about the draft; decides whether a step is shown. */
export type Condition = (ctx: ConditionContext) => boolean;

/** One choice of a question. */
export interface QuestionOption {
  value: string;
  label: string;
  hint?: string;
  /** Shown but not selectable (for example a keyer this device does not support) */
  disabled?: boolean;
}

/**
 * A wizard-only question, for choices that decide which steps follow
 * (for example "what will you do?") but are not themselves settings.
 */
export interface StepQuestion {
  /** Answer id; conditions and Revert use it */
  id: string;
  label: string;
  /** `single` = pick one, `select` = pick one from a dropdown, `multi` = pick any, `number` = a count, `boolean` = yes/no */
  kind: 'single' | 'select' | 'multi' | 'number' | 'text' | 'boolean';
  options?: QuestionOption[];
  /** Start value; also what Revert restores */
  default: unknown;
  /** Start value taken from the current settings (e.g. which inputs are on now); wins over `default` unless it returns undefined. */
  defaultFrom?: (settings: AppSettings) => unknown;
  /** Start value per level; used when `defaultFrom` gives none, before `default`. */
  defaultByLevel?: Partial<Record<WizardLevel, unknown>>;
  /** A remembered preference (such as the level), not an answer about this setup: it never counts as a change */
  preference?: boolean;
  /** Dynamic choices based on the draft and preceding answers. */
  optionsFrom?: (ctx: ConditionContext) => QuestionOption[];
  hint?: string;
  /** For `number` questions */
  min?: number;
  max?: number;
  /** For `text` questions */
  maxLength?: number;
}

/** A settings item placed on a step. */
export interface StepItem {
  /** Registry id of the item (see `item-registry.ts`) */
  item: string;
  /** Wizard steps normally use the flat look */
  mode?: 'card' | 'embedded';
  /** Per-placement item inputs override the registry defaults. */
  inputs?: Record<string, unknown>;
  /** Extra plain-language line shown with the item */
  hint?: string;
}

/**
 * Repeat a step once per entry of a mapping list: one page per mapping, then a
 * list page ("add another", open, delete). The engine expands the step, so a
 * flow only declares this.
 */
export interface StepRepeat {
  /** Settings list that holds the mappings, e.g. `keyboardInputMappings` */
  list: keyof AppSettings;
  /** Mapping kind id (see `mapping-registry.ts`) */
  item: string;
  /** Title of the list page; defaults to the step title */
  listTitle?: string;
  /** Text of the list page; has a plain default */
  listIntro?: string;
  /** Suggested names for new mappings, used in turn for each added mapping that has a blank name */
  nameIdeas?: readonly string[];
}

/**
 * Set by the engine on the pages it expands from a repeat step; flows never
 * write it. `mapping` pages edit mapping `index`; the `list` page shows all.
 */
export interface StepPage {
  kind: 'mapping' | 'list';
  /** Mapping position (for `list` pages: the number of mappings) */
  index: number;
  /** Id of the step this page was expanded from */
  baseId: string;
  list: keyof AppSettings;
  item: string;
}

/** One headed, numbered list of a run sheet (see `WizardStep.sheet`). */
export interface RunSheetSection {
  heading: string;
  /** Short plain sentences, shown as a numbered list */
  lines: string[];
}

/** One page of the wizard. */
export interface WizardStep {
  id: string;
  title: string;
  /** Short plain-language explanation shown above the items */
  intro: string;
  /** Longer help, shown on request */
  help?: string;
  /** Contextual Help chapter section id */
  helpSection?: string;
  questions?: StepQuestion[];
  items?: StepItem[];
  /** Step is shown only when this is true; omit to always show */
  when?: Condition;
  /** Lowest level that sees this step (only in a flow with `levels`); omit for every level */
  level?: WizardLevel;
  /** Extra checks on the answers (item values are checked by the items' own descriptors) */
  validate?: (ctx: ConditionContext) => string[];
  repeat?: StepRepeat;
  /** A run sheet: headed numbered lists computed from the answers, with a Copy button (see the Teach goal) */
  sheet?: (ctx: ConditionContext) => RunSheetSection[];
  /** Engine-set: this is one expanded page of a repeat step */
  page?: StepPage;
}

/** A forced value, or a function that works it out from the draft and answers. */
export type ForcedValue = {} | null | undefined | ((ctx: ConditionContext) => unknown);

/** A setting the goal always sets when applied, shown separately in the review. */
export interface ForcedSetting {
  key: keyof AppSettings;
  /** The value, or a function of the draft and answers when it depends on them */
  value: ForcedValue;
  /** Plain-language line for the review; a function when it names a computed value */
  label: string | ((ctx: ConditionContext) => string);
  /** Only forced while this holds (e.g. the user chose a path that needs the setting on) */
  when?: Condition;
}

/** A whole wizard goal. */
export interface WizardFlow {
  id: string;
  title: string;
  /** The goal in the goal list this flow belongs to */
  goal: WizardGoalId;
  steps: WizardStep[];
  /** The goal starts with the level question and shows steps by their `level` */
  levels?: boolean;
  /**
   * Suggested values per level for settings of this goal. They are applied when the user
   * leaves the level step, and only to settings still at the app's factory default, so a
   * value the user chose earlier is never replaced.
   */
  levelDefaults?: Partial<Record<WizardLevel, Partial<AppSettings>>>;
  forced?: ForcedSetting[];
  /** Validate shared items against the forced values, rather than only the editable draft. */
  validateWithFlowSettings?: boolean;
  /** Replaces the standard first step that asks for the level (same question id), for a goal with its own wording */
  levelStep?: WizardStep;
  /** Plain-language lines for the top of the review: what this setup will do, decided from the answers */
  summary?: (ctx: ConditionContext) => string[];
  /** The goal's own way of deciding whether Apply opens the full screen (default: the `screen` answer is fullscreen or lens) */
  fullscreenWhen?: Condition;
  /** Steps skipped for the level are decided by the goal itself, so the review does not say they keep their settings */
  skippedAreDecided?: boolean;
  /** Hide "Start from a saved preset": the goal's result is derived from answers, so a loaded preset could not be edited */
  noPresetStart?: boolean;
  /** Suggested name when saving the proposed setup as a preset */
  presetName?: (ctx: ConditionContext) => string;
  /**
   * Corrections to earlier answers that a change has made invalid (for example an intent that no
   * longer suits the audience just chosen). Applied after every answer change until nothing moves.
   */
  reconcile?: (ctx: ConditionContext) => Record<string, unknown>;
}
