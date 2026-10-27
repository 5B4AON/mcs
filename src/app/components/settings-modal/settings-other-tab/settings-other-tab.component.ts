/**
 * Morse Code Studio
 */

import { Component } from '@angular/core';
import { SpeedItemComponent } from '../../settings-items/speed/speed-item.component';
import { WakeLockCardComponent } from './wake-lock-card/wake-lock-card.component';
import { TextBlurItemComponent } from '../../settings-items/text-blur/text-blur-item.component';
import { FarnsworthItemComponent } from '../../settings-items/farnsworth/farnsworth-item.component';
import { PracticeItemComponent } from '../../settings-items/practice/practice-item.component';
import { ShowProsignsItemComponent } from '../../settings-items/show-prosigns/show-prosigns-item.component';
import { ProsignActionsItemComponent } from '../../settings-items/prosign-actions/prosign-actions-item.component';
import { EmojisItemComponent } from '../../settings-items/emojis/emojis-item.component';

/**
 * Settings — Other tab.
 *
 * Thin shell that renders the six miscellaneous settings cards as
 * independent child components. Each card encapsulates its own
 * expand/collapse state, service injections, and event handlers.
 */
@Component({
  selector: 'app-settings-other-tab',
  standalone: true,
  imports: [
    SpeedItemComponent,
    WakeLockCardComponent,
    TextBlurItemComponent,
    FarnsworthItemComponent,
    PracticeItemComponent,
    ShowProsignsItemComponent,
    ProsignActionsItemComponent,
    EmojisItemComponent,
  ],
  templateUrl: './settings-other-tab.component.html',
})
export class SettingsOtherTabComponent {}
