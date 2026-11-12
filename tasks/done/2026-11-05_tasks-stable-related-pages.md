# Stable related pages

Completed 2026-11-05. Recommendations stay visible through edits and stale/failed refreshes; changed saved content can refresh after ten seconds, while unchanged notes refresh about once a minute. Local-brain verification preserved all 1,663 canonical notes and the root configuration.

Authorized 2026-11-05: implement the related-page feedback end to end and verify against the selected local brain. Canonical personal notes must stay unchanged during verification.

- [x] Retain recommendations across saved revisions and stale/failed refreshes; check serially every ten seconds, querying changed saved text and refreshing unchanged text about once a minute with brain/note/lifecycle fences.
- [x] Query bounded saved title/body and show the closest shared-ranked results without a graph score cutoff; preserve lexical fallback when embeddings are unavailable.
- [x] Verify regressions and the production shell, including local-brain discovery with unchanged Markdown.
- [x] Record results/limits, update docs/release notes/changelog, archive and commit scoped work.

## Evidence

Every saved content hash previously cleared the footer and reissued a search. Stale index packets then left it hidden. The graph display cutoff rejected otherwise ranked recommendations. The selected local brain currently reports lexical-only retrieval with embeddings disabled; no semantic model setup is authorized by this task.


## Implementation

- Footer identity follows the brain/credential generation and note ID, independently of each saved content hash. Stale, failed, local-only or malformed refreshes retain useful links. Navigation/session loss clears them; delayed results cannot cross scope. Equal results retain their anchor DOM.
- Ten-second local checks query changed saved text; unchanged text waits six checks (about a minute). Requests are serial, have a five-second deadline and pause in hidden tabs. No index mutation, model provisioning or per-save retrieval is added.
- Generated discovery uses up to 1,000 characters of plain saved title/body rather than treating Markdown punctuation as search operators. It takes five unique openable results from the shared ranked candidates, excluding the current note, without a graph-specific absolute score cutoff. Existing retrieval policy and lexical fallback remain authoritative. Explicit graph previews retain their literal-title query and conservative relevance gate.
- Updated the old HTTP PUT save smoke to exercise current live publication/deletion and the actual unfinished-title save/navigation barrier. Narrow navigation now restores a visible desktop Home action before clicking it.

## Verification

Tested source: base `a396f24a94201964c39251c38948030680af4935` plus this scoped increment. Final compiled related-pages SHA-256 `83648782891a66d82726cd26b3475a4e0b63d0c9cee5ac310d484fb2909862ab`; graph-topic-preview `bbe8ba893463ad5d4cc773b11eef378d39865be36a4aaff216c1d9283cc0d21d`.

- `npm run build`: passed. Final shared editor bundle 674,239 minified / 222,955 gzip bytes.
- Focused related-page, recent-write, graph-topic and architecture checks: **38 passed**. Includes paced/coalesced saved queries, score-independent rank ordering, Markdown query handling, stale/error retention, same-note races, brain/note/session fences, BFCache, hidden-tab pause and stable anchors.
- Final `node --test`: **1,923 tests; 1,921 passed, 2 skipped, 0 failed** (89.2 seconds), without concurrent rebuilds. Earlier full-suite results were not used as final-snapshot evidence because a build overlapped that run.
- Production `scripts/related-pages-smoke.mjs`: passed with real lexical retrieval, live edits/deletions, a timed ten-second saved-content refresh, stale-index anchor retention, valid/duplicate/weak/malformed-title response fixtures, delayed navigation, actual blocked-navigation recovery and read-only brain switching; 1280/390/320px in light/dark. Repeated with the already provisioned embeddinggemma model: **passed real semantic indexing and the vector search branch**, without semantic-failure/constraint fallback warnings in the initial query. Both roots are disposable fictional data.
- Selected local brain, candidate production shell, existing backend and temporary read-only profile: **passed** real discovery, five links, minute idle refresh, no mutation/index requests or browser errors, and exact preservation of **all 1,663 canonical notes plus root configuration**. Final strengthened local navigation run also passed the actual target URL and loaded-note assertion, with 458 / 1,261 / 1,245 ms searches (one initial no-result candidate included).
- Package-size validation passed: 1,446,067 archive bytes, 4,568,897 unpacked bytes, 3,054,911 runtime bytes, 646 files. Script syntax checks and `git diff --check` passed.
- Logs: `/tmp/jb-related-{build,focused,full-final,smoke,semantic,local-final,package}.log`; local-navigation verification uses `/tmp/jb-related-local-navigation.log`. Fixture screenshots: `/tmp/jb-feedback-related-qa/`. No private note titles/body, credentials or screenshots were copied into repository artifacts.

## Limits

The selected local brain remains lexical-only; real semantic execution was verified on disposable fixtures using an existing model. This is a bounded related-page presentation fix over the existing hybrid ranking, not a new semantic quality benchmark or ranking-policy change. Some private notes legitimately return no additional matches. No installed app/CLI replacement, release, push, personal-note edit or remote-memory write was performed.
