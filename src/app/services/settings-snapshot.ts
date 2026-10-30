/**
 * Morse Code Studio
 */

import { AppSettings, SETTINGS_FIELD_RULES } from './settings.service';

export const SETTINGS_SNAPSHOT_MAX_BYTES = 1_048_576;

/** Settings that are never written to a preset or settings file. */
const SECRET_FIELDS = [
  'rtdbInputChannelSecret',
  'rtdbOutputChannelSecret',
] as const satisfies readonly (keyof AppSettings)[];

export type PortableAppSettings = Omit<AppSettings, typeof SECRET_FIELDS[number]>;

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

const ENUMS = SETTINGS_FIELD_RULES.enums;
const COLOR_FIELDS = new Set(SETTINGS_FIELD_RULES.colors);
const NUMBER_RANGES = SETTINGS_FIELD_RULES.ranges;
const INTEGER_FIELDS = new Set(SETTINGS_FIELD_RULES.integers);
const OPTIONAL_FIELDS = new Set(SETTINGS_FIELD_RULES.optional);

/**
 * The settings a snapshot carries: every setting except the secrets. A new
 * setting is portable as soon as it exists in AppSettings.
 */
export function portableFields(settings: object): (keyof PortableAppSettings)[] {
  return Object.keys(settings)
    .filter(field => !(SECRET_FIELDS as readonly string[]).includes(field)) as (keyof PortableAppSettings)[];
}

/**
 * Build the version-1 portable snapshot. RTDB secrets are deliberately omitted.
 */
export function createSettingsSnapshot(settings: AppSettings, name?: string): SettingsSnapshot {
  const portableSettings = structuredClone(Object.fromEntries(
    portableFields(settings).map(field => [field, settings[field]]),
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
    portableFields(defaults).map(field => [field, value[field] ?? defaults[field]]),
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
  for (const field of portableFields(defaults)) {
    if (!matchesValue(value[field], defaults[field], field)) {
      return false;
    }
  }
  return true;
}

function matchesValue(value: unknown, template: unknown, path: string): boolean {
  const enumValues = ENUMS[path]
    ?? (path.startsWith('prosignActions.') && path.endsWith('.action')
      ? ENUMS['prosignActions.*.action']
      : undefined);
  if (enumValues && (typeof value !== 'string' || !enumValues.includes(value))) {
    return false;
  }

  if (Array.isArray(template)) {
    if (!Array.isArray(value)) return false;
    // An empty default list of whole numbers (e.g. relay indices) has no entry to copy the type from
    const itemTemplate = template[0] ?? (INTEGER_FIELDS.has(`${path}[]`) ? 0 : undefined);
    return itemTemplate === undefined
      ? value.length === 0
      : value.every(item => matchesValue(item, itemTemplate, `${path}[]`));
  }

  if (isRecord(template)) {
    if (!isRecord(value)) return false;
    const optionalKeys = Object.keys(template).filter(key => OPTIONAL_FIELDS.has(`${path}.${key}`));
    if (!hasExactKeys(value, Object.keys(template), optionalKeys)) return false;
    return Object.keys(template).every(key => {
      if (optionalKeys.includes(key) && !Object.prototype.hasOwnProperty.call(value, key)) {
        return true;
      }
      return matchesValue(value[key], template[key], `${path}.${key}`);
    });
  }

  if (typeof template === 'number') {
    const range = NUMBER_RANGES[path];
    return typeof value === 'number'
      && Number.isFinite(value)
      && (!INTEGER_FIELDS.has(path) || Number.isSafeInteger(value))
      && (!range || (value >= range[0] && value <= range[1]));
  }

  if (COLOR_FIELDS.has(path)) {
    return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
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
