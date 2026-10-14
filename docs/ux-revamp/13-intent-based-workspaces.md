# Work Package 13 — One Fullscreen Conversation for Keying and Typing

**Priority:** Move directly after Work Package 05; before packages 06 and 07

**Proposed release:** R3 — One clear fullscreen conversation

**Dependencies:** Work Package 05 accepted

**Mobile-first UI constraint:** Follow the shared [mobile-first and responsive UI contract](./00-ROADMAP-AND-IMPLEMENTATION-GUARDRAILS.md#mobile-first-and-responsive-ui-contract). Preserve the tested font, button, touch-target, and spacing scale. Keep the Key/Type control discoverable and reachable with the on-screen keyboard open; do not add a permanent toolbar row or shrink controls.

## Goal

Replace the confusing fullscreen “Decoder” and “Encoder” choices with one full-screen receive/send conversation. Let users clearly choose whether their keyboard types a message or operates their configured Morse keyer, without removing existing keying, typing, practice, routing, or display controls.

Both current fullscreen views show conversation text. Their important difference is keyboard behavior: the decoder view uses mapped keyboard keys as a keyer, while the encoder view captures text and disables the keyboard keyer. This package makes that input choice explicit instead of asking users to understand two differently named screens.

## Agreed interaction

- Replace the separate fullscreen menu items with one **Full-screen conversation** action.
- Show an accessible **Key** / **Type message** control in the fullscreen conversation. Default to **Key** when opening fullscreen, matching the current decoder view. The selected mode must be immediately visible; do not use color or a tooltip alone.
- In **Key** mode, mapped physical keyboard keys use the user's existing straight-key or paddle mappings. Existing mouse-keying areas and dedicated touch-keyer controls keep working.
- In **Type message** mode, focus a real text-entry target. Physical and on-screen keyboard text follows the existing encoder or practice type-along path. The separate `encoderMode` options (Send on Enter, Live, Copy Practice) remain authoritative for how text is sent or handled. In Listen/Blur practice, preserve the existing disabled-answer behavior and explain it.
- Switching to Type releases any held mapped key before suspending keyboard keying, then focuses text entry. Switching back to Key moves focus out of the editor and releases held keys before mappings resume. Do not send text or change settings on a mode switch.
- Do not let clicks in the text editor trigger mouse keying. Do not make clicking the conversation body switch modes.

## In scope

1. Replace the two fullscreen entry choices with one conversation action and render receive and send activity together: decoded history, active Morse patterns, pending/sending text, and practice feedback where applicable.
2. Add the Key/Type input control and connect it to keyboard focus and keyer handling. Suspend only mapped physical-keyboard input while typing; do not change its saved setting or disable mouse/touch, MIDI, serial, relay, or other configured input paths.
3. Keep current encoder send modes, all practice feedback/content modes, RX/TX routing, WPM and calibration controls, display customization, clear, Help, symbols, reveal, and mobile keyboard/keyer actions available.
4. Use one persistent fullscreen conversation history across Key and Type modes and across fullscreen close/reopen. Keep the main-screen history independently clearable. **Clear this text area** clears the shared fullscreen conversation; **Clear all** keeps its existing app-wide behavior, including pending encoder/practice state.
5. Inspect how the two current fullscreen histories can diverge. Do not silently discard visible history or change clear behavior. If existing contents cannot be reconciled without loss, stop and ask the owner before implementing a destructive choice.
6. Explain Key and Type in plain language in the view or nearby Help content. Keep the input control usable at the shared mobile viewport and while the on-screen keyboard is open.

## Preserve / do not change

- Do not alter keyboard mappings, mouse/touch keyer behavior, key sources, RX/TX routing, forwarding, calibration, device mappings, output settings, or saved profiles.
- Do not treat Key/Type as another encoder mode or change the current Live/Send on Enter/Copy Practice behavior.
- Do not start audio, send text, enable an output, or request permission because fullscreen opens or the input mode changes.
- Do not add a router, multiple named workspaces, duplicate encoder/decoder engines, or a saved preference for this temporary input choice.
- This package intentionally consolidates the two fullscreen presentation/history surfaces. The main-screen history and app-wide clear behavior remain separate and intact.

## Out of scope

- A broader set of Practice, Listen, Compose, or Operate workspaces.
- Changing the main screen or the settings that select encoder send behavior.
- Redesigning practice, hardware, relay, or named-preset setup.
- Prototype or wireframe approval. The owner has selected the single-view direction; no prototype is required.

## Implementation instructions

1. Trace `AppComponent.openModal()`/`closeModal()`, fullscreen browser-history behavior, `KeyerService` keyboard event handlers and release behavior, `MouseKeyerService`, touch-keyer controls, encoder text handlers, and all current fullscreen buffers/clear actions.
2. Implement transient mapped-keyboard suspension separately from disabling the entire keyer service. The latter also gates non-keyboard keyer inputs. Release all held mapped keys before mode handoff and on focus loss/close.
3. Ensure text-entry pointer events cannot activate the attached mouse keyer. Keep a dedicated mouse-keying surface available in Key mode.
4. Keep Key/Type separate from `encoderMode`. Route typed characters through the existing send/practice handling; never call a new low-level output path.
5. Use one fullscreen conversation history. Preserve all currently visible history and the existing distinction between clearing this surface and clearing the app. If divergent histories cannot be reconciled without losing content, ask the owner before choosing which to keep.
6. Do not create or run automated UI/component/DOM/browser tests. The owner manually verifies keyboard handoff, all input paths, history/clear behavior, and responsiveness.

## Acceptance criteria

- The main screen offers one fullscreen conversation entry, not separate Decoder and Encoder view choices.
- One conversation displays RX and TX activity together; switching Key/Type or closing/reopening fullscreen does not clear its history.
- A configured key such as Space acts as a Morse key in Key mode and enters a space in Type mode.
- Switching modes releases any held mapped key. Text-editor clicks never key Morse; existing mouse and dedicated touch keying still work.
- Existing encoder send modes and all practice modes behave as before. Type mode does not bypass the current send action or output routing.
- No mode switch starts audio, sends a message, changes saved settings, enables outputs, or requests permission.
- Main-screen history remains independent; the existing fullscreen clear-this-area and app-wide clear-all behavior remains understandable and correct.
- `npm run build` passes; no automated UI test is created or run.

## Manual owner checkpoint — required before acceptance

Use the owner-run viewport matrix in the roadmap, including a phone in portrait and Type mode with the on-screen keyboard open. Check:

1. Only one fullscreen action is offered, and both receive and send messages appear in the shared conversation.
2. A mapped key such as Space keys Morse in Key mode and types a space in Type mode.
3. Switching while a mapped key is held releases it before changing input behavior; returning to Key mode restores mappings.
4. Type mode uses existing Send on Enter, Live, and practice behavior. Check Listen/Blur and type-along practice.
5. Typing in the editor never triggers mouse keying. Mouse keying in its intended Key-mode area, dedicated touch keyers, MIDI, and serial inputs still work.
6. Mode changes do not send text, start audio, change output settings, or prompt for permissions.
7. Toggle modes and close/reopen fullscreen; confirm the shared conversation history remains. Confirm main-screen history is separate and test both clear actions.
8. Existing toolbar, display customization, browser Back, and modal behavior remain usable.

## Approval gate

The owner has approved the direction: one fullscreen conversation with an explicit Key/Type control; no prototype or wireframe is required. Before coding, ask only about unresolved implementation choices that could lose history or change input behavior. After the build, stop for the owner's manual checks and explicit acceptance.
