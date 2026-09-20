import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getDreamWindow } from "../dist/runtime/index.js";
import { REMOTE_DREAM_WORKFLOW } from "../dist/app/dream/index.js";

const now = new Date("2024-03-01T00:00:00Z");
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-window-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function doc(root, file, metadata = {}, body = "Evidence", mtime = now) {
  const absolute = path.join(root, file);
  await mkdir(path.dirname(absolute), { recursive: true });
  const content = ["---", ...Object.entries(metadata).map(([k, v]) => `${k}: ${JSON.stringify(v)}`), "---", body, ""].join("\n");
  await writeFile(absolute, content);
  await utimes(absolute, mtime, mtime);
  return content;
}
async function snapshot(root) {
  const files = (await readdir(root, { recursive: true })).sort();
  return Promise.all(files.map(async (file) => {
    const info = await stat(path.join(root, file));
    return { file, mtime: info.mtimeMs, ...(info.isFile() ? { content: await readFile(path.join(root, file), "utf8") } : {}) };
  }));
}

test("stateless windows include exactly T-1 through T-3, missing IDs, and leave all files/state untouched", async (t) => {
  const root = await fixture(t);
  for (const date of ["2024-02-26", "2024-02-27", "2024-02-28", "2024-02-29", "2024-03-01"])
    await doc(root, `sessions/${date}.md`, { date });
  await mkdir(path.join(root, ".jumpybrain/dream"), { recursive: true });
  await writeFile(path.join(root, ".jumpybrain/dream/state.json"), '{"openBatch":{"batchId":"not-real"},"lastCompletedCursor":{"mtimeMs":9999999999999}}');
  const before = await snapshot(root);
  const options = { root, request: { from: "t-1d", days: 3 }, now };
  const first = await getDreamWindow(options);
  assert.deepEqual(first, await getDreamWindow(options));
  assert.deepEqual(await snapshot(root), before);
  assert.equal(first.root, await realpath(root));
  assert.equal(first.target, "local");
  assert.deepEqual(first.window, { from: "2024-02-27", to: "2024-02-29", timezone: "UTC", dateBasis: "evidence" });
  assert.deepEqual(first.files.map((f) => f.date), ["2024-02-27", "2024-02-28", "2024-02-29"]);
  assert.ok(first.files.every((f) => f.id === undefined));
  assert.ok(first.warnings.some((w) => /missing document ID/.test(w)));
  assert.equal(first.totalFiles, 3);
  assert.equal(first.hasMore, false);
  assert.equal(first.nextOffset, undefined);
  assert.equal("batchId" in first, false);
  await writeFile(path.join(root, ".jumpybrain/dream/state.json"), "corrupt legacy state");
  assert.deepEqual(await getDreamWindow(options), first);
});

test("import mtimes do not replace historical evidence; modified mode is explicit", async (t) => {
  const root = await fixture(t);
  await doc(root, "sessions/2022_04_21.md", { created_at: "2024-03-01T00:00:00Z", updated_at: "2024-03-01" });
  await doc(root, "sessions/2022-04-22.md", { date: "2021-07-01", created_at: "2024-03-01" });
  await doc(root, "notes/created.md", { createdAt: "2020-02-29" });
  await doc(root, "notes/invalid.md", { date: "2023-02-29", created_at: "yesterday", updated_at: "1990-01-01" });
  const recent = await getDreamWindow({ root, now });
  assert.deepEqual(recent.files.map((f) => f.file), ["notes/invalid.md"]);
  assert.equal(recent.files[0].dateBasis, "mtime");
  assert.ok(recent.warnings.some((w) => /invalid frontmatter date/.test(w)));
  assert.ok(recent.warnings.some((w) => /filesystem mtime/.test(w)));
  const historic = await getDreamWindow({ root, now, request: { from: "2022-04-21", days: 1 } });
  assert.deepEqual(historic.files.map((f) => f.file), ["sessions/2022_04_21.md"]);
  assert.equal(historic.files[0].dateBasis, "filename");
  const modified = await getDreamWindow({ root, now, request: { dateBasis: "modified" } });
  assert.equal(modified.totalFiles, 4);
  assert.ok(modified.files.every((f) => f.date === "2024-03-01" && f.dateBasis === "modified"));
  assert.equal((await readdir(root)).includes(".jumpybrain"), false);
});

test("only strict boolean dream outputs are excluded, independent of directory", async (t) => {
  const root = await fixture(t);
  await doc(root, "notes/generated.md", { date: "2024-02-29", dream: true });
  await doc(root, "pages/generated.md", { date: "2024-02-29", dream: true });
  await doc(root, "pages/human.md", { date: "2024-02-29" });
  await doc(root, "notes/false.md", { date: "2024-02-29", dream: false });
  await doc(root, "notes/string-false.md", { date: "2024-02-29", dream: "false" });
  await doc(root, "notes/string-true.md", { date: "2024-02-29", dream: "true" });
  await doc(root, "notes/navigation.md", { date: "2024-02-29" }, "[[dream]]");
  await doc(root, "scratch/ignored.md", { date: "2024-02-29" });
  await doc(root, ".jumpybrain/notes/ignored.md", { date: "2024-02-29" });
  const result = await getDreamWindow({ root, now });
  assert.equal(result.totalFiles, 5);
  assert.equal(result.files.some((f) => /generated|ignored/.test(f.file)), false);
  assert.ok(result.files.some((f) => f.file === "pages/human.md"));
});

test("bounded windows provide deterministic offsets, original hashes, and UTF-8-safe truncation", async (t) => {
  const root = await fixture(t);
  const full = await doc(root, "notes/a.md", { date: "2024-02-28", id: "mem_a" }, "😀é日".repeat(100));
  await doc(root, "notes/b.md", { date: "2024-02-28" }, "B".repeat(1000));
  await doc(root, "notes/c.md", { date: "2024-02-29" });
  const request = { maxFiles: 1, bytesPerFile: Buffer.byteLength(full.split("😀")[0]) + 2, maxTotalBytes: 1000 };
  const one = await getDreamWindow({ root, now, request });
  assert.equal(one.files[0].file, "notes/a.md");
  assert.equal(one.files[0].id, "mem_a");
  assert.equal(one.files[0].contentHash, `sha256:${createHash("sha256").update(full).digest("hex")}`);
  assert.equal(one.files[0].content.includes("�"), false);
  assert.equal(one.files[0].truncated, true);
  assert.ok(one.files[0].returnedBytes <= request.bytesPerFile);
  assert.equal(one.nextOffset, 1);
  assert.equal(one.hasMore, true);
  const two = await getDreamWindow({ root, now, request: { ...request, from: one.window.to, offset: one.nextOffset } });
  assert.equal(two.files[0].file, "notes/b.md");
  assert.equal(two.nextOffset, 2);
  const three = await getDreamWindow({ root, now, request: { ...request, offset: two.nextOffset } });
  assert.equal(three.files[0].file, "notes/c.md");
  assert.equal(three.hasMore, false);
  assert.equal(three.nextOffset, undefined);
  const byteLimited = await getDreamWindow({ root, now, request: { bytesPerFile: 100, maxTotalBytes: 100 } });
  assert.ok(byteLimited.files.reduce((sum, f) => sum + Buffer.byteLength(f.content), 0) <= 100);
  assert.ok(byteLimited.warnings.some((w) => /truncated/.test(w)));
  assert.equal(byteLimited.hasMore, true);
  assert.equal(byteLimited.nextOffset, 1);
  const overflow = await getDreamWindow({ root, now, request: { offset: 99 } });
  assert.equal(overflow.totalFiles, 3);
  assert.deepEqual(overflow.files, []);
  assert.equal(overflow.hasMore, false);
  assert.ok(overflow.warnings.some((w) => /beyond/.test(w)));
});

test("empty/sparse roots and historical windows are valid without initialization or support writes", async (t) => {
  const root = await fixture(t);
  const empty = await getDreamWindow({ root, now });
  assert.deepEqual(empty.files, []);
  assert.equal(empty.totalFiles, 0);
  assert.equal(empty.hasMore, false);
  assert.deepEqual(await readdir(root), []);
  await doc(root, "notes/old.md", { date: "2000-02-29" });
  assert.deepEqual((await getDreamWindow({ root, now })).files, []);
  assert.equal((await getDreamWindow({ root, now, request: { from: "2000-02-29", days: 1 } })).totalFiles, 1);
});

test("configured remote windows keep parity and do not expose the server root or write support state", async (t) => {
  const root = await fixture(t);
  await doc(root, "notes/a.md", { date: "2024-02-29" });
  const before = await snapshot(root);
  const local = await getDreamWindow({ root, now });
  const remote = await getDreamWindow({ root, now, config: REMOTE_DREAM_WORKFLOW });
  assert.deepEqual(remote.window, local.window);
  assert.equal(remote.target, "remote");
  assert.equal(remote.memory, "all");
  assert.equal(remote.root, "remote:all");
  assert.equal(remote.files[0].root, "remote:all");
  assert.equal(remote.files[0].contentHash, local.files[0].contentHash);
  assert.equal(JSON.stringify(remote).includes(await realpath(root)), false);
  assert.deepEqual(await snapshot(root), before);
});
