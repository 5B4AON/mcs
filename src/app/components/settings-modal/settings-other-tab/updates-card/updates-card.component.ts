/**
 * Morse Code Studio
 */

import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { APP_VERSION } from '../../../../version';
import { UpdateService } from '../../../../services/update.service';
import { WhatsNewService } from '../../../../services/whats-new.service';
import { ItemShellComponent } from '../../../settings-items/item-shell/item-shell.component';
import { HelpLinkButtonComponent } from '../../../settings-items/help-link-button/help-link-button.component';

/**
 * Settings card — App Updates.
 *
 * Shows the installed version with a **What's new** pill (the "What's new" dialog) and a **Check for updates** button, which becomes
 * **Update now** once a new version has been downloaded. This is the way to get a fresh
 * deploy quickly in an installed app, where there is no browser reload button.
 */
@Component({
  selector: 'app-updates-card',
  standalone: true,
  imports: [ItemShellComponent, HelpLinkButtonComponent, DatePipe],
  templateUrl: './updates-card.component.html',
  styles: [`
    :host { display: contents; }
    .update-row { display: flex; align-items: center; gap: .5rem; font-size: .85rem; color: #bbb; }
    .whats-new-btn { min-width: 0; padding: .25rem .8rem; font-size: .78rem; }
    .update-row strong { color: #8cf; font-variant-numeric: tabular-nums; }
    .update-status { margin-top: .6rem; font-size: .85rem; color: #ccd; line-height: 1.4; }
    .update-status.update-error { color: #f99; }
    .update-status small { display: block; color: #889; margin-top: .15rem; }
    .update-actions { display: flex; justify-content: center; margin-top: .6rem; }
  `],
})
export class UpdatesCardComponent {
  readonly updates = inject(UpdateService);
  readonly whatsNew = inject(WhatsNewService);
  readonly version = APP_VERSION;
}
