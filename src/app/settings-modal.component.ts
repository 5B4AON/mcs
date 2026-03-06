/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Component, EventEmitter, Input, OnInit, OnDestroy, Output, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { SettingsService, AppSettings, MouseButtonAction, ProsignAction, ProsignActionEntry, EmojiMapping } from './services/settings.service';
import { AudioDeviceService } from './services/audio-device.service';
import { AudioInputService } from './services/audio-input.service';
import { AudioOutputService } from './services/audio-output.service';
import { CwInputService, CwLevelEvent } from './services/cw-input.service';
import { SerialKeyOutputService } from './services/serial-key-output.service';
import { WinkeyerOutputService } from './services/winkeyer-output.service';
import { FirebaseRtdbService } from './services/firebase-rtdb.service';
import { MidiInputService, midiNoteName } from './services/midi-input.service';
import { MidiOutputService, midiOutputNoteName } from './services/midi-output.service';
import { WakeLockService } from './services/wake-lock.service';
import { ConfirmDialogComponent } from './confirm-dialog.component';
import { EmojiPickerComponent } from './emoji-picker.component';

/**
 * Settings modal component.
 *
 * Provides the full settings UI in a modal overlay with Inputs/Outputs tabs,
 * collapsible card sections with toggle switches, calibration controls,
 * and device management.
 */
@Component({
  selector: 'app-settings-modal',
  standalone: true,
  imports: [FormsModule, ConfirmDialogComponent, EmojiPickerComponent],
  templateUrl: './settings-modal.component.html',
  styleUrls: ['./settings-modal.component.css'],
})
export class SettingsModalComponent implements OnInit, OnDestroy {
  /** Whether audio contexts are running (controls test/calibration buttons) */
  @Input() audioRunning = false;

  /** Emitted when the user closes the settings modal */
  @Output() closed = new EventEmitter<void>();

  // ---- UI state ----
  settingsTab: 'inputs' | 'outputs' | 'other' = 'inputs';
  expandedSections: Record<string, boolean> = {};
  showResetConfirm = false;
  showScanResults = false;
  scanResultInputs: { label: string }[] = [];
  scanResultOutputs: { label: string }[] = [];
  scanProfileChanged = false;

  // ---- Swipe gesture state ----
  private touchStartX = 0;
  private touchStartY = 0;

  /** Whether the browser supports the Web Serial API */
  readonly webSerialSupported = 'serial' in navigator;

  /** Whether the device is running Android (serial API exists but USB-serial typically fails) */
  readonly isAndroid = /android/i.test(navigator.userAgent);

  // ---- Calibration state ----
  calibrating: 'open' | 'closed' | null = null;
  calibOpenRms: number | null = null;
  calibClosedRms: number | null = null;

  // ---- CW level tracking (for auto-threshold display) ----
  cwNoiseFloor = 0;
  cwSignalPeak = 0;
  cwThreshold = 0;

  // ---- MIDI capture state ----
  /** Which MIDI setting is currently being captured (null = not capturing) */
  midiCapturing: string | null = null;
  /** MIDI channel numbers 1-16 for the channel select dropdown */
  readonly midiChannels = Array.from({ length: 16 }, (_, i) => i + 1);

  private subs: Subscription[] = [];

  /** Debounce timer for RTDB input restart on text field changes */
  private rtdbInputDebounce: ReturnType<typeof setTimeout> | null = null;
  /** Debounce timer for RTDB output restart on text field changes */
  private rtdbOutputDebounce: ReturnType<typeof setTimeout> | null = null;

  /** Ordered list of prosign keys for the Prosign Actions card */
  readonly prosignKeys = ['<AR>', '<BT>', '<HH>'];

  /** Available action choices for prosign action dropdowns */
  readonly prosignActionOptions: { value: ProsignAction; label: string }[] = [
    { value: 'newLine', label: 'New Line' },
    { value: 'newParagraph', label: 'New Paragraph' },
    { value: 'clearLastWord', label: 'Clear Last Word' },
    { value: 'clearLine', label: 'Clear Line' },
    { value: 'clearScreen', label: 'Clear Screen' },
  ];

  /**
   * Conflict: CW audio input uses the same mic device as pilot tone detection.
   */
  readonly cwInputConflict = computed<string | null>(() => {
    const s = this.settings.settings();
    if (!s.micInputEnabled) return null;
    const norm = (id: string) => id || 'default';
    if (norm(s.cwInputDeviceId) === norm(s.inputDeviceId)) {
      return 'CW audio input and Pilot tone detection both use the same mic device. Use a different device for CW input, or disable one.';
    }
    return null;
  });

  /**
   * Conflict: multiple mouse buttons mapped to the same non-none action.
   */
  readonly mouseActionConflict = computed<string | null>(() => {
    const s = this.settings.settings();
    const actions: MouseButtonAction[] = [s.mouseLeftAction, s.mouseMiddleAction, s.mouseRightAction];
    const nonNone = actions.filter(a => a !== 'none');
    const unique = new Set(nonNone);
    if (nonNone.length !== unique.size) {
      return 'Multiple mouse buttons are mapped to the same action. Each action should be assigned to only one button.';
    }
    return null;
  });

  constructor(
    public settings: SettingsService,
    public devices: AudioDeviceService,
    public audioInput: AudioInputService,
    public audioOutput: AudioOutputService,
    public cwInput: CwInputService,
    public serialOutput: SerialKeyOutputService,
    public winkeyerOutput: WinkeyerOutputService,
    public rtdbService: FirebaseRtdbService,
    public midiInput: MidiInputService,
    public midiOutput: MidiOutputService,
    public wakeLock: WakeLockService,
  ) {}

  ngOnInit(): void {
    // CW level tracking for settings display
    this.subs.push(
      this.cwInput.level$.subscribe((lvl: CwLevelEvent) => {
        this.cwNoiseFloor = lvl.noiseFloor;
        this.cwSignalPeak = lvl.signalPeak;
        this.cwThreshold = lvl.threshold;
      })
    );

    // Calibration results
    this.subs.push(
      this.audioInput.calibration$.subscribe(result => {
        if (result.state === 'open') {
          this.calibOpenRms = result.rms;
        } else if (result.state === 'closed') {
          this.calibClosedRms = result.rms;
        }
        this.calibrating = null;
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    if (this.rtdbInputDebounce) clearTimeout(this.rtdbInputDebounce);
    if (this.rtdbOutputDebounce) clearTimeout(this.rtdbOutputDebounce);
  }

  close(): void {
    this.expandedSections = {};
    this.closed.emit();
  }

  /** Show and handle the custom reset-confirmation dialog */
  confirmReset(): void {
    this.showResetConfirm = true;
  }

  onResetConfirmed(confirmed: boolean): void {
    this.showResetConfirm = false;
    if (confirmed) {
      this.settings.resetToDefaults();

      // Stop any active RTDB connections since defaults have both disabled
      this.rtdbService.stopInput();
      this.rtdbService.stopOutput();
    }
  }

  // ---- Section expand/collapse ----

  toggleSection(key: string): void {
    this.expandedSections[key] = !this.expandedSections[key];
  }

  isSectionExpanded(key: string): boolean {
    return !!this.expandedSections[key];
  }

  // ---- Settings change handlers ----

  onSettingChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    let value: string | number = el.value;
    if (el.type === 'number' || el.type === 'range') {
      value = parseFloat(el.value);
    }
    this.settings.update({ [key]: value } as Partial<AppSettings>);
  }

  onBoolChange(key: keyof AppSettings, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ [key]: checked } as Partial<AppSettings>);
  }

  onWakeLockChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ wakeLockEnabled: checked });
    this.wakeLock.onSettingChanged(checked);
  }

  onInputParamChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    const value = parseFloat(el.value);
    this.settings.update({ [key]: value } as Partial<AppSettings>);
    this.audioInput.updateParams();
  }

  onInputInvertChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ inputInvert: checked });
    this.audioInput.updateParams();
  }

  onCwParamChange(key: keyof AppSettings, event: Event): void {
    const el = event.target as HTMLInputElement;
    let value: any;
    if (el.type === 'checkbox') {
      value = (el as any).checked;
    } else if (el.tagName === 'SELECT' || isNaN(parseFloat(el.value))) {
      value = el.value;
    } else {
      value = parseFloat(el.value);
    }
    this.settings.update({ [key]: value } as Partial<AppSettings>);
    this.cwInput.updateParams();
  }

  async onMicEnabledChange(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ micInputEnabled: checked });
    if (this.audioRunning) {
      if (checked) {
        await this.audioInput.start();
        await this.audioOutput.startPilot();
      } else {
        await this.audioInput.stop();
        await this.audioOutput.stopPilot();
      }
    }
  }

  async onCwEnabledChange(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ cwInputEnabled: checked });
    if (this.audioRunning) {
      if (checked) {
        await this.cwInput.start();
      } else {
        await this.cwInput.stop();
      }
    }
  }

  async onSerialPortChange(event: Event): Promise<void> {
    const idx = parseInt((event.target as HTMLSelectElement).value, 10);
    this.settings.update({ serialPortIndex: idx });
    await this.serialOutput.close();
    if (idx >= 0) {
      await this.serialOutput.open(idx);
    }
  }

  async onSerialEnabledChange(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked && (!this.webSerialSupported || this.isAndroid)) {
      (event.target as HTMLInputElement).checked = false;
      return;
    }
    this.settings.update({ serialEnabled: checked });
    if (checked) {
      const idx = this.settings.settings().serialPortIndex;
      if (idx >= 0 && !this.serialOutput.connected()) {
        await this.serialOutput.open(idx);
      }
    } else {
      await this.serialOutput.close();
    }
  }

  // ---- WinKeyer handlers ----

  async onWinkeyerPortChange(event: Event): Promise<void> {
    const idx = parseInt((event.target as HTMLSelectElement).value, 10);
    this.settings.update({ winkeyerPortIndex: idx });
    await this.winkeyerOutput.close();
    if (idx >= 0) {
      await this.winkeyerOutput.open(idx);
    }
  }

  async onWinkeyerEnabledChange(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked && (!this.webSerialSupported || this.isAndroid)) {
      (event.target as HTMLInputElement).checked = false;
      return;
    }
    this.settings.update({ winkeyerEnabled: checked });
    if (checked) {
      const idx = this.settings.settings().winkeyerPortIndex;
      if (idx >= 0 && !this.winkeyerOutput.connected()) {
        await this.winkeyerOutput.open(idx);
      }
    } else {
      await this.winkeyerOutput.close();
    }
  }

  async onWinkeyerWpmChange(event: Event): Promise<void> {
    const wpm = parseInt((event.target as HTMLInputElement).value, 10);
    if (isNaN(wpm)) return;
    this.settings.update({ winkeyerWpm: wpm });
    if (this.winkeyerOutput.connected()) {
      await this.winkeyerOutput.setSpeed(wpm);
    }
  }

  // ---- Calibration ----

  calibrateOpen(): void {
    this.calibrating = 'open';
    this.audioInput.calibrate('open');
  }

  calibrateClosed(): void {
    this.calibrating = 'closed';
    this.audioInput.calibrate('closed');
  }

  applyCalibration(): void {
    if (this.calibOpenRms !== null && this.calibClosedRms !== null) {
      const threshold = (this.calibOpenRms + this.calibClosedRms) / 2;
      this.settings.update({ inputThreshold: Math.round(threshold * 10000) / 10000 });
      this.audioInput.updateParams();
    }
  }

  // ---- Key capture ----

  onCaptureKeyDown(event: KeyboardEvent, settingKey: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.settings.update({ [settingKey]: event.code } as Partial<AppSettings>);
    (event.target as HTMLElement).blur();
  }

  // ---- Mouse action change ----

  onMouseActionChange(key: keyof AppSettings, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.settings.update({ [key]: value } as Partial<AppSettings>);
  }

  onTextSettingChange(key: keyof AppSettings, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.settings.update({ [key]: value } as Partial<AppSettings>);

    // If an RTDB-related field changed while the feature is enabled,
    // automatically restart the connection with the new values.
    // Debounce to avoid rapid reconnections while the user is typing.
    const rtdbInputKeys: (keyof AppSettings)[] = ['rtdbInputChannelName', 'rtdbInputChannelSecret'];
    const rtdbOutputKeys: (keyof AppSettings)[] = ['rtdbOutputChannelName', 'rtdbOutputChannelSecret', 'rtdbOutputUserName'];
    if (rtdbInputKeys.includes(key) && this.settings.settings().rtdbInputEnabled) {
      if (this.rtdbInputDebounce) clearTimeout(this.rtdbInputDebounce);
      this.rtdbInputDebounce = setTimeout(() => this.rtdbService.startInput(), 600);
    }
    if (rtdbOutputKeys.includes(key) && this.settings.settings().rtdbOutputEnabled) {
      if (this.rtdbOutputDebounce) clearTimeout(this.rtdbOutputDebounce);
      this.rtdbOutputDebounce = setTimeout(() => this.rtdbService.startOutput(), 600);
    }
  }

  // ---- Firebase RTDB handlers ----

  onRtdbInputEnabledChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked && !navigator.onLine) {
      (event.target as HTMLInputElement).checked = false;
      this.rtdbService.lastError.set('Cannot enable Firebase RTDB input — you are offline.');
      return;
    }
    this.settings.update({ rtdbInputEnabled: checked });
    if (checked) {
      this.rtdbService.startInput();
    } else {
      this.rtdbService.stopInput();
    }
  }

  onRtdbOutputEnabledChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked && !navigator.onLine) {
      (event.target as HTMLInputElement).checked = false;
      this.rtdbService.lastError.set('Cannot enable Firebase RTDB output — you are offline.');
      return;
    }
    this.settings.update({ rtdbOutputEnabled: checked });
    if (checked) {
      this.rtdbService.startOutput();
    } else {
      this.rtdbService.stopOutput();
    }
  }

  // ---- WPM adjustments ----

  adjustWpm(key: 'keyerWpm' | 'rxDecoderWpm' | 'txDecoderWpm', delta: number): void {
    const v = Math.max(5, Math.min(50, (this.settings.settings() as any)[key] + delta));
    this.settings.update({ [key]: v } as Partial<AppSettings>);
    this.saveSettings();
  }

  // ---- Device refresh ----

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

  // ---- Swipe gesture for tab navigation ----

  /** Tab order used for cycling */
  private readonly tabOrder: ('inputs' | 'outputs' | 'other')[] = ['inputs', 'outputs', 'other'];

  /** Record the starting touch position */
  onTabContentTouchStart(event: TouchEvent): void {
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

  saveSettings(): void {
    this.settings.save(
      this.devices.inputDevices(),
      this.devices.outputDevices()
    );
  }

  // ---- MIDI handlers ----

  async onMidiEnabledChange(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked && !this.midiInput.supported) {
      (event.target as HTMLInputElement).checked = false;
      return;
    }
    this.settings.update({ midiInputEnabled: checked });
    if (checked) {
      await this.midiInput.start();
    } else {
      this.midiInput.shutdown();
    }
  }

  onMidiDeviceChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.settings.update({ midiInputDeviceId: value });
    this.midiInput.reattach();
  }

  /**
   * Start MIDI learn/capture mode for the given setting key.
   * When the user presses a MIDI key, the note number is stored
   * in the corresponding setting (similar to keyboard key capture).
   */
  onMidiCapture(settingKey: string): void {
    // If already capturing this key, cancel
    if (this.midiCapturing === settingKey) {
      this.midiInput.cancelLearn();
      this.midiCapturing = null;
      return;
    }

    // Ensure MIDI access is started for capture even if not yet enabled
    if (!this.midiInput.connected()) {
      this.midiInput.start().then(() => this.beginCapture(settingKey));
    } else {
      this.beginCapture(settingKey);
    }
  }

  private beginCapture(settingKey: string): void {
    this.midiCapturing = settingKey;
    this.midiInput.startLearn((note: number) => {
      this.settings.update({ [settingKey]: note } as Partial<AppSettings>);
      this.midiCapturing = null;
    });
  }

  /** Clear a MIDI note assignment */
  clearMidiNote(settingKey: string): void {
    this.settings.update({ [settingKey]: -1 } as Partial<AppSettings>);
  }

  /** Display a MIDI note number as a human-readable name */
  midiNoteDisplay(note: number): string {
    if (note < 0) return '(none)';
    return `${midiNoteName(note)} (${note})`;
  }

  /** Display a MIDI output note number as a human-readable name */
  midiOutputNoteDisplay(note: number): string {
    if (note < 0) return '(none)';
    return `${midiOutputNoteName(note)} (${note})`;
  }

  // ---- MIDI Output handlers ----

  /** Note names for the MIDI output note picker dropdowns */
  readonly noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  /** Octave range for MIDI output picker (-1 to 9) */
  readonly octaves = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  /** Whether to show the raw 0-127 input for each MIDI output note (vs note/octave picker) */
  midiOutputRawMode: Record<string, boolean> = {};

  /** Get note name index (0-11) from a MIDI note number */
  midiOutputNoteNameIndex(note: number): number {
    return note >= 0 ? note % 12 : 0;
  }

  /** Get octave from a MIDI note number */
  midiOutputNoteOctave(note: number): number {
    return note >= 0 ? Math.floor(note / 12) - 1 : 4;
  }

  /** Update a MIDI output note from the note name picker */
  onMidiOutputNoteNameChange(settingKey: string, event: Event): void {
    const nameIdx = parseInt((event.target as HTMLSelectElement).value, 10);
    const current = (this.settings.settings() as any)[settingKey] as number;
    const octave = current >= 0 ? Math.floor(current / 12) - 1 : 4;
    const note = (octave + 1) * 12 + nameIdx;
    if (note >= 0 && note <= 127) {
      this.settings.update({ [settingKey]: note } as Partial<AppSettings>);
    }
  }

  /** Update a MIDI output note from the octave picker */
  onMidiOutputOctaveChange(settingKey: string, event: Event): void {
    const octave = parseInt((event.target as HTMLSelectElement).value, 10);
    const current = (this.settings.settings() as any)[settingKey] as number;
    const nameIdx = current >= 0 ? current % 12 : 0;
    const note = (octave + 1) * 12 + nameIdx;
    if (note >= 0 && note <= 127) {
      this.settings.update({ [settingKey]: note } as Partial<AppSettings>);
    }
  }

  /** Update a MIDI output note from raw 0-127 input */
  onMidiOutputRawNoteChange(settingKey: string, event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value >= 0 && value <= 127) {
      this.settings.update({ [settingKey]: value } as Partial<AppSettings>);
    }
  }

  /** Toggle between note/octave picker and raw value for a MIDI output note */
  toggleMidiOutputRawMode(key: string): void {
    this.midiOutputRawMode[key] = !this.midiOutputRawMode[key];
  }

  async onMidiOutputEnabledChange(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked && !this.midiOutput.supported) {
      (event.target as HTMLInputElement).checked = false;
      return;
    }
    this.settings.update({ midiOutputEnabled: checked });
    if (checked) {
      await this.midiOutput.start();
    } else {
      this.midiOutput.shutdown();
    }
  }

  onMidiOutputDeviceChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.settings.update({ midiOutputDeviceId: value });
    this.midiOutput.reattach();
  }

  // ---- Prosign Actions handlers ----

  onProsignActionsEnabledChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ prosignActionsEnabled: checked });
  }

  onProsignEntryEnabledChange(key: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const actions = { ...this.settings.settings().prosignActions };
    actions[key] = { ...actions[key], enabled: checked };
    this.settings.update({ prosignActions: actions });
  }

  onProsignEntryActionChange(key: string, event: Event): void {
    const value = (event.target as HTMLSelectElement).value as ProsignAction;
    const actions = { ...this.settings.settings().prosignActions };
    actions[key] = { ...actions[key], action: value };
    this.settings.update({ prosignActions: actions });
  }

  // ---- Emoji handlers ----

  /** Index of the emoji mapping currently being edited, or -1 */
  emojiEditIndex = -1;
  /** Temporary match value while editing */
  emojiEditMatch = '';
  /** Temporary emoji value while editing */
  emojiEditEmoji = '';
  /** Temporary meaning value while editing */
  emojiEditMeaning = '';
  /** Validation error for the edit row */
  emojiEditError = '';
  /** Whether emoji picker modal is visible */
  showEmojiPicker = false;

  onEmojisEnabledChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.update({ emojisEnabled: checked });
  }

  onEmojiEntryEnabledChange(index: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const mappings = this.settings.settings().emojiMappings.map((m, i) =>
      i === index ? { ...m, enabled: checked } : m
    );
    this.settings.update({ emojiMappings: mappings });
  }

  emojiStartEdit(index: number): void {
    const m = this.settings.settings().emojiMappings[index];
    this.emojiEditIndex = index;
    this.emojiEditMatch = m.match;
    this.emojiEditEmoji = m.emoji;
    this.emojiEditMeaning = m.meaning ?? '';
    this.emojiEditError = '';
  }

  emojiCancelEdit(): void {
    this.emojiEditIndex = -1;
    this.emojiEditError = '';
  }

  emojiSaveEdit(): void {
    const match = this.emojiEditMatch.trim().toUpperCase();
    const emoji = this.emojiEditEmoji.trim();
    const meaning = this.emojiEditMeaning.trim();
    if (!match || !emoji) {
      this.emojiEditError = 'Both fields are required.';
      return;
    }
    // Check for duplicates (exclude current row)
    const mappings = this.settings.settings().emojiMappings;
    const dup = mappings.some((m, i) => i !== this.emojiEditIndex && m.match.toUpperCase() === match);
    if (dup) {
      this.emojiEditError = 'Duplicate match pattern.';
      return;
    }
    const updated = mappings.map((m, i) =>
      i === this.emojiEditIndex ? { ...m, match, emoji, meaning: meaning || undefined } : m
    );
    this.settings.update({ emojiMappings: updated });
    this.emojiEditIndex = -1;
    this.emojiEditError = '';
  }

  emojiAdd(): void {
    const mappings = [...this.settings.settings().emojiMappings];
    mappings.push({ enabled: true, match: '', emoji: '😊', meaning: '' });
    this.settings.update({ emojiMappings: mappings });
    // Immediately enter edit mode on the new row
    this.emojiStartEdit(mappings.length - 1);
  }

  emojiDelete(index: number): void {
    const mappings = this.settings.settings().emojiMappings.filter((_, i) => i !== index);
    this.settings.update({ emojiMappings: mappings });
    if (this.emojiEditIndex === index) {
      this.emojiEditIndex = -1;
    } else if (this.emojiEditIndex > index) {
      this.emojiEditIndex--;
    }
  }

  openEmojiPicker(): void {
    this.showEmojiPicker = true;
  }

  closeEmojiPicker(): void {
    this.showEmojiPicker = false;
  }

  onEmojiPickerSelected(emoji: string): void {
    this.emojiEditEmoji = emoji;
    this.showEmojiPicker = false;
  }
}
