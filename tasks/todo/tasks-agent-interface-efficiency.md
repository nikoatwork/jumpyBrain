# Reduce agent setup overhead and improve maintenance previews

Priority: P1 for guidance and read-only lint; P2 for output/feedback contract changes. Status: planned; compatibility decisions precede format changes.

## Goal

Make the common recall/write workflow economical to learn while keeping provenance, authorization and bounded reads correct. Let agents inspect maintenance findings without first authorizing mutation.

## Evidence and boundaries

- [Agent review part 4, 2026-11-02](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=e08f741d-3203-468b-8ea2-ab760fe362ba) reports long overlapping skill/instruction text, multiple result shapes, unknown actor defaults, feedback chunking and no read-only lint preview.
- Its proposed single JSON shape, automatic actor inference, larger feedback envelope and replacement of built-in recipes are options to evaluate, not approved breaking changes. Help organization is owned by [CLI help](../done/2026-11-02_tasks-cli-help-and-validation.md), and root parity by [brain targeting](../done/2026-11-02_tasks-brain-connections-and-targeting.md).
- Preserve evidence versus writing dates, same-target ID/hash checks, continuation/partial reporting, saved-versus-indexed outcomes and explicit global/team/remote write authorization. TTY state alone does not establish authorship.

## Relevant files

- `src/cli/cli.docs.md`, `src/cli/instructions.ts`, `skills/jumpybrain-memory/SKILL.md`, `skills/how-to-dream/SKILL.md` — distributed guidance.
- `src/cli/bounded-reads.ts`, `src/cli/formatting.ts`, `src/cli/recipes.ts` — existing output/recipe contracts.
- `src/app/processing/processing.docs.md`, `src/app/processing/lint.ts`, `src/cli/feedback.ts`, `src/adapters/feedback/feedback.docs.md` — maintenance and explicit support reporting.
- `src/adapters/client-identity/client-identity.docs.md` — existing explicit client/owner identity.

## Tasks

- [ ] 1.0 Measure and reduce initial guidance cost.
  - [ ] 1.1 Freeze installed/generated instruction variants and a few realistic recall/expand/write/dream journeys; measure actual token counts with a pinned tokenizer, including follow-up guidance reads.
  - [ ] 1.2 Design a short common workflow with discoverable topic-specific guidance. Keep critical safety/identity/date rules at the operation where they matter; avoid hiding prerequisites the agent must know before a write.
  - [ ] 1.3 Verify generated and installed guidance agree, including CLI-only and remote paths. Coordinate managed refresh with [runtime hygiene](tasks-desktop-runtime-hygiene.md).
- [ ] 2.0 Evaluate output and identity simplification without breaking consumers.
  - [ ] 2.1 Inventory text/rich/compact consumers and measure their full interaction cost on matched evidence. Prefer shared internal rendering or an additive versioned interface before proposing removal of existing shapes/recipes.
  - [ ] 2.2 Reuse explicitly configured host/client identity where available; preserve unknown attribution when evidence is absent. Document actor declaration separately from authenticated access and prevent a default from claiming human authorship.
  - [ ] 2.3 Record adopt/defer decisions and migration costs for any new budget alias, output schema or recipe deprecation. Existing IDs/hashes and valid scripts must remain usable through a documented transition.
- [ ] 3.0 Add a true read-only lint preview.
  - [ ] 3.1 Separate computing bounded lint findings from persisting reports/ID repairs. Define preview output with scope, omissions and proposed actions; keep explicit apply for derived-report writes and canonical changes.
  - [ ] 3.2 Ensure preview does not start a repairing index, alter counters, create reports, stamp IDs or mutate Markdown; document local/remote availability without adding an unnecessary hosted mutation trigger.
- [ ] 4.0 Evaluate support-report ergonomics.
  - [ ] 4.1 Define the smallest useful category/follow-up or multi-part reporting extension, including maximum serialized size, redaction, explicit consent and compatibility with relay/UI limits. Decide whether the current cap should change using actual report needs.
  - [ ] 4.2 Preserve dry-run, matching accepted report ID, no automatic attachments/retries and no credentials or note content collected implicitly. Synthetic sends are not part of implementation verification unless explicitly authorized.
- [ ] 5.0 Verify and finalize the retained increment.
  - [ ] 5.1 Test topic guidance discoverability and full cost for common journeys; prove relevant safety/temporal/expansion behavior remains correct. Test preview with filesystem/transport mutation sentinels and feedback with a local fake relay.
  - [ ] 5.2 Update CLI/processing/feedback/skill docs and relevant release notes; record adopted/deferred changes, compatibility and untested limits, then archive/commit under [task completion](../../docs/task-workflow.md).
