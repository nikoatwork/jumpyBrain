# CLI module docs

## Responsibilities

- Keep `src/cli.ts` as the executable shim; command dispatch lives in `src/cli/commands.ts` and `run` recipes live in `src/cli/recipes.ts`.
- Parse command-line arguments and stdin, select local or remote targets, and preserve stable user-facing command names, flags, JSON modes, and text output.
- Own target-aware stateless `dream` windows for local `--root` and remote `--target-url`: validate `--from`, `--days`, `--date-basis`, offsets/budgets, write private full-context packets with `--out`, and keep bodies out of compact stdout. Legacy lifecycle/apply flags fail with deprecation guidance before credentials/files; legacy runtime/HTTP batch APIs remain available. Plain dream is a read-only operation even on protected targets; old mutation flags stay blocked by access policy.
- `remember --type page --dream` creates a dream-marked page using body-only stdin, through the existing local/remote write seams. Existing `show`/hash-checked `update` and explicit `index` maintain it. Source preservation is agent-skill guidance, not a new write restriction.
- Own `migrate logseq` in `migrate.ts`: strict source/root and boolean flags, body-free human summaries or the unchanged app JSON result, safely quoted apply/index hints, and explicit separate indexing. Dispatch this local-only command before remote policy/credentials; reject either remote target flag even when malformed or combined with local flags.
- Keep migration argument strictness scoped in `args.ts` so legacy commands retain their existing parsing behavior.
- Delegate local work through `src/cli/local-transport.ts` to the runtime/app seam.
- Delegate remote work through the HTTP client adapter while keeping API keys and URLs at the CLI boundary.
- Own target selection: `--root` selects local memory, `--target-url`/`--remote-url` selects the single remote V1 namespace, and remote API keys come only from `JUMPYBRAIN_API_KEY` in the CLI environment rather than adapters or local config.
- Own strict device-local per-origin read-only policy in `remote-access-policy.ts`: normalize HTTP(S) origins within the CLI source boundary, classify direct/recipe operations through an explicit read allowlist, fail closed on invalid existing config, and reject protected mutations during dispatch before API-key, stdin/file, preflight, idempotency, or transport work. Keep the standalone installer origin helper behaviorally aligned through parity tests rather than importing repository scripts from `src/`.
- Keep usage text, doctor reporting, and serve bootstrap behavior in dedicated CLI submodules.
- `update.ts` detects the current managed installation (including custom roots) and delegates application updates and read-only previews to the installer. Installer scripts own optional macOS companion detection, quit-before-update checks, and locked paired native/runtime replacement; none of this belongs in memory/core/server semantics.
- Route top-level memory commands and `run memory:*` recipes through shared handlers; do not duplicate behavior.

## Non-responsibilities

- Do not import QMD adapter internals or manage QMD cache/config paths directly.
- Do not implement server HTTP routes or server-local memory orchestration.
- Do not introduce named target registries or committed secrets without a dedicated target-config task.
- Do not treat the local read-only policy as server authorization or import it from core, app, runtime, HTTP adapter, or server modules.
- Do not change public CLI behavior during internal refactors unless a task explicitly calls for it.
- Do not run AI/model providers or perform hidden prompt injection for dreaming; local agents decide and apply edits explicitly.
- Do not put command implementation back into `src/cli.ts`; keep the binary path stable while routing through CLI submodules.
