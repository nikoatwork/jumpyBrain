# Core writing policy docs

## Responsibilities

- `normalizeEvidenceDate` reuses canonical `metadataDate` for optional creation dates, preserving valid ISO strings/offsets and rejecting malformed/untyped inputs. It does not resolve temporal intervals. Body-only edits preserve an omitted evidence `date` just as they preserve `dream`; explicit metadata can replace either. Writing IDs/timestamps remain protected.

- Keep pure Markdown rendering, frontmatter metadata constants, `mem_<uuid>` document ID helpers/stamping, slug/path naming policy, protected document-update merge policy, and wrapup body validation reusable without backend dependencies.
- `bodyWithoutTitleHeading` is the single new-note title rule for local/remote notes, wrapups and new synthesis pages: no `# <title>` H1 is ever added. If the trimmed body opens with an ATX H1 whose text equals the title (exact-title normalization plus collapsed whitespace, optional closing `#`s), that line and the blank lines after it are dropped; the rest stays verbatim. A different H1, `##`, `#Title` without a space, setext heading or prose stays exactly as authored. `opensWithTitleHeading` exposes the same match. Creation-only; existing files are never rewritten. `renderMarkdownDocument` renders a blank body as frontmatter only.
- Preserve canonical memory type, confidence, review, protected identity/provenance fields, and required wrapup section policy for local and remote write workflows.
- Creation metadata accepts only boolean `dream` values. Document updates preserve an existing dream marker when omitted (including body-only updates); an explicit submitted value such as `dream: false` can reclassify it. The marker is not protected identity metadata or a write ACL. Full-document edits from `show` preserve other submitted metadata, and app-level hash preconditions remain required.

## Non-responsibilities

- Do not create files or choose host filesystem behavior.
- Do not orchestrate local/server/remote write workflows or idempotency.
- Do not import CLI, HTTP, logging, package metadata, retrieval, or QMD modules.
