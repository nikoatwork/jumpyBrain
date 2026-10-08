export function agentInstructions(): string {
  return [
    "# jumpyBrain memory hint for coding agents",
    "",
    "If jumpybrain is installed and the task may benefit from project memory, use visible recall before acting. Good triggers include architecture decisions, prior bugs, user/project preferences, handoffs, or continuing earlier work.",
    "",
    "- Prefer explicit, bounded recall; do not silently inject memory into prompts.",
    "- Remember writes memory; recall reads memory.",
    "- If this repo has memory/jumpybrain.json, run: jumpybrain run memory:recall --topic \"<current task/topic>\" --limit 5",
    "- For a specific question, run: jumpybrain run memory:recall --query \"<question>\" --limit 10 --json",
    "- Use --depth shallow|normal|deep to shape recall from compressed pages/decisions toward raw session evidence.",
    "- If recipes cannot discover the root, pass --root <memory-root> for local memory or --target-url <url> for hosted/shared memory.",
    "- Answer from sufficient snippets and cite their source lines. Preserve uncertainty, qualifications, and conflicts; do not infer a decision from a title/type.",
    "- If evidence is incomplete, narrow recall --query on the same target, then expand the relevant source and nearby reasoning only as needed. Local file tools can read cited ranges; whole-file reads are fine when broader context is necessary, not mandatory by type or heading.",
    "- For hosted expansion, use `jumpybrain show --target-url <url> --id <mem_id> --json` with JUMPYBRAIN_API_KEY, not server paths or direct HTTP. Use provenance.metadata.id from recall JSON, not the search/chunk id. show returns a whole document and has no range flags; if no document ID exists, narrow recall instead.",
    "- Written date is creation metadata; Evidence date is explicit frontmatter date, not an invented observation date or a date for every passage. Missing dates remain unknown; confidence metadata does not guarantee truth.",
    "- Use `jumpybrain show --root <memory-root> --id <mem_id>` then pipe exact revised Markdown to `jumpybrain update --root <memory-root> --id <mem_id> --if-match <contentHash>` for safe local document edits; use the same commands with `--target-url <url>` and JUMPYBRAIN_API_KEY for hosted/shared memory.",
    "- Use `jumpybrain process --root <memory-root> --mode ensure-ids --apply` to stamp missing document IDs before editing older memory files.",
    "- `remember` indexes after writing; run memory:index after manually editing Markdown memory files or after document updates when fresh recall/search is needed.",
    "- At session end, recall likely duplicates/conflicts, then pipe a strict wrapup with sections: ## Findings, ## Decisions, ## Conflicts / Corrections, ## Open Questions",
    "- Do not memorize secrets, credentials, tokens, raw chat noise, or vague status updates.",
  ].join("\n");
}
