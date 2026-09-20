import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { repoRoot } from "./source-graph-helpers.js";

async function loadServerModule() {
  return import(pathToFileURL(path.join(repoRoot, "dist/server/index.js")).href);
}

async function json(response) {
  return response.json();
}

async function readServerLog(root, ready = () => true) {
  const dir = path.join(root, ".jumpybrain", "logs");
  let latestLog = "";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const files = (await readdir(dir)).filter((file) => /^server-.*\.log$/.test(file)).sort();
      if (files.length > 0) {
        latestLog = await readFile(path.join(dir, files.at(-1)), "utf8");
        if (ready(latestLog)) return latestLog;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`server log was not written or ready. latest log:\n${latestLog}`);
}

test("server config resolves env and rejects missing secrets", async () => {
  const serverModule = await loadServerModule();

  assert.deepEqual(serverModule.resolveServerConfig({}, {
    JUMPYBRAIN_SERVER_ROOT: "/tmp/memory",
    JUMPYBRAIN_SERVER_HOST: "0.0.0.0",
    JUMPYBRAIN_SERVER_PORT: "4321",
    JUMPYBRAIN_SERVER_API_KEYS: "one, two",
    JUMPYBRAIN_PUBLIC_BASE_URL: "https://memory.example",
  }), {
    root: "/tmp/memory",
    host: "0.0.0.0",
    port: 4321,
    apiKeys: ["one", "two"],
    publicBaseUrl: "https://memory.example",
  });

  assert.throws(() => serverModule.resolveServerConfig({ root: "/tmp/memory" }, {}), /API key/);
});

test("remote HTTP health is unauthenticated and content-free", async () => {
  const serverModule = await loadServerModule();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-http-health-"));
  const started = await serverModule.startJumpyBrainHttpServer({ root: tempRoot, apiKeys: ["secret"], port: 0 });
  try {
    const response = await fetch(`${started.url}/health`);
    const payload = await json(response);

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.service, "jumpybrain-server");
    assert.equal(typeof payload.version, "string");
    assert.equal(Object.hasOwn(payload, "root"), false);
  } finally {
    await started.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("remote HTTP root and note URLs serve the content-free nonce shell", async () => {
  const serverModule = await loadServerModule();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-http-shell-"));
  const memory = serverModule.createServerMemoryRuntime({ root: tempRoot });
  await memory.initializeMemoryRoot();

  const id = "mem_91000000-0000-4000-8000-000000000001";
  const privateTitle = "Private shell fixture title Zinnia";
  const privateBody = "Private shell fixture body Juniper must never enter HTML.";
  const apiKey = "shell-api-key-must-not-enter-html";
  await writeFile(path.join(tempRoot, "notes", "private-shell-fixture.md"), [
    "---",
    `id: ${JSON.stringify(id)}`,
    'type: "note"',
    `title: ${JSON.stringify(privateTitle)}`,
    "---",
    privateBody,
    "",
  ].join("\n"), "utf8");

  const started = await serverModule.startJumpyBrainHttpServer({ root: tempRoot, apiKeys: [apiKey], port: 0, autoIndex: false });
  try {
    const root = await fetch(`${started.url}/`);
    const rootHtml = await root.text();
    assert.equal(root.status, 200);
    assert.match(root.headers.get("content-type"), /text\/html/);
    assert.equal(root.headers.get("x-content-type-options"), "nosniff");
    assert.match(root.headers.get("content-security-policy"), /default-src 'none'/);
    assert.match(root.headers.get("content-security-policy"), /script-src 'nonce-[A-Za-z0-9_-]+'/);
    assert.match(root.headers.get("content-security-policy"), /style-src 'nonce-[A-Za-z0-9_-]+'/);
    assert.match(root.headers.get("content-security-policy"), /connect-src 'self'/);
    assert.match(root.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.doesNotMatch(root.headers.get("content-security-policy"), /unsafe-inline/);
    assert.match(rootHtml, /<script nonce="[A-Za-z0-9_-]+">/);
    assert.match(rootHtml, /<style nonce="[A-Za-z0-9_-]+">/);
    const rootNonce = rootHtml.match(/<script nonce="([A-Za-z0-9_-]+)">/)[1];
    assert.equal(root.headers.get("content-security-policy").includes(`nonce-${rootNonce}`), true);

    const note = await fetch(`${started.url}/?note=${encodeURIComponent(id)}`);
    const noteHtml = await note.text();
    assert.equal(note.status, 200);
    assert.match(note.headers.get("content-type"), /text\/html/);
    assert.match(note.headers.get("content-security-policy"), /script-src 'nonce-/);

    const graph = await fetch(`${started.url}/graph`);
    const graphHtml = await graph.text();
    assert.equal(graph.status, 200);
    const graphSlash = await fetch(`${started.url}/graph/`);
    assert.equal(graphSlash.status, 200);
    await graphSlash.text();

    const normalizeNonce = (html) => html.replaceAll(/nonce="[A-Za-z0-9_-]+"/g, 'nonce="<nonce>"');
    assert.equal(normalizeNonce(noteHtml), normalizeNonce(rootHtml));
    assert.equal(normalizeNonce(graphHtml), normalizeNonce(rootHtml));

    for (const html of [rootHtml, noteHtml, graphHtml]) {
      assert.equal(html.includes(privateTitle), false);
      assert.equal(html.includes(privateBody), false);
      assert.equal(html.includes(apiKey), false);
      assert.equal(html.includes(tempRoot), false);
      assert.equal(html.includes(id), false);
    }
    assert.equal(note.headers.get("content-security-policy").includes(apiKey), false);

    const rootMethod = await fetch(`${started.url}/`, { method: "POST" });
    assert.equal(rootMethod.status, 405);
    assert.equal((await json(rootMethod)).error.code, "method_not_allowed");

    const graphMethod = await fetch(`${started.url}/graph/`, { method: "PUT" });
    assert.equal(graphMethod.status, 405);
    assert.equal((await json(graphMethod)).error.code, "method_not_allowed");
  } finally {
    await started.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("remote HTTP status requires a bearer API key", async () => {
  const serverModule = await loadServerModule();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-http-auth-"));
  const memory = serverModule.createServerMemoryRuntime({ root: tempRoot });
  await memory.initializeMemoryRoot();
  const started = await serverModule.startJumpyBrainHttpServer({ root: tempRoot, apiKeys: ["secret"], port: 0 });
  try {
    const missing = await fetch(`${started.url}/memories/all/status`);
    assert.equal(missing.status, 401);
    assert.equal((await json(missing)).error.code, "auth_required");

    const invalid = await fetch(`${started.url}/memories/all/status`, { headers: { Authorization: "Bearer wrong" } });
    assert.equal(invalid.status, 401);
    assert.equal((await json(invalid)).error.code, "invalid_api_key");
  } finally {
    await started.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("remote HTTP document read requires auth and returns remote-safe exact content", async () => {
  const serverModule = await loadServerModule();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-http-doc-read-"));
  const memory = serverModule.createServerMemoryRuntime({ root: tempRoot });
  await memory.initializeMemoryRoot();

  const id = "mem_90000000-0000-4000-8000-000000000001";
  const missingId = "mem_90000000-0000-4000-8000-000000000099";
  const content = [
    "---",
    `id: ${JSON.stringify(id)}`,
    'type: "note"',
    'title: "Remote readable document"',
    'tags: ["cloud"]',
    "---",
    "# Remote readable document",
    "",
    "Remote read body should not enter logs.",
    "",
  ].join("\n");
  await mkdir(path.join(tempRoot, "notes"), { recursive: true });
  await writeFile(path.join(tempRoot, "notes", "readable.md"), content, "utf8");

  const started = await serverModule.startJumpyBrainHttpServer({ root: tempRoot, apiKeys: ["secret"], port: 0, autoIndex: false });
  try {
    const headers = { Authorization: "Bearer secret" };

    const missingAuth = await fetch(`${started.url}/memories/all/documents/${id}`);
    assert.equal(missingAuth.status, 401);
    assert.equal((await json(missingAuth)).error.code, "auth_required");

    const notFound = await fetch(`${started.url}/memories/all/documents/${missingId}`, { headers });
    const notFoundPayload = await json(notFound);
    assert.equal(notFound.status, 404);
    assert.equal(notFoundPayload.error.code, "missing_id");
    assert.equal(JSON.stringify(notFoundPayload).includes(tempRoot), false);

    const success = await fetch(`${started.url}/memories/all/documents/${id}`, { headers });
    const payload = await json(success);
    const expectedHash = `sha256:${createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex")}`;
    assert.equal(success.status, 200);
    assert.equal(payload.memory, "all");
    assert.equal(payload.target, "remote");
    assert.equal(payload.root, "remote:all");
    assert.equal(payload.id, id);
    assert.equal(payload.file, "notes/readable.md");
    assert.equal(path.isAbsolute(payload.file), false);
    assert.equal(payload.type, "note");
    assert.equal(payload.title, "Remote readable document");
    assert.equal(payload.content, content);
    assert.equal(payload.contentHash, expectedHash);
    assert.match(payload.contentHash, /^sha256:[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(payload).includes(tempRoot), false);

    await mkdir(path.join(tempRoot, "tasks", "done"), { recursive: true });
    const taskContent = "# Graph task\n\nTask content without canonical frontmatter.\n";
    const taskRelativePath = "tasks/done/graph-task.md";
    await writeFile(path.join(tempRoot, taskRelativePath), taskContent, "utf8");
    const pathRead = await fetch(`${started.url}/memories/all/documents/${encodeURIComponent(taskRelativePath)}`, { headers });
    const pathPayload = await json(pathRead);
    assert.equal(pathRead.status, 400);
    assert.equal(pathPayload.error.code, "invalid_id");
    assert.match(pathPayload.error.message, /Expected mem_<uuid>/);
    assert.equal(JSON.stringify(pathPayload).includes(tempRoot), false);

    await mkdir(path.join(tempRoot, "findings"), { recursive: true });
    await writeFile(path.join(tempRoot, "findings", "duplicate.md"), content.replace('type: "note"', 'type: "finding"'), "utf8");
    const duplicate = await fetch(`${started.url}/memories/all/documents/${id}`, { headers });
    const duplicatePayload = await json(duplicate);
    assert.equal(duplicate.status, 409);
    assert.equal(duplicatePayload.error.code, "duplicate_id");
    assert.deepEqual(duplicatePayload.error.details.files, ["notes/readable.md", "findings/duplicate.md"]);
    assert.equal(JSON.stringify(duplicatePayload).includes(tempRoot), false);

    const log = await readServerLog(tempRoot, (logContent) => /error_code=missing_id/.test(logContent) && /error_code=duplicate_id/.test(logContent));
    assert.match(log, /remote_document_read_success path=\/memories\/all\/documents\//);
    assert.match(log, /remote_document_read_failure path=\/memories\/all\/documents\//);
    assert.match(log, /error_code=missing_id/);
    assert.match(log, /error_code=duplicate_id/);
    assert.doesNotMatch(log, /Bearer secret|Remote read body should not enter logs/);
    assert.equal(log.includes(tempRoot), false);
  } finally {
    await started.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("remote HTTP document update requires If-Match and preserves protected metadata", async () => {
  const serverModule = await loadServerModule();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-http-doc-update-"));
  const memory = serverModule.createServerMemoryRuntime({ root: tempRoot });
  await memory.initializeMemoryRoot();

  const id = "mem_92000000-0000-4000-8000-000000000001";
  const original = [
    "---",
    `id: ${JSON.stringify(id)}`,
    'type: "finding"',
    'title: "Remote update original"',
    'tags: ["cloud"]',
    'source: "jumpybrain-remote"',
    'created_at: "2026-07-04T11:00:00.000Z"',
    'updated_at: "2026-07-04T11:00:00.000Z"',
    "---",
    "# Remote update original",
    "",
    "Sensitive update body should not enter logs.",
    "",
  ].join("\n");
  await mkdir(path.join(tempRoot, "findings"), { recursive: true });
  await writeFile(path.join(tempRoot, "findings", "editable.md"), original, "utf8");
  await serverModule.markRemoteIndexFresh(tempRoot, { root: tempRoot, documents: 1, qmdCollection: "jumpybrain" }, "2026-07-04T11:01:00.000Z");

  const started = await serverModule.startJumpyBrainHttpServer({ root: tempRoot, apiKeys: ["secret"], port: 0, autoIndex: false });
  try {
    const headers = { Authorization: "Bearer secret", "Content-Type": "application/json" };
    const url = `${started.url}/memories/all/documents/${id}`;

    const missingAuth = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "If-Match": "sha256:0000000000000000000000000000000000000000000000000000000000000000" }, body: JSON.stringify({ content: original }) });
    assert.equal(missingAuth.status, 401);
    assert.equal((await json(missingAuth)).error.code, "auth_required");

    const missingIfMatch = await fetch(url, { method: "PUT", headers, body: JSON.stringify({ content: original }) });
    assert.equal(missingIfMatch.status, 428);
    assert.equal((await json(missingIfMatch)).error.code, "precondition_required");

    const unsupportedMedia = await fetch(url, { method: "PUT", headers: { Authorization: "Bearer secret", "Content-Type": "text/plain", "If-Match": "sha256:0000000000000000000000000000000000000000000000000000000000000000" }, body: "plain text" });
    assert.equal(unsupportedMedia.status, 415);
    assert.equal((await json(unsupportedMedia)).error.code, "unsupported_media_type");

    const malformed = await fetch(url, { method: "PUT", headers: { ...headers, "If-Match": "sha256:0000000000000000000000000000000000000000000000000000000000000000" }, body: "{" });
    assert.equal(malformed.status, 400);
    assert.equal((await json(malformed)).error.code, "bad_request");

    const validation = await fetch(url, { method: "PUT", headers: { ...headers, "If-Match": "sha256:0000000000000000000000000000000000000000000000000000000000000000" }, body: JSON.stringify({ content: "" }) });
    assert.equal(validation.status, 422);
    assert.equal((await json(validation)).error.code, "validation_failed");

    const read = await fetch(url, { headers });
    const readPayload = await json(read);
    assert.equal(read.status, 200);

    const stale = await fetch(url, { method: "PUT", headers: { ...headers, "If-Match": "sha256:0000000000000000000000000000000000000000000000000000000000000000" }, body: JSON.stringify({ content: readPayload.content }) });
    const stalePayload = await json(stale);
    assert.equal(stale.status, 412);
    assert.equal(stalePayload.error.code, "precondition_failed");
    assert.equal(stalePayload.error.details.file, "findings/editable.md");
    assert.equal(stalePayload.error.details.currentContentHash, readPayload.contentHash);
    assert.equal(JSON.stringify(stalePayload).includes(tempRoot), false);

    const revised = readPayload.content
      .replace(new RegExp(id, "g"), "mem_92000000-0000-4000-8000-000000000099")
      .replace('type: "finding"', 'type: "preference"')
      .replace('title: "Remote update original"', 'title: "Remote update revised"')
      .replace('source: "jumpybrain-remote"', 'source: "submitted-source"')
      .replace('created_at: "2026-07-04T11:00:00.000Z"', 'created_at: "1999-01-01T00:00:00.000Z"')
      .replace("# Remote update original", "# Remote update revised")
      .replace("Sensitive update body should not enter logs.", "Revised update body should not enter logs.");
    const update = await fetch(url, { method: "PUT", headers: { ...headers, "If-Match": readPayload.contentHash }, body: JSON.stringify({ content: revised }) });
    const updated = await json(update);
    assert.equal(update.status, 200);
    assert.equal(updated.memory, "all");
    assert.equal(updated.target, "remote");
    assert.equal(updated.root, "remote:all");
    assert.equal(updated.id, id);
    assert.equal(updated.file, "findings/editable.md");
    assert.equal(updated.oldContentHash, readPayload.contentHash);
    assert.match(updated.newContentHash, /^sha256:[0-9a-f]{64}$/);
    assert.notEqual(updated.newContentHash, readPayload.contentHash);
    assert.equal(updated.indexed, false);
    assert.equal(updated.index.stale, true);
    assert.equal(typeof updated.index.lastWriteAt, "string");
    assert.equal(JSON.stringify(updated).includes(tempRoot), false);

    const markdown = await readFile(path.join(tempRoot, "findings", "editable.md"), "utf8");
    assert.match(markdown, new RegExp(`id: ${JSON.stringify(id)}`));
    assert.match(markdown, /type: "finding"/);
    assert.match(markdown, /title: "Remote update revised"/);
    assert.match(markdown, /source: "jumpybrain-remote"/);
    assert.match(markdown, /created_at: "2026-07-04T11:00:00.000Z"/);
    assert.match(markdown, /updated_at: "/);
    assert.match(markdown, /# Remote update revised/);
    assert.match(markdown, /Revised update body should not enter logs/);
    assert.doesNotMatch(markdown, /mem_92000000-0000-4000-8000-000000000099|submitted-source|1999-01-01/);

    const latest = await json(await fetch(url, { headers }));
    const concurrentA = latest.content.replace("Revised update body should not enter logs.", "Concurrent update A body should not enter logs.");
    const concurrentB = latest.content.replace("Revised update body should not enter logs.", "Concurrent update B body should not enter logs.");
    const concurrent = await Promise.all(["A", "B"].map((label) => fetch(url, {
      method: "PUT",
      headers: { ...headers, "If-Match": latest.contentHash },
      body: JSON.stringify({ content: label === "A" ? concurrentA : concurrentB }),
    })));
    const statuses = concurrent.map((response) => response.status).sort((a, b) => a - b);
    assert.deepEqual(statuses, [200, 412]);
    const concurrentPayloads = await Promise.all(concurrent.map(json));
    assert.equal(concurrentPayloads.some((payload) => payload.error?.code === "precondition_failed"), true);

    const log = await readServerLog(tempRoot, (logContent) => /remote_document_update_success method=PUT path=\/memories\/all\/documents\//.test(logContent) && /remote_document_update_failure method=PUT path=\/memories\/all\/documents\//.test(logContent));
    assert.match(log, /remote_document_update_success method=PUT path=\/memories\/all\/documents\//);
    assert.match(log, /remote_document_update_failure method=PUT path=\/memories\/all\/documents\//);
    assert.match(log, /error_code=precondition_required/);
    assert.match(log, /error_code=precondition_failed/);
    assert.match(log, /stale=true/);
    assert.doesNotMatch(log, /Bearer secret|Sensitive update body|Revised update body|Concurrent update [AB] body/);
    assert.equal(log.includes(tempRoot), false);
  } finally {
    await started.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("remote HTTP indexed search covers title and body matches across canonical buckets", async () => {
  const serverModule = await loadServerModule();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-http-retrieval-"));
  const memory = serverModule.createServerMemoryRuntime({ root: tempRoot });
  await memory.initializeMemoryRoot();

  const fixtures = [
    {
      bucket: "notes",
      file: "note-search.md",
      id: "mem_93000000-0000-4000-8000-000000000001",
      type: "note",
      title: "Asterquill notebook",
      titleQuery: "Asterquill",
      body: "The copperlantern marker appears only in this note body.",
      bodyQuery: "copperlantern",
    },
    {
      bucket: "pages",
      file: "page-search.md",
      id: "mem_93000000-0000-4000-8000-000000000002",
      type: "page",
      title: "Bramblevault overview",
      titleQuery: "Bramblevault",
      body: "The silvercompass marker appears only in this page body.",
      bodyQuery: "silvercompass",
    },
    {
      bucket: "sessions",
      file: "session-search.md",
      id: "mem_93000000-0000-4000-8000-000000000003",
      type: "session",
      sessionId: "s-search-contract",
      title: "Cinderharbor wrapup",
      titleQuery: "Cinderharbor",
      body: "The velvetanchor marker appears only in this session body.",
      bodyQuery: "velvetanchor",
    },
  ];

  for (const fixture of fixtures) {
    await writeFile(path.join(tempRoot, fixture.bucket, fixture.file), [
      "---",
      `id: ${JSON.stringify(fixture.id)}`,
      `type: ${JSON.stringify(fixture.type)}`,
      `title: ${JSON.stringify(fixture.title)}`,
      ...(fixture.sessionId ? [`session_id: ${JSON.stringify(fixture.sessionId)}`] : []),
      "---",
      "",
      fixture.body,
      "",
    ].join("\n"), "utf8");
  }
  await writeFile(path.join(tempRoot, "sessions", "alpha.md"), [
    "---",
    'session_id: "s-alpha"',
    'date: "2026-01-05"',
    "---",
    "",
    "# Session",
    "",
    "Mira decided to store the release notes in docs/releases/q2.md.",
    "",
  ].join("\n"), "utf8");
  const expectedDocumentCount = fixtures.length + 1;

  const started = await serverModule.startJumpyBrainHttpServer({ root: tempRoot, apiKeys: ["secret"], port: 0, autoIndex: false });
  try {
    const headers = { Authorization: "Bearer secret", "Content-Type": "application/json" };
    const index = await fetch(`${started.url}/memories/all/index`, { method: "POST", headers, body: "{}" });
    const indexPayload = await json(index);
    assert.equal(index.status, 200);
    assert.equal(indexPayload.root, "remote:all");
    assert.equal(indexPayload.documents, expectedDocumentCount);
    assert.equal(indexPayload.index.stale, false);
    assert.equal(typeof indexPayload.index.lastIndexedAt, "string");

    await rm(path.join(tempRoot, ".jumpybrain"), { recursive: true, force: true });
    const rebuilt = await fetch(`${started.url}/memories/all/index`, { method: "POST", headers, body: "{}" });
    const rebuiltPayload = await json(rebuilt);
    assert.equal(rebuilt.status, 200);
    assert.equal(rebuiltPayload.documents, expectedDocumentCount);
    assert.equal(rebuiltPayload.index.stale, false);

    for (const fixture of fixtures) {
      for (const [field, query] of [["title", fixture.titleQuery], ["body", fixture.bodyQuery]]) {
        const response = await fetch(`${started.url}/memories/all/search`, {
          method: "POST",
          headers,
          body: JSON.stringify({ query, limit: 5, depth: "normal" }),
        });
        const payload = await json(response);
        assert.equal(response.status, 200, `${fixture.bucket} ${field} query failed: ${JSON.stringify(payload)}`);
        assert.equal(payload.memory, "all");
        assert.equal(payload.target, "remote");
        assert.equal(payload.root, "remote:all");
        assert.equal(payload.query, query);
        assert.equal(payload.depth, "normal");
        assert.equal(payload.index.stale, false);

        const hit = payload.results.find((result) => result.provenance.file === `${fixture.bucket}/${fixture.file}`);
        assert.ok(hit, `${field}-only query ${JSON.stringify(query)} did not find ${fixture.bucket}/${fixture.file}`);
        assert.match(hit.id, /^qmd-/);
        assert.equal(hit.provenance.metadata.id, fixture.id);
        assert.notEqual(hit.id, hit.provenance.metadata.id);
      }
    }

    const naturalSearch = await fetch(`${started.url}/memories/all/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: "Where did Mira store release notes?", limit: 5, depth: "normal" }),
    });
    const naturalSearchPayload = await json(naturalSearch);
    assert.equal(naturalSearch.status, 200);
    assert.equal(naturalSearchPayload.results[0].provenance.file, "sessions/alpha.md");
    assert.match(naturalSearchPayload.results[0].snippet, /release notes/);

    const legacyRecall = await fetch(`${started.url}/memories/all/recall`, {
      method: "POST",
      headers,
      body: JSON.stringify({ topic: "release notes", limit: 5 }),
    });
    const legacyRecallPayload = await json(legacyRecall);
    assert.equal(legacyRecall.status, 200);
    assert.equal(legacyRecallPayload.mode, "recall");
    assert.equal(legacyRecallPayload.query, "release notes");
    assert.equal(legacyRecallPayload.results[0].provenance.session_id, "s-alpha");

    const recall = await fetch(`${started.url}/memories/all/recall`, {
      method: "POST",
      headers,
      body: JSON.stringify({ topic: "velvetanchor", limit: 5, depth: "normal" }),
    });
    const recallPayload = await json(recall);
    assert.equal(recall.status, 200);
    assert.equal(recallPayload.mode, "recall");
    assert.equal(recallPayload.root, "remote:all");
    assert.equal(recallPayload.query, "velvetanchor");
    const sessionHit = recallPayload.results.find((result) => result.provenance.file === "sessions/session-search.md");
    assert.equal(sessionHit.provenance.session_id, "s-search-contract");
    assert.equal(sessionHit.provenance.metadata.id, fixtures[2].id);
  } finally {
    await started.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("remote HTTP overview returns safe tree and connection stats", async () => {
  const serverModule = await loadServerModule();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-http-overview-"));
  const memory = serverModule.createServerMemoryRuntime({ root: tempRoot });
  await memory.initializeMemoryRoot();
  await writeFile(path.join(tempRoot, "pages", "alpha.md"), [
    "---",
    'title: "Alpha"',
    'type: "page"',
    "---",
    "",
    "# Alpha",
    "",
    "Alpha links to [[Beta]]. Secret overview body should not leak.",
  ].join("\n"));
  await writeFile(path.join(tempRoot, "notes", "beta.md"), [
    "---",
    'title: "Beta"',
    'type: "note"',
    "---",
    "",
    "# Beta",
  ].join("\n"));
  const started = await serverModule.startJumpyBrainHttpServer({ root: tempRoot, apiKeys: ["secret"], port: 0 });
  try {
    const response = await fetch(`${started.url}/memories/all/overview?connections=1&showFiles=1`, { headers: { Authorization: "Bearer secret" } });
    const payload = await json(response);
    const serialized = JSON.stringify(payload);

    assert.equal(response.status, 200);
    assert.equal(payload.memory, "all");
    assert.equal(payload.target, "remote");
    assert.equal(payload.root, "remote:all");
    assert.equal(payload.documents, 2);
    assert.equal(payload.connections.edgeCount, 1);
    assert.equal(payload.connections.wikiLinks, 1);
    assert.equal(Object.hasOwn(payload, "files"), true);
    assert.doesNotMatch(serialized, new RegExp(tempRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(serialized, /Secret overview body/);
  } finally {
    await started.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("remote HTTP graph JSON requires auth and returns remote-safe explicit link graph", async () => {
  const serverModule = await loadServerModule();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-http-graph-"));
  const memory = serverModule.createServerMemoryRuntime({ root: tempRoot });
  await memory.initializeMemoryRoot();
  await writeFile(path.join(tempRoot, "pages", "alpha.md"), [
    "---",
    'title: "Alpha"',
    'type: "page"',
    'tags: ["graph"]',
    "---",
    "",
    "# Alpha",
    "",
    "Alpha links to [[Beta]] and [[Missing]]. Secret graph body should not enter logs.",
  ].join("\n"));
  await writeFile(path.join(tempRoot, "notes", "beta.md"), [
    "---",
    'title: "Beta"',
    'type: "note"',
    "---",
    "",
    "# Beta",
  ].join("\n"));
  const started = await serverModule.startJumpyBrainHttpServer({ root: tempRoot, apiKeys: ["secret"], port: 0, autoIndex: false });
  try {
    const page = await fetch(`${started.url}/graph`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type"), /text\/html/);
    assert.equal(page.headers.get("x-content-type-options"), "nosniff");
    assert.match(page.headers.get("content-security-policy"), /script-src 'nonce-/);
    assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    const html = await page.text();
    assert.match(html, /<title>jumpyBrain<\/title>/);
    // Inline script/style must be gated by a nonce; no un-nonce inline handlers.
    assert.doesNotMatch(html, /<script>(?![^<]*<\/script>)/);
    assert.match(html, /<script nonce="/);
    assert.match(html, /<style nonce="/);

    const missingAuth = await fetch(`${started.url}/memories/all/graph.json`);
    assert.equal(missingAuth.status, 401);
    assert.equal((await json(missingAuth)).error.code, "auth_required");

    const graph = await fetch(`${started.url}/memories/all/graph.json?includeUnresolved=1&includeOrphans=0`, { headers: { Authorization: "Bearer secret" } });
    const payload = await json(graph);
    const serialized = JSON.stringify(payload);
    assert.equal(graph.status, 200);
    assert.equal(payload.memory, "all");
    assert.equal(payload.target, "remote");
    assert.equal(payload.root, "remote:all");
    assert.equal(payload.stats.documents, 2);
    assert.equal(payload.stats.nodes, 3);
    assert.equal(payload.stats.edges, 2);
    assert.equal(payload.nodes.some((node) => node.id === "unresolved:missing"), true);
    assert.equal(payload.edges.some((edge) => edge.source === "pages/alpha.md" && edge.target === "notes/beta.md"), true);
    assert.doesNotMatch(serialized, new RegExp(tempRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    await started.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("remote HTTP graph JSON handles empty roots and limit truncation", async () => {
  const serverModule = await loadServerModule();

  // Empty root
  const emptyRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-http-graph-empty-"));
  const emptyMemory = serverModule.createServerMemoryRuntime({ root: emptyRoot });
  await emptyMemory.initializeMemoryRoot();
  const emptyStarted = await serverModule.startJumpyBrainHttpServer({ root: emptyRoot, apiKeys: ["secret"], port: 0, autoIndex: false });
  try {
    const response = await fetch(`${emptyStarted.url}/memories/all/graph.json`, { headers: { Authorization: "Bearer secret" } });
    const payload = await json(response);
    assert.equal(response.status, 200);
    assert.equal(payload.stats.documents, 0);
    assert.equal(payload.stats.nodes, 0);
    assert.equal(payload.stats.edges, 0);
    assert.deepEqual(payload.nodes, []);
    assert.deepEqual(payload.edges, []);
  } finally {
    await emptyStarted.close();
    await rm(emptyRoot, { recursive: true, force: true });
  }

  // Limit truncation
  const bigRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-http-graph-limit-"));
  const bigMemory = serverModule.createServerMemoryRuntime({ root: bigRoot });
  await bigMemory.initializeMemoryRoot();
  for (let i = 0; i < 6; i += 1) {
    await writeFile(path.join(bigRoot, "notes", `doc-${i}.md`), [
      "---",
      `title: "Doc ${i}"`,
      'type: "note"',
      "---",
      "",
      `# Doc ${i}`,
    ].join("\n"));
  }
  const bigStarted = await serverModule.startJumpyBrainHttpServer({ root: bigRoot, apiKeys: ["secret"], port: 0, autoIndex: false });
  try {
    const response = await fetch(`${bigStarted.url}/memories/all/graph.json?limit=3&includeOrphans=1`, { headers: { Authorization: "Bearer secret" } });
    const payload = await json(response);
    assert.equal(response.status, 200);
    assert.equal(payload.stats.documents, 6);
    assert.equal(payload.nodes.length, 3);
    assert.equal(payload.edges.length, 0);
    assert.ok(payload.warnings.some((w) => /limited to 3 nodes/.test(w)));
  } finally {
    await bigStarted.close();
    await rm(bigRoot, { recursive: true, force: true });
  }
});

test("remote HTTP note writes require idempotency and replay safely", async () => {
  const serverModule = await loadServerModule();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-http-notes-"));
  const memory = serverModule.createServerMemoryRuntime({ root: tempRoot });
  await memory.initializeMemoryRoot();
  const started = await serverModule.startJumpyBrainHttpServer({ root: tempRoot, apiKeys: ["secret"], port: 0 });
  try {
    const headers = { Authorization: "Bearer secret", "Content-Type": "application/json" };
    const body = { type: "finding", title: "Remote writes are append-only", body: "Remote note body.", tags: ["cloud"] };

    const missing = await fetch(`${started.url}/memories/all/notes`, { method: "POST", headers, body: JSON.stringify(body) });
    assert.equal(missing.status, 400);
    assert.equal((await json(missing)).error.code, "idempotency_key_required");

    const create = await fetch(`${started.url}/memories/all/notes`, {
      method: "POST",
      headers: { ...headers, "Idempotency-Key": "note-key-1" },
      body: JSON.stringify(body),
    });
    const created = await json(create);
    assert.equal(create.status, 200);
    assert.match(created.id, /^mem_[0-9a-f-]{36}$/);
    assert.equal(created.type, "finding");
    assert.equal(created.title, "Remote writes are append-only");
    assert.equal(created.index.stale, true);
    assert.match(created.file, /^findings\/2026-.*remote-writes-are-append-only.*\.md$/);

    const markdown = await readFile(path.join(tempRoot, created.file), "utf8");
    assert.match(markdown, new RegExp(`id: ${JSON.stringify(created.id)}`));
    assert.match(markdown, /source: "jumpybrain-remote"/);
    assert.doesNotMatch(markdown, /author|api[_-]?key/i);

    const replay = await fetch(`${started.url}/memories/all/notes`, {
      method: "POST",
      headers: { ...headers, "Idempotency-Key": "note-key-1" },
      body: JSON.stringify(body),
    });
    assert.equal(replay.status, 200);
    assert.deepEqual(await json(replay), created);
    assert.deepEqual(await readdir(path.join(tempRoot, "findings")), [path.basename(created.file)]);

    const conflict = await fetch(`${started.url}/memories/all/notes`, {
      method: "POST",
      headers: { ...headers, "Idempotency-Key": "note-key-1" },
      body: JSON.stringify({ ...body, title: "Different title" }),
    });
    assert.equal(conflict.status, 409);
    assert.equal((await json(conflict)).error.code, "idempotency_conflict");
  } finally {
    await started.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("remote HTTP concurrent wrapup writes create distinct session files", async () => {
  const serverModule = await loadServerModule();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-http-wrapups-"));
  const memory = serverModule.createServerMemoryRuntime({ root: tempRoot });
  await memory.initializeMemoryRoot();
  const started = await serverModule.startJumpyBrainHttpServer({ root: tempRoot, apiKeys: ["secret"], port: 0 });
  try {
    const headers = { Authorization: "Bearer secret", "Content-Type": "application/json" };
    const body = {
      title: "Remote session wrapup",
      body: "## Findings\n- Remote write works.\n\n## Decisions\n- Keep it append-only.\n\n## Conflicts / Corrections\n- None captured.\n\n## Open Questions\n- None captured.",
      tags: ["cloud"],
      recallTopic: "remote writes",
    };

    const responses = await Promise.all(["wrap-key-1", "wrap-key-2"].map((key) => fetch(`${started.url}/memories/all/wrapups`, {
      method: "POST",
      headers: { ...headers, "Idempotency-Key": key },
      body: JSON.stringify(body),
    })));
    const payloads = await Promise.all(responses.map(json));

    assert.deepEqual(responses.map((response) => response.status), [200, 200]);
    assert.notEqual(payloads[0].id, payloads[1].id);
    assert.notEqual(payloads[0].file, payloads[1].file);
    assert.equal(payloads[0].validation.valid, true);
    assert.equal(payloads[0].recallTopic, "remote writes");
    assert.equal(payloads[0].index.stale, true);

    const files = await readdir(path.join(tempRoot, "sessions"));
    assert.equal(files.length, 2);
    for (const payload of payloads) {
      const markdown = await readFile(path.join(tempRoot, payload.file), "utf8");
      assert.match(markdown, new RegExp(`id: ${JSON.stringify(payload.id)}`));
      assert.match(markdown, /type: "session"/);
      assert.match(markdown, /source: "jumpybrain-remote"/);
      assert.match(markdown, /recall_topic: "remote writes"/);
    }
  } finally {
    await started.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("remote HTTP writes compact file logs without secrets or bodies", async () => {
  const serverModule = await loadServerModule();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-http-logs-"));
  const memory = serverModule.createServerMemoryRuntime({ root: tempRoot });
  await memory.initializeMemoryRoot();
  const started = await serverModule.startJumpyBrainHttpServer({ root: tempRoot, apiKeys: ["secret"], port: 0, autoIndex: false });
  try {
    const missingAuth = await fetch(`${started.url}/memories/all/status`);
    assert.equal(missingAuth.status, 401);
    await json(missingAuth);

    const headers = { Authorization: "Bearer secret", "Content-Type": "application/json", "Idempotency-Key": "log-note-key" };
    const body = { type: "finding", title: "Logged write", body: "Sensitive memory body should not enter logs." };
    const created = await fetch(`${started.url}/memories/all/notes`, { method: "POST", headers, body: JSON.stringify(body) });
    assert.equal(created.status, 200);
    await json(created);

    const log = await readServerLog(tempRoot, (content) => /http_request method=POST path=\/memories\/all\/notes status=200/.test(content) && /remote_write_success path=\/memories\/all\/notes/.test(content));
    assert.match(log, /ERROR_CODE|INFO/);
    assert.match(log, /http_request method=GET path=\/memories\/all\/status status=401/);
    assert.match(log, /error_code=auth_required/);
    assert.match(log, /remote_write_success path=\/memories\/all\/notes write_type=finding file=findings\//);
    assert.match(log, /http_request method=POST path=\/memories\/all\/notes status=200/);
    assert.doesNotMatch(log, /Bearer secret|Sensitive memory body|log-note-key/);
  } finally {
    await started.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("remote HTTP status reports initialized memory without exposing server root", async () => {
  const serverModule = await loadServerModule();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-http-status-"));
  const memory = serverModule.createServerMemoryRuntime({ root: tempRoot });
  await memory.initializeMemoryRoot();
  const started = await serverModule.startJumpyBrainHttpServer({ root: tempRoot, apiKeys: ["secret"], port: 0 });
  try {
    const response = await fetch(`${started.url}/memories/all/status`, { headers: { Authorization: "Bearer secret" } });
    const payload = await json(response);

    assert.equal(response.status, 200);
    assert.equal(payload.memory, "all");
    assert.equal(payload.canonical, "markdown");
    assert.equal(payload.initialized, true);
    assert.equal(payload.compatible, true);
    assert.equal(payload.index.stale, true);
    assert.equal(Object.hasOwn(payload, "root"), false);
  } finally {
    await started.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("remote HTTP dream endpoints are authenticated, remote-safe, and complete cursor state", async () => {
  const serverModule = await loadServerModule();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-http-dream-"));
  const memory = serverModule.createServerMemoryRuntime({ root: tempRoot });
  await memory.initializeMemoryRoot();
  const id = "mem_94000000-0000-4000-8000-000000000001";
  const content = [
    "---",
    `id: ${JSON.stringify(id)}`,
    'type: "finding"',
    'title: "Dream HTTP finding"',
    "---",
    "# Dream HTTP finding",
    "",
    "Sensitive dream body should only appear in batch context, not logs.",
    "",
  ].join("\n");
  await mkdir(path.join(tempRoot, "findings"), { recursive: true });
  await writeFile(path.join(tempRoot, "findings", "dream-http.md"), content, "utf8");

  const started = await serverModule.startJumpyBrainHttpServer({ root: tempRoot, apiKeys: ["secret"], port: 0, autoIndex: false });
  try {
    const headers = { Authorization: "Bearer secret", "Content-Type": "application/json" };
    const missingAuth = await fetch(`${started.url}/memories/all/dream/status`);
    assert.equal(missingAuth.status, 401);
    assert.equal((await json(missingAuth)).error.code, "auth_required");

    const method = await fetch(`${started.url}/memories/all/dream/status`, { method: "POST", headers, body: "{}" });
    assert.equal(method.status, 405);

    const create = await fetch(`${started.url}/memories/all/dream/batches`, { method: "POST", headers, body: JSON.stringify({ maxFiles: 5, force: "false" }) });
    const batch = await json(create);
    assert.equal(create.status, 200);
    assert.equal(batch.root, "remote:all");
    assert.equal(batch.status, "open");
    assert.equal(batch.files[0].file, "findings/dream-http.md");
    assert.equal(path.isAbsolute(batch.files[0].file), false);
    assert.match(batch.files[0].content, /Sensitive dream body/);
    assert.equal(JSON.stringify(batch).includes(tempRoot), false);

    const resumed = await json(await fetch(`${started.url}/memories/all/dream/batches`, { method: "POST", headers, body: JSON.stringify({ maxFiles: 5, force: "false" }) }));
    assert.equal(resumed.batchId, batch.batchId);
    assert.equal(resumed.resumed, true);

    const statusBefore = await json(await fetch(`${started.url}/memories/all/dream/status`, { headers }));
    assert.equal(statusBefore.openBatch.batchId, batch.batchId);
    assert.equal(statusBefore.lastCompletedCursor, undefined);
    assert.equal(JSON.stringify(statusBefore).includes("Sensitive dream body"), false);

    const revised = batch.files[0].content.replace("Sensitive dream body should only appear in batch context", "Revised dreamed body should only appear in canonical memory");
    const update = await fetch(`${started.url}/memories/all/documents/${id}`, { method: "PUT", headers: { ...headers, "If-Match": batch.files[0].contentHash }, body: JSON.stringify({ content: revised }) });
    assert.equal(update.status, 200);
    const updated = await json(update);
    assert.equal(updated.index.stale, true);

    const complete = await fetch(`${started.url}/memories/all/dream/batches/${batch.batchId}/complete`, { method: "POST", headers, body: JSON.stringify({ summary: "reviewed", updatedDocumentIds: [id] }) });
    const completePayload = await json(complete);
    assert.equal(complete.status, 200);
    assert.equal(completePayload.status, "completed");
    assert.equal(completePayload.advancedCursor.file, "findings/dream-http.md");

    const statusAfter = await json(await fetch(`${started.url}/memories/all/dream/status`, { headers }));
    assert.equal(statusAfter.openBatch, undefined);
    assert.equal(statusAfter.lastCompletedCursor.file, "findings/dream-http.md");

    const log = await readServerLog(tempRoot, (logContent) => /remote_dream_batch_complete_success/.test(logContent));
    assert.match(log, /remote_dream_batch_create_success/);
    assert.match(log, /remote_dream_batch_complete_success/);
    assert.doesNotMatch(log, /Bearer secret|Sensitive dream body/);
    assert.equal(log.includes(tempRoot), false);
  } finally {
    await started.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});


test("remote queued renames reject canonical duplicate titles with 409 without a write or stale-index side effect", async () => {
  const serverModule = await loadServerModule();
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-http-title-conflict-"));
  const memory = serverModule.createServerMemoryRuntime({ root });
  await memory.initializeMemoryRoot();
  const ids = ["mem_93000000-0000-4000-8000-000000000001", "mem_93000000-0000-4000-8000-000000000002"];
  const titles = ["Private title Alpha", "Private title Beta"];
  const originals = ids.map((id, i) => `---\nid: "${id}"\ntype: "note"\ntitle: "${titles[i]}"\n---\nPrivate original body ${i}.\n`);
  for (let i = 0; i < ids.length; i++) {
    await writeFile(path.join(root, "notes", `title-${i}.md`), originals[i], "utf8");
  }
  await serverModule.markRemoteIndexFresh(root, { root, documents: 2, qmdCollection: "jumpybrain" }, "2026-07-04T11:01:00.000Z");
  const started = await serverModule.startJumpyBrainHttpServer({ root, apiKeys: ["secret"], port: 0, autoIndex: false });
  try {
    const headers = { Authorization: "Bearer secret", "Content-Type": "application/json" };
    const urls = ids.map((id) => `${started.url}/memories/all/documents/${id}`);
    const before = await Promise.all(urls.map(async (url) => json(await fetch(url, { headers }))));
    const statusUrl = `${started.url}/memories/all/status`;
    const statusBefore = await json(await fetch(statusUrl, { headers }));
    assert.equal(statusBefore.index.stale, false);
    const put = (i, title) => fetch(urls[i], {
      method: "PUT",
      headers: { ...headers, "If-Match": before[i].contentHash },
      body: JSON.stringify({ content: originals[i].replace(titles[i], title) }),
    });

    // Canonical Markdown exists but no real search index was built.
    const rejected = await put(1, "  PRIVATE TITLE ALPHA  ");
    assert.equal(rejected.status, 409);
    const conflict = await json(rejected);
    assert.deepEqual(conflict, {
      error: {
        code: "duplicate_title",
        message: "Another memory document already uses this title. Choose a different title.",
        details: { id: ids[1], file: "notes/title-1.md", files: ["notes/title-0.md"] },
      },
    });
    assert.equal(JSON.stringify(conflict).includes(root), false);
    assert.deepEqual(await json(await fetch(urls[1], { headers })), before[1]);
    assert.deepEqual((await json(await fetch(statusUrl, { headers }))).index, statusBefore.index);

    // Distinct IDs/hashes compete for the same new title. The queued loser must
    // see the winner's canonical write even while the search index is stale.
    const responses = await Promise.all([put(0, "Shared private destination"), put(1, " SHARED PRIVATE DESTINATION ")]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
    const payloads = await Promise.all(responses.map(json));
    const loser = responses.findIndex((response) => response.status === 409);
    const winner = 1 - loser;
    assert.equal(payloads[loser].error.code, "duplicate_title");
    assert.deepEqual(payloads[loser].error.details.files, [`notes/title-${winner}.md`]);
    assert.equal(payloads[winner].index.stale, true);
    assert.equal(await readFile(path.join(root, "notes", `title-${loser}.md`), "utf8"), originals[loser]);
    assert.equal((await json(await fetch(urls[loser], { headers }))).contentHash, before[loser].contentHash);

    const log = await readServerLog(root, (content) => /error_code=duplicate_title/.test(content));
    assert.doesNotMatch(log, /Private title|PRIVATE TITLE|Shared private|SHARED PRIVATE|Private original body/);
    assert.equal(log.includes(root), false);
  } finally {
    await started.close();
    await rm(root, { recursive: true, force: true });
  }
});
