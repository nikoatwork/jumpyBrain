# Choose tests for the change

Before finalizing any repository change, use the smallest checks that exercise the changed behavior and its affected boundary. This applies to plain prompts and task lists. Start with focused tests; add a relevant integration/browser scenario when the change crosses that boundary. Stop when they pass unless a failure, unresolved concern or explicit request justifies more.

## Normal feature work

- Read the owning module docs and inspect the diff. Module test lists are available coverage, not a command to run every listed suite.
- Documentation-only changes need link/command review and `git diff --check`. Small presentation changes normally need the relevant screen check; add deterministic tests when behavior warrants them, not assertions that merely repeat CSS or implementation structure.
- Build once with `npm run build` before checks importing `dist/`. Reuse a build only when its relevant source is unchanged. Run builds sequentially with checks consuming their output; rebuilding during a check invalidates its evidence.
- Run selected Node files with `node --test test/<relevant-file>.test.js`. Narrow by test name only when the remaining cases are unrelated. Find feature tests with `rg` and confirm their prerequisites in the runner/module docs.
- Browser examples use `npx --package=playwright node scripts/<runner>.mjs`, provisioned Chromium (or the supported Chrome fallback), and disposable Markdown. Helpers exporting functions are not standalone test commands.
- For a bug fix, reproduce the failure in a focused case and retain the regression where practical. Reuse fault injection rather than adding another framework for each scenario.

| Change | Smallest useful selection |
| --- | --- |
| Layout, colors, labels or isolated front-end controls | One relevant smoke/visual check from the [browser docs](../src/adapters/http-server/browser.docs.md), exercising affected keyboard/responsive behavior. No collaboration/full UX suite for unrelated styling. |
| Editor transactions, positions, Undo/Redo or reconciliation | Relevant cases in `test/collaboration-editor.test.js`, `test/editor-source-map.test.js` or `test/editor-markdown.test.js`, then the matching [collaboration scenario](#live-editing-and-websocket-scenarios). |
| WebSocket transport, protocol, acknowledgments or reconnect | `test/collaboration-live.test.js`; add client cases in `test/collaboration-editor.test.js` when handshake/events/retry can change. Run the browser failure/recovery scenario affected by the change. |
| Collaboration merge/publication, drafts or stream policy | Select `test/collaboration-model.test.js`, `test/collaboration-hub.test.js`, `test/collaboration-durability.test.js` or the specific stream/recovery test; add a matching browser scenario when user-visible behavior changes. |
| CLI parsing, help, formatting or command behavior | Its CLI test file, e.g. `test/cli-help-validation.test.js` or `test/cli-retrieval-validation.test.js`. Stream/read-base changes use `test/collaboration-cli.test.js` or `test/collaboration-cli-read-base.test.js`. Add app/transport contract checks only if that shared contract changes; no Mac/browser suite for CLI-only presentation. |
| HTTP transport/auth or desktop live proxy/scope switching | Select `test/http-client.test.js`, `test/server-http.test.js` or `test/companion-live-gateway.test.js` for the affected seam, plus the applicable scenario rather than every hosted/native fixture. |
| Native window, menu, IPC, network filter, shutdown or Keychain boundary | Focused host test and one applicable native smoke from the [desktop](../integrations/electron/electron.docs.md) or [gateway docs](../integrations/macos-companion/gateway.docs.md). Shared editor changes normally use Chromium. |
| Retrieval, indexing or semantic behavior | Relevant tests from the [local-memory/QMD docs](../src/app/local-memory/local-memory.docs.md). Semantic claims also need `scripts/semantic-index-smoke.mjs` with provisioned absolute `JUMPYBRAIN_QMD_BIN` and `JUMPYBRAIN_SMOKE_MODEL`; lexical/mocked success cannot establish semantic quality. |
| Imports, extensions, boards or another isolated feature | The owning module's deterministic test and one host scenario only if that host behavior changes. [Find the owner](../src/architecture.docs.md#find-a-subsystem). |
| Feedback/diagnostics | Select the affected test from the [feedback](../src/adapters/feedback/feedback.docs.md) or [diagnostics docs](../src/adapters/diagnostics/diagnostics.docs.md), using a test receiver. Live delivery needs explicit authorization and [inbox verification](check-feedback.md). |
| Layer imports, runtime entrypoints or distribution contents | Select `test/architecture-boundaries.test.js`, `test/package-entrypoints.test.js` or `test/package-footprint.test.js`; packaging/installer/updater/container changes also use the [distribution checks](release-testing.md#choose-extra-checks-for-changed-behavior). |

These are starting points. Match the actual diff and inspect existing assertions rather than running every file in a row.

## Live editing and WebSocket scenarios

Use real editor/backend traffic with controlled delivery. The [existing fault injector](../scripts/collaboration-smoke-transport.mjs) can hold a request, hold/drop a reply, hold a document event, reject a request or disconnect. Install it before navigation. Lost confirmation must account for both RPC response and document broadcast: either can confirm an edit. Connectivity, publication, private draft and agent completion are separate dimensions; see the [connection lifecycle](../src/adapters/live/live.docs.md#editor-connection-lifecycle).

After building, choose the scenario matching the change:

| Risk / transition | Runnable entrypoint |
| --- | --- |
| Human edit in flight while a peer edits; delayed confirmation; positional intent, caret and own Undo; reconnect | `npx --package=playwright node scripts/collaboration-editor-smoke.mjs` (includes the helper `collaboration-intent-proof.mjs` against isolated and shipped bindings). |
| Accepted body edit loses confirmation; peer edits arrive; draft recovery/navigation | `npx --package=playwright node scripts/ux-uncertain-save-smoke.mjs --kind accepted-body --width 1280` |
| Same uncertainty for a title, or a rejected body write | Same runner with `--kind accepted-title` or `--kind rejected-body`. Add `--width 390` for changed narrow controls; omit kind/width to run all six only when shared recovery behavior changes. |
| Initial live editing fails; saved note stays readable; retry/navigation | `npx --package=playwright node scripts/ux-editor-availability-smoke.mjs` |
| Own versus peer notices, repeated updates or stale scope | `npx --package=playwright node scripts/ux-update-feedback-smoke.mjs` |
| Agent finish/cancel feedback, or abandoned stream interruption | Select `scripts/ux-generation-feedback-smoke.mjs` or `scripts/ux-generation-interruption-smoke.mjs` through the same Playwright command. |
| Credential change with a private draft, or retained-version comparison | Select `scripts/ux-credential-draft-smoke.mjs` or `scripts/collaboration-retained-versions-smoke.mjs` through the same Playwright command. |

For selected cases verify exact canonical content and draft preservation plus relevant visible feedback, caret/focus, Undo and navigation. Do not infer Saved from socket readiness or completion from disappearing presence. Keep fault injection on disposable brains.

The uncertain-save runner defaults to no idle soak and one peer edit. Use `--peer-edits`, `--idle-ms` and `--out` only for relevant contention/long-idle concerns or retained replay evidence. `collaboration-composed-smoke.mjs`, production resource proofs and long soaks remain opt-in cross-layer diagnostics, not routine feature gates.

Chromium is the default verification surface for the shared Mac/browser editor. Add native evidence for native boundary changes or native-only failures. The [native experience eval](../evals/workspace-experience/RUN.md) and [retrieval eval](../evals/workspace-retrieval/PROTOCOL.md) answer broader usability/quality questions when explicitly selected; they are not routine commit gates.

## Finalize with evidence

Record the tested commit/build, selected commands/results, reused evidence and why it still applies, and material untested limits. A short note is enough. Skipped/unavailable checks are not passes. Keep failures, fix or explain them, then rerun affected checks.

Do not run unqualified `node --test`, `npm test`, `npm run validate`, every browser script or a full eval merely because a task is ending. Broaden for a concrete cross-cutting change whose relevant coverage cannot be bounded, unresolved failures or an explicit request. Publication retains the existing `npm test` gate under [release testing](release-testing.md); do not repeat it during preparation for unchanged code. Finish through the [task workflow](task-workflow.md).
