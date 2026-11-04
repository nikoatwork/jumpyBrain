# Release v0.3.19: desktop update brain recovery

Status: complete. Published and verified v0.3.19. Owner requested a pragmatic hotfix publication, independent
reproduction and improved diagnostics; a new day-long personal-use window is
not established. Publication does not install or change existing personal apps.

## Scope and feedback

- Live read-only full available received/non-spam inbox checked at
  2026-11-03T07:53:14.725Z: no date bounds, one page, complete, 41 scanned,
  two explicitly marked delivery tests excluded, 39 genuine reports (owner,
  agent and external reports are not 39 independent users). Dates span
  2026-10-20 through 2026-11-03. Spam/trash/blocked mail outside scope.
- Read today's opening/boards report and its diagnostics attachment privately;
  reproduced surviving old daemons using actual published v0.3.17 runtime.
  Included lazy authenticated graceful handoff, bounded concurrency recovery,
  backend diagnostic codes and static version-conflict guidance.
- Read November 2 16:37/17:01 UTC single-user draft/conflict reports in full;
  defer matching-artifact investigation and editor conflict diagnostics to
  [feedback unit 7](2026-11-04_tasks-feedback-independent-increments.md). Other prior
  triage remains under existing task owners. No private bodies/raw logs in Git,
  no replies, label changes or test feedback submissions.
- Latest public numeric release v0.3.18, published 2026-11-02T17:01:19Z;
  no release on November 3 Europe/Berlin. Fetched origin/master and tags;
  clean master at intake `ac94cea`, no remote divergence. Next patch is 0.3.19.
- Exact two-bullet pending notes cover only this hotfix; all other work remains
  under its existing owner. Implementation verification is in the
  [hotfix task](2026-11-03_tasks-desktop-update-brain-hotfix.md).

## Gates

- [x] Full live feedback/history/scope review.
- [x] Build, fresh desktop package and core note lifecycle.
- [x] Targeted backend/diagnostics/UX and packaged recovery/update checks.
- [x] Commit final implementation and curated notes; run release dry run.
- [x] Full patch release with aligned manifests/lockfiles, full deterministic
  suite, package validation, atomic master/tag push and public asset.
- [x] Verify tag/notes/versions/single asset/downloaded SHA-256; archive exact
  shipped notes and QA, reset pending notes, finalize task and commit bookkeeping.

## Limits

No new real-brain use window or direct access to the reporting machine.
Automated ARM64/macOS 15 evidence does not establish Intel/macOS 26, OS sleep,
public signing/notarization, installed public upgrade or unrelated editor fixes.
Tests fault only disposable roots. Explicit foreground hosted servers retain
their configured host/port and require deliberate operator update; unknown or
same-version divergent builds keep actionable mismatch errors.


## Preparation evidence

Implementation based on `ac94cea`, macOS 15.7.7 ARM64, Node 26.7.0. Build,
fresh signed desktop package (unchanged verified native helper reused), core
note lifecycle, 48 focused backend/diagnostics/UX tests, five packaged backend
recovery scenarios and representative installed-update success all pass.
Initial updater cleanup ENOTEMPTY was fixed by gracefully draining only its
fixture owner; the final entire command exits zero. No assertions weakened.
Published v0.3.17 -> candidate production-gateway handoff preserves exact note
bytes; installed update uses controlled fixture versions and does not establish
installed public-upgrade success. Existing dogfood v0.3.13 is obsolete, not use
evidence. Logs `/tmp/jumpybrain-hotfix-*.log`; detail in the implementation task.


## Completed outcome

Published [v0.3.19](https://github.com/nikoatwork/jumpyBrain/releases/tag/v0.3.19) at 2026-11-03T08:06:03Z, release commit
`916663383fa14be7c5007349fb86dc7f66523d30`. Full release passed 1,865/1,865 tests with no skips.
Verified annotated public tag, exact notes, aligned component versions, single
asset and matching downloaded/local/GitHub digest `sha256:0ab3934c48f1dd45197a1c83d35b65dcbfda4cf6bda8217ec1caac1f224834b3`.
Archived exact notes at [v0.3.19.md](releases/v0.3.19.md) and detailed verification
at [v0.3.19.qa.md](releases/v0.3.19.qa.md); pending notes reset to their heading
because both included bullets shipped. The completed implementation is `d273573`.
Archived this task and committed bookkeeping separately. Publication did not
install on either Mac; the reporting machine still needs to update and retry.
