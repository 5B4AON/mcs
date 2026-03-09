/**
 * Morse Code Studio
 */

import { Injectable, OnDestroy } from '@angular/core';
import { SettingsService, MouseButtonAction } from './settings.service';
import { KeyerService } from './keyer.service';

/**
 * Mouse Keyer Service — maps mouse button presses to keyer inputs.
 *
 * Left, middle, and right mouse buttons can each be mapped to straight key,
 * left paddle, or right paddle (or none). Mouse events are captured only
 * on elements explicitly attached via `attach()`.
 *
 * The service prevents the context menu when right-click is mapped to an
 * action, and prevents default for all mapped mouse buttons to avoid
 * text selection or other browser behaviour in the capture area.
 */
@Injectable({ providedIn: 'root' })
export class MouseKeyerService implements OnDestroy {
  /** Currently attached elements */
  private elements = new Set<HTMLElement>();

  /** Track which buttons are currently held (to release on detach) */
  private activeButtons = new Map<number, MouseButtonAction>();

  private mousedownHandler = (e: MouseEvent) => this.onMouseDown(e);
  private mouseupHandler = (e: MouseEvent) => this.onMouseUp(e);
  private contextmenuHandler = (e: MouseEvent) => this.onContextMenu(e);

  constructor(
    private settings: SettingsService,
    private keyer: KeyerService,
  ) {}

  ngOnDestroy(): void {
    this.detachAll();
  }

  /** Start capturing mouse events on the given element */
  attach(el: HTMLElement): void {
    if (this.elements.has(el)) return;
    this.elements.add(el);
    el.addEventListener('mousedown', this.mousedownHandler);
    el.addEventListener('mouseup', this.mouseupHandler);
    el.addEventListener('contextmenu', this.contextmenuHandler);
  }

  /** Stop capturing mouse events on the given element */
  detach(el: HTMLElement): void {
    if (!this.elements.has(el)) return;
    this.elements.delete(el);
    el.removeEventListener('mousedown', this.mousedownHandler);
    el.removeEventListener('mouseup', this.mouseupHandler);
    el.removeEventListener('contextmenu', this.contextmenuHandler);
    this.releaseAll();
  }

  /** Detach from all elements and release any active keys */
  detachAll(): void {
    for (const el of this.elements) {
      el.removeEventListener('mousedown', this.mousedownHandler);
      el.removeEventListener('mouseup', this.mouseupHandler);
      el.removeEventListener('contextmenu', this.contextmenuHandler);
    }
    this.elements.clear();
    this.releaseAll();
  }

  private onMouseDown(e: MouseEvent): void {
    if (!this.settings.settings().mouseKeyerEnabled) return;
    const action = this.actionForButton(e.button);
    if (action === 'none') return;

    e.preventDefault();
    this.activeButtons.set(e.button, action);
    this.dispatchAction(action, true);
  }

  private onMouseUp(e: MouseEvent): void {
    const action = this.activeButtons.get(e.button);
    if (!action) return;

    e.preventDefault();
    this.activeButtons.delete(e.button);
    this.dispatchAction(action, false);
  }

  private onContextMenu(e: MouseEvent): void {
    // Prevent context menu when right-click is mapped
    if (!this.settings.settings().mouseKeyerEnabled) return;
    const action = this.actionForButton(2);
    if (action !== 'none') {
      e.preventDefault();
    }
  }

  /** Map mouse button number (0=left, 1=middle, 2=right) to configured action */
  private actionForButton(button: number): MouseButtonAction {
    const s = this.settings.settings();
    switch (button) {
      case 0: return s.mouseLeftAction;
      case 1: return s.mouseMiddleAction;
      case 2: return s.mouseRightAction;
      default: return 'none';
    }
  }

  /**
   * Route the action to the keyer service, applying mouse reverse paddles.
   *
   * Passes the configured mouseKeyerSource and the appropriate InputPath
   * so the keyer can tag decoder events with the correct RX/TX source
   * and route them through the correct pipeline.
   */
  private dispatchAction(action: MouseButtonAction, down: boolean): void {
    const s = this.settings.settings();
    const reverse = s.mouseReversePaddles;
    const source = s.mouseKeyerSource;
    switch (action) {
      case 'straightKey':
        this.keyer.straightKeyInput(down, source, false, 'mouseStraightKey');
        break;
      case 'dit':
        if (reverse) this.keyer.dahPaddleInput(down, source, false, 'mousePaddle'); else this.keyer.ditPaddleInput(down, source, false, 'mousePaddle');
        break;
      case 'dah':
        if (reverse) this.keyer.ditPaddleInput(down, source, false, 'mousePaddle'); else this.keyer.dahPaddleInput(down, source, false, 'mousePaddle');
        break;
    }
  }

  /** Release all currently active buttons (used on detach / disable) */
  private releaseAll(): void {
    for (const [, action] of this.activeButtons) {
      this.dispatchAction(action, false);
    }
    this.activeButtons.clear();
  }
}
