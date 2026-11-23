/**
 * Morse Code Studio
 */

import { Component } from '@angular/core';
import { TextBlurItemComponent } from '../../settings-items/text-blur/text-blur-item.component';
import { FarnsworthItemComponent } from '../../settings-items/farnsworth/farnsworth-item.component';
import { PracticeItemComponent } from '../../settings-items/practice/practice-item.component';
import { SendPracticeItemComponent } from '../../settings-items/send-practice/send-practice-item.component';

/**
 * Settings — Practice tab.
 *
 * Thin shell that renders the learning-related settings cards (Copy Practice, Farnsworth timing,
 * Send Practice and text blurring) as independent child components.
 */
@Component({
  selector: 'app-settings-practice-tab',
  standalone: true,
  imports: [
    TextBlurItemComponent,
    FarnsworthItemComponent,
    PracticeItemComponent,
    SendPracticeItemComponent,
  ],
  templateUrl: './settings-practice-tab.component.html',
})
export class SettingsPracticeTabComponent {}
