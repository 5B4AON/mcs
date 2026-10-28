/**
 * Morse Code Studio
 */

import { AppSettings } from '../../../services/settings.service';
import { Condition } from './flow-types';

/*
 * Named conditions for `WizardStep.when`. Compose them rather than writing
 * ad-hoc functions in flows, so a flow reads like a sentence:
 *   when: all(answerIncludes('scenarios', 'sending'), not(settingIs('optoEnabled', true)))
 */

/** True when the draft setting has exactly this value. */
export const settingIs = <K extends keyof AppSettings>(key: K, value: AppSettings[K]): Condition =>
  ctx => ctx.settings[key] === value;

/** True when a yes/no answer is yes. */
export const answerIs = (id: string, value: unknown): Condition =>
  ctx => ctx.answers[id] === value;

/** True when a multi-choice answer includes the option. */
export const answerIncludes = (id: string, option: string): Condition =>
  ctx => Array.isArray(ctx.answers[id]) && (ctx.answers[id] as unknown[]).includes(option);

/** True when every condition is true. */
export const all = (...conditions: Condition[]): Condition =>
  ctx => conditions.every(condition => condition(ctx));

/** True when at least one condition is true. */
export const any = (...conditions: Condition[]): Condition =>
  ctx => conditions.some(condition => condition(ctx));

/** Opposite of a condition. */
export const not = (condition: Condition): Condition =>
  ctx => !condition(ctx);
