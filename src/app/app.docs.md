# App module docs

## Responsibilities

- Compose core domain policy with host filesystem/runtime seams into user-facing use cases.
- Own local and server-side memory workflows that are not pure domain rules, including writing canonical Markdown files, local index/search orchestration, deterministic processing, shared local/remote dream state workflows, and server-memory state/idempotency use cases.
- Provide stable seams for runtime, CLI transports, server boundaries, and protocol adapters to call without reaching into lower-level policy modules.

## Non-responsibilities

- Do not parse CLI flags or format command output.
- Do not implement HTTP request routing, authentication, or HTTP status-code selection.
- Do not contain QMD adapter internals; app local-memory and processing modules may call the QMD adapter barrel as a replaceable backend seam.
