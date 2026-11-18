/**
 * Morse Code Studio
 */

import { Subject } from 'rxjs';
import type { InputPath } from './settings.service';

/** A paddle contact closing or opening: the dit paddle or the dah paddle of one input path. */
export interface PaddleContactEvent {
  down: boolean;
  /** The element the paddle makes, after the input's own reverse setting was applied */
  element: 'dit' | 'dah';
  inputPath: InputPath;
}

/**
 * Tracks which paddle contacts are held per input path and announces every change once.
 *
 * The keyers (keyboard, mouse, touch, MIDI, serial) all know when a paddle is pressed or released;
 * this lets the main-screen paddle sprite follow them without knowing their internals. A repeated
 * press or release is ignored, and `releasePath()` / `releaseAll()` close every held contact so
 * the sprite can never stay pressed after an input is reset.
 */
export class PaddleContacts {
  /** Emits once for every contact that really changes */
  readonly event$ = new Subject<PaddleContactEvent>();

  private readonly held = new Map<InputPath, { dit: boolean; dah: boolean }>();

  /** Close or open one paddle contact. */
  set(inputPath: InputPath, element: 'dit' | 'dah', down: boolean): void {
    let state = this.held.get(inputPath);
    if (!state) {
      if (!down) return;
      state = { dit: false, dah: false };
      this.held.set(inputPath, state);
    }
    if (state[element] === down) return;
    state[element] = down;
    this.event$.next({ down, element, inputPath });
  }

  /** Release both paddles of one input path. */
  releasePath(inputPath: InputPath): void {
    this.set(inputPath, 'dit', false);
    this.set(inputPath, 'dah', false);
  }

  /** Release every held paddle. */
  releaseAll(): void {
    for (const inputPath of [...this.held.keys()]) this.releasePath(inputPath);
  }
}
