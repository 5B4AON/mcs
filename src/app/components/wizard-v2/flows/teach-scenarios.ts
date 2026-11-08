/**
 * Morse Code Studio
 */

import { ConditionContext, RunSheetSection, WizardLevel } from '../engine/flow-types';
import { WIZARD_LEVELS } from '../engine/levels';
import { AppSettings } from '../../../services/settings.service';
import { EmojiMapping } from '../../settings-items/emojis/emojis-item.model';
import { kochLessonLabel } from '../../../data/koch-lessons';
import { formatKeyCode } from '../../settings-items/mapping/keyboard-mapping-editor/keyboard-mapping-editor.component';

/*
 * Teach goal: the pure rules behind the flow (no UI, no services).
 *
 * The teacher answers who (audience), what (intent), how (approach) and then only
 * the questions that approach needs. Everything the approach implies is decided
 * here and applied as computed forced settings by `teach.flow.ts`, so the
 * teacher is never asked something the intent already answers.
 */

// ---- Audience ----

/** Who the session is for. */
export type Audience = 'kids' | 'teens' | 'public' | 'learners' | 'operators';

/** What an audience suggests; every value stays visible in the review. */
export interface AudienceInfo {
  label: string;
  /** Used in preset names */
  short: string;
  hint: string;
  /** Suggested speed (words per minute) */
  wpm: number;
  /** Suggested overall speed with longer gaps (equal to `wpm` for no extra pauses) */
  effective: number;
  /** Full-screen text size (the Settings scale, 24 to 240) */
  font: number;
  /** Items in a practice round */
  groups: number;
  wordLengths: number[];
  /** Example text for the run sheet */
  sample: string;
  /** How the run sheet and approach texts name the group ("the children") and one member ("a child") */
  people: string;
  one: string;
  minLevel: WizardLevel;
}

export const AUDIENCES: Record<Audience, AudienceInfo> = {
  kids: {
    label: 'Young children', short: 'Kids', minLevel: 'novice',
    hint: 'Very slow, with long pauses between letters, and very large text.',
    wpm: 8, effective: 4, font: 72, groups: 3, wordLengths: [3], sample: 'CAT DOG SUN', people: 'the children', one: 'a child',
  },
  teens: {
    label: 'Teenagers', short: 'Teens', minLevel: 'novice',
    hint: 'Slow, with some extra pauses between letters, and large text.',
    wpm: 10, effective: 6, font: 64, groups: 4, wordLengths: [3, 4], sample: 'HELLO WORLD', people: 'the teenagers', one: 'a teenager',
  },
  public: {
    label: 'Adults (a class, a club or the public at an event)', short: 'Public', minLevel: 'novice',
    hint: 'Slow and easy to follow, with large text that reads from the back of the room.',
    wpm: 8, effective: 5, font: 64, groups: 3, wordLengths: [3, 4], sample: 'HELLO', people: 'the adults', one: 'an adult',
  },
  learners: {
    label: 'People who already know some Morse', short: 'Learners', minLevel: 'novice',
    hint: 'A steady speed with short pauses between letters.',
    wpm: 12, effective: 8, font: 48, groups: 5, wordLengths: [3, 4, 5], sample: 'THE QUICK BROWN FOX', people: 'the learners', one: 'a learner',
  },
  operators: {
    label: 'Experienced operators', short: 'Operators', minLevel: 'intermediate',
    hint: 'A brisk speed with normal spacing.',
    wpm: 18, effective: 18, font: 36, groups: 10, wordLengths: [4, 5], sample: 'CQ CQ DE', people: 'the operators', one: 'an operator',
  },
};

export const AUDIENCE_ORDER: Audience[] = ['kids', 'teens', 'public', 'learners', 'operators'];

/** Level check shared by options and steps. */
export const atLeast = (level: WizardLevel, minimum: WizardLevel): boolean =>
  WIZARD_LEVELS.indexOf(level) >= WIZARD_LEVELS.indexOf(minimum);

type Answers = ConditionContext['answers'];

const text = (answers: Answers, id: string, fallback = ''): string =>
  typeof answers[id] === 'string' ? answers[id] as string : fallback;

/** The audience chosen on the second step. */
export function audienceOf(ctx: ConditionContext): Audience {
  const chosen = text(ctx.answers, 'audience');
  return chosen in AUDIENCES ? chosen as Audience : 'teens';
}

const capital = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

/**
 * Fills {people}, {People}, {one} and {One} in a text with the audience's own words, so a text never
 * calls adults "children". Without an audience the words are generic (the summary and preset names
 * already name the audience).
 */
export function forAudience(value: string, audience?: Audience): string {
  const people = audience ? AUDIENCES[audience].people : 'people';
  const one = audience ? AUDIENCES[audience].one : 'a person';
  return value
    .replace(/\{people\}/g, people).replace(/\{People\}/g, capital(people))
    .replace(/\{one\}/g, one).replace(/\{One\}/g, capital(one));
}

// ---- Scenarios ----

export type Intent = 'introduce' | 'send' | 'copy' | 'check' | 'class' | 'booth';

/** How the scenario works, which decides most of the settings. */
export type Family = 'typed' | 'keyed' | 'practice-copy' | 'practice-send' | 'online';

export interface ScenarioInfo {
  id: string;
  intent: Intent;
  /** The approach answer that picks it */
  value: string;
  label: string;
  hint: string;
  minLevel: WizardLevel;
  family: Family;
  /** Shown with Lens (one big letter at a time) unless a reward needs the conversation */
  lens: boolean;
  /** How many keys: none (typed), one demoer, two to compare, many for a class */
  keys: 'none' | 'one' | 'two' | 'many';
  /** The text stays hidden until the teacher reveals it */
  blur: boolean;
  /** Rewards are optional, required, built in, or not offered */
  rewards: 'none' | 'optional' | 'required' | 'built-in';
  /** Typed text plays letter by letter as typed, or when sent */
  typing: 'live' | 'enter' | 'none';
  /** Audiences this does not suit (for example first-timer demos for people who know Morse) */
  exclude?: Audience[];
  /**
   * The teacher's phone joins over the internet (only the teacher uses it, never the students):
   * `receive` = the phone sends and this computer only listens, `two-way` = this computer also
   * sends what the students key back to the phone.
   */
  phone?: 'receive' | 'two-way';
}

export const INTENT_QUESTION: Record<Intent, string> = {
  introduce: 'introApproach',
  send: 'sendApproach',
  copy: 'copyApproach',
  check: 'checkKind',
  class: 'classApproach',
  booth: 'boothApproach',
};

export const SCENARIOS: ScenarioInfo[] = [
  {
    id: 'intro-lens', intent: 'introduce', value: 'lens', minLevel: 'novice', family: 'typed',
    label: 'Show what Morse is, one letter at a time',
    hint: 'You type. The screen shows each letter very large with its dots and dashes below, and everyone hears it. A good first look at Morse.',
    lens: true, keys: 'none', blur: false, rewards: 'optional', typing: 'live', exclude: ['learners', 'operators'],
  },
  {
    id: 'intro-sos', intent: 'introduce', value: 'sos', minLevel: 'novice', family: 'keyed',
    label: 'The SOS demo: key it yourself',
    hint: 'You and {people} key the famous distress signal (three short, three long, three short) and a 🆘 appears on the screen. Fun, easy to remember, and everyone learns to send it. No key? You can type it instead.',
    lens: false, keys: 'one', blur: false, rewards: 'built-in', typing: 'none', exclude: ['learners', 'operators'],
  },
  {
    id: 'intro-names', intent: 'introduce', value: 'names', minLevel: 'novice', family: 'typed',
    label: 'Spell names in Morse',
    hint: 'You type the names of people in the room. Each person hears their own name as Morse and sees it written out whole.',
    lens: false, keys: 'none', blur: false, rewards: 'optional', typing: 'enter', exclude: ['learners', 'operators'],
  },
  {
    id: 'send-one', intent: 'send', value: 'one', minLevel: 'novice', family: 'keyed',
    label: 'One person keys, everyone watches',
    hint: 'Someone presses a key. The screen turns their dots and dashes into letters as they go.',
    lens: true, keys: 'one', blur: false, rewards: 'optional', typing: 'none',
  },
  {
    id: 'send-compare', intent: 'send', value: 'compare', minLevel: 'intermediate', family: 'keyed',
    label: 'Compare two kinds of key',
    hint: 'Two keys, each with its own name and colour on the screen, so everyone sees how a simple key and a two-lever key differ.',
    lens: false, keys: 'two', blur: false, rewards: 'optional', typing: 'none',
  },
  {
    id: 'copy-paper', intent: 'copy', value: 'paper', minLevel: 'novice', family: 'typed',
    label: 'Listen and write it down',
    hint: 'You type. Everyone listens and writes what they hear on paper. The text stays hidden until you reveal it.',
    lens: false, keys: 'none', blur: true, rewards: 'optional', typing: 'enter',
  },
  {
    id: 'copy-secret', intent: 'copy', value: 'secret', minLevel: 'novice', family: 'typed',
    label: 'A secret message',
    hint: 'You type a message that stays hidden on the screen. Everyone hears it and works out what it says, then you reveal the answer.',
    lens: false, keys: 'none', blur: true, rewards: 'optional', typing: 'enter',
  },
  {
    id: 'copy-chart', intent: 'copy', value: 'chart', minLevel: 'novice', family: 'typed',
    label: 'Read the dots and dashes',
    hint: 'You type a letter and the screen shows only its dots and dashes, large. Everyone works out the letter with a Morse chart, then you reveal it.',
    lens: true, keys: 'none', blur: true, rewards: 'optional', typing: 'live', exclude: ['operators'],
  },
  {
    id: 'copy-ladder', intent: 'copy', value: 'ladder', minLevel: 'intermediate', family: 'typed',
    label: 'A speed ladder',
    hint: 'Play the same text again and again, a little faster each time, so {people} feel themselves improving.',
    lens: false, keys: 'none', blur: false, rewards: 'optional', typing: 'enter',
  },
  {
    id: 'check-copy', intent: 'check', value: 'copy', minLevel: 'novice', family: 'practice-copy',
    label: 'How well can {people} copy Morse?',
    hint: 'The app plays Morse and {people} type or write what they hear, then you see how they did.',
    lens: false, keys: 'none', blur: false, rewards: 'none', typing: 'none',
  },
  {
    id: 'check-send', intent: 'check', value: 'send', minLevel: 'novice', family: 'practice-send',
    label: 'How well can {people} send Morse?',
    hint: 'The screen shows text. {One} keys it and the app marks what they got right.',
    lens: false, keys: 'one', blur: false, rewards: 'none', typing: 'none',
  },
  {
    id: 'class-chat', intent: 'class', value: 'chat', minLevel: 'intermediate', family: 'keyed',
    label: 'A group conversation',
    hint: 'You and {people} each have a key. Everyone\'s text appears on one shared screen, each person in their own colour.',
    lens: false, keys: 'many', blur: false, rewards: 'optional', typing: 'none',
  },
  {
    id: 'class-quiz', intent: 'class', value: 'quiz', minLevel: 'intermediate', family: 'keyed',
    label: 'A group quiz',
    hint: 'Like a conversation, with a reward that appears when {one} keys the right answer word.',
    lens: false, keys: 'many', blur: false, rewards: 'required', typing: 'none',
  },
  {
    id: 'class-online', intent: 'class', value: 'online', minLevel: 'expert', family: 'online',
    label: '{People} join from their own devices',
    hint: '{People} open the app on their phones and join your room over the internet. Everyone\'s text appears on your screen.',
    lens: false, keys: 'none', blur: false, rewards: 'optional', typing: 'enter',
  },
  {
    id: 'class-remote-lens', intent: 'class', value: 'remoteLens', minLevel: 'expert', family: 'typed',
    label: 'Run Lens from your phone',
    hint: 'You type on your phone and walk around the room. Each letter plays and shows very large on the computer, one at a time. Only your phone goes online.',
    lens: true, keys: 'none', blur: false, rewards: 'none', typing: 'live', phone: 'receive',
  },
  {
    id: 'class-remote-dictate', intent: 'class', value: 'remoteDictate', minLevel: 'expert', family: 'typed',
    label: 'Dictate from your phone',
    hint: 'You type a message on your phone. It plays on the computer while the text stays hidden, and {people} write down what they hear. Only your phone goes online.',
    lens: false, keys: 'none', blur: true, rewards: 'none', typing: 'enter', phone: 'receive',
  },
  {
    id: 'class-remote-quiz', intent: 'class', value: 'remoteQuiz', minLevel: 'expert', family: 'keyed',
    label: 'Challenges from your phone, answers on local keys',
    hint: 'You send questions or challenges from your phone. Everyone hears them on the computer and answers on their own keys, and their answers show on the computer and on your phone. Only your phone goes online.',
    lens: false, keys: 'many', blur: false, rewards: 'optional', typing: 'none', phone: 'two-way',
  },
  {
    id: 'booth-try', intent: 'booth', value: 'try', minLevel: 'novice', family: 'keyed',
    label: 'Let people take turns on the key',
    hint: 'Anyone can come up, key a few letters and see them appear while everyone watches, at a fair or in class. Clear the screen for the next person.',
    lens: false, keys: 'one', blur: false, rewards: 'optional', typing: 'none', exclude: ['learners', 'operators'],
  },
  {
    id: 'booth-challenge', intent: 'booth', value: 'challenge', minLevel: 'novice', family: 'keyed',
    label: 'A secret word challenge',
    hint: 'Visitors key a secret word to win a surprise reward on the screen.',
    lens: false, keys: 'one', blur: false, rewards: 'required', typing: 'none', exclude: ['operators'],
  },
];

/** The intents, in the order they are offered. */
export const INTENTS: Intent[] = ['introduce', 'send', 'copy', 'check', 'class', 'booth'];

/** The scenarios of an intent that this level and audience may choose. */
export function scenariosFor(intent: Intent, level: WizardLevel, audience: Audience): ScenarioInfo[] {
  return SCENARIOS.filter(s => s.intent === intent && atLeast(level, s.minLevel) && !s.exclude?.includes(audience));
}

/** The intents that have at least one scenario for this level and audience. */
export function intentsFor(level: WizardLevel, audience: Audience): Intent[] {
  return INTENTS.filter(intent => scenariosFor(intent, level, audience).length > 0);
}

/** The chosen scenario, or undefined while the answers do not point at one this level and audience allow. */
export function scenarioOf(ctx: ConditionContext): ScenarioInfo | undefined {
  const intent = text(ctx.answers, 'intent') as Intent;
  const approach = text(ctx.answers, INTENT_QUESTION[intent] ?? '');
  return scenariosFor(intent, ctx.level, audienceOf(ctx)).find(s => s.value === approach);
}

/**
 * Keeps earlier answers valid when a later-changed one narrows the choices (the audience or the
 * level): an intent, approach or reward that no longer fits moves to the first one that does.
 * Without it the next cards could still show, or silently use, an option that makes no sense
 * (a first-timer demo for experienced operators).
 */
export function reconcileAnswers(ctx: ConditionContext): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const audience = audienceOf(ctx);
  const intents = intentsFor(ctx.level, audience);
  if (intents.length && !intents.includes(text(ctx.answers, 'intent') as Intent)) patch['intent'] = intents[0];
  for (const intent of INTENTS) {
    const options = scenariosFor(intent, ctx.level, audience);
    const id = INTENT_QUESTION[intent];
    if (options.length && !options.some(s => s.value === text(ctx.answers, id))) patch[id] = options[0].value;
  }
  // Pet rewards suit children and teenagers, not people who already know Morse
  const experienced = audience === 'learners' || audience === 'operators';
  for (const id of ['rewardOpt', 'rewardReq']) {
    const picks = rewardPicks(ctx, id);
    if (experienced && picks.some(p => p === 'cat' || p === 'dog')) {
      const kept = picks.filter(p => p !== 'cat' && p !== 'dog');
      patch[id] = id === 'rewardReq' && !kept.length ? ['good'] : kept;
    }
  }
  // An exercise type that does not suit the audience goes back to the recommended one
  const what = text(ctx.answers, 'practiceWhat');
  if ((what === 'koch' && audience === 'operators') || (what === 'callsigns' && !experienced)) patch['practiceWhat'] = 'auto';
  return patch;
}

/** True when the teacher's phone is part of the session (it is the only device that uses the internet). */
export const viaPhone = (ctx: ConditionContext): boolean => !!scenarioOf(ctx)?.phone;

export const inFamily = (...families: Family[]) => (ctx: ConditionContext): boolean => {
  const scenario = scenarioOf(ctx);
  return !!scenario && families.includes(scenario.family);
};

export const isScenario = (...ids: string[]) => (ctx: ConditionContext): boolean => {
  const scenario = scenarioOf(ctx);
  return !!scenario && ids.includes(scenario.id);
};

// ---- Speed, size and typing ----

export type SpeedChoice = 'recommended' | 'slower' | 'faster' | 'exact';
const SPEED_FACTOR: Record<SpeedChoice, number> = { recommended: 1, slower: 0.75, faster: 1.33, exact: 1 };

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/** An answer of a step only the given level sees; a stale answer from a higher level is ignored. */
export function answerAt(ctx: ConditionContext, level: WizardLevel, id: string, fallback: string): string {
  return atLeast(ctx.level, level) ? text(ctx.answers, id, fallback) : fallback;
}

/** Speed and pauses for the chosen audience, adjusted by the speed and pause answers. */
export function speedPlan(ctx: ConditionContext): { wpm: number; effective: number; stretched: boolean } {
  const base = AUDIENCES[audienceOf(ctx)];
  const choice = answerAt(ctx, 'intermediate', 'speed', 'recommended') as SpeedChoice;
  const exact = ctx.level === 'expert' && choice === 'exact' ? Number(ctx.answers['exactWpm']) : 0;
  const wpm = exact > 0
    ? clamp(Math.round(exact), 5, 50)
    : clamp(Math.round(base.wpm * (SPEED_FACTOR[choice] ?? 1)), 5, 50);
  // Novice sessions always use the audience's pauses; Intermediate and Expert choose them
  const pauses = answerAt(ctx, 'intermediate', 'pauses', 'recommended');
  const exactOverall = ctx.level === 'expert' && pauses === 'exact' ? Number(ctx.answers['exactOverall']) : 0;
  const scaled = base.effective * wpm / base.wpm;
  const recommended = clamp(Math.round(scaled), 5, wpm);
  const longer = clamp(Math.round(scaled * 0.7), 5, wpm);
  // Used when the floor of 5 wpm (or no extra pauses) leaves too few distinct choices: halfway between the pauses and the full speed
  const slightly = Math.round(((recommended < wpm ? recommended : longer) + wpm) / 2);
  const effective = pauses === 'none'
    ? wpm
    : pauses === 'exact' && exactOverall > 0
      ? clamp(Math.round(exactOverall), 5, wpm)
      : pauses === 'more' ? longer : pauses === 'slightly' ? slightly : recommended;
  return { wpm, effective, stretched: effective < wpm };
}

/** "about one word every 7 seconds": the speed without the jargon. */
export function describeSpeed(wpm: number): string {
  const seconds = Math.round(60 / wpm);
  return `about one word every ${seconds} second${seconds === 1 ? '' : 's'}`;
}

const ROOM_FACTOR: Record<string, number> = { small: 0.75, class: 1, hall: 1.33 };

/** The largest text the wizard sets: ×4 the standard size (the Settings scale is 24 = ×1). */
const MAX_TEACH_FONT = 96;

/** Full-screen text size: the audience's, scaled for the room. */
export function fontSize(ctx: ConditionContext): number {
  const base = AUDIENCES[audienceOf(ctx)].font;
  return clamp(Math.round(base * (ROOM_FACTOR[answerAt(ctx, 'intermediate', 'room', 'class')] ?? 1)), 24, MAX_TEACH_FONT);
}

/** How typed text plays: the scenario's own way unless the teacher chose. */
export function typingMode(ctx: ConditionContext): 'live' | 'enter' {
  const chosen = answerAt(ctx, 'intermediate', 'typing', 'auto');
  if (chosen === 'live' || chosen === 'enter') return chosen;
  return scenarioOf(ctx)?.typing === 'live' ? 'live' : 'enter';
}

/** True when the typed text is hidden until the teacher reveals it. */
export function blurOn(ctx: ConditionContext): boolean {
  return !!scenarioOf(ctx)?.blur && text(ctx.answers, 'reveal', 'hide') !== 'show';
}

// ---- Rewards and the full-screen conversation ----

export interface RewardIdea { id: string; word: string; text: string; for: string }

export const REWARD_IDEAS: RewardIdea[] = [
  { id: 'good', word: 'GOOD', text: '⭐ Well done!', for: 'Any word to be proud of' },
  { id: 'cat', word: 'CAT', text: '🐱 Meow!', for: 'A favourite with children and teenagers' },
  { id: 'dog', word: 'DOG', text: '🐶 Woof!', for: 'A favourite with children and teenagers' },
  { id: 'wow', word: 'WOW', text: '🎉 Wow!', for: 'A celebration' },
  { id: 'yes', word: 'YES', text: '✅ Correct!', for: 'Quiz answers' },
];

const WORD_RULE = /^[A-Z0-9]{2,12}$/;
const PROSIGN_RULE = /^<[A-Z]{2,}>$/;

export interface Reward { word: string; text: string }

/** The reward ideas ticked on a rewards question (empty when nothing is ticked). */
export function rewardPicks(ctx: ConditionContext, id: string): string[] {
  const value = ctx.answers[id];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** The rewards the teacher ticked (suggestions and their own), if the scenario offers any. */
export function chosenRewards(ctx: ConditionContext): Reward[] {
  const scenario = scenarioOf(ctx);
  if (!scenario || (scenario.rewards !== 'optional' && scenario.rewards !== 'required')) return [];
  // Emoji replacements show only in the full-screen conversation, never in Lens, so a stale answer is ignored
  if (scenario.lens) return [];
  const rewards: Reward[] = [];
  for (const pick of rewardPicks(ctx, scenario.rewards === 'required' ? 'rewardReq' : 'rewardOpt')) {
    if (pick === 'custom') {
      rewards.push({ word: text(ctx.answers, 'rewardWord').trim().toUpperCase(), text: text(ctx.answers, 'rewardText').trim() });
      continue;
    }
    const idea = REWARD_IDEAS.find(i => i.id === pick);
    if (idea) rewards.push({ word: idea.word, text: idea.text });
  }
  return rewards;
}

/** True when the Expert step asked for the celebration trigger (never in a Lens setup, which cannot show it). */
export function surpriseOn(ctx: ConditionContext): boolean {
  const scenario = scenarioOf(ctx);
  return ctx.level === 'expert' && text(ctx.answers, 'surprise') === 'yes'
    && !!scenario && !scenario.lens && ['typed', 'keyed', 'online'].includes(scenario.family);
}

/** The trigger the Expert chose for the celebration, in capitals. */
export const surpriseTrigger = (ctx: ConditionContext): string => text(ctx.answers, 'surpriseTrigger', '<FW>').trim().toUpperCase();

const SHOW_EMOJI = '\u{1F386}';

/** True when the setup uses emoji replacements, which only the full-screen conversation shows. */
export function rewardsActive(ctx: ConditionContext): boolean {
  return chosenRewards(ctx).length > 0 || surpriseOn(ctx) || scenarioOf(ctx)?.rewards === 'built-in';
}

/** True when the full screen shows the conversation instead of Lens: a Lens scenario always shows Lens. */
export function conversationView(ctx: ConditionContext): boolean {
  const scenario = scenarioOf(ctx);
  return !scenario || !scenario.lens;
}

/** The mappings the setup needs, besides those already in the list. */
function wantedMappings(ctx: ConditionContext): EmojiMapping[] {
  const wanted: EmojiMapping[] = [];
  for (const reward of chosenRewards(ctx)) wanted.push({ enabled: true, match: reward.word, emoji: reward.text, meaning: 'Reward' });
  if (scenarioOf(ctx)?.rewards === 'built-in') wanted.push({ enabled: true, match: '<SOS>', emoji: '🆘', meaning: 'Distress' });
  if (surpriseOn(ctx)) wanted.push({ enabled: true, match: surpriseTrigger(ctx), emoji: SHOW_EMOJI, meaning: 'Celebration' });
  return wanted;
}

const sameMatch = (a: string, b: string): boolean => a.toUpperCase() === b.toUpperCase();

/**
 * The emoji list with the wanted mappings added; existing mappings are never edited or removed.
 * While pictures are switched off, the existing ones are switched off individually too, so turning
 * pictures on for the rewards does not also bring back every other picture in the list.
 */
export function withWantedMappings(ctx: ConditionContext): EmojiMapping[] {
  const list = ctx.settings.emojisEnabled
    ? [...ctx.settings.emojiMappings]
    : ctx.settings.emojiMappings.map(m => (m.enabled ? { ...m, enabled: false } : m));
  for (const mapping of wantedMappings(ctx)) {
    if (!list.some(m => m.enabled && sameMatch(m.match, mapping.match))) list.push(mapping);
  }
  return list;
}

/** Plain-language problems with the chosen reward words. */
export function rewardProblems(ctx: ConditionContext): string[] {
  const problems: string[] = [];
  const check = (word: string, text: string, what: string): void => {
    if (!WORD_RULE.test(word) && !PROSIGN_RULE.test(word)) {
      problems.push(`${what} must be a short word of letters or numbers (2 to 12), or a signal such as <FW>.`);
      return;
    }
    // While pictures are off, the existing ones are switched off with them, so they cannot clash
    const existing = ctx.settings.emojisEnabled ? ctx.settings.emojiMappings.find(m => m.enabled && sameMatch(m.match, word)) : undefined;
    if (existing && existing.emoji !== text) {
      problems.push(`${word} already shows ${existing.emoji}. Choose another word, or change that picture in Settings.`);
    }
  };
  const rewards = chosenRewards(ctx);
  for (const reward of rewards) {
    // A custom reward that is still being filled in is checked on its own step
    if (!reward.word && !reward.text) continue;
    if (!reward.text) problems.push('Say what the screen should show for the reward word.');
    else check(reward.word, reward.text, 'The reward word');
  }
  const words = rewards.map(r => r.word.toUpperCase()).filter(Boolean);
  const repeated = words.find((word, i) => words.indexOf(word) !== i);
  if (repeated) problems.push(`${repeated} is used for two rewards. Give each reward its own word.`);
  if (surpriseOn(ctx)) check(surpriseTrigger(ctx), SHOW_EMOJI, 'The celebration trigger');
  return problems;
}

// ---- Keys ----

export type KeyKind = 'keyboard' | 'mouse' | 'touch' | 'midi' | 'serial';

/** The key kinds the teacher chose for this scenario (a kind the level cannot see is ignored). */
export function chosenKeys(ctx: ConditionContext): KeyKind[] {
  const scenario = scenarioOf(ctx);
  if (!scenario) return [];
  if (scenario.keys === 'two') return ['keyboard'];
  if (scenario.keys === 'one') {
    const key = text(ctx.answers, 'keysOne') as KeyKind;
    // A Novice is offered the keyboard (or the touch screen) only
    const allowed = key === 'keyboard' || key === 'touch' || (key === 'mouse' && atLeast(ctx.level, 'intermediate'))
      || (key === 'midi' && atLeast(ctx.level, 'intermediate'));
    return key && allowed ? [key] : [];
  }
  if (scenario.keys === 'many') {
    const keys = ctx.answers['keysMany'];
    return Array.isArray(keys)
      ? (keys as KeyKind[]).filter(k => (k !== 'midi' && k !== 'serial') || atLeast(ctx.level, 'expert'))
      : [];
  }
  return [];
}

export const usesKey = (kind: KeyKind) => (ctx: ConditionContext): boolean => chosenKeys(ctx).includes(kind);

/** How many people the chosen keys let take part (a shared mouse or touch screen counts as one). */
export function participantCount(settings: AppSettings, keys: KeyKind[]): number {
  let count = 0;
  if (keys.includes('keyboard')) count += settings.keyboardInputMappings.filter(m => m.enabled && m.keyCode).length;
  if (keys.includes('mouse')) count += 1;
  if (keys.includes('touch')) count += 1;
  if (keys.includes('midi')) count += settings.midiInputMappings.filter(m => m.enabled).length;
  if (keys.includes('serial')) count += settings.serialInputMappings.filter(m => m.enabled).length;
  return count;
}

/** Send Practice's ids for the chosen keys (see `send-practice-inputs.ts`). */
export function sendPracticeIds(settings: AppSettings, keys: KeyKind[]): string[] {
  const ids: string[] = [];
  if (keys.includes('keyboard')) {
    if (settings.keyboardInputMappings.some(m => m.enabled && m.mode === 'straightKey')) ids.push('keyboard-straight');
    settings.keyboardInputMappings.forEach((m, i) => { if (m.enabled && m.mode === 'paddle') ids.push(`keyboard:${i}`); });
  }
  if (keys.includes('midi')) settings.midiInputMappings.forEach((m, i) => { if (m.enabled) ids.push(`midi:${i}`); });
  if (keys.includes('serial')) settings.serialInputMappings.forEach((m, i) => { if (m.enabled) ids.push(`serial:${i}`); });
  if (keys.includes('mouse')) ids.push('mouse');
  if (keys.includes('touch')) ids.push('touch');
  return ids;
}

/** True when the audience already knows Morse (learners and operators). */
export const knowsMorse = (ctx: ConditionContext): boolean => ['learners', 'operators'].includes(audienceOf(ctx));

/** True when a chosen key is a paddle, the only kind of key whose speed the key speed sets. */
export function paddleInvolved(ctx: ConditionContext): boolean {
  const s = ctx.settings;
  return chosenKeys(ctx).some(kind => {
    switch (kind) {
      case 'keyboard': return s.keyboardInputMappings.some(m => m.enabled && m.mode === 'paddle');
      case 'mouse': return [s.mouseLeftAction, s.mouseMiddleAction, s.mouseRightAction].some(a => a === 'dit' || a === 'dah');
      case 'touch': return s.touchKeyerMode === 'paddle';
      case 'midi': return s.midiInputMappings.some(m => m.enabled && m.mode === 'paddle');
      case 'serial': return s.serialInputMappings.some(m => m.enabled && m.mode === 'paddle');
      default: return false;
    }
  });
}

/** The key a Novice presses, read from the current settings (the first working straight key, else the first working key). */
export function keyboardKeyName(settings: AppSettings): string {
  const working = settings.keyboardInputMappings.filter(m => m.enabled && m.keyCode);
  const mapping = working.find(m => m.mode === 'straightKey') ?? working[0];
  return mapping ? formatKeyCode(mapping.keyCode) : '';
}

/** One sentence about the key to use, for a scenario with a single key. */
function keyLine(ctx: ConditionContext): string[] {
  const scenario = scenarioOf(ctx);
  if (scenario?.keys !== 'one') return [];
  const key = chosenKeys(ctx)[0];
  if (key === 'keyboard') {
    const name = keyboardKeyName(ctx.settings);
    return [name ? `Press the ${name} key: a short press is a dot and a longer press is a dash.` : 'Use the key you set up: a short press is a dot and a longer press is a dash.'];
  }
  if (key === 'touch') return ['Tap the touch screen: a short tap is a dot and a longer tap is a dash.'];
  if (key === 'mouse') return ['Use the mouse buttons you set up to key the dots and dashes.'];
  if (key === 'midi') return ['Use the plugged-in key you set up.'];
  return [];
}

// ---- Practice content ----

export type PracticeWhat = 'koch' | 'letters' | 'words' | 'callsigns';

const PRACTICE_WHAT_TEXT: Record<PracticeWhat, { label: string; hint: string }> = {
  koch: { label: 'Letters in lessons', hint: 'Start with a few letters and add more, one lesson at a time. The tried-and-true way to teach Morse.' },
  letters: { label: 'Random letters', hint: 'Letters in no particular order.' },
  words: { label: 'Short words', hint: 'Real words, which are easier to remember.' },
  callsigns: { label: 'Call signs', hint: 'Letters and numbers in the pattern of amateur radio call signs, as heard on the air.' },
};

/** What the exercise contains: the teacher's choice, or the one that suits the audience. */
export function practiceWhatOf(ctx: ConditionContext): PracticeWhat {
  const chosen = text(ctx.answers, 'practiceWhat', 'auto');
  if (chosen in PRACTICE_WHAT_TEXT) return chosen as PracticeWhat;
  const audience = audienceOf(ctx);
  return audience === 'operators' ? 'callsigns' : audience === 'learners' ? 'words' : audience === 'kids' ? 'letters' : 'koch';
}

/** How answers are checked: the teacher's choice, or the audience's (children write on paper). */
export function checkingOf(ctx: ConditionContext): 'typealong' | 'blur' | 'listen' {
  const chosen = answerAt(ctx, 'intermediate', 'practiceChecking', 'auto');
  if (chosen === 'typealong' || chosen === 'blur' || chosen === 'listen') return chosen;
  return audienceOf(ctx) === 'kids' ? 'blur' : 'typealong';
}

/** The content choices for the audience; the one that suits it stands for the stored `auto` answer. */
export function practiceWhatOptions(ctx: ConditionContext): { value: string; label: string; hint: string; alias?: string }[] {
  const audience = audienceOf(ctx);
  const experienced = audience === 'learners' || audience === 'operators';
  const kinds: PracticeWhat[] = [
    ...(audience === 'operators' ? [] : ['koch' as const]),
    'letters', 'words',
    ...(experienced ? ['callsigns' as const] : []),
  ];
  const recommended = practiceWhatOf({ ...ctx, answers: { ...ctx.answers, practiceWhat: 'auto' } });
  return kinds.map(kind => ({ value: kind, ...PRACTICE_WHAT_TEXT[kind], ...(kind === recommended ? { alias: 'auto' } : {}) }));
}

/** True when the exercise is made of Koch lessons. */
export const practiceIs = (kind: PracticeWhat) => (ctx: ConditionContext): boolean => practiceWhatOf(ctx) === kind;

export const KOCH_OPTIONS = Array.from({ length: 40 }, (_, i) => ({
  value: String(i + 1),
  label: `Lesson ${kochLessonLabel(i + 1)}`,
}));

/** Short phrase for a run sheet: what the practice round contains. */
function practiceContent(ctx: ConditionContext): string {
  const what = practiceWhatOf(ctx);
  if (what === 'koch') return `letters from lesson ${answerAt(ctx, 'intermediate', 'kochLesson', '1')} and the lessons before it`;
  return what === 'words' ? 'short words' : what === 'callsigns' ? 'call signs' : 'random letters';
}

// ---- Run sheet and summary ----

const LEAVE = 'To leave the full screen, press Escape or the X at the top.';

function sample(ctx: ConditionContext): string {
  return AUDIENCES[audienceOf(ctx)].sample;
}

function rewardLines(ctx: ConditionContext): string[] {
  const lines: string[] = [];
  for (const reward of chosenRewards(ctx)) {
    lines.push(`When someone keys or types ${reward.word}, the screen shows ${reward.text}. Tell ${AUDIENCES[audienceOf(ctx)].people} the word, or keep it secret.`);
  }
  if (surpriseOn(ctx)) lines.push(`Keying or sending ${surpriseTrigger(ctx)} starts a fireworks show. The next character ends it.`);
  return lines;
}

function signalLines(ctx: ConditionContext): string[] {
  // Children, teenagers and the public clear the screen with its button: keying AR is not realistic for them
  if (!knowsMorse(ctx)) return ['Clear the screen between turns with the Clear button at the top of the full screen.'];
  // The signals only work while they are switched on (already, or by the answer to the signals step)
  if (!ctx.settings.prosignActionsEnabled && text(ctx.answers, 'signals') !== 'on') {
    return ['Clear the screen between turns with the Clear button at the top of the full screen.'];
  }
  const actions = ctx.settings.prosignActions;
  const lines: string[] = [];
  if (actions['<AR>']?.enabled) lines.push('Key AR (dit dah dit dah dit) to clear the screen for the next person.');
  if (actions['<BK>']?.enabled) lines.push('Key BK to start a new paragraph.');
  if (actions['<HH>']?.enabled) lines.push('Key HH (eight dits) to erase the last word after a mistake.');
  return lines;
}

/** Steps for each scenario: what to do before the session and during it. */
function body(ctx: ConditionContext, scenario: ScenarioInfo): { before: string[]; during: string[] } {
  const hello = sample(ctx);
  const people = AUDIENCES[audienceOf(ctx)].people;
  const one = AUDIENCES[audienceOf(ctx)].one;
  switch (scenario.id) {
    case 'intro-lens':
      return {
        before: ['Say what Morse is in one sentence: letters sent as short and long beeps.'],
        during: [`Type a word such as ${hello} and watch each letter appear large with its dots and dashes.`,
          `Ask ${people} what they notice: some letters are quick, some are long.`],
      };
    case 'intro-sos':
      return {
        before: [`Tell ${people} that SOS is the most famous Morse message.`,
          'Before keying it, ask if anyone knows what three short presses, three long and three short mean.'],
        during: ['Key SOS: three short presses, three long, three short, quickly and with no pauses between them (...---...). Then pause for a moment: the 🆘 appears on the screen.',
          `Let ${people} try it, one at a time. Keying it themselves is the best way to remember it.`,
          'No key? Switch to Type with the Key/Type button at the top of the full screen, type <SOS> and press Enter (the angle brackets make it one signal). The 🆘 shows as it plays.'],
      };
    case 'intro-names':
      return {
        before: ['Ask each person to say their name aloud, or write the names where you can see them.'],
        during: ['Type one name at a time and press Enter, so that person hears the whole name.', 'Compare how long different names sound.'],
      };
    case 'copy-secret':
      return {
        before: ['Prepare a short secret message of a few words.'],
        during: ['Type it and press Enter. Everyone hears it while the text stays hidden.',
          'Replay the last line with the replay button (the circular arrow) as often as needed.',
          'Hold the reveal button to show the answer to everyone.'],
      };
    case 'send-one':
      return {
        before: ['Show everyone the key before you start.'],
        during: ['Let one person press the key in short and long presses. Watch the letters appear on the screen.',
          'Ask them to try their first initial.'],
      };
    case 'send-compare':
      return {
        before: ['Name the two keys on screen so everyone knows which is which: for example "Straight key" and "Paddle".'],
        during: ['Key the same word on each key, one after the other, and compare how each feels and looks.'],
      };
    case 'copy-paper':
      return {
        before: ['Give everyone paper and a pen.', `Prepare a few words such as ${hello}.`],
        during: ['Type a word and press Enter. Everyone listens and writes it down. Replay it with the replay button if they ask.',
          'Hold the reveal button to show the answer, then talk about what was hard.'],
      };
    case 'copy-chart':
      return {
        before: ['Hand out a printed Morse chart or put one on the wall, so everyone can look the symbols up.'],
        during: ['Type one letter at a time. The screen shows only its dots and dashes, large, and the letter stays hidden.',
          'Everyone finds the letter in the chart.', 'Hold the reveal button to show the letter and check their answer.'],
      };
    case 'copy-ladder':
      return {
        before: [`Choose one text, for example ${hello}.`],
        during: ['Play it once. Then raise the speed a little with Morse Speeds in the menu and play it again.',
          'Repeat until it gets hard to follow, then go back one step.'],
      };
    case 'check-copy': {
      const how = checkingOf(ctx);
      const checking = practiceWhatOf(ctx) === 'koch' || how === 'typealong'
        ? `${capital(people)} type what they hear; the app marks it at the end.`
        : how === 'blur' ? `${capital(people)} write on paper; hold the reveal button to show the answer.`
        : `${capital(people)} just listen; nothing is checked.`;
      return {
        before: [`The round plays ${practiceContent(ctx)}.`, 'Press the round button on the full screen (the large play button) when everyone is ready.'],
        during: [checking, 'When the round ends, talk through the result.'],
      };
    }
    case 'check-send':
      return {
        before: [`The prompts are ${practiceContent(ctx)}.`, `Make sure ${one} can reach the key.`],
        during: ['The text on the screen is keyed by one person at a time. The app marks each character.',
          'When the round ends, talk through the result, then use the button on the full screen for the next round.'],
      };
    case 'class-chat':
      return {
        before: ['Give each person a key and tell them their name and colour on the screen.', 'Agree who goes first.'],
        during: ['Take turns keying short messages. Everyone sees whose text is whose.', `Ask ${people} to answer the last message in Morse.`],
      };
    case 'class-quiz':
      return {
        before: ['Prepare questions whose answer is the reward word.', 'Give each person a key and their name on screen.'],
        during: [`Ask a question. The first person to key the right word gets the reward on the screen.`],
      };
    case 'class-online':
      return {
        before: ['Note the room name and password: they are not saved in a preset.',
          `Give ${people} the joining steps below on a board or slide.`],
        during: [`Type a short message and press Enter. ${capital(people)} receive it on their phones.`,
          'Their replies appear on your screen with their names and colours.'],
      };
    case 'class-remote-lens':
      return {
        before: ['Set up your phone as shown below, then type one letter on it. It should play here and appear very large on this screen.'],
        during: ['Type letters or short words on your phone, one at a time. Each letter plays here and shows large, with its dots and dashes below.',
          'You can walk around the room: the phone controls this screen.',
          'Ask everyone to call out each letter before you type the next one.'],
      };
    case 'class-remote-dictate':
      return {
        before: ['Set up your phone as shown below. Hand out paper and pencils.'],
        during: ['Type a short message on your phone and press Enter. It plays here while the text stays hidden.',
          'Everyone writes what they hear. Send it again if they ask.',
          'To check, hold the reveal button on this screen to show everyone the answer.'],
      };
    case 'class-remote-quiz':
      return {
        before: ['Set up your phone as shown below.', 'Give each person a key and tell them their name and colour on the screen.'],
        during: ['Type a challenge on your phone, for example a word to answer back, and press Enter. It plays here under your name.',
          'Everyone answers on their own keys. Their answers show on this screen and on your phone, so you can follow along from anywhere in the room.'],
      };
    case 'booth-try':
      return {
        before: ['Show people which key to press.'],
        during: ['Let each person key a few letters.', 'Say "Next!" and clear the screen for the next person.'],
      };
    case 'booth-challenge':
      return {
        before: ['Keep the secret word to yourself, or print it as a puzzle for visitors.'],
        during: ['Visitors key the word. When it is right the reward shows on the screen.'],
      };
    default:
      return { before: [], during: [] };
  }
}

/** Joining steps for people who use their own devices. */
function joinLines(ctx: ConditionContext): string[] {
  const audience = audienceOf(ctx);
  return [
    'Open the app on your phone.',
    'Open the Setup Wizard and choose "Talk over the internet".',
    `Enter the room name (${ctx.settings.rtdbInputChannelName || 'your room name'}) and the room password.`,
    ...(audience === 'kids' || audience === 'teens' ? ['Pick your name and colour. An animal emoji makes a fun name.'] : ['Pick your name and colour.']),
  ];
}

/** Setting up the teacher's phone: the same room, with sending (and, for two-way sessions, receiving) matching this computer. */
function phoneLines(ctx: ConditionContext, scenario: ScenarioInfo): string[] {
  const room = ctx.settings.rtdbInputChannelName || 'your room name';
  const twoWay = scenario.phone === 'two-way';
  const sendMode = scenario.typing === 'live'
    ? 'Live (each letter plays as you type)'
    : 'Send on Enter (you type a message, then press Enter)';
  const lines = [
    'Open the app on your phone. Only your phone goes online: nobody else needs to.',
    'Open Settings, then the Outputs tab, and switch on the Firebase RTDB Output card.',
    `Channel Name: ${room}. Channel Secret: the same password you entered on this computer. They are not saved in a preset.`,
    twoWay
      ? 'Name: give your phone a name that is different from the one on this computer. A computer ignores messages that carry a name it uses itself.'
      : 'Name: any name you like.',
    'Forward: "TX only". Then open the Keyboard Encoder card and set "Used for" to TX, so that what you type counts as sent (TX).',
    `Send mode: ${sendMode}.`,
  ];
  if (twoWay) {
    lines.push(
      'To see the answers on your phone: in Settings, open the Inputs tab, switch on the Firebase RTDB card, enter the same room name and password, and set "Used for" to RX.',
    );
  }
  lines.push('Optional: turn the phone\'s volume down. Everyone hears everything from this computer.');
  return lines;
}

/** How RX and TX line up between the phone and this computer. */
function rxTxLines(scenario: ScenarioInfo): string[] {
  const lines = [
    'Your phone sends what you type as TX. This computer receives it as RX, so it shows in the received colour and plays the beep for received Morse.',
    'This computer plays your phone\'s messages at the speed set here, whatever speed the phone uses.',
  ];
  if (scenario.phone === 'two-way') {
    lines.push('The keys used here count as TX on this computer and go to your phone as TX. Your phone receives them as RX.');
  }
  return lines;
}

/** The run sheet: plain, numbered instructions for the teacher. */
export function runSheetFor(ctx: ConditionContext): RunSheetSection[] {
  const scenario = scenarioOf(ctx);
  if (!scenario) return [];
  const { before, during } = body(ctx, scenario);
  const onMain = scenario.family === 'online' && text(ctx.answers, 'onlineScreen') === 'main';
  const sections: RunSheetSection[] = [
    {
      heading: 'Before you start',
      lines: [
        'Connect the computer to the big screen and turn the volume up.',
        onMain ? 'Press Apply: you stay on the main screen, where the conversation appears.' : 'Press Apply: the full screen opens by itself.',
        ...keyLine(ctx),
        ...before,
      ],
    },
    { heading: 'During the session', lines: [...during, ...rewardLines(ctx), ...(scenario.family === 'keyed' || scenario.family === 'online' ? signalLines(ctx) : [])] },
  ];
  if (scenario.family === 'online') sections.push({ heading: 'What people do on their own device', lines: joinLines(ctx) });
  if (scenario.phone) {
    sections.push({ heading: 'Set up your phone', lines: phoneLines(ctx, scenario) });
    sections.push({ heading: 'How RX and TX line up', lines: rxTxLines(scenario) });
  }
  sections.push({ heading: 'Afterwards', lines: [...(onMain ? [] : [LEAVE]), 'Save the setup as a preset to run it again without setting it up.'] });
  return sections;
}

/** What the setup will do, in plain language, for the top of the review. */
export function summaryFor(ctx: ConditionContext): string[] {
  const scenario = scenarioOf(ctx);
  if (!scenario) return [];
  const audience = AUDIENCES[audienceOf(ctx)];
  const speed = speedPlan(ctx);
  const lines = [`${forAudience(scenario.label).replace(/\?$/, '')}, for ${audience.label.charAt(0).toLowerCase()}${audience.label.slice(1)}.`];
  lines.push(scenario.family === 'online' && text(ctx.answers, 'onlineScreen') === 'main'
    ? 'Everyone\'s text shows on the main screen.'
    : conversationView(ctx)
      ? 'Opens the full screen showing the whole conversation in large text.'
      : 'Opens the full screen showing one big letter at a time, with its dots and dashes.');
  if (scenario.phone) {
    lines.push(scenario.phone === 'two-way'
      ? 'Your phone and this computer share a private room over the internet: your messages play here and the answers keyed here go back to your phone. Nobody else goes online.'
      : 'Your phone sends to this computer through a private room over the internet. Nobody else goes online.');
  }
  const pausesApply = ['typed', 'practice-copy', 'online'].includes(scenario.family) || !!scenario.phone;
  lines.push(`Morse plays ${describeSpeed(speed.wpm)}${pausesApply
    ? speed.stretched
      ? `, with longer pauses between letters (${describeSpeed(speed.effective)} overall)`
      : ', with no extra pauses'
    : ''}.`);
  for (const reward of chosenRewards(ctx)) lines.push(`Adds a reward: ${reward.word} shows ${reward.text}.`);
  if (surpriseOn(ctx)) lines.push('Adds a celebration signal.');
  if (blurOn(ctx)) lines.push('Typed text stays hidden until you reveal it.');
  if (scenario.family === 'practice-copy' || scenario.family === 'practice-send') lines.push('Everything stays on this computer: nothing is sent to other devices.');
  return lines;
}

/** Suggested preset name, kept inside the name length limit. */
export function presetNameFor(ctx: ConditionContext): string {
  const scenario = scenarioOf(ctx);
  const name = scenario ? `${forAudience(scenario.label)} (${AUDIENCES[audienceOf(ctx)].short})` : 'Teaching setup';
  return name.length > 40 ? `${name.slice(0, 39)}…` : name;
}
