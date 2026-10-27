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
import { PracticeItemComponent } from './practice/practice-item.component';
import { PRACTICE_DESCRIPTOR } from './practice/practice-item.model';
import { TextBlurItemComponent } from './text-blur/text-blur-item.component';
import { TEXT_BLUR_DESCRIPTOR } from './text-blur/text-blur-item.model';
import { ShowProsignsItemComponent } from './show-prosigns/show-prosigns-item.component';
import { SHOW_PROSIGNS_DESCRIPTOR } from './show-prosigns/show-prosigns-item.model';
import { ProsignActionsItemComponent } from './prosign-actions/prosign-actions-item.component';
import { PROSIGN_ACTIONS_DESCRIPTOR } from './prosign-actions/prosign-actions-item.model';
import { EmojisItemComponent } from './emojis/emojis-item.component';
import { EMOJIS_DESCRIPTOR } from './emojis/emojis-item.model';
import { MouseKeyerItemComponent } from './mouse-keyer/mouse-keyer-item.component';
import { MOUSE_KEYER_DESCRIPTOR } from './mouse-keyer/mouse-keyer-item.model';
import { TouchKeyerItemComponent } from './touch-keyer/touch-keyer-item.component';
import { TOUCH_KEYER_DESCRIPTOR } from './touch-keyer/touch-keyer-item.model';
import { SpriteKeyItemComponent } from './sprite-key/sprite-key-item.component';
import { SPRITE_KEY_DESCRIPTOR } from './sprite-key/sprite-key-item.model';
import { MidiInputItemComponent } from './midi-input/midi-input-item.component';
import { MIDI_INPUT_DESCRIPTOR } from './midi-input/midi-input-item.model';
import { KeyboardKeyerItemComponent } from './keyboard-keyer/keyboard-keyer-item.component';
import { KEYBOARD_KEYER_DESCRIPTOR } from './keyboard-keyer/keyboard-keyer-item.model';

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
  'practice': { component: PracticeItemComponent, descriptor: PRACTICE_DESCRIPTOR },
  'text-blur': { component: TextBlurItemComponent, descriptor: TEXT_BLUR_DESCRIPTOR },
  'show-prosigns': { component: ShowProsignsItemComponent, descriptor: SHOW_PROSIGNS_DESCRIPTOR },
  'prosign-actions': { component: ProsignActionsItemComponent, descriptor: PROSIGN_ACTIONS_DESCRIPTOR },
  'emojis': { component: EmojisItemComponent, descriptor: EMOJIS_DESCRIPTOR },
  'mouse-keyer': { component: MouseKeyerItemComponent, descriptor: MOUSE_KEYER_DESCRIPTOR },
  'touch-keyer': { component: TouchKeyerItemComponent, descriptor: TOUCH_KEYER_DESCRIPTOR },
  'sprite-key': { component: SpriteKeyItemComponent, descriptor: SPRITE_KEY_DESCRIPTOR },
  'midi-input': { component: MidiInputItemComponent, descriptor: MIDI_INPUT_DESCRIPTOR },
  'keyboard-keyer': { component: KeyboardKeyerItemComponent, descriptor: KEYBOARD_KEYER_DESCRIPTOR },
  farnsworth: { component: FarnsworthItemComponent, descriptor: FARNSWORTH_DESCRIPTOR },
  'encoder-speed': { component: SpeedItemComponent, descriptor: ENCODER_SPEED_DESCRIPTOR, inputs: { show: ['encoder'] } },
  'keyer-speed': { component: SpeedItemComponent, descriptor: KEYER_SPEED_DESCRIPTOR, inputs: { show: ['keyer'] } },
  'rx-speed': { component: SpeedItemComponent, descriptor: RX_SPEED_DESCRIPTOR, inputs: { show: ['rx'] } },
  'tx-speed': { component: SpeedItemComponent, descriptor: TX_SPEED_DESCRIPTOR, inputs: { show: ['tx'] } },
  speeds: { component: SpeedItemComponent, descriptor: SPEEDS_DESCRIPTOR },
};
