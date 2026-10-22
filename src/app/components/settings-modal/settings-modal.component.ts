/**
 * Morse Code Studio
 */

import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppSettings, SettingsSaveResult, SettingsService, isTouchDevice } from '../../services/settings.service';
import { AudioDeviceService } from '../../services/audio-device.service';
import { FirebaseRtdbService } from '../../services/firebase-rtdb.service';
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
} from '../../services/settings-transfer';
import { PresetService } from '../../services/preset.service';
import {
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
  SettingsTransferDevices,
} from '../../services/settings-transfer-review';
import { SettingsInputsTabComponent } from './settings-inputs-tab/settings-inputs-tab.component';
import { SettingsOutputsTabComponent } from './settings-outputs-tab/settings-outputs-tab.component';
import { SettingsOtherTabComponent } from './settings-other-tab/settings-other-tab.component';

/**
 * Settings modal component — modal chrome and tab navigation.
 *
 * Orchestrates the three settings tab child components
 * ({@link SettingsInputsTabComponent}, {@link SettingsOutputsTabComponent},
 * {@link SettingsOtherTabComponent}) within a modal overlay. Handles:
 *
 *  - Tab switching with swipe gesture support
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
    ConfirmDialogComponent,
    SettingsInputsTabComponent,
    SettingsOutputsTabComponent,
    SettingsOtherTabComponent,
  ],
  templateUrl: './settings-modal.component.html',
  styleUrls: ['./settings-modal.component.css'],
})
export class SettingsModalComponent {
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

  // ---- UI state ----

  /** Currently active settings tab */
  settingsTab: 'inputs' | 'outputs' | 'other' = 'inputs';

  /** Whether the reset confirmation dialog is visible */
  showResetConfirm = false;

  /** Whether the scan results overlay is visible */
  showScanResults = false;

  /** Whether a save result dialog is visible */
  showSaveResult = false;

  /** Whether the presets dialog is visible */
  showPresets = false;

  /** Maximum characters in a preset name */
  readonly presetNameMaxLength = PRESET_NAME_MAX_LENGTH;

  /** Error shown in the presets dialog */
  transferError = '';

  /** Confirmation shown in the presets dialog */
  presetNotice = '';

  /** Name entry for saving, renaming, duplicating, or naming an imported file */
  nameForm: { mode: 'save' | 'rename' | 'duplicate' | 'import'; id?: string; value: string } | null = null;

  /** Preset whose actions menu is open */
  presetMenuId: string | null = null;

  /** Fixed position of the open actions menu */
  presetMenuPos: { top: number | null; bottom: number | null; right: number } = { top: 0, bottom: null, right: 0 };

  /** Preset awaiting overwrite confirmation */
  updatePresetId: string | null = null;

  /** Preset awaiting delete confirmation */
  deletePresetId: string | null = null;

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

  // ---- Swipe gesture state ----
  private touchStartX = 0;
  private touchStartY = 0;
  private readonly isTouchDevice = isTouchDevice();

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
  ) {}

  /** Close the settings modal */
  close(): void {
    this.closed.emit();
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

  // ---- Swipe gesture for tab navigation ----

  /** Tab order used for cycling */
  private readonly tabOrder: ('inputs' | 'outputs' | 'other')[] = ['inputs', 'outputs', 'other'];

  /** Record the starting touch position */
  onTabContentTouchStart(event: TouchEvent): void {
    if (!this.isTouchDevice) return;
    const touch = event.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
  }

  /**
   * Detect a horizontal swipe and switch tabs.
   * Requires a minimum 60 px horizontal distance and the swipe must
   * be more horizontal than vertical to avoid triggering on scrolls.
   */
  onTabContentTouchEnd(event: TouchEvent): void {
    if (!this.isTouchDevice) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - this.touchStartX;
    const dy = touch.clientY - this.touchStartY;

    // Only act if the gesture is predominantly horizontal
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;

    if (dx < 0) {
      this.nextTab();   // swipe left → next tab
    } else {
      this.prevTab();   // swipe right → previous tab
    }
  }

  /** Move to the next tab (Inputs → Outputs → Other → Inputs) */
  private nextTab(): void {
    const idx = this.tabOrder.indexOf(this.settingsTab);
    this.settingsTab = this.tabOrder[(idx + 1) % this.tabOrder.length];
  }

  /** Move to the previous tab (Other → Outputs → Inputs → Other) */
  private prevTab(): void {
    const idx = this.tabOrder.indexOf(this.settingsTab);
    this.settingsTab = this.tabOrder[(idx - 1 + this.tabOrder.length) % this.tabOrder.length];
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
  openSettingsTransfer(event: Event): void {
    this.settingsTransferTrigger = event.currentTarget as HTMLButtonElement;
    this.presets.reload();
    this.resetPresetState();
    this.showPresets = true;
    window.setTimeout(() => this.focusFirstTransferControl(), 0);
  }

  /** Close the presets dialog without applying anything */
  closeSettingsTransfer(): void {
    this.showPresets = false;
    this.closePresetMenu();
    this.resetPresetState();
    window.setTimeout(() => this.settingsTransferTrigger?.focus(), 0);
  }

  /** Keep keyboard focus inside the transfer dialog and support Escape to close */
  onSettingsTransferKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.presetMenuId) {
        this.closePresetMenu(true);
        return;
      }
      this.closeSettingsTransfer();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = event.currentTarget as HTMLElement;
    if (!dialog) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]):not([type="file"])'),
    ).filter(element => !element.hasAttribute('hidden'));
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (!dialog.contains(active)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
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
    else if (action === 'export') this.exportPreset(preset);
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
  }

  deleteConfirmedPreset(): void {
    const id = this.deletePresetId;
    this.deletePresetId = null;
    if (!id) return;
    const result = this.presets.remove(id);
    if (result.ok) this.presetNotice = `Deleted "${result.preset.name}".`;
    else this.transferError = result.error;
  }

  /** Download one preset as a versioned local JSON file, excluding RTDB secrets */
  exportPreset(preset: SettingsPreset): void {
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
      link.download = presetFileName(preset.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      this.presetNotice = `Exported "${preset.name}" to a local file. It contains no RTDB secrets.`;
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
      this.getTransferDevices(),
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
    this.presetNotice = `"${name}" is active now. Use Save Settings separately to store it for this device profile.`;
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

  private getTransferDevices(): SettingsTransferDevices {
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
  }

  /** Dismiss the scan results overlay */
  dismissScanResults(): void {
    this.showScanResults = false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
