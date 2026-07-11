# CLI module docs

## Responsibilities

- Keep `src/cli.ts` as the executable shim; command dispatch lives in `src/cli/commands.ts` and `run` recipes live in `src/cli/recipes.ts`.
- Parse command-line arguments and stdin, select local or remote targets, and preserve stable user-facing command names, flags, JSON modes, and text output.
- Own the target-aware `dream` CLI workflow for local `--root` and remote `--target-url`: request/status/complete/abandon batches, apply manifests, write full context with `--out`, print local-agent instructions, and keep memory contents out of default compact stdout.
- Delegate local work through `src/cli/local-transport.ts` to the runtime/app seam.
- Delegate remote work through the HTTP client adapter while keeping API keys and URLs at the CLI boundary.
- Own target selection: `--root` selects local memory, `--target-url`/`--remote-url` selects the single remote V1 namespace, and remote API keys come only from `JUMPYBRAIN_API_KEY` in the CLI environment rather than adapters or local config.
- Own strict device-local per-origin read-only policy in `remote-access-policy.ts`: normalize HTTP(S) origins, classify direct/recipe operations through an explicit read allowlist, fail closed on invalid existing config, and reject protected mutations during dispatch before API-key, stdin/file, preflight, idempotency, or transport work.
- Keep usage text, doctor reporting, and serve bootstrap behavior in dedicated CLI submodules.
- Route top-level memory commands and `run memory:*` recipes through shared handlers; do not duplicate behavior.

## Non-responsibilities

- Do not import QMD adapter internals or manage QMD cache/config paths directly.
- Do not implement server HTTP routes or server-local memory orchestration.
- Do not introduce named target registries or committed secrets without a dedicated target-config task.
- Do not treat the local read-only policy as server authorization or import it from core, app, runtime, HTTP adapter, or server modules.
- Do not change public CLI behavior during internal refactors unless a task explicitly calls for it.
- Do not run AI/model providers or perform hidden prompt injection for dreaming; local agents decide and apply edits explicitly.
- Do not put command implementation back into `src/cli.ts`; keep the binary path stable while routing through CLI submodules.
