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
import { AppSettings, SettingsService } from '../../services/settings.service';
import { CwInputService } from '../../services/cw-input.service';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { focusDialog, restoreDialogFocus, trapDialogTabKey } from '../modal-accessibility';
import { WizardGoalId, goalForWizard } from '../settings-modal/goal-navigator/setup-goals';
import {
  DraftKey,
  DraftValues,
  LIMITS,
  STEP_FIELDS,
  WIZARD_STEPS,
  WizardStepId,
  buildReview,
  feedbackRiskOutputs,
  hasAnswerChanges,
  initialDraft,
  newChannelConflicts,
  proposedValues,
  validateDraft,
  validateStep,
} from './setup-wizard-draft';

/**
 * Guided setup for one goal.
 *
 * Collects answers in a temporary draft. Nothing changes in the running app
 * until the user presses Apply on the review step, and then only the listed
 * settings change, through `SettingsService.update()`. It never saves the
 * device profile, starts audio, asks for a device or microphone, or sends Morse.
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

  @Output() readonly openSettingsRequested = new EventEmitter<WizardGoalId>();

  @ViewChild('dialog') private dialog?: ElementRef<HTMLElement>;

  readonly limits = LIMITS;

  /** Settings as they were when the wizard opened */
  base!: AppSettings;

  /** Temporary answers; never live until Apply */
  draft: DraftValues = {};

  steps: WizardStepId[] = [];
  stepIndex = 0;

  /** Whether Apply has been pressed */
  applied = false;

  /** Whether the discard confirmation is showing */
  confirmDiscard = false;

  /** Whether this browser exposes what the detector needs */
  readonly audioInputSupported =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof AudioWorkletNode !== 'undefined';

  private readonly focusReturnTarget =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  constructor(private settings: SettingsService, private cwInput: CwInputService) {}

  ngOnInit(): void {
    this.base = { ...this.settings.settings() };
    this.steps = WIZARD_STEPS[this.goal];
    this.draft = initialDraft(this.goal, this.base);
  }

  ngAfterViewInit(): void {
    if (this.dialog) focusDialog(this.dialog.nativeElement, '.wizard-primary');
  }

  ngOnDestroy(): void {
    restoreDialogFocus(this.focusReturnTarget, this.focusReturnFallback);
  }

  get title(): string {
    return goalForWizard(this.goal).label;
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
    return this.review.changes.length > 0 &&
      validateDraft(this.goal, this.draft, this.base).length === 0 &&
      this.newConflicts.length === 0;
  }

  /** Only the settings shown as changed in the review. */
  private get patch(): DraftValues {
    const proposed = proposedValues(this.goal, this.draft);
    const patch: Record<string, unknown> = {};
    for (const line of this.review.changes) patch[line.key] = proposed[line.key];
    return patch as DraftValues;
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

  setBool(key: DraftKey, event: Event): void {
    (this.draft as Record<string, unknown>)[key] = (event.target as HTMLInputElement).checked;
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

  /** Leave this step's questions as they are now and move on. */
  skip(): void {
    const keys = STEP_FIELDS[this.step] ?? [];
    const start = initialDraft(this.goal, this.base) as Record<string, unknown>;
    for (const key of keys) (this.draft as Record<string, unknown>)[key] = start[key];
    this.next();
  }

  get canSkip(): boolean {
    return !!STEP_FIELDS[this.step];
  }

  /** Apply only the reviewed changes; the running app is otherwise untouched. */
  apply(): void {
    if (!this.canApply) return;
    this.settings.update(this.patch);
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

  /** Apply any reviewed changes, switch the detector on and return to the main screen; audio is not started. */
  turnOnDetector(): void {
    if (!this.canTurnOnDetector) return;
    this.settings.update({ ...(this.applied ? {} : this.patch), cwInputEnabled: true });
    this.cwInput.updateParams();
    this.detectorEnabled.emit();
    this.tryRequested.emit();
  }

  tryNow(): void {
    this.tryRequested.emit();
  }

  openSettings(): void {
    this.openSettingsRequested.emit(this.goal);
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (this.confirmDiscard) return;
    event.stopPropagation();
    this.requestClose();
  }

  onKeydown(event: KeyboardEvent): void {
    if (this.dialog) trapDialogTabKey(event, this.dialog.nativeElement);
  }

  private focusStep(): void {
    window.setTimeout(() => {
      const body = this.dialog?.nativeElement.querySelector<HTMLElement>('.wizard-step-title');
      body?.focus();
      body?.scrollIntoView({ block: 'nearest' });
    });
  }
}
