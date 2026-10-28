/**
 * Morse Code Studio
 */

import { AppSettings } from '../../../services/settings.service';
import { ItemReviewLine } from '../../settings-items/item-descriptor';
import { Condition, ConditionContext, ForcedSetting, WizardFlow, WizardStep } from '../engine/flow-types';
import { answerIncludes, any } from '../engine/conditions';
import {
  TeachInputType,
  createTeachParticipant,
  includesScenario,
  selectedTeachParticipants,
  teachParticipantChannelName,
  teachParticipantColor,
  usesLocalKeying,
  teachParticipantKeys,
  teachParticipantReview,
  validateTeachParticipants,
} from './teach-participant.model';
import { farnsworthStep, speedStep } from './shared-steps';

const sending = answerIncludes('scenarios', 'sending');
const copying = answerIncludes('scenarios', 'copying');
const callResponse = answerIncludes('scenarios', 'callResponse');
const mobile = answerIncludes('scenarios', 'mobile');
const localKeying = any(sending, callResponse);
const sendingOrCopying = any(localKeying, copying);
const classroomActivity = any(localKeying, copying);

function studentCountAtLeast(count: number): Condition {
  return ctx => Number(ctx.answers['studentCount']) >= count;
}

function participantTypeIs(index: number, type: TeachInputType): Condition {
  return ctx => {
    const profile = ctx.answers[`participant${index}`];
    return !!profile && typeof profile === 'object'
      && (profile as { inputType?: string }).inputType === type;
  };
}

function usesInput(type: TeachInputType): Condition {
  return ctx => localKeying(ctx) && selectedTeachParticipants(ctx).some(profile => profile.inputType === type);
}

function selectedInputType(ctx: ConditionContext, type: TeachInputType): boolean {
  return selectedTeachParticipants(ctx).some(profile => profile.inputType === type);
}

function unusedEnabledInputOptions(ctx: ConditionContext) {
  if (!localKeying(ctx)) return [];
  const routes: { type: TeachInputType; key: keyof AppSettings; label: string }[] = [
    { type: 'keyboard', key: 'keyboardKeyerEnabled', label: 'Keyboard Keyer' },
    { type: 'mouse', key: 'mouseKeyerEnabled', label: 'Mouse Keyer' },
    { type: 'touch', key: 'touchKeyerEnabled', label: 'Touch Keyer' },
    { type: 'midi', key: 'midiInputEnabled', label: 'MIDI Input' },
    { type: 'serial', key: 'serialInputEnabled', label: 'Serial Input' },
  ];
  return routes
    .filter(route => ctx.settings[route.key] && !selectedInputType(ctx, route.type))
    .map(route => ({
      value: route.type,
      label: `Turn off ${route.label}`,
      hint: 'This input is currently enabled but was not selected for a local participant.',
    }));
}

function requestsDisableInput(type: TeachInputType): Condition {
  return ctx => Array.isArray(ctx.answers['disableUnusedInputs'])
    && (ctx.answers['disableUnusedInputs'] as unknown[]).includes(type)
    && unusedEnabledInputOptions(ctx).some(option => option.value === type);
}

const enabledOptionalReviews = (ctx: ConditionContext) => [
  {
    value: 'text-blur',
    label: 'Text blurring',
    enabled: ctx.settings.textBlurEnabled,
    hint: 'Blurs decoded text and provides a press-and-hold reveal, supporting listening practice without seeing the answer.',
  },
  {
    value: 'show-prosigns',
    label: 'Show prosigns',
    enabled: ctx.settings.showProsigns,
    hint: 'Displays procedural signals such as <AR> by name instead of their matching punctuation in fullscreen conversation logs.',
  },
  {
    value: 'emojis',
    label: 'Emoji replacements',
    enabled: ctx.settings.emojisEnabled,
    hint: 'Replaces configured text sequences and prosigns with emoji in the fullscreen conversation.',
  },
  {
    value: 'prosign-actions',
    label: 'Prosign actions',
    enabled: ctx.settings.prosignActionsEnabled,
    hint: 'Triggers configured conversation-log actions when a prosign is decoded or encoded.',
  },
].filter(item => item.enabled && !(item.value === 'text-blur' && copying(ctx)))
  .map(({ value, label, hint }) => ({ value, label, hint }));

const reviewOptionalFeature = (feature: string): Condition => ctx =>
  !(feature === 'text-blur' && copying(ctx))
  && Array.isArray(ctx.answers['optionalReviews'])
  && (ctx.answers['optionalReviews'] as unknown[]).includes(feature);

const usesPaddleInput: Condition = ctx => {
  if (!localKeying(ctx)) return false;
  const participants = selectedTeachParticipants(ctx);
  return participants.some(profile => {
    if (profile.inputType === 'keyboard') return profile.keyboard.mode === 'paddle';
    if (profile.inputType === 'midi') return profile.midi.mode === 'paddle';
    if (profile.inputType === 'serial') return profile.serial.mode === 'paddle';
    if (profile.inputType === 'touch') return ctx.settings.touchKeyerMode === 'paddle';
    return [
      ctx.settings.mouseLeftAction,
      ctx.settings.mouseMiddleAction,
      ctx.settings.mouseRightAction,
    ].some(action => action === 'dit' || action === 'dah');
  });
};

const usesStraightKey: Condition = ctx => {
  if (!localKeying(ctx)) return false;
  const participants = selectedTeachParticipants(ctx);
  return participants.some(profile => {
    if (profile.inputType === 'keyboard') return profile.keyboard.mode === 'straightKey';
    if (profile.inputType === 'midi') return profile.midi.mode === 'straightKey';
    if (profile.inputType === 'serial') return profile.serial.mode === 'straightKey';
    if (profile.inputType === 'touch') return ctx.settings.touchKeyerMode === 'straight';
    return [
      ctx.settings.mouseLeftAction,
      ctx.settings.mouseMiddleAction,
      ctx.settings.mouseRightAction,
    ].includes('straightKey');
  });
};

function teacherChannelName(ctx: ConditionContext): string {
  const teacher = selectedTeachParticipants(ctx).find(profile => profile.role === 'teacher');
  return teacher ? teachParticipantChannelName(teacher, ctx.settings) : 'Teacher';
}

function participantStep(index: number): WizardStep {
  const role = index === 0 ? 'teacher' : `student${index}`;
  const label = index === 0 ? 'Set up the teacher input' : `Set up student ${index}`;
  return {
    id: role,
    title: label,
    intro: index === 0
      ? 'Choose the teacher’s local input and configure it with the same editor used in Settings.'
      : 'Choose this student’s local input. Each local participant gets a separate mapping and identity.',
    when: index === 0 ? localKeying : ctx => localKeying(ctx) && studentCountAtLeast(index)(ctx),
    questions: [{
      id: `participant${index}`,
      label: index === 0 ? 'Teacher input' : `Student ${index} input`,
      kind: 'participant',
      default: null,
      defaultFrom: () => createTeachParticipant(index === 0 ? 'teacher' : 'student', index),
    }],
  };
}

function participantInputConfig(index: number, type: 'mouse' | 'touch'): WizardStep {
  const title = type === 'mouse' ? 'Configure the shared mouse' : 'Configure touch controls';
  return {
    id: `${type}${index}`,
    title,
    intro: type === 'mouse'
      ? 'The shared mouse can identify one local participant. Choose its button actions, name and color.'
      : 'Touch controls can identify one local participant. Choose their keying behavior, name and color.',
    when: ctx => localKeying(ctx) && studentCountAtLeast(index)(ctx) && participantTypeIs(index, type)(ctx),
    items: [{
      item: type === 'mouse' ? 'mouse-keyer' : 'touch-keyer',
      inputs: { forceEnabled: true, forceSource: 'tx' },
    }],
  };
}

const forced: ForcedSetting[] = [
  { key: 'keyboardKeyerEnabled', value: true, label: 'Keyboard keyer on', when: usesInput('keyboard') },
  { key: 'keyboardKeyerEnabled', value: false, label: 'Keyboard keyer off', when: requestsDisableInput('keyboard') },
  { key: 'mouseKeyerEnabled', value: true, label: 'Mouse keyer on', when: usesInput('mouse') },
  { key: 'mouseKeyerEnabled', value: false, label: 'Mouse keyer off', when: requestsDisableInput('mouse') },
  { key: 'mouseKeyerSource', value: 'tx', label: 'Mouse keying sends Morse (TX)', when: usesInput('mouse') },
  { key: 'touchKeyerEnabled', value: true, label: 'Touch keyer on', when: usesInput('touch') },
  { key: 'touchKeyerEnabled', value: false, label: 'Touch keyer off', when: requestsDisableInput('touch') },
  { key: 'touchKeyerSource', value: 'tx', label: 'Touch keying sends Morse (TX)', when: usesInput('touch') },
  { key: 'midiInputEnabled', value: true, label: 'MIDI input on', when: usesInput('midi') },
  { key: 'midiInputEnabled', value: false, label: 'MIDI input off', when: requestsDisableInput('midi') },
  { key: 'serialInputEnabled', value: true, label: 'Serial input on', when: usesInput('serial') },
  { key: 'serialInputEnabled', value: false, label: 'Serial input off', when: requestsDisableInput('serial') },
  { key: 'practiceEnabled', value: true, label: 'Copy practice on', when: copying },
  { key: 'practicePipeline', value: 'local', label: 'Practice stays on this device', when: copying },
  { key: 'practiceSource', value: 'rx', label: 'Practice uses received Morse', when: copying },
  {
    key: 'encoderMode',
    value: 'practice',
    label: 'Open Practice mode',
    when: ctx => copying(ctx) && !localKeying(ctx),
  },
  { key: 'rtdbInputEnabled', value: true, label: 'Receive from the shared class channel', when: mobile },
  { key: 'rtdbOutputEnabled', value: true, label: 'Send to the shared class channel', when: mobile },
  { key: 'rtdbInputSource', value: 'rx', label: 'Receive remote student Morse', when: mobile },
  { key: 'rtdbOutputForward', value: 'both', label: 'Share received and sent Morse', when: mobile },
];

function validateTeachFlow(ctx: ConditionContext): string[] {
  const scenarios = ctx.answers['scenarios'];
  const errors: string[] = [];
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    errors.push('Choose at least one teaching activity.');
    return errors;
  }
  if (usesLocalKeying(ctx)) {
    const count = Number(ctx.answers['studentCount']);
    if (!Number.isInteger(count) || count < 0 || count > 4) {
      errors.push('Choose between zero and four local students, plus the teacher.');
    } else {
      errors.push(...validateTeachParticipants(ctx));
      if ((includesScenario(ctx, 'copying') || includesScenario(ctx, 'callResponse')) && count < 1) {
        errors.push('Choose at least one local student for this activity.');
      }
    }
  }
  if (includesScenario(ctx, 'copying') && !usesLocalKeying(ctx)) {
    const count = Number(ctx.answers['studentCount']);
    if (!Number.isInteger(count) || count < 1 || count > 4) {
      errors.push('Choose between one and four local students for turn-based copy practice.');
    } else {
      for (let index = 1; index <= count; index++) {
        const name = ctx.answers[`copyStudentName${index}`];
        if (typeof name !== 'string' || !name.trim()) {
          errors.push(`Enter a name for student ${index}.`);
          break;
        }
      }
    }
  }
  if (includesScenario(ctx, 'mobile')) {
    const s = ctx.settings;
    if (!s.rtdbInputChannelName.trim() || !s.rtdbInputChannelSecret.trim()) {
      errors.push('Enter a shared channel name and secret for the class.');
    }
    if (s.rtdbInputChannelName !== s.rtdbOutputChannelName
      || s.rtdbInputChannelSecret !== s.rtdbOutputChannelSecret) {
      errors.push('Use the same channel name and secret for class input and output.');
    }
    if (!s.rtdbOutputName.trim() && !teacherChannelName(ctx)) {
      errors.push('Enter the teacher name for the shared class channel.');
    }
  }
  return errors;
}

function derivePatch(ctx: ConditionContext, base: AppSettings): Partial<AppSettings> {
  const patch = teachParticipantKeys(ctx, ctx.settings);
  if (includesScenario(ctx, 'mobile')) {
    const teacher = selectedTeachParticipants(ctx).find(profile => profile.role === 'teacher');
    const teacherColor = teacher
      ? teacher.inputType === 'mouse' ? ctx.settings.mouseKeyerColor
        : teacher.inputType === 'touch' ? ctx.settings.touchKeyerColor
          : teachParticipantColor(teacher)
      : '';
    patch.rtdbOutputName = ctx.settings.rtdbOutputName.trim() || teacherChannelName(ctx);
    patch.rtdbOutputColor = ctx.settings.rtdbOutputColor !== base.rtdbOutputColor
      ? ctx.settings.rtdbOutputColor
      : teacherColor || ctx.settings.rtdbOutputColor;
  }
  return patch;
}

function deriveReview(base: AppSettings, proposed: AppSettings, ctx: ConditionContext): ItemReviewLine[] {
  return teachParticipantReview(base, proposed, ctx);
}

const participantSteps = Array.from({ length: 5 }, (_, index) => [
  participantStep(index),
  participantInputConfig(index, 'mouse'),
  participantInputConfig(index, 'touch'),
]).flat();
const copyStudentNameSteps = Array.from({ length: 4 }, (_, offset): WizardStep => {
  const index = offset + 1;
  return {
    id: `copyStudentName${index}`,
    title: `Name student ${index}`,
    intro: 'Give each learner a name or emoji. In fullscreen, the teacher can advance the active student after each turn.',
    when: ctx => copying(ctx) && !localKeying(ctx) && studentCountAtLeast(index)(ctx),
    questions: [{
      id: `copyStudentName${index}`,
      label: `Student ${index} name`,
      kind: 'text',
      default: `Student ${index}`,
      maxLength: 20,
    }],
  };
});

/**
 * Parked first attempt at the Teach flow. NOT registered in `flow-registry.ts`;
 * kept only as reference material. See the summary in `teach.flow.ts`.
 */
export const TEACH_DRAFT_FLOW: WizardFlow = {
  id: 'teach',
  title: 'Teach or demonstrate Morse',
  goal: 'teach',
  forced,
  derivedKeys: ['keyboardInputMappings', 'midiInputMappings', 'serialInputMappings'],
  derivePatch,
  validateWithFlowSettings: true,
  deriveReview,
  applyWhen: ctx => {
    const scenarios = ctx.answers['scenarios'];
    return Array.isArray(scenarios) && scenarios.length > 0;
  },
  steps: [
    {
      id: 'scenarios',
      title: 'What are you teaching?',
      intro: 'Choose any combination. Local students can take turns copying or sending, or use a call-and-response activity.',
      questions: [{
        id: 'scenarios',
        label: 'Teaching activities',
        kind: 'multi',
        default: [],
        options: [
          { value: 'sending', label: 'Take turns sending Morse' },
          { value: 'copying', label: 'Take turns copying Morse on one device' },
          { value: 'callResponse', label: 'Teacher call-and-response' },
          { value: 'mobile', label: 'Include students joining from phones' },
        ],
      }],
      validate: ctx => {
        const scenarios = ctx.answers['scenarios'];
        if (!Array.isArray(scenarios) || scenarios.length === 0) {
          return ['Choose at least one teaching activity.'];
        }
        if (copying(ctx) && localKeying(ctx)) {
          return ['Copy Practice uses Practice mode, while sending and call-and-response use keying mode. Choose Copy Practice separately from those activities.'];
        }
        return [];
      },
    },
    {
      id: 'studentCount',
      title: 'How many local students?',
      intro: 'This classroom guide supports a teacher and up to four local students. Phone participants are separate.',
      when: classroomActivity,
      questions: [{
        id: 'studentCount',
        label: 'Local students',
        kind: 'select',
        default: '1',
        optionsFrom: ctx => [
          ...(localKeying(ctx) && !copying(ctx) && !callResponse(ctx)
            ? [{ value: '0', label: '0' }]
            : []),
          ...[1, 2, 3, 4].map(count => ({ value: String(count), label: String(count) })),
        ],
      }],
      validate: ctx => {
        const count = Number(ctx.answers['studentCount']);
        return Number.isInteger(count) && count >= 0 && count <= 4
          ? []
          : ['Choose between zero and four local students.'];
      },
    },
    ...participantSteps,
    ...copyStudentNameSteps,
    {
      id: 'callResponseInstructions',
      title: 'Run call-and-response',
      intro: 'In fullscreen, use Type mode to send a typed prompt, then switch to Key mode for students to key their replies in turn. The teacher manages turns manually; the wizard does not lock or mute any input.',
      when: callResponse,
    },
    {
      id: 'unusedInputs',
      title: 'Review other enabled inputs',
      intro: 'These local keyer inputs are currently enabled but were not selected for any participant. Choose any you want the guide to turn off; unchecked inputs will remain unchanged.',
      when: ctx => unusedEnabledInputOptions(ctx).length > 0,
      questions: [{
        id: 'disableUnusedInputs',
        label: 'Inputs to turn off',
        kind: 'multi',
        default: [],
        optionsFrom: unusedEnabledInputOptions,
      }],
    },
    {
      ...speedStep({ encoder: true }, { when: sendingOrCopying, id: 'classroomEncoderSpeed' }),
      title: 'Choose Morse sending speed',
      intro: 'Set how fast the app sends Morse for practice and typed text. You can adjust this later.',
    },
    {
      ...speedStep({ keyer: true }, { when: usesPaddleInput, id: 'classroomKeyerSpeed' }),
      title: 'Choose paddle keyer speed',
      intro: 'This controls the dot and dash lengths generated by paddle inputs. Straight keys are timed by hand.',
    },
    {
      ...speedStep({ tx: true }, { when: usesStraightKey, id: 'classroomTxDecoderSpeed' }),
      title: 'Set the TX decoder starting speed',
      intro: 'The TX decoder adapts to the timing of straight-key sending. This sets its starting estimate.',
    },
    {
      ...farnsworthStep({ when: sendingOrCopying }),
      title: 'Optional Farnsworth timing',
    },
    {
      id: 'copyPractice',
      title: 'Set up copy practice',
      intro: 'This uses individual copy practice on this device; it does not add group scoring.',
      when: copying,
      items: [{
        item: 'practice',
        inputs: { forceLocalPipeline: true, forceReceivedMorse: true },
      }],
    },
    {
      id: 'classMobileInput',
      title: 'Set up phone channel input',
      intro: 'This enables incoming Morse from the shared class channel. The guide connects only after you press Apply.',
      when: mobile,
      items: [{ item: 'rtdb-input', inputs: { forceEnabled: true, forceSource: 'rx' } }],
      validate: ctx => ctx.settings.rtdbInputChannelName.trim() && ctx.settings.rtdbInputChannelSecret.trim()
        ? []
        : ['Enter the shared channel name and secret for the class.'],
    },
    {
      id: 'classMobileOutput',
      title: 'Set up phone channel output',
      intro: 'Outgoing Morse uses the same channel name and secret as input. If you leave the sender name blank, it uses the teacher’s input name. The guide connects only after you press Apply.',
      when: mobile,
      items: [{ item: 'rtdb-output', inputs: { forceEnabled: true, forceForward: 'both', sharedChannel: true } }],
      validate: ctx => {
        const s = ctx.settings;
        const errors: string[] = [];
        if (!s.rtdbInputChannelName.trim() || !s.rtdbInputChannelSecret.trim()) {
          errors.push('Enter a shared channel name and secret for the class.');
        }
        if (s.rtdbInputChannelName !== s.rtdbOutputChannelName
          || s.rtdbInputChannelSecret !== s.rtdbOutputChannelSecret) {
          errors.push('Use the same channel name and secret for class input and output.');
        }
        if (!s.rtdbOutputName.trim() && !teacherChannelName(ctx)) {
          errors.push('Enter the teacher name for the shared class channel.');
        }
        return errors;
      },
    },
    {
      id: 'optionalReviews',
      title: 'Review optional display features?',
      intro: 'These features are already enabled in your settings. Choose any you would like to review; leaving one unchecked keeps its current settings unchanged.',
      when: ctx => enabledOptionalReviews(ctx).length > 0,
      questions: [{
        id: 'optionalReviews',
        label: 'Enabled features',
        kind: 'multi',
        default: [],
        optionsFrom: enabledOptionalReviews,
      }],
    },
    {
      id: 'textBlurReview',
      title: 'Review text blurring',
      intro: 'Text blurring hides decoded text so learners can listen without seeing the answer; a reveal control lets them peek when needed.',
      when: reviewOptionalFeature('text-blur'),
      items: [{ item: 'text-blur' }],
    },
    {
      id: 'showProsignsReview',
      title: 'Review prosign display',
      intro: 'Prosign display writes procedural signals such as <AR> by name in fullscreen conversation logs, rather than showing matching punctuation.',
      when: reviewOptionalFeature('show-prosigns'),
      items: [{ item: 'show-prosigns' }],
    },
    {
      id: 'emojisReview',
      title: 'Review emoji replacements',
      intro: 'Emoji replacements turn configured sequences and prosigns into emoji in the fullscreen conversation.',
      when: reviewOptionalFeature('emojis'),
      items: [{ item: 'emojis' }],
    },
    {
      id: 'prosignActionsReview',
      title: 'Review prosign actions',
      intro: 'Prosign actions trigger configured actions in the conversation log when a prosign is decoded or encoded.',
      when: reviewOptionalFeature('prosign-actions'),
      items: [{ item: 'prosign-actions' }],
    },
    {
      id: 'sound',
      title: 'Local sound feedback',
      intro: 'Sidetone is a local beep while Morse is sent or played for practice. It does not require radio hardware.',
      when: sendingOrCopying,
      items: [{ item: 'sidetone' }],
    },
    {
      id: 'extras',
      title: 'Review classroom options',
      intro: 'These settings stay on this device. Group scoring is not part of this guide.',
      validate: validateTeachFlow,
    },
  ],
};
