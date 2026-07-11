import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { initializeMemoryRoot, processMemory } from "../dist/index.js";

async function writeMemory(root, relativePath, frontmatter, body) {
  const file = path.join(root, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  const metadata = Object.entries(frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n");
  await writeFile(file, ["---", metadata, "---", "", body, ""].join("\n"));
}

test("processing lint reports stale pages, duplicate titles, and missing conflict targets as derived support state", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-processing-lint-"));
  try {
    await initializeMemoryRoot(root);
    await writeMemory(root, "pages/api-contract.md", {
      type: "page",
      title: "API contract",
      topic: "api contract",
      updated_at: "2026-01-01T00:00:00.000Z",
    }, "# API contract\n\n## Source memories\n- `decisions/api-contract.md` — API contract (decision)");
    await writeMemory(root, "decisions/api-contract.md", {
      type: "decision",
      title: "API contract",
      updated_at: "2026-01-03T00:00:00.000Z",
    }, "# API contract\n\nThe API contract changed after the page was synthesized.");
    await writeMemory(root, "findings/api-contract-copy.md", {
      type: "finding",
      title: "API contract",
      updated_at: "2026-01-04T00:00:00.000Z",
      conflicts_with: ["decisions/missing-api.md"],
    }, "# API contract\n\nDuplicate title and missing conflict target fixture.");

    const result = await processMemory(root, { mode: "lint", topic: "api contract", apply: true });
    assert.equal(result.mode, "lint");
    assert.equal(result.applied, true);
    assert.match(result.files[0], /^\.jumpybrain\/reports\/lint-/);

    const report = await readFile(path.join(root, result.files[0]), "utf8");
    assert.match(report, /Page `pages\/api-contract\.md` may be stale: 2 newer related source memories found/);
    assert.match(report, /Possible duplicate api contract:/);
    assert.match(report, /`decisions\/api-contract\.md`/);
    assert.match(report, /`findings\/api-contract-copy\.md`/);
    assert.match(report, /declares a conflict with missing target `decisions\/missing-api\.md`/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing synthesize stamps a valid ID on new topical pages", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-processing-synth-id-"));
  try {
    await initializeMemoryRoot(root);
    await writeMemory(root, "decisions/alpha-pages.md", {
      type: "decision",
      title: "Alpha pages",
      updated_at: "2026-01-02T00:00:00.000Z",
    }, "# Alpha pages\n\nAlpha pages should be synthesized for the new-page ID fixture.");

    const result = await processMemory(root, { mode: "synthesize", topic: "alpha pages", apply: true });
    assert.deepEqual(result.files, ["pages/alpha-pages.md"]);

    const page = await readFile(path.join(root, "pages", "alpha-pages.md"), "utf8");
    assert.match(page, /^id: "mem_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"$/m);
    assert.match(page, /^type: "page"$/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing synthesize preserves an existing topical page ID", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-processing-synth-preserve-id-"));
  try {
    await initializeMemoryRoot(root);
    const existingId = "mem_00000000-0000-0000-0000-000000000123";
    await writeMemory(root, "pages/stable-pages.md", {
      id: existingId,
      type: "page",
      title: "Old stable pages",
      topic: "stable pages",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    }, "# Old stable pages\n\nOld synthesized body.");
    await writeMemory(root, "decisions/stable-pages.md", {
      type: "decision",
      title: "Stable pages",
      updated_at: "2026-01-02T00:00:00.000Z",
    }, "# Stable pages\n\nStable pages should retain IDs when regenerated.");

    const result = await processMemory(root, { mode: "synthesize", topic: "stable pages", apply: true });
    assert.deepEqual(result.files, ["pages/stable-pages.md"]);

    const page = await readFile(path.join(root, "pages", "stable-pages.md"), "utf8");
    assert.match(page, new RegExp(`^id: "${existingId}"$`, "m"));
    assert.match(page, /Stable pages should retain IDs when regenerated/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing ensure-ids stamps only missing IDs in canonical buckets", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-processing-ensure-ids-"));
  try {
    await initializeMemoryRoot(root);
    const missingBuckets = ["notes", "findings", "decisions", "preferences", "sessions", "pages"];
    for (const bucket of missingBuckets) {
      await writeMemory(root, `${bucket}/missing-id.md`, {
        type: bucket === "sessions" ? "session" : bucket.slice(0, -1),
        title: `Missing ${bucket}`,
        updated_at: "2026-01-01T00:00:00.000Z",
      }, `# Missing ${bucket}\n\nBody for ${bucket}.`);
    }

    const existingPath = "notes/already-id.md";
    await writeMemory(root, existingPath, {
      id: "mem_00000000-0000-0000-0000-000000000999",
      type: "note",
      title: "Already IDed",
      updated_at: "2026-01-01T00:00:00.000Z",
    }, "# Already IDed\n\nThis file must remain byte-identical.");
    const existingBefore = await readFile(path.join(root, existingPath), "utf8");

    await writeMemory(root, "archive/not-canonical.md", {
      type: "note",
      title: "Archive",
      updated_at: "2026-01-01T00:00:00.000Z",
    }, "# Archive\n\nNot a canonical bucket.");

    const result = await processMemory(root, { mode: "ensure-ids", apply: true });
    assert.equal(result.mode, "ensure-ids");
    assert.equal(result.modifiedCount, 6);
    assert.deepEqual(result.files, [
      "decisions/missing-id.md",
      "findings/missing-id.md",
      "notes/missing-id.md",
      "pages/missing-id.md",
      "preferences/missing-id.md",
      "sessions/missing-id.md",
    ]);
    assert.match(result.summary.join("\n"), /Modified count: 6/);

    for (const relative of result.files) {
      const markdown = await readFile(path.join(root, relative), "utf8");
      assert.match(markdown, /^id: "mem_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"$/m);
      assert.doesNotMatch(markdown, /updated_at: "2026-01-01T00:00:00.000Z"/);
      assert.match(markdown, /Body for/);
    }

    assert.equal(await readFile(path.join(root, existingPath), "utf8"), existingBefore);
    const archive = await readFile(path.join(root, "archive/not-canonical.md"), "utf8");
    assert.doesNotMatch(archive, /^id: /m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing lint writes a no-findings support report for clean scoped memory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-processing-clean-"));
  try {
    await initializeMemoryRoot(root);
    await writeMemory(root, "decisions/clean-memory.md", {
      type: "decision",
      title: "Clean memory",
      updated_at: "2026-01-01T00:00:00.000Z",
    }, "# Clean memory\n\nNo deterministic lint problems here.");

    const result = await processMemory(root, { mode: "lint", topic: "clean memory", apply: true });
    const report = await readFile(path.join(root, result.files[0]), "utf8");

    assert.match(result.files[0], /^\.jumpybrain\/reports\//);
    assert.match(report, /No deterministic lint findings found/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
