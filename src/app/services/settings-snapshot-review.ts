/**
 * Morse Code Studio
 */

import { AppSettings } from './settings.service';
import { KeyboardInputMapping } from '../components/settings-items/keyboard-keyer/keyboard-keyer-item.model';
import { MidiInputMapping } from '../components/settings-items/midi-input/midi-input-item.model';
import { MidiOutputMapping } from '../components/settings-items/midi-output/midi-output-item.model';
import { SerialInputMapping } from '../components/settings-items/serial-input/serial-input-item.model';
import { SerialOutputMapping } from '../components/settings-items/serial-output/serial-output-item.model';
import {
  PortableAppSettings,
  portableFields,
} from './settings-snapshot';
import { compareExternalRoutes, ExternalRouteChange } from './output-change-checker';

export { compareExternalRoutes } from './output-change-checker';
export type { ExternalRouteChange } from './output-change-checker';

export interface SettingChange {
  field: keyof PortableAppSettings;
  group: 'Inputs' | 'Outputs' | 'Keying and encoder' | 'Other';
  before: unknown;
  after: unknown;
}

export interface SettingsImportReview {
  settings: AppSettings;
  changes: SettingChange[];
  routeChanges: ExternalRouteChange[];
  unresolvedTargets: string[];
}

export interface SettingsSnapshotDevices {
  audioInputs: { deviceId: string; label: string }[];
  audioOutputs: { deviceId: string; label: string }[];
  audioLabelsAvailable: boolean;
  midiInputs: { id: string; name: string }[];
  midiOutputs: { id: string; name: string }[];
  serialInputPorts: string[];
  serialOutputPorts: string[];
  winkeyerPorts: string[];
}

/**
 * Prepare an import while retaining destination secrets and rejecting unverified targets.
 */
export function prepareSettingsImport(
  current: AppSettings,
  imported: PortableAppSettings,
  devices: SettingsSnapshotDevices,
): SettingsImportReview {
  const proposed: AppSettings = {
    ...current,
    ...imported,
    serialOutputMappings: imported.serialOutputMappings.map(cloneSerialOutputMapping),
    serialInputMappings: imported.serialInputMappings.map(cloneSerialInputMapping),
    keyboardInputMappings: imported.keyboardInputMappings.map(cloneKeyboardInputMapping),
    midiInputMappings: imported.midiInputMappings.map(cloneMidiInputMapping),
    midiOutputMappings: imported.midiOutputMappings.map(cloneMidiOutputMapping),
    emojiMappings: imported.emojiMappings.map(mapping => ({ ...mapping })),
    prosignActions: Object.fromEntries(
      Object.entries(imported.prosignActions).map(([key, action]) => [key, { ...action }]),
    ),
    rtdbInputChannelSecret: current.rtdbInputChannelSecret,
    rtdbOutputChannelSecret: current.rtdbOutputChannelSecret,
  };
  const unresolvedTargets: string[] = [];

  prepareAudioTarget(
    proposed, current, 'inputDeviceId', devices, 'Microphone input', unresolvedTargets,
  );
  prepareAudioTarget(
    proposed, current, 'cwInputDeviceId', devices, 'CW audio input', unresolvedTargets,
  );
  prepareAudioTarget(
    proposed, current, 'pilotOutputDeviceId', devices, 'Pilot audio output', unresolvedTargets,
  );
  prepareAudioTarget(
    proposed, current, 'optoOutputDeviceId', devices, 'Optocoupler output', unresolvedTargets,
  );
  prepareAudioTarget(
    proposed, current, 'sidetoneOutputDeviceId', devices, 'Sidetone output', unresolvedTargets,
  );

  proposed.midiInputMappings = prepareMidiMappings(
    imported.midiInputMappings,
    current.midiInputMappings,
    devices.midiInputs,
    'MIDI input',
    unresolvedTargets,
  );
  proposed.midiOutputMappings = prepareMidiMappings(
    imported.midiOutputMappings,
    current.midiOutputMappings,
    devices.midiOutputs,
    'MIDI output',
    unresolvedTargets,
  );
  proposed.serialInputMappings = prepareSerialMappings(
    imported.serialInputMappings,
    current.serialInputMappings,
    devices.serialInputPorts,
    'Serial input',
    unresolvedTargets,
  );
  proposed.serialOutputMappings = prepareSerialMappings(
    imported.serialOutputMappings,
    current.serialOutputMappings,
    devices.serialOutputPorts,
    'Serial output',
    unresolvedTargets,
  );

  if (imported.serialEnabled && imported.serialOutputMappings.some((mapping, index) =>
    mapping.enabled && !hasMatchingSerialTarget(
      mapping,
      current.serialOutputMappings[index],
      devices.serialOutputPorts,
    ))) {
    proposed.serialEnabled = current.serialEnabled;
    proposed.serialOutputMappings = current.serialOutputMappings.map(cloneSerialOutputMapping);
    unresolvedTargets.push('Serial keying was not imported because an enabled port could not be verified.');
  }
  if (imported.midiOutputEnabled && imported.midiOutputMappings.some(mapping =>
    mapping.enabled && !hasUniqueDevice(devices.midiOutputs, mapping.deviceId, d => d.id, d => d.name))) {
    proposed.midiOutputEnabled = current.midiOutputEnabled;
    proposed.midiOutputMappings = current.midiOutputMappings.map(cloneMidiOutputMapping);
    unresolvedTargets.push('MIDI keying was not imported because an enabled device could not be verified.');
  }

  if (proposed.winkeyerPortIndex !== current.winkeyerPortIndex) {
    proposed.winkeyerPortIndex = current.winkeyerPortIndex;
    if (!current.winkeyerEnabled) proposed.winkeyerEnabled = false;
    unresolvedTargets.push('WinKeyer port index is a source hint; the destination port selection was left unchanged.');
  }

  if (proposed.micInputEnabled && !current.micInputEnabled
    && !hasUniqueAudioDevice(devices, imported.inputDeviceId, true)) {
    proposed.micInputEnabled = false;
    unresolvedTargets.push('Microphone input was not enabled because its target could not be verified.');
  }
  if (proposed.cwInputEnabled && !current.cwInputEnabled
    && !hasUniqueAudioDevice(devices, imported.cwInputDeviceId, true)) {
    proposed.cwInputEnabled = false;
    unresolvedTargets.push('CW audio input was not enabled because its target could not be verified.');
  }
  if (proposed.serialInputEnabled && !current.serialInputEnabled
    && imported.serialInputMappings.some((mapping, index) =>
      mapping.enabled && !hasMatchingSerialTarget(
        mapping,
        current.serialInputMappings[index],
        devices.serialInputPorts,
      ))) {
    proposed.serialInputEnabled = false;
    unresolvedTargets.push('Serial input was not enabled because an imported port could not be verified.');
  }
  if (proposed.midiInputEnabled && !current.midiInputEnabled
    && imported.midiInputMappings.some(mapping =>
      mapping.enabled && !hasUniqueDevice(devices.midiInputs, mapping.deviceId, d => d.id, d => d.name))) {
    proposed.midiInputEnabled = false;
    unresolvedTargets.push('MIDI input was not enabled because an imported device could not be verified.');
  }

  preserveUnverifiedOutput(
    proposed, current, 'optoEnabled',
    proposed.optoEnabled && !hasUniqueAudioDevice(devices, proposed.optoOutputDeviceId, false),
    'Optocoupler keying target could not be verified; its destination route was left unchanged.',
    unresolvedTargets,
    ['optoEnabled', 'optoOutputDeviceId', 'optoOutputChannel', 'optoMode', 'optoFrequency', 'optoAmplitude', 'optoForward'],
  );
  preserveUnverifiedOutput(
    proposed, current, 'serialEnabled',
    proposed.serialEnabled && proposed.serialOutputMappings.some(mapping =>
      mapping.enabled && !hasPort(devices.serialOutputPorts, mapping.portIndex)),
    'Serial keying target could not be verified; serial output settings were left unchanged.',
    unresolvedTargets,
    ['serialEnabled', 'serialOutputMappings'],
  );
  preserveUnverifiedOutput(
    proposed, current, 'winkeyerEnabled',
    proposed.winkeyerEnabled && !hasPort(devices.winkeyerPorts, proposed.winkeyerPortIndex),
    'WinKeyer target could not be verified; its destination route was left unchanged.',
    unresolvedTargets,
    ['winkeyerEnabled', 'winkeyerPortIndex', 'winkeyerWpm', 'winkeyerForward'],
  );
  preserveUnverifiedOutput(
    proposed, current, 'midiOutputEnabled',
    proposed.midiOutputEnabled && proposed.midiOutputMappings.some(mapping =>
      mapping.enabled && !hasUniqueDevice(devices.midiOutputs, mapping.deviceId, d => d.id, d => d.name)),
    'MIDI keying target could not be verified; MIDI output settings were left unchanged.',
    unresolvedTargets,
    ['midiOutputEnabled', 'midiOutputMappings', 'midiOutputOverrideWpm'],
  );

  if (proposed.serialEnabled && !proposed.serialOutputMappings.some(mapping => mapping.enabled)
    && !current.serialEnabled) {
    proposed.serialEnabled = false;
  }
  if (proposed.midiOutputEnabled && !proposed.midiOutputMappings.some(mapping => mapping.enabled)
    && !current.midiOutputEnabled) {
    proposed.midiOutputEnabled = false;
  }

  if (!proposed.rtdbInputChannelSecret.trim()) {
    if (proposed.rtdbInputEnabled || current.rtdbInputEnabled) {
      unresolvedTargets.push('RTDB input is disabled because this browser has no saved input secret.');
    }
    proposed.rtdbInputEnabled = false;
  } else if (proposed.rtdbInputEnabled && !proposed.rtdbInputChannelName.trim()) {
    proposed.rtdbInputEnabled = false;
    unresolvedTargets.push('RTDB input was not enabled because the imported channel name is empty.');
  }

  if (!proposed.rtdbOutputChannelSecret.trim()) {
    if (proposed.rtdbOutputEnabled || current.rtdbOutputEnabled) {
      unresolvedTargets.push('RTDB output is disabled because this browser has no saved output secret.');
    }
    proposed.rtdbOutputEnabled = false;
  } else if (proposed.rtdbOutputEnabled && !proposed.rtdbOutputChannelName.trim()) {
    proposed.rtdbOutputEnabled = false;
    unresolvedTargets.push('RTDB output was not enabled because the imported channel name is empty.');
  }

  return {
    settings: proposed,
    changes: listSettingChanges(current, proposed),
    routeChanges: compareExternalRoutes(current, proposed),
    unresolvedTargets,
  };
}

/**
 * List every changed allow-listed field, grouped like the Settings tabs.
 */
export function listSettingChanges(before: AppSettings, after: AppSettings): SettingChange[] {
  return portableFields(after).flatMap(field => {
    if (areEqual(before[field], after[field])) return [];
    return [{
      field,
      group: settingGroup(field),
      before: before[field],
      after: after[field],
    }];
  });
}

function prepareAudioTarget(
  proposed: AppSettings,
  current: AppSettings,
  field: 'inputDeviceId' | 'cwInputDeviceId' | 'pilotOutputDeviceId' | 'optoOutputDeviceId' | 'sidetoneOutputDeviceId',
  devices: SettingsSnapshotDevices,
  label: string,
  unresolved: string[],
): void {
  if (proposed[field] === current[field]) return;
  const inputs = field === 'inputDeviceId' || field === 'cwInputDeviceId';
  if (!hasUniqueAudioDevice(devices, proposed[field], inputs)) {
    proposed[field] = current[field];
    unresolved.push(`${label} target could not be verified; its destination device was left unchanged.`);
  }
}

function hasUniqueAudioDevice(
  devices: SettingsSnapshotDevices,
  id: string,
  input: boolean,
): boolean {
  if (!devices.audioLabelsAvailable) return false;
  const audioDevices = input ? devices.audioInputs : devices.audioOutputs;
  return hasUniqueDevice(audioDevices, id, device => device.deviceId, device => device.label);
}

function prepareMidiMappings<T extends MidiInputMapping | MidiOutputMapping>(
  imported: T[],
  current: T[],
  devices: SettingsSnapshotDevices['midiInputs'],
  label: string,
  unresolved: string[],
): T[] {
  return imported.map((mapping, index) => {
    if (mapping.deviceId
      && hasUniqueDevice(devices, mapping.deviceId, device => device.id, device => device.name)) {
      return { ...mapping };
    }
    const existing = current[index];
    if (!existing || !areEqual(mapping, existing)) {
      unresolved.push(`${label} mapping ${index + 1} target could not be verified; its destination mapping was left unchanged.`);
    }
    return existing ? { ...existing } : { ...mapping, enabled: false, deviceId: '' };
  });
}

function prepareSerialMappings<T extends SerialInputMapping | SerialOutputMapping>(
  imported: T[],
  current: T[],
  ports: string[],
  label: string,
  unresolved: string[],
): T[] {
  return imported.map((mapping, index) => {
    const existing = current[index];
    if (hasMatchingSerialTarget(mapping, existing, ports)) return { ...mapping };
    if (!existing || !areEqual(mapping, existing)) {
      unresolved.push(`${label} mapping ${index + 1} port could not be verified from its source index; its destination mapping was left unchanged.`);
    }
    return existing ? { ...existing } : { ...mapping, enabled: false, portIndex: -1 };
  });
}

function hasMatchingSerialTarget<T extends { portIndex: number }>(
  imported: T,
  existing: T | undefined,
  ports: string[],
): boolean {
  return !!existing
    && existing.portIndex === imported.portIndex
    && hasPort(ports, existing.portIndex);
}

function preserveUnverifiedOutput(
  proposed: AppSettings,
  current: AppSettings,
  enabledField: 'optoEnabled' | 'serialEnabled' | 'winkeyerEnabled' | 'midiOutputEnabled',
  unresolved: boolean,
  message: string,
  unresolvedTargets: string[],
  fields: (keyof AppSettings)[],
): void {
  if (!unresolved) return;
  if (proposed[enabledField] || current[enabledField]) {
    for (const field of fields) {
      Object.assign(proposed, { [field]: current[field] });
    }
    unresolvedTargets.push(message);
  }
}

function hasUniqueDevice<T>(
  devices: T[],
  id: string,
  getId: (device: T) => string,
  getLabel: (device: T) => string,
): boolean {
  if (!id || id === 'default') return false;
  const matches = devices.filter(device => getId(device) === id);
  if (matches.length !== 1 || !getLabel(matches[0]).trim()) return false;
  return devices.filter(device => getLabel(device) === getLabel(matches[0])).length === 1;
}

function hasPort(ports: string[], index: number): boolean {
  return Number.isSafeInteger(index) && index >= 0 && index < ports.length;
}

function cloneSerialOutputMapping(mapping: SerialOutputMapping): SerialOutputMapping {
  return { ...mapping, relayInputIndices: [...mapping.relayInputIndices] };
}

function cloneSerialInputMapping(mapping: SerialInputMapping): SerialInputMapping {
  return { ...mapping };
}

function cloneKeyboardInputMapping(mapping: KeyboardInputMapping): KeyboardInputMapping {
  return { ...mapping };
}

function cloneMidiInputMapping(mapping: MidiInputMapping): MidiInputMapping {
  return { ...mapping };
}

function cloneMidiOutputMapping(mapping: MidiOutputMapping): MidiOutputMapping {
  return { ...mapping, relayInputIndices: [...mapping.relayInputIndices] };
}

function settingGroup(field: keyof PortableAppSettings): SettingChange['group'] {
  if (field.startsWith('mic') || field.startsWith('cwInput') || field.startsWith('serialInput')
    || field.startsWith('midiInput') || field.startsWith('rtdbInput')) {
    return 'Inputs';
  }
  if (field === 'serialEnabled' || field === 'midiOutputEnabled'
    || field.startsWith('opto') || field.startsWith('serialOutput') || field.startsWith('winkeyer')
    || field.startsWith('rtdbOutput') || field.startsWith('rtdbAllow') || field.startsWith('rtdbRelay')
    || field.startsWith('sidetone') || field.startsWith('vibrate') || field.startsWith('pilot')) {
    return 'Outputs';
  }
  if (field.startsWith('encoder') || field.startsWith('keyboard') || field.startsWith('keyer')
    || field.startsWith('paddle') || field.startsWith('mouse') || field.startsWith('touch')) {
    return 'Keying and encoder';
  }
  return 'Other';
}

function areEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => areEqual(item, right[index]));
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key, index) => key === rightKeys[index] && areEqual(left[key], right[key]));
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
