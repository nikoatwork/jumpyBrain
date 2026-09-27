import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { startJumpyBrainHttpServer } from "../dist/adapters/http-server/index.js";
import { writeServerMemoryWithIdempotency } from "../dist/app/server-memory/index.js";
import { HTTP_MEMORY_ROUTES } from "../dist/adapters/http-protocol.js";

const day = "2026-09-27";
const capture = (dailyDate = day) => ({ type: "note", body: "", dailyDate });
const headers = { Authorization: "Bearer synthetic-secret", "Content-Type": "application/json" };
const logger = { info() {}, warn() {}, error() {} };

async function serve(t, root) {
  const server = await startJumpyBrainHttpServer({
    root, apiKeys: ["synthetic-secret"], port: 0, autoIndex: false, logger,
    indexRunner: { indexNow() { throw new Error("Quick capture must not index"); } },
  });
  let closed = false;
  const close = async () => { if (!closed) { closed = true; await server.close(); } };
  t.after(close);
  return { ...server, close };
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-daily-note-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, ...await serve(t, root) };
}

async function create(url, body, key = "capture") {
  const response = await fetch(`${url}${HTTP_MEMORY_ROUTES.notes}`, {
    method: "POST", headers: { ...headers, ...(key ? { "Idempotency-Key": key } : {}) }, body: JSON.stringify(body),
  });
  return { status: response.status, packet: await response.json() };
}

async function document(root, file, title) {
  const absolute = path.join(root, file);
  await mkdir(path.dirname(absolute), { recursive: true });
  const content = `---\n${title === undefined ? "" : `title: ${JSON.stringify(title)}\n`}---\n# Unrelated heading\n`;
  await writeFile(absolute, content);
  return { absolute, content };
}

test("daily capture creates readable sequential title metadata and headings, independently per day", async (t) => {
  const { root, url } = await fixture(t);
  for (const [date, suffix] of [[day, 1], [day, 2], ["2026-09-28", 1], [day, 3], ["2024-02-29", 1]]) {
    const { status, packet } = await create(url, capture(date), `${date}-${suffix}`);
    assert.equal(status, 200);
    assert.equal(packet.title, `${date}_note_${suffix}`);
    assert.match(packet.id, /^mem_/);
    assert.equal(packet.type, "note");
    assert.equal(packet.target, "remote");
    assert.equal(packet.index.stale, true);
    assert.ok(packet.file.startsWith("notes/"));
    const content = await readFile(path.join(root, packet.file), "utf8");
    assert.ok(content.includes(`title: "${packet.title}"`));
    assert.ok(content.includes(`\n# ${packet.title}\n`));
    assert.equal(content.match(/^# /gm).length, 1);
    const read = await fetch(`${url}${HTTP_MEMORY_ROUTES.documentsPrefix}${packet.id}`, { headers });
    assert.equal(read.status, 200);
    assert.equal((await read.json()).title, packet.title);
  }
});

test("daily allocation uses fresh normalized canonical titles across buckets, including ID-less records, not paths or indexes", async (t) => {
  const { root, url } = await fixture(t);
  const existing = [];
  const buckets = ["notes", "findings", "decisions", "preferences", "sessions", "pages"];
  for (const [i, bucket] of buckets.entries()) existing.push(await document(root, `${bucket}/existing.md`, `${day}_note_${i + 1}`));
  existing.push(await document(root, "pages/nested/import.md", `  ${day}_ＮＯＴＥ_００９  `));
  existing.push(await document(root, `notes/${day}_note_999.md`));
  existing.push(await document(root, "notes/wrong-type.md", 999));
  for (const file of ["scratch/ignored.md", "README.md", "retrieval/notes/index-only.md"]) {
    existing.push(await document(root, file, `${day}_note_999`));
  }
  await writeFile(path.join(root, "jumpybrain.json"), JSON.stringify({ schemaVersion: 1, indexRoot: "retrieval" }));
  let result = await create(url, capture(), "first");
  assert.equal(result.status, 200);
  assert.equal(result.packet.title, `${day}_note_10`);
  // An external edit completed before this request must be seen without indexing.
  existing.push(await document(root, "decisions/.import.md", `${day}_NOTE_15`));
  result = await create(url, capture(), "second");
  assert.equal(result.status, 200);
  assert.equal(result.packet.title, `${day}_note_16`);
  for (const file of existing) assert.equal(await readFile(file.absolute, "utf8"), file.content);
});

test("one real HTTP server write queue allocates unique titles for simultaneous creates and replays", async (t) => {
  const { root, url } = await fixture(t);
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => create(url, capture(), `parallel-${i}`)));
  assert.ok(results.every(({ status }) => status === 200));
  assert.equal(new Set(results.map(({ packet }) => packet.id)).size, 12);
  assert.deepEqual(results.map(({ packet }) => Number(packet.title.split("_").at(-1))).sort((a, b) => a - b), Array.from({ length: 12 }, (_, i) => i + 1));
  const retries = await Promise.all(Array.from({ length: 5 }, () => create(url, capture(), "same-key")));
  assert.ok(retries.every(({ status }) => status === 200));
  assert.ok(retries.every(({ packet }) => packet.id === retries[0].packet.id));
  assert.equal(retries[0].packet.title, `${day}_note_13`);
  assert.equal((await readdir(path.join(root, "notes"))).length, 13);
});

test("replay retains exact title and ID after later allocations and restart, and body changes conflict", async (t) => {
  const firstServer = await fixture(t);
  const { root, url } = firstServer;
  const first = await create(url, capture(), "stable-key");
  assert.equal(first.status, 200);
  await create(url, capture(), "later-key");
  assert.deepEqual(await create(url, capture(), "stable-key"), first);
  for (const changed of [{ ...capture(), body: "changed" }, capture("2026-09-28"), { ...capture(), title: "Override" }]) {
    const result = await create(url, changed, "stable-key");
    assert.equal(result.status, 409);
    assert.equal(result.packet.error.code, "idempotency_conflict");
  }
  await firstServer.close();
  const restarted = await serve(t, root);
  assert.deepEqual(await create(restarted.url, { dailyDate: day, body: "", type: "note" }, "stable-key"), first);
  assert.equal((await create(restarted.url, capture(), "after-restart")).packet.title, `${day}_note_3`);
  assert.equal((await readdir(path.join(root, "notes"))).length, 3);
});

test("daily capture strictly rejects malformed dates, raw field types and nonblank/non-note/title combinations", async (t) => {
  const { root, url } = await fixture(t);
  const invalidDates = [null, true, 20260927, [], {}, "", " 2026-09-27", "2026-09-27\n", "2026-9-27", "2026-09-27T00:00:00Z", "0000-01-01", "2026-02-29", "2024-02-30", "2026-04-31", "2026-00-01", "2026-13-01", "2026-01-00", "2026-01-32"];
  const invalid = [
    ...invalidDates.map((date) => capture(date)),
    ...[undefined, null, 1, true, [], {}, "finding", "page", "unknown", " note "].map((type) => ({ ...capture(), type })),
    ...[undefined, null, 1, true, [], {}, "Nonblank"].map((body) => ({ ...capture(), body })),
    ...[null, 1, true, [], {}, "", "Explicit", `${day}_note_1`].map((title) => ({ ...capture(), title })),
  ];
  for (const body of invalid) {
    const result = await create(url, body, "retry-after-validation");
    assert.equal(result.status, 422, JSON.stringify(body));
    assert.equal(result.packet.error.code, "validation_failed");
  }
  assert.equal((await readdir(root)).length, 0, "invalid inputs create neither Markdown nor idempotency state");
  assert.equal((await create(url, capture(), "")).status, 400);
  const valid = await create(url, { ...capture(), body: " \n\t" }, "retry-after-validation");
  assert.equal(valid.status, 200);
  assert.equal(valid.packet.title, `${day}_note_1`);
});

test("app seam validates daily capture without relying on HTTP coercion", async (t) => {
  const { root } = await fixture(t);
  for (const draft of [{ type: true, body: "" }, { type: "note", body: [] }, { type: "note", title: "Explicit", body: "" }]) {
    await assert.rejects(writeServerMemoryWithIdempotency({ root, key: "direct", method: "POST", path: HTTP_MEMORY_ROUTES.notes, body: { ...draft, dailyDate: day }, write: { kind: "note", draft, dailyDate: day } }));
  }
});

test("explicit-title legacy creation stays unchanged and does not require dailyDate", async (t) => {
  const { url } = await fixture(t);
  for (const type of ["note", "finding", "decision", "preference", "page"]) {
    const body = { type, title: "  My explicit title  ", body: type === "note" ? "" : "Existing body" };
    const created = await create(url, body, type);
    assert.equal(created.status, 200);
    assert.equal(created.packet.title, "My explicit title");
    assert.equal(created.packet.type, type);
    assert.deepEqual(await create(url, body, type), created);
  }
  assert.equal((await create(url, { type: "note", body: "" }, "untitled")).packet.title, "Untitled memory");
  const first = await create(url, { type: "note", title: `${day}_note_20`, body: "" }, "legacy-numbered");
  assert.equal(first.status, 200);
  assert.equal((await create(url, capture(), "daily")).packet.title, `${day}_note_21`);
});

test("large imported numbered suffixes advance exactly without numeric rounding collisions", async (t) => {
  const { root, url } = await fixture(t);
  await document(root, "pages/large.md", `${day}_note_9007199254740992`);
  const result = await create(url, capture());
  assert.equal(result.status, 200);
  assert.equal(result.packet.title, `${day}_note_9007199254740993`);
});
