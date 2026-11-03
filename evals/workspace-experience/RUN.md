# Run the native workspace experience eval

This is an explicitly invoked T3 agent routine. Read [protocol.md](protocol.md), [state-model.md](state-model.md), [rubric.md](rubric.md) and the selected [mission cards](journeys/core.md). Use actual native Mac computer use for every human-side action. The helper prepares/records supported CLI activity; it never performs UI work. A headless script, browser tab, direct HTTP call or renderer mutation cannot establish a native Mac pass.

## Configuration

Copy `.env.example` to ignored `.env.local`. Reuse the installed Mac app and its bundled runtime CLI where possible. Set the local root, existing VPS origin, their Mac profile IDs and the existing private CLI credential file. Do not export Mac Keychain secrets. Record the owner's authorization and allowed targets for synthetic writes. Leave mutations empty for observation-only use. A helper-generated flag is not new authorization. Never dump the environment.

An existing dedicated test endpoint is ideal. A run inside an existing ordinary brain is `shared-synthetic`: prefixed titles are a naming convention, not access control or index isolation. Use only fictional run-owned records. Do not deploy another server, upgrade the installation or change permissions as incidental setup.

## Invocation

The owner can say: **Run `evals/workspace-experience/RUN.md` against local and VPS, save evidence, and report findings without fixing the product during the run.**

```sh
npm run eval:experience -- prepare --target local --run YYYY-MM-DD-local-01
npm run eval:experience -- prepare --target vps --run YYYY-MM-DD-vps-01
npm run eval:experience -- seed --run YYYY-MM-DD-local-01
# Repeat seed for VPS only within the recorded remote-write authorization.
```

Commands read only this folder's private config. They use an explicit root/URL on every memory operation and write private receipts under `.runs/<run>/`. Run names are exclusive: never overwrite an old attempt. Failed/unconfirmed creations remain unresolved in the ledger; do not recreate blindly. `node run.mjs --help` lists lifecycle and recording commands. Normal build, test, install and release never execute this suite.

Each run snapshots its private configuration and copies its exact nonprivate eval inputs into `inputs/`, verifying their preparation hashes. Later runs can use another candidate without retargeting old receipts/cleanup. Verification checks the frozen copies and evidence; it also reports current-checkout differences so reporting/bookkeeping corrections cannot silently change the executed version. Never replace frozen inputs to improve an old score.

To test a newer packaged build without replacing the installed app, build/pack normally, then run `node evals/workspace-experience/prepare-candidate.mjs --source .local-pack/desktop/jumpyBrain.app --name <unique-candidate-name>`. It prepares a separately identified, re-signed fixture copy, disposable local brain/profile/home, and the existing remote profile's opaque Keychain reference. It does not launch/install it or copy personal notes. Native computer use must launch that exact path. This is fixture preparation, not onboarding or distribution evidence. After quitting the candidate, stop only its disposable local backend through the CLI and retain the private candidate directory with evidence. The previous private config is retained there for restoration. Default to the installed app; a duplicate candidate is optional.

## Native execution

1. Inventory apps through native computer use. Bind the installed app by exact path if its bundle ID is ambiguous. Do not use AppleScript, CDP, DOM injection or private gateway requests to perform UI steps. If AX exposes only the outer window, use screenshots and keyboard/coordinates and record that limitation.
2. Select the configured brain through the app UI and check its destination in Settings. App selection does **not** retarget CLI defaults. Open the seeded unique handoff note, add the instructed human confirmation, and verify its exact ID/content through the CLI. In observation-only mode compare an approved existing note; do not create a sentinel.
3. Run the five core missions, then the two bounded probes. Observe before diagnosing. Capture a timestamped UI screenshot and AX text at required checkpoints; put both in that run's `ui/` folder. Record actions and assistance. Do not read product source or detailed scoring expectations to find a route during a scored mission. If prior source knowledge affects execution, disclose it.
4. For collaboration, start `producer --run <run>` in an exec session. Use `advance --run <run>` for each chunk, observing the app between chunks. `finish --run <run>` closes input; `cancel --run <run>` uses the real CLI stream cancellation. Stream activity, confirmed content, completion and indexing are separate checkpoints. The helper keeps a bounded producer alive; no second agent is needed for deterministic stream input.
5. Use `cli --run <run> -- <command/flags>` for supported canonical verification and board operations. IDs for mutations must be in the run ledger; UI-created notes/boards need `adopt --run <run> --kind note|board --id <id>` after their origin is confirmed. Adoption requires the run prefix and is not proof of origin by itself. Do not guess IDs. The private ledger includes seed keys/IDs and exact titles.
6. Record each checkpoint using `record --run <run> --file <private-result.json>`. See [the result template](result.example.json). A pass requires existing, hashed UI/CLI evidence. Missing intermediate evidence is `unverified`. Keep first-attempt failures; do not turn recovery into an unassisted pass.
7. Capture UI/index state **before** diagnostic recall/search. Local reads may repair indexes; hosted reads do not. Search from another note: global search deliberately excludes the current note. The editing tab's recent-save cache alone is not evidence of indexed discovery.
8. Review the trace with [rubric.md](rubric.md). Save anchored judgments separately from functional outcomes. Same-agent execution/judgment is diagnostic, not proof of human usability. A different reviewer may score saved evidence; do not delegate without owner authorization.
9. Restore the original Mac brain/view when possible, retaining any draft. `cleanup --run <run>` removes only recorded synthetic IDs whose current hashes equal the last explicitly verified hashes. It previews note deletion, stops on references/unknown changes, removes boards first and retains receipts. Never delete by prefix/glob, stop shared services, revoke credentials or reset shared indexes. Do not use native UI permanent deletion as cleanup.
10. Run `verify --run <run>` and `report --run <run>`. Review the proposed compact report before copying it to `reports/`. Raw outputs/screenshots may reveal private sidebar titles, paths or credentials and must stay private. `archive --run <run>` creates a checksummed private archive; retain it and its checksum alongside the reviewed report.

After a target switch, verify that new capture files actually landed in that target's run directory and that AX destination identity agrees with its manifest. Prefer an explicit destination argument in native-REPL capture functions; a closure can retain an earlier binding. If filing is corrected, preserve capture bytes/times and retain a correction record before scoring. Concurrent helpers update the creation ledger under an exclusive `.ledger.lock`, re-reading current state and publishing atomically. A leftover lock needs owner/process inspection, not blind removal. A cleanup hash mismatch requires review of the old receipt versus current canonical content before explicit re-verification; never bypass the hash guard.

## Pilot, baseline and reruns

The first run is a pilot until capture and interruption mechanics work. Freeze any protocol/fixture corrections before a new baseline; do not relabel the pilot. Reuse identical mission/rubric inputs for candidate comparisons, with a fresh run and disclosed model/tool settings and prior exposure. Change product identity deliberately; disclose all other differences. Compare local with local, VPS with VPS. A live shared corpus can drift, so timing/quality comparisons carry that limit.

For hill climbing: record the failure and proposed cause, fix in a separate task, then rerun affected missions and neighboring transitions. Keep gained **and lost** checkpoints. Do not change the rubric to make a candidate win. A one-off selection is supported; no automatic schedule or mandatory release gate is installed.
