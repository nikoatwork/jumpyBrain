# Real local/remote Mac connection UX

User request, 2026-10-31: visually test the actual Mac app with the personal local brain and HTTPS VPS brain, fix observed UX problems, test fixes, dispatch subagents. Temporary clearly marked notes may be created; preserve all existing notes. No publication requested.

## Work

- [/] Reproduce real-user connection, permissions, switching, editing and search flows.
- [x] Explain read-only access and connection failures with an actionable route to the correct Settings form.
- [x] Preserve keyboard focus after connection actions; clarify new vs saved key help.
- [x] Handle unsupported remote boards without a misleading retry/mutation loop.
- [x] Extend disposable desktop switching regression coverage.
- [ ] Commit scoped candidate, install via dogfood workflow and retest actual Mac + HTTPS flows.
- [ ] Remove only temporary test notes, verify pre-existing local Markdown hashes, document results/limits and finalize scoped commit.

## Initial evidence

- Baseline Mac CLI/app 0.3.13; VPS release 0.3.12. Source HEAD f214067, dirty unrelated sidebar task preserved.
- Real sidebar switch Local brain -> VPS brain succeeds but exposes raw `credential_unavailable · read only`, generic notes/recent-activity retry errors, and disabled New note without guidance. Saved native Keychain reference became unavailable following app replacement; no security checks will be weakened.
- New remote connections intentionally default read-only. The server key permits writes; app connection policy is separate.
- Source review found Settings busy rerenders discard action-button focus, misleading new-key help, and board controls without handling older server feature availability.
- Canonical local Markdown baseline (1659 files) and private backup retained outside Git at `/private/tmp/jumpybrain-remote-ux-20261031/`. No personal content belongs in task/test artifacts.

## Ownership

- Parent: real UI, remote compatibility, fixtures/cleanup, documentation and scoped commit/install.
- connection_ux agent: companion-browser status/access/settings UX and focused tests.
- switching_tests agent: disposable desktop connection smoke coverage.

## Verification

- Focused connection/browser/gateway/storage suite: 71 tests, initially 70 passed and one stale markup assertion failed. Updated the assertion to check the unchecked permission rather than exact attribute order; all 21 companion-browser tests then passed. Nine new connection-UX tests pass.
- Desktop fixture passed explicit remote editing, dirty title/body immediate switching, canonical separation, same-ID note distinction, sidebar/history fencing, saved roundtrip, and keyboard Test focus.
- Old-server fixture passed collection 404/405 handling, working notes, disabled unsupported changes, recovery, transient/auth differentiation, missing document/write distinction and read-only retention. Final retry-focus refinement awaits rebuild/recheck.
- Assembled-shell startup test caught an early notice initialization error; corrected with a construction guard and regression before candidate installation.
- The other sidebar task was committed independently as d69c3c5 while this work ran. Its changes were preserved; this task does not claim them.
- Real installed-app candidate testing remains pending. Keep this task active until completed.
