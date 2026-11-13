/**
 * Morse Code Studio
 */

import type { AppSettings } from '../../../services/settings.service';
import { formatKeyCode } from '../mapping/keyboard-mapping-editor/keyboard-mapping-editor.component';

/** Picker ids: `keyboard-straight`, `keyboard:N`, `midi:N`, `serial:N` (N = mapping index), `mouse`, `touch`, `mic`. */
const INPUT_ID = /^(?:keyboard-straight|mouse|touch|mic|(?:keyboard|midi|serial):\d+)$/;

/** Whether a stored picker id has a known shape (it may still point at a mapping that no longer exists). */
export function isValidSendPracticeInputId(id: string): boolean {
  return INPUT_ID.test(id);
}

/**
 * Picker id of the key that produced a decoded entry, from its decoder input path.
 * Returns null for paths that never count (for example the CW tone detector).
 * Sprite and touch keys both arrive as `touch*`.
 */
export function sendPracticeInputId(inputPath: string | undefined): string | null {
  if (!inputPath) return null;
  if (inputPath === 'keyboardStraightKey') return 'keyboard-straight';
  if (inputPath === 'mouseStraightKey' || inputPath === 'mousePaddle') return 'mouse';
  if (inputPath === 'touchStraightKey' || inputPath === 'touchPaddle') return 'touch';
  if (inputPath === 'mic') return 'mic';
  const mapped = /^(keyboard|midi|serial)(?:Paddle|StraightKey):(\d+)$/.exec(inputPath);
  return mapped ? `${mapped[1]}:${mapped[2]}` : null;
}

/** One line of the "Keys used for Send Practice" picker. */
export interface SendPracticeInputRow {
  id: string;
  group: 'Keyboard' | 'MIDI' | 'Serial' | 'Mouse' | 'Touch' | 'Microphone';
  label: string;
  /** Mapping colour, or '' for the default */
  color: string;
  /** False when the key's own Settings switch or mapping is off */
  available: boolean;
}

/** Rows for every key the user has set up, in picker order. */
export function sendPracticeInputRows(s: AppSettings): SendPracticeInputRow[] {
  const rows: SendPracticeInputRow[] = [];
  const modeText = (mode: string) => mode === 'paddle' ? 'paddle' : 'straight key';

  rows.push({
    id: 'keyboard-straight', group: 'Keyboard', label: 'Keyboard straight keys', color: '',
    available: s.keyboardKeyerEnabled && s.keyboardInputMappings.some(m => m.enabled && m.mode === 'straightKey'),
  });
  s.keyboardInputMappings.forEach((m, i) => {
    if (m.mode !== 'paddle') return;
    rows.push({
      id: `keyboard:${i}`, group: 'Keyboard', color: m.color,
      label: m.name ? `Keyboard paddle: ${m.name}` : `Keyboard paddle ${i + 1}: ${formatKeyCode(m.keyCode)} / ${formatKeyCode(m.dahKeyCode)}`,
      available: s.keyboardKeyerEnabled && m.enabled,
    });
  });
  s.midiInputMappings.forEach((m, i) => rows.push({
    id: `midi:${i}`, group: 'MIDI', color: m.color,
    label: m.name ? `MIDI input: ${m.name}` : `MIDI input ${i + 1}: note ${m.value}, ${modeText(m.mode)}`,
    available: s.midiInputEnabled && m.enabled,
  }));
  s.serialInputMappings.forEach((m, i) => rows.push({
    id: `serial:${i}`, group: 'Serial', color: m.color,
    label: m.name ? `Serial input: ${m.name}` : `Serial input ${i + 1}: ${m.pin}, ${modeText(m.mode)}`,
    available: s.serialInputEnabled && m.enabled,
  }));
  rows.push({ id: 'mouse', group: 'Mouse', label: 'Mouse keyer', color: '', available: s.mouseKeyerEnabled });
  rows.push({
    id: 'touch', group: 'Touch', label: 'Fullscreen touch keyer and sprite key', color: '',
    available: s.touchKeyerEnabled || s.spriteButtonEnabled,
  });
  rows.push({ id: 'mic', group: 'Microphone', label: 'Straight key via microphone', color: '', available: s.micInputEnabled });
  return rows;
}

/** Selected ids that no row matches any more (for example a deleted mapping). */
export function staleSendPracticeInputs(s: AppSettings): string[] {
  const known = new Set(sendPracticeInputRows(s).map(r => r.id));
  return s.sendPracticeInputs.filter(id => !known.has(id));
}

/**
 * Whether a selected, switched-on key is a paddle (where the keyer makes the dits
 * and dahs, so the keyer speed matters). A straight key is timed by the hand.
 */
export function sendPracticeHasPaddle(s: AppSettings): boolean {
  const selected = new Set(s.sendPracticeInputs);
  const isPaddle = (id: string): boolean => {
    if (id === 'mouse') {
      return s.mouseKeyerEnabled && [s.mouseLeftAction, s.mouseMiddleAction, s.mouseRightAction].some(a => a === 'dit' || a === 'dah');
    }
    if (id === 'touch') return s.touchKeyerEnabled && s.touchKeyerMode === 'paddle';
    const mapped = /^(keyboard|midi|serial):(\d+)$/.exec(id);
    if (!mapped) return false;
    const m = ({ keyboard: s.keyboardInputMappings, midi: s.midiInputMappings, serial: s.serialInputMappings })[mapped[1] as 'keyboard' | 'midi' | 'serial'][+mapped[2]];
    return m?.mode === 'paddle';
  };
  return sendPracticeInputRows(s).some(r => r.available && selected.has(r.id) && isPaddle(r.id));
}

/** Whether at least one selected key can currently produce keying. */
export function sendPracticeHasActiveInput(s: AppSettings): boolean {
  const selected = new Set(s.sendPracticeInputs);
  return sendPracticeInputRows(s).some(r => r.available && selected.has(r.id));
}
