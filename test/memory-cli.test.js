import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm, writeFile, mkdir } from "node:fs/promises";
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
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    input: options.input,
  });

  assert.equal(result.status, 0, `CLI failed\nargs: ${args.join(" ")}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

function runCliFailure(args, options = {}) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: options.cwd ?? repoRoot,
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

test("CLI reports package version", async () => {
  const expected = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8")).version;
  const result = runCli(["--version"]);
  assert.equal(result.stdout.trim(), expected);
});

test("CLI prints copyable agent memory instructions", () => {
  const result = runCli(["instructions"]);
  assert.match(result.stdout, /jumpyBrain memory hint/);
  assert.match(result.stdout, /memory:recall/);
  assert.match(result.stdout, /Do not memorize secrets/);
});

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

  const datedTemporalQueries = qmdIndexInternalsForTests.qmdLexQueries(
    "changes after 2026-06-02 about query generation and wrapup memory",
  ).slice(0, 8).join("\n");
  assert.match(datedTemporalQueries, /query generation/);
  assert.match(datedTemporalQueries, /wrapup memory/);

  assert.equal(qmdIndexInternalsForTests.looksLikeUnhelpfulSnippet("## User Could you suggest a hotel? ## Assistant"), true);
  assert.equal(qmdIndexInternalsForTests.looksLikeUnhelpfulSnippet("For a romantic dinner, I would recommend Roscioli."), false);

  assert.deepEqual(Object.keys(qmdIndexInternalsForTests).sort(), [
    "dateStats",
    "looksLikeUnhelpfulSnippet",
    "normalizeQmdLookupPath",
    "qmdLexQueries",
    "temporalBoostFor",
  ]);
});

test("temporal helper boosts dated candidates deterministically", () => {
  const docs = [
    documentWithDate("sessions/old.md", { date: "2026-06-01" }),
    documentWithDate("sessions/mid.md", { date: "2026-06-05" }),
    documentWithDate("sessions/new.md", { date: "2026-06-10" }),
  ];
  const stats = qmdIndexInternalsForTests.dateStats(docs);

  const latestOld = qmdIndexInternalsForTests.temporalBoostFor("latest QMD decision", docs[0].frontmatter, stats);
  const latestNew = qmdIndexInternalsForTests.temporalBoostFor("latest QMD decision", docs[2].frontmatter, stats);
  assert.ok(latestNew > latestOld);
  assert.equal(latestNew, 0.12);

  const firstOld = qmdIndexInternalsForTests.temporalBoostFor("first QMD decision", docs[0].frontmatter, stats);
  const firstNew = qmdIndexInternalsForTests.temporalBoostFor("first QMD decision", docs[2].frontmatter, stats);
  assert.ok(firstOld > firstNew);
  assert.equal(firstOld, 0.12);

  const afterMid = qmdIndexInternalsForTests.temporalBoostFor("changes after 2026-06-02 about query generation", docs[1].frontmatter, stats);
  const afterOld = qmdIndexInternalsForTests.temporalBoostFor("changes after 2026-06-02 about query generation", docs[0].frontmatter, stats);
  assert.ok(afterMid > 0);
  assert.equal(afterOld, 0);

  const beforeMid = qmdIndexInternalsForTests.temporalBoostFor("what happened before 2026-06-10 with wrapup memory", docs[1].frontmatter, stats);
  const beforeNew = qmdIndexInternalsForTests.temporalBoostFor("what happened before 2026-06-10 with wrapup memory", docs[2].frontmatter, stats);
  assert.ok(beforeMid > 0);
  assert.equal(beforeNew, 0);

  assert.equal(qmdIndexInternalsForTests.temporalBoostFor("latest QMD decision", { date: "not-a-date" }, stats), 0);
  assert.equal(qmdIndexInternalsForTests.temporalBoostFor("latest QMD decision", {}, stats), 0);
  assert.equal(qmdIndexInternalsForTests.temporalBoostFor("after the refactor QMD decision", docs[2].frontmatter, stats), 0);
});

function documentWithDate(relativePath, frontmatter) {
  return {
    absolutePath: `/tmp/${relativePath}`,
    relativePath,
    frontmatter,
    bodyStartLine: 1,
  };
}

test("CLI run memory recipes discover the repo memory root", async () => {
  const tempParent = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-run-"));
  const tempRoot = path.join(tempParent, "memory");
  const nested = path.join(tempParent, "nested", "workspace");
  try {
    await mkdir(nested, { recursive: true });
    runCli(["init", "--root", tempRoot]);
    const configPath = path.join(tempRoot, "jumpybrain.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.indexRoot = "..";
    await writeFile(configPath, JSON.stringify(config, null, 2));
    await mkdir(path.join(tempParent, "docs"));
    await writeFile(path.join(tempParent, "docs", "workspace.md"), "# Workspace doc\n\nThe workspace-only clue is blue-otter.\n");

    runCli(["run", "memory:note", "--type", "decision", "--title", "Discovered memory root"], {
      cwd: nested,
      input: "Agents can run jumpybrain recipes from nested workspaces.\n",
    });
    runCli(["run", "memory:index"], { cwd: nested });

    const recall = runCli(["run", "memory:recall", "--topic", "nested workspace recipes", "--limit", "3"], { cwd: nested });
    assert.match(recall.stdout, /Prior memory scan/);
    assert.match(recall.stdout, /Discovered memory root|nested workspaces/i);

    const workspaceRecall = runCli(["run", "memory:recall", "--topic", "blue otter workspace-only clue", "--limit", "3"], { cwd: nested });
    assert.match(workspaceRecall.stdout, /docs\/workspace\.md/);
    assert.match(workspaceRecall.stdout, /blue-otter/);

    const status = JSON.parse(runCli(["run", "memory:status", "--json"], { cwd: nested }).stdout);
    assert.equal(status.root, await realpath(tempRoot));
    assert.equal(status.compatible, true);
  } finally {
    await rm(tempParent, { recursive: true, force: true });
  }
});

test("CLI init creates a stable, compatible memory root", async () => {
  const tempParent = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-init-"));
  const tempRoot = path.join(tempParent, "memory");
  try {
    const result = runCli(["init", "--root", tempRoot, "--json"]);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.configFile, "jumpybrain.json");
    assert.equal(payload.schemaVersion, 1);
    assert.equal(payload.configCreated, true);
    assert.deepEqual(payload.memoryDirs, ["notes", "sessions", "findings", "decisions", "preferences", "pages"]);

    const config = JSON.parse(await readFile(path.join(tempRoot, "jumpybrain.json"), "utf8"));
    assert.equal(config.canonical, "markdown");
    assert.equal(config.derivedDir, ".jumpybrain");
    assert.match(await readFile(path.join(tempRoot, ".gitignore"), "utf8"), /\.jumpybrain\//);

    const status = JSON.parse(runCli(["status", "--root", tempRoot, "--json"]).stdout);
    assert.equal(status.initialized, true);
    assert.equal(status.compatible, true);
    assert.equal(status.schemaVersion, 1);
  } finally {
    await rm(tempParent, { recursive: true, force: true });
  }
});

test("CLI refuses writes when memory root schema is newer than the CLI", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-memory-"));
  try {
    await writeFile(path.join(tempRoot, "jumpybrain.json"), JSON.stringify({ schemaVersion: 999, canonical: "markdown", derivedDir: ".jumpybrain" }));
    const result = runCliFailure(["note", "--root", tempRoot, "--type", "decision", "--title", "Future schema"], {
      input: "This should not be written.\n",
    });
    assert.match(result.stderr, /schema v999/);
    assert.match(result.stderr, /Update the CLI/);
    assert.equal(existsSync(path.join(tempRoot, "decisions")), false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
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
    assert.match(payload.results[0].scoreBreakdown.driver, /^qmd-cli:/);
    assert.equal(typeof payload.results[0].scoreBreakdown.temporalRelevance, "number");
    assert.equal(typeof payload.results[0].scoreBreakdown.memoryStrength, "number");
    assert.equal(typeof payload.results[0].scoreBreakdown.provenanceConfidence, "number");
    assert.equal(typeof payload.results[0].scoreBreakdown.depthPolicyBoost, "number");
    assert.equal(payload.results[0].scoreBreakdown.retrievalDepth, "normal");

    const recall = runCli(["recall", "--root", tempRoot, "--topic", "release notes", "--limit", "2"]);
    assert.match(recall.stdout, /Prior memory scan/);
    assert.match(recall.stdout, /sessions\/a.md/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI process synthesizes a topical page and recall depth can retrieve it", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-process-"));
  try {
    runCli(["init", "--root", tempRoot]);
    await writeFile(path.join(tempRoot, "decisions", "memory-work.md"), [
      "---",
      'type: "decision"',
      'title: "Memory work uses pages"',
      'created_at: "2026-06-20T00:00:00.000Z"',
      "---",
      "",
      "# Memory work uses pages",
      "",
      "Memory work should synthesize topical pages from sessions and decisions using the silver-raven retrieval depth marker.",
      "",
    ].join("\n"));
    await writeFile(path.join(tempRoot, "sessions", "memory-work.md"), [
      "---",
      'type: "session"',
      'session_id: "s-memory-work"',
      'created_at: "2026-06-21T00:00:00.000Z"',
      "---",
      "",
      "# Memory work session",
      "",
      "We discussed silver-raven retrieval depth and the need to treat sessions as raw evidence.",
      "",
    ].join("\n"));

    const withoutApply = runCliFailure(["process", "--root", tempRoot, "--mode", "synthesize", "--topic", "memory work"]);
    assert.match(withoutApply.stderr, /--apply/);

    const process = JSON.parse(runCli(["process", "--root", tempRoot, "--mode", "synthesize", "--topic", "memory work", "--apply", "--json"]).stdout);
    assert.equal(process.mode, "synthesize");
    assert.deepEqual(process.files, ["pages/memory-work.md"]);
    const page = await readFile(path.join(tempRoot, "pages", "memory-work.md"), "utf8");
    assert.match(page, /type: "page"/);
    assert.match(page, /## Source memories/);
    assert.match(page, /silver-raven retrieval depth/);

    runCli(["index", "--root", tempRoot]);
    const shallow = JSON.parse(runCli(["recall", "--root", tempRoot, "--topic", "silver-raven retrieval depth", "--depth", "shallow", "--limit", "5", "--json"]).stdout);
    assert.equal(shallow.depth, "shallow");
    assert.equal(shallow.results[0].provenance.file, "pages/memory-work.md");
    assert.equal(shallow.results[0].scoreBreakdown.retrievalDepth, "shallow");

    const deep = JSON.parse(runCli(["recall", "--root", tempRoot, "--topic", "silver-raven retrieval depth raw evidence", "--depth", "deep", "--limit", "5", "--json"]).stdout);
    assert.equal(deep.depth, "deep");
    assert.ok(deep.results.some((result) => result.provenance.file.startsWith("sessions/")));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI process validates mode and writes a deterministic support report", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-lint-"));
  try {
    await mkdir(path.join(tempRoot, "pages"), { recursive: true });
    await writeFile(path.join(tempRoot, "pages", "sales.md"), [
      "---",
      'type: "page"',
      'title: "Sales"',
      'topic: "sales"',
      'updated_at: "2026-06-01T00:00:00.000Z"',
      "---",
      "",
      "# Sales",
      "",
      "This page has no source section.",
      "",
    ].join("\n"));
    await mkdir(path.join(tempRoot, "decisions"), { recursive: true });
    await mkdir(path.join(tempRoot, "findings"), { recursive: true });
    await mkdir(path.join(tempRoot, "sessions"), { recursive: true });
    await writeFile(path.join(tempRoot, "decisions", "sales-price-book.md"), [
      "---",
      'type: "decision"',
      'title: "Sales price book resolved"',
      'created_at: "2026-06-02T00:00:00.000Z"',
      "---",
      "",
      "# Sales price book resolved",
      "",
      "Resolved sales price book question: decision is to keep the sales price book in pages.",
      "",
    ].join("\n"));
    await writeFile(path.join(tempRoot, "findings", "sales-conflict.md"), [
      "---",
      'type: "finding"',
      'title: "Sales conflict"',
      'conflicts_with: ["decisions/sales-price-book.md"]',
      "---",
      "",
      "# Sales conflict",
      "",
      "This sales finding intentionally declares a conflict for deterministic lint coverage.",
      "",
    ].join("\n"));
    await writeFile(path.join(tempRoot, "sessions", "sales-open-question.md"), [
      "---",
      'type: "session"',
      'title: "Sales open question"',
      "---",
      "",
      "# Sales open question",
      "",
      "## Open Questions",
      "- Should sales price book stay in pages?",
      "",
    ].join("\n"));

    const badMode = runCliFailure(["process", "--root", tempRoot, "--mode", "compress", "--apply"]);
    assert.match(badMode.stderr, /Invalid --mode/);

    const result = JSON.parse(runCli(["process", "--root", tempRoot, "--mode", "lint", "--topic", "sales", "--apply", "--json"]).stdout);
    assert.equal(result.mode, "lint");
    assert.equal(result.files.length, 1);
    assert.match(result.files[0], /^\.jumpybrain\/reports\/lint-/);
    const report = await readFile(path.join(tempRoot, result.files[0]), "utf8");
    assert.match(report, /missing an explicit Source memories section/);
    assert.match(report, /Conflict: `findings\/sales-conflict\.md` declares a conflict with `decisions\/sales-price-book\.md`/);
    assert.match(report, /Open question in `sessions\/sales-open-question\.md` may be answered by `decisions\/sales-price-book\.md`/);
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
