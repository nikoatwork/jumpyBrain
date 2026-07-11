# App dream workflow

## Responsibilities

- Compose core dream policy with filesystem state and canonical Markdown reads to create, resume, hydrate, complete, abandon, and report dream batches.
- Parameterize local and remote target behavior, including support-state paths, target/root labels, and memory namespace metadata.
- Store dream state and batch metadata without full memory bodies; hydrate Markdown content only when returning a batch.
- Keep completion-only cursor advancement and one-open-batch semantics shared across local and remote workflows.

## Non-responsibilities

- Do not parse CLI flags, format command output, authenticate HTTP requests, choose HTTP status codes, or log requests.
- Do not import QMD internals, AI/model providers, prompt templates, or scheduler/background job code.
- Do not apply dreamed edits; callers must use explicit document update seams before completing a batch.
