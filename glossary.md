# Glossary

## Dream page

A topical synthesis marked with the YAML boolean `dream: true`, normally under `pages/`. It connects and condenses source evidence, can evolve across dreaming runs, and receives a relevance-aware preference in normal/shallow retrieval. The marker is neither a truth guarantee nor a write permission; `[[dream]]` alone does not classify a document.

## Recall passage

A bounded source excerpt with its own file/line provenance, not a generated or independently verified claim. Normal/shallow recall groups passages by canonical file before applying the result limit; deep/source-focused recall retains chunk-level limits. A file-level hit currently contains at most two passages and may report omitted candidate passages.

## Dream window

A stateless, bounded context request over inclusive UTC calendar dates. `--from` selects the newest day and `--days` counts backward: `--from t-1d --days 3` covers T-1 through T-3. Overlap and revisits are intentional; retrieval records no dreamed/completed status. Evidence dates and filesystem modification dates are separate selection modes.
