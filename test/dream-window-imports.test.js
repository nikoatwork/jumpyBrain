import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getDreamWindow, REMOTE_DREAM_WORKFLOW } from "../dist/app/dream/index.js";
import {
  boundDreamWindowWarnings, DREAM_WINDOW_WARNING_BYTES, DREAM_WINDOW_WARNING_COUNT,
  DREAM_WINDOW_WARNING_STRING_BYTES, DREAM_WINDOW_WARNINGS, dreamWindowDateConfidence,
} from "../dist/core/dream/index.js";

const now = new Date("2024-03-01T12:00:00Z");
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpy-window-imports-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function doc(root, file, metadata, body = "Fictional old source; its historical date is unknown.", mtime = now) {
  const absolute = path.join(root, file);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, ["---", ...Object.entries(metadata).map(([k, v]) => `${k}: ${JSON.stringify(v)}`), "---", body].join("\n"));
  await utimes(absolute, mtime, mtime);
}
async function snapshot(root) {
  return Promise.all((await readdir(root, { recursive: true })).sort().map(async (file) => {
    const info = await stat(path.join(root, file));
    return [file, info.mtimeMs, info.isFile() ? createHash("sha256").update(await readFile(path.join(root, file))).digest("hex") : null];
  }));
}

test("old undated imports crowd bounded evidence without fabricated dates; explicit pagination and modified review retain source bytes", async (t) => {
  const root = await fixture(t);
  for (let i = 0; i < 8; i++) await doc(root, `notes/import-${i}.md`, { created_at: "2024-03-01" });
  await doc(root, "notes/z-recent.md", { date: "2024-03-01", id: "mem_recent" }, "Current fictional evidence.");
  await doc(root, "notes/2020-01-01-ambiguous.md", { date: "2023-02-29", created_at: "invalid" });
  await doc(root, "notes/missing.md", {});
  await doc(root, "sessions/2020_01_02.md", { created_at: "2024-03-01" });
  const before = await snapshot(root);
  const request = { from: "2024-03-01", days: 1, maxFiles: 2, bytesPerFile: 64 };
  const first = await getDreamWindow({ root, now, request });
  assert.equal(first.totalFiles, 11);
  assert.equal(first.diagnostics.scannedFiles, 12);
  assert.equal(first.diagnostics.fallbackFiles, 10);
  assert.equal(first.diagnostics.outsideWindowFallbackFiles, 0);
  assert.equal(first.diagnostics.outsideWindowDateDiagnosticFiles, 1);
  assert.equal(first.files[0].dateBasis, "mtime", "ordinary filename is not promoted to an event date");
  assert.equal(first.files[0].date, "2024-03-01");
  assert.ok(first.files.every((f) => f.dateConfidence === "fallback"));
  assert.match(first.warnings.join("\n"), /invalid frontmatter date/);
  assert.match(first.warnings.join("\n"), /invalid created_at/);
  assert.match(first.instructions.join("\n"), /dateBasis modified.*from.*days 1/);
  const seen = [...first.files];
  let page = first;
  while (page.hasMore) {
    page = await getDreamWindow({ root, now, request: { ...request, from: first.window.to, offset: page.nextOffset } });
    seen.push(...page.files);
  }
  assert.equal(seen.length, 11);
  assert.equal(new Set(seen.map((f) => f.file)).size, 11);
  assert.equal(seen.at(-1).file, "notes/z-recent.md");
  assert.equal(seen.at(-1).dateConfidence, "declared");
  assert.equal(page.hasMore, false);
  assert.match(page.warnings.join("\n"), /does not prove complete review/);
  assert.match(page.warnings.join("\n"), /truncated content; pagination does not retrieve/);
  const historical = await getDreamWindow({ root, request: { from: "2020-01-02", days: 1 } });
  assert.equal(historical.files[0].dateConfidence, "filename");
  const modified = await getDreamWindow({ root, request: { from: "2024-03-01", days: 1, dateBasis: "modified", maxFiles: 30 } });
  assert.equal(modified.totalFiles, 12);
  assert.ok(modified.files.every((f) => f.dateConfidence === "modified" && f.date === "2024-03-01"));
  assert.equal(modified.diagnostics.fallbackFiles, 0, "modified is not an audit of evidence metadata");
  assert.deepEqual(await snapshot(root), before);
});

test("outside-window diagnostic floods cannot displace selected issues or disclose unreturned paths", async (t) => {
  const root = await fixture(t);
  for (let i = 0; i < 120; i++) await doc(root, `notes/private-outside-${i}.md`, { date: "impossible", created_at: "2000-01-01" });
  await doc(root, "notes/selected.md", { date: "invalid", created_at: "2024-03-01" }, "x".repeat(200));
  await doc(root, "notes/unselected-secret.md", { created_at: "2024-03-01" });
  const packet = await getDreamWindow({ root, config: REMOTE_DREAM_WORKFLOW, request: { from: "2024-03-01", days: 1, maxFiles: 1, bytesPerFile: 16 } });
  assert.deepEqual(packet.files.map((f) => f.file), ["notes/selected.md"]);
  assert.equal(packet.diagnostics.scannedFiles, 122);
  assert.equal(packet.diagnostics.fallbackFiles, 122);
  assert.equal(packet.diagnostics.outsideWindowFallbackFiles, 120);
  assert.equal(packet.diagnostics.dateDiagnosticFiles, 122);
  assert.equal(packet.diagnostics.outsideWindowDateDiagnosticFiles, 120);
  assert.equal(packet.diagnostics.truncatedFiles, 1);
  assert.equal(packet.diagnostics.omittedWarnings, 0, "aggregation is not budget omission");
  assert.match(packet.warnings.join("\n"), /selected.md: invalid frontmatter date/);
  assert.match(packet.warnings.join("\n"), /selected.md: content truncated/);
  assert.match(packet.warnings.join("\n"), /selected.md: missing document ID/);
  const serialized = JSON.stringify(packet);
  assert.doesNotMatch(serialized, /private-outside|unselected-secret/);
  assert.ok(!serialized.includes(root));
  assert.ok(packet.warnings.length < 20);
  assert.ok(Buffer.byteLength(serialized) < 10000);
  const beyond = await getDreamWindow({ root, request: { from: "2024-03-01", days: 1, offset: 10 } });
  assert.deepEqual(beyond.files, []);
  assert.doesNotMatch(JSON.stringify(beyond.warnings), /notes\//);
  assert.equal(beyond.diagnostics.truncatedFiles, 0);
});

test("selected warning floods are bounded without hiding aggregate content omissions", async (t) => {
  const root = await fixture(t);
  const directory = `notes/${"a".repeat(180)}/${"b".repeat(180)}/${"c".repeat(180)}`;
  for (let i = 0; i < 30; i++) await doc(root, `${directory}/${i}-${"d".repeat(100)}.md`, { date: "invalid", created_at: "invalid", createdAt: "invalid" });
  const packet = await getDreamWindow({ root, request: { from: "2024-03-01", days: 1, maxFiles: 30, bytesPerFile: 1, maxTotalBytes: 30 } });
  assert.equal(packet.files.length, 30);
  assert.equal(packet.hasMore, false);
  assert.equal(packet.diagnostics.truncatedFiles, 30);
  assert.equal(packet.diagnostics.fallbackFiles, 30);
  assert.ok(packet.files.every((file) => file.truncated && file.dateConfidence === "fallback"));
  assert.match(packet.warnings[0], /^30 returned file\(s\) have truncated content/);
  assert.ok(packet.diagnostics.omittedWarnings > 0);
  const totalMessages = 1 + DREAM_WINDOW_WARNINGS.length + 30 * 6 + 1;
  assert.equal(packet.diagnostics.omittedWarnings, totalMessages - (packet.warnings.length - 1));
  assert.ok(Buffer.byteLength(JSON.stringify(packet.warnings)) <= DREAM_WINDOW_WARNING_BYTES);
  assert.ok(packet.warnings.every((w) => Buffer.byteLength(JSON.stringify(w)) <= DREAM_WINDOW_WARNING_STRING_BYTES));
  assert.ok(Buffer.byteLength(JSON.stringify(packet)) < 128 * 1024);
});

test("serialized diagnostic caps account for JSON escaping, UTF-8, omitted messages and clipped strings", () => {
  const input = Array.from({ length: 200 }, (_, i) => `selected-${i}: ${'😀\\\"\n'.repeat(2000)}`);
  const result = boundDreamWindowWarnings(input);
  assert.ok(result.warnings.length <= DREAM_WINDOW_WARNING_COUNT);
  assert.ok(Buffer.byteLength(JSON.stringify(result.warnings)) <= DREAM_WINDOW_WARNING_BYTES);
  assert.ok(result.warnings.every((w) => Buffer.byteLength(JSON.stringify(w)) <= DREAM_WINDOW_WARNING_STRING_BYTES));
  assert.ok(result.warnings.every((w) => !w.includes("�")));
  assert.ok(result.omittedWarnings > 0);
  assert.equal(result.truncatedWarnings, result.warnings.length - 1);
  assert.equal(result.omittedWarnings + result.truncatedWarnings, input.length);
  assert.match(result.warnings[0], /^selected-0:/);
  assert.match(result.warnings.at(-1), new RegExp(`^${result.omittedWarnings} diagnostic message\\(s\\) omitted; ${result.truncatedWarnings} returned`));
  const small = boundDreamWindowWarnings(Array(200).fill("small"));
  assert.equal(small.warnings.length, 100);
  assert.equal(small.omittedWarnings, 101);
  assert.equal(small.truncatedWarnings, 0);
  assert.deepEqual(boundDreamWindowWarnings(["ordinary"]), { warnings: ["ordinary"], omittedWarnings: 0, truncatedWarnings: 0 });
  assert.deepEqual(["date", "filename", "created_at", "createdAt", "mtime", "modified"].map(dreamWindowDateConfidence), ["declared", "filename", "fallback", "fallback", "fallback", "modified"]);
});
