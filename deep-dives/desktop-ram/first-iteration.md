# Desktop RAM: first iteration — 2026-10-22

The first iteration reduces metadata/body-reading and graph allocation work, releases hidden graph rendering resources, and fixes long-index forwarding. It is functionally validated. **Matched whole-desktop RAM savings, numeric regression budgets, leak freedom and the 100 MB target remain unverified.** The user deferred the larger measurement/host program to [a follow-up task](../../tasks/todo/tasks-desktop-ram-follow-up.md).

## Implemented behavior

- Metadata reads use fresh 4 KiB positional reads, stopping at the end of frontmatter instead of retaining note bodies. Headers beyond 64 KiB fall back to the full compatible parser. No persistent cache was added; canonical full-document reads, external edits and duplicate-ID rules remain authoritative.
- Graph generation omits overview-only neighbor maps and repeated degree/filter intermediates. It hydrates snippets and missing modification times only for returned documents (at most 500), preserving link resolution, filtering, order, degrees and omission warnings.
- Leaving the graph cancels layout/filter timers and removes the hidden SVG/listener tree. The bounded packet, filters, selection and camera remain available for Back/reopen; editor drafts and save barriers retain their existing behavior.
- Index requests now stream through HTTP/HTTPS under the gateway's existing 610-second deadline. Node fetch's implicit five-minute header timeout previously cut legitimate indexing short. Cancellation, manual redirects, TLS verification, decoded response caps and backpressure remain enforced. Other routes retain their existing transport.

## Evidence

The [installed-app observation](findings.md) measured 371 MB median physical footprint during an uncontrolled idle session. It is context, not a before/after control.

[Backend diagnostic profiles](2026-10-22-backend-profile.json) on 10,000 synthetic notes showed graph operations around 1.9 seconds before and 1.25 seconds after, with post-operation JS heap around 114–119 MB versus 47–56 MB. Later passes returned to approximately 6–7 MB after explicit diagnostic GC; the first baseline graph retained approximately 69 MB at its immediate GC boundary. These process-only measurements show allocation churn and are **not whole-desktop savings or proof of leak freedom**; production never forces GC. The initial import profile covers app modules, not the full gateway. Broader import/CPU profiling is reproducible with `desktop-ram-profile.mjs`; its protocol yields before GC and differs from the initial profile.

[Twelve accepted workload baseline runs](2026-10-22-workload-baseline.json) cover 0/100/1,000/10,000 notes, three repetitions each, canonical save checks, lexical and complete semantic operations, graph interactions, minimize/close/reopen, five-minute recovery and guarded quit. Every observed owned descendant exited, and post-run artifact/model verification passed. Large semantic indexing embedded all 17,000 chunks in approximately 556–558 seconds, demonstrating that the timeout fix permits completion. Its sampled whole-tree physical peak was approximately 5.7–6.0 GB; active model work needs a separate budget from idle desktop memory.

The smaller baseline and corrected large baseline use explicitly recorded source/driver groups. Earlier pan, editor-readiness and five-minute-fetch failures are excluded. Optimized measurements were deliberately stopped early when the user chose this iteration; no matched acceptance comparison or numeric budget is published. OS cache/focus/thermal state and unrelated machine activity were not fully controlled. Sampled physical footprint is non-atomic kernel attribution, not deduplicated system DRAM or an absolute peak.

Functional validation passed **1,105 tests, one skipped, zero failures** in an isolated checkout, plus the production desktop/mobile browser smoke covering graph history/camera, canonical persistence, failed saves and credential recovery. Regressions cover metadata/parser parity and freshness, graph cleanup, decoded response limits, redirects/TLS, header/body aborts, and report rejection of incomplete or mismatched experiments. Eight differential graph response comparisons also passed.

## Boundaries and next iteration

Keep Electron and the existing close-to-background service contract. A disposable WKWebView pilot exists, but it is unsandboxed, lacks tray/login/update behavior and does not establish full parity or 100 MB operation. The 30-minute soak, detailed GPU trace, repeated native comparison, real-model cancellation probe, matched optimized runs and reviewed numerical budgets remain follow-up work.

Benchmark/report/compare commands are available under `benchmark:desktop*`; see the [workload contract](workload-baseline.md). Native/GPU/cancellation probes are separate research tools, not production behavior or completed acceptance. Comparison and budget-check tooling refuses missing repetitions/stages, partial semantic results, mismatched identities and surviving descendants. Budget generation is a proposal mechanism; no measured budget has been adopted yet.
