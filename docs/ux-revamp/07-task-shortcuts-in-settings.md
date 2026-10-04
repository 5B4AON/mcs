# Work Package 07 — Task Shortcuts in Existing Settings

**Priority:** 7 — improve discoverability now while preserving the full configuration model

**Proposed release:** R3 — Practice and findability

**Dependencies:** None; this is complementary to (not a replacement for) the wizard in package 08

## Goal

Let users enter Settings by a goal they recognize—such as practice, receive CW, type/send, connect a key, connect radio keying, or relay—and then land on the relevant existing card. Preserve the current Inputs/Outputs/Other tabs and every settings card.

## Scope and locations

- Settings shell: `src/app/components/settings-modal/settings-modal.component.html` and `.ts`.
- Tab shells: `src/app/components/settings-modal/settings-inputs-tab/settings-inputs-tab.component.html`, `settings-outputs-tab/settings-outputs-tab.component.html`, and `settings-other-tab/settings-other-tab.component.html`.
- Relevant cards, for example: `encoder-card`, `cw-detector-card`, `practice-card`, keyer cards, audio/serial/MIDI/WinKeyer/RTDB output cards.

## In scope

1. Add a small **Set up by goal** landing/shortcut section to the existing Settings shell. It may be collapsible/dismissible but must not replace or hide the existing tab controls.
2. Use a short owner-approved set of plain-language goals and map each to a precise current tab + card, e.g.:
   - Type text into Morse → Keyboard Encoder
   - Practice receiving → Copy Practice
   - Decode CW from radio audio → CW Tone Detector
   - Send by keyboard/paddle → the applicable keyer card
   - Key a transmitter / connect a relay → the relevant output card, with a hardware-safety explanation
3. Selecting a shortcut activates the existing tab and expands/focuses/scrolls to the existing card. Keep a direct path to the entire advanced settings list.
4. Add one-sentence summaries to the three existing tab labels/sections so “Inputs,” “Outputs,” and “Other” are less opaque. Do not rename or remove a tab in this package.
5. Add accessible button names, focus management, and a visible indication of the card that the shortcut opened.

## Out of scope

- Reordering, deleting, or changing the defaults or values in settings cards.
- Replacing existing tabs with the task model, hiding advanced cards, a search/filter feature, or building the full multi-step wizard.
- Automatically enabling a setting, requesting audio/MIDI/Serial permissions, or opening the system chooser.

## Implementation instructions

1. Before code, create a compact mapping table for each shortcut → current tab → component/card → action (expand/focus/scroll) and obtain owner approval.
2. Prefer narrow child inputs/events or stable element IDs to control disclosure; do not use brittle DOM traversal or hard-coded scroll offsets. Retain normal tab selection, swipe support, modal scroll, and keyboard focus.
3. If cards currently own private `expanded` state, make only the smallest explicit API change required for a parent-requested expansion; keep user-operated collapse/expand working.
4. Ensure any shortcut to radio/relay explains consequences and does not toggle the corresponding service. Hardware card toggles remain under explicit user control.
5. Add focused tests for each shortcut mapping and for normal manual tab/card operation after a shortcut is used.

## Acceptance criteria

- A novice can select an approved plain-language goal and arrive at the correct existing card with its guidance visible.
- Existing Inputs/Outputs/Other navigation, swipe behavior, all cards, card toggles, validation, and save behavior continue to work.
- No shortcut mutates `AppSettings`, starts audio, opens device permissions, or enables a radio output.
- Full advanced settings are still discoverable and reachable.
- `npm test` and `npm run build` pass.

## Manual owner checkpoint — required before acceptance

Ask the owner to verify the shortcut-to-card mapping and labels first, then test every shortcut with keyboard and touch. Confirm opening a shortcut only navigates/expands; it does not change settings or activate inputs/outputs. Check that returning to the tabs and using swipe/scroll remains natural.

## Approval gate

**Before implementation, request explicit approval for Work Package 07 and its mapping table.** If a goal has no obvious single card or would require toggling multiple settings, pause and ask how that scenario should be represented. Stop for owner testing before package 08.
