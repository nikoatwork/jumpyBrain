import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import { promisify } from "node:util";
import test from "node:test";
import { createExtensionHost, installExtension, listExtensions, prepareExtensions, removeExtension, setExtensionEnabled } from "../dist/app/extensions/index.js";

const probeKey = Symbol.for("jumpybrain.extension.test");
const probe = () => globalThis[probeKey];
function context(overrides = {}) {
  return { signal: new AbortController().signal, scope: { generation: 1, brainId: "brain", tabId: "tab" }, document: { id: "note-1", title: "A note" }, allowWrites: false,
    memory: { search: async () => ({ results: [] }), read: async id => ({ id, content: "body", hash: "hash" }), create: async () => ({ saved: true }), update: async () => ({ saved: true }) }, ...overrides };
}
async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "jb-executable-"));
  const source = path.join(root, "package");
  const directory = path.join(root, "support", "extensions");
  await mkdir(source); await mkdir(directory, { recursive: true });
  globalThis[probeKey] = {};
  const manifest = { apiVersion: 1, id: "fixture", name: "Executable fixture", version: "1.0.0", main: "main.ts", capabilities: ["memory.read", "memory.write"], ...options.manifest };
  await writeFile(path.join(source, "jumpybrain-extension.json"), JSON.stringify(manifest));
  await writeFile(path.join(source, manifest.main), options.main ?? `export default api => { api.registerCommand({id:'hello',title:'Hello',handler:() => ({message:'hello'})}); };`);
  let host;
  t.after(async () => { await host?.dispose(); delete globalThis[probeKey]; await rm(root, { recursive: true, force: true }); });
  return { root, source, directory, manifest, async host(options = {}) { host = await createExtensionHost({ directory, ...options }); return host; }, async main(code) { await writeFile(path.join(source, manifest.main), code); } };
}

test("real TS package bundles local dependencies and public SDK, without executing during registration", async t => {
  const f = await fixture(t, { manifest: { ui: "ui.ts" }, main: `import { EXTENSION_API_VERSION } from 'jumpybrain/extensions.js'; import { answer } from 'local-dependency';
    const probe = globalThis[Symbol.for('jumpybrain.extension.test')]; probe.loaded = (probe.loaded || 0) + 1;
    export default api => { if ('memory' in api) throw Error('activation must not receive memory'); api.registerPanel({id:'details',title:'Details'}); api.registerCommand({id:'hello',title:'Hello',handler: () => ({panel:{id:'details',data:{answer, version:EXTENSION_API_VERSION}}})}); };` });
  await mkdir(path.join(f.source, "node_modules", "local-dependency"), { recursive: true });
  await writeFile(path.join(f.source, "node_modules/local-dependency/package.json"), '{"name":"local-dependency","main":"index.js","type":"module"}');
  await writeFile(path.join(f.source, "node_modules/local-dependency/index.js"), 'export const answer = 42;');
  await writeFile(path.join(f.source, "ui.ts"), `import type {ExtensionUIFactory} from 'jumpybrain/extensions.js'; const factory: ExtensionUIFactory = api => { api.registerPanel('details', () => {}); }; export default factory;`);
  const installed = await installExtension(f);
  assert.equal(installed.source, await realpath(f.source));
  assert.ok(installed.prepared.revision);
  assert.equal(probe().loaded, undefined);
  await listExtensions(f); await prepareExtensions(f);
  assert.equal(probe().loaded, undefined);
  const host = await f.host();
  assert.equal(probe().loaded, 1);
  assert.deepEqual(await host.invoke("fixture", "hello", null, context()), { panel: { id: "details", data: { answer: 42, version: 1 } } });
  const snapshot = host.snapshot();
  assert.equal(snapshot.extensions[0].status, "active");
  assert.equal(JSON.stringify(snapshot).includes(f.root), false);
  assert.equal(JSON.stringify(snapshot).includes("handler"), false);
  assert.equal(snapshot.extensions[0].ui, `/companion/extensions/assets/fixture/${snapshot.extensions[0].revision}.js`);
  const script = await host.asset("fixture", snapshot.extensions[0].revision);
  let registration;
  vm.runInNewContext(script, { JumpyBrainExtensions: { register: (...args) => { registration = args; } } });
  assert.equal(registration[0], "fixture"); assert.equal(typeof registration[1], "function");
  let panelId; registration[1]({ registerPanel: id => { panelId = id; } }); assert.equal(panelId, "details");
  assert.equal(script.includes("eval("), false);
  const sdk = await import("../extensions.js"); assert.equal(sdk.EXTENSION_API_VERSION, 1); assert.equal(sdk.createExtensionHost, undefined);
});

test("manifest compatibility, capability, source, entry and import boundaries reject before execution", async t => {
  const f = await fixture(t);
  const base = f.manifest;
  for (const change of [{ apiVersion: 2 }, { version: "latest" }, { capabilities: ["shell"] }, { capabilities: ["memory.read", "memory.read"] }, { main: "../outside.ts" }, { ui: "/tmp/ui.ts" }, { id: "../escape" }, { unknown: true }, { main: "missing.ts" }]) {
    await writeFile(path.join(f.source, "jumpybrain-extension.json"), JSON.stringify({ ...base, ...change }));
    await assert.rejects(installExtension(f));
    assert.deepEqual(await listExtensions(f), []);
  }
  await writeFile(path.join(f.source, "jumpybrain-extension.json"), JSON.stringify(base));
  await writeFile(path.join(f.root, "outside.ts"), 'export const value = 1;');
  await symlink(path.join(f.root, "outside.ts"), path.join(f.source, "escape.ts"));
  await writeFile(path.join(f.source, "jumpybrain-extension.json"), JSON.stringify({ ...base, main: "escape.ts" }));
  await assert.rejects(installExtension(f), /escapes/);
  await writeFile(path.join(f.source, "jumpybrain-extension.json"), JSON.stringify(base));
  await f.main(`import {value} from '../outside.ts'; export default () => { console.log(value) };`);
  await assert.rejects(installExtension(f), /compilation/);
  await assert.rejects(installExtension({ directory: f.directory, source: "npm:anything" }), /local/);
  assert.deepEqual(await listExtensions(f), []);
});

test("atomic registry survives corruption and independent management mutations", async t => {
  const f = await fixture(t);
  await installExtension(f);
  await assert.rejects(installExtension(f), /already installed/);
  await writeFile(path.join(f.directory, "registry.json"), "partial interrupted write");
  assert.equal((await listExtensions(f))[0].manifest.id, "fixture");
  await Promise.all([setExtensionEnabled({ ...f, id: "fixture", enabled: false }), setExtensionEnabled({ ...f, id: "fixture", enabled: true })]);
  assert.equal((await listExtensions(f))[0].enabled, true);
  const registry = JSON.parse(await readFile(path.join(f.directory, "registry.json"), "utf8"));
  assert.equal(registry.entries.length, 1);
  await writeFile(path.join(f.directory, "registry.json"), "bad"); await writeFile(path.join(f.directory, "registry.backup.json"), "bad");
  await assert.rejects(listExtensions(f), /registry is unreadable/);
});

test("compile and partial factory failures retain prior activation; successful reload fences and disposes it", async t => {
  const f = await fixture(t, { main: `export default api => { const p=globalThis[Symbol.for('jumpybrain.extension.test')]; p.api=api; api.onDispose(()=>{p.oldDisposed=(p.oldDisposed||0)+1}); api.registerCommand({id:'hello',title:'Hello',handler:()=>({message:'old'})}); };` });
  await installExtension(f); const host = await f.host(); const oldApi = probe().api;
  const original = host.snapshot().extensions[0].revision;
  await f.main("this is invalid TypeScript !!!");
  const failedCompile = await host.reload();
  assert.equal(failedCompile.extensions[0].revision, original);
  assert.equal(failedCompile.extensions[0].status, "active"); assert.ok(failedCompile.extensions[0].error);
  assert.deepEqual(await host.invoke("fixture", "hello", null, context()), { message: "old" });
  await f.main(`export default api => { const p=globalThis[Symbol.for('jumpybrain.extension.test')]; api.onDispose(()=>{p.failedDisposed=true}); api.registerCommand({id:'hello',title:'Candidate',handler:()=>({message:'bad'})}); throw Error('/private/path/should/not/leak'); };`);
  const failedFactory = await host.reload();
  assert.equal(failedFactory.extensions[0].revision, original);
  assert.equal(probe().failedDisposed, true); assert.equal(probe().oldDisposed, undefined);
  assert.equal(JSON.stringify(failedFactory).includes("/private"), false);
  await f.main(`export default api => api.registerCommand({id:'hello',title:'New',handler:()=>({message:'new'})});`);
  const updated = await host.reload();
  assert.notEqual(updated.extensions[0].revision, original); assert.equal(probe().oldDisposed, 1);
  assert.deepEqual(await host.invoke("fixture", "hello", null, context()), { message: "new" });
  await assert.rejects(oldApi.state.set("stale", true), error => error.code === "extension_stale");
  assert.throws(() => oldApi.registerPanel({ id: "stale", title: "Stale" }), error => error.code === "extension_stale");
});

test("duplicate contribution and invalid theme rollback are isolated to the failing package", async t => {
  const f = await fixture(t, { main: `export default api => { api.registerPanel({id:'same',title:'First'}); api.registerPanel({id:'same',title:'Duplicate'}); };` });
  await installExtension(f); const host = await f.host();
  assert.equal(host.snapshot().extensions[0].status, "error"); assert.deepEqual(host.snapshot().extensions[0].panels, []);
  await f.main(`export default api => api.registerTheme({id:'bad',name:'Bad',appearance:'dark',colors:{position:'#fff'}});`);
  assert.equal((await host.reload()).extensions[0].status, "error");
  await f.main(`export default api => { api.registerTheme({id:'good',name:'Good',appearance:'dark',colors:{'--surface':'#123456',accent:'#abcdef'}}); };`);
  const themes = (await host.reload()).extensions[0].themes;
  assert.deepEqual(themes[0].colors, { surface: "#123456", accent: "#abcdef" });
});

const memoryFactory = `export default api => {
  const p=globalThis[Symbol.for('jumpybrain.extension.test')]; p.api=api;
  api.registerCommand({id:'memory',title:'Memory',handler:async (input,ctx) => { p.context=ctx; const result = input.op === 'read' ? await ctx.memory.read('note-1') : input.op === 'search' ? await ctx.memory.search({query:'test',limit:5}) : input.op === 'update' ? await ctx.memory.update({id:'note-1',content:'new',ifMatch:'hash'}) : await ctx.memory.create({type:'note',body:'body',idempotencyKey:'explicit-1'}); return {message:JSON.stringify(result)}; }});
  api.on('document.saved',async (_,ctx) => { p.eventContext=ctx; try { await ctx.memory.create({type:'note',body:'body',idempotencyKey:'event'}); } catch(error) { p.eventCode=error.code; } });
};`;

test("memory capabilities and explicit writes are checked per call; events never authorize writes", async t => {
  const f = await fixture(t, { main: memoryFactory }); await installExtension(f); const host = await f.host();
  await assert.rejects(host.invoke("fixture", "memory", { op: "create" }, context()), error => error.code === "extension_permission_denied");
  let writes = 0;
  const writable = context({ allowWrites: true, memory: { ...context().memory, create: async () => { writes++; return { saved: true }; }, update: async () => { writes++; return { saved: true }; } } });
  await host.invoke("fixture", "memory", { op: "create" }, writable);
  await host.invoke("fixture", "memory", { op: "update" }, writable);
  assert.equal(writes, 2);
  await host.emit({ type: "document.saved" }, writable);
  assert.equal(probe().eventCode, "extension_permission_denied"); assert.equal(writes, 2); assert.equal(probe().eventContext.allowWrites, false);
  await assert.rejects(probe().context.memory.read("note-1"), error => error.code === "extension_stale");
  await writeFile(path.join(f.source, "jumpybrain-extension.json"), JSON.stringify({ ...f.manifest, capabilities: [] }));
  await host.reload();
  await assert.rejects(host.invoke("fixture", "memory", { op: "read" }, writable), error => error.code === "extension_permission_denied");
  await assert.rejects(host.invoke("fixture", "memory", { op: "create" }, writable), error => error.code === "extension_permission_denied");
});

test("gateway memory errors preserve their original cause while descriptor diagnostics stay sanitized", async t => {
  const f = await fixture(t, { main: memoryFactory }); await installExtension(f); const host = await f.host();
  const denied = Object.assign(new Error("private remote error"), { status: 403, packet: { error: "write_not_authorized" } });
  await assert.rejects(host.invoke("fixture", "memory", { op: "create" }, context({ allowWrites: true, memory: { ...context().memory, create: async () => { throw denied; } } })), error => error.cause === denied && error.code === "extension_failed");
  assert.equal(JSON.stringify(host.snapshot()).includes("private remote"), false);
});

test("pending reads reject on disable, abort and scope switch; stale contexts cannot execute again", async t => {
  const f = await fixture(t, { main: memoryFactory }); await installExtension(f); const host = await f.host();
  let resolveRead;
  const ctx = context({ memory: { ...context().memory, read: () => new Promise(resolve => { resolveRead = resolve; }) } });
  const result = host.invoke("fixture", "memory", { op: "read" }, ctx);
  const rejected = assert.rejects(result, error => error.code === "extension_stale");
  while (!resolveRead) await new Promise(resolve => setImmediate(resolve));
  await host.setEnabled("fixture", false); resolveRead({ id: "note-1", content: "late", hash: "hash" }); await rejected;
  await host.setEnabled("fixture", true);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(host.invoke("fixture", "memory", { op: "read" }, context({ signal: controller.signal })), error => error.code === "extension_stale");
  await host.emit({ type: "scope.changed" }, context({ scope: { generation: 2, brainId: "next", tabId: "tab" } }));
  await assert.rejects(host.invoke("fixture", "memory", { op: "read" }, context()), error => error.code === "extension_stale");
});

test("state is namespaced, atomic and retained after remove; stale APIs fail and disposers run once", async t => {
  const f = await fixture(t, { main: `export default api => { const p=globalThis[Symbol.for('jumpybrain.extension.test')]; p.api=api; api.onDispose(()=>{p.disposed=(p.disposed||0)+1}); api.registerCommand({id:'set',title:'Set',handler:async input=>{await api.state.set('value',input);}}); };` });
  await installExtension(f); const host = await f.host();
  await host.invoke("fixture", "set", { count: 2 }, context());
  assert.deepEqual(await probe().api.state.get("value"), { count: 2 });
  const oldApi = probe().api; const before = host.snapshot().revision;
  await host.remove("fixture"); assert.equal(probe().disposed, 1); assert.notEqual(before, host.snapshot().revision);
  await assert.rejects(oldApi.state.get("value"), error => error.code === "extension_stale");
  assert.deepEqual(JSON.parse(await readFile(path.join(f.directory, "state/fixture.json"), "utf8")), { value: { count: 2 } });
  await installExtension(f); await host.reload(); assert.deepEqual(await probe().api.state.get("value"), { count: 2 });
  await host.dispose(); await host.dispose(); assert.equal(probe().disposed, 2);
  await assert.rejects(host.invoke("fixture", "set", {}, context()), /disposed/);
});

test("safe marker precedes compiler and factory loading, and safe-mode management remains usable", async t => {
  const f = await fixture(t, { main: "intentionally uncompilable !!!" });
  await writeFile(path.join(f.directory, "disabled"), "safe");
  const installed = await installExtension(f); assert.equal(installed.prepared, undefined);
  assert.equal((await prepareExtensions(f))[0].prepared, undefined);
  const host = await f.host(); assert.equal(host.snapshot().safeMode, true); assert.equal(host.snapshot().extensions[0].status, "disabled");
  assert.equal((await host.setEnabled("fixture", false)).extensions[0].enabled, false);
  await host.remove("fixture"); assert.deepEqual(host.snapshot().extensions, []);
  await rm(path.join(f.directory, "disabled"));
  await installExtension({ ...f, source: f.source }).then(() => assert.fail("unsafe compile must fail"), () => {});
  const explicit = await createExtensionHost({ directory: f.directory, safeMode: true });
  assert.equal(explicit.snapshot().safeMode, true); await explicit.dispose();
});

test("UI assets reject stale/disabled revisions, cache pruning protects live versions and bounds disk", async t => {
  const f = await fixture(t, { manifest: { ui: "ui.ts" } });
  await writeFile(path.join(f.source, "ui.ts"), "export default () => {};"); await installExtension(f); const host = await f.host();
  const original = host.snapshot().extensions[0].revision;
  // CLI preparations cannot discard an active host's asset, even across many unactivated revisions.
  for (let index = 0; index < 6; index++) await prepareExtensions(f);
  assert.match(await host.asset("fixture", original), /JumpyBrainExtensions.register/);
  assert.ok((await readdir(path.join(f.directory, "cache/fixture"))).length <= 5);
  await host.reload();
  await assert.rejects(host.asset("fixture", original), /stale/);
  const current = host.snapshot().extensions[0].revision;
  await host.setEnabled("fixture", false);
  await assert.rejects(host.asset("fixture", current), /disabled/);
  await assert.rejects(host.asset("../escape", current));
});

test("events isolate handler errors and invocation results must refer to registered panels", async t => {
  const f = await fixture(t, { main: `export default api => { const p=globalThis[Symbol.for('jumpybrain.extension.test')]; api.on('theme.changed',()=>{throw Error('failure')}); api.on('theme.changed',()=>{p.observed=true}); api.registerCommand({id:'hello',title:'Hello',handler:()=>({panel:{id:'missing',data:null}})}); };` });
  await installExtension(f); const host = await f.host();
  const before = host.snapshot().revision;
  await host.emit({ type: "theme.changed", theme: "dark" }, context()); assert.equal(probe().observed, true); assert.notEqual(host.snapshot().revision, before);
  const failedEventRevision = host.snapshot().revision;
  await host.emit({ type: "theme.changed", theme: "dark" }, context()); assert.equal(host.snapshot().revision, failedEventRevision);
  await assert.rejects(host.invoke("fixture", "hello", null, context()), /unavailable panel/);
  const failedCommandRevision = host.snapshot().revision;
  await assert.rejects(host.invoke("fixture", "hello", null, context()), /unavailable panel/); assert.equal(host.snapshot().revision, failedCommandRevision);
});

test("production package includes host-independent root SDK and lazy production compiler", () => {
  const packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }))[0];
  const files = new Set(packed.files.map(file => file.path));
  for (const file of ["extensions.js", "extensions.d.ts", "dist/extensions/index.js", "dist/extensions/index.d.ts", "dist/app/extensions/index.js", "dist/adapters/extensions/prepare.js"]) assert.ok(files.has(file), file);
});

test("compiler helper stops after explicit preparation; empty host and SDK never spawn it", async t => {
  const f = await fixture(t);
  const script = `import cp from 'node:child_process';
    const children=[]; const spawn=cp.spawn; cp.spawn=(...args)=>{const child=spawn(...args);children.push(child);return child};
    const sdk=await import(${JSON.stringify(new URL("../extensions.js", import.meta.url).href)});
    const {createExtensionHost,installExtension,prepareExtensions}=await import(${JSON.stringify(new URL("../dist/app/extensions/index.js", import.meta.url).href)});
    const options=${JSON.stringify({ directory: f.directory, source: f.source })};
    const host=await createExtensionHost(options);await host.dispose();
    const before=children.length;await installExtension(options);
    const fs=await import('node:fs/promises');await fs.writeFile(options.source+'/main.ts','invalid TypeScript !!!!');await prepareExtensions(options);
    console.log(JSON.stringify({before,spawned:children.length,stopped:children.every(child=>child.killed||child.exitCode!==null)}));`;
  const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 10000 }));
  assert.equal(result.before, 0); assert.ok(result.spawned > 0); assert.equal(result.stopped, true);
});

test("cross-process registry writes serialize with dead-owner recovery", async t => {
  const f = await fixture(t);
  const second = path.join(f.root, "second"); await mkdir(second);
  await writeFile(path.join(second, "jumpybrain-extension.json"), JSON.stringify({ ...f.manifest, id: "second" }));
  await writeFile(path.join(second, "main.ts"), "export default () => {};");
  const lock = path.join(f.directory, ".registry-lock"); await mkdir(lock);
  await writeFile(path.join(lock, "owner.json"), JSON.stringify({ pid: 2147483647 }));
  const run = promisify(execFile);
  const launch = source => run(process.execPath, ["--input-type=module", "-e", `const {installExtension}=await import(${JSON.stringify(new URL("../dist/app/extensions/index.js", import.meta.url).href)}); await installExtension(${JSON.stringify({ directory: f.directory, source })});`], { timeout: 10000 });
  await Promise.all([launch(f.source), launch(second)]);
  assert.deepEqual((await listExtensions(f)).map(entry => entry.manifest.id).sort(), ["fixture", "second"]);
});

test("global disk budget rejects preparation without registering source or leaving partial output", async t => {
  const f = await fixture(t);
  const removed = path.join(f.directory, "cache", "removed-package", "00000000-0000-4000-8000-000000000000");
  await mkdir(removed, { recursive: true }); await writeFile(path.join(removed, "main.mjs"), "");
  // Sparse fixture exercises the actual byte accounting without allocating the cache budget.
  await truncate(path.join(removed, "main.mjs"), 268435456);
  await assert.rejects(installExtension(f), /256 MiB/);
  assert.deepEqual(await listExtensions(f), []);
  assert.deepEqual(await readdir(path.join(f.directory, "cache/fixture")), []);
});

test("host emits one observational scope transition per generation and same-generation tabs remain independent", async t => {
  const f = await fixture(t, { main: `export default api => {
    const p=globalThis[Symbol.for('jumpybrain.extension.test')];p.scopes=[];
    api.on('scope.changed',async(event,ctx)=>{p.scopes.push({generation:ctx.scope.generation,brainId:ctx.scope.brainId,tabId:ctx.scope.tabId,allowWrites:ctx.allowWrites});await ctx.memory.search({query:'scope',limit:1});try{await ctx.memory.create({type:'note',body:'forbidden',idempotencyKey:'scope-event'})}catch(error){p.scopeWriteCode=error.code}});
    api.registerCommand({id:'read',title:'Read',handler:async(_,ctx)=>{await ctx.memory.read('note-1');return {message:'read'}}});
  };` });
  await installExtension(f); const host = await f.host();
  let resolveFirst; let searches = 0; let writes = 0;
  const memory = { ...context().memory, search: async () => { searches++; return { results: [] }; }, create: async () => { writes++; return {}; }, read: () => new Promise(resolve => { resolveFirst = resolve; }) };
  const first = host.invoke("fixture", "read", null, context({ allowWrites: true, memory }));
  while (!resolveFirst) await new Promise(resolve => setImmediate(resolve));
  const otherTab = context({ scope: { generation: 1, brainId: "brain", tabId: "other-tab" }, memory: { ...context().memory, search: memory.search } });
  await host.emit({ type: "document.changed" }, otherTab);
  await host.emit({ type: "scope.changed" }, otherTab);
  resolveFirst({ id: "note-1", content: "body", hash: "hash" });
  assert.deepEqual(await first, { message: "read" });
  assert.equal(probe().scopes.length, 1); assert.equal(searches, 1); assert.equal(writes, 0); assert.equal(probe().scopeWriteCode, "extension_permission_denied");
  assert.deepEqual(probe().scopes[0], { generation: 1, brainId: "brain", tabId: "tab", allowWrites: false });
  const next = context({ scope: { generation: 2, brainId: "next", tabId: "new-tab" }, memory: { ...context().memory, search: memory.search } });
  await host.emit({ type: "document.changed" }, next);
  await host.invoke("fixture", "read", null, next);
  assert.equal(probe().scopes.length, 2); assert.equal(searches, 2); assert.equal(probe().scopes[1].brainId, "next");
  await assert.rejects(host.invoke("fixture", "read", null, context()), error => error.code === "extension_stale");
  assert.equal(probe().scopes.length, 2);
});

test("state reads accept the same 1 MiB aggregate budget as writes", async t => {
  const f = await fixture(t, { main: `export default api => {globalThis[Symbol.for('jumpybrain.extension.test')].api=api};` });
  await installExtension(f); const host = await f.host();
  const first = "a".repeat(150 * 1024); const second = "b".repeat(150 * 1024);
  await probe().api.state.set("first", first); await probe().api.state.set("second", second);
  assert.equal(await probe().api.state.get("first"), first); assert.equal(await probe().api.state.get("second"), second);
  await host.dispose(); await f.host();
  assert.equal(await probe().api.state.get("first"), first); assert.equal(await probe().api.state.get("second"), second);
});
