/**
 * Morse Code Studio
 */

import { Type } from '@angular/core';
import { ItemDescriptor } from './item-descriptor';
import { SidetoneItemComponent } from './sidetone/sidetone-item.component';
import { SIDETONE_DESCRIPTOR } from './sidetone/sidetone-item.model';
import { FarnsworthItemComponent } from './farnsworth/farnsworth-item.component';
import { FARNSWORTH_DESCRIPTOR } from './farnsworth/farnsworth-item.model';
import { SpeedItemComponent } from './speed/speed-item.component';
import { ENCODER_SPEED_DESCRIPTOR, KEYER_SPEED_DESCRIPTOR, RX_SPEED_DESCRIPTOR, TX_SPEED_DESCRIPTOR, SPEEDS_DESCRIPTOR } from './speed/speed-item.model';
import { AudioOutputItemComponent } from './audio-output/audio-output-item.component';
import { AUDIO_OUTPUT_DESCRIPTOR } from './audio-output/audio-output-item.model';
import { VibrationItemComponent } from './vibration/vibration-item.component';
import { VIBRATION_DESCRIPTOR } from './vibration/vibration-item.model';
import { EncoderItemComponent } from './encoder/encoder-item.component';
import { ENCODER_DESCRIPTOR } from './encoder/encoder-item.model';

/** One registered item: how to draw it and what it edits. */
export interface RegisteredItem {
  component: Type<unknown>;
  descriptor: ItemDescriptor;
  /** Fixed inputs for this id, e.g. which speed a shared component shows */
  inputs?: Record<string, unknown>;
  /** The component has an `audioRunning` input for its test buttons */
  needsAudio?: boolean;
}

/** All settings items by id. Wizard flows refer to items by these ids. */
export const ITEM_REGISTRY: Record<string, RegisteredItem> = {
  sidetone: { component: SidetoneItemComponent, descriptor: SIDETONE_DESCRIPTOR, needsAudio: true },
  'audio-output': { component: AudioOutputItemComponent, descriptor: AUDIO_OUTPUT_DESCRIPTOR, needsAudio: true },
  vibration: { component: VibrationItemComponent, descriptor: VIBRATION_DESCRIPTOR },
  encoder: { component: EncoderItemComponent, descriptor: ENCODER_DESCRIPTOR },
  farnsworth: { component: FarnsworthItemComponent, descriptor: FARNSWORTH_DESCRIPTOR },
  'encoder-speed': { component: SpeedItemComponent, descriptor: ENCODER_SPEED_DESCRIPTOR, inputs: { show: ['encoder'] } },
  'keyer-speed': { component: SpeedItemComponent, descriptor: KEYER_SPEED_DESCRIPTOR, inputs: { show: ['keyer'] } },
  'rx-speed': { component: SpeedItemComponent, descriptor: RX_SPEED_DESCRIPTOR, inputs: { show: ['rx'] } },
  'tx-speed': { component: SpeedItemComponent, descriptor: TX_SPEED_DESCRIPTOR, inputs: { show: ['tx'] } },
  speeds: { component: SpeedItemComponent, descriptor: SPEEDS_DESCRIPTOR },
};
