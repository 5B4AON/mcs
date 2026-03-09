/**
 * Morse Code Studio
 */

import { Component } from '@angular/core';
import { SpriteKeyCardComponent } from './sprite-key-card/sprite-key-card.component';
import { WakeLockCardComponent } from './wake-lock-card/wake-lock-card.component';
import { ShowProsignsCardComponent } from './show-prosigns-card/show-prosigns-card.component';
import { ProsignActionsCardComponent } from './prosign-actions-card/prosign-actions-card.component';
import { EmojisCardComponent } from './emojis-card/emojis-card.component';

/**
 * Settings — Other tab.
 *
 * Thin shell that renders the five miscellaneous settings cards as
 * independent child components. Each card encapsulates its own
 * expand/collapse state, service injections, and event handlers.
 */
@Component({
  selector: 'app-settings-other-tab',
  standalone: true,
  imports: [
    SpriteKeyCardComponent,
    WakeLockCardComponent,
    ShowProsignsCardComponent,
    ProsignActionsCardComponent,
    EmojisCardComponent,
  ],
  templateUrl: './settings-other-tab.component.html',
})
export class SettingsOtherTabComponent {}
