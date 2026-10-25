/**
 * Morse Code Studio
 */

import { SettingsService } from '../../services/settings.service';
import {
  WIZARD_STEPS, WizardStepId, initialDraft, revertStepDraft, stepHasChanges, wizardSteps,
} from './setup-wizard-draft';

describe('wizard step revert', () => {
  const base = new SettingsService().getDefaults();

  it('reports no change on an untouched wizard', () => {
    const draft = initialDraft('type', base);
    for (const step of WIZARD_STEPS['type']) {
      expect(stepHasChanges('type', step, base, draft)).toBeFalse();
    }
  });

  it('only flags and reverts the step that changed', () => {
    const draft = initialDraft('type', base);
    draft.encoderWpm = base.encoderWpm + 5;
    expect(stepHasChanges('type', 'speed', base, draft)).toBeTrue();
    expect(stepHasChanges('type', 'sidetone', base, draft)).toBeFalse();

    draft.sidetoneFrequency = base.sidetoneFrequency + 100;
    revertStepDraft('type', 'speed', base, draft);
    expect(draft.encoderWpm).toBe(base.encoderWpm);
    expect(draft.sidetoneFrequency).toBe(base.sidetoneFrequency + 100);
  });

  it('works for goals that previously had no Revert', () => {
    const draft = initialDraft('decode', base);
    draft.cwInputFrequency = base.cwInputFrequency + 50;
    expect(stepHasChanges('decode', 'tone', base, draft)).toBeTrue();
    expect(stepHasChanges('decode', 'before', base, draft)).toBeFalse();
    revertStepDraft('decode', 'tone', base, draft);
    expect(stepHasChanges('decode', 'tone', base, draft)).toBeFalse();
  });

  it('reverts teach scenarios and extras independently', () => {
    const draft = initialDraft('teach', base);
    draft.teachScenarios = ['sending'];
    draft.emojisEnabled = !base.emojisEnabled;
    expect(stepHasChanges('teach', 'teachScenarios', base, draft)).toBeTrue();
    expect(stepHasChanges('teach', 'teachExtras', base, draft)).toBeTrue();
    revertStepDraft('teach', 'teachScenarios', base, draft);
    expect(draft.teachScenarios).toEqual([]);
    expect(draft.emojisEnabled).toBe(!base.emojisEnabled);
  });

  it('keeps people consistent with the student count', () => {
    const draft = initialDraft('teach', base);
    draft.teachStudentCount = 3;
    draft.teachParticipants = [
      ...draft.teachParticipants!,
      ...initialDraft('teach', base).teachParticipants!.slice(1).map(p => ({ ...p })),
      ...initialDraft('teach', base).teachParticipants!.slice(1).map(p => ({ ...p })),
    ];
    revertStepDraft('teach', 'teachParticipants', base, draft);
    expect(draft.teachStudentCount).toBe(1);
    expect(draft.teachParticipants!.filter(p => p.role === 'student').length).toBe(1);
  });

  it('reverts person edits on the inputs step without changing the count', () => {
    const draft = initialDraft('teach', base);
    draft.teachScenarios = ['sending'];
    draft.teachParticipants![1].name = 'Ada';
    expect(stepHasChanges('teach', 'teachInputs', base, draft)).toBeTrue();
    revertStepDraft('teach', 'teachInputs', base, draft);
    expect(draft.teachParticipants![1].name).toBe('Student 1');
    expect(draft.teachParticipants!.length).toBe(2);
    expect(wizardSteps('teach', draft)).toContain('teachInputs' as WizardStepId);
  });
});
