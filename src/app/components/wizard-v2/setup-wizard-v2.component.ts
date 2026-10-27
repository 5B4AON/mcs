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
  Output,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioDeviceService } from '../../services/audio-device.service';
import { MidiInputService } from '../../services/midi-input.service';
import { MidiOutputService } from '../../services/midi-output.service';
import { PresetService } from '../../services/preset.service';
import { SerialKeyInputService } from '../../services/serial-key-input.service';
import { SerialKeyOutputService } from '../../services/serial-key-output.service';
import { SettingsService } from '../../services/settings.service';
import { WinkeyerOutputService } from '../../services/winkeyer-output.service';
import { suggestPresetName } from '../../services/settings-presets';
import { createSettingsSnapshot } from '../../services/settings-transfer';
import { prepareSettingsImport } from '../../services/settings-transfer-review';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { focusDialog, restoreDialogFocus, trapDialogTabKey } from '../modal-accessibility';
import { DraftSettingsScope } from '../settings-items/draft-settings-scope';
import { ITEM_REGISTRY } from '../settings-items/item-registry';
import { SETTINGS_SCOPE } from '../settings-items/settings-scope';
import { StepItem, StepQuestion, WizardFlow, WizardStep } from './engine/flow-types';
import { WizardEngine } from './engine/wizard-engine';
import { MappingListComponent, MappingListRow } from '../settings-items/mapping/mapping-list/mapping-list.component';
import { MappingKind, mappingKind } from '../settings-items/mapping/mapping-registry';
import { MappingPageComponent } from './pages/mapping-page.component';
import { GoalNavigatorModalComponent } from '../goal-navigator-modal/goal-navigator-modal.component';
import { WizardGoalId } from '../settings-modal/goal-navigator/setup-goals';
import { DEMO_FLOW } from './flows/demo.flow';
import { flowForGoal } from './flows/flow-registry';

/** Where the user is: choosing a flow, answering steps, reviewing, or finished. */
type Stage = 'start' | 'steps' | 'review' | 'done';

/**
 * Setup Wizard v2 shell (temporary entry in the kebab menu until the cutover).
 *
 * The shell is only the dialog: it lists the flows, hosts the current step of a
 * `WizardEngine` (questions plus registered settings items) and shows the shared
 * Review and Done pages. All navigation and change logic lives in the engine.
 * Nothing touches live settings until Apply; Apply never saves the device profile.
 */
@Component({
  selector: 'app-setup-wizard-v2',
  standalone: true,
  imports: [FormsModule, NgComponentOutlet, ConfirmDialogComponent, GoalNavigatorModalComponent,
    MappingPageComponent, MappingListComponent],
  templateUrl: './setup-wizard-v2.component.html',
  styleUrls: ['../setup-wizard/setup-wizard.component.css'],
  // The review shows the old value muted, without the old wizard's strikethrough
  styles: ['.wizard-dialog .wizard-from { text-decoration: none; }'],
  providers: [
    { provide: SETTINGS_SCOPE, useFactory: () => new DraftSettingsScope(inject(SettingsService)) },
  ],
})
export class SetupWizardV2Component implements AfterViewInit, OnDestroy {
  /** True while audio runs, so items can offer their Test buttons */
  @Input() audioRunning = false;

  /** Element to focus on close when the opener is gone */
  @Input() focusReturnFallback: HTMLElement | null = null;

  /** Dialog closed (after discard, or from the done page) */
  @Output() closed = new EventEmitter<void>();

  /** "Try without saving": leave the wizard for the main screen */
  @Output() tryRequested = new EventEmitter<void>();

  @ViewChild('dialog') dialog?: ElementRef<HTMLElement>;
  @ViewChild(MappingPageComponent) private mappingPage?: MappingPageComponent;

  readonly settings = inject(SettingsService);
  readonly presets = inject(PresetService);
  private readonly scope = inject(SETTINGS_SCOPE) as DraftSettingsScope;
  private readonly audioDevices = inject(AudioDeviceService);
  private readonly midiInput = inject(MidiInputService);
  private readonly midiOutput = inject(MidiOutputService);
  private readonly serialInput = inject(SerialKeyInputService);
  private readonly serialOutput = inject(SerialKeyOutputService);
  private readonly winkeyerOutput = inject(WinkeyerOutputService);

  readonly demoFlow = DEMO_FLOW;
  /** Shown on the goal list after choosing a goal that is not migrated yet */
  readonly startNotice = signal('');
  private overlayPressed = false;
  readonly stage = signal<Stage>('start');
  readonly engine = signal<WizardEngine | null>(null);
  readonly flowTitle = signal('');
  readonly confirmDiscard = signal(false);
  readonly presetPickerOpen = signal(false);
  readonly selectedPresetId = signal('');
  readonly presetNotice = signal('');
  readonly presetError = signal('');
  readonly presetWarnings = signal<string[]>([]);
  readonly presetSaveOpen = signal(false);
  readonly presetSaveName = signal('');
  readonly presetSaveNotice = signal('');
  readonly registry = ITEM_REGISTRY;

  /** Inputs for a step item: its fixed registry inputs, look and audio state. */
  itemInputs(it: StepItem, audioRunning: boolean): Record<string, unknown> {
    const entry = ITEM_REGISTRY[it.item];
    return {
      ...entry.inputs,
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

  ngAfterViewInit(): void {
    window.requestAnimationFrame(() => {
      if (this.dialog) focusDialog(this.dialog.nativeElement, '.wizard-primary');
    });
  }

  ngOnDestroy(): void {
    restoreDialogFocus(this.focusReturnTarget, this.focusReturnFallback);
  }

  get title(): string {
    return this.flowTitle() || 'Setup wizard (new, temporary)';
  }

  /** True when the user has moved any answer and has not applied yet. */
  hasDraft(): boolean {
    return !this.applied && !!this.engine()?.hasAnyChanges();
  }

  /** Progress counts the engine steps plus the Review page. */
  get progress(): string {
    const engine = this.engine();
    if (!engine) return '';
    const total = engine.steps().length + 1;
    const at = this.stage() === 'review' ? total : engine.index() + 1;
    return `Step ${at} of ${total}`;
  }

  /** A goal was chosen on the goal list. */
  chooseGoal(goal: WizardGoalId): void {
    const flow = flowForGoal(goal);
    if (flow) this.startFlow(flow);
    else this.startNotice.set('That goal is not migrated to the new wizard yet. Use the Setup Wizard entry in the menu for it.');
  }

  startFlow(flow: WizardFlow): void {
    this.startNotice.set('');
    this.scope.seed(this.settings.settings());
    this.engine.set(new WizardEngine(flow, this.scope, id => ITEM_REGISTRY[id].descriptor, mappingKind));
    this.flowTitle.set(flow.title);
    this.presetNotice.set('');
    this.presetWarnings.set([]);
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

  setBoolean(question: StepQuestion, event: Event): void {
    this.engine()?.setAnswer(question.id, (event.target as HTMLInputElement).checked);
  }

  setNumber(question: StepQuestion, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value)) this.engine()?.setAnswer(question.id, value);
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

  // ---- Navigation ----

  next(): void {
    const engine = this.engine();
    if (!engine || this.problems().length || !this.commitMappingPage()) return;
    if (engine.isLast) this.stage.set('review');
    else engine.next();
    this.focusStep();
  }

  back(): void {
    const engine = this.engine();
    if (!engine) return;
    if (this.stage() === 'review') this.stage.set('steps');
    else if (this.commitMappingPage(), !engine.back()) {
      this.requestClose();
      return;
    }
    this.focusStep();
  }

  /** Back to the goal list, dropping the flow's draft. */
  private leaveFlow(): void {
    this.stage.set('start');
    this.engine.set(null);
    this.flowTitle.set('');
    this.applied = false;
    this.presetPickerOpen.set(false);
  }

  /** True while a flow is open (as opposed to the goal list). */
  inFlow(): boolean {
    return this.stage() !== 'start';
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
  }

  /** Open mapping `index` from the list page. */
  openMapping(step: WizardStep, index: number): void {
    if (step.page) this.engine()?.goTo(`${step.page.baseId}#${index}`);
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
    this.presetSaveName.set(suggestPresetName('My setup', this.presets.presets()));
    this.presetSaveOpen.set(!this.presets.loadError());
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

  apply(): void {
    const engine = this.engine();
    if (!engine || !engine.canApply()) return;
    this.settings.update(engine.applyPatch());
    this.applied = true;
    this.stage.set('done');
    this.focusStep();
  }

  tryNow(): void {
    this.tryRequested.emit();
  }

  // ---- Closing ----

  /** Close the open flow back to the goal list (asking first when answers changed); on the list, close the dialog. */
  requestClose(): void {
    if (this.hasDraft()) this.confirmDiscard.set(true);
    else if (this.inFlow()) this.leaveFlow();
    else this.closed.emit();
  }

  /** Overlay click closes only when the press also started on the overlay (not at the end of a text selection). */
  overlayDown(event: MouseEvent): void {
    this.overlayPressed = event.target === event.currentTarget;
  }

  overlayClick(event: MouseEvent): void {
    if (this.overlayPressed && event.target === event.currentTarget) this.requestClose();
    this.overlayPressed = false;
  }

  /** Show the discard question (used by the browser Back button). */
  askDiscard(): void {
    this.confirmDiscard.set(true);
  }

  onDiscardAnswer(discard: boolean): void {
    this.confirmDiscard.set(false);
    if (!discard) return;
    if (this.inFlow()) this.leaveFlow();
    else this.closed.emit();
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    // The goal list handles its own Escape, and a dialog opened above the wizard (such as the emoji picker) closes itself first
    if (this.confirmDiscard() || !this.inFlow() || event.defaultPrevented || this.dialogAboveWizard()) return;
    this.requestClose();
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
