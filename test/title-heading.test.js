import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { bodyWithTitleHeading } from "../dist/core/writing/index.js";
import { rememberMemory, writeSessionWrapup } from "../dist/app/writing/local-writer.js";
import { writeRemoteMemoryNote, writeRemoteSessionWrapup } from "../dist/app/writing/remote-writer.js";
import { writeServerMemoryWithIdempotency } from "../dist/app/server-memory/index.js";
import { parseFrontmatter } from "../dist/core/frontmatter.js";

async function disposableRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-title-heading-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

const h1Lines = (body) => body.split("\n").filter((line) => /^#(\s|$)/.test(line));
const wrapupSections = ["Findings", "Decisions", "Conflicts / Corrections", "Open Questions"].map((section) => `## ${section}\n- None captured.`).join("\n\n");

test("title heading rule keeps an authored matching H1 instead of repeating it", () => {
  for (const authored of ["# Deploy checklist", "#  deploy   CHECKLIST ", "# Deploy checklist ##", "#\tDeploy checklist", "# Ｄｅｐｌｏｙ checklist"]) {
    const body = `${authored}\n\nRun tests first.`;
    assert.equal(bodyWithTitleHeading("Deploy checklist", body), body, authored);
  }
  assert.equal(bodyWithTitleHeading("Deploy checklist", "\n# Deploy checklist\n\nText\n"), "# Deploy checklist\n\nText");
});

test("title heading rule prepends the title for other bodies, including different or non-H1 headings", () => {
  for (const body of ["Run tests first.", "# Release steps\n\nText", "## Deploy checklist\n\nText", "#Deploy checklist","Intro\n\n# Deploy checklist", "# Deploy checklist #x", ""]) {
    assert.equal(bodyWithTitleHeading("Deploy checklist", body), `# Deploy checklist\n\n${body}`, JSON.stringify(body));
  }
  assert.equal(bodyWithTitleHeading("", "#\n\nText"), "# \n\n#\n\nText", "an empty heading never matches");
});

test("local remember and wrapup store one title H1 when the agent body already has it", async (t) => {
  const root = await disposableRoot(t);
  const note = await rememberMemory(root, { type: "note", title: "Deploy checklist", body: "# Deploy checklist\n\nRun tests first." });
  const noteBody = parseFrontmatter(await readFile(path.join(root, note.file), "utf8")).body;
  assert.deepEqual(h1Lines(noteBody), ["# Deploy checklist"]);
  assert.match(noteBody, /Run tests first\./);

  const plain = await rememberMemory(root, { type: "finding", title: "Plain body", body: "No heading." });
  assert.deepEqual(h1Lines(parseFrontmatter(await readFile(path.join(root, plain.file), "utf8")).body), ["# Plain body"]);

  const different = await rememberMemory(root, { type: "note", title: "Deploy checklist", body: "# Release steps\n\nText" });
  assert.deepEqual(h1Lines(parseFrontmatter(await readFile(path.join(root, different.file), "utf8")).body), ["# Deploy checklist", "# Release steps"]);

  const wrapup = await writeSessionWrapup(root, { title: "Session wrapup", body: `# Session wrapup\n\n${wrapupSections}` });
  const wrapupBody = parseFrontmatter(await readFile(path.join(root, wrapup.file), "utf8")).body;
  assert.deepEqual(h1Lines(wrapupBody), ["# Session wrapup"]);
  assert.deepEqual(h1Lines(wrapup.body), ["# Session wrapup"]);
});

test("remote and hosted writers store one title H1 when the agent body already has it", async (t) => {
  const root = await disposableRoot(t);
  const note = await writeRemoteMemoryNote(root, { type: "decision", title: "Use SQLite", body: "# Use SQLite\n\nBecause." });
  assert.deepEqual(h1Lines(parseFrontmatter(await readFile(path.join(root, note.file), "utf8")).body), ["# Use SQLite"]);

  const wrapup = await writeRemoteSessionWrapup(root, { title: "Remote wrapup", body: `# remote wrapup\n\n${wrapupSections}` });
  assert.deepEqual(h1Lines(parseFrontmatter(await readFile(path.join(root, wrapup.file), "utf8")).body), ["# remote wrapup"]);

  const draft = { type: "note", title: "Hosted note", body: "# Hosted note\n\nVia the server." };
  const hosted = await writeServerMemoryWithIdempotency({ root, key: "title-heading", method: "POST", path: "/memories/all/notes", body: draft, write: { kind: "note", draft } });
  assert.equal(hosted.kind, "created");
  assert.deepEqual(h1Lines(parseFrontmatter(await readFile(path.join(root, hosted.result.file), "utf8")).body), ["# Hosted note"]);
});
