# App processing module docs

## Responsibilities

- Compose canonical Markdown reads, memory-root compatibility checks, QMD-assisted source expansion, and pure Markdown rendering for processing use cases.
- Own deterministic local processing modes such as lint reports, topical page synthesis, and explicit maintenance stamping of missing document IDs; keep extracted modes such as `ensure-ids.ts` small.
- Topical page synthesis is responsible for preserving an existing page `id` frontmatter value or stamping a new shared `mem_<uuid>` ID for newly created pages.
- ID-stamping maintenance scans only canonical memory buckets (`notes`, `findings`, `decisions`, `preferences`, `sessions`, `pages`) and delegates pure Markdown stamping to core writing policy.
- Provide the app seam that runtime and server-memory workflows call for processing operations.

## Non-responsibilities

- Do not parse CLI flags, format CLI output, or implement HTTP route behavior.
- Do not treat support reports under `.jumpybrain/` as canonical memory.
- Do not add model-dependent or paid-service behavior to normal processing tests.
