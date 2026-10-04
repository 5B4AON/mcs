# Work Package 13 — Intent-Based Operating Workspaces

**Priority:** 13 — major navigation/interaction refinement; implement last

**Proposed release:** R8 — Clear operating workspaces

**Dependencies:** Packages 05, 06, 08, and 09 accepted; package 12 is recommended for saved-setup continuity

**Mobile-first UI constraint:** Follow the shared [mobile-first and responsive UI contract](./00-ROADMAP-AND-IMPLEMENTATION-GUARDRAILS.md#mobile-first-and-responsive-ui-contract). Preserve the tested font, button, touch-target, and spacing scale. Obtain approval for portrait and desktop wireframes; do not add a permanent workspace toolbar row that exceeds the established reference portrait fit or shrink controls to fit it. Keep choices discoverable through an existing compact menu/modal if necessary.

## Goal

Make the existing encoder, decoder, practice, and combined conversation experiences easier to distinguish through explicit workspace choices—without turning a view choice into a feature switch or breaking independent RX/TX processing.

## Proposed workspace model — owner approval required

Prototype and receive explicit owner approval for labels and layout before implementation. Initial proposal:

1. **Practice** — foregrounds the existing practice controls and answer/feedback appropriate to the selected practice mode.
2. **Listen & decode** — foregrounds incoming/decoded content and its CW/audio readiness; sending/keying may continue in the background if already active.
3. **Compose & send** — foregrounds text composition, encoder mode, and TX progress; RX remains live.
4. **Conversation / Operate** — foregrounds the combined RX/TX conversation view for demonstrations/on-air operation.

The current main view, decoder fullscreen view, and encoder fullscreen view are to be mapped to these choices during design review. Do not assume that choosing a workspace changes RX/TX assignment or stops the other stream.

## In scope

1. Add an understandable, discoverable way to select the approved workspace without requiring a persistent toolbar row on mobile. Keep the current fullscreen decoder and encoder views available as clearly named alternatives/large-display layouts.
2. Keep workspace selection presentational: it must not change enabled inputs/outputs, source routing, independent decoder pools, WPM, encoder sending mode, practice settings, or profile state.
3. Preserve all three independent text buffers, current patterns, active encoder text/queue, running practice state, loop detection, and device connections when switching or opening/closing a view.
4. Make each workspace explain what it emphasizes and whether it is currently ready; link to the relevant existing task/settings route without silently changing it.
5. Keep mobile/touch keyer overlays, virtual keyboard, fullscreen display customization, and browser Back behavior intact.
6. Support deep links from the accepted first-run/quick-start, settings task shortcuts, educator scenario, and wizard finish screen to a workspace without duplicating navigation logic.

## Out of scope

- Routing/screens overhaul, Angular Router, removing/replacing the existing modals, removing the combined view, or splitting the RX/TX engine.
- Automatically entering Live send, starting practice, playing audio, enabling keyers, changing source or forward selectors, or clearing text upon workspace selection.
- New collaboration features, analytics, or persistent per-workspace copies of settings.

## Implementation instructions

1. Before code, produce two concise text wireframes/interaction proposals showing desktop and mobile placement, workspace labels, how the existing views map, and which controls persist. Ask the owner to choose/approve one.
2. Trace AppComponent's `activeModal`, `modalHistoryDepth`, `popstate`, the three `DisplayBufferService` buffers, practice lifecycle, focus, virtual keyboard, and touch overlays before changing component composition.
3. Keep workspace identity separate from `AppSettings` unless the owner explicitly approves persistence. If persisting view choice, use a new display preference, not the per-device hardware profile.
4. Reuse existing fullscreen components and buffer streams. Do not create shadow buffers or move decoder/encoder services under mutually exclusive view components.
5. Switching view must not invoke `clear*`, stop/start a service, reset calibration, alter an encoder queue, or change practice state. If a view cannot display a feature, that feature continues running and its status remains discoverable.
6. Do not create or run automated workspace/component/DOM/browser tests. The owner manually verifies view selection, buffers/state, modal/back history, and settings preservation using the checkpoint below.

## Acceptance criteria

- Users can tell which workspace is active and what it is for; all four approved intents are reachable.
- The combined RX/TX conversation experience and both existing fullscreen views remain available.
- Switching workspace does not stop reception, transmission, key input, practice, change routing, clear buffers, or alter settings.
- Fullscreen/modal/browser history, mobile virtual keyboard, touch keyers, buffer persistence, and display controls work as before.
- Selection and transitions work with keyboard, touch, focus management, and the established reference portrait viewport.
- `npm run build` passes; no automated UI test is created or run.

## Manual owner checkpoint — required before acceptance

Ask the owner to approve the portrait and desktop wireframes before coding. On a representative phone at the measured reference portrait CSS viewport, compare affected screens with the supplied mobile reference screenshots and verify that relative font/button/touch-target scale is unchanged. On desktop at narrow, typical, and wide widths while resizing, manually verify that choices and existing top-bar actions remain available, layouts do not clip/overlap/scroll horizontally, and wider layouts remain balanced. Then test each workspace during active RX, queued TX, held touch-keyer input, and active/paused practice. Switch views, use browser Back, close/reopen fullscreen, and verify text buffers, RX/TX patterns, output state, and settings are unchanged.

## Approval gate

**Before implementation, request explicit approval for Work Package 13 and its proposed workspace model/wireframe.** Any proposal that changes a sending mode, routing, running service, or buffer lifecycle requires a separate approval. Stop for the owner’s final UX regression pass before treating the workspace redesign as accepted.
