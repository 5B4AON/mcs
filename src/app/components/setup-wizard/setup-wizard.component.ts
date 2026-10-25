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
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AudioDeviceService } from '../../services/audio-device.service';
import {
  AppSettings,
  KeyboardInputMapping,
  MidiInputMapping,
  MidiOutputMapping,
  MouseButtonAction,
  OutputForward,
  PaddleMode,
  SerialInputMapping,
  SerialOutputMapping,
  SettingsService,
} from '../../services/settings.service';
import { CwInputService } from '../../services/cw-input.service';
import { FirebaseRtdbService } from '../../services/firebase-rtdb.service';
import { MidiInputService, MidiLearnResult } from '../../services/midi-input.service';
import { MidiOutputService } from '../../services/midi-output.service';
import { compareExternalRoutes, ExternalRouteChange } from '../../services/output-change-checker';
import { PresetService } from '../../services/preset.service';
import { SerialKeyInputService } from '../../services/serial-key-input.service';
import { SerialKeyOutputService } from '../../services/serial-key-output.service';
import { prepareSettingsImport, SettingsTransferDevices } from '../../services/settings-transfer-review';
import { createSettingsSnapshot } from '../../services/settings-transfer';
import { PRESET_NAME_MAX_LENGTH, suggestPresetName } from '../../services/settings-presets';
import { WinkeyerOutputService } from '../../services/winkeyer-output.service';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { focusDialog, restoreDialogFocus, trapDialogTabKey } from '../modal-accessibility';
import { WizardGoalId, goalForWizard } from '../settings-modal/goal-navigator/setup-goals';
import {
  DraftKey,
  DraftValues,
  HardwareOutputMethod,
  KEYBOARD_KEY_CODES,
  LIMITS,
  STEP_FIELDS,
  TeachInputType,
  TeachParticipantDraft,
  TeachScenario,
  SendInputMethod,
  WizardStepId,
  buildReview,
  buildTeachSettingsPatch,
  createTeachParticipant,
  feedbackRiskOutputs,
  hasAnswerChanges,
  initialDraft,
  newChannelConflicts,
  proposedValues,
  validateDraft,
  validateStep,
  wizardSteps,
} from './setup-wizard-draft';

/**
 * Guided setup for one goal.
 *
 * Collects answers in a temporary draft. Nothing changes in the running app
 * until the user presses Apply on the review step, and then only the listed
 * settings change, through `SettingsService.update()`. It never saves the
 * device profile, starts audio, enables an output route, or sends Morse.
 * Device access is requested only after an explicit device-selection action.
 */
@Component({
  selector: 'app-setup-wizard',
  standalone: true,
  imports: [FormsModule, ConfirmDialogComponent],
  templateUrl: './setup-wizard.component.html',
  styleUrls: ['./setup-wizard.component.css'],
})
export class SetupWizardComponent implements OnInit, AfterViewInit, OnDestroy {
  /** Goal being set up */
  @Input({ required: true }) goal!: WizardGoalId;

  /** Visible element to focus when the opener is gone */
  @Input() focusReturnFallback: HTMLElement | null = null;

  /** Emitted when the wizard should be removed (applied, cancelled or discarded) */
  @Output() readonly closed = new EventEmitter<void>();

  /** Emitted to open the goal's settings card after the wizard closes */
  /** Emitted from the last step to return to the main screen and try the applied settings. */
  @Output() readonly tryRequested = new EventEmitter<void>();

  /** Emitted after the wizard switched the detector on, so the app can start it when audio is already running. */
  @Output() readonly detectorEnabled = new EventEmitter<void>();

  /** Emitted when the educator starts the existing full-screen conversation. */
  @Output() readonly openFullscreenRequested = new EventEmitter<void>();

  @ViewChild('dialog') private dialog?: ElementRef<HTMLElement>;

  readonly limits = LIMITS;
  readonly keyboardKeyCodes = KEYBOARD_KEY_CODES;
  readonly paddleModes: PaddleMode[] = ['iambic-b', 'iambic-a', 'ultimatic', 'single-lever'];
  readonly decoderSources = ['rx', 'tx'] as const;
  readonly mouseActions: MouseButtonAction[] = ['none', 'straightKey', 'dit', 'dah'];
  readonly midiChannels = Array.from({ length: 17 }, (_, index) => index);
  readonly midiOutputChannels = Array.from({ length: 16 }, (_, index) => index + 1);
  readonly midiNotes = Array.from({ length: 128 }, (_, index) => index);
  readonly serialInputPins = ['dsr', 'cts', 'dcd', 'ri'] as const;
  readonly serialOutputPins = ['dtr', 'rts'] as const;
  readonly outputForwards: OutputForward[] = ['rx', 'tx', 'both'];
  readonly presetNameMaxLength = PRESET_NAME_MAX_LENGTH;

  /** Settings as they were when the wizard opened */
  base!: AppSettings;

  /** Temporary answers; never live until Apply */
  draft: DraftValues = {};

  stepIndex = 0;
  midiNotice = '';
  serialNotice = '';
  rtdbNotice = '';
  deviceCheckNotice = '';
  routeAcknowledgements: Record<string, boolean> = {};
  midiCapture: { participantIndex: number; field: 'midiNote' | 'midiDahNote' } | null = null;
  private midiStartedForDraft = false;
  presetPickerOpen = false;
  selectedPresetId = '';
  presetLoadNotice = '';
  presetLoadError = '';
  presetLoadWarnings: string[] = [];
  presetSaveOpen = false;
  presetSaveName = '';
  presetSaveError = '';
  presetSaveNotice = '';

  /** Whether Apply has been pressed */
  applied = false;

  /** Whether the discard confirmation is showing */
  confirmDiscard = false;

  /** Whether this browser exposes what the detector needs */
  readonly serialSupported = typeof navigator !== 'undefined' && 'serial' in navigator;
  readonly audioInputSupported =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof AudioWorkletNode !== 'undefined';
  readonly audioOutputSupported =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.enumerateDevices;

  private readonly focusReturnTarget =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  constructor(
    public settings: SettingsService,
    public presets: PresetService,
    private cwInput: CwInputService,
    public midiInput: MidiInputService,
    public serialInput: SerialKeyInputService,
    public rtdb: FirebaseRtdbService,
    public audioDevices: AudioDeviceService,
    public midiOutput: MidiOutputService,
    public serialOutput: SerialKeyOutputService,
    public winkeyerOutput: WinkeyerOutputService,
  ) {}

  ngOnInit(): void {
    this.base = { ...this.settings.settings() };
    this.draft = initialDraft(this.goal, this.base);
  }

  ngAfterViewInit(): void {
    window.requestAnimationFrame(() => {
      if (this.dialog) focusDialog(this.dialog.nativeElement, '.wizard-primary');
    });
  }

  ngOnDestroy(): void {
    if (this.midiCapture) this.midiInput.cancelLearn();
    if (this.midiStartedForDraft && !this.settings.settings().midiInputEnabled) {
      this.midiInput.shutdown();
    }
    restoreDialogFocus(this.focusReturnTarget, this.focusReturnFallback);
  }

  get title(): string {
    return goalForWizard(this.goal).label;
  }

  get steps(): WizardStepId[] {
    return wizardSteps(this.goal, this.draft);
  }

  get startLabel(): string {
    switch (this.goal) {
      case 'send': return 'Start sending practice';
      case 'type': return 'Start typing';
      case 'practice': return 'Start practicing';
      case 'midi': return 'Start keying';
      case 'relay': return 'Open the conversation';
      case 'hardware': return 'Try the configured route';
      case 'decode': return 'Start decoding';
      case 'teach':
        return this.teachScenarios.includes('copying') && !this.teachScenarios.includes('sending')
          && !this.teachScenarios.includes('mobile')
          ? 'Start copy practice'
          : 'Open full-screen conversation';
    }
  }

  get teachScenarios(): TeachScenario[] {
    return this.draft.teachScenarios ?? [];
  }

  get sendMethods(): SendInputMethod[] {
    return this.draft.sendMethods ?? [];
  }

  get hardwareMethods(): HardwareOutputMethod[] {
    return this.draft.hardwareMethods ?? [];
  }

  get teachParticipants(): TeachParticipantDraft[] {
    return this.draft.teachParticipants ?? [];
  }

  get isTeachGoal(): boolean {
    return this.goal === 'teach';
  }

  get hasTeachMidi(): boolean {
    return this.teachScenarios.includes('sending')
      && this.teachParticipants.some(person => person.inputType === 'midi');
  }

  get hasTeachSerial(): boolean {
    return this.teachScenarios.includes('sending')
      && this.teachParticipants.some(person => person.inputType === 'serial');
  }

  get hasTeachMobile(): boolean {
    return this.teachScenarios.includes('mobile');
  }

  get hasTeachCopy(): boolean {
    return this.teachScenarios.includes('copying');
  }

  get rtdbChannelWillChange(): boolean {
    return (this.base.rtdbInputEnabled || this.base.rtdbOutputEnabled)
      && (this.base.rtdbInputChannelName !== this.draft.teachRtdbChannelName
        || this.base.rtdbOutputChannelName !== this.draft.teachRtdbChannelName
        || this.base.rtdbInputChannelSecret !== this.draft.teachRtdbChannelSecret
        || this.base.rtdbOutputChannelSecret !== this.draft.teachRtdbChannelSecret);
  }

  get hasUnassignedSerialPort(): boolean {
    return this.teachParticipants.some(person => person.inputType === 'serial' && person.serialPortIndex < 0);
  }

  get step(): WizardStepId {
    return this.steps[this.stepIndex];
  }

  /** Steps shown in the progress line (everything before the confirmation). */
  get progressSteps(): WizardStepId[] {
    return this.steps.slice(0, -1);
  }

  get problems(): string[] {
    return validateStep(this.step, this.draft, this.base);
  }

  get review() {
    return buildReview(this.goal, this.base, this.draft);
  }

  get externalRouteChanges(): ExternalRouteChange[] {
    return compareExternalRoutes(this.base, { ...this.base, ...this.patch });
  }

  get routeAvailabilityProblems(): string[] {
    const proposed = { ...this.base, ...this.patch };
    const problems: string[] = [];
    for (const route of this.externalRouteChanges) {
      if (route.id === 'opto' &&
        !this.audioDevices.outputDevices().some(device => device.deviceId === proposed.optoOutputDeviceId)) {
        problems.push(`${route.destination}: refresh audio devices and select an available, specific output.`);
      } else if (route.id.startsWith('serial-input-')) {
        const index = Number(route.id.slice('serial-input-'.length));
        const mapping = proposed.serialInputMappings[index];
        if (!mapping || mapping.portIndex < 0 || mapping.portIndex >= this.serialInput.ports().length) {
          problems.push(`${route.destination}: the selected serial input port is not available.`);
        }
      } else if (route.id.startsWith('serial-')) {
        const index = Number(route.id.slice('serial-'.length));
        const mapping = proposed.serialOutputMappings[index];
        if (!mapping || mapping.portIndex < 0 || mapping.portIndex >= this.serialOutput.ports().length) {
          problems.push(`${route.destination}: the selected serial output port is not available.`);
        }
      } else if (route.id === 'winkeyer' &&
        (proposed.winkeyerPortIndex < 0 || proposed.winkeyerPortIndex >= this.winkeyerOutput.ports().length)) {
        problems.push(`${route.destination}: the selected WinKeyer port is not available.`);
      } else if (route.id.startsWith('midi-input-')) {
        const index = Number(route.id.slice('midi-input-'.length));
        const mapping = proposed.midiInputMappings[index];
        if (!mapping || !this.midiInput.midiInputs().some(device => device.id === mapping.deviceId)) {
          problems.push(`${route.destination}: the selected MIDI input device is not available.`);
        }
      } else if (route.id.startsWith('midi-')) {
        const index = Number(route.id.slice('midi-'.length));
        const mapping = proposed.midiOutputMappings[index];
        if (!mapping || !this.midiOutput.midiOutputs().some(device => device.id === mapping.deviceId)) {
          problems.push(`${route.destination}: the selected MIDI output device is not available.`);
        }
      } else if (route.id === 'rtdb-output' &&
        (!proposed.rtdbOutputChannelName.trim() || !proposed.rtdbOutputChannelSecret.trim())) {
        problems.push('RTDB output needs a channel name and secret before it can be enabled.');
      } else if (route.id === 'rtdb-input' &&
        (!proposed.rtdbInputChannelName.trim() || !proposed.rtdbInputChannelSecret.trim())) {
        problems.push('RTDB input needs a channel name and secret before it can be enabled.');
      }
    }
    return problems;
  }

  /** Conflicts the proposal would newly cause on shared stereo audio devices */
  get newConflicts(): string[] {
    return newChannelConflicts(this.base, this.patch);
  }

  /** Audio outputs already on that could feed the detector's input */
  get feedbackOutputs(): string[] {
    return this.goal === 'decode' ? feedbackRiskOutputs(this.settings.settings()) : [];
  }

  /** Direction the goal plays in: typed text is sent (TX); practice follows its source. */
  get timingDirection(): 'rx' | 'tx' {
    return this.goal === 'type' ? 'tx' : this.base.practiceSource;
  }

  /** True when Farnsworth is chosen but would not apply to the direction this goal plays in. */
  get farnsworthSkipsGoal(): boolean {
    const applies = this.draft.farnsworthAppliesTo;
    return !!this.draft.farnsworthEnabled && applies !== 'both' && applies !== this.timingDirection;
  }

  get canApply(): boolean {
    return (this.review.changes.length > 0 || this.goal === 'teach') &&
      validateDraft(this.goal, this.draft, this.base).length === 0 &&
      this.newConflicts.length === 0 &&
      this.routeAvailabilityProblems.length === 0 &&
      this.externalRouteChanges.every(route =>
        !route.acknowledgementRequired || this.routeAcknowledgements[this.acknowledgementKey(route)] === true);
  }

  /** Only the settings shown as changed in the review. */
  private get patch(): Partial<AppSettings> {
    if (this.goal === 'teach') return buildTeachSettingsPatch(this.base, this.draft);
    const proposed = proposedValues(this.goal, this.draft, this.base);
    const patch: Record<string, unknown> = {};
    for (const line of this.review.changes) patch[line.key] = proposed[line.key];
    return patch as Partial<AppSettings>;
  }

  /** Reload saved presets before the user chooses a starting draft. */
  openPresetPicker(): void {
    this.presets.reload();
    this.presetPickerOpen = true;
    this.presetSaveOpen = false;
    this.presetLoadNotice = '';
    this.presetLoadWarnings = [];
    this.presetLoadError = '';
    this.selectedPresetId = this.presets.presets()[0]?.id ?? '';
  }

  /** Close the preset picker without changing the wizard draft. */
  closePresetPicker(): void {
    this.presetPickerOpen = false;
  }

  /** Remember the selected preset without loading it yet. */
  selectPreset(event: Event): void {
    this.selectedPresetId = (event.target as HTMLSelectElement).value;
    this.presetLoadError = '';
  }

  /** Seed this goal's draft from a validated preset without changing live settings. */
  seedDraftFromPreset(): void {
    const preset = this.presets.presets().find(item => item.id === this.selectedPresetId);
    if (!preset) {
      this.presetLoadError = 'That preset is no longer available. Reload the saved preset list and try again.';
      return;
    }

    const prepared = prepareSettingsImport(this.base, preset.settings, this.getTransferDevices());
    this.draft = initialDraft(this.goal, prepared.settings);
    this.routeAcknowledgements = {};
    this.presetLoadWarnings = prepared.unresolvedTargets;
    this.presetLoadNotice =
      `Loaded "${preset.name}" into this guide's draft only. Live settings and the saved preset are unchanged.`;
    this.presetLoadError = '';
    this.presetPickerOpen = false;
    this.stepIndex = 0;
    this.focusStep();
  }

  /** Open the separate name form for saving the proposed setup without applying it. */
  startSavePresetOnly(): void {
    this.presets.reload();
    this.presetSaveError = '';
    this.presetSaveNotice = '';
    this.presetSaveOpen = !this.presets.loadError();
    this.presetSaveName = suggestPresetName('My setup', this.presets.presets());
    if (this.presetSaveOpen) {
      window.setTimeout(() => {
        this.dialog?.nativeElement.querySelector<HTMLInputElement>('#wizard-preset-name')?.focus();
      }, 0);
    }
  }

  /** Cancel naming a preset without changing the draft or running settings. */
  cancelSavePresetOnly(): void {
    this.presetSaveOpen = false;
    this.presetSaveError = '';
  }

  /** Save the current settings plus this wizard's proposal as a secret-free preset only. */
  savePresetOnly(): void {
    const snapshot = createSettingsSnapshot({ ...this.base, ...this.patch }).settings;
    const result = this.presets.add(this.presetSaveName, snapshot);
    if (!result.ok) {
      this.presetSaveError = result.error;
      return;
    }
    this.presetSaveOpen = false;
    this.presetSaveError = '';
    this.presetSaveNotice =
      `Saved "${result.preset.name}" as a preset. Live settings and the device profile are unchanged.`;
  }

  private getTransferDevices(): SettingsTransferDevices {
    return {
      audioInputs: this.audioDevices.inputDevices(),
      audioOutputs: this.audioDevices.outputDevices(),
      audioLabelsAvailable: this.audioDevices.hasPermission(),
      midiInputs: this.midiInput.midiInputs(),
      midiOutputs: this.midiOutput.midiOutputs(),
      serialInputPorts: this.serialInput.ports().map(port => this.serialInput.portLabel(port)),
      serialOutputPorts: this.serialOutput.ports().map(port => this.serialOutput.portLabel(port)),
      winkeyerPorts: this.winkeyerOutput.ports().map(port => this.winkeyerOutput.portLabel(port)),
    };
  }

  get detectorInputLabel(): string {
    return this.base.cwInputDeviceId === 'default'
      ? 'the system default input'
      : 'the input device chosen in the CW Tone Detector card';
  }

  /** True when the user has moved any answer since opening. */
  hasDraft(): boolean {
    return !this.applied && hasAnswerChanges(this.goal, this.base, this.draft);
  }

  // ---- Answers ----

  setNumber(key: DraftKey, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    (this.draft as Record<string, unknown>)[key] = value === '' ? NaN : Number(value);
  }

  setText(key: DraftKey, event: Event): void {
    (this.draft as Record<string, unknown>)[key] = (event.target as HTMLSelectElement).value;
  }

  setDraftText(key: DraftKey, value: string): void {
    (this.draft as Record<string, unknown>)[key] = value;
  }

  setBool(key: DraftKey, event: Event): void {
    (this.draft as Record<string, unknown>)[key] = (event.target as HTMLInputElement).checked;
  }

  toggleSendMethod(method: SendInputMethod, event: Event): void {
    const selected = new Set(this.sendMethods);
    if ((event.target as HTMLInputElement).checked) selected.add(method);
    else selected.delete(method);
    this.draft.sendMethods = [...selected];
  }

  toggleHardwareMethod(method: HardwareOutputMethod, event: Event): void {
    const selected = new Set(this.hardwareMethods);
    if ((event.target as HTMLInputElement).checked) selected.add(method);
    else selected.delete(method);
    this.draft.hardwareMethods = [...selected];
  }

  addKeyboardMapping(): void {
    const mappings = structuredClone(this.draft.keyboardInputMappings ?? []);
    const occupied = new Set(mappings.flatMap(mapping =>
      mapping.mode === 'paddle' ? [mapping.keyCode, mapping.dahKeyCode] : [mapping.keyCode]));
    const keyCode = this.keyboardKeyCodes.find(code => !occupied.has(code)) ?? '';
    mappings.push({
      enabled: true,
      mode: 'straightKey',
      keyCode,
      dahKeyCode: '',
      source: 'tx',
      reversePaddles: false,
      paddleMode: 'iambic-b',
      name: '',
      color: '',
    });
    this.draft.keyboardInputMappings = mappings;
  }

  removeKeyboardMapping(index: number): void {
    this.draft.keyboardInputMappings =
      (this.draft.keyboardInputMappings ?? []).filter((_, mappingIndex) => mappingIndex !== index);
  }

  updateKeyboardMapping(index: number, patch: Partial<KeyboardInputMapping>): void {
    const mappings = structuredClone(this.draft.keyboardInputMappings ?? []);
    if (!mappings[index]) return;
    mappings[index] = { ...mappings[index], ...patch };
    this.draft.keyboardInputMappings = mappings;
  }

  addMidiInputMapping(): void {
    const mappings = structuredClone(this.draft.midiInputMappings ?? []);
    mappings.push({
      enabled: true,
      deviceId: '',
      channel: 0,
      source: 'rx',
      mode: 'straightKey',
      value: 60,
      dahValue: -1,
      reversePaddles: false,
      name: '',
      color: '',
    });
    this.draft.midiInputMappings = mappings;
  }

  removeMidiInputMapping(index: number): void {
    this.draft.midiInputMappings =
      (this.draft.midiInputMappings ?? []).filter((_, mappingIndex) => mappingIndex !== index);
  }

  updateMidiInputMapping(index: number, patch: Partial<MidiInputMapping>): void {
    const mappings = structuredClone(this.draft.midiInputMappings ?? []);
    if (!mappings[index]) return;
    mappings[index] = { ...mappings[index], ...patch };
    this.draft.midiInputMappings = mappings;
  }

  updateSerialInputMapping(index: number, patch: Partial<SerialInputMapping>): void {
    const mappings = structuredClone(this.draft.serialInputMappings ?? []);
    if (!mappings[index]) return;
    mappings[index] = { ...mappings[index], ...patch };
    this.draft.serialInputMappings = mappings;
  }

  updateSerialOutputMapping(index: number, patch: Partial<SerialOutputMapping>): void {
    const mappings = structuredClone(this.draft.serialOutputMappings ?? []);
    if (!mappings[index]) return;
    mappings[index] = { ...mappings[index], ...patch };
    this.draft.serialOutputMappings = mappings;
  }

  setSerialOutputNumber(index: number, key: 'portIndex', event: Event): void {
    this.updateSerialOutputMapping(index, { [key]: Number((event.target as HTMLSelectElement).value) });
  }

  toggleSerialOutputRelay(index: number, inputIndex: number, event: Event): void {
    const mapping = this.draft.serialOutputMappings?.[index];
    if (!mapping) return;
    const relayInputIndices = new Set(mapping.relayInputIndices);
    if ((event.target as HTMLInputElement).checked) relayInputIndices.add(inputIndex);
    else relayInputIndices.delete(inputIndex);
    this.updateSerialOutputMapping(index, { relayInputIndices: [...relayInputIndices] });
  }

  addSerialOutputMapping(): void {
    const mappings = structuredClone(this.draft.serialOutputMappings ?? []);
    mappings.push({
      enabled: true,
      portIndex: -1,
      pin: 'dtr',
      invert: false,
      forward: 'tx',
      relayInputIndices: [],
      relaySuppressOtherInputs: false,
    });
    this.draft.serialOutputMappings = mappings;
  }

  async requestSerialOutputPort(mappingIndex?: number): Promise<void> {
    if (!this.serialSupported) {
      this.serialNotice = 'Web Serial is not available in this browser.';
      return;
    }
    await this.serialOutput.refreshPorts();
    const previousPorts = new Set(this.serialOutput.ports());
    await this.serialOutput.requestPort();
    await this.serialOutput.refreshPorts();
    const selectedIndex = this.serialOutput.ports().findIndex(port => !previousPorts.has(port));
    if (selectedIndex >= 0) {
      if (mappingIndex === undefined) this.draft.winkeyerPortIndex = selectedIndex;
      else this.updateSerialOutputMapping(mappingIndex, { portIndex: selectedIndex });
      this.serialNotice = 'Serial access granted. Review the selected port before applying.';
    } else {
      this.serialNotice = this.serialOutput.lastError()
        ?? 'No new serial device was selected. Choose a previously authorized port from the list.';
    }
  }

  removeSerialOutputMapping(index: number): void {
    this.draft.serialOutputMappings =
      (this.draft.serialOutputMappings ?? []).filter((_, mappingIndex) => mappingIndex !== index);
  }

  addMidiOutputMapping(): void {
    const mappings = structuredClone(this.draft.midiOutputMappings ?? []);
    mappings.push({
      enabled: true,
      deviceId: '',
      channel: 1,
      forward: 'tx',
      mode: 'straightKey',
      value: 80,
      dahValue: -1,
      relayInputIndices: [],
      relaySuppressOtherInputs: false,
    });
    this.draft.midiOutputMappings = mappings;
  }

  removeMidiOutputMapping(index: number): void {
    this.draft.midiOutputMappings =
      (this.draft.midiOutputMappings ?? []).filter((_, mappingIndex) => mappingIndex !== index);
  }

  updateMidiOutputMapping(index: number, patch: Partial<MidiOutputMapping>): void {
    const mappings = structuredClone(this.draft.midiOutputMappings ?? []);
    if (!mappings[index]) return;
    mappings[index] = { ...mappings[index], ...patch };
    this.draft.midiOutputMappings = mappings;
  }

  toggleMidiOutputRelay(index: number, inputIndex: number, event: Event): void {
    const mapping = this.draft.midiOutputMappings?.[index];
    if (!mapping) return;
    const relayInputIndices = new Set(mapping.relayInputIndices);
    if ((event.target as HTMLInputElement).checked) relayInputIndices.add(inputIndex);
    else relayInputIndices.delete(inputIndex);
    this.updateMidiOutputMapping(index, { relayInputIndices: [...relayInputIndices] });
  }

  setMidiInputMappingNumber(index: number, key: 'channel' | 'value' | 'dahValue', event: Event): void {
    const value = Number((event.target as HTMLInputElement | HTMLSelectElement).value);
    this.updateMidiInputMapping(index, { [key]: value });
  }

  setMidiOutputMappingNumber(index: number, key: 'channel' | 'value' | 'dahValue', event: Event): void {
    const value = Number((event.target as HTMLInputElement | HTMLSelectElement).value);
    this.updateMidiOutputMapping(index, { [key]: value });
  }

  setRelayDirection(direction: 'relayReceive' | 'relaySend', event: Event): void {
    this.draft[direction] = (event.target as HTMLInputElement).checked;
  }

  acknowledgeRoute(route: ExternalRouteChange, event: Event): void {
    this.routeAcknowledgements[this.acknowledgementKey(route)] =
      (event.target as HTMLInputElement).checked;
  }

  private acknowledgementKey(route: ExternalRouteChange): string {
    return `${route.id}:${route.target}`;
  }

  routeAckKey(route: ExternalRouteChange): string {
    return this.acknowledgementKey(route);
  }

  describeRouteTarget(route: ExternalRouteChange): string {
    const proposed = { ...this.base, ...this.patch };
    const serialInput = /^serial-input-(\d+)$/.exec(route.id);
    if (serialInput) {
      const mapping = proposed.serialInputMappings[Number(serialInput[1])];
      const port = mapping && this.serialInput.ports()[mapping.portIndex];
      return port ? `${route.destination} (${this.serialInput.portLabel(port)})` : route.destination;
    }
    const serialOutput = /^serial-(\d+)$/.exec(route.id);
    if (serialOutput) {
      const mapping = proposed.serialOutputMappings[Number(serialOutput[1])];
      const port = mapping && this.serialOutput.ports()[mapping.portIndex];
      return port ? `${route.destination} (${this.serialOutput.portLabel(port)})` : route.destination;
    }
    if (route.id === 'winkeyer') {
      const port = this.winkeyerOutput.ports()[proposed.winkeyerPortIndex];
      return port ? `${route.destination} (${this.winkeyerOutput.portLabel(port)})` : route.destination;
    }
    const midiInput = /^midi-input-(\d+)$/.exec(route.id);
    if (midiInput) {
      const mapping = proposed.midiInputMappings[Number(midiInput[1])];
      const device = this.midiInput.midiInputs().find(item => item.id === mapping?.deviceId);
      return device ? `${route.destination} (${device.name})` : route.destination;
    }
    const midiOutput = /^midi-(\d+)$/.exec(route.id);
    if (midiOutput) {
      const mapping = proposed.midiOutputMappings[Number(midiOutput[1])];
      const device = this.midiOutput.midiOutputs().find(item => item.id === mapping?.deviceId);
      return device ? `${route.destination} (${device.name})` : route.destination;
    }
    if (route.id === 'opto') {
      const device = this.audioDevices.outputDevices().find(item =>
        item.deviceId === proposed.optoOutputDeviceId);
      return device ? `${route.destination} (${device.label})` : route.destination;
    }
    return route.destination;
  }

  routeAcknowledgementText(route: ExternalRouteChange): string {
    if (route.id === 'rtdb-output') {
      return `I understand Morse I send will be published to the configured shared channel ${this.describeRouteTarget(route)}.`;
    }
    if (route.type.toLowerCase().includes('radio keying')) {
      return `I understand this route can key a radio or connected device through ${this.describeRouteTarget(route)}.`;
    }
    return `I understand this external route will use ${this.describeRouteTarget(route)}.`;
  }

  async refreshAudioDevices(): Promise<void> {
    await this.audioDevices.enumerate();
    this.deviceCheckNotice = this.audioDevices.outputDevices().length
      ? 'Available audio outputs refreshed. The optocoupler route must name one of these devices; System Default is not accepted.'
      : 'No audio output devices are available to this browser.';
  }

  async refreshSerialDevices(): Promise<void> {
    await Promise.all([
      this.serialInput.refreshPorts(),
      this.serialOutput.refreshPorts(),
      this.winkeyerOutput.refreshPorts(),
    ]);
    const available = Math.max(
      this.serialInput.ports().length,
      this.serialOutput.ports().length,
      this.winkeyerOutput.ports().length,
    );
    this.deviceCheckNotice = available
      ? `${available} previously authorized serial port${available === 1 ? '' : 's'} available. No port was opened.`
      : 'No previously authorized serial ports are available. Choose a port in the relevant Settings card.';
  }

  async refreshMidiInputs(): Promise<void> {
    await this.midiInput.enumerateDevices();
    this.deviceCheckNotice = this.midiInput.lastError()
      || `${this.midiInput.midiInputs().length} MIDI input device${this.midiInput.midiInputs().length === 1 ? '' : 's'} available. No keying route was enabled.`;
  }

  async refreshMidiOutputs(): Promise<void> {
    await this.midiOutput.enumerateDevices();
    this.deviceCheckNotice = this.midiOutput.lastError()
      || `${this.midiOutput.midiOutputs().length} MIDI output device${this.midiOutput.midiOutputs().length === 1 ? '' : 's'} available. No keying route was enabled.`;
  }

  toggleTeachScenario(scenario: TeachScenario, event: Event): void {
    const selected = new Set(this.teachScenarios);
    if ((event.target as HTMLInputElement).checked) selected.add(scenario);
    else selected.delete(scenario);
    this.draft.teachScenarios = [...selected];
  }

  setTeachStudentCount(event: Event): void {
    const count = Number((event.target as HTMLInputElement).value);
    if (!Number.isInteger(count) || count < 0 || count > 4) {
      this.draft.teachStudentCount = count;
      return;
    }
    const people = [...this.teachParticipants];
    const teacher = people.find(person => person.role === 'teacher')
      ?? createTeachParticipant('teacher', 0, this.base);
    const students = people.filter(person => person.role === 'student').slice(0, count);
    const additional = people.filter(person => person.role === 'additional');
    while (students.length < count) {
      students.push(createTeachParticipant('student', students.length + 1, this.base));
    }
    this.draft.teachStudentCount = count;
    this.draft.teachParticipants = [teacher, ...students, ...additional];
  }

  addTeachInput(): void {
    const extraCount = this.teachParticipants.filter(person => person.role === 'additional').length;
    this.draft.teachParticipants = [
      ...this.teachParticipants,
      createTeachParticipant('additional', extraCount + 1, this.base),
    ];
  }

  removeTeachInput(index: number): void {
    this.draft.teachParticipants = this.teachParticipants.filter((_, personIndex) => personIndex !== index);
  }

  setParticipantName(index: number, event: Event): void {
    this.updateParticipant(index, { name: (event.target as HTMLInputElement).value });
  }

  setParticipantColor(index: number, value: string): void {
    this.updateParticipant(index, { color: value });
  }

  setParticipantInputType(index: number, inputType: string): void {
    if (inputType === 'keyboard' || inputType === 'mouse' || inputType === 'touch'
      || inputType === 'midi' || inputType === 'serial') {
      this.updateParticipant(index, { inputType: inputType as TeachInputType });
    }
  }

  setParticipantMode(index: number, mode: string): void {
    if (mode === 'straightKey' || mode === 'paddle') {
      this.updateParticipant(index, { mode });
    }
  }

  setParticipantKey(index: number, keyCode: string): void {
    this.updateParticipant(index, { keyCode });
  }

  setParticipantDahKey(index: number, dahKeyCode: string): void {
    this.updateParticipant(index, { dahKeyCode });
  }

  setParticipantSource(index: number, source: string): void {
    if (source === 'rx' || source === 'tx') this.updateParticipant(index, { source });
  }

  setParticipantPaddleMode(index: number, paddleMode: string): void {
    if (paddleMode === 'iambic-b' || paddleMode === 'iambic-a'
      || paddleMode === 'ultimatic' || paddleMode === 'single-lever') {
      this.updateParticipant(index, { paddleMode });
    }
  }

  setParticipantFlag(index: number, key: 'reversePaddles' | 'serialInvert', event: Event): void {
    this.updateParticipant(index, { [key]: (event.target as HTMLInputElement).checked });
  }

  setParticipantSerialTiming(index: number, key: 'serialPollInterval' | 'serialDebounceMs', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.updateParticipant(index, { [key]: value === '' ? NaN : Number(value) });
  }

  setParticipantMidiNumber(index: number, key: 'midiChannel' | 'midiNote' | 'midiDahNote', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const number = value === '' ? NaN : Number(value);
    if (key === 'midiChannel') this.updateParticipant(index, { midiChannel: number });
    else if (key === 'midiNote') this.updateParticipant(index, { midiNote: number });
    else this.updateParticipant(index, { midiDahNote: number });
  }

  setParticipantMidiDevice(index: number, deviceId: string): void {
    this.updateParticipant(index, { midiDeviceId: deviceId });
  }

  async connectMidiForSetup(): Promise<void> {
    if (!this.midiInput.supported) {
      this.midiNotice = 'MIDI input is not available in this browser.';
      return;
    }
    await this.midiInput.enumerateDevices();
    if (this.midiInput.lastError()) {
      this.midiNotice = this.midiInput.lastError();
      return;
    }
    this.midiNotice = this.midiInput.midiInputs().length
      ? 'MIDI access is ready. Select the device for each profile.'
      : 'MIDI access is ready, but no device is connected yet.';
  }

  async detectMidiNote(index: number, field: 'midiNote' | 'midiDahNote'): Promise<void> {
    if (this.midiCapture?.participantIndex === index && this.midiCapture.field === field) {
      this.midiInput.cancelLearn();
      this.midiCapture = null;
      return;
    }
    await this.connectMidiForSetup();
    if (this.midiInput.lastError()) return;
    if (!this.base.midiInputEnabled) this.midiStartedForDraft = true;
    this.midiCapture = { participantIndex: index, field };
    await this.midiInput.startLearn((result: MidiLearnResult) => {
      const participant = this.teachParticipants[index];
      if (!participant) return;
      if (participant.midiDeviceId && participant.midiDeviceId !== result.deviceId) {
        this.midiNotice = `A note came from ${result.deviceName}, not the selected MIDI device. Select that device or try again.`;
        this.midiCapture = null;
        return;
      }
      this.updateParticipant(index, {
        [field]: result.note,
        midiChannel: result.channel,
        midiDeviceId: participant.midiDeviceId || result.deviceId,
      });
      this.midiNotice = `Detected ${result.deviceName}, channel ${result.channel}, note ${result.note}.`;
      this.midiCapture = null;
    });
    if (this.midiInput.lastError()) {
      this.midiInput.cancelLearn();
      this.midiCapture = null;
      this.midiNotice = this.midiInput.lastError();
    }
  }

  setParticipantSerialPin(index: number, key: 'serialPin' | 'serialDahPin', value: string): void {
    if (value === 'dsr' || value === 'cts' || value === 'dcd' || value === 'ri') {
      if (key === 'serialPin') this.updateParticipant(index, { serialPin: value });
      else this.updateParticipant(index, { serialDahPin: value });
    }
  }

  setParticipantSerialPort(index: number, event: Event): void {
    this.updateParticipant(index, { serialPortIndex: Number((event.target as HTMLSelectElement).value) });
  }

  setTeachRtdbChannelName(event: Event): void {
    this.draft.teachRtdbChannelName = (event.target as HTMLInputElement).value;
  }

  setTeachRtdbChannelSecret(event: Event): void {
    this.draft.teachRtdbChannelSecret = (event.target as HTMLInputElement).value;
  }

  setRouteReconfigureConfirmed(event: Event): void {
    this.draft.teachRouteReconfigureConfirmed = (event.target as HTMLInputElement).checked;
  }

  setRtdbReconfigureConfirmed(event: Event): void {
    this.draft.teachRtdbReconfigureConfirmed = (event.target as HTMLInputElement).checked;
  }

  setEmojiMappingEnabled(index: number, event: Event): void {
    const mappings = structuredClone(this.draft.emojiMappings ?? this.base.emojiMappings);
    mappings[index] = { ...mappings[index], enabled: (event.target as HTMLInputElement).checked };
    this.draft.emojiMappings = mappings;
  }

  async requestSerialPort(index: number): Promise<void> {
    if (!this.serialSupported) {
      this.serialNotice = 'Web Serial is not available in this browser.';
      return;
    }
    await this.serialInput.refreshPorts();
    const previousPorts = new Set(this.serialInput.ports());
    await this.serialInput.requestPort();
    const ports = this.serialInput.ports();
    const selectedIndex = ports.findIndex(port => !previousPorts.has(port));
    if (selectedIndex >= 0) {
      this.updateParticipant(index, { serialPortIndex: selectedIndex });
      this.serialNotice = 'Serial access granted. Review the selected device before applying.';
    } else if (ports.length === 1) {
      this.updateParticipant(index, { serialPortIndex: 0 });
      this.serialNotice = 'Serial access granted. Review the selected device before applying.';
    } else {
      this.serialNotice = this.serialInput.lastError() ?? 'No new serial device was selected.';
    }
  }

  updateProsignActionEnabled(key: string, event: Event): void {
    const current = this.draft.prosignActions ?? this.base.prosignActions;
    const actions = { ...current, [key]: { ...current[key], enabled: (event.target as HTMLInputElement).checked } };
    this.draft.prosignActions = actions;
  }

  updateProsignAction(key: string, event: Event): void {
    const current = this.draft.prosignActions ?? this.base.prosignActions;
    const action = (event.target as HTMLSelectElement).value as AppSettings['prosignActions'][string]['action'];
    this.draft.prosignActions = { ...current, [key]: { ...current[key], action } };
  }

  get prosignEntries(): { key: string; enabled: boolean; action: string }[] {
    return Object.entries(this.draft.prosignActions ?? this.base.prosignActions)
      .map(([key, value]) => ({ key, ...value }));
  }

  updateEmojiMapping(index: number, key: 'match' | 'emoji' | 'meaning', event: Event): void {
    const mappings = structuredClone(this.draft.emojiMappings ?? this.base.emojiMappings);
    const value = (event.target as HTMLInputElement).value;
    mappings[index] = { ...mappings[index], [key]: value };
    this.draft.emojiMappings = mappings;
  }

  /** Select-based numeric answers keep their numeric type. */
  setSelectNumber(key: DraftKey, event: Event): void {
    (this.draft as Record<string, unknown>)[key] = Number((event.target as HTMLSelectElement).value);
  }

  toggleWordLength(length: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const current = new Set(this.draft.practiceWordLengths ?? []);
    if (checked) current.add(length); else current.delete(length);
    this.draft.practiceWordLengths = [...current].sort((a, b) => a - b);
  }

  hasWordLength(length: number): boolean {
    return !!this.draft.practiceWordLengths?.includes(length);
  }

  // ---- Navigation ----

  next(): void {
    if (this.problems.length === 0 && this.stepIndex < this.steps.length - 1) {
      this.stepIndex++;
      this.focusStep();
    }
  }

  back(): void {
    if (this.stepIndex > 0) {
      this.stepIndex--;
      this.focusStep();
    }
  }

  /** Put this step's questions back to the current settings and stay on the step. */
  revert(): void {
    const keys = STEP_FIELDS[this.step] ?? [];
    const start = initialDraft(this.goal, this.base) as Record<string, unknown>;
    const draft = this.draft as Record<string, unknown>;
    for (const key of keys) {
      const value = start[key];
      draft[key] = Array.isArray(value) ? structuredClone(value) : value;
    }
  }

  /** True only when this step has answers that differ from the current settings. */
  get canRevert(): boolean {
    const keys = STEP_FIELDS[this.step];
    if (!keys || ['decode', 'midi', 'relay', 'hardware'].includes(this.goal)) return false;
    const start = initialDraft(this.goal, this.base) as Record<string, unknown>;
    const draft = this.draft as Record<string, unknown>;
    return keys.some(key => JSON.stringify(draft[key]) !== JSON.stringify(start[key]));
  }

  /** Apply only the reviewed changes; the running app is otherwise untouched. */
  apply(): void {
    if (!this.canApply) return;
    const patch = { ...this.patch };
    if (this.goal === 'midi') delete patch.midiInputEnabled;
    if (this.goal === 'relay') {
      delete patch.rtdbInputEnabled;
      delete patch.rtdbOutputEnabled;
    }
    if (this.goal === 'hardware') {
      delete patch.optoEnabled;
      delete patch.serialEnabled;
      delete patch.winkeyerEnabled;
      delete patch.midiOutputEnabled;
    }
    this.settings.update(patch);
    if (this.goal === 'decode') this.cwInput.updateParams();
    this.applied = true;
    this.stepIndex = this.steps.length - 1;
    this.focusStep();
  }

  /** Close from the header or Cancel; asks first when answers would be lost. */
  requestClose(): void {
    if (this.hasDraft()) {
      this.confirmDiscard = true;
    } else {
      this.closed.emit();
    }
  }

  /** Show the discard question (used by the browser Back button). */
  askDiscard(): void {
    this.confirmDiscard = true;
  }

  onDiscardAnswer(discard: boolean): void {
    this.confirmDiscard = false;
    if (discard) this.closed.emit();
  }

  /** Turn off the audio outputs that could feed the detector; the one change made outside Apply, and only on this click. */
  turnOffAudioOutput(): void {
    this.settings.update({ sidetoneEnabled: false, optoEnabled: false });
  }

  get detectorOn(): boolean {
    return this.settings.settings().cwInputEnabled;
  }

  /** The detector can be turned on from here only with valid answers and no feedback-risk output on. */
  get canTurnOnDetector(): boolean {
    if (this.detectorOn || this.feedbackOutputs.length > 0 || this.newConflicts.length > 0) return false;
    return this.applied || validateDraft(this.goal, this.draft, this.base).length === 0;
  }

  get canStartGoal(): boolean {
    return this.goal !== 'decode' || this.detectorOn || this.canTurnOnDetector;
  }

  /** Explicitly enable an already-reviewed MIDI input configuration. */
  async connectMidiInput(): Promise<void> {
    if (!this.midiInput.supported) {
      this.midiNotice = 'MIDI input is not available in this browser.';
      return;
    }
    this.settings.update({ midiInputEnabled: true });
    await this.midiInput.start();
    this.midiInput.reattach();
    this.midiNotice = this.midiInput.lastError() || 'MIDI input is enabled. Check the connection status before keying.';
  }

  async connectHardwareRoute(method: HardwareOutputMethod): Promise<void> {
    if (!this.applied || !this.hardwareMethods.includes(method)) return;
    if (this.routeAvailabilityProblems.length > 0) {
      this.deviceCheckNotice = this.routeAvailabilityProblems.join(' ');
      return;
    }
    if (method === 'opto') {
      this.settings.update({ optoEnabled: true });
      this.deviceCheckNotice = 'Optocoupler keying is enabled for the reviewed audio device and channel.';
    } else if (method === 'serial') {
      this.settings.update({ serialEnabled: true });
      this.deviceCheckNotice = 'Serial keying is enabled for the reviewed port and pin mapping.';
    } else if (method === 'winkeyer') {
      this.settings.update({ winkeyerEnabled: true });
      this.deviceCheckNotice = 'WinKeyer keying is enabled for the reviewed serial port.';
    } else {
      if (!this.midiOutput.supported) {
        this.deviceCheckNotice = 'MIDI output is not supported in this browser.';
        return;
      }
      this.settings.update({ midiOutputEnabled: true });
      await this.midiOutput.start();
      this.midiOutput.reattach();
      this.deviceCheckNotice = this.midiOutput.lastError()
        || 'MIDI output is enabled for the reviewed device and mapping.';
    }
  }

  /** Explicitly enable the already-reviewed serial key mappings. */
  connectSerialInput(): void {
    if (!this.serialSupported) {
      this.serialNotice = 'Web Serial is not available in this browser.';
      return;
    }
    if (this.hasUnassignedSerialPort) {
      this.serialNotice = 'Assign a connected serial device to each serial input before enabling it.';
      return;
    }
    this.settings.update({ serialInputEnabled: true });
    this.serialNotice = 'Serial input is enabled. Check the device connection status before keying.';
  }

  /** Explicitly join the shared RTDB channel configured in the reviewed draft. */
  connectSharedChannel(): void {
    if (!this.settings.settings().rtdbInputChannelName.trim()
      || !this.settings.settings().rtdbInputChannelSecret.trim()) {
      this.rtdbNotice = 'Apply a channel name and secret before connecting.';
      return;
    }
    this.settings.update(this.goal === 'relay'
      ? {
        rtdbInputEnabled: this.base.rtdbInputEnabled || !!this.draft.relayReceive,
        rtdbOutputEnabled: this.base.rtdbOutputEnabled || !!this.draft.relaySend,
      }
      : { rtdbInputEnabled: true, rtdbOutputEnabled: true });
    this.rtdbNotice = `Connecting to shared channel "${this.settings.settings().rtdbInputChannelName}".`;
  }

  /** Apply any reviewed changes, switch the detector on and return to the main screen; audio is not started. */
  turnOnDetector(): void {
    if (!this.canTurnOnDetector) return;
    this.settings.update({ ...(this.applied ? {} : this.patch), cwInputEnabled: true });
    this.cwInput.updateParams();
    this.detectorEnabled.emit();
    this.tryRequested.emit();
  }

  startGoal(): void {
    if (this.goal === 'teach' && this.teachScenarios.includes('copying')
      && !this.teachScenarios.includes('sending') && !this.teachScenarios.includes('mobile')) {
      this.startCopyPractice();
    } else if (this.goal === 'teach') {
      this.openConversation();
    } else if (this.goal === 'practice') {
      this.settings.update({ encoderMode: 'practice' });
      this.tryRequested.emit();
    } else if (this.goal === 'decode' && !this.detectorOn && this.canTurnOnDetector) {
      this.turnOnDetector();
    } else {
      this.tryRequested.emit();
    }
  }

  tryNow(): void {
    this.startGoal();
  }

  startCopyPractice(): void {
    this.settings.update({ encoderMode: 'practice' });
    this.tryRequested.emit();
  }

  openConversation(): void {
    this.openFullscreenRequested.emit();
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (this.confirmDiscard) return;
    event.stopPropagation();
    this.requestClose();
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab' && !this.confirmDiscard && this.dialog) {
      trapDialogTabKey(event, this.dialog.nativeElement);
    }
  }

  private focusStep(): void {
    window.setTimeout(() => {
      const body = this.dialog?.nativeElement.querySelector<HTMLElement>('.wizard-step-title');
      body?.focus();
      body?.scrollIntoView({ block: 'nearest' });
    });
  }

  private updateParticipant(index: number, patch: Partial<TeachParticipantDraft>): void {
    const participants = [...this.teachParticipants];
    if (!participants[index]) return;
    participants[index] = { ...participants[index], ...patch };
    this.draft.teachParticipants = participants;
  }
}
