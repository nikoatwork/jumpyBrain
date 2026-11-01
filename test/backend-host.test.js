import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { acquireBackendLease, backendPaths, currentBackendIdentity, readBackendLease, releaseBackendLease, readBackendDescriptor, verifyBackendReady, processAlive } from "../dist/adapters/backend-host/index.js";
import { backendStatus, ensureRootBackend, stopRootBackend } from "../dist/app/backend-host/index.js";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-host-"));
  t.after(async () => { await stopRootBackend(root).catch(() => {}); await rm(root, { recursive: true, force: true }); }); return root;
}
const identity = { executable: process.execPath, executableHash: "a".repeat(64), build: "test-fixture", version: "test" };
test("exclusive immutable leases unify aliases and never release another instance", async t => {
  const root = await fixture(t), alias = root + "-alias"; await symlink(root, alias); t.after(() => rm(alias));
  const lease = await acquireBackendLease(root, identity);
  assert.ok(lease); assert.equal(await acquireBackendLease(alias, identity), undefined);
  assert.equal((await readBackendLease(alias)).instanceId, lease.instanceId);
  await releaseBackendLease(root, "00000000-0000-4000-8000-000000000000");
  assert.equal((await readBackendLease(root)).instanceId, lease.instanceId);
  await releaseBackendLease(alias, lease.instanceId); assert.equal(await readBackendLease(root), undefined);
});
test("confirmed crashed owner is reclaimed with a new nonce", async t => {
  const root = await fixture(t), moduleUrl = new URL("../dist/adapters/backend-host/index.js", import.meta.url).href;
  const code = `import {acquireBackendLease} from ${JSON.stringify(moduleUrl)}; const lease=await acquireBackendLease(${JSON.stringify(root)},${JSON.stringify(identity)}); console.log(JSON.stringify(lease));`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", code], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "", errors = ""; child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { errors += chunk; });
  assert.equal(await new Promise(resolve => child.once("exit", resolve)), 0, errors);
  const old = JSON.parse(output), recovered = await acquireBackendLease(root, identity);
  assert.notEqual(recovered.instanceId, old.instanceId); await releaseBackendLease(root, recovered.instanceId);
});
test("unknown or foreign owner state fails closed without process adoption", async t => {
  const root = await fixture(t), paths = await backendPaths(root, true);
  await writeFile(paths.lease, '{"pid":1}', { mode: 0o600 });
  await assert.rejects(ensureRootBackend(root, { identity, timeoutMs: 200, spawn: () => assert.fail("must not spawn through malformed state") }), { code: "backend_state_invalid" });
  assert.equal(await readFile(paths.lease, "utf8"), '{"pid":1}');
});
test("concurrent clients share one authenticated headless owner, explicit stop and restart work", { timeout: 45000 }, async t => {
  const root = await fixture(t), note = path.join(root, "note.md"); await writeFile(note, "# Canonical note\n");
  const alias = root + "-alias"; await symlink(root, alias); t.after(() => rm(alias));
  const descriptors = await Promise.all(Array.from({ length: 6 }, (_, index) => ensureRootBackend(index % 2 ? alias : root)));
  const first = descriptors[0]; assert.ok(descriptors.every(item => item.instanceId === first.instanceId && item.url === first.url));
  assert.equal(await verifyBackendReady(first), true);
  assert.equal((await fetch(first.url + "/_backend/ready")).status, 401);
  assert.equal((await stat((await backendPaths(root)).descriptor)).mode & 0o077, 0);
  assert.equal(await readFile(note, "utf8"), "# Canonical note\n");
  const status = await backendStatus(alias); assert.equal(status.status, "running"); assert.equal(JSON.stringify(status).includes(first.token), false);
  const current = await currentBackendIdentity();
  await assert.rejects(ensureRootBackend(root, { identity: { ...current, build: "different-build" } }), { code: "backend_version_mismatch" });
  assert.equal(await verifyBackendReady(await readBackendDescriptor(root)), true);
  assert.equal((await stopRootBackend(alias)).stopped, true); assert.equal((await backendStatus(root)).status, "stopped");
  const next = await ensureRootBackend(root); assert.notEqual(next.instanceId, first.instanceId);
  assert.equal(fileURLToPath(new URL("../dist/server/daemon.js", import.meta.url)), next.executable);
});
test("authenticated readiness refuses a foreign instance or root even at a registered address", async t => {
  const root = await fixture(t), lease = await acquireBackendLease(root, identity);
  const server = createServer((_request, response) => { response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ ...lease, rootId: "b".repeat(64) })); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  await assert.rejects(verifyBackendReady({ ...lease, root, url: "http://127.0.0.1:" + server.address().port, token: "private_fixture_token" }), { code: "backend_identity_mismatch" });
  await releaseBackendLease(root, lease.instanceId);
});
test("a crashed production daemon restarts without changing canonical notes or credentials", { timeout: 30000 }, async t => {
  const root = await fixture(t); await writeFile(path.join(root, "note.md"), "# Survives crash\n");
  const first = await ensureRootBackend(root);
  const originalOwner = await (await fetch(first.url + "/capabilities", { headers: { Authorization: "Bearer " + first.token } })).json();
  assert.equal(originalOwner.principal.id, "local-owner:" + first.rootId);
  const response = await fetch(first.url + "/access", { method: "POST", headers: { Authorization: "Bearer " + first.token, "content-type": "application/json" }, body: JSON.stringify({ name: "Persistent reader", role: "reader" }) });
  assert.equal(response.status, 201); const issued = await response.json();
  process.kill(first.pid, "SIGKILL");
  const until = Date.now() + 5000; while (processAlive(first.pid) && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(processAlive(first.pid), false);
  const second = await ensureRootBackend(root);
  assert.notEqual(second.instanceId, first.instanceId); assert.notEqual(second.token, first.token);
  const resumedOwner = await (await fetch(second.url + "/capabilities", { headers: { Authorization: "Bearer " + second.token } })).json();
  assert.equal(resumedOwner.principal.id, originalOwner.principal.id, "Local browser draft identity survives private owner-token rotation.");
  assert.equal(await readFile(path.join(root, "note.md"), "utf8"), "# Survives crash\n");
  const capabilities = await fetch(second.url + "/capabilities", { headers: { Authorization: "Bearer " + issued.token } });
  assert.equal(capabilities.status, 200); assert.equal((await capabilities.json()).principal.name, "Persistent reader");
});
test("removed disposable brain stops its detached backend while windowless owners otherwise remain", { timeout: 10000 }, async t => {
  const root = await fixture(t), owner = await ensureRootBackend(root);
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  const until = Date.now() + 5000; while (processAlive(owner.pid) && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(processAlive(owner.pid), false);
});
