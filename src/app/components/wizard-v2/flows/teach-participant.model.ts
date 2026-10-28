/**
 * Morse Code Studio
 */

import {
  AppSettings,
  KeyboardInputMapping,
  MidiInputMapping,
  SerialInputMapping,
} from '../../../services/settings.service';
import { ItemReviewLine } from '../../settings-items/item-descriptor';
import { ConditionContext } from '../engine/flow-types';

export type TeachInputType = 'keyboard' | 'mouse' | 'touch' | 'midi' | 'serial';
export type TeachParticipantRole = 'teacher' | 'student';

export interface TeachParticipantProfile {
  role: TeachParticipantRole;
  inputType: TeachInputType;
  keyboard: KeyboardInputMapping;
  midi: MidiInputMapping;
  serial: SerialInputMapping;
}

const COLORS = ['#88ccff', '#ffcc66', '#88ddaa', '#dd99ff', '#ff9999'];

export function createTeachParticipant(
  role: TeachParticipantRole,
  index: number,
): TeachParticipantProfile {
  const name = role === 'teacher' ? 'Teacher' : `Student ${index}`;
  const color = COLORS[index % COLORS.length];
  return {
    role,
    inputType: 'keyboard',
    keyboard: {
      enabled: true,
      mode: 'straightKey',
      keyCode: '',
      dahKeyCode: '',
      source: 'tx',
      reversePaddles: false,
      paddleMode: 'iambic-b',
      name,
      color,
    },
    midi: {
      enabled: true,
      deviceId: '',
      channel: 0,
      source: 'tx',
      mode: 'straightKey',
      value: 48 + index,
      dahValue: -1,
      reversePaddles: false,
      name,
      color,
    },
    serial: {
      enabled: true,
      mode: 'straightKey',
      pin: 'dsr',
      dahPin: 'cts',
      invert: false,
      source: 'tx',
      reversePaddles: false,
      paddleMode: 'iambic-b',
      portIndex: -1,
      pollInterval: 10,
      debounceMs: 5,
      name,
      color,
    },
  };
}

export function teachParticipantName(profile: TeachParticipantProfile): string {
  switch (profile.inputType) {
    case 'keyboard': return profile.keyboard.name;
    case 'midi': return profile.midi.name;
    case 'serial': return profile.serial.name;
    default: return profile.role === 'teacher' ? 'Teacher' : `Student`;
  }
}

export function teachParticipantChannelName(
  profile: TeachParticipantProfile,
  settings: AppSettings,
): string {
  if (profile.inputType === 'mouse') {
    return settings.mouseKeyerName.trim() || (profile.role === 'teacher' ? 'Teacher' : 'Student');
  }
  if (profile.inputType === 'touch') {
    return settings.touchKeyerName.trim() || (profile.role === 'teacher' ? 'Teacher' : 'Student');
  }
  return teachParticipantName(profile).trim() || (profile.role === 'teacher' ? 'Teacher' : 'Student');
}

export function teachParticipantColor(profile: TeachParticipantProfile): string {
  switch (profile.inputType) {
    case 'keyboard': return profile.keyboard.color;
    case 'midi': return profile.midi.color;
    case 'serial': return profile.serial.color;
    default: return '';
  }
}

export function teachParticipantKeys(
  ctx: ConditionContext,
  settings: AppSettings,
): Partial<AppSettings> {
  if (!usesLocalKeying(ctx)) return {};
  const profiles = activeTeachParticipants(ctx);
  const patch: Partial<AppSettings> = {};
  const keyboard = profiles.filter(profile => profile.inputType === 'keyboard');
  const midi = profiles.filter(profile => profile.inputType === 'midi');
  const serial = profiles.filter(profile => profile.inputType === 'serial');
  if (keyboard.length) {
    patch.keyboardInputMappings = [...settings.keyboardInputMappings, ...keyboard.map(profile => profile.keyboard)];
  }
  if (midi.length) {
    patch.midiInputMappings = [...settings.midiInputMappings, ...midi.map(profile => profile.midi)];
  }
  if (serial.length) {
    patch.serialInputMappings = [...settings.serialInputMappings, ...serial.map(profile => profile.serial)];
  }
  return patch;
}

export function teachParticipantReview(
  base: AppSettings,
  proposed: AppSettings,
  ctx: ConditionContext,
): ItemReviewLine[] {
  if (!usesLocalKeying(ctx)) return [];
  const lines: ItemReviewLine[] = [];
  const participants = activeTeachParticipants(ctx);
  const groups: {
    key: keyof AppSettings;
    label: string;
    mappings: Array<{ name: string }>;
  }[] = [
    {
      key: 'keyboardInputMappings',
      label: 'Keyboard participant mappings',
      mappings: participants.filter(profile => profile.inputType === 'keyboard').map(profile => profile.keyboard),
    },
    {
      key: 'midiInputMappings',
      label: 'MIDI participant mappings',
      mappings: participants.filter(profile => profile.inputType === 'midi').map(profile => profile.midi),
    },
    {
      key: 'serialInputMappings',
      label: 'Serial participant mappings',
      mappings: participants.filter(profile => profile.inputType === 'serial').map(profile => profile.serial),
    },
  ];
  for (const group of groups) {
    if (!group.mappings.length) continue;
    const before = base[group.key] as unknown[];
    const after = proposed[group.key] as unknown[];
    lines.push({
      key: group.key,
      label: group.label,
      before: `${before.length} configured`,
      after: `${after.length} configured; added ${group.mappings.map(mapping => mapping.name || 'unnamed').join(', ')}`,
    });
  }
  return lines;
}

export function validateTeachParticipants(ctx: ConditionContext): string[] {
  if (!usesLocalKeying(ctx)) return [];
  const profiles = activeTeachParticipants(ctx);
  const problems: string[] = [];
  const mice = profiles.filter(profile => profile.inputType === 'mouse').length;
  const touches = profiles.filter(profile => profile.inputType === 'touch').length;
  if (mice > 1) problems.push('The shared mouse can belong to one local participant only.');
  if (touches > 1) problems.push('The shared touch input can belong to one local participant only.');
  for (const profile of profiles) {
    if (profile.inputType === 'keyboard' && !profile.keyboard.name.trim()) {
      problems.push('Give each keyboard participant a display name.');
      break;
    }
    if (profile.inputType === 'midi' && !profile.midi.name.trim()) {
      problems.push('Give each MIDI participant a display name.');
      break;
    }
    if (profile.inputType === 'serial') {
      if (!profile.serial.name.trim()) {
        problems.push('Give each serial participant a display name.');
        break;
      }
      if (profile.serial.portIndex < 0) {
        problems.push('Choose a serial device for each serial participant.');
        break;
      }
    }
    if (profile.inputType === 'mouse' && !ctx.settings.mouseKeyerName.trim()) {
      problems.push('Give the shared mouse a display name.');
      break;
    }
    if (profile.inputType === 'touch' && !ctx.settings.touchKeyerName.trim()) {
      problems.push('Give the touch input a display name.');
      break;
    }
  }
  return problems;
}

export function selectedTeachParticipants(ctx: ConditionContext): TeachParticipantProfile[] {
  return activeTeachParticipants(ctx);
}

export function includesScenario(ctx: ConditionContext, scenario: string): boolean {
  const scenarios = ctx.answers['scenarios'];
  return Array.isArray(scenarios) && scenarios.includes(scenario);
}

export function usesLocalKeying(ctx: ConditionContext): boolean {
  return includesScenario(ctx, 'sending') || includesScenario(ctx, 'callResponse');
}

function activeTeachParticipants(ctx: ConditionContext): TeachParticipantProfile[] {
  const count = Number(ctx.answers['studentCount'] ?? 0);
  if (!Number.isInteger(count) || count < 0 || count > 4) return [];
  const profiles: TeachParticipantProfile[] = [];
  for (let index = 0; index <= count; index++) {
    const profile = ctx.answers[`participant${index}`];
    if (isTeachParticipantProfile(profile)) profiles.push(profile);
  }
  return profiles;
}

export function isTeachParticipantProfile(value: unknown): value is TeachParticipantProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Partial<TeachParticipantProfile>;
  return ['keyboard', 'mouse', 'touch', 'midi', 'serial'].includes(profile.inputType ?? '')
    && !!profile.keyboard && !!profile.midi && !!profile.serial;
}
