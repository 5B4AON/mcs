import { Component } from '@angular/core';
import { APP_VERSION } from '../version';
@Component({
  selector: 'app-help-ch-reference',
  standalone: true,
  templateUrl: './help-ch-reference.component.html',
  styles: [':host { display: contents; }'],
})
export class HelpChReferenceComponent {
  readonly version = APP_VERSION;
}
