/**
 * Morse Code Studio
 */

import { Component } from '@angular/core';
import { WakeLockCardComponent } from './wake-lock-card/wake-lock-card.component';
import { TextBlurCardComponent } from './text-blur-card/text-blur-card.component';
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
    WakeLockCardComponent,
    TextBlurCardComponent,
    ShowProsignsCardComponent,
    ProsignActionsCardComponent,
    EmojisCardComponent,
  ],
  templateUrl: './settings-other-tab.component.html',
})
export class SettingsOtherTabComponent {}
