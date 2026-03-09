/**
 * Morse Code Studio
 */

import { Component, EventEmitter, Input, Output } from '@angular/core';

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
  templateUrl: './confirm-dialog.component.html',
  styleUrls: ['./confirm-dialog.component.css'],
})
export class ConfirmDialogComponent {
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

  /** Emits true when confirmed, false when cancelled */
  @Output() confirmed = new EventEmitter<boolean>();

  confirm(): void {
    this.confirmed.emit(true);
  }

  cancel(): void {
    this.confirmed.emit(false);
  }
}
