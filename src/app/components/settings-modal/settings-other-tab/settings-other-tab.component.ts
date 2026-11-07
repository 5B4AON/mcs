/**
 * Morse Code Studio
 */

import { Component } from '@angular/core';
import { SpeedItemComponent } from '../../settings-items/speed/speed-item.component';
import { UpdatesCardComponent } from './updates-card/updates-card.component';
import { ScreenSettingsCardComponent } from './screen-settings-card/screen-settings-card.component';
import { TextBlurItemComponent } from '../../settings-items/text-blur/text-blur-item.component';
import { FarnsworthItemComponent } from '../../settings-items/farnsworth/farnsworth-item.component';
import { PracticeItemComponent } from '../../settings-items/practice/practice-item.component';
import { SendPracticeItemComponent } from '../../settings-items/send-practice/send-practice-item.component';
import { ShowProsignsItemComponent } from '../../settings-items/show-prosigns/show-prosigns-item.component';
import { ProsignActionsItemComponent } from '../../settings-items/prosign-actions/prosign-actions-item.component';
import { EmojisItemComponent } from '../../settings-items/emojis/emojis-item.component';

/**
 * Settings — Other tab.
 *
 * Thin shell that renders the miscellaneous settings cards as
 * independent child components. Each card encapsulates its own
 * expand/collapse state, service injections, and event handlers.
 */
@Component({
  selector: 'app-settings-other-tab',
  standalone: true,
  imports: [
    SpeedItemComponent,
    ScreenSettingsCardComponent,
    TextBlurItemComponent,
    FarnsworthItemComponent,
    PracticeItemComponent,
    SendPracticeItemComponent,
    ShowProsignsItemComponent,
    ProsignActionsItemComponent,
    EmojisItemComponent,
    UpdatesCardComponent,
  ],
  templateUrl: './settings-other-tab.component.html',
})
export class SettingsOtherTabComponent {}
