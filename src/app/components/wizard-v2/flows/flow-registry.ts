/**
 * Morse Code Studio
 */

import { WizardGoalId } from '../../settings-modal/goal-navigator/setup-goals';
import { WizardFlow } from '../engine/flow-types';
import { DECODE_FLOW } from './decode.flow';
import { MIDI_FLOW } from './midi.flow';
import { PRACTICE_FLOW } from './practice.flow';
import { RELAY_FLOW } from './relay.flow';
import { SEND_FLOW } from './send.flow';
import { TYPE_FLOW } from './type.flow';

/** Flows migrated to the new wizard; each goal is added here as it lands. */
const MIGRATED: Partial<Record<WizardGoalId, WizardFlow>> = {
  type: TYPE_FLOW,
  send: SEND_FLOW,
  midi: MIDI_FLOW,
  practice: PRACTICE_FLOW,
  decode: DECODE_FLOW,
  relay: RELAY_FLOW,
};

/** The migrated flow for a goal, or undefined while it still uses the old wizard. */
export function flowForGoal(goal: WizardGoalId): WizardFlow | undefined {
  return MIGRATED[goal];
}
