# LongMemEval-S retrieval targets

Purpose: keep a compact reference for what jumpyBrain/QMD is trying to approach with Markdown-first retrieval primitives.

## Benchmark framing

- LongMemEval-S has 500 questions over ~30-50 sessions / ~115k tokens per question.
- Retrieval-only scores are not end-to-end QA scores.
- Most public retrieval numbers use `recall_any@K`: any gold session appears in top K.
- Our `hit@K` is comparable to `recall_any@K`.
- Our `all_evidence@10` is stricter and more relevant for context loading across multiple sessions.

## Public reference points

| System / mode | Metric | Reported result | Notes |
| --- | ---: | ---: | --- |
| agentmemory BM25-only | R@5 | 86.2% | Local retrieval, no LLM |
| agentmemory BM25-only | R@10 | 94.6% | Keyword baseline with stemming/synonyms |
| agentmemory BM25+Vector | R@5 | 95.2% | Local MiniLM vectors + BM25 |
| agentmemory BM25+Vector | R@10 | 98.6% | Retrieval-only, no reader |
| MemPalace raw vector | R@5 | 96.6% | Zero API, raw/verbatim mode |
| MemPalace hybrid + Haiku rerank | R@5 | 100% | Uses cloud LLM reranking; not a local/no-LLM target |

Sources:

- https://github.com/rohitg00/agentmemory/blob/main/benchmark/LONGMEMEVAL.md
- https://www.mempalace.net/benchmarks
- https://xiaowu0162.github.io/long-mem-eval/
- https://arxiv.org/abs/2410.10813

## Per-type hybrid reference: agentmemory BM25+Vector

| Question type | R@5 | R@10 |
| --- | ---: | ---: |
| knowledge-update | 98.7% | 100.0% |
| multi-session | 97.7% | 100.0% |
| single-session-assistant | 96.4% | 98.2% |
| temporal-reasoning | 95.5% | 97.7% |
| single-session-user | 90.0% | 97.1% |
| single-session-preference | 83.3% | 96.7% |

## jumpyBrain target bands

| Target band | hit@5 | hit@10 | Meaning |
| --- | ---: | ---: | --- |
| BM25-class | >= 0.86 | >= 0.94 | Comparable to published BM25-only memory retrieval |
| Strong local | >= 0.90 | >= 0.95 | Good Markdown/QMD primitive baseline |
| Hybrid-class | >= 0.95 | >= 0.98 | Comparable to local BM25+vector systems |

## Extra target for agent context loading

Track `all_evidence@10` separately. Public `recall_any@K` can look excellent while still missing supporting sessions needed for multi-session reasoning, temporal updates, and useful context packets.

## Design lessons to test in jumpyBrain

- Markdown/verbatim source should remain canonical; indexes are derived.
- Round/turn-level retrieval generally beats whole-session retrieval.
- Derived keys / fact-expanded search text can raise recall.
- Temporal metadata and time-aware query expansion matter for temporal-reasoning questions.
- Ranking should favor provenance, session coverage, and diverse evidence, not only top snippet similarity.
