# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.10.1] - 2026-11-04

### Changed

- **Koch next-lesson suggestion layout** — After a result above 90 %, the new character now sits on its own line ("New character: U") below "Over 90 % — ready for lesson N", so it reads clearly on phones.

## [2.10.0] - 2026-11-04

### Added

- **Koch method in Copy Practice** — A new **Koch method** Content type plays random characters from lessons 1 to N of the 40-lesson Koch order (1 – K, M … 40 – X), chosen with a **Lesson** select placed under Content. The newest lesson's characters come up about 30 % of the time, and at lesson 1 only K and M play. Choosing Koch method sets group size 5 and Count 10 (about a minute at 12 WPM); Koch practice is always Type-along, so the Character pool and Feedback options are hidden (your Feedback choice returns for other content types) and Rounds stays available, with a hint that estimates the round and session length from your speed, Farnsworth settings and lesson. After a result above 90 % (a round, or the average of a session) a suggestion offers **Go to lesson N+1** on the main screen and in full screen; at lesson 40 it says all lessons are complete. The Practice setup wizard offers it too. In practice, `=` is now shown and scored as `=`, not `<BT>`.
- **What's new** — After an update, a dismissable "What's new in vX.X.X" note shows once, and a **What's new** pill next to the installed version in Settings → Other → App Updates opens it again. The text is `WHATS_NEW` in `version.ts`.

### Changed

- **Select boxes line up in each card** — In Settings cards and wizard steps, the labelled select boxes of a card now start at the same left edge, set by the widest label of that card.

### Fixed

- **Long Lesson list closing on release** — In Chrome, clicking in the middle of the 40-item Lesson select and releasing the mouse closed the list; it now opens as a scrollable list below the select (Chromium 135 and later).

## [2.9.4] - 2026-11-04

### Changed

- **Clear menu shows only what can be cleared** — **Input area** appears only when there is typed or pending text, **Output area** only when the main output or the full-screen conversation has text, and **All text areas** only when both have content. The Clear button is disabled when everything is empty, and an open menu closes if the content disappears.
- **Clearing works on both screens at once** — **Input area** now empties the typed text on the main screen and in full screen together (and stops a send or replay in progress), and **Output area** clears the main output and the full-screen conversation together. In full screen, **Input area** is now offered in Key mode too whenever there is input to clear.
- **Send button disabled with nothing to send** — The Start transmitting button on the main screen and in full screen Type mode is dimmed and disabled when there is no text to transmit. It stays enabled while sending (as Stop) and while a replay is paused.
- **Top bar spans the full window** — On wide desktop windows the main-screen top bar now reaches both edges, like the full-screen toolbar; the content below stays at its previous width.

## [2.9.3] - 2026-11-04

### Added

- **Replay button for blurred text** — When text blur is on, a replay button (circular arrow with a play triangle) sits above the eye button on the main screen and in full screen. It plays the last line again (in Copy Practice, the finished sequence) without adding it to the screen again or changing Lens. The replay goes out at the Encoder speed through the same outputs as typed text, with the usual external-send confirmation first. The send button (the practice button in Copy Practice) pauses and resumes it; the replay button becomes a stop square while it plays, and Clear → Input area stops it too. Both blur buttons are disabled while there is no text on screen.
- **Input area in the full-screen Clear menu** — In Type mode the full-screen Clear menu now has **Input area**, which clears the text you typed (or the Type-along answer) and stops a send or replay in progress.

### Changed

- **Clear menu names** — "Input box" is now **Input area** and "This text area" is now **Output area**, on the main screen and in full screen.
- **Lighter Lens effects** — The letter no longer has a filter (its edges are sharper), it fades in without scaling, and the glow around the symbols is made of soft stacked outlines instead of a blur. The look stays close to before while using less processing, which may reduce audio crackle while sending in Lens.
- **Audio status without a background** — On the main screen the "Audio is running" / stopped text keeps its colour but no longer has a coloured box behind it.

### Fixed

- **Reveal icon size on phones** — The eye icon on the main screen is no longer squeezed on touch devices.
- **Pause resumes the whole character** — A character cut short by Pause or Stop is now played again in full on resume instead of being skipped (WinKeyer, MIDI and RTDB still receive it only once). Pressing resume right after pause no longer leaves playback stuck.

## [2.9.2] - 2026-11-03

### Changed

- **Straight-key icon on the main screen** — The icon left of the audio status ("Audio is running") is now the straight-key icon from the Morse Speeds Keyer row, at the same 28 px size.
- **Mode select looks like a pill** — On the main screen, the Mode select now has the pill look of the full-screen Font select, with the flat background of the round buttons beside it. On phones (480 px and below) the row spreads Mode, TX, Clear and Full screen evenly across the width, with Full screen flush right, and the round buttons have more space between them.

### Fixed

- **No blue box when pressing a select** — Pressing the main-screen Mode select or the full-screen Font select no longer flashes the browser's blue tap highlight around it. Keyboard focus still shows an outline.

## [2.9.1] - 2026-11-03

### Added

- **Presets in both kebab menus** — The main-screen and full-screen menus now have a **Presets** button that opens the Presets dialog directly. The menu order is Symbols Ref, Setup Wizard, Presets, Settings, Help (Try Morse stays in the main menu).

## [2.9.0] - 2026-11-03

### Added

- **Morse Speeds in both kebab menus** — The speed controls of the main-screen and full-screen menus now sit under a collapsible **Morse Speeds** pill at the top. It is always collapsed when a menu opens, and in the full-screen menu it and **Styling** open one at a time. **RX** and **TX** show the speed the decoder currently follows (with a dots-and-dashes icon that hints at the adaptive tracking) and a round reset button; their +/− buttons are gone, so start speeds are set in Settings → Other → Morse Speeds. **Encoder** (keyboard icon) and **Keyer** (morse key icon) have round −/+ buttons. All four values line up in one column.
- **Hold to change the font size** — In full-screen Styling, holding the font size − or + button keeps changing the value and speeds up the longer you hold, so ×1.0 to ×10.0 takes about two seconds. The value is saved when you release.

### Changed

- **Styling uses − / + buttons** — The font size and row spacing sliders in the full-screen Styling block are now an icon, a round − button, the value and a round + button, as wide as the pill buttons. Row spacing is a fixed whole-number scale from ×1 (tightest) to ×10 (widest). Saved values are unchanged.
- **Font picker looks like a pill** — The full-screen font selector now matches the menu pill buttons, and the Styling rows no longer hang out past them.

## [2.8.5] - 2026-11-03

### Fixed

- **Pill buttons on the main screen** — **Update now** in the update notice, **Re-enable MIDI**, **Keep screen on** and **Tap for full screen** now look like the shared pill buttons (round, with their own hover) instead of the flat grey button with square corners. The main screen's general button style now skips `.pill-btn` without changing its specificity, so other buttons are unaffected.

## [2.8.4] - 2026-11-03

### Fixed

- **Pill buttons inside Settings cards** — **Check for updates** / **Update now** in the App Updates card, and **Keep screen on** / **Go full screen** in Screen Settings, now look like the shared pill buttons instead of the flat grey card button. The shared card button rules skip `.pill-btn` without changing their specificity, so the round Help "?" buttons are unaffected.

## [2.8.3] - 2026-11-03

### Added

- **Check for updates** — Settings → Other has a new **App Updates** card with the installed version, a status line and a **Check for updates** button, which becomes **Update now** once a new version has been downloaded. The app also checks by itself when it starts, when you come back to it and every 30 minutes, and shows a dismissible notice with **Update now** on the main screen. A new version is never installed without you pressing the button. Reloading to pick up a new release is no longer needed. Help 9.5 explains it.

### Changed

- **Morse Speeds sections open one at a time** — Opening one speed closes the others, and all of them close when the Morse Speeds card collapses.
- **Kebab menus are narrower and steady** — Both menus are now 234 px wide (10% narrower) and keep room for the scrollbar, so the items no longer change width when it appears.
- **Back closes an open kebab menu** — On the main screen and in full screen, the browser or phone Back button now closes an open menu first.
- **Firebase caching** — `firebase.json` now sends `Cache-Control: no-cache` for `index.html`, `ngsw.json`, `ngsw-worker.js` and `manifest.webmanifest`, so a new deploy is noticed straight away.

### Fixed

- **No pull-to-refresh inside dialogs** — Dragging down in Help, Symbols Reference, Settings, the Setup Wizard or full screen no longer reloads the app on Android and desktop browsers.
- **Extra Back presses after a reload** — Reloading the page with a dialog open used to leave history entries behind, so leaving the app took several Back presses. The app now removes them on start-up, and one Back from the main screen exits.
- **Morse Speeds + button alignment** — The + button now sits directly below the Help "?" button in each speed section.

## [2.8.2] - 2026-11-02

### Fixed

- **Help tables wrap normally again** — The 2.8.1 fix for Help scrolling sideways also let table cells break words anywhere, so tables wrapped heavily. Only paragraphs, lists, headings, preformatted text and note boxes break long words now. Table cells wrap at spaces only, and on phones table text is smaller (about 11 px at 360 px wide) so tables fit without wrapping. A table that is still wider than the screen scrolls inside its own box; the Help page still never scrolls sideways.

## [2.8.1] - 2026-11-02

### Added

- **Smooth expand and collapse** — Settings cards, the Morse Speeds sections, the fullscreen menu's Styling block and the setup guide's "More goals" now slide open and closed instead of jumping. Nothing animates when the device is set to reduce motion, and a section toggled mid-slide reverses from where it is.
- **Clear menus fade** — The Clear menus on the main and fullscreen screens fade in and out. The two kebab menus appear and disappear instantly.

### Changed

- **Shorter setup guide names** — "Type text and hear it as Morse" is now "Type and hear Morse", and "Talk to other people over the internet" is now "Talk over the internet" (goal list, guide title and Help).
- **Help "?" buttons stay beside their text** — In Settings cards and setup guides, the "?" no longer drops onto a line of its own on narrow screens. It sits in a fixed column at the right of each hint box with the text centred beside it, and the "?" next to a dropdown lines up with the one above. The setup guide's step title is level with its "?" too, and the mapping editors' hints keep text and "?" on one row.
- **Both kebab menus have the same width** — The main and fullscreen menus are now 260 px wide (or the screen width minus a small margin), and no longer change width when Styling is expanded or the font size slider reaches ×10.0. The fullscreen menu always opens with Styling collapsed.
- **Quieter keep-alive tone** — The inaudible tone that keeps the audio device awake is now at −80 dB instead of −100 dB, because at −100 dB it rounds to silence on a 16-bit output and the device could power down and pop on the next beep. Sidetone latency is unchanged.

### Fixed

- **Loading a preset now switches live inputs and outputs** — Applying a preset that turns MIDI input (or MIDI output, serial, WinKeyer, RTDB, microphone or CW detector) off used to change only the switch while the running input kept working. The preset now starts and stops the running channels the same way Revert does.
- **Help no longer scrolls sideways** — On narrow phones, wide tables, long words and preformatted text could make Help scroll left and right. They now wrap, and Help scrolls only up and down.
- **Possible crackle after a tone** — Released tones now fade to exactly zero instead of an ever-smaller value, which some mobile processors handle slowly and which may cause a short crackle.
- **No blue tap rectangle on buttons** — Pill buttons, dialog buttons, kebab pills, icon buttons and toggles no longer flash the browser's blue tap highlight on touch screens.

## [2.8.0] - 2026-11-01

### Added

- **Trivia cards in Help** — Help has a new "Did you know?" card style with a yellow accent, a lightbulb icon and a short title, so short Morse code stories stand apart from examples and notes. There are 19 cards spread through the chapters, each of 2–4 short sentences: the first long-distance message (1844), the "fist" every operator has, why PARIS measures speed, why E is a single dit, how SOS differs from CQD, callsign prefixes, the Koch method, straight keys, bugs and "iambic" paddles, left- and right-handed keying, why Morse is called CW, Morse by light, sound or touch, QRP low-power operating, the "Victorian Internet", Morse in aircraft navigation beacons, what AR, SK, BT and KN meant, 73, 88 and CQ, American versus International Morse, and the end of SOS at sea. (#115)

### Changed

- **Farnsworth story** — The note about Donald R. "Russ" Farnsworth (W6TTB) in Help 8.5 moved out of the instructions into a trivia card. (#115)

## [2.7.4] - 2026-11-01

### Changed

- **Expanded disabled cards stand out** — In Settings, a disabled card that is expanded now has the same bright border as an enabled card, so you can see where it starts and ends. Its header and content stay dimmed so it still reads as off, and the border goes dark again when you collapse it. (#120)
- **One card open at a time** — Expanding a Settings card collapses the others, and the opened card is scrolled into view if the collapse moved it. Cards opened from the Setup Wizard goal list follow the same rule. (#120)

## [2.7.3] - 2026-11-01

### Changed

- **Shorter card text** — Settings cards and their wizard steps now show one short line instead of paragraphs. Each card starts with a short description and a `?` button that opens the matching Help section. More specific `?` buttons sit beside the field they explain: Firebase channel privacy under the secret, tone and bandwidth, mic wiring and calibration, audio key output wiring, and the RX/TX selectors. The Name and Colour hints use the same wording on every card, and the on/off lines in wizard steps are shorter. Cards without any text, such as Straight Key via Mic and Sidetone, now have a short description. (#114)
- **RX and TX help** — Every "Used for", "Forward" and "Active on" selector has a `?` after it that opens Help 5.1, which now explains what RX and TX mean and why the decoder keeps separate speed memories. The Type wizard's RX/TX step opens the same section. (#114)
- **Help wording** — Help sections 2.2, 5.1, 6.4, 7.1, 8.4–8.8 and 10.2 are reworded in plain language. The audio key output wiring and low-voltage tips moved from the card into Help 7.1, the prosign table into Help 8.6, and the mic wiring into Help 6.4. Help 7.1 no longer says to try DC mode first; most sound cards need AC Tone. (#114)
- **Wizard text** — Step introductions and the preset and review notes in the Setup Wizard are shorter. (#114)

### Removed

- The "Read Firebase Help" text link on the Firebase RTDB cards, replaced by the `?` button.

## [2.7.2] - 2026-11-01

### Added

- **Auto full screen** — A new **Auto full screen** switch puts the whole browser page into full screen (not the app's own full-screen view). Browsers only allow it after a tap or key press, so after a reload the app waits for your first tap or key press, or you can use the **Tap for full screen** prompt on the main screen. If you leave full screen (Esc or a swipe) the app does not pull you back in; it asks again only when the switch is turned off and on, or at the next start. It does nothing in an installed app (already full screen), and on iPhone, which has no browser full screen, the card says "Not available on this device". The setting is off by default and is saved with the profile and in presets. (#113)

### Changed

- **Screen Settings card** — The "Screen Wake Lock" card in Settings → Other is now **Screen Settings**, with no header toggle. It holds two switches, **Keep screen on** (the existing wake lock, same setting and behaviour) and **Auto full screen**, each with one short line, a `?` button that opens Help, and the toggle at the right. The wake lock status and retry button stay, in a shorter form. Help 9.6 is now "Screen Settings". (#113)

## [2.7.1] - 2026-11-01

### Fixed

- **No page scrolling in mobile browsers** — In Chrome on Android (and possibly on iPhone) the page was taller than the visible area while the browser address bar was showing, so the main screen could scroll up and down and the full-screen view could scroll slightly. The page height now follows the visible area, and the page no longer scrolls while the full-screen view is open or while the main screen shows the sprite layout (from 560 px of screen height). Page scrolling stays available when the on-screen keyboard is open and on shorter screens. The installed app and desktop are unchanged. (#112)

## [2.7.0] - 2026-11-01

### Changed

- **Sprite and text box fit the screen** — The key sprite on the main screen no longer needs a fixed 150 px of free space. It takes the room left below the text box, at most as tall as before and at least 100 px, and on a small screen the text box shrinks first (down to a minimum height) to make room. Below 560 px of screen height (including a phone in landscape) the sprite is hidden and the layout is the same as before. (#106)
- **Full-screen text fits its box** — The conversation text now sizes itself from the space it has: it shrinks on small phones, stays at its usual size up to a 1366 × 768 monitor, and grows in proportion on larger monitors, so the largest setting looks the same on a big screen as it did on 1366 × 768. (#106)
- **Row spacing and three visible rows** — Lines in the full-screen view can no longer touch or overlap: the row spacing slider now starts at -0.04 (rows at least 1.07 times the text size apart); saved lower values are shown as -0.04. With very large text the spacing tightens automatically, and the text size is limited if needed, so that at least three lines stay visible above the touch keys (Key mode with the touch keyer on). The empty space below the text no longer grows with the text size, which used to hide the lines at the top at the largest sizes. (#106)
- **No blinking cursor in Key mode** — The full-screen view no longer shows the blinking cursor bar in Key mode, where it appeared as a huge bar at large text sizes while keying with the touch keys. Type mode is unchanged. (#106)
- **Prosign pill height** — In the full-screen view a prosign such as `<BT>` is drawn in a pill as tall as a capital letter of the text, sitting on the same baseline as the letters beside it, with the prosign letters drawn smaller inside so they have a margin. The angle brackets are kept. (#106)
- **Steady text while keying** — In Key mode one row below the text is kept for the dots and dashes being keyed. When the symbols are decoded and the row empties, the text no longer scrolls back up, so the next symbols appear in the same place. That row counts as one of the three visible rows. (#106)
- **Font size slider is a multiplier** — The full-screen font size slider now runs from ×1.0 (the fitted size) to ×10.0 and shows the multiplier instead of pixels. Saved sizes keep their look (the old maximum, 184, is ×7.7); presets and files with sizes up to 240 are accepted, so a file saved with a larger size is rejected by older versions. (#106)
- **Full screen follows the shared viewport** — The full-screen view and the main-screen menus now take their visible height from the shared viewport service instead of their own listeners; the view still stays above the on-screen keyboard. (#106)
- **Build budget** — The per-component stylesheet warning limit is now 40 kB (it was 30 kB). (#106)

## [2.6.0] - 2026-11-01

### Changed

- **Main-screen top bar matches the full-screen bar** — The bar on the main screen now has the same height (48 px minimum), background, bottom border and spacing above and below the buttons as the full-screen bar, and sits flush at the top of the screen. The bar no longer appears to shift or resize when you switch between the main screen and full screen. It uses less vertical space, so the cards and the sprite below move up and the sprite can use the extra room. (#109)
- **Smaller gap under the top bar** — The space between the top bar and the first card on the main screen is half of what it was (also in short landscape). (#109)
- **RTDB status icon** — The RTDB icon in the main bar is the same size as in the full-screen bar (16 px icon, 6 px label), so it no longer looks smaller after switching to full screen. (#109)

## [2.5.0] - 2026-11-01

### Added

- **iPhone support** — The app is now adapted for iPhone, in Chrome (recommended) and Safari. Everything iPhone-specific switches on only when the browser is detected as iOS WebKit, so Android and desktop behave as before. (#94)
  - **Keyboard and screen** — Settings, the Setup Wizard, Presets, Help and all dialogs follow the visible screen, so a tapped field stays above the on-screen keyboard and no empty gap is left when it closes. Content stays clear of the notch and the home bar, also in landscape. The page behind a dialog no longer scrolls, and text fields are at least 16 px so iOS does not zoom when you tap one. (#94)
  - **Keying surfaces** — Long-pressing the key sprite or the fullscreen touch keys no longer opens a copy or selection menu. Text outputs stay selectable. (#94)
  - **Audio** — When iOS pauses audio (a phone call, an app switch, a page refresh) the status line shows **Audio is paused** and the next tap or key press anywhere resumes it; a **Tap to resume audio** button is also shown. On iPhone the app asks iOS to play sound like a media player, which usually avoids the ring/silent switch muting it. The microphone and CW detector now use the real audio sample rate and fall back to the device's own rate if iOS refuses 48 kHz. (#94)
  - **Not available on this device** — MIDI, Serial, WinKeyer and Vibration cards say so, with a reason that names iPhone browsers on iOS. In the Setup Wizard the MIDI keyer choice is disabled when MIDI is unsupported, and the Connect output hardware guide shows a single "Not available on this device" step when none of MIDI, WinKeyer or Serial is supported. (#94)
  - **Install hint** — The Try Morse guide shows a yellow pill when the app is not installed: **Add to Home Screen** on iPhone (opens the steps in Help) and **Use it as an app** on Android (opens Chrome's install dialog, with a **More in Help** link). It never shows in the installed app. The home-screen tags (standalone, name MCS, black status bar) are added on iPhone only. (#94)
  - **Help** — New section 9.7, **Using Morse Code Studio on iPhone**: which browser to use, audio resume, the silent switch, what is unavailable, keyboard and notch behaviour, and screen-on and relay notes. Section 9.2 now says that only Safari can install the full-screen app. The two iPhone audio rows in Troubleshooting point to it. (#94)

### Changed

- **Compatibility notes** — The README and Help compatibility notes now cover Chrome on iPhone, which uses Apple's WebKit and behaves like Safari. (#94)
- **Touch button sizing** — The main coarse-pointer button rule now excludes the shared pill buttons, as the project convention says, so any pill in the main screen uses the shared pill size on touch screens. (#94)
- **Audio recovery** — The audio keep-alives also recover the iOS-only `interrupted` state, and a failed resume no longer raises an unhandled promise error. (#94)

## [2.4.0] - 2026-10-31

### Added

- **Same menu in both kebab menus** — The main menu and the full-screen menu now both offer Symbols Ref, **Settings**, **Setup Wizard** and Help (the main menu also has Try Morse; the full-screen menu has Lens and a collapsible **Styling** section that starts collapsed each time). Settings and the Setup Wizard open above the full screen and return to it when closed. The Settings gear in the header, the wand in Settings and the gear in the wizard goal list are gone. (#104)
- **Back button closes popups one at a time** — In Settings, the browser Back button now closes the popup on top first: mapping editors, the emoji editor and picker, Reset, Revert and result dialogs, scan results, notices, and Presets (which first steps out of a menu or a review, also when opened from the wizard goal list). (#104)
- **Delete from the list, with confirmation** — Every mapping list (keyboard, MIDI, serial and emoji) has a delete button beside Edit that asks before deleting and names the mapping. The Delete button is removed from the edit popups and from the wizard's mapping page. (#104)
- **Help for MIDI notes** — A **?** button beside the note, octave and number fields of the MIDI editors opens a new Help section that explains how note names, octaves and the 0–127 number relate. (#104)

### Changed

- **Compact, scrollable kebab menus** — Less space between the speed controls and the buttons, and the menu uses all the height below its button. A scrollbar is always visible with a shaded edge where there is more to see. Tapping anywhere outside, including the sprite key, closes the menu. (#104)
- **Short mapping rows** — Rows now read `Straight 76` or `Paddle 82|84` (and `Z|X`, `DSR|CTS`). Device, channel and port are in the editor, and the wizard Review still shows them. Wizard mapping lists have taller rows and larger buttons. (#104)
- **Revert and Save follow the real state** — Putting a setting back by hand disables Revert and Save again. (#104)
- **Speed reset button** — The reset button beside the RX and TX speed returns the speed to 12 WPM and saves it. (#104)
- **Lens** — The character is 5% larger and sits closer to its symbols, the prosign bar is drawn right above the letters, and the user name keeps the same size. (#104)
- **Preset review** — The hardware and relay acknowledgement checkboxes are shown above the list of changes. (#104)
- **Presets icon** — A folder icon replaces the double arrows. (#104)
- **Wizard Escape** — Escape (and Back) on a mapping's page returns to the mapping list and asks to discard only if you changed something. (#104)
- **Dialog buttons on narrow screens** — Cancel and OK stay side by side down to 320 px; the wizard prompt reads **Stay** / **Discard**. (#104)

### Fixed

- **Straight-key sprite** — Only the key itself presses the key, not the empty sides of the image. (#104)
- **Escape in mapping editors** — Escape now closes a Settings mapping popup. (#104)
- **Help buttons** — The Help close and Help Home buttons no longer touch the desktop scrollbar. (#104)

## [2.3.0] - 2026-10-30

### Changed

- **Bundled fullscreen fonts** — The fullscreen view now offers four fonts that are built into the app and look the same on Android, iOS, Windows, macOS and Linux: **Typewriter** (Courier Prime), **Classic** (Merriweather), **Readable** (Atkinson Hyperlegible) and **Cockpit** (B612 Mono). Each font is downloaded from the app itself the first time it is used and then works offline. The former Arial-style option is removed; a saved setting that used it falls back to Typewriter. (#93)

## [2.2.6] - 2026-10-30

### Fixed

- **Screen wake lock is reacquired automatically** — With Screen Wake Lock enabled, the lock is now requested as soon as your saved settings load, so it is active after you close and reopen the app. It is re-checked whenever you return to the app and every 10 seconds, and requested again if the browser dropped it. The browser releasing the lock no longer switches the setting off. (#101)

### Added

- **Wake lock warning** — If the browser refuses the request, an amber banner on the main screen shows the reason and a **Keep screen on** button to try again. The Screen Wake Lock card shows the same status and button. (#101)

## [2.2.5] - 2026-10-30

### Added

- **Revert in Settings** — A **Revert** button beside **Save** at the bottom of Settings (greyed out when there is nothing to go back to) discards unsaved changes after a confirmation and restores the settings last saved for this device. The confirmation names any keying or relay route it would switch back on. Running RTDB, MIDI, serial, WinKeyer, microphone, CW detector and wake-lock states are brought in line with the restored settings. (#99)
- **Export file name** — Exporting a preset now shows the generated file name first so you can change it; nothing downloads until you press **Save**. (#99)
- **Re-enable MIDI button** — The notice shown when MIDI could not be restarted after a page refresh now has a **Re-enable MIDI** button. (#99)

### Changed

- **Same pill buttons in every dialog** — Dialog buttons (Presets, confirmations, scan results, emoji and mapping editors, Settings footer) share one pill style, with a red-tinted pill for destructive actions. Preset labels are simpler: **Back** and **Apply** in the review, **Save** for name forms, **Load** when importing, and **Cancel** instead of "Keep". (#99)
- **Save button** — "Save Settings" is now **Save** and, like Revert, keeps a fixed width; it is green only while there are unsaved changes. (#99)
- **MIDI after a refresh** — If the browser has already granted MIDI access, MIDI that was on starts again automatically after a page refresh. (#99)
- **Closing a preset review** — Closing the review (X, Escape or clicking outside) returns to the presets list instead of closing the dialog. (#99)

### Removed

- **"Active now, not saved" banner** — The banner at the top of Settings, which moved the layout, is gone; the Save and Revert buttons show the unsaved state instead. The "New device profile" banner stays. (#99)

## [2.2.4] - 2026-10-30

### Changed

- **Settings are defined where they belong** — Each settings item now owns its settings, defaults, allowed values and mapping types in its own model file, instead of one large settings service. Behaviour is unchanged: the defaults are identical and presets and settings files keep the same format. The settings service now only composes them and holds the common settings (speeds, paddle mode, fullscreen display, wake lock). (#97)
- **Preset and settings-file checks come from the items** — Every setting except the Firebase channel secrets is now included in presets and settings files automatically, and its allowed values are checked from the item that owns it. The snapshot files were renamed from "transfer" to "snapshot" and the Presets dialog code was renamed to match. (#97)

### Fixed

- **Invalid sprite key source in a preset** — Importing a preset or settings file whose sprite key source is not RX or TX is now rejected, like the other choice fields. (#97)

### Removed

- **Old settings migrations** — Profiles saved by much older versions are no longer converted. Settings missing from a saved profile or preset take their default value, and old mapping data from before the multi-mapping settings may be replaced by the defaults. (#97)

## [2.2.3] - 2026-10-29

### Fixed

- **Lens keeps the previous character while you key the next** — In Lens mode a keyed character no longer disappears as soon as you start the next one. It stays on screen, fading gradually (to 5% over 70% of an average letter at your speed), while the new symbols appear below it, and the new character replaces it once decoded. The same happens when the previous character was typed or received. With reduced motion the faded character is shown at a fixed 40% opacity. (#95)

## [2.2.2] - 2026-10-28

### Fixed

- **No Farnsworth question when practising sending** — The "Practice sending Morse" guide no longer asks about Farnsworth timing. Farnsworth only stretches gaps the app generates (the keyboard encoder and played-back received or relayed Morse), never the timing of a straight key or paddle, so the page changed nothing. The keyer speed page still appears when a paddle is set up. The Help chapter on Farnsworth now says keyers are not affected. (#91)

## [2.2.1] - 2026-10-28

### Removed

- **Swipe to change Settings tab** — Dragging left or right in Settings no longer switches tabs on touch devices, so moving a slider can no longer jump you to another tab. Tap a tab, or use the Arrow, Home and End keys, to change tab.

## [2.2.0] - 2026-10-28

### Added

- **Lens mode** — A new Lens switch in the fullscreen menu turns the whole fullscreen view into a teaching aid. It shows only the latest character, large and centred, with its dots and dashes in large symbols underneath. It works in Key and Type mode and for RX and TX, uses the RX/TX or input colours, and shows the input name at the top left. Keyed characters show their symbols first and the letter once it is decoded; typed characters follow the sound as they are played; received Firebase RTDB characters show with the sender's name. The view fits the window and the space left above a phone keyboard.
- **Fullscreen font picker** — Choose Typewriter (Courier, the default), Classic (Times), Clean (Arial), Wide (Verdana) or Code (Consolas) in the fullscreen menu. It applies to the whole fullscreen view.
- **Choose your screen** — The "Type text and hear it as Morse" and "Practice sending Morse" guides end with a step to stay on the main screen, use the full screen, or use the full screen with Lens. Choosing the full screen or Lens opens it (in Type or Key mode) when the guide is applied.
- **Send mode in the Type guide** — The Type guide starts with a page for Send on Enter or Live, followed by a Keyboard encoder page.

### Changed

- **Fullscreen choices are remembered and in presets** — Key/Type, Lens, the font, font size, bold, row spacing and all fullscreen colours are saved with your settings (defaults: Key, Lens off, Typewriter) and are part of Presets and settings files. Older presets keep working with the defaults, and earlier display settings are carried over.
- **Dialog dim areas** — A text-selection drag that starts in a dialog and ends on the dim area no longer closes the dialog (Settings, Presets, Emoji, Mapping, Goals, Setup Wizard and Confirm dialogs).
- **Help** — New Lens mode section (Decoder chapter) and updated notes for the fullscreen font, remembered choices, the wizard screen step and the send mode.

### Fixed

- **Mapped keys after closing fullscreen** — Mapped keyboard keys are handed back to the main screen however fullscreen is closed (Back or Escape as well as Close), instead of staying off after leaving Type mode.

## [2.1.1] - 2026-10-28

### Added

- **Encoder speed in fullscreen** — The fullscreen kebab menu has an Encoder speed control (always present, in Key and Type mode), and the toolbar shows an Encoder indicator next to RX, TX and Keyer.
- **Slider with + and − buttons** — Farnsworth effective WPM and gap multiplier (whole numbers 1 to 10), and sidetone and audio key amplitude (0 to 100% in steps of 5), now look and work like the Morse speeds, with the value and explanation above the slider.
- **Delete on the wizard mapping summary** — Each row has an Edit and a Delete button. Delete only changes the guide's draft; Revert brings it back and nothing changes until Apply.

### Changed

- **Practice sending wizard** — Keyer speed and Farnsworth come after the keyer steps and only appear when a paddle is configured; their text says they apply to automatic paddle keying only.
- **Wizard mappings** — Keyboard, MIDI and serial mappings show one summary page; Edit and Add open a mapping, and Next or Back return to the summary.
- **Wizard buttons** — Revert and Apply are always visible and disabled when they do not apply, so buttons no longer shift. Disabled buttons are darker and more muted.
- **Copy practice feedback** — Options are listed Type-along, Blurred, Listen only, and Type-along is the default for new settings.
- **Farnsworth "Applies to"** — Options are listed Both RX and TX, RX Only, TX Only, and Both is the default for new settings.
- **Wordsworth gap multiplier** — Multiplies the standard 7-dit word gap by 1 to 4 in steps of 0.5; character gaps are unchanged.
- **Test Output buttons** — The sidetone and audio key tests are pill buttons.
- **Keyboard encoder** — Spaces at the start of a message are ignored, repeated spaces collapse to one, and trailing spaces are trimmed when sending in Enter mode (main screen and fullscreen Type mode).
- **Help** — Removed the Teach material and updated the Farnsworth, amplitude and practice feedback text.

### Fixed

- **Speed buttons on phones** — The − and + buttons are round again instead of stretched.
- **Fullscreen Type mode** — Typed text no longer jumps when its first letter is played on a new line.
- **Keyer speed text** — Removed an incorrect sentence about the TX decoder following a straight key.

## [2.1.0] - 2026-10-28

### Added

- **One Setup Wizard, rebuilt** — Every goal's guide now uses the same settings controls as Settings, so colour pickers, Detect for keyboard and MIDI keys, and per-mapping pages (with Add and Delete) work the same in both places. Each guide is declared as a flow of steps, which makes new guides easier to add.
- **Speed and Farnsworth in every sending goal** — Goals that send Morse ask for the speed first, then optional Farnsworth timing, with the same wording everywhere.
- **Sound step in every goal that plays Morse** — Type, Send, MIDI, Practice, Relay and Hardware end with the same "Hear the Morse" sidetone step. Decode only listens and has none.
- **Help from every step** — Wizard steps show a "?" button that opens the matching Help section on top of the wizard; closing Help returns to the same step.
- **Revert on every step** — Revert appears whenever something on a step changes and restores only that step.

### Changed

- **Teach goal** — The guided Teach setup is being redesigned. For now the goal shows a "Work in progress" step and changes nothing; classroom inputs can still be set up in Settings.
- **Browser Back with Help open** — Back now closes Help first when it is open over the wizard or Settings.
- **Smaller app** — The old wizard code was removed, cutting the app's main script from about 1.59 MB to 1.40 MB.

### Removed

- The temporary "Setup wizard (new, temporary)" menu entry; the regular Setup Wizard entry opens the new wizard.

## [2.0.1] - 2026-10-25

### Fixed

- **Presets dialog** — The Save and Import buttons are narrower, so they sit side by side on phones.
- **Phone dialogs** — The Setup Wizard goals list and the wizard steps open as inset, rounded dialogs like Presets instead of full-screen.
- **Wizard Revert** — Every step with answers now shows Revert when something on that step changes, and it restores only that step. This includes the decode, MIDI, relay, hardware and teach wizards. In the decode wizard, Revert also turns back on any audio output the wizard switched off, until the detector is on.
- **On-screen keyboard** — Pressing the sprite key, or keying from a non-keyboard input, removes focus from the main text box so the phone keyboard no longer pops up.
- **Closing the goals list** — Closing the Setup Wizard goals list no longer moves focus to the main text box.

## [2.0.0] - 2026-10-25

### Added

- **UX revamp complete** — Made it easier to start Morse, configure and save
  setups, and move from beginner tasks to advanced tools:
  - Safe first-use audio, an interactive Morse example, and clear live-versus-saved settings.
  - Named presets that can be saved, transferred, reviewed, and applied; wizards can load or save presets without conflating drafts and live settings.
  - Clearer practice and goal-based Settings discovery, with accessible keyboard, touch, and assistive-technology controls.
  - One fullscreen RX/TX conversation with explicit Key/Type input, plus guided setup for decoding, teaching, hardware, and relay.
  - Clear relay privacy information and safer review of output targets before enabling routes.

## [1.17.0] - 2026-10-24

### Added

- **Guided hardware and relay setup (WP10)** — Every goal opens its own
  draft-and-review wizard directly. The sending, MIDI input, online relay, and
  hardware wizards include the relevant keyer and mapping controls without
  leaving for Settings or Help. Relay secrets stay hidden from review; exact
  output targets and route changes are checked before Apply, with a separate
  explicit action required to enable a new hardware route.
- The output-route change checker is shared by wizard review and settings
  import, including target availability, routing changes, and acknowledgements.

### Changed

- Removed wizard Settings/Help navigation actions, kept the shared discard
  confirmation and keyboard focus behavior, and made the final route actions
  explicit.
- Presets keeps visible rounded boundaries on mobile, and the Settings Save
  button is width-capped on mobile.
- The practice-mode play control no longer shows adjacent text, and wizards no
  longer repeat the header close action with a footer Cancel button.

## [1.16.0] - 2026-10-24

### Added

- **Teach or demonstrate Morse (WP09)** — A new classroom guide in the Setup
  Wizard (graduation-cap goal). Pick any of: take turns sending, copy practice,
  and students joining from phones over a shared RTDB channel. It asks for up
  to four local students plus the teacher, which input devices you have, and a
  name, emoji and colour for each person, with MIDI device choice and "Detect
  key". It also covers Farnsworth timing, prosign display and actions, emojis
  and text blurring, each with its reasoning, then offers an optional preset
  and an explicit Apply. Radio paths (WinKeyer, radio keying, audio decoding)
  and the experimental pilot tone are not offered. Group scoring is not
  included.
- Wizards with nothing to apply show a Start button under the text (start
  typing, practicing, sending or decoding) that returns to the main screen;
  copy practice also selects Practice mode and focuses the input. "Try without
  saving" does the same.
- A wizard button in the Settings toolbar, and a Settings button in the Setup
  Wizard, switch between the two windows.

### Changed

- The Setup Wizard is now its own window, the same size as Settings, instead
  of a panel above the Settings tabs. Main goals are always visible; only
  "More goals" expands. Goals have one action and no longer show an arrow.
  Presets can be opened from the wizard window.
- The Settings Save button is now a rounded pill like the other buttons.
- Try Morse pills are narrower and have no icons.
- MIDI input device listing reports unsupported browsers and denied access.

## [1.15.0] - 2026-10-24

### Added

- **Setup Wizard (WP08)** — "Set up by goal" is now the **Setup Wizard**, with a
  magic-wand pill in the main menu and the Try Morse box. Three goals open a
  step-by-step guide directly: type text and hear it as Morse, copy practice,
  and decode Morse from sound. Each guide keeps a draft, lets you go back or
  skip a step, shows exactly what would change, and applies only what you
  confirm. Typing and practice include Farnsworth timing. The decode guide can
  turn audio output off and turn the detector on from its own buttons, never
  starts audio or asks for the microphone, and warns about feedback loops.
  The last screen offers "Try without saving" and "Open settings".

### Changed

- The goal list uses a larger icon per goal, scrolls inside its panel, and
  "More goals" is a row that is replaced by its goals. Other goals show their
  hint in a dismissible dialog instead of a yellow line under the list.
- The decode goal is now called "Decode Morse from sound", and the MIDI paddle
  or key goal moved to More goals.
- Icons on the main and fullscreen menu pills and on the Try Morse buttons;
  the Try Morse text is shorter and Escape closes it.

## [1.14.0] - 2026-10-24

### Added

- **Set up by goal (WP07)** — A collapsible "Set up by goal" entry above the
  Settings tabs lists what people want to do (practice sending, type text,
  copy practice, paddle through MIDI, talk over the internet, plus more goals
  for radio/hardware and audio decoding). Choosing a goal switches to the
  right tab, collapses the other cards and opens the matching card with a
  short yellow hint and, where useful, a "Next" link. It only navigates and
  never changes settings or starts audio. Each tab also shows a one-sentence
  description, and the Help chapter on inputs explains the feature.

### Changed

- **Sidetone defaults and stereo** — The sidetone now defaults to 650 Hz at
  amplitude 1 on both stereo channels (Key Output and Pilot are off by default,
  so nothing overlaps). The Channel setting gains a "Both (stereo)" option; when Both is
  chosen and Key Output or the Pilot tone uses a channel on the same device,
  the existing channel-conflict warning explains which channel overlaps.
- **RTDB required fields stay visible** — In the Firebase RTDB input and
  output cards, empty required fields (channel name, secret, sender name) are no
  longer dimmed while the channel is disabled, so it is clear what to fill in
  before enabling it.
- The settings edit modals and the emoji picker now live under
  `components/settings-modal/`.

## [1.13.0] - 2026-10-24

### Changed

- **Single full-screen conversation (WP13)** — The separate full-screen
  Decoder and Encoder views are merged into one persistent conversation that
  opens directly from the ⛶ button. A Key/Type toggle beside Close switches
  between mapped-key keying and inline typing without changing saved settings.
  Type mode focuses the conversation immediately (raising the on-screen
  keyboard on phones), with Tab cycling conversation, play/transmit button,
  toolbar.
- **Practice in full screen** — Practice runs in Type mode; the brief, results
  and Type-Along text appear at the top of the conversation with typing under
  the challenge characters. Switching to Key stops practice and removes blur.
  Clear actions now remove the practice brief and results.
- **Practice on the main screen** — Keyboard keyer, mouse keyer and the
  straight-key sprite are disabled while Practice is selected; only typing is
  accepted.

### Fixed

- **Presets saved before v1.12.0** are loaded again (missing newer settings
  get defaults) instead of being reported as damaged, and a recovery option
  can download or remove unreadable preset data.

## [1.12.0] - 2026-10-23

### Added

- **Practice discovery and guidance** — The encoder mode now uses the concise
  **Practice** label and explains the configured content, feedback style,
  available action, and eligible Full-pipeline external routes without starting
  playback when selected.
- **Type-Along Rounds** — Type-Along practice can now run 2–5 transient rounds.
  A pre-session briefing explains the exercise, each round retains its
  existing feedback, and a final summary lists every round percentage and the
  average. Results are not saved.

### Changed

- **Practice explanation and Help** — Settings and Help now explain why
  typing is unavailable in Listen and Blurred modes, clarify Local versus Full
  output routing and Practice Direction, and document the full multi-round
  Type-Along flow.

## [1.11.0] - 2026-10-23

### Added

- **Keyboard and Screen-Reader Access** — Every dialog (Settings, Presets,
  Help, Symbols Reference, fullscreen views, mapping editors, emoji editor and
  picker, confirmations) now moves focus inside when opened, keeps Tab within
  it, and returns focus to the control that opened it.
- **Escape closes views** — Escape closes the top dialog and any open Clear,
  Fullscreen or menu popup. In the fullscreen Encoder, Escape first stops an
  active transmission; pressing it again closes the view.
- **Keyboard Settings navigation** — Settings tabs work with Left/Right,
  Home and End. Each card heading is a real button announcing expanded or
  collapsed, separate from its enable switch, which now shows a visible focus
  outline.
- **Fullscreen touch keyer by keyboard** — Hold Space or Enter to key; release
  to stop.
- Descriptive names for icon-only buttons and a visible focus outline across
  the app.

### Changed

- Opening the Clear, Fullscreen or main menu now closes the other two.
- Help documents Escape and the keyboard keyer.

## [1.10.0] - 2026-10-22

### Added

- **Relay Privacy Notices** — The Firebase RTDB Input and Output cards in
  Settings now show a short notice when expanded: the channel name and secret
  together form a database path, not protected credentials; the secret is only
  hidden on screen and may be saved in this browser; and sensitive credentials
  or content should not be used. A link opens the Firebase Help chapter
  directly.
- **Contextual Help Links** — Help can now open at a requested section, so
  other parts of the app can link straight to the relevant chapter.

### Changed

- **Firebase Help** — Chapter 10 no longer describes the channel secret as
  access control. It explains the public browser client, the repository's
  example rules (not verified production rules), on-screen masking and browser
  storage, and that the app does not clean up stored data.
- **README** — The relay description is corrected and developer guidance for
  database rules, validation, quotas, rate limits and old-data cleanup is
  added.

## [1.9.1] - 2026-10-21

### Fixed

- **Clear All Text Areas** — "All text areas" in the main page clear menu now
  also empties the input box in every encoder mode, not only in practice mode.
- **Presets Dialog Buttons** — The close and actions buttons are true 40 px
  circles on touch devices and match the Settings and main page icon buttons.

### Changed

- **Presets Dialog Layout** — The dialog uses the same size as Settings
  (full screen on small phones), the redundant bottom Close button is removed,
  and "Save current setup" and "Import preset file" use the pill style of the
  main page menu, centered and wrapping when space is short.
- **Preset Review** — The dialog title shows the preset name, setting names
  and group titles are colour-coded, and only changed parts of structured
  settings are listed, in collapsible Before and After sections. Simple values
  show Before and After on one line. Saved preset names are highlighted, and
  the delete confirmation no longer repeats the name.

## [1.9.0] - 2026-10-20

### Added

- **Named Presets** — A new Presets dialog in Settings saves the current setup
  under a name (up to 40 characters, case-insensitive), and lets you update a
  preset with the current settings, rename, duplicate, delete, and export it.
  Presets are stored separately from automatic device profiles.
- **Preset File Export and Import** — Presets export to a versioned local JSON
  file that never includes RTDB channel secrets. Importing a file only adds a
  preset; it never changes live settings.
- **Reviewed Apply** — Applying a preset shows a grouped before-and-after
  review, requires separate acknowledgement of each newly enabled or redirected
  hardware or relay route, keeps this browser's RTDB secrets, leaves
  unverifiable device targets unchanged, and does not save the device profile.
  A preset identical to the current setup reports that there is nothing to apply.

### Changed

- **Help** — Configuration chapter now explains presets, file transfer, and
  secret handling.

## [1.8.6] - 2026-10-19

### Changed

- **Settings Save Status** — Settings now distinguishes active, unsaved changes
  from settings saved for the current device profile. Missing profiles and
  browser storage failures are reported without appearing as successful saves.

## [1.8.5] - 2026-10-19

### Added

- **Try Morse First-Use Guide** — Added a dismissible, reopenable guide with a
  safe `CQ TEST` example, external-output confirmation, and clearer audio
  playback guidance. Loading the example selects Send on Enter; the guide is
  available from the top-right menu and hides the Straight-Key Sprite while
  open.

## [1.8.4] - 2026-10-19

### Changed

- **Keyboard Keyer Default** — The keyboard keyer is now enabled by default
  only on non-touch devices.
- **Default Keyboard Mappings** — Removed the default Left/Right Control
  paddle mapping.
- **Farnsworth Default** — Farnsworth timing now applies to received (RX)
  characters by default.
- **Default Prosign Actions** — `<AR>` now clears the screen and `<BK>` starts
  a new paragraph.
- **Audio Status Text** — The stopped-audio message now reads "Audio is
  stopped. Start Audio to begin."

## [1.8.3] - 2026-10-18

### Added

- **Audio Startup Status and Recovery** — The main screen now shows whether
  audio is stopped, starting, running, or failed, with recovery guidance and
  retry cleanup when audio cannot be fully stopped. Microphone permission
  guidance is shown only when microphone or CW input is enabled.

## [1.8.2] - 2026-03-22

### Changed

- **Copy Practice — Local Pipeline Includes Vibration** — The local practice
  pipeline now drives vibration output alongside audio. The pipeline option
  label is renamed from "Local audio only" to "Local audio and vibration".
  Serial, MIDI, and RTDB outputs remain excluded in local mode.
- **Copy Practice — Disabled Textarea Styling** — In Listen Only and Blurred
  feedback modes the encoder input area on the main screen now appears as a
  flat label (no border, box-shadow, or background) instead of a text area,
  discouraging users from trying to click and type in it.
- **Copy Practice — Help Documentation Revised** — Rewrote section 3.5 to
  accurately describe each feedback mode: Listen Only and Blurred provide no
  typed input or scoring (copy by ear only); Type-Along is the only mode with
  real-time typing and per-character LCS scoring via the validate button.
  Fixed incorrect references to "hidden" text (now correctly described as
  blurred), removed false claims about typing and scoring in Listen Only and
  Blurred modes, and updated examples to match actual behaviour.

## [1.8.1] - 2026-03-22

### Fixed

- **MIDI Keyer Stuck Keys on Mobile** — Fixed the iambic keyer getting stuck
  in a repeating dit or dah (or continuous tone) when using MIDI paddle input
  at speeds above ~20 WPM on slower hardware such as mobile phones. Five
  contributing issues were identified and fixed:
  - **Keyer loops run outside Angular zone** — `setTimeout` scheduling in all
    three keyer services (MIDI, keyboard, serial) now runs outside Angular's
    zone via `runOutsideAngular()`, eliminating two full change-detection
    cycles per element. On mobile, this reclaims 20–30 ms of timer budget
    per dit/dah that was previously consumed by change detection.
  - **MIDI stuck-key watchdog** — A watchdog now force-releases any MIDI
    paddle held for more than 5 seconds (physically impossible during normal
    keying). The existing keep-alive timer also scans for stale straight-key
    `activeNotes` entries. This recovers from lost MIDI note-off messages
    caused by USB-OTG flakiness or browser throttling.
  - **Keep-alive handler race guard** — The MIDI keep-alive timer's
    `attachListeners()` call now uses a generation counter so that a stale
    `open().catch()` rejection from a previous cycle cannot null-out a
    freshly attached message handler.
  - **`isSending` note-on/note-off asymmetry** — When a MIDI note-on is
    suppressed by the `isSending` echo gate, the note is now still tracked
    in `activeNotes` (with a `suppressed` flag) so the matching note-off
    correctly cleans up without leaving paddle state stuck.
  - **Per-mapping paddle mode for MIDI keyer** — The MIDI iambic keyer now
    reads the paddle mode from the per-mapping state instead of the global
    setting, matching the keyboard and serial keyer behaviour.

## [1.8.0] - 2026-03-18

### Added

- **Copy Practice Mode** — new encoder mode (`Copy Practice`) for self-study. The
  encoder generates a random sequence, plays it as Morse audio, and the user
  types what they hear. After the round, an LCS-based fuzzy alignment scores
  each character as correct, incorrect, or missed and displays per-character
  colour-coded feedback with an accuracy percentage.
- **Three Content Modes** — random characters (configurable pool of letters,
  digits, and/or punctuation), common words (filterable by length: 3, 4, 5
  letters), and realistic callsigns (built from an international prefix
  database).
- **Three Feedback Modes** — Listen Only (hear first, then type), Blurred
  Reveal (reference text is shown blurred until the round finishes), and
  Type-Along (type in real time as the Morse plays).
- **Pipeline Selector** — Local (audio-only playback, skipping serial, MIDI,
  RTDB, and vibration outputs) or Full (characters flow through all enabled
  outputs just like normal encoder mode).
- **Practice Settings Card** — new card under Settings → Other with controls
  for content mode, group count (1–10), character group size (1–5), character
  pool toggles, word length filter, feedback mode, pipeline, source
  assignment, and optional display name/colour.
- **Fullscreen Practice UI** — the fullscreen encoder view renders a dedicated
  practice panel with reference text, user input field, Start / Pause /
  Resume / Next Round controls, and colour-coded per-character feedback.
- **Practice Service** (`practice.service.ts`) — singleton service managing
  sequence generation, playback state machine, character push from encoder,
  and user-input scoring.
- **Practice Data Files** — `data/practice-words.ts` (common English words)
  and `data/callsign-prefixes.ts` (international callsign prefix database)
  provide content for the words and callsigns practice modes.

### Documentation

- **Help §3.5 — Copy Practice** — New section in the Encoder chapter
  explaining all content modes, feedback modes, pipeline options, settings,
  and fullscreen UI controls with beginner and contest practice examples.
- **README** — Updated feature list to mention Copy Practice mode.

## [1.7.0] - 2026-03-16

### Added

- **Farnsworth Timing** — New setting under Settings → Other that stretches
  the gaps between characters and words while keeping element durations
  (dit/dah) at full speed. Named after Donald R. "Russ" Farnsworth (W6TTB),
  this proven learning technique lowers the effective WPM without slowing
  individual characters.
- **Wordsworth Mode** — Optional variation that stretches only the gaps
  between words, keeping inter-character spacing at the normal character
  speed. Useful for operators who recognise characters instantly but need
  extra time to process whole words.
- **Two Input Modes** — Choose between *Effective WPM* (set a target overall
  speed from 5 WPM up to the encoder WPM) or *Gap Multiplier* (multiply gap
  durations by 1.00× to 10.00×).
- **Applies To** selector — TX Only, RX Only, or Both. TX affects the
  encoder and all keyed outputs (sidetone, serial, MIDI, vibration). RX
  affects local playback of received characters (e.g. from Firebase RTDB).
- **Affected Outputs** — Sidetone, optocoupler, serial DTR/RTS, MIDI note
  output, and vibration. WinKeyer is excluded (hardware-timed).

### Documentation

- **Help §8.5 — Farnsworth / Wordsworth Timing** — New section explaining
  both timing techniques, all controls, affected outputs, and a beginner
  practice example. Subsequent sections renumbered (§8.5–8.7 → §8.6–8.8).

## [1.6.4] - 2026-03-16

### Changed

- **MIDI Output Same-Note Warning** — The MIDI Output edit modal no longer
  blocks saving when dit and dah paddle notes are set to the same value. The
  hard error has been replaced with a non-blocking warning. This allows
  paddle mode with identical notes to emulate a straight-key output through
  the character-based queue — useful for speed re-encoding via the WPM
  override option.

### Fixed

- **MIDI Output Queue Interruption** — Fixed character playback at a slower
  WPM being cut short when the real-time `keyUp()` path released notes held
  by the character queue. The real-time straight-key path (keyDown/keyUp) and
  the character-based queue now track their active notes independently, so
  releasing a physical key no longer aborts a queue element mid-playback.

### Documentation

- **Help §7.4 — Speed Re-Encoding** — New "Speed Re-Encoding (WPM Override)"
  section in the MIDI Output chapter. Describes using paddle mode with same
  or different notes combined with "Override input WPM with local encoder
  WPM" to re-encode incoming morse at a different speed — e.g. keying at
  25 WPM while the MIDI output replays at 12 WPM for slower listeners.

## [1.6.3] - 2026-03-15

### Fixed

- **MIDI Detect When Disabled** — The "Detect" button now acquires MIDI
  access automatically, so it works even when the MIDI Input card is off.
- **MIDI First Note Lost** — Fixed the first MIDI note being silently dropped
  after adding a new mapping, caused by a race between async port opening and
  handler attachment.
- **MIDI Detect With No Mappings** — Detection now works when no MIDI input
  mappings exist yet. Previously all port listeners were removed when the
  mapping list was empty.
- **MIDI Echo Suppression Too Broad** — The per-mapping echo gate exited the
  entire handler instead of skipping to the next mapping, blocking all
  mappings when the first one was muted.
- **Old Profiles Crash on Relay Fields** — Profiles saved before relay
  support could crash on missing `relayInputIndices`. Added migration
  backfill and defensive checks.

## [1.6.2] - 2026-03-15

### Fixed

- **Text Blur Scales with Font Size** — The fullscreen text-blur training
  mode now uses a font-relative blur radius (`0.2em`) instead of a fixed
  `5px`, so blurred text remains illegible even at the maximum 184 px font
  size. A `brightness(1.5)` filter is also applied so the blurred text glows
  rather than dissolving into the dark background.
- **Input Card Name Colour** — Serial Input and MIDI Input card headers now
  show the mapping name in the correct RX/TX foreground colour from the
  fullscreen modal display settings (green for RX, amber for TX by default).
  A per-mapping custom colour still takes priority when set.
- **Fullscreen Auto-Scroll** — The fullscreen decoder and encoder views now
  always scroll to the bottom when new characters arrive, fixing an issue
  where auto-scroll would stop permanently after smooth-scroll animation lag
  caused the distance-from-bottom threshold to be exceeded.
- **MIDI Auto-Detect Channel** — The "Detect" button in the MIDI Input edit
  modal now always updates the channel dropdown to the detected MIDI channel,
  even when a specific channel was already selected. The note hint text below
  each note field now includes the channel as a prefix (e.g. "Ch 3 / C4 (60)").

## [1.6.1] - 2026-03-15

### Added

- **Per-Mapping Input Relay** — MIDI and Serial output mappings now have a
  "Relay from…" multi-select in their edit modal, letting you choose exactly
  which input mappings are forwarded through each output. Only input mappings
  whose source matches the output's forward direction (RX/TX) are shown,
  giving fine-grained control to prevent feedback loops while still allowing
  deliberate relay between separate hardware paths.
- **RTDB Input Relay** — New "Allow input relay" checkbox on the RTDB Output
  card. When enabled, characters received from the RTDB channel are relayed
  back out (useful for multi-site bridging). Automatically disabled when the
  RTDB input and output share the same channel and secret to prevent echo.
- **Suppress Other Inputs** — New per-mapping checkbox (MIDI Output, Serial
  Output, and RTDB Output) that appears when relay sources are selected.
  When enabled, the output only forwards signals from the explicitly chosen
  relay sources — all other input paths are suppressed.

### Fixed

- **MIDI/Serial Feedback Loop Prevention** — The three anti-echo layers
  (input-service muting, decoder output gating, and forwarding-effect
  filtering) now operate per-mapping instead of globally. This fixes feedback
  loops that occurred when relay was enabled globally but multiple mappings
  shared the same physical bus.
- **Relay Index Cleanup** — Deleting a MIDI or Serial input mapping now
  correctly removes and re-indexes relay references in the corresponding
  output mappings, preventing stale or shifted indices.
- **Loop Detection False Positives on Relay** — Characters from
  relay-allowed input paths (MIDI or Serial inputs configured in an output
  mapping's "Relay from…" list) are now excluded from the loop-detection
  input buffer, preventing false-positive loop suppression when the
  repeated sequence is intentional relay traffic.

### Changed

- **Mapping Conflict Detection Downgraded to Warning** — MIDI Output and
  Serial Output edit modals no longer block saving when two mappings share
  the same note/device/channel (MIDI) or port/pin (Serial). The check is now
  a non-blocking yellow warning, since overlapping mappings are valid when
  they fire under different conditions (e.g. different forward directions or
  relay sources with "Suppress other inputs" enabled).

## [1.6.0] - 2026-03-14

### Added

- **Keyboard Encoder Input Settings** — The keyboard encoder (typed text) is
  now a configurable input source in Settings → Inputs. Assign it to RX or TX
  (default: TX), and optionally tag it with a display name and colour for
  conversation views and Firebase RTDB forwarding. The encoder source setting
  controls which output forward filters (serial, opto, sidetone, vibration,
  MIDI, WinKeyer, RTDB) carry the signal. Other services that use encoder
  functionality (MIDI out, serial out, WinKeyer, RTDB input) remain
  independent of encoder name/colour settings.
- **Straight-Key Sprite as Input** — The straight-key sprite button has been
  moved from Settings → Other to Settings → Inputs and now has its own
  independent RX/TX source, display name, and colour settings — no longer
  inheriting from the touch keyer. Positioned after Touch Keyer in the
  inputs list.
- **Sprite Encoder Animation Trigger** — New "Keyboard encoder" checkbox in
  the sprite animation sources. When enabled, the sprite visually animates
  (depresses) for each dit/dah the encoder plays back. Trigger list reordered
  to: Keyboard key, Keyboard encoder, Mouse key, MIDI key, Serial key, Mic
  key (touch keyer removed since sprite is not visible in fullscreen).

### Changed

- **Swipe Gesture Guard** — Tab-switching swipe gestures in the settings
  modal are now disabled on non-touch devices, preventing accidental tab
  changes from trackpad horizontal scrolling.
- **RTDB Output Card** — Removed the note stating that the encoder has no
  input-specific tagging, since the encoder now supports name and colour.
- **Main Screen Reveal Button** — The blur-reveal eye button on the main
  screen now matches the fullscreen modal's eye button in size (44×44px) and
  icon dimensions (24×24 SVG) for consistent appearance on mobile.
- **Fullscreen Encoder Keyboard Button** — The virtual keyboard toggle
  button in the fullscreen encoder view has been resized from 52×52px to
  44×44px to match the reveal button, ensuring consistent button sizing.
- **Fullscreen Expand Button** — Replaced the Unicode ⛶ character (which
  rendered as a dot on many mobile fonts) with a proper SVG maximize icon
  for reliable cross-platform display.

## [1.5.0] - 2026-03-14

### Added

- **Text Blurring (Training Mode)** — New setting under Settings → Other that
  blurs decoded text so you can practice reading Morse by ear without
  accidentally seeing the answer. Configurable to blur RX only, TX only, or
  both directions. A floating eye button in the text area acts as a momentary
  reveal switch — press and hold to unblur with a 250 ms animated transition.
  Works in both the main screen parchment view and fullscreen decoder/encoder
  views. Name tags remain visible; only the text content is blurred. Text
  colour is preserved through the blur effect.
- **Inline Port Granting** — All serial port dropdowns (WinKeyer, Serial Input
  edit modal, Serial Output edit modal) now include a `+ Add serial port…`
  option directly in the select box. Selecting it opens the browser's port
  permission dialog without needing to navigate to a different service's
  settings first.

### Changed

- **WinKeyer Port Selection** — Removed the separate "Add Serial Port" and
  "Refresh" buttons. Port list auto-refreshes when the card is expanded.
  Port granting is now inline via the dropdown's `+ Add serial port…` option.
- **WinKeyer Auto-Connect** — WinKeyer now auto-connects on page load when
  previously enabled (matching the serial output service's behaviour) and
  retries with increasing delays (0, 500, 1500, 3000 ms) to handle late
  USB enumeration.
- **WinKeyer Reconnect on Replug** — Fixed reconnection when unplugging and
  replugging the USB cable. The service now properly closes stale connections
  before reconnecting and uses the same retry-with-backoff strategy as the
  serial output service.
- **Serial Reconnect VID/PID Matching** — WinKeyer and serial output
  services now remember each port's USB VID/PID on connection. When a port
  reappears at a different index after re-plug, the app finds it by VID/PID
  and updates the stored index automatically. Note: whether the browser
  remembers a previously granted port after disconnect depends on the
  device's USB descriptor; some budget USB-serial chipsets without unique
  serial numbers may require re-granting the port via the
  `+ Add serial port…` dropdown option.

## [1.4.0] - 2026-03-14

### Added

- **Input Name & Colour Tagging** — Mouse Keyer, Touch Keyer, CW Tone
  Detector, and Straight Key via Mic now support optional **Name** and
  **Colour** fields, matching the existing pattern in Keyboard, MIDI, and
  Serial inputs. When a name is set, switching between inputs triggers a
  line break in conversation views. Colour overrides the default RX/TX
  colour in fullscreen views.
- **Firebase RTDB Output Colour** — RTDB output can now optionally send a
  colour (`col` parameter) alongside each character. Remote listeners
  display this colour in their fullscreen views.
- **RTDB Name & Colour Override Checkboxes** — Two new checkboxes on the
  RTDB Output card control whether the RTDB output name and colour always
  override input-specific tags, or serve as fallbacks when no input-specific
  tag is defined.
- **Firebase RTDB Input Name & Colour Override** — RTDB input now supports
  optional override fields for both name and colour. When set, they replace
  the incoming sender's tag; when empty, the remote sender's name/colour is
  preserved.
- **RTDB Echo Suppression for Input-Specific Names** — The echo filter now
  tracks all names sent (including input-specific names), preventing echoes
  when multiple named inputs are forwarded through the same RTDB channel.

### Changed

- **RTDB Mandatory Fields** — Channel Name, Channel Secret, and Name are now
  mandatory for RTDB Output. Channel Name and Channel Secret are mandatory
  for RTDB Input. Fields show a red asterisk and red label/border when
  empty. Enabling the toggle is blocked with an error message until all
  required fields are filled. Clearing a required field while enabled
  auto-disables the service.

## [1.3.0] - 2026-03-14

### Added

- **Serial Input Multi-Mapping** — Serial input now supports multiple
  independent mappings in a table-based interface, mirroring the MIDI input
  pattern. Each mapping has its own serial port, mode (straight key or
  paddle), pin assignments, poll interval, debounce, decoder source (RX/TX),
  invert, reverse paddles, and paddle mode (Iambic B/A, Ultimatic, Single
  Lever). Add, edit, or remove mappings freely via the new edit modal.
  Each mapping runs its own independent iambic keyer, completely independent
  of the keyboard/mouse/touch keyer. Default mapping: straight key on DSR,
  paddle on CTS/DCD.
- **Serial Input Name & Colour** — Each serial input mapping can now have an
  optional **Name** (e.g. a callsign) and **Colour**, enabling multi-user
  conversation views where each operator's decoded text appears on separate
  colour-coded lines in the fullscreen display — same as MIDI and keyboard
  input.
- **Serial Output Multi-Mapping** — Serial output now supports multiple
  independent mappings in a table-based interface, mirroring the MIDI output
  pattern. Each mapping has its own serial port, output pin (DTR or RTS),
  invert setting, and **per-mapping forward selector** (TX only, RX only, or
  Both). Multiple mappings can target different ports or different pins on
  the same port. Add, edit, or remove mappings via the new edit modal.
- **Serial Input Edit Modal** — New dedicated edit modal for configuring
  serial input mappings, with port selection, mode/pin pickers, live signal
  LED indicators, polling/debounce settings, name/colour fields, and
  estimated maximum WPM display.
- **Serial Output Edit Modal** — New dedicated edit modal for configuring
  serial output mappings, with port selection, pin picker, invert toggle,
  forward selector, and test button.
- **Per-Entry Connectivity Icons (Serial & MIDI)** — Each mapping row in the
  Serial Input, Serial Output, MIDI Input, and MIDI Output cards now shows a
  per-entry connectivity icon (connected/disconnected) matching the card
  header icon style. This replaces the text-based "✔ Connected" / "✖ Not
  connected" status that was previously shown at the bottom of MIDI cards.
- **Silent Port-Already-Open Handling** — When a serial port is already open
  (e.g. from a previous connection), both Serial Input and Serial Output now
  silently adopt the port instead of showing an error. Serial Input checks
  for output port sharing (piggyback) or adopts the port as owned. Serial
  Output adopts the port, registers a disconnect handler, and adds it to
  the open ports map.

### Changed

- **Serial Output Architecture** — Replaced scalar serial output settings
  (`serialPortIndex`, `serialPin`, `serialInvert`, `serialForward`) with a
  `serialOutputMappings` array of `SerialOutputMapping` objects. The service
  now manages multiple open ports via an `openPorts` signal
  (Map&lt;number,&nbsp;PortState&gt;) with per-mapping key state and holdoff
  timers.
- **Serial Input Architecture** — Replaced scalar serial input settings with
  a `serialInputMappings` array of `SerialInputMapping` objects. The service
  manages multiple ports with per-mapping independent iambic keyers and
  signal polling.
- **Serial Port Sharing** — Serial Input now piggybacks on Serial Output via
  `SerialKeyOutputService.getOpenPort(portIndex)` (was `openPort()`), and
  watches the `openPorts()` signal for reactivity. Deferral logic checks
  `serialOutputMappings.some(m => m.enabled && m.portIndex === portIndex)`.
- **Serial Output Holdoff** — The 30 ms `isSending` holdoff is now tracked
  per mapping, so mappings on different ports operate independently.
- **Mouse Keyer Paddle Mode** — Added `mousePaddleMode` and
  `touchPaddleMode` settings with a UI selector.

### Fixed

- **Serial Input Name/Colour Not Showing in Fullscreen** — Fixed all six
  `decoder.onKeyDown`/`onKeyUp` call sites in `SerialKeyInputService` to
  pass `name` and `color` from the mapping, so named serial input mappings
  now appear correctly in the fullscreen conversation views.

---

## [1.2.0] - 2026-03-13

### Added

- **Keyboard Keyer Multi-Mapping** — The keyboard keyer now supports multiple
  independent mappings in a table-based interface, mirroring the MIDI input
  pattern. Each mapping has its own mode (straight key or paddle), key
  bindings, decoder source (RX/TX), reverse paddles toggle, paddle mode
  (Iambic B/A, Ultimatic, Single Lever), and optional Name and Colour.
  Add, edit, duplicate, reorder, or remove mappings freely. Default mappings:
  Space as straight key (TX), `[`/`]` as Iambic B paddles (TX), and
  Left Ctrl/Right Ctrl as Iambic B paddles (TX).
- **Per-Mapping Paddle Mode (Keyboard)** — Each keyboard paddle mapping now
  carries its own paddle mode, replacing the previous shared setting. This
  allows different keyer behaviours per mapping (e.g. one mapping in Iambic B
  and another in Ultimatic).
- **Keyboard Keyer Name & Colour** — Each keyboard mapping can now have an
  optional Name and Colour, enabling multi-user conversation views where each
  operator's decoded text appears on separate colour-coded lines in the
  fullscreen display — same as MIDI input.
- **Per-Mapping Keyer Loops (Keyboard & MIDI)** — Each keyboard and MIDI
  paddle mapping now runs its own independent iambic keyer engine with
  separate state, timing, and decoder pipeline. Previously, all keyboard
  paddle mappings shared a single decoder pipeline, which could cause
  output ref-count leaks and stuck audio when two mappings overlapped.
- **Modifier Key Combo Detection** — When a mapped modifier key (Ctrl, Alt,
  Shift, Meta) is involved in a simultaneous multi-key press, the browser may
  swallow `keyup` events for one of the keys. The keyer now detects these
  stuck states by cross-checking keyboard event modifier flags on every
  key release, and automatically releases any stranded paddle or straight-key
  state — preventing the continuous-tone bug that occurred when pressing e.g.
  `[` and Ctrl simultaneously.

### Changed

- **Keyboard Keyer Settings UI** — The single key-binding buttons have been
  replaced by a mapping table with enable checkbox, name, mode, key summary,
  source badge, reverse indicator, and paddle mode label. An edit modal
  (matching MIDI input's pattern) provides the full configuration for each
  mapping.
- **Independent Decoder Pipelines** — Keyboard paddle mappings now use indexed
  input paths (`keyboardPaddle:0`, `keyboardPaddle:1`, …) and MIDI mappings
  use indexed paths (`midiPaddle:0`, `midiStraightKey:0`, …) so each mapping
  gets its own independent decoder pipeline. This prevents ref-count leaks
  in shared audio/serial/vibration/MIDI output when multiple mappings overlap.

### Fixed

- **Stuck Continuous Tone** — Fixed a bug where pressing keys from two
  different keyboard paddle mappings simultaneously (e.g. `[` and Right Ctrl)
  caused a permanent continuous tone that persisted even after all keys were
  released. Root cause: all keyboard paddle mappings shared a single decoder
  pipeline (`keyboardPaddle`), so overlapping `onKeyDown`/`onKeyUp` calls
  leaked the audio output ref count. Now each mapping has its own pipeline.
- **Modifier Key `keyup` Not Firing** — Added active detection of stuck
  modifier keys via `KeyboardEvent` flag cross-checks and a `window.blur`
  handler, so lost `keyup` events for Ctrl, Alt, Shift, and Meta no longer
  leave paddle or straight-key state permanently stuck.

---

## [1.1.0] - 2026-03-11

### Added — Application

- **MIDI Input Multi-Mapping** — MIDI input now supports multiple independent
  mappings in a table-based interface. Each mapping has its own device,
  channel, mode (straight key or paddle), note assignment, decoder source
  (RX/TX), and reverse-paddles toggle. Add, edit, duplicate, reorder, or
  remove mappings freely. The previous single-mapping MIDI input has been
  replaced by a configurable mapping table with an edit modal for each row.
  Default mappings: straight key on note C4 (60) and paddle on D4/E4
  (62/64), both on channel 1 (omni).
- **MIDI Input Name & Colour** — Each MIDI input mapping can now have an
  optional **Name** (e.g. a callsign) and **Colour** (CSS colour string).
  When a name is set, it triggers automatic line breaks in the fullscreen
  conversation views — the name appears as a prefix (like Firebase RTDB
  user names), and the text is rendered in the chosen colour instead of the
  default RX/TX colour. This enables **multi-user conversations** where
  several operators key into the same app instance via separate MIDI
  devices, and each operator's text appears on its own colour-coded line
  in the fullscreen decoder/encoder views.
- **MIDI Output Multi-Mapping** — MIDI output now supports multiple
  independent mappings in the same table + edit modal pattern as MIDI
  input. Each mapping has its own device, channel, mode (straight key or
  paddle), note assignment, and **per-mapping forward selector** (TX only,
  RX only, or Both). Default mappings: straight key on G♯5 (80) and
  paddle on A♯5/C6 (82/84), both on channel 1, forward TX.
- **MIDI Output Paddle Mode for Local Keyers** — Keyboard, mouse, and
  touch keyer inputs now correctly drive MIDI output paddle-mode mappings
  via the character-based playback path. Previously, local keyer inputs
  only fired straight-key MIDI output notes in real time; paddle-mode
  mappings were skipped. The fix passes a `paddleOnly` flag through the
  forwarding chain so that paddle mappings receive decoded characters
  while straight-key mappings continue to fire in real time without
  double-firing.
- **MIDI Device Enumeration When Disabled** — Both MIDI Input and MIDI
  Output cards now enumerate available MIDI devices for the device
  dropdown even when the respective feature is disabled, making
  configuration easier before enabling.

### Changed — Application

- **MIDI Output Notes Updated** — Default MIDI output note assignments have
  changed from F♯4/G♯4/A♯4 (66/68/70) to G♯5/A♯5/C6 (80/82/84) to match
  the updated Arduino sketch pin assignments. Existing saved profiles are
  not affected — only new profiles or factory resets use the new defaults.
- **Firebase RTDB Field Rename** — The `userName` field has been renamed to
  `name` and `rtdbOutputUserName` to `rtdbOutputName` throughout the
  codebase and Firebase protocol for consistency.
- **Settings Tab Reorder** — The Inputs tab now appears before Outputs in the
  settings modal (previously Outputs was first).
- **Audio Output Card Renamed** — "Audio Output" renamed to "Audio Key
  Output" for clarity.

### Added — Arduino Sketches (v1.1.0)

- **16 Configurable Pins** — Both the ATmega32U4 and nRF52840 sketches now
  expose all 16 usable GPIO pins as individually configurable slots, each
  with a direction (input/output), MIDI channel, and MIDI note. The previous
  3-input / 3-output fixed assignment has been replaced by a fully
  table-driven configuration at the top of each sketch.
- **Dual MIDI Channels** — Pins are split across MIDI channel 1 (pins 1–5
  and 11–13) and channel 2 (pins 6–10 and 14–16), allowing logical grouping
  of inputs and outputs.
- **Configurable Debounce** — A `DEBOUNCE_MS` constant (default 5 ms)
  replaces the hardcoded debounce, allowing easy tuning for different
  switch types.
- **Configurable Velocity** — A `MIDI_VELOCITY` constant (default 127)
  is now exposed for easy adjustment.

### Changed — Arduino Sketches (v1.1.0)

- **Output Pin Numbers Changed** — Output pins have moved from
  **5, 6, 7** (GPIO) to **14, 15, A0** (ATmega32U4) / **P1.11, P1.13,
  P0.02** (nRF52840). The physical pin positions on the board are now
  pins 11–16 instead of pins 4–6.
- **Output MIDI Notes Changed** — Output notes have changed from
  F♯4/G♯4/A♯4 (66/68/70) to G♯5/A♯5/C6 (80/82/84) on channel 1, with
  three additional outputs on D6/E6/F♯6 (86/88/90) on channel 2.
- **Input MIDI Notes Changed** — Input notes have expanded from
  C4/D4/E4 (60/62/64) on channel 1 to ten inputs spanning
  C4–F♯5 (60–78) across channels 1 and 2.

### ⚠️ Arduino Sketch Compatibility

> **Breaking change for output wiring.** If you are upgrading from the
> v1.0.0 Arduino sketch, **input wiring on pins 2, 3, and 4 will continue
> to work** — these pins remain inputs with the same MIDI notes (60, 62,
> 64). However, **output wiring must be moved** from the old pins (5, 6, 7)
> to the new pins (14, 15, A0 on ATmega32U4 / the corresponding nRF52840
> GPIOs). The MIDI output notes have also changed from 66/68/70 to
> 80/82/84, so **MIDI Output mappings in Morse Code Studio must be
> updated** to match (new profiles already use the correct defaults).
>
> **Reprogramming the Arduino is required.** Upload the new v1.1.0 sketch,
> then rewire output connections to the new pin positions.

---

## [1.0.0] - 2026-03-08

First official public release of Morse Code Studio as an open-source project under the CC0-1.0 Universal license.

### Features

- **Real-Time CW Decoding** — Decodes incoming Morse code from audio via
  Goertzel-based tone detection with dual RX/TX calibration pools.
- **Text-to-Morse Encoding** — Converts typed text into precisely timed Morse
  audio with "Send on Enter" and "Live" input modes.
- **Five Keyer Modes** — Straight key, Iambic A, Iambic B, Ultimatic, and
  Single Lever with full dit/dah memory and reverse paddles.
- **Multiple Input Methods** — Arduino MIDI paddle, USB-serial adapter
  (DSR/CTS/DCD/RI), computer keyboard, mouse, and touchscreen.
- **Multiple Output Methods** — Arduino MIDI optocoupler, sound card
  optocoupler (DC/AC), USB-serial adapter (DTR/RTS), and WinKeyer.
- **Firebase RTDB Relay** — Real-time Morse relay between app instances over
  the internet with per-character WPM and callsign-prefixed conversation view.
- **Fullscreen Display** — Customisable decoded/encoded text display with
  adjustable letter size, colours, and RX/TX colour tagging.
- **Prosign Actions & Emoji Mappings** — Configurable prosign-triggered actions
  and Morse-to-emoji substitutions.
- **Progressive Web App** — Installable on desktop and mobile with offline
  caching via Angular service worker.
- **Haptic Vibration** — Vibrates in sync with the sidetone (Android).
- **Screen Wake Lock** — Prevents screen lock during operation.

For pre-release development history, see [PRE-RELEASE-CHANGELOG.md](PRE-RELEASE-CHANGELOG.md).
