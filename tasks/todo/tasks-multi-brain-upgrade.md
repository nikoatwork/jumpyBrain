# Verify upgrades and mixed Mac app connections

## Goal

Verify the packaged upgrade and rollback paths plus the Mac app’s existing selection of two local and two hosted brains. Use the delivered hosted recipe and the named CLI selector.

[Architecture and rollout overview](tasks-multi-brain.md).

Depends on [hosted deployment](../done/2026-11-26_tasks-multi-brain-hosting.md) and [CLI targets](tasks-multi-brain-cli-targets.md).

## Tasks

- [ ] Test the supported update and rollback from a pre-feature release on a disposable managed local install and a remote-only install. Check exact Markdown bytes, defaults, saved credentials and app connection identity. Rehearse the optional hosted owner handoff with the same origin and root.
- [ ] In Chromium, switch the companion among two local folders and two hosted origins with an open edit. Check draft handling, stale requests and WebSockets, and verify the CLI target stays independent. Smoke the packaged Mac app for profile persistence and reopen after upgrade.
- [ ] Record the tested versions, supported upgrade order, expected downtime and untested limits. Publish the adoption and recovery steps in the owning docs. Review security-sensitive changes with the repository’s independent-review workflow before finalizing.

## Completion gate

Rehearse upgrade and rollback on disposable prior-version installs and an optional hosted owner handoff. Record the compatibility matrix, actual downtime and limits. This gate depends on the hosting and CLI gates.
