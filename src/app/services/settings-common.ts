/**
 * Morse Code Studio
 */

/*
 * Pieces shared by several settings items. Everything that belongs to one item
 * (its settings, defaults, enum types and import rules) lives in that item's
 * `*-item.model.ts`; only what two or more items need is here, so the item
 * models never have to import each other or the settings service at runtime.
 */

/**
 * Detect whether the device has a touch-capable display.
 * Uses hardware capability (`maxTouchPoints`) plus the CSS `any-pointer: coarse`
 * media query so laptops with both trackpad and touchscreen are correctly
 * identified as touch devices.
 */
export function isTouchDevice(): boolean {
  return navigator.maxTouchPoints > 0
    || matchMedia('(any-pointer: coarse)').matches;
}

/** Decoder source assignment — determines which calibration pool an input feeds */
export const DECODER_SOURCES = ['rx', 'tx'] as const;
export type DecoderSource = typeof DECODER_SOURCES[number];

/** Output forwarding mode: which signal source (RX, TX, or both) drives an output */
export const OUTPUT_FORWARDS = ['rx', 'tx', 'both'] as const;
export type OutputForward = typeof OUTPUT_FORWARDS[number];

/** Iambic keyer paddle mode */
export const PADDLE_MODES = ['iambic-b', 'iambic-a', 'ultimatic', 'single-lever'] as const;
export type PaddleMode = typeof PADDLE_MODES[number];

/** Stereo channel selection */
export const AUDIO_CHANNELS = ['left', 'right'] as const;
export type AudioChannel = typeof AUDIO_CHANNELS[number];

/** Mode for a key input or output mapping entry */
export const KEY_INPUT_MODES = ['straightKey', 'paddle'] as const;
export type KeyInputMode = typeof KEY_INPUT_MODES[number];

/**
 * How an item's settings are checked when they come from outside (a preset or a
 * settings file). Paths name a setting (`sidetoneFrequency`) or a field of a
 * list entry (`midiInputMappings[].channel`). Fields without a rule only have to
 * match the type of their default.
 */
export interface SettingsFieldRules {
  /** Allowed string values */
  enums?: Record<string, readonly string[]>;
  /** Fields that must be hex colours (so a file cannot put arbitrary CSS into the display) */
  colors?: readonly string[];
  /** Allowed numeric ranges, inclusive */
  ranges?: Record<string, readonly [number, number]>;
  /** Number fields that must be whole numbers */
  integers?: readonly string[];
  /** List-entry fields that may be missing */
  optional?: readonly string[];
}

/** Combine the rules of several items into one lookup. */
export function mergeFieldRules(...parts: SettingsFieldRules[]): Required<SettingsFieldRules> {
  const merged = { enums: {}, colors: [], ranges: {}, integers: [], optional: [] } as {
    enums: Record<string, readonly string[]>;
    colors: string[];
    ranges: Record<string, readonly [number, number]>;
    integers: string[];
    optional: string[];
  };
  for (const part of parts) {
    Object.assign(merged.enums, part.enums);
    merged.colors.push(...part.colors ?? []);
    Object.assign(merged.ranges, part.ranges);
    merged.integers.push(...part.integers ?? []);
    merged.optional.push(...part.optional ?? []);
  }
  return merged;
}
