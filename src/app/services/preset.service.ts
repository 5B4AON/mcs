/**
 * Morse Code Studio
 */

import { Injectable, signal } from '@angular/core';
import { SettingsService } from './settings.service';
import { createSettingsSnapshot, PortableAppSettings } from './settings-snapshot';
import {
  parsePresetStore,
  PRESETS_MAX_COUNT,
  PRESETS_STORAGE_KEY,
  PresetNameValidation,
  serializePresetStore,
  SettingsPreset,
  validatePresetName,
} from './settings-presets';

export type PresetResult = { ok: true; preset: SettingsPreset } | { ok: false; error: string };
export type PresetRecoveryResult = { ok: true } | { ok: false; error: string };

/**
 * Named settings presets stored in this browser under their own versioned key.
 *
 * Presets never contain RTDB secrets and are independent of the automatic
 * per-device `morseProfiles`. Nothing here changes live settings; applying a
 * preset is a reviewed action performed by the Settings dialog.
 */
@Injectable({ providedIn: 'root' })
export class PresetService {
  /** Saved presets, oldest first */
  readonly presets = signal<SettingsPreset[]>([]);

  /** Set when saved presets could not be loaded; nothing is overwritten in that case */
  readonly loadError = signal('');
  /** Raw unreadable preset store retained until the user explicitly removes it. */
  readonly damagedRawStore = signal<string | null>(null);

  constructor(private settings: SettingsService) {
    this.reload();
  }

  /** Re-read presets from storage, rejecting the whole store if it is damaged */
  reload(): void {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    } catch {
      this.presets.set([]);
      this.loadError.set('Browser storage is unavailable, so presets cannot be loaded or saved.');
      this.damagedRawStore.set(null);
      return;
    }
    const result = parsePresetStore(raw, this.settings.getDefaults());
    if (result.status === 'ok') {
      this.presets.set(result.presets);
      this.loadError.set('');
      this.damagedRawStore.set(null);
    } else if (result.status === 'empty') {
      this.presets.set([]);
      this.loadError.set('');
      this.damagedRawStore.set(null);
    } else {
      this.presets.set([]);
      this.loadError.set(result.error);
      this.damagedRawStore.set(raw);
    }
  }

  /**
   * Remove only an unreadable saved preset store after the user has had an
   * opportunity to download it. Live settings and device profiles are untouched.
   */
  discardDamagedStore(): PresetRecoveryResult {
    if (this.damagedRawStore() === null) {
      return { ok: false, error: 'There is no damaged preset store to remove.' };
    }
    try {
      localStorage.removeItem(PRESETS_STORAGE_KEY);
    } catch {
      return { ok: false, error: 'The damaged presets could not be removed. Browser storage may be blocked.' };
    }
    this.presets.set([]);
    this.loadError.set('');
    this.damagedRawStore.set(null);
    return { ok: true };
  }

  checkName(name: string, ignoreId?: string): PresetNameValidation {
    return validatePresetName(name, this.presets(), ignoreId);
  }

  /** Save a deep copy of the current live settings (without secrets) */
  saveCurrent(name: string): PresetResult {
    return this.add(name, createSettingsSnapshot(this.settings.settings()).settings);
  }

  /** Add a validated portable settings object as a new preset (used by import) */
  add(name: string, settings: PortableAppSettings): PresetResult {
    if (this.loadError()) return { ok: false, error: this.loadError() };
    if (this.presets().length >= PRESETS_MAX_COUNT) {
      return { ok: false, error: `You can keep at most ${PRESETS_MAX_COUNT} presets. Delete one first.` };
    }
    const checked = this.checkName(name);
    if (!checked.valid) return { ok: false, error: checked.error };
    const now = new Date().toISOString();
    const preset: SettingsPreset = {
      id: this.newId(),
      name: checked.name,
      createdAt: now,
      updatedAt: now,
      settings: structuredClone(settings),
    };
    return this.commit([...this.presets(), preset], preset);
  }

  rename(id: string, name: string): PresetResult {
    const existing = this.presets().find(preset => preset.id === id);
    if (!existing) return { ok: false, error: 'That preset no longer exists.' };
    const checked = this.checkName(name, id);
    if (!checked.valid) return { ok: false, error: checked.error };
    const renamed = { ...existing, name: checked.name, updatedAt: new Date().toISOString() };
    return this.commit(this.presets().map(preset => preset.id === id ? renamed : preset), renamed);
  }

  /** Replace a preset's contents with the current live settings, keeping its name */
  updateFromCurrent(id: string): PresetResult {
    const existing = this.presets().find(preset => preset.id === id);
    if (!existing) return { ok: false, error: 'That preset no longer exists.' };
    const updated = {
      ...existing,
      updatedAt: new Date().toISOString(),
      settings: createSettingsSnapshot(this.settings.settings()).settings,
    };
    return this.commit(this.presets().map(preset => preset.id === id ? updated : preset), updated);
  }

  duplicate(id: string, name: string): PresetResult {
    const existing = this.presets().find(preset => preset.id === id);
    if (!existing) return { ok: false, error: 'That preset no longer exists.' };
    return this.add(name, existing.settings);
  }

  remove(id: string): PresetResult {
    const existing = this.presets().find(preset => preset.id === id);
    if (!existing) return { ok: false, error: 'That preset no longer exists.' };
    return this.commit(this.presets().filter(preset => preset.id !== id), existing);
  }

  private commit(next: SettingsPreset[], preset: SettingsPreset): PresetResult {
    try {
      localStorage.setItem(PRESETS_STORAGE_KEY, serializePresetStore(next));
    } catch {
      return { ok: false, error: 'The preset could not be saved. Browser storage may be full or blocked.' };
    }
    this.presets.set(next);
    return { ok: true, preset };
  }

  private newId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}
