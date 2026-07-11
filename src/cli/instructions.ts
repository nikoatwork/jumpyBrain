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
    "- Use `jumpybrain show --root <memory-root> --id <mem_id>` then pipe exact revised Markdown to `jumpybrain update --root <memory-root> --id <mem_id> --if-match <contentHash>` for safe local document edits; use the same commands with `--target-url <url>` and JUMPYBRAIN_API_KEY for hosted/shared memory.",
    "- Use `jumpybrain process --root <memory-root> --mode ensure-ids --apply` to stamp missing document IDs before editing older memory files.",
    "- `remember` indexes after writing; run memory:index after manually editing Markdown memory files or after document updates when fresh recall/search is needed.",
    "- At session end, recall likely duplicates/conflicts, then pipe a strict wrapup with sections: ## Findings, ## Decisions, ## Conflicts / Corrections, ## Open Questions",
    "- Do not memorize secrets, credentials, tokens, raw chat noise, or vague status updates.",
  ].join("\n");
}
