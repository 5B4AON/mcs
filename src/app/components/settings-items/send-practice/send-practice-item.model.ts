/**
 * Morse Code Studio
 */

import { KOCH_LESSON_COUNT } from '../../../data/koch-lessons';
import { SettingsFieldRules } from '../../../services/settings-common';
import { PRACTICE_CONTENT_MODES, PRACTICE_PIPELINES, PracticeContentMode, PracticePipeline } from '../practice/practice-item.model';
import { ItemDescriptor, labelledReview } from '../item-descriptor';
import type { AppSettings } from '../../../services/settings.service';
import { isValidSendPracticeInputId } from './send-practice-inputs';

/** Send practice content mode: the same kinds as Copy practice. */
export const SEND_PRACTICE_CONTENT_MODES = PRACTICE_CONTENT_MODES;
export type SendPracticeContentMode = PracticeContentMode;

/**
 * How a round is checked: 'live' marks the prompt as you key and ends by itself,
 * 'auto' checks at the end and ends by itself, 'manual' ends only with the Check button.
 */
export const SEND_PRACTICE_CHECK_MODES = ['live', 'auto', 'manual'] as const;
export type SendPracticeCheckMode = typeof SEND_PRACTICE_CHECK_MODES[number];

/** Pattern hint under the prompt: none, or the dots and dashes of the current character. */
export const SEND_PRACTICE_HINTS = ['off', 'current'] as const;
export type SendPracticeHint = typeof SEND_PRACTICE_HINTS[number];

/** Send practice pipeline: this device only, or the user's switched-on outputs too. */
export const SEND_PRACTICE_PIPELINES = PRACTICE_PIPELINES;
export type SendPracticePipeline = PracticePipeline;

/** Send practice is slower than copying, so Koch method starts at 5 groups (Copy practice starts at 10). */
export const SEND_KOCH_DEFAULT_COUNT = 5;

/** The settings the Send Practice item owns. */
export interface SendPracticeSettings {
  /** Master toggle: shows 'Send practice' in the Mode select when enabled */
  sendPracticeEnabled: boolean;
  /** Content mode: random characters, words, callsigns, or Koch method lessons */
  sendPracticeContentMode: SendPracticeContentMode;
  /** Number of groups/words/callsigns per round (1–10) */
  sendPracticeGroupCount: number;
  /** Group size for random characters and Koch (1–5) */
  sendPracticeCharGroupSize: number;
  /** Character pool: include letters */
  sendPracticeIncludeLetters: boolean;
  /** Character pool: include digits */
  sendPracticeIncludeNumbers: boolean;
  /** Character pool: include punctuation */
  sendPracticeIncludePunctuation: boolean;
  /** Koch method lesson (1–40), separate from the Copy practice lesson */
  sendPracticeKochLesson: number;
  /** Word length filter (any combination of 3, 4, 5) */
  sendPracticeWordLengths: number[];
  /** Check mode */
  sendPracticeCheckMode: SendPracticeCheckMode;
  /** Number of rounds in a transient session (1–5) */
  sendPracticeRounds: number;
  /** Pipeline: this device only (default) or full (serial, MIDI, WinKeyer, RTDB, etc.) */
  sendPracticePipeline: SendPracticePipeline;
  /** Which keys count as keying the prompt (picker ids, see send-practice-inputs.ts) */
  sendPracticeInputs: string[];
  /** Pattern hint under the prompt */
  sendPracticeHint: SendPracticeHint;
}

export const SEND_PRACTICE_DEFAULTS: SendPracticeSettings = {
  sendPracticeEnabled: false,
  sendPracticeContentMode: 'characters',
  sendPracticeGroupCount: 5,
  sendPracticeCharGroupSize: 1,
  sendPracticeIncludeLetters: true,
  sendPracticeIncludeNumbers: false,
  sendPracticeIncludePunctuation: false,
  sendPracticeKochLesson: 1,
  sendPracticeWordLengths: [3, 4, 5],
  sendPracticeCheckMode: 'live',
  sendPracticeRounds: 1,
  sendPracticePipeline: 'local',
  // The default keyboard mappings (a straight key and the paddle at index 1), the mouse and touch/sprite keys
  sendPracticeInputs: ['keyboard-straight', 'keyboard:1', 'mouse', 'touch'],
  sendPracticeHint: 'current',
};

/** How the check mode and pipeline read in a review; everything else reads like other items. */
function reviewText(key: keyof AppSettings, value: unknown): string {
  if (key === 'sendPracticeCheckMode') {
    return value === 'auto' ? 'At the end (auto)' : value === 'manual' ? 'At the end (manual)' : 'As you go';
  }
  if (key === 'sendPracticePipeline') return value === 'full' ? 'Full pipeline' : 'This device only';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'none';
  return value === '' || value === undefined || value === null ? 'none' : String(value);
}

export const SEND_PRACTICE_FIELD_RULES: SettingsFieldRules = {
  enums: {
    sendPracticeContentMode: SEND_PRACTICE_CONTENT_MODES,
    sendPracticeCheckMode: SEND_PRACTICE_CHECK_MODES,
    sendPracticePipeline: SEND_PRACTICE_PIPELINES,
    sendPracticeHint: SEND_PRACTICE_HINTS,
  },
  ranges: {
    sendPracticeKochLesson: [1, KOCH_LESSON_COUNT],
    sendPracticeGroupCount: [1, 10],
    sendPracticeCharGroupSize: [1, 5],
    sendPracticeRounds: [1, 5],
    'sendPracticeWordLengths[]': [3, 5],
  },
  integers: ['sendPracticeGroupCount', 'sendPracticeCharGroupSize', 'sendPracticeRounds', 'sendPracticeKochLesson', 'sendPracticeWordLengths[]'],
};

/** What the Send Practice item edits, checks and says in a review. */
export const SEND_PRACTICE_DESCRIPTOR: ItemDescriptor = {
  id: 'send-practice',
  keys: ['sendPracticeEnabled', 'sendPracticeContentMode', 'sendPracticeGroupCount', 'sendPracticeCharGroupSize', 'sendPracticeIncludeLetters', 'sendPracticeIncludeNumbers', 'sendPracticeIncludePunctuation', 'sendPracticeKochLesson', 'sendPracticeWordLengths', 'sendPracticeCheckMode', 'sendPracticeRounds', 'sendPracticePipeline', 'sendPracticeInputs', 'sendPracticeHint'],
  validate: s => {
    const problems: string[] = [];
    if (s.sendPracticeContentMode === 'characters' && !s.sendPracticeIncludeLetters && !s.sendPracticeIncludeNumbers && !s.sendPracticeIncludePunctuation) {
      problems.push('Pick at least one kind of character for send practice.');
    }
    if (s.sendPracticeEnabled && s.sendPracticeInputs.length === 0) {
      problems.push('Pick at least one key for send practice.');
    }
    if (!s.sendPracticeInputs.every(isValidSendPracticeInputId)) {
      problems.push('The list of keys for send practice has an unknown entry.');
    }
    return problems;
  },
  review: labelledReview({
    sendPracticeEnabled: 'Send practice',
    sendPracticeContentMode: 'Send practice content',
    sendPracticeGroupCount: 'Send practice count',
    sendPracticeCharGroupSize: 'Send practice group size',
    sendPracticeIncludeLetters: 'Send practice letters',
    sendPracticeIncludeNumbers: 'Send practice numbers',
    sendPracticeIncludePunctuation: 'Send practice punctuation',
    sendPracticeKochLesson: 'Send practice Koch lesson',
    sendPracticeWordLengths: 'Send practice word lengths',
    sendPracticeCheckMode: 'Send practice checking',
    sendPracticeRounds: 'Send practice rounds',
    sendPracticePipeline: 'Send practice output',
    sendPracticeInputs: 'Send practice keys',
    sendPracticeHint: 'Send practice pattern hint',
  }, reviewText),
};
