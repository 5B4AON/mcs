# Work Package 04 — Relay Privacy and Credential Disclosure

**Priority:** 4 — trust/safety disclosure before relay becomes easier to set up

**Proposed release:** R2 — Inclusive, trustworthy controls

**Dependencies:** None; do not wait for the wizard to correct misleading or missing disclosure

**UI test prohibition:** Do not create or run framework-based UI tests for this package. The owner performs all UI validation manually; follow the viewport checks in the shared roadmap.

**Mobile-first UI constraint:** Follow the shared [mobile-first and responsive UI contract](./00-ROADMAP-AND-IMPLEMENTATION-GUARDRAILS.md#mobile-first-and-responsive-ui-contract). Keep short notice copy within the existing settings-card flow; put detailed explanation in Help or an existing/focused modal rather than widening cards or crowding the header.

## Goal

Explain the existing Firebase RTDB relay model accurately at the point of configuration and in Help: the app is a public browser client, a channel name/secret pair is part of the database path, saved settings are browser-local, and the example rules permit anonymous read/write.

## Evidence and boundary

- `src/app/firebase.config.ts:19-41` shows example `.read: true` and `.write: true` rules and `src/app/firebase.config.ts:65-66` says limits are not enforced by the app.
- `src/app/services/firebase-rtdb.service.ts:27-30,59-65,304-319,564-585` documents/uses the secret as a path segment.
- `src/app/services/settings.service.ts:1022-1044` serializes settings profiles to localStorage, including relay settings.
- The actual production database rules and hosting setup have not been inspected. Do not claim this review proves a live deployment is public or insecure.

## In scope

1. Add short plain-language privacy/trust guidance beside the RTDB channel name/secret controls in:
   - `src/app/components/settings-modal/settings-inputs-tab/rtdb-input-card/rtdb-input-card.component.html`
   - `src/app/components/settings-modal/settings-outputs-tab/rtdb-output-card/rtdb-output-card.component.html`
2. Expand the existing Firebase Help chapter at `src/app/components/help/help-ch-firebase.component.html` with the same facts and a clear explanation of who can read/write under the documented example rules.
3. State that password input masking is only visual, channel values may be stored in this browser's local settings profile, and users should not reuse sensitive credentials or send sensitive content over this relay.
4. Direct project owners to configure and independently review restrictive Firebase rules, validation, quotas/rate limits, and stale-data cleanup. State plainly that the application itself does not enforce server-side limits.
5. Keep the copy accurate if the app has no authentication. Describe the channel token as a shared capability/path secret, not as encryption, user authentication, or a private messaging guarantee.

## Out of scope

- Changing Firebase rules, deploying anything, changing credentials or database URLs, or testing against a live project.
- Replacing the anonymous relay with authenticated access or changing its channel/protocol structure.
- Changing localStorage persistence, introducing encryption, or adding a “remember secret” toggle. Those need a separate threat-model and migration plan with owner approval.

## Implementation instructions

1. Read the RTDB service and both settings cards before writing copy; keep input and output descriptions consistent.
2. Use concise UI text with a link/anchor to the deeper Help explanation. Do not put secrets or real channel examples in screenshots, fixtures, or logs.
3. Preserve the existing mask behavior, storage behavior, connection flow, retry behavior, and channel format exactly.
4. Do not rewrite `firebase.config.ts`'s example as if a different ruleset were safe for the current unauthenticated app. Any replacement rules must be separately designed, compatible with legitimate anonymous relay, and explicitly approved.
5. Have a reviewer compare every security claim against current code and actual text; avoid claims that depend on unverified production configuration.

## Acceptance criteria

- A user configuring RTDB can discover both the shared-channel trust model and the fact that credentials may be saved in browser storage before enabling the feature.
- Help explains the example rule's anonymous access implications, external enforcement boundary, and safe-use limitations.
- No text promises encryption, confidentiality, authentication, or server-side enforcement the app does not provide.
- No Firebase configuration, deployment, RTDB protocol, or local persistence behavior changes.
- Documentation and template changes introduce no new dependencies; `npm run build` passes. Do not create or run automated UI tests.

## Manual owner checkpoint — required before acceptance

Ask the owner to review the final copy for accuracy and tone, confirm it does not imply that production rules were inspected, and confirm that the disclosure is noticeable without crowding on a Samsung Galaxy S21 in portrait. Also resize desktop from narrow through typical to wide widths to check balanced layout and visible/discoverable top-bar actions. If the owner wants authentication, rule changes, or a credential-storage change, stop and create a separately approved security package.

## Approval gate

**Before implementation, request explicit approval for Work Package 04.** This package changes privacy/security messaging; do not modify Firebase behavior. Stop after the owner’s copy review and acceptance.
