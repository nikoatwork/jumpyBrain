# Replace patched editor controllers with an explicit session interface

Status: planned; second suggested pilot, independently gated by the frozen editor evidence. Implementation not started.

## Goal

Give document actions, workspace navigation and attention controls one explicit
editor-session interface. Remove the need to create a persistence controller,
disable its autosave and replace its methods to attach collaboration.

## Reference and scope

- [Editor consumer agreement](../../src/adapters/http-server/browser.docs.md#editor-session-consumer-agreement), [contract guide](../../docs/architecture-contracts.md), and [baseline v1](../../deep-dives/architecture-contracts/baseline-v1.json).
- Concrete coupling: `src/adapters/http-server/notes-browser.ts` controller creation, autosave suppression, live→legacy state projection and method overrides; `document-actions.ts`, `note-workspace.ts`, `note-attention.ts` consume its concrete return type.
- Keep the source-operation model, collaboration hub, canonical publication, wire protocol and private-draft storage format. Do not introduce a UI framework, state-management library or generic event bus. Read-only/offline states and scoped recovery remain first-class.
- This can run separately from backend dispatch work, but start one pilot at a time so behavioral changes remain attributable.

Reference source: `a3e5f00eb428f194d59c77f8d18e9ab83350ec88`. Reference evidence: `.local-pack/architecture-contracts/reference-3`. Independently recorded manifest pin: `3ccde0a0c72f5930f2d9e45650e0bbca1c1b510ad080b8bd51dad19f76f2be4c`. The same source passed from a separate checkout with identical runtime bytes and selected observations. Use checkout-local dependency files and the guide's absolute-baseline verify command.

## Tasks

- [ ] 1.0 Define the smallest consumer interface from actual use.
  - [ ] 1.1 Inventory methods/state read by the three consumers and navigation/save barriers. Tie each to the frozen session agreement; keep connectivity, canonical save, draft durability and agent completion distinct.
  - [ ] 1.2 Introduce a narrow typed interface inside the existing browser adapter. Adapt current behavior behind it before removing legacy machinery; consumers should no longer depend on `ReturnType<typeof createDocumentEditor>`.
- [ ] 2.0 Replace controller patching incrementally.
  - [ ] 2.1 Compose the collaboration-backed session directly, with one owner for input, title, flush, recovery and disposal. Preserve actor-local Undo and actual source intent.
  - [ ] 2.2 Remove obsolete autosave disabling and overridden methods only after proving their remaining consumers migrated. Keep any genuinely supported legacy/HTTP-only path explicit and covered; do not delete it merely because the default is live.
  - [ ] 2.3 Fence late async work across note/brain/principal/tab changes. Preserve unique drafts and storage-failure handling, clean offline navigation, blank-title barriers, retained comparison and guarded restoration.
- [ ] 3.0 Compare to the frozen behavior and finalize.
  - [ ] 3.1 Build once and run affected editor tests plus the relevant Chromium scenario during each step. At integration, run the pinned profile's four journeys: own edit/peer/Undo, lost confirmation on both channels, retained replacement/restoration, and credential transition with a private draft.
  - [ ] 3.2 Compare exact selected observations and unchanged assertions against the original baseline. Retain source selection, actual splices, canonical body, private draft, permission/save states and recovery. Changed implementation-shape assertions need reviewed old/new deltas, never a refreshed golden output.
  - [ ] 3.3 Demonstrate reduced controller/state/persistence ownership. Record tested source, check duration, bundle-budget result from the ordinary build and remaining native/browser limits. Do not infer native menu/Keychain coverage from Chromium.
  - [ ] 3.4 Update owning docs and qualifying changelog/release notes; archive and commit through [task completion](../../docs/task-workflow.md). No push, installation or release is implied.

## Acceptance

Consumers depend on one explicit session interface; the default collaboration
path no longer constructs and patches a redundant persistence controller.
Required navigation/recovery/cancellation behavior and all frozen observations
remain equivalent. Stop or reduce scope if the facade adds another state mirror
instead of removing one.
