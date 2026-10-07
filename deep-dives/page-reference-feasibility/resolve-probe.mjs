/**
 * Disposable canonical-title feasibility probe; NOT a production resolver/API.
 * Run: node deep-dives/page-reference-feasibility/resolve-probe.mjs
 * Uses existing dist only. No CLI root, memory tools, index, server, or browser.
 * All fixture edits/deletes are confined to a newly created OS temporary tree.
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { cpus, tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  listCanonicalMemoryMarkdownFiles,
  readCanonicalMemoryDocumentById,
  readMarkdownDocument,
  resolveMemoryRoot,
} from "../../dist/core/canonical/index.js";

// PROTOTYPE ONLY: copied from private normalizedDocumentTitle in
// src/core/canonical/markdown-store.ts. Production MUST share the core helper
// with rename policy, not retain this duplicated normalization implementation.
const titleKey = (value) => typeof value === "string"
  ? value.normalize("NFKC").trim().toLowerCase().normalize("NFC") : "";

async function resolveFreshTitle(memoryRoot, title) {
  const key = titleKey(title);
  if (!key) return { status: "missing" };
  try {
    const root = await resolveMemoryRoot(memoryRoot);
    const matches = [];
    for (const file of await listCanonicalMemoryMarkdownFiles(root)) {
      const document = await readMarkdownDocument(root, file);
      // Count ALL matching titles, including ID-less/malformed-ID files.
      if (titleKey(document.frontmatter.title) === key) matches.push(document);
    }
    if (!matches.length) return { status: "missing" };
    if (matches.length > 1) return { status: "ambiguous" };
    const match = matches[0];
    const id = match.frontmatter.id;
    if (typeof id !== "string") return { status: "unopenable" };
    // Actual core read delegates to findCanonicalMemoryDocumentById:
    // validates mem_<uuid> and scans the SAME root for duplicate IDs globally.
    // No copied ID regex, filename/heading/path/fuzzy/index fallback.
    const opened = await readCanonicalMemoryDocumentById(root, id);
    if (opened.file !== match.relativePath || opened.frontmatter.id !== id ||
        titleKey(opened.title) !== key) return { status: "unopenable" };
    return { status: "found", id };
  } catch {
    // Includes invalid/duplicate ID, disappearing files, and unreadable scans.
    // Never report a partial scan as a successful or missing resolution.
    return { status: "unopenable" };
  }
}

assert.equal(process.argv.length, 2, "No arguments accepted; temporary roots only");
const sandbox = await mkdtemp(path.join(tmpdir(), "jb-title-probe-"));
let passed = 0;
const id = () => `mem_${randomUUID()}`;
function inside(relative) {
  const absolute = path.resolve(sandbox, relative);
  assert.ok(absolute.startsWith(sandbox + path.sep), "Fixture path must stay in fresh sandbox");
  return absolute;
}
async function put(relative, content) {
  const absolute = inside(relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content);
}
function markdown(title, documentId, bytes) {
  const text = `---\n${documentId === undefined ? "" : `id: ${documentId}\n`}title: ${JSON.stringify(title)}\ntype: note\n---\n# Body heading, not a title\n`;
  if (bytes === undefined) return text;
  assert.ok(Buffer.byteLength(text) <= bytes);
  return text + "x".repeat(bytes - Buffer.byteLength(text));
}
async function snapshot(root = sandbox) {
  const entries = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      assert.ok(!entry.isSymbolicLink(), "Probe fixtures cannot redirect outside sandbox");
      if (entry.isDirectory()) {
        entries.push([path.relative(root, file), "directory"]);
        await walk(file);
      } else {
        entries.push([path.relative(root, file), createHash("sha256").update(await readFile(file)).digest("hex")]);
      }
    }
  }
  await walk(root);
  return entries.sort(([a], [b]) => a.localeCompare(b));
}
async function expect(label, root, title, expected) {
  const before = await snapshot();
  assert.deepEqual(await resolveFreshTitle(root, title), expected, label);
  assert.deepEqual(await snapshot(), before, `${label}: lookup must not mutate fixture bytes or tree`);
  passed++;
}

let timing;
try {
  const root = inside("named-editor-memory");
  const retrievalRoot = inside("different-named-retrieval-root");
  const primary = id();
  await put("named-editor-memory/notes/filename-not-title.md", markdown("Café", primary));
  await expect("NFKC + trim + case + NFC", root, "  ＣＡＦＥ\u0301  ", { status: "found", id: primary });
  await expect("filename is not title", root, "filename-not-title", { status: "missing" });
  await expect("path does not resolve", root, "notes/filename-not-title.md", { status: "missing" });
  await expect("heading is not title", root, "Body heading, not a title", { status: "missing" });
  await expect("no fuzzy prefix", root, "Caf", { status: "missing" });
  await expect("blank title", root, "  ", { status: "missing" });

  await put("named-editor-memory/pages/case-duplicate.md", markdown("CAFÉ", id()));
  await expect("case-equivalent duplicate title", root, "Café", { status: "ambiguous" });
  await rm(inside("named-editor-memory/pages/case-duplicate.md"));
  await put("named-editor-memory/pages/unicode-duplicate.md", markdown("ＣＡＦＥ\u0301", id()));
  await expect("Unicode-equivalent duplicate title", root, "café", { status: "ambiguous" });
  await rm(inside("named-editor-memory/pages/unicode-duplicate.md"));
  await put("named-editor-memory/pages/idless-duplicate.md", markdown(" café "));
  await expect("ID-less duplicate still counts", root, "Café", { status: "ambiguous" });
  await rm(inside("named-editor-memory/pages/idless-duplicate.md"));
  await put("named-editor-memory/pages/malformed-title-duplicate.md", markdown("CAFÉ", "bad"));
  await expect("malformed-ID title duplicate still counts", root, "Café", { status: "ambiguous" });
  await rm(inside("named-editor-memory/pages/malformed-title-duplicate.md"));

  await put("named-editor-memory/notes/idless.md", markdown("ID-less"));
  await expect("unique title without ID", root, "ID-less", { status: "unopenable" });
  await put("named-editor-memory/notes/invalid.md", markdown("Invalid ID", "mem_not-a-uuid"));
  await expect("malformed ID rejected by real core read", root, "Invalid ID", { status: "unopenable" });
  await put("named-editor-memory/notes/numeric.md", markdown("Numeric ID", 123));
  await expect("non-string ID", root, "Numeric ID", { status: "unopenable" });
  await put("named-editor-memory/decisions/duplicate-id.md", markdown("Different title same ID", primary));
  await expect("ID duplicate with different title and bucket", root, "Café", { status: "unopenable" });
  await rm(inside("named-editor-memory/decisions/duplicate-id.md"));

  const retrievalId = id();
  await put("different-named-retrieval-root/notes/only.md", markdown("Retrieval only", retrievalId));
  await put("different-named-retrieval-root/notes/collision.md", markdown("Café", primary));
  await expect("other retrieval root does not create ambiguity", root, "Café", { status: "found", id: primary });
  await expect("retrieval-only title is absent from memory root", root, "Retrieval only", { status: "missing" });
  await expect("control: retrieval root fixture exists", retrievalRoot, "Retrieval only", { status: "found", id: retrievalId });

  await put("named-editor-memory/notes/filename-not-title.md", markdown("Fresh unindexed title", primary));
  await expect("newly edited title resolves with no index", root, "Fresh unindexed title", { status: "found", id: primary });
  await expect("renamed old title missing", root, "Café", { status: "missing" });
  await rm(inside("named-editor-memory/notes/filename-not-title.md"));
  await expect("deleted title missing", root, "Fresh unindexed title", { status: "missing" });
  await put("named-editor-memory/unbucketed.md", markdown("Not canonical", id()));
  await expect("only canonical buckets", root, "Not canonical", { status: "missing" });
  await put("broken-memory/notes", "Not a directory");
  await expect("scan I/O error is unopenable, not missing", inside("broken-memory"), "anything", { status: "unopenable" });
  await expect("nonexistent root is unopenable", inside("nonexistent"), "anything", { status: "unopenable" });

  const benchmarkRoot = inside("benchmark-memory");
  const benchmarkIds = [];
  for (let i = 0; i < 1000; i++) {
    benchmarkIds.push(id());
    await put(`benchmark-memory/notes/doc-${String(i).padStart(4, "0")}.md`, markdown(`Synthetic title ${i}`, benchmarkIds[i], 1024));
  }
  const beforeBenchmark = await snapshot();
  const samples = [];
  for (let run = 0; run < 5; run++) {
    const start = performance.now();
    const result = await resolveFreshTitle(benchmarkRoot, "Synthetic title 999");
    samples.push(performance.now() - start);
    assert.deepEqual(result, { status: "found", id: benchmarkIds[999] });
  }
  assert.deepEqual(await snapshot(), beforeBenchmark, "Five benchmark reads must not mutate fixtures");
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (p) => sorted[Math.ceil(p * sorted.length) - 1].toFixed(1);
  timing = `1000 x 1024-byte files, 5 successful fresh lookups (title scan + core ID scan/read): p50=${percentile(0.50)}ms p95=${percentile(0.95)}ms; samples=${samples.map((ms) => ms.toFixed(1)).join(",")}ms`;
} finally {
  await rm(sandbox, { recursive: true, force: true });
}
console.log(`PASS ${passed} semantic/safety cases + 5 benchmark assertions; read-only snapshots unchanged; temp tree cleaned.`);
console.log(timing);
console.log(`Synthetic, cache-warm local filesystem (fixture creation/snapshots prime cache), nearest-rank p95=max of only 5; ${process.platform}/${process.arch}, ${cpus()[0]?.model}, ${process.version}. Not cold-cache/production/concurrency latency.`);
console.log("BLOCKERS: production must share normalization; current HTTP routes lack authenticated exact-title lookup (src/adapters/http-protocol.ts, http-server/routes.ts). No fake route or guarded UI integration tested. Multi-scan lookup is not atomic against external edits; server-root policy/auth/race handling remain integration work.");
