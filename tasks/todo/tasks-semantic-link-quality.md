# Semantic connection quality before automatic linking

## Goal

Make inferred relationships useful on imported real-world notes before promoting them into authored Markdown links. Automatic canonical `[[title]]` insertion is not enabled.

## Evidence

The [completed local evaluation](../done/2026-11-07_tasks-semantic-auto-link-evaluation.md) found metadata-driven false positives even above 0.99 cosine. The graph's mutual-top-three cap bounds degree but does not establish a meaningful relationship. Imported Joplin footers and metadata must not dominate semantic similarity. Simply raising the cutoff is insufficient.

## Tasks

- [ ] Define a derived embedding-text representation that excludes recognized import metadata and boilerplate while preserving canonical Markdown and provenance.
- [ ] Retain regression cases with unrelated prose sharing long export footers, sparse task lists, complementary notes, and long mixed-topic documents.
- [ ] Re-evaluate semantic graph candidates on representative held-out content, recording false positives and useful connections lost by preprocessing; do not tune only on the exploratory review sample.
- [ ] Review the current 1,000-document comparison pool and coverage behavior separately from connection quality.
- [ ] Use the existing Related pages surface and inferred graph edges for automatic discovery. Decide a promotion interaction separately: a suggested relationship has no inherent inline anchor or authored citation direction.
- [ ] Before any canonical auto-linking implementation, specify unique target resolution, real source-span evidence, stale-edit protection, repeated-link suppression and undo; similarity alone is not an insertion rule.

## Scope

This is follow-up implementation work, not completed by the evaluation. Private corpus copies, texts, vectors and individual review labels remain outside the repository. No model setup, app installation, source-note edits or automatic backlinks were performed on the live brain.
