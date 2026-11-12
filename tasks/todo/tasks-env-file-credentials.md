# Remote access keys in a shared .env file

## Goal

Saved remote-connection access keys must survive app updates. Owner decision (2026-11-12): **replace macOS Keychain with a plaintext `.env` file for everyone**, shared by the Mac app and the CLI, so agents and the app use the same keys. Report: [November 11 feedback](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=40a4d331-9fb9-4855-9027-b3b88776b351) ([index](../feedback.md)).

## Evidence and boundaries

- Current cause (hypothesis, no longer needs proof): the Keychain item's legacy ACL is tied to the previous build's signature, and `Companion.swift` disables prompts, so updated builds get `credential_unavailable`.
- Seam: the gateway reads keys only through the `credentials` adapter `{get, set, delete}` (`integrations/macos-companion/gateway.mjs`, `nativeCredentials` → Swift bridge, wired at startup). Profiles reference keys by `credentialRef` (`connections.mjs`).
- Shared file: one owner-only (`0600`, parent `0700`) `.env`, proposed `~/.config/jumpybrain/.env` (honour `XDG_CONFIG_HOME`). Per-profile entries keyed by `credentialRef`; the CLI keeps `JUMPYBRAIN_API_KEY` from the process environment as highest precedence.
- Keep: keys never in logs, diagnostics, URLs, renderer/DOM, profile JSON or Git; atomic writes; refuse a group/world-readable file with a clear message rather than silently using it.
- Product docs change: drop the "Keychain / never plaintext" promise in FAQ/install/gateway docs and state the new storage plainly.
- Migration: existing Keychain items are what fail to read, so ask once to re-enter the key; no automatic Keychain read at startup.
- Scope: adapter, CLI read path, Settings copy, docs, tests, archive, local commit. No release or push.

## Tasks

- [ ] 1.0 Design.
  - [ ] 1.1 Read gateway/connections/CLI-targets docs and the diagnostics attachment; list every Keychain mention in code, UI copy and docs.
  - [ ] 1.2 Fix the file format, path resolution, precedence (env var > file) and how a CLI target picks a profile key.
- [ ] 2.0 Implement.
  - [ ] 2.1 `envFileCredentials` adapter (get/set/delete, atomic 0600 writes, permission check) replacing `nativeCredentials` for keys.
  - [ ] 2.2 Remove the Swift Keychain path; keep the native bridge for anything else it serves.
  - [ ] 2.3 CLI reads the shared file for remote targets.
  - [ ] 2.4 Settings/status copy: "Keychain unavailable" → missing/unreadable key file wording; re-entry prompt for migrated users.
- [ ] 3.0 Verify: adapter unit tests (permissions, atomicity, no key leakage), CLI target tests, real-gateway Chromium save/read/restart, key survives a re-signed app build.
- [ ] 4.0 Docs, feedback outcome, release note, changelog, archive, commit.
