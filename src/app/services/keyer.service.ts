/**
 * Morse Code Studio
 */

import { Injectable, OnDestroy, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
import { SettingsService, PaddleMode, InputPath, KeyboardInputMapping } from './settings.service';
import { MorseDecoderService } from './morse-decoder.service';
import { timingsFromWpm } from '../morse-table';

/**
 * Per-mapping iambic keyer state.
 *
 * Each keyboard paddle mapping gets its own independent keyer instance
 * so multiple paddle mappings can operate simultaneously without
 * corrupting each other's state.
 */
interface PaddleKeyerState {
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
  paddleMode: PaddleMode;
  path: InputPath;
}

/**
 * Keyer Service — keyboard-driven morse keyer with iambic support.
 *
 * Two independent keying modes, both active simultaneously:
 *
 *  1. **Straight key**: a single keyboard key acts as a manual morse key.
 *     Press = key down, release = key up. Timing is entirely up to the operator.
 *     The decoder auto-calibrates from the operator's timing.
 *
 *  2. **Iambic paddles**: two keyboard keys act as dit and dah paddles.
 *     The keyer auto-generates correctly timed dits and dahs at the
 *     configured WPM speed. The decoder uses perfect (mathematical) timing
 *     because element durations are exact and should not affect
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
 *  Each keyboard mapping carries its own source (RX/TX), paddle mode,
 *  name and colour. Paddle mappings each have an independent keyer loop.
 */
@Injectable({ providedIn: 'root' })
export class KeyerService implements OnDestroy {
  private keydownHandler: (e: KeyboardEvent) => void;
  private keyupHandler: (e: KeyboardEvent) => void;
  private blurHandler: () => void;

  // ---- Per-mapping straight key held state (mapping index → boolean) ----
  private straightKeyStates = new Map<number, boolean>();

  // ---- Per-mapping paddle keyer state (mapping index → PaddleKeyerState) ----
  private paddleKeyers = new Map<number, PaddleKeyerState>();

  /**
   * InputPath for the current straight key session.
   * Set when straight key input is activated.
   */
  private straightKeyPath: InputPath = 'keyboardStraightKey';

  private enabled = true;

  /**
   * Emits true on keyer key-down and false on keyer key-up for
   * iambic/paddle-generated elements. Subscribers (e.g. touch keyer
   * haptic vibration) can react to keyer timing without coupling
   * to decoder internals.
   */
  keyOutput$ = new Subject<boolean>();

  /**
   * Emits straight key press/release events with input path identifier.
   * Used by the sprite button to animate in response to keyer activity.
   */
  straightKeyEvent$ = new Subject<{ down: boolean; inputPath: InputPath }>();

  constructor(
    private settings: SettingsService,
    private decoder: MorseDecoderService,
    private zone: NgZone,
  ) {
    this.keydownHandler = (e: KeyboardEvent) => this.onKeyDown(e);
    this.keyupHandler = (e: KeyboardEvent) => this.onKeyUp(e);
    this.blurHandler = () => this.releaseAll();
    window.addEventListener('keydown', this.keydownHandler);
    window.addEventListener('keyup', this.keyupHandler);
    window.addEventListener('blur', this.blurHandler);
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.keydownHandler);
    window.removeEventListener('keyup', this.keyupHandler);
    window.removeEventListener('blur', this.blurHandler);
    this.releaseAll();
  }

  /**
   * Enable or disable the keyer.
   * When disabled, any active keying is stopped and all held keys are
   * released. Used when focus enters text input fields.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.releaseAll();
    }
  }

  /**
   * Release all held keys, stop all keyer loops, and reset all state.
   * Called on blur (window loses focus), setEnabled(false), and destroy.
   * Handles the case where keyup events are lost (common with modifier
   * keys like Ctrl, Alt, Meta during key combinations).
   */
  private releaseAll(): void {
    // Stop all paddle keyers and clear their paddle-down flags
    for (const [, ks] of this.paddleKeyers) {
      ks.leftPaddleDown = false;
      ks.rightPaddleDown = false;
      this.stopKeyer(ks);
    }
    // Release any held straight keys
    for (const [idx, held] of this.straightKeyStates) {
      if (held) {
        this.straightKeyStates.set(idx, false);
        if (idx === -1) {
          // External caller straight key (mouse/touch)
          this.straightKeyEvent$.next({ down: false, inputPath: this.straightKeyPath });
          this.zone.run(() => {
            this.decoder.onKeyUp(this.straightKeyPath, 'tx');
          });
        } else {
          const mappings = this.settings.settings().keyboardInputMappings;
          const m = mappings[idx];
          if (m) {
            this.straightKeyEvent$.next({ down: false, inputPath: 'keyboardStraightKey' });
            this.zone.run(() => {
              this.decoder.onKeyUp('keyboardStraightKey', m.source);
            });
          }
        }
      }
    }
  }

  // ---- Public input methods (used by keyboard, mouse, and touch) ----

  /**
   * Activate/deactivate straight key from any input source.
   *
   * The straight key is human-timed (perfectTiming = false), so the
   * decoder will auto-calibrate based on the measured durations.
   * The source determines which calibration pool (RX or TX) receives samples.
   *
   * @param down       true = key pressed, false = key released
   * @param source     decoder source override ('rx' or 'tx'); defaults to 'tx'
   * @param force      when true, bypass the enabled check (used by MIDI input
   *                   so it works even when the keyboard keyer is disabled)
   * @param inputPath  pipeline identifier; defaults to 'keyboardStraightKey'
   * @param opts       optional name/color metadata for decoder tagging
   */
  straightKeyInput(
    down: boolean, source?: 'rx' | 'tx', force = false,
    inputPath?: InputPath, opts?: { name?: string; color?: string },
  ): void {
    if (!this.enabled && !force) return;
    const src = source ?? 'tx';
    const path = inputPath ?? 'keyboardStraightKey';
    const fromMidi = path === 'midiStraightKey' || path === 'midiPaddle';
    const name = opts?.name;
    const color = opts?.color;
    // Track straight key state using a simple flag on the path
    const wasDown = this.straightKeyPath === path && this.straightKeyStates.get(-1);
    if (down && !wasDown) {
      this.straightKeyStates.set(-1, true);
      this.straightKeyPath = path;
      this.straightKeyEvent$.next({ down: true, inputPath: path });
      this.zone.run(() => {
        this.decoder.onKeyDown(path, src, { fromMidi, name, color });
      });
    } else if (!down && wasDown) {
      this.straightKeyStates.set(-1, false);
      this.straightKeyEvent$.next({ down: false, inputPath: path });
      this.zone.run(() => {
        this.decoder.onKeyUp(path, src, { fromMidi, name, color });
      });
    }
  }

  /**
   * Activate/deactivate the dit paddle directly (no reversal applied here).
   *
   * @param down       true = paddle pressed, false = paddle released
   * @param source     decoder source override; defaults to 'tx'
   * @param force      when true, bypass the enabled check (used by MIDI input)
   * @param inputPath  pipeline identifier; defaults to 'keyboardPaddle'
   * @param paddleMode paddle mode override; defaults to 'iambic-b'
   * @param opts       optional name/color metadata
   */
  ditPaddleInput(
    down: boolean, source?: 'rx' | 'tx', force = false,
    inputPath?: InputPath, paddleMode?: PaddleMode,
    opts?: { name?: string; color?: string },
  ): void {
    if (!this.enabled && !force) return;
    const src = source ?? 'tx';
    const path = inputPath ?? 'keyboardPaddle';
    const mode = paddleMode ?? this.settings.settings().paddleMode;
    const ks = this.getOrCreatePaddleKeyer(-1, src, mode, path, opts?.name, opts?.color);
    if (down && !ks.leftPaddleDown) {
      ks.leftPaddleDown = true;
      ks.ditMemory = true;
      this.startKeyer(ks);
    } else if (!down) {
      ks.leftPaddleDown = false;
      this.checkStopKeyer(ks);
    }
  }

  /**
   * Activate/deactivate the dah paddle directly (no reversal applied here).
   *
   * @param down       true = paddle pressed, false = paddle released
   * @param source     decoder source override; defaults to 'tx'
   * @param force      when true, bypass the enabled check (used by MIDI input)
   * @param inputPath  pipeline identifier; defaults to 'keyboardPaddle'
   * @param paddleMode paddle mode override; defaults to 'iambic-b'
   * @param opts       optional name/color metadata
   */
  dahPaddleInput(
    down: boolean, source?: 'rx' | 'tx', force = false,
    inputPath?: InputPath, paddleMode?: PaddleMode,
    opts?: { name?: string; color?: string },
  ): void {
    if (!this.enabled && !force) return;
    const src = source ?? 'tx';
    const path = inputPath ?? 'keyboardPaddle';
    const mode = paddleMode ?? this.settings.settings().paddleMode;
    const ks = this.getOrCreatePaddleKeyer(-1, src, mode, path, opts?.name, opts?.color);
    if (down && !ks.rightPaddleDown) {
      ks.rightPaddleDown = true;
      ks.dahMemory = true;
      this.startKeyer(ks);
    } else if (!down) {
      ks.rightPaddleDown = false;
      this.checkStopKeyer(ks);
    }
  }

  // ---- Keyboard event handlers ----

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.enabled) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const s = this.settings.settings();
    if (!s.keyboardKeyerEnabled) return;

    const mappings = s.keyboardInputMappings;
    for (let i = 0; i < mappings.length; i++) {
      const m = mappings[i];
      if (!m.enabled) continue;
      if (m.mode === 'straightKey' && e.code === m.keyCode) {
        e.preventDefault();
        this.handleStraightKeyDown(i, m);
        return;
      }
      if (m.mode === 'paddle') {
        const reverse = m.reversePaddles;
        if (e.code === m.keyCode) {
          e.preventDefault();
          if (reverse) this.handlePaddleDahDown(i, m);
          else this.handlePaddleDitDown(i, m);
          return;
        }
        if (e.code === m.dahKeyCode) {
          e.preventDefault();
          if (reverse) this.handlePaddleDitDown(i, m);
          else this.handlePaddleDahDown(i, m);
          return;
        }
      }
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (!this.enabled) return;
    const s = this.settings.settings();
    if (!s.keyboardKeyerEnabled) return;

    const mappings = s.keyboardInputMappings;
    let releasedIdx = -1;
    for (let i = 0; i < mappings.length; i++) {
      const m = mappings[i];
      if (!m.enabled) continue;
      if (m.mode === 'straightKey' && e.code === m.keyCode) {
        e.preventDefault();
        this.handleStraightKeyUp(i, m);
        releasedIdx = i;
        break;
      }
      if (m.mode === 'paddle') {
        const reverse = m.reversePaddles;
        if (e.code === m.keyCode) {
          e.preventDefault();
          if (reverse) this.handlePaddleDahUp(i, m);
          else this.handlePaddleDitUp(i, m);
          releasedIdx = i;
          break;
        }
        if (e.code === m.dahKeyCode) {
          e.preventDefault();
          if (reverse) this.handlePaddleDitUp(i, m);
          else this.handlePaddleDahUp(i, m);
          releasedIdx = i;
          break;
        }
      }
    }
    // Release partner keys stuck by modifier combos (e.g. Ctrl+[)
    this.releaseStuckModifierCombos(e, releasedIdx, mappings);
  }

  /**
   * After a keyup is processed, check whether keys held by OTHER
   * mappings are stuck due to modifier key combinations.
   *
   * When a modifier key (Ctrl, Alt, Shift, Meta) is involved in a
   * simultaneous multi-mapping press, the browser may swallow keyup
   * events for one of the keys (e.g. Ctrl+[ interpreted as Escape).
   *
   * Strategy:
   *  1. For held modifier-key mappings, check event flags (e.ctrlKey etc.)
   *     to verify the modifier is still physically held. If not, release.
   *  2. When a mapped modifier is released, release all other held
   *     non-modifier mapping keys (their keyup may have been swallowed).
   *     If still physically held, the next repeat keydown reactivates them.
   */
  private releaseStuckModifierCombos(
    e: KeyboardEvent, releasedIdx: number, mappings: KeyboardInputMapping[],
  ): void {
    const releasedIsModifier = this.isModifierKeyCode(e.code);

    for (let i = 0; i < mappings.length; i++) {
      if (i === releasedIdx) continue;
      const m = mappings[i];
      if (!m.enabled) continue;

      // --- Check paddle keyer state ---
      const ks = this.paddleKeyers.get(i);
      if (ks && (ks.leftPaddleDown || ks.rightPaddleDown)) {
        let shouldRelease = false;

        // Check 1: modifier keys in this mapping verified via event flags
        const keyCodes = m.mode === 'paddle'
          ? [m.keyCode, m.dahKeyCode].filter(Boolean) as string[]
          : [m.keyCode];
        for (const code of keyCodes) {
          if (this.isModifierKeyCode(code) && !this.isModifierHeldByEvent(e, code)) {
            shouldRelease = true;
            break;
          }
        }
        // Check 2: a mapped modifier was released — non-modifier partners
        // may have had their keyup swallowed by the combo
        if (releasedIsModifier && releasedIdx >= 0) {
          shouldRelease = true;
        }

        if (shouldRelease) {
          ks.leftPaddleDown = false;
          ks.rightPaddleDown = false;
          this.stopKeyer(ks);
        }
      }

      // --- Check straight key state ---
      if (this.straightKeyStates.get(i)) {
        let shouldRelease = false;
        if (this.isModifierKeyCode(m.keyCode) && !this.isModifierHeldByEvent(e, m.keyCode)) {
          shouldRelease = true;
        }
        if (releasedIsModifier && releasedIdx >= 0) {
          shouldRelease = true;
        }
        if (shouldRelease) {
          this.handleStraightKeyUp(i, m);
        }
      }
    }
  }

  private isModifierKeyCode(code: string): boolean {
    return code === 'ControlLeft' || code === 'ControlRight' ||
           code === 'AltLeft' || code === 'AltRight' ||
           code === 'ShiftLeft' || code === 'ShiftRight' ||
           code === 'MetaLeft' || code === 'MetaRight';
  }

  private isModifierHeldByEvent(e: KeyboardEvent, code: string): boolean {
    switch (code) {
      case 'ControlLeft': case 'ControlRight': return e.ctrlKey;
      case 'AltLeft': case 'AltRight': return e.altKey;
      case 'ShiftLeft': case 'ShiftRight': return e.shiftKey;
      case 'MetaLeft': case 'MetaRight': return e.metaKey;
      default: return false;
    }
  }

  // ---- Per-mapping straight key handlers ----

  private handleStraightKeyDown(idx: number, m: KeyboardInputMapping): void {
    if (this.straightKeyStates.get(idx)) return; // already held
    this.straightKeyStates.set(idx, true);
    this.straightKeyEvent$.next({ down: true, inputPath: 'keyboardStraightKey' });
    this.zone.run(() => {
      this.decoder.onKeyDown('keyboardStraightKey', m.source, {
        name: m.name || undefined, color: m.color || undefined,
      });
    });
  }

  private handleStraightKeyUp(idx: number, m: KeyboardInputMapping): void {
    if (!this.straightKeyStates.get(idx)) return; // not held
    this.straightKeyStates.set(idx, false);
    this.straightKeyEvent$.next({ down: false, inputPath: 'keyboardStraightKey' });
    this.zone.run(() => {
      this.decoder.onKeyUp('keyboardStraightKey', m.source, {
        name: m.name || undefined, color: m.color || undefined,
      });
    });
  }

  // ---- Per-mapping paddle handlers ----

  private handlePaddleDitDown(idx: number, m: KeyboardInputMapping): void {
    const path: InputPath = `keyboardPaddle:${idx}`;
    const ks = this.getOrCreatePaddleKeyer(idx, m.source, m.paddleMode, path, m.name, m.color);
    if (ks.leftPaddleDown) return;
    ks.leftPaddleDown = true;
    ks.ditMemory = true;
    this.startKeyer(ks);
  }

  private handlePaddleDitUp(idx: number, m: KeyboardInputMapping): void {
    const ks = this.paddleKeyers.get(idx);
    if (!ks) return;
    ks.leftPaddleDown = false;
    this.checkStopKeyer(ks);
  }

  private handlePaddleDahDown(idx: number, m: KeyboardInputMapping): void {
    const path: InputPath = `keyboardPaddle:${idx}`;
    const ks = this.getOrCreatePaddleKeyer(idx, m.source, m.paddleMode, path, m.name, m.color);
    if (ks.rightPaddleDown) return;
    ks.rightPaddleDown = true;
    ks.dahMemory = true;
    this.startKeyer(ks);
  }

  private handlePaddleDahUp(idx: number, m: KeyboardInputMapping): void {
    const ks = this.paddleKeyers.get(idx);
    if (!ks) return;
    ks.rightPaddleDown = false;
    this.checkStopKeyer(ks);
  }

  // ---- Paddle Keyer State Management ----

  private getOrCreatePaddleKeyer(
    idx: number, source: 'rx' | 'tx', paddleMode: PaddleMode,
    path: InputPath,
    name?: string, color?: string,
  ): PaddleKeyerState {
    let ks = this.paddleKeyers.get(idx);
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
        name: name || '',
        color: color || '',
        paddleMode,
        path,
      };
      this.paddleKeyers.set(idx, ks);
    }
    ks.source = source;
    ks.path = path;
    ks.name = name || '';
    ks.color = color || '';
    ks.paddleMode = paddleMode;
    return ks;
  }

  // ---- Iambic Keyer Logic ----

  private startKeyer(ks: PaddleKeyerState): void {
    if (ks.keyerRunning) return;
    ks.keyerRunning = true;
    this.runKeyerLoop(ks);
  }

  private stopKeyer(ks: PaddleKeyerState): void {
    ks.keyerRunning = false;
    if (ks.keyerTimeout) {
      clearTimeout(ks.keyerTimeout);
      ks.keyerTimeout = null;
    }
    if (ks.elementPlaying) {
      ks.elementPlaying = false;
      const fromMidi = ks.path.startsWith('midiPaddle');
      this.zone.run(() => {
        this.decoder.onKeyUp(ks.path, ks.source, {
          perfectTiming: true, fromMidi,
          name: ks.name || undefined, color: ks.color || undefined,
        });
        this.keyOutput$.next(false);
      });
    }
    ks.currentElement = null;
    ks.lastElement = null;
    ks.ditMemory = false;
    ks.dahMemory = false;
  }

  private stopAllKeyers(): void {
    for (const [, ks] of this.paddleKeyers) {
      this.stopKeyer(ks);
    }
  }

  private checkStopKeyer(ks: PaddleKeyerState): void {
    if (!ks.leftPaddleDown && !ks.rightPaddleDown &&
        !ks.ditMemory && !ks.dahMemory && !ks.elementPlaying) {
      this.stopKeyer(ks);
    }
  }

  private runKeyerLoop(ks: PaddleKeyerState): void {
    if (!ks.keyerRunning) return;

    const timings = timingsFromWpm(this.settings.settings().keyerWpm);
    const nextElement = this.pickNextElement(ks);

    if (!nextElement) {
      this.stopKeyer(ks);
      return;
    }

    ks.currentElement = nextElement;
    const duration = nextElement === 'dit' ? timings.dit : timings.dah;

    // Key down — keyer produces perfect timing, so set perfectTiming = true
    ks.elementPlaying = true;
    const fromMidi = ks.path.startsWith('midiPaddle');
    this.zone.run(() => {
      this.decoder.onKeyDown(ks.path, ks.source, {
        perfectTiming: true, fromMidi,
        name: ks.name || undefined, color: ks.color || undefined,
      });
      this.keyOutput$.next(true);
    });

    // Schedule key up after element duration outside Angular zone to avoid
    // triggering change detection on every setTimeout callback. The decoder
    // calls inside still use zone.run() for UI updates.
    this.zone.runOutsideAngular(() => {
      ks.keyerTimeout = setTimeout(() => {
        ks.elementPlaying = false;
        this.zone.run(() => {
          this.decoder.onKeyUp(ks.path, ks.source, {
            perfectTiming: true, fromMidi,
            name: ks.name || undefined, color: ks.color || undefined,
          });
          this.keyOutput$.next(false);
        });
        ks.lastElement = ks.currentElement;
        ks.currentElement = null;

        // Inter-element space (1 dit)
        ks.keyerTimeout = setTimeout(() => {
          if (ks.keyerRunning) {
            if (ks.leftPaddleDown || ks.rightPaddleDown ||
                ks.ditMemory || ks.dahMemory) {
              this.runKeyerLoop(ks);
            } else {
              this.stopKeyer(ks);
            }
          }
        }, timings.intraChar);
      }, duration);
    });
  }

  /**
   * Pick the next element to play based on the current paddle mode.
   *
   * Combines physical paddle state with latched memory to determine
   * whether to play a dit, dah, or nothing. Each mode has different
   * rules for what happens when both paddles are active ("squeezed").
   */
  private pickNextElement(ks: PaddleKeyerState): 'dit' | 'dah' | null {
    const mode = ks.paddleMode;
    // Merge physical paddle state with memory flags
    const hasDit = ks.leftPaddleDown || ks.ditMemory;
    const hasDah = ks.rightPaddleDown || ks.dahMemory;

    let picked: 'dit' | 'dah' | null = null;

    const bothActive = hasDit && hasDah;

    if (mode === 'iambic-b' || mode === 'iambic-a') {
      if (bothActive) {
        // Alternate
        if (ks.lastElement === 'dit') picked = 'dah';
        else if (ks.lastElement === 'dah') picked = 'dit';
        else picked = 'dit';
      } else if (hasDit) {
        picked = 'dit';
      } else if (hasDah) {
        picked = 'dah';
      } else if (mode === 'iambic-b' && ks.lastElement) {
        // Iambic B: one extra alternate element after squeeze release
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

    // Only consume the memory for the element that was actually picked;
    // preserve the opposite memory so it plays on the next cycle.
    if (picked === 'dit') {
      ks.ditMemory = false;
    } else if (picked === 'dah') {
      ks.dahMemory = false;
    }

    return picked;
  }
}
