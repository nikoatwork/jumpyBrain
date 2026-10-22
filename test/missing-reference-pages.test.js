import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureServerMemoryTitle, resolveServerMemoryTitle, readServerMemoryDocument, updateServerMemoryDocument } from "../dist/app/server-memory/index.js";
import { writeRemoteMemoryNote } from "../dist/app/writing/remote-writer.js";
import { safeReferenceTitle } from "../dist/adapters/http-server/reference-policy.js";
import { isSafeReferencePageTitle } from "../dist/app/server-memory/index.js";
import { HTTP_MEMORY_ROUTES } from "../dist/adapters/http-protocol.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";

const headers = { Authorization: "Bearer reference-secret", "Content-Type": "application/json" };
const id = n => `mem_83000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-ensure-title-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function document(root, file, title, documentId) {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), `---\n${documentId ? `id: ${documentId}\n` : ""}title: ${JSON.stringify(title)}\ntype: note\n---\nPrivate body\n`);
}
async function serve(t, root) {
  const logs = [];
  const log = (...args) => logs.push(args);
  const started = await startJumpyBrainHttpServer({ root, apiKeys: ["reference-secret"], port: 0, autoIndex: false,
    logger: { info: log, error: log, warn: log, log },
  });
  t.after(() => started.close());
  return { ...started, logs, ensureUrl: `${started.url}${HTTP_MEMORY_ROUTES.ensureTitle}` };
}
async function ensure(url, title) {
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify({ title }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  return response.json();
}

test("missing title publishes a normal blank page preserving the literal title, editable and reloadable", async t => {
  const root = await fixture(t);
  const title = 'Café "Design": 你好';
  const result = await ensureServerMemoryTitle({ root, title });
  assert.equal(result.status, "found");
  assert.equal(result.created, true);
  assert.equal(result.indexing.status, "pending");
  assert.match(result.id, /^mem_[a-f0-9-]+$/);
  const page = await readServerMemoryDocument({ root, id: result.id });
  assert.match(page.file, /^pages\//);
  assert.equal(page.title, title);
  assert.equal(page.type, "page");
  assert.equal(page.frontmatter.title, title);
  assert.equal(page.frontmatter.source, "jumpybrain-remote");
  assert.ok(page.frontmatter.created_at);
  assert.equal(page.frontmatter.created_at, page.frontmatter.updated_at);
  assert.equal(page.content.split("---\n").at(-1).trim(), `# ${title}`);
  assert.deepEqual(await ensureServerMemoryTitle({ root, title: 'ＣＡＦÉ "DESIGN": 你好' }), { status: "found", id: result.id, created: false });
  const edited = await updateServerMemoryDocument({ root, id: result.id, ifMatch: page.contentHash, content: `${page.content}\nFirst thought.\n` });
  assert.equal((await readServerMemoryDocument({ root, id: result.id })).contentHash, edited.newContentHash);
  assert.deepEqual(await readdir(path.join(root, "pages")), [path.basename(page.file)]);
  // The blank page exception belongs only to the app's reference operation.
  await assert.rejects(writeRemoteMemoryNote(root, { type: "page", title: "Other", body: "" }), /body is empty/);
});

test("fresh editor-root lookup reuses all canonical buckets and refuses ambiguous or unopenable matches", async t => {
  const root = await fixture(t);
  await document(root, "decisions/existing.md", "Existing", id(1));
  await document(root, "retrieval/notes/hidden.md", "Retrieval only", id(2));
  await writeFile(path.join(root, "jumpybrain.json"), JSON.stringify({ schemaVersion: 1, indexRoot: "retrieval" }));
  assert.deepEqual(await ensureServerMemoryTitle({ root, title: "EXISTING" }), { status: "found", id: id(1), created: false });
  await document(root, "pages/idless.md", "Existing");
  assert.deepEqual(await ensureServerMemoryTitle({ root, title: "Existing" }), { status: "ambiguous" });
  await document(root, "notes/no-id.md", "Unopenable");
  assert.deepEqual(await ensureServerMemoryTitle({ root, title: "Unopenable" }), { status: "unopenable" });
  await document(root, "notes/duplicate-id.md", "Elsewhere", id(1));
  assert.deepEqual(await ensureServerMemoryTitle({ root, title: "Elsewhere" }), { status: "unopenable" });
  assert.deepEqual(await readdir(path.join(root, "pages")), ["idless.md"]);
  assert.equal((await readdir(root)).includes(".jumpybrain"), false);
  const created = await ensureServerMemoryTitle({ root, title: "Retrieval only" });
  assert.equal(created.created, true);
  assert.notEqual(created.id, id(2));
});

test("failed scan and incompatible roots never create a reference page", async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, "notes"), "Not a directory");
  assert.deepEqual(await ensureServerMemoryTitle({ root, title: "Absent" }), { status: "unopenable" });
  assert.deepEqual(await readdir(root), ["notes"]);
  await writeFile(path.join(root, "jumpybrain.json"), JSON.stringify({ schemaVersion: 999 }));
  await assert.rejects(ensureServerMemoryTitle({ root, title: "Absent" }), /schema v999/);
  assert.equal((await readdir(root)).includes("pages"), false);
});

test("canonical success survives derived index failure and retries reuse the page", async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, ".jumpybrain"));
  await writeFile(path.join(root, ".jumpybrain/remote"), "Unavailable derived storage");
  const first = await ensureServerMemoryTitle({ root, title: "Saved despite index" });
  assert.equal(first.created, true);
  assert.equal(first.indexing.status, "failed");
  assert.equal(first.indexing.diagnostic.code, "index_state_failed");
  assert.equal(JSON.stringify(first).includes(root), false);
  assert.deepEqual(await ensureServerMemoryTitle({ root, title: "Saved despite index" }), { status: "found", id: first.id, created: false });
  assert.equal((await readdir(path.join(root, "pages"))).length, 1);
});

test("ensure HTTP requires auth, exact payload and the same safe titles as literal references", async t => {
  const root = await fixture(t);
  const { ensureUrl, logs } = await serve(t, root);
  let response = await fetch(ensureUrl, { method: "GET" });
  assert.equal(response.status, 401);
  for (const method of ["GET", "PUT", "DELETE", "PATCH", "HEAD"]) {
    response = await fetch(ensureUrl, { method, headers });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "POST");
  }
  const titles = [undefined, null, 42, "", " ", " title", "title ", "[[title]]", "path/name", "path\\name", "a#b", "a|b", "a\nb", "a\u0000b", "a\u007fb"];
  for (const title of titles) {
    assert.equal(isSafeReferencePageTitle(title), safeReferenceTitle(title));
    response = await fetch(ensureUrl, { method: "POST", headers, body: JSON.stringify({ title }) });
    assert.equal(response.status, 400, String(title));
  }
  for (const body of ["", "{", "[]", "null", '{"title":"Private title","body":"ignored"}', '{"title":"Private title","statusCode":200}']) {
    response = await fetch(ensureUrl, { method: "POST", headers, body });
    assert.equal(response.status, 400, body);
  }
  response = await fetch(ensureUrl, { method: "POST", headers: { ...headers, "Content-Type": "text/plain" }, body: '{"title":"Private title"}' });
  assert.equal(response.status, 415);
  assert.equal((await readdir(root)).includes("pages"), false);
  const result = await ensure(ensureUrl, "Private title");
  assert.equal(result.created, true);
  for (const secret of ["Private title", "reference-secret", root]) assert.equal(JSON.stringify(logs).includes(secret), false);
});

test("host queue coalesces concurrent normalized titles and lost-response retries without duplicate pages", async t => {
  const root = await fixture(t);
  const { ensureUrl } = await serve(t, root);
  const results = await Promise.all(Array.from({ length: 12 }, (_, n) => ensure(ensureUrl, n % 2 ? "ＡＬＬＡ" : "alla")));
  assert.equal(new Set(results.map(result => result.id)).size, 1);
  assert.equal(results.filter(result => result.created).length, 1);
  const confirmed = await ensure(ensureUrl, "Alla");
  assert.deepEqual(confirmed, { status: "found", id: results[0].id, created: false });
  assert.equal((await readdir(path.join(root, "pages"))).length, 1);
  const files = await readdir(path.join(root, "pages"));
  await rm(path.join(root, "pages", files[0]));
  const recreated = await ensure(ensureUrl, "alla");
  assert.equal(recreated.created, true);
  assert.notEqual(recreated.id, confirmed.id);
});

test("read-only title resolution still never creates missing targets", async t => {
  const root = await fixture(t);
  assert.deepEqual(await resolveServerMemoryTitle({ root, title: "Absent" }), { status: "missing" });
  assert.deepEqual(await readdir(root), []);
});
