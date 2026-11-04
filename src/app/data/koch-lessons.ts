/**
 * Morse Code Studio
 */

/**
 * Koch method lessons: the characters introduced by each lesson, in the order
 * they are learned (lesson 1 teaches K and M together, every later lesson adds
 * one character). Lesson N practises every character from lessons 1 to N.
 */
export const KOCH_LESSONS: readonly (readonly string[])[] = [
  ['K', 'M'], ['U'], ['R'], ['E'], ['S'], ['N'], ['A'], ['P'], ['T'], ['L'],
  ['W'], ['I'], ['.'], ['J'], ['Z'], ['='], ['F'], ['O'], ['Y'], [','],
  ['V'], ['G'], ['5'], ['/'], ['Q'], ['9'], ['2'], ['H'], ['3'], ['8'],
  ['B'], ['?'], ['4'], ['7'], ['C'], ['1'], ['D'], ['6'], ['0'], ['X'],
];

/** Share of the picks that go to the characters introduced by the current lesson (when older ones exist). */
export const KOCH_NEWEST_WEIGHT = 0.3;

/** Number of Koch lessons (the highest lesson number). */
export const KOCH_LESSON_COUNT = KOCH_LESSONS.length;

/** Keep a lesson number inside 1..KOCH_LESSON_COUNT. */
export function clampKochLesson(lesson: number): number {
  return Math.min(KOCH_LESSON_COUNT, Math.max(1, Math.round(lesson) || 1));
}

/** Characters first introduced by the given lesson. */
export function kochNewChars(lesson: number): readonly string[] {
  return KOCH_LESSONS[clampKochLesson(lesson) - 1];
}

/** Every character practised in the given lesson (lessons 1 to N). */
export function kochPool(lesson: number): string[] {
  return KOCH_LESSONS.slice(0, clampKochLesson(lesson)).flat();
}

/** Label for the Lesson select, e.g. "1 - K, M" or "2 - U". */
export function kochLessonLabel(lesson: number): string {
  return `${clampKochLesson(lesson)} - ${kochNewChars(lesson).join(', ')}`;
}
