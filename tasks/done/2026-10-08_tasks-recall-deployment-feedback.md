# Recall deployment feedback: title fallback and compact links

## Result

Completed the user's two observations after deploying the recall-defaults change. No new flags, ranking boosts, or memory schema changes.

## Tasks

- [x] Make the leading body heading (ATX/setext at any level) a fallback rather than the selected match when other nonblank lines exist inside the retrieved window. Preserve title-only notes/windows and governing ancestor context.
- [x] Abbreviate long (>80-character) simple inline-link destinations and bare HTTP(S) URLs in plain output, including secondary passages. Keep recognizable ends, labels, and a stable eight-hex identity hint to distinguish same-basename destinations.
- [x] Preserve exact JSON excerpts, canonical Markdown, source citations, short links, and backtick code. Print one explicit warning that abbreviated addresses require JSON/source expansion before use.
- [x] Update owning and user-facing docs; add regressions for ATX/setext titles, fallback/window boundaries, links, identical URL ends, code, additional passages, and nonmutation.
- [x] Run `npm test`: **595/595 passed** (including build). `git diff --check` passed.

## Decisions / Limits

- This supersedes the earlier decision to avoid all link abbreviation: deployed feedback requests a compact plain display. Full destinations remain in structured evidence; no URL identity information is removed from storage or JSON.
- Abbreviations are visibly non-navigable display hints, not rewritten canonical links or safe executable addresses. The short hash is an identity hint, not a cryptographic uniqueness guarantee.
- Core excerpt selection and ranking still operate on original text. This reduces display clutter; it does not reclaim URL characters from the structural extraction budget.
- Heading exclusion stays within the supplied window, not a new document-wide query. A retained heading may still appear as context around a selected body statement.
- No new token-savings claim or live-agent behavior measurement.
