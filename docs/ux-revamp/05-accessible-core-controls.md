# Work Package 05 — Accessible Core Controls and Modals

**Priority:** 5 — essential groundwork for future onboarding and configuration screens

**Proposed release:** R2 — Inclusive, trustworthy controls

**Dependencies:** Work Package 01 for the audio control's final markup (or coordinate changes so the label is not overwritten)

## Goal

Make core controls discoverable and usable by keyboard, touch, and assistive technology without changing their Morse, routing, buffer, or modal-history behavior.

## In scope

1. Add dialog semantics and accessible names to Settings, Help, Fullscreen, and nested confirmation/device-scan dialogs in:
   - `src/app/components/settings-modal/settings-modal.component.html`
   - `src/app/components/help/help.component.html`
   - `src/app/components/fullscreen-modal/fullscreen-modal.component.html`
2. On opening a dialog, move focus inside it; keep keyboard focus within the modal while open; restore focus to the invoking control on close. Preserve the app's existing Escape/back-button and `modalHistoryDepth` behavior.
3. Expose Settings tab selection and relationships accessibly. If using `role=tablist`/`role=tab`/`role=tabpanel`, implement the complete expected keyboard pattern (arrow keys, Home/End, selected state, and correct panel relationships). Keep touch-swipe tab changes synchronized with the selected tab and visible panel.
4. Replace clickable card-header `div` interactions with a native disclosure button for the title/chevron and a separate sibling enable switch. Do not put nested buttons, labels, or inputs inside another button. Set `aria-expanded` and `aria-controls`; preserve the existing card content and toggle state.
5. Add accessible names to icon-only primary actions such as close, clear, fullscreen, audio, start/stop, and reveal controls. Essential instructions must not rely on `title` alone.
6. Convert fullscreen touch-keyer press surfaces in `src/app/components/fullscreen-modal/fs-decoder-view/fs-decoder-view.component.html` to keyboard-operable controls while preserving press-and-hold dit/dah/straight-key behavior. Ensure keyup, blur, pointer/touch cancellation, and focus loss release a held key so it cannot stick.
7. Provide visible focus indication, preserve sensible tab order, and check color contrast and touch-target sizing in the changed surfaces.

## Out of scope

- A wholesale redesign, third-party accessibility/UI dependency, changing the route/modal architecture, or changing text/keyer behavior.
- Rewriting every settings card in one sweep. Begin with cards needed for onboarding; record a follow-up list if broad migration is required.
- Claiming formal WCAG conformance without a complete audit.

## Implementation instructions

1. Map each modal's open/close and browser-history path before editing; test mouse close, keyboard close, Escape, and browser Back where currently supported.
2. Prefer native HTML semantics. Avoid ARIA roles if the expected keyboard behavior cannot also be implemented.
3. For cards, separate the disclosure button and enable checkbox/switch in the header layout. Do not add a button around the existing header containing a nested switch.
4. For touch keying, preserve down/up timing and all existing pointer/touch cancellation paths. Test Space/Enter key repeat and blur/focus loss; a keyboard press must not generate repeated stuck closures.
5. Use existing CSS and shared-style conventions; do not add UI libraries. If styles are shared globally, follow `.github/copilot-instructions.md` and do not re-add shared CSS to every component.
6. Add focused component/spec tests for tab state, disclosure state, and key-release paths if they can be isolated in the existing Jasmine/Karma setup.

## Acceptance criteria

- Dialogs have a programmatic name and modal semantics; focus enters, remains within, and returns from the dialog.
- Settings tabs support keyboard navigation and announce the active panel; touch swipes still work.
- Expand/collapse cards and their separate switches can each be operated without nested interactive elements.
- Icon-only core controls have clear accessible names and visible keyboard focus.
- Touch-keyer hold/release behavior remains correct for mouse, touch, and keyboard, including cancellation/focus loss.
- RX/TX routing, modal/browser history, modal text, and all existing control effects are unchanged.
- `npm test` and `npm run build` pass; no new dependency is introduced.

## Manual owner checkpoint — required before acceptance

Ask the owner to test mouse, keyboard-only, and touch interaction on Settings, Help, and both fullscreen modes. Include opening/closing with Escape and browser Back, switching Settings tabs with keyboard and swipe, and pressing/releasing the on-screen keyer using both touch and keyboard. If possible, include one screen-reader pass to confirm dialog names, selected tab, button labels, and state announcements.

## Approval gate

**Before implementation, request explicit approval for Work Package 05.** Focus and modal interaction changes can affect navigation; if the current Back/Escape contract is unclear, pause and ask rather than changing it. Stop for manual owner acceptance before package 06.
