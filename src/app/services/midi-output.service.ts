/**
 * Morse Code Studio
 */

import { Injectable, OnDestroy, NgZone, signal } from '@angular/core';
import { SettingsService } from './settings.service';
import { MORSE_TABLE, timingsFromWpm, adjustGapTimings } from '../morse-table';

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
 * Multiple output mappings are supported, each targeting a specific MIDI
 * device, channel, note, and mode (straight key or paddle). Each enabled
 * mapping fires independently during playback.
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
 * Each output mapping has a configurable MIDI note number (0-127) and
 * mode (straight key or paddle). Velocity is always 127.
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

  /** True while MIDI output has active notes held (keying) */
  readonly isSending = signal(false);

  /**
   * Holdoff timer — keeps isSending() true for a few ms after the last
   * note-off. The physical MIDI-to-electrical bus has settling time:
   * the Arduino/optocoupler de-energise, the bus voltage drops, and
   * the input sampling circuit needs time to stop seeing the signal.
   * Without this holdoff, a fast key-up → loopback echo can sneak
   * through the isSending() gate before the bus has fully settled.
   *
   * *** DO NOT REMOVE OR SHORTEN THIS HOLDOFF ***
   * It prevents feedback loops that can lock the MIDI output in a
   * permanent keying state.
   */
  private isSendingHoldoff: ReturnType<typeof setTimeout> | null = null;

  /**
   * Holdoff duration in milliseconds.  Empirically tested: 30 ms
   * covers typical Arduino + optocoupler settling plus USB MIDI
   * round-trip jitter (8-12 ms).
   */
  private static readonly SENDING_HOLDOFF_MS = 30;

  private midiAccess: MIDIAccess | null = null;
  private started = false;
  private startingPromise: Promise<void> | null = null;

  /**
   * Track currently held notes for proper release.
   * Key: "note:channel" — value: { note, channel, output } so we can
   * send the note-off on the correct port and channel even if settings
   * change between note-on and note-off.
   */
  private activeNotes = new Map<string, { note: number; channel: number; output: MIDIOutput; seq: number }>();

  /** Numbers the note-ons, so a note-off that was placed ahead of time does not release a later note-on of the same note */
  private noteSeq = 0;

  /**
   * Where the next character may start (page clock, ms) when it is not given a start time: the end of
   * the last one, including its letter gap. Playing from it, instead of waiting with chained timers,
   * keeps a burst of characters on an even rhythm.
   */
  private nextStart = 0;

  /**
   * A note is placed this far ahead of its start (ms). Web MIDI delivers a message with a timestamp at that
   * time, which is exact, but a message that has been handed over cannot be taken back (Chrome has no
   * `clear()`), so it is kept short: a break-in or a stop lets at most this and the element in hand finish.
   */
  private static readonly LEAD_MS = 40;

  /**
   * Track note keys activated by keyDown() (real-time straight-key path).
   * keyUp() only releases these — not notes from the character playback queue.
   * Without this separation, keyUp() would prematurely cut short paddle notes
   * being played by the queue at a different (slower) WPM.
   */
  private realTimeNoteKeys = new Set<string>();

  /** Character playback queue */
  private charQueue: { char: string; source: 'rx' | 'tx'; wpm?: number; paddleOnly?: boolean; isFromRelay?: boolean; startAt?: number }[] = [];
  private playing = false;
  private abortPlayback = false;

  /**
   * True while break-in is active — MIDI output refuses new characters
   * until the remote party stops (word-gap silence detected by MidiInputService).
   */
  private breakInActive = false;

  /**
   * Resolve function for the interruptible space sleep.
   * When set, calling it cuts the word-gap sleep short so the next
   * queued character can play immediately.
   */
  private spaceSleepResolve: (() => void) | null = null;

  /** Keep-alive timer — periodically refreshes output list */
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Full break-in: abort current playback, flush the queue, release held
   * notes, and enter a muted state where `forwardDecodedChar` drops incoming
   * characters. Call `clearBreakIn()` to resume normal operation.
   *
   * Called by MIDI input when a valid (non-echo) note-on arrives — the
   * remote party is responding, so our output must yield immediately.
   */
  breakIn(): void {
    this.breakInActive = true;
    this.abortPlayback = true;
    this.charQueue.length = 0;
    if (this.spaceSleepResolve) {
      this.spaceSleepResolve();
      this.spaceSleepResolve = null;
    }
    this.releaseAll();
  }

  /**
   * Clear the break-in state, allowing `forwardDecodedChar` to accept
   * characters again.  Called by MidiInputService after a word-gap of
   * silence from the remote party.
   */
  clearBreakIn(): void {
    this.breakInActive = false;
  }

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
      this.updateConnected();

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
    if (this.spaceSleepResolve) {
      this.spaceSleepResolve();
      this.spaceSleepResolve = null;
    }
    this.releaseAll();
  }

  /** Full shutdown — tear down everything including MIDI access */
  shutdown(): void {
    if (!this.started) return;
    this.abortPlayback = true;
    this.charQueue.length = 0;
    if (this.spaceSleepResolve) {
      this.spaceSleepResolve();
      this.spaceSleepResolve = null;
    }
    this.releaseAll();
    this.clearKeepAlive();

    if (this.midiAccess) {
      this.midiAccess.onstatechange = null;
      this.midiAccess = null;
    }

    this.started = false;
    this.zone.run(() => {
      this.connected.set(false);
      this.midiOutputs.set([]);
    });
  }

  /** Re-resolve the connected state (e.g. after settings change) */
  reattach(): void {
    if (this.started) {
      this.updateConnected();
    }
  }

  /**
   * Enumerate available MIDI output devices without starting the full
   * service pipeline. Used by the settings UI to populate device
   * dropdowns even when MIDI output is disabled.
   */
  async enumerateDevices(): Promise<void> {
    if (!this.supported) {
      this.lastError.set('Web MIDI API is not supported in this browser. Use Chrome or Edge.');
      return;
    }
    // If already started, devices are already populated
    if (this.started && this.midiAccess) {
      this.refreshOutputs();
      return;
    }
    try {
      const access = await (navigator as any).requestMIDIAccess({ sysex: false });
      const outputs: { id: string; name: string }[] = [];
      for (const output of access.outputs.values()) {
        if (output.state === 'connected') {
          outputs.push({ id: output.id, name: output.name || `MIDI Output ${output.id}` });
        }
      }
      this.zone.run(() => {
        this.midiOutputs.set(outputs);
        this.lastError.set('');
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.zone.run(() => this.lastError.set(`MIDI access denied: ${message}`));
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
   * @param char       The decoded character (e.g. 'A', ' ')
   * @param source     'rx' or 'tx' — checked against forward setting
   * @param wpm        Optional WPM from the source (e.g. Firebase RTDB remote speed)
   * @param paddleOnly When true, only paddle-mode mappings fire; straight-key
   *                   mappings are skipped (they are already keyed in real-time
   *                   via the keyDown/keyUp path for local keyer inputs).
   * @param startAt    When the character should start sounding (page clock, ms), from the
   *                   encoder's timeline; the notes are then placed at exact times from it.
   *                   Without it the character follows the one before it.
   */
  forwardDecodedChar(char: string, source: 'rx' | 'tx', wpm?: number, paddleOnly = false, isFromRelay = false, startAt?: number): void {
    if (!this.isActive()) return;
    // During break-in the remote party has priority — drop outgoing chars.
    if (this.breakInActive) return;
    this.charQueue.push({ char, source, wpm, paddleOnly, isFromRelay, startAt });
    // If we're sleeping through a word gap and a real character arrives,
    // cut the sleep short so the new character plays immediately.
    if (char !== ' ' && this.spaceSleepResolve) {
      this.spaceSleepResolve();
      this.spaceSleepResolve = null;
    }
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
        await this.playCharElements(entry.char, entry.source, entry.wpm, entry.paddleOnly, entry.isFromRelay, entry.startAt);
      }
    } finally {
      this.playing = false;
    }
  }

  /**
   * Play a single character as MIDI note elements.
   * Each dit/dah fires the straight key note + the element-specific note.
   *
   * Uses the provided remote WPM if available and the override setting is off;
   * otherwise falls back to the local encoder WPM.
   */
  private async playCharElements(
    char: string, source: 'rx' | 'tx', wpm?: number, paddleOnly = false, isFromRelay = false, startAt?: number,
  ): Promise<void> {
    const s0 = this.settings.settings();
    const effectiveWpm = (wpm && !s0.midiOutputOverrideWpm) ? wpm : s0.encoderWpm;
    const baseTimings = timingsFromWpm(effectiveWpm);
    const timings = adjustGapTimings(baseTimings, effectiveWpm, source, s0);
    const s = this.settings.settings();
    const velocity = 127;

    if (char === ' ') {
      // With a start time the encoder's timeline already holds the gap. Without one the gap is added to the
      // timeline, unless a real character arrives first: then that character plays as soon as the one before
      // it is done, as it always did.
      if (startAt === undefined) {
        const gapEnd = Math.max(this.nextStart, performance.now()) + (timings.interWord - timings.interChar);
        const whole = await this.interruptibleSleepMs(gapEnd - performance.now());
        if (whole) this.nextStart = gapEnd;
      }
      return;
    }

    const morse = MORSE_TABLE[char];
    if (!morse) return;

    // Collect enabled mappings whose forward filter matches the source.
    // When paddleOnly is set, skip straight-key mappings (they are already
    // keyed in real-time via keyDown/keyUp for local keyer inputs).
    // When not from a relay source, skip mappings with relaySuppressOtherInputs.
    const enabledMappings = s.midiOutputMappings.filter(m =>
      m.enabled && (m.forward === 'both' || m.forward === source)
      && (!paddleOnly || m.mode === 'paddle')
      && (isFromRelay || !m.relaySuppressOtherInputs)
    );

    // The character starts at the time it was given, or after the one before it; never in the past
    const now = performance.now();
    let begin = Math.max(startAt ?? this.nextStart, now + 2);
    let offset = 0;

    for (let i = 0; i < morse.length; i++) {
      if (this.abortPlayback) return;

      const element = morse[i];
      const duration = element === '.' ? timings.dit : timings.dah;

      // Wake a little before the element is due and place its note-on and note-off at exact times
      let at = begin + offset;
      await this.sleepUntil(at - MidiOutputService.LEAD_MS);
      if (this.abortPlayback) return;
      // The page stalled for longer than the lead: carry on from now, keeping the length of the element
      const late = performance.now() + 1 - at;
      if (late > 0) {
        begin += late;
        at += late;
      }

      for (const mapping of enabledMappings) {
        const output = this.getOutputForDevice(mapping.deviceId);
        if (!output) continue;

        // Straight key fires on every element; a paddle mapping has a dit note and a dah note
        let note = -1;
        if (mapping.mode === 'straightKey') note = mapping.value;
        else if (element === '.') note = mapping.value;
        else note = mapping.dahValue;
        if (note < 0) continue;
        const seq = this.sendNoteOn(note, velocity, mapping.channel, output, at);
        this.sendNoteOff(note, mapping.channel, output, at + duration, seq);
      }

      offset += duration + (i < morse.length - 1 ? timings.intraChar : 0);
    }

    // The next character that has no start time of its own follows this one's letter gap
    this.nextStart = begin + offset + timings.interChar;
    if (startAt === undefined) await this.sleepUntil(begin + offset - MidiOutputService.LEAD_MS);
  }

  private sleepUntil(atMs: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, atMs - performance.now())));
  }

  private sleepMs(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Sleep that can be resolved early by setting and calling spaceSleepResolve.
   * Used for the word-gap pause so incoming characters cut it short.
   * Resolves true when the whole time passed, false when it was cut short.
   */
  private interruptibleSleepMs(ms: number): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      const timer = setTimeout(() => {
        this.spaceSleepResolve = null;
        resolve(true);
      }, Math.max(0, ms));
      this.spaceSleepResolve = () => {
        clearTimeout(timer);
        resolve(false);
      };
    });
  }

  // ---- Real-time keying (used by MorseDecoderService) ----

  /**
   * Real-time key down — sends note-on on the straight key note.
   *
   * Used by the decoder to key the radio in real-time when local keyer
   * inputs (keyboard, mouse, touch) are active. This provides immediate
   * radio keying that matches the sidetone timing exactly, unlike the
   * character-based forwarding path which introduces decode delay.
   *
   * Not called for MIDI-originated inputs (fromMidi) to prevent echo loops,
   * unless relay is enabled for the specific input-output pair.
   *
   * @param source            Signal source ('rx' or 'tx')
   * @param relayInputIndex   When provided, only fire output mappings whose
   *                          relayInputIndices includes this index.
   */
  keyDown(source: 'rx' | 'tx' = 'tx', relayInputIndex?: number): void {
    if (!this.isActive()) return;
    const s = this.settings.settings();
    const velocity = 127;
    for (const mapping of s.midiOutputMappings) {
      if (!mapping.enabled || mapping.mode !== 'straightKey') continue;
      if (mapping.forward !== 'both' && mapping.forward !== source) continue;
      if (relayInputIndex !== undefined && !mapping.relayInputIndices.includes(relayInputIndex)) continue;
      if (relayInputIndex === undefined && mapping.relaySuppressOtherInputs) continue;
      const output = this.getOutputForDevice(mapping.deviceId);
      if (!output || mapping.value < 0) continue;
      this.sendNoteOn(mapping.value, velocity, mapping.channel, output);
      this.realTimeNoteKeys.add(`${mapping.value}:${mapping.channel}`);
    }
  }

  /**
   * Real-time key up — sends note-off on the straight key note.
   *
   * Counterpart to keyDown(). Safe to call even when no note is active;
   * the method checks activeNotes before sending.
   */
  keyUp(): void {
    // Release only notes activated by keyDown() (real-time straight-key path).
    // Notes from the character playback queue are managed by playCharElements()
    // and must not be released here — they run at a potentially different WPM.
    for (const key of this.realTimeNoteKeys) {
      const info = this.activeNotes.get(key);
      if (info) {
        this.sendNoteOff(info.note, info.channel, info.output);
      }
    }
    this.realTimeNoteKeys.clear();
  }

  /**
   * Test a specific mapping — send a 1-second pulse on the given note/channel.
   * Called from the MIDI output edit modal's test button.
   */
  async testMapping(note: number, channel: number, deviceId: string = ''): Promise<void> {
    const output = this.getOutputForDevice(deviceId);
    if (!output || note < 0) return;
    this.sendNoteOn(note, 127, channel, output);
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.sendNoteOff(note, channel, output);
  }

  // ---- Internal MIDI message methods ----

  /** Send a note-on, now or (with `at`, the page clock in ms) at an exact time; returns its number for the matching note-off. */
  private sendNoteOn(note: number, velocity: number, channel: number, output: MIDIOutput, at?: number): number {
    if (note < 0 || note > 127) return 0;
    // MIDI note-on: 0x90 + channel (0-based)
    const status = 0x90 | ((channel - 1) & 0x0f);
    if (at === undefined) output.send([status, note, velocity & 0x7f]);
    else output.send([status, note, velocity & 0x7f], at);
    const seq = ++this.noteSeq;
    this.activeNotes.set(`${note}:${channel}`, { note, channel, output, seq });
    // Cancel any pending holdoff — we are actively sending again
    if (this.isSendingHoldoff) {
      clearTimeout(this.isSendingHoldoff);
      this.isSendingHoldoff = null;
    }
    this.isSending.set(true);
    return seq;
  }

  /**
   * Send a note-off, now or (with `at`) at an exact time. A note-off placed ahead of time passes `seq`, the
   * number of its note-on, and the note counts as held until that time; a later note-on of the same note
   * (placed before this one fired) keeps it held.
   */
  private sendNoteOff(note: number, channel: number, output: MIDIOutput, at?: number, seq?: number): void {
    if (note < 0 || note > 127) return;
    // MIDI note-off: 0x80 + channel (0-based)
    const status = 0x80 | ((channel - 1) & 0x0f);
    if (at !== undefined && at > performance.now() + 1) {
      output.send([status, note, 0], at);
      setTimeout(() => this.noteReleased(note, channel, seq), at - performance.now());
      return;
    }
    output.send([status, note, 0]);
    this.noteReleased(note, channel);
  }

  /** A note-off has taken effect: the note is no longer held, and the sending flag follows after its holdoff. */
  private noteReleased(note: number, channel: number, seq?: number): void {
    const key = `${note}:${channel}`;
    if (seq !== undefined && this.activeNotes.get(key)?.seq !== seq) {
      // A later note-on holds the note, or everything was released meanwhile
      if (this.activeNotes.has(key)) return;
    }
    this.activeNotes.delete(key);
    if (this.activeNotes.size === 0) {
      // Don't clear isSending immediately — start a holdoff timer so
      // the physical bus has time to settle before MIDI input is unmuted.
      // If another note-on arrives before the holdoff expires, the timer
      // is cancelled in sendNoteOn and isSending stays true throughout.
      if (this.isSendingHoldoff) clearTimeout(this.isSendingHoldoff);
      this.isSendingHoldoff = setTimeout(() => {
        this.isSendingHoldoff = null;
        // Only clear if no notes were re-activated during the holdoff
        if (this.activeNotes.size === 0) {
          this.isSending.set(false);
        }
      }, MidiOutputService.SENDING_HOLDOFF_MS);
    }
  }

  /** Check whether MIDI output is globally active */
  private isActive(): boolean {
    if (!this.midiAccess) return false;
    const s = this.settings.settings();
    if (!s.midiOutputEnabled) return false;
    return true;
  }

  /** Release all currently held notes */
  private releaseAll(): void {
    for (const [, info] of this.activeNotes) {
      const status = 0x80 | ((info.channel - 1) & 0x0f);
      info.output.send([status, info.note, 0]);
    }
    this.activeNotes.clear();
    // Immediate clear — no holdoff needed when explicitly releasing all
    if (this.isSendingHoldoff) {
      clearTimeout(this.isSendingHoldoff);
      this.isSendingHoldoff = null;
    }
    this.isSending.set(false);
  }

  /**
   * Install the onstatechange handler on the current MIDIAccess object.
   * Extracted into its own method so it can be reused after re-acquisition.
   */
  private installStateChangeHandler(): void {
    if (!this.midiAccess) return;
    this.midiAccess.onstatechange = () => {
      this.zone.run(() => this.refreshOutputs());
      this.updateConnected();
      // Retry after short delays for ports that need time to settle
      // after a physical reconnection.
      for (const delay of [500, 1500]) {
        setTimeout(() => {
          if (this.started && this.midiAccess) {
            this.zone.run(() => this.refreshOutputs());
            this.updateConnected();
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
    this.connected.set(outputs.length > 0);
  }

  /**
   * Resolve a MIDI output port for the given device ID.
   * If deviceId is empty, returns the first available connected output.
   */
  getOutputForDevice(deviceId: string): MIDIOutput | null {
    if (!this.midiAccess) return null;
    let first: MIDIOutput | null = null;
    for (const output of this.midiAccess.outputs.values()) {
      if (output.state !== 'connected') continue;
      if (deviceId && output.id === deviceId) return output;
      if (!first) first = output;
    }
    return deviceId ? null : first;
  }

  /** Update the connected signal based on available outputs */
  private updateConnected(): void {
    if (!this.midiAccess) {
      this.zone.run(() => this.connected.set(false));
      return;
    }
    let hasOutput = false;
    for (const output of this.midiAccess.outputs.values()) {
      if (output.state === 'connected') { hasOutput = true; break; }
    }
    this.zone.run(() => this.connected.set(hasOutput));
  }

  private installKeepAlive(): void {
    this.clearKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (!this.started || !this.midiAccess) return;
      this.zone.run(() => this.refreshOutputs());
      this.updateConnected();
    }, 5000);
  }

  private clearKeepAlive(): void {
    if (this.keepAliveTimer !== null) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }
}
