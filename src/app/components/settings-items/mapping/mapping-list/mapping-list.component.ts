/**
 * Morse Code Studio
 */

import { Component, ContentChild, EventEmitter, Input, Output, TemplateRef } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/** What every row needs from a mapping; the card supplies the rest through its row template. */
export interface MappingListRow {
  enabled: boolean;
}

/**
 * The list of mappings in a settings card: an enable checkbox, the card's own
 * summary (given as an `<ng-template>` child), an edit button, and "+ Add Mapping".
 * Clicking a row's summary opens it for editing. The list only reports what the
 * user did; the host decides where the mappings are stored (live settings or a
 * wizard draft). Row styles are the shared `.midi-mapping-*` classes.
 *
 * ```html
 * <app-mapping-list [mappings]="list" (add)="add()" (edit)="edit($event)"
 *                   (enabledChange)="toggle($event.index, $event.enabled)">
 *   <ng-template let-m let-i="index"> ...row summary... </ng-template>
 * </app-mapping-list>
 * ```
 */
@Component({
  selector: 'app-mapping-list',
  standalone: true,
  imports: [NgTemplateOutlet],
  templateUrl: './mapping-list.component.html',
  styles: [':host { display: contents; } .row-body { display: contents; }'],
})
export class MappingListComponent {
  @Input() mappings: readonly MappingListRow[] = [];

  /** Text of the add button */
  @Input() addLabel = '+ Add Mapping';

  /** Row summary template; context is `$implicit` (the mapping) and `index` */
  @ContentChild(TemplateRef) rowTemplate?: TemplateRef<unknown>;

  @Output() add = new EventEmitter<void>();

  /** Index of the row to edit */
  @Output() edit = new EventEmitter<number>();

  @Output() enabledChange = new EventEmitter<{ index: number; enabled: boolean }>();

  onEnabled(index: number, event: Event): void {
    this.enabledChange.emit({ index, enabled: (event.target as HTMLInputElement).checked });
  }
}
