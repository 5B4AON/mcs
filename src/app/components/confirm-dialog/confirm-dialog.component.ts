/**
 * Morse Code Studio
 */

import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import { focusDialog, restoreDialogFocus, trapDialogTabKey } from '../modal-accessibility';
import { BackdropClickDirective } from '../backdrop-click.directive';

/** One optional checkbox of the confirmation dialog */
export interface ConfirmCheckbox {
  label: string;
  checked: boolean;
}

/**
 * A reusable confirmation dialog component.
 *
 * Renders a centred modal overlay with a title, message, and two action
 * buttons (confirm / cancel).  Styled to match the application's dark
 * theme.  Emits `confirmed` (true = confirm, false = cancel) and closes
 * itself; the parent is responsible for toggling visibility.
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [BackdropClickDirective],
  templateUrl: './confirm-dialog.component.html',
  styleUrls: ['./confirm-dialog.component.css'],
})
export class ConfirmDialogComponent implements AfterViewInit, OnDestroy {
  @ViewChild('dialog') private dialog?: ElementRef<HTMLElement>;

  private readonly focusReturnTarget =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  /** Dialog title shown in the header */
  @Input() title = 'Confirm';

  /** Body message — can contain line-breaks via \n (rendered with CSS white-space) */
  @Input() message = 'Are you sure?';

  /** Label for the confirm (destructive) button */
  @Input() confirmLabel = 'Yes';

  /** Label for the cancel button */
  @Input() cancelLabel = 'Cancel';

  /** Whether the confirm button should use the danger (red) colour */
  @Input() danger = false;

  /** Whether to show only the confirm action */
  @Input() singleAction = false;

  /**
   * Optional checkboxes shown between the message and `messageAfter`. The dialog writes each box's
   * state back into its `checked` field, so the parent reads the answers from these objects.
   */
  @Input() checkboxes: ConfirmCheckbox[] = [];

  /** Text shown after the checkboxes */
  @Input() messageAfter = '';

  /** Emits true when confirmed, false when cancelled */
  @Output() confirmed = new EventEmitter<boolean>();

  ngAfterViewInit(): void {
    if (this.dialog) focusDialog(this.dialog.nativeElement);
  }

  ngOnDestroy(): void {
    restoreDialogFocus(this.focusReturnTarget);
  }

  /** Keep keyboard focus in the confirmation dialog. */
  onDialogKeydown(event: KeyboardEvent): void {
    if (this.dialog) trapDialogTabKey(event, this.dialog.nativeElement);
  }

  onCheckboxChange(box: ConfirmCheckbox, event: Event): void {
    box.checked = (event.target as HTMLInputElement).checked;
  }

  confirm(): void {
    this.confirmed.emit(true);
  }

  cancel(): void {
    this.confirmed.emit(false);
  }
}
