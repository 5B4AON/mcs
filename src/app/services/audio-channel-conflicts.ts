/**
 * Morse Code Studio
 */

import type { AppSettings } from './settings.service';
import { AudioChannel } from './settings-common';
import { SidetoneChannel } from '../components/settings-items/sidetone/sidetone-item.model';

/** True when the sidetone channel choice shares a channel with another output. */
function sidetoneOverlaps(sidetone: SidetoneChannel, other: AudioChannel): boolean {
  return sidetone === 'both' || sidetone === other;
}

function sidetoneConflictMessage(other: string, sidetone: SidetoneChannel, otherChannel: AudioChannel): string {
  return sidetone === 'both'
    ? `Sidetone is set to play on both channels, which includes the ${otherChannel} channel used by ${other} on the same device. Set the Sidetone channel to ${otherChannel === 'left' ? 'Right' : 'Left'} or use a different device.`
    : `Sidetone and ${other} both use ${sidetone} channel on the same device.`;
}

/**
 * Detect stereo channel conflicts on shared audio devices for the given settings.
 * A stereo sound card has only two channels (L+R), so Sidetone, Key Output and
 * the Pilot tone cannot all share one device. Pilot tone conflicts are only
 * checked when mic input is enabled. Pure, so callers can check proposed
 * settings before applying them.
 */
export function findChannelConflicts(s: AppSettings): string[] | null {
  const warnings: string[] = [];
  const norm = (id: string) => id || 'default';
  const sidetoneActive = s.sidetoneEnabled;
  const optoActive = s.optoEnabled;
  const pilotActive = s.micInputEnabled;
  const sideId = norm(s.sidetoneOutputDeviceId);
  const optoId = norm(s.optoOutputDeviceId);
  const pilotId = norm(s.pilotOutputDeviceId);

  // Triple conflict: all 3 outputs on one stereo device (only if pilot is active)
  if (pilotActive && sidetoneActive && optoActive &&
    sideId === optoId && optoId === pilotId) {
    warnings.push(
      'Stereo sound card has only 2 channels \u2014 cannot carry Sidetone + Key Out + Pilot simultaneously. Disable one or add a second sound card.'
    );
    return warnings;
  }

  if (sidetoneActive && optoActive && sideId === optoId &&
    sidetoneOverlaps(s.sidetoneOutputChannel, s.optoOutputChannel)) {
    warnings.push(sidetoneConflictMessage('Key Output', s.sidetoneOutputChannel, s.optoOutputChannel));
  }
  if (pilotActive && optoActive && pilotId === optoId &&
    s.pilotOutputChannel === s.optoOutputChannel) {
    warnings.push(`Pilot and Key Output both use ${s.pilotOutputChannel} channel on the same device.`);
  }
  if (pilotActive && sidetoneActive && pilotId === sideId &&
    sidetoneOverlaps(s.sidetoneOutputChannel, s.pilotOutputChannel)) {
    warnings.push(sidetoneConflictMessage('Pilot', s.sidetoneOutputChannel, s.pilotOutputChannel));
  }
  return warnings.length ? warnings : null;
}
