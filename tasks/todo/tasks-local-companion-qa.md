# Local companion QA follow-up

## Goal and ownership

Resolve the findings in [the 2026-10-16 QA report](../../deep-dives/local-companion-qa/2026-10-16.md). This list owns implementation status.

- User approved upstream P1/P2 implementation, then scoped commit/push and cleanup. Unrelated existing theme/product work stays uncommitted.
- Starting HEAD: `d65dad0f77bac4cafee385f4706b505e539920bb`; implementation verification initially included uncommitted theme/product work. Commit preparation separately verifies P1/P2 on the clean baseline.
- Original QA is historical evidence, not a current test pass. Its installed build differs from this checkout. Do not modify the installed app or personal memory; all mutation coverage uses disposable fixtures.

## Tasks

- [x] 1.0 Confirm upstream authorization, instructions, dirty state, and task ownership.
- [x] 2.0 **P1 — Preserve interactions across healthy companion polls (development build).**
  - [x] 2.1 Add failing unit and integrated production-shell regressions for idle Search from Home/navigation, delayed query completion, inline suggestions/insertion, and local Dream explanation.
  - [x] 2.2 Limit destructive reference/dialog cancellation to entering frozen state; retain permission/UI synchronization and existing save/switch/session/generation barriers.
  - [x] 2.3 Verify genuine freezing still cancels interactions, repeated frozen snapshots do not repeat cancellation, and failed switches unfreeze only on authoritative idle.
  - [x] 2.4 Run relevant tests, companion browser/gateway smoke coverage, and review the incremental changes; record exact results below.
- [x] 3.0 **P2 — Explain partial graph results (development build).**
  - [x] 3.1 Confirm packet semantics: `stats.documents` is the whole-brain count, not matching-filter count; the node limit includes unresolved targets. The existing warning can also occur for exactly-limit filtered results, so do not infer an exact omitted/matching count.
  - [x] 3.2 Add failing unit/browser regressions, including a disposable real graph with more than 500 Markdown notes.
  - [x] 3.3 Render safe, accessible warnings plus shown/global counts and a filtering hint without changing graph limits or API semantics.
  - [x] 3.4 Cover filtered/uncapped/empty/refresh/error states, warning removal, unresolved targets, untrusted text, and stale response races; preserve existing theme/P1 work.
  - [x] 3.5 Rebuild, run targeted tests/browser smoke and incremental review, and record precise QA evidence.
- [ ] 4.0 **Test maintenance — Daily-capture helper.** Replace the stale inline `/Enter to insert/` assertion with stable instruction/behavior coverage and rerun all 15 cases, including desktop/narrow reference cases.
- [ ] 5.0 **Usability — Narrow graph filtering.** Give the input usable width at 390 px and 320 px without horizontal overflow; retain change/blur/Enter filtering unless separately agreed.
- [ ] 6.0 Record a dated follow-up QA report for the exact fixed build. Do not claim installed-app, theme, physical device/IME, OS clipboard, assistive-technology, other-browser, native Keychain/picker, signing/update, or real-hosted validation without performing it. Coordinate separate device gates with `tasks-page-reference-manual-qa.md`.

## Decisions

- P1 and P2 are complete in the development build; daily-capture test maintenance and narrow filter layout remain subsequent work.
- P2 is presentation-only: keep the bounded graph protocol unchanged, label total notes as whole-brain counts, and present the existing limit warning without claiming how many additional notes match a filter.
- No installed-app update, personal-memory mutation, or deployment is authorized by commit/push approval. Commit only the QA fixes, regressions, and evidence.

## Verification

[P1 follow-up QA record](../../deep-dives/local-companion-qa/2026-10-16-p1-follow-up.md) records commands, tested working-tree hashes, red/green evidence, preservation, and limits.

- Before fix: 2 new unit regressions failed; updated production-shell smoke reproduced Home Search closing across idle polls.
- After rebuild: 164 targeted Node tests passed; companion browser smoke passed including real poll-surviving Search/query/reference/Dream behavior; all 14 production-gateway checks passed; 26 autocomplete checks passed at 1280 px / 390 px.
- Incremental review found no introduced issues; `git diff --check` passed.
- Installed app remains unchanged and unverified for these fixes. Implementation verification did not change personal memory, configuration, deployment, or commits. Test maintenance and layout follow-ups remain pending; do not call the full QA clean.

[P2 follow-up QA record](../../deep-dives/local-companion-qa/2026-10-16-p2-follow-up.md) records semantics, commands, tested hashes, and limits.

- Before P2 fix: all four new unit cases failed; the new real-route browser runner reproduced hidden limit warnings with 501 disposable notes / 500 returned nodes.
- After rebuild: 168 targeted Node tests passed; graph-warning smoke passed at 1280/390/320 px with the unchanged cap; indexed graph-editor/Dream/map smoke and companion-browser smoke passed.
- New runner: `scripts/graph-warning-smoke.mjs`; count/global scope and warning text are visible, safe, and cleared/replaced on refresh/failure/retry. Read-only review and whitespace check passed.
- Existing graph warning precision for exactly-limit filtered results remains a possible separate follow-up; no matching/omitted total is invented by the UI.

## Isolated commit verification

P1/P2 were extracted from the dirty tree and applied to clean baseline `d65dad0f77bac4cafee385f4706b505e539920bb`, excluding unrelated theme/product changes. The independently built commit contents passed:

- `npm run build`, then `node --test`: **909 passed, 0 failed, 1 skipped**. The opt-in real-QMD 2.8.3 physical-readonly test requires `JUMPYBRAIN_TEST_QMD_BIN`; it was not provisioned for this run.
- All 168 targeted tests; graph-warning browser smoke at 1280/390/320 px; companion browser smoke; indexed graph-editor/Dream/map smoke; and all 14 production gateway browser checks.
- The first graph-editor run alongside the full suite reported two aborted recent-list requests; a separate serial rerun passed. Record this timing sensitivity rather than treating the first run as clean.
- Staged secret guard and whitespace checks passed. Only the QA code/tests/evidence are included; the installed app, personal memory, demo deployment, and unrelated working files remain unchanged.
- Cleanup removes the duplicate demo report/detailed checklist in favor of one upstream owner and a short demo handoff. Retain all three upstream QA reports as historical evidence; temporary staging worktree/backup files are not durable docs.
