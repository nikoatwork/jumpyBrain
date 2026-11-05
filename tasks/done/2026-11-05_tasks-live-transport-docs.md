# Find live-update architecture quickly

Completed 2026-11-05. Added a subsystem lookup map and co-located WebSocket/client lifecycle documentation. The local ignored agent notes now point architecture questions at the map.

Goal: make the live messaging stack and its lifecycle discoverable from the architecture entry point and co-located module documentation.

## Tasks

- [x] Verify the WebSocket library, protocol, client, desktop bridge and existing connection states against source.
- [x] Add a subsystem lookup map and document the existing editor connection lifecycle with links to app policy and eval boundaries.
- [x] Verify documentation links and diff, record limits and archive scoped changes for the task commit.

## Relevant files

- `src/architecture.docs.md` — subsystem/stack lookup.
- `src/adapters/live/live.docs.md` — co-located WebSocket protocol and lifecycle.
- Local ignored `AGENTS.md` — architecture lookup instruction; remains private.

## Scope and limits

Documentation only. No runtime, eval inputs, scoring, dependency or release changes. The existing client has `offline`, `connecting`, `ready`, `blocked` and `closed` states; this task documents them, without claiming complete transition coverage. No relevant prior local memory passages were found.

## Verification

Tested snapshot: `f3ffb46a231a515582d4020bb152b4f81d77ba5f` plus the scoped documentation changes. Checked all 41 relative links/anchors in the two edited docs and matched all five documented connection states against the source declaration. `git diff --check` passed. Runtime tests were unnecessary for this documentation-only change. Pending release notes are unchanged because product behavior is unchanged.
