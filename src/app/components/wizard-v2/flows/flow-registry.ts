/**
 * Morse Code Studio
 */

import { WizardGoalId } from '../../settings-modal/goal-navigator/setup-goals';
import { WizardFlow } from '../engine/flow-types';
import { DECODE_FLOW } from './decode.flow';
import { HARDWARE_FLOW } from './hardware.flow';
import { PRACTICE_FLOW } from './practice.flow';
import { RELAY_FLOW } from './relay.flow';
import { SEND_FLOW } from './send.flow';
import { TYPE_FLOW } from './type.flow';
import { TEACH_FLOW } from './teach.flow';

/** The flow of every goal that has a guided setup. Add a goal's flow here when it gets a wizard. */
const FLOWS: Record<WizardGoalId, WizardFlow> = {
  type: TYPE_FLOW,
  send: SEND_FLOW,
  practice: PRACTICE_FLOW,
  decode: DECODE_FLOW,
  relay: RELAY_FLOW,
  hardware: HARDWARE_FLOW,
  teach: TEACH_FLOW,
};

/** The flow for a goal. */
export function flowForGoal(goal: WizardGoalId): WizardFlow {
  return FLOWS[goal];
}
