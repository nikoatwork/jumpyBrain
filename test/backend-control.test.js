import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { createServer, connect } from "node:net";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { initializeMemoryRoot } from "../dist/index.js";
import { ensureRootBackend, backendStatus, stopRootBackend, startBackendControlProxy } from "../dist/app/backend-host/index.js";

const documentId = "mem_41111111-1111-4111-8111-111111111111";
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
async function foreground(t, host) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-bind-control-"));
  await initializeMemoryRoot(root);
  const file = path.join(root, "notes", "control.md");
  await writeFile(file, `---\nid: ${documentId}\ntype: note\ntitle: Control\n---\nbase\n`);
  const key = "disposable-foreground-test-key";
  const child = spawn(process.execPath, [cli, "serve", "--root", root, "--host", host, "--port", "0", "--api-key", key], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "", errors = "";
  child.stderr.on("data", chunk => { errors += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit"); child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 3000); timer.unref();
      await exited; clearTimeout(timer);
    }
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Foreground service did not publish readiness: " + errors)), 10000); timer.unref();
    child.once("error", reject);
    child.once("exit", code => { clearTimeout(timer); reject(new Error("Foreground service exited " + code + ": " + errors)); });
    child.stdout.on("data", chunk => {
      output += chunk; const ready = /jumpyBrain server listening on (http:\/\/\S+)/.exec(output);
      if (ready) { clearTimeout(timer); resolve(ready[1]); }
    });
  });
  return { root, file, child, url, key };
}
const hosts = ["127.0.0.1", "localhost", "::1", "0.0.0.0", "::", ...(process.platform === "linux" ? ["127.0.0.2"] : [])];
for (const host of hosts) test("foreground " + host + " exposes the same owner through an adoptable private HTTP/WS control alias", { timeout: 20000 }, async t => {
  const service = await foreground(t, host), advertised = new URL(service.url);
  if (service.url.includes("::")) assert.ok(service.url.includes("["), "IPv6 addresses are bracketed");
  const descriptor = await ensureRootBackend(service.root);
  assert.equal(descriptor.pid, service.child.pid, "Adoption reuses the foreground authority");
  assert.equal(new URL(descriptor.url).hostname, "127.0.0.1");
  assert.notEqual(new URL(descriptor.url).port, advertised.port, "The control alias has its own private listener");
  assert.equal((await backendStatus(service.root)).status, "running");
  const publicHost = advertised.hostname === "0.0.0.0" ? "127.0.0.1" : advertised.hostname === "[::]" ? "[::1]" : advertised.hostname;
  const publicUrl = "http://" + publicHost + ":" + advertised.port;
  const publicResponse = await fetch(publicUrl + "/capabilities", { headers: { Authorization: "Bearer " + service.key } });
  assert.equal(publicResponse.status, 200); await publicResponse.json();
  const ws = new WebSocket(descriptor.url.replace(/^http/, "ws") + "/ws"); t.after(() => ws.terminate());
  await once(ws, "open"); let serial = 0; const pending = new Map();
  ws.on("message", data => { const packet = JSON.parse(data.toString()), waiter = pending.get(packet.id); if (waiter) { pending.delete(packet.id); clearTimeout(waiter.timer); waiter.resolve(packet); } });
  const rpc = (method, params) => new Promise((resolve, reject) => { const id = String(++serial), timer = setTimeout(() => reject(new Error("Private WS control timed out")), 3000); pending.set(id, { resolve, timer }); ws.send(JSON.stringify({ id, method, params })); });
  assert.equal((await rpc("hello", { token: descriptor.token, protocol: 2 })).ok, true);
  const opening = { documentId, clientId: "proxy-client" }, base = (await rpc("open", opening)).result;
  const saved = await rpc("edit", { ...opening, epoch: base.epoch, baseRevision: base.revision, operationId: "through-private-control", start: 0, deleteCount: 0, insert: "proxy " });
  assert.equal(saved.ok, true); assert.equal(saved.result.saved, true); assert.ok((await readFile(service.file, "utf8")).endsWith("proxy base\n"));
  ws.close(); await once(ws, "close");
  const exited = once(service.child, "exit");
  assert.equal((await stopRootBackend(service.root)).stopped, true); assert.equal((await exited)[0], 0);
  await assert.rejects(fetch(descriptor.url + "/health", { signal: AbortSignal.timeout(1000) }));
  assert.equal((await backendStatus(service.root)).status, "stopped");
});
test("closing a private control proxy drains both directions of held TCP connections", async t => {
  const targetSockets = new Set(), target = createServer(socket => { targetSockets.add(socket); socket.on("close", () => targetSockets.delete(socket)); socket.pipe(socket); });
  target.listen(0, "127.0.0.1"); await once(target, "listening");
  const proxy = await startBackendControlProxy(target.address()), client = connect(Number(new URL(proxy.url).port), "127.0.0.1");
  t.after(async () => { client.destroy(); await proxy.close(); for (const socket of targetSockets) socket.destroy(); await new Promise(resolve => target.close(resolve)); });
  await once(client, "connect"); client.write("complete bidirectional payload"); assert.equal((await once(client, "data"))[0].toString(), "complete bidirectional payload");
  const closed = once(client, "close"); await proxy.close(); await closed;
  await new Promise(resolve => setImmediate(resolve)); assert.equal(proxy.resourceUsage().sockets, 0);
});
