/**
 * Morse Code Studio
 */

import { SettingsService } from './settings.service';
import { compareExternalRoutes } from './output-change-checker';

describe('compareExternalRoutes', () => {
  let settings: SettingsService;

  beforeEach(() => {
    settings = new SettingsService();
  });

  it('returns no changes when external routes are unchanged', () => {
    const current = settings.getDefaults();

    expect(compareExternalRoutes(current, structuredClone(current))).toEqual([]);
  });

  it('requires acknowledgement for a newly enabled radio-keying route', () => {
    const current = settings.getDefaults();
    const proposed = { ...current, optoEnabled: true };

    expect(compareExternalRoutes(current, proposed)).toEqual([
      jasmine.objectContaining({
        id: 'opto',
        change: 'newly enabled',
        enabled: true,
        acknowledgementRequired: true,
      }),
    ]);
  });

  it('reports an active route redirected to a different target', () => {
    const current = { ...settings.getDefaults(), optoEnabled: true };
    const proposed = { ...current, optoOutputDeviceId: 'different-device' };

    expect(compareExternalRoutes(current, proposed)).toEqual([
      jasmine.objectContaining({
        id: 'opto',
        change: 'redirected',
        acknowledgementRequired: true,
      }),
    ]);
  });
});
