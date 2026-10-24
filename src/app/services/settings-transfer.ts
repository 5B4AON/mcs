/**
 * Morse Code Studio
 */

import { AppSettings } from './settings.service';

export const SETTINGS_SNAPSHOT_MAX_BYTES = 1_048_576;

export type PortableAppSettings = Omit<
  AppSettings,
  'rtdbInputChannelSecret' | 'rtdbOutputChannelSecret'
>;

export interface SettingsSnapshot {
  format: 'mcs-settings';
  version: 1;
  /** Optional preset name; absent in plain settings snapshots */
  name?: string;
  settings: PortableAppSettings;
}

export type SettingsSnapshotValidation =
  | { valid: true; settings: PortableAppSettings; name?: string }
  | { valid: false; error: string };

export const SETTINGS_TRANSFER_FIELDS = [
  'micInputEnabled',
  'micInputSource',
  'micInputName',
  'micInputColor',
  'inputDeviceId',
  'inputThreshold',
  'inputInvert',
  'inputDebounceMs',
  'pilotFrequency',
  'pilotAmplitude',
  'pilotOutputDeviceId',
  'pilotOutputChannel',
  'cwInputEnabled',
  'cwInputSource',
  'cwInputDeviceId',
  'cwInputChannel',
  'cwInputFrequency',
  'cwInputBandwidth',
  'cwInputDebounceMs',
  'cwInputAutoThreshold',
  'cwInputThreshold',
  'cwInputName',
  'cwInputColor',
  'optoOutputDeviceId',
  'optoOutputChannel',
  'optoMode',
  'optoFrequency',
  'optoAmplitude',
  'optoEnabled',
  'optoForward',
  'serialEnabled',
  'serialOutputMappings',
  'serialInputEnabled',
  'serialInputMappings',
  'winkeyerEnabled',
  'winkeyerPortIndex',
  'winkeyerWpm',
  'winkeyerForward',
  'rtdbOutputEnabled',
  'rtdbOutputForward',
  'rtdbOutputChannelName',
  'rtdbOutputName',
  'rtdbOutputColor',
  'rtdbOutputOverrideName',
  'rtdbOutputOverrideColor',
  'rtdbAllowInputRelay',
  'rtdbRelaySuppressOtherInputs',
  'sidetoneOutputDeviceId',
  'sidetoneOutputChannel',
  'sidetoneFrequency',
  'sidetoneAmplitude',
  'sidetoneEnabled',
  'sidetoneForward',
  'vibrateEnabled',
  'vibrateForward',
  'vibrateEnhanced',
  'rxDecoderWpm',
  'txDecoderWpm',
  'encoderWpm',
  'encoderMode',
  'encoderSource',
  'encoderName',
  'encoderColor',
  'keyboardKeyerEnabled',
  'keyboardInputMappings',
  'paddleMode',
  'keyerWpm',
  'mouseKeyerEnabled',
  'mouseKeyerSource',
  'mouseLeftAction',
  'mouseMiddleAction',
  'mouseRightAction',
  'mouseReversePaddles',
  'mousePaddleMode',
  'mouseKeyerName',
  'mouseKeyerColor',
  'touchKeyerEnabled',
  'touchKeyerSource',
  'touchKeyerMode',
  'touchLeftPaddle',
  'touchRightPaddle',
  'touchReversePaddles',
  'touchPaddleMode',
  'touchKeyerName',
  'touchKeyerColor',
  'midiInputEnabled',
  'midiInputMappings',
  'midiOutputEnabled',
  'midiOutputMappings',
  'midiOutputOverrideWpm',
  'rtdbInputEnabled',
  'rtdbInputSource',
  'rtdbInputChannelName',
  'rtdbInputOverrideWpm',
  'rtdbInputName',
  'rtdbInputColor',
  'spriteButtonEnabled',
  'spriteSource',
  'spriteName',
  'spriteColor',
  'spriteAnimateKeyboard',
  'spriteAnimateEncoder',
  'spriteAnimateMouse',
  'spriteAnimateMidi',
  'spriteAnimateSerial',
  'spriteAnimateMic',
  'textBlurEnabled',
  'textBlurAppliesTo',
  'wakeLockEnabled',
  'showProsigns',
  'prosignActionsEnabled',
  'prosignActions',
  'farnsworthEnabled',
  'farnsworthInputMode',
  'farnsworthEffectiveWpm',
  'farnsworthMultiplier',
  'farnsworthWordsworth',
  'farnsworthAppliesTo',
  'practiceEnabled',
  'practiceContentMode',
  'practiceGroupCount',
  'practiceCharGroupSize',
  'practiceIncludeLetters',
  'practiceIncludeNumbers',
  'practiceIncludePunctuation',
  'practiceWordLengths',
  'practiceFeedbackMode',
  'practiceRounds',
  'practicePipeline',
  'practiceSource',
  'practiceName',
  'practiceColor',
  'emojisEnabled',
  'emojiMappings',
] as const satisfies readonly (keyof PortableAppSettings)[];

type Assert<T extends true> = T;
type HasCompleteTransferAllowList = Assert<
  Exclude<keyof PortableAppSettings, typeof SETTINGS_TRANSFER_FIELDS[number]> extends never
    ? true
    : false
>;

const ENUM_VALUES: Record<string, readonly string[]> = {
  micInputSource: ['rx', 'tx'],
  pilotOutputChannel: ['left', 'right'],
  cwInputSource: ['rx', 'tx'],
  cwInputChannel: ['left', 'right'],
  optoOutputChannel: ['left', 'right'],
  optoMode: ['ac', 'dc'],
  optoForward: ['rx', 'tx', 'both'],
  winkeyerForward: ['rx', 'tx', 'both'],
  rtdbOutputForward: ['rx', 'tx', 'both'],
  sidetoneOutputChannel: ['left', 'right', 'both'],
  sidetoneForward: ['rx', 'tx', 'both'],
  vibrateForward: ['rx', 'tx', 'both'],
  encoderMode: ['enter', 'live', 'practice'],
  encoderSource: ['rx', 'tx'],
  paddleMode: ['iambic-b', 'iambic-a', 'ultimatic', 'single-lever'],
  mouseKeyerSource: ['rx', 'tx'],
  mouseLeftAction: ['straightKey', 'dit', 'dah', 'none'],
  mouseMiddleAction: ['straightKey', 'dit', 'dah', 'none'],
  mouseRightAction: ['straightKey', 'dit', 'dah', 'none'],
  mousePaddleMode: ['iambic-b', 'iambic-a', 'ultimatic', 'single-lever'],
  touchKeyerSource: ['rx', 'tx'],
  touchKeyerMode: ['straight', 'paddle'],
  touchLeftPaddle: ['dit', 'dah'],
  touchRightPaddle: ['dit', 'dah'],
  touchPaddleMode: ['iambic-b', 'iambic-a', 'ultimatic', 'single-lever'],
  rtdbInputSource: ['rx', 'tx'],
  textBlurAppliesTo: ['rx', 'tx', 'both'],
  farnsworthInputMode: ['wpm', 'multiplier'],
  farnsworthAppliesTo: ['tx', 'rx', 'both'],
  practiceContentMode: ['characters', 'words', 'callsigns'],
  practiceFeedbackMode: ['listen', 'blur', 'typealong'],
  practicePipeline: ['local', 'full'],
  practiceSource: ['rx', 'tx'],
  'serialOutputMappings[].pin': ['dtr', 'rts'],
  'serialOutputMappings[].forward': ['rx', 'tx', 'both'],
  'serialInputMappings[].mode': ['straightKey', 'paddle'],
  'serialInputMappings[].pin': ['dsr', 'cts', 'dcd', 'ri'],
  'serialInputMappings[].dahPin': ['dsr', 'cts', 'dcd', 'ri'],
  'serialInputMappings[].source': ['rx', 'tx'],
  'serialInputMappings[].paddleMode': ['iambic-b', 'iambic-a', 'ultimatic', 'single-lever'],
  'keyboardInputMappings[].mode': ['straightKey', 'paddle'],
  'keyboardInputMappings[].source': ['rx', 'tx'],
  'keyboardInputMappings[].paddleMode': ['iambic-b', 'iambic-a', 'ultimatic', 'single-lever'],
  'midiInputMappings[].source': ['rx', 'tx'],
  'midiInputMappings[].mode': ['straightKey', 'paddle'],
  'midiOutputMappings[].forward': ['rx', 'tx', 'both'],
  'midiOutputMappings[].mode': ['straightKey', 'paddle'],
  'prosignActions.*.action': ['newLine', 'newParagraph', 'clearLastWord', 'clearLine', 'clearScreen'],
};

const INTEGER_FIELDS = new Set([
  'inputDebounceMs',
  'cwInputDebounceMs',
  'winkeyerWpm',
  'rxDecoderWpm',
  'txDecoderWpm',
  'encoderWpm',
  'keyerWpm',
  'practiceGroupCount',
  'practiceCharGroupSize',
  'practiceRounds',
  'practiceWordLengths[]',
  'winkeyerPortIndex',
  'serialOutputMappings[].portIndex',
  'serialInputMappings[].portIndex',
  'serialInputMappings[].pollInterval',
  'serialInputMappings[].debounceMs',
  'midiInputMappings[].channel',
  'midiInputMappings[].value',
  'midiInputMappings[].dahValue',
  'midiOutputMappings[].channel',
  'midiOutputMappings[].value',
  'midiOutputMappings[].dahValue',
  'midiOutputMappings[].relayInputIndices[]',
  'serialOutputMappings[].relayInputIndices[]',
]);

const EMPTY_ARRAY_ITEM_TEMPLATES: Record<string, number> = {
  'serialOutputMappings[].relayInputIndices': 0,
  'midiOutputMappings[].relayInputIndices': 0,
};

/**
 * Build the version-1 portable snapshot. RTDB secrets are deliberately omitted.
 */
export function createSettingsSnapshot(settings: AppSettings, name?: string): SettingsSnapshot {
  const portableSettings = structuredClone(Object.fromEntries(
    SETTINGS_TRANSFER_FIELDS.map(field => [field, settings[field]]),
  )) as PortableAppSettings;

  return {
    format: 'mcs-settings',
    version: 1,
    ...(name === undefined ? {} : { name }),
    settings: portableSettings,
  };
}

/**
 * Check portable settings from a preset and return a deep copy, or null when
 * known values are invalid. Older snapshots may omit fields introduced after
 * they were saved; those fields are supplied from the current defaults.
 */
export function validatePortableSettings(
  value: unknown,
  defaults: AppSettings,
): PortableAppSettings | null {
  if (!isRecord(value)) {
    return null;
  }
  const normalized = Object.fromEntries(
    SETTINGS_TRANSFER_FIELDS.map(field => [field, value[field] ?? defaults[field]]),
  );
  if (!matchesSettingsShape(normalized, defaults)) return null;
  return structuredClone(normalized) as PortableAppSettings;
}

/**
 * Parse and validate a complete version-1 settings snapshot before it is shown.
 */
export function validateSettingsSnapshot(
  contents: string,
  defaults: AppSettings,
): SettingsSnapshotValidation {
  if (contents.length > SETTINGS_SNAPSHOT_MAX_BYTES
    || new TextEncoder().encode(contents).byteLength > SETTINGS_SNAPSHOT_MAX_BYTES) {
    return { valid: false, error: 'The settings file is larger than the 1 MiB limit.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return { valid: false, error: 'The settings file is not valid JSON.' };
  }

  if (!isRecord(parsed)
    || !hasExactKeys(parsed, ['format', 'version', 'name', 'settings'], ['name'])
    || parsed['format'] !== 'mcs-settings'
    || parsed['version'] !== 1) {
    return { valid: false, error: 'The file is not a supported settings snapshot.' };
  }

  const name = parsed['name'];
  if (name !== undefined && typeof name !== 'string') {
    return { valid: false, error: 'The settings file is incomplete or contains invalid values.' };
  }

  const settings = validatePortableSettings(parsed['settings'], defaults);
  if (!settings) {
    return { valid: false, error: 'The settings file is incomplete or contains invalid values.' };
  }

  return { valid: true, settings, ...(name === undefined ? {} : { name }) };
}

function matchesSettingsShape(value: Record<string, unknown>, defaults: AppSettings): boolean {
  for (const field of SETTINGS_TRANSFER_FIELDS) {
    if (!matchesValue(value[field], defaults[field], field)) {
      return false;
    }
  }
  return true;
}

function matchesValue(value: unknown, template: unknown, path: string): boolean {
  const enumValues = ENUM_VALUES[path]
    ?? (path.startsWith('prosignActions.') && path.endsWith('.action')
      ? ENUM_VALUES['prosignActions.*.action']
      : undefined);
  if (enumValues && (typeof value !== 'string' || !enumValues.includes(value))) {
    return false;
  }

  if (Array.isArray(template)) {
    if (!Array.isArray(value)) return false;
    const itemTemplate = template[0] ?? EMPTY_ARRAY_ITEM_TEMPLATES[path];
    return itemTemplate === undefined
      ? value.length === 0
      : value.every(item => matchesValue(item, itemTemplate, `${path}[]`));
  }

  if (isRecord(template)) {
    if (!isRecord(value)) return false;
    const optionalKeys = path === 'emojiMappings[]' ? ['meaning'] : [];
    if (!hasExactKeys(value, Object.keys(template), optionalKeys)) return false;
    return Object.keys(template).every(key => {
      if (optionalKeys.includes(key) && !Object.prototype.hasOwnProperty.call(value, key)) {
        return true;
      }
      return matchesValue(value[key], template[key], `${path}.${key}`);
    });
  }

  if (typeof template === 'number') {
    return typeof value === 'number'
      && Number.isFinite(value)
      && (!INTEGER_FIELDS.has(path) || Number.isSafeInteger(value));
  }

  return typeof value === typeof template;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  return keys.every(key => expected.includes(key))
    && expected.every(key => optional.includes(key) || Object.prototype.hasOwnProperty.call(value, key))
    && keys.length >= expected.length - optional.filter(key => expected.includes(key)).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
