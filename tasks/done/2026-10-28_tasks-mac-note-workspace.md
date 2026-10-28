# Mac note workspace

## Outcome

Implemented the fourth design after three independent proposals and a three-agent panel. The Mac note page now has visible save/handoff actions, optional section navigation and saved-version context, presentation-only empty guidance, and Delete inside details. Canonical Markdown, existing remote permissions and conflict/recovery behavior remain with their current owners.

## Goal

Make the Mac app note page a minimal, approachable document workspace for people writing alongside agents and, eventually, cloud coworkers. Explore three independent directions, judge pain solved and delight, converge on a fourth and implement it end to end.

## Context

- Worktree: `/Users/monkey/dev/jumpyBrain-note-workspace`; branch: `feat/mac-note-workspace`, starting at `0c5b7fa`.
- Original checkout has unrelated retrieval/evaluation changes; preserve them.
- Markdown remains canonical. Existing save guards, write permissions and recovery must stay intact.
- Current agent attribution is declared provenance, not verified identity/presence/history. Cloud coediting is a future capability.
- User requested autonomous execution without questions; this overrides the task skill's clarification flow.

## Tasks

- [x] Inspect current app and create three independent design proposals.
- [x] Convene a three-agent panel judging every proposal on pain solved, delight, simplicity and trust.
- [x] Record the converged fourth design and implementation acceptance criteria. See [fourth design](../../deep-dives/mac-note-workspace/design-d.md).
- [x] Implement the Mac note journey using existing app/editor boundaries.
- [x] Verify canonical editing, external updates/recovery, keyboard access, responsive themes and real Electron behavior.
- [x] Update owning docs and pending release notes, archive this list and commit scoped changes.

## Artifacts

- [Design exploration](../../deep-dives/mac-note-workspace/)

## Verification and remaining limits

- Tested implementation starts from `0c5b7fa` on `feat/mac-note-workspace`; compiled version 0.3.11, source build fingerprint `71f85aec31602886`. Final scoped commit contains this archived record, code, tests, owning docs and pending release notes.
- `npm run build`: passed. Production bundle 186,071 bytes gzip, 15 bundled-package license notices; no new dependencies. Reviewed 1,102-byte growth and raised the ordinary editor review gate from 185,000 to 187,000 bytes.
- `node --test`: 1,433 tests; 1,432 passed, one existing skip, zero failures. Separate focused packaging/provenance/context rerun: 31 passed.
- `node scripts/electron-smoke.mjs`: passed with the sandboxed production Electron window/gateway, native Find, real autosave/canonical publication, labeled copy, outline/details, exact local saved editor/location, focus return and close guard. Disposable profile/data only.
- `npx --yes --package=playwright node scripts/note-workspace-smoke.mjs`: passed. Actual section caret/edit/undo, repeated headings, code/literal exclusions, exact unsaved-draft clipboard content, no context mutations, accepted saved facts, empty guidance, read-only remote companion, note scope reset and long-title sizing. Twenty captures at 1280/1180/900/390/320px in light/dark, details open/closed; desktop and narrow captures inspected.
- Existing `note-lifecycle`, `related-pages`, `note-find`, `note-attention`, `graph-linked-topic` smoke runners passed. Living-topic fixture + smoke passed unchanged/changed/missing source checks and canonical citation preservation in both themes at 1280/390/320px.
- Code review findings fixed: title remeasurement after rail width changes; strict date-only/calendar handling. Visual/keyboard QA fixed default outline borders and tooltip interference with Escape. Existing smoke discovery updated to open Page details for secondary controls.
- Initial broad run was invalidated by rebuilding while tests imported dist; discarded and rerun against a stable build. A dependency symlink also prevented license-notice collection; replaced with a worktree-local `npm ci`, then rebuilt and reran the entire suite successfully.
- `git diff --check`: passed. Original master checkout retains its unrelated retrieval/evaluation edits.
- Remaining limits: review scores are agent design judgments, not observed usability research. Chromium clipboard assertions use a write shim; physical clipboard and assistive technologies/other browsers need separate QA. No live presence, comments, invitations, retained edit history or real-time cloud coediting is implemented. No installation, push or release was performed.
- Captures: `.local-pack/desktop/note-workspace/` (production shared shell) and `.local-pack/desktop/note-workspace-light.png` / `note-workspace-dark.png` (production Electron). Interactive schematic: [design comparison](../../deep-dives/mac-note-workspace/comparison.html).
