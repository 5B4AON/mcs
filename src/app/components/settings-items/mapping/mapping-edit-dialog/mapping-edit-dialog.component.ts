/**
 * Morse Code Studio
 */

import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild, inject } from '@angular/core';
import { ConfirmService } from '../../../../services/confirm.service';
import { focusDialog, restoreDialogFocus, trapDialogTabKey } from '../../../modal-accessibility';
import { BackdropClickDirective } from '../../../backdrop-click.directive';
import { BackCloseDirective } from '../../../back-close.directive';

/**
 * Popup frame of the Settings mapping editors: overlay, title with close
 * button, the editor fields (projected) and the Delete / Cancel / OK footer.
 * Focus moves into the dialog on open, Tab stays inside, and focus returns
 * to the opener on close. The wizard does not use this frame: it shows the
 * same editor fields flat inside a step.
 */
@Component({
  selector: 'app-mapping-edit-dialog',
  standalone: true,
  imports: [BackdropClickDirective, BackCloseDirective],
  templateUrl: './mapping-edit-dialog.component.html',
  styleUrls: ['./mapping-edit-dialog.component.css'],
})
export class MappingEditDialogComponent implements AfterViewInit, OnDestroy {
  @ViewChild('dialog') private dialog?: ElementRef<HTMLElement>;

  private readonly focusReturnTarget =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  /** Dialog title, e.g. "Edit Keyboard Mapping" */
  @Input({ required: true }) title = '';

  /** Accessible name of the dialog */
  @Input() ariaLabel = '';

  /** OK pressed: the editor validates and emits the result */
  @Output() confirmed = new EventEmitter<void>();

  /** Cancel, or the close button, Escape, a click outside or Back once any change was confirmed to be discarded */
  @Output() cancelled = new EventEmitter<void>();

  /** True while the fields differ from the mapping the dialog opened with */
  @Input() isDirty: () => boolean = () => false;

  private readonly confirm = inject(ConfirmService);
  private asking = false;

  /** Close button, Escape or a click outside: with unsaved changes ask first (the Cancel button never asks) */
  requestClose(): void {
    if (!this.isDirty()) {
      this.cancelled.emit();
      return;
    }
    void this.askDiscard();
  }

  /** The browser Back button: closes like the close button, or stays open while the question is shown */
  readonly backClose = (): boolean => {
    if (!this.isDirty()) {
      this.cancelled.emit();
      return false;
    }
    void this.askDiscard();
    return true;
  };

  private async askDiscard(): Promise<void> {
    if (this.asking) return;
    this.asking = true;
    const discard = await this.confirm.askDiscardChanges('this mapping');
    this.asking = false;
    if (discard) this.cancelled.emit();
  }

  ngAfterViewInit(): void {
    if (this.dialog) focusDialog(this.dialog.nativeElement, '.md-close-btn');
  }

  ngOnDestroy(): void {
    restoreDialogFocus(this.focusReturnTarget);
  }

  /** Keep keyboard focus inside the dialog. */
  onKeydown(event: KeyboardEvent): void {
    if (this.dialog) trapDialogTabKey(event, this.dialog.nativeElement);
  }
}
