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
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppSettings, SettingsSaveResult, SettingsService } from '../../services/settings.service';
import { AudioDeviceService } from '../../services/audio-device.service';
import { FirebaseRtdbService } from '../../services/firebase-rtdb.service';
import { SETTINGS_SCOPE } from '../settings-items/settings-scope';
import { LiveSettingsScope } from '../settings-items/live-settings-scope';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { MidiInputService } from '../../services/midi-input.service';
import { MidiOutputService } from '../../services/midi-output.service';
import { SerialKeyInputService } from '../../services/serial-key-input.service';
import { SerialKeyOutputService } from '../../services/serial-key-output.service';
import { WinkeyerOutputService } from '../../services/winkeyer-output.service';
import {
  PortableAppSettings,
  SETTINGS_SNAPSHOT_MAX_BYTES,
  validateSettingsSnapshot,
} from '../../services/settings-snapshot';
import { PresetService } from '../../services/preset.service';
import { PracticeService } from '../../services/practice.service';
import { AudioInputService } from '../../services/audio-input.service';
import { AudioOutputService } from '../../services/audio-output.service';
import { CwInputService } from '../../services/cw-input.service';
import { WakeLockService } from '../../services/wake-lock.service';
import { compareExternalRoutes } from '../../services/output-change-checker';
import {
  EXPORT_FILE_NAME_MAX_LENGTH,
  exportFileName,
  PRESET_NAME_MAX_LENGTH,
  presetFileName,
  SettingsPreset,
  suggestPresetName,
} from '../../services/settings-presets';
import {
  ExternalRouteChange,
  prepareSettingsImport,
  SettingChange,
  SettingsImportReview,
  SettingsSnapshotDevices,
} from '../../services/settings-snapshot-review';
import { SettingsInputsTabComponent } from './settings-inputs-tab/settings-inputs-tab.component';
import { SettingsOutputsTabComponent } from './settings-outputs-tab/settings-outputs-tab.component';
import { SettingsOtherTabComponent } from './settings-other-tab/settings-other-tab.component';
import { GoalTarget, goalTargetForLanding } from './goal-navigator/setup-goals';
import { focusDialog, restoreDialogFocus, trapDialogTabKey } from '../modal-accessibility';
import { BackdropClickDirective } from '../backdrop-click.directive';
import { BackCloseDirective } from '../back-close.directive';

/**
 * Settings modal component — modal chrome and tab navigation.
 *
 * Orchestrates the three settings tab child components
 * ({@link SettingsInputsTabComponent}, {@link SettingsOutputsTabComponent},
 * {@link SettingsOtherTabComponent}) within a modal overlay. Handles:
 *
 *  - Tab switching by tap, click or keyboard
 *  - Device scan / refresh (audio device enumeration)
 *  - Reset-to-defaults confirmation dialog
 *  - Save button and validation banner
 *  - Scan results overlay
 *  - Named presets: save, export, import, and reviewed apply
 *
 * All tab-specific settings cards and their handlers live in the
 * respective tab child components.
 */
@Component({
  selector: 'app-settings-modal',
  standalone: true,
  imports: [
    FormsModule,
    DatePipe,
    BackdropClickDirective,
    BackCloseDirective,
    ConfirmDialogComponent,
    SettingsInputsTabComponent,
    SettingsOutputsTabComponent,
    SettingsOtherTabComponent,
  ],
  templateUrl: './settings-modal.component.html',
  styleUrls: ['./settings-modal.component.css'],
  // Items inside Settings edit the running settings; the scope snapshot is taken when the dialog opens
  providers: [LiveSettingsScope, { provide: SETTINGS_SCOPE, useExisting: LiveSettingsScope }],
})
export class SettingsModalComponent implements AfterViewInit, OnDestroy {
  /** Whether audio contexts are running (passed to tab children for test buttons) */
  @Input() audioRunning = false;

  /** Emitted when the user closes the settings modal */
  @Output() closed = new EventEmitter<void>();

  /** Emitted after a confirmed reset to defaults */
  @Output() defaultsReset = new EventEmitter<void>();

  /** Emitted after settings are saved */
  @Output() saved = new EventEmitter<void>();

  /** Emitted with the Help section ID requested by a settings card. */
  @Output() helpRequested = new EventEmitter<string>();

  /** Landing key chosen in the Setup Wizard; opens its card and shows its hint on entry */
  @Input() startLanding: string | null = null;

  /** Show only the Presets dialog (opened from the Setup Wizard), without the Settings dialog */
  @Input() presetsOnly = false;

  /** Visible control to focus on close when the menu item that opened Settings is hidden */
  @Input() focusReturnFallback: HTMLElement | null = null;

  /** Emitted when the Presets dialog closes in presets-only mode */
  @Output() presetsDismissed = new EventEmitter<void>();

  // ---- UI state ----

  /** Currently active settings tab */
  settingsTab: 'inputs' | 'outputs' | 'other' = 'inputs';

  @ViewChild('settingsDialog') private settingsDialog?: ElementRef<HTMLElement>;
  @ViewChild('scanDialog') private scanDialog?: ElementRef<HTMLElement>;

  private readonly focusReturnTarget =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  private scanResultsTrigger: HTMLElement | null = null;

  /** Whether the reset confirmation dialog is visible */
  showResetConfirm = false;

  /** Whether the Revert confirmation is showing */
  showRevertConfirm = false;
  revertMessage = '';

  /** Whether the scan results overlay is visible */
  showScanResults = false;

  /** Whether a save result dialog is visible */
  showSaveResult = false;

  /** Whether the presets dialog is visible */
  showPresets = false;

  /** Maximum characters in a preset name */
  readonly presetNameMaxLength = PRESET_NAME_MAX_LENGTH;
  readonly exportFileNameMaxLength = EXPORT_FILE_NAME_MAX_LENGTH;

  /** Error shown in the presets dialog */
  transferError = '';

  /** Confirmation shown in the presets dialog */
  presetNotice = '';

  /** Name entry for saving, renaming, duplicating, exporting (file name), or naming an imported file */
  nameForm: { mode: 'save' | 'rename' | 'duplicate' | 'export' | 'import'; id?: string; value: string } | null = null;

  /** Preset whose actions menu is open */
  presetMenuId: string | null = null;

  /** Fixed position of the open actions menu */
  presetMenuPos: { top: number | null; bottom: number | null; right: number } = { top: 0, bottom: null, right: 0 };

  /** Preset awaiting overwrite confirmation */
  updatePresetId: string | null = null;

  /** Preset awaiting delete confirmation */
  deletePresetId: string | null = null;

  /** Whether removal of an unreadable preset store needs confirmation */
  confirmDiscardDamagedPresets = false;

  /** The preset whose reviewed apply is being shown */
  reviewPreset: SettingsPreset | null = null;

  /** A transfer review waiting for explicit confirmation */
  transferReview: SettingsImportReview | null = null;

  /** Per-route acknowledgements required before applying outputs */
  routeAcknowledgements: Record<string, boolean> = {};

  /** Whether the last reviewed preset has been applied */
  transferApplied = false;

  saveResultTitle = '';
  saveResultMessage = '';

  /** Input devices found during the last scan */
  scanResultInputs: { label: string }[] = [];

  /** Output devices found during the last scan */
  scanResultOutputs: { label: string }[] = [];

  /** Whether the last scan switched to a different device profile */
  scanProfileChanged = false;

  private transferBaseSettings: AppSettings | null = null;
  private pendingImport: PortableAppSettings | null = null;
  private settingsTransferTrigger: HTMLButtonElement | null = null;

  constructor(
    public settings: SettingsService,
    public presets: PresetService,
    private devices: AudioDeviceService,
    private rtdbService: FirebaseRtdbService,
    private midiInput: MidiInputService,
    private midiOutput: MidiOutputService,
    private serialInput: SerialKeyInputService,
    private serialOutput: SerialKeyOutputService,
    private winkeyerOutput: WinkeyerOutputService,
    private practice: PracticeService,
    private audioInput: AudioInputService,
    private audioOutput: AudioOutputService,
    private cwInput: CwInputService,
    private wakeLock: WakeLockService,
  ) {}

  ngAfterViewInit(): void {
    if (this.presetsOnly) {
      window.setTimeout(() => this.openPresets());
      return;
    }
    if (this.startLanding) {
      const landing = this.startLanding;
      window.setTimeout(() => this.openLanding(landing));
    }
    if (this.settingsDialog) {
      focusDialog(this.settingsDialog.nativeElement, '.settings-close-btn');
    }
  }

  /** Download unreadable preset data before deciding whether to remove it. */
  downloadDamagedPresetStore(): void {
    const raw = this.presets.damagedRawStore();
    if (raw === null) {
      this.transferError = 'The damaged preset data is no longer available to download.';
      return;
    }
    try {
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'morse-code-studio-damaged-presets.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      this.presetNotice = 'Downloaded the unreadable preset data. Keep it private and do not share it unless you trust the recipient.';
    } catch {
      this.transferError = 'The unreadable preset data could not be downloaded in this browser.';
    }
  }

  /** Show the explicit destructive confirmation for unreadable preset storage. */
  requestDiscardDamagedPresets(): void {
    this.transferError = '';
    this.confirmDiscardDamagedPresets = true;
  }

  /** Keep unreadable data unchanged and return to the recovery choices. */
  cancelDiscardDamagedPresets(): void {
    this.confirmDiscardDamagedPresets = false;
  }

  /** Remove only the unreadable preset store and restore preset creation/import. */
  discardDamagedPresets(): void {
    const result = this.presets.discardDamagedStore();
    this.confirmDiscardDamagedPresets = false;
    if (result.ok) {
      this.presetNotice = 'Removed the unreadable saved presets. You can save or import presets again; live settings were not changed.';
    } else {
      this.transferError = result.error;
    }
  }

  ngOnDestroy(): void {
    restoreDialogFocus(this.focusReturnTarget, this.focusReturnFallback);
  }

  // ---- Browser Back button: each popup closes on its own before Settings does ----

  readonly backRevert = (): void => { this.showRevertConfirm = false; };
  readonly backReset = (): void => { this.showResetConfirm = false; };
  readonly backSaveResult = (): void => { this.dismissSaveResult(); };
  readonly backScan = (): void => { this.dismissScanResults(); };

  /**
   * Back inside Presets: step out of a menu, a confirmation or a review.
   * Returns false when none of those is open, so Back should close the dialog itself.
   */
  stepBackInPresets(): boolean {
    if (this.presetMenuId) {
      this.closePresetMenu(true);
      return true;
    }
    if (this.confirmDiscardDamagedPresets) {
      this.confirmDiscardDamagedPresets = false;
      return true;
    }
    if (this.transferReview) {
      this.cancelReview();
      return true;
    }
    return false;
  }

  /** Back for the Presets dialog opened from Settings; returns true while the dialog stays open */
  readonly backPresets = (): boolean => {
    if (this.stepBackInPresets()) return true;
    this.closePresets();
    return false;
  };

  /** Close the settings modal */
  close(): void {
    this.closed.emit();
  }

  /** Keep keyboard focus in Settings while allowing the standard dialog tab order. */
  onSettingsDialogKeydown(event: KeyboardEvent): void {
    if (this.settingsDialog) {
      trapDialogTabKey(event, this.settingsDialog.nativeElement);
    }
  }

  /** Keep keyboard focus inside the device scan results dialog. */
  onScanDialogKeydown(event: KeyboardEvent): void {
    if (this.scanDialog) trapDialogTabKey(event, this.scanDialog.nativeElement);
  }

  /** Move between Settings tabs with the standard horizontal tab keyboard pattern. */
  onTabKeydown(event: KeyboardEvent, currentTab: 'inputs' | 'outputs' | 'other'): void {
    const currentIndex = this.tabOrder.indexOf(currentTab);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % this.tabOrder.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + this.tabOrder.length) % this.tabOrder.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = this.tabOrder.length - 1;
    }
    if (nextIndex === null) return;

    event.preventDefault();
    this.settingsTab = this.tabOrder[nextIndex];
    window.requestAnimationFrame(() => {
      document.getElementById(`settings-tab-${this.settingsTab}`)?.focus();
    });
  }

  /**
   * Open the tab and existing card chosen from "Setup Wizard".
   * Navigation only: the card is expanded, outlined, scrolled into view and its
   * title focused; no toggle, device or setting is touched.
   */
  openGoalTarget(target: GoalTarget): void {
    this.settingsTab = target.tab;
    const cardId = target.cardId;
    if (!cardId) return;
    // Only the selected tab is rendered, so wait for it before locating the card.
    window.setTimeout(() => window.requestAnimationFrame(() => this.revealCard(cardId)));
  }

  /** Open the Settings card selected from the goal navigator. */
  openLanding(key: string): void {
    this.openGoalTarget(goalTargetForLanding(key));
  }

  private revealCard(cardId: string, attemptsLeft = 20): void {
    const card = document.getElementById(cardId);
    const title = card?.querySelector<HTMLElement>('.settings-card-title');
    if (!card || !title) {
      if (attemptsLeft > 0) {
        window.requestAnimationFrame(() => this.revealCard(cardId, attemptsLeft - 1));
      }
      return;
    }
    document.querySelectorAll('.settings-card.goal-opened')
      .forEach(el => el.classList.remove('goal-opened'));
    // Collapse every other open card so only the chosen one is expanded.
    document.querySelectorAll<HTMLElement>('.settings-tab-content .settings-card-title[aria-expanded="true"]')
      .forEach(other => {
        if (other !== title) other.click();
      });
    if (title.getAttribute('aria-expanded') === 'false') {
      title.click();
    }
    card.classList.add('goal-opened');
    window.requestAnimationFrame(() => {
      card.scrollIntoView({ block: 'start' });
      title.focus({ preventScroll: true });
    });
  }

  /** Show the reset-confirmation dialog */
  confirmReset(): void {
    this.showResetConfirm = true;
  }

  /** Handle the result from the reset confirmation dialog */
  onResetConfirmed(confirmed: boolean): void {
    this.showResetConfirm = false;
    if (confirmed) {
      this.settings.resetToDefaults();
      this.defaultsReset.emit();

      // Stop any active RTDB connections since defaults have both disabled
      this.rtdbService.stopInput();
      this.rtdbService.stopOutput();
    }
  }

  /** Tab order used for keyboard navigation */
  private readonly tabOrder: ('inputs' | 'outputs' | 'other')[] = ['inputs', 'outputs', 'other'];

  // ---- Revert ----

  /** Ask before discarding unsaved changes; names any route that going back would switch on */
  confirmRevert(): void {
    const saved = this.settings.peekSavedSettings(this.devices.inputDevices(), this.devices.outputDevices());
    if (!saved) return;
    const routes = compareExternalRoutes(this.settings.settings(), saved);
    let message = 'Discard your unsaved changes and go back to the settings last saved for this device?';
    if (routes.length > 0) {
      message += `\n\nThis will also switch on or redirect: ${routes.map(route => `${route.type} (${route.change})`).join('; ')}.`;
    }
    this.revertMessage = message;
    this.showRevertConfirm = true;
  }

  /** Restore the last saved settings, then bring every running channel in line with them */
  async onRevertConfirmed(confirmed: boolean): Promise<void> {
    this.showRevertConfirm = false;
    if (!confirmed) return;
    const before = this.settings.settings();
    const restored = this.settings.revertToSaved(this.devices.inputDevices(), this.devices.outputDevices());
    if (!restored) return;

    if (before.encoderMode === 'practice' && restored.encoderMode !== 'practice') this.practice.reset();
    await this.syncLiveServices(before, restored);
    window.setTimeout(() => this.focusSettingsClose());
  }

  /**
   * Do what each Settings card does when its switch changes, for every channel
   * that differs after a revert. The confirmation named the routes it would
   * switch on, so the click is the user's explicit action; failures show in the cards.
   * Services driven by their own effects (sidetone, opto, serial input) need nothing here.
   */
  private async syncLiveServices(before: AppSettings, restored: AppSettings): Promise<void> {
    // RTDB: stop what is switched off or pointed elsewhere, then start what should run
    const rtdbInputMoved = before.rtdbInputChannelName !== restored.rtdbInputChannelName
      || before.rtdbInputChannelSecret !== restored.rtdbInputChannelSecret;
    if (!restored.rtdbInputEnabled) {
      if (before.rtdbInputEnabled) this.rtdbService.stopInput();
    } else if (!before.rtdbInputEnabled || rtdbInputMoved) {
      this.rtdbService.startInput();
    }
    const rtdbOutputMoved = before.rtdbOutputChannelName !== restored.rtdbOutputChannelName
      || before.rtdbOutputChannelSecret !== restored.rtdbOutputChannelSecret;
    if (!restored.rtdbOutputEnabled) {
      if (before.rtdbOutputEnabled) this.rtdbService.stopOutput();
    } else if (!before.rtdbOutputEnabled || rtdbOutputMoved) {
      if (before.rtdbOutputEnabled) this.rtdbService.stopOutput();
      this.rtdbService.startOutput();
    }

    // MIDI
    if (before.midiInputEnabled && !restored.midiInputEnabled) this.midiInput.shutdown();
    if (before.midiOutputEnabled && !restored.midiOutputEnabled) this.midiOutput.shutdown();
    if (restored.midiInputEnabled) {
      if (before.midiInputEnabled) this.midiInput.reattach();
      else await this.midiInput.start();
    }
    if (restored.midiOutputEnabled) {
      if (before.midiOutputEnabled) this.midiOutput.reattach();
      else await this.midiOutput.start();
    }

    // Serial keying output (serial input attaches itself from the settings)
    if (!restored.serialEnabled) {
      if (before.serialEnabled) await this.serialOutput.closeAll();
    } else {
      await this.serialOutput.connectAllEnabled();
    }

    // WinKeyer
    if (!restored.winkeyerEnabled) {
      if (before.winkeyerEnabled) await this.winkeyerOutput.close();
    } else if (restored.winkeyerPortIndex >= 0) {
      if (before.winkeyerPortIndex !== restored.winkeyerPortIndex && this.winkeyerOutput.connected()) {
        await this.winkeyerOutput.close();
      }
      if (!this.winkeyerOutput.connected()) await this.winkeyerOutput.open(restored.winkeyerPortIndex);
      else if (before.winkeyerWpm !== restored.winkeyerWpm) await this.winkeyerOutput.setSpeed(restored.winkeyerWpm);
    }

    // Microphone and CW detector only run while audio is running
    if (this.audioRunning) {
      const micMoved = before.micInputEnabled && restored.micInputEnabled
        && (before.inputDeviceId !== restored.inputDeviceId || before.pilotOutputDeviceId !== restored.pilotOutputDeviceId);
      if (before.micInputEnabled && (!restored.micInputEnabled || micMoved)) {
        await this.audioInput.stop();
        await this.audioOutput.stopPilot();
      }
      if (restored.micInputEnabled) {
        if (!before.micInputEnabled || micMoved) {
          await this.audioInput.start();
          await this.audioOutput.startPilot();
        } else {
          this.audioInput.updateParams();
        }
      }

      const cwMoved = before.cwInputEnabled && restored.cwInputEnabled
        && before.cwInputDeviceId !== restored.cwInputDeviceId;
      if (before.cwInputEnabled && (!restored.cwInputEnabled || cwMoved)) await this.cwInput.stop();
      if (restored.cwInputEnabled) {
        if (!before.cwInputEnabled || cwMoved) await this.cwInput.start();
        else this.cwInput.updateParams();
      }
    }

    if (before.wakeLockEnabled !== restored.wakeLockEnabled) {
      await this.wakeLock.onSettingChanged(restored.wakeLockEnabled);
    }
  }

  /** Revert and Save both disable after use, so keyboard focus moves to the header close button */
  private focusSettingsClose(): void {
    if (this.settingsDialog) focusDialog(this.settingsDialog.nativeElement, '.settings-close-btn');
  }

  // ---- Save ----

  /** Persist current settings to the active audio-device profile */
  saveSettings(): void {
    const result = this.settings.save(
      this.devices.inputDevices(),
      this.devices.outputDevices()
    );

    if (result === 'saved') {
      this.saved.emit();
    } else if (result === 'no-profile') {
      this.showSaveResult = true;
      this.saveResultTitle = 'Settings not saved';
      this.saveResultMessage = 'No device profile is available to save to. Refresh audio devices to identify a profile, then try again. Your changes remain active now.';
    } else {
      this.showSaveResult = true;
      this.saveResultTitle = 'Settings not saved';
      this.saveResultMessage = 'Browser storage could not save these settings. Check that site storage is available, then try again. Your changes remain active now.';
    }
  }

  dismissSaveResult(): void {
    this.showSaveResult = false;
  }

  /** Open the presets dialog */
  openPresets(event?: Event): void {
    this.settingsTransferTrigger = event ? event.currentTarget as HTMLButtonElement : null;
    this.presets.reload();
    this.resetPresetState();
    this.showPresets = true;
    window.setTimeout(() => this.focusFirstTransferControl(), 0);
  }

  /** Close the presets dialog without applying anything; an open review only steps back to the list */
  closePresets(): void {
    if (this.transferReview) {
      this.cancelReview();
      return;
    }
    this.showPresets = false;
    this.closePresetMenu();
    this.resetPresetState();
    if (this.presetsOnly) {
      this.presetsDismissed.emit();
      return;
    }
    window.setTimeout(() => this.settingsTransferTrigger?.focus(), 0);
  }

  /** Keep keyboard focus inside the transfer dialog and support Escape to close */
  onPresetsKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.presetMenuId) {
        this.closePresetMenu(true);
        return;
      }
      this.closePresets();
      return;
    }
    trapDialogTabKey(event, event.currentTarget as HTMLElement);
  }

  /** A fixed-position menu would be misplaced after the viewport changes */
  @HostListener('window:resize')
  onWindowResize(): void {
    this.presetMenuId = null;
  }

  get menuPreset(): SettingsPreset | undefined {
    return this.presets.presets().find(preset => preset.id === this.presetMenuId);
  }

  /** Open or close the actions menu next to the clicked button, flipping upward near the bottom */
  togglePresetMenu(preset: SettingsPreset, event: Event): void {
    event.stopPropagation();
    if (this.presetMenuId === preset.id) {
      this.closePresetMenu();
      return;
    }
    const button = event.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - rect.right);
    const opensUp = rect.bottom + 6 + 250 > window.innerHeight;
    this.presetMenuPos = opensUp
      ? { top: null, bottom: window.innerHeight - rect.top + 6, right }
      : { top: rect.bottom + 6, bottom: null, right };
    this.presetMenuId = preset.id;
    window.setTimeout(() => document.querySelector<HTMLElement>('.preset-menu-item')?.focus(), 0);
  }

  closePresetMenu(restoreFocus = false): void {
    const id = this.presetMenuId;
    this.presetMenuId = null;
    if (restoreFocus && id) {
      window.setTimeout(() => document.querySelector<HTMLElement>(`.preset-menu-btn[aria-label="Actions for ${this.presets.presets().find(p => p.id === id)?.name}"]`)?.focus(), 0);
    }
  }

  /** Run a menu action and close the menu */
  runPresetMenu(action: 'apply' | 'update' | 'export' | 'rename' | 'duplicate' | 'delete', preset: SettingsPreset): void {
    this.closePresetMenu();
    if (action === 'apply') this.startReviewPreset(preset);
    else if (action === 'update') this.confirmUpdatePreset(preset);
    else if (action === 'export') this.startExportPreset(preset);
    else if (action === 'rename') this.startRenamePreset(preset);
    else if (action === 'duplicate') this.startDuplicatePreset(preset);
    else this.confirmDeletePreset(preset);
  }

  /** Start naming a new preset from the current live settings */
  startSavePreset(): void {
    this.clearMessages();
    this.nameForm = { mode: 'save', value: suggestPresetName('My setup', this.presets.presets()) };
    this.focusNameInput();
  }

  startRenamePreset(preset: SettingsPreset): void {
    this.clearMessages();
    this.nameForm = { mode: 'rename', id: preset.id, value: preset.name };
    this.focusNameInput();
  }

  startDuplicatePreset(preset: SettingsPreset): void {
    this.clearMessages();
    this.nameForm = {
      mode: 'duplicate',
      id: preset.id,
      value: suggestPresetName(`${preset.name} copy`, this.presets.presets()),
    };
    this.focusNameInput();
  }

  /** Offer the generated file name for editing; nothing downloads until Save */
  startExportPreset(preset: SettingsPreset): void {
    this.clearMessages();
    this.nameForm = { mode: 'export', id: preset.id, value: presetFileName(preset.name) };
    this.focusNameInput();
  }

  cancelNameForm(): void {
    this.nameForm = null;
    this.pendingImport = null;
    this.transferError = '';
  }

  /** Validate the name and perform the pending save, rename, duplicate, or import */
  submitNameForm(): void {
    const form = this.nameForm;
    if (!form) return;
    this.transferError = '';
    if (form.mode === 'export') {
      const preset = this.presets.presets().find(item => item.id === form.id);
      if (!preset) {
        this.transferError = 'That preset is no longer available.';
        return;
      }
      this.nameForm = null;
      this.exportPreset(preset, form.value);
      return;
    }
    const result = form.mode === 'save' ? this.presets.saveCurrent(form.value)
      : form.mode === 'rename' ? this.presets.rename(form.id ?? '', form.value)
      : form.mode === 'duplicate' ? this.presets.duplicate(form.id ?? '', form.value)
      : this.pendingImport ? this.presets.add(form.value, this.pendingImport)
      : { ok: false as const, error: 'The import is no longer available. Choose the file again.' };
    if (!result.ok) {
      this.transferError = result.error;
      return;
    }
    const verb = { save: 'Saved', rename: 'Renamed to', duplicate: 'Duplicated as', import: 'Imported as' }[form.mode];
    this.presetNotice = form.mode === 'import'
      ? `${verb} "${result.preset.name}". The preset was added only; nothing has been applied.`
      : `${verb} "${result.preset.name}".`;
    this.nameForm = null;
    this.pendingImport = null;
  }

  confirmUpdatePreset(preset: SettingsPreset): void {
    this.clearMessages();
    this.updatePresetId = preset.id;
  }

  cancelUpdatePreset(): void {
    this.updatePresetId = null;
  }

  /** Overwrite the confirmed preset with the current live settings */
  updateConfirmedPreset(): void {
    const id = this.updatePresetId;
    this.updatePresetId = null;
    if (!id) return;
    const result = this.presets.updateFromCurrent(id);
    if (result.ok) this.presetNotice = `Updated "${result.preset.name}" with the current settings.`;
    else this.transferError = result.error;
  }

  confirmDeletePreset(preset: SettingsPreset): void {
    this.clearMessages();
    this.deletePresetId = preset.id;
  }

  cancelDeletePreset(): void {
    this.deletePresetId = null;
    this.confirmDiscardDamagedPresets = false;
  }

  deleteConfirmedPreset(): void {
    const id = this.deletePresetId;
    this.deletePresetId = null;
    if (!id) return;
    const result = this.presets.remove(id);
    if (result.ok) this.presetNotice = `Deleted "${result.preset.name}".`;
    else this.transferError = result.error;
  }

  /** Download one preset as a versioned local JSON file named `fileName`, excluding RTDB secrets */
  exportPreset(preset: SettingsPreset, fileName: string): void {
    this.clearMessages();
    try {
      const snapshot = {
        format: 'mcs-settings',
        version: 1,
        name: preset.name,
        settings: preset.settings,
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = exportFileName(fileName, preset.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      this.presetNotice = `Exported "${preset.name}" as ${link.download}. It contains no RTDB secrets.`;
    } catch {
      this.transferError = 'The preset file could not be created in this browser.';
    }
  }

  /** Read and validate a user-selected file, then ask for a name; this never applies it */
  async onSettingsFileSelected(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.clearMessages();
    if (file.size > SETTINGS_SNAPSHOT_MAX_BYTES) {
      this.transferError = 'The settings file is larger than the 1 MiB limit.';
      return;
    }

    let contents: string;
    try {
      contents = await file.text();
    } catch {
      this.transferError = 'The selected settings file could not be read.';
      return;
    }

    const validation = validateSettingsSnapshot(contents, this.settings.getDefaults());
    if (!validation.valid) {
      this.transferError = validation.error;
      return;
    }

    const fileBase = file.name.replace(/\.json$/i, '');
    this.pendingImport = validation.settings;
    this.nameForm = {
      mode: 'import',
      value: suggestPresetName(validation.name || fileBase || 'Imported preset', this.presets.presets()),
    };
    this.focusNameInput();
  }

  /** Show the reviewed before/after list for applying a preset */
  startReviewPreset(preset: SettingsPreset): void {
    this.clearMessages();
    this.reviewPreset = preset;
    this.transferBaseSettings = this.settings.settings();
    this.transferReview = prepareSettingsImport(
      this.transferBaseSettings,
      preset.settings,
      this.getSnapshotDevices(),
    );
    window.setTimeout(() => this.focusFirstTransferControl(), 0);
  }

  /** Leave the review without changing anything */
  cancelReview(): void {
    this.transferReview = null;
    this.transferBaseSettings = null;
    this.reviewPreset = null;
    this.routeAcknowledgements = {};
    window.setTimeout(() => this.focusFirstTransferControl(), 0);
  }

  /** Record an acknowledgement for a specific external route */
  acknowledgeRoute(routeId: string, event: Event): void {
    const checkbox = event.currentTarget as HTMLInputElement;
    this.routeAcknowledgements[routeId] = checkbox.checked;
  }

  /** Whether every newly enabled or redirected external route is acknowledged */
  canApplySettingsImport(): boolean {
    return !!this.transferReview
      && this.transferReview.changes.length > 0
      && this.transferReview.routeChanges.every(route => this.routeAcknowledgements[route.id] === true);
  }

  /** Apply only the values shown in the review; profile saving remains separate */
  applySettingsImport(): void {
    if (!this.transferReview || !this.transferBaseSettings) return;
    if (this.settings.settings() !== this.transferBaseSettings) {
      this.cancelReview();
      this.transferError = 'Settings changed during review. Review the preset again against the current settings.';
      return;
    }
    if (!this.canApplySettingsImport()) return;

    const name = this.reviewPreset?.name ?? 'preset';
    this.settings.update(this.transferReview.settings);
    this.transferReview = null;
    this.transferBaseSettings = null;
    this.reviewPreset = null;
    this.routeAcknowledgements = {};
    this.transferApplied = true;
    this.presetNotice = `"${name}" is active now. Use Save in Settings separately to store it for this device profile.`;
    window.setTimeout(() => this.focusFirstTransferControl(), 0);
  }

  /** Return changed settings grouped by the existing Settings sections */
  get transferChangeGroups(): { name: SettingChange['group']; changes: SettingChange[] }[] {
    if (!this.transferReview) return [];
    const groups: SettingChange['group'][] = ['Inputs', 'Outputs', 'Keying and encoder', 'Other'];
    return groups
      .map(name => ({
        name,
        changes: this.transferReview?.changes.filter(change => change.group === name) ?? [],
      }))
      .filter(group => group.changes.length > 0);
  }

  /** Describe a route destination without exposing any RTDB secret */
  describeRouteChange(route: ExternalRouteChange): string {
    const settings = this.transferReview?.settings;
    if (!settings) return route.type;

    if (route.id === 'opto') {
      const device = this.devices.outputDevices().find(item => item.deviceId === settings.optoOutputDeviceId);
      return `${device?.label || 'Unverified audio device'}, ${settings.optoOutputChannel} channel; forwards ${settings.optoForward.toUpperCase()}`;
    }
    if (route.id.startsWith('serial-')) {
      const isInput = route.id.startsWith('serial-input-');
      const index = Number(route.id.slice(isInput ? 'serial-input-'.length : 'serial-'.length));
      if (isInput) {
        const mapping = settings.serialInputMappings[index];
        const port = this.serialInput.ports()[mapping?.portIndex];
        const label = port ? this.serialInput.portLabel(port) : 'unavailable serial port';
        return `${label}, port index ${mapping?.portIndex ?? 'unassigned'}, ${mapping?.pin?.toUpperCase() ?? 'signal unavailable'}${mapping?.mode === 'paddle' ? ` and ${mapping.dahPin?.toUpperCase() ?? 'signal unavailable'}` : ''}`;
      }
      const mapping = settings.serialOutputMappings[index];
      const port = this.serialOutput.ports()[mapping?.portIndex];
      const label = port ? this.serialOutput.portLabel(port) : 'unavailable serial port';
      return `${label}, port index ${mapping?.portIndex ?? 'unassigned'}, ${mapping?.pin?.toUpperCase() ?? 'pin unavailable'}; forwards ${mapping?.forward?.toUpperCase() ?? 'unknown'}`;
    }
    if (route.id === 'winkeyer') {
      const port = this.winkeyerOutput.ports()[settings.winkeyerPortIndex];
      const label = port ? this.winkeyerOutput.portLabel(port) : 'unavailable serial port';
      return `${label}, port index ${settings.winkeyerPortIndex}; forwards ${settings.winkeyerForward.toUpperCase()}`;
    }
    if (route.id.startsWith('midi-')) {
      const isInput = route.id.startsWith('midi-input-');
      const index = Number(route.id.slice(isInput ? 'midi-input-'.length : 'midi-'.length));
      if (isInput) {
        const mapping = settings.midiInputMappings[index];
        const device = this.midiInput.midiInputs().find(item => item.id === mapping?.deviceId);
        return `${device?.name || 'unverified MIDI device'}, channel ${mapping?.channel ?? 'unknown'}${mapping?.mode === 'paddle' ? `, notes ${mapping.value}/${mapping.dahValue}` : `, note ${mapping?.value ?? 'unknown'}`}`;
      }
      const mapping = settings.midiOutputMappings[index];
      const device = this.midiOutput.midiOutputs().find(item => item.id === mapping?.deviceId);
      return `${device?.name || 'unverified MIDI device'}, channel ${mapping?.channel ?? 'unknown'}; forwards ${mapping?.forward?.toUpperCase() ?? 'unknown'}`;
    }
    if (route.id === 'rtdb-input') {
      return `Firebase RTDB channel "${settings.rtdbInputChannelName}"`;
    }
    if (route.id === 'rtdb-output') {
      return `Firebase RTDB channel "${settings.rtdbOutputChannelName}", forwards ${settings.rtdbOutputForward.toUpperCase()}`;
    }
    return route.type;
  }

  /** Format a setting value for the before/after review */
  formatSettingValue(change: SettingChange, value: unknown): string {
    if (typeof value === 'boolean') return value ? 'On' : 'Off';
    if (change.field.endsWith('DeviceId') && typeof value === 'string') {
      if (value === 'default') return 'System Default';
      return this.deviceName(value);
    }
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    return JSON.stringify(this.formatReviewValue(value), null, 2);
  }

  /**
   * Before/after text for a review entry. Structured values show only the
   * parts that differ; unchanged object fields are omitted and unchanged array items become an ellipsis.
   */
  changedValues(change: SettingChange): { before: string; after: string; inline: boolean } {
    if (typeof change.before === 'object' && change.before !== null
        && typeof change.after === 'object' && change.after !== null) {
      const [before, after] = this.diffValues(change.before, change.after);
      return {
        before: JSON.stringify(this.formatReviewValue(before), null, 2),
        after: JSON.stringify(this.formatReviewValue(after), null, 2),
        inline: false,
      };
    }
    return {
      before: this.formatSettingValue(change, change.before),
      after: this.formatSettingValue(change, change.after),
      inline: true,
    };
  }

  /** Apply a concise human-readable label to an AppSettings key */
  settingLabel(field: string): string {
    const acronyms: Record<string, string> = {
      cw: 'CW',
      id: 'ID',
      midi: 'MIDI',
      opto: 'Optocoupler',
      rtdb: 'RTDB',
      rx: 'RX',
      tx: 'TX',
      winkeyer: 'WinKeyer',
      wpm: 'WPM',
    };
    return field
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/\b(cw|id|midi|opto|rtdb|rx|tx|winkeyer|wpm)\b/gi, term => acronyms[term.toLowerCase()]);
  }

  private clearMessages(): void {
    this.transferError = '';
    this.presetNotice = '';
    this.transferApplied = false;
    this.deletePresetId = null;
    this.updatePresetId = null;
  }

  private resetPresetState(): void {
    this.presetMenuId = null;
    this.clearMessages();
    this.nameForm = null;
    this.pendingImport = null;
    this.transferReview = null;
    this.transferBaseSettings = null;
    this.reviewPreset = null;
    this.routeAcknowledgements = {};
  }

  private focusNameInput(): void {
    window.setTimeout(() => {
      document.querySelector<HTMLInputElement>('.settings-transfer-dialog .preset-name-input')?.focus();
    }, 0);
  }

  private getSnapshotDevices(): SettingsSnapshotDevices {
    return {
      audioInputs: this.devices.inputDevices(),
      audioOutputs: this.devices.outputDevices(),
      audioLabelsAvailable: this.devices.hasPermission(),
      midiInputs: this.midiInput.midiInputs(),
      midiOutputs: this.midiOutput.midiOutputs(),
      serialInputPorts: this.serialInput.ports().map(port => this.serialInput.portLabel(port)),
      serialOutputPorts: this.serialOutput.ports().map(port => this.serialOutput.portLabel(port)),
      winkeyerPorts: this.winkeyerOutput.ports().map(port => this.winkeyerOutput.portLabel(port)),
    };
  }

  private focusFirstTransferControl(): void {
    const dialog = this.settingsTransferTrigger
      ?.closest('app-settings-modal')
      ?.querySelector<HTMLElement>('.settings-transfer-dialog');
    dialog?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
  }

  private diffValues(a: unknown, b: unknown): [unknown, unknown] {
    if (JSON.stringify(a) === JSON.stringify(b)) return ['…', '…'];
    if (Array.isArray(a) && Array.isArray(b)) {
      const left: unknown[] = [];
      const right: unknown[] = [];
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (i >= a.length) right.push(b[i]);
        else if (i >= b.length) left.push(a[i]);
        else {
          const [x, y] = this.diffValues(a[i], b[i]);
          left.push(x);
          right.push(y);
        }
      }
      return [left, right];
    }
    if (isRecord(a) && isRecord(b)) {
      const left: Record<string, unknown> = {};
      const right: Record<string, unknown> = {};
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (JSON.stringify(a[key]) === JSON.stringify(b[key])) {
          continue;
        }
        if (key in a && key in b) {
          [left[key], right[key]] = this.diffValues(a[key], b[key]);
        } else if (key in a) {
          left[key] = a[key];
        } else {
          right[key] = b[key];
        }
      }
      return [left, right];
    }
    return [a, b];
  }

  private formatReviewValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(item => this.formatReviewValue(item));
    if (!isRecord(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (key === 'deviceId' && typeof item === 'string') return [key, this.deviceName(item)];
      if (key === 'portIndex' && typeof item === 'number') return [key, this.serialPortName(item)];
      return [key, this.formatReviewValue(item)];
    }));
  }

  private deviceName(id: string): string {
    const audio = [...this.devices.inputDevices(), ...this.devices.outputDevices()]
      .find(device => device.deviceId === id);
    const midi = [...this.midiInput.midiInputs(), ...this.midiOutput.midiOutputs()]
      .find(device => device.id === id);
    return audio?.label ?? midi?.name ?? 'Unverified device';
  }

  private serialPortName(index: number): string {
    if (index < 0) return 'Unassigned';
    return `Port index ${index} (source hint; not portable)`;
  }

  // ---- Device refresh ----

  /**
   * Request microphone permission, enumerate audio devices, and show
   * the scan results overlay. If the device fingerprint changed, the
   * settings profile for the new configuration is loaded automatically.
   */
  async onRefreshDevices(): Promise<void> {
    this.scanResultsTrigger =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousFp = this.settings.currentFingerprint();
    await this.devices.requestAndEnumerate();
    const fp = this.devices.computeFingerprint();
    if (fp && fp !== previousFp) {
      this.settings.loadForFingerprint(
        fp,
        this.devices.inputDevices(),
        this.devices.outputDevices()
      );
    }
    this.scanResultInputs = this.devices.inputDevices().map(d => ({ label: d.label }));
    this.scanResultOutputs = this.devices.outputDevices().map(d => ({ label: d.label }));
    this.scanProfileChanged = !!(fp && fp !== previousFp);
    this.showScanResults = true;
    window.setTimeout(() => {
      if (this.scanDialog) focusDialog(this.scanDialog.nativeElement);
    }, 0);
  }

  /** Dismiss the scan results overlay */
  dismissScanResults(): void {
    this.showScanResults = false;
    window.setTimeout(() => restoreDialogFocus(this.scanResultsTrigger), 0);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
