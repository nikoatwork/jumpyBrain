# Smart search setting in the Mac app

Priority: proposed. Status: planned 2026-11-25, nothing started. Deferred from [install profiles](../done/2026-11-25_tasks-install-profiles.md) task 2.3.

## Goal

Settings in the Mac app gets a row "Smart search: off/on". It uses the same outcome-first explanation as `jumpybrain smart-search` (334 MB download once, runs only on this computer, no notes sent) and shows a progress state while the model downloads and the brain is indexed.

## Today

- The CLI has `smart-search status|on|off [--remove-model]` ([cli-commands](../../docs/cli-commands.md#smart-search)). The model download reports progress through `provisionLocalModel({ onProgress })` in `src/adapters/qmd/model-setup.ts`.
- The Settings window (`src/adapters/http-server/browser-settings.ts`, sections in `companion-browser.ts`) can host a new section or row.
- Missing pieces: a gateway control route in `integrations/macos-companion/gateway.mjs` that provisions the model for the active local brain. The policy-carrying index must run through the backend host, because index policy flags are server-local and not part of the HTTP protocol. The UI also needs a progress channel and a hidden or disabled state for remote connections.

## Tasks

- [ ] 1.0 Gateway route: status, on (with consent), off (with optional model removal), progress polling; local brains only.
- [ ] 2.0 Settings row with the explanation, the consent step and the progress state.
- [ ] 3.0 Tests: gateway unit test plus one native smoke per the [desktop docs](../../integrations/electron/electron.docs.md).
