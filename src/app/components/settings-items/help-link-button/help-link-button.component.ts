/**
 * Morse Code Studio
 */

import { Component, Input, inject } from '@angular/core';
import { HelpLinkService } from '../../../services/help-link.service';

/**
 * Small round "?" button placed next to a field. Opens Help at the given
 * section on top of the current dialog; closing Help returns to it.
 */
@Component({
  selector: 'app-help-link-button',
  standalone: true,
  template: `
    <button type="button" class="help-link-btn" [attr.aria-label]="label" [title]="label"
            (click)="help.open(section)">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    </button>
  `,
  styles: [`
    .help-link-btn[type="button"] {
      width: 32px; height: 32px; min-height: 0; padding: 0; margin: 0 0 0 .4rem;
      flex: none; border-radius: 50%; border: 1px solid #556; background: #282c34;
      color: #8cf; cursor: pointer; display: inline-flex; align-items: center;
      justify-content: center; vertical-align: middle;
    }
    .help-link-btn[type="button"]:hover { background: #3a4050; }
    .help-link-btn[type="button"]:active { background: #5577aa; color: #fff; }
  `],
})
export class HelpLinkButtonComponent {
  /** Id of the Help section to show */
  @Input({ required: true }) section!: string;

  /** Accessible name */
  @Input() label = 'Help: paddle modes';

  readonly help = inject(HelpLinkService);
}
