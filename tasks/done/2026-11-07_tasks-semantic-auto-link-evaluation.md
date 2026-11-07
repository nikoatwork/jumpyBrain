# Local semantic auto-link evaluation

## Outcome

Completed the requested read-only machine test using a private snapshot of the Mac app's selected local brain. Recommendation: automatic inferred discovery is appropriate; automatic canonical `[[title]]` insertion from raw similarity alone is not supported by this evidence. Follow-up quality work is tracked [here](../todo/tasks-semantic-link-quality.md).

## Verification and findings

- Source implementation: `2bfda5f`; live corpus 1,665 Markdown documents, about 4 MB, including 1,044 sessions. Live configuration remained lexical. All original content hashes were unchanged during the run.
- A separate copy was indexed with locally provisioned QMD 2.8.3 / EmbeddingGemma 300M Q8_0: 2,757 embedding chunks. No paid API, model download, live-note modification or app setting change.
- Full-corpus exploratory comparison: cosine >= 0.70 alone yielded 64,082 new unordered pairs after excluding existing resolved explicit connections. Mutual top-three agreement reduced this to 634 pairs touching 733 notes, at most three new neighbors each. Inserting both directions would add 1,268 references.
- The actual implemented graph retains its 1,000-document cap: it compared 1,000/1,665 and returned 372 inferred edges with partial coverage. The full-corpus counts above are an experimental extension, not the current endpoint's output.
- A reproducible review selected four hash-ordered pairs per score band plus extreme scores: 26 pairs, assessed by one assistant with scores visible. Labels: 16 useful, 7 weak, 3 uncertain. Unequal sampling and subjective review mean these are not population precision estimates.
- An unrelated imported-note pair scored 0.9952. Removing only the recognized terminal import footer reduced that same pair to 0.3772. The 51-document sample ablation changed 14 documents; unchanged documents reproduced their original scores exactly. High thresholds do not repair metadata-driven similarity.
- Broader content-only preprocessing reduced additional weak scores but also removed useful relationships at the same threshold. No preprocessing policy or new cutoff is validated for deployment by this experiment.
- Only 13 of the 1,268 possible link directions contained the target's literal title anywhere in the source body. This includes unsafe contexts and is only an upper bound on direct title anchors. Semantic similarity supplies neither an insertion span nor citation direction.

## Limits

One corpus, one embedding model, one reviewer, no user relevance labels, and no Mac UI insertion experiment. Private artifacts and corpus text remain local outside the repository. The experiment assessed candidate generation and insertion feasibility; it did not enable automatic editing or validate the feature for release. The earlier synthetic graph smoke remains valid functional evidence, but its relevance conclusions do not generalize to imported corpora.
