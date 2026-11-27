/**
 * Morse Code Studio
 */

import { Injectable, computed, signal } from '@angular/core';

/**
 * Simplified representation of a browser audio device.
 * Used throughout the UI for device selection dropdowns.
 */
export interface AudioDeviceInfo {
  /** Browser-assigned unique identifier (changes across sessions) */
  deviceId: string;
  /** Human-readable device name (e.g. "USB Audio Codec") */
  label: string;
  /** Whether this is a microphone input or speaker output */
  kind: 'audioinput' | 'audiooutput';
}

/**
 * Audio Device Enumeration Service.
 *
 * Discovers all audio input (microphone) and output (speaker/headphone)
 * devices available in the browser. Device labels are only available after
 * the user grants microphone permission, so `requestAndEnumerate()` should
 * be called on first use.
 *
 * The service exposes reactive signals for the device lists so the UI
 * updates automatically when devices change (e.g. plugging in a USB
 * sound card).
 *
 * Also provides `computeFingerprint()` which generates a stable string
 * from the sorted device labels — used by SettingsService to save and
 * restore per-hardware-configuration profiles.
 */
@Injectable({ providedIn: 'root' })
export class AudioDeviceService {
  /** Audio input devices (microphones, line-in, virtual cables) */
  readonly inputDevices = signal<AudioDeviceInfo[]>([]);
  /** Audio output devices (speakers, headphones, USB sound cards) */
  readonly outputDevices = signal<AudioDeviceInfo[]>([]);

  /** True on an Android browser, where the output is always the one the system chose */
  readonly isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

  /**
   * What the pickers list after their own "System Default" choice. Browsers also list
   * their own `default` entry, which has the same id as that choice and would show twice,
   * so it is left out. Profiles and fingerprints still use the full lists above.
   */
  readonly inputChoices = computed(() => this.withoutDefault(this.inputDevices()));
  readonly outputChoices = computed(() => this.withoutDefault(this.outputDevices()));

  /** "System Default", plus the device the browser says it is when that is known */
  readonly inputDefaultLabel = computed(() => this.defaultLabel(this.inputDevices()));
  readonly outputDefaultLabel = computed(() => this.defaultLabel(this.outputDevices()));

  /** Whether we've successfully enumerated devices with readable labels */
  readonly hasPermission = signal(false);

  /**
   * Enumerate all audio devices.
   * Called after mic permission is granted so labels are populated.
   * Safe to call multiple times (e.g. when devices change).
   */

  async enumerate(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      const inputs: AudioDeviceInfo[] = [];
      const outputs: AudioDeviceInfo[] = [];

      for (const d of devices) {
        if (d.kind === 'audioinput') {
          inputs.push({
            deviceId: d.deviceId,
            label: d.label || `Microphone ${inputs.length + 1}`,
            kind: 'audioinput',
          });
        } else if (d.kind === 'audiooutput') {
          outputs.push({
            deviceId: d.deviceId,
            label: d.label || `Speaker ${outputs.length + 1}`,
            kind: 'audiooutput',
          });
        }
      }

      this.inputDevices.set(inputs);
      this.outputDevices.set(outputs);

      // If labels are available, permission was granted
      const hasLabels = devices.some(d => d.label && d.label.length > 0);
      this.hasPermission.set(hasLabels);
    } catch (err) {
      console.error('Failed to enumerate audio devices:', err);
    }
  }

  private withoutDefault(list: AudioDeviceInfo[]): AudioDeviceInfo[] {
    return list.filter(d => d.deviceId !== 'default');
  }

  private defaultLabel(list: AudioDeviceInfo[]): string {
    const name = list.find(d => d.deviceId === 'default')?.label.replace(/^default\s*[-:]?\s*/i, '').trim();
    return name && !/^(microphone|speaker) \d+$/i.test(name) ? `System Default (${name})` : 'System Default';
  }

  /**
   * Request microphone permission (triggers the browser permission prompt),
   * then enumerate devices with full labels.
   *
   * The mic stream is immediately closed after permission is granted —
   * we only need it to unlock device label visibility.
   */
  async requestAndEnumerate(): Promise<void> {
    try {
      // Briefly open mic to get permission, then close it
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch {
      // User may deny — that's okay, we'll enumerate with empty labels
    }
    await this.enumerate();
  }

  /**
   * Compute a stable fingerprint from the current device configuration.
   *
   * Built from sorted device labels (not IDs, which change per session).
   * Two computers with the same set of audio devices will produce the
   * same fingerprint, enabling per-hardware settings profiles.
   *
   * @returns A pipe-separated string of "I:label" and "O:label" entries
   */
  computeFingerprint(): string {
    const labels = [
      ...this.inputDevices().map(d => `I:${d.label}`),
      ...this.outputDevices().map(d => `O:${d.label}`),
    ];
    labels.sort();
    return labels.join('|') || 'no-devices';
  }
}
