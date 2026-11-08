/**
 * Morse Code Studio
 */

import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioDeviceService } from '../../services/audio-device.service';
import { ClearService } from '../../services/clear.service';
import { FirebaseRtdbService } from '../../services/firebase-rtdb.service';
import { CwInputService } from '../../services/cw-input.service';
import { MidiInputService } from '../../services/midi-input.service';
import { MidiOutputService } from '../../services/midi-output.service';
import { PresetService } from '../../services/preset.service';
import { SerialKeyInputService } from '../../services/serial-key-input.service';
import { SerialKeyOutputService } from '../../services/serial-key-output.service';
import { SettingsService } from '../../services/settings.service';
import { WinkeyerOutputService } from '../../services/winkeyer-output.service';
import { suggestPresetName } from '../../services/settings-presets';
import { createSettingsSnapshot } from '../../services/settings-snapshot';
import { prepareSettingsImport } from '../../services/settings-snapshot-review';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { focusDialog, restoreDialogFocus, trapDialogTabKey } from '../modal-accessibility';
import { DraftSettingsScope } from '../settings-items/draft-settings-scope';
import { ITEM_REGISTRY } from '../settings-items/item-registry';
import { SETTINGS_SCOPE } from '../settings-items/settings-scope';
import { QuestionOption, StepItem, StepQuestion, WizardFlow, WizardLevel, WizardStep } from './engine/flow-types';
import { WizardEngine } from './engine/wizard-engine';
import { MappingListComponent, MappingListRow } from '../settings-items/mapping/mapping-list/mapping-list.component';
import { MappingKind, mappingKind } from '../settings-items/mapping/mapping-registry';
import { MappingPageComponent } from './pages/mapping-page.component';
import { HelpLinkButtonComponent } from '../settings-items/help-link-button/help-link-button.component';
import { WizardGoalId } from '../settings-modal/goal-navigator/setup-goals';
import { LEVEL_QUESTION_ID, LEVEL_STEP, WIZARD_LEVEL_LABELS } from './engine/levels';
import { WizardLevelService } from '../../services/wizard-level.service';
import { WizardPreferencesService } from '../../services/wizard-preferences.service';
import { flowForGoal } from './flows/flow-registry';
import { BackdropClickDirective } from '../backdrop-click.directive';
import { PracticeService } from '../../services/practice.service';

/** Where the user is: answering steps or reviewing. */
type Stage = 'steps' | 'review';

/**
 * Setup Wizard shell: the guided setup of one goal, opened over the goal list.
 *
 * The shell is only the dialog: it hosts the current step of a `WizardEngine`
 * (questions plus registered settings items) and shows the shared Review page.
 * All navigation and change logic lives in the engine and the goal's declarative
 * flow in `flows/`. Nothing touches live settings until Apply; Apply never saves
 * the device profile.
 */
@Component({
  selector: 'app-setup-wizard-v2',
  standalone: true,
  imports: [FormsModule, NgComponentOutlet, ConfirmDialogComponent, BackdropClickDirective,
    MappingPageComponent, MappingListComponent, HelpLinkButtonComponent],
  templateUrl: './setup-wizard-v2.component.html',
  styleUrls: ['./setup-wizard-v2.component.css'],
  providers: [
    { provide: SETTINGS_SCOPE, useFactory: () => new DraftSettingsScope(inject(SettingsService)) },
  ],
})
export class SetupWizardV2Component implements OnInit, AfterViewInit, OnDestroy {
  /** The goal to set up; its flow is looked up in `flows/flow-registry.ts` */
  @Input({ required: true }) goal!: WizardGoalId;

  /** True while audio runs, so items can offer their Test buttons */
  @Input() audioRunning = false;

  /** Element to focus on close when the opener is gone */
  @Input() focusReturnFallback: HTMLElement | null = null;

  /** Dialog closed (Back from the first step, the close button, or a confirmed discard) */
  @Output() closed = new EventEmitter<void>();

  /** Emitted after Apply with the goal id, so the app can land focus where the user continues */
  @Output() tryRequested = new EventEmitter<string>();
  /** Emitted after Apply when the user chose the full screen (or Lens) as the place to work. */
  @Output() readonly fullscreenRequested = new EventEmitter<void>();
  /** Emitted after the detector was switched on, so the app can start it when audio already runs */
  @Output() readonly detectorEnabled = new EventEmitter<void>();

  @ViewChild('dialog') dialog?: ElementRef<HTMLElement>;
  @ViewChild(MappingPageComponent) private mappingPage?: MappingPageComponent;

  readonly settings = inject(SettingsService);
  private readonly practice = inject(PracticeService);
  private readonly clear = inject(ClearService);
  readonly presets = inject(PresetService);
  private readonly wizardLevel = inject(WizardLevelService);
  private readonly wizardPreferences = inject(WizardPreferencesService);
  private readonly scope = inject(SETTINGS_SCOPE) as DraftSettingsScope;
  private readonly audioDevices = inject(AudioDeviceService);
  private readonly midiInput = inject(MidiInputService);
  private readonly cwInput = inject(CwInputService);
  private readonly rtdb = inject(FirebaseRtdbService);
  private readonly midiOutput = inject(MidiOutputService);
  private readonly serialInput = inject(SerialKeyInputService);
  private readonly serialOutput = inject(SerialKeyOutputService);
  private readonly winkeyerOutput = inject(WinkeyerOutputService);

  readonly stage = signal<Stage>('steps');
  readonly engine = signal<WizardEngine | null>(null);
  readonly flowTitle = signal('');
  readonly confirmDiscard = signal(false);

  /** Edits on a mapping's own page are about to be discarded (Escape or Back from the page) */
  readonly confirmDiscardMapping = signal(false);
  readonly presetPickerOpen = signal(false);
  readonly selectedPresetId = signal('');
  readonly presetNotice = signal('');
  readonly presetError = signal('');
  readonly presetWarnings = signal<string[]>([]);
  readonly presetSaveOpen = signal(false);
  readonly presetSaveName = signal('');
  readonly presetSaveNotice = signal('');
  readonly runSheetNotice = signal('');
  readonly registry = ITEM_REGISTRY;

  /** Inputs for a step item: its fixed registry inputs, look and audio state. */
  itemInputs(it: StepItem, audioRunning: boolean): Record<string, unknown> {
    const entry = ITEM_REGISTRY[it.item];
    return {
      ...entry.inputs,
      ...it.inputs,
      mode: it.mode ?? 'embedded',
      ...(entry.needsAudio ? { audioRunning } : {}),
    };
  }

  private readonly focusReturnTarget = document.activeElement as HTMLElement | null;
  private applied = false;

  /** Problems that block Next on the current step */
  readonly problems = computed(() => {
    const engine = this.engine();
    return engine ? engine.validateStep(engine.step()) : [];
  });

  ngOnInit(): void {
    this.startFlow(flowForGoal(this.goal));
  }

  ngAfterViewInit(): void {
    window.requestAnimationFrame(() => {
      if (this.dialog) focusDialog(this.dialog.nativeElement, '.wizard-primary');
    });
  }

  ngOnDestroy(): void {
    restoreDialogFocus(this.focusReturnTarget, this.focusReturnFallback);
  }

  get title(): string {
    return this.flowTitle();
  }

  /** True when the user has moved any answer and has not applied yet. */
  hasDraft(): boolean {
    return !this.applied && (!!this.engine()?.hasAnyChanges() || !!this.mappingPage?.isDirty());
  }

  /** Progress counts the engine steps plus the Review page. */
  get progress(): string {
    const engine = this.engine();
    if (!engine) return '';
    const total = engine.steps().length + 1;
    const at = this.stage() === 'review' ? total : engine.index() + 1;
    return `Step ${at} of ${total}`;
  }

  private startFlow(flow: WizardFlow): void {
    this.scope.seed(this.settings.settings());
    this.engine.set(new WizardEngine(flow, this.scope, id => ITEM_REGISTRY[id].descriptor, mappingKind, this.wizardLevel.level(), this.wizardPreferences.all()));
    this.flowTitle.set(flow.title);
    this.presetNotice.set('');
    this.presetWarnings.set([]);
    this.cancelPresetSave();
    this.stage.set('steps');
    this.focusStep();
  }

  // ---- Questions ----

  answer(question: StepQuestion): unknown {
    return this.engine()?.answers()[question.id];
  }

  setSingle(question: StepQuestion, value: string): void {
    this.engine()?.setAnswer(question.id, value);
  }

  /** True when the stored answer is this option (or the answer it stands for). */
  isSelected(question: StepQuestion, option: QuestionOption): boolean {
    const current = this.answer(question);
    return current === option.value || (option.alias !== undefined && current === option.alias);
  }

  /** Picks an option; one with its own number starts from the `start` value its flow gives (the recommended one), which the user can then change. */
  choose(question: StepQuestion, option: QuestionOption): void {
    this.setSingle(question, option.value);
    if (option.number) this.engine()?.setAnswer(option.number.id, option.number.start);
  }

  setOptionNumber(option: QuestionOption, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (option.number && Number.isFinite(value)) this.engine()?.setAnswer(option.number.id, value);
  }

  setSelect(question: StepQuestion, event: Event): void {
    this.setSingle(question, (event.target as HTMLSelectElement).value);
  }

  setBoolean(question: StepQuestion, event: Event): void {
    this.engine()?.setAnswer(question.id, (event.target as HTMLInputElement).checked);
  }

  setNumber(question: StepQuestion, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value)) this.engine()?.setAnswer(question.id, value);
  }

  setText(question: StepQuestion, event: Event): void {
    this.engine()?.setAnswer(question.id, (event.target as HTMLInputElement).value);
  }

  isChosen(question: StepQuestion, value: string): boolean {
    const current = this.answer(question);
    return Array.isArray(current) && current.includes(value);
  }

  toggleMulti(question: StepQuestion, value: string, event: Event): void {
    const current = (this.answer(question) as string[] | undefined) ?? [];
    const on = (event.target as HTMLInputElement).checked;
    this.engine()?.setAnswer(question.id, on ? [...current, value] : current.filter(v => v !== value));
  }

  questionOptions(engine: WizardEngine, question: StepQuestion) {
    return question.optionsFrom?.({
      settings: this.scope.value(),
      answers: engine.answers(),
      level: engine.level(),
    }) ?? question.options ?? [];
  }

  levelLabel(level: WizardLevel): string {
    return WIZARD_LEVEL_LABELS[level];
  }

  /** Titles of the steps a level left out, as one line for the review. */
  skippedTitles(steps: WizardStep[]): string {
    return steps.map(step => step.title).join(', ');
  }

  // ---- Navigation ----

  next(): void {
    const engine = this.engine();
    if (!engine || this.problems().length || !this.commitMappingPage()) return;
    // Leaving the level step puts the level's suggestions in place and remembers the level for the next guide
    if (engine.step().id === LEVEL_STEP.id) {
      engine.commitLevel();
      this.wizardLevel.set(engine.level());
    }
    // Other remembered answers (such as the Teach audience) are kept the same way
    for (const q of engine.step().questions ?? []) {
      if (q.preference && q.id !== LEVEL_QUESTION_ID) this.wizardPreferences.set(q.id, engine.answers()[q.id]);
    }
    if (engine.isLast) this.stage.set('review');
    else engine.next();
    this.focusStep();
  }

  back(): void {
    const engine = this.engine();
    if (!engine) return;
    if (this.stage() === 'review') this.stage.set('steps');
    else {
      this.commitMappingPage();
      if (!engine.back()) {
        this.requestClose();
        return;
      }
    }
    this.focusStep();
  }

  revert(): void {
    this.mappingPage?.reset();
    this.engine()?.revertStep();
  }

  get canRevert(): boolean {
    const engine = this.engine();
    return !!engine && this.stage() === 'steps' &&
      (engine.stepHasChanges() || !!this.mappingPage?.isDirty());
  }

  // ---- Run sheet ----

  /** Plain text of a run sheet, as the Copy button puts it on the clipboard. */
  runSheetText(): string {
    const engine = this.engine();
    if (!engine) return '';
    return engine.runSheet().map(section =>
      `${section.heading}\n${section.lines.map((line, i) => `${i + 1}. ${line}`).join('\n')}`).join('\n\n');
  }

  /** Copy the run sheet; only on an explicit click. */
  async copyRunSheet(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.runSheetText());
      this.runSheetNotice.set('Copied. Paste it somewhere you can read during the session.');
    } catch {
      this.runSheetNotice.set('Copying was not allowed here. Select the text and copy it by hand.');
    }
  }

  // ---- Mapping pages (repeat steps) ----

  /** Mapping kind of the current step when it is a page of a repeat step. */
  kindOf(step: WizardStep): MappingKind | null {
    return step.page ? mappingKind(step.page.item) : null;
  }

  /**
   * Store the fields of the open mapping page in the draft. Returns false (the
   * editor shows why) when they are not valid; true when there is nothing to store.
   */
  private commitMappingPage(): boolean {
    const engine = this.engine();
    const page = engine?.step().page;
    if (!engine || page?.kind !== 'mapping' || !this.mappingPage) return true;
    const mapping = this.mappingPage.commit();
    if (mapping === null) return false;
    engine.commitMapping(page, mapping);
    return true;
  }

  /** Mappings as list rows (every mapping has an `enabled` flag). */
  rows(mappings: unknown[]): MappingListRow[] {
    return mappings as MappingListRow[];
  }

  addMapping(): void {
    this.engine()?.addMapping();
    this.focusStep();
  }

  /** Open mapping `index` from the list page. */
  openMapping(step: WizardStep, index: number): void {
    if (step.page) this.engine()?.goTo(`${step.page.baseId}#${index}`);
    this.focusStep();
  }

  removeMapping(step: WizardStep, index: number): void {
    if (step.page) this.engine()?.removeMapping(step.page, index);
  }

  setMappingEnabled(step: WizardStep, index: number, enabled: boolean): void {
    if (step.page) this.engine()?.patchMapping(step.page.list, index, { enabled });
  }

  // ---- Presets ----

  togglePresetPicker(): void {
    this.presets.reload();
    this.presetPickerOpen.update(open => !open);
  }

  closePresetPicker(): void {
    this.presetPickerOpen.set(false);
    this.selectedPresetId.set('');
  }

  /** Load the chosen preset into the draft only; live settings and the preset stay unchanged. */
  loadPreset(): void {
    const engine = this.engine();
    const preset = this.presets.presets().find(p => p.id === this.selectedPresetId());
    if (!engine || !preset) return;
    const prepared = prepareSettingsImport(this.settings.settings(), preset.settings, {
      audioInputs: this.audioDevices.inputDevices(),
      audioOutputs: this.audioDevices.outputDevices(),
      audioLabelsAvailable: this.audioDevices.hasPermission(),
      midiInputs: this.midiInput.midiInputs(),
      midiOutputs: this.midiOutput.midiOutputs(),
      serialInputPorts: this.serialInput.ports().map(port => this.serialInput.portLabel(port)),
      serialOutputPorts: this.serialOutput.ports().map(port => this.serialOutput.portLabel(port)),
      winkeyerPorts: this.winkeyerOutput.ports().map(port => this.winkeyerOutput.portLabel(port)),
    });
    engine.seedFromSettings(prepared.settings);
    this.presetWarnings.set(prepared.unresolvedTargets);
    this.presetNotice.set(`Loaded "${preset.name}" into this guide's draft only. Live settings are unchanged.`);
    this.closePresetPicker();
  }

  openPresetSave(): void {
    this.presets.reload();
    this.presetSaveNotice.set('');
    this.presetError.set('');
    this.presetSaveName.set(suggestPresetName(this.engine()?.suggestedPresetName('My setup') ?? 'My setup', this.presets.presets()));
    this.presetSaveOpen.set(!this.presets.loadError());
  }

  /** Back to the initial "Save as preset" button: hides the name box and clears messages. */
  cancelPresetSave(): void {
    this.presetSaveOpen.set(false);
    this.presetSaveName.set('');
    this.presetSaveNotice.set('');
    this.presetError.set('');
  }

  /** Save the proposed setup as a secret-free preset without applying it. */
  savePreset(): void {
    const proposed = { ...this.settings.settings(), ...this.engine()?.applyPatch() };
    const result = this.presets.add(this.presetSaveName(), createSettingsSnapshot(proposed).settings);
    if (!result.ok) {
      this.presetError.set(result.error);
      return;
    }
    this.presetSaveOpen.set(false);
    this.presetError.set('');
    this.presetSaveNotice.set(`Saved "${result.preset.name}" as a preset. Live settings are unchanged.`);
  }

  // ---- Review and apply ----

  /** Short one-line route description, e.g. "MIDI input (any device), channel 0, note 60". */
  routeLabel(route: { type: string; destination: string }): string {
    const d = route.destination;
    switch (route.type) {
      case 'MIDI key/paddle input': return d.replace(/^MIDI device/, 'MIDI input');
      case 'MIDI radio keying': return d.replace(/^MIDI device/, 'MIDI output');
      case 'Serial key/paddle input': return d.replace(/^Serial port/, 'Serial input, port');
      case 'Serial radio keying': return d.replace(/^Serial port/, 'Serial output, port');
      case 'WinKeyer radio keying': return d.replace(/^Serial port/, 'WinKeyer, port');
      case 'Radio keying through audio optocoupler': return d.replace(/^Audio device/, 'Opto output, audio device');
      case 'Firebase RTDB input': return d.replace(/^Shared channel/, 'Firebase input, channel');
      case 'Firebase RTDB output': return d.replace(/^Shared channel/, 'Firebase output, channel');
      default: return `${route.type}: ${d}`;
    }
  }

  async apply(): Promise<void> {
    const engine = this.engine();
    if (!engine || !engine.canApply()) return;
    // Every guide starts from a clean screen; cleared before the change so a running practice ends under its own mode
    this.clear.clearAll();
    const patch = engine.applyPatch();
    // The practice goal selects the Practice encoder mode so the user can press Start right away
    if (engine.flow.goal === 'practice') patch.encoderMode = 'practice';
    const base = this.settings.settings();
    // Leaving Practice mode for typing ends any practice session, as the main-screen mode selector does
    if (base.encoderMode === 'practice' && patch.encoderMode && patch.encoderMode !== 'practice') this.practice.reset();
    this.settings.update(patch);
    if (patch.midiOutputEnabled) {
      await this.midiOutput.start();
      this.midiOutput.reattach();
    }
    // MIDI input follows the applied settings: connect it (and re-read the mappings) when it is on, release it when the guide turned it off
    if (patch.midiInputEnabled !== undefined || patch.midiInputMappings) {
      if (this.settings.settings().midiInputEnabled) {
        await this.midiInput.start();
        this.midiInput.reattach();
      } else {
        this.midiInput.shutdown();
      }
    }
    // A direction the user ticked is connected now instead of waiting for the next health check
    if (patch.rtdbInputEnabled && !base.rtdbInputEnabled) this.rtdb.startInput();
    if (patch.rtdbOutputEnabled && !base.rtdbOutputEnabled) this.rtdb.startOutput();
    if (patch.cwInputEnabled) {
      this.cwInput.updateParams();
      this.detectorEnabled.emit();
    }
    this.applied = true;
    this.tryRequested.emit(engine.flow.goal);
    if (engine.opensFullscreen()) this.fullscreenRequested.emit();
  }

  // ---- Closing ----

  /** Close the wizard back to the goal list, asking first when answers changed. */
  requestClose(): void {
    if (this.hasDraft()) this.confirmDiscard.set(true);
    else this.closed.emit();
  }

  /** Escape: one step out. On a mapping's own page that is the list; otherwise the wizard closes. */
  escapeOut(): void {
    if (this.onMappingPage) this.leaveMappingPage();
    else this.requestClose();
  }

  /** Show the discard question (used by the browser Back button). */
  askDiscard(): void {
    if (this.onMappingPage) this.leaveMappingPage();
    else this.confirmDiscard.set(true);
  }

  /** True while one mapping's own page is open: Escape and Back leave it for the list, not the wizard. */
  get onMappingPage(): boolean {
    const engine = this.engine();
    return !!engine && this.stage() === 'steps' && engine.step().page?.kind === 'mapping';
  }

  /** Back to the mapping list, asking first when the page has edits that were not kept. */
  private leaveMappingPage(): void {
    if (this.mappingPage?.isDirty()) {
      this.confirmDiscardMapping.set(true);
    } else {
      this.engine()?.back();
      this.focusStep();
    }
  }

  onDiscardMappingAnswer(discard: boolean): void {
    this.confirmDiscardMapping.set(false);
    if (!discard) return;
    this.mappingPage?.reset();
    this.engine()?.back();
    this.focusStep();
  }

  onDiscardAnswer(discard: boolean): void {
    this.confirmDiscard.set(false);
    if (discard) this.closed.emit();
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    // A dialog opened above the wizard (such as the emoji picker or Help) closes itself first
    if (this.confirmDiscard() || this.confirmDiscardMapping() || event.defaultPrevented || this.dialogAboveWizard()) return;
    this.escapeOut();
  }

  /** True when another visible dialog sits on top of the wizard dialog. */
  private dialogAboveWizard(): boolean {
    const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]'))
      .filter(d => d.getClientRects().length > 0);
    const top = dialogs[dialogs.length - 1];
    return !!top && top !== this.dialog?.nativeElement;
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab' && !this.confirmDiscard() && this.dialog) {
      trapDialogTabKey(event, this.dialog.nativeElement);
    }
  }

  private focusStep(): void {
    window.setTimeout(() => {
      this.dialog?.nativeElement.querySelector<HTMLElement>('.wizard-step-title')?.focus();
    }, 0);
  }
}
