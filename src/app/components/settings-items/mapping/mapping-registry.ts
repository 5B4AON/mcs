/**
 * Morse Code Studio
 */

import { AppSettings } from '../../../services/settings.service';
import { SerialInputMapping } from '../serial-input/serial-input-item.model';
import { SerialOutputMapping } from '../serial-output/serial-output-item.model';
import { KeyboardInputMapping } from '../keyboard-keyer/keyboard-keyer-item.model';
import { MidiInputMapping } from '../midi-input/midi-input-item.model';
import { MidiOutputMapping } from '../midi-output/midi-output-item.model';
import { midiNoteName } from '../../../services/midi-input.service';
import { midiOutputNoteName } from '../../../services/midi-output.service';
import { ItemDescriptor } from '../item-descriptor';
import { formatKeyCode } from './keyboard-mapping-editor/keyboard-mapping-editor.component';

/**
 * What the wizard engine and the wizard pages need to know about one kind of
 * mapping (keyboard key, MIDI input, ...): which settings list it lives in,
 * how to create and describe one, and what else must change when one is
 * deleted. A flow refers to a kind by its `id` in `repeat.item`.
 */
export interface MappingKind {
  /** Registry id, used by `StepRepeat.item` and by the mapping page */
  id: string;
  /** The settings list that holds the mappings */
  list: keyof AppSettings;
  /** Singular noun for titles, e.g. "keyboard mapping" */
  noun: string;
  /** A fresh mapping with the same defaults as Settings' "+ Add Mapping" */
  create(): unknown;
  /** One full line describing a mapping (device, channel, port), for the review */
  summary(mapping: unknown): string;
  /** Shortest useful line for a list row, e.g. "Straight 76 (RX)" or "Paddle 82|84 (TX)" */
  rowSummary(mapping: unknown): string;
  /** Other settings to change when mapping `index` is deleted (e.g. relay references) */
  onRemove?(settings: AppSettings, index: number): Partial<AppSettings>;
  /** Review/validation entry for the engine (keys are just the list) */
  descriptor: ItemDescriptor;
}

/** Descriptor shared by all mapping kinds: the list is the unit of change. */
function listDescriptor(
  id: string, list: keyof AppSettings, label: string, summary: (m: unknown) => string,
): ItemDescriptor {
  const describe = (settings: AppSettings) => {
    const items = settings[list] as unknown[];
    return items.length ? items.map(summary).join('; ') : 'none';
  };
  return {
    id,
    keys: [list],
    // Each mapping was validated by its editor before it was stored in the draft
    validate: () => [],
    review: (base, proposed) =>
      JSON.stringify(base[list]) === JSON.stringify(proposed[list])
        ? []
        : [{ key: list, label, before: describe(base), after: describe(proposed) }],
  };
}

const keyboardSummary = (raw: unknown): string => {
  const m = raw as KeyboardInputMapping;
  const keys = m.mode === 'paddle'
    ? `${formatKeyCode(m.keyCode)} / ${formatKeyCode(m.dahKeyCode)}`
    : formatKeyCode(m.keyCode);
  const name = m.name ? `${m.name}: ` : '';
  return `${name}${m.mode === 'paddle' ? 'Paddle' : 'Straight'} ${keys} (${m.source.toUpperCase()})`;
};

const midiInputSummary = (raw: unknown): string => {
  const m = raw as MidiInputMapping;
  const note = (n: number) => `${midiNoteName(n)}(${n})`;
  const notes = m.mode === 'paddle' ? `${note(m.value)} / ${note(m.dahValue)}` : note(m.value);
  const name = m.name ? `${m.name}: ` : '';
  const ch = m.channel === 0 ? 'any channel' : `ch ${m.channel}`;
  return `${name}${m.mode === 'paddle' ? 'Paddle' : 'Straight'} ${notes}, ${ch} (${m.source.toUpperCase()})`;
};

const serialInputSummary = (raw: unknown): string => {
  const m = raw as SerialInputMapping;
  const pins = m.mode === 'paddle' ? `${m.pin.toUpperCase()} / ${m.dahPin.toUpperCase()}` : m.pin.toUpperCase();
  const name = m.name ? `${m.name}: ` : '';
  const port = m.portIndex >= 0 ? `port ${m.portIndex + 1}` : 'no port';
  return `${name}${m.mode === 'paddle' ? 'Paddle' : 'Straight'} ${pins}, ${port} (${m.source.toUpperCase()})`;
};

const serialOutputSummary = (raw: unknown): string => {
  const m = raw as SerialOutputMapping;
  const fwd = m.forward === 'both' ? 'RX/TX' : m.forward.toUpperCase();
  const port = m.portIndex >= 0 ? `port ${m.portIndex + 1}` : 'no port';
  return `${m.pin.toUpperCase()} on ${port}${m.invert ? ' inverted' : ''} (${fwd})`;
};

const midiOutputSummary = (raw: unknown): string => {
  const m = raw as MidiOutputMapping;
  const note = (n: number) => `${midiOutputNoteName(n)}(${n})`;
  const notes = m.mode === 'paddle' ? `${note(m.value)} / ${note(m.dahValue)}` : note(m.value);
  const fwd = m.forward === 'both' ? 'RX/TX' : m.forward.toUpperCase();
  return `${m.mode === 'paddle' ? 'Paddle' : 'Straight'} ${notes}, ch ${m.channel} (${fwd})`;
};

const modeLabel = (mode: string) => (mode === 'paddle' ? 'Paddle' : 'Straight');
const namePrefix = (name: string | undefined) => (name ? `${name}: ` : '');

const keyboardRow = (raw: unknown): string => {
  const m = raw as KeyboardInputMapping;
  const keys = m.mode === 'paddle' ? `${formatKeyCode(m.keyCode)}|${formatKeyCode(m.dahKeyCode)}` : formatKeyCode(m.keyCode);
  return `${namePrefix(m.name)}${modeLabel(m.mode)} ${keys} (${m.source.toUpperCase()})`;
};

const midiInputRow = (raw: unknown): string => {
  const m = raw as MidiInputMapping;
  const notes = m.mode === 'paddle' ? `${m.value}|${m.dahValue}` : String(m.value);
  return `${namePrefix(m.name)}${modeLabel(m.mode)} ${notes} (${m.source.toUpperCase()})`;
};

const serialInputRow = (raw: unknown): string => {
  const m = raw as SerialInputMapping;
  const pins = m.mode === 'paddle' ? `${m.pin.toUpperCase()}|${m.dahPin.toUpperCase()}` : m.pin.toUpperCase();
  return `${namePrefix(m.name)}${modeLabel(m.mode)} ${pins} (${m.source.toUpperCase()})`;
};

const serialOutputRow = (raw: unknown): string => {
  const m = raw as SerialOutputMapping;
  return `${m.pin.toUpperCase()} (${m.forward === 'both' ? 'RX/TX' : m.forward.toUpperCase()})`;
};

const midiOutputRow = (raw: unknown): string => {
  const m = raw as MidiOutputMapping;
  const notes = m.mode === 'paddle' ? `${m.value}|${m.dahValue}` : String(m.value);
  return `${modeLabel(m.mode)} ${notes} (${m.forward === 'both' ? 'RX/TX' : m.forward.toUpperCase()})`;
};

/** All mapping kinds by id. */
export const MAPPING_REGISTRY: Record<string, MappingKind> = {
  'keyboard-mapping-editor': {
    id: 'keyboard-mapping-editor',
    list: 'keyboardInputMappings',
    noun: 'keyboard mapping',
    create: (): KeyboardInputMapping => ({
      enabled: true, mode: 'straightKey', keyCode: '', dahKeyCode: '',
      source: 'tx', reversePaddles: false, paddleMode: 'iambic-b', name: '', color: '',
    }),
    summary: keyboardSummary,
    rowSummary: keyboardRow,
    descriptor: listDescriptor(
      'keyboard-mapping-editor', 'keyboardInputMappings', 'Keyboard keys', keyboardSummary),
  },
  'midi-input-mapping-editor': {
    id: 'midi-input-mapping-editor',
    list: 'midiInputMappings',
    noun: 'MIDI input mapping',
    create: (): MidiInputMapping => ({
      enabled: true, deviceId: '', channel: 0, source: 'rx',
      mode: 'straightKey', value: 60, dahValue: -1, reversePaddles: false, name: '', color: '',
    }),
    summary: midiInputSummary,
    rowSummary: midiInputRow,
    // Output mappings refer to inputs by position, so deleting one shifts them
    onRemove: (settings, index) => ({
      midiOutputMappings: settings.midiOutputMappings.map(om => ({
        ...om,
        relayInputIndices: (om.relayInputIndices || [])
          .filter(idx => idx !== index)
          .map(idx => idx > index ? idx - 1 : idx),
      })),
    }),
    descriptor: listDescriptor(
      'midi-input-mapping-editor', 'midiInputMappings', 'MIDI input mappings', midiInputSummary),
  },
  'serial-input-mapping-editor': {
    id: 'serial-input-mapping-editor',
    list: 'serialInputMappings',
    noun: 'serial input mapping',
    create: (): SerialInputMapping => ({
      enabled: true, mode: 'straightKey', pin: 'dsr', dahPin: 'cts',
      invert: false, source: 'rx', reversePaddles: false,
      paddleMode: 'iambic-b', portIndex: -1, pollInterval: 10,
      debounceMs: 5, name: '', color: '',
    }),
    summary: serialInputSummary,
    rowSummary: serialInputRow,
    // Output mappings refer to inputs by position, so deleting one shifts them
    onRemove: (settings, index) => ({
      serialOutputMappings: settings.serialOutputMappings.map(om => ({
        ...om,
        relayInputIndices: (om.relayInputIndices || [])
          .filter(idx => idx !== index)
          .map(idx => idx > index ? idx - 1 : idx),
      })),
    }),
    descriptor: listDescriptor(
      'serial-input-mapping-editor', 'serialInputMappings', 'Serial input mappings', serialInputSummary),
  },
  'serial-output-mapping-editor': {
    id: 'serial-output-mapping-editor',
    list: 'serialOutputMappings',
    noun: 'serial output mapping',
    create: (): SerialOutputMapping => ({
      enabled: true, portIndex: -1, pin: 'dtr', invert: false, forward: 'tx', relayInputIndices: [],
      relaySuppressOtherInputs: false,
    }),
    summary: serialOutputSummary,
    rowSummary: serialOutputRow,
    descriptor: listDescriptor(
      'serial-output-mapping-editor', 'serialOutputMappings', 'Serial output mappings', serialOutputSummary),
  },
  'midi-output-mapping-editor': {
    id: 'midi-output-mapping-editor',
    list: 'midiOutputMappings',
    noun: 'MIDI output mapping',
    create: (): MidiOutputMapping => ({
      enabled: true, deviceId: '', channel: 1,
      forward: 'tx', mode: 'straightKey', value: 80, dahValue: -1, relayInputIndices: [],
      relaySuppressOtherInputs: false,
    }),
    summary: midiOutputSummary,
    rowSummary: midiOutputRow,
    descriptor: listDescriptor(
      'midi-output-mapping-editor', 'midiOutputMappings', 'MIDI output mappings', midiOutputSummary),
  },
};

/** Look up a mapping kind; throws on a typo in a flow so it is caught at once. */
export function mappingKind(id: string): MappingKind {
  const kind = MAPPING_REGISTRY[id];
  if (!kind) throw new Error(`Unknown mapping kind "${id}" in a wizard flow`);
  return kind;
}
