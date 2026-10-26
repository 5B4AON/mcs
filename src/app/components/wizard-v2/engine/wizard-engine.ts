/**
 * Morse Code Studio
 */

import { Signal, computed, signal } from '@angular/core';
import { AppSettings, findChannelConflicts } from '../../../services/settings.service';
import { ExternalRouteChange, compareExternalRoutes } from '../../../services/output-change-checker';
import { ItemDescriptor, ItemReviewLine } from '../../settings-items/item-descriptor';
import { DraftSettingsScope } from '../../settings-items/draft-settings-scope';
import { ConditionContext, ForcedSetting, StepPage, WizardAnswers, WizardFlow, WizardStep } from './flow-types';
import { MappingKind } from '../../settings-items/mapping/mapping-registry';

/** Finds an item's descriptor by registry id (see `item-registry.ts`). */
export type ItemDescriptorLookup = (itemId: string) => ItemDescriptor;

/** Finds a mapping kind by id (see `mapping-registry.ts`). */
export type MappingKindLookup = (kindId: string) => MappingKind;

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

  /**
   * How each mapping looked when the wizard started, per list and in step with
   * the draft list (`null` = added in the wizard). Revert restores from here.
   */
  private origins: Record<string, (unknown | null)[]> = {};

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
    private readonly kindFor: MappingKindLookup = id => { throw new Error(`No mapping kinds: ${id}`); },
  ) {
    for (const step of flow.steps) {
      for (const q of step.questions ?? []) this.defaults[q.id] = structuredClone(q.default);
    }
    this.answerState.set(structuredClone(this.defaults));

    this.steps = computed(() => flow.steps
      .filter(step => !step.when || step.when(this.context()))
      .flatMap(step => this.expand(step)));
    this.step = computed(() => {
      const shown = this.steps();
      const id = this.currentId();
      // A page of a repeat step that no longer exists (mapping deleted) falls back to its list page
      const fallback = id.includes('#') ? `${id.slice(0, id.lastIndexOf('#'))}#list` : '';
      return shown.find(step => step.id === id) ?? shown.find(step => step.id === fallback) ?? shown[0];
    });
    this.index = computed(() => this.steps().indexOf(this.step()));
    this.currentId.set(flow.steps[0]?.id ?? '');
  }

  /** What conditions see: the draft and the answers. */
  private context(): ConditionContext {
    return { settings: this.scope.value(), answers: this.answerState() };
  }

  /**
   * A repeat step becomes one page per mapping plus a list page; any other
   * step stays as it is. Recomputed whenever the draft list changes.
   */
  private expand(step: WizardStep): WizardStep[] {
    const repeat = step.repeat;
    if (!repeat) return [step];
    const kind = this.kindFor(repeat.item);
    const count = this.mappings(repeat.list).length;
    const page = (type: StepPage['kind'], index: number): StepPage =>
      ({ kind: type, index, baseId: step.id, list: repeat.list, item: repeat.item });
    const pages: WizardStep[] = [];
    for (let i = 0; i < count; i++) {
      pages.push({
        ...step, id: `${step.id}#${i}`, questions: undefined, items: undefined,
        title: `${step.title} — ${capitalise(kind.noun)} ${i + 1} of ${count}`,
        page: page('mapping', i),
      });
    }
    pages.push({
      ...step, id: `${step.id}#list`, questions: undefined, items: undefined,
      title: repeat.listTitle ?? step.title,
      intro: repeat.listIntro ?? (count
        ? `Add another ${kind.noun}, open one to change it, or continue.`
        : `You have no ${kind.noun}s yet. Add one, or continue without.`),
      help: undefined,
      page: page('list', count),
    });
    return pages;
  }

  // ---- Mapping lists ----

  /** The draft's mappings of a list. */
  mappings(list: keyof AppSettings): unknown[] {
    return this.scope.value()[list] as unknown[];
  }

  /** Origins of a list, created from the starting settings on first use. */
  private originsOf(list: keyof AppSettings): (unknown | null)[] {
    return this.origins[list] ??= (this.scope.base()[list] as unknown[]).map(m => structuredClone(m));
  }

  /** Store an edited mapping in the draft. */
  commitMapping(page: StepPage, mapping: unknown): void {
    const list = [...this.mappings(page.list)];
    if (page.index >= list.length) return;
    list[page.index] = structuredClone(mapping);
    this.scope.update({ [page.list]: list } as Partial<AppSettings>);
  }

  /** Change fields of one mapping, e.g. its enabled checkbox on the list page. */
  patchMapping(list: keyof AppSettings, index: number, patch: Record<string, unknown>): void {
    const items = this.mappings(list).map((m, i) => i === index ? { ...(m as object), ...patch } : m);
    this.scope.update({ [list]: items } as Partial<AppSettings>);
  }

  /** Append a new mapping and go to its page. */
  addMapping(step: WizardStep = this.step()): void {
    const repeat = step.page ? step.page : null;
    if (!repeat) return;
    const kind = this.kindFor(repeat.item);
    const list = [...this.mappings(repeat.list), kind.create()];
    this.originsOf(repeat.list).push(null);
    this.scope.update({ [repeat.list]: list } as Partial<AppSettings>);
    this.goTo(`${repeat.baseId}#${list.length - 1}`);
  }

  /** Delete mapping `index`, with whatever else the kind must change; the wizard lands on the list page. */
  removeMapping(page: StepPage, index: number): void {
    const kind = this.kindFor(page.item);
    const list = this.mappings(page.list).filter((_, i) => i !== index);
    this.originsOf(page.list).splice(index, 1);
    this.scope.update({
      ...kind.onRemove?.(this.scope.value(), index),
      [page.list]: list,
    } as Partial<AppSettings>);
    this.currentId.set(`${page.baseId}#list`);
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
    if (step.repeat) keys.add(step.repeat.list);
    for (const item of step.items ?? []) {
      for (const key of this.descriptorFor(item.item).keys) keys.add(key);
    }
    return [...keys];
  }

  /** True when this step's own settings or answers differ from where they started. */
  stepHasChanges(step: WizardStep = this.step()): boolean {
    const page = step.page;
    if (page?.kind === 'mapping') {
      const origin = this.originsOf(page.list)[page.index];
      return origin == null || !sameJson(origin, this.mappings(page.list)[page.index]);
    }
    const changed = new Set(this.scope.changedKeys());
    if (this.stepKeys(step).some(key => changed.has(key))) return true;
    const answers = this.answerState();
    return (step.questions ?? []).some(q => !sameJson(answers[q.id], this.defaults[q.id]));
  }

  /** Put this step's settings and answers back to where they started; the live app is untouched. */
  revertStep(step: WizardStep = this.step()): void {
    const page = step.page;
    if (page?.kind === 'mapping') {
      const origin = this.originsOf(page.list)[page.index];
      if (origin == null) this.removeMapping(page, page.index);
      else this.commitMapping(page, origin);
      return;
    }
    const keys = this.stepKeys(step);
    if (page?.kind === 'list') {
      delete this.origins[page.list];
      // Deleting a mapping can also fix up other settings (relay references); undo those too
      const side = this.kindFor(page.item).onRemove?.(this.scope.value(), 0) ?? {};
      keys.push(...(Object.keys(side) as (keyof AppSettings)[]));
    }
    this.scope.revert(keys);
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
    this.origins = {};
    this.answerState.set(structuredClone(this.defaults));
    this.acknowledged.set({});
    this.currentId.set(this.flow.steps[0]?.id ?? '');
  }

  // ---- Validation ----

  /** Plain-language problems on a step; empty means the user may continue. */
  validateStep(step: WizardStep): string[] {
    const settings = this.scope.value();
    const descriptors = step.page
      ? [this.kindFor(step.page.item).descriptor]
      : (step.items ?? []).map(item => this.descriptorFor(item.item));
    const problems = descriptors.flatMap(d => d.validate(settings));
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
      const descriptors = step.page
        ? [this.kindFor(step.page.item).descriptor]
        : (step.items ?? []).map(item => this.descriptorFor(item.item));
      for (const descriptor of descriptors) {
        for (const line of descriptor.review(base, proposed)) {
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

/** First letter in capitals, for titles built from a noun. */
function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
