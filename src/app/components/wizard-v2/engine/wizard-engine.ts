/**
 * Morse Code Studio
 */

import { Signal, computed, signal } from '@angular/core';
import { AppSettings, DEFAULT_SETTINGS } from '../../../services/settings.service';
import { findChannelConflicts } from '../../../services/audio-channel-conflicts';
import { ExternalRouteChange, compareExternalRoutes } from '../../../services/output-change-checker';
import { ItemDescriptor, ItemReviewLine } from '../../settings-items/item-descriptor';
import { DraftSettingsScope } from '../../settings-items/draft-settings-scope';
import { ConditionContext, StepPage, StepQuestion, WizardAnswers, WizardFlow, WizardLevel, WizardStep } from './flow-types';
import { LEVEL_QUESTION_ID, LEVEL_STEP, isWizardLevel, visibleAtLevel } from './levels';
import { MappingKind } from '../../settings-items/mapping/mapping-registry';

/** Finds an item's descriptor by registry id (see `item-registry.ts`). */
export type ItemDescriptorLookup = (itemId: string) => ItemDescriptor;

/** Finds a mapping kind by id (see `mapping-registry.ts`). */
export type MappingKindLookup = (kindId: string) => MappingKind;

/** A forced setting with its value and label worked out for the current answers. */
interface ResolvedForced {
  key: keyof AppSettings;
  value: unknown;
  label: string;
}

/** Review lines of one step. */
export interface StepReview {
  step: WizardStep;
  changes: ItemReviewLine[];
}

/** Everything the Review step shows. */
export interface FlowReview {
  /** Steps that were left out because of the chosen level (and would otherwise be shown) */
  skippedByLevel: WizardStep[];
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


  /**
   * How each mapping looked when the wizard started, per list and in step with
   * the draft list (`null` = added in the wizard). Revert restores from here.
   */
  private origins: Record<string, (unknown | null)[]> = {};

  /** Defaults of every question in the flow */
  private readonly defaults: Record<string, unknown> = {};

  /** Settings the level suggested, so changing the level can take them back */
  private seeded: Partial<AppSettings> = {};

  /** A preset was loaded into the draft: the user's chosen values win over the level's suggestions from then on */
  private presetLoaded = false;

  /** Every step of the flow, with the level question first when the goal has one */
  private readonly allSteps: WizardStep[];

  /** The level chosen on the first step (Novice when the goal has none) */
  readonly level: Signal<WizardLevel>;

  /** Steps skipped only because of the level */
  readonly skippedByLevel: Signal<WizardStep[]>;

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
    initialLevel: WizardLevel = 'novice',
  ) {
    this.allSteps = flow.levels ? [flow.levelStep ?? LEVEL_STEP, ...flow.steps] : flow.steps;
    const startLevel = flow.levels ? initialLevel : 'novice';
    for (const step of this.allSteps) {
      for (const q of step.questions ?? []) {
        this.defaults[q.id] = structuredClone(q.id === LEVEL_QUESTION_ID ? startLevel : this.defaultOf(q, startLevel));
      }
    }
    this.answerState.set(this.settled(structuredClone(this.defaults)));
    this.level = computed(() => {
      const chosen = this.answerState()[LEVEL_QUESTION_ID];
      return flow.levels && isWizardLevel(chosen) ? chosen : 'novice';
    });
    this.skippedByLevel = computed(() => flow.steps
      .filter(step => !visibleAtLevel(step.level, this.level()) && (!step.when || step.when(this.context()))));

    this.steps = computed(() => this.allSteps
      .filter(step => visibleAtLevel(step.level, this.level()) && (!step.when || step.when(this.context())))
      .flatMap(step => this.expand(step)));
    this.step = computed(() => {
      const shown = this.steps();
      const id = this.currentId();
      // A page of a repeat step that no longer exists (mapping deleted) falls back to its list page
      const fallback = id.includes('#') ? `${id.slice(0, id.lastIndexOf('#'))}#list` : '';
      return shown.find(step => step.id === id) ?? this.mappingStep(id) ??
        shown.find(step => step.id === fallback) ?? shown[0];
    });
    // A mapping page counts as its list page: it is a detour from the summary, not a step of its own
    this.index = computed(() => {
      const current = this.step();
      const id = current.page?.kind === 'mapping' ? `${current.page.baseId}#list` : current.id;
      return this.steps().findIndex(step => step.id === id);
    });
    this.currentId.set(this.allSteps[0]?.id ?? '');
  }

  /** What conditions see: the draft and the answers. */
  private context(): ConditionContext {
    return { settings: this.scope.value(), answers: this.answerState(), level: this.level() };
  }

  /** Plain-language lines the goal shows at the top of the review (what the setup will do). */
  summaryLines(): string[] {
    return this.flow.summary?.(this.context()) ?? [];
  }

  /** The run sheet of a step that has one, worked out from the current answers. */
  runSheet(step: WizardStep = this.step()): ReturnType<NonNullable<WizardStep['sheet']>> {
    return step.sheet?.(this.context()) ?? [];
  }

  /** Name to suggest when the proposed setup is saved as a preset. */
  suggestedPresetName(fallback: string): string {
    return this.flow.presetName?.(this.context()) ?? fallback;
  }

  /** True when Apply should open the full screen: the goal's own rule, else the screen answer. */
  opensFullscreen(): boolean {
    if (this.flow.fullscreenWhen) return this.flow.fullscreenWhen(this.context());
    const screen = this.answerState()['screen'];
    return screen === 'fullscreen' || screen === 'lens';
  }

  /** Start value of a question: from the settings, else the level's, else its plain default. */
  private defaultOf(q: StepQuestion, level: WizardLevel): unknown {
    const fromSettings = q.defaultFrom?.(this.scope.value());
    return fromSettings !== undefined ? fromSettings : q.defaultByLevel?.[level] ?? q.default;
  }

  /**
   * Called when the user leaves the level step: puts the level's suggested
   * settings and answer defaults in place. Settings are suggested only where
   * they still have the app's factory value, so a value the user chose earlier
   * is kept; what an earlier choice of level suggested is taken back first.
   * Once a preset has been loaded, its values take precedence and the level
   * suggests no settings at all.
   */
  commitLevel(): void {
    const level = this.level();
    const base = this.scope.base();
    const current = this.scope.value();
    if (!this.presetLoaded) {
      const retract: Record<string, unknown> = {};
      for (const key of Object.keys(this.seeded) as (keyof AppSettings)[]) {
        if (sameJson(current[key], this.seeded[key])) retract[key] = base[key];
      }
      const suggested: Partial<Record<keyof AppSettings, unknown>> = {};
      for (const [key, value] of Object.entries(this.flow.levelDefaults?.[level] ?? {}) as [keyof AppSettings, unknown][]) {
        if (sameJson(base[key], DEFAULT_SETTINGS[key])) suggested[key] = value;
      }
      this.seeded = suggested as Partial<AppSettings>;
      this.scope.update({ ...retract, ...suggested } as Partial<AppSettings>);
    }

    const answers = { ...this.answerState() };
    for (const step of this.flow.steps) {
      for (const q of step.questions ?? []) {
        if (!q.defaultByLevel) continue;
        const next = structuredClone(this.defaultOf(q, level));
        // An answer the user has not touched follows the new level's default
        if (sameJson(answers[q.id], this.defaults[q.id])) answers[q.id] = structuredClone(next);
        this.defaults[q.id] = next;
      }
    }
    this.answerState.set(answers);
  }

  /**
   * A repeat step becomes its list page (the summary of all mappings); any
   * other step stays as it is. The pages that edit one mapping are not steps:
   * the list page opens them (see `mappingStep()`), and Next or Back returns
   * to the list. Recomputed whenever the draft list changes.
   */
  private expand(step: WizardStep): WizardStep[] {
    const repeat = step.repeat;
    if (!repeat) return [step];
    const kind = this.kindFor(repeat.item);
    const count = this.mappings(repeat.list).length;
    return [{
      ...step, id: `${step.id}#list`, questions: undefined, items: undefined,
      title: repeat.listTitle ?? step.title,
      intro: repeat.listIntro ?? (count
        ? `Use Edit to change a ${kind.noun}, Delete to remove one, or add another. Nothing is removed from the app until you press Apply, and Revert brings back deleted or changed ones.`
        : `You have no ${kind.noun}s yet. Add one, or continue without.`),
      help: undefined,
      page: { kind: 'list', index: count, baseId: step.id, list: repeat.list, item: repeat.item },
    }];
  }

  /** The page that edits one mapping, for an id like `keyboard#2`; null when there is no such mapping. */
  private mappingStep(id: string): WizardStep | null {
    const match = /^(.+)#(\d+)$/.exec(id);
    if (!match) return null;
    const index = Number(match[2]);
    const base = this.flow.steps.find(step => step.id === match[1] && step.repeat);
    const repeat = base?.repeat;
    if (!base || !repeat || (base.when && !base.when(this.context()))) return null;
    const count = this.mappings(repeat.list).length;
    if (index >= count) return null;
    const kind = this.kindFor(repeat.item);
    return {
      ...base, id, questions: undefined, items: undefined,
      title: `${base.title} — ${capitalise(kind.noun)} ${index + 1} of ${count}`,
      page: { kind: 'mapping', index, baseId: base.id, list: repeat.list, item: repeat.item },
    };
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
    const list = [...this.mappings(repeat.list), this.withSuggestedName(repeat, kind.create())];
    this.originsOf(repeat.list).push(null);
    this.scope.update({ [repeat.list]: list } as Partial<AppSettings>);
    this.goTo(`${repeat.baseId}#${list.length - 1}`);
  }

  /** A new mapping gets the next unused name idea of its step, when the step offers some. */
  private withSuggestedName(page: StepPage, mapping: unknown): unknown {
    const ideas = this.flow.steps.find(step => step.id === page.baseId)?.repeat?.nameIdeas;
    const fields = mapping as { name?: string };
    if (!ideas?.length || typeof fields.name !== 'string' || fields.name.trim()) return mapping;
    const used = new Set(this.mappings(page.list).map(m => (m as { name?: string }).name));
    const idea = ideas.find(name => !used.has(name));
    return idea ? { ...fields, name: idea } : mapping;
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
    this.answerState.set(this.settled({ ...this.answerState(), [id]: structuredClone(value) }));
  }

  /** The answers with the flow's corrections applied until nothing more changes. */
  private settled(answers: WizardAnswers): WizardAnswers {
    if (!this.flow.reconcile) return answers;
    let current = answers;
    for (let i = 0; i < 4; i++) {
      const level = this.flow.levels && isWizardLevel(current[LEVEL_QUESTION_ID]) ? current[LEVEL_QUESTION_ID] as WizardLevel : 'novice';
      const patch = this.flow.reconcile({ settings: this.scope.value(), answers: current, level });
      const changed = Object.entries(patch).filter(([key, value]) => !sameJson(current[key], value));
      if (!changed.length) break;
      current = { ...current, ...Object.fromEntries(changed.map(([key, value]) => [key, structuredClone(value)])) };
    }
    return current;
  }

  // ---- Navigation ----

  /** True on a page that edits one mapping; Next and Back both return to its list. */
  private get onMappingPage(): boolean { return this.step().page?.kind === 'mapping'; }

  get isFirst(): boolean { return !this.onMappingPage && this.index() <= 0; }

  get isLast(): boolean { return !this.onMappingPage && this.index() >= this.steps().length - 1; }

  /** Go to the next shown step if this one is valid. Returns whether it moved. */
  next(): boolean {
    if (this.isLast || this.validateStep(this.step()).length > 0) return false;
    const page = this.step().page;
    this.currentId.set(page?.kind === 'mapping' ? `${page.baseId}#list` : this.steps()[this.index() + 1].id);
    return true;
  }

  /** Go to the previous shown step; from a mapping page, back to its list. Answers are kept. */
  back(): boolean {
    if (this.isFirst) return false;
    const page = this.step().page;
    this.currentId.set(page?.kind === 'mapping' ? `${page.baseId}#list` : this.steps()[this.index() - 1].id);
    return true;
  }

  /** Jump to a shown step or a mapping page (for example from the review or a list). */
  goTo(stepId: string): boolean {
    if (!this.steps().some(step => step.id === stepId) && !this.mappingStep(stepId)) return false;
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
    return (step.questions ?? []).some(q => !q.preference && !sameJson(answers[q.id], this.defaults[q.id]));
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
    for (const q of step.questions ?? []) if (!q.preference) answers[q.id] = structuredClone(this.defaults[q.id]);
    this.answerState.set(this.settled(answers));
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
    this.seeded = {};
    this.presetLoaded = true;
    // The level is a preference: loading a preset does not change it
    this.answerState.set({ ...structuredClone(this.defaults), [LEVEL_QUESTION_ID]: this.answerState()[LEVEL_QUESTION_ID] });
    this.currentId.set(this.allSteps[0]?.id ?? '');
  }

  // ---- Validation ----

  /** Plain-language problems on a step; empty means the user may continue. */
  validateStep(step: WizardStep): string[] {
    const settings = this.flow.validateWithFlowSettings
      ? this.validationSettings()
      : this.scope.value();
    const descriptors = step.page
      ? [this.kindFor(step.page.item).descriptor]
      : (step.items ?? []).map(item => this.descriptorFor(item.item));
    const problems = descriptors.flatMap(d => d.validate(settings));
    // A repeat step's own check looks at the whole list, so it runs on the list page only;
    // a mapping page is checked by its mapping kind, and its edits reach the draft on Next
    const ownCheck = step.page?.kind === 'mapping' ? [] : step.validate?.(this.context()) ?? [];
    return [...problems, ...ownCheck];
  }

  /** Settings implied by selected flow choices, used when validating shared items. */
  private validationSettings(): AppSettings {
    const forced = Object.fromEntries(
      this.activeForced().map(item => [item.key, item.value]),
    ) as Partial<AppSettings>;
    return { ...this.scope.value(), ...forced };
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

  /** Forced settings whose condition currently holds, with computed values and labels worked out. */
  private activeForced(): ResolvedForced[] {
    const ctx = this.context();
    return (this.flow.forced ?? []).filter(f => !f.when || f.when(ctx)).map(f => ({
      key: f.key,
      value: typeof f.value === 'function' ? (f.value as (c: ConditionContext) => unknown)(ctx) : f.value,
      label: typeof f.label === 'function' ? f.label(ctx) : f.label,
    }));
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
    return { skippedByLevel: this.skippedByLevel(), steps, forced, keys: Object.keys(this.applyPatch()) as (keyof AppSettings)[] };
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

  /** True when there is something to apply and nothing blocks it. */
  canApply(): boolean {
    return Object.keys(this.applyPatch()).length > 0 &&
      this.validateFlow().length === 0 &&
      this.newConflicts().length === 0;
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
