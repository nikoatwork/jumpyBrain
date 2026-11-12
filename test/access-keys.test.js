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
import { accessKeyInvite, accessKeyErrorText } from "../dist/adapters/http-server/access-keys.js";

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
  assert.match(accessKeyErrorText({ code: "write_not_authorized" }, "create the key"), /Allow editing under Brains/);
  assert.match(accessKeyErrorText(new Error("jb_secret leaked"), "create the key"), /^Could not create the key\./);
});
