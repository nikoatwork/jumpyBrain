# Experience protocol v1

## Boundaries

Human-side actions use native computer use against the real Mac app. Agent-side actions use the supported CLI, including remote transport; no direct hosted API or server filesystem inspection. Seed/setup and canonical verification are explicitly separate from scored UI actions. Record default installed CLI separately when using the bundled CLI. Record hosted release version as unknown unless authoritative version evidence exists; status compatibility is not a complete version/capability claim.

The fixture is a small fictional community workshop project. Core execution covers capture, handoff/search/links, shared boards, live coauthoring and off-note work. Probes cover producer cancellation and saved/index state. Uncertain human-save recovery is a separately named checkpoint: cancellation does not prove it. Do not fault a shared server or overwrite personal files to induce a state.

## Run identity and outcomes

Freeze protocol, missions, fixture and rubric hashes; record repository revision/dirty state, installed app and CLI identities, native OS/architecture, executor model/effort, tool availability, target alias/mode, authorization reference, app profile, readiness and relevant UI preferences. Private target bindings remain in the private manifest. App resources and CLI identities are hashed. Recheck identities/inputs during verification; a changed environment is not silently accepted.

Every selected checkpoint is reported, including blocked/not-run cases. Outcomes: `pass`, `fail`, `blocked`, `unverified`, `not_run`. Separately record product failure, tool/environment blockage, invalid fixture, missing evidence, unsupported capability and assistance. Capture attempted actions even when the tool fails. Keep first attempt and assisted recovery distinct; never overwrite a checkpoint. A case that cannot safely induce an intermediate state is unverified/not-run, not passed from final content.

Pilot budgets: 25 UI actions/8 minutes per simple mission, 50/15 minutes for coauthoring. These bound investigation, not human usability targets. Count clicks, drags, key chords and text-entry actions; observation calls are separate. Record product waits separately from agent/tool overhead where observable. A timeout remains an outcome; diagnostic continuation is a new attempt. Adjust budgets once after the pilot, versioning the protocol before baseline.

## Evidence

Capture UI before/after meaningful transitions: timestamp, screenshot, AX text when available, current destination and visible status. Canonical evidence comes from supported CLI `show`/board reads and write receipts. Correlate evidence to note IDs/revisions/hashes and stream IDs, not titles alone. A screenshot of Saved plus matching canonical content supports that observed checkpoint; it cannot establish an earlier unobserved confirmation. Avoid claiming exact latency from sparse samples.

The private run stores CLI argv (without keys), outputs, action/checkpoint events, manifest, ledger, canonical snapshots and UI captures. Credential values are never written to receipts. Screenshot content can still be sensitive. Only inspected allowlisted summaries enter tracked reports; no raw target origin, local root, profile names, personal titles or arbitrary logs. Retain a checksummed archive; broken/deleted evidence links invalidate supported claims.

Helpers must not silently retry writes, repair fixtures, retarget commands, open hidden routes, solve UI navigation or manipulate product internals. A successful CLI receipt never proves visible feedback or UI task completion. Search quality here is journey completion, not another retrieval benchmark; use `../workspace-retrieval/` for quality/cost claims.

## Cleanup and release

Before deleting a run-owned record, verify its current content and last observed hash. Stop on unexpected edits, references, lost response or ownership ambiguity. Delete boards before notes, preview notes, use current hash preconditions and preserve all receipts. Cleanup failure is a reported outcome, not permission to force/reset. Restore original app selection through native UI.

This suite complements deterministic checks and real dogfooding. It is manually selected evidence for relevant changes under `../../docs/release-testing.md`, not a new default release gate. No release, upgrade, external feedback or installation is implied.
