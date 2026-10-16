import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { link, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_EXPANSION_MAX_BYTES,
  MAX_EXPANSION_MAX_BYTES,
  MIN_EXPANSION_MAX_BYTES,
  expandCanonicalMemoryDocument,
  hashMemoryDocumentContent,
  readCanonicalMemoryDocumentById,
  serializeExpansion,
} from "../dist/core/canonical/index.js";
import { expandMemoryDocument } from "../dist/app/local-memory/expansion.js";
import { expandServerMemoryDocument } from "../dist/app/server-memory/expansion.js";
import { initializeMemoryRoot } from "../dist/core/memory-root/index.js";

const id = "mem_81000000-0000-4000-8000-000000000001";
const missingId = "mem_81000000-0000-4000-8000-000000000002";
const header = `---\nid: ${id}\n---\n`;

async function fixture(t, body = "# Scope\nEvidence, but only in staging.\n", relative = "notes/evidence.md") {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-expand-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const content = header + body;
  const file = path.join(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
  return { root, file, content, options: { id, expectedContentHash: hashMemoryDocumentContent(content) } };
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, error => {
    assert.equal(error.code, code);
    return true;
  });
}

function verifyPacket(result, content, maxBytes = DEFAULT_EXPANSION_MAX_BYTES) {
  const lines = content.split(/(?<=\n)/u);
  assert.equal(result.version, 1);
  assert.equal(result.kind, "expansion");
  assert.equal(result.id, id);
  assert.equal(result.contentHash, hashMemoryDocumentContent(content));
  assert.equal(result.text, lines.slice(result.startLine - 1, result.endLine).join(""));
  assert.equal(result.totalLines, lines.length);
  assert.equal(result.partial, result.endLine < result.requestedEndLine);
  assert.equal(result.omittedLines, result.requestedEndLine - result.endLine);
  assert.equal(result.continuationLine, result.partial ? result.endLine + 1 : undefined);
  assert.equal(result.maxBytes, maxBytes);
  assert.equal(serializeExpansion(result), JSON.stringify(result) + "\n");
  assert.ok(Buffer.byteLength(serializeExpansion(result), "utf8") <= maxBytes);
  assert.equal(path.isAbsolute(result.filePath), false);
  assert.equal(Object.hasOwn(result, "root"), false);
}

test("expansion returns exact independent line evidence and leaves canonical files unchanged", async t => {
  const { root, file, content, options } = await fixture(t);
  const before = await readdir(path.join(root, "notes"));
  const result = await expandCanonicalMemoryDocument(root, { ...options, startLine: 5, endLine: 5 });
  verifyPacket(result, content);
  assert.equal(result.text, "Evidence, but only in staging.\n");
  assert.equal(result.scope, "lines");
  assert.equal(result.startLine, 5);
  assert.equal(result.endLine, 5);
  assert.equal(result.partial, false); // Complete requested scope, not a claim of whole-document context.
  assert.equal(await readFile(file, "utf8"), content);
  assert.deepEqual(await readdir(path.join(root, "notes")), before);
  assert.equal((await readdir(root)).includes(".jumpybrain"), false);
});

test("whole-document defaults and one-sided inclusive ranges preserve real source line numbering", async t => {
  const { root, content, options } = await fixture(t, "a\n\nb");
  for (const range of [{}, { startLine: 4 }, { endLine: 3 }, { startLine: 5, endLine: 5 }]) {
    const result = await expandCanonicalMemoryDocument(root, { ...options, ...range });
    verifyPacket(result, content);
    assert.equal(result.startLine, range.startLine ?? 1);
    assert.equal(result.endLine, range.endLine ?? 6);
  }
});

test("exact expansion preserves Unicode, escaping, CRLF, blank lines, and missing final newline", async t => {
  const { root, file, options } = await fixture(t);
  const content = `---\r\nid: ${id}\r\n---\r\n# 中文 😀\r\n\r\nquote: "雪"; slash: \\; tab: \t; emoji: 🦊`;
  await writeFile(file, content);
  const result = await expandCanonicalMemoryDocument(root, { ...options, expectedContentHash: hashMemoryDocumentContent(content), startLine: 4 });
  verifyPacket(result, content);
  assert.equal(result.totalLines, 6);
  assert.equal(result.text.endsWith("🦊"), true);
  assert.ok(result.text.includes("\r\n\r\n"));
});

test("aggregate cap includes escaped UTF-8 evidence, identity, omission markers, envelope, and LF", async t => {
  const body = Array.from({ length: 140 }, (_, i) => `${i}: \t"雪😀" \\ uncertainty remains\n`).join("");
  const { root, content, options } = await fixture(t, body);
  for (const maxBytes of [1024, 1025, 1280, 2048, 8192, 65536]) {
    const result = await expandCanonicalMemoryDocument(root, { ...options, startLine: 4, maxBytes });
    verifyPacket(result, content, maxBytes);
    assert.deepEqual(await expandCanonicalMemoryDocument(root, { ...options, startLine: 4, maxBytes }), result);
    if (result.partial) {
      const next = { ...result, text: content.split(/(?<=\n)/u).slice(3, result.endLine + 1).join(""),
        endLine: result.endLine + 1, omittedLines: result.omittedLines - 1, continuationLine: result.continuationLine + 1 };
      assert.ok(Buffer.byteLength(serializeExpansion(next), "utf8") > maxBytes, "largest whole-line prefix should be packed");
    }
  }
});

test("bounded continuation can reconstruct the requested section without gaps or changed citations", async t => {
  const body = "# A\n" + Array.from({ length: 80 }, (_, i) => `Fact ${i}; caveat ${i}.\n`).join("") + "# B\nUnrelated.\n";
  const { root, content, options } = await fixture(t, body);
  const first = await expandCanonicalMemoryDocument(root, { ...options, sectionLine: 20, maxBytes: 1024 });
  assert.equal(first.scope, "section");
  assert.equal(first.requestedStartLine, 4);
  assert.equal(first.requestedEndLine, 84);
  assert.equal(first.partial, true);
  let current = first;
  let text = first.text;
  while (current.continuationLine !== undefined) {
    const next = await expandCanonicalMemoryDocument(root, { ...options, startLine: current.continuationLine,
      endLine: first.requestedEndLine, maxBytes: 1024 });
    verifyPacket(next, content, 1024);
    assert.equal(next.startLine, current.endLine + 1);
    text += next.text;
    current = next;
  }
  assert.equal(text, body.slice(0, body.indexOf("# B")));
});

test("section expansion uses nested ATX/setext headings, ignores fences, and bounds preamble", async t => {
  const bodyLines = ["Preamble", "# A", "A qualifier", "## B", "B detail", "```md", "# Not a heading", "```", "B tail", "## C", "C detail", "Top", "===", "Top detail"];
  const { root, content, options } = await fixture(t, bodyLines.join("\n") + "\n");
  for (const [sectionLine, start, end] of [[4, 4, 4], [5, 5, 14], [8, 7, 12], [10, 7, 12], [13, 13, 14], [16, 15, 17]]) {
    const result = await expandCanonicalMemoryDocument(root, { ...options, sectionLine });
    verifyPacket(result, content);
    assert.equal(result.startLine, start);
    assert.equal(result.endLine, end);
  }
});

test("heading-free sections select only body context, not frontmatter", async t => {
  const { root, content, options } = await fixture(t, "No heading.\nStill qualified.\n");
  const result = await expandCanonicalMemoryDocument(root, { ...options, sectionLine: 5 });
  verifyPacket(result, content);
  assert.equal(result.startLine, 4);
  assert.equal(result.endLine, 5);
});

test("stale hashes require explicit refresh rather than returning shifted evidence", async t => {
  const { root, file, content, options } = await fixture(t);
  await writeFile(file, content.replace("# Scope", "New line\n# Scope"));
  await assert.rejects(expandCanonicalMemoryDocument(root, { ...options, startLine: 5, endLine: 5 }), error => {
    assert.equal(error.code, "precondition_failed");
    assert.match(error.message, /Refresh recall or re-read/);
    return true;
  });
  await rejectsCode(expandCanonicalMemoryDocument(root, { ...options, expectedContentHash: "sha256:" + "0".repeat(64) }), "precondition_failed");
});

test("invalid, missing, duplicate, and legacy ID-less documents are never guessed or stamped", async t => {
  const { root, content, options } = await fixture(t);
  await rejectsCode(expandCanonicalMemoryDocument(root, { ...options, id: "../notes/evidence.md" }), "invalid_id");
  await rejectsCode(expandCanonicalMemoryDocument(root, { ...options, id: missingId }), "missing_id");
  const legacy = "---\ntitle: Legacy\n---\nNo ID.\n";
  await writeFile(path.join(root, "notes/legacy.md"), legacy);
  await rejectsCode(expandCanonicalMemoryDocument(root, { ...options, id: missingId }), "missing_id");
  assert.equal(await readFile(path.join(root, "notes/legacy.md"), "utf8"), legacy);
  await mkdir(path.join(root, "pages"));
  await writeFile(path.join(root, "pages/duplicate.md"), content);
  await rejectsCode(expandCanonicalMemoryDocument(root, options), "duplicate_id");
});

test("range, precondition, and budget validation fails explicitly", async t => {
  const { root, options } = await fixture(t);
  for (const range of [
    { startLine: 0 }, { endLine: -1 }, { startLine: 1.5 }, { startLine: "4" }, { endLine: null },
    { startLine: Number.MAX_SAFE_INTEGER + 1 }, { sectionLine: NaN }, { endLine: Infinity },
    { startLine: 5, endLine: 4 }, { startLine: 6 }, { endLine: 6 }, { sectionLine: 1 },
    { sectionLine: 6 }, { sectionLine: 4, startLine: 4 }, { sectionLine: 4, endLine: 5 },
  ]) await rejectsCode(expandCanonicalMemoryDocument(root, { ...options, ...range }), "invalid_expansion");
  for (const maxBytes of [0, 1023, 65537, 1024.1, NaN, Infinity, "1024", null]) {
    await rejectsCode(expandCanonicalMemoryDocument(root, { ...options, maxBytes }), "invalid_budget");
  }
  for (const expectedContentHash of [undefined, ""]) {
    await rejectsCode(expandCanonicalMemoryDocument(root, { ...options, expectedContentHash }), "precondition_required");
  }
  for (const expectedContentHash of [null, 1, "sha256:stale", "SHA256:" + "0".repeat(64)]) {
    await rejectsCode(expandCanonicalMemoryDocument(root, { ...options, expectedContentHash }), "invalid_expansion");
  }
  await rejectsCode(expandCanonicalMemoryDocument(root, undefined), "invalid_expansion");
  assert.equal(MIN_EXPANSION_MAX_BYTES, 1024);
  assert.equal(MAX_EXPANSION_MAX_BYTES, 65536);
});

test("an indivisible oversized first line fails; a later oversized line remains an explicit continuation", async t => {
  const { root, options } = await fixture(t, "short\n" + "😀".repeat(20000) + "\nlast\n");
  await rejectsCode(expandCanonicalMemoryDocument(root, { ...options, startLine: 5, maxBytes: 1024 }), "line_too_large");
  await rejectsCode(expandCanonicalMemoryDocument(root, { ...options, startLine: 5, maxBytes: 65536 }), "line_too_large");
  const first = await expandCanonicalMemoryDocument(root, { ...options, startLine: 4, maxBytes: 1024 });
  assert.equal(first.text, "short\n");
  assert.equal(first.continuationLine, 5);
  assert.equal(first.partial, true);
});

test("large path metadata cannot overflow the minimum response envelope", async t => {
  const relative = "notes/" + Array.from({ length: 8 }, () => "p".repeat(100)).join("/") + "/evidence.md";
  const { root, options } = await fixture(t, "short\n", relative);
  await rejectsCode(expandCanonicalMemoryDocument(root, { ...options, startLine: 4, maxBytes: 1024 }), "budget_too_small");
});

test("unrequested huge frontmatter is neither echoed nor used as an implicit output budget", async t => {
  const { root, file, options } = await fixture(t);
  const content = `---\nid: ${id}\ntitle: "${"t".repeat(100000)}"\n---\nExact body.\n`;
  await writeFile(file, content);
  const result = await expandCanonicalMemoryDocument(root, { ...options, expectedContentHash: hashMemoryDocumentContent(content), startLine: 5, maxBytes: 1024 });
  verifyPacket(result, content, 1024);
  assert.equal(result.text, "Exact body.\n");
  assert.equal(Object.hasOwn(result, "frontmatter"), false);
});

test("invalid UTF-8 cannot masquerade as exact source evidence", async t => {
  const { root, file, options } = await fixture(t);
  const bytes = Buffer.concat([Buffer.from(header), Buffer.from([0xff, 0xfe, 0x0a])]);
  await writeFile(file, bytes);
  await rejectsCode(expandCanonicalMemoryDocument(root, { ...options, expectedContentHash: hashMemoryDocumentContent(bytes) }), "invalid_utf8");
});

test("symlink files/directories/bucket entrypoints and hardlinked targets do not expose external evidence", async t => {
  const { root, file, content, options } = await fixture(t);
  const external = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-expand-outside-"));
  t.after(() => rm(external, { recursive: true, force: true }));
  const outside = path.join(external, "outside.md");
  await writeFile(outside, content);
  await rm(file);
  await symlink(outside, file);
  await rejectsCode(expandCanonicalMemoryDocument(root, options), "missing_id");
  await rm(file);
  await symlink(external, path.join(root, "notes/nested"));
  await rejectsCode(expandCanonicalMemoryDocument(root, options), "missing_id");
  await rm(path.join(root, "notes"), { recursive: true });
  await symlink(external, path.join(root, "notes"));
  await rejectsCode(expandCanonicalMemoryDocument(root, options), "missing_id");
  await rm(path.join(root, "notes"));
  await mkdir(path.join(root, "notes"));
  await link(outside, file);
  await rejectsCode(expandCanonicalMemoryDocument(root, options), "precondition_failed");
  assert.equal(await readFile(outside, "utf8"), content);
});

test("local and server wrappers return identical bounded packets at the editor root without index/state writes", async t => {
  const { root, file, content, options } = await fixture(t, "# Scope\n" + "evidence with qualification\n".repeat(100));
  await initializeMemoryRoot(root);
  const configFile = path.join(root, "jumpybrain.json");
  const config = JSON.parse(await readFile(configFile, "utf8"));
  await mkdir(path.join(root, "retrieval-only"));
  await writeFile(configFile, JSON.stringify({ ...config, indexRoot: "retrieval-only" }));
  const filesBefore = await readdir(root, { recursive: true });
  const local = await expandMemoryDocument(root, { ...options, sectionLine: 5, maxBytes: 1024 });
  const remote = await expandServerMemoryDocument({ root, ...options, sectionLine: 5, maxBytes: 1024 });
  assert.deepEqual(remote, local);
  verifyPacket(remote, content, 1024);
  assert.ok(!serializeExpansion(remote).includes(root));
  assert.equal(await readFile(file, "utf8"), content);
  assert.deepEqual(await readdir(root, { recursive: true }), filesBefore);
  assert.equal((await readCanonicalMemoryDocumentById(root, id)).content, content, "whole-document editing reads remain unchanged");
});

for (const change of ["symlink", "directory-symlink", "inode-replacement", "changed-id"]) {
  test(`guarded expansion rejects ${change} introduced between scan/stat and source open`, async t => {
    const { root, file, content, options } = await fixture(t);
    const open = fs.open;
    const replacement = path.join(root, "replacement.md");
    await writeFile(replacement, content);
    let fired = false;
    t.mock.method(fs, "open", async (...args) => {
      if (!fired && path.basename(String(args[0])) === "evidence.md") {
        fired = true;
        if (change === "symlink") {
          await fs.unlink(file);
          await fs.symlink(replacement, file);
        } else if (change === "directory-symlink") {
          await fs.rename(path.join(root, "notes"), path.join(root, "moved"));
          await fs.symlink(path.join(root, "moved"), path.join(root, "notes"));
        } else if (change === "inode-replacement") {
          await fs.rename(replacement, file);
        } else {
          await writeFile(file, content.replace(id, missingId));
        }
      }
      return open(...args);
    });
    syncBuiltinESMExports();
    t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
    await rejectsCode(expandCanonicalMemoryDocument(root, options), "precondition_failed");
    assert.equal(fired, true);
  });
}
