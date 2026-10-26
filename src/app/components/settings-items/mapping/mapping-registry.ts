/**
 * Morse Code Studio
 */

import { AppSettings, KeyboardInputMapping, MidiInputMapping } from '../../../services/settings.service';
import { midiNoteName } from '../../../services/midi-input.service';
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
  /** One short line describing a mapping, for the list page and the review */
  summary(mapping: unknown): string;
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
};

/** Look up a mapping kind; throws on a typo in a flow so it is caught at once. */
export function mappingKind(id: string): MappingKind {
  const kind = MAPPING_REGISTRY[id];
  if (!kind) throw new Error(`Unknown mapping kind "${id}" in a wizard flow`);
  return kind;
}
