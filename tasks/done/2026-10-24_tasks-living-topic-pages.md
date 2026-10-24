# Living topic pages with visible evidence

Status: completed 2026-10-24. Implemented the orchestrator-selected minimal L1–L5 design; canonical source checks, reader presentation, local/hosted/companion parity, reviewed examples and validation are complete.

## Goal

Help people and agents maintain concise topic overviews from scattered notes. Readers can understand the current synthesis, see what changed, and follow claims back to dated evidence without losing uncertainty or historical disagreements.

## Notes

- Builds on existing dream pages under `pages/` and the explicit Dream handoff; do not introduce a parallel page type or mandatory agent runtime.
- Markdown remains canonical; indexes and maintenance bookkeeping remain rebuildable. Preserve source notes and distinguish evidence dates, edit dates, and claim validity.
- Start with explicitly requested, bounded maintenance through the existing CLI workflow. Automatic scheduling and a general proposal/approval system are outside this ticket.
- Existing scoped Dream authorization may permit immediate updates. Global/team/remote changes still require explicit authorization; do not add redundant approval steps to already-authorized work.
- Coordinate change summaries with [the activity feed](../done/2026-10-18_tasks-knowledge-activity-feed.md), without making either feature depend on a complete implementation of the other.

## Architecture preparation — 2026-10-17

Prepared for a joint product/engineering discussion; implementation has not started. The diagrams describe existing boundaries and possible extensions. Recommendations below are **open**, not accepted architecture. The feature remains explicitly requested maintenance through the existing agent/CLI workflow.

### Product example and vocabulary

“Release plan” brings together three notes: an October 1 plan to launch on October 20, an October 10 proposal to delay, and an October 12 decision confirming October 27. A useful topic page explains the current decision, retains the earlier plan as history, and links to the evidence. If the October 12 note is only a suggestion, the page must keep the disagreement open instead of choosing whichever date is newest.

Later, a person adds a customer commitment to that topic page. An agent refresh must retain that contribution. If a source subsequently changes or disappears, the reader should see the limitation; the application must not quietly reinterpret the old synthesis as newly verified.

A **synthesis** is the agent's evidence-based explanation. A **source reference** lets the reader inspect its basis. A **source check** asks whether the referenced document is still available or unchanged; it does not establish whether the claim is true. A **content hash** is a fingerprint of one file version, not a saved copy of that version.

In the diagrams, **canonical** means the durable Markdown source of truth. **Core** contains shared rules, **app** coordinates operations, and **adapters** connect those operations to the browser, CLI, and network. A **guarded update** refuses a save if the destination has changed since the writer read it, within the documented cooperating-writer limits.

### What exists today

```text
Explicit user request / browser Dream handoff
                       |
                       v
                External agent
                       |
            supported CLI operations
                       |
          +------------+-------------+
          |                          |
     local runtime             HTTP -> server app
          |                          |
          +------------+-------------+
                       v
               Shared memory app
          +------------+-------------+
          |                          |
  bounded source window      recall / show / expand
          +------------+-------------+
                       |
              agent reviews evidence
                       |
          remember / guarded update via CLI
                       |
                pages/*.md (dream: true)
                       |
            editor / source navigation / recall
```

- `app/dream/` already returns bounded, read-only source windows with dates, hashes, omissions, and truncation. It excludes dream pages as primary evidence; agents search existing topic pages separately. A window is neither a full-brain review nor a frozen multi-file snapshot.
- `skills/how-to-dream/SKILL.md` already tells agents to find existing pages, retain provenance and disagreements, preserve human content, permit no-ops, and write through ordinary CLI commands. The server does not run a model or author the synthesis.
- Canonical links support source navigation. `show` returns the current document and its content hash; `expand` checks a supplied hash before returning evidence. These operations do not prove which claim a source supports or preserve an old source version.
- Normal page updates protect the destination using its prior-read hash. That catches a page changed since the read; it does not automatically validate every source used to draft the page. It also cannot tell whether an agent removed useful human text from the latest version.
- The browser Dream handoff currently targets a validated HTTP origin. Companion local profiles show an explanation rather than invent a CLI root prompt. Local CLI Dream works, but any local browser handoff is an explicit additional integration choice.

### Proposed shape, subject to the decisions below

```text
Bounded source selection + existing topic page
                       |
                       v
       Agent drafts explanation and source references
       preserves human text, history, unresolved questions
                       |
                       v
       Evidence check [L2] + destination hash check
           |                              |
   changed/missing/ambiguous          acceptable to publish
           |                              |
   reread within budget,                  v
   qualify, or stop                Guarded page write
                                          |
                                          v
                                Canonical topic Markdown
                                  /                \
                         normal page text     source/check presentation
                                  \                /
                                   reader can inspect

         Optional activity feed consumes recorded page changes.
         Neither feature requires the other to be complete.
```

The likely extension is a clearer evidence representation and maintenance/checking workflow, with a focused reader presentation. Keep synthesis in the user's agent. Put reusable source-resolution/checking policy in core and orchestration in app; HTTP and the browser transport/display results. Reuse the existing local engine on a hosted root. Exact schema, command additions, and module placement depend on the decisions below.

### Decisions to make together

**L1 — How precisely should readers connect a claim to its evidence? Open.**

Choose a page-level source list, references beside each important claim/paragraph, or a structured claim registry with IDs and relationships. A page-level list is simple but leaves readers guessing which source supports a statement. A claim registry supports richer analysis but adds a new editing/data model.

Discussion starting point: readable Markdown references beside important claims, plus a short source list where useful. Reuse existing link forms and unique memory IDs when available; missing IDs must not trigger silent source edits. Decide how to represent source version fingerprints and locations before adding machine-readable checks. A renamed heading or shifted line range must not silently point to unrelated evidence. Existing lint accepts multiple citation layouts; a suggested template must not accidentally become a mandatory heading parser.

**L2 — What does “checked against sources” promise? Open; key technical gap.**

Choose a recorded review-time statement, explicit source availability/version rechecks during maintenance or on demand, or a stronger snapshot-based publication guarantee. A review-time statement is cheap but cannot show later changes. Rechecks can show changed/missing evidence without continuously monitoring the brain. Snapshot-based publication would require a substantially stronger multi-document protocol.

```text
Read source S1 ---- source changes to S2 ---- publish topic page P2
Read page P1 ------------------------------- check P1 -> write P2
                                            ^
                               Existing guard protects the page only.
                               Source rechecking is separate work.
```

Discussion starting point: bounded source rechecks before publishing plus an explicit on-demand reader check, with “checked at” time and incomplete coverage shown. Define changed, missing, ambiguous, and not-checked results separately. If evidence changed, reread and reconsider within the authorized budget or leave the page unchanged and report why; a missing source may remain as qualified historical context. Do not silently mark everything current.

There is still a race after rechecking: arbitrary external files can change before the page saves. Decide whether this honest best-effort guarantee is sufficient. A stored hash can detect a changed version but cannot reopen the old bytes; exact historical source viewing would require retained revisions and a separate retention decision. An unchanged source can still contain a mistake.

**L3 — How do people and agents share ownership of a page? Open.**

Choose a normal whole-page update preserving existing human contributions, explicit human/agent-owned sections, or a separate draft/proposal step. Whole-page editing fits the current workflow and Markdown flexibility, but preserving meaning relies on agent review in addition to hash checks. Owned sections introduce formatting rules and migration questions. Proposals add review state and are outside the initial ticket unless we deliberately expand it.

Discussion starting point: keep normal whole-page editing, require reading the current page before drafting, retain human contributions, and stop/report ambiguity when safe reconciliation is unclear. A stale destination hash forces reread and reconciliation; it is never permission to force an overwrite. Discuss an example where a human intentionally contradicts the synthesis. Existing bounded write authorization remains valid; this choice must not add a redundant approval prompt for every authorized edit.

**L4 — Is “what changed” a latest explanation or a historical timeline? Open.**

Choose a concise latest substantive-change summary in the page, a retained chronological change section, or full revisions/diffs. A latest summary is easiest to read but cannot answer every historical question. A chronological section retains more context and grows over time. Full revisions require the storage/retention work discussed in activity decision A1.

Discussion starting point: a concise latest change explanation in canonical Markdown, preserving important earlier decisions in the synthesis itself. Do not turn every refresh into an appended log entry. A no-op should leave page bytes and edit time unchanged; decide whether an on-demand check time is transient or disposable bookkeeping. If durable review history is desired, it needs explicit canonical representation rather than an index-only timestamp. The feed may link to the page, but the page must explain itself without a feed.

**L5 — How does a refresh find the right page and relevant evidence? Open.**

Choose an explicitly selected topic page for the first experience or automatic topic/page selection. Explicit selection reduces duplicate/incorrect updates; automatic selection adds ambiguity handling and selection policy. Discussion starting point: select an existing page or name a new topic, then combine bounded topic recall with a small Dream window and relevant existing sources. A date window alone can miss the older decision that still governs today. Search results and final pagination offsets do not prove comprehensive coverage.

When several pages appear to cover the same topic, report the ambiguity rather than automatically merging or deleting pages. Agree the source/read/write budgets and how the reader sees omissions. Decide whether this release includes a local browser-to-CLI handoff or documents local CLI entry while reusing the current hosted handoff. Neither choice requires an embedded model, scheduler, or always-on agent.

Keep the existing Dream scope as the starting point: refresh an existing page marked `dream: true`, or create a new Dream page. If a selected page is human-authored and not Dream-marked, explain that current Dream authorization does not cover it. Any conversion or broader editing workflow requires a separate explicit choice; selecting a page alone must not silently change its classification. Honor any broader editing authorization the user has already explicitly given.

### Implementation boundaries and discussion outcome

- **Agent guidance / handoff:** evidence selection, semantic synthesis, human-content preservation, and the budgeted user workflow. A prompt recommendation is not an enforced source-freshness guarantee.
- **Core canonical / Dream policy:** reusable reference resolution, version comparisons, and explicit unknown/ambiguous classifications. Extend only after choosing the evidence representation; do not introduce model calls here.
- **App Dream / local-memory:** bounded source-check orchestration and destination workflow, if required by L2; reuse guarded reads/updates and return honest partial results. The shared server-memory layer delegates to the same app behavior.
- **CLI/runtime/HTTP:** expose any agreed checking operation consistently without forcing agents to call the hosted API directly. Source checking reads memory; page writes and indexing retain their existing target authorization.
- **Browser:** readable sources, change explanation, questions, and source-check status in existing page/navigation surfaces. Never label “last checked” as “verified true” or treat changed evidence as automatic refutation.
- **Canonical storage:** page explanations and provenance remain readable in Markdown; a disposable cache may accelerate checks but cannot be the only record of a claim's cited evidence. Avoid a parallel topic database.

For each L1–L5, record the selected option, user-visible promise, accepted limitation, and date here after discussion. Resolve L1/L2 before designing fields or source-check APIs, and L3 before automated rewriting. L4 coordinates with activity A1 but need not wait for a feed implementation. Then align the acceptance criteria and execution tasks. No architecture option is accepted by this preparation.

Walk through the release-plan example with a confirmed new decision, a contradictory suggestion, a human edit, a missing source, a source changed during drafting, and a no-op. Verify both supported local and hosted paths, source/destination races, retained human meaning, and explicitly incomplete coverage. Deterministic tests can establish reference and concurrency behavior; semantic quality also needs reviewed example outputs.

## Accepted implementation choices — 2026-10-24

These supersede the open preparation above; selected by the orchestrator before implementation.

- **L1:** Claim-adjacent ordinary Markdown inline links with an optional title containing the full canonical `sha256:<64 lowercase hex>` fingerprint: `[decision](mem_<uuid> "sha256:…")`. Prefer unique IDs; exact canonical paths support ID-less evidence without modifying sources. Other ordinary link forms remain navigable but are explicitly not version-checked. No claim registry or retained source revisions.
- **L2:** Explicit read-only `dream --check-sources` for an existing Dream page or a stdin draft, used immediately before ordinary publication and on demand by readers. Return unchanged/changed/missing/ambiguous/not_checked per reference and partial coverage. Checks compare current bytes, never truth. No transaction spans checking and saving: sources can change after a check; no historical bytes or snapshot promise. Publication remains ordinary remember/update; the checklist does not turn checks into a mandatory ACL.
- **L3:** Whole-page guarded editing. Read the current Dream page, retain human meaning, customer commitments, prior decisions and uncertainty. Stale destination tokens force reread/reconciliation; semantic preservation requires agent review. Ordinary Dream scope excludes non-Dream human pages. No proposals, ownership sections or automatic merging.
- **L4:** Canonical `## Latest substantive change` and `## Open questions` body sections, plus separate synthesis/evidence dates. Update the explanation only for meaningful changes; no-op skips mutation/indexing. Source checks are transient and never rewrite timestamps. An exact unchanged-content submission also preserves bytes.
- **L5:** Explicit topic or selected existing Dream page; bounded related recall plus the existing Dream window, not automatic selection. Ambiguous pages are reported. Hosted handoff retains exact-origin authorization; local entry stays explicit CLI root (no invented companion root). Agent budget: 10 primary files, 8,000 bytes each / 40,000 total source-body bytes, five follow-up reads, two writes, ten minutes best effort; checks count as reads. Checker version-pass limits: 64 KiB page, 32 returned references, 500 attempted canonical files, 256 KiB per file, 4 MiB successful/reserved source reads. Directory discovery and existing saved-page ID lookup are not a corpus-size/total-I/O/time bound. Any unreadable/oversized unrelated file, >500 canonical files or exhausted 4 MiB makes all versioned references not_checked conservatively; this is not a targeted-source-only scan. No new scheduler/database/model runtime.

## Acceptance criteria

- A user can create or refresh a topic overview using relevant, bounded source evidence and the existing agent/CLI workflow.
- The overview exposes sources that readers can open; unavailable, changed, or ambiguous sources are reported honestly.
- Updated pages explain substantive changes and retain meaningful uncertainty, conflicting accounts, and historical decisions. Newer evidence alone does not establish truth or supersession.
- Conflicts and unanswered questions are visible for review; synthesis does not silently settle them or invent missing evidence.
- Human contributions are retained through the agreed L3 reconciliation workflow. Destination identity/hash checks reject stale page updates within their documented limits. Source changes and incomplete checks receive the outcomes agreed in L2; neither protection guarantees semantic preservation or an atomic multi-file snapshot.
- A no-op run is valid. Pages remain readable and useful without an agent, and incomplete evidence is not presented as comprehensive coverage.

## Relevant files

- `docs/product-vision.md`, `glossary.md` — temporal correctness, provenance, and dream-page semantics.
- `skills/how-to-dream/SKILL.md`, `docs/agent-workflows.md` — synthesis instructions and authorized contribution workflow.
- [Existing Dream handoff](../done/2026-10-07_tasks-web-dream-handoff.md) — bounded execution and explicit target authorization.
- `src/architecture.docs.md` and affected co-located docs — read before source changes; app owns workflows and adapters own presentation/transport.
- `src/app/dream/{index.ts,dream.docs.md}`, `src/core/dream/dream.docs.md`, `src/app/server-memory/dream.ts` — bounded read-only windows and local/hosted composition.
- `src/core/canonical/{links.ts,canonical.docs.md}`, `src/core/document-update.ts`, `src/app/local-memory/{index,expansion}.ts` — existing references, destination hash checks, and guarded source reads.
- `src/adapters/http-server/{dream-handoff.ts,browser.docs.md}`, `src/app/writing/writing.docs.md` — current handoff limits, reader presentation, and Dream page publication.

## Tasks

- [x] 0.0 Agree the broad architecture with product and engineering before implementation
  - [x] 0.1 Prepare current/proposed flows, the release-plan example, architectural gaps, and options in this task list.
  - [x] 0.2 Resolve L1/L2: evidence granularity, source freshness, and limits of historical/source-version guarantees.
  - [x] 0.3 Resolve L3–L5: human/agent ownership, change explanations, topic selection and eligible pages, budgets, and local/hosted entry points.
  - [x] 0.4 Record agreed choices and align acceptance criteria and tasks; recommendations above are not approval.
- [x] 1.0 Establish the smallest useful maintenance workflow
  - [x] 1.1 Inspect current dreaming, provenance, page editing, and source navigation; identify gaps rather than duplicating existing capabilities.
  - [x] 1.2 Define a concrete example covering initial synthesis, additional evidence, a changed decision, and an unresolved contradiction.
  - [x] 1.3 Decide how change summaries and source freshness are represented, keeping durable knowledge in Markdown and derived state disposable. Record limits of historical reconstruction.
- [x] 2.0 Make topic maintenance evidence-aware
  - [x] 2.1 Extend the existing bounded workflow to find and update the relevant topic page, preserve human content, and avoid duplicate overviews.
  - [x] 2.2 Preserve traceable sources, historical qualifications, disagreements, and open questions; make changed/missing evidence explicit.
  - [x] 2.3 Produce a concise account of substantive changes without rewriting pages for cosmetic or no-op differences.
  - [x] 2.4 Implement the agreed L1/L2 source representation and bounded checking contract, distinguish source checks from destination protection, and expose the chosen partial/changed/missing outcomes consistently.
- [x] 3.0 Expose the result to readers
  - [x] 3.1 Add a focused presentation for sources, substantive changes, and unresolved questions using the existing editor/navigation surfaces.
  - [x] 3.2 Keep synthesis date and source-check status distinct from a claim of verified truth or completeness.
- [x] 4.0 Verify and document
  - [x] 4.1 Validate conflicting evidence, historical changes, missing sources, no-op runs, concurrent human edits, and local/hosted authorization parity.
  - [x] 4.2 Review the browser experience and update owning docs, Dream guidance, and glossary only where contracts change. Record verification and remaining limitations here.

## Completion outcome

Implemented shared read-only source checks and transient browser presentation, preserving ordinary Dream synthesis/authorization, human meaning review, guarded whole-page editing and exact no-op bytes. All required tasks below are complete; accepted limits remain explicit. No external blocker remains.

## Implementation and reviewed evidence — 2026-10-24

- Added core fingerprint parsing/exact canonical ID/path comparison and bounded observational canonical reads, shared app checks, local runtime/CLI and hosted runtime/HTTP parity. No source edits, model calls, scheduler, proposal state or second canonical page type. Draft checks are explicit pre-publication workflow operations, not a mandatory publication ACL.
- Browser Sources uses transient saved-page version results, current-source navigation, readable titles, missing/changed/ambiguous/not_checked outcomes and coverage counts. Results are fenced to page/hash/draft revision/credential scope. Dirty/unconfirmed drafts cannot initiate saved-page checks. Hosted handoff offers a literal topic/page selection; local companion behavior remains its explicit CLI explanation.
- Exact unchanged-content updates retain canonical bytes/edit time, return `unchanged:true`, and skip hosted stale-index/bookkeeping notification. Stale destination hashes still reject. Cosmetic/semantic no-op decisions remain the external agent's responsibility.
- [User workflow and schema](../../docs/living-topic-pages.md); [reviewed semantic walkthrough](../../deep-dives/living-topic-pages/review.md). Separate original-plan/proposal/confirmed-decision fixture notes carry individual citations. Reviewed initial uncertainty, explicit confirmed supersession, merely-newer suggestion, retained human notice/approval meaning, qualified missing-source history, changed drafting evidence, and no-op output. These editorial examples do not establish arbitrary-agent synthesis quality.
- Companion integration review caught the missing gateway allowlist route before archiving. Added only POST `/memories/all/dream/sources/check` as `write:false`; real saved/draft requests now round-trip through read-only local and remote profiles, with existing auth/Origin/generation/tab/drain protections and unchanged mutation denial. Focused gateway/connections/browser tests: 61/61 pass (`/tmp/living-companion-focused.log`).
- New implementation: `src/core/dream/source-references.ts`, `src/app/dream/source-check.ts`, `src/adapters/http-server/living-sources.ts`; deterministic checker/transport/CLI and controller tests in `test/living-topic-pages.test.js` and `test/living-sources-browser.test.js`; disposable production-server browser fixture/smoke in `scripts/living-topic-pages-{fixture,smoke}.mjs`.

## Verification and remaining limits

- Tested source build fingerprint: `790bd6ef182a9424`, package 0.3.7; companion gateway SHA-256 `44bd8fe368974e9f469517c3d9fc84ae2bc541a650977b9f61b387377e5922d7`. Base implementation snapshot was `ccc7174`; the separate diagnostics fixture prerequisite is local cherry-pick `248bcd5` of parent's `8ae1a42`. Parent already owns the prerequisite; integrate only this task's implementation commit.
- Focused checker/CLI/HTTP suite: 14/14 pass, including deterministic source mutation during a bounded read; direct-core fixtures use resolved canonical macOS temp paths. Other focused Dream/skill/browser/license/controller tests passed and are included in the full run.
- Final full `npm test`: **1,244 tests, 1,243 pass, 0 fail, 1 skip**, 45.56 seconds, including the source-race and companion-route regressions. Log: `/tmp/living-pages-npm-test-final.log`. `git diff --check` passed.
- Production browser smoke passed on the final build using a disposable real HTTP server, ordinary canonical files and real Lexical import/edit/export/autosave. Fingerprint survived a human edit on its own citation line; preexisting customer notice text remained. Check requests emitted no PUT/PATCH/DELETE; unchanged/changed/missing outcomes, current-source navigation, non-Dream scope and explicit topic handoff passed. Both themes at 1280/390/320px passed overflow assertions; all six screenshots were reviewed at `/tmp/jumpybrain-living-qa/`. Run log: `/tmp/living-browser-final3.log`.
- T3 preview-first: status/open/navigation succeeded; two consecutive snapshot calls returned `Preview automation snapshot timed out after 15000ms.` Switched to the repository Playwright runner and its already-installed package; no installation occurred. The initial dependency symlink hid esbuild license paths, causing one full-suite failure; a worktree-local copy of existing dependencies corrected this and later license checks passed. No dependency/package manifest changed.
- The standard optional real-QMD 2.8.3 test remains skipped unless `JUMPYBRAIN_TEST_QMD_BIN` is explicitly provisioned; no claim of new real-model evaluation. Source checking itself needs no QMD/provider. Local/hosted parity is tested with the shared engine over authenticated loopback HTTP, not a live VPS rollout. Other browsers, assistive technology, physical devices and native companion OS capabilities are outside this task's QA.
- Checks compare file versions only. Incomplete full-root source passes conservatively make every versioned target not_checked, even when an unrelated file caused the omission. Existing ID discovery/directory enumeration remain outside version-pass byte/corpus/time limits. Exact historical source bytes are not retained; source changes after checking remain possible. Destination guards cannot establish semantic preservation or atomic multi-file consistency. No global/team/remote memory writes, push, release or installation performed. Unrelated root task deletion was not touched.

## Parent integration verification

Integrated as `28a7669` alongside the contextual-indexing decision `4af6aeb`. Final combined snapshot `0d02bd9` passed `npm test`: **1,244 tests, 1,243 passed, 0 failed, 1 optional QMD skip**, 52.664 seconds; log `/tmp/jumpybrain-orchestrator-integrated-tests-final.log`. Production source, integration and smoke-script bytes match the reviewed living-page worktree; the parent also inspected its narrow-screen screenshot.

The first combined run exposed an existing evidence-date fixture cleanup race: removing its memory before closing the diagnostics-writing HTTP server caused `ENOTEMPTY` and left a server open. The stalled disposable test process was terminated; the original failed log remains at `/tmp/jumpybrain-orchestrator-integrated-tests.log`. Test-only commit `0d02bd9` registers server shutdown before fixture deletion; the isolated file passed 4/4 and the full rerun above passed. The earlier diagnostics retention-clock fix is `8ae1a42`. Both completed task lists are archived; the unrelated deletion of `tasks/todo/tasks-page-reference-manual-qa.md` remains unstaged.
