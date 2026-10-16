import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { recentServerMemory, readServerMemoryDocument } from "../dist/app/server-memory/index.js";
import { routeRequest } from "../dist/adapters/http-server/routes.js";
import { HTTP_MEMORY_ROUTES } from "../dist/adapters/http-protocol.js";

const id = (n) => `mem_80000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const headers = { Authorization: "Bearer synthetic-secret", "Content-Type": "application/json" };
const logger = { info() {}, warn() {}, error() {} };

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-recent-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function document(root, file, metadata) {
  const absolute = path.join(root, file);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, ["---", ...Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`), "---", "Private body must not appear in recent packets.", ""].join("\n"));
  return absolute;
}

async function serve(t, root) {
  const server = createServer((request, response) => {
    routeRequest({ request, response, root, apiKeys: ["synthetic-secret"], logger,
      enqueueWrite: (operation) => operation(),
      indexRunner: { indexNow() { throw new Error("Recent notes must not index"); } },
    }).catch(() => { response.statusCode = 599; response.end("Unhandled route failure"); });
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  return `http://127.0.0.1:${server.address().port}`;
}

function assertSafe(packet, root) {
  assert.equal(packet.memory, "all");
  assert.equal(packet.target, "remote");
  assert.equal(packet.root, "remote:all");
  assert.deepEqual(Object.keys(packet).sort(), ["memory", "notes", "root", "target"]);
  assert.equal(JSON.stringify(packet).includes(root), false);
  assert.equal(JSON.stringify(packet).includes("Private body"), false);
  for (const note of packet.notes) {
    assert.ok(Object.keys(note).every((key) => ["id", "title", "file", "updatedAt", "createdAt"].includes(key)));
    assert.equal(path.isAbsolute(note.file), false);
  }
}

test("recent orders valid metadata dates, falls through invalid aliases, and puts unknown dates last", async (t) => {
  const root = await fixture(t);
  await document(root, "notes/updated.md", { id: id(1), title: "Updated", updated_at: "2024-08-01", updatedAt: "2099-01-01", created_at: "2020-01-01" });
  await document(root, "findings/camel.md", { id: id(2), title: "Camel", updated_at: "2024-02-30", updatedAt: "2024-07-01T00:00:00Z" });
  await document(root, "decisions/created.md", { id: id(3), title: "Created", updated_at: "nonsense", created_at: "2024-06-01" });
  await document(root, "preferences/created-camel.md", { id: id(4), title: "Created camel", updatedAt: true, created_at: "2023-02-29", createdAt: "2024-05-01" });
  await document(root, "sessions/dated.md", { id: id(5), title: "Dated", created_at: [], createdAt: "bad", date: "2024-04-01" });
  await document(root, "pages/offset.md", { id: id(6), title: "Offset", updated_at: "2024-08-01T01:00:00+02:00" });
  const unknown = await document(root, "notes/a-unknown.md", { id: id(7), updated_at: "2099-02-29T12:00:00Z", createdAt: "2099-01-01T00:00:00", date: "tomorrow" });
  await utimes(unknown, new Date("2099-01-01"), new Date("2099-01-01"));
  await document(root, "notes/z-unknown.md", { id: id(8), updated_at: 9999999999999 });
  const packet = await recentServerMemory({ root });
  assertSafe(packet, root);
  assert.deepEqual(packet.notes.map((note) => note.id), [1, 6, 2, 3, 4, 5, 7, 8].map(id));
  assert.equal(packet.notes[0].updatedAt, "2024-08-01");
  assert.equal(packet.notes[0].createdAt, "2020-01-01");
  assert.equal(packet.notes[2].updatedAt, "2024-07-01T00:00:00Z");
  assert.equal(packet.notes[3].createdAt, "2024-06-01");
  assert.equal(packet.notes[4].createdAt, "2024-05-01");
  assert.equal(packet.notes[5].createdAt, "2024-04-01");
  assert.deepEqual(packet.notes[6], { id: id(7), title: "", file: "notes/a-unknown.md" });
  for (const note of packet.notes) assert.equal((await readServerMemoryDocument({ root, id: note.id })).file, note.file);
  assert.equal((await readdir(root)).includes(".jumpybrain"), false);
});

test("recent excludes noncanonical paths, symlinks, missing/invalid and all duplicate IDs before its fixed cap", async (t) => {
  const root = await fixture(t);
  for (let n = 1; n <= 10; n++) await document(root, `notes/${String(n).padStart(2, "0")}.md`, { id: id(n), title: `Note ${n}`, date: "2024-01-01" });
  await document(root, "notes/duplicate-first.md", { id: id(20), updated_at: "2099-01-01" });
  await document(root, "sessions/duplicate-second.md", { id: id(20), updated_at: "2000-01-01" });
  await document(root, "notes/missing-id.md", { title: "Missing", date: "2099-01-01" });
  await document(root, "notes/invalid-id.md", { id: "not-a-memory-id", date: "2099-01-01" });
  for (const file of ["README.md", "scratch/secret.md", ".jumpybrain/secret.md", "notes/build/secret.md", "notes/gold.md"]) {
    await document(root, file, { id: id(1), date: "2099-01-01" });
  }
  await document(root, "notes/.hidden.md", { id: id(30), date: "2099-01-01" });
  await document(root, "notes/.hidden/secret.md", { id: id(31), date: "2099-01-01" });
  await symlink(path.join(root, "notes/01.md"), path.join(root, "notes/symlink.md"));
  const packet = await recentServerMemory({ root });
  assertSafe(packet, root);
  assert.deepEqual(packet.notes.map((note) => note.id), Array.from({ length: 8 }, (_, i) => id(i + 1)));
  for (const note of packet.notes) assert.equal((await readServerMemoryDocument({ root, id: note.id })).file, note.file);
});

test("recent never lists hidden paths or IDs made ambiguous by hidden editor-visible documents", async (t) => {
  const root = await fixture(t);
  await document(root, "notes/visible.md", { id: id(1), title: "Visible", date: "2024-01-01" });
  await document(root, "notes/.duplicate.md", { id: id(1), date: "2024-01-01" });
  await document(root, "notes/.private/unique.md", { id: id(2), date: "2024-01-01" });
  await assert.rejects(readServerMemoryDocument({ root, id: id(1) }), (error) => error.code === "duplicate_id");
  assert.deepEqual((await recentServerMemory({ root })).notes, []);
});

test("recent follows editor memory-root scope, not configured retrieval indexRoot, and rejects incompatible roots", async (t) => {
  const root = await fixture(t);
  await document(root, "notes/editable.md", { id: id(1), title: "Editable" });
  await document(root, "retrieval/notes/search-only.md", { id: id(2), updated_at: "2099-01-01" });
  await writeFile(path.join(root, "jumpybrain.json"), JSON.stringify({ schemaVersion: 1, indexRoot: "retrieval" }));
  const packet = await recentServerMemory({ root });
  assert.deepEqual(packet.notes.map((note) => note.id), [id(1)]);
  assert.equal((await readServerMemoryDocument({ root, id: id(1) })).file, packet.notes[0].file);
  await writeFile(path.join(root, "jumpybrain.json"), JSON.stringify({ schemaVersion: 999 }));
  await assert.rejects(recentServerMemory({ root }), /schema v999/);
});

test("recent HTTP requires auth, is GET-only, and returns a fixed remote-safe packet without indexing", async (t) => {
  const root = await fixture(t);
  const url = await serve(t, root);
  for (const [authorization, code] of [[undefined, "auth_required"], ["Bearer wrong", "invalid_api_key"]]) {
    const response = await fetch(`${url}${HTTP_MEMORY_ROUTES.recent}`, { headers: authorization ? { Authorization: authorization } : {} });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, code);
  }
  for (const method of ["POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]) {
    const response = await fetch(`${url}${HTTP_MEMORY_ROUTES.recent}`, { method, headers });
    assert.equal(response.status, 405);
  }
  let response = await fetch(`${url}${HTTP_MEMORY_ROUTES.recent}`, { headers });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { memory: "all", target: "remote", root: "remote:all", notes: [] });
  for (let n = 1; n <= 10; n++) await document(root, `notes/${n}.md`, { id: id(n), title: `Note ${n}`, date: "2024-01-01" });
  response = await fetch(`${url}${HTTP_MEMORY_ROUTES.recent}?limit=999`, { headers });
  assert.equal(response.status, 200);
  const packet = await response.json();
  assertSafe(packet, root);
  assert.equal(packet.notes.length, 8);
  assert.equal((await readdir(root)).includes(".jumpybrain"), false);
});

test("recent reflects HTTP creation and saves immediately without any index refresh", async (t) => {
  const root = await fixture(t);
  const url = await serve(t, root);
  await document(root, "notes/old.md", { id: id(1), title: "Old note", type: "note", created_at: "2020-01-01", updated_at: "2020-01-01" });
  const createdResponse = await fetch(`${url}${HTTP_MEMORY_ROUTES.notes}`, { method: "POST", headers: { ...headers, "Idempotency-Key": "recent-create" }, body: JSON.stringify({ type: "note", title: "Fresh note", body: "Private body" }) });
  assert.equal(createdResponse.status, 200);
  const created = await createdResponse.json();
  let response = await fetch(`${url}${HTTP_MEMORY_ROUTES.recent}`, { headers });
  let packet = await response.json();
  assert.equal(packet.notes[0].id, created.id);
  const readResponse = await fetch(`${url}${HTTP_MEMORY_ROUTES.documentsPrefix}${id(1)}`, { headers });
  assert.equal(readResponse.status, 200);
  const read = await readResponse.json();
  const saveResponse = await fetch(`${url}${HTTP_MEMORY_ROUTES.documentsPrefix}${id(1)}`, { method: "PUT", headers: { ...headers, "If-Match": read.contentHash }, body: JSON.stringify({ content: read.content.replace('title: "Old note"', 'title: "Renamed note"') }) });
  assert.equal(saveResponse.status, 200);
  const saved = await saveResponse.json();
  response = await fetch(`${url}${HTTP_MEMORY_ROUTES.recent}`, { headers });
  packet = await response.json();
  assertSafe(packet, root);
  assert.equal(packet.notes[0].id, id(1));
  assert.equal(packet.notes[0].title, "Renamed note");
  assert.equal(packet.notes[0].updatedAt, saved.updatedAt);
  assert.equal(saved.index.stale, true);
});

test("recent HTTP failures return only a generic safe error", async (t) => {
  const root = await fixture(t);
  const url = await serve(t, root);
  await writeFile(path.join(root, "jumpybrain.json"), `private malformed config at ${root}`);
  const response = await fetch(`${url}${HTTP_MEMORY_ROUTES.recent}`, { headers });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: { code: "recent_failed", message: "Remote recent notes failed." } });
});
