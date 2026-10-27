/**
 * Morse Code Studio
 */

import { WizardGoalId } from '../../settings-modal/goal-navigator/setup-goals';
import { WizardFlow } from '../engine/flow-types';
import { SEND_FLOW } from './send.flow';
import { TYPE_FLOW } from './type.flow';

/** Flows migrated to the new wizard; each goal is added here as it lands. */
const MIGRATED: Partial<Record<WizardGoalId, WizardFlow>> = {
  type: TYPE_FLOW,
  send: SEND_FLOW,
};

/** The migrated flow for a goal, or undefined while it still uses the old wizard. */
export function flowForGoal(goal: WizardGoalId): WizardFlow | undefined {
  return MIGRATED[goal];
}
