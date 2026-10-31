/**
 * Morse Code Studio
 */

import { Directive, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { ModalBackService } from '../services/modal-back.service';

/**
 * Put on the root element of a popup that is shown with `@if` inside Settings, a wizard
 * step or a card. While the element exists, the browser Back button closes the popup
 * (through `appBackClose`) instead of the dialog underneath it. The function returns
 * true when the popup stays open after handling Back.
 */
@Directive({
  selector: '[appBackClose]',
  standalone: true,
})
export class BackCloseDirective implements OnInit, OnDestroy {
  @Input({ required: true }) appBackClose!: () => boolean | void;

  /** Leave Back alone (the app shell already manages this popup's history entry) */
  @Input() backCloseDisabled = false;

  private readonly modalBack = inject(ModalBackService);
  private release: (() => void) | null = null;

  ngOnInit(): void {
    if (!this.backCloseDisabled) this.release = this.modalBack.open(() => this.appBackClose());
  }

  ngOnDestroy(): void {
    this.release?.();
  }
}
