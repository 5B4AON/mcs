/**
 * Morse Code Studio
 */

import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** What the Copy Practice item edits, checks and says in a review. */
export const PRACTICE_DESCRIPTOR: ItemDescriptor = {
  id: 'practice',
  keys: ['practiceEnabled', 'practiceContentMode', 'practiceGroupCount', 'practiceCharGroupSize', 'practiceIncludeLetters', 'practiceIncludeNumbers', 'practiceIncludePunctuation', 'practiceWordLengths', 'practiceFeedbackMode', 'practiceRounds', 'practicePipeline', 'practiceSource', 'practiceName', 'practiceColor'],
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
    practiceWordLengths: 'Practice word lengths',
    practiceFeedbackMode: 'Practice feedback',
    practiceRounds: 'Practice rounds',
    practicePipeline: 'Practice output',
    practiceSource: 'Practice direction',
    practiceName: 'Practice name',
    practiceColor: 'Practice colour',
  }),
};
