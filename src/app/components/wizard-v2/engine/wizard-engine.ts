/**
 * Morse Code Studio
 */

import { Signal, computed, signal } from '@angular/core';
import { AppSettings, findChannelConflicts } from '../../../services/settings.service';
import { ExternalRouteChange, compareExternalRoutes } from '../../../services/output-change-checker';
import { ItemDescriptor, ItemReviewLine } from '../../settings-items/item-descriptor';
import { DraftSettingsScope } from '../../settings-items/draft-settings-scope';
import { ConditionContext, ForcedSetting, WizardAnswers, WizardFlow, WizardStep } from './flow-types';

/** Finds an item's descriptor by registry id (see `item-registry.ts`). */
export type ItemDescriptorLookup = (itemId: string) => ItemDescriptor;

/** Review lines of one step. */
export interface StepReview {
  step: WizardStep;
  changes: ItemReviewLine[];
}

/** Everything the Review step shows. */
export interface FlowReview {
  /** Changed settings, grouped by the step that asked about them */
  steps: StepReview[];
  /** Settings the goal always sets, when they differ from now */
  forced: { label: string; key: keyof AppSettings }[];
  /** Every settings key that Apply would write */
  keys: (keyof AppSettings)[];
}

/**
 * Workflow engine: runs a declarative `WizardFlow` over a draft settings scope.
 *
 * The engine owns navigation, change detection, Revert, validation, the
 * review and the final patch. It has no UI and never touches the running app:
 * `applyPatch()` only returns what the shell should pass to
 * `SettingsService.update()` after the user reviews it.
 */
export class WizardEngine {
  /** Wizard-only answers; they start at each question's default */
  private readonly answerState = signal<WizardAnswers>({});

  /** Id of the current step (an id, not an index, so it survives steps appearing/disappearing) */
  private readonly currentId = signal('');

  /** Route acknowledgements ticked on the review step */
  private readonly acknowledged = signal<Readonly<Record<string, boolean>>>({});

  /** Defaults of every question in the flow */
  private readonly defaults: Record<string, unknown> = {};

  /** Steps currently shown: those whose condition holds */
  readonly steps: Signal<WizardStep[]>;

  /** The current step */
  readonly step: Signal<WizardStep>;

  /** Position of the current step among the shown steps */
  readonly index: Signal<number>;

  readonly answers: Signal<WizardAnswers> = this.answerState.asReadonly();

  constructor(
    readonly flow: WizardFlow,
    readonly scope: DraftSettingsScope,
    private readonly descriptorFor: ItemDescriptorLookup,
  ) {
    for (const step of flow.steps) {
      for (const q of step.questions ?? []) this.defaults[q.id] = structuredClone(q.default);
    }
    this.answerState.set(structuredClone(this.defaults));

    this.steps = computed(() => flow.steps.filter(step => !step.when || step.when(this.context())));
    this.step = computed(() => {
      const shown = this.steps();
      return shown.find(step => step.id === this.currentId()) ?? shown[0];
    });
    this.index = computed(() => this.steps().indexOf(this.step()));
    this.currentId.set(flow.steps[0]?.id ?? '');
  }

  /** What conditions see: the draft and the answers. */
  private context(): ConditionContext {
    return { settings: this.scope.value(), answers: this.answerState() };
  }

  // ---- Answers ----

  /** Record a wizard-only answer. */
  setAnswer(id: string, value: unknown): void {
    this.answerState.set({ ...this.answerState(), [id]: structuredClone(value) });
  }

  // ---- Navigation ----

  get isFirst(): boolean { return this.index() <= 0; }

  get isLast(): boolean { return this.index() >= this.steps().length - 1; }

  /** Go to the next shown step if this one is valid. Returns whether it moved. */
  next(): boolean {
    if (this.isLast || this.validateStep(this.step()).length > 0) return false;
    this.currentId.set(this.steps()[this.index() + 1].id);
    return true;
  }

  /** Go to the previous shown step. Answers are kept. */
  back(): boolean {
    if (this.isFirst) return false;
    this.currentId.set(this.steps()[this.index() - 1].id);
    return true;
  }

  /** Jump to a shown step (for example from the review). */
  goTo(stepId: string): boolean {
    if (!this.steps().some(step => step.id === stepId)) return false;
    this.currentId.set(stepId);
    return true;
  }

  // ---- Change detection, Revert ----

  /** Settings keys the items on a step edit. */
  stepKeys(step: WizardStep): (keyof AppSettings)[] {
    const keys = new Set<keyof AppSettings>();
    for (const item of step.items ?? []) {
      for (const key of this.descriptorFor(item.item).keys) keys.add(key);
    }
    return [...keys];
  }

  /** True when this step's own settings or answers differ from where they started. */
  stepHasChanges(step: WizardStep = this.step()): boolean {
    const changed = new Set(this.scope.changedKeys());
    if (this.stepKeys(step).some(key => changed.has(key))) return true;
    const answers = this.answerState();
    return (step.questions ?? []).some(q => !sameJson(answers[q.id], this.defaults[q.id]));
  }

  /** Put this step's settings and answers back to where they started; the live app is untouched. */
  revertStep(step: WizardStep = this.step()): void {
    this.scope.revert(this.stepKeys(step));
    const answers = { ...this.answerState() };
    for (const q of step.questions ?? []) answers[q.id] = structuredClone(this.defaults[q.id]);
    this.answerState.set(answers);
  }

  /** True when any step of the flow has an answer that differs from the start. */
  hasAnyChanges(): boolean {
    return this.steps().some(step => this.stepHasChanges(step));
  }

  /**
   * Load a preset into the draft: only the settings this flow asks about are
   * copied (the rest stay as they are), answers go back to their defaults and
   * the wizard returns to the first step. Live settings are never touched.
   */
  seedFromSettings(settings: AppSettings): void {
    const patch: Record<string, unknown> = {};
    for (const step of this.flow.steps) {
      for (const key of this.stepKeys(step)) patch[key] = settings[key];
    }
    this.scope.update(patch as Partial<AppSettings>);
    this.answerState.set(structuredClone(this.defaults));
    this.acknowledged.set({});
    this.currentId.set(this.flow.steps[0]?.id ?? '');
  }

  // ---- Validation ----

  /** Plain-language problems on a step; empty means the user may continue. */
  validateStep(step: WizardStep): string[] {
    const settings = this.scope.value();
    const problems = (step.items ?? []).flatMap(item => this.descriptorFor(item.item).validate(settings));
    return [...problems, ...(step.validate?.(this.context()) ?? [])];
  }

  /** Every shown step's problems; Apply stays blocked while any remain. */
  validateFlow(): string[] {
    return this.steps().flatMap(step => this.validateStep(step));
  }

  // ---- Review and apply ----

  /** Settings the flow would write: reviewed changes in shown steps plus forced values that differ. */
  applyPatch(): Partial<AppSettings> {
    const base = this.scope.base();
    const draft = this.scope.value();
    const shownKeys = new Set(this.steps().flatMap(step => this.stepKeys(step)));
    const patch: Record<string, unknown> = {};
    for (const key of this.scope.changedKeys()) {
      if (shownKeys.has(key)) patch[key] = structuredClone(draft[key]);
    }
    for (const forced of this.activeForced()) {
      if (!sameJson(base[forced.key], forced.value)) patch[forced.key] = forced.value;
    }
    return patch as Partial<AppSettings>;
  }

  /** Forced settings whose condition currently holds. */
  private activeForced(): ForcedSetting[] {
    return (this.flow.forced ?? []).filter(f => !f.when || f.when(this.context()));
  }

  /** What the Review step lists: changes grouped by step, then forced values. */
  review(): FlowReview {
    const base = this.scope.base();
    const proposed = { ...base, ...this.applyPatch() } as AppSettings;
    const seen = new Set<keyof AppSettings>();
    const steps: StepReview[] = [];
    for (const step of this.steps()) {
      const changes: ItemReviewLine[] = [];
      for (const item of step.items ?? []) {
        for (const line of this.descriptorFor(item.item).review(base, proposed)) {
          // A setting asked about on two steps is listed once, under the first
          if (!seen.has(line.key)) { seen.add(line.key); changes.push(line); }
        }
      }
      if (changes.length) steps.push({ step, changes });
    }
    const forced = this.activeForced()
      .filter(f => !sameJson(base[f.key], f.value) && !seen.has(f.key))
      .map(f => ({ label: f.label, key: f.key }));
    return { steps, forced, keys: Object.keys(this.applyPatch()) as (keyof AppSettings)[] };
  }

  // ---- Safety checks ----

  /** External outputs and relays the patch would newly enable or redirect. */
  routeChanges(): ExternalRouteChange[] {
    const base = this.scope.base();
    return compareExternalRoutes(base, { ...base, ...this.applyPatch() } as AppSettings);
  }

  /** Audio channel conflicts the patch would introduce (existing ones are not repeated). */
  newConflicts(): string[] {
    const base = this.scope.base();
    const before = new Set(findChannelConflicts(base) ?? []);
    return (findChannelConflicts({ ...base, ...this.applyPatch() } as AppSettings) ?? [])
      .filter(message => !before.has(message));
  }

  /** Key under which a route acknowledgement is stored. */
  ackKey(route: ExternalRouteChange): string {
    return `${route.id}:${route.target}`;
  }

  isAcknowledged(route: ExternalRouteChange): boolean {
    return this.acknowledged()[this.ackKey(route)] === true;
  }

  acknowledge(route: ExternalRouteChange, value: boolean): void {
    this.acknowledged.set({ ...this.acknowledged(), [this.ackKey(route)]: value });
  }

  /** True when there is something to apply and nothing blocks it. */
  canApply(): boolean {
    return Object.keys(this.applyPatch()).length > 0 &&
      this.validateFlow().length === 0 &&
      this.newConflicts().length === 0 &&
      this.routeChanges().every(route => !route.acknowledgementRequired || this.isAcknowledged(route));
  }
}

/** Structural equality for plain JSON values. */
function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
