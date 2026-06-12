import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { parseFrontmatter } from "../dist/canonical/markdown-store.js";
import { qmdIndexInternalsForTests } from "../dist/retrieval/qmd-driver.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const cliPath = path.join(repoRoot, "dist/cli.js");

function runCli(args, options = {}) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    input: options.input,
  });

  assert.equal(result.status, 0, `CLI failed\nargs: ${args.join(" ")}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

function runCliFailure(args, options = {}) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    input: options.input,
  });

  assert.notEqual(result.status, 0, `CLI unexpectedly succeeded\nargs: ${args.join(" ")}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

const validWrapup = [
  "## Findings",
  "- The canonical layer should stay backend-agnostic.",
  "",
  "## Decisions",
  "- Keep wrapup writing behind the writing module.",
  "",
  "## Conflicts / Corrections",
  "- None captured.",
  "",
  "## Open Questions",
  "- Should wrapup recall become mandatory after dogfood usage?",
  "",
].join("\n");

test("frontmatter parsing supports manual memory metadata", () => {
  const parsed = parseFrontmatter([
    "---",
    'session_id: "s-alpha"',
    'type: "finding"',
    'tags: ["qmd", "memory"]',
    "confidence: 0.8",
    "---",
    "# Finding",
  ].join("\n"));

  assert.equal(parsed.frontmatter.session_id, "s-alpha");
  assert.equal(parsed.frontmatter.type, "finding");
  assert.deepEqual(parsed.frontmatter.tags, ["qmd", "memory"]);
  assert.equal(parsed.frontmatter.confidence, 0.8);
  assert.equal(parsed.bodyStartLine, 7);
});

test("QMD helper logic keeps benchmark query and path repair deterministic", () => {
  assert.equal(
    qmdIndexInternalsForTests.normalizeQmdLookupPath("Sessions/Answer_ShareGPT_5Lzox6N_0.md"),
    "sessions/answer-sharegpt-5lzox6n-0.md",
  );

  const assistantQueries = qmdIndexInternalsForTests.qmdLexQueries(
    "I'm checking our previous chat about the shift rotation sheet for GM social media agents. Can you remind me what was the rotation for Admon on a Sunday?",
  );
  assert.ok(assistantQueries.slice(0, 8).includes("admon sunday"));
  assert.ok(assistantQueries.slice(0, 8).includes("shift rotation"));

  const temporalQueries = qmdIndexInternalsForTests.qmdLexQueries(
    "Which three events happened in the order from first to last: the day I helped my friend prepare the nursery, the day I helped my cousin pick out stuff for her baby shower, and the day I ordered a customized phone case for my friend's birthday?",
  );
  assert.ok(temporalQueries.slice(0, 8).includes("prepare nursery"));
  assert.ok(temporalQueries.slice(0, 8).includes("baby shower"));
  assert.ok(temporalQueries.slice(0, 8).includes("phone case"));

  assert.equal(qmdIndexInternalsForTests.looksLikeUnhelpfulSnippet("## User Could you suggest a hotel? ## Assistant"), true);
  assert.equal(qmdIndexInternalsForTests.looksLikeUnhelpfulSnippet("For a romantic dinner, I would recommend Roscioli."), false);

  assert.deepEqual(Object.keys(qmdIndexInternalsForTests).sort(), [
    "looksLikeUnhelpfulSnippet",
    "normalizeQmdLookupPath",
    "qmdLexQueries",
  ]);
});

test("CLI index stores original Markdown document metadata, not derived chunks", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-memory-"));
  try {
    await mkdir(path.join(tempRoot, "sessions"));
    await writeFile(path.join(tempRoot, "sessions", "a.md"), [
      "---",
      'session_id: "s-alpha"',
      "---",
      "",
      "# Session",
      "",
      "## Assistant",
      "",
      "Mira decided to store the release notes in docs/releases/q2.md.",
      "",
    ].join("\n"));

    runCli(["index", "--root", tempRoot]);
    assert.equal(existsSync(path.join(tempRoot, ".jumpybrain", "index.json")), true);
    assert.equal(existsSync(path.join(tempRoot, ".jumpybrain", "qmd-docs")), false);

    const manifest = JSON.parse(await readFile(path.join(tempRoot, ".jumpybrain", "index.json"), "utf8"));
    assert.equal(manifest.documents.length, 1);
    assert.equal(manifest.documents[0].relativePath, "sessions/a.md");
    assert.equal(manifest.documents[0].frontmatter.session_id, "s-alpha");
    assert.equal(manifest.chunks, undefined);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI index/search/recall returns real QMD provenance-rich memory results", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-memory-"));
  try {
    await mkdir(path.join(tempRoot, "sessions"));
    await writeFile(path.join(tempRoot, "sessions", "a.md"), [
      "---",
      'session_id: "s-alpha"',
      'date: "2026-01-05"',
      "---",
      "",
      "# Session",
      "",
      "## Assistant",
      "",
      "Mira decided to store the release notes in docs/releases/q2.md.",
      "",
    ].join("\n"));
    await writeFile(path.join(tempRoot, "sessions", "b.md"), [
      "---",
      'session_id: "s-distractor"',
      "---",
      "",
      "# Session",
      "",
      "Vale owns the markdown formatting checklist.",
      "",
    ].join("\n"));

    runCli(["index", "--root", tempRoot]);
    await rm(path.join(tempRoot, ".jumpybrain"), { recursive: true, force: true });
    runCli(["index", "--root", tempRoot]);

    const search = runCli(["search", "--root", tempRoot, "--query", "Where did Mira store release notes?", "--limit", "5", "--json"]);
    const payload = JSON.parse(search.stdout);
    assert.equal(payload.results[0].provenance.session_id, "s-alpha");
    assert.match(payload.results[0].snippet, /release notes/);
    assert.equal(payload.results[0].provenance.file, "sessions/a.md");
    assert.equal(payload.results[0].scoreBreakdown.driver, "qmd-cli");
    assert.equal(typeof payload.results[0].scoreBreakdown.temporalRelevance, "number");
    assert.equal(typeof payload.results[0].scoreBreakdown.memoryStrength, "number");
    assert.equal(typeof payload.results[0].scoreBreakdown.provenanceConfidence, "number");

    const recall = runCli(["recall", "--root", tempRoot, "--topic", "release notes", "--limit", "2"]);
    assert.match(recall.stdout, /Prior memory scan/);
    assert.match(recall.stdout, /sessions\/a.md/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI note writes editable Markdown memory", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-memory-"));
  try {
    const result = runCli(["note", "--root", tempRoot, "--type", "decision", "--title", "Use QMD first", "--json"], {
      input: "QMD is the first retrieval primitive; Markdown remains canonical.\n",
    });
    const payload = JSON.parse(result.stdout);
    assert.match(payload.file, /^decisions\/\d{4}-\d{2}-\d{2}-use-qmd-first/);

    const markdown = await readFile(path.join(tempRoot, payload.file), "utf8");
    assert.match(markdown, /type: "decision"/);
    assert.match(markdown, /# Use QMD first/);
    assert.match(markdown, /Markdown remains canonical/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI note rejects empty stdin body", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-memory-"));
  try {
    const result = runCliFailure(["note", "--root", tempRoot, "--type", "decision", "--title", "Empty"], { input: "\n" });
    assert.match(result.stderr, /Memory note body is empty/);
    assert.equal(existsSync(path.join(tempRoot, "decisions")), false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI search reports missing index clearly", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-memory-"));
  try {
    const result = runCliFailure(["search", "--root", tempRoot, "--query", "anything"]);
    assert.match(result.stderr, /Memory index not found/);
    assert.match(result.stderr, /jumpybrain index --root/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI wrapup writes one editable session file with strict sections", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-memory-"));
  try {
    const result = runCli(["wrapup", "--root", tempRoot, "--title", "Boundary refactor wrapup", "--json"], {
      input: validWrapup,
    });
    const payload = JSON.parse(result.stdout);
    assert.match(payload.file, /^sessions\/\d{4}-\d{2}-\d{2}-boundary-refactor-wrapup/);
    assert.equal(payload.validation.valid, true);
    assert.equal(payload.relatedMemory.skipped, true);
    assert.match(payload.body, /^# Boundary refactor wrapup/);
    assert.match(payload.body, /## Findings/);
    assert.match(payload.body, /## Open Questions/);

    const markdown = await readFile(path.join(tempRoot, payload.file), "utf8");
    assert.match(markdown, /type: "session"/);
    assert.match(markdown, /source: "jumpybrain-wrapup"/);
    assert.match(markdown, /confidence: "agent-drafted"/);
    assert.match(markdown, /review: "user-review-recommended"/);
    assert.match(markdown, /# Boundary refactor wrapup/);
    assert.match(markdown, /## Conflicts \/ Corrections/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI wrapup rejects missing required sections without writing", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-memory-"));
  try {
    const result = runCliFailure(["wrapup", "--root", tempRoot, "--title", "Bad wrapup"], {
      input: [
        "## Findings",
        "- Useful fact.",
        "",
        "## Decisions",
        "- Useful decision.",
      ].join("\n"),
    });
    assert.match(result.stderr, /Invalid wrapup Markdown/);
    assert.match(result.stderr, /## Conflicts \/ Corrections/);
    assert.equal(existsSync(path.join(tempRoot, "sessions")), false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI wrapup with duplicate title does not overwrite existing files", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-memory-"));
  try {
    const first = JSON.parse(runCli(["wrapup", "--root", tempRoot, "--title", "Same title", "--json"], { input: validWrapup }).stdout);
    const second = JSON.parse(runCli(["wrapup", "--root", tempRoot, "--title", "Same title", "--json"], { input: validWrapup }).stdout);

    assert.notEqual(first.file, second.file);
    assert.equal(existsSync(path.join(tempRoot, first.file)), true);
    assert.equal(existsSync(path.join(tempRoot, second.file)), true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
