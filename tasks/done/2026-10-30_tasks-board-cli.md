# Agent access to personal boards

## Goal

Keep boards a visual Mac feature while exposing a small `board` CLI namespace for agent creation, organization and evidence-backed initiative status. Wedding planning is the working example, not personal data to invent.

## Decisions

- Reuse the running companion's single-writer collections store and current brain profile. No separate CLI board store, hosted board API, implicit brain switch or memory writes.
- Ordinary Markdown notes remain cards. Board layout stays personal app configuration; normal remember/update commands own note content.
- Exact name or stable ID selection; ambiguous names fail. Revisions protect changes and generation/profile fences protect scope.
- Status reports placement plus bounded fresh note evidence and explicit omissions/unavailable notes, never inferred completion percentages.

## Tasks

- [x] Add focused board app operations, strict namespaced CLI and shared native companion transport.
- [x] Verify CRUD, membership, status evidence, concurrency, scope isolation and unchanged canonical notes against a disposable gateway.
- [x] Document agent usage and wedding-planning example; update owning docs and release notes.
- [x] Record verification/limits and archive scoped work for the task commit.

## Outcome — 2026-10-30

Implemented the optional `board` namespace with list/show/status/create/update/delete and card add/move/remove. Names or stable IDs select boards; file-based layouts, renamed columns and settle/restore are supported. All mutations use the existing Mac collections writer. A private shared companion client retains extension-management compatibility; older apps fail a board capability preflight. No personal data, installation, version, push or release changed.

## Verification

Tested `4a4f454` plus this scoped implementation:

- `npm run build` passed (TypeScript and editor bundles).
- Initial focused `node --test test/boards-cli.test.js test/extensions-cli.test.js test/collections.test.js test/architecture-boundaries.test.js test/cli-baseline-contracts.test.js` passed all 33 tests.
- All eight final new board tests passed in the broader run, including the two added old-app capability and mid-status layout-change regressions. Coverage includes real-gateway CRUD, fresh canonical evidence, revision conflicts, scope fencing, read-only remote organization, missing/unavailable/truncated evidence, JSON validation and unchanged note bytes.
- Existing browser `scripts/boards-smoke.mjs` passed on retry: creation, columns, card operations, previews, editor navigation, settle/restore, reload and local/remote brain switching. The first run overlapped the broader suite and timed out at the final remote search option (line 237); no implementation change was needed for the passing retry. Contention is a possible cause, not proven.
- Broader `node --test` was **not fully green**: 1,483 passed, one skipped, two failed. One failure is the deliberately terminated optional installer test process after over eight minutes of repeated fixture installations. The other is `test/memory-cli.test.js:319`, where background indexing changed derived files across a whole-root read-only dream snapshot assertion. No board code changes ordinary remote memory dispatch or indexing.
- Isolated `node --test test/memory-cli.test.js` subsequently passed all 30 tests, including that remote case. The broad-run failure remains recorded; no unrelated production/indexing or test behavior was changed.
- Scoped staged privacy guard passed; removed an extra trailing blank line found by the staged whitespace check.

## Remaining limits

- Requires the running updated Mac app and its selected profile. No CLI-only/offline board storage or hosted/shared board protocol.
- Existing three-column format and 32 KiB collections save limit remain. Board status reads up to 12 cards by default (explicit maximum 50), with at most 1,000 characters of whole body lines per card. More evidence uses ordinary targeted reads; no aggregate token-budget claim.
- Status is current per-note evidence, not a transactional multi-note snapshot, retained history or automatic initiative synthesis. Arbitrary columns never imply verified completion.
- A create response lost in transit is uncertain; inspect the board list before retrying. Definitions may retain IDs for missing notes, which status reports explicitly.
- Installed native app parity and a clean complete installer/full-suite run were not verified. The Mac UI was exercised through the disposable gateway/browser; no UI source was changed.
- Wedding planning is an agent workflow example and disposable test fixture, not a board written into the user's personal memory.
