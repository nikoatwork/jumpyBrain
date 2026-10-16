import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRemoteMemoryTransport, RemoteMemoryError } from "../dist/adapters/http-client/index.js";
import { startJumpyBrainHttpServer } from "../dist/adapters/http-server/index.js";
import { expandMemoryDocument } from "../dist/app/local-memory/expansion.js";
import { compactSearchMemory } from "../dist/app/local-memory/compact.js";
import { indexMemory } from "../dist/app/local-memory/index.js";
import { installFakeQmd } from "./fake-qmd-helper.js";

const recallPath = "/memories/all/recall/compact";
const expansionPath = "/memories/all/expand";
const headers = { Authorization: "Bearer secret", "Content-Type": "application/json" };
const logger = { info() {}, warn() {}, error() {}, log() {} };
const id = "mem_77000000-0000-4000-8000-000000000001";
const missingId = "mem_77000000-0000-4000-8000-000000000002";
const hash = content => `sha256:${createHash("sha256").update(content).digest("hex")}`;
const post = (url, route, body) => fetch(url + route, { method: "POST", headers, body: JSON.stringify(body) });

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpy-bounded-http-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "notes"));
  const content = ["---", `id: ${id}`, "type: note", "title: Bounded evidence", "---",
    "# Evidence", "Unicode 😀é日 with \"quotes\" and \\slashes.", "", "## Qualification",
    ...Array(45).fill("This is a whole evidence line with a qualification: not always true."),
    "# Next section", "Do not include unrelated context.", ""].join("\r\n");
  await writeFile(path.join(root, "notes/evidence.md"), content);
  const server = await startJumpyBrainHttpServer({ root, apiKeys: ["secret"], port: 0, autoIndex: false, logger });
  t.after(() => server.close());
  const remote = createRemoteMemoryTransport({ url: server.url, apiKey: "secret" });
  return { root, content, ...server, remote, options: { id, expectedContentHash: hash(content) } };
}

async function snapshot(root) {
  const files = (await readdir(root, { recursive: true, withFileTypes: true })).filter(file => file.isFile());
  return Promise.all(files.map(async file => {
    const absolute = path.join(file.parentPath, file.name);
    return [path.relative(root, absolute), (await readFile(absolute)).toString("hex")];
  }));
}

test("authenticated expansion is byte-identical to local packets, preserves CRLF, budgets, and sections", async t => {
  const { root, url, remote, options } = await fixture(t);
  const before = await snapshot(root);
  for (const range of [
    { startLine: 6, endLine: 7 }, { sectionLine: 9, maxBytes: 1024 },
    { maxBytes: 1024 }, { maxBytes: 65536 }, {},
  ]) {
    const request = { ...options, ...range };
    const local = await expandMemoryDocument(root, request);
    assert.deepEqual(await remote.expandMemoryDocument(request), local);
    const response = await post(url, expansionPath, request);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const wire = await response.text();
    assert.equal(wire, JSON.stringify(local) + "\n");
    assert.ok(Buffer.byteLength(wire) <= (range.maxBytes ?? 8192));
    assert.equal(wire.includes(root), false);
    assert.equal(local.filePath, "notes/evidence.md");
    assert.ok(local.text.includes("\r\n"));
    if (range.maxBytes === 1024) {
      assert.equal(local.partial, true);
      assert.equal(local.continuationLine, local.endLine + 1);
    }
  }
  assert.deepEqual(await snapshot(root), before, "bounded expansion must not create state or stamp IDs");
  const oldRead = await remote.readMemoryDocument(id);
  assert.equal(oldRead.id, id);
  assert.equal(oldRead.root, "remote:all");
  assert.ok(oldRead.content.length > 1024, "legacy full-document read stays available explicitly");
});

test("bounded routes authenticate before method dispatch and reject malformed JSON and unknown fields", async t => {
  const { url, root, options } = await fixture(t);
  for (const route of [recallPath, expansionPath]) {
    for (const auth of [undefined, "Bearer wrong"]) {
      const response = await fetch(url + route, { method: "POST", headers: auth ? { Authorization: auth } : {} });
      assert.equal(response.status, 401);
    }
    for (const method of ["GET", "PUT", "DELETE"]) {
      const response = await fetch(url + route, { method, headers });
      assert.equal(response.status, 405);
      assert.equal(response.headers.get("allow"), "POST");
    }
    for (const body of ["{", "[]", "null", '"text"']) {
      const response = await fetch(url + route, { method: "POST", headers, body });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, "bad_request");
    }
    const request = route === recallPath ? { query: "evidence" } : options;
    for (const extra of [{ root }, { statusCode: 201, body: { secret: root } }, { unknown: true }]) {
      const response = await post(url, route, { ...request, ...extra });
      assert.equal(response.status, 400);
      assert.equal((await response.text()).includes(root), false);
    }
    for (const maxBytes of [null, "1024", 1023, 65537, 1024.5, -1]) {
      const response = await post(url, route, { ...request, maxBytes });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, "invalid_budget");
    }
  }
  for (const body of [{}, { query: 3 }, { query: " " }, { query: "a", depth: "unknown" },
    { query: "a", depth: ["deep"] }, { query: "a", diagnostics: "true" }, { query: "a", limit: "3" }]) {
    const response = await post(url, recallPath, body);
    assert.equal(response.status, 400);
  }
});

test("guarded expansion maps malformed, missing, duplicate, stale, and range failures without unsafe details", async t => {
  const { root, url, remote, options, content } = await fixture(t);
  const failures = [
    [{ id }, 428, "precondition_required"],
    [{ ...options, expectedContentHash: "bad" }, 400, "invalid_expansion"],
    [{ ...options, expectedContentHash: "sha256:" + "0".repeat(64) }, 412, "precondition_failed"],
    [{ ...options, id: root }, 400, "invalid_id"],
    [{ ...options, id: missingId }, 404, "missing_id"],
    [{ ...options, startLine: 0 }, 400, "invalid_expansion"],
    [{ ...options, startLine: "1" }, 400, "invalid_expansion"],
    [{ ...options, startLine: 8, endLine: 6 }, 400, "invalid_expansion"],
    [{ ...options, endLine: 99999 }, 400, "invalid_expansion"],
    [{ ...options, sectionLine: 2 }, 400, "invalid_expansion"],
    [{ ...options, sectionLine: 6, startLine: 6 }, 400, "invalid_expansion"],
  ];
  for (const [body, status, code] of failures) {
    const response = await post(url, expansionPath, body);
    assert.equal(response.status, status, JSON.stringify(body));
    const packet = await response.json();
    assert.equal(packet.error.code, code);
    assert.equal(packet.error.details, undefined);
    assert.equal(JSON.stringify(packet).includes(root), false);
    await assert.rejects(remote.expandMemoryDocument(body), error =>
      error instanceof RemoteMemoryError && error.status === status && error.code === code);
  }
  await writeFile(path.join(root, "notes/duplicate.md"), content);
  await assert.rejects(remote.expandMemoryDocument(options), error => error.status === 409 && error.code === "duplicate_id");
  await rm(path.join(root, "notes/duplicate.md"));
  await writeFile(path.join(root, "notes/evidence.md"), content + "Changed source");
  await assert.rejects(remote.expandMemoryDocument(options), error => error.status === 412 && error.code === "precondition_failed");
  const giant = content + "x".repeat(2000);
  await writeFile(path.join(root, "notes/evidence.md"), giant);
  await assert.rejects(remote.expandMemoryDocument({ ...options, expectedContentHash: hash(giant),
    startLine: giant.split(/(?<=\n)/u).length, maxBytes: 1024 }), error => error.status === 422 && error.code === "line_too_large");
});

test("generic bounded-read failures redact filesystem diagnostics", async t => {
  const { root, url, options } = await fixture(t);
  await rm(root, { recursive: true, force: true });
  await writeFile(root, "Not a directory");
  for (const [route, body] of [[recallPath, { query: "evidence" }], [expansionPath, options]]) {
    const response = await post(url, route, body);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: { code: "bounded_read_failed", message: "Remote bounded memory read failed." } });
  }
});

test("authenticated compact recall matches local packing and retains legacy rich recall", async t => {
  const { root, url, remote } = await fixture(t);
  const { bin } = await installFakeQmd(root);
  await writeFile(bin, `#!${process.execPath}
const args = process.argv.slice(2);
if (args[0] === 'search' || args[0] === 'query') {
  const collection = args[args.indexOf('-c') + 1];
  console.log(JSON.stringify(collection === 'jumpybrain' ? [{ file: 'qmd://jumpybrain/notes/evidence.md', score: 0.9, line: 7, snippet: 'Unicode 😀é日 with "quotes" and \\\\slashes.' }] : []));
} else if (args[0] === 'collection' || args[0] === 'update') console.log('[]');
else process.exit(1);
`);
  await chmod(bin, 0o755);
  for (const [key, value] of Object.entries({ JUMPYBRAIN_QMD_BIN: bin, JUMPYBRAIN_QMD_EMBED: "0" })) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  await indexMemory(root);
  let expanded = 0;
  for (const options of [{ maxBytes: 1024, depth: "deep" }, { maxBytes: 8192, depth: "normal" }, { maxBytes: 65536, depth: "shallow", diagnostics: true }]) {
    const local = await compactSearchMemory(root, "Unicode", 5, options);
    const packet = await remote.compactSearchMemory("Unicode", 5, options);
    assert.deepEqual(packet, local);
    const response = await post(url, recallPath, { query: "Unicode", limit: 5, ...options });
    assert.equal(response.status, 200);
    const wire = await response.text();
    assert.equal(wire, JSON.stringify(local) + "\n");
    assert.ok(Buffer.byteLength(wire) <= options.maxBytes);
    assert.equal(wire.includes(root), false);
    if (options.maxBytes > 1024) assert.ok(packet.passages.length > 0);
    for (const passage of packet.passages) {
      if (passage.expansion.available) {
        const { available, ...expansionOptions } = passage.expansion;
        expanded++;
        assert.deepEqual(await remote.expandMemoryDocument(expansionOptions), await expandMemoryDocument(root, expansionOptions));
      }
    }
  }
  assert.ok(expanded > 0, "compact recall must provide a usable expansion token in this fixture");
  const defaults = await remote.compactSearchMemory("Unicode", 5);
  assert.equal(defaults.maxBytes, 8192);
  assert.deepEqual(defaults, await compactSearchMemory(root, "Unicode", 5));
  const legacy = await remote.searchMemory("Unicode", 5, { mode: "recall" });
  assert.ok(Array.isArray(legacy.results));
  assert.equal(legacy.mode, "recall");
  assert.equal(legacy.root, "remote:all");
  const tooSmall = await post(url, recallPath, { query: "a".repeat(2000), maxBytes: 1024 });
  assert.equal(tooSmall.status, 422);
  assert.equal((await tooSmall.json()).error.code, "budget_too_small");
});

for (const method of ["compactSearchMemory", "expandMemoryDocument"]) {
  const invoke = (remote, options = {}) => method === "compactSearchMemory"
    ? remote.compactSearchMemory("Unicode", 5, options)
    : remote.expandMemoryDocument({ id, expectedContentHash: "sha256:" + "a".repeat(64), ...options });
  test(`${method} validates budgets before network access and never downgrades old servers`, async () => {
    const calls = [];
    let status = 404;
    const remote = createRemoteMemoryTransport({ url: "https://memory.invalid", apiKey: "secret", fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response("Old server", { status });
    } });
    for (const maxBytes of [null, "1024", 0, 1023, 65537, 1.5, NaN, Infinity]) {
      await assert.rejects(invoke(remote, { maxBytes }), /maxBytes must be an integer/);
    }
    assert.equal(calls.length, 0);
    for (status of [404, 405, 501]) {
      await assert.rejects(invoke(remote), error => error.status === status
        && /upgrade the server/i.test(error.message) && /no full-document fallback/i.test(error.message));
    }
    assert.equal(calls.length, 3);
    assert.ok(calls.every(call => call.url.pathname === (method === "compactSearchMemory" ? recallPath : expansionPath)));
    assert.ok(calls.every(call => call.init.method === "POST"));
    assert.ok(calls.every(call => call.init.headers.Authorization === "Bearer secret"));
  });
  test(`${method} rejects malformed, wrong-version, wrong-kind, and oversized successful responses`, async () => {
    for (const text of ["not json", "null", "[]", "{}", JSON.stringify({ version: 2, kind: "recall", maxBytes: 1024 }),
      JSON.stringify({ version: 1, kind: "unknown", maxBytes: 1024 }),
      JSON.stringify({ version: 1, kind: method === "compactSearchMemory" ? "recall" : "expansion", maxBytes: 8192 }),
      " ".repeat(1025)]) {
      let calls = 0;
      const remote = createRemoteMemoryTransport({ url: "https://memory.invalid", apiKey: "secret", fetchImpl: async () => {
        calls++;
        return new Response(text);
      } });
      await assert.rejects(invoke(remote, { maxBytes: 1024 }), /unsupported.*upgrade.*no full-document fallback/i);
      assert.equal(calls, 1);
    }
    for (const status of [400, 401, 409, 412, 422, 428, 500]) {
      const remote = createRemoteMemoryTransport({ url: "https://memory.invalid", apiKey: "secret", fetchImpl: async () =>
        Response.json({ error: { code: "synthetic", message: "Safe diagnostic" } }, { status }) });
      await assert.rejects(invoke(remote), error => error instanceof RemoteMemoryError && error.status === status && error.code === "synthetic");
    }
  });
}


test("client enforces UTF-8 wire bytes, canonical JSON plus LF, identity, and declared budgets", async t => {
  const { root, options } = await fixture(t);
  const packet = await expandMemoryDocument(root, { ...options, startLine: 6, endLine: 7, maxBytes: 1024 });
  const invoke = async body => {
    let calls = 0;
    const remote = createRemoteMemoryTransport({ url: "https://memory.invalid", apiKey: "secret", fetchImpl: async () => {
      calls++;
      return new Response(body);
    } });
    await assert.rejects(remote.expandMemoryDocument({ ...options, startLine: 6, endLine: 7, maxBytes: 1024 }), /unsupported.*no full-document fallback/i);
    assert.equal(calls, 1);
  };
  for (const change of [
    { maxBytes: 8192 }, { id: missingId }, { contentHash: "sha256:" + "0".repeat(64) },
    { filePath: "/private/server/notes/evidence.md" }, { endLine: 0 }, { partial: true, omittedLines: 0 },
  ]) await invoke(JSON.stringify({ ...packet, ...change }) + "\n");
  const unicode = JSON.stringify({ ...packet, text: "😀".repeat(180) }) + "\n";
  assert.ok(unicode.length < 1024 && Buffer.byteLength(unicode) > 1024);
  await invoke(unicode);
  // The on-wire body fits but serializing this accepted result plus LF would not.
  const prefix = JSON.stringify({ ...packet, text: "" });
  const withoutLF = JSON.stringify({ ...packet, text: "a".repeat(1024 - Buffer.byteLength(prefix)) });
  assert.equal(Buffer.byteLength(withoutLF), 1024);
  await invoke(withoutLF);
  let cancelled = false;
  const remote = createRemoteMemoryTransport({ url: "https://memory.invalid", apiKey: "secret", fetchImpl: async () =>
    new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(1025)); },
      cancel() { cancelled = true; },
    })) });
  await assert.rejects(remote.expandMemoryDocument({ ...options, maxBytes: 1024 }), /unsupported/);
  assert.equal(cancelled, true, "oversized success bodies must stop streaming without full-doc buffering");
});

function packetTransport(packet) {
  return createRemoteMemoryTransport({ url: "https://memory.invalid", apiKey: "secret",
    fetchImpl: async () => Response.json(packet) });
}
const unsupportedPacket = error => error instanceof RemoteMemoryError && error.code === "unsupported_bounded_read"
  && /upgrade.*no full-document fallback/i.test(error.message);

function recallPacket() {
  return {
    version: 1, kind: "recall", query: "Unicode", depth: "normal", maxBytes: 8192,
    scope: "selected_passages", partial: true,
    readiness: { freshness: "fresh", embedding: "disabled", modes: ["lexical"] },
    retrieval: { status: "complete", warnings: [] }, omitted: { results: 0, passages: 0 },
    passages: [{ documentId: id, filePath: "notes/evidence.md", pathBasis: "canonical_root",
      startLine: 6, endLine: 7, text: "A rendered excerpt may flatten source lines.", scope: "excerpt", partial: true,
      date: { basis: "written", value: "2024-02-29T12:34:56.123Z", field: "created_at" },
      expansion: { available: true, id, expectedContentHash: "sha256:" + "a".repeat(64), startLine: 6, endLine: 7 } }],
  };
}

test("client binds expansion scope, explicit endpoints, defaults, and section anchors to the request", async t => {
  const { root, options } = await fixture(t);
  const range = { ...options, startLine: 6, endLine: 7 };
  const packet = await expandMemoryDocument(root, range);
  assert.deepEqual(await packetTransport(packet).expandMemoryDocument(range), packet);
  for (const request of [
    { ...options }, { ...options, startLine: 6 }, { ...options, endLine: 7 },
    { ...options, startLine: 7, endLine: 8 }, { ...options, startLine: 6, endLine: 8 },
    { ...options, sectionLine: 6 }, { ...range, startLine: null },
  ]) await assert.rejects(packetTransport(packet).expandMemoryDocument(request), unsupportedPacket);
  // Each omitted endpoint has its own default, not the returned packet's range.
  for (const request of [{ ...options }, { ...options, startLine: 6 }, { ...options, endLine: 7 }]) {
    const honest = await expandMemoryDocument(root, request);
    assert.deepEqual(await packetTransport(honest).expandMemoryDocument(request), honest);
  }
  const sectionRequest = { ...options, sectionLine: 50, maxBytes: 1024 };
  const section = await expandMemoryDocument(root, sectionRequest);
  assert.equal(section.partial, true);
  assert.ok(section.endLine < sectionRequest.sectionLine, "a bounded prefix need not reach the requested anchor");
  assert.deepEqual(await packetTransport(section).expandMemoryDocument(sectionRequest), section);
  for (const request of [
    { ...sectionRequest, sectionLine: section.requestedStartLine - 1 },
    { ...sectionRequest, sectionLine: section.requestedEndLine + 1 },
    { ...sectionRequest, startLine: section.requestedStartLine },
    { ...sectionRequest, endLine: section.requestedEndLine },
    { ...options, startLine: section.requestedStartLine, endLine: section.requestedEndLine, maxBytes: 1024 },
  ]) await assert.rejects(packetTransport(section).expandMemoryDocument(request), unsupportedPacket);
});

test("client validates exact expansion line counts, whole lines, and closed schemas", async t => {
  const { root, options } = await fixture(t);
  const request = { ...options, startLine: 6, endLine: 7 };
  const packet = await expandMemoryDocument(root, request);
  for (const change of [
    { text: "one line\n" }, { text: "one\ntwo\nthree\n" }, { text: "" },
    { text: "one\ntwo" }, // Not a whole non-final source line.
    { root: "/private/server/root" }, { diagnostics: {} }, { content: "full document" },
    { continuationLine: null }, { requestedStartLine: 5 }, { requestedEndLine: 8 },
  ]) await assert.rejects(packetTransport({ ...packet, ...change }).expandMemoryDocument(request), unsupportedPacket);
  // Preserve CRLF and don't count its trailing LF as a phantom third line.
  for (const text of ["one\ntwo\n", "one\r\ntwo\r\n"]) {
    const valid = { ...packet, text };
    assert.deepEqual(await packetTransport(valid).expandMemoryDocument(request), valid);
  }
  const final = { ...packet, totalLines: 7, text: "one\ntwo" };
  assert.deepEqual(await packetTransport(final).expandMemoryDocument(request), final);
  for (const invalidId of ["qmd-hit", "/private/server/id", "mem_not-a-uuid"]) {
    await assert.rejects(packetTransport({ ...packet, id: invalidId }).expandMemoryDocument({ ...request, id: invalidId }), unsupportedPacket);
  }
});

test("client binds recall query/depth and rejects unrequested packet and passage diagnostics", async () => {
  const packet = recallPacket();
  assert.deepEqual(await packetTransport(packet).compactSearchMemory("Unicode", 5), packet);
  for (const [query, options] of [["different", {}], ["Unicode ", {}], ["Unicode", { depth: "deep" }],
    ["Unicode", { depth: "shallow" }], ["Unicode", { depth: null }]]) {
    await assert.rejects(packetTransport(packet).compactSearchMemory(query, 5, options), unsupportedPacket);
  }
  const deep = { ...packet, depth: "deep" };
  assert.deepEqual(await packetTransport(deep).compactSearchMemory("Unicode", 5, { depth: "deep" }), deep);
  for (const modify of [
    p => { p.diagnostics = { candidateResults: 1, candidatePassages: 1, budgetOmittedPassages: 0 }; },
    p => { p.passages[0].diagnostics = { hitId: "qmd-hit", score: 1 }; },
  ]) {
    const extra = structuredClone(packet);
    modify(extra);
    for (const options of [{}, { diagnostics: false }]) {
      await assert.rejects(packetTransport(extra).compactSearchMemory("Unicode", 5, options), unsupportedPacket);
    }
    assert.deepEqual(await packetTransport(extra).compactSearchMemory("Unicode", 5, { diagnostics: true }), extra);
  }
});

test("client rejects extra recall fields, invalid calendar dates, and inconsistent canonical identities", async () => {
  const mutations = [
    p => { p.root = "/private/server/root"; },
    p => { p.readiness.root = "/private/server/root"; },
    p => { p.retrieval.diagnostics = "unexpected"; },
    p => { p.omitted.secret = "unexpected"; },
    p => { p.passages[0].root = "/private/server/root"; },
    p => { p.passages[0].date.root = "/private/server/root"; },
    p => { p.passages[0].expansion.root = "/private/server/root"; },
    p => { p.passages[0].date.value = "not a date"; },
    p => { p.passages[0].date.value = "2023-02-29"; },
    p => { p.passages[0].date.value = "2024-04-31"; },
    p => { p.passages[0].date.value = "2024-01-01T25:00:00Z"; },
    p => { p.passages[0].date.value = "0000-01-01"; },
    p => { p.passages[0].date.field = "updated_at"; },
    p => { p.passages[0].date = { basis: "unknown", value: "2024-01-01" }; },
    p => { p.passages[0].documentId = "qmd-hit"; },
    p => { p.passages[0].documentId = missingId; },
    p => { delete p.passages[0].documentId; },
    p => { p.passages[0].expansion.id = "not-canonical"; },
    p => { p.passages[0].pathBasis = "index_root"; },
    p => { p.passages[0].expansion.startLine = 5; },
    p => { p.passages[0].expansion.endLine = 8; },
    p => { p.passages[0].expansion = { available: false, reason: "missing_id" }; },
    p => { p.passages[0].expansion = { available: false, reason: "source_changed", id }; },
    p => { p.passages[0].expansion = { available: false, reason: "arbitrary" }; },
    p => { p.readiness.lastFailure = { code: "index_failed", at: "2024-02-30" }; },
    p => { p.readiness.lastFailure = { code: "arbitrary", at: "2024-02-29" }; },
    p => { p.readiness.lastFailure = { code: "index_failed", at: "2024-02-29", root: "/private" }; },
  ];
  for (const modify of mutations) {
    const packet = recallPacket();
    modify(packet);
    await assert.rejects(packetTransport(packet).compactSearchMemory("Unicode", 5), unsupportedPacket, String(modify));
  }
  const packet = recallPacket();
  packet.readiness.lastFailure = { code: "interrupted_update", at: "2024-02-29T23:59:59Z" };
  packet.passages[0].date = { basis: "unknown" };
  packet.passages[0].expansion = { available: false, reason: "source_changed" };
  assert.deepEqual(await packetTransport(packet).compactSearchMemory("Unicode", 5), packet);
  delete packet.passages[0].documentId;
  packet.passages[0].expansion.reason = "outside_canonical_root";
  packet.passages[0].pathBasis = "index_root";
  assert.deepEqual(await packetTransport(packet).compactSearchMemory("Unicode", 5), packet);
});

test("client permits only documented, validated optional diagnostics fields", async () => {
  const packet = recallPacket();
  packet.diagnostics = { candidateResults: 1, candidatePassages: 1, budgetOmittedPassages: 0 };
  packet.passages[0].diagnostics = {
    hitId: "qmd-hit", score: 0.9,
    scoreBreakdown: { qmdScore: 0.9, exactMatchBoost: 0, metadataBoost: 0, finalScore: 0.9, driver: "lexical",
      titleMatchBoost: 0, temporalRelevance: 0, memoryStrength: 0, provenanceConfidence: 0,
      depthPolicyBoost: 0, dreamBoost: 0, retrievalDepth: "normal" },
    metadata: { arbitrary_frontmatter: "permitted only by explicit diagnostics", tags: ["test"], count: 1, dream: false },
  };
  assert.deepEqual(await packetTransport(packet).compactSearchMemory("Unicode", 5, { diagnostics: true }), packet);
  for (const modify of [
    p => { p.diagnostics.root = "/private/server"; },
    p => { p.diagnostics.candidateResults = "1"; },
    p => { p.passages[0].diagnostics.root = "/private/server"; },
    p => { p.passages[0].diagnostics.score = null; },
    p => { p.passages[0].diagnostics.scoreBreakdown.root = "/private/server"; },
    p => { p.passages[0].diagnostics.scoreBreakdown.qmdScore = "1"; },
    p => { p.passages[0].diagnostics.metadata.bad = { nested: "not frontmatter" }; },
  ]) {
    const invalid = structuredClone(packet);
    modify(invalid);
    await assert.rejects(packetTransport(invalid).compactSearchMemory("Unicode", 5, { diagnostics: true }), unsupportedPacket);
  }
});

for (const method of ["compactSearchMemory", "expandMemoryDocument"]) {
  test(`${method} bounds error streams independently and never echoes remote messages`, async () => {
    const invoke = remote => method === "compactSearchMemory" ? remote.compactSearchMemory("Unicode", 5, { maxBytes: 1024 })
      : remote.expandMemoryDocument({ id, expectedContentHash: "sha256:" + "a".repeat(64), maxBytes: 1024 });
    const transport = response => createRemoteMemoryTransport({ url: "https://memory.invalid", apiKey: "secret", fetchImpl: async () => response });
    for (const status of [400, 401, 409, 412, 422, 428, 500]) {
      for (const body of ["not json", "null", "[]", JSON.stringify({ error: { code: "invalid_expansion" } }),
        JSON.stringify({ error: { code: "x".repeat(2000), message: "remote secret" } }),
        JSON.stringify({ error: { code: "invalid_expansion", message: "remote secret".repeat(2000) } }),
        new Uint8Array([0xff, 0xfe])]) {
        await assert.rejects(invoke(transport(new Response(body, { status }))), error => error instanceof RemoteMemoryError
          && error.status === status && error.code === `http_${status}` && error.message.length < 150
          && !error.message.includes("remote secret"));
      }
    }
    // Larger than maxBytes=1024, but below the independent 8192 error limit.
    await assert.rejects(invoke(transport(Response.json({ error: { code: "precondition_failed", message: "private".repeat(500) } }, { status: 412 }))),
      error => error.code === "precondition_failed" && /refresh recall/i.test(error.message) && !error.message.includes("private"));
    for (const status of [400, 404, 405, 501]) {
      let cancelled = false;
      let pulls = 0;
      const response = new Response(new ReadableStream({
        pull(controller) { pulls++; controller.enqueue(new TextEncoder().encode("x".repeat(4096))); },
        cancel() { cancelled = true; },
      }), { status });
      await assert.rejects(invoke(transport(response)), error => error instanceof RemoteMemoryError && error.status === status
        && error.message.length < 200 && (status === 400 ? error.code === "http_400" : error.code === "unsupported_bounded_read"));
      assert.equal(cancelled, true, "oversized error bodies must cancel instead of buffering an unlimited response");
      assert.ok(pulls <= 4, "allow at most one prefetched stream chunk");
    }
    const missing = Response.json({ error: { code: "missing_id", message: "private path" } }, { status: 404 });
    await assert.rejects(invoke(transport(missing)), error => error.status === 404 && !error.message.includes("private")
      && error.code === (method === "expandMemoryDocument" ? "missing_id" : "unsupported_bounded_read"));
    const broken = new Response(new ReadableStream({ start(controller) { controller.error(new Error("private".repeat(2000))); } }), { status: 500 });
    await assert.rejects(invoke(transport(broken)), error => error.code === "http_500" && !error.message.includes("private"));
  });
}
