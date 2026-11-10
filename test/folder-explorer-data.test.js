import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listServerMemoryFiles, readServerMemoryDocument } from "../dist/app/server-memory/index.js";
import { routeRequest } from "../dist/adapters/http-server/routes.js";

const id = n => `mem_81000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const headers = { Authorization: "Bearer explorer-test" };
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jb-explorer-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function note(root, file, metadata = {}) {
  const destination = path.join(root, file);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, ["---", ...Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`), "---", "Private explorer body", ""].join("\n"));
  return destination;
}
async function serve(t, root) {
  const server = createServer((request, response) => {
    routeRequest({ request, response, root, apiKeys: ["explorer-test"], logger: { info() {}, warn() {}, error() {} },
      enqueueWrite() { throw new Error("Explorer must not write"); },
      indexRunner: { indexNow() { throw new Error("Explorer must not index"); } },
    }).catch(() => { response.statusCode = 599; response.end("Unhandled failure"); });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}/memories/all/files`;
}

test("explorer lists all nested canonical files without an index, body disclosure or writes", async t => {
  const root = await fixture(t);
  for (let n = 1; n <= 110; n++) await note(root, `notes/projects/deep/${n}.md`, { id: id(n), title: `Note ${n}`, attention_at: null });
  await note(root, "pages/current/topic.md", { id: id(111), title: "Current topic" });
  await note(root, "notes/other/1.md", { id: id(112), title: "Same filename" });
  const file = path.join(root, "notes/projects/deep/1.md"), before = await stat(file), bytes = await readFile(file);
  const packet = await listServerMemoryFiles({ root });
  assert.equal(packet.files.length, 112, "no overview/attention cap");
  assert.deepEqual(Object.keys(packet), ["files"]);
  assert.equal(JSON.stringify(packet).includes(root), false);
  assert.equal(JSON.stringify(packet).includes("Private explorer body"), false);
  const { updatedAt, ...listed } = packet.files.find(row => row.file === "notes/projects/deep/1.md");
  assert.deepEqual(listed, { id: id(1), file: "notes/projects/deep/1.md", title: "Note 1" });
  assert.equal(updatedAt, before.mtime.toISOString(), "undated notes fall back to mtime for edit order");
  assert.equal((await readServerMemoryDocument({ root, id: id(1) })).file, "notes/projects/deep/1.md");
  assert.deepEqual(await readFile(file), bytes);
  assert.equal((await stat(file)).mtimeMs, before.mtimeMs);
  assert.deepEqual((await readdir(root)).sort(), ["notes", "pages"]);
  await note(root, "notes/other/1.md", { id: id(112), title: "External rename" });
  await rm(file);
  const refreshed = await listServerMemoryFiles({ root });
  assert.equal(refreshed.files.length, 111);
  assert.equal(refreshed.files.find(row => row.id === id(112)).title, "External rename");
});

test("explorer preserves unopenable files and disables duplicate IDs across hidden and visible files", async t => {
  const root = await fixture(t);
  await note(root, "notes/no-id.md", { title: "No ID" });
  await note(root, "notes/invalid.md", { id: "invalid" });
  await note(root, "notes/duplicate.md", { id: id(1) });
  await note(root, "sessions/duplicate.md", { id: id(1) });
  await note(root, "notes/visible.md", { id: id(2) });
  await note(root, "notes/.hidden.md", { id: id(2) });
  await note(root, "notes/valid.md", { id: id(3), title: "Openable" });
  for (const file of ["README.md", "scratch/private.md", ".jumpybrain/private.md", "notes/.private/note.md"]) await note(root, file, { id: id(4) });
  await symlink(path.join(root, "notes/valid.md"), path.join(root, "notes/link.md"));
  const { files } = await listServerMemoryFiles({ root });
  assert.equal(files.length, 6);
  assert.deepEqual(files.filter(row => row.id).map(row => row.id), [id(3)]);
  assert.ok(files.filter(row => row.file !== "notes/valid.md").every(row => row.id === null));
  assert.equal(files.find(row => row.file === "notes/no-id.md").title, "No ID");
});

test("explorer follows the editor root, ignores retrieval indexRoot and supports cancellation", async t => {
  const root = await fixture(t);
  await note(root, "notes/editor.md", { id: id(1) });
  await note(root, "retrieval/notes/elsewhere.md", { id: id(2) });
  await writeFile(path.join(root, "jumpybrain.json"), JSON.stringify({ schemaVersion: 1, indexRoot: "retrieval" }));
  assert.deepEqual((await listServerMemoryFiles({ root })).files.map(row => row.id), [id(1)]);
  await assert.rejects(listServerMemoryFiles({ root, signal: AbortSignal.abort() }), error => error.name === "AbortError");
});

test("explorer HTTP requires authentication, only permits GET and reports safe failures", async t => {
  const root = await fixture(t), url = await serve(t, root);
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers: { Authorization: "Bearer wrong" } })).status, 401);
  for (const method of ["POST", "PUT", "DELETE", "PATCH", "HEAD"]) assert.equal((await fetch(url, { method, headers })).status, 405);
  const empty = await fetch(url, { headers });
  assert.equal(empty.status, 200);
  assert.equal(empty.headers.get("cache-control"), "no-store");
  assert.deepEqual(await empty.json(), { files: [] });
  await note(root, "notes/deep/note.md", { id: id(1), title: "Nested" });
  assert.deepEqual((await (await fetch(url, { headers })).json()).files.map(({ updatedAt, ...row }) => row), [{ id: id(1), file: "notes/deep/note.md", title: "Nested" }]);
  await writeFile(path.join(root, "jumpybrain.json"), `private invalid config ${root}`);
  const failed = await fetch(url, { headers });
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { error: { code: "files_failed", message: "Remote file listing failed." } });
});

test("explorer reports declared dates for sorting and never infers creation from the filesystem", async t => {
  const root = await fixture(t);
  await note(root, "notes/declared.md", { id: id(1), title: "Declared", created_at: "2026-01-02T03:04:05.000Z", updated_at: "2026-02-03T04:05:06.000Z" });
  await note(root, "notes/legacy.md", { id: id(2), createdAt: "2025-12-01" });
  await note(root, "notes/invalid.md", { id: id(3), updated_at: "yesterday", created_at: "2026-13-40" });
  const files = Object.fromEntries((await listServerMemoryFiles({ root })).files.map(row => [row.file, row]));
  assert.equal(files["notes/declared.md"].createdAt, "2026-01-02T03:04:05.000Z");
  assert.equal(files["notes/declared.md"].updatedAt, "2026-02-03T04:05:06.000Z", "declared edit time wins over mtime");
  assert.deepEqual([files["notes/legacy.md"].createdAt, files["notes/legacy.md"].updatedAt], ["2025-12-01", undefined], "creation-only notes do not borrow mtime");
  assert.equal(files["notes/invalid.md"].createdAt, undefined);
  assert.match(files["notes/invalid.md"].updatedAt, /^\d{4}-\d{2}-\d{2}T/, "invalid declared dates fall back to mtime");
});
