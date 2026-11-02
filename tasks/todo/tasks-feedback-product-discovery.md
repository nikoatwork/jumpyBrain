# Feedback triage and bounded product discovery

Priority: P2 for discovery. Status: live inbox triage complete; the product questions below remain open. Creating these lists implements no product feature and authorizes no release, installation, inbox reply or personal/shared-memory mutation.

## Goal

Preserve actionable feedback as focused plans, avoid reopening completed work, and evaluate larger proposals against the lean Markdown-native product before turning them into implementation scope.

## Inbox evidence — 2026-11-02

- Live read-only `npm run --silent feedback:inbox` checked `jumpybrain@agentmail.to` at **09:43:06.102 UTC / 10:43:06.102 Europe/Berlin**. No date bounds: one page, 29 received messages scanned, `complete: true`, no continuation, two explicitly marked synthetic tests excluded, 27 non-test previews inspected. Returned message dates span 2026-10-20 through 2026-11-02.
- Detailed recent review covers 13 non-test reports dated 2026-10-30 through the check: 12 full bodies fetched through 09:44:55.588 UTC and the complete short folder-request preview. The earlier 14 non-test reports received preview-level review only; this is not a full historical audit or a claim that every older request is resolved.
- Recent feedback comprises direct user reports, explicitly agent-authored review/setup reports and implementer deployment follow-ups. Relay sender addresses do not establish independent users. The five-part review is one review series, not five independent confirmations.
- Spam, trash/blocked mail and attachment contents were not inspected. Message/attachment metadata was sufficient for planning; the new editor list explicitly records the outstanding diagnostic read. No reply, test send, label change or deletion was performed.
- Only sanitized summaries and source links are retained here; no raw message bodies, private note content, credentials or user filesystem paths.
- Planning verification: eight active lists retain unchecked implementation/discovery tasks; all 42 relative links and 65 explicit source/document path references in the new lists resolve. Whitespace validation passed. No runtime tests, diagnostic attachment reads, product changes or installation checks were performed during this triage. Existing installation/retrieval plans link back to the new owners; pending release notes and the product changelog are unchanged for planning alone.

## Prioritized follow-ups

| Priority | Owner | Scope |
| --- | --- | --- |
| P0 | [Idle-note editing](tasks-stale-note-editing.md) | Reproduce source mapping failure after idle and preserve exact source/drafts. |
| P0/P1 | [CLI help and validation](tasks-cli-help-and-validation.md) | Stop help from executing operations; make help/argument errors consistent. |
| P1 | [Brain connections and targeting](tasks-brain-connections-and-targeting.md) | Supported local app connection management, effective target diagnostics and shared precedence. |
| P1 | [Desktop runtime hygiene](tasks-desktop-runtime-hygiene.md) | Safe staging/log retention, durable daemon paths, managed skill drift and lifecycle diagnostics. |
| P1/P2 | [Agent interface efficiency](tasks-agent-interface-efficiency.md) | Smaller initial guidance, compatible output/identity decisions, read-only lint and support-report ergonomics. |
| P1 | [Retrieval trust/readiness](tasks-retrieval-trust-and-readiness.md) | Honest readiness, semantic setup, weak-match calibration and evidence-date investigation. |
| P1/P2 | [Hosted build/operations](tasks-hosted-build-and-operations.md) | Missing Docker build inputs, current access docs, migration and recovery. |
| P2 | This list | Evaluate onboarding, graph/source maps, digest/eval/docs and board adoption before adding scope. |

Priority is triage judgment, not a confirmed root cause or release promise. Start with idle-note reproduction and side-effect-free help; keep speculative ranking/schema changes behind their evidence gates.

## Existing coverage and retained limits

- [Fresh-note report, 2026-11-02 08:22 UTC](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=7b17c89c-2962-451e-89cb-fdac3d72118f) maps to [completed source work](../done/2026-11-02_tasks-fresh-note-edit-feedback.md), verified commit `11f9951`. This is source coverage, not a claim of a new installed/published fix; the later idle-note report has a separate owner.
- [Folder request, 2026-10-30](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=9af6d048-671a-4d05-b4bc-de1b434618d5) maps to [folder explorer](../done/2026-11-01_tasks-folder-explorer.md) and [folder actions](../done/2026-11-01_tasks-folder-explorer-actions.md); no duplicate feature plan.
- [Install report, 2026-10-30](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=cbdb4899-90c7-422d-8994-b5abca0b838a) maps to [verified agent installation](../done/2026-11-01_tasks-agent-installation.md). Native-toolchain removal, platform/distribution and CLI footprint work remain with [portable installation](tasks-portable-installation-project-integration.md) and [update speed](tasks-desktop-update-30-seconds.md).
- [Remote UX report, 2026-10-31](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=380775cd-8a48-4921-a99a-431c628a19c1) and its [implementer follow-up](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=335625ad-e8d0-4e60-9957-8f685bc76645) map to [completed Mac/HTTPS work](../done/2026-10-31_tasks-remote-switching-ux.md). General cross-release signing/Keychain continuity remains open distribution work; identical-install success does not prove it.
- Existing [workspace evaluation](tasks-workspace-retrieval-evaluation.md), [portable installation](tasks-portable-installation-project-integration.md), [RAM](tasks-desktop-ram-next-improvements.md), [properties/views](tasks-properties-and-saved-views.md) and [sandbox](tasks-public-sandbox-hardening.md) lists retain their scopes/budgets. No boilerplate release-note or changelog entry is needed for task creation alone.

## Discovery evidence and constraints

Primary proposals: [review part 5, 2026-11-02](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=454167e2-14ab-4627-b257-9eb7d8b56448), with link/type/map suggestions in [part 2](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=9254c8d1-7155-45b1-9dc7-dc49c85b9fe0). These are hypotheses, not adopted architecture.

- Reuse explicit `process --mode synthesize` extractive source maps before inventing automatic hub pages. Generated maps are not reviewed synthesis; preserve original evidence and ownership protections.
- Preserve Markdown canonical storage, rebuildable retrieval, explicit recall and explicit writes. Do not infer event dates from import times, promote note types automatically or upload quality signals without authorization.
- Prefer a small navigation/documentation fix over moving all docs or adding another runtime service. Boards and saved views must stay within current product guardrails.

## Tasks

- [x] 1.0 Inspect the live inbox, distinguish tests/review provenance, read recent reports and compare existing task/source coverage.
- [x] 1.1 Create focused follow-up owners with sanitized source links, priorities, validation and remaining limits.
- [ ] 2.0 Evaluate the first useful onboarding outcome.
  - [ ] 2.1 Compare current verified installer/init behavior with the proposal to complete first recall quickly. Measure a disposable fresh-root and existing-notes journey; avoid reading/printing private content or creating example notes silently.
  - [ ] 2.2 Decide whether a concise next-step/semantic-readiness explanation solves the observed gap before expanding init. Coordinate target resolution and semantic costs with their owning lists.
- [ ] 3.0 Evaluate link diagnostics and optional compression.
  - [ ] 3.1 Inventory existing graph/lint unresolved-link and orphan evidence. Define a bounded read-only listing of target, referencing source and ambiguity; reuse canonical resolution rather than creating a new link grammar.
  - [ ] 3.2 Compare explicit existing extractive maps with any hub-page proposal on frozen shallow-recall cases. Record adopt/defer criteria; no scheduled writes, stub creation, fuzzy link rewrites or automatic type promotions by default.
- [ ] 4.0 Evaluate human-facing provenance and quality views.
  - [ ] 4.1 Assess a small read-only recent-change/agent-contribution digest using existing provenance, with clear interval, missing-history and identity limits. Decide whether current activity views already satisfy it.
  - [ ] 4.2 Evaluate an opt-in local retrieval self-check under the existing workspace-evaluation protocol. Title/body self-tests are diagnostics, not answer-quality proof; no automatic feedback/telemetry upload or model download.
- [ ] 5.0 Validate board value before widening collaboration.
  - [ ] 5.1 Define a voluntary usage question and success criterion for a single user's sustained board workflow. Reuse existing three-column behavior; do not add product tracking or claim month-long evidence without actual observation.
- [ ] 6.0 Improve entry-point and feedback trust proposals selectively.
  - [ ] 6.1 Review README/install navigation for app, agent memory and team-server journeys; prefer clear links to product vision/user/operator material over a docs-tree move without a demonstrated navigation need.
  - [ ] 6.2 Check existing packaged feedback configuration gates before adding a doctor probe. Any network health check must be explicit and read-only, send no report/content, and distinguish reachability from inbox delivery.
- [ ] 7.0 Close discovery with concrete decisions.
  - [ ] 7.1 Record adopt/defer/reject outcomes and evidence; create narrow implementation lists only for retained proposals and link existing owners for overlap.
  - [ ] 7.2 Record validation/limits and archive/commit under [task completion](../../docs/task-workflow.md) once discovery is complete. Keep this list active while required questions remain open.
