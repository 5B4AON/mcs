/**
 * Morse Code Studio
 */

import { WizardFlow } from '../engine/flow-types';

/*
 * TEACH GOAL - WORK IN PROGRESS (deferred; to be restarted from scratch)
 * ======================================================================
 * The Teach goal proved harder than the other goals, so it is parked. Opening
 * it in Wizard v2 shows only a "work in progress" step and changes nothing.
 * This comment records what was tried and learned (issue #80) for the restart.
 *
 * Where the first attempt lives (all still compiled, none reachable from the UI)
 * ---------------------------------------------------------------------------
 * - `teach-draft.flow.ts`            the full draft flow (`TEACH_DRAFT_FLOW`), not registered.
 * - `teach-participant.model.ts`     participant drafts (teacher + up to 4 students), names,
 *                                    colours, mapping patches, review lines, validation.
 * - `../pages/teach-participant-page.component.*`  hosts the shared keyboard/MIDI/serial
 *                                    mapping editors for one participant, kept in wizard answers.
 * - Wizard shell/engine additions made for it: question kinds `select` and `text`,
 *   `StepQuestion.optionsFrom` (dynamic options), `WizardFlow.derivePatch/derivedKeys/
 *   deriveReview/validateWithFlowSettings/applyWhen`, and the `participant` question kind.
 * - Removed again (not in the code any more): a fullscreen "Next student" roster banner
 *   (with `practiceParticipants` / `initialInputMode` inputs and the Apply result
 *   `{ goal, practiceParticipants }`), and a "?" help dialog beside participant name
 *   fields explaining emoji names. Both can be rebuilt if the restart needs them.
 *
 * What the draft did
 * ------------------
 * 1. Activities (multi-choice): take turns sending, take turns copying on one device,
 *    teacher call-and-response, and students joining from phones.
 * 2. Local roster: a teacher plus 1-4 local students (dropdown). Each participant picks one
 *    input (keyboard, shared mouse, touch, MIDI, serial) and edits it with the same
 *    mapping editors as Settings. New mappings are APPENDED to existing ones on Apply;
 *    mouse and touch are single shared devices, so only one participant can own each.
 * 3. Speeds: sending speed; keyer speed only if a paddle input was chosen; TX decoder start
 *    speed only if a straight key was chosen (a straight key has no keyer speed); then
 *    optional Farnsworth.
 * 4. Copy practice: the existing Practice item forced to the local pipeline and received
 *    Morse, then fullscreen with a manual student roster (removed since). No aggregate scoring.
 * 5. Call-and-response: teacher types a prompt in fullscreen Type mode, students key replies
 *    in Key mode in turn; the teacher manages turns, nothing is locked or muted.
 * 6. Phone students: RTDB input and output on SEPARATE steps sharing one channel name and
 *    secret; the output item copies the input channel in `sharedChannel` mode. Routes only
 *    connect after the final Apply and the device profile is not saved.
 * 7. Optional display features (text blur, show prosigns, emojis, prosign actions) are only
 *    OFFERED for review when already enabled, after explaining their purpose. Choosing
 *    "review" just shows the normal item; unchecked ones stay untouched. Text blur is not
 *    offered together with copy practice (Practice has its own blur/feedback settings).
 * 8. Enabled local inputs that no participant uses are listed with "turn off" choices;
 *    unchecked inputs stay as they are.
 *
 * Decisions and rules from the owner to keep
 * ------------------------------------------
 * - Never assume specific key codes: keyboard mappings use the existing Detect/capture; keys
 *   stay blank until captured. MIDI detection and serial `requestPort` stay explicit clicks.
 * - Do not silently enable, disable or redirect a route. Only change what the teacher chose;
 *   conflicts are asked about, not fixed automatically.
 * - Show the same item UI as Settings (colour pickers, auto-detect), not wizard-only fields.
 * - Optional features are optionally DISPLAYED for review, not optionally enabled/disabled.
 * - No radio paths in Teach: no WinKeyer, radio keying, audio decoding or pilot tone, and
 *   no experimental audio-output / mic items.
 * - Group scoring is out of scope. Names may contain emoji; separately, configured text or
 *   prosign sequences can be replaced by emoji, which could serve as visual awards.
 * - Dropdowns (e.g. student count, input type) rather than number boxes or free typing.
 *
 * Why it was hard / lessons for the restart
 * -----------------------------------------
 * - One wizard goal mixed several different teaching activities with different needs
 *   (local keying, single-device copy, call-and-response, remote phones). Consider one
 *   goal per activity, or a first question that picks a single activity and a small flow
 *   for each, instead of one flow with many cross-cutting conditions.
 * - Participants are not settings: they became wizard-only answers turned into appended
 *   mappings by `derivePatch`, which fights the engine's "draft settings + change
 *   detection + Revert" model (review lines, Revert and validation all needed special cases).
 *   A cleaner design may reuse the existing repeat-step mapping pages directly and add a
 *   small teaching-session layer on top.
 * - Copy practice and sending use different encoder modes (Practice vs keying), so they
 *   cannot be combined in one fullscreen session; the draft rejects that combination.
 * - Class features that need app support beyond the wizard (turn roster, per-student
 *   feedback, per-turn identity in fullscreen, call-and-response prompts) should be
 *   designed and built as app features first; the wizard should then only configure them.
 * - The shared draft scope has one mouse and one touch keyer, so two participants cannot
 *   both use them; real fixes need multiple identities per device, not wizard logic.
 * - A turn roster (which student is active) was only a manual banner: it did not change the
 *   sender name, mapping or practice feedback. A real turn manager is the missing piece.
 */

/** Teach goal placeholder: a single step that explains the goal is not available yet. */
export const TEACH_FLOW: WizardFlow = {
  id: 'teach',
  title: 'Teach or demonstrate Morse',
  goal: 'teach',
  steps: [
    {
      id: 'work-in-progress',
      title: 'Work in progress',
      intro: 'The guided setup for teaching and demonstrating Morse is not ready yet. It is being redesigned, and nothing here changes your settings. Choose Back to pick another goal; your Settings remain available for setting up classroom inputs by hand.',
      validate: () => ['This goal is not available yet.'],
    },
  ],
};
