# Core retrieval-policy docs

## Responsibilities

- Normalize supported retrieval-depth values and expose deterministic depth-policy boosts.
- Classify canonical Markdown documents by frontmatter type or memory-directory bucket.
- Stay backend-agnostic so QMD-backed search and future retrieval adapters can apply the same policy.

## Non-responsibilities

- Do not call QMD, build indexes, read files, or execute search.
- Do not parse CLI arguments beyond validating the already-selected depth value.
- Do not depend on runtime, processing, server, or adapter modules.

## Dream preference

- `isDreamDocument` is the shared strict classifier: only parsed `frontmatter.dream === true`, in any directory. Quoted scalars and `[[dream]]` links do not qualify.
- `dreamBoostFor` targets a total depth preference of `0.55` in normal and `1.0` in shallow retrieval, subtracting the existing bucket boost before applying relevance. For a fully relevant page, the additional contributions are `0.45` / `0.2`; this is not another full page bonus.
- The adapter supplies relevance in `[0,1]`. Deep retrieval and explicit source/detail/date queries receive no dream boost. `isSourceFocusedQuery` conservatively recognizes source/raw/journal/session terms, exact quotes, Markdown paths, and explicit years; it is a heuristic, not intent understanding.
- Classification is neither a truth guarantee nor independent corroboration. Canonical metadata, including historical evidence dates, remains attached to results.
