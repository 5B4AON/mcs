/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Injectable, OnDestroy, NgZone, signal } from '@angular/core';
import { SettingsService } from './settings.service';
import { MORSE_TABLE, timingsFromWpm } from '../morse-table';

/**
 * MIDI note name lookup (scientific pitch notation).
 */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Convert a MIDI note number (0-127) to a human-readable name.
 * @example midiOutputNoteName(60) → "C4"
 * @example midiOutputNoteName(69) → "A4"
 */
export function midiOutputNoteName(note: number): string {
  if (note < 0 || note > 127) return '—';
  const octave = Math.floor(note / 12) - 1;
  return `${NOTE_NAMES[note % 12]}${octave}`;
}

/**
 * Build a MIDI note number from a note name index (0-11) and octave (-1 to 9).
 * @returns MIDI note number 0-127, or -1 if invalid
 */
export function noteFromNameAndOctave(noteIndex: number, octave: number): number {
  const note = (octave + 1) * 12 + noteIndex;
  return (note >= 0 && note <= 127) ? note : -1;
}

/**
 * Extract note name index (0-11) from a MIDI note number.
 */
export function noteNameIndex(note: number): number {
  return note % 12;
}

/**
 * Extract octave from a MIDI note number.
 */
export function noteOctave(note: number): number {
  return Math.floor(note / 12) - 1;
}

/**
 * MIDI Output Service — sends MIDI note-on/note-off messages to key external hardware.
 *
 * Use case: connect an Arduino Pro Micro running the MIDIUSB library.
 * The Arduino's digital pins can then be wired to keying circuits,
 * paddle inputs, or other CW hardware for real-time, zero-latency
 * interfacing with the application.
 *
 * Three independent output notes are supported:
 *  1. **Straight key** — note-on during each element (dit or dah), note-off between.
 *  2. **Dit paddle** — note-on during dit elements only.
 *  3. **Dah paddle** — note-on during dah elements only.
 *
 * Operation is character-based (like WinKeyer): decoded characters from any
 * input source are played back as individual morse elements using the encoder
 * WPM timing. Each element fires the straight key note plus the appropriate
 * dit or dah note simultaneously.
 *
 * This design works for ALL input types:
 *  - Encoder typed text → forwarded directly from the encoder send loop
 *  - Keyer paddles → decoded character forwarded from app component effect
 *  - Straight key → decoded character forwarded from app component effect
 *  - Audio inputs → decoded character forwarded from app component effect
 *  - MIDI input → decoded character forwarded from app component effect
 *  - Firebase RTDB → decoded character forwarded from app component effect
 *
 * MIDI access is independent of the audio start/stop lifecycle. It starts
 * when the user enables MIDI output and stays alive across audio restarts
 * and browser refreshes (Chrome remembers the grant).
 *
 * Each output has a configurable MIDI note number (0-127) and the user can
 * choose from a note/octave picker or enter a raw value. Velocity is
 * configurable (default 127).
 *
 * The service shares the same Web MIDI access obtained by MidiInputService.
 * It enumerates MIDI *output* ports and allows the user to select one.
 *
 * Chromium-only: Web MIDI API is available in Chrome, Edge, and Opera.
 */
@Injectable({ providedIn: 'root' })
export class MidiOutputService implements OnDestroy {
  /** Whether Web MIDI API is available in this browser */
  readonly supported = 'requestMIDIAccess' in navigator;

  /** Available MIDI output devices (populated after start) */
  readonly midiOutputs = signal<{ id: string; name: string }[]>([]);

  /** True when MIDI access has been granted and an output port is available */
  readonly connected = signal(false);

  /** Last error message */
  readonly lastError = signal('');

  private midiAccess: MIDIAccess | null = null;
  private started = false;
  private startingPromise: Promise<void> | null = null;

  /** Currently active output port */
  private activeOutput: MIDIOutput | null = null;

  /** Track which notes are currently held (to release on stop) */
  private activeNotes = new Set<number>();

  /** Character playback queue */
  private charQueue: { char: string; source: 'rx' | 'tx' }[] = [];
  private playing = false;
  private abortPlayback = false;

  /** Keep-alive timer — periodically refreshes output list */
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private settings: SettingsService,
    private zone: NgZone,
  ) {}

  ngOnDestroy(): void {
    this.shutdown();
  }

  /**
   * Request MIDI access and start. Called when the user enables MIDI output.
   */
  async start(): Promise<void> {
    if (!this.supported) {
      this.lastError.set('Web MIDI API is not supported in this browser. Use Chrome or Edge.');
      return;
    }
    if (this.started) return;

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

  private async doStart(): Promise<void> {
    try {
      this.midiAccess = await (navigator as any).requestMIDIAccess({ sysex: false });
      this.started = true;
      this.lastError.set('');

      // Install state-change handler — handles hot-plug of MIDI devices
      this.installStateChangeHandler();

      // Enumerate whatever is already available
      this.refreshOutputs();
      this.resolveActiveOutput();

      this.installKeepAlive();
    } catch (err: any) {
      const msg = err?.message || String(err);
      this.zone.run(() => {
        this.lastError.set(`MIDI access denied: ${msg}`);
        this.connected.set(false);
      });
    }
  }

  /** Soft stop — abort playback, release held notes, keep MIDI access alive */
  stop(): void {
    this.abortPlayback = true;
    this.charQueue.length = 0;
    this.releaseAll();
  }

  /** Full shutdown — tear down everything including MIDI access */
  shutdown(): void {
    if (!this.started) return;
    this.abortPlayback = true;
    this.charQueue.length = 0;
    this.releaseAll();
    this.clearKeepAlive();

    if (this.midiAccess) {
      this.midiAccess.onstatechange = null;
      this.midiAccess = null;
    }

    this.activeOutput = null;
    this.started = false;
    this.zone.run(() => {
      this.connected.set(false);
      this.midiOutputs.set([]);
    });
  }

  /** Re-resolve the active output (e.g. after settings change) */
  reattach(): void {
    if (this.started) {
      this.resolveActiveOutput();
    }
  }

  // ---- Character-based forwarding (like WinKeyer) ----

  /**
   * Forward a decoded character to MIDI output.
   *
   * The character is enqueued and played back as individual morse elements
   * (dits and dahs) using the encoder WPM timing. During each element the
   * straight key note fires, plus the dit or dah note as appropriate.
   *
   * Works for ALL input types: encoder text, keyer paddles, straight key,
   * audio inputs, MIDI input, and Firebase RTDB.
   *
   * @param char   The decoded character (e.g. 'A', ' ')
   * @param source 'rx' or 'tx' — checked against forward setting
   */
  forwardDecodedChar(char: string, source: 'rx' | 'tx'): void {
    if (!this.canOutput(source)) return;
    this.charQueue.push({ char, source });
    if (!this.playing) {
      this.processCharQueue();
    }
  }

  private async processCharQueue(): Promise<void> {
    if (this.playing) return;
    this.playing = true;
    this.abortPlayback = false;
    try {
      while (this.charQueue.length > 0 && !this.abortPlayback) {
        const entry = this.charQueue.shift()!;
        await this.playCharElements(entry.char);
      }
    } finally {
      this.playing = false;
    }
  }

  /**
   * Play a single character as MIDI note elements.
   * Each dit/dah fires the straight key note + the element-specific note.
   */
  private async playCharElements(char: string): Promise<void> {
    const timings = timingsFromWpm(this.settings.settings().encoderWpm);
    const s = this.settings.settings();
    const channel = s.midiOutputChannel;
    const velocity = s.midiOutputVelocity;

    if (char === ' ') {
      // Word space = 7 dit units; 3 already elapsed as inter-char
      await this.sleepMs(timings.interWord - timings.interChar);
      return;
    }

    const morse = MORSE_TABLE[char];
    if (!morse) return;

    for (let i = 0; i < morse.length; i++) {
      if (this.abortPlayback) return;

      const element = morse[i];
      const duration = element === '.' ? timings.dit : timings.dah;

      // Build note list: straight key + element-specific note
      const notes: number[] = [];
      if (s.midiOutputStraightKeyNote >= 0) notes.push(s.midiOutputStraightKeyNote);
      if (element === '.' && s.midiOutputDitNote >= 0) notes.push(s.midiOutputDitNote);
      if (element === '-' && s.midiOutputDahNote >= 0) notes.push(s.midiOutputDahNote);

      if (notes.length > 0) {
        for (const note of notes) this.sendNoteOn(note, velocity, channel);
        await this.sleepMs(duration);
        for (const note of notes) this.sendNoteOff(note, channel);
      } else {
        await this.sleepMs(duration);
      }

      // Intra-character gap
      if (i < morse.length - 1) {
        await this.sleepMs(timings.intraChar);
      }
    }

    // Inter-character gap
    await this.sleepMs(timings.interChar);
  }

  private sleepMs(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test output — send a 1-second pulse on the straight key note.
   */
  async test(): Promise<void> {
    if (!this.activeOutput) return;
    const s = this.settings.settings();
    const note = s.midiOutputStraightKeyNote;
    if (note < 0) return;
    this.sendNoteOn(note, s.midiOutputVelocity, s.midiOutputChannel);
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.sendNoteOff(note, s.midiOutputChannel);
  }

  // ---- Internal MIDI message methods ----

  private sendNoteOn(note: number, velocity: number, channel: number): void {
    if (!this.activeOutput || note < 0 || note > 127) return;
    // MIDI note-on: 0x90 + channel (0-based)
    const status = 0x90 | ((channel - 1) & 0x0f);
    this.activeOutput.send([status, note, velocity & 0x7f]);
    this.activeNotes.add(note);
  }

  private sendNoteOff(note: number, channel: number): void {
    if (!this.activeOutput || note < 0 || note > 127) return;
    // MIDI note-off: 0x80 + channel (0-based)
    const status = 0x80 | ((channel - 1) & 0x0f);
    this.activeOutput.send([status, note, 0]);
    this.activeNotes.delete(note);
  }

  /** Check whether output should be active for the given source */
  private canOutput(source: 'rx' | 'tx'): boolean {
    if (!this.activeOutput) return false;
    const s = this.settings.settings();
    if (!s.midiOutputEnabled) return false;
    if (s.midiOutputForward !== 'both' && s.midiOutputForward !== source) return false;
    return true;
  }

  /** Release all currently held notes */
  private releaseAll(): void {
    if (!this.activeOutput) return;
    const s = this.settings.settings();
    const channel = s.midiOutputChannel;
    for (const note of this.activeNotes) {
      this.sendNoteOff(note, channel);
    }
    this.activeNotes.clear();
  }

  /**
   * Install the onstatechange handler on the current MIDIAccess object.
   * Extracted into its own method so it can be reused after re-acquisition.
   */
  private installStateChangeHandler(): void {
    if (!this.midiAccess) return;
    this.midiAccess.onstatechange = () => {
      this.zone.run(() => this.refreshOutputs());
      this.resolveActiveOutput();
      // Retry after short delays for ports that need time to settle
      // after a physical reconnection.
      for (const delay of [500, 1500]) {
        setTimeout(() => {
          if (this.started && this.midiAccess) {
            this.zone.run(() => this.refreshOutputs());
            this.resolveActiveOutput();
          }
        }, delay);
      }
    };
  }

  /** Populate the midiOutputs signal from current MIDI access state */
  private refreshOutputs(): void {
    if (!this.midiAccess) return;
    const outputs: { id: string; name: string }[] = [];
    for (const output of this.midiAccess.outputs.values()) {
      if (output.state === 'connected') {
        outputs.push({ id: output.id, name: output.name || `MIDI Output ${output.id}` });
      }
    }
    this.midiOutputs.set(outputs);
    this.connected.set(this.activeOutput !== null && outputs.length > 0);
  }

  /** Resolve the active MIDI output port from settings */
  private resolveActiveOutput(): void {
    if (!this.midiAccess) return;
    const configuredId = this.settings.settings().midiOutputDeviceId;
    let found: MIDIOutput | null = null;

    for (const output of this.midiAccess.outputs.values()) {
      if (output.state !== 'connected') continue;
      if (configuredId && output.id === configuredId) {
        found = output;
        break;
      }
      if (!configuredId && !found) {
        found = output; // First available if none configured
      }
    }

    this.activeOutput = found;
    this.zone.run(() => {
      this.connected.set(found !== null);
    });
  }

  private installKeepAlive(): void {
    this.clearKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (!this.started || !this.midiAccess) return;
      this.zone.run(() => this.refreshOutputs());
      this.resolveActiveOutput();
    }, 5000);
  }

  private clearKeepAlive(): void {
    if (this.keepAliveTimer !== null) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }
}
