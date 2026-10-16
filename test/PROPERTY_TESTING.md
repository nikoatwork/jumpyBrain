# Property testing in jumpyBrain

Property tests run in the normal `npm test` path through Node's built-in test runner. They are for small, pure architecture-edge contracts where generated cases cover more useful edge space than hand-written examples.

Rules:

- Use `test/property-helpers.js` for deterministic `fast-check` settings.
- Keep `numRuns` modest; normal validation should stay fast.
- Use a fixed seed. Do not add nondeterministic CI fuzzing to `npm test`.
- Test pure or mostly-pure helpers only: Markdown/frontmatter contracts, slug/path normalization, CLI target selection, retrieval-depth policy, pure QMD path helpers, and package manifest validation.
- Do not spawn `qmd`, call hosted services, depend on paid model calls, or exercise the full indexing pipeline from property tests.
- When a generated failure appears, first decide whether it exposes a real bug or a deliberately narrow contract. Document intentional limitations in the task list before changing production code.
- Avoid making internals public API solely for property tests. Prefer direct test imports or an explicitly named test-only seam.
