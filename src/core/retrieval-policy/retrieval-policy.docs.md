# Core retrieval-policy docs

## Responsibilities

- Normalize supported retrieval-depth values and expose deterministic depth-policy boosts.
- Classify canonical Markdown documents by frontmatter type or memory-directory bucket.
- Stay backend-agnostic so QMD-backed search and future retrieval adapters can apply the same policy.
- Own pure source-excerpt selection in `excerpts.ts`: supplied lines/window/query terms become bounded evidence and actual line citations, without I/O or backend knowledge.

## Non-responsibilities

- Do not call QMD, build indexes, read files, or execute search.
- Do not parse CLI arguments beyond validating the already-selected depth value.
- Do not depend on runtime, processing, server, or adapter modules.

## Evidence excerpts

Select a matching line within the supplied window, discounting repeated topic/title mentions relative to rarer requested detail. A heading at the first nonblank body line (ATX or setext, regardless of level) is the main title: exclude it and its setext underline from match candidates when another nonblank line exists in the window. Title-only windows/notes retain the fallback; do not search unrelated windows. The title can still appear as necessary ancestor context. Markdown link labels contribute to matching; original targets remain unchanged in the structured excerpt (CLI plain-display abbreviation is a separate concern). Normalize punctuation for matching only. This is excerpt selection, not a document relevance score or a generated claim.

Prefer the enclosing small heading section or a whole paragraph/list item/fenced block; retain nested list qualifications and bounded adjacent context. Heading names are never special-cased. Preserve ancestor scope when its contiguous span fits, otherwise explicitly label omitted ancestor context. Large units use a match-centered, explicitly partial excerpt. Returned ranges address the displayed canonical lines, not the whole retrieval window. Whitespace is compacted, so this is not a lossless Markdown rendering.

The initial per-passage bound is 1,000 characters, including omission markers. This is not a tokenizer contract or universally optimal size. Different sections can still contain relevant reasoning; absence of a partial marker never proves a complete answer. The adapter owns bounded source reads and backend-window fallback. Tests cover arbitrary headings, heading-free prose, long lines, nested lists, fences, scope, link identities, and malformed bracket input.

## Dream preference

- `isDreamDocument` is the shared strict classifier: only parsed `frontmatter.dream === true`, in any directory. Quoted scalars and `[[dream]]` links do not qualify.
- `dreamBoostFor` targets a total depth preference of `0.55` in normal and `1.0` in shallow retrieval, subtracting the existing bucket boost before applying relevance. For a fully relevant page, the additional contributions are `0.45` / `0.2`; this is not another full page bonus.
- The adapter supplies relevance in `[0,1]`. Deep retrieval and explicit source/detail/date queries receive no dream boost. `isSourceFocusedQuery` conservatively recognizes source/raw/journal/session terms, exact quotes, Markdown paths, and explicit years; it is a heuristic, not intent understanding.
- Classification is neither a truth guarantee nor independent corroboration. Canonical metadata, including historical evidence dates, remains attached to results.
