# Release v0.3.13

Published [v0.3.13](https://github.com/nikoatwork/jumpyBrain/releases/tag/v0.3.13). [Exact notes](releases/v0.3.13.md) and [QA](releases/v0.3.13.qa.md).

## Scope and decisions

- Requested 2026-10-30: publish newest version and commit outstanding work. Starting tree clean on master at `8282a3f`, 36 commits ahead of origin; latest published numeric release v0.3.12 (2026-10-29T13:18:27Z). No release today in Europe/Berlin. Fetched origin/master and tags; origin/master is an ancestor of HEAD.
- Release completed changes through canonical boards; pending queue curated to seven user-facing bullets. Existing unfinished tasks remain active. Default patch, aligned CLI/app 0.3.13.
- Installed candidate `d6a85983d2ee9095f13a38d7088d555124f1bbc6` dates to 2026-10-30T12:50:26.609Z and is current. Status reports about two elapsed hours, not actual usage. Latest three board commits are newer. Owner explicitly chose “Release after automated checks; accept the shorter test window.” No claim of a full day or verified personal use. Publication does not install the release.

## Live feedback review

- `npm run --silent feedback:inbox` checked 2026-10-30T14:44:44.779Z; full available received/non-spam inbox, no date bounds, one page, complete=true, no continuation. Scanned 16 messages; excluded two labeled synthetic tests; reviewed 14 genuine reports dated October 20–28. No newer messages. No messages sent, labels changed or attachments downloaded.
- Read newest deletion report’s full body at 14:45:29Z. Repeated permanence wording remains present: deferred UI-copy follow-up. October 28 requests to remove Insert page reference and add two-line related-page hover previews also remain deferred; not release blockers or claimed fixes.
- Earlier October 26–27 editor/feedback/navigation reports are covered by completed feedback integration: Find, slash formatting, readable tables, quiet references, concise search/session copy, labels and feedback success toast. Spaced bold delimiters remain literal by design. October 20 installation/direct-feedback friction was reviewed in completed installation/feedback tasks; no new evidence warrants expanding this release. Related footer restored in this candidate; tooltip timing refined. Raw private bodies excluded from Git.

## Verification

- Environment: Node v26.7.0, QMD 2.8.3 (facd35e), macOS 15.7.7 (24G720), arm64; existing locked dependencies and provisioned tools.
- [x] Build, fresh desktop package and note-lifecycle smoke at implementation `8282a3f`: passed. Real capture/search, graph/title navigation, two-tab stale-save recovery, 390/320 layouts, delete cancel/apply, unchanged backlinks and index refresh. Fresh outer package reused verified unchanged native helper.
- [x] Fresh packaged desktop lifecycle smoke: passed on the new outer package; native lifecycle/navigation checked against disposable data.
- Reuse unchanged feature evidence: canonical-board task’s 91 focused tests, browser boards/settings and production native local/remote CLI/UI checks; simple-onboarding and heading-rail production Electron/browser checks; latest sidebar-layout/collaborative checks; feedback CLI/integration tests. Full versioned suite remains mandatory below. No broad updater/semantic matrix warranted.
- [x] Curated notes and preparation committed as `ce58678`; dry run passed.
- [x] Full `npm run release` passed: 1,514 tests, 1,513 passed, zero failed, one optional provisioned-QMD check skipped (295 seconds). Validated 235 required distribution files; aligned versions, release commit `44a7e46738869168f8250c4c96c0a98e0733344d`, annotated tag and atomic push succeeded. Published 2026-10-30T14:52:26Z.
- [x] Verified public annotated tag/peeled commit, exact body, exactly one uploaded asset, all four tagged version files, packed manifests/Electron lockfile and independent download. SHA-256 `aa4b963d024f23ef3ad06838681cb7d37272a2b005971e441ef512d4da63fd47` matches GitHub and local validated archive; 1,203,231 bytes. Root package-lock is intentionally not included by npm pack.
- [x] Archived exact published notes and QA, cleared shipped queue, archived this task and updated changelog. Bookkeeping committed/pushed after publication; commit identity is reported in the release handoff.

## Limits

No clean-machine installation, live hosted deployment, real semantic-model gate, Intel, physical IME/accessibility or arbitrary personal/plugin-data testing. Latest canonical boards have disposable-fixture evidence but no verified owner-use window. Legacy development app-support collections retained but ignored; no importer included.

Logs: `/tmp/jumpybrain-v0.3.13-{build,desktop-pack,note-smoke,desktop-smoke,release}.log`.
