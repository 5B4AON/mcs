/**
 * Morse Code Studio
 */

import { AppSettings } from './settings.service';
import { PortableAppSettings, validatePortableSettings } from './settings-snapshot';

/** localStorage key for named presets; separate from the automatic `morseProfiles` */
export const PRESETS_STORAGE_KEY = 'morsePresets';
export const PRESET_NAME_MAX_LENGTH = 40;
export const PRESETS_STORAGE_MAX_BYTES = 2_097_152;
export const PRESETS_MAX_COUNT = 50;

/** A named, secret-free copy of the portable settings */
export interface SettingsPreset {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: PortableAppSettings;
}

export interface PresetStoreData {
  version: 1;
  presets: SettingsPreset[];
}

export type PresetNameValidation =
  | { valid: true; name: string }
  | { valid: false; error: string };

export type PresetStoreLoad =
  | { status: 'ok'; presets: SettingsPreset[] }
  | { status: 'empty' }
  | { status: 'error'; error: string };

/**
 * Trim and check a preset name. Names are compared case-insensitively;
 * `ignoreId` lets a preset keep its own name when renamed.
 */
export function validatePresetName(
  rawName: string,
  presets: readonly SettingsPreset[],
  ignoreId?: string,
): PresetNameValidation {
  const name = rawName.trim();
  if (!name) return { valid: false, error: 'Enter a preset name.' };
  if (name.length > PRESET_NAME_MAX_LENGTH) {
    return { valid: false, error: `Preset names can have at most ${PRESET_NAME_MAX_LENGTH} characters.` };
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    return { valid: false, error: 'Preset names cannot contain control characters.' };
  }
  const lower = name.toLowerCase();
  if (presets.some(preset => preset.id !== ignoreId && preset.name.toLowerCase() === lower)) {
    return { valid: false, error: 'A preset with this name already exists. Choose a different name.' };
  }
  return { valid: true, name };
}

/** Suggest a free name based on a preferred one, e.g. "Home copy" */
export function suggestPresetName(preferred: string, presets: readonly SettingsPreset[]): string {
  const base = preferred.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, PRESET_NAME_MAX_LENGTH) || 'Preset';
  if (validatePresetName(base, presets).valid) return base;
  for (let n = 2; n < 1000; n++) {
    const suffix = ` ${n}`;
    const candidate = base.slice(0, PRESET_NAME_MAX_LENGTH - suffix.length).trimEnd() + suffix;
    if (validatePresetName(candidate, presets).valid) return candidate;
  }
  return '';
}

/** Parse and validate stored presets. Any corruption rejects the whole store. */
export function parsePresetStore(raw: string | null, defaults: AppSettings): PresetStoreLoad {
  if (raw === null) return { status: 'empty' };
  if (new TextEncoder().encode(raw).byteLength > PRESETS_STORAGE_MAX_BYTES) {
    return { status: 'error', error: 'Saved presets are too large to load.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'error', error: 'Saved presets are damaged and were not loaded.' };
  }
  if (!isRecord(parsed) || parsed['version'] !== 1 || !Array.isArray(parsed['presets'])) {
    return { status: 'error', error: 'Saved presets use an unsupported format and were not loaded.' };
  }

  const presets: SettingsPreset[] = [];
  for (const item of parsed['presets']) {
    if (!isRecord(item)
      || typeof item['id'] !== 'string'
      || typeof item['name'] !== 'string'
      || typeof item['createdAt'] !== 'string'
      || typeof item['updatedAt'] !== 'string'
      || !validatePresetName(item['name'], presets).valid
      || presets.some(preset => preset.id === item['id'])) {
      return { status: 'error', error: 'Saved presets are damaged and were not loaded.' };
    }
    const settings = validatePortableSettings(item['settings'], defaults);
    if (!settings) {
      return { status: 'error', error: 'Saved presets are damaged and were not loaded.' };
    }
    presets.push({
      id: item['id'],
      name: item['name'].trim(),
      createdAt: item['createdAt'],
      updatedAt: item['updatedAt'],
      settings,
    });
  }
  return { status: 'ok', presets };
}

/** Serialize presets in the versioned storage format */
export function serializePresetStore(presets: readonly SettingsPreset[]): string {
  const data: PresetStoreData = { version: 1, presets: [...presets] };
  return JSON.stringify(data);
}

/** Make a safe file name from a preset name */
export function presetFileName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `morse-code-studio-preset-${slug || 'preset'}.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
