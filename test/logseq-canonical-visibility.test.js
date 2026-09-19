import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { migrateLogseq } from "../dist/app/migration/index.js";
import { listMarkdownFiles, listCanonicalMemoryMarkdownFiles, readCanonicalMemoryDocumentById } from "../dist/core/canonical/index.js";

const excludedNames = [
  "golden-plan.md", "answer_session_ids.md", "nested/golden-folder/plan.md",
  ...["build", "dist", "logs", "reports", "node_modules"].map(dir => `nested/${dir}/deeper/imported.md`),
  "logs/build/reports/dist/node_modules/imported.md",
];

async function fixture(t) {
  const base = await realpath(await mkdtemp(path.join(os.tmpdir(), "jumpy-logseq-visibility-")));
  t.after(() => rm(base, { recursive: true, force: true }));
  return { base, source: path.join(base, "source"), root: path.join(base, "memory") };
}

async function put(root, relative, content) {
  const file = path.join(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

function envelope(file, overrides = {}) {
  const journal = file.startsWith("sessions/");
  const metadata = {
    id: `mem_${randomUUID()}`, source: "logseq-migration", type: journal ? "session" : "note",
    source_path: file.replace(/^[^/]+/, journal ? "journals" : "pages"), ...overrides,
  };
  return { id: metadata.id, content: `---\n${Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")}\n---\nSynthetic body\n` };
}

async function assertLists(root, expected) {
  for (const list of [listMarkdownFiles, listCanonicalMemoryMarkdownFiles]) {
    assert.deepEqual((await list(root)).map(file => path.relative(root, file).split(path.sep).join("/")).sort(), [...expected].sort());
  }
}

test("canonical scanners and ID reads include excluded Logseq names without a manifest", async t => {
  const { source, root } = await fixture(t);
  for (const bucket of ["pages", "journals"]) {
    for (const name of excludedNames) await put(source, `${bucket}/${name}`, "- Synthetic imported memory\n");
  }
  const result = await migrateLogseq(source, root, { apply: true });
  assert.equal(result.created, excludedNames.length * 2);
  // Visibility comes from canonical Markdown alone, not migration ownership or derived state.
  await rm(path.join(root, result.manifest));
  await rm(path.join(root, ".jumpybrain"), { recursive: true, force: true });
  await assertLists(root, result.entries.map(entry => entry.outputPath));
  for (const entry of result.entries) {
    const document = await readCanonicalMemoryDocumentById(root, entry.id);
    assert.equal(document.file, entry.outputPath);
    assert.equal(document.type, entry.type);
    assert.equal(document.content, await readFile(path.join(root, entry.outputPath), "utf8"));
  }
});

test("exceptions do not expose ordinary excluded documents or forged migration metadata", async t => {
  const { root } = await fixture(t);
  const missingIds = [];
  const invalidMetadata = [
    { source: "other" }, { source: "" }, { id: "invalid" }, { id: 42 },
    { type: "page" }, { type: "session" }, { source_path: "pages/wrong.md" },
    { source_path: "pages/../pages/golden-plan.md" }, { source_path: ["pages/golden-plan.md"] },
  ];
  for (const bucket of ["notes", "sessions"]) {
    for (const name of excludedNames) {
      const file = `${bucket}/${name}`;
      const ordinary = envelope(file, { source: "manual" });
      missingIds.push(ordinary.id);
      await put(root, file, ordinary.content);
    }
    // Keep the historical notes/logs exclusion and nested descendants excluded.
    for (const name of ["logs/ordinary.md", "logs/deeper/ordinary.md"]) {
      const ordinary = envelope(`${bucket}/${name}`, { source: "manual" });
      missingIds.push(ordinary.id);
      await put(root, `${bucket}/${name}`, ordinary.content);
    }
  }
  for (const [index, override] of invalidMetadata.entries()) {
    for (const file of [`notes/golden-forged-${index}.md`, `notes/build/forged-${index}.md`]) {
      const forged = envelope(file, override);
      if (typeof forged.id === "string" && forged.id.startsWith("mem_")) missingIds.push(forged.id);
      await put(root, file, forged.content);
    }
  }
  for (const file of ["pages/logs/forged.md", "findings/golden-plan.md", "logs/notes/imported.md", "other/notes/golden-plan.md"]) {
    const forged = envelope(file);
    missingIds.push(forged.id);
    await put(root, file, forged.content);
  }
  const normal = envelope("notes/normal.md", { source: "manual" });
  await put(root, "notes/normal.md", normal.content);
  await assertLists(root, ["notes/normal.md"]);
  assert.equal((await readCanonicalMemoryDocumentById(root, normal.id)).file, "notes/normal.md");
  for (const id of missingIds) await assert.rejects(readCanonicalMemoryDocumentById(root, id), { code: "missing_id" });
});

test("migration visibility never reopens hidden technical directories or follows symlinks", async t => {
  const { base, root } = await fixture(t);
  const missingIds = [];
  for (const bucket of ["notes", "sessions"]) {
    for (const hidden of [".git", ".jumpybrain", ".qmd", ".hidden"]) {
      for (const prefix of ["logs/", ""]) {
        const file = `${bucket}/${prefix}${hidden}/golden-plan.md`;
        const document = envelope(file);
        missingIds.push(document.id);
        await put(root, file, document.content);
      }
    }
    const target = path.join(base, `outside-${bucket}`);
    const linked = envelope(`${bucket}/logs/linked/imported.md`);
    missingIds.push(linked.id);
    await put(target, "imported.md", linked.content);
    await symlink(target, path.join(root, bucket, "logs/linked"));
    await symlink(path.join(target, "imported.md"), path.join(root, bucket, "golden-linked.md"));
    await symlink(target, path.join(root, bucket, "normal-link"));
  }
  await assertLists(root, []);
  for (const id of missingIds) await assert.rejects(readCanonicalMemoryDocumentById(root, id), { code: "missing_id" });

  // Canonical bucket starts must not follow links either, even for normal filenames.
  for (const bucket of ["notes", "sessions", "pages"]) {
    const linkedRoot = path.join(base, `linked-root-${bucket}`);
    const outside = path.join(base, `bucket-target-${bucket}`);
    const normal = envelope(`${bucket}/normal.md`);
    await put(outside, "normal.md", normal.content);
    await mkdir(linkedRoot);
    await symlink(outside, path.join(linkedRoot, bucket));
    await assertLists(linkedRoot, []);
    await assert.rejects(readCanonicalMemoryDocumentById(linkedRoot, normal.id), { code: "missing_id" });
  }
});
