/**
 * Morse Code Studio
 */

import { AppSettings } from './settings.service';

export interface ExternalRouteChange {
  id: string;
  type: string;
  change: 'newly enabled' | 'redirected';
  target: string;
  destination: string;
  enabled: boolean;
  forwarding: string;
  requirements: string;
  acknowledgementRequired: boolean;
}

/**
 * Compare active external routes without opening or using them.
 */
export function compareExternalRoutes(
  before: AppSettings,
  after: AppSettings,
): ExternalRouteChange[] {
  const beforeRoutes = activeExternalRoutes(before);
  const changes: ExternalRouteChange[] = [];
  for (const route of activeExternalRoutes(after)) {
    const previous = beforeRoutes.find(item => item.id === route.id);
    if (!previous) {
      changes.push({ ...route, change: 'newly enabled' });
    } else if (previous.target !== route.target) {
      changes.push({ ...route, change: 'redirected' });
    }
  }
  return changes;
}

function activeExternalRoutes(
  settings: AppSettings,
): Omit<ExternalRouteChange, 'change'>[] {
  const routes: Omit<ExternalRouteChange, 'change'>[] = [];
  if (settings.optoEnabled) {
    routes.push({
      id: 'opto',
      type: 'Radio keying through audio optocoupler',
      target: JSON.stringify([settings.optoOutputDeviceId, settings.optoOutputChannel, settings.optoForward]),
      destination: `Audio device ${settings.optoOutputDeviceId}, channel ${settings.optoOutputChannel}`,
      enabled: true,
      forwarding: settings.optoForward.toUpperCase(),
      requirements: 'A specific available audio output, the selected channel, and an optocoupler keying interface.',
      acknowledgementRequired: true,
    });
  }
  if (settings.serialEnabled) {
    settings.serialOutputMappings.forEach((mapping, index) => {
      if (!mapping.enabled) return;
      routes.push({
        id: `serial-${index}`,
        type: 'Serial radio keying',
        target: JSON.stringify([
          mapping.portIndex, mapping.pin, mapping.invert, mapping.forward,
          mapping.relayInputIndices, mapping.relaySuppressOtherInputs,
        ]),
        destination: `Serial port ${mapping.portIndex + 1}, ${mapping.pin.toUpperCase()}${mapping.invert ? ' (inverted)' : ''}`,
        enabled: true,
        forwarding: mapping.forward.toUpperCase(),
        requirements: 'Web Serial support and the exact selected port and DTR/RTS pin.',
        acknowledgementRequired: true,
      });
    });
  }
  if (settings.serialInputEnabled) {
    settings.serialInputMappings.forEach((mapping, index) => {
      if (!mapping.enabled) return;
      routes.push({
        id: `serial-input-${index}`,
        type: 'Serial key/paddle input',
        target: JSON.stringify([
          mapping.portIndex,
          mapping.mode,
          mapping.pin,
          mapping.dahPin,
          mapping.invert,
          mapping.source,
        ]),
        destination: `Serial port ${mapping.portIndex + 1}, ${mapping.pin.toUpperCase()}${mapping.mode === 'paddle' ? ` / ${mapping.dahPin.toUpperCase()}` : ''}`,
        enabled: true,
        forwarding: mapping.source.toUpperCase(),
        requirements: 'Web Serial support and the exact selected port and input pin or pins.',
        acknowledgementRequired: true,
      });
    });
  }
  if (settings.winkeyerEnabled) {
    routes.push({
      id: 'winkeyer',
      type: 'WinKeyer radio keying',
      target: JSON.stringify([settings.winkeyerPortIndex, settings.winkeyerForward]),
      destination: `Serial port ${settings.winkeyerPortIndex + 1}`,
      enabled: true,
      forwarding: settings.winkeyerForward.toUpperCase(),
      requirements: 'Web Serial support and the exact selected WinKeyer port.',
      acknowledgementRequired: true,
    });
  }
  if (settings.midiOutputEnabled) {
    settings.midiOutputMappings.forEach((mapping, index) => {
      if (!mapping.enabled) return;
      routes.push({
        id: `midi-${index}`,
        type: 'MIDI radio keying',
        target: JSON.stringify([
          mapping.deviceId, mapping.channel, mapping.mode, mapping.value, mapping.dahValue,
          mapping.forward, mapping.relayInputIndices, mapping.relaySuppressOtherInputs,
        ]),
        destination: `MIDI device ${mapping.deviceId || '(unspecified)'}, channel ${mapping.channel}, note ${mapping.value}${mapping.mode === 'paddle' ? ` / ${mapping.dahValue}` : ''}`,
        enabled: true,
        forwarding: mapping.forward.toUpperCase(),
        requirements: 'Web MIDI support and the exact selected MIDI output device.',
        acknowledgementRequired: true,
      });
    });
  }
  if (settings.midiInputEnabled) {
    settings.midiInputMappings.forEach((mapping, index) => {
      if (!mapping.enabled) return;
      routes.push({
        id: `midi-input-${index}`,
        type: 'MIDI key/paddle input',
        target: JSON.stringify([
          mapping.deviceId,
          mapping.channel,
          mapping.mode,
          mapping.value,
          mapping.dahValue,
        ]),
        destination: `MIDI device ${mapping.deviceId || '(any device)'}, channel ${mapping.channel}, note ${mapping.value}${mapping.mode === 'paddle' ? ` / ${mapping.dahValue}` : ''}`,
        enabled: true,
        forwarding: mapping.source.toUpperCase(),
        requirements: 'Web MIDI support and the exact selected MIDI input device.',
        acknowledgementRequired: true,
      });
    });
  }
  if (settings.rtdbInputEnabled) {
    routes.push({
      id: 'rtdb-input',
      type: 'Firebase RTDB input',
      target: JSON.stringify([settings.rtdbInputChannelName, settings.rtdbInputSource]),
      destination: `Shared channel "${settings.rtdbInputChannelName}"`,
      enabled: true,
      forwarding: settings.rtdbInputSource.toUpperCase(),
      requirements: 'An internet connection and the configured shared channel name and secret.',
      acknowledgementRequired: true,
    });
  }
  if (settings.rtdbOutputEnabled) {
    routes.push({
      id: 'rtdb-output',
      type: 'Firebase RTDB output',
      target: JSON.stringify([
        settings.rtdbOutputChannelName,
        settings.rtdbOutputForward,
        settings.rtdbAllowInputRelay,
        settings.rtdbRelaySuppressOtherInputs,
      ]),
      destination: `Shared channel "${settings.rtdbOutputChannelName}"`,
      enabled: true,
      forwarding: settings.rtdbOutputForward.toUpperCase(),
      requirements: 'An internet connection and the configured shared channel name and secret.',
      acknowledgementRequired: true,
    });
  }
  return routes;
}
