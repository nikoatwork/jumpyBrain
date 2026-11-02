import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink, chmod, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from '../dist/cli/args.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { createServerMemoryRuntime } from '../dist/server/index.js';
const exec = promisify(execFile), repo = path.resolve('.'), key = 'e'.repeat(64);
async function fixture(t) {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-cli-connections-')));
  const support = path.join(temp, 'support'); await mkdir(support, { mode: 0o700 });
  const roots = [path.join(temp, 'one'), path.join(temp, 'two spaces')];
  for (const root of roots) {
    await createServerMemoryRuntime({ root }).initializeMemoryRoot();
    await writeFile(path.join(root, 'notes/fixture.md'), '# Disposable fixture\n');
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(JUMPYBRAIN_|QMD_|XDG_)/.test(name)));
  env.HOME = temp; env.JUMPYBRAIN_MEMORY_ROOT = roots[0];
  const cli = (args) => exec(process.execPath, [path.join(repo, 'dist/cli.js'), ...args], { cwd: temp, env, timeout: 10000 });
  const run = (...args) => cli(['connections', ...args, '--directory', support, '--json']).then(r => JSON.parse(r.stdout));
  let gateway;
  const keys = new Map();
  const start = async (empty = false) => {
    gateway = await startCompanionGateway({ runtimeRoot: repo, directory: support, initialRoot: empty ? undefined : roots[0], port: 0, controlKey: key, credentials: { get: async ref => keys.get(ref), set: async (ref, value) => keys.set(ref, value), delete: async ref => keys.delete(ref) },
      identityFile: path.join(temp, 'identity.json'), switchTimeoutMs: 2000, localFactory: async () => ({ url: 'http://127.0.0.1:1', close: async () => {} }) });
    await writeFile(path.join(support, 'api-key'), key, { mode: 0o600 });
    return gateway;
  };
  t.after(async () => { await gateway?.close(); await rm(temp, { recursive: true, force: true }); });
  const native = (route, body) => fetch(gateway.url + route, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { temp, roots, support, cli, run, start, native };
}
async function pending(gateway) {
  for (let n = 0; n < 200; n++) {
    if (gateway.coordinator.pending) return gateway.coordinator.pending.id;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('CLI did not enter save barrier');
}

test('connections strict flags and help are operation-free with no companion', async t => {
  const f = await fixture(t);
  for (const argv of [[], ['other'], ['list', '--root', '/x'], ['add', '--name', 'x'], ['remove', '--id', 'x', '--revision=-1'], ['select', '--id', 'x', '--revision=9007199254740992'], ['list', '--json=false'], ['list', '--directory', 'a', '--directory', 'b'], ['add', '--name=x', '--root=/x', '--revision=0', '--target-url=https://x']]) {
    assert.throws(() => parseArgs(['connections', ...argv]));
  }
  const before = await readdir(f.support);
  for (const command of ['list', 'add', 'remove', 'select']) assert.match((await f.cli(['connections', command, '--directory', '--help'])).stdout, /Usage: jumpybrain connections/);
  await assert.rejects(f.run('list'), e => /No running companion.*CLI-only/.test(e.stderr));
  assert.deepEqual(await readdir(f.support), before);
});

test('real companion CLI registration, revision fencing, app selection and CLI isolation preserve notes', async t => {
  const f = await fixture(t), gateway = await f.start();
  const before = await Promise.all(f.roots.map(root => readFile(path.join(root, 'notes/fixture.md'), 'utf8')));
  let state = await f.run('list');
  assert.equal(state.revision, 0); const original = state.activeId;
  state = await f.run('add', '--name', 'Second brain', '--root', f.roots[1], '--revision=0');
  assert.equal(state.activeId, original); assert.equal(state.revision, 1);
  const added = state.profiles.find(p => p.id !== original).id;
  assert.equal(state.profiles.length, 2);
  await assert.rejects(f.run('select', '--id', added, '--revision=0'), e => /fresh|connections list/.test(e.stderr));
  assert.equal(gateway.coordinator.pending, null); assert.equal(gateway.state().activeId, original);
  await assert.rejects(f.run('add', '--name', 'Duplicate', '--root', f.roots[1], '--revision=1'), e => /canonical destination/.test(e.stderr));
  const alias = path.join(f.temp, 'alias'); await symlink(f.roots[1], alias);
  await assert.rejects(f.run('add', '--name', 'Alias', '--root', alias, '--revision=1'), e => /canonical destination/.test(e.stderr));
  const unsafe = path.join(f.temp, 'unsafe'); await mkdir(unsafe); await symlink(path.join(f.roots[1], 'jumpybrain.json'), path.join(unsafe, 'jumpybrain.json'));
  for (const root of [unsafe, path.join(f.temp, 'missing')]) await assert.rejects(f.run('add', '--name', 'Unsafe', '--root', root, '--revision=1'), e => /never initializes/.test(e.stderr));
  state = await f.run('select', '--id', added, '--revision=1');
  assert.equal(state.activeId, added); assert.equal(state.revision, 2);
  const status = JSON.parse((await f.cli(['status', '--json'])).stdout);
  assert.equal(status.root, f.roots[0]); assert.equal(status.target.source, 'environment');
  const recipe = JSON.parse((await f.cli(['run', 'memory:status', '--json'])).stdout);
  assert.deepEqual(recipe, status);
  await assert.rejects(f.run('remove', '--id', added, '--revision=2'), e => /Switch away/.test(e.stderr));
  state = await f.run('remove', '--id', original, '--revision=2');
  assert.equal(state.profiles.length, 1); assert.equal(state.activeId, added);
  assert.deepEqual(await Promise.all(f.roots.map(root => readFile(path.join(root, 'notes/fixture.md'), 'utf8'))), before);
  assert.equal(JSON.stringify(state).includes('credentialRef'), false);
  await gateway.close();
  await assert.rejects(f.run('list'), e => /No running companion/.test(e.stderr));
});

test('CLI selection cannot bypass a registered dirty draft; explicit saved acknowledgement permits retry', async t => {
  const f = await fixture(t), gateway = await f.start();
  const state = await f.run('add', '--name', 'Other', '--root', f.roots[1], '--revision=0');
  const id = state.profiles.find(p => p.id !== state.activeId).id, generation = gateway.coordinator.generation;
  await f.native('/companion/register', { tabId: 'dirty-tab', generation });
  const rejected = assert.rejects(f.run('select', '--id', id, '--revision=1'), e => /save\/switch is blocked/.test(e.stderr));
  await f.native('/companion/ack', { tabId: 'dirty-tab', switchId: await pending(gateway), ok: false });
  await rejected;
  assert.equal(gateway.state().revision, 1); assert.equal(gateway.state().activeId, state.activeId);
  const selection = f.run('select', '--id', id, '--revision=1');
  await f.native('/companion/ack', { tabId: 'dirty-tab', switchId: await pending(gateway), ok: true });
  assert.equal((await selection).activeId, id);
  assert.ok(gateway.coordinator.generation > generation);
});

test('private control rejects browser credentials, unsafe files and unavailable live hosts without offline mutation', async t => {
  const f = await fixture(t), gateway = await f.start();
  const disk = await readFile(path.join(f.support, 'connections.json'), 'utf8');
  assert.equal((await fetch(gateway.url + '/companion/connections')).status, 401);
  assert.equal((await f.native('/companion/connections', { action: 'select', revision: 0, id: 'missing', extra: true })).status, 400);
  await chmod(path.join(f.support, 'api-key'), 0o644);
  await assert.rejects(f.run('list'), e => /Unsafe companion control/.test(e.stderr));
  await chmod(path.join(f.support, 'api-key'), 0o600);
  await writeFile(path.join(f.support, 'api-key'), 'f'.repeat(64));
  await assert.rejects(f.run('list'), e => /401/.test(e.stderr));
  assert.equal(await readFile(path.join(f.support, 'connections.json'), 'utf8'), disk);
  await gateway.close();
  await writeFile(path.join(f.support, 'extensions-control.json'), JSON.stringify({ version: 1, directory: f.support, origin: 'http://127.0.0.1:1', pid: process.pid }), { mode: 0o600 });
  await assert.rejects(f.run('add', '--name', 'Unavailable', '--root', f.roots[1], '--revision=0'));
  assert.equal(await readFile(path.join(f.support, 'connections.json'), 'utf8'), disk);
});


test('an empty companion uses the same save barrier for first registration; remote control remains in Settings', async t => {
  const f = await fixture(t), gateway = await f.start(true);
  assert.equal((await f.run('list')).activeId, null);
  const generation = gateway.coordinator.generation;
  const added = await f.run('add', '--name', 'First', '--root', f.roots[0], '--revision=0');
  assert.equal(added.profiles.length, 1); assert.equal(added.activeId, added.profiles[0].id);
  assert.ok(gateway.coordinator.generation > generation);
  const state = await gateway.store.save({ name: 'Remote', kind: 'remote', url: 'https://example.invalid', key: 'fixture-private-secret' }, 1);
  const remote = state.profiles.find(p => p.kind === 'remote');
  const listed = JSON.stringify(await f.run('list'));
  assert.equal(listed.includes(remote.credentialRef), false); assert.equal(listed.includes('fixture-private-secret'), false);
  for (const action of ['remove', 'select']) await assert.rejects(f.run(action, '--id', remote.id, '--revision=2'), e => /400/.test(e.stderr));
  assert.equal(gateway.store.snapshot().revision, 2);
  const session = await f.native('/companion/session', { token: key });
  const browser = await fetch(gateway.url + '/companion/connections', { headers: { Cookie: session.headers.get('set-cookie').split(';')[0], Origin: gateway.url } });
  assert.equal(browser.status, 403);
});
