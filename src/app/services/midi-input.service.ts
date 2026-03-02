/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Injectable, OnDestroy, NgZone, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { SettingsService } from './settings.service';
import { KeyerService } from './keyer.service';

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
 *  3. Maps received notes to keyer actions: straight key, dit paddle,
 *     or dah paddle — using the same KeyerService methods as the keyboard keyer.
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

  constructor(
    private settings: SettingsService,
    private keyer: KeyerService,
    private zone: NgZone,
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

      // Install state-change handler FIRST — before any enumeration.
      // On a fresh page load Chrome may still be transitioning ports from
      // 'disconnected' to 'connected'. If we enumerate first and install
      // the handler second, we can miss the transition event entirely.
      this.midiAccess!.onstatechange = () => {
        this.zone.run(() => this.refreshInputs());
        this.attachListeners();
      };

      // Now enumerate whatever is already available
      this.refreshInputs();
      this.attachListeners();

      // Some browsers (Chrome) need a moment after requestMIDIAccess()
      // before all ports have transitioned to 'connected'. If the initial
      // enumeration found nothing, retry after a short delay to catch
      // ports that were still settling.
      if (this.midiInputs().length === 0) {
        setTimeout(() => {
          if (this.started && this.midiAccess) {
            this.zone.run(() => this.refreshInputs());
            this.attachListeners();
          }
        }, 500);
      }

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

    const s = this.settings.settings();
    const source = s.midiInputSource;
    const reverse = s.midiReversePaddles;

    if (isNoteOn) {
      if (note === s.midiStraightKeyNote) {
        this.activeNotes.set(note, 'straightKey');
        this.keyer.straightKeyInput(true, source);
      } else if (note === s.midiDitNote) {
        this.activeNotes.set(note, reverse ? 'dah' : 'dit');
        if (reverse) {
          this.keyer.dahPaddleInput(true, source);
        } else {
          this.keyer.ditPaddleInput(true, source);
        }
      } else if (note === s.midiDahNote) {
        this.activeNotes.set(note, reverse ? 'dit' : 'dah');
        if (reverse) {
          this.keyer.ditPaddleInput(true, source);
        } else {
          this.keyer.dahPaddleInput(true, source);
        }
      }
    } else if (isNoteOff) {
      const action = this.activeNotes.get(note);
      if (!action) return;
      this.activeNotes.delete(note);

      switch (action) {
        case 'straightKey':
          this.keyer.straightKeyInput(false, source);
          break;
        case 'dit':
          this.keyer.ditPaddleInput(false, source);
          break;
        case 'dah':
          this.keyer.dahPaddleInput(false, source);
          break;
      }
    }
  }

  /** Release any currently active notes (called on stop) */
  private releaseAll(): void {
    const source = this.settings.settings().midiInputSource;
    for (const [, action] of this.activeNotes) {
      switch (action) {
        case 'straightKey':
          this.keyer.straightKeyInput(false, source);
          break;
        case 'dit':
          this.keyer.ditPaddleInput(false, source);
          break;
        case 'dah':
          this.keyer.dahPaddleInput(false, source);
          break;
      }
    }
    this.activeNotes.clear();
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
   *  3. If MIDIAccess was lost, attempts to re-acquire it
   */
  private installKeepAlive(): void {
    this.clearKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (!this.started) return;
      if (this.midiAccess) {
        this.attachListeners();
        this.zone.run(() => this.refreshInputs());
      } else {
        // MIDIAccess was lost — try to reacquire
        this.started = false;
        this.start();
      }
    }, 5000);
  }

  private clearKeepAlive(): void {
    if (this.keepAliveTimer !== null) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }
}
