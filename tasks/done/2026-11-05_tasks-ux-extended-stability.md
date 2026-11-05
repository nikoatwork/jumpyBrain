# Extended retained-candidate UX stability

Verification tranche of the [four-hour UX loop](../todo/tasks-ux-four-hour-loop.md).

- [x] Retain the completed 45-minute earlier-artifact result separately.
- [x] Freeze a new runtime/input receipt for a 90-minute run on the retained candidate; record visible epoch/revision per cycle.
- [x] Complete long idle/coauthoring/search/Back/reconnect verification, preserving every failed receipt.
- [x] Complete a broad pinned-engine run after the read-only recovery change, without rebuilding its artifact in place.
- [x] Verify same-tab/cross-tab credential changes retain private drafts and never publish them under a new identity.
- [x] Exercise actual actor-history expiry and the broader production collaboration/recovery journey.
- [x] Verify a deliberately delayed capabilities handshake stays locked and only opens confirmed live writing.
- [x] Complete a separate 60-minute frozen run and broad check on the later retained `b775d80` candidate.
- [x] Record exact snapshot, outcomes and limits; archive/commit the completed tranche.

Runner limit extends from 60 to 90 minutes and adds observational epoch/revision
fields; prior frozen inputs stay unchanged. The run uses 35-second idle intervals
and the same disposable real CLI/Chromium journeys. It is diagnostic stability
evidence, not a performance/native score. No real shared memory or installation.

The new runtime is build `c29c1197b7314d89`, SHA-256
`f8bf409b5a4ab13fc9f93eaef2871734b2761d674209a0adc7f216a4c225ddfa`;
runner SHA-256 `d137d37e0a91827d1efd4243bd531869688bdcc214f5e100152ae16e90aa05e5`.
Receipt `.local-pack/ux-soak/extended-01-409516f/report.json` is in progress.
The two 1280/390 credential-change cases passed: same-tab key changes remain
guarded; a cross-tab reader login retains and locks the private writer draft,
allows exact copy/explicit reader reopen, preserves its original recovery record
and does not publish or adopt it under the reader identity. Log
`/tmp/jumpybrain-ux-credential-draft-409516f.log`. No product change was justified.

The standalone default CLI actor-churn proof passed: 132 fresh CLI actors,
bounded retained history, explicit expired Undo with unchanged canonical bytes,
new human editing, stable recent actor Undo, reader/agent reconnect and actual
fixture credential revocation. Log `/tmp/jumpybrain-ux-actor-churn-409516f.log`.
The larger collaboration/recovery journey remains in progress.

The broader production collaboration journey passed as well, including two-context
convergence, actor Undo, agent streams, browser composition/range paths, offline
body/title reload recovery, cloned-tab actor isolation, explicit recovery-version
selection, title normalization, cursor/source history and changed-source restart
recovery. Log `/tmp/jumpybrain-ux-collaboration-editor-409516f.log`. Its browser
composition checks are not physical/native IME evidence. No source change was
justified by these passing checks.

Delayed-capabilities startup passed at 1280/390, alongside the seven existing
failed-capability/missing-note cases. Body/title and writing guidance remain
locked before permissions; attempted typing past the legacy debounce interval
sends no source mutation. On release, confirmed writer input saves once through
WS with no legacy PUT. Source already sets this lock synchronously, so no product
change was justified. Log `/tmp/jumpybrain-ux-pending-permissions-409516f.log`.

The retained `409516f` compiled snapshot passed the full pinned-engine suite:
1,918 tests total, 1,901 passed, 17 skipped, zero failed, ~618 seconds. Log
`/tmp/jumpybrain-ux-full-409516f.log`. No rebuild or source edit overlapped this
run; later changes are verification scripts/task evidence only. Do not rerun a
broad suite without a new product change, failure or unresolved concern.

Later retained fixes are separate from the frozen 90-minute artifact: peer
notice timing `9a37762` and narrow note entry `b775d80`. Their protected browser
checks passed; startup/credential probes now land with the [narrow-note archive](2026-11-04_tasks-ux-narrow-note-entry.md). A fresh 60-minute latest-
candidate run and broad compiled suite will cover these later changes. The
earlier 90-minute result cannot be relabeled as current-candidate evidence.

Later `b775d80` broad verification completed cleanly: 1,919 tests total,
1,902 passed, 17 skipped, zero failed, ~634 seconds. Log
`/tmp/jumpybrain-ux-full-b775d80.log`. Product code/runtime is frozen for the
remaining long observations unless an actual failure requires a new candidate.
The latest runner uses build `02721429af82d5af`, runtime SHA-256
`165376d2525f6f256f8b9e0ef0673368884a16f8956281cfdc0477afb92fc2e8`.

Exact active runtime bytes are also retained privately under
`.local-pack/ux-soak/runtime-evidence/<build>/` for builds `c29c1197b7314d89`
and `02721429af82d5af`. Their complete sorted-relative-path inventories match
the recorded SHA-256 values (515 runtime files each); source hashes alone are
not substituted for those bytes. Frozen script copies also match each report.
The first ad-hoc Python archive check used Path-component sort rather than the
runner's relative-string sort; its assertion stopped before copying. Corrected
matching serialization verified both unchanged runtimes before retention.

The earlier frozen 90-minute run completed cleanly: 119 cycles, 80 finishes /
39 explicit cancellations, 5,400,414ms, finished 2026-11-05 00:38:13 UTC.
Visible source revision 357 in one unchanged epoch; all 357 accumulated draft
markers and 119 peer contributions passed the in-run checks. Retained canonical
draft independently contains each of 119 human, 119 first-agent and 119 last-
agent markers exactly once. Report SHA-256
`78ee0019b875bc6b375abb1a9e96fb0a2edf63c406d67634283cafb765ee78b4`.
This is still build `c29c1197b7314d89`; the later retained candidate's separate
60-minute run remains pending.

Outcome: retained diagnostic evidence, no further product edit justified. The
latest `b775d80` run completed 81 cycles (54 finished / 27 explicitly cancelled)
on build `02721429af82d5af`, final revision 243 in one epoch. Requested duration
60 minutes; actual loop 3,610,246ms, including a final cycle crossing the boundary
by ~10 seconds. Finished 2026-11-05 00:43:28 UTC. No human-performance claim.
Report SHA-256 `061ae4c40ebd445dc86826cfa652dde40693aea443ffca3e24ed6f6cad101448`.

All accumulated 243 draft markers, 81 peer contributions, automatic index
publication/no-refresh CLI discovery, off-note scope/focus, UI search/Back and
observed reconnect/reload checks passed throughout. Independent final Markdown
readback confirms 81 human, 81 first-agent, 81 last-agent and 81 peer markers
exactly once. Runtime inventory stayed immutable; frozen inputs and exact
compiled bytes remain retained under the ignored artifact directories above.

The previous 90-minute and current 60-minute outcomes remain separate by build,
head, runtime hash and input hash. The latest broad suite is 1,902 passed /
17 skipped / zero failures. Source-informed browser/CLI checks and automated
accessibility probes do not establish native Mac, public VPS, physical assistive
technology, semantic retrieval quality or human discoverability/timing scores.
The separate one-hour private-draft observation is still active and is not part
of this completed tranche.
