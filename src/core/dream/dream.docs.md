# Core dream policy

## Responsibilities

- Own backend-agnostic dream policy: cursor construction/comparison, stable mtime-plus-path ordering, limit defaults/caps normalization, canonical relative-file validation, memory-type shaping, and bounded string-array/date helpers.
- Provide shared warnings/instructions that apply to local and remote dream batches without choosing a transport or storage backend.

## Non-responsibilities

- Do not read or write dream state, batch JSON, or Markdown file bodies.
- Do not import app workflows, CLI formatting, server protocol code, HTTP/logging/package adapters, QMD internals, or model/provider code.
