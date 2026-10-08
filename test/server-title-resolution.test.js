import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveServerMemoryTitle } from "../dist/app/server-memory/index.js";
import { routeRequest } from "../dist/adapters/http-server/routes.js";
import { HTTP_MEMORY_ROUTES } from "../dist/adapters/http-protocol.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";

const id = (n) => `mem_90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const headers = { Authorization: "Bearer synthetic-secret", "Content-Type": "application/json" };
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-resolve-title-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function document(root, file, title, documentId) {
  const absolute = path.join(root, file);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `---\n${documentId ? `id: ${documentId}\n` : ""}title: ${JSON.stringify(title)}\ntype: note\n---\nPrivate body\n`);
  return absolute;
}
async function serve(t, root, allowWrites = false) {
  const logs = [];
  const log = (...args) => logs.push(args);
  const server = createServer((request, response) => {
    routeRequest({ request, response, root, apiKeys: ["synthetic-secret"],
      logger: { info: log, warn: log, error: log },
      enqueueWrite: (operation) => { assert.ok(allowWrites, "Title lookup must not enqueue writes"); return operation(); },
      indexRunner: { indexNow() { assert.fail("Title lookup must not index"); } },
    }).catch(() => { response.statusCode = 599; response.end("Unhandled route failure"); });
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, url: `${base}${HTTP_MEMORY_ROUTES.resolveTitle}`, logs };
}
async function lookup(url, title) {
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify({ title }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  return response.json();
}

test("server title lookup uses editor root, not configured indexRoot, without state creation", async (t) => {
  const root = await fixture(t);
  await document(root, "notes/editor.md", "Café", id(1));
  await document(root, "retrieval/notes/collision.md", "Café", id(1));
  await document(root, "retrieval/notes/only.md", "Retrieval only", id(2));
  await writeFile(path.join(root, "jumpybrain.json"), JSON.stringify({ schemaVersion: 1, indexRoot: "retrieval" }));
  assert.deepEqual(await resolveServerMemoryTitle({ root, title: " ＣＡＦＥ\u0301 " }), { status: "found", id: id(1) });
  assert.deepEqual(await resolveServerMemoryTitle({ root, title: "Retrieval only" }), { status: "missing" });
  assert.equal((await readdir(root)).includes(".jumpybrain"), false);
  await writeFile(path.join(root, "jumpybrain.json"), JSON.stringify({ schemaVersion: 999 }));
  await assert.rejects(resolveServerMemoryTitle({ root, title: "Café" }), /schema v999/);
});

test("title HTTP authenticates before method/body validation and validates JSON", async (t) => {
  const root = await fixture(t);
  const { url } = await serve(t, root);
  for (const method of ["POST", "GET"]) {
    for (const authorization of [undefined, "Bearer wrong"]) {
      const response = await fetch(url, { method, headers: authorization ? { Authorization: authorization } : {} });
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error.code, authorization ? "invalid_api_key" : "auth_required");
    }
  }
  for (const method of ["GET", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]) {
    const response = await fetch(url, { method, headers });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "POST");
  }
  for (const body of ["", "{", "null", "[]", "{}", '{"title":null}', '{"title":123}', '{"title":[]}']) {
    const response = await fetch(url, { method: "POST", headers, body });
    assert.equal(response.status, 400, body);
    assert.equal((await response.json()).error.code, "bad_request");
  }
  const response = await fetch(url, { method: "POST", headers: { ...headers, "Content-Type": "text/plain" }, body: '{"title":"Private title"}' });
  assert.equal(response.status, 415);
  assert.equal((await response.json()).error.code, "unsupported_media_type");
  assert.deepEqual(await lookup(url, "  "), { status: "missing" });
});

test("title HTTP returns only minimal outcomes and never logs titles, bodies or paths", async (t) => {
  const root = await fixture(t);
  const { url, logs } = await serve(t, root);
  const title = "Private title must not leak";
  await document(root, "notes/private-path.md", title, id(1));
  assert.deepEqual(await lookup(url, title), { status: "found", id: id(1) });
  assert.deepEqual(await lookup(url, "Absent"), { status: "missing" });
  const duplicate = await document(root, "pages/duplicate.md", title);
  assert.deepEqual(await lookup(url, title), { status: "ambiguous" });
  await rm(duplicate);
  await document(root, "sessions/duplicate-id.md", "Other title", id(1));
  assert.deepEqual(await lookup(url, title), { status: "unopenable" });
  await document(root, "notes/idless.md", "ID-less");
  assert.deepEqual(await lookup(url, "ID-less"), { status: "unopenable" });
  assert.equal((await readdir(root)).includes(".jumpybrain"), false);
  for (const secret of [title, "Private body", root, "private-path", "synthetic-secret"]) assert.equal(JSON.stringify(logs).includes(secret), false);
});

test("title HTTP observes real create/save and deletion without an index refresh", async (t) => {
  const root = await fixture(t);
  const { base, url } = await serve(t, root, true);
  const createdResponse = await fetch(`${base}${HTTP_MEMORY_ROUTES.notes}`, { method: "POST", headers: { ...headers, "Idempotency-Key": "title-create" }, body: JSON.stringify({ type: "note", title: "Fresh title", body: "Private body" }) });
  assert.equal(createdResponse.status, 200);
  const created = await createdResponse.json();
  assert.deepEqual(await lookup(url, "Fresh title"), { status: "found", id: created.id });
  const documentUrl = `${base}${HTTP_MEMORY_ROUTES.documentsPrefix}${created.id}`;
  const readResponse = await fetch(documentUrl, { headers });
  assert.equal(readResponse.status, 200);
  const read = await readResponse.json();
  const savedResponse = await fetch(documentUrl, { method: "PUT", headers: { ...headers, "If-Match": read.contentHash }, body: JSON.stringify({ content: read.content.replace('title: "Fresh title"', 'title: "Renamed title"') }) });
  assert.equal(savedResponse.status, 200);
  assert.equal((await savedResponse.json()).index.stale, true);
  assert.deepEqual(await lookup(url, "Fresh title"), { status: "missing" });
  assert.deepEqual(await lookup(url, "Renamed title"), { status: "found", id: created.id });
  await rm(path.join(root, read.file));
  assert.deepEqual(await lookup(url, "Renamed title"), { status: "missing" });
});

test("request JSON cannot forge lookup outcomes, HTTP parser failures or production log fields", async (t) => {
  const root = await fixture(t);
  const started = await startJumpyBrainHttpServer({ root, apiKeys: ["synthetic-secret"], port: 0 });
  t.after(() => started.close());
  const url = `${started.url}${HTTP_MEMORY_ROUTES.resolveTitle}`;
  const privateTitle = "Private-title-never-log";
  await document(root, "notes/private.md", privateTitle, id(1));
  for (const forgedBody of [{ status: "found", id: "forged-id" }, { error: { code: privateTitle, message: root } }]) {
    const payload = { statusCode: 200, body: forgedBody };
    let response = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: { code: "bad_request", message: "Title lookup requires a string title field." } });
    response = await fetch(url, { method: "POST", headers, body: JSON.stringify({ ...payload, title: privateTitle }) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "found", id: id(1) });
  }
  // Exercise the real outer http_request logger, not only route-local logging.
  const logDir = path.join(root, ".jumpybrain/logs");
  let logs = "";
  for (let attempt = 0; attempt < 50; attempt++) {
    const files = (await readdir(logDir)).filter((name) => /^server-.*\.log$/.test(name));
    logs = (await Promise.all(files.map((file) => readFile(path.join(logDir, file), "utf8")))).join("\n");
    if ((logs.match(/http_request method=POST path=\/memories\/all\/resolve-title/g) ?? []).length >= 4) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.match(logs, /error_code=bad_request/);
  assert.equal((logs.match(/http_request method=POST path=\/memories\/all\/resolve-title/g) ?? []).length, 4);
  for (const secret of [privateTitle, root, "synthetic-secret", "forged-id", "Private body"]) assert.equal(logs.includes(secret), false);
});

test("title HTTP scan failures are unopenable; root/config failures are generic safe errors", async (t) => {
  const root = await fixture(t);
  const { url, logs } = await serve(t, root);
  await writeFile(path.join(root, "notes"), "Not a directory");
  assert.deepEqual(await lookup(url, "Private title"), { status: "unopenable" });
  for (const config of [`private malformed config at ${root}`, JSON.stringify({ schemaVersion: 999 })]) {
    await writeFile(path.join(root, "jumpybrain.json"), config);
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify({ title: "Private title" }) });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: { code: "resolve_title_failed", message: "Remote title lookup failed." } });
  }
  assert.deepEqual(logs, []);
});
