# Repeatable desktop RAM baseline

`scripts/desktop-ram-fixtures.mjs` prepares deterministic seeds. `desktop-ram-benchmark.mjs` runs the isolated production Electron/native-helper/runtime stack; `desktop-ram-report.mjs` summarizes simultaneous samples and checks explicit budgets. The native and GPU commands are separate experiments. Fixture preparation alone supplies no RAM result.

Iteration status: all twelve baseline repetitions completed and are [published as reviewed aggregates](2026-10-22-workload-baseline.json). The user deferred full matched optimized acceptance, soak/GPU/native experiments and adoption of numerical budgets to [the follow-up task](../../tasks/todo/tasks-desktop-ram-follow-up.md). Tools described below are available; their existence does not mean those experiments passed.

## Prepare and verify

From the repository, choose the exact installed or packed bundle to measure and a **new** output directory whose parent exists:

```sh
npm run benchmark:desktop:prepare -- \
  --app "$HOME/Applications/jumpyBrain.app" \
  --output /tmp/jumpybrain-ram-baseline

npm run benchmark:desktop:prepare -- \
  --verify --output /tmp/jumpybrain-ram-baseline
```

Preparation refuses any existing output directory, including an empty one. It never starts/quits the installed app, edits its configuration, changes the CLI target, reads personal notes, indexes, downloads models, or writes outside the chosen output directory. A failure leaves an incomplete directory for inspection; choose a new output path to retry. Only a completed `manifest.json` identifies a prepared set. The full manifest contains local installation paths; keep it local and publish only reviewed summaries. Generated roots/results should live outside the repository or under ignored `.local-pack/`.

The manifest records macOS version/build, hardware model/CPU/RAM, generator hash, repository context, exact app version/runtime version, and a SHA-256 tree fingerprint of all app files, directories/modes and internal symlink targets. Framework aliases do not double-count bytes. External or broken bundle symlinks fail rather than silently omitting dependencies. File timestamps are excluded from the content fingerprint; changing files during hashing fails on ordinary stat changes. This is not an atomic filesystem snapshot: stop updates during preparation and re-verify immediately before and after measurement. The checkout commit is context, not proof of the installed bundle's source revision.

The external Node binary and QMD launcher are also hashed. **The launcher hash does not identify the entire external QMD dependency tree.** Before index/search measurements, fingerprint the resolved QMD package tree with the exported `fingerprintTree` helper and record its version, actual child runtime, model path/hash and relevant execution configuration in the run record. No QMD or model workload has run during preparation.

## Corpus v1

Each root has compatible schema-v1 configuration with an explicit lexical policy, six canonical buckets, no derived index, and no model. The manifest includes every file's hash, aggregate Markdown bytes/hash, exact size distribution and expected link counts. The bytes/hash for the entire root also cover configuration. No generated documentation inflates the note count.

| Notes | Markdown bytes | Resolved link occurrences | Missing link occurrences | Orphan notes |
| ---: | ---: | ---: | ---: | ---: |
| 0 | 0 | 0 | 0 | 0 |
| 100 | 286,720 | 270 | 9 | 10 |
| 1,000 | 2,867,200 | 2,700 | 90 | 100 |
| 10,000 | 28,672,000 | 27,000 | 900 | 1,000 |

Every ten notes contain eight 1,024-byte notes, one 4,096-byte note and one 16,384-byte note, including UTF-8 frontmatter/body/newlines. Buckets are 50% notes and 10% each sessions/findings/decisions/preferences/pages. Titles and valid IDs are unique and deterministic; metadata and file modification times start at 2026-01-01, advancing one second per note. The first 90% form a linked component: each links to offsets 1, 7 and 31 (wrapping within that component) using a title reference, a Markdown root-relative path and a memory ID. Every tenth connected note has one unresolved title reference. The final 10% have no incoming or outgoing links. Counts describe occurrences, not a graph renderer's deduplicated/bounded result.

The repeated synthetic observatory text tests scaling and makes results reproducible; it does not represent real-world relevance or varied attachment-heavy documents. Each note has an exact `ramneedleNNNNN` search token. `How are telescope sensors aligned before observations?` is the fixed semantic query; record actual retrieval mode/readiness, not an assumed relevance score.

## Workload contract for the driver

Use fresh copies of a verified seed for each size, mode and repetition. Never measure while generating/copying/hashing fixtures: those operations warm filesystem caches and consume CPU/RAM. “Cold” means fresh application processes and disposable user data, **not** a cold OS disk cache. Record unrelated machine load, memory pressure, display resolution/device scale, power mode, viewport and cache policy. Keep instrumentation outside the owned desktop tree and record its overhead separately.

Follow the isolation pattern in `scripts/unified-desktop-smoke.mjs`: copy the native helper/resources, configure only disposable support/user-data/memory paths and a fresh loopback port, preserve real native host/gateway and quit/save barriers. Hash the actual configured copy and any driver/main-process code too; a source-driven test harness must not be labelled as the unmodified installed artifact. Do not launch the installed bundle against its personal configuration for this test.

Separate modes:

- **Unindexed:** the prepared roots. Home/editor/graph and lifecycle measurements; search unavailable is not a search result.
- **Lexical:** after the unindexed UI stages, explicitly index the disposable root through the authenticated production gateway, then search. Save the successful work/readiness result. No semantic/model work occurs in this phase.
- **Semantic:** explicitly change only that fixture's policy to a pre-provisioned local GGUF and its SHA-256, then index and search through the same gateway. This measures conversion from the preceding lexical index, not a separate prebuilt-index launch. Require semantic readiness and results; missing model/support is unavailable, never lexical fallback. Model provisioning is outside timed runs. Both compared suites use this identical sequence.

Run at least three repetitions for each applicable size/mode. Record start/end events, monotonic latency, stage success, raw simultaneous samples and child identities for:

1. Background cold launch until authenticated readiness, with zero windows.
2. Open home at a fixed 1280×820 viewport, then open note 00000 on nonempty corpora.
3. Append a unique run marker, wait for confirmed save, verify canonical bytes and protected ID, navigate away/back and verify persistence. For the zero-note corpus, record open/edit/save as inapplicable; test creation separately because it changes the corpus size.
4. Lexical search `ramneedle00000`, semantic search using the fixed query above, and explicit index refresh in their applicable modes.
5. Open graph, wait for ready, record displayed/omitted node/edge counts, pan/zoom, resize through fixed sizes, return home and settle. Record device scale, surface/canvas dimensions and GPU allocation telemetry.
6. Minimize, restore, close the last window, confirm renderer exit while the service remains healthy, reopen, then explicit guarded quit. Confirm all observed owned descendants exit; do not treat loss of the root PID as proof children stopped.

For each stage, record a fixed **15-second post-operation observation window**, active-work sampled maximum and operation latency. This supersedes the initial 60-second proposal and is not a claim that every stage has reached equilibrium. Continue sampling for five minutes after reopen; report the final 60 seconds as recovery settled memory. Use separate phases/labels for operation, post-operation and recovery samples. Save rejected/raced/inaccessible samples with reasons; never present partial trees as complete totals. Track short-lived QMD/model descendants and per-operation high-water telemetry separately. The 100 ms sampler can still miss children shorter than its cadence and cannot establish an absolute peak. Explicit-quit latency ends at the first empty owned-process sample, including descendant drain. The existing five-second `measure-macos.py` sampler describes settled memory only. Do not sum process lifetime peaks or substitute summed RSS for physical footprint. Summed per-process physical footprints are kernel-attributed charges, not a deduplicated measurement of unique system DRAM; shared/GPU allocations and OS pressure affect attribution and recovery.

Finally run a 30-minute navigation/edit/search/graph loop on disposable notes, verifying saves and recording windows, workers, graph objects, descendant identities and memory trend. Do not infer leak freedom from a short smoke test or stable RSS alone. Budget thresholds remain unset until the repeated workload data establishes variance.

## Reproduce the workload

On macOS, build the runtime and prepare the packed native helper using the supported desktop build workflow. Install the Electron integration dependencies from its lockfile. Supply an already provisioned compatible GGUF; the benchmark does not download one.

```sh
npm run benchmark:desktop -- --output .local-pack/ram-run \
  --model /absolute/path/embeddinggemma-300M-Q8_0.gguf
npm run benchmark:desktop:report -- --input .local-pack/ram-run \
  --output .local-pack/ram-summary.json
```

The defaults cover all four corpora, three repetitions, 15-second stage windows and 300-second recovery. Every run has new resources, support directory, capability, memory root and user data. The manifest freezes the source, driver, sampler, external QMD package and model hashes. `--source PRIOR_SUITE/snapshot --driver PRIOR_SUITE/driver.mjs` reuses an exact source/driver; changed implementations should use a separately built source snapshot with the same driver. Existing output directories are refused. Do not build or alter that source during a run.

```sh
npm run benchmark:desktop -- --source SNAPSHOT --output .local-pack/ram-soak \
  --counts 1000 --repetitions 1 --soak 1800 --no-semantic
npm run benchmark:desktop:native -- --source SNAPSHOT \
  --output .local-pack/ram-native --count 1000 --repetitions 3
npm run benchmark:desktop:gpu -- --source SNAPSHOT --output .local-pack/ram-gpu
```

The GPU run adds memory-infra tracing and a larger resize sweep, so it is diagnostic and cannot establish acceptance savings. The WKWebView prototype is unsandboxed and has no tray/login/updater implementation. Its optional private OS responsibility query includes WebKit XPC processes parented by launchd; unsupported responsibility attribution fails instead of publishing a host-only total. Native graph pan uses map APIs rather than Electron's real pointer events; compare host results with that limitation. Native lifecycle runs are unindexed, so post-semantic Electron lifecycle numbers are not a matched host comparison.

Keep raw traces, corpora, credentials and full manifests local. Publish reviewed path-free summaries. Record unrelated machine activity and focus/cache/pressure limitations with each result; this is a manual machine-specific benchmark, not a deterministic unit test or universal memory guarantee.

## Compare and guard regressions

```sh
npm run benchmark:desktop:compare -- \
  --baseline .local-pack/baseline-summary.json \
  --optimized .local-pack/optimized-summary.json \
  --output .local-pack/comparison.json --budgets .local-pack/proposed-budgets.json
npm run benchmark:desktop:report -- --input .local-pack/optimized \
  --output .local-pack/checked-summary.json --budgets .local-pack/proposed-budgets.json
```

Comparison refuses incomplete coverage and mismatched hardware, workload, driver, sampler, external engine or model identities. Aggregate medians/ranges are across repetitions, not pooled samples. Inspect the proposed budgets before adopting them. Their initial allowance is the measured maximum × 1.2 plus at least 25 MB or one observed replicate range, rounded up to 25 MB; latency gets maximum × 1.5 + 250 ms. Stage/corpus-specific thresholds separate background, open UI, indexing and retrieval modes. They are deliberately provisional for this machine/model, with a 1% ceiling on rejected samples. A different model/machine/workload fails scope checks and needs separately reviewed limits. Missing repetitions, missing settled windows, incomplete results, partial/unavailable semantic retrieval, and surviving descendants fail the guard even if the observed bytes are low.

The 2026-10-22 investigation has two explicitly recorded driver groups. [Frozen workload v1](workload-v1.mjs) completed all nine 0/100/1,000-note baseline runs; its 10,000-note attempt raced document loading and failed, so that attempt is excluded. The corrected current driver waits for loaded, visible, editable content. A second large attempt exposed the production gateway's implicit five-minute fetch timeout, before its existing 610-second index deadline. The index streaming fix is applied equally to the large control and optimized snapshots; their driver also uses explicit-deadline HTTP. Completing the older smaller comparison requires v1 and the original gateway on both sides. `--counts 0,100,1000` on the report selects those recorded corpora and preserves the original selection in the summary; it never converts a failed run into a success. Compare each group independently before combining aggregate cells. The published identities record both source/driver groups; no completed before/after aggregate is claimed. v1 is retained only for that artifact's reproducibility; use the corrected default for new benchmarks or regenerate both controls and optimized runs with it.

The comparison also reports RSS medians and sampled maxima for each whole stage, separately from settled physical footprint and active-work physical peaks. Each RSS range summarizes three per-run statistics; it is not a settled-only RSS measurement. Budget checks require successful post-run artifact verification even when memory readings fall below every limit.

For cancellation, use a new disposable root and an already provisioned model:

```sh
npm run benchmark:desktop:cancel -- --source SNAPSHOT \
  --sampler .local-pack/optimized/sample-tree --model /absolute/path/model.gguf \
  --output .local-pack/ram-cancel
```

The probe cancels the actual CLI after an observed descendant exceeds 400 MB, then requires the sampled tree to drain, the root lock to disappear, and the first generation to remain unpublished. This complements deterministic process-group/rollback tests; it does not prove cleanup after SIGKILL or escaping process groups.
