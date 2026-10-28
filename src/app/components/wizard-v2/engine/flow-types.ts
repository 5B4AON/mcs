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

/** Wizard-only answers (not settings), keyed by question id. */
export type WizardAnswers = Readonly<Record<string, unknown>>;

/** What a condition can look at: the draft settings and the answers so far. */
export interface ConditionContext {
  settings: AppSettings;
  answers: WizardAnswers;
}

/** Pure yes/no question about the draft; decides whether a step is shown. */
export type Condition = (ctx: ConditionContext) => boolean;

/** One choice of a question. */
export interface QuestionOption {
  value: string;
  label: string;
  hint?: string;
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
  kind: 'single' | 'select' | 'multi' | 'number' | 'text' | 'boolean' | 'participant';
  options?: QuestionOption[];
  /** Start value; also what Revert restores */
  default: unknown;
  /** Start value taken from the current settings (e.g. which inputs are on now); wins over `default`. */
  defaultFrom?: (settings: AppSettings) => unknown;
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
  /** Extra checks on the answers (item values are checked by the items' own descriptors) */
  validate?: (ctx: ConditionContext) => string[];
  repeat?: StepRepeat;
  /** Engine-set: this is one expanded page of a repeat step */
  page?: StepPage;
}

/** A setting the goal always sets when applied, shown separately in the review. */
export interface ForcedSetting {
  key: keyof AppSettings;
  value: unknown;
  label: string;
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
  forced?: ForcedSetting[];
  /** Settings keys derived from wizard-only answers rather than direct item edits. */
  derivedKeys?: readonly (keyof AppSettings)[];
  /** Build settings changes from wizard-only answers, preserving the starting settings. */
  derivePatch?: (ctx: ConditionContext, base: AppSettings) => Partial<AppSettings>;
  /** Validate shared items against forced/derived values, rather than only the editable draft. */
  validateWithFlowSettings?: boolean;
  /** Review lines for settings derived from wizard-only answers. */
  deriveReview?: (
    base: AppSettings,
    proposed: AppSettings,
    ctx: ConditionContext,
  ) => import('../../settings-items/item-descriptor').ItemReviewLine[];
  /** Permit a deliberate Apply action even when selected behavior already matches settings. */
  applyWhen?: Condition;
}
