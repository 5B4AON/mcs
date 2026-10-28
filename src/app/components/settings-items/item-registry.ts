/**
 * Morse Code Studio
 */

import { Type } from '@angular/core';
import { ItemDescriptor } from './item-descriptor';
import { AudioFeedbackGuardItemComponent } from './audio-feedback-guard/audio-feedback-guard-item.component';
import { AUDIO_FEEDBACK_GUARD_DESCRIPTOR } from './audio-feedback-guard/audio-feedback-guard-item.model';
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
import { ENCODER_DESCRIPTOR, ENCODER_MODE_DESCRIPTOR } from './encoder/encoder-item.model';
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
import { SerialInputItemComponent } from './serial-input/serial-input-item.component';
import { SERIAL_INPUT_DESCRIPTOR } from './serial-input/serial-input-item.model';
import { SerialOutputItemComponent } from './serial-output/serial-output-item.component';
import { SERIAL_OUTPUT_DESCRIPTOR } from './serial-output/serial-output-item.model';
import { WinkeyerItemComponent } from './winkeyer/winkeyer-item.component';
import { WINKEYER_DESCRIPTOR } from './winkeyer/winkeyer-item.model';
import { RtdbInputItemComponent } from './rtdb-input/rtdb-input-item.component';
import { RTDB_INPUT_DESCRIPTOR } from './rtdb-input/rtdb-input-item.model';
import { RtdbOutputItemComponent } from './rtdb-output/rtdb-output-item.component';
import { RTDB_OUTPUT_DESCRIPTOR } from './rtdb-output/rtdb-output-item.model';
import { MicItemComponent } from './mic/mic-item.component';
import { MIC_DESCRIPTOR } from './mic/mic-item.model';
import { CwDetectorItemComponent } from './cw-detector/cw-detector-item.component';
import { CW_DETECTOR_DESCRIPTOR } from './cw-detector/cw-detector-item.model';
import { MidiOutputItemComponent } from './midi-output/midi-output-item.component';
import { MIDI_OUTPUT_DESCRIPTOR } from './midi-output/midi-output-item.model';
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
  'encoder-mode': { component: EncoderItemComponent, descriptor: ENCODER_MODE_DESCRIPTOR, inputs: { part: 'mode' } },
  'practice': { component: PracticeItemComponent, descriptor: PRACTICE_DESCRIPTOR },
  'text-blur': { component: TextBlurItemComponent, descriptor: TEXT_BLUR_DESCRIPTOR },
  'show-prosigns': { component: ShowProsignsItemComponent, descriptor: SHOW_PROSIGNS_DESCRIPTOR },
  'prosign-actions': { component: ProsignActionsItemComponent, descriptor: PROSIGN_ACTIONS_DESCRIPTOR },
  'emojis': { component: EmojisItemComponent, descriptor: EMOJIS_DESCRIPTOR },
  'mouse-keyer': { component: MouseKeyerItemComponent, descriptor: MOUSE_KEYER_DESCRIPTOR },
  'touch-keyer': { component: TouchKeyerItemComponent, descriptor: TOUCH_KEYER_DESCRIPTOR },
  'sprite-key': { component: SpriteKeyItemComponent, descriptor: SPRITE_KEY_DESCRIPTOR },
  'midi-output': { component: MidiOutputItemComponent, descriptor: MIDI_OUTPUT_DESCRIPTOR },
  'serial-input': { component: SerialInputItemComponent, descriptor: SERIAL_INPUT_DESCRIPTOR },
  'serial-output': { component: SerialOutputItemComponent, descriptor: SERIAL_OUTPUT_DESCRIPTOR },
  'winkeyer': { component: WinkeyerItemComponent, descriptor: WINKEYER_DESCRIPTOR },
  mic: { component: MicItemComponent, descriptor: MIC_DESCRIPTOR, needsAudio: true },
  'cw-detector': { component: CwDetectorItemComponent, descriptor: CW_DETECTOR_DESCRIPTOR, needsAudio: true },
  'cw-detector-tune': { component: CwDetectorItemComponent, descriptor: CW_DETECTOR_DESCRIPTOR, inputs: { tuneOnly: true }, needsAudio: true },
  'audio-feedback-guard': { component: AudioFeedbackGuardItemComponent, descriptor: AUDIO_FEEDBACK_GUARD_DESCRIPTOR },
  'rtdb-input': { component: RtdbInputItemComponent, descriptor: RTDB_INPUT_DESCRIPTOR },
  'rtdb-output': { component: RtdbOutputItemComponent, descriptor: RTDB_OUTPUT_DESCRIPTOR },
  'midi-input': { component: MidiInputItemComponent, descriptor: MIDI_INPUT_DESCRIPTOR },
  'keyboard-keyer': { component: KeyboardKeyerItemComponent, descriptor: KEYBOARD_KEYER_DESCRIPTOR },
  farnsworth: { component: FarnsworthItemComponent, descriptor: FARNSWORTH_DESCRIPTOR },
  'encoder-speed': { component: SpeedItemComponent, descriptor: ENCODER_SPEED_DESCRIPTOR, inputs: { show: ['encoder'] } },
  'keyer-speed': { component: SpeedItemComponent, descriptor: KEYER_SPEED_DESCRIPTOR, inputs: { show: ['keyer'] } },
  'rx-speed': { component: SpeedItemComponent, descriptor: RX_SPEED_DESCRIPTOR, inputs: { show: ['rx'] } },
  'tx-speed': { component: SpeedItemComponent, descriptor: TX_SPEED_DESCRIPTOR, inputs: { show: ['tx'] } },
  speeds: { component: SpeedItemComponent, descriptor: SPEEDS_DESCRIPTOR },
};
