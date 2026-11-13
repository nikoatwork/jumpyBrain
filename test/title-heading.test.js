import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { bodyWithoutTitleHeading, renderMarkdownDocument } from "../dist/core/writing/index.js";
import { rememberMemory, writeSessionWrapup } from "../dist/app/writing/local-writer.js";
import { writeRemoteMemoryNote, writeRemoteSessionWrapup } from "../dist/app/writing/remote-writer.js";
import { writeServerMemoryWithIdempotency } from "../dist/app/server-memory/index.js";
import { parseFrontmatter } from "../dist/core/frontmatter.js";
import { selectEvidenceExcerpt } from "../dist/core/retrieval-policy/excerpts.js";

async function disposableRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-title-heading-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function stored(root, file) {
  return parseFrontmatter(await readFile(path.join(root, file), "utf8"));
}

const wrapupSections = ["Findings", "Decisions", "Conflicts / Corrections", "Open Questions"].map((section) => `## ${section}\n- None captured.`).join("\n\n");

test("title rule drops an authored H1 that repeats the title, plus the blank lines after it", () => {
  for (const authored of ["# Deploy checklist", "#  deploy   CHECKLIST ", "# Deploy checklist ##", "#\tDeploy checklist", "# Ｄｅｐｌｏｙ checklist"]) {
    assert.equal(bodyWithoutTitleHeading("Deploy checklist", `${authored}\n\n \nRun tests first.\n\n## Steps\n- one`), "Run tests first.\n\n## Steps\n- one", authored);
  }
  assert.equal(bodyWithoutTitleHeading("Deploy checklist", "\n# Deploy checklist\n\n    indented code\n"), "    indented code", "leading indentation of the next line is kept");
  assert.equal(bodyWithoutTitleHeading("Deploy checklist", "# Deploy checklist\r\n\r\nText\r\nMore"), "Text\r\nMore", "CRLF bodies stay verbatim");
  assert.equal(bodyWithoutTitleHeading("Deploy checklist", "# Deploy checklist"), "", "a heading-only body becomes empty");
});

test("title rule never adds a heading and leaves every other body unchanged", () => {
  for (const body of ["Run tests first.", "# Release steps\n\nText", "## Deploy checklist\n\nText", "#Deploy checklist", "Deploy checklist\n================\n\nText", "Intro\n\n# Deploy checklist", "# Deploy checklist #x", ""]) {
    assert.equal(bodyWithoutTitleHeading("Deploy checklist", body), body, JSON.stringify(body));
  }
  assert.equal(bodyWithoutTitleHeading("", "#\n\nText"), "#\n\nText", "an empty heading never matches");
});

test("blank bodies render as frontmatter only", () => {
  assert.equal(renderMarkdownDocument([["title", "Empty"]], ""), '---\ntitle: "Empty"\n---\n');
  assert.equal(renderMarkdownDocument([["title", "Text"]], "Body\n\n"), '---\ntitle: "Text"\n---\n\nBody\n');
});

test("local remember and wrapup store no title H1 and keep the frontmatter title", async (t) => {
  const root = await disposableRoot(t);
  const note = await rememberMemory(root, { type: "note", title: "Deploy checklist", body: "# Deploy checklist\n\nRun tests first." });
  const noteDoc = await stored(root, note.file);
  assert.equal(noteDoc.frontmatter.title, "Deploy checklist");
  assert.equal(noteDoc.body.trim(), "Run tests first.");

  const plain = await rememberMemory(root, { type: "finding", title: "Plain body", body: "No heading." });
  assert.equal((await stored(root, plain.file)).body.trim(), "No heading.");

  const different = await rememberMemory(root, { type: "note", title: "Deploy checklist", body: "# Release steps\n\nText" });
  assert.equal((await stored(root, different.file)).body.trim(), "# Release steps\n\nText");

  const wrapup = await writeSessionWrapup(root, { title: "Session wrapup", body: `# Session wrapup\n\n${wrapupSections}` });
  const wrapupDoc = await stored(root, wrapup.file);
  assert.equal(wrapupDoc.frontmatter.title, "Session wrapup");
  assert.equal(wrapupDoc.body.trim(), wrapupSections);
  assert.equal(wrapup.body, wrapupSections);
  assert.equal(wrapup.validation.valid, true);
});

test("remote and hosted writers store no title H1", async (t) => {
  const root = await disposableRoot(t);
  const note = await writeRemoteMemoryNote(root, { type: "decision", title: "Use SQLite", body: "# Use SQLite\n\nBecause." });
  assert.equal((await stored(root, note.file)).body.trim(), "Because.");

  const wrapup = await writeRemoteSessionWrapup(root, { title: "Remote wrapup", body: `# remote wrapup\n\n${wrapupSections}` });
  assert.equal((await stored(root, wrapup.file)).body.trim(), wrapupSections);

  const draft = { type: "note", title: "Hosted note", body: "Via the server." };
  const hosted = await writeServerMemoryWithIdempotency({ root, key: "title-heading", method: "POST", path: "/memories/all/notes", body: draft, write: { kind: "note", draft } });
  assert.equal(hosted.kind, "created");
  const hostedDoc = await stored(root, hosted.result.file);
  assert.equal(hostedDoc.frontmatter.title, "Hosted note");
  assert.equal(hostedDoc.body.trim(), "Via the server.");
});

test("excerpts weigh frontmatter title words like the former title H1 for heading-less bodies", () => {
  const terms = ["harbor", "migration", "amber", "otter"].map((text) => ({ text, weight: 1 }));
  const withoutH1 = ["---", "title: Harbor migration map", "---", "", "Harbor migration connects fleet scheduling.", "", "## Source memories", "- [Trial](../sessions/a.md)", "", "Rollback used checkpoint amber-otter-73."];
  const options = { bodyStartLine: 4, lineStart: 4, lineEnd: withoutH1.length, terms, maxChars: 100 };
  assert.doesNotMatch(selectEvidenceExcerpt(withoutH1, options).snippet, /amber-otter-73/, "control: without the title, the opening line wins");
  assert.match(selectEvidenceExcerpt(withoutH1, { ...options, title: "Harbor migration map" }).snippet, /amber-otter-73/);
  const withH1 = [...withoutH1.slice(0, 4), "# Harbor migration map", "", ...withoutH1.slice(4)];
  const legacy = { ...options, lineEnd: withH1.length };
  assert.deepEqual(selectEvidenceExcerpt(withH1, { ...legacy, title: "Harbor migration map" }), selectEvidenceExcerpt(withH1, legacy), "a leading heading keeps the previous weighting");
  assert.match(selectEvidenceExcerpt(withH1, legacy).snippet, /amber-otter-73/);
});
