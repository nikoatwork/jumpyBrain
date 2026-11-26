# Verify upgrades and mixed Mac app connections

## Goal

Verify the packaged upgrade and rollback paths plus the Mac app’s existing selection of two local and two hosted brains. Use the delivered hosted recipe and the named CLI selector.

[Architecture and rollout overview](2026-11-26_tasks-multi-brain.md).

Depends on [hosted deployment](2026-11-26_tasks-multi-brain-hosting.md) and [CLI targets](2026-11-26_tasks-multi-brain-cli-targets.md).

## Tasks

- [x] Test the supported update and rollback from a pre-feature release on a disposable managed local install and a remote-only install. Check exact Markdown bytes, defaults, saved credentials and app connection identity. Rehearse the optional hosted owner handoff with the same origin and root.
- [x] In Chromium, switch the companion among two local folders and two hosted origins with an open edit. Check draft handling, stale requests and WebSockets, and verify the CLI target stays independent. Smoke the packaged Mac app for profile persistence and reopen after upgrade.
- [x] Record the tested versions, supported upgrade order, expected downtime and untested limits. Publish the adoption and recovery steps in the owning docs. Review security-sensitive changes with the repository’s independent-review workflow before finalizing.

## Completion gate

Rehearse upgrade and rollback on disposable prior-version installs and an optional hosted owner handoff. Record the compatibility matrix, actual downtime and limits. This gate depends on the hosting and CLI gates.

## Outcome and proof

Verified the feedback use case using two isolated HTTPS origins behind the same Traefik proxy on the shared VPS. One CLI chose both origins by name. Each origin rejected the other key. A named write, index, recall, hash-checked expand, and WebSocket open succeeded on the disposable brain. The original did not contain the test note.

| Gate | Result |
| --- | --- |
| VPS hosted handoff and rollback | Stopped the disposable v0.3.29 owner, verified its backup, and started the candidate on the same root and origin. The last rehearsal took 1,048 ms through first healthy probe. Canonical bytes, an issued key, browser session, and brain identity survived. The released CLI expanded a candidate write. Service-only rollback kept the write. Cleanup removed the temporary route, certificate, firewall rule, listener, service and data. Original PID, proxy configuration and HTTPS health stayed stable. |
| Managed remote-only install | Released v0.3.29 → candidate build `4c6c9c247ee8106b` → released v0.3.29, with no local brain. Both direct destinations retained access and recall → expand. Named reads and the per-origin write restriction passed on the candidate. The saved-key file and policy were preserved. Whole rehearsal took 44 s. |
| Managed local CLI and packaged Mac app | Released v0.3.29 (build `4e605874a79023f0`) → candidate commit `a14d5dc7` (build `4c6c9c247ee8106b`) → released v0.3.29 on macOS 15.7.7 arm64. All four profile IDs, keys, local Markdown bytes and CLI defaults survived. The candidate reopened with the alternate local profile selected. After rollback the packaged app reopened again and both hosted keys still worked. The alias file survived downgrade and old CLI flags continued to work. The three installer runs took about 55 s, 35 s and 25 s. |
| Mixed connection switching | Chromium completed all eight checks with two local folders and two loopback hosted servers. Confirmed drafts stayed in their original brains, stale HTTP and WebSocket requests were fenced, and an unconfirmed draft blocked switching and stayed in the editor. While the companion selected hosted one, the CLI used the named target for hosted two. |

Reproduce with the [Chromium smoke](../../scripts/multi-brain-companion-smoke.mjs) using `npx --package=playwright node scripts/multi-brain-companion-smoke.mjs`. Run the [managed rehearsal](../../scripts/multi-brain-managed-upgrade-smoke.mjs) with `--candidate a14d5dc7 --only remote` or `--candidate a14d5dc7 --only local --with-app`. Baseline release asset SHA-256 was `1a2a113c176d41910b93e2074363375619c210903961f087d6cbf17eff9847e7`. [Adoption and rollback guide](../../docs/install.md#adopt-named-brains-after-updating)

The packaged test used managed source replacement and released-package reinstall on disposable installs. It drained local owners between the two builds that report the same version. A fixture-only Node launcher isolated the packaged gateway and a macOS sandbox denied it access to real app settings. An early run before that isolation added four temporary entries to the real key file. They were removed and original entries were preserved byte for byte. The final rehearsals verified the monitored real-home files were unchanged and left no fixture processes or work directories. The hosted rehearsal used a temporarily trusted certificate. Coolify remains a documented deployment path.
