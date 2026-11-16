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
  - [x] 1.6 Deliverable: `deep-dives/smoke-harness-simplify/research.md` and an updated "Deep dive findings" section in this list
- [ ] 2.0 **Clarify:** Go/no-go and scope after 1.0 lands — approve the harness shape and pilot set? Keep one-file-per-scenario? Fold into `node --test` or not? (owner: user, with research doc in hand)
- [ ] 3.0 Proposal execution phase 1 (only after 2.0 approves): build the shared harness module and migrate the pilot scripts only
  - [ ] 3.1 Keep each pilot script a standalone runnable with the same package.json entry and docs table row (command stability) unless 2.0 decides otherwise
  - [ ] 3.2 Update `docs/testing.md` command mapping if any invocation changes
- [ ] 4.0 Verify pilot migration with zero-regression evidence and record it in this list
  - [ ] 4.1 Run each pilot scenario before and after migration on the same commit/build; compare outcomes (all assertions exercised, failures reproducible when injected)
  - [ ] 4.2 Time the before/after loop (build + run) and record it; a loop that did not get faster is evidence against the proposal
- [ ] 5.0 Proposal execution phase 2 (only after 4.0 evidence is accepted): decide roll-out scope (subset vs all 99; package.json script trimming; possible node--test embedding) as a separate follow-up list

## Blockers

- Research (1.0) is dispatched and in flight; 2.0 cannot proceed until its findings are recorded here.

## Deep Dive

- Delegated research doc (to be written): `deep-dives/smoke-harness-simplify/research.md`

### Deep dive findings

Full evidence and reasoning: [deep-dives/smoke-harness-simplify/research.md](../../deep-dives/smoke-harness-simplify/research.md). Summary:

- The proposal's evidence numbers need correcting: `scripts/` holds 174 files; 106 `*-smoke.mjs` files total 18,734 lines (~19k was right, the count was not). 69 smokes call `startJumpyBrainHttpServer(` (not ~32); 65 of those also launch Chromium; 28 also start the companion gateway. package.json has 48 scripts, of which only 8 are `npm run build && npx --package=playwright ...` smokes — the "mostly" is wrong. Only 8 of 69 server smokes use `AccessStore.issue`; the rest pass static `apiKeys` literals.
- Duplication measured: 2,052 harness-token lines across all 106 smokes (10.9%); 1,585 in the 69 server smokes (mean 23 lines/script; ~25-45 including multi-line blocks). Aggregate absorbable is ~1,600-2,700 lines (9-14% of the corpus) — real but not dominant.
- Categorization: 82 browser smokes vs 24 non-browser (4 pure server proofs, desktop/Electron, install/packaging, imports). Families (sidebar x6, page-reference x4, semantic x3+, recovery x5, external-links x2) are deliberately distinct per their headers; drift is in setup style, not purpose. Headers double as docs (170 comment lines; 28 contain runnable commands) and must survive verbatim.
- Build coupling: `npm run build` is a clean build by design (rm dist + tsc, no incremental, + build-editor.mjs); recorded cost is only ~1.8-2.3 s on the maintainer machine (10 s benchmark ceiling). docs/testing.md already mandates build-once-per-change and 7 smoke headers say "use existing dist", so scripts can already rely on a pre-built dist; the 8 prefixed npm entries buy standalone reproducibility of the exact commands quoted in docs/release-testing.md for ~2-3 s each. `npm test` = `npm run build && node --test` and never discovers `scripts/*-smoke.mjs`, so smokes sit outside the release gate by construction; changing the build flow would touch package-footprint/editor-gzip/benchmark gates.
- Harness proposal: new helper `scripts/smoke-harness.mjs` (createSmokeBrain / issueSmokeKeys / startSmokeServer / launchSmokeBrowser + openSmokePage / re-exported installCollaborationSmokeTransport / runSmoke teardown wrapper / recordSmokeEvidence for the --out reports). Pilot: collaboration-overlap, ux-uncertain-save, theme, graph-warning, access-keys. Command names, npm entries and docs rows stay byte-identical (87 distinct smoke paths are referenced from live docs).
- Verification plan: same-commit/same-build before-after with dist buildId + runtimeSha256 comparison, stdout JSON results-array diffing, and mutation-style injected faults (fault-injector rules; scratch fixture/src mutations) that must still fail post-migration. Gate mechanics respected: architecture-boundaries scans src/ only, package-entrypoints pins manifest fields not the scripts block, package-footprint's files whitelist excludes scripts/, precommit-guard placeholder style for keys — but note the multiplayer gate contract fingerprints all of scripts/ and needs deliberate re-capture after any smoke edit.
- Risks/falsifiers recorded in the doc: duplication is only ~11-12% of smoke lines; setup varies per script (autoIndex, QMD, multi-brain gateway, viewports, argv, env) so over-normalizing hides scenario differences; per-file explicit setup is a deliberate readability choice and the command surface is load-bearing for recorded evidence. Falsified if any pilot shows an unexercised assertion or an uncaught injected fault, if builds measure <= ~1 s, if < ~55/69 server smokes fit the API without escape hatches, if the 87 live-doc script references break, or if full-rollout savings fall below ~1,000 lines.
