/**
 * Morse Code Studio
 */

import { Directive, HostListener, Output, EventEmitter } from '@angular/core';

/**
 * Emits when the dim area behind a dialog is clicked — and only then.
 *
 * A browser sends a click to the common ancestor when a press starts in one
 * element and is released in another. Without this check, dragging from a text
 * box inside a dialog to select text and releasing over the dim area would be
 * taken as a click on it and close the dialog. The press must also have begun
 * on the backdrop itself.
 */
@Directive({
  selector: '[appBackdropClick]',
  standalone: true,
})
export class BackdropClickDirective {
  @Output() appBackdropClick = new EventEmitter<MouseEvent>();

  private pressedOnBackdrop = false;

  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent): void {
    this.pressedOnBackdrop = event.target === event.currentTarget;
  }

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent): void {
    const started = this.pressedOnBackdrop;
    this.pressedOnBackdrop = false;
    if (started && event.target === event.currentTarget) this.appBackdropClick.emit(event);
  }
}
