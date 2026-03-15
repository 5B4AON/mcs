/**
 * Morse Code Studio
 */

import { Injectable, OnDestroy, NgZone, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { SettingsService, PaddleMode, DecoderSource, InputPath } from './settings.service';
import { MorseDecoderService } from './morse-decoder.service';
import { MidiOutputService } from './midi-output.service';
import { timingsFromWpm } from '../morse-table';


/**
 * MIDI note name lookup (scientific pitch notation).
 * Used to display human-friendly names like "C4" or "A#3" instead of raw note numbers.
 */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Convert a MIDI note number (0-127) to a human-readable name.
 * @example midiNoteName(60) → "C4"
 * @example midiNoteName(69) → "A4"
 */
export function midiNoteName(note: number): string {
  if (note < 0 || note > 127) return '—';
  const octave = Math.floor(note / 12) - 1;
  return `${NOTE_NAMES[note % 12]}${octave}`;
}

/**
 * Data captured during MIDI learn/capture mode.
 */
export interface MidiLearnResult {
  note: number;
  channel: number;
  deviceId: string;
  deviceName: string;
}

/**
 * Per-mapping iambic keyer state for MIDI paddle inputs.
 *
 * Each MIDI paddle mapping gets its own independent keyer instance
 * so multiple paddle mappings can operate simultaneously.
 */
interface MidiPaddleKeyerState {
  leftPaddleDown: boolean;
  rightPaddleDown: boolean;
  ditMemory: boolean;
  dahMemory: boolean;
  keyerTimeout: ReturnType<typeof setTimeout> | null;
  currentElement: 'dit' | 'dah' | null;
  lastElement: 'dit' | 'dah' | null;
  elementPlaying: boolean;
  keyerRunning: boolean;
  source: 'rx' | 'tx';
  name: string;
  color: string;
  path: InputPath;
}

/**
 * MIDI Input Service — maps MIDI note-on/note-off messages to keyer inputs.
 *
 * Use case: connect a MIDI pedal, keyboard, or controller to the computer.
 * Map specific MIDI notes to straight key, dit paddle, and dah paddle —
 * just like the keyboard keyer, but with physical MIDI hardware.
 *
 * Key advantage over keyboard/mouse input: MIDI events are delivered by the
 * Web MIDI API at the browser level, independent of DOM focus. This means
 * the keyer continues to work even when the app is in the background, another
 * window is focused, or the screen is locked / showing a screensaver.
 *
 * How it works:
 *  1. Requests Web MIDI access alongside the audio start (same user gesture
 *     covers both permissions — no separate prompt needed).
 *  2. Listens for note-on (0x90) and note-off (0x80) messages on the
 *     configured device and MIDI channel.
 *  3. Maps received notes to decoder inputs: straight key calls the decoder
 *     directly; paddle notes feed an independent iambic keyer built into
 *     this service. This gives MIDI input its own completely separate
 *     pipeline — no shared state with the keyboard/mouse/touch KeyerService.
 *  4. Supports a "learn" mode: the next MIDI note-on received is captured
 *     and reported back to the UI for assignment to a setting.
 *
 * Chromium-only: Web MIDI API is available in Chrome, Edge, and Opera.
 * Firefox and Safari do not support it.
 */
@Injectable({ providedIn: 'root' })
export class MidiInputService implements OnDestroy {
  /** Whether Web MIDI API is available in this browser */
  readonly supported = 'requestMIDIAccess' in navigator;

  /** Available MIDI input devices (populated after start) */
  readonly midiInputs = signal<{ id: string; name: string }[]>([]);

  /** True when MIDI access has been granted and we're listening */
  readonly connected = signal(false);

  /** Last error message (permission denied, etc.) */
  readonly lastError = signal('');

  /** Emits captured note during learn mode */
  readonly learnedNote$ = new Subject<MidiLearnResult>();

  private midiAccess: MIDIAccess | null = null;
  private started = false;

  /** Guards against concurrent start() calls */
  private startingPromise: Promise<void> | null = null;

  /** Learn mode: when set, the next note-on is captured instead of acted on */
  private learnCallback: ((result: MidiLearnResult) => void) | null = null;

  /** Track which notes are currently held (to release on stop) */
  private activeNotes = new Map<number, { action: 'straightKey' | 'dit' | 'dah'; source: DecoderSource; name: string; color: string; mappingIndex: number }>();

  /**
   * Keep-alive timer — periodically re-attaches MIDI listeners and verifies
   * the connection is still alive. Browsers may throttle or freeze background
   * tabs, causing MIDI message handlers to be silently dropped. This timer
   * runs every 5 seconds to detect and recover from that condition.
   */
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Timer that clears MIDI output break-in after a word-gap of silence
   * from the remote party.  Reset on every MIDI input note-on; fires
   * when no further input activity is detected within one word gap.
   * @deprecated Break-in is no longer used — MIDI input during gaps is
   * allowed since each input has its own decoder pipeline.
   */
  private breakInClearTimer: ReturnType<typeof setTimeout> | null = null;

  // ---- Independent MIDI paddle keyer state (per mapping) ----
  // Each MIDI paddle mapping gets its own iambic keyer so multiple
  // paddle mappings can operate simultaneously without shared state.
  private midiPaddleKeyers = new Map<number, MidiPaddleKeyerState>();

  constructor(
    private settings: SettingsService,
    private decoder: MorseDecoderService,
    private zone: NgZone,
    private midiOutput: MidiOutputService,
  ) {}

  ngOnDestroy(): void {
    this.shutdown();
  }

  /**
   * Request MIDI access and start listening for messages.
   * Called when the user enables MIDI input in settings.
   */
  async start(): Promise<void> {
    if (!this.supported) {
      this.lastError.set('Web MIDI API is not supported in this browser. Use Chrome or Edge.');
      return;
    }
    if (this.started) return;

    // If another start() call is already in progress, wait for it instead of racing
    if (this.startingPromise) {
      await this.startingPromise;
      return;
    }

    this.startingPromise = this.doStart();
    try {
      await this.startingPromise;
    } finally {
      this.startingPromise = null;
    }
  }

  /** Internal start — only called from start() with concurrency guard. */
  private async doStart(): Promise<void> {
    try {
      // Request MIDI access — sysex not needed for note messages
      this.midiAccess = await (navigator as any).requestMIDIAccess({ sysex: false });
      this.started = true;
      this.lastError.set('');

      // Install state-change handler — handles hot-plug of MIDI devices
      this.installStateChangeHandler();

      // Enumerate whatever is already available
      this.refreshInputs();
      this.attachListeners();

      // Keep-alive: periodically re-attach listeners to prevent browser
      // throttling from silently dropping MIDI event handlers
      this.installKeepAlive();
    } catch (err: any) {
      const msg = err?.message || String(err);
      this.zone.run(() => {
        this.lastError.set(`MIDI access denied: ${msg}`);
        this.connected.set(false);
      });
    }
  }

  /**
   * Soft stop — release held notes but keep MIDI access alive.
   * Called when audio is stopped so the keyer isn't stuck in key-down,
   * but the MIDI connection (onstatechange, keep-alive) stays active
   * for instant reconnection when audio resumes.
   */
  stop(): void {
    this.releaseAll();
    this.learnCallback = null;
  }

  /**
   * Full shutdown — tear down everything including MIDI access.
   * Called only when the user explicitly disables MIDI input,
   * or when the service is destroyed.
   */
  shutdown(): void {
    if (!this.started) return;
    this.releaseAll();
    this.learnCallback = null;
    this.cancelBreakInClear();
    this.clearKeepAlive();

    if (this.midiAccess) {
      // Remove listeners from all inputs
      for (const input of this.midiAccess.inputs.values()) {
        input.onmidimessage = null;
      }
      this.midiAccess.onstatechange = null;
      this.midiAccess = null;
    }

    this.started = false;
    this.zone.run(() => {
      this.connected.set(false);
      this.midiInputs.set([]);
    });
  }

  /**
   * Enter learn mode: the next MIDI note-on will be captured and returned
   * via the callback instead of being processed as a keyer input.
   * Used by the settings UI for the "capture" / auto-detect buttons.
   */
  async startLearn(callback: (result: MidiLearnResult) => void): Promise<void> {
    this.learnCallback = callback;
    // Ensure MIDI access is available even when the card is disabled,
    // so the detect/capture button always works.
    if (!this.started) {
      await this.start();
    }
    this.attachListeners();
  }

  /** Cancel learn mode without capturing. */
  cancelLearn(): void {
    this.learnCallback = null;
    // Re-attach to restore mapping-based filtering
    if (this.started) this.attachListeners();
  }

  /** Whether we're currently in learn/capture mode */
  get isLearning(): boolean {
    return this.learnCallback !== null;
  }

  /** Re-attach listeners (e.g. after settings change). */
  reattach(): void {
    if (this.started) {
      this.attachListeners();
    }
  }

  /**
   * Enumerate available MIDI input devices without starting the full
   * listener pipeline. Used by the settings UI to populate device
   * dropdowns even when MIDI input is disabled.
   */
  async enumerateDevices(): Promise<void> {
    if (!this.supported) return;
    // If already started, devices are already populated
    if (this.started && this.midiAccess) {
      this.refreshInputs();
      return;
    }
    try {
      const access = await (navigator as any).requestMIDIAccess({ sysex: false });
      const inputs: { id: string; name: string }[] = [];
      for (const input of access.inputs.values()) {
        if (input.state === 'connected') {
          inputs.push({ id: input.id, name: input.name || `MIDI Input ${input.id}` });
        }
      }
      this.zone.run(() => this.midiInputs.set(inputs));
    } catch {
      // Silently ignore — the dropdown will just be empty
    }
  }

  /**
   * Install the onstatechange handler on the current MIDIAccess object.
   * Extracted into its own method so it can be reused after re-acquisition.
   */
  private installStateChangeHandler(): void {
    if (!this.midiAccess) return;
    this.midiAccess.onstatechange = () => {
      this.zone.run(() => this.refreshInputs());
      this.attachListeners();
      // Retry after short delays for ports that need time to settle
      // after a physical reconnection. Some browsers report the port
      // as 'connected' before it's actually ready to open.
      for (const delay of [500, 1500]) {
        setTimeout(() => {
          if (this.started && this.midiAccess) {
            this.zone.run(() => this.refreshInputs());
            this.attachListeners();
          }
        }, delay);
      }
    };
  }

  // ---- Internal ----

  /**
   * Populate the midiInputs signal from current MIDI access state.
   * Only includes devices whose state is 'connected' — disconnected devices
   * are excluded so the UI accurately reflects what's actually available.
   * Also updates the `connected` signal to reflect whether any devices exist.
   */
  private refreshInputs(): void {
    if (!this.midiAccess) return;
    const inputs: { id: string; name: string }[] = [];
    for (const input of this.midiAccess.inputs.values()) {
      if (input.state === 'connected') {
        inputs.push({ id: input.id, name: input.name || `MIDI Input ${input.id}` });
      }
    }
    this.midiInputs.set(inputs);
    this.connected.set(inputs.length > 0);
  }

  /**
   * Attach onmidimessage to all connected inputs that are referenced
   * by at least one enabled mapping (or all inputs if any mapping uses
   * 'any' device).
   *
   * Explicitly opens each port before assigning the message handler.
   * Per the Web MIDI spec, simply assigning `onmidimessage` should auto-open
   * the port, but in practice this is unreliable — especially after a browser
   * refresh, system sleep/wake, or device reconnection. Ports can remain in
   * `connection: "closed"` state and silently drop all messages. Calling
   * `input.open()` first guarantees the port is ready to receive data.
   */
  private attachListeners(): void {
    if (!this.midiAccess) return;
    const mappings = this.settings.settings().midiInputMappings.filter(m => m.enabled);
    const listenAll = mappings.some(m => !m.deviceId) || this.learnCallback !== null;
    const deviceIds = new Set(mappings.map(m => m.deviceId).filter(Boolean));

    for (const input of this.midiAccess.inputs.values()) {
      // Skip disconnected devices and devices that don't match any mapping
      if (input.state !== 'connected' || (!listenAll && !deviceIds.has(input.id))) {
        input.onmidimessage = null;
        continue;
      }

      // Assign handler synchronously so messages are captured immediately,
      // then explicitly open the port. Per spec, setting onmidimessage should
      // auto-open the port, but this is unreliable in practice. The explicit
      // open() ensures the port is ready; the synchronous handler prevents the
      // first message from being lost during the async open window.
      input.onmidimessage = (msg: MIDIMessageEvent) => this.onMessage(msg);
      input.open().catch(() => {
        // Port failed to open — keep-alive will retry in 5 seconds
        input.onmidimessage = null;
      });
    }
  }

  /** Process an incoming MIDI message */
  private onMessage(msg: MIDIMessageEvent): void {
    const data = msg.data;
    if (!data || data.length < 3) return;

    const status = data[0];
    const note = data[1];
    const velocity = data[2];

    // Extract message type and channel
    const type = status & 0xf0;
    const channel = (status & 0x0f) + 1; // MIDI channels are 1-based in UI

    // We only care about note-on (0x90) and note-off (0x80)
    // Note-on with velocity 0 is treated as note-off
    const isNoteOn = type === 0x90 && velocity > 0;
    const isNoteOff = type === 0x80 || (type === 0x90 && velocity === 0);

    if (!isNoteOn && !isNoteOff) return;

    // Learn mode: capture the note and return
    if (isNoteOn && this.learnCallback) {
      const cb = this.learnCallback;
      this.learnCallback = null;
      const target = msg.target as MIDIInput | null;
      const result: MidiLearnResult = {
        note,
        channel,
        deviceId: target?.id || '',
        deviceName: target?.name || 'Unknown',
      };
      // Restore mapping-based filtering now that learn mode is done
      this.attachListeners();
      this.zone.run(() => {
        cb(result);
        this.learnedNote$.next(result);
      });
      return;
    }

    // Normal mode: map note to keyer action
    if (!this.settings.settings().midiInputEnabled) return;

    // ======================================================================
    // Blanket isSending() suppression prevents physical bus echoes: when
    // the MIDI output sends ANY note, the common bus is energised and
    // hardware simultaneously mirrors the signal on the input.
    //
    // The check is moved INTO the per-mapping loop so that input mappings
    // that are explicitly configured as relay sources (referenced by at
    // least one output mapping's relayInputIndices) bypass the isSending
    // gate — the user has asserted those inputs are on separate hardware.
    //
    // Non-relay input mappings are still blanket-muted while ANY output
    // note is held, regardless of note number.
    // ======================================================================
    const sending = isNoteOn && this.midiOutput.isSending();

    // Note-off: use stored action state
    if (isNoteOff) {
      const active = this.activeNotes.get(note);
      if (!active) return;
      this.activeNotes.delete(note);
      switch (active.action) {
        case 'straightKey': {
          const skPath: InputPath = `midiStraightKey:${active.mappingIndex}`;
          this.zone.run(() => {
            this.decoder.onKeyUp(skPath, active.source, {
              fromMidi: true, name: active.name, color: active.color,
            });
          });
          break;
        }
        case 'dit':
          this.midiDitPaddleInput(false, active.source, active.mappingIndex, active.name, active.color);
          break;
        case 'dah':
          this.midiDahPaddleInput(false, active.source, active.mappingIndex, active.name, active.color);
          break;
      }
      return;
    }

    // Note-on: find matching mapping
    const deviceId = (msg.target as MIDIInput | null)?.id || '';
    const mappings = this.settings.settings().midiInputMappings;
    const outputMappings = this.settings.settings().midiOutputMappings;

    for (let mi = 0; mi < mappings.length; mi++) {
      const mapping = mappings[mi];
      if (!mapping.enabled) continue;
      // Device filter
      if (mapping.deviceId && mapping.deviceId !== deviceId) continue;
      // Channel filter
      if (mapping.channel > 0 && mapping.channel !== channel) continue;

      // Per-mapping isSending check: block physical bus echoes unless
      // this input is a relay source for at least one output mapping.
      if (sending && !outputMappings.some(om => om.enabled && om.relayInputIndices?.includes(mi))) continue;

      if (mapping.mode === 'straightKey' && note === mapping.value) {
        this.activeNotes.set(note, { action: 'straightKey', source: mapping.source, name: mapping.name || '', color: mapping.color || '', mappingIndex: mi });
        const skPath: InputPath = `midiStraightKey:${mi}`;
        this.zone.run(() => {
          this.decoder.onKeyDown(skPath, mapping.source, {
            fromMidi: true, name: mapping.name || undefined, color: mapping.color || undefined,
          });
        });
        return;
      }

      if (mapping.mode === 'paddle') {
        const reverse = mapping.reversePaddles;
        const ditValue = reverse ? mapping.dahValue : mapping.value;
        const dahValue = reverse ? mapping.value : mapping.dahValue;
        if (note === ditValue) {
          this.activeNotes.set(note, { action: 'dit', source: mapping.source, name: mapping.name || '', color: mapping.color || '', mappingIndex: mi });
          this.midiDitPaddleInput(true, mapping.source, mi, mapping.name || '', mapping.color || '');
          return;
        }
        if (note === dahValue) {
          this.activeNotes.set(note, { action: 'dah', source: mapping.source, name: mapping.name || '', color: mapping.color || '', mappingIndex: mi });
          this.midiDahPaddleInput(true, mapping.source, mi, mapping.name || '', mapping.color || '');
          return;
        }
      }
    }
  }

  /**
   * Schedule clearing the break-in state after one word gap of silence.
   * Resets on every call so that continued MIDI input activity keeps
   * the output muted until the remote party truly stops.
   */
  private scheduleBreakInClear(): void {
    this.cancelBreakInClear();
    const timings = timingsFromWpm(this.settings.settings().encoderWpm);
    this.breakInClearTimer = setTimeout(() => {
      this.midiOutput.clearBreakIn();
      this.breakInClearTimer = null;
    }, timings.interWord);
  }

  /** Cancel any pending break-in clear timer. */
  private cancelBreakInClear(): void {
    if (this.breakInClearTimer) {
      clearTimeout(this.breakInClearTimer);
      this.breakInClearTimer = null;
    }
  }

  /** Release any currently active notes (called on stop) */
  private releaseAll(): void {
    for (const [, active] of this.activeNotes) {
      switch (active.action) {
        case 'straightKey': {
          const skPath: InputPath = `midiStraightKey:${active.mappingIndex}`;
          this.zone.run(() => {
            this.decoder.onKeyUp(skPath, active.source, { fromMidi: true });
          });
          break;
        }
        case 'dit':
          this.midiDitPaddleInput(false, active.source, active.mappingIndex, active.name, active.color);
          break;
        case 'dah':
          this.midiDahPaddleInput(false, active.source, active.mappingIndex, active.name, active.color);
          break;
      }
    }
    this.activeNotes.clear();
    this.stopAllMidiKeyers();
  }

  // ---- Independent MIDI paddle keyer (per mapping) ----
  // Each MIDI paddle mapping gets its own iambic keyer that calls the
  // decoder directly — no shared state with KeyerService or other mappings.

  /** Get or create a keyer state for the given mapping index. */
  private getOrCreateMidiKeyer(
    idx: number, source: 'rx' | 'tx', name: string, color: string,
  ): MidiPaddleKeyerState {
    let ks = this.midiPaddleKeyers.get(idx);
    const path: InputPath = `midiPaddle:${idx}`;
    if (!ks) {
      ks = {
        leftPaddleDown: false,
        rightPaddleDown: false,
        ditMemory: false,
        dahMemory: false,
        keyerTimeout: null,
        currentElement: null,
        lastElement: null,
        elementPlaying: false,
        keyerRunning: false,
        source,
        name,
        color,
        path,
      };
      this.midiPaddleKeyers.set(idx, ks);
    }
    ks.source = source;
    ks.path = path;
    ks.name = name;
    ks.color = color;
    return ks;
  }

  /** Activate/deactivate the dit paddle on a per-mapping MIDI keyer. */
  private midiDitPaddleInput(down: boolean, source: 'rx' | 'tx', mappingIndex: number, name: string, color: string): void {
    const ks = this.getOrCreateMidiKeyer(mappingIndex, source, name, color);
    if (down && !ks.leftPaddleDown) {
      ks.leftPaddleDown = true;
      ks.ditMemory = true;
      this.startMidiKeyer(ks);
    } else if (!down) {
      ks.leftPaddleDown = false;
      this.checkStopMidiKeyer(ks);
    }
  }

  /** Activate/deactivate the dah paddle on a per-mapping MIDI keyer. */
  private midiDahPaddleInput(down: boolean, source: 'rx' | 'tx', mappingIndex: number, name: string, color: string): void {
    const ks = this.getOrCreateMidiKeyer(mappingIndex, source, name, color);
    if (down && !ks.rightPaddleDown) {
      ks.rightPaddleDown = true;
      ks.dahMemory = true;
      this.startMidiKeyer(ks);
    } else if (!down) {
      ks.rightPaddleDown = false;
      this.checkStopMidiKeyer(ks);
    }
  }

  private startMidiKeyer(ks: MidiPaddleKeyerState): void {
    if (ks.keyerRunning) return;
    ks.keyerRunning = true;
    this.runMidiKeyerLoop(ks);
  }

  private stopMidiKeyer(ks: MidiPaddleKeyerState): void {
    ks.keyerRunning = false;
    if (ks.keyerTimeout) {
      clearTimeout(ks.keyerTimeout);
      ks.keyerTimeout = null;
    }
    if (ks.elementPlaying) {
      ks.elementPlaying = false;
      this.zone.run(() => {
        this.decoder.onKeyUp(ks.path, ks.source, {
          perfectTiming: true, fromMidi: true,
          name: ks.name || undefined,
          color: ks.color || undefined,
        });
      });
    }
    ks.currentElement = null;
    ks.lastElement = null;
    ks.ditMemory = false;
    ks.dahMemory = false;
  }

  private stopAllMidiKeyers(): void {
    for (const [, ks] of this.midiPaddleKeyers) {
      this.stopMidiKeyer(ks);
    }
  }

  private checkStopMidiKeyer(ks: MidiPaddleKeyerState): void {
    if (!ks.leftPaddleDown && !ks.rightPaddleDown &&
        !ks.ditMemory && !ks.dahMemory && !ks.elementPlaying) {
      this.stopMidiKeyer(ks);
    }
  }

  private runMidiKeyerLoop(ks: MidiPaddleKeyerState): void {
    if (!ks.keyerRunning) return;
    const mode: PaddleMode = this.settings.settings().paddleMode;
    const timings = timingsFromWpm(this.settings.settings().keyerWpm);
    const nextElement = this.pickMidiNextElement(ks, mode);
    if (!nextElement) {
      this.stopMidiKeyer(ks);
      return;
    }
    ks.currentElement = nextElement;
    const duration = nextElement === 'dit' ? timings.dit : timings.dah;

    ks.elementPlaying = true;
    this.zone.run(() => {
      this.decoder.onKeyDown(ks.path, ks.source, {
        perfectTiming: true, fromMidi: true,
        name: ks.name || undefined,
        color: ks.color || undefined,
      });
    });

    ks.keyerTimeout = setTimeout(() => {
      ks.elementPlaying = false;
      this.zone.run(() => {
        this.decoder.onKeyUp(ks.path, ks.source, {
          perfectTiming: true, fromMidi: true,
          name: ks.name || undefined,
          color: ks.color || undefined,
        });
      });
      ks.lastElement = ks.currentElement;
      ks.currentElement = null;

      // Inter-element space (1 dit)
      ks.keyerTimeout = setTimeout(() => {
        if (ks.keyerRunning) {
          if (ks.leftPaddleDown || ks.rightPaddleDown ||
              ks.ditMemory || ks.dahMemory) {
            this.runMidiKeyerLoop(ks);
          } else {
            this.stopMidiKeyer(ks);
          }
        }
      }, timings.intraChar);
    }, duration);
  }

  /**
   * Pick the next element to play based on the current paddle mode.
   * Mirrors KeyerService.pickNextElement but uses per-mapping MIDI state.
   */
  private pickMidiNextElement(ks: MidiPaddleKeyerState, mode: PaddleMode): 'dit' | 'dah' | null {
    const hasDit = ks.leftPaddleDown || ks.ditMemory;
    const hasDah = ks.rightPaddleDown || ks.dahMemory;
    let picked: 'dit' | 'dah' | null = null;
    const bothActive = hasDit && hasDah;

    if (mode === 'iambic-b' || mode === 'iambic-a') {
      if (bothActive) {
        picked = ks.lastElement === 'dit' ? 'dah' : 'dit';
      } else if (hasDit) {
        picked = 'dit';
      } else if (hasDah) {
        picked = 'dah';
      } else if (mode === 'iambic-b' && ks.lastElement) {
        picked = ks.lastElement === 'dit' ? 'dah' : 'dit';
      }
    } else if (mode === 'ultimatic') {
      if (bothActive) {
        picked = ks.lastElement || 'dit';
      } else if (hasDit) {
        picked = 'dit';
      } else if (hasDah) {
        picked = 'dah';
      }
    } else if (mode === 'single-lever') {
      if (hasDit) picked = 'dit';
      else if (hasDah) picked = 'dah';
    }

    if (picked === 'dit') ks.ditMemory = false;
    else if (picked === 'dah') ks.dahMemory = false;
    return picked;
  }

  /**
   * Install keep-alive timer to prevent browser from silently dropping
   * MIDI listeners during background throttling or idle periods.
   *
   * Every 5 seconds the timer:
   *  1. Re-attaches onmidimessage handlers to all relevant inputs
   *  2. Refreshes the device list (catches hot-plugged devices)
   */
  private installKeepAlive(): void {
    this.clearKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (!this.started || !this.midiAccess) return;
      this.attachListeners();
      this.zone.run(() => this.refreshInputs());
    }, 5000);
  }

  private clearKeepAlive(): void {
    if (this.keepAliveTimer !== null) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }
}
