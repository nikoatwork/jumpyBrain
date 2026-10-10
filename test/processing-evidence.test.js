import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { initializeMemoryRoot, processMemory } from "../dist/index.js";

async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-process-evidence-"));
  try {
    await initializeMemoryRoot(root);
    const write = async (file, body, meta = {}) => {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), `---\n${Object.entries({ type: file.startsWith("pages/") ? "page" : "note", updated_at: "2026-01-01", ...meta }).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n")}\n---\n\n${body}\n`);
    };
    await run(root, write);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("lint accepts canonical provenance independent of Sources headings and distinguishes broken, absent, and context-only", () => fixture(async (root, write) => {
  await write("notes/copper ledger.md", "# Copper ledger\n\nOriginal fictional record.");
  await write("pages/sources.md", "# Map\n\n## Sources\n[ledger](../notes/copper%20ledger.md)");
  await write("pages/continuity.md", "# Map\n\n## Sources and continuity\n[[copper ledger]]");
  await write("pages/inline.md", "# Map\n\nSupported by [record](../notes/copper%20ledger.md#mechanism).");
  await write("pages/context.md", "# Map\n\n## Related memories\n[ledger](../notes/copper%20ledger.md)");
  await write("pages/absent.md", "# Map\n\n## Sources\nNothing captured.");
  await write("pages/broken.md", "# Map\n\n## Sources\n[missing](../notes/missing.md)");
  const result = await processMemory(root, { mode: "lint", apply: true });
  assert.deepEqual(result.issues.map(issue => [issue.file, issue.code]).sort(), [
    ["pages/absent.md", "PAGE_SOURCES_ABSENT"], ["pages/broken.md", "PAGE_SOURCE_BROKEN"], ["pages/context.md", "PAGE_CONTEXT_ONLY"],
  ]);
  assert.equal(result.issueCount, 3);
  for (const issue of result.issues) {
    assert.ok(issue.rationale.length > 10);
    assert.ok(["info", "warning"].includes(issue.severity));
    assert.ok(Array.isArray(issue.evidence));
  }
}));

test("lint accepts memory-ID links and reference-style Markdown through canonical link policy", () => fixture(async (root, write) => {
  const id = "mem_12345678-1234-1234-1234-123456789012";
  await write("notes/copper ledger.md", "# Record", { id });
  await write("pages/id.md", `# Map\n\n## Sources and continuity\n[record](${id})`);
  await write("pages/reference.md", "# Map\n\n## Sources\n[record][ledger]\n\n[ledger]: ../notes/copper%20ledger.md");
  await write("pages/context-reference.md", "# Map\n\n## Related context\n[record][ledger]\n\n## Definitions\n[ledger]: ../notes/copper%20ledger.md");
  const result = await processMemory(root, { mode: "lint", apply: true });
  assert.deepEqual(result.issues.map(issue => [issue.file, issue.code]), [["pages/context-reference.md", "PAGE_CONTEXT_ONLY"]]);
}));

test("lint exposes bounded same-paragraph candidate evidence, while abstaining on unrelated, incidental, negative and distant cues", () => fixture(async (root, write) => {
  await write("notes/questions.md", "# Questions\n\n## Open Questions\n- How should quartz ledger retries prevent duplicate invoices?\n- What should the team do with this work?");
  await write("decisions/supported.md", "# Decision\n\nWe decided quartz ledger retries prevent duplicate invoices through a durable deduplication key. This only applies to the sandbox; production behavior is not established.", { type: "decision" });
  await write("notes/common.md", "# Other domain\n\nWe decided the team should do this work with more care.");
  await write("notes/incidental.md", "# Lunch\n\nQuartz ledger attendees decided on soup for lunch.");
  await write("notes/distant.md", "# Decision\n\nWe decided the garden needs shade.\n\n## Accounts\nQuartz ledger retries prevent duplicate invoices in the proposed design.");
  await write("notes/negative.md", "# Pending\n\nWe have not decided how quartz ledger retries prevent duplicate invoices; the answer remains unknown.");
  await write("notes/adjacent-caveat.md", "# Draft\n\nWe decided quartz ledger retries prevent duplicate invoices with a queue.\n\nThis decision is provisional and awaits tests.");
  await write("notes/oversized-adjacent-caveat.md", `# Draft\n\nWe decided quartz ledger retries prevent duplicate invoices with a queue.\n\nThis decision is provisional and unresolved. ${"Further qualification. ".repeat(80)}`);
  await write("notes/boundaries.md", "# Not tokens\n\nWe decided quartzite ledgerish retriesx prevented duplicated invoicesx.");
  await write("notes/long.md", `# Oversized\n\nWe decided quartz ledger retries prevent duplicate invoices. ${"unrelated text ".repeat(110)}But this remains unresolved.`);
  await write("pages/dream.md", "# Dream\n\nWe decided quartz ledger retries prevent duplicate invoices.", { dream: true });
  const before = await readFile(path.join(root, "notes/questions.md"), "utf8");
  const result = await processMemory(root, { mode: "lint", apply: true });
  const candidates = result.issues.filter(issue => issue.code === "QUESTION_ANSWER_CANDIDATE");
  assert.equal(candidates.length, 1);
  assert.match(candidates[0].rationale, /not semantic resolution/);
  const evidence = candidates[0].evidence[0];
  assert.equal(evidence.file, "decisions/supported.md");
  assert.match(evidence.text, /only applies to the sandbox; production behavior is not established/);
  assert.ok(evidence.text.length <= 1000);
  const lines = (await readFile(path.join(root, evidence.file), "utf8")).split(/\r?\n/);
  assert.equal(lines.slice(evidence.lineStart - 1, evidence.lineEnd).join("\n"), evidence.text);
  assert.ok(evidence.matchedTokens.includes("quartz"));
  assert.equal(await readFile(path.join(root, "notes/questions.md"), "utf8"), before);
}));

test("lint reports invocation scope without implying full inspection", () => fixture(async (root, write) => {
  await write("notes/one.md", "# Quartz one");
  await write("notes/two.md", "# Quartz two");
  await write("notes/old.md", "# Quartz old", { updated_at: "2020-01-01" });
  await write("notes/unrelated.md", "# Garden");
  const result = await processMemory(root, { mode: "lint", topic: "quartz", since: "2025-01-01", limit: 1, apply: true });
  assert.equal(result.scope.total, 4);
  assert.equal(result.scope.eligible, 2);
  assert.equal(result.scope.inspected, 1);
  assert.equal(result.scope.candidateDocuments, 4);
  const report = await readFile(path.join(root, result.files[0]), "utf8");
  assert.match(report, /inspected 1\/2 eligible, 4 total/);
  assert.match(report, /2025-01-01T00:00:00.000Z/);
}));
