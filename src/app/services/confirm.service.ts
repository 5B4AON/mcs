/**
 * Morse Code Studio
 */

import { ApplicationRef, EnvironmentInjector, Injectable, createComponent, inject } from '@angular/core';
import { ConfirmDialogComponent } from '../components/confirm-dialog/confirm-dialog.component';
import { ModalBackService } from './modal-back.service';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

/**
 * Shows the shared confirmation dialog from code and resolves with the answer. The dialog is
 * attached to the page body, so a dimmed (disabled) card or card button styles cannot change
 * how it looks, and the browser Back button answers "no".
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);
  private readonly modalBack = inject(ModalBackService);

  ask(options: ConfirmOptions): Promise<boolean> {
    return new Promise(resolve => {
      const ref = createComponent(ConfirmDialogComponent, { environmentInjector: this.injector });
      ref.setInput('title', options.title);
      ref.setInput('message', options.message);
      ref.setInput('confirmLabel', options.confirmLabel ?? 'Yes');
      ref.setInput('cancelLabel', options.cancelLabel ?? 'Cancel');
      ref.setInput('danger', options.danger ?? false);

      let finished = false;
      const finish = (answer: boolean): void => {
        if (finished) return;
        finished = true;
        release();
        this.appRef.detachView(ref.hostView);
        ref.destroy();
        resolve(answer);
      };
      const release = this.modalBack.open(() => finish(false));
      ref.instance.confirmed.subscribe(finish);
      this.appRef.attachView(ref.hostView);
      document.body.appendChild(ref.location.nativeElement);
    });
  }
}
