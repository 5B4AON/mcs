/** Single source of truth for the application version displayed in the UI. */
export const APP_VERSION = '2.17.1';

/** Release date of APP_VERSION (YYYY-MM-DD, as in CHANGELOG.md); shown in the "What's new" list. Update it on every version bump. */
export const APP_RELEASE_DATE = '2026-11-14';

/**
 * A very short note (a phrase or one brief sentence; up to three short sentences when several very important changes ship together) about the main user-visible changes in APP_VERSION, shown once
 * after an update in "What's new in vX.X.X" and again from Settings → Other → Application Updates.
 * Rewrite it on every version bump (the owner confirms or edits it).
 */
export const WHATS_NEW = 'A What\'s new list in Settings shows the last important changes, and Reset can now also clear stored e-book data.';

/** One entry of the "What's new" list: a version, its date and a short plain-language note about what a user can notice. */
export interface VersionNote {
  version: string;
  /** Release date, YYYY-MM-DD (the date in CHANGELOG.md) */
  date: string;
  text: string;
}

/** The most entries the list holds, the installed version included */
export const VERSION_HISTORY_MAX = 10;

/**
 * Older versions with a change worth telling, newest first (at most `VERSION_HISTORY_MAX - 1`).
 * Only what a user notices: new or changed features, never fixes, tuning or technical work, and
 * versions with nothing like that are left out. On a version bump the previous version's note
 * (a little longer than `WHATS_NEW`, if it was important enough) goes to the top of this list and
 * the oldest entry drops off the end. Keep each text to about 150 characters (the average length of the list; 160 at most). The owner approves every entry; draft them from CHANGELOG.md.
 */
const EARLIER_VERSION_NOTES: VersionNote[] = [
  { version: '2.17.0', date: '2026-11-14', text: 'Custom text for e-book practice, and an Assist bar that shows the next characters of the book while you key it in Send practice.' },
  { version: '2.16.0', date: '2026-11-13', text: 'E-book practice: load a text, Markdown, web page or EPUB file or a web address, then listen to it or key it, with your place remembered.' },
  { version: '2.15.0', date: '2026-11-10', text: 'A rebuilt CW tone detector for a phone or microphone next to a radio. It finds the tone and the speed by itself and shows a live scope of what it hears.' },
  { version: '2.13.0', date: '2026-11-07', text: 'A new Teach or demonstrate Morse guide in the Setup Wizard: 16 ready-made sessions for different audiences, each with a run sheet and optional rewards.' },
  { version: '2.12.0', date: '2026-11-07', text: 'A Practice sending Morse guide in the Setup Wizard, and an experience level (Novice, Intermediate or Expert) that shows only the guide steps you need.' },
  { version: '2.11.0', date: '2026-11-07', text: 'Send Practice: the app shows characters, words, callsigns or a Koch lesson and you key them with any of your keys, with live marking, accuracy and your speed.' },
  { version: '2.10.0', date: '2026-11-04', text: 'The Koch method in Copy Practice: 40 lessons that add one character at a time, with advice on when to move to the next lesson.' },
  { version: '2.5.0', date: '2026-11-01', text: 'iPhone support: the screen follows the on-screen keyboard, audio resumes after an interruption, and a guide shows how to add the app to the Home Screen.' },
  { version: '2.2.0', date: '2026-10-28', text: 'Lens mode in full screen shows only the latest character, large, with its dots and dashes. Also a choice of full-screen fonts and a screen choice at the end of the guides.' },
];

/** The "What's new" list, newest first: the installed version (always, whatever its weight) and then the earlier notes. */
export const VERSION_HISTORY: VersionNote[] = [
  { version: APP_VERSION, date: APP_RELEASE_DATE, text: WHATS_NEW },
  ...EARLIER_VERSION_NOTES,
].slice(0, VERSION_HISTORY_MAX);
