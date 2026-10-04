## Summary

<!-- What changed and why? Keep this focused on user-visible or maintenance outcomes. -->

## Related issue

<!-- Link the work-package issue, e.g. Closes #123. Leave open if manual owner acceptance is still pending. -->

## Change type

- [ ] Bug fix
- [ ] Feature
- [ ] Documentation
- [ ] Refactoring / maintenance

## Scope and safety

- [ ] The change stays within the approved issue scope.
- [ ] Existing settings, routing, buffers, and device behavior are preserved unless the issue explicitly approves a change.
- [ ] No output/transmitter path is silently enabled, redirected, or tested.
- [ ] No credentials, relay secrets, or sensitive device details were added to code, logs, fixtures, or screenshots.
- [ ] No Firebase deployment or live-production relay test was performed.

## Validation

- [ ] `npm run build` passes.
- [ ] Relevant existing non-UI unit tests pass, if applicable.
- [ ] No automated UI tests were added or run. UI tests are performed manually by the owner.
- [ ] Documentation/help was updated where user-facing behavior changed.
- [ ] Changelog/version updates were made only if the approved issue requires them.

## Manual owner verification — UI changes only

- [ ] Owner reviewed behavior on the Samsung Galaxy S21 in portrait at the default zoom.
- [ ] Owner checked the shared responsive viewport matrix, including breakpoint edges, narrow/short layouts, desktop resizing, and 200% zoom.
- [ ] Current human-tested font, button, touch-target, and spacing scale is preserved; no clipping, overlap, hidden top-bar controls, or horizontal scrolling was introduced.
- [ ] Keyboard/touch/focus behavior and the issue-specific manual acceptance scenarios were checked.
- [ ] Owner explicitly accepted the UI behavior before this package is considered complete.
- [ ] Not applicable — this PR does not change UI behavior.

## Screenshots

<!-- Optional. Never include secrets or sensitive device information. Screenshots are not a substitute for owner-run manual verification. -->
