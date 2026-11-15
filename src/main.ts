import { primeAudioOutput } from './app/services/audio-primer';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

primeAudioOutput();

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
