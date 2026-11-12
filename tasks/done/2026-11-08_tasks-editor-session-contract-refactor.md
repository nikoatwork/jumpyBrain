# Replace patched editor controllers with an explicit session interface

Status: complete. Direct live sessions replace patched HTTP controllers; original editor observations match exactly. Tested implementation: `bc754a4`.

## Goal

Give document actions, workspace navigation and attention controls one explicit
editor-session interface. Remove the need to create a persistence controller,
disable its autosave and replace its methods to attach collaboration.

## Reference and scope

- [Editor consumer agreement](../../src/adapters/http-server/browser.docs.md#editor-session-consumer-agreement), [contract guide](../../docs/architecture-contracts.md), and [baseline v1](../../deep-dives/architecture-contracts/baseline-v1.json).
- Concrete coupling: `src/adapters/http-server/notes-browser.ts` controller creation, autosave suppression, live→legacy state projection and method overrides; `document-actions.ts`, `note-workspace.ts`, `note-attention.ts` consume its concrete return type.
- Keep the source-operation model, collaboration hub, canonical publication, wire protocol and private-draft storage format. Do not introduce a UI framework, state-management library or generic event bus. Read-only/offline states and scoped recovery remain first-class.
- This can run separately from backend dispatch work, but start one pilot at a time so behavioral changes remain attributable.

Reference source: `eb4388eab838a418c16656d16ea5f14fbf6c008f`. Reference evidence: `.local-pack/architecture-contracts/reference-3`. Independently recorded manifest pin: `3ccde0a0c72f5930f2d9e45650e0bbca1c1b510ad080b8bd51dad19f76f2be4c`. The same source passed from a separate checkout with identical runtime bytes and selected observations. Use checkout-local dependency files and the guide's absolute-baseline verify command.

## Tasks

- [x] 1.0 Define the smallest consumer interface from actual use.
  - [x] 1.1 Inventory methods/state read by the three consumers and navigation/save barriers. Tie each to the frozen session agreement; keep connectivity, canonical save, draft durability and agent completion distinct.
  - [x] 1.2 Introduce a narrow typed interface inside the existing browser adapter. Adapt current behavior behind it before removing legacy machinery; consumers should no longer depend on `ReturnType<typeof createDocumentEditor>`.
- [x] 2.0 Replace controller patching incrementally.
  - [x] 2.1 Compose the collaboration-backed session directly, with one owner for input, title, flush, recovery and disposal. Preserve actor-local Undo and actual source intent.
  - [x] 2.2 Remove obsolete autosave disabling and overridden methods only after proving their remaining consumers migrated. Keep any genuinely supported legacy/HTTP-only path explicit and covered; do not delete it merely because the default is live.
  - [x] 2.3 Fence late async work across note/brain/principal/tab changes. Preserve unique drafts and storage-failure handling, clean offline navigation, blank-title barriers, retained comparison and guarded restoration.
- [x] 3.0 Compare to the frozen behavior and finalize.
  - [x] 3.1 Build once and run affected editor tests plus the relevant Chromium scenario during each step. At integration, run the pinned profile's four journeys: own edit/peer/Undo, lost confirmation on both channels, retained replacement/restoration, and credential transition with a private draft.
  - [x] 3.2 Compare exact selected observations and unchanged assertions against the original baseline. Retain source selection, actual splices, canonical body, private draft, permission/save states and recovery. Changed implementation-shape assertions need reviewed old/new deltas, never a refreshed golden output.
  - [x] 3.3 Demonstrate reduced controller/state/persistence ownership. Record tested source, check duration, bundle-budget result from the ordinary build and remaining native/browser limits. Do not infer native menu/Keychain coverage from Chromium.
  - [x] 3.4 Update owning docs and qualifying changelog/release notes; archive and commit through [task completion](../../docs/task-workflow.md). No push, installation or release is implied.

## Acceptance

Consumers depend on one explicit session interface; the default collaboration
path no longer constructs and patches a redundant persistence controller.
Required navigation/recovery/cancellation behavior and all frozen observations
remain equivalent. Stop or reduce scope if the facade adds another state mirror
instead of removing one.

## Consumer inventory and ownership

- Document actions read identity/lifetime, title/body/hash, save error and live permission; use flush/navigation barriers, guarded reload/publication, private draft selection and retained comparison/restoration.
- Workspace, attribution, related pages and source checks read the same saved/draft/lifetime view; none needs persistence timers or a concrete controller. Attention uses flush, navigation blocking and metadata-only acceptance.
- Host navigation/shutdown uses `hasPending`, `flush`, `setNavigationPending` and cancellation. Clean offline reads can leave; uncertain edits and blank titles cannot.
- `EditorSession` names this agreement. Live connectivity, canonical save and private-draft durability remain distinct; agent completion stays in the generation-feedback presenter. The existing HTTP controller explicitly satisfies the interface and retains its separately tested HTTP autosave/reconciliation path.

## Implementation and focused verification

- Replaced the patched controller with `createLiveEditorSession`. Its readonly consumer view reads through to the collaboration owner, releases the initial HTTP payload after hydration and owns only lifecycle/navigation, draft revision and external-notice timing. Removed HTTP controller creation, autosave suppression, method replacement and mutable live-to-legacy projection from the default shell.
- Retained `createDocumentEditor` as the explicit standalone HTTP implementation; removed its unused browser-bundle export. HTTP polling remains explicitly limited to HTTP sessions. HTTP-only attention/reconciliation behavior remains covered. Live metadata-only acceptance remains conservatively false, matching the old autosave-blocked facade; adding revision-aware HTTP-to-live metadata adoption is outside this behavioral refactor.
- Added deterministic session coverage for acknowledged/private source separation, exact submitted splices, delayed capabilities/open/receipt/canonical-read scope fencing, blank names, clean/offline barriers, credential draft preservation, readonly states, storage failure and idempotent disposal.
- Step 1: build, 55 focused Node cases and the complete collaboration editor Chromium scenario passed before replacing composition. Step 2: build, 74 affected editor/boundary cases and the complete collaboration editor Chromium scenario passed; then 214 consumer/session cases passed. A subsequent focused rerun covered the final late-paint fence; final totals and snapshot follow below.
- Updated navigation fixtures to construct the session interface. The graph shell's obsolete `persistentEditing: true` implementation assertion now requires direct live-session construction and absence of patched methods; its navigation, beforeunload, rich editor and native-dialog assertions remain intact. These files are outside the frozen profile's assertion selection. Every selected editor assertion/helper remains unchanged.
- The actual browser bundle is below the unchanged 223,250-byte gzip gate after dropping the unused HTTP controller export. No dependency or budget increase.

- Final pre-profile focused run: **216/216** Node tests passed in approximately 0.30 seconds across editor-session, notes-browser, graph, lexical-bundle, external-document-updates, note-workspace, note-attention-browser, reference-creation-merge, daily-notes-browser, companion-browser and related-pages. Ordinary build passed in approximately 2.3 seconds; editor **671,081 minified / 221,862 gzip bytes**, same 15 bundled packages, below unchanged **223,250** gzip gate.
- `node --test test/living-sources-browser.test.js`: **6/6 passed** on the final build, including saved-page checks, scope/draft/page fencing and guarded navigation.
- Editor-availability Chromium smoke passed all 1280/390px capability/protocol/server-error, missing-note, delayed-permission and successful retry cases before the final canonical-read/paint scope hardening. The final frozen profile below covers the integrated runtime.

- Additional `npm run check:package-size` failed on the full archive limit. Diagnosed against `cd3c0b0` using `git archive` and the source-matched `backend-operation-v2` frozen runtime (all pre-task TypeScript/build/package inputs matched). Before: **1,462,694 archive / 4,626,120 unpacked / 3,097,996 runtime bytes / 662 files**; the archive, unpacked and file-count limits were already exceeded. The first candidate also introduced a runtime-limit overage; fixed by compacting only the new session artifact using the existing build mechanism and declaring its explicit return interface. Final implementation probe: **1,462,898 / 4,625,405 / 3,097,281 bytes / 666 files**. Runtime is 715 bytes smaller than before and below the 3.1 MB limit; inherited archive/unpacked/file-count failures remain release blockers, not passing checks. No budgets were widened. Temporary package reconstruction was removed.
- `editor-session-v1` passed the entire frozen profile in 55.1 seconds on source `8d98c2c`, manifest `8de6b5bc8348ccd3de754f98d79f535ec673246cd75028b996f43c80a4414c02`. The subsequent declaration/whitespace-compaction change requires the final `editor-session-v2` rerun below.

## Final comparison and remaining limits

- Final command: `npx --no-install --package=playwright@1.64.1 node scripts/multiplayer-verification/architecture.mjs verify --baseline "$PWD/.local-pack/architecture-contracts/reference-3" --baseline-sha256 3ccde0a0c72f5930f2d9e45650e0bbca1c1b510ad080b8bd51dad19f76f2be4c --delta deep-dives/architecture-contracts/backend-operation-delta-v1.json --delta-sha256 aa528140010f583b0a3929be72c2444a4dc068a97b7d5679abfc880ae1ae9c81 --out .local-pack/architecture-contracts/editor-session-v2` — **passed**.
- Tested clean implementation source: `bc754a441f5b18240568e1923668ef6b79d4a15a`. Candidate manifest **`4ea4699974fc1d61d2f09db2ca79a42e2bc836f01ded61731a3b8d615dd3d691`**; original reference manifest remains **`3ccde0a0c72f5930f2d9e45650e0bbca1c1b510ad080b8bd51dad19f76f2be4c`**. Build, **166/166 selected Node contracts** and all four Chromium journeys passed in **54.7 seconds**. All **ten checkpoints** match the original exactly.
- Reused only the prior backend pilot's pinned architecture-classification delta. No selected editor assertions/helpers, checkpoints, fixtures or golden outputs changed. The graph shell's non-profile implementation assertion and navigation factory-fixture adaptations have reviewed old/new hashes in the [compact evidence](../../deep-dives/architecture-contracts/editor-session-v1.json).
- Final declaration/whitespace build adjustment passed **16/16** focused session, bundle and package-entrypoint tests. The earlier 216 consumer tests remain applicable: consumer source did not change; only the new factory return declaration and its emitted whitespace changed afterward. Ordinary editor bundle is **671,081 minified / 221,862 gzip bytes**, below the unchanged 223,250-byte gate.
- Ownership reduction: the default shell creates **one collaboration publication owner**, instead of a live owner plus a disabled HTTP persistence controller. The consumer view reads through to that owner; initial canonical HTTP bytes are released, and consumers no longer read HTTP save timers/in-flight state. The standalone HTTP path and its tests remain available.
- Owning browser/footprint docs, pending release notes and the structural changelog are updated. Scoped relative links and `git diff --check` are checked before final commit. Finalization changes only task/evidence/owning documentation; tested runtime inputs remain identical.
- Limits: selected Chromium contracts and fake-QMD fixtures establish neither whole-app/cross-browser equivalence nor native menu/Keychain/login/signing, semantic-model quality, physical accessibility, power-loss or public deployment behavior. Live metadata-only HTTP adoption remains unavailable as before. Full package archive/unpacked/file-count overages predate this task and remain release blockers; this is not a release gate. No push, installation or release is authorized by completion.

## Scoped follow-up

- [Live attention on the open note](../todo/tasks-live-note-attention.md) tracks the preserved HTTP-metadata/live-revision adoption limitation; it is planned separately from this completed refactor.
- [Reviewed distribution ceiling refresh](2026-11-08_tasks-distribution-budget-refresh.md) records the subsequent user-authorized limit adjustment and passing package gate; the overage measurements above remain historical evidence.
