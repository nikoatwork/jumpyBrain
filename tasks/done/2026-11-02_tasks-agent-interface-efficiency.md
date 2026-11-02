# Reduce agent setup overhead and improve maintenance previews

Priority: P1 for guidance and read-only lint; P2 for output/feedback contract changes. Status: complete. Retained scope: topic guidance, observational lint, and explicit compatibility/defer decisions.

## Goal

Make the common recall/write workflow economical to learn while keeping provenance, authorization and bounded reads correct. Let agents inspect maintenance findings without first authorizing mutation.

## Evidence and boundaries

- [Agent review part 4, 2026-11-02](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=e08f741d-3203-468b-8ea2-ab760fe362ba) reports long overlapping skill/instruction text, multiple result shapes, unknown actor defaults, feedback chunking and no read-only lint preview.
- Its proposed single JSON shape, automatic actor inference, larger feedback envelope and replacement of built-in recipes are options to evaluate, not approved breaking changes. Help organization is owned by [CLI help](../done/2026-11-02_tasks-cli-help-and-validation.md), and root parity by [brain targeting](2026-11-02_tasks-brain-connections-and-targeting.md).
- Preserve evidence versus writing dates, same-target ID/hash checks, continuation/partial reporting, saved-versus-indexed outcomes and explicit global/team/remote write authorization. TTY state alone does not establish authorship.

## Relevant files

- `src/cli/cli.docs.md`, `src/cli/instructions.ts`, `skills/jumpybrain-memory/SKILL.md`, `skills/how-to-dream/SKILL.md` — distributed guidance.
- `src/cli/bounded-reads.ts`, `src/cli/formatting.ts`, `src/cli/recipes.ts` — existing output/recipe contracts.
- `src/app/processing/processing.docs.md`, `src/app/processing/lint.ts`, `src/cli/feedback.ts`, `src/adapters/feedback/feedback.docs.md` — maintenance and explicit support reporting.
- `src/adapters/client-identity/client-identity.docs.md` — existing explicit client/owner identity.

## Tasks

- [x] 1.0 Measure and reduce initial guidance cost.
  - [x] 1.1 Freeze installed/generated instruction variants and a few realistic recall/expand/write/dream journeys; measure with a pinned tokenizer when available, including follow-up guidance reads; otherwise record the authorized bounded byte comparison and tokenizer absence.
  - [x] 1.2 Design a short common workflow with discoverable topic-specific guidance. Keep critical safety/identity/date rules at the operation where they matter; avoid hiding prerequisites the agent must know before a write.
  - [x] 1.3 Verify generated and installed guidance agree, including CLI-only and remote paths. Coordinate managed refresh with [runtime hygiene](../todo/tasks-desktop-runtime-hygiene.md).
- [x] 2.0 Evaluate output and identity simplification without breaking consumers.
  - [x] 2.1 Inventory text/rich/compact consumers and compare their interaction cost on matched evidence (exact serialized bytes here; tokens unavailable). Prefer shared internal rendering or an additive versioned interface before proposing removal of existing shapes/recipes.
  - [x] 2.2 Reuse explicitly configured host/client identity where available; preserve unknown attribution when evidence is absent. Document actor declaration separately from authenticated access and prevent a default from claiming human authorship.
  - [x] 2.3 Record adopt/defer decisions and migration costs for any new budget alias, output schema or recipe deprecation. Existing IDs/hashes and valid scripts must remain usable through a documented transition.
- [x] 3.0 Add a true read-only lint preview.
  - [x] 3.1 Separate computing bounded lint findings from persisting reports/ID repairs. Define preview output with scope, omissions and proposed actions; keep explicit apply for derived-report writes and canonical changes.
  - [x] 3.2 Ensure preview does not start a repairing index, alter counters, create reports, stamp IDs or mutate Markdown; document local/remote availability without adding an unnecessary hosted mutation trigger.
- [x] 4.0 Evaluate support-report ergonomics.
  - [x] 4.1 Define the smallest useful category/follow-up or multi-part reporting extension, including maximum serialized size, redaction, explicit consent and compatibility with relay/UI limits. Decide whether the current cap should change using actual report needs.
  - [x] 4.2 Preserve dry-run, matching accepted report ID, no automatic attachments/retries and no credentials or note content collected implicitly. Synthetic sends are not part of implementation verification unless explicitly authorized.
- [x] 5.0 Verify and finalize the retained increment.
  - [x] 5.1 Test topic guidance discoverability and full cost for common journeys; prove relevant safety/temporal/expansion behavior remains correct. Test preview with filesystem/transport mutation sentinels and feedback with a local fake relay.
  - [x] 5.2 Update CLI/processing/feedback/skill docs and relevant release notes; record adopted/deferred changes, compatibility and untested limits, then archive/commit under [task completion](../../docs/task-workflow.md).

## Implemented increment and decisions — 2026-11-02

- Adopted a short CLI entry hint and a shorter shipped memory skill, with the same discoverable `instructions --topic recall|expand|write|maintenance|feedback|board|setup|all` details and `agent-hint` alias. Topic flags are strict and present in early observational help. Date uncertainty, write authorization, unknown versus declared authorship, saved/indexed identity, and same-target hash/continuation prerequisites remain in initial guidance; operation topics preserve detailed rules. The Dream workflow is self-contained rather than requiring duplicate topic reads. No shipped source-file names or installer placeholders changed; no new support files must be copied. Managed refresh mechanics remain the runtime lane's responsibility.
- Adopted explicit `process --mode lint --preview` (also `run memory:process`) and API `processMemory(root,{mode:"lint",preview:true})`. Canonical scanning/finding computation is shared with apply; observation returns the existing issues/scope plus `applied:false`, empty files and summary of omissions/proposed report action, with no report/run ID. Transport bypasses the root backend for preview and invalid/non-authorized processing. Apply still joins the existing backend queue and writes unique reports; synthesis/ensure-ids remain apply-only. CLI rejects preview with any apply spelling or non-lint mode before target handling. Remote CLI processing remains unavailable; no hosted trigger or permission change was needed.
- Kept existing text/rich/compact output, recipes and document IDs/hashes. Consumers include human CLI/recipes (`formatting.ts`), JSON scripts/Pi, bounded-read CLI and HTTP clients, and runtime/host integrations. Compact carries readiness/partial/expansion metadata that text does not; combining/removing shapes would require CLI/Pi/HTTP/script migration without demonstrated benefit. No new budget alias or recipe deprecation. The matched one-passage fixture preserves the exact qualification and coordinates in all three renderings; different envelopes are not equivalent information contracts.
- Reused the existing explicit actor seam unchanged: `--actor agent` plus `--actor-name` or `JUMPYBRAIN_CLIENT_NAME` and the optional configured owner. Existing `client-identity` regressions verify prefixing and omitted-actor unknowns. Actor declarations remain separate from authenticated access; TTY selects stdin ergonomics only, never human authorship. Automatic guessing is deferred without an identity evidence source.
- Kept feedback delivery unchanged. Smallest useful report remains version/reproduction/expected/actual supplied explicitly as one message, with dry-run and deliberate same-ID retry. The cap is 4,000 JavaScript UTF-16 code units (stdin additionally bounded at 16,000 UTF-8 bytes); JSON escaping can make the CLI request at most 24,077 bytes with a valid 36-character UUID and `diagnostics:null` (verified with 4,000 NUL characters). The HTTP relay accepts 65,536 request bytes; browser optional diagnostics have a separate 24,000-byte cap. No larger cap/category/thread/multipart envelope was justified by an actual failing report in this task. Such a protocol needs relay/UI versioning, aggregate bounds, consent/redaction and retry semantics; it is deferred, not implemented. Local fake-relay/receipt tests cover existing behavior; no real sends.

## Guidance cost protocol and measurements

Run `npm run build` then `node scripts/measure-agent-guidance.mjs`. Baseline is pinned to `fc6f8594eb8bd30fb91a946f46498c5e66a1d8d4`. The script loads old/current instructions, renders the installed skill with fixed `/fixture` paths, and freezes recall, recall/expand/continuation, recall/save/pending-index and Dream/check/update journeys. Topics are read once per journey; Dream uses its own complete workflow plus maintenance discovery.

No pinned tokenizer is in project dependencies, and `python3` reports no installed `tiktoken`. Actual token counts are **unavailable**, not estimated. The allowed fallback is exact UTF-8 guidance accounting; unchanged operation commands/results contribute the same additional constant to each baseline/current journey, so guidance deltas also bound the matched interaction delta. This does not measure model activation, latency, answer quality or arbitrary repeated help/topic reads. The script also reports actual matched one-passage output bytes through the current formatters/packer: text 152, rich JSON 356, compact 563. Compact is not universally smaller.

- Initial CLI: 9,092 → 3,161 bytes; rendered skill: 14,315 → 5,104 bytes.
- Including necessary follow-up guidance: recall CLI 9,092 → 6,138, skill 14,315 → 8,081; recall/expand/continuation CLI 9,092 → 8,425, skill 14,315 → 10,368; recall/save CLI 9,092 → 9,437, skill 14,315 → 11,380. The CLI write journey costs 345 extra bytes because its write topic now includes a creation example and repeated prerequisites; no claim of universal savings.
- Dream/check/update including the complete Dream skill: CLI 20,139 → 15,767, installed skill 25,362 → 17,710 bytes. Full CLI reference: 9,092 → 10,328 bytes (1,236 more); initial economy comes from loading only needed details, not deleting safeguards.

## Verification and limits

- `npm run build` passed. Focused guidance/processing/feedback/help/installer/package run: initially 110/111 passed; the omitted installed remember example was restored and the literal-path onboarding regression then passed. The earlier 67-test processing/guidance/help suite and 41-test architecture/runtime/server/feedback/access-policy suite passed.
- New lint child-process sentinels deny every filesystem write/open, process launch, socket/listen and fetch call after imports; direct runtime, local transport, CLI and recipe previews pass with zero calls. Recursive filesystem snapshots retain contents, modes, mtimes, ID-less notes, existing reports, counters and SQLite/WAL/recovery sentinels. Apply returns identical findings/scope and a unique report. Strict malformed/duplicate/conflicting preview flags and remote rejection pass. Existing help sentinels cover 312 invocations with zero operations; instruction topics are tested with unavailable root/key/policy and an unreachable configured remote target.
- First broad `node --test`: 1,800 passed, three failed, one existing opt-in real-QMD skip (1,804 total). Two task-owned failures were an old monolithic-instructions assertion and fixture auto-discovery without a supplied root; fixed and all five focused follow-up tests passed. The third was a missing worktree `integrations/electron/node_modules/esbuild/package.json`; hydrated only this checkout's locked Electron dependencies with scripts disabled, then reran the broad suite. Final `node --test` passed: **1,803 passed, zero failed, one existing opt-in real-QMD skip, 1,804 total**, 85.777 seconds; log `/tmp/jumpybrain-agent-full-final.log`. The final focused 21-test guidance/preview/baseline run also passed.
- Preview is a canonical corpus scan, not a bounded-I/O service or multi-file snapshot. Topic/since/limit bound inspected documents, while duplicate/provenance/candidate comparisons read the corpus; output uses existing finding bounds and shape. Findings are suggestions, never permission for source edits or proof of complete semantic review. Concurrent edits can change evidence. Actual host/model skill activation, remote hosted processing (not added), installed managed refresh (other lane), real feedback delivery, personal/remote memory and real installations/services were not exercised.
- Parent owns combined-lane gates, shared metadata reconciliation and local integration. No push/PR/release/version bump/deployment/master merge or live feedback send.

## Final package and handoff

- Tested snapshot: base `fc6f8594eb8bd30fb91a946f46498c5e66a1d8d4` plus this task's scoped implementation/tests/docs; finalization after the passing build/full suite changes only task records, links and changelog. No versions or lockfiles changed. `git diff --check` passed.
- `npm run check:package-size` passed: **1,438,041 archive / 4,588,074 unpacked / 3,098,875 dist bytes; 628 files**. Relative to base: **−1,045 / −3,284 / +4,097 bytes; zero files**. All original ceilings remain enforced. Runtime headroom is only **1,125 bytes**; parent must remeasure combined lanes. Initial implementation exceeded runtime budget by 2,830 bytes; shared guidance strings and trimmed repeated prose recovered that cost without dropping critical rules or changing assertions/budgets.
- No source-file rename: `skills/jumpybrain-memory/SKILL.md` and `skills/how-to-dream/SKILL.md` remain the shipped assets, with the original placeholder contract. Runtime refresh lane can use the content through its existing managed-file lifecycle.
- Accepted work is ready for parent review/local integration; parent retains combined gates and T3 settlement. All speculative output/identity/feedback protocol extensions were evaluated and explicitly deferred above; they are not unfinished required implementation in this retained increment.

## Parent integration review

Source tip `3065cb7` was fast-forwarded into `master` with ancestry verified. Parent retained the old concurrent-edit precaution in the on-demand write topic and added a skill pointer and a regression for the actual read's epoch/revision. Build and 16 focused guidance/lint/apply/parser/help tests passed; updated package metrics are 1,438,237 archive / 4,588,610 unpacked / 3,099,283 runtime bytes, 628 files, all unchanged ceilings passing. The delegate's measurements above describe its original tested tip; updated byte accounting is retained locally at `/tmp/jumpybrain-guidance-integrated.json`. Combined final validation follows the other lanes.
