/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Injectable, OnDestroy, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
import { SettingsService, PaddleMode } from './settings.service';
import { MorseDecoderService } from './morse-decoder.service';
import { timingsFromWpm } from '../morse-table';

/**
 * Keyer Service — keyboard-driven morse keyer with iambic support.
 *
 * Two independent keying modes, both active simultaneously:
 *
 *  1. **Straight key**: a single keyboard key acts as a manual morse key.
 *     Press = key down, release = key up. Timing is entirely up to the operator.
 *     Sets `decoder.perfectTiming = false` so the decoder auto-calibrates.
 *
 *  2. **Iambic paddles**: two keyboard keys act as dit and dah paddles.
 *     The keyer auto-generates correctly timed dits and dahs at the
 *     configured WPM speed. Sets `decoder.perfectTiming = true` because
 *     element durations are mathematically exact and should not affect
 *     the adaptive calibration pools.
 *     Supported modes:
 *     - **Iambic B**: squeezing both paddles alternates dit/dah; releasing
 *       produces one extra element (standard contest keyer behaviour).
 *     - **Iambic A**: like B but stops immediately when paddles are released.
 *     - **Ultimatic**: squeezing both paddles repeats the last-pressed element.
 *     - **Single lever**: no automatic alternation; each paddle repeats its
 *       own element only.
 *
 *  Dit/dah memory: pressing the opposite paddle during an element latches
 *  that request so it plays on the next cycle. This is how experienced
 *  operators achieve fast, clean keying.
 *
 *  Decoder source routing:
 *  Each public input method accepts an optional `source` parameter ('rx' or 'tx')
 *  that determines which decoder calibration pool receives the timing samples.
 *  Mouse and touch keyers pass their own configured source; keyboard defaults
 *  to `keyboardStraightKeySource` or `keyboardPaddleSource` from settings.
 *  This allows the user to assign straight key and paddle to different
 *  RX or TX decoder pools.
 */
@Injectable({ providedIn: 'root' })
export class KeyerService implements OnDestroy {
  private keydownHandler: (e: KeyboardEvent) => void;
  private keyupHandler: (e: KeyboardEvent) => void;

  // ---- Straight key state ----
  /** Whether the straight key keyboard key is currently held down */
  private straightKeyDown = false;

  // ---- Paddle state (physical keyboard keys held) ----
  private leftPaddleDown = false;  // dit paddle
  private rightPaddleDown = false; // dah paddle

  // ---- Dit/dah memory ----
  /** Latched: operator pressed dit paddle during a dah (or vice versa) */
  private ditMemory = false;
  private dahMemory = false;

  // ---- Iambic keyer timing state ----
  private keyerTimeout: ReturnType<typeof setTimeout> | null = null;
  private currentElement: 'dit' | 'dah' | null = null;
  private lastElement: 'dit' | 'dah' | null = null;
  private elementPlaying = false;
  private keyerRunning = false;

  /**
   * Decoder source for the current paddle session.
   * Set when a paddle input is activated; used by runKeyerLoop to tag
   * the generated elements with the correct RX/TX source.
   */
  private paddleSource: 'rx' | 'tx' = 'tx';

  private enabled = true;

  /**
   * Emits true on keyer key-down and false on keyer key-up for
   * iambic/paddle-generated elements. Subscribers (e.g. touch keyer
   * haptic vibration) can react to keyer timing without coupling
   * to decoder internals.
   */
  keyOutput$ = new Subject<boolean>();

  constructor(
    private settings: SettingsService,
    private decoder: MorseDecoderService,
    private zone: NgZone,
  ) {
    this.keydownHandler = (e: KeyboardEvent) => this.onKeyDown(e);
    this.keyupHandler = (e: KeyboardEvent) => this.onKeyUp(e);
    window.addEventListener('keydown', this.keydownHandler);
    window.addEventListener('keyup', this.keyupHandler);
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.keydownHandler);
    window.removeEventListener('keyup', this.keyupHandler);
    this.stopKeyer();
  }

  /**
   * Enable or disable the keyer.
   * When disabled, any active keying is stopped and the straight key is
   * released. Used when focus enters text input fields.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopKeyer();
      if (this.straightKeyDown) {
        this.straightKeyDown = false;
        this.decoder.keySource = this.settings.settings().keyboardStraightKeySource;
        this.decoder.perfectTiming = false;
        this.decoder.onKeyUp();
      }
    }
  }

  // ---- Public input methods (used by keyboard, mouse, and touch) ----

  /**
   * Activate/deactivate straight key from any input source.
   *
   * The straight key is human-timed (perfectTiming = false), so the
   * decoder will auto-calibrate based on the measured durations.
   * The keySource is set from the calling input's configured decoder
   * source (keyboard/mouse/touch), which determines which calibration
   * pool (RX or TX) receives the samples.
   *
   * @param down    true = key pressed, false = key released
   * @param source  decoder source override ('rx' or 'tx'); defaults to
   *                the keyboard keyer's configured source
   */
  straightKeyInput(down: boolean, source?: 'rx' | 'tx'): void {
    if (!this.enabled) return;
    const src = source ?? this.settings.settings().keyboardStraightKeySource;
    if (down && !this.straightKeyDown) {
      this.straightKeyDown = true;
      this.zone.run(() => {
        this.decoder.keySource = src;
        this.decoder.perfectTiming = false;
        this.decoder.onKeyDown();
      });
    } else if (!down && this.straightKeyDown) {
      this.straightKeyDown = false;
      this.zone.run(() => {
        this.decoder.keySource = src;
        this.decoder.perfectTiming = false;
        this.decoder.onKeyUp();
      });
    }
  }

  /**
   * Activate/deactivate the dit paddle directly (no reversal applied here).
   *
   * @param down    true = paddle pressed, false = paddle released
   * @param source  decoder source override; defaults to keyboard keyer source
   */
  ditPaddleInput(down: boolean, source?: 'rx' | 'tx'): void {
    if (!this.enabled) return;
    this.paddleSource = source ?? this.settings.settings().keyboardPaddleSource;
    if (down && !this.leftPaddleDown) {
      this.leftPaddleDown = true;
      this.ditMemory = true;
      this.startKeyer();
    } else if (!down) {
      this.leftPaddleDown = false;
      this.checkStopKeyer();
    }
  }

  /**
   * Activate/deactivate the dah paddle directly (no reversal applied here).
   *
   * @param down    true = paddle pressed, false = paddle released
   * @param source  decoder source override; defaults to keyboard keyer source
   */
  dahPaddleInput(down: boolean, source?: 'rx' | 'tx'): void {
    if (!this.enabled) return;
    this.paddleSource = source ?? this.settings.settings().keyboardPaddleSource;
    if (down && !this.rightPaddleDown) {
      this.rightPaddleDown = true;
      this.dahMemory = true;
      this.startKeyer();
    } else if (!down) {
      this.rightPaddleDown = false;
      this.checkStopKeyer();
    }
  }

  // ---- Keyboard event handlers ----

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.enabled) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const s = this.settings.settings();
    if (!s.keyboardKeyerEnabled) return;

    if (e.code === s.straightKeyCode) {
      e.preventDefault();
      this.straightKeyInput(true);
      return;
    }

    const reverse = s.keyboardReversePaddles;
    if (e.code === s.leftPaddleKeyCode) {
      e.preventDefault();
      if (reverse) this.dahPaddleInput(true); else this.ditPaddleInput(true);
    }

    if (e.code === s.rightPaddleKeyCode) {
      e.preventDefault();
      if (reverse) this.ditPaddleInput(true); else this.dahPaddleInput(true);
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (!this.enabled) return;
    const s = this.settings.settings();
    if (!s.keyboardKeyerEnabled) return;

    if (e.code === s.straightKeyCode) {
      e.preventDefault();
      this.straightKeyInput(false);
      return;
    }

    const reverse = s.keyboardReversePaddles;
    if (e.code === s.leftPaddleKeyCode) {
      if (reverse) this.dahPaddleInput(false); else this.ditPaddleInput(false);
    }

    if (e.code === s.rightPaddleKeyCode) {
      if (reverse) this.ditPaddleInput(false); else this.dahPaddleInput(false);
    }
  }

  // ---- Iambic Keyer Logic ----

  private startKeyer(): void {
    if (this.keyerRunning) return;
    this.keyerRunning = true;
    this.runKeyerLoop();
  }

  private stopKeyer(): void {
    this.keyerRunning = false;
    if (this.keyerTimeout) {
      clearTimeout(this.keyerTimeout);
      this.keyerTimeout = null;
    }
    if (this.elementPlaying) {
      this.elementPlaying = false;
      this.zone.run(() => {
        this.decoder.keySource = this.paddleSource;
        this.decoder.perfectTiming = true;
        this.decoder.onKeyUp();
        this.keyOutput$.next(false);
      });
    }
    this.currentElement = null;
    this.lastElement = null;
    this.ditMemory = false;
    this.dahMemory = false;
  }

  private checkStopKeyer(): void {
    if (!this.leftPaddleDown && !this.rightPaddleDown &&
        !this.ditMemory && !this.dahMemory && !this.elementPlaying) {
      this.stopKeyer();
    }
  }

  private runKeyerLoop(): void {
    if (!this.keyerRunning) return;

    const mode = this.settings.settings().paddleMode;
    const timings = timingsFromWpm(this.settings.settings().keyerWpm);

    const nextElement = this.pickNextElement(mode);

    if (!nextElement) {
      this.stopKeyer();
      return;
    }

    this.currentElement = nextElement;
    const duration = nextElement === 'dit' ? timings.dit : timings.dah;

    // Key down — keyer produces perfect timing, so set perfectTiming = true
    this.elementPlaying = true;
    this.zone.run(() => {
      this.decoder.keySource = this.paddleSource;
      this.decoder.perfectTiming = true;
      this.decoder.onKeyDown();
      this.keyOutput$.next(true);
    });

    // Schedule key up after element duration
    this.keyerTimeout = setTimeout(() => {
      this.elementPlaying = false;
      this.zone.run(() => {
        this.decoder.onKeyUp();
        this.keyOutput$.next(false);
      });
      this.lastElement = this.currentElement;
      this.currentElement = null;

      // Inter-element space (1 dit)
      this.keyerTimeout = setTimeout(() => {
        if (this.keyerRunning) {
          if (this.leftPaddleDown || this.rightPaddleDown ||
              this.ditMemory || this.dahMemory) {
            this.runKeyerLoop();
          } else {
            this.stopKeyer();
          }
        }
      }, timings.intraChar);
    }, duration);
  }

  /**
   * Pick the next element to play based on the current paddle mode.
   *
   * Combines physical paddle state with latched memory to determine
   * whether to play a dit, dah, or nothing. Each mode has different
   * rules for what happens when both paddles are active ("squeezed").
   */
  private pickNextElement(mode: PaddleMode): 'dit' | 'dah' | null {
    // Merge physical paddle state with memory flags
    const hasDit = this.leftPaddleDown || this.ditMemory;
    const hasDah = this.rightPaddleDown || this.dahMemory;

    let picked: 'dit' | 'dah' | null = null;

    const bothActive = hasDit && hasDah;

    if (mode === 'iambic-b' || mode === 'iambic-a') {
      if (bothActive) {
        // Alternate
        if (this.lastElement === 'dit') picked = 'dah';
        else if (this.lastElement === 'dah') picked = 'dit';
        else picked = 'dit';
      } else if (hasDit) {
        picked = 'dit';
      } else if (hasDah) {
        picked = 'dah';
      } else if (mode === 'iambic-b' && this.lastElement) {
        // Iambic B: one extra alternate element after squeeze release
        picked = this.lastElement === 'dit' ? 'dah' : 'dit';
      }
    } else if (mode === 'ultimatic') {
      if (bothActive) {
        picked = this.lastElement || 'dit';
      } else if (hasDit) {
        picked = 'dit';
      } else if (hasDah) {
        picked = 'dah';
      }
    } else if (mode === 'single-lever') {
      if (hasDit) picked = 'dit';
      else if (hasDah) picked = 'dah';
    }

    // Only consume the memory for the element that was actually picked;
    // preserve the opposite memory so it plays on the next cycle.
    if (picked === 'dit') {
      this.ditMemory = false;
    } else if (picked === 'dah') {
      this.dahMemory = false;
    }

    return picked;
  }
}
