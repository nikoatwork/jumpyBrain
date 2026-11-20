import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { initializeMemoryRoot } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { createRemoteAccessClient } from "../dist/adapters/http-client/access.js";
import { accessKeyInvite, accessKeyErrorText, effectiveCapabilities } from "../dist/adapters/http-server/access-keys.js";
import { ACCESS_CAPABILITIES, ROLE_CAPABILITIES, canWrite, hasCapability, roleCapabilities } from "../dist/adapters/access-control/index.js";

const run = promisify(execFile);
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const OPERATOR = "disposable-setup-key";

async function hosted(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jb-access-keys-")); await initializeMemoryRoot(root);
  const server = await startJumpyBrainHttpServer({ root, apiKeys: [OPERATOR], port: 0, autoIndex: false });
  t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); });
  const call = async (key, method, route, body) => {
    const response = await fetch(server.url + route, { method, headers: { Authorization: "Bearer " + key, ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  return { root, server, call };
}

test("an admin manages keys over HTTP, including further admins, without locking themselves out", async t => {
  const { call } = await hosted(t);
  const admin = await call(OPERATOR, "POST", "/access", { name: "Ada", role: "admin" });
  assert.equal(admin.status, 201); assert.equal(admin.body.credential.role, "admin"); assert.match(admin.body.token, /^jb_/);
  const writer = await call(admin.body.token, "POST", "/access", { name: "Research agent" });
  assert.equal(writer.status, 201); assert.equal(writer.body.credential.role, "writer", "writer is the default role");
  const listed = await call(admin.body.token, "GET", "/access");
  assert.deepEqual(listed.body.credentials.map(item => item.name).sort(), ["Ada", "Research agent"]);
  assert.equal(JSON.stringify(listed.body).includes(admin.body.token), false);
  assert.equal(JSON.stringify(listed.body).includes("tokenHash"), false);

  const self = await call(admin.body.token, "DELETE", "/access/" + admin.body.credential.id);
  assert.equal(self.status, 409); assert.equal(self.body.error.code, "cannot_revoke_current");
  assert.equal((await call(admin.body.token, "GET", "/access")).status, 200, "the key in use still works");

  for (const body of [{ name: "Eve", role: "owner" }, { name: "" }, { name: "Eve", role: "reader", id: "chosen" }, { role: "reader" }]) {
    const invalid = await call(admin.body.token, "POST", "/access", body);
    assert.equal(invalid.status, 400, JSON.stringify(body)); assert.equal(invalid.body.error.code, "invalid_credential");
    assert.match(invalid.body.error.message, /admin/);
  }
  const denied = await call(writer.body.token, "GET", "/access");
  assert.equal(denied.status, 403); assert.equal(denied.body.error.code, "admin_required");

  const revoked = await call(admin.body.token, "DELETE", "/access/" + writer.body.credential.id);
  assert.deepEqual([revoked.status, revoked.body], [200, { revoked: true }]);
  assert.deepEqual((await call(admin.body.token, "DELETE", "/access/" + writer.body.credential.id)).body, { revoked: false });
  assert.equal((await call(writer.body.token, "GET", "/capabilities")).status, 401);
  // Another admin can retire the first one.
  assert.deepEqual((await call(OPERATOR, "DELETE", "/access/" + admin.body.credential.id)).body, { revoked: true });
});

test("the remote client and CLI manage keys with an admin key and respect device read-only policy", async t => {
  const { server, root } = await hosted(t);
  const client = createRemoteAccessClient({ url: server.url, apiKey: OPERATOR });
  const issued = await client.issue({ name: "Reviewer", role: "reader" });
  assert.equal((await client.list()).credentials[0].id, issued.credential.id);
  await assert.rejects(createRemoteAccessClient({ url: server.url, apiKey: issued.token }).list(), { code: "admin_required", message: /admin key/ });
  await assert.rejects(client.revoke("not-an-id"), /credential ID/);

  const env = { ...process.env, JUMPYBRAIN_API_KEY: OPERATOR, JUMPYBRAIN_ENV_FILE: path.join(root, "absent.env"), JUMPYBRAIN_CLI_CONFIG: path.join(root, "absent-cli-config.json") };
  const json = async (...args) => JSON.parse((await run(process.execPath, [cli, "access", ...args, "--target-url", server.url, "--json"], { env })).stdout);
  const made = await json("issue", "--name", "Alice", "--role", "admin");
  assert.equal(made.credential.role, "admin"); assert.match(made.token, /^jb_/);
  assert.deepEqual((await json("list")).credentials.map(item => item.name).sort(), ["Alice", "Reviewer"]);
  assert.deepEqual(await json("revoke", "--id", issued.credential.id), { revoked: true });
  await assert.rejects(run(process.execPath, [cli, "access", "list", "--root", root, "--target-url", server.url], { env }), /only one target selector/);
  await assert.rejects(run(process.execPath, [cli, "access", "list", "--json"], { env }), /exactly one of --root/);

  const policy = path.join(root, "cli-config.json");
  await writeFile(policy, JSON.stringify({ schemaVersion: 1, remoteTargets: [{ origin: new URL(server.url).origin, access: "read-only" }] }));
  const guarded = { ...env, JUMPYBRAIN_CLI_CONFIG: policy };
  await assert.rejects(run(process.execPath, [cli, "access", "issue", "--name", "Blocked", "--target-url", server.url, "--json"], { env: guarded }), /read-only/i);
  const still = JSON.parse((await run(process.execPath, [cli, "access", "list", "--target-url", server.url, "--json"], { env: guarded })).stdout);
  assert.equal(still.credentials.some(item => item.name === "Blocked"), false);
});

test("invite text and error guidance stay plain and never invent a key", () => {
  const invite = accessKeyInvite("https://memory.example.com", "jb_secret");
  assert.match(invite, /Address: https:\/\/memory\.example\.com/); assert.match(invite, /Access key: jb_secret/); assert.match(invite, /--target-url https:\/\/memory\.example\.com/);
  assert.match(accessKeyErrorText({ code: "read_only" }, "create the key"), /reader access, which cannot make changes/);
  assert.match(accessKeyErrorText({ code: "access_unconfirmed" }, "create the key"), /did not confirm.*nothing was changed/);
  assert.match(accessKeyErrorText({ code: "admin_required" }, "create the key"), /admin key/);
  assert.doesNotMatch(accessKeyErrorText({ code: "write_not_authorized" }, "create the key"), /Allow editing|this device/, "no device editing switch is mentioned any more");
  assert.match(accessKeyErrorText(new Error("jb_secret leaked"), "create the key"), /^Could not create the key\./);
});

test("roles are fixed named capability sets; anything else has none", () => {
  assert.deepEqual([...ACCESS_CAPABILITIES], ["read", "write", "manage_access"]);
  assert.deepEqual(JSON.parse(JSON.stringify(ROLE_CAPABILITIES)), { reader: ["read"], writer: ["read", "write"], admin: ["read", "write", "manage_access"] });
  assert.throws(() => { ROLE_CAPABILITIES.reader.push("write"); }, TypeError, "the sets cannot be widened at run time");
  for (const role of [undefined, null, "", "owner", "superuser", "Admin", "__proto__", "constructor", "toString", 1, {}, ["admin"]]) {
    assert.deepEqual([...roleCapabilities(role)], [], String(role));
    assert.equal(hasCapability({ role }, "read"), false, String(role));
  }
  assert.equal(hasCapability(undefined, "read"), false);
  assert.equal(canWrite({ id: "x", name: "x", role: "reader" }), false);
  assert.equal(canWrite({ id: "x", name: "x", role: "writer" }), true);
  assert.equal(hasCapability({ role: "writer" }, "manage_access"), false);
  // The browser reads the same sets from the server's answer and falls back to the role for older servers.
  assert.deepEqual(effectiveCapabilities({ principal: { id: "x", name: "x", role: "writer" }, capabilities: ["read", "write"] }), ["read", "write"]);
  assert.deepEqual(effectiveCapabilities({ principal: { id: "x", name: "x", role: "admin" } }), ["read", "write", "manage_access"]);
  assert.deepEqual(effectiveCapabilities({ principal: { id: "x", name: "x", role: "reader" }, capabilities: ["read", "launch_missiles"] }), ["read"]);
  for (const packet of [null, {}, { capabilities: ["read", "write"] }, { principal: { role: "superuser" }, capabilities: ["read", "write", "manage_access"] }])
    assert.deepEqual(effectiveCapabilities(packet), [], JSON.stringify(packet));
});

test("/capabilities names each key's set; readers change nothing, writers edit but cannot manage access, admins do both", async t => {
  const { call, server } = await hosted(t);
  const keys = { admin: OPERATOR };
  for (const role of ["reader", "writer"]) keys[role] = (await call(OPERATOR, "POST", "/access", { name: role + " key", role })).body.token;
  const expected = { reader: ["read"], writer: ["read", "write"], admin: ["read", "write", "manage_access"] };
  for (const role of ["reader", "writer", "admin"]) {
    const { status, body } = await call(keys[role], "GET", "/capabilities");
    assert.equal(status, 200);
    assert.deepEqual(Object.keys(body).sort(), ["brainId", "capabilities", "live", "maxDocumentBytes", "principal", "protocol", "roles"]);
    assert.equal(body.principal.role, role); assert.deepEqual(body.capabilities, expected[role]); assert.deepEqual(body.roles, expected);
  }
  const note = (key, date) => fetch(server.url + "/memories/all/notes", { method: "POST", headers: { Authorization: "Bearer " + key, "content-type": "application/json", "Idempotency-Key": "capability-test-" + date }, body: JSON.stringify({ type: "note", body: "", dailyDate: date }) });
  // Reader: every mutation is refused, key management included, whatever the route.
  for (const [method, route, body] of [["POST", "/memories/all/notes", { type: "note", body: "x" }], ["POST", "/memories/all/index", {}], ["POST", "/memories/all/boards", { name: "x" }],
    ["POST", "/memories/all/files/operations", { action: "create-folder", path: "notes/x" }], ["POST", "/access", { name: "Mine", role: "admin" }], ["DELETE", "/access/00000000-0000-4000-8000-000000000000"], ["POST", "/_backend/call", { method: "status", args: [] }]]) {
    const denied = await call(keys.reader, method, route, body);
    assert.equal(denied.status, 403, method + " " + route); assert.equal(denied.body.error.code, "read_only", method + " " + route);
  }
  assert.equal((await call(keys.reader, "GET", "/access")).body.error.code, "admin_required");
  assert.equal((await call(keys.reader, "POST", "/memories/all/resolve-title", { title: "anything" })).status, 200, "a read sent as POST stays open");
  assert.equal((await call(keys.reader, "GET", "/memories/all/status")).status, 200);
  // Writer: edits, but no key management of any kind.
  assert.equal((await note(keys.writer, "2026-04-01")).status, 200);
  for (const [method, route, body] of [["GET", "/access"], ["POST", "/access", { name: "Mine", role: "admin" }], ["DELETE", "/access/00000000-0000-4000-8000-000000000000"], ["POST", "/_backend/call", { method: "status", args: [] }]]) {
    const denied = await call(keys.writer, method, route, body);
    assert.equal(denied.status, 403, method + " " + route); assert.equal(denied.body.error.code, "admin_required", method + " " + route);
  }
  assert.equal((await call(keys.writer, "GET", "/access")).body.error.message, "Managing access keys requires an admin key.");
  // Admin: both.
  assert.equal((await note(keys.admin, "2026-04-02")).status, 200);
  assert.equal((await call(keys.admin, "GET", "/access")).body.credentials.length, 2);
});
