# Core writing policy docs

## Responsibilities

- Keep pure Markdown rendering, frontmatter metadata constants, `mem_<uuid>` document ID helpers/stamping, slug/path naming policy, protected document-update merge policy, and wrapup body validation reusable without backend dependencies.
- Preserve canonical memory type, confidence, review, protected identity/provenance fields, and required wrapup section policy for local and remote write workflows.

## Non-responsibilities

- Do not create files or choose host filesystem behavior.
- Do not orchestrate local/server/remote write workflows or idempotency.
- Do not import CLI, HTTP, logging, package metadata, retrieval, or QMD modules.
