# Proposal: Simplify the smoke-test sprawl (shared harness, build once)

## Goal

Cut the operational weight of browser verification: one shared smoke harness (disposable brain + server + browser/page factory + fault-injector plumbing), build-once reuse per change instead of a full clean rebuild before every script, and a smaller npm-script surface. This is a proposal, not a decision: the outcome of task 1.0 decides whether and how this proceeds.

## Notes

- This is a hypothesis to validate, not an agreed refactor. Do not migrate or delete any script before 1.0 completes and 2.0 makes an explicit go/no-go call.
- Evidence collected so far (from the architecture review):
  - `scripts/` holds 171 files; of these, 99 are smoke scripts totaling roughly 19,000 lines, and `package.json` carries about 40 npm scripts, mostly of the form `npm run build && npx --package=playwright node scripts/<name>-smoke.mjs`.
  - ~32 smoke scripts each spawn their own disposable server (and Chromium), and each re-derives the same setup: temp brain root, `AccessStore` key issuance, `startJumpyBrainHttpServer`, fixtures, teardown. Example: `scripts/collaboration-overlap-smoke.mjs` carries this setup inline at high quality.
  - `docs/testing.md` already requires building once per change and reusing the build, and `npm test` itself rebuilds (`"test": "npm run build && node --test"`).
  - Shared helpers already exist (`scripts/playwright-runtime.mjs`, `scripts/browser-shell-test-helpers.mjs`, `scripts/collaboration-smoke-transport.mjs` fault injector) — a harness would generalize, not invent.
- Uncertainties (why we are not confident yet):
  - One file per scenario may be a deliberate, low ceremony, high readability choice; each smoke header doubles as documentation. The goal must be removing duplicated setup, not merging scenarios into an opaque mega-suite.
  - Releasing to standalone scripts each having a `package.json` entry gives stable, committable check commands referenced all over the docs (`docs/testing.md` tables link individual runners). It is unclear how much of the command-naming surface itself is load-bearing for docs and release checklists vs. accidental sprawl.
  - Smokes live outside the `node --test` runner; embedding them into the runner (as a filtered suite) would change the release-gate mapping in `docs/release-testing.md`. Needs assessment before any move.
  - Incremental build opportunities (tsc `--build`, dist cache, reusing the build more aggressively) would change the evidence semantics of currently recorded checks, so this must be handled carefully.

## Relevant Files

- `scripts/collaboration-overlap-smoke.mjs` - high-quality example script; its setup (~40 lines) is what the harness would absorb.

- `scripts/playwright-runtime.mjs` - Chromium loading helper already shared.
- `scripts/browser-shell-test-helpers.mjs` - existing browser-shell helper set.
- `scripts/collaboration-smoke-transport.mjs` - fault injector used by the live-editing scenarios; harness must preserve access to it.
- `package.json` - the scripts block where the sprawl shows up in user-facing form.
- `docs/testing.md` - selection guidance that the harness/among-smokes changes must stay consistent with.
- `docs/release-testing.md` - release gate that references smoke commands.
- `src/adapters/http-server/browser.docs.md` - module smoke index (selection table).
- `scripts/precommit-guard.mjs` - guarded staging workflow that any npm-script changes must respect.

## Tasks

- [x] 1.0 Research deep dive on smoke/harness consolidation (delegated to a Mistral Large sub-agent; read-only research plus writing its deep-dive doc)
  - [x] 1.1 Quantify duplication: sample broadly across the 99 smokes (not only from memory), measure shared setup content, helper variation, fixture patterns, and per-script unique logic; produce concrete line counts for what a shared harness would absorb
  - [x] 1.2 Categorize: which smokes are pure browser UX scenarios, which are proofs/training wheels for memory tests, which mix both; identify candidates that already overlap or have drifted (e.g., near-duplicate variants)
  - [x] 1.3 Trace the build dependency: map the `npm run build && ...` pattern, quantify how long a clean, incremental, and cached build each take, and any prior partial-build opportunities; propose a build-once-per-change flow that preserves recorded-evidence semantics from `docs/testing.md`
  - [x] 1.4 Propose the harness API (shape: temp-brain root, key issuance, server start, context factory, teardown contract, fault-injector hooking) and a small pilot set (3–5 scripts) with expected diff shapes
  - [x] 1.5 Define the regression-verification plan: how to prove each migrated script still exercises its scenario (before/after behavior parity, not just exit codes), and how docs and `package.json` command references stay consistent
  - [x] 1.6 Deliverable: `docs/deep-dives/smoke-harness-simplify/research.md` and an updated "Deep dive findings" section in this list
  - [x] 1.7 Independent source-checked review of the research (2026-11-16): corrections in research.md section 10 and under "Review corrections" below; pilot narrowed accordingly
- [x] 2.0 **Clarify:** Go/no-go and scope (owner: user, with research doc in hand). Decide:
  - [x] 2.1 **Declined.** Approve the narrowed pilot (3.0): a small shared setup file plus three scripts migrated, every command name and docs row unchanged. It proves readability and unchanged failure detection; it does not make tests faster or reduce commands
  - [x] 2.2 **Kept as today.** Keep one file per scenario and keep smokes out of `node --test` (research recommends both; no change to the release-gate mapping)
  - [x] 2.3 Not applicable (pilot declined). Acceptance bar: same assertions exercised before/after (counted, see 4.1), injected faults still caught, loop not slower, no gate-pinned script touched
- [-] 3.0 Proposal execution phase 1 (only after 2.0 approves): build `scripts/smoke-harness.mjs` v1 and migrate the narrowed pilot only
  - [-] 3.1 Harness v1 scope: temp brain, server start, browser launch/page factory, and a cleanup stack that runs steps in reverse registration order and accepts scenario-added steps (evidence copy, report writes) before temp-folder removal. Leave `recordSmokeEvidence` out of v1
  - [-] 3.2 Pilot: `scripts/collaboration-overlap-smoke.mjs`, `scripts/theme-smoke.mjs`, `scripts/graph-warning-smoke.mjs` (none is pinned by a verification gate). Do not migrate `scripts/ux-uncertain-save-smoke.mjs` (pinned by `test/fixtures/architecture-contracts/profile.json:16,119`; needs a reviewed contract delta). Use `scripts/access-keys-smoke.mjs` only as an uncommitted dry run of the multi-brain/gateway escape hatches
  - [-] 3.3 Do not modify `scripts/playwright-runtime.mjs`, `scripts/editor-smoke-helpers.mjs` or `scripts/collaboration-smoke-transport.mjs`: all three are pinned assertion roots in the multiplayer gate inventories. The harness imports them; it does not grow them
  - [-] 3.4 Keep each pilot script a standalone runnable with the same package.json entry and docs table row; update `docs/testing.md` only if an invocation changes (none is planned)
- [-] 4.0 Verify pilot migration with zero-regression evidence and record it in this list
  - [-] 4.1 Run each pilot before and after on the same commit/build. Parity: `collaboration-overlap` compares its stdout JSON `results` array; `theme` and `graph-warning` print only PASS lines, so count executed assertions (temporary counter in a scratch copy, or add a results array as a deliberate part of the pilot) and confirm injected faults still fail with the same named check
  - [-] 4.2 Time the before/after loop (build + run) and record it; the loop must be **not slower** (the pilot keeps the build prefix, so no speedup is expected by design)
  - [-] 4.3 `npm run guard:staged` on the migration commit; confirm `test/architecture-contracts` profile/inventories are untouched (no pinned file changed)
- [-] 5.0 Proposal execution phase 2 (only after 4.0 evidence is accepted): decide roll-out scope (subset vs all 99; package.json script trimming; possible node--test embedding) as a separate follow-up list

## Outcome

Decided 2026-11-18 by the owner: **no-go.** No script, npm entry or doc command changed; tasks 3.0–5.0 are cancelled (marked `[-]`).

- Why: shared setup is only about 9–14% of smoke lines, a build costs about 2 s so the pilot cannot be faster, one-file-per-scenario with a documenting header is deliberate and ~86 smoke paths are referenced from live docs, and the helpers a harness would build on are pinned assertion roots in the multiplayer gates.
- Rule adopted instead, recorded in the [testing guide](../../docs/testing.md): new smoke scripts reuse the existing shared helpers (`scripts/playwright-runtime.mjs` for Chromium, `scripts/collaboration-smoke-transport.mjs` for fault injection) and follow the setup of a current smoke rather than inventing another; no new harness layer.
- Verification: documentation-only; links reviewed and `git diff --check` run.
- Revisit if writing new smokes becomes painful or the smoke count grows enough that measured duplication exceeds the falsifiers in the research doc.

## Deep Dive

- Research doc: `docs/deep-dives/smoke-harness-simplify/research.md` (section 10 records the review corrections)

### Deep dive findings

Full evidence and reasoning: [docs/deep-dives/smoke-harness-simplify/research.md](../../docs/deep-dives/smoke-harness-simplify/research.md). Summary:

- The proposal's evidence numbers need correcting: `scripts/` holds 174 files; 106 `*-smoke.mjs` files total 18,734 lines (~19k was right, the count was not). 69 smokes call `startJumpyBrainHttpServer(` (not ~32); 65 of those also launch Chromium; 28 also start the companion gateway. package.json has 48 scripts, of which only 8 are `npm run build && npx --package=playwright ...` smokes — the "mostly" is wrong. Only 8 of 69 server smokes use `AccessStore.issue`; the rest pass static `apiKeys` literals.
- Duplication measured: 2,052 harness-token lines across all 106 smokes (10.9%); 1,585 in the 69 server smokes (mean 23 lines/script; ~25-45 including multi-line blocks). Aggregate absorbable is ~1,600-2,700 lines (9-14% of the corpus) — real but not dominant.
- Categorization: 82 browser smokes vs 24 non-browser (4 pure server proofs, desktop/Electron, install/packaging, imports). Families (sidebar x6, page-reference x4, semantic x3+, recovery x5, external-links x2) are deliberately distinct per their headers; drift is in setup style, not purpose. Headers double as docs (170 comment lines; 28 contain runnable commands) and must survive verbatim.
- Build coupling: `npm run build` is a clean build by design (rm dist + tsc, no incremental, + build-editor.mjs); recorded cost is only ~1.8-2.3 s on the maintainer machine (10 s benchmark ceiling). docs/testing.md already mandates build-once-per-change and 7 smoke headers say "use existing dist", so scripts can already rely on a pre-built dist; the 8 prefixed npm entries buy standalone reproducibility of the exact commands quoted in docs/release-testing.md for ~2-3 s each. `npm test` = `npm run build && node --test` and never discovers `scripts/*-smoke.mjs`, so smokes sit outside the release gate by construction; changing the build flow would touch package-footprint/editor-gzip/benchmark gates.
- Harness proposal: new helper `scripts/smoke-harness.mjs` (createSmokeBrain / issueSmokeKeys / startSmokeServer / launchSmokeBrowser + openSmokePage / re-exported installCollaborationSmokeTransport / runSmoke teardown wrapper / recordSmokeEvidence for the --out reports). Pilot: collaboration-overlap, ux-uncertain-save, theme, graph-warning, access-keys. Command names, npm entries and docs rows stay byte-identical (87 distinct smoke paths are referenced from live docs).
- Verification plan: same-commit/same-build before-after with dist buildId + runtimeSha256 comparison, stdout JSON results-array diffing, and mutation-style injected faults (fault-injector rules; scratch fixture/src mutations) that must still fail post-migration. Gate mechanics respected: architecture-boundaries scans src/ only, package-entrypoints pins manifest fields not the scripts block, package-footprint's files whitelist excludes scripts/, precommit-guard placeholder style for keys — but note the multiplayer gate contract fingerprints all of scripts/ and needs deliberate re-capture after any smoke edit (overstated; see review correction 2).
- Risks/falsifiers recorded in the doc: duplication is only ~11-12% of smoke lines; setup varies per script (autoIndex, QMD, multi-brain gateway, viewports, argv, env) so over-normalizing hides scenario differences; per-file explicit setup is a deliberate readability choice and the command surface is load-bearing for recorded evidence. Falsified if any pilot shows an unexercised assertion or an uncaught injected fault, if builds measure <= ~1 s, if < ~55/69 server smokes fit the API without escape hatches, if the 87 live-doc script references break, or if full-rollout savings fall below ~1,000 lines.

### Review corrections (2026-11-16)

Independent source-checked review; details in research.md section 10. Verified correct: file/line counts, 69 server smokes, 48 npm scripts, the build definition, `architecture-boundaries` scanning `src/` only, `package-entrypoints` pinning only manifest fields, the `files` whitelist excluding smokes, and the pilot script sizes.

1. Missed gate: `scripts/ux-uncertain-save-smoke.mjs` is pinned by hash in `test/fixtures/architecture-contracts/profile.json` (lines 16 and 119) with required observation ids. Migrating it, and making it import a new helper, needs a reviewed contract delta (`scripts/multiplayer-verification/contract-delta.mjs:108` rejects an unpinned new assertion helper). Dropped from the pilot.
2. The `scripts/` fingerprint caveat is overstated. `runtimeSnapshot` (`scripts/multiplayer-verify.mjs:126-135`) requires `scripts/` committed and unchanged during a run but does not compare it to the baseline. Real costs: edits to pinned assertion files need a reviewed delta, and Linux production reports bind the full source map (`scripts/multiplayer-production-verify.mjs:69`), so they are re-run for a new commit. The re-capture note in `docs/build-footprint.md:58-60` concerns `scripts/package-budget.mjs` only.
3. The research's fallback (grow `playwright-runtime.mjs`, `editor-smoke-helpers.mjs`, `collaboration-smoke-transport.mjs` into a harness) is the most expensive option: all three are pinned assertion roots.
4. Parity plan: only `collaboration-overlap` and `ux-uncertain-save` print a `{passed, results}` JSON line. `theme` and `graph-warning` print PASS lines and `access-keys` prints `ok - <name>` lines, so "every assertion still exercised" needs counting, not a JSON diff.
5. Teardown order: `ux-uncertain-save` closes browser, then server, then copies evidence and writes `report.json`, then deletes the temp root; `access-keys` swallows close errors and sets `process.exitCode`. A generic cleanup that just deletes the folder would break or change both, hence the ordered cleanup stack in 3.1.
6. Task 4.2 as written could not pass (the pilot keeps the build prefix, so no speedup); changed to "not slower".
7. Smaller numbers: only 2 of 69 server smokes omit `autoIndex: false` (`graph-topic`, `usability-writes`), not 17; `docs/release-testing.md` quotes none of the build-prefixed `smoke:*` entries (it quotes `smoke:desktop`, `smoke:electron`, `smoke:hosted`, `smoke:install`); `ALLOWED_PLACEHOLDER_VALUES` has no `disposable-*` entry (those literals pass because they don't match `SECRET_ASSIGNMENT`); 86 distinct live-doc smoke paths, not 87; 89 smokes import `../dist/`, not 86.
