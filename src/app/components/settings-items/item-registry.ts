/**
 * Morse Code Studio
 */

import { Type } from '@angular/core';
import { ItemDescriptor } from './item-descriptor';
import { SidetoneItemComponent } from './sidetone/sidetone-item.component';
import { SIDETONE_DESCRIPTOR } from './sidetone/sidetone-item.model';

/** One registered item: how to draw it and what it edits. */
export interface RegisteredItem {
  component: Type<unknown>;
  descriptor: ItemDescriptor;
}

/** All settings items by id. Wizard flows refer to items by these ids. */
export const ITEM_REGISTRY: Record<string, RegisteredItem> = {
  sidetone: { component: SidetoneItemComponent, descriptor: SIDETONE_DESCRIPTOR },
};
