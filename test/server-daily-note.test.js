import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { startJumpyBrainHttpServer } from "../dist/adapters/http-server/index.js";
import { writeServerMemoryWithIdempotency } from "../dist/app/server-memory/index.js";
import { HTTP_MEMORY_ROUTES } from "../dist/adapters/http-protocol.js";
import { parseFrontmatter } from "../dist/core/frontmatter.js";
import { getDreamWindow, indexMemory, searchMemory } from "../dist/runtime/index.js";
import { installFakeQmd } from "./fake-qmd-helper.js";

const day = "2026-09-27";
const friendlyTitle = (date = day, suffix = 1) => {
  const [year, month, dateOfMonth] = date.split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${months[month - 1]} ${dateOfMonth}, ${year}` + (suffix === 1 ? "" : ` · ${suffix}`);
};
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

test("daily capture creates readable date titles and a distinct writing prompt, independently per day", async (t) => {
  const { root, url } = await fixture(t);
  for (const [date, suffix] of [[day, 1], [day, 2], ["2026-09-28", 1], [day, 3], ["2024-02-29", 1], ["0001-01-01", 1], ["9999-12-31", 1]]) {
    const { status, packet } = await create(url, capture(date), `${date}-${suffix}`);
    assert.equal(status, 200);
    assert.equal(packet.title, friendlyTitle(date, suffix));
    assert.match(packet.id, /^mem_/);
    assert.equal(packet.type, "note");
    assert.equal(packet.target, "remote");
    assert.equal(packet.index.stale, true);
    assert.ok(packet.file.startsWith("notes/"));
    const content = await readFile(path.join(root, packet.file), "utf8");
    assert.equal(parseFrontmatter(content).frontmatter.date, date);
    assert.ok(content.includes(`title: "${packet.title}"`));
    assert.ok(content.includes("\n# How is your day?\n"));
    assert.equal(content.match(/^# /gm).length, 1);
    const read = await fetch(`${url}${HTTP_MEMORY_ROUTES.documentsPrefix}${packet.id}`, { headers });
    assert.equal(read.status, 200);
    const shown = await read.json();
    assert.equal(shown.title, packet.title);
    assert.equal(shown.frontmatter.date, date);
    assert.equal(shown.frontmatter.created_at, shown.frontmatter.updated_at);
    assert.notEqual(shown.frontmatter.created_at.slice(0, 10), date, "writing time is independent of the selected evidence day");
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
  assert.equal(result.packet.title, friendlyTitle(day, 10));
  // An external edit completed before this request must be seen without indexing.
  existing.push(await document(root, "decisions/.import.md", `${day}_NOTE_15`));
  result = await create(url, capture(), "second");
  assert.equal(result.status, 200);
  assert.equal(result.packet.title, friendlyTitle(day, 16));
  for (const file of existing) assert.equal(await readFile(file.absolute, "utf8"), file.content);
});

test("one real HTTP server write queue allocates unique titles for simultaneous creates and replays", async (t) => {
  const { root, url } = await fixture(t);
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => create(url, capture(), `parallel-${i}`)));
  assert.ok(results.every(({ status }) => status === 200));
  assert.equal(new Set(results.map(({ packet }) => packet.id)).size, 12);
  assert.deepEqual(results.map(({ packet }) => (packet.title.includes(" · ") ? Number(packet.title.split(" · ").at(-1)) : 1)).sort((a, b) => a - b), Array.from({ length: 12 }, (_, i) => i + 1));
  const retries = await Promise.all(Array.from({ length: 5 }, () => create(url, capture(), "same-key")));
  assert.ok(retries.every(({ status }) => status === 200));
  assert.ok(retries.every(({ packet }) => packet.id === retries[0].packet.id));
  assert.equal(retries[0].packet.title, friendlyTitle(day, 13));
  assert.equal((await readdir(path.join(root, "notes"))).length, 13);
});

test("daily allocation honors normalized friendly and legacy titles together without rewriting them", async (t) => {
  const { root, url } = await fixture(t);
  const original = await document(root, "notes/friendly.md", `  ${friendlyTitle(day).toUpperCase()}  `);
  await document(root, "pages/imported.md", `${friendlyTitle(day)} · ００４`);
  await document(root, "notes/legacy.md", `${day}_note_2`);
  assert.equal((await create(url, capture())).packet.title, friendlyTitle(day, 5));
  assert.equal(await readFile(original.absolute, "utf8"), original.content);
});

test("replay retains exact title and ID after later allocations and restart, and body changes conflict", async (t) => {
  const firstServer = await fixture(t);
  const { root, url } = firstServer;
  const first = await create(url, capture(), "stable-key");
  assert.equal(first.status, 200);
  const content = await readFile(path.join(root, first.packet.file), "utf8");
  assert.equal(parseFrontmatter(content).frontmatter.date, day);
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
  assert.equal(await readFile(path.join(root, first.packet.file), "utf8"), content);
  assert.equal((await create(restarted.url, capture(), "after-restart")).packet.title, friendlyTitle(day, 3));
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
  assert.equal(valid.packet.title, friendlyTitle(day, 1));
});

test("app seam validates daily capture without relying on HTTP coercion", async (t) => {
  const { root } = await fixture(t);
  for (const draft of [{ type: true, body: "" }, { type: "note", body: [] }, { type: "note", title: "Explicit", body: "" }]) {
    await assert.rejects(writeServerMemoryWithIdempotency({ root, key: "direct", method: "POST", path: HTTP_MEMORY_ROUTES.notes, body: { ...draft, dailyDate: day }, write: { kind: "note", draft, dailyDate: day } }));
  }
});

test("daily evidence dates reject conflicts before publication and allow an identical declared day", async (t) => {
  const { root, url } = await fixture(t);
  for (const date of ["2026-09-26", "2026-09-28", `${day}T00:00:00Z`, null, true, "2026-02-29"]) {
    const result = await create(url, { ...capture(), date }, "date-validation");
    assert.equal(result.status, 422, JSON.stringify(date));
    assert.equal(result.packet.error.code, "validation_failed");
  }
  assert.deepEqual(await readdir(root), [], "rejected dates publish neither Markdown nor replay state");
  const draft = { type: "note", body: "", date: "2026-09-26" };
  await assert.rejects(writeServerMemoryWithIdempotency({ root, key: "direct-date", method: "POST", path: HTTP_MEMORY_ROUTES.notes,
    body: { ...draft, dailyDate: day }, write: { kind: "note", draft, dailyDate: day } }), /date must match dailyDate/);
  assert.deepEqual(await readdir(root), []);

  const body = { ...capture(), date: day };
  const first = await create(url, body, "date-validation");
  assert.equal(first.status, 200);
  const content = await readFile(path.join(root, first.packet.file), "utf8");
  assert.equal(parseFrontmatter(content).frontmatter.date, day);
  assert.deepEqual(await create(url, body, "date-validation"), first);
  assert.equal(await readFile(path.join(root, first.packet.file), "utf8"), content);
  assert.equal((await create(url, capture(), "date-validation")).status, 409, "replay fingerprint preserves supplied fields");
});

test("daily captures reach same-day temporal recall and declared dream windows through local and hosted reads", async (t) => {
  const { root, url } = await fixture(t);
  const fake = await installFakeQmd(root);
  const previous = process.env.JUMPYBRAIN_QMD_BIN;
  process.env.JUMPYBRAIN_QMD_BIN = path.join(path.dirname(fake.bin), "qmd");
  await chmod(process.env.JUMPYBRAIN_QMD_BIN, 0o755);
  t.after(() => {
    if (previous === undefined) delete process.env.JUMPYBRAIN_QMD_BIN;
    else process.env.JUMPYBRAIN_QMD_BIN = previous;
  });
  const first = await create(url, capture(), "day-first");
  const second = await create(url, capture(), "day-second");
  const next = await create(url, capture("2026-09-28"), "next-day");
  const ordinary = await create(url, { type: "note", title: "Ordinary undated note", body: "How is your day?" }, "undated");
  for (const result of [first, second, next, ordinary]) assert.equal(result.status, 200);
  // Exercise real app indexing/retrieval policy with the deterministic QMD fixture.
  // This is evidence-date eligibility, not semantic model quality verification.
  await indexMemory(root, { policy: { mode: "lexical" } });
  const query = "How is your day?";
  const temporal = { from: day, to: day };
  const local = await searchMemory(root, query, 10, { refresh: false, temporal });
  const response = await fetch(`${url}${HTTP_MEMORY_ROUTES.recall}`, {
    method: "POST", headers, body: JSON.stringify({ query, limit: 10, temporal }),
  });
  assert.equal(response.status, 200);
  const hosted = await response.json();
  const expected = [first.packet.file, second.packet.file].sort();
  for (const packet of [local, hosted]) {
    assert.deepEqual(packet.results.map(result => result.provenance.file).sort(), expected);
    assert.ok(packet.results.every(result => result.provenance.evidenceDate.basis === "declared" && result.provenance.evidenceDate.value === day));
    assert.equal(packet.temporal.coverage.excludedUndated, 1);
  }
  const localWindow = await getDreamWindow({ root, request: { from: day, days: 1 } });
  const windowResponse = await fetch(`${url}${HTTP_MEMORY_ROUTES.dreamWindow}?from=${day}&days=1`, { headers });
  assert.equal(windowResponse.status, 200);
  for (const window of [localWindow, await windowResponse.json()]) {
    assert.equal(window.totalFiles, 2);
    assert.deepEqual(window.files.map(file => file.file).sort(), expected);
    assert.ok(window.files.every(file => file.date === day && file.dateBasis === "date" && file.dateConfidence === "declared"));
  }
});

test("explicit-title legacy creation stays unchanged and does not require dailyDate", async (t) => {
  const { root, url } = await fixture(t);
  for (const type of ["note", "finding", "decision", "preference", "page"]) {
    const body = { type, title: "  My explicit title  ", body: type === "note" ? "" : "Existing body" };
    const created = await create(url, body, type);
    assert.equal(created.status, 200);
    assert.equal(created.packet.title, "My explicit title");
    assert.equal(created.packet.type, type);
    assert.equal(Object.hasOwn(parseFrontmatter(await readFile(path.join(root, created.packet.file), "utf8")).frontmatter, "date"), false);
    assert.deepEqual(await create(url, body, type), created);
  }
  assert.equal((await create(url, { type: "note", body: "" }, "untitled")).packet.title, "Untitled memory");
  const first = await create(url, { type: "note", title: `${day}_note_20`, body: "" }, "legacy-numbered");
  assert.equal(first.status, 200);
  assert.equal((await create(url, capture(), "daily")).packet.title, friendlyTitle(day, 21));
});

test("large imported numbered suffixes advance exactly without numeric rounding collisions", async (t) => {
  const { root, url } = await fixture(t);
  await document(root, "pages/large.md", `${day}_note_9007199254740992`);
  const result = await create(url, capture());
  assert.equal(result.status, 200);
  assert.equal(result.packet.title, friendlyTitle(day, "9007199254740993"));
});
