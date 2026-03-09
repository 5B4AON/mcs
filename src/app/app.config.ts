/**
 * Morse Code Studio
 */

import { ApplicationConfig, provideZoneChangeDetection, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';

/**
 * Root application configuration.
 *
 * Configures Angular's dependency injection providers:
 * - Zone.js change detection with event coalescing for performance
 * - Router (empty routes — app is single-page, modal-based navigation)
 * - Service worker for PWA offline support (registered after 30 s stability)
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
};
