# Natural questions and cited ranges — pre-output diagnostic contract

Retain all 240 pages / 152 seen tasks. Add same-author fictional diagnostic cases before inspecting their retrieval output. This is a single-agent mechanism investigation, not independent confirmation or an adoption trial. Production stays unchanged regardless of aggregate gains.

## Fixed policies

- `baseline`: unchanged current production, first three distinct available handles, line-one reads.
- `natural-question`: evaluation-only classifier amendment for questions starting with an interrogative/auxiliary and ending with a question mark. Lowercase `not/no/without/except/exclude/excluding` count as question content rather than query operators. Alphabetic single-hyphen words become space-separated only for lexical variants and the constraint probe. Preserve the original query for ranking, recall/provenance and requests. Retain all existing constraint checks for quotes, uppercase Boolean operators, leading exclusions, filters, paths, punctuation identifiers, camelCase and mixed alphanumeric identifiers. No semantic mode. This is a deliberately narrow hypothesis; it does not infer the intended meaning of every natural-language exclusion.
- `read-cited`: unchanged retrieval and first-three distinct source selection. Start each hash-guarded read eight lines before that source's first returned citation (minimum line one), with no explicit end line and the same 8,192-byte cap. The runtime's whole-line truncation and continuation marker remain visible. Do not spend extra reads on continuations or change which sources are selected. Test whether a bounded lead-in recovers surrounding qualifications; upstream or distant context can be lost.
- `natural-question-read-cited`: predeclared combination. Separate arms determine attribution.

No policy uses gold, hidden source bodies, rich search or query IDs. No arm/policy/fixture/threshold tuning after outputs. No automatic product reads or new product options.

## Measurement and decision

Freeze full eval inputs, deterministic fixture generator, source/compiled runtime, pinned QMD 2.8.3 and tokenizer. Lexical only, offline guard, no downloads/native builds. Two clean baseline passes and one per arm on identical corpus/runtime. Five compact results, 8,192 bytes per response, at most three reads and 32,768 response bytes overall. Count all request/response/error tokens. Verify every returned range/hash against canonical source bytes. Review every gained/lost required unit and explicit-syntax cases. Record initial/final completeness, individual unit losses, empty packets, protected regressions and corpus-growth drift separately. Compare only matched inputs/runtime; no comparison with older scores as a gain claim.

Diagnostic advancement needs at least two newly authored incomplete-to-complete cases, zero complete-task or individual-unit losses, zero changed retrieval packets on the newly authored explicit-syntax controls, zero provenance/budget failures and <=5% token growth. This is a screen for another experiment, not adoption. Same-author evidence, mechanical source-specific clauses and source-shaped long documents cannot establish generalization or actual answer quality. Overlapping runs provide no performance acceptance evidence. Independent confirmation, genuinely diverse long files/workspaces, semantic retrieval, agent answers, human search and Linux/VPS remain open.

Archive failed attempts and raw packets outside the repository, excluding private content and derived memory roots. Commit a compact report/freeze map and completed task. No production edit, installation, version bump, push or release.
