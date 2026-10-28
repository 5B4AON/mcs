/**
 * Morse Code Studio
 */

import { NgTemplateOutlet } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Frame around a settings item.
 *
 * `card` mode is the Settings look: collapsible header with title, optional
 * badges and an optional enable switch. `embedded` mode is for wizard steps:
 * the same body shown flat and always open, without an enable switch
 * (choosing the step already means the user wants the item on). Items project their badges (`[item-badges]`), an optional header extra (`[item-header-extra]`, shown beside the switch) and body.
 * The card markup and ids match the original cards so styles and the
 * "reveal card" behaviour keep working.
 */
@Component({
  selector: 'app-item-shell',
  standalone: true,
  imports: [NgTemplateOutlet],
  templateUrl: './item-shell.component.html',
  styles: [':host { display: contents; }'],
})
export class ItemShellComponent {
  /** Card id suffix; the DOM id becomes `settings-card-<cardId>` */
  @Input({ required: true }) cardId = '';

  /** Title shown in the card header */
  @Input({ required: true }) title = '';

  /** Settings look or wizard look */
  @Input() mode: 'card' | 'embedded' = 'card';

  /** Enable switch state; leave null for items without a switch */
  @Input() enabled: boolean | null = null;

  /** Disable the enable switch (for example when the browser lacks the API) */
  @Input() toggleDisabled = false;

  /** Outline the card when it is off and still missing required values */
  @Input() showRequired = false;

  /** Emitted when the user flips the enable switch */
  @Output() enabledChange = new EventEmitter<boolean>();

  /** Whether the card body is open (card mode only) */
  expanded = false;

  /** Open or close the card body (header click, or Enter/Space on the title button) */
  toggleExpanded(): void {
    this.expanded = !this.expanded;
  }

  /** Forward the checkbox state */
  onToggle(event: Event): void {
    const box = event.target as HTMLInputElement;
    this.enabledChange.emit(box.checked);
    // If the parent refused the change, put the switch back once change detection has run
    setTimeout(() => { box.checked = this.enabled ?? false; });
  }
}
