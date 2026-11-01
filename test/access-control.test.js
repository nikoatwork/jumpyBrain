import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { AccessStore, canWrite } from "../dist/adapters/access-control/index.js";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-access-"));
  t.after(() => rm(root, { recursive: true, force: true })); return root;
}
test("named credentials persist only hashes, retain distinct roles, and revoke across processes' stores", async t => {
  const root = await fixture(t), first = new AccessStore(root, { bootstrapKeys: ["explicit-operator-key"] }), second = new AccessStore(root);
  t.after(() => { first.close(); second.close(); });
  const reader = await first.issue({ name: "Alice", role: "reader" });
  const writer = await first.issue({ name: "Agent", role: "writer" });
  assert.equal((await second.authenticate(reader.token)).role, "reader");
  assert.equal(canWrite(await second.authenticate(writer.token)), true);
  assert.equal(canWrite(await second.authenticate(reader.token)), false);
  assert.equal((await first.authenticate("explicit-operator-key")).role, "admin");
  assert.equal(await second.authenticate("explicit-operator-key"), undefined);
  assert.equal(await first.revoke(reader.credential.id), true);
  assert.equal(await second.authenticate(reader.token), undefined);
  assert.equal((await second.authenticate(writer.token)).name, "Agent");
  assert.equal(await first.revoke(reader.credential.id), false);
  const bytes = await readFile(path.join(root, ".jumpybrain/access.json"), "utf8");
  assert.equal(bytes.includes(reader.token), false); assert.equal(bytes.includes(writer.token), false);
  assert.equal(bytes.includes("explicit-operator-key"), false);
  assert.equal((await stat(path.join(root, ".jumpybrain/access.json"))).mode & 0o077, 0);
  assert.equal(JSON.stringify(await second.list()).includes("tokenHash"), false);
});
test("concurrent independent stores serialize mutation without lost credentials", async t => {
  const root = await fixture(t), stores = Array.from({ length: 12 }, () => new AccessStore(root));
  t.after(() => stores.forEach(store => store.close()));
  const issued = await Promise.all(stores.map((store, index) => store.issue({ name: "Client " + index, role: index % 2 ? "reader" : "writer" })));
  assert.equal((await stores[0].list()).length, 12);
  for (const { token } of issued) assert.ok(await stores[1].authenticate(token));
  await Promise.all(issued.map(({ credential }, index) => stores[index].revoke(credential.id)));
  assert.ok((await stores[0].list()).every(credential => credential.revokedAt));
});
test("malformed, public or symlinked state fails closed for credentials while explicit operator remains available", async t => {
  const root = await fixture(t); await mkdir(path.join(root, ".jumpybrain"));
  const file = path.join(root, ".jumpybrain/access.json"), store = new AccessStore(root, { bootstrapKeys: ["operator"] });
  t.after(() => store.close());
  await writeFile(file, "broken", { mode: 0o600 });
  await assert.rejects(store.authenticate("named-credential"), { code: "access_state_invalid" });
  assert.equal((await store.authenticate("operator")).role, "admin");
  await writeFile(file, '{"version":1,"generation":0,"credentials":[]}'); await chmod(file, 0o644);
  await assert.rejects(store.authenticate("named-credential"), { code: "access_state_unsafe" });
  await rm(file); const target = path.join(root, "other.json");
  await writeFile(target, '{"version":1,"generation":0,"credentials":[]}', { mode: 0o600 }); await symlink(target, file);
  await assert.rejects(store.issue({ name: "Agent", role: "writer" }), { code: "access_state_unsafe" });
  assert.equal(await readFile(target, "utf8"), '{"version":1,"generation":0,"credentials":[]}');
});
test("invalid identities and roles cannot create operational credentials", async t => {
  const root = await fixture(t), store = new AccessStore(root); t.after(() => store.close());
  for (const input of [{ name: "", role: "writer" }, { name: "Agent\nadmin", role: "writer" }, { name: "Agent", role: "owner" }, { name: "\ud800", role: "reader" }])
    await assert.rejects(store.issue(input), { code: "invalid_credential" });
  assert.deepEqual(await store.list(), []);
});
test("independent credential writer processes and confirmed crashed lock recovery", async t => {
  const root = await fixture(t), moduleUrl = new URL("../dist/adapters/access-control/index.js", import.meta.url).href;
  async function child(code) {
    const process = spawn(globalThis.process.execPath, ["--input-type=module", "-e", code], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "", errors = "";
    process.stdout.on("data", chunk => { output += chunk; }); process.stderr.on("data", chunk => { errors += chunk; });
    assert.equal(await new Promise(resolve => process.once("exit", resolve)), 0, errors); return { output, pid: process.pid };
  }
  const stores = await Promise.all(Array.from({ length: 5 }, (_, index) => child(`import {AccessStore} from ${JSON.stringify(moduleUrl)}; const store=new AccessStore(${JSON.stringify(root)}); console.log(JSON.stringify(await store.issue({name:${JSON.stringify("Process " + index)},role:"writer"})));`)));
  const store = new AccessStore(root); t.after(() => store.close());
  assert.equal((await store.list()).length, 5);
  for (const item of stores) assert.equal((await store.authenticate(JSON.parse(item.output).token)).role, "writer");
  await writeFile(path.join(root, ".jumpybrain/access.lock"), JSON.stringify({ pid: stores[0].pid, nonce: randomUUID() }), { mode: 0o600 });
  const recovered = await store.issue({ name: "Recovered", role: "reader" });
  assert.equal((await store.authenticate(recovered.token)).name, "Recovered");
  assert.equal((await store.list()).length, 6);
});
