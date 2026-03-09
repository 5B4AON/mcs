/**
 * Morse Code Studio
 */

import { Injectable, OnDestroy, NgZone, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { SettingsService, PaddleMode } from './settings.service';
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
  readonly learnedNote$ = new Subject<{ note: number; channel: number; deviceId: string; deviceName: string }>();

  private midiAccess: MIDIAccess | null = null;
  private started = false;

  /** Guards against concurrent start() calls */
  private startingPromise: Promise<void> | null = null;

  /** Learn mode: when set, the next note-on is captured instead of acted on */
  private learnCallback: ((note: number) => void) | null = null;

  /** Track which notes are currently held (to release on stop) */
  private activeNotes = new Map<number, 'straightKey' | 'dit' | 'dah'>();

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

  // ---- Independent MIDI paddle keyer state ----
  // MIDI input has its own iambic keyer that is completely independent of
  // the keyboard/mouse/touch KeyerService. This ensures MIDI paddles have
  // zero shared state with other input sources — true parallel operation.
  private midiLeftPaddleDown = false;
  private midiRightPaddleDown = false;
  private midiDitMemory = false;
  private midiDahMemory = false;
  private midiKeyerTimeout: ReturnType<typeof setTimeout> | null = null;
  private midiCurrentElement: 'dit' | 'dah' | null = null;
  private midiLastElement: 'dit' | 'dah' | null = null;
  private midiElementPlaying = false;
  private midiKeyerRunning = false;
  private midiPaddleSource: 'rx' | 'tx' = 'rx';

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
   * Used by the settings UI for the "capture" buttons.
   */
  startLearn(callback: (note: number) => void): void {
    this.learnCallback = callback;
  }

  /** Cancel learn mode without capturing. */
  cancelLearn(): void {
    this.learnCallback = null;
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
   * Attach onmidimessage to all connected inputs (or just the configured device).
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
    const configuredId = this.settings.settings().midiInputDeviceId;

    for (const input of this.midiAccess.inputs.values()) {
      // Skip disconnected devices and devices that don't match the configured ID
      if (input.state !== 'connected' || (configuredId && input.id !== configuredId)) {
        input.onmidimessage = null;
        continue;
      }

      // Explicitly open the port, then attach the message handler.
      // If the port is already open this resolves immediately.
      input.open().then(() => {
        input.onmidimessage = (msg: MIDIMessageEvent) => this.onMessage(msg);
      }).catch(() => {
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

    // Channel filter: 0 = omni (accept all), 1-16 = specific
    const channelFilter = this.settings.settings().midiInputChannel;
    if (channelFilter > 0 && channel !== channelFilter) return;

    // Learn mode: capture the note and return
    if (isNoteOn && this.learnCallback) {
      const cb = this.learnCallback;
      this.learnCallback = null;
      this.zone.run(() => {
        cb(note);
        // Also emit for the UI
        const deviceName = this.getDeviceName(msg);
        this.learnedNote$.next({ note, channel, deviceId: '', deviceName });
      });
      return;
    }

    // Normal mode: map note to keyer action
    if (!this.settings.settings().midiInputEnabled) return;

    // ======================================================================
    // *** DO NOT CHANGE THIS CHECK TO PER-NOTE OR ANY OTHER VARIATION ***
    //
    // Blanket isSending() suppression is REQUIRED because MIDI notes are
    // converted to electrical signals on a COMMON PHYSICAL BUS where both
    // sending and receiving happen on the same wire.  When the MIDI output
    // sends ANY note, the bus is energised and the MIDI input hardware
    // simultaneously samples the same bus, generating a mirror note-on.
    // The note numbers are LOST in the electrical domain — only "bus
    // active / bus idle" matters.  Therefore we must mute ALL MIDI input
    // while ANY MIDI output note is held, regardless of note number.
    //
    // True parallel operation (e.g. receiving MIDI while the keyboard
    // keyer is active) is achieved by:
    //  1. Real-time MIDI output keying in the decoder (keyDown/keyUp),
    //     which keeps isSending() true only during actual key-down —
    //     not during the decoder's word-gap silence timers.
    //  2. Not forwarding local-keyer decoded characters to MIDI output
    //     via forwardDecodedChar (they are already keyed in real-time).
    //  3. This service bypassing KeyerService entirely (own iambic keyer
    //     + direct decoder calls), so no shared state with keyboard.
    // ======================================================================
    if (isNoteOn && this.midiOutput.isSending()) return;

    const s = this.settings.settings();
    const straightSource = s.midiStraightKeySource;
    const paddleSource = s.midiPaddleSource;
    const reverse = s.midiReversePaddles;

    // Straight key and paddle inputs bypass KeyerService completely.
    // MIDI input talks to the decoder directly (for straight key) or
    // through its own independent iambic keyer (for paddles).  This
    // ensures zero shared state with the keyboard/mouse/touch keyer.
    if (isNoteOn) {
      if (note === s.midiStraightKeyNote) {
        this.activeNotes.set(note, 'straightKey');
        this.zone.run(() => {
          this.decoder.onKeyDown('midiStraightKey', straightSource, { fromMidi: true });
        });
      } else if (note === s.midiDitNote) {
        this.activeNotes.set(note, reverse ? 'dah' : 'dit');
        if (reverse) {
          this.midiDahPaddleInput(true, paddleSource);
        } else {
          this.midiDitPaddleInput(true, paddleSource);
        }
      } else if (note === s.midiDahNote) {
        this.activeNotes.set(note, reverse ? 'dit' : 'dah');
        if (reverse) {
          this.midiDitPaddleInput(true, paddleSource);
        } else {
          this.midiDahPaddleInput(true, paddleSource);
        }
      }
    } else if (isNoteOff) {
      const action = this.activeNotes.get(note);
      if (!action) return;
      this.activeNotes.delete(note);

      switch (action) {
        case 'straightKey':
          this.zone.run(() => {
            this.decoder.onKeyUp('midiStraightKey', straightSource, { fromMidi: true });
          });
          break;
        case 'dit':
          this.midiDitPaddleInput(false, paddleSource);
          break;
        case 'dah':
          this.midiDahPaddleInput(false, paddleSource);
          break;
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
    const s = this.settings.settings();
    const straightSource = s.midiStraightKeySource;
    const paddleSource = s.midiPaddleSource;
    for (const [, action] of this.activeNotes) {
      switch (action) {
        case 'straightKey':
          this.zone.run(() => {
            this.decoder.onKeyUp('midiStraightKey', straightSource, { fromMidi: true });
          });
          break;
        case 'dit':
          this.midiDitPaddleInput(false, paddleSource);
          break;
        case 'dah':
          this.midiDahPaddleInput(false, paddleSource);
          break;
      }
    }
    this.activeNotes.clear();
    this.stopMidiKeyer();
  }

  // ---- Independent MIDI paddle keyer ----
  // Self-contained iambic keyer that calls the decoder directly.
  // Completely independent of KeyerService — no shared state.

  /** Activate/deactivate the dit paddle on the MIDI keyer. */
  private midiDitPaddleInput(down: boolean, source: 'rx' | 'tx'): void {
    this.midiPaddleSource = source;
    if (down && !this.midiLeftPaddleDown) {
      this.midiLeftPaddleDown = true;
      this.midiDitMemory = true;
      this.startMidiKeyer();
    } else if (!down) {
      this.midiLeftPaddleDown = false;
      this.checkStopMidiKeyer();
    }
  }

  /** Activate/deactivate the dah paddle on the MIDI keyer. */
  private midiDahPaddleInput(down: boolean, source: 'rx' | 'tx'): void {
    this.midiPaddleSource = source;
    if (down && !this.midiRightPaddleDown) {
      this.midiRightPaddleDown = true;
      this.midiDahMemory = true;
      this.startMidiKeyer();
    } else if (!down) {
      this.midiRightPaddleDown = false;
      this.checkStopMidiKeyer();
    }
  }

  private startMidiKeyer(): void {
    if (this.midiKeyerRunning) return;
    this.midiKeyerRunning = true;
    this.runMidiKeyerLoop();
  }

  private stopMidiKeyer(): void {
    this.midiKeyerRunning = false;
    if (this.midiKeyerTimeout) {
      clearTimeout(this.midiKeyerTimeout);
      this.midiKeyerTimeout = null;
    }
    if (this.midiElementPlaying) {
      this.midiElementPlaying = false;
      this.zone.run(() => {
        this.decoder.onKeyUp('midiPaddle', this.midiPaddleSource, {
          perfectTiming: true, fromMidi: true,
        });
      });
    }
    this.midiCurrentElement = null;
    this.midiLastElement = null;
    this.midiDitMemory = false;
    this.midiDahMemory = false;
  }

  private checkStopMidiKeyer(): void {
    if (!this.midiLeftPaddleDown && !this.midiRightPaddleDown &&
        !this.midiDitMemory && !this.midiDahMemory && !this.midiElementPlaying) {
      this.stopMidiKeyer();
    }
  }

  private runMidiKeyerLoop(): void {
    if (!this.midiKeyerRunning) return;
    const mode: PaddleMode = this.settings.settings().paddleMode;
    const timings = timingsFromWpm(this.settings.settings().keyerWpm);
    const nextElement = this.pickMidiNextElement(mode);
    if (!nextElement) {
      this.stopMidiKeyer();
      return;
    }
    this.midiCurrentElement = nextElement;
    const duration = nextElement === 'dit' ? timings.dit : timings.dah;

    this.midiElementPlaying = true;
    this.zone.run(() => {
      this.decoder.onKeyDown('midiPaddle', this.midiPaddleSource, {
        perfectTiming: true, fromMidi: true,
      });
    });

    this.midiKeyerTimeout = setTimeout(() => {
      this.midiElementPlaying = false;
      this.zone.run(() => {
        this.decoder.onKeyUp('midiPaddle', this.midiPaddleSource, {
          perfectTiming: true, fromMidi: true,
        });
      });
      this.midiLastElement = this.midiCurrentElement;
      this.midiCurrentElement = null;

      // Inter-element space (1 dit)
      this.midiKeyerTimeout = setTimeout(() => {
        if (this.midiKeyerRunning) {
          if (this.midiLeftPaddleDown || this.midiRightPaddleDown ||
              this.midiDitMemory || this.midiDahMemory) {
            this.runMidiKeyerLoop();
          } else {
            this.stopMidiKeyer();
          }
        }
      }, timings.intraChar);
    }, duration);
  }

  /**
   * Pick the next element to play based on the current paddle mode.
   * Mirrors KeyerService.pickNextElement but uses MIDI-local state.
   */
  private pickMidiNextElement(mode: PaddleMode): 'dit' | 'dah' | null {
    const hasDit = this.midiLeftPaddleDown || this.midiDitMemory;
    const hasDah = this.midiRightPaddleDown || this.midiDahMemory;
    let picked: 'dit' | 'dah' | null = null;
    const bothActive = hasDit && hasDah;

    if (mode === 'iambic-b' || mode === 'iambic-a') {
      if (bothActive) {
        picked = this.midiLastElement === 'dit' ? 'dah' : 'dit';
      } else if (hasDit) {
        picked = 'dit';
      } else if (hasDah) {
        picked = 'dah';
      } else if (mode === 'iambic-b' && this.midiLastElement) {
        picked = this.midiLastElement === 'dit' ? 'dah' : 'dit';
      }
    } else if (mode === 'ultimatic') {
      if (bothActive) {
        picked = this.midiLastElement || 'dit';
      } else if (hasDit) {
        picked = 'dit';
      } else if (hasDah) {
        picked = 'dah';
      }
    } else if (mode === 'single-lever') {
      if (hasDit) picked = 'dit';
      else if (hasDah) picked = 'dah';
    }

    if (picked === 'dit') this.midiDitMemory = false;
    else if (picked === 'dah') this.midiDahMemory = false;
    return picked;
  }

  /** Try to get the device name from a MIDI message event */
  private getDeviceName(msg: MIDIMessageEvent): string {
    const target = msg.target as MIDIInput | null;
    return target?.name || 'Unknown';
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
