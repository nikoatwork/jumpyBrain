# Strong semantic graph connections

## Goal

Show explicit Markdown links together with strong inferred relationships, so notes without authored links can participate in the graph. Markdown stays unchanged and canonical.

## Decisions

- Reuse published local embeddings; graph reads never download models, run inference, or repair an index.
- Require high cosine similarity and mutual top-three neighbors. Distinguish inferred edges visually and in the API; retain explicit edges when both exist.
- Keep work bounded and report partial/unavailable coverage. Discard semantic results when canonical sources or the published generation change.
- Human discovery is separate from the completed agent grep/BM25 pilot; that pilot did not establish semantic search has no value.

## Tasks

- [x] Implement bounded read-only vector reuse and conservative connection policy.
- [x] Integrate graph assembly, protocol filtering, and distinct rendering.
- [x] Verify policy/lifecycle, real provisioned embeddings, and Chromium graph behavior.
- [x] Update owning docs/release notes, archive and commit scoped work.

## Verification

Tested the implementation built on `7b0b757`; subsequent changes were documentation and additional smoke assertions, not runtime source.

- `npm run build` passed (TypeScript and browser bundles).
- `node --test test/semantic-graph.test.js test/graph.test.js test/graph-presentation.test.js test/graph-topic-preview.test.js test/architecture-boundaries.test.js` passed: 80/80.
- `scripts/semantic-graph-smoke.mjs` passed through Playwright with provisioned absolute QMD and GGUF environment paths. Real QMD 2.8.3 / EmbeddingGemma 300M Q8_0 produced the expected unlinked strategy pair (cosine 0.7815); unrelated notes stayed unconnected. Verified immutable database/canonical bytes, focus and ranked-seed expansion, explicit edge precedence and edge budget, authenticated remote semantic filtering, busy/corrupt fallback, abort, edit/rename/delete invalidation, lexical fallback, desktop/narrow SVG styling and keyboard navigation, and dense canvas dash handling.
- `scripts/semantic-index-smoke.mjs` passed using the same provisioned engine/model; network/model downloads blocked by its guard. Existing lifecycle/local-server-HTTP parity passed. Optional SIGKILL mode was not requested.
- `git diff --check` passed. Architecture guard passed with the new core policy and adapter worker.

## Outcome and limits

The graph automatically adds strong inferred connections when an existing semantic index is ready. Explicit links remain solid and take precedence; inferred links are dashed, undirected and limited to three per note. Markdown is unchanged. No models are provisioned or run by graph reads.

The initial 0.80 cosine cutoff missed the paraphrase fixture (about 0.75 with exploratory random IDs); it was revised to 0.70 plus mutual top-three agreement. The retained fixture uses fixed IDs for repeatability. This is fixture-based policy tuning, not held-out quality validation or evidence that 0.70 works across arbitrary custom models. Mixed-topic documents may lose narrow connections when chunks are averaged.

Comparison is bounded to 1,000 documents, 8,192 chunks total, 64 chunks per document, 4,096 dimensions and a ten-second semantic deadline. Focus/seeds receive priority before stable paths. Coverage and degradation are reported; large-corpus completeness and production-scale latency are unproven. Checks detect source/generation changes but do not supply a cross-filesystem snapshot. No private user corpus, install, release or push was performed.
