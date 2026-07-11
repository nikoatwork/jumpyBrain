# Package info adapter docs

## Responsibilities

- Read host package metadata needed by CLI/runtime entrypoints, such as the installed package version.
- Keep package.json path probing isolated from core Markdown/setup modules.
- Return safe fallback metadata when package files are unavailable.

## Non-responsibilities

- Do not own memory-root schema semantics or persisted Markdown content.
- Do not parse CLI commands or implement server routes.
- Do not import app, core, or QMD adapter internals.
