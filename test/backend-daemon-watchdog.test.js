import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { backendPaths, processAlive, readBackendDescriptor, readBackendLease, verifyBackendReady } from "../dist/adapters/backend-host/index.js";
import { ensureRootBackend, stopRootBackend } from "../dist/app/backend-host/index.js";

// Real detached-daemon processes with fault-injection preloads reproduce the
// orphan states: the daemon must end every lifetime in a bounded process exit.
const daemonModule = new URL("../dist/server/daemon.js", import.meta.url).href;
const timings = { checkMs: 100, graceMs: 600, startupMs: 1500, drainMs: 1500 };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, ms, message) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await predicate()) return; await delay(25); }
  assert.fail(message);
}
async function fixture(t, preload = "") {
  const base = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-watchdog-")), root = path.join(base, "brain");
  await mkdir(root); await writeFile(path.join(base, "preload.mjs"), preload);
  const code = `import { serveDetachedBackend } from ${JSON.stringify(daemonModule)}; await serveDetachedBackend(process.env.JUMPYBRAIN_BACKEND_ROOT, { timings: ${JSON.stringify(timings)} });`;
  const child = spawn(process.execPath, ["--import", path.join(base, "preload.mjs"), "--input-type=module", "-e", code], { env: { ...process.env, JUMPYBRAIN_BACKEND_ROOT: root }, stdio: ["ignore", "ignore", "pipe"] });
  let stderr = ""; child.stderr.on("data", chunk => { stderr += chunk; });
  const exited = new Promise(resolve => child.once("exit", code => resolve(code)));
  t.after(async () => {
    // Only this test's own process; never a name-based kill.
    if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await exited; }
    await rm(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });
  return { base, root, child, exited, stderr: () => stderr, alive: () => child.exitCode === null && child.signalCode === null };
}
async function ready(f) {
  await until(async () => { const d = await readBackendDescriptor(f.root).catch(() => undefined); return d?.pid === f.child.pid && await verifyBackendReady(d); }, 10000, "daemon did not become ready: " + f.stderr());
  return readBackendDescriptor(f.root);
}
// A handle created during the lifetime (here: once listening) that nothing releases.
const leakedHandle = `import { Server } from "node:net"; const listen = Server.prototype.listen; Server.prototype.listen = function (...args) { setInterval(() => {}, 1 << 30); return listen.apply(this, args); };`;

test("a drained owner with a leaked handle exits after an authenticated handoff stop", { timeout: 20000 }, async t => {
  // v0.3.27 field state: shutdown recorded, lease released, process kept alive.
  const f = await fixture(t, leakedHandle), descriptor = await ready(f);
  assert.equal((await stopRootBackend(f.root, { expectedInstanceId: descriptor.instanceId })).stopped, true);
  await until(() => !f.alive(), 3000, "drained daemon lingered without its lease");
  assert.equal(await f.exited, 0);
  assert.match(f.stderr(), /lifetime ended with active Timeout; exiting anyway/);
  assert.equal(await readBackendLease(f.root), undefined);
});

test("an owner that loses its lease exits even when a handle would keep it alive", { timeout: 20000 }, async t => {
  const f = await fixture(t, leakedHandle); await ready(f);
  await rm((await backendPaths(f.root)).lease);
  await until(() => !f.alive(), 3000, "unowned daemon lingered");
  assert.match(f.stderr(), /stopping: ownership lost/);
});

test("a removed disposable HOME stops the backend of a brain inside it", { timeout: 20000 }, async t => {
  const home = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-watchdog-home-")), root = path.join(home, ".jumpybrain", "memory");
  await mkdir(root, { recursive: true });
  const owner = await ensureRootBackend(root);
  t.after(async () => { if (processAlive(owner.pid)) await stopRootBackend(root).catch(() => {}); await rm(home, { recursive: true, force: true }); });
  await rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  await until(() => !processAlive(owner.pid), 5000, "backend of a removed HOME kept running");
});

test("an owner whose listener closed without a drain stops after the grace period", { timeout: 20000 }, async t => {
  const preload = `import net from "node:net"; import http from "node:http"; const servers = new Set(); const listen = http.Server.prototype.listen;
    http.Server.prototype.listen = function (...args) { servers.add(this); return listen.apply(this, args); };
    process.on("SIGUSR2", () => { for (const server of servers) net.Server.prototype.close.call(server); });`;
  const f = await fixture(t, preload); await ready(f);
  process.kill(f.child.pid, "SIGUSR2");
  await delay(timings.graceMs / 3);
  assert.equal(f.alive(), true, "one doubtful check is not enough to stop");
  await until(() => !f.alive(), 3000, "owner without a listener kept its lease");
  assert.match(f.stderr(), /listener could not be verified/);
  assert.equal(await readBackendLease(f.root), undefined);
});

test("transient unreadable ownership state never stops a healthy owner; persistent state does", { timeout: 20000 }, async t => {
  const f = await fixture(t), descriptor = await ready(f), lease = (await backendPaths(f.root)).lease, saved = await readFile(lease);
  await writeFile(lease, "{"); await delay(timings.checkMs * 2); await writeFile(lease, saved);
  await delay(timings.graceMs * 2);
  assert.equal(f.alive(), true); assert.equal(await verifyBackendReady(descriptor), true);
  await writeFile(lease, "{");
  await until(() => !f.alive(), 3000, "owner with unverifiable state lingered");
  assert.match(f.stderr(), /could not be verified/);
});

test("a drain that never completes ends in a bounded forced exit and a reclaimable lease", { timeout: 20000 }, async t => {
  // The drain waits on live work (modelled by a ref'd handle) that never settles.
  const preload = leakedHandle + `import http from "node:http"; const close = http.Server.prototype.close; http.Server.prototype.close = function () { return close.call(this); };`;
  const f = await fixture(t, preload), descriptor = await ready(f);
  const started = Date.now();
  await stopRootBackend(f.root, { expectedInstanceId: descriptor.instanceId, timeoutMs: 200 }).catch(error => assert.equal(error.code, "backend_stop_pending"));
  await delay(timings.drainMs / 2);
  assert.equal(f.alive(), true, "the normal drain is not cut short");
  await until(() => !f.alive(), timings.drainMs + 2000, "hung drain never exited");
  assert.ok(Date.now() - started >= timings.drainMs - 100);
  assert.equal(await f.exited, 1); assert.match(f.stderr(), /drain exceeded/);
  assert.equal((await readBackendLease(f.root))?.pid, f.child.pid, "a forced exit leaves a dead-generation lease");
  const next = await ensureRootBackend(f.root); t.after(() => stopRootBackend(f.root).catch(() => {}));
  assert.notEqual(next.pid, f.child.pid);
});

test("a startup that never becomes ready exits within its bound", { timeout: 20000 }, async t => {
  // A hung listen with live work: nothing else would ever end this process.
  const preload = `setInterval(() => {}, 1 << 30); import http from "node:http"; http.Server.prototype.listen = function () { return this; };`;
  const f = await fixture(t, preload);
  await until(async () => (await readBackendLease(f.root).catch(() => undefined))?.pid === f.child.pid, 5000, "candidate never claimed the lease");
  await until(() => !f.alive(), timings.startupMs + timings.graceMs + 2000, "stalled startup kept the lease");
  assert.match(f.stderr(), /not ready within its startup bound/);
  assert.equal(await readBackendDescriptor(f.root), undefined);
});

test("losing startup candidates exit promptly", { timeout: 20000 }, async t => {
  const winner = await fixture(t); await ready(winner);
  const losers = [];
  for (let index = 0; index < 3; index++) {
    const code = `import { serveDetachedBackend } from ${JSON.stringify(daemonModule)}; await serveDetachedBackend(process.env.JUMPYBRAIN_BACKEND_ROOT);`;
    const child = spawn(process.execPath, ["--input-type=module", "-e", code], { env: { ...process.env, JUMPYBRAIN_BACKEND_ROOT: winner.root }, stdio: "ignore" });
    losers.push(new Promise(resolve => child.once("exit", resolve)));
    t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
  }
  assert.deepEqual(await Promise.all(losers), [0, 0, 0]);
  assert.equal((await readBackendLease(winner.root)).pid, winner.child.pid, "the winner keeps its lease");
  assert.equal(winner.alive(), true);
});
