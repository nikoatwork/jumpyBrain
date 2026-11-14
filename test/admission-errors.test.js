import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { MAX_RETRY_AFTER_SECONDS, parseRetryAfter, validRetryAfterHeader } from "../dist/adapters/http-client/admission.js";
import { createRemoteMemoryTransport, RemoteMemoryError } from "../dist/adapters/http-client/index.js";

// Shared-brain admission refusals: one attempt, a safe static explanation, an
// honest optional delay, and one JSON error object for --json CLI commands.
// Every server here is a disposable loopback or injected fetch.

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const NOW = Date.parse("2026-11-14T12:00:00.000Z");
const ID = "mem_a0000000-0000-4000-8000-000000000001";
const HASH = "sha256:" + "a".repeat(64);
const SECRET = "/srv/private/brain-path-and-token-sentinel";
const RATE_LIMITED = /refused this request because too many requests arrived \(HTTP 429\)/;

test("Retry-After accepts bounded delta-seconds and IMF-fixdate values only", () => {
  assert.equal(parseRetryAfter("60", NOW), 60);
  assert.equal(parseRetryAfter(" 0 ", NOW), 0);
  assert.equal(parseRetryAfter(String(MAX_RETRY_AFTER_SECONDS), NOW), MAX_RETRY_AFTER_SECONDS);
  assert.equal(parseRetryAfter("Sat, 14 Nov 2026 12:01:30 GMT", NOW), 90);
  assert.equal(parseRetryAfter("Sat, 14 Nov 2026 12:00:00 GMT", NOW + 400), 0, "a fractional remainder rounds to the elapsed hint");
  assert.equal(parseRetryAfter("Sat, 14 Nov 2026 11:00:00 GMT", NOW), 0, "a past date means the suggested wait has passed");
  for (const invalid of [undefined, null, "", "-1", "1.5", "+5", "1e3", "abc", "60, 120", String(MAX_RETRY_AFTER_SECONDS + 1), "99999999999999999999",
    "Mon, 30 Feb 2026 12:00:00 GMT", "Sat, 14 Nov 2026 12:01:30 +0000", "Saturday, 14-Nov-26 12:01:30 GMT", "Sun, 15 Nov 2026 12:00:01 GMT", "1".repeat(65)]) {
    assert.equal(parseRetryAfter(invalid, NOW), undefined, String(invalid));
  }
  assert.equal(parseRetryAfter("60", Number.NaN), undefined);
  assert.equal(validRetryAfterHeader(" 30 "), "30");
  assert.equal(validRetryAfterHeader("30\r\nSet-Cookie: x=1"), undefined);
});

function htmlResponse(status, headers = {}) {
  return new Response(`<html><body>${status} from nginx ${SECRET}</body></html>`, { status, headers: { "Content-Type": "text/html", ...headers } });
}
function jsonResponse(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json", ...headers } });
}
function transport(respond) {
  const calls = [];
  const memory = createRemoteMemoryTransport({ url: "https://brain.example", apiKey: "fake-key", fetchImpl: async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    return respond(String(url), init);
  } });
  return { memory, calls };
}
async function rejection(promise) {
  try { await promise; } catch (error) { return error; }
  assert.fail("expected the request to fail");
}

test("ordinary reads and writes classify 429 bodies safely in exactly one attempt", async () => {
  const cases = [
    ["html", () => htmlResponse(429, { "Retry-After": "60" }), 60],
    ["json with proxy text", () => jsonResponse(429, { error: { code: "too_many", message: `slow down ${SECRET}` } }, { "Retry-After": "Sat, 14 Nov 2099 12:01:30 GMT" }), undefined],
    ["empty", () => new Response(null, { status: 429 }), undefined],
    ["malformed", () => new Response("{\"error\":", { status: 429, headers: { "Retry-After": "-5" } }), undefined],
    ["oversized", () => new Response(JSON.stringify({ error: { code: "rate_limited", message: "x".repeat(20000) } }), { status: 429, headers: { "Retry-After": "7" } }), 7],
  ];
  for (const [name, respond, delay] of cases) {
    for (const [operation, call] of [
      ["show", memory => memory.readMemoryDocument(ID)],
      ["tree", memory => memory.overviewMemory()],
      ["recall", memory => memory.searchMemory("topic", 5, { mode: "recall" })],
      ["board", memory => memory.listBoards()],
      ["remember", memory => memory.rememberMemory({ type: "note", title: "T", body: "B" })],
      ["update", memory => memory.updateMemoryDocument(ID, "body", { ifMatch: HASH })],
    ]) {
      const { memory, calls } = transport(respond);
      const error = await rejection(call(memory));
      assert.ok(error instanceof RemoteMemoryError, `${name}/${operation}`);
      assert.equal(error.status, 429); assert.equal(error.code, "rate_limited", `${name}/${operation}`);
      assert.equal(error.retryAfterSeconds, delay, `${name}/${operation}`);
      assert.match(error.message, RATE_LIMITED); assert.match(error.message, /did not retry/);
      assert.ok(!error.message.includes(SECRET) && !error.message.includes("slow down"), `${name}/${operation} leaked remote text`);
      assert.equal(calls.length, 1, `${name}/${operation} must make exactly one attempt`);
    }
  }
});

test("bounded recall and expansion share the admission contract without a fallback", async () => {
  for (const [kind, call] of [
    ["recall", memory => memory.compactSearchMemory("topic", 5, {})],
    ["expansion", memory => memory.expandMemoryDocument({ id: ID, expectedContentHash: HASH })],
  ]) {
    const { memory, calls } = transport(() => htmlResponse(429, { "Retry-After": "12" }));
    const error = await rejection(call(memory));
    assert.deepEqual([error.status, error.code, error.retryAfterSeconds], [429, "rate_limited", 12], kind);
    assert.ok(!error.message.includes(SECRET));
    assert.equal(calls.length, 1, kind);

    const overloaded = transport(() => jsonResponse(503, { error: { code: "execution_overloaded", message: SECRET } }));
    const busy = await rejection(call(overloaded.memory));
    assert.deepEqual([busy.status, busy.code, busy.retryAfterSeconds], [503, "execution_overloaded", undefined], kind);
    assert.match(busy.message, /execution queue is full/); assert.match(busy.message, /not a request quota/);
    assert.equal(overloaded.calls.length, 1);
  }
  // Read-only recall's observational status preflight is the operation's first and only request when it is refused.
  const { memory, calls } = transport(() => htmlResponse(429));
  assert.equal((await rejection(memory.compactSearchMemory("topic", 5, { readOnly: true }))).code, "rate_limited");
  assert.equal(calls.length, 1);
});

test("execution capacity, generic 503 and other app codes stay distinct", async () => {
  const classify = async (respond, call = memory => memory.memoryRootStatus()) => {
    const { memory, calls } = transport(respond);
    const error = await rejection(call(memory));
    assert.equal(calls.length, 1);
    return [error.status, error.code, error.retryAfterSeconds];
  };
  assert.deepEqual(await classify(() => jsonResponse(503, { error: { code: "execution_overloaded", message: "Memory execution queue is full; retry shortly." } }, { "Retry-After": "3" })), [503, "execution_overloaded", 3]);
  assert.deepEqual(await classify(() => jsonResponse(500, { error: { code: "execution_overloaded", message: "x" } })), [500, "execution_overloaded", undefined], "known code on an unexpected status");
  assert.deepEqual(await classify(() => jsonResponse(429, { error: { code: "execution_overloaded", message: "Cancellation admission is full." } })), [429, "execution_overloaded", undefined]);
  assert.deepEqual(await classify(() => htmlResponse(503, { "Retry-After": "120" })), [503, "service_unavailable", 120]);
  const busy = transport(() => jsonResponse(503, { error: { code: "read_only_busy", message: "Strict read-only retrieval is busy." } }));
  const readOnly = await rejection(busy.memory.memoryRootStatus());
  assert.deepEqual([readOnly.code, readOnly.message, readOnly.retryAfterSeconds], ["read_only_busy", "Strict read-only retrieval is busy.", undefined]);
  const conflict = transport(() => jsonResponse(412, { error: { code: "precondition_failed", message: "stale" } }, { "Retry-After": "5" }));
  const stale = await rejection(conflict.memory.updateMemoryDocument(ID, "x", { ifMatch: HASH }));
  assert.deepEqual([stale.status, stale.code, stale.message, stale.retryAfterSeconds], [412, "precondition_failed", "stale", undefined]);
  const missing = transport(() => jsonResponse(404, { error: { code: "missing_id", message: "missing" } }));
  assert.equal((await rejection(missing.memory.expandMemoryDocument({ id: ID, expectedContentHash: HASH }))).code, "missing_id");
});

async function loopback(t, respond) {
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", chunk => { body += chunk; });
    request.on("end", () => { requests.push({ method: request.method, url: request.url, body }); respond(request, response); });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return { url: `http://127.0.0.1:${server.address().port}`, requests };
}
function cliRun(args, home, input) {
  return new Promise(resolve => {
    const child = execFile(process.execPath, [cli, ...args], {
      env: { PATH: process.env.PATH, HOME: home, JUMPYBRAIN_API_KEY: "fake-admission-key-0001", JUMPYBRAIN_ENV_FILE: path.join(home, "absent.env"), JUMPYBRAIN_CLI_CONFIG: path.join(home, "absent.json") },
    }, (error, stdout, stderr) => resolve({ code: error ? error.code : 0, stdout, stderr }));
    child.stdin.end(input ?? "");
  });
}
async function home(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "jb-admission-cli-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("CLI --json failures print one error object on stdout; plain failures stay on stderr", async (t) => {
  const dir = await home(t);
  const server = await loopback(t, (request, response) => {
    response.writeHead(429, { "Content-Type": "text/html", "Retry-After": "60", "Set-Cookie": "proxy=1" });
    response.end(`<html>${SECRET}</html>`);
  });
  const target = ["--target-url", server.url];
  const commands = [
    ["show", "--id", ID],
    ["tree"],
    ["recall", "--topic", "admission"],
    ["recall", "--topic", "admission", "--compact"],
    ["expand", "--id", ID, "--if-match", HASH],
    ["run", "memory:show", "--id", ID],
    ["run", "memory:recall", "--topic", "admission"],
    ["board", "list"],
    ["board", "show", "--board", "Initiative"],
    ["update", "--id", ID, "--if-match", HASH],
    ["remember", "--type", "note", "--title", "Admission"],
  ];
  for (const command of commands) {
    const label = command.join(" ");
    const before = server.requests.length;
    const json = await cliRun([...command, ...target, "--json"], dir, "body\n");
    assert.equal(json.code, 1, label); assert.equal(json.stderr, "", label);
    const packet = JSON.parse(json.stdout);
    assert.deepEqual(Object.keys(packet), ["error"], label);
    assert.deepEqual({ ...packet.error, message: undefined }, { code: "rate_limited", message: undefined, status: 429, retryAfterSeconds: 60 }, label);
    assert.match(packet.error.message, RATE_LIMITED); assert.match(packet.error.message, /waiting 60 seconds/);
    assert.equal(server.requests.length - before, 1, `${label} --json must make exactly one request`);

    const plain = await cliRun([...command, ...target], dir, "body\n");
    assert.equal(plain.code, 1, label); assert.equal(plain.stdout, "", label);
    assert.match(plain.stderr, RATE_LIMITED, label);
    assert.equal(server.requests.length - before, 2, `${label} must make exactly one request per run`);
    for (const text of [json.stdout, plain.stderr]) {
      assert.ok(!text.includes(SECRET) && !text.includes("fake-admission-key") && !text.includes("proxy=1") && !text.includes("    at "), label);
    }
  }
  assert.ok(server.requests.every(request => !request.url.includes("/index")), "no index mutation is sent after a refusal");
});

test("CLI JSON errors keep execution capacity, auth guidance and conflicts distinguishable", async (t) => {
  const dir = await home(t);
  let mode = "overloaded";
  const server = await loopback(t, (request, response) => {
    const send = (status, code, message) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify({ error: { code, message } })); };
    if (mode === "overloaded") send(503, "execution_overloaded", "Memory execution queue is full; retry shortly.");
    else if (mode === "unauthorized") send(401, "invalid_api_key", "Invalid API key.");
    else send(412, "precondition_failed", "Document content hash is stale.");
  });
  const target = ["--target-url", server.url, "--json"];

  const overloaded = JSON.parse((await cliRun(["recall", "--topic", "x", "--compact", ...target], dir)).stdout).error;
  assert.deepEqual([overloaded.code, overloaded.status, "retryAfterSeconds" in overloaded], ["execution_overloaded", 503, false]);
  assert.match(overloaded.message, /not a request quota/);

  mode = "unauthorized";
  const unauthorized = await cliRun(["show", "--id", ID, ...target], dir);
  const auth = JSON.parse(unauthorized.stdout).error;
  assert.deepEqual([unauthorized.code, auth.code, auth.status], [1, "invalid_api_key", 401]);
  assert.match(auth.message, /rejected the access key \(HTTP 401 invalid_api_key\)/);
  assert.ok(!unauthorized.stdout.includes("fake-admission-key-0001"));

  mode = "conflict";
  const stale = JSON.parse((await cliRun(["update", "--id", ID, "--if-match", HASH, ...target], dir, "body\n")).stdout).error;
  assert.deepEqual([stale.code, stale.status], ["precondition_failed", 412]);
  assert.match(stale.message, /Re-run `jumpybrain show --id/);
});

test("CLI parse failures and non-memory commands keep plain stderr even with --json", async (t) => {
  const dir = await home(t);
  const parse = await cliRun(["recall", "--json=yes", "--topic", "x", "--root", dir], dir);
  assert.equal(parse.code, 1); assert.equal(parse.stdout, ""); assert.notEqual(parse.stderr, "");

  const root = path.join(dir, "missing-root");
  const local = await cliRun(["show", "--id", ID, "--root", root, "--json"], dir);
  assert.equal(local.code, 1); assert.equal(local.stderr, "");
  const packet = JSON.parse(local.stdout);
  assert.equal(packet.error.code, "command_failed");
  assert.match(packet.error.message, /Memory root does not exist/);
  assert.equal("status" in packet.error, false);
});
