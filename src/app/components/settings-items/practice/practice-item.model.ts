/**
 * Morse Code Studio
 */

import { KOCH_LESSON_COUNT } from '../../../data/koch-lessons';
import { DECODER_SOURCES, DecoderSource, SettingsFieldRules } from '../../../services/settings-common';
import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** Copy practice content mode */
export const PRACTICE_CONTENT_MODES = ['characters', 'words', 'callsigns', 'koch'] as const;
export type PracticeContentMode = typeof PRACTICE_CONTENT_MODES[number];

/** Copy practice feedback mode */
export const PRACTICE_FEEDBACK_MODES = ['listen', 'blur', 'typealong'] as const;
export type PracticeFeedbackMode = typeof PRACTICE_FEEDBACK_MODES[number];

/** Group size and count that Koch method sets when it is chosen (10 groups of 5 is about a minute at 12 WPM). */
export const KOCH_DEFAULT_GROUP_SIZE = 5;
export const KOCH_DEFAULT_COUNT = 10;

/** Copy practice pipeline mode */
export const PRACTICE_PIPELINES = ['local', 'full'] as const;
export type PracticePipeline = typeof PRACTICE_PIPELINES[number];

/** The settings the Copy Practice item owns. */
export interface PracticeSettings {
  /** Master toggle — shows 'Practice' in encoder mode dropdown when enabled */
  practiceEnabled: boolean;
  /** Content mode: random characters, words, callsigns, or Koch method lessons */
  practiceContentMode: PracticeContentMode;
  /** Number of groups/words/callsigns per round (1–10) */
  practiceGroupCount: number;
  /** Group size for random characters mode (1–5) */
  practiceCharGroupSize: number;
  /** Character pool: include letters */
  practiceIncludeLetters: boolean;
  /** Character pool: include digits */
  practiceIncludeNumbers: boolean;
  /** Character pool: include punctuation */
  practiceIncludePunctuation: boolean;
  /** Koch method lesson (1–40): practise the characters of lessons 1 to this number */
  practiceKochLesson: number;
  /** Word length filter (any combination of 3, 4, 5) */
  practiceWordLengths: number[];
  /** Feedback mode: listen-only, blurred reveal, or type-along */
  practiceFeedbackMode: PracticeFeedbackMode;
  /** Number of Type-along rounds in a transient practice session (1–5) */
  practiceRounds: number;
  /** Pipeline: local audio only or full (serial, MIDI, RTDB, etc.) */
  practicePipeline: PracticePipeline;
  /** Input direction: characters appear as RX or TX */
  practiceSource: DecoderSource;
  /** Optional display name for practice input */
  practiceName: string;
  /** Optional text color for practice input */
  practiceColor: string;
}

export const PRACTICE_DEFAULTS: PracticeSettings = {
  practiceEnabled: false,
  practiceContentMode: 'characters',
  practiceGroupCount: 5,
  practiceCharGroupSize: 1,
  practiceIncludeLetters: true,
  practiceIncludeNumbers: false,
  practiceIncludePunctuation: false,
  practiceKochLesson: 1,
  practiceWordLengths: [3, 4, 5],
  practiceFeedbackMode: 'typealong',
  practiceRounds: 1,
  practicePipeline: 'local',
  practiceSource: 'rx',
  practiceName: '',
  practiceColor: '',
};

/** Koch method is always Type-along; the stored feedback choice is kept for the other content types. */
export function effectivePracticeFeedbackMode(
  settings: Pick<PracticeSettings, 'practiceContentMode' | 'practiceFeedbackMode'>,
): PracticeFeedbackMode {
  return settings.practiceContentMode === 'koch' ? 'typealong' : settings.practiceFeedbackMode;
}

export const PRACTICE_FIELD_RULES: SettingsFieldRules = {
  enums: {
    practiceContentMode: PRACTICE_CONTENT_MODES,
    practiceFeedbackMode: PRACTICE_FEEDBACK_MODES,
    practicePipeline: PRACTICE_PIPELINES,
    practiceSource: DECODER_SOURCES,
  },
  ranges: { practiceKochLesson: [1, KOCH_LESSON_COUNT] },
  integers: ['practiceGroupCount', 'practiceCharGroupSize', 'practiceRounds', 'practiceKochLesson', 'practiceWordLengths[]'],
};

/** What the Copy Practice item edits, checks and says in a review. */
export const PRACTICE_DESCRIPTOR: ItemDescriptor = {
  id: 'practice',
  keys: ['practiceEnabled', 'practiceContentMode', 'practiceGroupCount', 'practiceCharGroupSize', 'practiceIncludeLetters', 'practiceIncludeNumbers', 'practiceIncludePunctuation', 'practiceKochLesson', 'practiceWordLengths', 'practiceFeedbackMode', 'practiceRounds', 'practicePipeline', 'practiceSource', 'practiceName', 'practiceColor'],
  validate: s => s.practiceContentMode === 'characters' && !s.practiceIncludeLetters && !s.practiceIncludeNumbers && !s.practiceIncludePunctuation
    ? ['Pick at least one kind of character for practice.']
    : [],
  review: labelledReview({
    practiceEnabled: 'Copy practice',
    practiceContentMode: 'Practice content',
    practiceGroupCount: 'Practice count',
    practiceCharGroupSize: 'Practice group size',
    practiceIncludeLetters: 'Practice letters',
    practiceIncludeNumbers: 'Practice numbers',
    practiceIncludePunctuation: 'Practice punctuation',
    practiceKochLesson: 'Koch lesson',
    practiceWordLengths: 'Practice word lengths',
    practiceFeedbackMode: 'Practice feedback',
    practiceRounds: 'Practice rounds',
    practicePipeline: 'Practice output',
    practiceSource: 'Practice direction',
    practiceName: 'Practice name',
    practiceColor: 'Practice colour',
  }),
};
