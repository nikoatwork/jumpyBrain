# Independently shippable feedback increments

Status: planned, 2026-11-02. This is an implementation backlog, not a release commitment. No product change is implemented by this review.

## Goal

Make the existing Markdown memory engine dependable in daily human-and-agent use: recover connections, retrieve paraphrases without losing exact constraints, preserve evidence dates, and expose trustworthy save/review state. Each numbered task below is a separate useful shipment; do not bundle the whole list into one feature or release.

## Live review and evidence

- Ran the documented read-only `npm run --silent feedback:inbox` at **2026-11-02 11:42:18.561 UTC / 12:42:18.561 Europe/Berlin**. No date bounds; received, non-spam scope; one page, **38 scanned**, `complete:true`, no continuation, **2 marked delivery tests excluded**, **36 non-test previews reviewed**. Returned dates span 2026-10-20 through 2026-11-02.
- Read all **17 reports received today** in full through the message API. Nine arrived after the previous [09:43 review](../done/2026-11-02_tasks-feedback-product-discovery.md). Older reports received preview-level review and comparison with existing task records; this is not a full historical body/attachment audit.
- The latest batch is largely an agent-authored review and its follow-ups, alongside direct editor reports. Several messages repeat/consolidate one review; message count does not establish independent users. Relay sender identity does not identify the original author.
- No attachment contents were fetched in this review. The existing idle-editor investigation records its separate diagnostic read. Spam, trash and blocked mail were not inspected. No replies, sends, label changes or deletions occurred.
- Planning baseline: `ee4dcb8` on `master`, plus pre-existing uncommitted task/integration records. Compared current source, completed guidance/help/targeting/retrieval work, active owners, [product vision](../../docs/product-vision.md), [glossary](../../glossary.md) and [task workflow](../../docs/task-workflow.md). Bounded local memory recall supplied no relevant product decision; repository strategy and decision records govern this plan.
- Source inspection confirms the broad constraint detector, combined lexical/vector query with semantic weight `0.9`, and daily creation preserving an omitted `draft.date`. It does **not** reproduce the reported private-corpus rankings, launch failure or backend recovery sequence. Feedback numbers remain reported observations.
- Current source already supplies live declared actor names, conditionally hides Recover draft, and handles feedback-dialog Escape. Tasks 5, 7 and 8 must check the matching artifact/state first; retain a repair only for a demonstrated remaining gap. An older installed report does not justify rebuilding these capabilities.

### Sources

All source dates below are 2026-11-02 UTC. Retain sanitized summaries, not private bodies or diagnostic contents.

| Key | Time | Feedback |
| --- | --- | --- |
| F1 | 10:29 | [Quit/relaunch failure and managed-runtime Electron script](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=771089e6-0aba-4bfd-b500-05d6acbb8580) |
| F2 | 10:23 | [Consolidated bug reproduction list](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=26d39c9e-f1fd-48f2-b3b0-5209892c6acf) |
| F3 | 10:20 | [Semantic constraint/fusion diagnosis](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=16c8b8a2-6c52-4f09-89b3-c77a001ab2cd) |
| F4 | 10:05 | [Semantic setup and portable model request](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=72648798-0571-4320-9aab-659f3ef0d111) |
| F5 | 09:55 | [App/CLI tandem observations](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=2aefd4f7-830f-4a5e-ad0e-db43270b14e5) |
| F6 | 09:55 | [Two-brain daily workflow](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=7ef28f4a-dedc-42cf-a622-1f23afd76aa5) |
| F7 | 09:55 | [Ranked workflow proposals](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=ea8da679-c5a2-4200-8287-cfea5803944b) |
| F8 | 10:23 | [Complexity reduction proposals](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=63416e28-d677-48ed-ab13-6f797e78ff2d) |
| F9 | 10:23 | [Opinionated human/agent/team workflow proposal](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=32c26552-9a83-4a4a-bedd-002dfd18bbd8) |

## Product choices

- Reliability and evidence quality come first. Match the vision with correct semantic/temporal behavior before expanding navigation or collaboration.
- Keep one engine, canonical Markdown, bounded source-backed recall, explicit expansion and existing local/hosted transport boundaries. No automatic capture, prompt injection, external-tool ingestion or scheduled synthesis.
- Preserve exact identifiers and explicit search constraints. A natural-language question containing a ticket ID must retain its binding; simply deleting the constraint detector would be an unsafe implementation.
- A daily capture already has an explicitly selected calendar date: write that as evidence `date`. Keep `type: note` for this increment. A new `journal` type, historical backfill and opening today's note automatically are separate product decisions.
- Preserve personal/team separation and destination-specific write authorization. App selection does not retarget the CLI. Existing app connections and configured CLI defaults remain the baseline; no shared global registry is required for these increments.
- Keep save success separate from derived indexing and declared actor names separate from authenticated identity. Attention means resurfacing/review state, not proof that a human read or approved an agent contribution.

## Shipping order and existing owners

Priorities are planning judgments. Rows can ship separately as soon as their own acceptance checks pass. Order within a priority is suggested, not a dependency graph.

| Priority | Shipping unit | Ownership / boundary |
| --- | --- | --- |
| P0 | Recover app after local backend restart | New task 1 below. |
| P0 | Resolve idle-note edit failure | Continue [idle editing](tasks-stale-note-editing.md); do not duplicate its source fix or declare its unknown reproduction resolved. |
| P0 | Restore reliable Quit/open launch | Continue [runtime hygiene](tasks-desktop-runtime-hygiene.md), tasks 3.4/4.3. **F1 adds a concrete sequence:** failure after Quit, direct/open launch exits, LaunchAgent bootstrap restores startup. Re-test both loaded/unloaded service states on a matching disposable packaged app; this narrows the previous missing-reproduction blocker without proving a cause. Keep source diagnostics separate from required packaged launch verification. |
| P1 | Natural-language semantic eligibility | New task 2; retain exact-query controls. |
| P1 | Useful vector contribution | New task 3; test independently from task 2. |
| P1 | Dated daily captures | New task 4. |
| P1 | Accurate stream attribution and health identity | Tasks 5 and 6, two separate small shipments. |
| P1 | Relevant recovery actions and resilient feedback form | Tasks 7 and 8, two separate UI shipments. |
| P1 | Consistent indexing outcomes | Task 9; preserve asynchronous success semantics where intentional. |
| P2 | Agent access to note attention | Task 10; use existing attention policy. |
| P2 | Fewer sidebar requests | Task 11; first measure the reported request amplification. |
| P2 | Explicit, portable semantic setup | Task 12; optional setup ships independently, any future default change requires measured retrieval/resource evidence. |

## Relevant implementation seams

Read `src/architecture.docs.md` and the nearest co-located module docs before implementation. Locate the actual owner before editing; these are starting points, not permission to widen a source layer.

- `src/app/backend-host/`, `src/adapters/backend-host/`, `src/cli/companion.ts`, `integrations/electron/` — backend identity, app gateway and desktop lifetime. Reuse authenticated descriptor handling rather than putting file watching in the browser.
- `src/adapters/qmd/qmd-query.ts`, `src/adapters/qmd/qmd-ranking.ts`, `src/adapters/qmd/qmd.docs.md` — query eligibility, branch execution and ranking. Use [workspace evaluation](tasks-workspace-retrieval-evaluation.md) and `evals/workspace-retrieval/PROTOCOL.md` for ranking adoption.
- `src/app/server-memory/daily-note.ts`, `src/core/writing/`, `test/server-daily-note.test.js`, `test/daily-notes-browser.test.js` — daily date and idempotent capture.
- `src/cli/collaborate.ts`, `src/app/collaboration/`, `src/adapters/live/`, `src/core/contribution.ts` — declared contribution versus live authenticated client identity.
- `src/adapters/http-server/routes.ts`, `src/adapters/package-info/`, `src/server/daemon.ts` — executing-build health identity.
- `src/adapters/http-server/document-actions.ts`, `src/adapters/http-server/collaboration-drafts.ts`, `test/feedback-dialog.test.js` — scoped draft recovery and feedback UI entry points.
- `src/app/writing/`, `src/app/local-memory/document-delete.ts`, `src/app/server-memory/`, `src/cli/local-transport.ts` — publication and derived-index outcomes.
- `src/core/attention.ts`, `src/app/server-memory/attention.ts`, `src/adapters/http-server/browser-attention.ts`, `src/cli/` — attention policy, read/write transport and sidebar observation.
- `scripts/public-install.mjs`, `docs/install.md`, `docs/cli-commands.md` — explicit semantic setup and configuration ownership. Coordinate model resource work with [RAM improvements](tasks-desktop-ram-next-improvements.md).

## Tasks — independent delivery units

- [ ] 1.0 **P0 — Reconnect the app to a restarted local brain backend.** F2 B2, F5.
  - [ ] 1.1 Reproduce with a disposable selected local root: open a note/board, stop the backend through the CLI, let recall start a replacement on a different port, then use Retry. Record old/new backend identity and the failing gateway operation.
  - [ ] 1.2 Rediscover and authenticate the replacement through the existing host/descriptor seam with bounded retry. Fence old requests/subscriptions by brain/profile/backend identity, resynchronize live revisions, and preserve unpublished drafts. Do not automatically republish an old draft or retarget another brain.
  - [ ] 1.3 **Ship when:** saved notes, boards and search recover without quitting; unchanged and conflicting private drafts remain recoverable; changed roots, stale/foreign descriptors, incompatible versions and a genuinely unavailable backend fail clearly. Verify the production gateway and matching packaged Mac path. This unit requires no launch-service redesign or retrieval change.

- [ ] 2.0 **P1 — Let ordinary language reach semantic discovery while retaining exact constraints.** F3.
  - [ ] 2.1 Freeze paired fictional questions containing natural negation, hyphenated words, contractions, camelCase and ticket IDs, with exact phrase/path/exclusion controls and distractors that violate the identifier or negation. Establish actual QMD syntax before defining a narrower rule.
  - [ ] 2.2 Separate semantic eligibility from lexical rewriting/constraint enforcement where needed. Do not drop identifiers, quoted intent, exclusions or canonical/temporal eligibility merely to enable vectors. Expose truthful branch/fallback reasons using the existing diagnostic seam.
  - [ ] 2.3 **Ship when:** provisioned semantic execution reaches eligible natural-language cases, explicit constraints remain honored, and lexical/strict-read-only behavior remains correct. Run this as its own frozen candidate under the existing quality/cost protocol; no model download or universal score-confidence threshold. Keep fusion unchanged in this unit.

- [ ] 3.0 **P1 — Give vector results a measured opportunity to improve recall.** F3.
  - [ ] 3.1 On unconstrained fictional paraphrases, freeze the current combined-query baseline and compare a separately bounded vector branch, with at most one original lexical line if useful. Record branch candidates, selected evidence, qualifications and full interaction/operational costs. Do not reuse private reported queries or adopt their claimed hit-rate gain as our result.
  - [ ] 3.2 Choose the smallest fusion change supported by paired evidence; preserve limits, cancellation, exact-title navigation, temporal filtering and honest failed-branch warnings. Do not prescribe RRF or add votes across correlated lexical variants without the comparison.
  - [ ] 3.3 **Ship when:** the existing evaluation adoption gates show paraphrase benefit with required evidence/abstention nonregression at the stated context/resource budgets, including cold/warm costs and local/hosted CLI parity. Task 2 is not a prerequisite: evaluate on currently eligible queries and keep constraint policy fixed. If no candidate passes, record the defer result rather than shipping an unproven ranking change.

- [ ] 4.0 **P1 — Give new daily notes their selected evidence date.** F2 B6, F5.
  - [ ] 4.1 Propagate validated `dailyDate` to canonical `date` for explicit daily creation; define conflicting supplied dates as invalid. Use the selected local calendar day, not an inferred event year or ingestion timestamp. Preserve existing titles, suffixes, IDs, `type: note` and idempotent retry behavior.
  - [ ] 4.2 **Ship when:** a new daily note is available to same-day temporal recall and the corresponding dream evidence window; midnight/time-zone boundaries, retries and multiple daily notes pass. Ordinary undated notes remain undated. No historical title/created-time backfill, type migration or default navigation change is included.

- [ ] 5.0 **P1 — Verify consistent declared agent attribution through live writes; repair only a residual gap.** F2 B7, F5.
  - [ ] 5.1 Compare the reported installed build with [completed attribution work](../done/2026-11-02_tasks-contextual-editor-attribution.md). Current CLI streams pass `declaredActor` from the owner/client-name configuration. Trace name/ID through publication and filters; distinguish a live session `--client-id` from a declared display name and document the supported setup. Do not infer authorship from access-principal labels or TTY state.
  - [ ] 5.2 **Ship when:** remember, guarded update and stream from the same explicitly named agent produce consistent creator/latest-editor declarations and app More info/recall filters; creator remains intact, external edits invalidate stale attribution, and unknown actors remain unknown. Reader/write policy and authenticated lease ownership stay enforced. No contributor-history store is needed.

- [ ] 6.0 **P1 — Report the executing backend build in health.** F2 B10, F5.
  - [ ] 6.1 Reproduce health versus backend/UI identity using two disposable runtime versions; distinguish an old running process from a package-version lookup/cache/path bug before changing code.
  - [ ] 6.2 **Ship when:** `/health`, backend status and UI identify the same executing build where applicable, and a deliberately old daemon is visibly old rather than relabeled with the installed version. Verify staged/installed and hosted paths without leaking local paths or capabilities. This is independently useful even before restart recovery lands.

- [ ] 7.0 **P1 — Verify that draft recovery reflects actual retained state; repair only a residual gap.** F2 B14, F5.
  - [ ] 7.1 Current rendering already hides the action unless recovery drafts, failed saves or a failed companion session require it. Reproduce the reported Saved-plus-recovery state on the matching artifact and inspect actual draft storage, including invalid or identical records. Reuse draft brain/principal/document/client scope; distinguish an unpublished recovery candidate from the currently saved content. Close as covered if current behavior is correct.
  - [ ] 7.2 **Ship when:** a clean saved note exposes no irrelevant recovery action visually or to accessibility tools; a real retained draft has a meaningful time/context and remains recoverable across reconnect/reload. Failed inspection or invalid storage must preserve bytes and explain recovery limits. No automatic draft deletion or conflict-policy change.

- [ ] 8.0 **P1 — Make the feedback dialog dismissible without losing its text.** F2 B2/B14, F5.
  - [ ] 8.1 Verify existing Escape/focus restoration on the matching packaged app, including sending/collecting states; change it only if a real dismissal gap remains. Preserve unsent text through local-backend reconnect, reusing existing close/reopen retention. Choose an app/device-local draft scope independent of note storage; if restart persistence is retained, bound it, define discard/accepted-send cleanup and keep diagnostic attachments separately opt-in.
  - [ ] 8.2 **Ship when:** keyboard dismissal, focus trapping, cancel/reopen, reconnect and failed delivery retain the draft appropriately; accepted delivery clears only the confirmed submission and never triggers an automatic retry. Verify with a fake relay and production shell; no live support email is required.

- [ ] 9.0 **P1 — Make write/index outcomes consistent and self-explanatory.** F2 B8, F5.
  - [ ] 9.1 Reproduce remember/wrapup/delete through the shared backend; distinguish intentional deferred indexing from stale status or a missing maintenance trigger. Trace canonical publication, pending work and successful generation observation separately.
  - [ ] 9.2 Reuse the existing maintenance/publication queue for any proven gap. Report saved/deleted canonical success plus indexed/pending/failed derived state and an actionable next step only when necessary; do not force every live write to wait on embeddings.
  - [ ] 9.3 **Ship when:** all three paths truthfully report their state, deleted notes do not appear as usable evidence, and quiet maintenance converges without manual repeated writes. Cover immediate recall, concurrent publication, interrupted/failed indexing and local/hosted CLI behavior. Preserve idempotent saved IDs and reader permissions; no synchronous-indexing promise unless its cost is verified.

- [ ] 10.0 **P2 — Expose existing note attention through the CLI.** F7.
  - [ ] 10.1 Add focused list/settle/snooze/bring-back operations through existing app/runtime and local/remote transport seams. Reuse canonical attention semantics, explicit mutation authorization and bounded enumeration with visible omissions.
  - [ ] 10.2 **Ship when:** an agent can list currently resurfacing notes and explicitly change one note's attention, matching app state; reader credentials can list but cannot mutate. Lists distinguish valid declared actors from unknowns. Settled is not labeled read/approved, and device-local pins/recent are not presented as shared state. No separate inbox database, notification system or automatic session-start injection.

- [ ] 11.0 **P2 — Bound redundant sidebar loading.** F2 B13, F5.
  - [ ] 11.1 Measure production-shell requests on a fixed eight-note fixture: cold connect, reconnect, idle poll and one note edit. Attribute repeated document/status/attention loads to their caller before choosing request coalescing, existing projections or an endpoint change.
  - [ ] 11.2 **Ship when:** the measured duplicate work falls without losing card excerpts, timely confirmed writes or independent error/readiness states. Record counts/bytes and delayed-transport behavior, cancel stale brain requests, and retain visible caps. No canonical body cache or shared pin schema is justified by this task alone.

- [ ] 12.0 **P2 — Offer one explicit, portable semantic setup path.** F4, F8 C11.
  - [ ] 12.1 Extend the existing setup/index seam with an explicit consented local-model provision/select flow and verified artifact identity, expected disk/download cost and compatible-platform limits. Resolve a stable model identity through device-local configuration; retain explicit-path compatibility and keep machine paths out of shared canonical policy where possible. Do not create a second brain registry.
  - [ ] 12.2 Make app/status/doctor distinguish lexical, semantic-ready, unavailable and failed/incomplete states, with one supported next action. Recall/status remain non-downloading; remote agents cannot send arbitrary model paths to a server. Keep lexical use functional without model setup.
  - [ ] 12.3 **Ship when:** consent/decline, offline/corrupt/interrupted provision, repeat invocation, a moved/cloned brain and missing-model fallback are truthful; canonical notes remain unchanged. Record actual model/platform cold/warm and memory limits with the existing RAM owner. Optional setup can ship alone; semantic-by-default and daemon model warming require separately demonstrated quality/resource benefit, including tasks 2/3 findings, before adoption.

## Coverage, deferrals and scope cuts

| Feedback | Decision / existing owner |
| --- | --- |
| Unsafe/inconsistent help, swallowed flags, false root alarm | Covered in source by [help](../done/2026-11-02_tasks-cli-help-and-validation.md) and [targeting](../done/2026-11-02_tasks-brain-connections-and-targeting.md). Verify the eventual shipped artifact; do not reopen the same implementation from an older 0.3.17 report. |
| Long guidance and no observational lint | Covered by [on-demand guidance and lint preview](../done/2026-11-02_tasks-agent-interface-efficiency.md). Use its existing topics/preview. Fuzzy auto-fixes, deleting recipes and replacing all output contracts remain deferred. |
| Update staging, live runtime pins and managed skills | Source work exists in [runtime hygiene](tasks-desktop-runtime-hygiene.md); forward retention does not establish safe ownership of old unmarked folders. No user-machine cleanup is authorized by this plan. |
| Electron payload and managed dev-script download/launch footgun | Add F1's scenario to [portable installation](tasks-portable-installation-project-integration.md): measure actual published artifact, then omit desktop-only dependencies/scripts or guard development entrypoints. Validate remote-only CLI and app addition. No package split or Electron download is assumed necessary. |
| Semantic score warnings and imported recency | Preserve [retrieval decisions](../done/2026-11-02_tasks-retrieval-trust-and-readiness.md). Scores are not calibrated confidence. The optional imported-recency candidate remains with [workspace evaluation](tasks-workspace-retrieval-evaluation.md); never rewrite creation history to invent evidence dates. New daily dates are task 4's explicit capture case. |
| Brain registry, active-app-as-CLI-default, multi-brain fan-out | Defer. Supported connections/default targeting already landed; a registry replacement adds migration/policy complexity. Fan-out needs a separate demonstrated need, per-brain scope/cost/failure accounting and private/team disclosure rules. Every write remains one explicit authorized destination. |
| `source`, `observed`, `refs[]` and external-tool chips/edges | Defer dedicated schema/connectors. Body links already preserve source routes; use [properties/views](tasks-properties-and-saved-views.md) for any retained metadata contract. `observed` must not silently override evidence `date` or infer when every claim was true. No automatic tool ingestion. |
| Weekly log/digest | Keep the [discovery decision](../done/2026-11-02_tasks-feedback-product-discovery.md): current-note activity/provenance is not retained history. F6/F7 sharpen a weekly-review request but supply no evidence for an event store. A future separately scoped current-note interval view must disclose caps, unknowns, deletions and latest-editor limits before being commissioned. |
| Dream handoff, auto-pages, wider boards, large docs reorganization | Defer under the existing discovery gates. Keep explicit agent-driven synthesis and current boards. A chosen integration handoff would need capability/destination consent; no mandatory LLM/orchestrator service or background writes. |
| Credential pruning and shared pins | Defer pending a concrete user-cost or correctness case. Revocation must remain effective; pin locality is an existing convention, not evidence that settlement should be device-local. Investigate any actual cross-client attention disagreement under task 10's parity checks. |

## Per-unit completion and planning verification

- For each retained implementation, record its exact snapshot, focused meaningful regressions, user-visible outcome and untested platform/packaged/hosted limits. Update owning docs and short pending release notes only for delivered behavior. Respect current package budgets; do not loosen them to fit an increment.
- Each numbered unit may move into its own focused task file when execution starts; replace its entry here with that owner link rather than maintaining two competing checklists. Existing owner lists remain canonical for their carried work. A deferred experiment is not a required gate for unrelated shipments.
- Start each reported defect with the smallest current-source/matching-artifact check. If existing source already covers it, record that coverage and remaining publication limits, then close the candidate without speculative code or redundant tests. A verification-only outcome does not need its own release note.
- Archive a completed focused owner under [task workflow](../../docs/task-workflow.md) in the same turn. Keep this list active while required selected work is outstanding. A source commit is not a published fix, installation or authorization to ship.
- Planning checks: live inbox pagination and today's full-body coverage verified; current decisions/owners compared; relative links, explicit repository paths and whitespace checked before committing. No runtime test result, private-corpus reproduction, model provision, installation, remote-memory write or product improvement is claimed by task creation. Changelog and pending release notes are unchanged for planning alone.
