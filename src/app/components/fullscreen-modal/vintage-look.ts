/**
 * Morse Code Studio
 */

import { FullscreenFontId } from '../../fullscreen-fonts';
import { ModalDisplaySettings } from '../../services/settings.service';

/** Warm charcoal typewriter-ribbon ink (never pure black) */
const VINTAGE_INK = '#262320';
/** Aged cream paper */
const VINTAGE_PAPER = '#f4efe6';
/** Typed text that has not been sent yet: faded ink */
const VINTAGE_UNSENT_INK = '#8c857b';

/** The font Vintage Look always uses, whatever font the fullscreen menu has chosen. */
export const VINTAGE_FONT: FullscreenFontId = 'elite';

/**
 * Colours Vintage Look shows instead of the ones chosen in the fullscreen menu. They are applied
 * only while the mode is on (`SettingsService.modalDisplayOverride`) and are never saved.
 */
export const VINTAGE_DISPLAY: Partial<ModalDisplaySettings> = {
  rxForeground: VINTAGE_INK,
  txForeground: VINTAGE_INK,
  sendingForeground: VINTAGE_INK,
  bufferForeground: VINTAGE_UNSENT_INK,
  rxBackground: VINTAGE_PAPER,
  txBackground: VINTAGE_PAPER,
};

/** The question asked before the full screen turns into Vintage Look. */
export const VINTAGE_CONFIRM = {
  title: 'Start Vintage Look?',
  message: 'The full screen switches to dark ink on aged paper, in the Special Elite typewriter font. '
    + 'Everything else is hidden: no toolbar and no buttons, only the text. '
    + 'The touch keyer, if it is on, stays in place and keeps working, but you will not see it. '
    + 'To leave Vintage Look, press Esc or the Back button. '
    + 'Your own colours and font are not changed and come back when you leave.',
  confirmLabel: 'Start Vintage Look',
  cancelLabel: 'Cancel',
};
