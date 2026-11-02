# Manage app brain connections and resolve CLI targets clearly

Priority: P1. Status: planned; command naming and shared profile behavior require a small design decision before implementation.

## Goal

Let an agent register/list an existing local brain for the Mac app without hand-editing application state or quitting it. Make the CLI's effective destination and its selection source explicit, with a consistent resolution contract.

## Evidence and coordination

- [Second-brain setup report, 2026-11-02](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=53419d9b-2c42-4686-b20d-d226e2f8dc8a) reports no supported CLI profile management and revision conflicts after external file edits while the app runs.
- [Review part 1](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=93c68f07-038e-4d2a-8247-f565481d0361) and [part 5](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=454167e2-14ab-4627-b257-9eb7d8b56448) propose named brains and report doctor ignoring a configured nondefault root. Their suggested precedence is a proposal, not the accepted contract.
- Coordinate target precedence/project trust with task 3 of [portable installation](tasks-portable-installation-project-integration.md); do not implement competing resolvers or a second credential registry. That list continues to own project discovery/trust.
- Existing glossary behavior: app connection switching does not retarget the CLI. Preserve that unless an explicit, documented design change is accepted. Naming a destination never grants remote/team write permission.

## Relevant files

- `src/cli/cli.docs.md`, `src/cli/targets.ts`, `src/cli/memory-target.ts`, `src/cli/doctor.ts`, `src/cli/companion.ts` — target and private companion seams.
- `integrations/macos-companion/connections.docs.md`, `integrations/macos-companion/connections.mjs` — validated revisioned store.
- `integrations/electron/electron.docs.md`, `integrations/macos-companion/gateway.docs.md`, `glossary.md` — lifecycle, switch barrier and connection meaning.

## Tasks

- [ ] 1.0 Specify the smallest supported contract.
  - [ ] 1.1 Choose one namespace for connection list/add/remove and explicit selection; distinguish app-active connection, CLI selection and configured default. Decide whether named CLI lookup is necessary for the first increment.
  - [ ] 1.2 Record precedence for explicit root/URL, any explicit name, environment/configuration, trusted project discovery, install manifest and personal fallback. Reject incompatible explicit selectors and malformed existing configuration; print the chosen source in doctor/status.
  - [ ] 1.3 Define running-app ownership and app-absent/platform behavior. Prefer a narrow authenticated companion operation using its single ConnectionStore, with revision checks; never silently overwrite connections.json or expose Keychain secrets.
- [ ] 2.0 Deliver agent-accessible local connection management.
  - [ ] 2.1 Reuse schema validation, canonical path/duplicate checks, atomic persistence and destination identities. Adding a connection must not initialize/index the brain or change its content implicitly.
  - [ ] 2.2 Route active-profile changes/removal through existing save/switch barriers. Handle concurrent changes with fresh state and explicit retry guidance, without losing saved profiles.
  - [ ] 2.3 If named remote targeting is included, retain per-origin write policy, credential boundaries and cross-brain fencing. Do not make GUI selection silently redirect agent writes.
- [ ] 3.0 Align root diagnostics and direct/recipe behavior.
  - [ ] 3.1 Reuse the agreed resolver for doctor/status and applicable memory commands. Keep server root selection and installation-only commands explicitly scoped.
  - [ ] 3.2 Explain missing configuration and the next action instead of reporting a nonexistent default root when a valid intended root is configured.
- [ ] 4.0 Verify and finalize.
  - [ ] 4.1 Test app running/closed, stale revisions, unsafe files, duplicate paths, root aliases, active removal, unsaved drafts and unavailable companions. Verify behavior without Electron for CLI-only installs.
  - [ ] 4.2 Test selector precedence, direct/recipe parity, read-only denial before secrets/input/transport and unchanged app-to-CLI selection isolation.
  - [ ] 4.3 Update configuration/install/CLI docs, glossary only for changed terms, and relevant release notes; record platform/build limits and archive/commit under [task completion](../../docs/task-workflow.md).
