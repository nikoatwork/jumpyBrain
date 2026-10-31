# Release v0.3.14

Completed and verified 2026-10-31. Requested 2026-10-31 after completing the sidebar review improvements. Scope: all completed changes on clean master through `15ad9a0`, since published v0.3.13 (`44a7e46`). No unfinished source changes included.

## Tasks

- [x] Review live feedback, publication cadence, remote history and pending notes.
- [x] Build, package the desktop candidate and run the core note lifecycle smoke.
- [x] Commit preparation, run dry-run and full patch release workflow.
- [x] Verify public tag, aligned versions, exact notes and downloaded artifact digest.
- [x] Archive exact notes and QA, reset the shipped queue, finalize this task and commit bookkeeping.

## Scope and environment

- No release published on October 31 Europe/Berlin; latest is v0.3.13, published October 30 at 14:52:26Z. Fetched origin/master and tags: local master is six commits ahead, none behind.
- Node v26.7.0, QMD 2.8.3 (facd35e), macOS 15.7.7 (24G720), arm64. Existing locked dependencies and provisioned tools.
- Installed candidate `820eb94` (0.3.13) remains current. Short focused real Mac/HTTPS use and repeated identical installation are recorded in [connection UX](2026-10-31_tasks-remote-switching-ux.md). The latest sidebar refinements in `15ad9a0` have browser and native fixture evidence, not extended personal use. Proceeding under the owner's immediate release request after implementation; no full-day use claimed and no replacement of the personal installation as part of publication.
- Reuse [sidebar review validation](2026-10-31_tasks-board-sidebar-review-improvements.md), [board tree validation](2026-10-31_tasks-board-sidebar-tree.md), [sidebar/settle validation](2026-10-31_tasks-sidebar-hierarchy-and-settle.md), and the connection/native-identity evidence above. Relevant implementation is unchanged. Full versioned suite remains release-owned.

## Live feedback review

Full received/non-spam inbox checked at `2026-10-31T19:31:14.572Z`: complete single page, 21 messages scanned, two synthetic delivery tests excluded, 19 genuine reports spanning October 20–31. Four recent installation/deployment/connection reports read in full through 19:31:28Z. No replies, new tests, attachments downloaded or private message bodies committed.

- October 30 folder request: addressed by optional board → column → page navigation and the review refinements.
- October 31 connection/Keychain reports: included actionable key/permission notices, older-server board compatibility and focus retention. Implementer follow-up confirms real Mac/HTTPS validation and identical-reinstall credential continuity. Stable signing across genuinely changed native/version resources remains deferred; no general upgrade credential-continuity claim.
- October 30 installation report: defer user-writable QMD install/preflight, fail-fast ordering, local installer source selection, one-step app installation and published-release default to installer work. Existing successful install path reported; this release does not change it.
- October 30 VPS report: defer Docker build-context omission (Dockerfile omits scripts required by build), container gate, server-enforced scoped keys, credential profiles and hardened deployment/backup guidance. Source inspection confirms the Docker omission; Docker is not the published tarball distribution and no container fix is claimed here.
- Earlier reports: repeated deletion warnings, Insert page reference removal and related-page hover snippets remain deferred as in v0.3.13 QA. Other editor/navigation reports were covered by prior completed work. No new evidence of data loss or broken core retrieval in the chosen snapshot.

## Validation and publication

Build, fresh desktop package and core note lifecycle smoke passed on implementation `15ad9a0`. Smoke covers canonical capture/search, graph/title navigation, stale-save recovery, narrow layouts and deletion/backlink preservation. Logs use `/tmp/jb-release-0.3.14-*.log`. Dry run and full release passed; public tag, exact notes, aligned component versions and downloaded SHA-256 verified. See [release QA](releases/v0.3.14.qa.md) and [exact published notes](releases/v0.3.14.md). Release commit: `7573405`. Full versioned suite: 1,524 passed, zero failed, one optional test skipped. Published at 2026-10-31T19:37:34Z. Shipped note queue cleared; no installation performed.
