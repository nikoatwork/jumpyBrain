# Real local/remote Mac connection UX

User request, 2026-10-31: visually test the actual Mac app with the personal local brain and HTTPS VPS brain, fix observed UX problems, test fixes, dispatch subagents. Temporary clearly marked notes may be created; preserve all existing notes. No publication requested.

## Work

- [x] Reproduce real-user connection, permissions, switching, editing and search flows.
- [x] Explain read-only access and connection failures with an actionable route to the correct Settings form.
- [x] Preserve keyboard focus after connection actions; clarify new vs saved key help.
- [x] Handle unsupported remote boards without a misleading retry/mutation loop.
- [x] Extend disposable desktop switching regression coverage.
- [x] Commit scoped candidate, install via dogfood workflow and retest actual Mac + HTTPS flows.
- [x] Remove only temporary test notes and verify pre-existing local Markdown hashes.
- [/] Remove random staging path from the native helper signature and verify repeated-install Keychain continuity.
- [ ] Document final results/limits, archive task and finalize scoped commit.

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
- Old-server fixture passed collection 404/405 handling, working notes, disabled unsupported changes, recovery, transient/auth differentiation, missing document/write distinction and read-only retention. Final retry-focus refinement passed the rebuilt smoke, including repeated sidebar and Settings checks.
- Assembled-shell startup test caught an early notice initialization error; corrected with a construction guard and regression before candidate installation.
- The other sidebar task was committed independently as d69c3c5 while this work ran. Its changes were preserved; this task does not claim them.
- Installed exact committed candidate `84e9c7f` through `dogfood:install`, preserving the prior installation for rollback. Build and final focused suite passed (72/72); full connection usability and old-server compatibility smokes passed.
- Real native UI verified Keychain failure explanation and correct access-key focus; repaired using the existing protected key. Explicit editing-off notice disabled note/board creation and its Review editing access shortcut focused the right checkbox. Re-enabled editing and confirmed Test connection retains keyboard focus.
- Real VPS started on 0.3.12: explicit board-update guidance and disabled New board. Backed up current remote data/config, upgraded the service to the published, digest-verified 0.3.13 artifact, then clicked Check again: boards recovered without app restart.
- Real HTTPS UI created/renamed a temporary remote board, searched for the remote test note, added it with Enter and opened/edited its card. Switching to local showed only local pages, an empty remote-board list and cleared history; local search found its local marker and not the remote marker. Returning remote restored the remote note with its latest edit and board.
- Removed exact two temporary note IDs and one board using current hash preconditions; indexed both roots. VPS has zero documents and boards; all 1659 original local Markdown files retain their before-test SHA256, with no new Markdown left. App remains on the connected writable VPS brain.
- CLI developer feedback accepted as `77be377a-9f36-4140-9b15-f04894ddb4a7`. No private hostnames, credentials or personal note content included. Acceptance does not establish human review.
- Follow-up found deterministic installer root cause: desktop helper `Configuration.json` embeds the random package staging runtime path even though `--desktop-host` overrides it. Reused unsigned native executable bytes still receive a different ad-hoc signature because the sealed resource changes. Stable runtime-root configuration and repeated-install verification are required before archive. Cross-version helper identity remains a separate signing limitation. No public release or push performed.

- Installer follow-up implemented: stable installed runtime path in native sealed config. Real macOS codesign fixture verifies equal CDHash and designated requirement across different packaging directories; regression fails with old behavior. New regression and existing 9 desktop-installer tests pass. Actual repeated-install test pending.
