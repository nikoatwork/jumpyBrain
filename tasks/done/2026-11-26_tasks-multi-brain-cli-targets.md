# Add named CLI brain targets

## Goal

Select a local folder or hosted origin per command using an optional alias. Existing flags and defaults retain their behavior. Verify with disposable local roots and loopback servers.

[Architecture and rollout overview](2026-11-26_tasks-multi-brain.md).

## Tasks

- [x] Reuse the CLI resolver and shared credential adapter. Define an explicit selector such as `--brain work` for a local folder or HTTPS origin. Validate duplicate names, conflicting selectors, unknown names, missing folders and missing credentials. Keep trusted project and install defaults for commands with no explicit selector.
- [x] Bind a named remote target to its own credential and fail closed before transport if it is missing. Retain the documented legacy behavior for existing direct URL callers. Report the effective target and credential source without the secret. Keep headless setup independent of whether the Mac app is running.
- [x] Exercise recall → expand and authorized writes through aliases on both transports. Cover mismatched keys, switching the Mac app during CLI use, old command syntax, and remote-only installs. Update CLI reference and agent instructions.

## Completion gate

The target-resolution, credential, help and read/write transport checks pass with the Mac app closed. Two remote credentials resolve independently. Missing credentials fail before the network, and existing direct commands continue to work. No VPS deployment is required for this gate.

## Outcome and proof

- Added `jumpybrain brains list|add|key|remove` and per-command `--brain <name>` for local folders and HTTPS origins. Names are stored in an optional CLI-only file. The device policy still applies to the actual origin, and old selectors and defaults work independently of the alias file. [CLI usage](../../docs/cli-commands.md#named-brains)
- Hosted names use destination-bound credentials. Missing and mismatched credentials stop before transport. The migration preview keeps the named selector when suggesting an apply command. Rotation or removal preserves exact-URL key references created by earlier Mac builds. [Credential contract](../../src/adapters/credentials/credentials.docs.md)
- Proof. The 141-test targeted pass covered default resolution, help, roles, writes, collaboration and Mac gateway compatibility. The final build and 29 focused regressions passed, including simultaneous CLI and app key saves, exact legacy key references, named migration previews, recall → expand and writes. The installer suites then passed 40/40 with sequential execution after concurrent fixture runs had intermittent backend readiness failures.
- Proof. Chromium switched among four disposable profiles while the CLI continued reading a different hosted brain by name. On the shared VPS a candidate CLI selected two HTTPS origins with distinct keys while a global fallback was set. Candidate write, recall, expand and live open worked on the disposable brain. The original brain could not read the fixture note.
- Package proof. Tightened the deployment guides and CLI help to fit the existing limits. The final pack manifest measured 3,326,197 B compressed, 9,251,166 B unpacked and 7,544,792 B in the runtime, with 797 files. No budget changes or runtime dependencies.
- Older app and CLI builds lack the shared credential-file lock. Upgrade together before expecting cross-process serialization among all writers.
