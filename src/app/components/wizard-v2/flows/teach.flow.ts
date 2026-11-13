/**
 * Morse Code Studio
 */

import { all, any, answerIs, not, settingIs } from '../engine/conditions';
import { Condition, ConditionContext, ForcedSetting, QuestionOption, StepQuestion, WizardFlow, WizardStep } from '../engine/flow-types';
import { LEVEL_QUESTION, LEVEL_QUESTION_ID } from '../engine/levels';
import { isTouchDevice } from '../../../services/settings-common';
import { MIDI_SUPPORTED, SERIAL_SUPPORTED } from './device-support';
import { inPracticeMode } from './shared-steps';
import {
  AUDIENCES, AUDIENCE_ORDER, INTENT_QUESTION, Intent, KOCH_OPTIONS, KeyKind, REWARD_IDEAS,
  practiceIs, practiceWhatOf, practiceWhatOptions, intentsFor, reconcileAnswers, checkingOf, knowsMorse, paddleInvolved,
  atLeast, answerAt, audienceOf, blurOn, chosenKeys, chosenRewards, rewardPicks, conversationView, describeSpeed, fontSize, inFamily, isScenario,
  participantCount, presetNameFor, rewardProblems, rewardsActive, runSheetFor, scenarioOf, scenariosFor, sendPracticeIds,
  forAudience, speedPlan, summaryFor, typingMode, usesKey, viaPhone, withWantedMappings,
} from './teach-scenarios';

/*
 * Goal "Teach or demonstrate Morse"
 * ---------------------------------
 * The teacher answers who (audience), what (intent) and how (approach), then only
 * the questions that approach needs, and ends with one specific scenario: a
 * ready-to-run setup (or a saved preset) plus a run sheet. The rules live in
 * `teach-scenarios.ts`; this file declares the steps. Everything the approach
 * implies is applied as computed forced settings, so the teacher is never asked
 * something the intent already decides (for example the screen: sessions open the
 * full screen). The wizard never switches an external route on by itself and never
 * starts audio; it only changes what the teacher chose, and says what it decided.
 */

const inScenario: Condition = ctx => !!scenarioOf(ctx);
const keys = (count: 'one' | 'two' | 'many'): Condition => ctx => scenarioOf(ctx)?.keys === count;
const koch: Condition = practiceIs('koch');
const practiceFamilies = inFamily('practice-copy', 'practice-send');

// ---- Level step (the goal's own wording) ----

const LEVEL_STEP_TEACH: WizardStep = {
  id: LEVEL_QUESTION_ID,
  title: 'How comfortable are you with Morse and with teaching it?',
  intro: 'Your answer decides how many questions you are asked and which kinds of session are offered. You can go back and change it.',
  questions: [{
    ...LEVEL_QUESTION,
    options: [
      { value: 'novice', label: 'Novice', hint: 'New to Morse or to this app. A few simple questions, with good choices already made for you. No special equipment needed.' },
      { value: 'intermediate', label: 'Intermediate', hint: 'You know the basics. Adds group activities where several people have their own key, and choices about speed and room size.' },
      { value: 'expert', label: 'Expert', hint: 'You want every option: plugged-in keys, people joining over the internet, exact speeds and extra surprises.' },
    ],
  }],
};

// ---- Who, what, how ----

const INTENT_OPTIONS: (QuestionOption & { minLevel: 'novice' | 'intermediate' })[] = [
  { value: 'introduce', label: 'Show first-timers what Morse is', hint: 'A short, friendly demo that shows and plays Morse. No experience needed.', minLevel: 'novice' },
  { value: 'send', label: 'Show how Morse is sent', hint: 'Someone presses a key and the screen turns it into letters.', minLevel: 'novice' },
  { value: 'copy', label: 'Show how Morse is copied', hint: 'Play Morse and let everyone work out what it says.', minLevel: 'novice' },
  { value: 'check', label: 'Check what people can do', hint: 'Test how well people copy or send Morse, with a result at the end.', minLevel: 'novice' },
  { value: 'class', label: 'Run a group activity', hint: 'Several people take part at once, each with their own key.', minLevel: 'intermediate' },
  { value: 'booth', label: 'Let people take turns, at a fair or in class', hint: 'People come up one at a time to try Morse, and can win rewards. Nothing to set up between turns.', minLevel: 'novice' },
];

const AUDIENCE_QUESTION: StepQuestion = {
  id: 'audience',
  label: 'Your audience',
  kind: 'single',
  default: 'teens',
  // Remembered between visits like the level; never counts as a change
  preference: true,
  optionsFrom: ctx => AUDIENCE_ORDER
    .filter(a => atLeast(ctx.level, AUDIENCES[a].minLevel))
    .map(a => ({ value: a, label: AUDIENCES[a].label, hint: AUDIENCES[a].hint })),
};

/** One step that asks for the approach of an intent; its options follow the level. */
function approachStep(intent: Intent, title: string, intro: string, fallback: string, when: Condition): WizardStep {
  const id = INTENT_QUESTION[intent];
  return {
    id,
    title,
    intro,
    // With only one approach left for this level and audience there is nothing to choose
    when: all(when, ctx => scenariosFor(intent, ctx.level, audienceOf(ctx)).length > 1),
    questions: [{
      id,
      label: title,
      kind: 'single',
      default: fallback,
      optionsFrom: ctx => scenariosFor(intent, ctx.level, audienceOf(ctx)).map(s => ({ value: s.value, label: forAudience(s.label, audienceOf(ctx)), hint: forAudience(s.hint, audienceOf(ctx)) })),
    }],
    validate: ctx => scenarioOf(ctx) ? [] : ['Choose one of the options.'],
  };
}

const intent = (value: Intent): Condition => answerIs('intent', value);
const atLevel = (level: 'intermediate' | 'expert'): Condition => ctx => atLeast(ctx.level, level);

// ---- Keys ----

const KEY_LABELS: Record<KeyKind, { label: string; hint: string }> = {
  keyboard: { label: 'The computer keyboard', hint: 'Pick any keys. You press them to key dots and dashes.' },
  mouse: { label: 'The mouse', hint: 'Its buttons key dots and dashes. Only one person can use the mouse.' },
  touch: { label: 'The touch screen', hint: 'Tap the screen to key. Only one person can use it.' },
  midi: { label: 'A key plugged into the computer', hint: 'A MIDI key or paddle. The browser may ask for permission when you press Apply.' },
  serial: { label: 'A plugged-in serial key', hint: 'A key wired to a serial adapter. You choose the port in the next step.' },
};

function keyOptions(kinds: KeyKind[]): QuestionOption[] {
  return kinds.map(k => ({ value: k, label: KEY_LABELS[k].label, hint: KEY_LABELS[k].hint }));
}

const keysOneQuestion: StepQuestion = {
  id: 'keysOne',
  label: 'What will they press?',
  kind: 'single',
  default: 'keyboard',
  defaultFrom: () => (isTouchDevice() ? 'touch' : 'keyboard'),
  optionsFrom: ctx => keyOptions([
    'keyboard',
    // A Novice is offered the keyboard (or the touch screen on a touch device); the mouse and plugged-in keys need their own setup
    ...(atLeast(ctx.level, 'intermediate') ? ['mouse' as const] : []),
    ...(isTouchDevice() ? ['touch' as const] : []),
    ...(atLeast(ctx.level, 'intermediate') && MIDI_SUPPORTED ? ['midi' as const] : []),
  ]),
};

const keysManyQuestion: StepQuestion = {
  id: 'keysMany',
  label: 'What do people press?',
  kind: 'multi',
  default: ['keyboard'],
  defaultFrom: () => [isTouchDevice() ? 'touch' : 'keyboard'],
  optionsFrom: ctx => keyOptions([
    'keyboard', 'mouse',
    ...(isTouchDevice() ? ['touch' as const] : []),
    ...(atLeast(ctx.level, 'expert') && MIDI_SUPPORTED ? ['midi' as const] : []),
    ...(atLeast(ctx.level, 'expert') && SERIAL_SUPPORTED ? ['serial' as const] : []),
  ]),
};

const ANIMALS = ['🐱', '🦊', '🦉', '🐼', '🐸', '🦁', '🐙', '🐢'] as const;

const keyboardValid = (ctx: ConditionContext): string[] => ctx.settings.keyboardInputMappings.some(m => m.enabled && m.keyCode)
  ? []
  : ['Switch on and set up at least one keyboard key.'];

const mouseHasPaddle: Condition = ctx => [ctx.settings.mouseLeftAction, ctx.settings.mouseMiddleAction, ctx.settings.mouseRightAction]
  .some(action => action === 'dit' || action === 'dah');

const KEY_STEPS: WizardStep[] = [
  {
    id: 'keyboardReady',
    title: 'Which key to press',
    intro: 'A key is already set up on this keyboard, so there is nothing to choose. The run sheet tells you which key to press. You can change it later in Settings.',
    helpSection: 's4-1',
    when: all(usesKey('keyboard'), keys('one'), ctx => ctx.level === 'novice' && keyboardValid(ctx).length === 0),
  },
  {
    id: 'keyboard',
    title: 'Keyboard keys',
    intro: 'Use Detect to press the key you want, then (optionally) give it a name and colour.',
    helpSection: 's4-1',
    // A Novice only sees this when no working key is set up yet
    when: all(usesKey('keyboard'), keys('one'), ctx => ctx.level !== 'novice' || keyboardValid(ctx).length > 0),
    repeat: { list: 'keyboardInputMappings', item: 'keyboard-mapping-editor' },
    validate: keyboardValid,
  },
  {
    id: 'keyboardPeople',
    title: 'Keyboard keys for everyone',
    intro: 'Each key in the list is one person. Keys you set up earlier are listed first, so rename them, switch them off or delete them. Then add a key for the teacher and one for each person who uses the keyboard. Use Detect to press each key, then give each its own name and colour so everyone can tell whose text is whose. New keys start with a friendly animal name, which you can change.',
    helpSection: 's4-1',
    when: all(usesKey('keyboard'), keys('many')),
    repeat: { list: 'keyboardInputMappings', item: 'keyboard-mapping-editor', nameIdeas: ANIMALS },
    validate: keyboardValid,
  },
  {
    id: 'keyboardCompare',
    title: 'Two keys to compare',
    intro: 'You need one simple key (a "straight key") and one two-lever key (a "paddle"). Use Detect to choose their keys and name them, for example "Straight key" and "Paddle", with different colours.',
    helpSection: 's4-1',
    when: keys('two'),
    repeat: { list: 'keyboardInputMappings', item: 'keyboard-mapping-editor' },
    validate: ctx => {
      const set = ctx.settings.keyboardInputMappings.filter(m => m.enabled && m.keyCode);
      return set.some(m => m.mode === 'straightKey') && set.some(m => m.mode === 'paddle')
        ? []
        : ['Set up one straight key and one paddle, both switched on.'];
    },
  },
  {
    id: 'mouse',
    title: 'Mouse keyer',
    intro: 'Choose what each mouse button does. Only one person can use the mouse.',
    helpSection: 's4-2',
    when: usesKey('mouse'),
    items: [{ item: 'mouse-keyer-buttons' }],
  },
  {
    id: 'mousePaddle',
    level: 'intermediate',
    title: 'Mouse paddle behaviour',
    intro: 'A button set to Dit or Dah works as a paddle. Choose which side is which and how holding both buttons behaves.',
    helpSection: 'paddle-modes',
    when: all(usesKey('mouse'), mouseHasPaddle),
    items: [{ item: 'mouse-keyer-paddle' }],
  },
  {
    id: 'mouseName',
    level: 'intermediate',
    title: 'Name and colour of the mouse',
    intro: 'A name and colour label whatever is keyed with the mouse, so everyone sees who it is.',
    helpSection: 's4-2',
    when: all(usesKey('mouse'), keys('many')),
    items: [{ item: 'mouse-keyer-identity' }],
  },
  {
    id: 'touch',
    level: 'intermediate',
    title: 'Fullscreen touch keyer',
    intro: 'Choose how the touch screen keys in the full-screen view. Only one person can use it.',
    helpSection: 's4-3',
    when: usesKey('touch'),
    items: [{ item: 'touch-keyer-mode' }],
  },
  {
    id: 'touchPaddle',
    level: 'intermediate',
    title: 'Fullscreen touch paddle behaviour',
    intro: 'Two touch buttons work as a paddle. Choose which side is which and how holding both buttons behaves.',
    helpSection: 'paddle-modes',
    when: all(usesKey('touch'), settingIs('touchKeyerMode', 'paddle')),
    items: [{ item: 'touch-keyer-paddle' }],
  },
  {
    id: 'touchName',
    level: 'intermediate',
    title: 'Name and colour of the fullscreen touch keyer',
    intro: 'A name and colour label whatever is keyed on the fullscreen touch keyer, so everyone sees who it is.',
    helpSection: 's4-3',
    when: all(usesKey('touch'), keys('many')),
    items: [{ item: 'touch-keyer-identity' }],
  },
  {
    id: 'midi',
    level: 'intermediate',
    title: 'Plugged-in keys',
    intro: 'Choose the device, press Detect and play the note for each key or paddle. Give each a name and colour.',
    helpSection: 's6-2',
    when: usesKey('midi'),
    repeat: { list: 'midiInputMappings', item: 'midi-input-mapping-editor', nameIdeas: ANIMALS },
    validate: ctx => ctx.settings.midiInputMappings.some(m => m.enabled) ? [] : ['Switch on and set up at least one plugged-in key.'],
  },
  {
    id: 'serial',
    level: 'expert',
    title: 'Serial keys',
    intro: 'Choose the port with the browser\'s own prompt, then the pin your key is wired to. Give each a name and colour.',
    helpSection: 's6-3',
    when: usesKey('serial'),
    repeat: { list: 'serialInputMappings', item: 'serial-input-mapping-editor', nameIdeas: ANIMALS },
    validate: ctx => ctx.settings.serialInputMappings.some(m => m.enabled) ? [] : ['Switch on and set up at least one serial key.'],
  },
  {
    id: 'crew',
    title: 'Is everyone covered?',
    intro: 'Everyone who takes part needs a key of their own. A shared mouse or touch screen counts as one person. You need at least two people: you and one other.',
    when: keys('many'),
    validate: ctx => participantCount(ctx.settings, chosenKeys(ctx)) >= 2
      ? []
      : ['Add a key for yourself and at least one other person.'],
  },
];

// ---- Practice ----

const PRACTICE_STEPS: WizardStep[] = [
  {
    id: 'practiceWhat',
    title: 'What should people work on?',
    intro: 'Choose what the exercise contains. Everyone gets the same exercise, and everything stays on this computer.',
    helpSection: 's3-5',
    when: practiceFamilies,
    questions: [{ id: 'practiceWhat', label: 'Content', kind: 'single', default: 'auto', optionsFrom: practiceWhatOptions }],
  },
  {
    id: 'kochLesson',
    level: 'intermediate',
    title: 'Which lesson?',
    intro: 'Lesson 1 has two letters. Each lesson adds more, and the exercise mixes the new letters with the earlier ones. Pick the lesson your group has reached.',
    helpSection: 's3-5',
    when: all(practiceFamilies, koch),
    questions: [{ id: 'kochLesson', label: 'Lesson', kind: 'select', default: '1', options: KOCH_OPTIONS }],
  },
  {
    id: 'practiceChecking',
    level: 'intermediate',
    title: 'How are answers checked?',
    intro: 'Choose how people show what they heard.',
    helpSection: 's3-5',
    when: all(isScenario('check-copy'), not(koch)),
    questions: [{
      id: 'practiceChecking', label: 'Checking', kind: 'single', default: 'auto',
      optionsFrom: ctx => {
        const recommended = checkingOf({ ...ctx, answers: { ...ctx.answers, practiceChecking: 'auto' } });
        return [
          { value: 'typealong', label: 'Everyone types what they hear', hint: 'The app marks each answer when the round ends.' },
          { value: 'blur', label: 'Everyone writes on paper', hint: recommended === 'blur' ? 'Young children usually write on paper. The text stays hidden until you reveal it.' : 'The text stays hidden; hold the reveal button to show the answer.' },
          { value: 'listen', label: 'Just listen', hint: 'Nothing is checked. Good for a first listen.' },
        ].map(option => option.value === recommended ? { ...option, alias: 'auto' } : option);
      },
    }],
  },
  {
    id: 'sendChecking',
    level: 'intermediate',
    title: 'When are keyed letters marked?',
    intro: 'Choose when the person keying finds out what they got right.',
    helpSection: 's3-6',
    when: isScenario('check-send'),
    questions: [{
      id: 'sendChecking', label: 'Marking', kind: 'single', default: 'live',
      options: [
        { value: 'live', label: 'As they key', hint: 'Each letter turns green or red straight away. Encouraging.' },
        { value: 'auto', label: 'At the end of the round', hint: 'Nothing shows until the round ends, then you see the result.' },
        { value: 'manual', label: 'When you press Check', hint: 'You decide when the round is finished.' },
      ],
    }],
  },
  {
    id: 'roundLength',
    level: 'intermediate',
    title: 'How long is a round?',
    intro: 'A round is one set of items to copy or key.',
    helpSection: 's3-5',
    when: practiceFamilies,
    questions: [{
      id: 'roundLength', label: 'Round length', kind: 'single', default: 'recommended',
      // Shortest to longest, each size once (the limits of 1 and 10 items can make two choices equal)
      optionsFrom: ctx => {
        const seen = new Set<number>();
        return (['recommended', 'shorter', 'longer'] as const).flatMap(choice => {
          const items = roundGroups({ ...ctx, answers: { ...ctx.answers, roundLength: choice } });
          if (seen.has(items)) return [];
          seen.add(items);
          const hint = { shorter: 'Quick rounds, good when time is short.', recommended: 'Suits your audience.', longer: 'More to do in each round.' }[choice];
          return [{ items, option: { value: choice, label: `${items} item${items === 1 ? '' : 's'} in a round`, hint } as QuestionOption }];
        }).sort((a, b) => a.items - b.items).map(entry => entry.option);
      },
    }],
  },
  {
    id: 'rounds',
    level: 'expert',
    title: 'How many rounds?',
    intro: 'Several rounds give each person a score for every round and an average.',
    helpSection: 's3-5',
    when: practiceFamilies,
    questions: [{ id: 'rounds', label: 'Rounds in a session', kind: 'number', default: 1, min: 1, max: 5 }],
  },
];

// ---- Typed sessions ----

const TYPED_STEPS: WizardStep[] = [
  {
    id: 'reveal',
    title: 'Hide the text until you reveal it?',
    intro: 'Everyone works it out first: by listening and writing on paper, or from the dots and dashes. Holding the reveal button shows everyone the answer.',
    helpSection: 's8-4',
    when: ctx => !!scenarioOf(ctx)?.blur,
    questions: [{
      id: 'reveal', label: 'Typed text', kind: 'single', default: 'hide',
      options: [
        { value: 'hide', label: 'Hide it', hint: 'The text is blurred until you hold the reveal button.' },
        { value: 'show', label: 'Show it as it plays', hint: 'Everyone can read along while they listen.' },
      ],
    }],
  },
  {
    id: 'typing',
    level: 'intermediate',
    title: 'How should typing play?',
    intro: 'Choose when typed text turns into Morse.',
    helpSection: 's3-1',
    when: ctx => { const s = scenarioOf(ctx); return !!s && !s.phone && s.typing !== 'none' && (s.family === 'typed' || s.family === 'online'); },
    questions: [{
      id: 'typing', label: 'Typing', kind: 'single', default: 'auto',
      optionsFrom: ctx => {
        const live = scenarioOf(ctx)?.typing === 'live';
        return [
          {
            value: 'live', label: 'Each letter plays as you type', ...(live ? { alias: 'auto' } : {}),
            hint: live
              ? 'Best for showing Morse: the audience sees and hears every letter the moment you type it.'
              : 'Immediate. The audience sees and hears every letter as it is typed.',
          },
          {
            value: 'enter', label: 'Type a message, then play it', ...(live ? {} : { alias: 'auto' }),
            hint: live
              ? 'Press Enter to play the message. Lets you correct mistakes first.'
              : 'Best for this session: you prepare or correct the message first, then press Enter to play it.',
          },
        ];
      },
    }],
  },
];

// ---- Room, speed, rewards ----

const ROOM_STEP: WizardStep = {
  id: 'room',
  level: 'intermediate',
  title: 'How big is the room?',
  intro: 'This sets how big the text is on the full screen, so the back row can read it.',
  helpSection: 's2-6',
  when: inScenario,
  questions: [{
    id: 'room', label: 'Room', kind: 'single', default: 'class',
    options: [
      { value: 'small', label: 'A few people around a screen', hint: 'Smaller text, so more fits on the screen.' },
      { value: 'class', label: 'A classroom', hint: 'The standard size for your audience.' },
      { value: 'hall', label: 'A hall or a fair', hint: 'Extra-large text for people far from the screen.' },
    ],
  }],
};

const playsMorse: Condition = any(inFamily('typed', 'practice-copy', 'online'), viaPhone);

/** True when the speed matters: Morse is played, or a paddle (whose key speed sets the dots) is in use. */
const speedMatters: Condition = any(playsMorse, all(inFamily('keyed', 'practice-send'), paddleInvolved));

const sentence = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Speed choices from slowest to fastest, each speed once (a clamp at 5 or 50 can make two choices equal), then the expert's exact speed. */
const speedOptions = (ctx: ConditionContext): QuestionOption[] => {
  const seen = new Set<number>();
  const options = (['recommended', 'slower', 'faster'] as const).flatMap(choice => {
    const wpm = speedPlan({ ...ctx, answers: { ...ctx.answers, speed: choice, exactWpm: 0 } }).wpm;
    if (seen.has(wpm)) return [];
    seen.add(wpm);
    return [{ wpm, option: {
      value: choice,
      label: sentence(describeSpeed(wpm)),
      hint: ctx.level === 'expert' ? `That is ${wpm} words per minute.` : undefined,
    } as QuestionOption }];
  }).sort((a, b) => a.wpm - b.wpm).map(entry => entry.option);
  if (ctx.level !== 'expert') return options;
  const recommended = speedPlan({ ...ctx, answers: { ...ctx.answers, speed: 'recommended', exactWpm: 0 } }).wpm;
  const exact = speedPlan({ ...ctx, answers: { ...ctx.answers, speed: 'exact' } }).wpm;
  return [...options, {
    value: 'exact',
    label: 'Exact speed in words per minute',
    hint: `That is ${describeSpeed(exact)}.`,
    number: { id: 'exactWpm', label: 'Words per minute', min: 5, max: 50, start: recommended },
  }];
};

const SPEED_STEP: WizardStep = {
  id: 'speed',
  level: 'intermediate',
  title: 'How fast should it be?',
  intro: 'Slower is easier to follow. Faster keeps people who know Morse interested.',
  helpSection: 's3-2',
  when: all(inScenario, playsMorse),
  questions: [{ id: 'speed', label: 'Speed', kind: 'single', default: 'recommended', optionsFrom: speedOptions }],
};

/** The same question for keyed sessions, asked only when a paddle is in use (a straight key is timed by the hand). */
const KEY_SPEED_STEP: WizardStep = {
  id: 'keySpeed',
  level: 'intermediate',
  title: 'How fast is the key?',
  intro: 'A paddle makes the dots and dashes for you, so its speed decides how long they are. Slower is easier to follow. A straight key is timed by the hand, so this only applies to paddles.',
  helpSection: 's4-1',
  when: all(inScenario, not(playsMorse), speedMatters),
  questions: [{ id: 'speed', label: 'Key speed', kind: 'single', default: 'recommended', optionsFrom: speedOptions }],
};

/** The pauses question: Novice sessions get the audience's pauses behind the scenes; everyone else chooses. */
const PAUSES_STEP: WizardStep = {
  id: 'pauses',
  level: 'intermediate',
  title: 'Extra pauses between letters?',
  intro: 'Longer pauses between letters and words make Morse easier to follow, because each letter has time to sink in. With no extra pauses, letters and words follow each other at the full speed you chose, which is harder to follow.',
  helpSection: 's8-5',
  when: all(inScenario, playsMorse),
  questions: [{
    id: 'pauses', label: 'Pauses', kind: 'single', default: 'recommended',
    // From the longest pause to none, each overall speed once (the recommended choice wins a tie)
    optionsFrom: ctx => {
      const planOf = (pauses: string) => speedPlan({ ...ctx, answers: { ...ctx.answers, pauses, exactOverall: 0 } });
      const seen = new Set<number>();
      const choices: ('recommended' | 'more' | 'none' | 'slightly')[] = ['recommended', 'more', 'none'];
      // The 5 wpm floor (or a recommendation of no pauses) can leave fewer than three distinct choices; a halfway one fills the gap
      if (new Set(choices.map(choice => planOf(choice).effective)).size < 3) choices.push('slightly');
      const options = choices.flatMap(choice => {
        const plan = planOf(choice);
        if (seen.has(plan.effective)) return [];
        seen.add(plan.effective);
        const noPauses = !plan.stretched;
        const label = `${sentence(describeSpeed(plan.effective))} overall`;
        const hint = noPauses
          ? `No extra pauses: every letter and word at the full speed.${choice === 'none' ? ' Harder to follow.' : ' A good balance for your audience.'}`
          : {
            recommended: 'Longer pauses between letters. A good balance for your audience.',
            more: 'Longer pauses: lots of thinking time between letters. Good for the very first lessons.',
            slightly: 'Slightly longer pauses: a little thinking time between letters, closer to the full speed.',
            none: '',
          }[choice];
        return [{ effective: plan.effective, option: {
          value: choice,
          label,
          hint: ctx.level === 'expert' ? `${hint} That is ${plan.effective} words per minute overall.` : hint,
        } as QuestionOption }];
      }).sort((a, b) => a.effective - b.effective).map(entry => entry.option);
      if (ctx.level !== 'expert') return options;
      const wpm = speedPlan(ctx).wpm;
      const exact = speedPlan({ ...ctx, answers: { ...ctx.answers, pauses: 'exact' } }).effective;
      return [...options, {
        value: 'exact',
        label: 'Exact overall speed in words per minute',
        hint: `That is ${describeSpeed(exact)} overall.`,
        number: { id: 'exactOverall', label: 'Overall words per minute', min: 5, max: wpm, start: planOf('recommended').effective },
      }];
    },
  }],
};

function rewardOptions(ctx: ConditionContext): QuestionOption[] {
  const audience = audienceOf(ctx);
  const kids = audience === 'kids';
  const favourite = (id: string): number => (kids && (id === 'cat' || id === 'dog') ? 0 : 1);
  // Pet rewards suit children and teenagers, not people who already know Morse
  const suits = (id: string): boolean => !((audience === 'learners' || audience === 'operators') && (id === 'cat' || id === 'dog'));
  const ideas = REWARD_IDEAS.filter(i => suits(i.id)).sort((a, b) => favourite(a.id) - favourite(b.id));
  const options: QuestionOption[] = ideas.map(i => ({
    value: i.id,
    label: `${i.word} shows ${i.text}`,
    hint: `When someone keys or types ${i.word}, the screen shows ${i.text}. ${i.for}.`,
  }));
  if (atLeast(ctx.level, 'intermediate')) options.push({ value: 'custom', label: 'My own word and reward', hint: 'You choose the word and what the screen shows.' });
  return options;
}

const FUN_STEPS: WizardStep[] = [
  {
    id: 'rewardOpt',
    title: 'Add a reward?',
    intro: 'A reward is a word that makes the screen show a picture or message when someone keys or types it. It is a fun way to celebrate success.',
    helpSection: 's8-8',
    when: ctx => scenarioOf(ctx)?.rewards === 'optional' && !scenarioOf(ctx)?.lens,
    questions: [{ id: 'rewardOpt', label: 'Rewards', kind: 'multi', default: [], optionsFrom: rewardOptions, hint: 'Tick as many as you like, or none to keep it simple.' }],
    validate: rewardProblems,
  },
  {
    id: 'rewardReq',
    title: 'Choose the reward words',
    intro: 'This session works with a word that wins a reward: when someone keys or types it, the screen shows the reward. Tick one or more. Tell people the words, or keep them secret.',
    helpSection: 's8-8',
    when: ctx => scenarioOf(ctx)?.rewards === 'required',
    questions: [{ id: 'rewardReq', label: 'Rewards', kind: 'multi', default: ['good'], optionsFrom: rewardOptions }],
    validate: ctx => (rewardPicks(ctx, 'rewardReq').length ? [] : ['Tick at least one reward.']).concat(rewardProblems(ctx)),
  },
  {
    id: 'rewardCustom',
    title: 'Your own reward',
    intro: 'Type the word people must key (letters or numbers, 2 to 12 long) and what the screen shows. The reward can be text, an emoji, or both.',
    helpSection: 's8-8',
    when: ctx => (rewardPicks(ctx, 'rewardOpt').includes('custom') && scenarioOf(ctx)?.rewards === 'optional' && !scenarioOf(ctx)?.lens)
      || (rewardPicks(ctx, 'rewardReq').includes('custom') && scenarioOf(ctx)?.rewards === 'required'),
    questions: [
      { id: 'rewardWord', label: 'Word to key', kind: 'text', default: '', maxLength: 12 },
      { id: 'rewardText', label: 'What the screen shows', kind: 'text', default: '', maxLength: 40, hint: 'For example "🌟 Brilliant!"' },
    ],
    validate: ctx => rewardProblems(ctx).concat(String(ctx.answers['rewardWord'] ?? '').trim() ? [] : ['Type the word people must key.']),
  },
  {
    id: 'surprise',
    level: 'expert',
    title: 'A surprise?',
    intro: 'Optional. Shows a fireworks celebration when a word or signal you choose is keyed or received. It ends on the next character, and uses the full conversation view.',
    when: ctx => ['typed', 'keyed', 'online'].includes(scenarioOf(ctx)?.family ?? '') && !scenarioOf(ctx)?.lens,
    questions: [
      {
        id: 'surprise', label: 'Celebration', kind: 'single', default: 'no',
        options: [
          { value: 'no', label: 'No celebration' },
          { value: 'yes', label: 'Yes, add a celebration', hint: 'Anyone can start it, including someone sending from another device.' },
        ],
      },
      { id: 'surpriseTrigger', label: 'Word or signal that starts it', kind: 'text', default: '<FW>', maxLength: 12,
        hint: 'A word, or a signal such as <FW> (F and W keyed together with no gap).' },
    ],
    validate: rewardProblems,
  },
  {
    id: 'signals',
    title: 'Special signals',
    intro: 'Special signals let the person at the key control the screen: AR clears it, BK starts a new paragraph and HH erases the last word. They are switched off at the moment. They are handy when people take turns.',
    helpSection: 's8-7',
    when: all(inFamily('keyed'), knowsMorse, settingIs('prosignActionsEnabled', false)),
    questions: [{
      id: 'signals', label: 'Special signals', kind: 'single', default: 'on',
      options: [
        { value: 'on', label: 'Switch them on', hint: 'The run sheet tells you what to say.' },
        { value: 'off', label: 'Leave them off', hint: 'You will clear the screen from the menu instead.' },
      ],
    }],
  },
];

// ---- Students from their own devices ----

const phoneTwoWay: Condition = ctx => scenarioOf(ctx)?.phone === 'two-way';

// ---- The teacher's phone (only the teacher goes online) ----

const PHONE_STEPS: WizardStep[] = [
  {
    id: 'phoneIn',
    level: 'expert',
    title: 'Link your phone',
    intro: 'Your phone sends to this computer over the internet through a room name and password that only you know. Only your phone goes online: nobody else does. Tick the box, choose a room name and password, and keep them to yourself. The run sheet then shows how to set up your phone with the same details.',
    helpSection: 's10-3',
    when: viaPhone,
    items: [{ item: 'rtdb-input-connect' }],
    validate: ctx => ctx.settings.rtdbInputEnabled ? [] : ['Tick the box so this computer can receive what you send from your phone.'],
  },
  {
    id: 'phoneOut',
    level: 'expert',
    title: 'Send the answers to your phone',
    intro: 'Tick the box so what is keyed on this computer also shows on your phone. The room name and password are the same as in the last step.',
    helpSection: 's10-4',
    when: phoneTwoWay,
    items: [{ item: 'rtdb-output-connect', inputs: { sharedChannel: true } }],
    validate: ctx => ctx.settings.rtdbOutputEnabled ? [] : ['Tick the box so your phone receives the answers.'],
  },
  {
    id: 'phoneName',
    level: 'expert',
    title: 'A name for this computer',
    intro: 'This computer sends the answers keyed here under this name unless a key has its own. Give it a name that is different from the name you will use on your phone: a device ignores messages that carry a name it uses itself.',
    helpSection: 's10-4',
    when: phoneTwoWay,
    items: [{ item: 'rtdb-output-identity' }],
  },
];

const ONLINE_STEPS: WizardStep[] = [
  {
    id: 'roomIn',
    title: 'Your room',
    intro: 'People join over the internet by using the same room name and password as you. Tick the box, choose a room name and password, and keep them to yourself until you start. Anyone who knows both can join.',
    helpSection: 's10-3',
    when: isScenario('class-online'),
    items: [{ item: 'rtdb-input-connect' }],
    validate: ctx => ctx.settings.rtdbInputEnabled ? [] : ['Tick the box so you can see what others send.'],
  },
  {
    id: 'roomOut',
    title: 'Let others see your messages',
    intro: 'Tick the box so your typed messages reach the others. The room name and password are the same as in the last step.',
    helpSection: 's10-4',
    when: isScenario('class-online'),
    items: [{ item: 'rtdb-output-connect', inputs: { sharedChannel: true } }],
    validate: ctx => ctx.settings.rtdbOutputEnabled ? [] : ['Tick the box so others receive your messages.'],
  },
  {
    id: 'roomName',
    title: 'Your name and colour',
    intro: 'Others see this next to everything you send.',
    helpSection: 's10-4',
    when: isScenario('class-online'),
    items: [{ item: 'rtdb-output-identity' }],
  },
  {
    id: 'onlineScreen',
    level: 'intermediate',
    title: 'Where do you show the conversation?',
    intro: 'Everyone\'s text appears here as it arrives.',
    helpSection: 's2-6',
    when: isScenario('class-online'),
    questions: [{
      id: 'onlineScreen', label: 'Show it on', kind: 'single', default: 'full',
      options: [
        { value: 'full', label: 'The full screen', hint: 'Large text, and each person in their own colour.' },
        { value: 'main', label: 'The main screen', hint: 'Stays on the screen you are on now. Handy on a small laptop.' },
      ],
    }],
  },
];

// ---- Run sheet ----

const RUN_SHEET_STEP: WizardStep = {
  id: 'runsheet',
  title: 'Your run sheet',
  intro: 'This is your plan for the session. It only appears here, so copy it or write it down before you press Apply. Nothing changes until you press Apply.',
  when: inScenario,
  sheet: runSheetFor,
};

// ---- What the setup decides ----

const familyMode = (ctx: ConditionContext): 'key' | 'type' => {
  const family = scenarioOf(ctx)?.family;
  return family === 'keyed' || family === 'practice-send' ? 'key' : 'type';
};

const groupFactor = { shorter: 0.6, recommended: 1, longer: 1.7 };

/** Items in a round: the audience's, scaled by the round length answer, within what Practice accepts (1 to 10). */
function roundGroups(ctx: ConditionContext): number {
  const length = answerAt(ctx, 'intermediate', 'roundLength', 'recommended') as keyof typeof groupFactor;
  return Math.min(10, Math.max(1, Math.round(AUDIENCES[audienceOf(ctx)].groups * (groupFactor[length] ?? 1))));
}

const PRACTICE_LABEL = { koch: 'letters in lessons', words: 'short words', callsigns: 'call signs', characters: 'random letters' };
const practiceMode = (ctx: ConditionContext): 'koch' | 'words' | 'callsigns' | 'characters' => {
  const what = practiceWhatOf(ctx);
  return what === 'letters' ? 'characters' : what;
};
const grouped: Condition = ctx => ['koch', 'letters'].includes(practiceWhatOf(ctx));
const kochLesson = (ctx: ConditionContext): number => Number(answerAt(ctx, 'intermediate', 'kochLesson', '1')) || 1;
const roundCount = (ctx: ConditionContext): number => Math.min(5, Math.max(1, Math.round(Number(ctx.level === 'expert' ? ctx.answers['rounds'] : 1) || 1)));
const stretched: Condition = ctx => speedPlan(ctx).stretched;

const KEY_FLAGS: { kind: KeyKind; key: 'keyboardKeyerEnabled' | 'mouseKeyerEnabled' | 'touchKeyerEnabled' | 'midiInputEnabled' | 'serialInputEnabled'; phrase: string }[] = [
  { kind: 'keyboard', key: 'keyboardKeyerEnabled', phrase: 'keyboard keys' },
  { kind: 'mouse', key: 'mouseKeyerEnabled', phrase: 'mouse keyer' },
  { kind: 'touch', key: 'touchKeyerEnabled', phrase: 'fullscreen touch keyer' },
  { kind: 'midi', key: 'midiInputEnabled', phrase: 'plugged-in MIDI keys' },
  { kind: 'serial', key: 'serialInputEnabled', phrase: 'serial keys' },
];

const keyedFamilies = inFamily('keyed', 'practice-send');

const FORCED: ForcedSetting[] = [
  // Speed
  { key: 'encoderWpm', value: ctx => speedPlan(ctx).wpm, label: ctx => `Play Morse ${describeSpeed(speedPlan(ctx).wpm)}`, when: playsMorse },
  { key: 'keyerWpm', value: ctx => speedPlan(ctx).wpm, label: ctx => `Set the key speed to ${describeSpeed(speedPlan(ctx).wpm)}`, when: keyedFamilies },
  { key: 'txDecoderWpm', value: ctx => speedPlan(ctx).wpm, label: 'Start reading keyed Morse at that speed', when: keyedFamilies },
  { key: 'farnsworthEnabled', value: ctx => speedPlan(ctx).stretched, label: ctx => speedPlan(ctx).stretched ? 'Longer pauses between letters and words, so each letter has time to sink in' : 'Turn off the longer pauses: normal spacing between letters and words', when: playsMorse },
  { key: 'farnsworthInputMode', value: 'wpm', label: 'Set the longer pauses by the overall speed', when: all(playsMorse, stretched) },
  { key: 'farnsworthEffectiveWpm', value: ctx => speedPlan(ctx).effective, label: ctx => `Overall speed with the pauses: ${describeSpeed(speedPlan(ctx).effective)}`, when: all(playsMorse, stretched) },
  { key: 'farnsworthAppliesTo', value: 'both', label: 'Use the longer pauses for everything played here', when: all(playsMorse, stretched) },

  // The full screen
  { key: 'fullscreenFontSize', value: fontSize, label: ctx => `Make the full-screen text ×${(fontSize(ctx) / 24).toFixed(1)} the standard size`, when: inScenario },
  {
    key: 'fullscreenLensEnabled', value: ctx => !conversationView(ctx),
    label: ctx => conversationView(ctx) ? 'Show the whole conversation on the full screen' : 'Show one big letter at a time on the full screen (Lens)',
    when: inScenario,
  },
  { key: 'fullscreenInputMode', value: familyMode, label: ctx => familyMode(ctx) === 'key' ? 'Open the full screen ready for keying' : 'Open the full screen ready for typing', when: inScenario },
  { key: 'sidetoneEnabled', value: true, label: 'Play the beep on this computer', when: inScenario },
  // The beep plays only for the direction it is set to, and typed or keyed text counts as sent while practice counts as received
  { key: 'sidetoneForward', value: 'both', label: 'Play the beep for both sent and received Morse', when: inScenario },

  // How text plays
  { key: 'encoderMode', value: typingMode, label: ctx => typingMode(ctx) === 'live' ? 'Each letter plays as you type' : 'Type a message, then press Enter to play it', when: inFamily('typed', 'online') },
  { key: 'encoderMode', value: 'practice', label: 'Switch the main screen to Copy practice', when: inFamily('practice-copy') },
  { key: 'encoderMode', value: 'send-practice', label: 'Switch the main screen to Send practice', when: inFamily('practice-send') },
  { key: 'encoderMode', value: 'enter', label: 'Leave practice mode so keying works', when: all(inFamily('keyed'), inPracticeMode) },
  { key: 'textBlurEnabled', value: blurOn, label: ctx => blurOn(ctx) ? 'Hide typed text until you reveal it' : 'Turn off text hiding, so nothing stays blurred', when: inScenario },
  { key: 'textBlurAppliesTo', value: 'both', label: 'Hide the text however it is sent or received', when: blurOn },

  // Copy practice
  { key: 'practiceEnabled', value: true, label: 'Turn Copy practice on', when: inFamily('practice-copy') },
  { key: 'practicePipeline', value: 'local', label: 'Keep the exercise on this computer', when: inFamily('practice-copy') },
  { key: 'practiceContentMode', value: practiceMode, label: ctx => `Exercise: ${PRACTICE_LABEL[practiceMode(ctx)]}`, when: inFamily('practice-copy') },
  { key: 'practiceKochLesson', value: kochLesson, label: ctx => `Start at lesson ${kochLesson(ctx)}`, when: all(inFamily('practice-copy'), koch) },
  { key: 'practiceGroupCount', value: roundGroups, label: ctx => `${roundGroups(ctx)} items in a round`, when: inFamily('practice-copy') },
  { key: 'practiceCharGroupSize', value: ctx => practiceMode(ctx) === 'koch' ? 5 : 1, label: 'Letters in each item', when: all(inFamily('practice-copy'), grouped) },
  { key: 'practiceIncludeLetters', value: true, label: 'Use letters', when: all(inFamily('practice-copy'), practiceIs('letters')) },
  { key: 'practiceWordLengths', value: ctx => AUDIENCES[audienceOf(ctx)].wordLengths, label: 'Word lengths that suit the audience', when: all(inFamily('practice-copy'), practiceIs('words')) },
  { key: 'practiceFeedbackMode', value: checkingOf, label: 'How answers are checked', when: all(inFamily('practice-copy'), not(koch)) },
  { key: 'practiceRounds', value: roundCount, label: ctx => `${roundCount(ctx)} rounds in a session`, when: all(inFamily('practice-copy'), ctx => ctx.level === 'expert') },

  // Send practice
  { key: 'sendPracticeEnabled', value: true, label: 'Turn Send practice on', when: inFamily('practice-send') },
  { key: 'sendPracticePipeline', value: 'local', label: 'Keep the exercise on this computer', when: inFamily('practice-send') },
  { key: 'sendPracticeContentMode', value: practiceMode, label: ctx => `Exercise: ${PRACTICE_LABEL[practiceMode(ctx)]}`, when: inFamily('practice-send') },
  { key: 'sendPracticeKochLesson', value: kochLesson, label: ctx => `Start at lesson ${kochLesson(ctx)}`, when: all(inFamily('practice-send'), koch) },
  { key: 'sendPracticeGroupCount', value: roundGroups, label: ctx => `${roundGroups(ctx)} items in a round`, when: inFamily('practice-send') },
  { key: 'sendPracticeCharGroupSize', value: ctx => practiceMode(ctx) === 'koch' ? 5 : 1, label: 'Letters in each item', when: all(inFamily('practice-send'), grouped) },
  { key: 'sendPracticeIncludeLetters', value: true, label: 'Use letters', when: all(inFamily('practice-send'), practiceIs('letters')) },
  { key: 'sendPracticeWordLengths', value: ctx => AUDIENCES[audienceOf(ctx)].wordLengths, label: 'Word lengths that suit the audience', when: all(inFamily('practice-send'), practiceIs('words')) },
  { key: 'sendPracticeCheckMode', value: ctx => answerAt(ctx, 'intermediate', 'sendChecking', 'live'), label: 'When keyed letters are marked', when: inFamily('practice-send') },
  { key: 'sendPracticeRounds', value: roundCount, label: ctx => `${roundCount(ctx)} rounds in a session`, when: all(inFamily('practice-send'), ctx => ctx.level === 'expert') },
  { key: 'sendPracticeInputs', value: ctx => sendPracticeIds(ctx.settings, chosenKeys(ctx)), label: 'Count only the chosen key', when: inFamily('practice-send') },

  // Students' room: what you type has to count as sent, and sent text has to be what the room receives
  { key: 'encoderSource', value: 'tx', label: 'Count what you type as sent', when: inFamily('online') },
  { key: 'rtdbOutputForward', value: ctx => ctx.settings.rtdbOutputForward === 'rx' ? 'tx' : ctx.settings.rtdbOutputForward, label: 'Share what you type with the room', when: inFamily('online') },

  // The teacher's phone: what arrives counts as received, plays at the speed set here, and (two-way) the students' keys go back as sent
  { key: 'rtdbInputSource', value: 'rx', label: 'Show what arrives from your phone as received (RX)', when: viaPhone },
  { key: 'rtdbInputOverrideWpm', value: true, label: 'Play your phone\'s messages at the speed set here', when: viaPhone },
  { key: 'rtdbOutputForward', value: 'tx', label: 'Send what is keyed here to your phone (TX)', when: phoneTwoWay },

  // Rewards, signals
  { key: 'emojisEnabled', value: true, label: 'Show pictures for rewards on the full screen', when: rewardsActive },
  {
    key: 'emojiMappings', value: withWantedMappings, when: rewardsActive,
    label: ctx => ctx.settings.emojisEnabled
      ? 'Add the rewards to the picture list (existing ones are untouched)'
      : 'Add the rewards to the picture list. Your other pictures stay switched off',
  },
  { key: 'prosignActionsEnabled', value: true, label: 'Switch special signals on', when: all(inFamily('keyed'), knowsMorse, settingIs('prosignActionsEnabled', false), answerIs('signals', 'on')) },
];

// Each key kind is switched on when chosen, and off otherwise, as in the "Key and see the text" guide
for (const flag of KEY_FLAGS) {
  FORCED.push({ key: flag.key, value: true, label: `Turn the ${flag.phrase} on`, when: all(keyedFamilies, usesKey(flag.kind)) });
  if (flag.kind !== 'serial') {
    FORCED.push({ key: flag.key, value: false, label: `Turn the ${flag.phrase} off`, when: all(keyedFamilies, not(usesKey(flag.kind))) });
  }
}

/**
 * Teach or demonstrate Morse: audience, intent, approach and the few questions
 * that approach needs, then a run sheet. See the header comment.
 */
export const TEACH_FLOW: WizardFlow = {
  id: 'teach',
  title: 'Teach or demonstrate Morse',
  goal: 'teach',
  levels: true,
  levelStep: LEVEL_STEP_TEACH,
  forced: FORCED,
  validateWithFlowSettings: true,
  noPresetStart: true,
  reconcile: reconcileAnswers,
  skippedAreDecided: true,
  summary: summaryFor,
  presetName: presetNameFor,
  fullscreenWhen: ctx => inScenario(ctx) && !(scenarioOf(ctx)?.family === 'online' && ctx.answers['onlineScreen'] === 'main'),
  steps: [
    {
      id: 'audience',
      title: 'Who is it for?',
      intro: 'This sets a comfortable speed, how big the text is and how long a round lasts. You will see every value in the review before you apply.',
      questions: [AUDIENCE_QUESTION],
    },
    {
      id: 'intent',
      title: 'What do you want to do?',
      intro: 'Pick the kind of session. The next questions narrow it down to one setup that is ready to run.',
      questions: [{
        id: 'intent',
        label: 'Your session',
        kind: 'single',
        default: 'introduce',
        optionsFrom: ctx => INTENT_OPTIONS.filter(o => intentsFor(ctx.level, audienceOf(ctx)).includes(o.value as Intent))
          .map(({ value, label, hint }) => ({ value, label, hint })),
      }],
      validate: ctx => scenariosFor(String(ctx.answers['intent']) as Intent, ctx.level, audienceOf(ctx)).length ? [] : ['Choose what you want to do.'],
    },
    approachStep('introduce', 'What kind of first look?', 'Choose a demo that fits your audience.', 'lens', intent('introduce')),
    approachStep('send', 'How should it be shown?', 'Choose how people see Morse being sent.', 'one', intent('send')),
    approachStep('copy', 'How should people copy?', 'Choose how everyone listens to Morse and works out what it says.', 'paper', intent('copy')),
    approachStep('check', 'What do you want to check?', 'Choose copying (people listen) or sending (people key).', 'copy', intent('check')),
    approachStep('class', 'What kind of activity?', 'Choose the activity.', 'chat', intent('class')),
    approachStep('booth', 'What should visitors do?', 'Choose what visitors do at your stand.', 'try', intent('booth')),
    {
      id: 'keysOne',
      title: 'What will they press?',
      intro: 'Choose the key for the person at the keyboard. You set it up in the next step. Nothing else is switched on.',
      helpSection: 's4-1',
      when: keys('one'),
      questions: [keysOneQuestion],
      validate: ctx => chosenKeys(ctx).length ? [] : ['Choose a key.'],
    },
    {
      id: 'keysMany',
      title: 'What do people press?',
      intro: 'Tick everything your group will use. Each kind gets its own step next, and nothing else is switched on.',
      helpSection: 's4-1',
      when: keys('many'),
      questions: [keysManyQuestion],
      validate: ctx => chosenKeys(ctx).length ? [] : ['Tick at least one kind of key.'],
    },
    ...KEY_STEPS,
    ...PRACTICE_STEPS,
    ...TYPED_STEPS,
    ...ONLINE_STEPS,
    ...PHONE_STEPS,
    ...FUN_STEPS,
    ROOM_STEP,
    SPEED_STEP,
    KEY_SPEED_STEP,
    PAUSES_STEP,
    RUN_SHEET_STEP,
  ],
};
