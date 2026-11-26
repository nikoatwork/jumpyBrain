# Verify upgrades and mixed Mac app connections

## Goal

Verify the packaged upgrade and rollback paths plus the Mac app’s existing selection of two local and two hosted brains. Use the delivered hosted recipe and the named CLI selector.

[Architecture and rollout overview](tasks-multi-brain.md).

Depends on [hosted deployment](../done/2026-11-26_tasks-multi-brain-hosting.md) and [CLI targets](../done/2026-11-26_tasks-multi-brain-cli-targets.md).

## Tasks

- [ ] Test the supported update and rollback from a pre-feature release on a disposable managed local install and a remote-only install. Check exact Markdown bytes, defaults, saved credentials and app connection identity. Rehearse the optional hosted owner handoff with the same origin and root.
- [/] In Chromium, switch the companion among two local folders and two hosted origins with an open edit. Check draft handling, stale requests and WebSockets, and verify the CLI target stays independent. Smoke the packaged Mac app for profile persistence and reopen after upgrade.
- [ ] Record the tested versions, supported upgrade order, expected downtime and untested limits. Publish the adoption and recovery steps in the owning docs. Review security-sensitive changes with the repository’s independent-review workflow before finalizing.

## Completion gate

Rehearse upgrade and rollback on disposable prior-version installs and an optional hosted owner handoff. Record the compatibility matrix, actual downtime and limits. This gate depends on the hosting and CLI gates.

## Verification in progress

- Chromium passed eight checks on a candidate build. The four-profile cycle drained each confirmed write into its source brain, fenced stale HTTP and WebSocket requests, and left an unconfirmed draft in place. The CLI reached hosted two by alias while the companion was on hosted one, and the companion reopened with the same profiles and selection.
- The candidate selected both HTTPS origins on the existing shared VPS with their own credentials. The disposable brain carried an old-client note, issued key and browser session across a change of service owner and retained candidate writes through service-only rollback. The stopped backup and first healthy probe bounded the handoff window to 916 ms in this run. The original service, PID and route stayed in place, and the temporary resources were removed.
