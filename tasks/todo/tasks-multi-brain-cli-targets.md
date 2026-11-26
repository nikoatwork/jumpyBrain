# Add named CLI brain targets

## Goal

Select a local folder or hosted origin per command using an optional alias. Existing flags and defaults retain their behavior. Verify with disposable local roots and loopback servers.

[Architecture and rollout overview](tasks-multi-brain.md).

## Tasks

- [ ] Reuse the CLI resolver and shared credential adapter. Define an explicit selector such as `--brain work` for a local folder or HTTPS origin. Validate duplicate names, conflicting selectors, unknown names, missing folders and missing credentials. Keep trusted project and install defaults for commands with no explicit selector.
- [ ] Bind a named remote target to its own credential and fail closed before transport if it is missing. Retain the documented legacy behavior for existing direct URL callers. Report the effective target and credential source without the secret. Keep headless setup independent of whether the Mac app is running.
- [ ] Exercise recall → expand and authorized writes through aliases on both transports. Cover mismatched keys, switching the Mac app during CLI use, old command syntax, and remote-only installs. Update CLI reference and agent instructions.

## Completion gate

The target-resolution, credential, help and read/write transport checks pass with the Mac app closed. Two remote credentials resolve independently. Missing credentials fail before the network, and existing direct commands continue to work. No VPS deployment is required for this gate.
