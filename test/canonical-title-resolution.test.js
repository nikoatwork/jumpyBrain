import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  normalizedDocumentTitle,
  resolveCanonicalMemoryDocumentByTitle,
} from "../dist/core/canonical/index.js";

const newId = () => `mem_${randomUUID()}`;
const BUCKETS = ["notes", "findings", "decisions", "preferences", "sessions", "pages"];

async function fixture(t) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-title-resolution-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const root = path.join(sandbox, "memory");
  await mkdir(root);
  return { sandbox, root };
}

async function put(root, relative, content) {
  const file = path.join(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
  return file;
}

function markdown(title, id, extra = "") {
  return [
    "---",
    ...(id === undefined ? [] : [`id: ${JSON.stringify(id)}`]),
    ...(title === undefined ? [] : [`title: ${JSON.stringify(title)}`]),
    "type: note",
    ...(extra ? [extra] : []),
    "---",
    "# Body heading, not a title",
    "",
  ].join("\n");
}

// Include directories, file bytes, and link targets, without following symlinks.
// Snapshot the entire sandbox so other roots and symlink targets are covered too.
async function snapshot(root) {
  const entries = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      const relative = path.relative(root, file);
      if (entry.isSymbolicLink()) {
        entries.push([relative, "symlink", await readlink(file)]);
      } else if (entry.isDirectory()) {
        entries.push([relative, "directory"]);
        await walk(file);
      } else {
        entries.push([relative, "file", createHash("sha256").update(await readFile(file)).digest("hex")]);
      }
    }
  }
  await walk(root);
  return entries.sort(([a], [b]) => a.localeCompare(b));
}

async function expectReadOnly(sandbox, root, title, expected) {
  const before = await snapshot(sandbox);
  assert.deepEqual(await resolveCanonicalMemoryDocumentByTitle(root, title), expected);
  assert.deepEqual(await snapshot(sandbox), before, "lookup must not mutate file bytes or tree");
}

test("title normalization shares the rename policy and never coerces nonstrings", () => {
  for (const value of ["Café", "  ＣＡＦＥ\u0301  ", "CAFE\u0301", " café "]) {
    assert.equal(normalizedDocumentTitle(value), "café");
  }
  for (const value of [undefined, null, 123, true, [], ["Café"], {}, "", " \t\n "]) {
    assert.equal(normalizedDocumentTitle(value), "");
  }
  assert.equal(normalizedDocumentTitle("  Two  Words  "), "two  words");
});

// The 23 semantic/safety cases from resolve-probe.mjs, without its benchmark.
// Await each subtest: intentional edits between calls exercise fresh scans.
test("canonical title resolution preserves the feasibility probe contract", async (t) => {
  const { sandbox, root } = await fixture(t);
  const retrievalRoot = path.join(sandbox, "different-named-retrieval-root");
  const primary = newId();
  const expect = (label, selectedRoot, title, expected) => t.test(label, () =>
    expectReadOnly(sandbox, selectedRoot, title, expected));

  await put(root, "notes/filename-not-title.md", markdown("Café", primary));
  await expect("NFKC + trim + case + NFC", root, "  ＣＡＦＥ\u0301  ", { status: "found", id: primary });
  await expect("filename is not title", root, "filename-not-title", { status: "missing" });
  await expect("path does not resolve", root, "notes/filename-not-title.md", { status: "missing" });
  await expect("heading is not title", root, "Body heading, not a title", { status: "missing" });
  await expect("no fuzzy prefix", root, "Caf", { status: "missing" });
  await expect("blank title", root, "  ", { status: "missing" });

  for (const [label, title, id] of [
    ["case-equivalent duplicate title", "CAFÉ", newId()],
    ["Unicode-equivalent duplicate title", "ＣＡＦＥ\u0301", newId()],
    ["ID-less duplicate still counts", " café ", undefined],
    ["malformed-ID title duplicate still counts", "CAFÉ", "bad"],
  ]) {
    const file = await put(root, "pages/duplicate.md", markdown(title, id));
    await expect(label, root, "Café", { status: "ambiguous" });
    await rm(file);
  }

  await put(root, "notes/idless.md", markdown("ID-less"));
  await expect("unique title without ID", root, "ID-less", { status: "unopenable" });
  await put(root, "notes/invalid.md", markdown("Invalid ID", "mem_not-a-uuid"));
  await expect("malformed ID rejected by real core read", root, "Invalid ID", { status: "unopenable" });
  await put(root, "notes/numeric.md", markdown("Numeric ID", 123));
  await expect("non-string ID", root, "Numeric ID", { status: "unopenable" });
  const duplicateIdFile = await put(root, "decisions/duplicate-id.md", markdown("Different title same ID", primary));
  await expect("ID duplicate with different title and bucket", root, "Café", { status: "unopenable" });
  await rm(duplicateIdFile);

  const retrievalId = newId();
  await put(retrievalRoot, "notes/only.md", markdown("Retrieval only", retrievalId));
  await put(retrievalRoot, "notes/collision.md", markdown("Café", primary));
  await expect("other retrieval root does not create ambiguity", root, "Café", { status: "found", id: primary });
  await expect("retrieval-only title is absent from memory root", root, "Retrieval only", { status: "missing" });
  await expect("control: retrieval root fixture exists", retrievalRoot, "Retrieval only", { status: "found", id: retrievalId });

  await put(root, "notes/filename-not-title.md", markdown("Fresh unindexed title", primary));
  await expect("newly edited title resolves with no index", root, "Fresh unindexed title", { status: "found", id: primary });
  await expect("renamed old title missing", root, "Café", { status: "missing" });
  await rm(path.join(root, "notes/filename-not-title.md"));
  await expect("deleted title missing", root, "Fresh unindexed title", { status: "missing" });
  await put(root, "unbucketed.md", markdown("Not canonical", newId()));
  await expect("only canonical buckets", root, "Not canonical", { status: "missing" });
  const brokenRoot = path.join(sandbox, "broken-memory");
  await put(brokenRoot, "notes", "Not a directory");
  await expect("scan I/O error is unopenable, not missing", brokenRoot, "anything", { status: "unopenable" });
  await expect("nonexistent root is unopenable", path.join(sandbox, "nonexistent"), "anything", { status: "unopenable" });
});

test("title resolution finds nested Markdown in every canonical bucket", async (t) => {
  const { sandbox, root } = await fixture(t);
  for (const bucket of BUCKETS) {
    const id = newId();
    await put(root, `${bucket}/nested/document.MD`, markdown(`Title ${bucket}`, id));
    await expectReadOnly(sandbox, root, `  TITLE ${bucket.toUpperCase()}  `, { status: "found", id });
  }
});

test("ambiguity counts all matching titles even when none has an openable ID", async (t) => {
  const { sandbox, root } = await fixture(t);
  await put(root, "notes/legacy.md", markdown("Legacy title"));
  await put(root, "sessions/invalid.md", markdown(" LEGACY TITLE ", "invalid"));
  await expectReadOnly(sandbox, root, "Legacy title", { status: "ambiguous" });
});

test("missing and nonstring title metadata is not coerced or replaced by body or filename", async (t) => {
  const { sandbox, root } = await fixture(t);
  for (const [name, value] of [["missing", undefined], ["empty", ""], ["blank", "  "], ["number", 123], ["boolean", true], ["array", ["Array title"]]]) {
    await put(root, `notes/${name}.md`, markdown(value, newId()));
  }
  await put(root, "notes/no-frontmatter.md", "# Heading-only title\n");
  for (const title of ["123", "true", "Array title", "missing", "Heading-only title", "Body heading, not a title", "", "  "]) {
    await expectReadOnly(sandbox, root, title, { status: "missing" });
  }
  const id = newId();
  await put(root, "pages/valid.md", markdown("Valid title", id));
  await expectReadOnly(sandbox, root, "Valid title", { status: "found", id });
});

test("title resolution ignores derived state, excluded paths, and non-Markdown files", async (t) => {
  const { sandbox, root } = await fixture(t);
  const id = newId();
  await put(root, "notes/canonical.md", markdown("Canonical title", id));
  const excluded = [
    "workspace.md", "other/document.md", ".jumpybrain/report.md", ".qmd/cache.md",
    "logs/log.md", "reports/report.md", "dist/output.md", "build/output.md",
    "node_modules/package/readme.md", "notes/logs/deeper/document.md",
    "notes/build/document.md", "sessions/dist/document.md", "pages/reports/document.md",
    "findings/node_modules/document.md", "notes/.git/document.md",
    "notes/.jumpybrain/document.md", "notes/.qmd/document.md",
    "notes/golden-answer.md", "sessions/answer_session_ids.md", "notes/plain.txt",
  ];
  for (const relative of excluded) {
    // Neither duplicate titles nor duplicate IDs outside the canonical scan count.
    await put(root, relative, markdown("Canonical title", id));
  }
  await expectReadOnly(sandbox, root, "Canonical title", { status: "found", id });
  for (const relative of excluded) await put(root, relative, markdown("Excluded title", newId()));
  await expectReadOnly(sandbox, root, "Excluded title", { status: "missing" });
});

test("title resolution does not follow file, nested-directory, or bucket symlinks", async (t) => {
  const { sandbox, root } = await fixture(t);
  const id = newId();
  const outside = path.join(sandbox, "outside-memory");
  const target = await put(outside, "document.md", markdown("Linked title", id));
  await mkdir(path.join(root, "notes"));
  await symlink(target, path.join(root, "notes/linked.md"));
  await symlink(outside, path.join(root, "notes/linked-directory"));
  await symlink(outside, path.join(root, "pages"));
  await symlink(path.join(outside, "missing.md"), path.join(root, "notes/dangling.md"));
  await expectReadOnly(sandbox, root, "Linked title", { status: "missing" });
  await put(root, "notes/real.md", markdown("Linked title", id));
  await expectReadOnly(sandbox, root, "Linked title", { status: "found", id });
});

test("excluded Logseq migration envelopes remain canonical title candidates", async (t) => {
  const { sandbox, root } = await fixture(t);
  for (const [bucket, sourceBucket, type] of [["notes", "pages", "note"], ["sessions", "journals", "session"]]) {
    const id = newId();
    await put(root, `${bucket}/logs/imported.md`, markdown(`Imported ${bucket}`, id,
      `type: ${type}\nsource: logseq-migration\nsource_path: ${sourceBucket}/logs/imported.md`));
    await expectReadOnly(sandbox, root, `Imported ${bucket}`, { status: "found", id });
  }
});

test("scan errors cannot produce partial success, ambiguity, or missing", async (t) => {
  const { sandbox, root } = await fixture(t);
  await put(root, "notes/first.md", markdown("Existing title", newId()));
  // A later bucket fails regardless of filesystem permissions or test-user privileges.
  await put(root, "preferences", "Not a directory");
  await expectReadOnly(sandbox, root, "Existing title", { status: "unopenable" });
  await expectReadOnly(sandbox, root, "Absent title", { status: "unopenable" });
  await put(root, "findings/duplicate.md", markdown("Existing title", newId()));
  await expectReadOnly(sandbox, root, "Existing title", { status: "unopenable" });
});
